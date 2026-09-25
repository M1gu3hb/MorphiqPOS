import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-631 · La nota del proveedor, capturada sin teclear cien renglones.
 *
 * ── Por qué esto existe ──────────────────────────────────────────────────
 * Una entrada de ferretería trae entre cuarenta y doscientos renglones, y lo
 * que llega es una hoja impresa con las claves DEL PROVEEDOR, que no son las
 * del negocio. Capturarla a mano cuesta dos horas, así que no se captura: el
 * material entra al anaquel y el inventario se entera tres meses después, en la
 * toma anual. Ésa es la razón real por la que el inventario de una ferretería
 * no sirve.
 *
 * ── Y por qué NO aplica nada ─────────────────────────────────────────────
 * Esto PROPONE. Devuelve qué renglón casó con qué clave, con qué confianza y
 * cuáles no casaron, y alguien confirma. Aplicar automáticamente una entrada de
 * doscientos renglones con emparejamiento aproximado es meter material en
 * claves equivocadas a una escala que después nadie desenreda: el error se
 * reparte por todo el catálogo y el conteo siguiente no lo puede aislar.
 *
 * ── El emparejamiento va por tres caminos, en orden ──────────────────────
 * 1 · La clave del proveedor, si ya se vio antes. Es exacta y es la única que
 *     no se equivoca nunca.
 * 2 · El código de barras del renglón, cuando la nota lo trae.
 * 3 · El nombre, normalizado. Éste es el que se equivoca, y por eso es el único
 *     que sale marcado como dudoso.
 *
 * Sin el orden, el nombre gana a la clave y «TORNILLO 1/4» acaba emparejado con
 * el de 1/4 de OTRA línea.
 */

const COMPRAS = ['gerente', 'administrador', 'dueno'] as const;

/** Menos que esto son dos palabras sueltas coincidiendo: no es un empate. */
const MINIMO_DE_PARECIDO = 0.6;

/**
 * Cuántas compras atrás se mira para recordar las claves.
 *
 * Doscientas son más de un año de entradas del mismo proveedor. Mirar el
 * histórico entero haría que la importación tardara más cuanto más viejo fuera
 * el negocio, que es justo al revés de como tiene que envejecer esto.
 */
const MEMORIA_DE_COMPRAS = 200;

export const entradaImportarNota = z.object({
  proveedorId: z.uuid(),
  folioProveedor: z.string().trim().min(1).max(40),
  renglones: z
    .array(
      z.object({
        /** La clave DEL PROVEEDOR, tal cual viene en su hoja. */
        claveProveedor: z.string().trim().max(60).nullable().default(null),
        codigoBarras: z.string().trim().max(40).nullable().default(null),
        descripcion: z.string().trim().min(1).max(200),
        cantidad: z.string().regex(/^\d{1,10}(\.\d{1,4})?$/, 'Cantidad con 4 decimales.'),
        costoUnitarioCentavos: z.number().int().min(0).max(100_000_000),
      }),
    )
    .min(1)
    .max(400),
});

