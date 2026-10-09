import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import { repoCaja, repoStock, repoVentaCatalogo, type Transaccion } from '@morphiqpos/data';
import { cantidad as diezmilesimas } from '@morphiqpos/domain/catalogo';
import { centavos, redondear, repartirPorPesos } from '@morphiqpos/domain/dinero';
import { calcularConsumo } from '@morphiqpos/domain/inventario';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

import { cantidadAConsumir } from './presentacion.ts';

/**
 * LA DEVOLUCIÓN DE VENTA, total y parcial (D-29 de la 2.4).
 *
 * «Devolución de venta en efectivo · Encargado · − monto · Resta de ventas»: lo dicen
 * los `02-DINERO-Y-CAJA` de la tienda, la ferretería y el salón, y no existía en
 * ningún modelo. Es un documento propio (`devoluciones`, 178): el ticket original NO se
 * toca —«el histórico no se toca»— y la devolución resta de la venta del día en que se
 * hace.
 *
 * ── El dinero ────────────────────────────────────────────────────────────────
 * Lo que se cobró de cada línea es su parte EXACTA del total pagado (`repartirPorPesos`
 * sobre el total de la orden), así que el descuento y el impuesto ya están dentro. Lo que
 * se devuelve de una línea se calcula ACUMULADO —lo devuelto antes más lo de ahora, menos
 * lo devuelto antes, redondeado con la única regla del dominio—: devolver una línea a
 * pedazos suma exactamente lo que se cobró de ella, sin un centavo de más ni de menos.
 * La propina no se devuelve: no es venta.
 *
 * Sale por un método que la venta USÓ y por no más de lo que entró por él: devolver en
 * efectivo una compra pagada con tarjeta es la forma más vieja de sacar dinero del cajón.
 * En efectivo, del cajón de ESTA terminal, con su sesión bloqueada; con tarjeta o
 * transferencia, no toca el cajón y queda por reversar en la terminal o el banco.
 *
 * ── La mercancía ─────────────────────────────────────────────────────────────
 * Regresa al almacén a su costo con un movimiento `devolucion` POSITIVO referido a este
 * documento, calculado con `calcularConsumo` —la misma cuenta que la sacó al venderla—.
 * Lo que se vende por receta (un platillo, una bebida) no regresa: ya se preparó.
 *
 * ── Quién ────────────────────────────────────────────────────────────────────
 * El encargado y el dueño (§8.3 de cada giro). La cajera no: una devolución es dinero
 * que sale sin mercancía que salga, y es la segunda puerta del robo después del
 * descuento fantasma.
 */

const QUIEN_DEVUELVE = ['gerente', 'administrador', 'dueno'] as const;

const DEVOLVIBLES = ['pagada', 'parcialmente_reembolsada'] as const;

const cantidadDecimal = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,4})?$/, 'La cantidad es un decimal de hasta cuatro cifras.')
  .refine((v) => Number.parseFloat(v) > 0, 'La cantidad tiene que ser mayor que cero.');

export const entradaDevolverVenta = z.object({
  ordenId: z.uuid(),
  lineas: z
    .array(z.object({ ordenLineaId: z.uuid(), cantidad: cantidadDecimal }))
    .min(1)
    .max(120)
    .refine(
      (lineas) => new Set(lineas.map((l) => l.ordenLineaId)).size === lineas.length,
      'Cada línea de la venta va una sola vez.',
    ),
  metodo: z.enum(['efectivo', 'tarjeta', 'transferencia']),
  motivo: z.string().trim().min(4).max(200),
  regresaAlInventario: z.boolean().default(true),
});

export interface LineaDevuelta {
  readonly ordenLineaId: string;
  readonly cantidad: string;
  readonly montoCentavos: string;
}

export interface ResultadoDevolucionDeVenta {
  readonly devolucionId: string;
  readonly ordenId: string;
  readonly montoCentavos: string;
  readonly metodo: string;
  readonly estado: 'parcialmente_reembolsada' | 'reembolsada';
  readonly lineas: readonly LineaDevuelta[];
}

interface LineaVendida {
  readonly id: string;
  readonly productoId: string | null;
  readonly cantidad: string;
  readonly unidad: string;
  readonly totalCentavos: bigint;
  readonly cantidadBaseConsumo: string | null;
}

