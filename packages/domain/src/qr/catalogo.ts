/**
 * EL CATÁLOGO DEL DISEÑO: QUÉ FORMAS HAY Y CÓMO SE LLAMAN.
 *
 * Tres piezas se eligen por separado —el módulo (cada cuadrito de datos), el ojo (el anillo de
 * las tres esquinas) y el centro (el cuadro del medio del ojo)— y los «presets» son combinaciones
 * que ya se vieron bien juntas. Los ids son los del motor original y son LA clave estable: lo
 * que se guarde en un diseño es el id, nunca el nombre, que es sólo lo que se enseña.
 */

export type FamiliaDeModulo = 'Continuos' | 'Cintas' | 'Redes' | 'Símbolos';

export interface EstiloDeModulo {
  readonly id: string;
  readonly nombre: string;
  readonly familia: FamiliaDeModulo;
}

export const ESTILOS_DE_MODULO = [
  { id: 'square', nombre: 'Rectos', familia: 'Continuos' },
  { id: 'extra-rounded', nombre: 'Conectados', familia: 'Continuos' },
  { id: 'joined', nombre: 'Unión suave', familia: 'Continuos' },
  { id: 'liquid', nombre: 'Líquido', familia: 'Continuos' },
  { id: 'organic', nombre: 'Orgánico', familia: 'Continuos' },
  { id: 'bevel', nombre: 'Biselado', familia: 'Continuos' },
  { id: 'classy', nombre: 'Diagonal', familia: 'Continuos' },
  { id: 'classy-rounded', nombre: 'Diagonal suave', familia: 'Continuos' },
  { id: 'ribbon-h', nombre: 'Cintas horizontales', familia: 'Cintas' },
  { id: 'ribbon-v', nombre: 'Cintas verticales', familia: 'Cintas' },
  { id: 'pipe', nombre: 'Tuberías', familia: 'Redes' },
  { id: 'round-bridge', nombre: 'Puentes', familia: 'Redes' },
  { id: 'maze', nombre: 'Laberinto', familia: 'Redes' },
  { id: 'stitch', nombre: 'Costura', familia: 'Redes' },
  { id: 'soft-cross', nombre: 'Cruces unidas', familia: 'Redes' },
  { id: 'squircle', nombre: 'Continuo compacto', familia: 'Continuos' },
  { id: 'heart', nombre: 'Corazones', familia: 'Símbolos' },
  { id: 'dots', nombre: 'Puntos', familia: 'Símbolos' },
] as const satisfies readonly EstiloDeModulo[];

export type IdEstiloModulo = (typeof ESTILOS_DE_MODULO)[number]['id'];

export interface EstiloDeOjo {
  readonly id: string;
  readonly nombre: string;
}

export const ESTILOS_DE_OJO = [
  { id: 'square', nombre: 'Rectas' },
  { id: 'rounded', nombre: 'Suaves' },
  { id: 'extra-rounded', nombre: 'Redondeadas' },
  { id: 'circle', nombre: 'Circulares' },
  { id: 'classy', nombre: 'Diagonal' },
  { id: 'leaf', nombre: 'Hojas' },
  { id: 'outpoint', nombre: 'Punta exterior' },
  { id: 'inpoint', nombre: 'Punta interior' },
  { id: 'octagon', nombre: 'Octagonales' },
] as const satisfies readonly EstiloDeOjo[];

export type IdEstiloOjo = (typeof ESTILOS_DE_OJO)[number]['id'];

export interface EstiloDeCentro {
  readonly id: string;
  readonly nombre: string;
}

export const ESTILOS_DE_CENTRO = [
  { id: 'square', nombre: 'Cuadrados' },
  { id: 'rounded', nombre: 'Suaves' },
  { id: 'circle', nombre: 'Círculos' },
  { id: 'classy', nombre: 'Diagonal' },
  { id: 'leaf', nombre: 'Hojas' },
  { id: 'octagon', nombre: 'Octágonos' },
  { id: 'extra-rounded', nombre: 'Redondeados' },
] as const satisfies readonly EstiloDeCentro[];

export type IdEstiloCentro = (typeof ESTILOS_DE_CENTRO)[number]['id'];

/*
 * Los ids llegan de fuera —un diseño guardado, un formulario—, y el compilador no vigila lo que
 * viene de fuera. Estas guardas son la frontera: lo que pasa por ellas ya es un id del catálogo.
 */

export function esIdEstiloModulo(valor: string): valor is IdEstiloModulo {
  return ESTILOS_DE_MODULO.some((estilo) => estilo.id === valor);
}

export function esIdEstiloOjo(valor: string): valor is IdEstiloOjo {
  return ESTILOS_DE_OJO.some((estilo) => estilo.id === valor);
}

export function esIdEstiloCentro(valor: string): valor is IdEstiloCentro {
  return ESTILOS_DE_CENTRO.some((estilo) => estilo.id === valor);
}