export interface RenglonEmparejado {
  readonly indice: number;
  readonly descripcion: string;
  readonly cantidad: string;
  readonly costoUnitarioCentavos: string;
  /** `null` cuando no casó con nada: hay que darlo de alta o elegirlo a mano. */
  readonly productoId: string | null;
  /**
   * El insumo que lleva la existencia de ese producto: es A LO QUE ENTRA la nota
   * (`compras.recibir_entrada` recibe insumos). `null` si no casó, o si casó con un
   * producto que no lleva existencia —un servicio—, que tampoco puede recibirse.
   */
  readonly insumoId: string | null;
  /**
   * La presentación en que se le compra ese insumo —«caja»— y cuántas unidades
   * base trae UNA. Sin ella «3» no dice si entraron 3 piezas o 3 cajas de 100. Si
   * el insumo no tiene presentación de compra, su unidad base y «1».
   */
  readonly unidadCompra: string | null;
  readonly equivalencia: string | null;
  /** `clave` · `codigo` · `nombre` · `ninguno`. Dice POR QUÉ casó. */
  readonly porQue: string;
  /** `true` sólo cuando casó por nombre: es el único camino que se equivoca. */
  readonly dudoso: boolean;
  /** El nombre EN EL CATÁLOGO: lo que casó por nombre se revisa contra esto. */
  readonly productoNombre: string | null;
  /**
   * Cuánto se movió el costo POR UNIDAD BASE contra el del insumo, en puntos base.
   * La hoja cobra por caja y el insumo cuesta por pieza: se comparan por pieza.
   */
  readonly variacionCostoBp: number | null;
  /** El costo por unidad base: el de hoy y el de esta nota. En centavos. */
  readonly costoAnteriorCentavos: string | null;
  readonly costoNuevoCentavos: string | null;
  /** El precio de venta de hoy y, si subió el costo, el que conserva el margen. */
  readonly precioVentaCentavos: string | null;
  readonly precioSugeridoCentavos: string | null;
}

export interface ResultadoImportacion {
  readonly proveedorId: string;
  readonly folioProveedor: string;
  readonly renglones: readonly RenglonEmparejado[];
  readonly emparejados: number;
  readonly dudosos: number;
  readonly sinEmparejar: number;
  readonly totalCentavos: string;
  /** Lo que sube de costo más de la cuenta. Es lo que hay que mirar primero. */
  readonly subidasFuertes: number;
}

/** Una subida de más del 20 % casi nunca es el mercado: es un renglón mal casado. */
const SUBIDA_FUERTE_BP = 2_000;

export const importarNotaDeProveedor = definirComando<
  Transaccion,
  typeof entradaImportarNota,
  ResultadoImportacion
