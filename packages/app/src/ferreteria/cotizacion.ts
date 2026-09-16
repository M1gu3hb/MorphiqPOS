import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { saldoDeSurtido, sigueVigente, versionSiguiente } from '@morphiqpos/domain/venta';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-600, F-601, F-602, F-603, F-604, F-605 y F-607 · La cotización, entera.
 *
 * ── El dolor, con sus palabras ───────────────────────────────────────────
 * «La venta grande se cotiza en una hoja de Excel de Norma y se pierde el
 * seguimiento. No se sabe cuántas se ganan ni cuántas se pierden ni por qué.»
 * Las tres partes de esa frase son las tres cosas que este archivo hace: el
 * documento, su rastro, y el motivo del cierre.
 *
 * ── Versionar es CREAR, nunca editar (F-601) ─────────────────────────────
 * Cotizar una obra son tres o cuatro vueltas. Editar en sitio haría que la
 * versión que el cliente aprobó dejara de existir, y la discusión de la
 * entrega —«yo aprobé otra cosa»— no se podría resolver con nada. Cada versión
 * apunta a la anterior, y sólo la última está viva: el índice parcial
 * `cotizacion_version_viva` lo hace imposible de romper desde el código.
 *
 * ── Los totales los calcula el SERVIDOR (F-600) ──────────────────────────
 * La entrada trae cantidades y precios unitarios; el total de cada línea y el
 * del documento se suman aquí. Aceptar el total del cliente sería aceptar el
 * precio del cliente, y en una cotización de cien mil pesos eso no es un error
 * de redondeo.
 *
 * ── Convertir EXIGE vigencia (F-604) ─────────────────────────────────────
 * Una cotización vencida se puede volver a cotizar, no convertir. Honrarla a
 * los tres meses es cerrar en pérdida la venta que se celebró, y es
 * exactamente lo que pasa hoy con la hoja de Excel.
 *
 * ── Cerrar como perdida EXIGE motivo (F-607) ─────────────────────────────
 * «Se perdió» sin motivo es el estado de hoy y no enseña nada. Con motivo, tres
 * meses de cotizaciones perdidas dicen si el problema es el precio, el plazo, o
 * que no se marcó a tiempo — que son tres arreglos distintos.
 *
 * ── Lo que NO está aquí ──────────────────────────────────────────────────
 * El envío de verdad. `registrarEnvio` anota QUE se mandó y por dónde; mandar
 * el correo o el WhatsApp es de otra capa, y el proveedor de WhatsApp está
 * bloqueado en esta fase. Anotarlo igual es lo que permite perseguir: «¿a quién
 * no le hemos marcado desde hace cuatro días?» se contesta con esta tabla
 * aunque el mensaje lo haya mandado alguien a mano.
 */

const MOSTRADOR = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
const AUTORIZA = ['gerente', 'administrador', 'dueno'] as const;
const CANTIDAD = /^\d{1,10}(\.\d{1,4})?$/;

const lineaDeEntrada = z.object({
  productoId: z.uuid().nullable().default(null),
  descripcion: z.string().trim().min(1).max(200),
  cantidad: z.string().regex(CANTIDAD, 'Cantidad con cuatro decimales.'),
  unidad: z.string().trim().min(1).max(20),
  precioUnitarioCentavos: z.number().int().min(0).max(100_000_000),
});

export const entradaCrearCotizacion = z.object({
  folio: z.string().trim().min(1).max(30),
  venceEl: z.iso.date(),
  clienteId: z.uuid().nullable().default(null),
  obraId: z.uuid().nullable().default(null),
  nombreLibre: z.string().trim().max(120).nullable().default(null),
  correoLibre: z.email().nullable().default(null),
  telefonoLibre: z.string().trim().max(30).nullable().default(null),
  descuentoCentavos: z.number().int().min(0).max(100_000_000).default(0),
  lineas: z.array(lineaDeEntrada).min(1).max(200),
});

