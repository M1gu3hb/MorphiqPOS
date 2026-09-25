import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import { repoVentaCatalogo, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { registrarCompra } from '../compras/compras.ts';
import { entradaRegistrarCompra } from '../compras/esquemas.ts';
import { definirComando, type ContextoComando } from '../definicion.ts';
import { descontarExistencia } from '../inventario/merma.ts';
import { exigirMotivoDeMerma } from '../inventario/motivos.ts';

/**
 * F-106 + F-631 · Recibir la nota del repartidor, con sus caducidades.
 *
 * ── Por qué no basta con `compras.registrar` ─────────────────────────────
 * Porque en abarrotes la caducidad va EN LA ENTRADA, no en el producto. La
 * compra ya sabe anotar `caduca_el` en su línea —lo guarda como referencia del
 * asiento—, pero eso no alimenta la lista de la mañana: la lista sale de
 * `caducidades`, que es la tabla que dice cuánto queda de cada fecha en cada
 * almacén. Sin este paso, capturar la caducidad en la entrada no sirve de nada
 * y a la semana nadie la captura.
 *
 * ── Y por qué es UN comando y no dos llamadas ────────────────────────────
 * Porque las dos escrituras tienen que caer o no caer juntas. Si la compra entra
 * y las caducidades no, el inventario sube y la lista de la mañana no ve la
 * leche que caduca el jueves. Y al revés es peor: caducidades de algo que no
 * entró.
 *
 * ── El asiento lo hace `registrarCompra` TAL CUAL ────────────────────────
 * No se reimplementa. La compra conoce el costo promedio ponderado, la creación
 * de insumos nuevos, la unidad base del giro y el movimiento de caja si fue de
 * contado. Copiar aquí la mitad de eso daría dos aritméticas de costo, y la de
 * este comando sería la que nadie revisa.
 *
 * ── Se captura de pie, con el repartidor esperando ───────────────────────
 * Por eso la caducidad es opcional POR LÍNEA: el pan no caduca y la leche sí, y
 * obligar a contestar la fecha de los doce renglones es lo que hace que se
 * conteste cualquier cosa. Lo que no trae fecha, no entra a la lista.
 */

const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

/**
 * El almacén principal de la sucursal de la SESIÓN.
 *
 * Aparte porque es lo que convierte «la pantalla tiene que saber en qué almacén
 * está» en «el servidor ya lo sabe»: el ámbito sale de la sesión, nunca de la
 * petición, y una pantalla que no puede contestarlo se quedaba en blanco.
 */
export async function almacenDeLaSesion(ctx: ContextoComando<Transaccion>): Promise<string> {
  const { organizacionId, sucursalId } = ctx.ambito;
  if (sucursalId === null) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'El material entra a un almacén, y el almacén es de una sucursal: esta sesión no tiene una.',
    );
  }
  const almacenId = await ctx.paso('resolver_almacen', () =>
    repoVentaCatalogo.almacenPrincipal(ctx.tx, organizacionId, sucursalId),
  );
  if (almacenId === null) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'Esta sucursal no tiene almacén dado de alta: el material no tiene dónde entrar.',
    );
  }
  return almacenId;
}

export const entradaRecibirNota = z.object({
  ...entradaRegistrarCompra.shape,
  /**
   * Dónde entró. Las caducidades son POR ALMACÉN: la trastienda y el anaquel.
   *
   * OPCIONAL: sin él, el principal de la sucursal de la sesión. La pantalla de
   * entradas de una tiendita no sabe en qué almacén está —ni tiene por qué
   * preguntarlo para recibir una nota— y obligarla a mandarlo la dejaba montada con
   * la cadena vacía, sin consultar nada y en blanco. El ámbito sale de la sesión.
   */
  almacenId: z.uuid().optional(),
  /**
   * EL CANJE EN LA MISMA NOTA (F-632, C.10 de la 2.4).
   *
   * «La nota de Bimbo es +18 piezas frescas, −6 piezas de canje. Dos movimientos, un
   * documento. Si se capturan por separado, uno de los dos se olvida» (`01-FUNCIONES` de
   * abarrotes §3.13). Lo que el repartidor se lleva sale del inventario como devolución al
   * proveedor, con su motivo, y lo que valía se le descuenta a la nota.
   */
  canjes: z
    .array(
      z.object({
        insumoId: z.uuid(),
        /** En unidad BASE: las piezas que se lleva. */
        cantidad: z.string().regex(/^\d{1,10}(?:\.\d{1,4})?$/, 'Usa hasta cuatro decimales.'),
        /** LA CLAVE de `motivos_merma`: casi siempre lo caducado. */
        motivo: z.string().trim().min(2).max(40).default('caducado'),
      }),
    )
    .max(100)
    .optional(),
});