>({
  nombre: 'compras.importar_nota',
  entidad: 'compra',
  escribe: false,
  roles: [...COMPRAS],
  paquetes: PAQUETES_TODOS,
  entrada: entradaImportarNota,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const proveedor = await ctx.paso('leer_proveedor', () =>
      ctx.tx
        .selectFrom('proveedores')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.proveedorId)
        .executeTakeFirst(),
    );
    if (proveedor === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese proveedor no existe en este negocio.');
    }

    // El catálogo entero de una vez. Doscientos renglones contra una consulta
    // cada uno son doscientos viajes a la base dentro de la misma transacción,
    // y ahí es donde una importación deja de caber en el tiempo de espera.
    const catalogo = await ctx.paso('leer_catalogo', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre', 'sku', 'codigo_barras', 'precio_venta_centavos', 'insumo_base_id'])
        .where('organizacion_id', '=', organizacionId)
        .where('activo', '=', true)
        .execute(),
    );

    // EL INSUMO DE CADA PRODUCTO: el que lleva su existencia y al que entra la nota.
    // Manda la liga de reventa (`insumos.producto_id`, la del alta y la de la venta) y,
    // sin ella, la de consumo (`insumo_base_id`). Se leen todas las del negocio de una
    // vez: el catálogo de una ferretería no cabe en un `in (...)`.
    const ligas = await ctx.paso('leer_ligas', () =>
      ctx.tx
        .selectFrom('insumos')
        .select(['id', 'producto_id'])
        .where('organizacion_id', '=', organizacionId)
        .where('producto_id', 'is not', null)
        .execute(),
    );
    const deReventa = new Map<string, string>();
    for (const liga of ligas)
      if (liga.producto_id !== null) deReventa.set(liga.producto_id, liga.id);
    const insumoDe = (producto: (typeof catalogo)[number]): string | null =>
      deReventa.get(producto.id) ?? producto.insumo_base_id;

    const porCodigo = new Map<string, (typeof catalogo)[number]>();
    // La memoria de claves guarda INSUMOS (es lo que entra en `compra_lineas`); de
    // vuelta al producto se llega por su insumo. Antes se devolvía el insumo como si
    // fuera el producto, y la pantalla no podía distinguirlos.
    const productoPorInsumo = new Map<string, (typeof catalogo)[number]>();
    for (const producto of catalogo) {
      const insumo = insumoDe(producto);
      if (insumo !== null) productoPorInsumo.set(insumo, producto);
      if (producto.codigo_barras !== null) porCodigo.set(producto.codigo_barras, producto);
      // El SKU interno entra al mismo mapa: media ferretería se escanea por el
      // código que imprimió el negocio, y la hoja del proveedor a veces lo trae
      // copiado del pedido que se le mandó.
      if (producto.sku !== null) porCodigo.set(producto.sku, producto);
    }

    // Lo que ya se emparejó antes con este proveedor. Es el camino exacto, y el
    // único que mejora con el uso: la segunda nota del mismo proveedor casa
    // sola.
    const compras = await ctx.paso('leer_compras', () =>
      ctx.tx
        .selectFrom('compras')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('proveedor_id', '=', entrada.proveedorId)
        .orderBy('created_at', 'desc')
        .limit(MEMORIA_DE_COMPRAS)
        .execute(),
    );
    const historico =
      compras.length === 0
        ? []
        : await ctx.paso('leer_historico', () =>
            ctx.tx
              .selectFrom('compra_lineas')
              .select(['insumo_id', 'clave_proveedor'])
              .where('organizacion_id', '=', organizacionId)
              .where(
                'compra_id',
                'in',
                compras.map((c) => c.id),
              )
              .where('clave_proveedor', 'is not', null)
              .execute(),
          );
    const porClave = new Map<string, string>();
    for (const linea of historico) {
      const clave = linea.clave_proveedor;
      if (clave !== null && clave !== undefined) porClave.set(clave, linea.insumo_id);
    }

    const normalizados = catalogo.map((p) => ({ producto: p, tokens: aTokens(p.nombre) }));

    let emparejados = 0;
    let dudosos = 0;
    let total = 0n;

    const emparejadosSinPresentacion = entrada.renglones.map((renglon, indice) => {
      total += importeDelRenglon(renglon.costoUnitarioCentavos, renglon.cantidad);

      // 1 · La clave del proveedor. Exacta, y la única que no se equivoca.
      const porHistorico =
        renglon.claveProveedor === null ? undefined : porClave.get(renglon.claveProveedor);
      if (porHistorico !== undefined) {
        emparejados += 1;
        const producto = productoPorInsumo.get(porHistorico);
        return renglonDe(indice, renglon, {
          productoId: producto?.id ?? null,
          productoNombre: producto?.nombre ?? null,
          insumoId: porHistorico,
          porQue: 'clave',
          dudoso: false,
        });
      }

      // 2 · El código de barras, cuando la nota lo trae.
      const porBarras =
        renglon.codigoBarras === null ? undefined : porCodigo.get(renglon.codigoBarras);
      if (porBarras !== undefined) {
        emparejados += 1;
        return renglonDe(indice, renglon, {
          productoId: porBarras.id,
          productoNombre: porBarras.nombre,
          insumoId: insumoDe(porBarras),
          porQue: 'codigo',
          dudoso: false,
        });
      }

      // 3 · El nombre. Éste SÍ se equivoca, y por eso sale marcado.
      const tokens = aTokens(renglon.descripcion);
      let mejor: { producto: (typeof catalogo)[number]; parecido: number } | null = null;
      for (const candidato of normalizados) {
        const parecido = seParecen(tokens, candidato.tokens);
        if (parecido >= MINIMO_DE_PARECIDO && (mejor === null || parecido > mejor.parecido)) {
          mejor = { producto: candidato.producto, parecido };
        }
      }
      if (mejor !== null) {
        emparejados += 1;
        dudosos += 1;
        return renglonDe(indice, renglon, {
          productoId: mejor.producto.id,
          productoNombre: mejor.producto.nombre,
          insumoId: insumoDe(mejor.producto),
          porQue: 'nombre',
          dudoso: true,
        });
      }

      return renglonDe(indice, renglon, {
        productoId: null,
        productoNombre: null,
        insumoId: null,
        porQue: 'ninguno',
        dudoso: false,
      });
    });

    // La presentación de compra de cada insumo, en UNA consulta.
    const idsDeInsumo = [
      ...new Set(
        emparejadosSinPresentacion.flatMap((r) => (r.insumoId === null ? [] : [r.insumoId])),
      ),
    ];
    const presentaciones =
      idsDeInsumo.length === 0
        ? []
        : await ctx.paso('leer_presentaciones', () =>
            ctx.tx
              .selectFrom('insumos')
              .select([
                'id',
                'unidad_base',
                'unidad_compra_default',
                'cantidad_por_compra_default',
                'costo_unitario_centavos',
              ])
              .where('organizacion_id', '=', organizacionId)
              .where('id', 'in', idsDeInsumo)
              .execute(),
          );
    const presentacionDe = new Map(presentaciones.map((i) => [i.id, i]));
    const precioDe = new Map(catalogo.map((p) => [p.id, p.precio_venta_centavos]));
    let subidasFuertes = 0;
    const renglones: RenglonEmparejado[] = emparejadosSinPresentacion.map((renglon) => {
      const insumo = renglon.insumoId === null ? undefined : presentacionDe.get(renglon.insumoId);
      // Un insumo que no es de este negocio no se recibe: queda sin emparejar.
      if (renglon.insumoId !== null && insumo === undefined) return { ...renglon, insumoId: null };
      if (insumo === undefined) return renglon;
      const conPresentacion =
        insumo.unidad_compra_default !== null && insumo.cantidad_por_compra_default !== null;
      const equivalencia = conPresentacion ? (insumo.cantidad_por_compra_default ?? '1') : '1';
      const costo = costoPorUnidadBase(
        insumo.costo_unitario_centavos,
        Number(renglon.costoUnitarioCentavos),
        equivalencia,
      );
      if (costo.variacionBp !== null && costo.variacionBp > SUBIDA_FUERTE_BP) subidasFuertes += 1;
      const precio = renglon.productoId === null ? undefined : precioDe.get(renglon.productoId);
      return {
        ...renglon,
        unidadCompra: conPresentacion ? insumo.unidad_compra_default : insumo.unidad_base,
        equivalencia,
        variacionCostoBp: costo.variacionBp,
        costoAnteriorCentavos: costo.anterior,
        costoNuevoCentavos: costo.nuevo,
        precioVentaCentavos: precio === undefined ? null : precio.toString(),
        precioSugeridoCentavos:
          precio === undefined || costo.variacionBp === null || costo.variacionBp <= 0
            ? null
            : precioConElMismoMargen(precio, insumo.costo_unitario_centavos, costo.nuevoExacto),
      };
    });

    return {
      proveedorId: entrada.proveedorId,
      folioProveedor: entrada.folioProveedor,
      renglones,
      emparejados,
      dudosos,
      // Los que no casaron se cuentan y se devuelven: una importación que
      // silencia los quince renglones que no reconoció es peor que no importar,
      // porque nadie va a volver a mirarlos.
      sinEmparejar: entrada.renglones.length - emparejados,
      totalCentavos: total.toString(),
      subidasFuertes,
    };
  },
});