export const entradaVersionarCotizacion = z.object({
  cotizacionId: z.uuid(),
  venceEl: z.iso.date(),
  descuentoCentavos: z.number().int().min(0).max(100_000_000).default(0),
  lineas: z.array(lineaDeEntrada).min(1).max(200),
});

export const entradaRegistrarEnvio = z.object({
  cotizacionId: z.uuid(),
  medio: z.enum(['correo', 'whatsapp', 'impresa', 'mostrador']),
  nota: z.string().trim().max(200).optional(),
});

export const entradaRegistrarAprobacion = z.object({
  cotizacionId: z.uuid(),
  nota: z.string().trim().max(200).optional(),
});

export const entradaConvertirCotizacion = z.object({
  cotizacionId: z.uuid(),
  /** La orden que ya se creó con las líneas de la cotización. */
  ordenId: z.uuid(),
});

export const entradaRegistrarSurtido = z.object({
  cotizacionId: z.uuid(),
  entregas: z
    .array(
      z.object({
        lineaId: z.uuid(),
        cantidad: z.string().regex(CANTIDAD, 'Cantidad con cuatro decimales.'),
      }),
    )
    .min(1)
    .max(200),
});

export const entradaCerrarCotizacion = z.object({
  cotizacionId: z.uuid(),
  resultado: z.enum(['perdida', 'vencida']),
  motivo: z.string().trim().max(200).optional(),
  competidor: z.string().trim().max(120).nullable().default(null),
});

export interface ResultadoCotizacion {
  readonly cotizacionId: string;
  readonly folio: string;
  readonly version: number;
  readonly totalCentavos: string;
}

export interface ResultadoSeguimiento {
  readonly cotizacionId: string;
  readonly estado: string;
}

export interface ResultadoSurtido {
  readonly cotizacionId: string;
  readonly completa: boolean;
  readonly lineasPendientes: number;
  readonly pendienteCentavos: string;
}

/** La escala entera de `numeric(14,4)`. Nunca se pasa por coma flotante. */
const ESCALA = 10_000n;

function aEscala(valor: string): bigint {
  const [entero = '0', decimal = ''] = valor.trim().split('.');
  return BigInt(entero) * ESCALA + BigInt(decimal.padEnd(4, '0'));
}

function deEscala(valor: bigint): string {
  const entero = valor / ESCALA;
  const resto = (valor % ESCALA).toString().padStart(4, '0');
  return `${entero}.${resto}`;
}

type LineaDeEntrada = z.infer<typeof lineaDeEntrada>;

/**
 * Los totales se calculan aquí, y no se aceptan de la entrada.
 *
 * El total de cada línea es `precio × cantidad` en aritmética entera: el precio
 * está en centavos y la cantidad en diezmilésimas, así que el producto viene en
 * centavos·10⁴ y se divide UNA vez al final. Multiplicar y dividir por línea
 * acumularía un centavo por renglón, y una cotización de doscientas partidas se
 * iría dos pesos de la suma que el cliente ve.
 */
function totalizar(
  lineas: readonly LineaDeEntrada[],
  descuentoCentavos: number,
): { readonly totales: readonly bigint[]; readonly subtotal: bigint; readonly total: bigint } {
  const totales = lineas.map(
    (l) => (BigInt(l.precioUnitarioCentavos) * aEscala(l.cantidad)) / ESCALA,
  );
  const subtotal = totales.reduce((suma, t) => suma + t, 0n);
  const descuento = BigInt(descuentoCentavos);
  if (descuento > subtotal) {
    throw new ErrorDominio(
      'DINERO_PORCENTAJE_INVALIDO',
      'El descuento no puede pasar del subtotal de la cotización.',
    );
  }
  return { totales, subtotal, total: subtotal - descuento };
}