/** Lo ya devuelto de cada línea, en diezmilésimas y en centavos. */
async function yaDevuelto(
  ctx: ContextoComando<Transaccion>,
  ordenId: string,
): Promise<Map<string, { readonly cantidad: bigint; readonly monto: bigint }>> {
  // Dos lecturas y no un `join`: la venta tiene pocas devoluciones, y así cada una se
  // filtra por su organización sin depender de cómo se resuelva el `join`.
  const documentos = await ctx.tx
    .selectFrom('devoluciones')
    .select('id')
    .where('organizacion_id', '=', ctx.ambito.organizacionId)
    .where('orden_id', '=', ordenId)
    .execute();
  const filas =
    documentos.length === 0
      ? []
      : await ctx.tx
          .selectFrom('devoluciones_lineas')
          .select(['orden_linea_id as lineaId', 'cantidad', 'monto_centavos as monto'])
          .where('organizacion_id', '=', ctx.ambito.organizacionId)
          .where(
            'devolucion_id',
            'in',
            documentos.map((d) => d.id),
          )
          .execute();
  const suma = new Map<string, { cantidad: bigint; monto: bigint }>();
  for (const fila of filas) {
    const previa = suma.get(fila.lineaId) ?? { cantidad: 0n, monto: 0n };
    suma.set(fila.lineaId, {
      cantidad: previa.cantidad + diezmilesimas(fila.cantidad),
      monto: previa.monto + fila.monto,
    });
  }
  return suma;
}

/** Lo que entró por cada método (sin propina) menos lo ya devuelto por él. */
async function disponiblePorMetodo(
  ctx: ContextoComando<Transaccion>,
  ordenId: string,
): Promise<Map<string, bigint>> {
  const { organizacionId } = ctx.ambito;
  const pagos = await ctx.tx
    .selectFrom('pagos')
    .select(['metodo', 'monto_centavos as monto'])
    .where('organizacion_id', '=', organizacionId)
    .where('orden_id', '=', ordenId)
    .where('estado', '=', 'confirmado')
    .execute();
  const devueltas = await ctx.tx
    .selectFrom('devoluciones')
    .select(['metodo', 'monto_centavos as monto'])
    .where('organizacion_id', '=', organizacionId)
    .where('orden_id', '=', ordenId)
    .execute();
  const disponible = new Map<string, bigint>();
  for (const p of pagos) disponible.set(p.metodo, (disponible.get(p.metodo) ?? 0n) + p.monto);
  for (const d of devueltas) disponible.set(d.metodo, (disponible.get(d.metodo) ?? 0n) - d.monto);
  return disponible;
}

/** El importe EXACTO de lo que se devuelve de cada línea, acumulado. */
function importes(
  pedidas: readonly { readonly ordenLineaId: string; readonly cantidad: string }[],
  vendidas: ReadonlyMap<string, LineaVendida>,
  cobradoPorLinea: ReadonlyMap<string, bigint>,
  previo: ReadonlyMap<string, { readonly cantidad: bigint; readonly monto: bigint }>,
): LineaDevuelta[] {
  return pedidas.map((pedida) => {
    const vendida = vendidas.get(pedida.ordenLineaId);
    if (vendida === undefined) {
      throw new ErrorDominio('LINEA_NO_ENCONTRADA', 'Esa línea no es de esta venta.');
    }
    const total = diezmilesimas(vendida.cantidad);
    const antes = previo.get(vendida.id)?.cantidad ?? 0n;
    const ahora = diezmilesimas(pedida.cantidad);
    if (antes + ahora > total) {
      throw new ErrorDominio(
        'CANTIDAD_INVALIDA',
        'No se puede devolver más de lo que se vendió de esa línea.',
        { lineaId: vendida.id },
      );
    }
    const cobrado = cobradoPorLinea.get(vendida.id) ?? 0n;
    const monto = redondear(cobrado * (antes + ahora), total) - redondear(cobrado * antes, total);
    return { ordenLineaId: vendida.id, cantidad: pedida.cantidad, montoCentavos: monto.toString() };
  });
}

