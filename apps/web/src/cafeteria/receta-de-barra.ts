import { centavosDe } from '~/cliente/dinero-del-puente';

/**
 * LA RECETA DE UNA BEBIDA, en lo que se puede calcular sin pintar nada: el canal de
 * cada línea, su costo, el margen y la forma en que se vuelve a guardar.
 *
 * Vive fuera de `Recetas.tsx` por dos razones: la pantalla pasaba de las mil líneas, y
 * las pruebas unitarias no cargan `.tsx` —un archivo de prueba que importara de la
 * pantalla no llegaría ni a correr, y daría verde sin haber probado nada—.
 */

export interface ProductoConReceta {
  readonly id: string;
  readonly nombre: string;
  readonly familia: string;
  /**
   * EN PESOS, como lo sirve el puente.
   *
   * Aquí decía `precio_venta_centavos`, que la entidad NO sirve: lo expone como
   * `precio_venta`, ya convertido por `dinero`. Llegaba `undefined` y la pantalla
   * enseñaba `$NaN`.
   */
  readonly precio_venta: number | null;
}

/**
 * UNA LÍNEA DE RECETA, con los nombres que el puente SIRVE.
 *
 * `RecetaEscandallo` sirve `ingrediente_id`, `ingrediente_nombre`,
 * `cantidad_convertida_unidad_base`, `costo_linea_calculado` y —desde C.10 de la 2.4—
 * `aplica_canal` y `sustituible_por_grupo_id`, que antes no viajaban y el siguiente
 * guardado BORRABA (ver `lineasParaGuardar`).
 */
export interface LineaDeReceta {
  readonly id: string;
  readonly ingrediente_id: string;
  readonly ingrediente_nombre: string | null;
  /**
   * La cantidad EN LA UNIDAD DEL INSUMO —la que dice `unidad`—, que es la que
   * consume el inventario y la que `guardar_receta` escribe (`recetas.cantidad`,
   * nunca nula). Un NÚMERO: el puente la sirve con `conversion: 'decimal'`.
   *
   * Aquí se leía `cantidad_usada`, que el puente saca de `cantidad_capturada`: una
   * columna que nadie escribe, así que llegaba SIEMPRE nula —y a `cocina` ni
   * llegaba—. La celda pintaba nada y «Agregar» y «Quitar» mandaban la cantidad
   * de las líneas que ya estaban como `"null"`: el comando lo rechazaba y la
   * receta no pasaba de su primer ingrediente.
   */
  readonly cantidad_convertida_unidad_base: number | null;
  readonly unidad: string;
  /**
   * Lo que cuesta la línea, EN PESOS: el puente lo calcula en enteros con la misma
   * aritmética que guarda el costo del producto. Nulo si al insumo le falta su
   * costo; y NO LLEGA a quien no ve costos de insumo (`cocina`).
   */
  readonly costo_linea_calculado?: number | null;
  /** Lo que cuesta la unidad base de SU insumo, en pesos. Mismo recorte que el costo. */
  readonly costo_unitario_base_snapshot?: number | null;
  /** La merma en POR CIENTO (el puente convierte los puntos base). Mismo recorte. */
  readonly merma_porcentaje?: number | null;
  /** En qué canales entra: `text[]` en la base, nulo = en todos (083). */
  readonly aplica_canal?: readonly string[] | null;
  /** F-027 · El grupo de opciones que puede sustituir esta línea: «Leche». */
  readonly sustituible_por_grupo_id?: string | null;
}

export interface InsumoDisponible {
  readonly id: string;
  readonly nombre: string;
  readonly unidad_base: string;
  /** EN PESOS: la entidad `Ingrediente` sirve `costo_por_unidad_base`. */
  readonly costo_por_unidad_base: number | null;
}

export type Canal = 'ambos' | 'aqui' | 'llevar';

/**
 * El canal de una línea, tal como lo entiende el comando.
 *
 * En la base es `text[]` y nulo significa «todos» (083). El puente lo sirve como
 * arreglo; aquí se traduce a la palabra que el esquema acepta.
 */
export function canalDe(valor: readonly string[] | string | null | undefined): Canal {
  if (valor === undefined || valor === null || valor.length === 0) return 'ambos';
  if (valor.includes('llevar')) return 'llevar';
  if (valor.includes('aqui')) return 'aqui';
  return 'ambos';
}

/** Si la línea entra en ese canal. Sin canal declarado entra en los dos, como al cobrar. */
export function entraEnCanal(linea: LineaDeReceta, canal: 'aqui' | 'llevar'): boolean {
  const aplica = canalDe(linea.aplica_canal);
  return aplica === 'ambos' || aplica === canal;
}

/**
 * Lo que cuesta UNA línea, en centavos, o `null` si no se sabe.
 *
 * Desconocido NO es cero: una línea sin costo que contara como $0.00 abarataba la
 * receta y el semáforo la pintaba de «margen sano». El costo es el que calcula el
 * puente —en pesos, de vuelta a centavos contando dígitos—, y no una
 * multiplicación en coma flotante aquí.
 */