interface FilaCotizacion {
  readonly id: string;
  readonly folio: string;
  readonly version: number;
  readonly estado: string;
  readonly vence_el: string;
  readonly cliente_id: string | null;
  readonly obra_id: string | null;
  readonly nombre_libre: string | null;
  readonly correo_libre: string | null;
  readonly telefono_libre: string | null;
}

async function cargar(
  ctx: ContextoComando<Transaccion>,
  cotizacionId: string,
): Promise<FilaCotizacion> {
  const fila = await ctx.paso('leer_cotizacion', () =>
    ctx.tx
      .selectFrom('cotizaciones')
      .select([
        'id',
        'folio',
        'version',
        'estado',
        'vence_el',
        'cliente_id',
        'obra_id',
        'nombre_libre',
        'correo_libre',
        'telefono_libre',
      ])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', '=', cotizacionId)
      .executeTakeFirst(),
  );
  if (fila === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa cotización no existe en este negocio.');
  }
  return fila;
}

async function escribirLineas(
  ctx: ContextoComando<Transaccion>,
  cotizacionId: string,
  lineas: readonly LineaDeEntrada[],
  totales: readonly bigint[],
): Promise<void> {
  await ctx.paso('escribir_lineas', () =>
    ctx.tx
      .insertInto('cotizacion_lineas')
      .values(
        lineas.map((l, indice) => ({
          organizacion_id: ctx.ambito.organizacionId,
          cotizacion_id: cotizacionId,
          orden_visual: indice,
          producto_id: l.productoId,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          unidad: l.unidad,
          precio_unitario_centavos: BigInt(l.precioUnitarioCentavos),
          total_centavos: totales[indice] ?? 0n,
          created_at: ctx.ahora,
        })),
      )
      .execute(),
  );
}

async function anotarEvento(
  ctx: ContextoComando<Transaccion>,
  cotizacionId: string,
  tipo: string,
  medio: string | null,
  nota: string | null,
): Promise<void> {
  await ctx.paso('anotar_evento', () =>
    ctx.tx
      .insertInto('cotizacion_eventos')
      .values({
        organizacion_id: ctx.ambito.organizacionId,
        cotizacion_id: cotizacionId,
        tipo,
        medio,
        nota,
        ocurrio_en: ctx.ahora,
        empleado_id: ctx.ambito.empleoId,
      })
      .execute(),
  );
}

export const crearCotizacion = definirComando<
  Transaccion,
  typeof entradaCrearCotizacion,
  ResultadoCotizacion
>({
  nombre: 'cotizacion.crear',
  entidad: 'cotizacion',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaCrearCotizacion,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;

    if (entrada.clienteId === null && (entrada.nombreLibre ?? '') === '') {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Una cotización que no se le puede mandar a nadie no es una cotización.',
      );
    }
    // La vigencia se comprueba al CREAR además de al convertir: nacer vencida
    // es un tecleo, y descubrirlo al mandarla es descubrirlo tarde.
    if (!sigueVigente(entrada.venceEl, ctx.ahora)) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Una cotización no puede nacer vencida: revisa la fecha de vigencia.',
      );
    }

    const { totales, subtotal, total } = totalizar(entrada.lineas, entrada.descuentoCentavos);

    const cotizacion = await ctx.paso('crear_cotizacion', () =>
      ctx.tx
        .insertInto('cotizaciones')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          folio: entrada.folio,
          version: 1,
          vigente: true,
          cliente_id: entrada.clienteId,
          obra_id: entrada.obraId,
          nombre_libre: entrada.nombreLibre,
          correo_libre: entrada.correoLibre,
          telefono_libre: entrada.telefonoLibre,
          estado: 'borrador',
          vence_el: entrada.venceEl,
          subtotal_centavos: subtotal,
          descuento_centavos: BigInt(entrada.descuentoCentavos),
          total_centavos: total,
          creada_en: ctx.ahora,
          creada_por: empleoId,
          updated_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    await escribirLineas(ctx, cotizacion.id, entrada.lineas, totales);
    await anotarEvento(ctx, cotizacion.id, 'creada', null, null);

    ctx.auditar({
      entidadId: cotizacion.id,
      payload: { folio: entrada.folio, lineas: entrada.lineas.length },
    });
    return {
      cotizacionId: cotizacion.id,
      folio: entrada.folio,
      version: 1,
      totalCentavos: total.toString(),
    };
  },
});