/**
 * LA COMISIÓN DE LO DEVUELTO, en su CONTRAPARTIDA (§7.3 del salón, F-443).
 *
 * Lo que se devuelve no se comisiona: si la línea causó comisión al cobrarse —un servicio
 * del salón con su profesional—, cada comisión suya recibe un asiento NEGATIVO por la parte
 * que se devuelve, con su motivo y apuntando a la que corrige. Nunca un UPDATE: el ledger
 * es inmutable (134) y la estilista tiene que poder leer «− $50, devolución del ticket».
 *
 * La parte se calcula ACUMULADA, igual que el dinero: lo devuelto antes más lo de ahora,
 * menos lo devuelto antes, con el redondeo único del dominio. Devolver a pedazos cancela
 * exactamente lo causado, ni un centavo más ni uno menos. Las que ya se liquidaron también
 * reciben la suya: la contrapartida nace sin liquidar y la descuenta la siguiente.
 */
async function contrapartidasDeComision(
  ctx: ContextoComando<Transaccion>,
  devueltas: readonly LineaDevuelta[],
  vendidas: ReadonlyMap<string, LineaVendida>,
  previo: ReadonlyMap<string, { readonly cantidad: bigint; readonly monto: bigint }>,
  motivo: string,
): Promise<number> {
  const { organizacionId } = ctx.ambito;
  const causadas = await ctx.tx
    .selectFrom('comisiones_causadas')
    .select([
      'id',
      'orden_linea_id as lineaId',
      'cita_servicio_id as citaServicioId',
      'profesional_id as profesionalId',
      'regla_id as reglaId',
      'regla_version as reglaVersion',
      'tasa_bp as tasaBp',
      'base_centavos as base',
      'monto_centavos as monto',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where(
      'orden_linea_id',
      'in',
      devueltas.map((d) => d.ordenLineaId),
    )
    // Sólo lo causado: una contrapartida no se vuelve a corregir.
    .where('tipo', '<>', 'contrapartida')
    .execute();

  let escritas = 0;
  for (const causada of causadas) {
    const vendida = causada.lineaId === null ? undefined : vendidas.get(causada.lineaId);
    const devuelta = devueltas.find((d) => d.ordenLineaId === causada.lineaId);
    if (vendida === undefined || devuelta === undefined) continue;
    const total = diezmilesimas(vendida.cantidad);
    const antes = previo.get(vendida.id)?.cantidad ?? 0n;
    const despues = antes + diezmilesimas(devuelta.cantidad);
    const parte = (valor: bigint): bigint =>
      redondear(valor * despues, total) - redondear(valor * antes, total);
    const monto = parte(causada.monto);
    // Una comisión de cero no tiene nada que corregir, y la 134 exige el signo negativo.
    if (monto <= 0n) continue;
    await ctx.tx
      .insertInto('comisiones_causadas')
      .values({
        organizacion_id: organizacionId,
        orden_linea_id: causada.lineaId,
        cita_servicio_id: causada.citaServicioId,
        profesional_id: causada.profesionalId,
        regla_id: causada.reglaId,
        regla_version: causada.reglaVersion,
        tipo: 'contrapartida',
        base_centavos: -parte(causada.base),
        tasa_bp: causada.tasaBp,
        monto_centavos: -monto,
        contrapartida_de_id: causada.id,
        motivo: `devolución: ${motivo}`,
        causada_en: ctx.ahora,
      })
      .execute();
    escritas += 1;
  }
  return escritas;
}

/** Lo que regresa al almacén de cada línea vendida por pieza o por presentación. */
async function planearRegreso(
  ctx: ContextoComando<Transaccion>,
  ordenId: string,
  devueltas: readonly LineaDevuelta[],
  vendidas: ReadonlyMap<string, LineaVendida>,
  devolucionId: string,
): Promise<repoStock.Regreso[]> {
  const { organizacionId, sucursalId, empleoId } = ctx.ambito;
  if (sucursalId === null) return [];
  const almacenId = await repoVentaCatalogo.almacenPrincipal(ctx.tx, organizacionId, sucursalId);
  if (almacenId === null) return [];
  const regresos: repoStock.Regreso[] = [];
  for (const devuelta of devueltas) {
    const linea = vendidas.get(devuelta.ordenLineaId);
    if (linea?.productoId === null || linea === undefined) continue;
    const producto = await repoVentaCatalogo.productoParaVender(
      ctx.tx,
      organizacionId,
      linea.productoId,
    );
    // Sólo lo que se vende tal cual vuelve a estar en el anaquel. Lo de receta ya se
    // preparó; un servicio no es mercancía.
    if (producto?.estrategiaConsumo !== 'sku') continue;
    if (producto.insumoId === null || producto.unidadBaseInsumo === null) continue;
    const proporcion =
      linea.cantidadBaseConsumo === null
        ? null
        : (diezmilesimas(linea.cantidadBaseConsumo) * diezmilesimas(devuelta.cantidad)) /
          diezmilesimas(linea.cantidad);
    const aConsumir = cantidadAConsumir(
      {
        cantidad: devuelta.cantidad,
        unidad: linea.unidad,
        cantidadBaseConsumo:
          proporcion === null
            ? null
            : `${String(proporcion / 10_000n)}.${String(proporcion % 10_000n).padStart(4, '0')}`,
      },
      producto.unidadBaseInsumo,
    );
    const [plan] = calcularConsumo([
      {
        organizacionId,
        almacenId,
        ordenId,
        lineaId: linea.id,
        cantidad: aConsumir.cantidad,
        permiteVentaSinStock: true,
        estrategiaConsumo: 'sku',
        insumoId: producto.insumoId,
        unidadVenta: aConsumir.unidadVenta,
        unidadBase: producto.unidadBaseInsumo,
      },
    ]);
    if (plan === undefined) continue;
    regresos.push({
      organizacionId,
      almacenId,
      insumoId: plan.insumoId,
      cantidad: plan.cantidad,
      unidad: plan.unidad,
      devolucionId,
      empleadoId: empleoId,
    });
  }
  return regresos;
}

export const devolverVenta = definirComando<
  Transaccion,
  typeof entradaDevolverVenta,
  ResultadoDevolucionDeVenta
>({
  nombre: 'venta.devolver_venta',
  entidad: 'orden',
  escribe: true,
  roles: [...QUIEN_DEVUELVE],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaDevolverVenta,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, terminalId, empleoId } = ctx.ambito;

    // La orden BLOQUEADA: dos devoluciones a la vez de la misma venta sumarían más de
    // lo vendido, cada una mirando lo devuelto antes de la otra.
    const orden = await ctx.paso('bloquear_orden', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select(['id', 'estado', 'sucursal_id', 'total_centavos', 'version'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.ordenId)
        .forUpdate()
        .executeTakeFirst(),
    );
    // De otra sucursal se contesta igual que si no existiera.
    if (orden === undefined) {
      throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa venta no existe en esta sucursal.');
    }
    if (orden.sucursal_id !== sucursalId) {
      throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa venta no existe en esta sucursal.');
    }
    if (!(DEVOLVIBLES as readonly string[]).includes(orden.estado)) {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        orden.estado === 'reembolsada'
          ? 'Esa venta ya se devolvió completa.'
          : 'Esa venta no está cobrada: no hay dinero que devolver.',
        { estado: orden.estado },
      );
    }

    const filas = await ctx.paso('leer_lineas', () =>
      ctx.tx
        .selectFrom('orden_lineas')
        .select([
          'id',
          'producto_id as productoId',
          'cantidad',
          'unidad',
          'total_centavos as totalCentavos',
          'cantidad_base_consumo as cantidadBaseConsumo',
        ])
        .where('organizacion_id', '=', organizacionId)
        .where('orden_id', '=', orden.id)
        .where('anulada_en', 'is', null)
        .orderBy('orden_visual')
        .execute(),
    );
    const vendidas = new Map(filas.map((f) => [f.id, f]));
    // Lo cobrado de cada línea es su parte EXACTA del total que se pagó.
    const partes = repartirPorPesos(
      centavos(orden.total_centavos),
      filas.map((f) => Number(f.totalCentavos)),
    );
    const cobradoPorLinea = new Map(filas.map((f, i) => [f.id, BigInt(partes[i] ?? 0n)]));

    const previo = await ctx.paso('leer_devuelto', () => yaDevuelto(ctx, orden.id));
    const devueltas = importes(entrada.lineas, vendidas, cobradoPorLinea, previo);
    const monto = devueltas.reduce((suma, l) => suma + BigInt(l.montoCentavos), 0n);
    if (monto === 0n) {
      throw new ErrorDominio('CANTIDAD_INVALIDA', 'Lo que se devuelve no tiene importe.');
    }

    const disponible = await ctx.paso('leer_pagos', () => disponiblePorMetodo(ctx, orden.id));
    if ((disponible.get(entrada.metodo) ?? 0n) < monto) {
      throw new ErrorDominio(
        'PAGO_NO_CUADRA',
        `Por ${entrada.metodo} entraron menos de lo que se quiere devolver: se devuelve por el método con que se pagó.`,
        { disponibleCentavos: (disponible.get(entrada.metodo) ?? 0n).toString() },
      );
    }

    let sesionCajaId: string | null = null;
    if (entrada.metodo === 'efectivo') {
      if (terminalId === null) {
        throw new ErrorDominio(
          'VENTA_SIN_TERMINAL',
          'La devolución en efectivo se hace desde la terminal donde está el cajón.',
        );
      }
      const sesion = await ctx.paso('bloquear_caja', () =>
        repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId, true),
      );
      if (sesion === null) {
        throw new ErrorDominio('CAJA_CERRADA', 'Abre la caja para poder devolver el efectivo.');
      }
      sesionCajaId = sesion.id;
    }

    const devolucion = await ctx.paso('anotar_devolucion', () =>
      ctx.tx
        .insertInto('devoluciones')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: orden.sucursal_id,
          orden_id: orden.id,
          sesion_caja_id: sesionCajaId,
          empleado_id: empleoId,
          metodo: entrada.metodo,
          monto_centavos: monto,
          motivo: entrada.motivo,
          regresa_al_inventario: entrada.regresaAlInventario,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );
    await ctx.paso('anotar_lineas', () =>
      ctx.tx
        .insertInto('devoluciones_lineas')
        .values(
          devueltas.map((l) => ({
            organizacion_id: organizacionId,
            devolucion_id: devolucion.id,
            orden_linea_id: l.ordenLineaId,
            cantidad: l.cantidad,
            monto_centavos: BigInt(l.montoCentavos),
            created_at: ctx.ahora,
          })),
        )
        .execute(),
    );

    const contrapartidas = await ctx.paso('contrapartidas_de_comision', () =>
      contrapartidasDeComision(ctx, devueltas, vendidas, previo, entrada.motivo),
    );

    if (sesionCajaId !== null) {
      await ctx.paso('sacar_del_cajon', () =>
        repoCaja.registrarMovimiento(ctx.tx, {
          organizacionId,
          sesionCajaId,
          tipo: 'devolucion',
          montoCentavos: monto,
          referenciaTipo: 'devolucion',
          referenciaId: devolucion.id,
          motivo: entrada.motivo,
          empleadoId: empleoId,
        }),
      );
    }

    if (entrada.regresaAlInventario) {
      const regresos = await ctx.paso('planear_regreso', () =>
        planearRegreso(ctx, orden.id, devueltas, vendidas, devolucion.id),
      );
      await ctx.paso('regresar_al_inventario', () =>
        repoStock.regresarAlInventario(regresos, ctx.tx),
      );
    }

    // Completa cuando TODA línea viva quedó devuelta entera.
    const completa = filas.every((f) => {
      const antes = previo.get(f.id)?.cantidad ?? 0n;
      const ahora = devueltas
        .filter((d) => d.ordenLineaId === f.id)
        .reduce((suma, d) => suma + diezmilesimas(d.cantidad), 0n);
      return antes + ahora === diezmilesimas(f.cantidad);
    });
    const estado = completa ? 'reembolsada' : 'parcialmente_reembolsada';
    await ctx.paso('cambiar_estado', () =>
      ctx.tx
        .updateTable('ordenes')
        .set({ estado, version: orden.version + 1, updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', orden.id)
        .execute(),
    );

    ctx.auditar({
      entidadId: orden.id,
      payload: {
        devolucionId: devolucion.id,
        metodo: entrada.metodo,
        montoCentavos: monto.toString(),
        motivo: entrada.motivo,
        lineas: devueltas,
        regresaAlInventario: entrada.regresaAlInventario,
        contrapartidasDeComision: contrapartidas,
      },
    });

    return {
      devolucionId: devolucion.id,
      ordenId: orden.id,
      montoCentavos: monto.toString(),
      metodo: entrada.metodo,
      estado,
      lineas: devueltas,
    };
  },
});

export const entradaVentaParaDevolver = z
  .object({
    ordenId: z.uuid().optional(),
    folio: z.string().trim().min(1).max(40).optional(),
  })
  .refine((e) => e.ordenId !== undefined || e.folio !== undefined, 'Falta la venta o su folio.');

export interface LineaParaDevolver {
  readonly ordenLineaId: string;
  readonly producto: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly devuelta: string;
  readonly cobradoCentavos: string;
  readonly devueltoCentavos: string;
}

export interface VentaParaDevolver {
  readonly ordenId: string;
  readonly folio: string | null;
  readonly estado: string;
  readonly totalCentavos: string;
  readonly cerradaEn: string | null;
  readonly lineas: readonly LineaParaDevolver[];
  /** Lo que todavía se puede devolver por cada método con que se pagó. */
  readonly disponible: readonly { readonly metodo: string; readonly centavos: string }[];
}

const aTexto = (valor: bigint): string =>
  `${String(valor / 10_000n)}.${String(valor % 10_000n).padStart(4, '0')}`;

/**
 * LA VENTA, COMO LA VE QUIEN VA A DEVOLVER: cada línea con lo vendido, lo ya devuelto y
 * lo que se cobró de ella, y lo que queda por método. Se busca por su id —desde la lista
 * del día— o por el FOLIO que trae el ticket en la mano del cliente.
 */
export const ventaParaDevolver = definirComando<
  Transaccion,
  typeof entradaVentaParaDevolver,
  VentaParaDevolver
>({
  nombre: 'venta.para_devolver',
  entidad: 'orden',
  escribe: false,
  roles: [...QUIEN_DEVUELVE],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaVentaParaDevolver,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId } = ctx.ambito;
    let consulta = ctx.tx
      .selectFrom('ordenes')
      .select(['id', 'folio', 'estado', 'sucursal_id', 'total_centavos', 'cerrada_en'])
      .where('organizacion_id', '=', organizacionId);
    if (entrada.ordenId !== undefined) {
      consulta = consulta.where('id', '=', entrada.ordenId);
    } else {
      // El ticket dice «A-123» o «123»: el folio es el número del final.
      const numero = /(\d+)$/.exec(entrada.folio ?? '')?.[1];
      if (numero === undefined) {
        throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Ese folio no tiene número.');
      }
      consulta = consulta.where('folio', '=', BigInt(numero));
    }
    const orden = await ctx.paso('leer_orden', () => consulta.executeTakeFirst());
    // De otra sucursal se contesta igual que si no existiera.
    if (orden === undefined) {
      throw new ErrorDominio(
        'ORDEN_NO_ENCONTRADA',
        'No hay una venta con ese folio en esta sucursal.',
      );
    }
    if (orden.sucursal_id !== sucursalId) {
      throw new ErrorDominio(
        'ORDEN_NO_ENCONTRADA',
        'No hay una venta con ese folio en esta sucursal.',
      );
    }
    const filas = await ctx.paso('leer_lineas', () =>
      ctx.tx
        .selectFrom('orden_lineas')
        .select(['id', 'producto_nombre', 'cantidad', 'unidad', 'total_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where('orden_id', '=', orden.id)
        .where('anulada_en', 'is', null)
        .orderBy('orden_visual')
        .execute(),
    );
    const partes = repartirPorPesos(
      centavos(orden.total_centavos),
      filas.map((f) => Number(f.total_centavos)),
    );
    const previo = await ctx.paso('leer_devuelto', () => yaDevuelto(ctx, orden.id));
    const disponible = await ctx.paso('leer_pagos', () => disponiblePorMetodo(ctx, orden.id));
    return {
      ordenId: orden.id,
      folio: orden.folio === null ? null : orden.folio.toString(),
      estado: orden.estado,
      totalCentavos: orden.total_centavos.toString(),
      cerradaEn: orden.cerrada_en?.toISOString() ?? null,
      lineas: filas.map((f, i) => ({
        ordenLineaId: f.id,
        producto: f.producto_nombre,
        cantidad: f.cantidad,
        unidad: f.unidad,
        devuelta: aTexto(previo.get(f.id)?.cantidad ?? 0n),
        cobradoCentavos: String(partes[i] ?? 0n),
        devueltoCentavos: (previo.get(f.id)?.monto ?? 0n).toString(),
      })),
      disponible: [...disponible.entries()]
        .filter(([, c]) => c > 0n)
        .map(([metodo, c]) => ({ metodo, centavos: c.toString() })),
    };
  },
});
