import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-155 · El doble destino del mismo SKU: cabina y anaquel.
 *
 * ── El caso que ningún otro modelo tiene ─────────────────────────────────
 * El mismo bote de shampoo de un litro puede acabar de dos maneras: se VENDE
 * entero en el anaquel, o se ABRE en cabina y se gasta en dosis a lo largo de
 * tres semanas. Es la misma clave de catálogo y son dos existencias con dos
 * unidades distintas —piezas y mililitros—, y el negocio necesita las dos.
 *
 * Sin esto, el salón elige: o lleva el inventario de venta y no sabe cuánto
 * producto se gasta en cabina —que es el costo directo de cada servicio y el
 * número que falta para saber si un tinte deja dinero—, o lleva el de cabina y
 * entonces el anaquel dice que hay doce botes cuando hay nueve.
 *
 * ── Abrir una pieza ES un traspaso, y por eso no inventa nada ────────────
 * Sale una pieza del almacén de venta y entran `factor_apertura` unidades del
 * insumo base en el de cabina. El tronco ya sabe mover existencias entre
 * almacenes; reescribir aquí un segundo mecanismo daría dos kardex.
 *
 * ── Y «¿alcanza?» se pregunta contra la AGENDA, no contra hoy ────────────
 * La existencia de cabina contra el consumo esperado de las citas que YA están
 * agendadas. Preguntarlo contra el consumo de ayer es enterarse el sábado de
 * que el tinte rubio no alcanza para las cuatro citas del sábado.
 */

const CABINA = ['mesero', 'cajero', 'gerente', 'administrador', 'dueno'] as const;

/**
 * Los dos almacenes del salón, resueltos desde la SESIÓN.
 *
 * El de venta es el PRINCIPAL —el mostrador— y el de cabina es el otro: un salón
 * tiene el anaquel de lo que vende y el cuarto donde se mezcla, y por eso la 141
 * separa los dos destinos. Se resuelve por eliminación y no por el nombre: un
 * almacén llamado «Cabina 2» dejaría de encontrarse el día que alguien lo renombre.
 *
 * Si no hay un segundo almacén se DICE, con lo que hay que hacer. Antes esto no
 * podía fallar porque la pantalla mandaba dos cadenas vacías y no llegaba nunca.
 */
async function almacenesDelSalon(
  ctx: ContextoComando<Transaccion>,
): Promise<{ readonly venta: string; readonly cabina: string }> {
  const { organizacionId, sucursalId } = ctx.ambito;
  if (sucursalId === null) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'Un almacén es de una sucursal, y esta sesión no tiene una.',
    );
  }
  const almacenes = await ctx.paso('cargar_almacenes', () =>
    ctx.tx
      .selectFrom('almacenes')
      .select(['id', 'principal'])
      .where('organizacion_id', '=', organizacionId)
      .where('sucursal_id', '=', sucursalId)
      .where('activo', '=', true)
      .orderBy('principal', 'desc')
      .execute(),
  );
  const venta = almacenes.find((a) => a.principal) ?? almacenes[0];
  const cabina = almacenes.find((a) => a.id !== venta?.id);
  if (venta === undefined) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'Esta sucursal no tiene almacén dado de alta.',
    );
  }
  if (cabina === undefined) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'Este negocio no tiene almacén de CABINA: lo que se abre para mezclar se cuenta aparte de ' +
        'lo que se vende, o el inventario del anaquel miente. Da de alta un segundo almacén.',
    );
  }
  return { venta: venta.id, cabina: cabina.id };
}

export const entradaAbrirProducto = z.object({
  productoId: z.uuid(),
  /**
   * De dónde sale y a dónde entra. Los dos OPCIONALES: los resuelve la sesión.
   *
   * La pantalla de productos de un salón no sabe los ids de sus almacenes —ni
   * tiene por qué— y exigírselos la dejaba montada con la cadena vacía, sin
   * consultar nada y EN BLANCO. El ámbito sale de la sesión del servidor (R16); se
   * siguen aceptando porque un salón con dos sucursales sí elige.
   */
  almacenVentaId: z.uuid().optional(),
  almacenCabinaId: z.uuid().optional(),
  /** Cuántas piezas se abren. Casi siempre una. */
  piezas: z.number().int().min(1).max(50).default(1),
});

export const entradaAlcanzaCabina = z.object({
  /** OPCIONAL: el almacén de cabina de la sesión. Ver `entradaAbrirProducto`. */
  almacenCabinaId: z.uuid().optional(),
  /** Lo que las citas ya agendadas van a gastar, por insumo. */
  consumoEsperado: z
    .array(
      z.object({
        insumoId: z.uuid(),
        cantidadBase: z.string().regex(/^\d{1,10}(\.\d{1,4})?$/, 'Cantidad con 4 decimales.'),
      }),
    )
    .min(1)
    .max(200),
});

export interface ResultadoApertura {
  readonly productoId: string;
  readonly insumoId: string;
  readonly unidadesACabina: string;
  readonly unidadCabina: string;
}

export interface FaltanteDeCabina {
  readonly insumoId: string;
  readonly hay: string;
  readonly hara_falta: string;
}

export interface ResultadoAlcanza {
  readonly alcanza: boolean;
  readonly faltantes: readonly FaltanteDeCabina[];
}

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

export const abrirProducto = definirComando<
  Transaccion,
  typeof entradaAbrirProducto,
  ResultadoApertura
