import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-058 · La etiqueta, que aquí no es comodidad sino requisito de operación.
 *
 * ── Por qué en una ferretería esto cambia de categoría ───────────────────
 * En abarrotes casi todo trae código de barras de fábrica y la etiqueta sirve
 * para re-etiquetar precios. Aquí la mitad del catálogo —tornillería a granel,
 * conexiones, piezas sueltas— NO TRAE CÓDIGO. Sin una etiqueta impresa por el
 * negocio, esa mitad jamás se puede escanear: ni en la venta ni en el conteo.
 * Es la diferencia entre «útil» y «sin esto no opera».
 *
 * ── Y hay DOS etiquetas, no una ─────────────────────────────────────────
 * La de anaquel la lee el cliente a 30 cm: precio grande. La de GAVETA la lee
 * el empleado desde un metro, buscando en un rack de sesenta: lleva el SKU, la
 * medida y LA UBICACIÓN, y va más grande. Imprimir la misma para las dos deja
 * una ilegible a un metro y otra desperdiciando papel a treinta centímetros.
 *
 * ── Esto NO genera un PDF ────────────────────────────────────────────────
 * Devuelve los RENGLONES de cada etiqueta. El papel lo compone el navegador,
 * que es quien sabe el tamaño de hoja que hay puesto. Armar el binario en el
 * servidor obligaría a redesplegarlo para cambiar de hoja de 24 a hoja de 30.
 */

const MOSTRADOR = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

/** Lo que cabe en una etiqueta de gaveta sin dejar de leerse a un metro. */
const MAXIMO_DE_ATRIBUTOS = 3;

export const entradaEtiquetas = z.object({
  productoIds: z.array(z.uuid()).min(1).max(200),
  /** `anaquel` la lee el cliente a 30 cm; `gaveta` el empleado a un metro. */
  formato: z.enum(['anaquel', 'gaveta']).default('anaquel'),
  /** Cuántas de cada una. Una gaveta necesita una; un anaquel, las que quepan. */
  copias: z.number().int().min(1).max(50).default(1),
});

export interface EtiquetaImpresa {
  readonly productoId: string;
  /**
   * El código a imprimir: el de fábrica si lo hay, o el SKU interno.
   *
   * `null` cuando la pieza no tiene ninguno de los dos, y es información: esa
   * clave no se puede escanear en ningún sitio hasta que alguien le ponga uno.
   */
  readonly codigo: string | null;
  /** `true` cuando el código lo puso el negocio porque la pieza no traía. */
  readonly codigoInterno: boolean;
  readonly nombre: string;
  readonly precioCentavos: string;
  /** Sólo en formato `gaveta`: es la mitad de por qué existe esa etiqueta. */
  readonly ubicacion: string | null;
  /** Las medidas que distinguen esta pieza de su vecina de gaveta. */
  readonly atributos: readonly { readonly etiqueta: string; readonly valor: string }[];
  readonly copias: number;
}

export interface ResultadoEtiquetas {
  readonly formato: string;
  readonly etiquetas: readonly EtiquetaImpresa[];
  /** Cuántos de los pedidos no existen. Se dicen, no se omiten en silencio. */
  readonly noEncontrados: number;
}

export const etiquetasDeProducto = definirComando<
  Transaccion,
  typeof entradaEtiquetas,
  ResultadoEtiquetas
>({
  nombre: 'catalogo.etiquetas',
  entidad: 'producto',
  escribe: false,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaEtiquetas,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const productos = await ctx.paso('leer_productos', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre', 'sku', 'codigo_barras', 'precio_venta_centavos', 'ubicacion_id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', 'in', entrada.productoIds)
        .execute(),
    );
    if (productos.length === 0) {
      throw new ErrorDominio(
        'PRODUCTO_NO_ENCONTRADO',
        'Ninguna de esas piezas existe en este negocio.',
      );
    }

    const esGaveta = entrada.formato === 'gaveta';

    // La ubicación SÓLO se lee para la etiqueta de gaveta. En la de anaquel no
    // cabe y no le sirve a nadie: el cliente no va a la bodega.
    const ubicacionIds = esGaveta
      ? [...new Set(productos.map((p) => p.ubicacion_id).filter(esTexto))]
      : [];
    const ubicaciones =
      ubicacionIds.length === 0
        ? []
        : await ctx.paso('leer_ubicaciones', () =>
            ctx.tx
              .selectFrom('ubicaciones')
              .select(['id', 'codigo'])
              .where('organizacion_id', '=', organizacionId)
              .where('id', 'in', ubicacionIds)
              .execute(),
          );
    const codigoDeUbicacion = new Map(ubicaciones.map((u) => [u.id, u.codigo]));

    const atributos = await ctx.paso('leer_atributos', () =>
      ctx.tx
        .selectFrom('producto_atributos')
        .select(['producto_id', 'clave', 'valor_original'])
        .where('organizacion_id', '=', organizacionId)
        .where(
          'producto_id',
          'in',
          productos.map((p) => p.id),
        )
        .execute(),
    );
    const atributosPorProducto = new Map<string, { etiqueta: string; valor: string }[]>();
    for (const atributo of atributos) {
      const lista = atributosPorProducto.get(atributo.producto_id) ?? [];
      // Se imprime `valor_original` y no el normalizado: el mostradorista busca
      // `1/4` y espera ver `1/4"`. Reconstruir la fracción desde 6350 µm es
      // ambiguo, y una etiqueta que dice 6,35 mm no la lee nadie.
      lista.push({ etiqueta: atributo.clave, valor: atributo.valor_original });
      atributosPorProducto.set(atributo.producto_id, lista);
    }

    const etiquetas: EtiquetaImpresa[] = productos.map((producto) => {
      // El de fábrica si lo hay. Si no, el SKU interno, que es la única forma de
      // escanear media ferretería — y la etiqueta dice cuál de los dos es, o
      // nadie sabe por qué ese código no aparece en el catálogo del proveedor.
      const codigoInterno = producto.codigo_barras === null && producto.sku !== null;
      return {
        productoId: producto.id,
        codigo: producto.codigo_barras ?? producto.sku,
        codigoInterno,
        nombre: producto.nombre,
        precioCentavos: producto.precio_venta_centavos.toString(),
        ubicacion:
          producto.ubicacion_id === null
            ? null
            : (codigoDeUbicacion.get(producto.ubicacion_id) ?? null),
        atributos: (atributosPorProducto.get(producto.id) ?? []).slice(0, MAXIMO_DE_ATRIBUTOS),
        copias: entrada.copias,
      };
    });

    return {
      formato: entrada.formato,
      etiquetas,
      // Pedir cien etiquetas y recibir noventa y ocho sin que nadie lo diga es
      // cómo dos gavetas se quedan sin etiqueta durante un año.
      noEncontrados: entrada.productoIds.length - productos.length,
    };
  },
});

function esTexto(valor: string | null): valor is string {
  return valor !== null;
}