function renglonDe(
  indice: number,
  renglon: {
    readonly descripcion: string;
    readonly cantidad: string;
    readonly costoUnitarioCentavos: number;
  },
  emparejado: Pick<
    RenglonEmparejado,
    'productoId' | 'productoNombre' | 'insumoId' | 'porQue' | 'dudoso'
  >,
): RenglonEmparejado {
  return {
    indice,
    descripcion: renglon.descripcion,
    cantidad: renglon.cantidad,
    costoUnitarioCentavos: renglon.costoUnitarioCentavos.toString(),
    unidadCompra: null,
    equivalencia: null,
    variacionCostoBp: null,
    costoAnteriorCentavos: null,
    costoNuevoCentavos: null,
    precioVentaCentavos: null,
    precioSugeridoCentavos: null,
    ...emparejado,
  };
}

/**
 * Costo unitario × cantidad, al centavo y medio hacia arriba.
 *
 * La cantidad trae hasta cuatro decimales («12.5» metros de cable): antes se
 * redondeaba a entero y 12.5 m se cobraban como 13. Aquí va en diezmilésimas y
 * con enteros, sin flotantes.
 */
export function importeDelRenglon(costoUnitarioCentavos: number, cantidad: string): bigint {
  const [enteros = '0', decimales = ''] = cantidad.split('.');
  const diezmilesimas = BigInt(enteros) * 10_000n + BigInt(decimales.padEnd(4, '0'));
  return (BigInt(costoUnitarioCentavos) * diezmilesimas + 5_000n) / 10_000n;
}