export const versionarCotizacion = definirComando<
  Transaccion,
  typeof entradaVersionarCotizacion,
  ResultadoCotizacion
>({
  nombre: 'cotizacion.versionar',
  entidad: 'cotizacion',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaVersionarCotizacion,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;
    const anterior = await cargar(ctx, entrada.cotizacionId);

    // Versionar algo ya cerrado sería reabrir una venta ganada o resucitar una
    // perdida sin decirlo: las dos se hacen creando una cotización nueva.
    if (['ganada', 'perdida'].includes(anterior.estado)) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa cotización ya está cerrada: una vuelta más empieza con una nueva.',
      );
    }

    const { totales, subtotal, total } = totalizar(entrada.lineas, entrada.descuentoCentavos);
    const version = versionSiguiente(anterior.version);

    // La anterior se apaga ANTES de encender la nueva: el índice parcial
    // `cotizacion_version_viva` sólo admite una viva por folio, y hacerlo al
    // revés fallaría con violación de unicidad en vez de versionar.
    await ctx.paso('apagar_anterior', () =>
      ctx.tx
        .updateTable('cotizaciones')
        .set({ vigente: false, updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', anterior.id)
        .execute(),
    );

    const nueva = await ctx.paso('crear_version', () =>
      ctx.tx
        .insertInto('cotizaciones')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          folio: anterior.folio,
          version,
          version_anterior_id: anterior.id,
          vigente: true,
          cliente_id: anterior.cliente_id,
          obra_id: anterior.obra_id,
          nombre_libre: anterior.nombre_libre,
          correo_libre: anterior.correo_libre,
          telefono_libre: anterior.telefono_libre,
          estado: 'borrador',
          vence_el: entrada.venceEl,
          subtotal_centavos: subtotal,
          descuento_centavos: BigInt(entrada.descuentoCentavos),
          total_centavos: total,
          creada_en: ctx.ahora,
          creada_por: empleoId,
          updated_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    await escribirLineas(ctx, nueva.id, entrada.lineas, totales);
    await anotarEvento(ctx, nueva.id, 'creada', null, `versión ${version}`);

    ctx.auditar({ entidadId: nueva.id, payload: { folio: anterior.folio, version } });
    return {
      cotizacionId: nueva.id,
      folio: anterior.folio,
      version,
      totalCentavos: total.toString(),
    };
  },
});

export const registrarEnvio = definirComando<
  Transaccion,
  typeof entradaRegistrarEnvio,
  ResultadoSeguimiento
>({
  nombre: 'cotizacion.registrar_envio',
  entidad: 'cotizacion',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaRegistrarEnvio,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    await cargar(ctx, entrada.cotizacionId);

    // Estado y fecha en la MISMA escritura: la 163 lo exige, y sin la fecha el
    // seguimiento —«¿a quién no le hemos marcado desde hace cuatro días?»— no
    // se puede ordenar por nada.
    const tocadas = await ctx.paso('marcar_enviada', () =>
      ctx.tx
        .updateTable('cotizaciones')
        .set({ estado: 'enviada', enviada_en: ctx.ahora, updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.cotizacionId)
        .where('estado', 'in', ['borrador', 'enviada'])
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa cotización ya no se puede mandar: o se aprobó, o se cerró.',
      );
    }

    await anotarEvento(ctx, entrada.cotizacionId, 'enviada', entrada.medio, entrada.nota ?? null);

    ctx.auditar({ entidadId: entrada.cotizacionId, payload: { medio: entrada.medio } });
    return { cotizacionId: entrada.cotizacionId, estado: 'enviada' };
  },
});