>({
  nombre: 'cabina.abrir_producto',
  entidad: 'producto',
  escribe: true,
  roles: [...CABINA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAbrirProducto,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;
    // Los dos, de la petición o del ámbito: un salón con dos sucursales sí elige.
    // Sólo se pregunta a la base cuando falta alguno: con los dos dichos, ir a
    // buscarlos sería una consulta que no cambia nada.
    const dichos = { venta: entrada.almacenVentaId, cabina: entrada.almacenCabinaId };
    const almacenes =
      dichos.venta !== undefined && dichos.cabina !== undefined
        ? { venta: dichos.venta, cabina: dichos.cabina }
        : await (async () => {
            const delAmbito = await almacenesDelSalon(ctx);
            return {
              venta: dichos.venta ?? delAmbito.venta,
              cabina: dichos.cabina ?? delAmbito.cabina,
            };
          })();

    const producto = await ctx.paso('leer_producto', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre', 'destino', 'factor_apertura', 'unidad_cabina', 'insumo_base_id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .executeTakeFirst(),
    );
    if (producto === undefined) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto no existe en este negocio.');
    }
    if (producto.destino === 'venta') {
      // Abrir lo que sólo se vende es sacarlo del anaquel sin cobrarlo. Si de
      // verdad se va a usar en cabina, primero se marca como tal.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        `«${producto.nombre}» está marcado sólo para venta: no se abre en cabina.`,
      );
    }
    const factor = producto.factor_apertura;
    const unidad = producto.unidad_cabina;
    const insumoId = producto.insumo_base_id;
    if (factor == null || unidad == null || insumoId === null) {
      // El `check` de la 141 lo exige, pero aquí se puede decir QUÉ falta: un
      // 23514 sólo diría que algo de la ficha está a medias.
      throw new ErrorDominio(
        'CATALOGO_INVALIDO',
        `«${producto.nombre}» no dice cuánto rinde al abrirse ni en qué se mide.`,
      );
    }

    const unidades = aEscala(factor) * BigInt(entrada.piezas);

    // SALE del almacén de venta, en piezas y en negativo.
    await ctx.paso('salida_de_venta', () =>
      ctx.tx
        .insertInto('movimientos_stock')
        .values({
          organizacion_id: organizacionId,
          almacen_id: almacenes.venta,
          insumo_id: insumoId,
          tipo: 'traspaso_salida',
          cantidad: `-${entrada.piezas}`,
          unidad: 'pieza',
          referencia_tipo: 'apertura_cabina',
          referencia_id: entrada.productoId,
          empleado_id: empleoId,
          // Abrir un producto para cabina no es una merma: es un traspaso entre
          // dos almacenes del mismo salón. La frase va en `nota`; en `motivo`
          // reventaba la foránea a `motivos_merma` y la apertura no se guardaba.
          motivo: null,
          nota: `apertura para cabina de ${producto.nombre}`,
          created_at: ctx.ahora,
        })
        .execute(),
    );

    // Y ENTRA al de cabina, en su unidad y en positivo.
    await ctx.paso('entrada_a_cabina', () =>
      ctx.tx
        .insertInto('movimientos_stock')
        .values({
          organizacion_id: organizacionId,
          almacen_id: almacenes.cabina,
          insumo_id: insumoId,
          tipo: 'traspaso_entrada',
          cantidad: deEscala(unidades),
          unidad,
          referencia_tipo: 'apertura_cabina',
          referencia_id: entrada.productoId,
          empleado_id: empleoId,
          motivo: `apertura para cabina de ${producto.nombre}`,
          created_at: ctx.ahora,
        })
        .execute(),
    );

    ctx.auditar({
      entidadId: entrada.productoId,
      payload: { piezas: entrada.piezas, unidades: deEscala(unidades) },
    });
    return {
      productoId: entrada.productoId,
      insumoId,
      unidadesACabina: deEscala(unidades),
      unidadCabina: unidad,
    };
  },
});

export const alcanzaLaCabina = definirComando<
  Transaccion,
  typeof entradaAlcanzaCabina,
  ResultadoAlcanza
>({
  nombre: 'cabina.alcanza',
  entidad: 'almacen',
  escribe: false,
  roles: [...CABINA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAlcanzaCabina,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const almacenCabinaId = entrada.almacenCabinaId ?? (await almacenesDelSalon(ctx)).cabina;

    const existencias = await ctx.paso('leer_existencias', () =>
      ctx.tx
        .selectFrom('existencias')
        .select(['insumo_id', 'cantidad'])
        .where('organizacion_id', '=', organizacionId)
        .where('almacen_id', '=', almacenCabinaId)
        .execute(),
    );

    const hayPorInsumo = new Map(existencias.map((e) => [e.insumo_id, aEscala(e.cantidad)]));
    const faltantes: FaltanteDeCabina[] = [];

    for (const necesario of entrada.consumoEsperado) {
      const hay = hayPorInsumo.get(necesario.insumoId) ?? 0n;
      const hara = aEscala(necesario.cantidadBase);
      if (hay < hara) {
        faltantes.push({
          insumoId: necesario.insumoId,
          hay: deEscala(hay),
          hara_falta: deEscala(hara),
        });
      }
    }

    // Se devuelven TODOS los faltantes y no sólo el primero: quien va a comprar
    // hace un viaje, y enterarse de uno en uno son tres viajes.
    return { alcanza: faltantes.length === 0, faltantes };
  },
});