export interface ResultadoRecepcion {
  readonly compraId: string;
  readonly totalCentavos: string;
  readonly lineas: number;
  /** Cuántas fechas entraron a la lista de la mañana. */
  readonly caducidadesRegistradas: number;
  /**
   * Las líneas que traían fecha pero cuyo insumo no tiene producto de venta.
   *
   * Se dicen y no se omiten: la caducidad cuelga del producto porque la lista de
   * la mañana enseña qué REMATAR, y un insumo que no se vende no se remata.
   */
  readonly sinProducto: number;
  /** Lo que el canje le descontó a la nota. */
  readonly canjeCentavos: string;
}

const ESCALA = 10_000n;

type Canjes = NonNullable<z.infer<typeof entradaRecibirNota>['canjes']>;

interface InsumoDelCanje {
  readonly unidad: string;
  /** El costo ANTES de esta nota: a eso se compró lo que se devuelve. */
  readonly costo: bigint;
}

/**
 * Lo que vale lo que se lleva el repartidor, leído ANTES de la compra: la compra recalcula
 * el costo promedio, y lo devuelto se compró al de antes. El precio lo pone el servidor; el
 * navegador sólo dice qué y cuánto.
 */
async function leerInsumosDelCanje(
  ctx: ContextoComando<Transaccion>,
  canjes: Canjes,
): Promise<ReadonlyMap<string, InsumoDelCanje>> {
  if (canjes.length === 0) return new Map();
  // Los motivos, ANTES de escribir nada: ni la compra ni el canje.
  for (const motivo of new Set(canjes.map((c) => c.motivo))) {
    await exigirMotivoDeMerma(ctx, motivo);
  }
  const filas = await ctx.paso('leer_insumos_del_canje', () =>
    ctx.tx
      .selectFrom('insumos')
      .select(['id', 'unidad_base', 'costo_unitario_centavos'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where(
        'id',
        'in',
        canjes.map((c) => c.insumoId),
      )
      .execute(),
  );
  const leidos = new Map(
    filas.map((f) => [f.id, { unidad: f.unidad_base, costo: f.costo_unitario_centavos }]),
  );
  if (canjes.some((c) => !leidos.has(c.insumoId))) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese artículo del canje no es de este negocio.');
  }
  return leidos;
}

/**
 * Lo que se lleva el repartidor, fuera del inventario y de la cuenta. Cada canje es un
 * movimiento `devolucion_proveedor` ligado a ESTA compra —el kardex dice de qué nota salió— y
 * la existencia no queda negativa: no se devuelve lo que no hay.
 */
async function aplicarCanjes(
  ctx: ContextoComando<Transaccion>,
  almacenId: string,
  compraId: string,
  canjes: Canjes,
  insumos: ReadonlyMap<string, InsumoDelCanje>,
): Promise<bigint> {
  const { organizacionId, empleoId } = ctx.ambito;
  let credito = 0n;
  for (const canje of canjes) {
    const insumo = insumos.get(canje.insumoId);
    if (insumo === undefined) continue;
    const unidad = insumo.unidad;
    await descontarExistencia(ctx, almacenId, canje.insumoId, `-${canje.cantidad}`);
    await ctx.paso('anotar_canje', () =>
      ctx.tx
        .insertInto('movimientos_stock')
        .values({
          organizacion_id: organizacionId,
          almacen_id: almacenId,
          insumo_id: canje.insumoId,
          tipo: 'devolucion_proveedor',
          cantidad: `-${canje.cantidad}`,
          unidad,
          costo_unitario_centavos: insumo.costo,
          referencia_tipo: 'compra',
          referencia_id: compraId,
          motivo: canje.motivo,
          nota: 'canje en la nota del proveedor',
          empleado_id: empleoId,
        })
        .execute(),
    );
    credito += (insumo.costo * aEscala(canje.cantidad)) / ESCALA;
  }
  return credito;
}

export const recibirNota = definirComando<
  Transaccion,
  typeof entradaRecibirNota,
  ResultadoRecepcion
>({
  nombre: 'compras.recibir_nota',
  entidad: 'compra',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaRecibirNota,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const almacenId = entrada.almacenId ?? (await almacenDeLaSesion(ctx));
    const almacen = await ctx.paso('leer_almacen', () =>
      ctx.tx
        .selectFrom('almacenes')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', almacenId)
        .executeTakeFirst(),
    );
    if (almacen === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese almacén no existe en este negocio.');
    }

    // El asiento entero, tal cual. Copiar aquí el costo promedio ponderado daría
    // dos aritméticas de costo, y la de este comando sería la que nadie revisa.
    const canjes = entrada.canjes ?? [];
    const insumosDelCanje = await leerInsumosDelCanje(ctx, canjes);

    const compra = await registrarCompra.ejecutar(ctx, entrada);

    // El canje, en la MISMA transacción: lo que se lleva sale del inventario y de la cuenta.
    const canje = await aplicarCanjes(ctx, almacenId, compra.compraId, canjes, insumosDelCanje);
    const bruto = BigInt(compra.totalCentavos);
    const total = canje > bruto ? 0n : bruto - canje;
    if (canje > 0n) {
      await ctx.paso('descontar_canje', () =>
        ctx.tx
          .updateTable('compras')
          .set({ total_centavos: total })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', compra.compraId)
          .execute(),
      );
    }

    // Sólo las que TRAEN fecha. El pan no caduca y obligar a contestar los doce
    // renglones es lo que hace que se conteste cualquier cosa.
    const conFecha = entrada.lineas.filter(
      (linea): linea is typeof linea & { caducaEl: string; insumoId: string } =>
        linea.caducaEl !== undefined && linea.insumoId !== undefined,
    );
    if (conFecha.length === 0) {
      return {
        compraId: compra.compraId,
        totalCentavos: total.toString(),
        lineas: compra.lineas,
        caducidadesRegistradas: 0,
        sinProducto: 0,
        canjeCentavos: canje.toString(),
      };
    }

    // La caducidad cuelga del PRODUCTO, no del insumo: la lista de la mañana
    // enseña qué rematar, y rematar es vender. El puente es `insumo_base_id`,
    // el mismo que usa el resto del sistema.
    const productos = await ctx.paso('leer_productos', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'insumo_base_id'])
        .where('organizacion_id', '=', organizacionId)
        .where(
          'insumo_base_id',
          'in',
          conFecha.map((l) => l.insumoId),
        )
        .execute(),
    );
    const productoPorInsumo = new Map<string, string>();
    for (const producto of productos) {
      if (producto.insumo_base_id !== null) {
        productoPorInsumo.set(producto.insumo_base_id, producto.id);
      }
    }

    let registradas = 0;
    let sinProducto = 0;

    for (const linea of conFecha) {
      const productoId = productoPorInsumo.get(linea.insumoId);
      if (productoId === undefined) {
        sinProducto += 1;
        continue;
      }

      // En unidad BASE: la línea se capturó en cajas y la existencia vive en
      // piezas. `equivalencia` es cuántas unidades base trae la unidad de
      // compra, y es el mismo factor que usó el asiento.
      const enBase = (aEscala(linea.cantidadCapturada) * aEscala(linea.equivalencia)) / ESCALA;

      const existente = await ctx.paso('buscar_caducidad', () =>
        ctx.tx
          .selectFrom('caducidades')
          .select(['id', 'cantidad'])
          .where('organizacion_id', '=', organizacionId)
          .where('almacen_id', '=', almacenId)
          .where('producto_id', '=', productoId)
          .where('caduca_el', '=', linea.caducaEl)
          .executeTakeFirst(),
      );

      // La segunda caja del mismo lote suma a la fila que ya hay: dos filas
      // hermanas dejarían a alguien decidiendo cuál rematar primero, y las dos
      // caducan el mismo día.
      if (existente !== undefined) {
        await ctx.paso('sumar_caducidad', () =>
          ctx.tx
            .updateTable('caducidades')
            .set({ cantidad: deEscala(aEscala(existente.cantidad) + enBase) })
            .where('organizacion_id', '=', organizacionId)
            .where('id', '=', existente.id)
            .execute(),
        );
      } else {
        await ctx.paso('registrar_caducidad', () =>
          ctx.tx
            .insertInto('caducidades')
            .values({
              organizacion_id: organizacionId,
              almacen_id: almacenId,
              producto_id: productoId,
              caduca_el: linea.caducaEl,
              cantidad: deEscala(enBase),
              compra_id: compra.compraId,
              registrada_en: ctx.ahora,
              registrada_por: empleoId,
            })
            .execute(),
        );
      }
      registradas += 1;
    }

    ctx.auditar({
      entidadId: compra.compraId,
      payload: { caducidades: registradas, sinProducto },
    });
    return {
      compraId: compra.compraId,
      totalCentavos: total.toString(),
      lineas: compra.lineas,
      caducidadesRegistradas: registradas,
      sinProducto,
      canjeCentavos: canje.toString(),
    };
  },
});

function aEscala(valor: string): bigint {
  const [entero = '0', decimal = ''] = valor.trim().split('.');
  return BigInt(entero) * ESCALA + BigInt(decimal.padEnd(4, '0').slice(0, 4));
}

function deEscala(valor: bigint): string {
  const entero = valor / ESCALA;
  const resto = (valor % ESCALA).toString().padStart(4, '0');
  return `${entero}.${resto}`;
}
