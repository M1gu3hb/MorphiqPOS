import {
  esCodigoInterno,
  interpretarCodigoInterno,
  type LayoutEanInterno,
} from '@morphiqpos/domain/catalogo';

import {
  diezmilesimas,
  porCantidad,
  textoDeDiezmilesimas,
  type PresentacionDeCobro,
  type ProductoDeCobro,
} from './lineas.ts';

/**
 * Qué es lo que cantó el lector: un producto, una presentación, una pesada de la báscula,
 * o nada del catálogo.
 *
 * ── El orden importa ──────────────────────────────────────────────────────
 * Primero el catálogo TAL CUAL: hay códigos de fábrica que empiezan por 2 —producto
 * importado— y tienen que seguir encontrándose como lo que son. Sólo lo que el catálogo no
 * conoce se interpreta como etiqueta de báscula, y sólo si el negocio declaró cómo la
 * etiqueta su báscula: sin ese dato, leer el importe como peso cobraría una cosa por otra
 * y nada fallaría (`codigo-barras.ts` del dominio).
 */

export interface Catalogo {
  readonly porCodigo: ReadonlyMap<string, ProductoDeCobro>;
  readonly porId: ReadonlyMap<string, ProductoDeCobro>;
  readonly presentacionesPorCodigo: ReadonlyMap<string, PresentacionDeCobro>;
}

export type Escaneo =
  | { readonly tipo: 'producto'; readonly producto: ProductoDeCobro }
  | {
      readonly tipo: 'presentacion';
      readonly producto: ProductoDeCobro;
      readonly presentacion: PresentacionDeCobro;
    }
  | {
      readonly tipo: 'pesada';
      readonly producto: ProductoDeCobro;
      readonly cantidad: string;
      readonly unidad: string;
    }
  | { readonly tipo: 'malLeido'; readonly codigo: string; readonly motivo: string }
  | { readonly tipo: 'desconocido'; readonly codigo: string };

/** El artículo de la etiqueta contra el catálogo: igual, o igual sin ceros a la izquierda. */
function productoDelArticulo(catalogo: Catalogo, articulo: string): ProductoDeCobro | undefined {
  const exacto = catalogo.porCodigo.get(articulo);
  if (exacto !== undefined) return exacto;
  const sinCeros = articulo.replace(/^0+/, '');
  for (const producto of catalogo.porId.values()) {
    if (producto.unidadDeMedida === null || producto.codigoBarras === null) continue;
    if (producto.codigoBarras.replace(/^0+/, '') === sinCeros) return producto;
  }
  return undefined;
}

/** De kilos (la etiqueta) a la unidad en que el producto tiene su precio. */
function enSuUnidad(kilos: string, unidad: string): string | null {
  if (unidad === 'kg') return textoDeDiezmilesimas(diezmilesimas(kilos));
  if (unidad === 'g') return textoDeDiezmilesimas(diezmilesimas(kilos) * 1000n);
  return null;
}

/**
 * La cantidad que, a este precio, da EXACTAMENTE el importe impreso en la etiqueta. El
 * servidor cobra precio × cantidad; si el importe no sale exacto con ninguna diezmilésima,
 * se toma la más cercana y la diferencia no pasa de un centavo.
 */
export function cantidadDelImporte(importeCentavos: number, precioCentavos: number): string {
  if (precioCentavos <= 0) throw new Error('Un producto sin precio no se vende por importe.');
  const ideal = (BigInt(importeCentavos) * 10_000n) / BigInt(precioCentavos);
  const candidatos = [ideal, ideal + 1n, ideal - 1n].filter((c) => c > 0n);
  const exacta = candidatos.find(
    (c) => porCantidad(precioCentavos, textoDeDiezmilesimas(c)) === importeCentavos,
  );
  return textoDeDiezmilesimas(exacta ?? ideal);
}

export function resolverCodigo(
  codigo: string,
  catalogo: Catalogo,
  bascula: LayoutEanInterno | null,
): Escaneo {
  const producto = catalogo.porCodigo.get(codigo);
  if (producto !== undefined) return { tipo: 'producto', producto };

  const presentacion = catalogo.presentacionesPorCodigo.get(codigo);
  if (presentacion !== undefined) {
    const suyo = catalogo.porId.get(presentacion.productoId);
    if (suyo !== undefined) return { tipo: 'presentacion', producto: suyo, presentacion };
  }

  if (bascula === null || !esCodigoInterno(codigo, bascula)) return { tipo: 'desconocido', codigo };

  let leido: ReturnType<typeof interpretarCodigoInterno>;
  try {
    leido = interpretarCodigoInterno(codigo, bascula);
  } catch (fallo: unknown) {
    return {
      tipo: 'malLeido',
      codigo,
      motivo: fallo instanceof Error ? fallo.message : 'La etiqueta no se pudo leer.',
    };
  }

  const pesado = productoDelArticulo(catalogo, leido.codigoArticulo);
  if (pesado?.unidadDeMedida === undefined || pesado.unidadDeMedida === null) {
    return { tipo: 'desconocido', codigo };
  }
  if (leido.contenido === 'importe') {
    const importe = Number(leido.importeCentavos ?? 0n);
    return {
      tipo: 'pesada',
      producto: pesado,
      cantidad: cantidadDelImporte(importe, pesado.precioCentavos),
      unidad: pesado.unidadDeMedida,
    };
  }
  const cantidad = enSuUnidad(leido.valor, pesado.unidadDeMedida);
  if (cantidad === null) {
    return {
      tipo: 'malLeido',
      codigo,
      motivo: `${pesado.nombre} se vende por ${pesado.unidadDeMedida}, y la báscula etiqueta kilos.`,
    };
  }
  return { tipo: 'pesada', producto: pesado, cantidad, unidad: pesado.unidadDeMedida };
}

/**
 * La báscula como la declaró el negocio (`bascula_etiqueta`), o nula si no la declaró o si
 * lo guardado no tiene la forma de un layout: mejor no interpretar que interpretar mal.
 */
export function layoutDeLaConfiguracion(valor: unknown): LayoutEanInterno | null {
  if (typeof valor !== 'object' || valor === null) return null;
  const v = valor as Record<string, unknown>;
  const prefijos = v['prefijos'];
  const entero = (x: unknown, min: number, max: number): x is number =>
    typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
  if (
    !Array.isArray(prefijos) ||
    prefijos.length === 0 ||
    !prefijos.every((p) => typeof p === 'string' && /^2\d?$/.test(p)) ||
    !entero(v['digitosArticulo'], 1, 10) ||
    !entero(v['digitosValor'], 1, 10) ||
    !entero(v['decimales'], 0, 4) ||
    (v['contenido'] !== 'peso' && v['contenido'] !== 'importe') ||
    typeof v['verificadorInterno'] !== 'boolean'
  ) {
    return null;
  }
  return {
    prefijos: prefijos as string[],
    digitosArticulo: v['digitosArticulo'],
    digitosValor: v['digitosValor'],
    decimales: v['decimales'],
    contenido: v['contenido'],
    verificadorInterno: v['verificadorInterno'],
  };
}
