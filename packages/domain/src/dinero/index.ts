/**
 * dinero/ — el unico lugar del sistema donde se opera con importes.
 *
 * R15 · dinero en unidades menores enteras, con moneda explicita en las fronteras.
 * 04-ARQUITECTURA §3 · el redondeo se define una vez.
 */
export { CERO, absoluto, centavos, esCero, esNegativo, type Centavos } from './centavos';

export { comparar, negar, restar, sumar } from './aritmetica';

export { PUNTOS_BASE_100, aplicarPorcentaje, redondear } from './redondeo';

export { repartir } from './reparto';

export { MONEDAS, desdeTexto, formatear, type Moneda } from './formato';