export function costoDeLinea(linea: LineaDeReceta): number | null {
  return centavosDe('RecetaEscandallo', 'costo_linea_calculado', linea.costo_linea_calculado);
}

/**
 * El precio del producto en centavos, o `null` si no tiene: sin precio no hay margen
 * que medir y la pantalla dice «—», no $0.00.
 */
export function precioDe(producto: ProductoConReceta): number | null {
  return centavosDe('ProductoTerminado', 'precio_venta', producto.precio_venta);
}

/** El costo de un canal: la suma de lo que se sabe y cuántas líneas no tienen costo. */
export interface CostoDeCanal {
  readonly centavos: number;
  /** Mientras no sea cero, `centavos` no es el costo: le faltan líneas. */
  readonly sinCosto: number;
}

/**
 * El costo de la receta EN UN CANAL.
 *
 * Se pide el canal porque el empaque sólo entra cuando el pedido sale por la
 * puerta: un costo único mezclaría las dos y ninguno de los dos números serviría
 * para decidir el precio.
 */
export function costoEnCanal(
  lineas: readonly LineaDeReceta[],
  canal: 'aqui' | 'llevar',
): CostoDeCanal {
  let centavos = 0;
  let sinCosto = 0;
  for (const linea of lineas) {
    if (!entraEnCanal(linea, canal)) continue;
    const costo = costoDeLinea(linea);
    if (costo === null) sinCosto += 1;
    else centavos += costo;
  }
  return { centavos, sinCosto };
}

/** El margen bruto en puntos enteros, o nada si no hay precio contra qué medirlo. */
export function margenDe(precioCentavos: number, costoCentavos: number): number | null {
  if (precioCentavos <= 0) return null;
  return Math.round(((precioCentavos - costoCentavos) * 100) / precioCentavos);
}

/** La merma de la línea en puntos base, como la pide el comando: 5 % son 500. */
export function mermaBpDe(linea: LineaDeReceta): number {
  const porciento = linea.merma_porcentaje;
  if (porciento === undefined || porciento === null || !Number.isFinite(porciento)) return 0;
  return Math.round(porciento * 100);
}

/** Una línea en la forma de `inventario.guardar_receta`. */
export interface LineaParaGuardar {
  readonly insumoId: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly mermaBp: number;
  readonly aplicaCanal: Canal;
  readonly sustituiblePorGrupoId: string | null;
}

/**
 * Las líneas como las pide `guardar_receta`, que REEMPLAZA la receta entera.
 *
 * `null` si a alguna le falta la cantidad: mandarla como `"null"` la haría
 * rechazar, y mandarla sin esa línea la borraría. Con `recetas.cantidad` nunca
 * nula no debería pasar; si pasa, no se guarda nada.
 *
 * ── Todo lo que la línea TIENE vuelve tal cual ───────────────────────────
 * Como el comando borra y reinserta, cualquier dato que no se lea y se reenvíe se
 * PIERDE en el siguiente guardado. Pasaba con tres: el canal (el vaso «sólo para
 * llevar» volvía a «siempre»), la merma (volvía a cero) y el grupo que sustituye la
 * línea. Agregar un ingrediente cualquiera borraba los tres de todas las demás.
 */
export function lineasParaGuardar(lineas: readonly LineaDeReceta[]): LineaParaGuardar[] | null {
  const salida: LineaParaGuardar[] = [];
  for (const linea of lineas) {
    const cantidad = linea.cantidad_convertida_unidad_base;
    if (cantidad === null) return null;
    salida.push({
      insumoId: linea.ingrediente_id,
      cantidad: String(cantidad),
      unidad: linea.unidad,
      mermaBp: mermaBpDe(linea),
      aplicaCanal: canalDe(linea.aplica_canal),
      sustituiblePorGrupoId: linea.sustituible_por_grupo_id ?? null,
    });
  }
  return salida;
}

/** El empaque sólo se gasta cuando el pedido sale por la puerta. */
export const CANALES = [
  { clave: 'ambos', etiqueta: 'Siempre' },
  { clave: 'aqui', etiqueta: 'Sólo aquí' },
  { clave: 'llevar', etiqueta: 'Sólo para llevar' },
] as const;

/** Un `<select>` nativo con la forma de un campo del sistema. */
export const CAMPO_DE_LISTA =
  'h-(--altura-control) w-full rounded-md border border-borde-fuerte bg-fondo px-(--espacio-3) text-sm focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none disabled:opacity-50';

/** La línea que se está capturando, tal como se teclea. */
export interface NuevaLinea {
  readonly insumoId: string;
  readonly cantidad: string;
  readonly canal: string;
}

export const LINEA_EN_BLANCO: NuevaLinea = { insumoId: '', cantidad: '', canal: 'ambos' };