export const registrarAprobacion = definirComando<
  Transaccion,
  typeof entradaRegistrarAprobacion,
  ResultadoSeguimiento
>({
  nombre: 'cotizacion.registrar_aprobacion',
  entidad: 'cotizacion',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaRegistrarAprobacion,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const cotizacion = await cargar(ctx, entrada.cotizacionId);

    // Aprobar una vencida es lo que después obliga a honrar un precio viejo. Se
    // corta aquí y no al convertir, porque quien aprueba es quien puede
    // renegociar y todavía tiene al cliente al teléfono.
    if (!sigueVigente(cotizacion.vence_el, ctx.ahora)) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa cotización ya venció: hay que versionarla con los precios de hoy.',
      );
    }

    const tocadas = await ctx.paso('marcar_aprobada', () =>
      ctx.tx
        .updateTable('cotizaciones')
        .set({ estado: 'aprobada', aprobada_en: ctx.ahora, updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.cotizacionId)
        .where('estado', '=', 'enviada')
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      // Aprobar algo que no se mandó es aprobar un borrador que el cliente
      // nunca vio, y es la vía por la que un precio de prueba acaba en venta.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Sólo se aprueba lo que se mandó: esa cotización no está enviada.',
      );
    }

    await anotarEvento(ctx, entrada.cotizacionId, 'aprobada', null, entrada.nota ?? null);

    ctx.auditar({ entidadId: entrada.cotizacionId, payload: { aprobada: true } });
    return { cotizacionId: entrada.cotizacionId, estado: 'aprobada' };
  },
});

export const convertirCotizacion = definirComando<
  Transaccion,
  typeof entradaConvertirCotizacion,
  ResultadoSeguimiento
>({
  nombre: 'cotizacion.convertir',
  entidad: 'cotizacion',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaConvertirCotizacion,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const cotizacion = await cargar(ctx, entrada.cotizacionId);

    if (!sigueVigente(cotizacion.vence_el, ctx.ahora)) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa cotización venció: convertirla es cerrar en pérdida la venta que se celebró.',
      );
    }

    // `ganada` exige orden Y fecha de cierre a la vez (`cotizacion_ganada_con_orden`):
    // una ganada sin orden es un deseo, y sin fecha no se puede sacar del embudo.
    const tocadas = await ctx.paso('convertir', () =>
      ctx.tx
        .updateTable('cotizaciones')
        .set({
          estado: 'ganada',
          orden_id: entrada.ordenId,
          cerrada_en: ctx.ahora,
          updated_at: ctx.ahora,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.cotizacionId)
        .where('estado', 'in', ['enviada', 'aprobada'])
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa cotización ya estaba cerrada, o todavía es un borrador.',
      );
    }

    await anotarEvento(ctx, entrada.cotizacionId, 'convertida', null, null);

    ctx.auditar({ entidadId: entrada.cotizacionId, payload: { ordenId: entrada.ordenId } });
    return { cotizacionId: entrada.cotizacionId, estado: 'ganada' };
  },
});

export const registrarSurtido = definirComando<
  Transaccion,
  typeof entradaRegistrarSurtido,
  ResultadoSurtido