/** «12.5» → 125000 diezmilésimas, con enteros. */
function diezmilesimasDe(cantidad: string): bigint {
  const [enteros = '0', decimales = ''] = cantidad.split('.');
  return BigInt(enteros) * 10_000n + BigInt(decimales.padEnd(4, '0').slice(0, 4));
}

/**
 * El costo del renglón POR UNIDAD BASE contra el último conocido del insumo.
 *
 * La hoja del proveedor cobra por SU presentación —la caja de 100— y el costo del
 * insumo es por pieza. Antes se comparaban tal cual: toda caja salía como «subida
 * fuerte» de miles por ciento y el aviso dejaba de servir. Enteros, sin flotantes.
 */
export function costoPorUnidadBase(
  anterior: bigint,
  costoUnitarioCentavos: number,
  equivalencia: string,
): {
  readonly variacionBp: number | null;
  readonly anterior: string | null;
  readonly nuevo: string;
  /** El costo nuevo por unidad base, en diezmilésimas de centavo: para el precio. */
  readonly nuevoExacto: bigint;
} {
  const equiv = diezmilesimasDe(equivalencia);
  const nuevoExacto = equiv === 0n ? 0n : (BigInt(costoUnitarioCentavos) * 100_000_000n) / equiv;
  const nuevo = ((nuevoExacto + 5_000n) / 10_000n).toString();
  if (anterior <= 0n || equiv === 0n) {
    return {
      variacionBp: null,
      anterior: anterior > 0n ? anterior.toString() : null,
      nuevo,
      nuevoExacto,
    };
  }
  const variacionBp = Number((nuevoExacto - anterior * 10_000n) / anterior);
  return { variacionBp, anterior: anterior.toString(), nuevo, nuevoExacto };
}

/**
 * El precio que conserva el margen de hoy con el costo nuevo, al centavo: precio ×
 * costo nuevo ÷ costo anterior. Lo calcula el servidor para que la pantalla sólo lo
 * devuelva a `catalogo.aplicar_precio_sugerido` tal cual.
 */
export function precioConElMismoMargen(
  precio: bigint,
  anterior: bigint,
  nuevoExacto: bigint,
): string {
  const divisor = anterior * 10_000n;
  return ((precio * nuevoExacto + divisor / 2n) / divisor).toString();
}

/**
 * El nombre, partido en palabras comparables.
 *
 * Sin acentos y sin las palabras de una letra: «TORNILLO 1/4 X 2 GALV» y
 * «Tornillo 1/4x2 galvanizado» son el mismo tornillo y tienen que parecerlo.
 */
function aTokens(texto: string): ReadonlySet<string> {
  return new Set(
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9/]+/)
      .filter((t) => t.length > 1),
  );
}

/**
 * Cuánto se parecen dos nombres, entre 0 y 1.
 *
 * Es Jaccard y no una distancia de edición: lo que cambia entre la hoja del
 * proveedor y el catálogo es el ORDEN y las abreviaturas, no las letras. Con
 * distancia de edición, «galv» y «galvanizado» quedarían lejísimos.
 */
function seParecen(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let comunes = 0;
  for (const token of a) if (b.has(token)) comunes += 1;
  return comunes / (a.size + b.size - comunes);
}