/**
 * Un anillo y su centro necesitan geometrías que se lleven bien, o el lector pierde la
 * proporción 1:1:3:1:1 que usa para encontrar el código. Para cada ojo, los centros que la
 * conservan.
 */
const CENTROS_COMPATIBLES: Readonly<Record<IdEstiloOjo, readonly IdEstiloCentro[]>> = {
  square: ['square', 'rounded', 'leaf'],
  rounded: ['square', 'rounded', 'leaf'],
  'extra-rounded': ['rounded', 'octagon', 'extra-rounded'],
  circle: ['circle', 'classy', 'extra-rounded'],
  classy: ['rounded', 'octagon', 'extra-rounded'],
  leaf: ['square', 'rounded', 'leaf'],
  outpoint: ['square', 'rounded', 'leaf'],
  inpoint: ['square', 'rounded', 'leaf'],
  octagon: ['square', 'rounded', 'leaf', 'octagon', 'extra-rounded'],
};

export function centrosCompatibles(ojo: IdEstiloOjo): readonly IdEstiloCentro[] {
  return CENTROS_COMPATIBLES[ojo];
}

export interface Preset {
  readonly id: string;
  readonly nombre: string;
  readonly modulo: IdEstiloModulo;
  readonly ojo: IdEstiloOjo;
  readonly centro: IdEstiloCentro;
  /** La familia de su módulo: sirve para agruparlos en la galería. */
  readonly familia: FamiliaDeModulo;
}

function familiaDe(modulo: IdEstiloModulo): FamiliaDeModulo {
  const estilo = ESTILOS_DE_MODULO.find((candidato) => candidato.id === modulo);
  if (estilo === undefined) throw new Error(`Falta el módulo «${modulo}» en el catálogo.`);
  return estilo.familia;
}

function preset(
  id: string,
  nombre: string,
  modulo: IdEstiloModulo,
  ojo: IdEstiloOjo,
  centro: IdEstiloCentro,
): Preset {
  return { id, nombre, modulo, ojo, centro, familia: familiaDe(modulo) };
}

export const PRESETS: readonly Preset[] = [
  preset('classic', 'Clásico', 'square', 'square', 'square'),
  preset('connected', 'Conectado', 'extra-rounded', 'extra-rounded', 'rounded'),
  preset('joined', 'Unión', 'joined', 'rounded', 'rounded'),
  preset('liquid', 'Líquido', 'liquid', 'circle', 'circle'),
  preset('organic', 'Orgánico', 'organic', 'leaf', 'leaf'),
  preset('bevel', 'Bisel', 'bevel', 'octagon', 'octagon'),
  preset('diagonal', 'Diagonal', 'classy', 'classy', 'extra-rounded'),
  preset('diagonal-soft', 'Diagonal suave', 'classy-rounded', 'classy', 'rounded'),
  preset('horizontal', 'Cinta horizontal', 'ribbon-h', 'rounded', 'rounded'),
  preset('vertical', 'Cinta vertical', 'ribbon-v', 'rounded', 'rounded'),
  preset('pipe', 'Tubería', 'pipe', 'rounded', 'rounded'),
  preset('bridges', 'Puentes', 'round-bridge', 'circle', 'circle'),
  preset('maze', 'Laberinto', 'maze', 'square', 'square'),
  preset('stitch', 'Costura', 'stitch', 'rounded', 'rounded'),
  preset('crosses', 'Red de cruces', 'soft-cross', 'square', 'square'),
  preset('compact', 'Compacto', 'squircle', 'extra-rounded', 'rounded'),
  preset('heart', 'Corazón', 'heart', 'rounded', 'rounded'),
  preset('dot', 'Puntos', 'dots', 'circle', 'circle'),
  preset('mono', 'Monolito', 'square', 'outpoint', 'square'),
  preset('pixel', 'Píxel circular', 'square', 'circle', 'circle'),
  preset('flow', 'Fluir', 'joined', 'leaf', 'leaf'),
  preset('river', 'Río', 'liquid', 'rounded', 'rounded'),
  preset('circuit', 'Circuito', 'pipe', 'square', 'square'),
  preset('web', 'Malla', 'round-bridge', 'octagon', 'square'),
  preset('ribbon', 'Cinta', 'ribbon-h', 'leaf', 'leaf'),
  preset('totem', 'Tótem', 'ribbon-v', 'outpoint', 'square'),
  preset('mesh', 'Trama continua', 'stitch', 'classy', 'rounded'),
  preset('industrial', 'Industrial', 'maze', 'inpoint', 'square'),
  preset('petal', 'Pétalo', 'organic', 'circle', 'circle'),
  preset('angular', 'Angular', 'bevel', 'square', 'square'),
  preset('soft', 'Suave', 'joined', 'rounded', 'leaf'),
  preset('terrain', 'Relieve', 'squircle', 'octagon', 'rounded'),
];