>({
  nombre: 'cotizacion.registrar_surtido',
  entidad: 'cotizacion',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaRegistrarSurtido,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    await cargar(ctx, entrada.cotizacionId);

    const lineas = await ctx.paso('leer_lineas', () =>
      ctx.tx
        .selectFrom('cotizacion_lineas')
        .select(['id', 'cantidad', 'surtida', 'total_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where('cotizacion_id', '=', entrada.cotizacionId)
        .execute(),
    );

    const porId = new Map(lineas.map((l) => [l.id, l]));
    for (const entrega of entrada.entregas) {
      const linea = porId.get(entrega.lineaId);
      if (linea === undefined) {
        throw new ErrorDominio('LINEA_NO_ENCONTRADA', 'Esa línea no es de esta cotización.');
      }
      const nueva = aEscala(linea.surtida) + aEscala(entrega.cantidad);
      // El `check` de la base también lo impide, pero aquí se puede decir de
      // qué línea se trata: un 23514 sólo diría que algo no cuadró.
      if (nueva > aEscala(linea.cantidad)) {
        throw new ErrorDominio(
          'CANTIDAD_INVALIDA',
          `Se está entregando más de lo cotizado en «${linea.id}».`,
        );
      }
      porId.set(linea.id, { ...linea, surtida: deEscala(nueva) });
    }

    for (const entrega of entrada.entregas) {
      const actualizada = porId.get(entrega.lineaId);
      if (actualizada === undefined) continue;
      await ctx.paso('surtir_linea', () =>
        ctx.tx
          .updateTable('cotizacion_lineas')
          .set({ surtida: actualizada.surtida })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', entrega.lineaId)
          .execute(),
      );
    }

    const saldo = saldoDeSurtido(
      [...porId.values()].map((l) => ({
        id: l.id,
        cantidad: l.cantidad,
        surtida: l.surtida,
        totalCentavos: l.total_centavos,
      })),
    );

    ctx.auditar({
      entidadId: entrada.cotizacionId,
      payload: { entregas: entrada.entregas.length, completa: saldo.completa },
    });
    return {
      cotizacionId: entrada.cotizacionId,
      completa: saldo.completa,
      lineasPendientes: saldo.lineasPendientes,
      pendienteCentavos: saldo.pendienteCentavos.toString(),
    };
  },
});

export const cerrarCotizacion = definirComando<
  Transaccion,
  typeof entradaCerrarCotizacion,
  ResultadoSeguimiento
>({
  nombre: 'cotizacion.cerrar',
  entidad: 'cotizacion',
  escribe: true,
  roles: [...AUTORIZA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaCerrarCotizacion,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    await cargar(ctx, entrada.cotizacionId);

    const motivo = entrada.motivo ?? '';
    // `perdida` sin motivo es el estado de hoy, y es el que no enseña nada. La
    // base lo exige con `cotizacion_perdida_con_motivo`; aquí se dice por qué.
    if (entrada.resultado === 'perdida' && motivo.length === 0) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Perder una cotización lleva motivo: sin él, el embudo no enseña nada.',
      );
    }

    const cerrar = ctx.tx
      .updateTable('cotizaciones')
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', entrada.cotizacionId)
      .where('estado', 'in', ['borrador', 'enviada', 'aprobada']);

    // Los dos estados van LITERALES, no `estado: entrada.resultado`. El
    // contrato `estados-con-columna` sólo puede leer objetos literales, y con
    // la versión corta afirmaría que nadie cierra cotizaciones.
    const tocadas = await ctx.paso('cerrar', () =>
      entrada.resultado === 'perdida'
        ? cerrar
            .set({
              estado: 'perdida',
              motivo_cierre: motivo,
              competidor: entrada.competidor,
              cerrada_en: ctx.ahora,
              updated_at: ctx.ahora,
            })
            .executeTakeFirst()
        : cerrar
            .set({
              estado: 'vencida',
              motivo_cierre: motivo.length === 0 ? 'venció sin respuesta' : motivo,
              cerrada_en: ctx.ahora,
              updated_at: ctx.ahora,
            })
            .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      throw new ErrorDominio('CONFIGURACION_CONFLICTO', 'Esa cotización ya estaba cerrada.');
    }

    ctx.auditar({ entidadId: entrada.cotizacionId, payload: { resultado: entrada.resultado } });
    return { cotizacionId: entrada.cotizacionId, estado: entrada.resultado };
  },
});
