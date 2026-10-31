import { AREAS_DE_PREPARACION, type AreaDePreparacion } from '@morphiqpos/domain/catalogo';

/**
 * EL CAMPO «ÁREA DE PREPARACIÓN» de Recetas y Platillos (DP-9.1).
 *
 * El área decide si el platillo genera comanda; la estación a la que llega la pone su categoría.
 * Las dos pantallas mandaban un área fija (`cocina` desde Recetas, `ninguno` desde Platillos)
 * también al EDITAR, y una bebida dejaba de ir a la barra o un platillo se quedaba sin comanda.
 * Ahora se manda la que el platillo tiene o la que alguien eligió; al crear, por omisión, ninguna:
 * el servidor la aprende de su categoría (`completarAreaAlCrear`).
 */

/**
 * Valor del selector que quiere decir «que la aprenda el servidor»: con él, el área NO viaja.
 * Radix no admite '' como valor. Los diálogos lo comparan en línea al armar el cuerpo, para que
 * `verify:escrituras` pueda leer qué campos escriben sin ejecutar nada.
 */
export const SEGUN_SU_CATEGORIA = 'segun_su_categoria';
export type ValorDeArea = AreaDePreparacion | typeof SEGUN_SU_CATEGORIA;

const ETIQUETAS: Readonly<Record<ValorDeArea, string>> = {
  [SEGUN_SU_CATEGORIA]: 'Según su categoría',
  cocina: 'Cocina',
  barra: 'Bebidas (barra)',
  ambos: 'Cocina y bebidas',
  ninguno: 'Sin comanda (no se prepara)',
};

function esArea(valor: unknown): valor is AreaDePreparacion {
  return typeof valor === 'string' && (AREAS_DE_PREPARACION as readonly string[]).includes(valor);
}

/** Lo que muestra al abrir: la del platillo si se edita, «según su categoría» si se crea. */
export function areaInicial(
  producto: { readonly area_preparacion?: string | null } | null,
): ValorDeArea {
  if (producto === null) return SEGUN_SU_CATEGORIA;
  return esArea(producto.area_preparacion) ? producto.area_preparacion : 'ninguno';
}

export function opcionesDeArea(
  alCrear: boolean,
): readonly { readonly valor: ValorDeArea; readonly etiqueta: string }[] {
  const valores: readonly ValorDeArea[] = alCrear
    ? [SEGUN_SU_CATEGORIA, ...AREAS_DE_PREPARACION]
    : AREAS_DE_PREPARACION;
  return valores.map((valor) => ({ valor, etiqueta: ETIQUETAS[valor] }));
}
