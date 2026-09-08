import { ErrorDominio } from '@morphiqpos/contracts/errores';

import { cantidad, cantidadExacta, ESCALA_CANTIDAD, type Cantidad } from './cantidades';

const UNIDADES = {
  kg: { dimension: 'masa', factor: 1000n },
  g: { dimension: 'masa', factor: 1n },
  l: { dimension: 'volumen', factor: 1000n },
  ml: { dimension: 'volumen', factor: 1n },
  m: { dimension: 'longitud', factor: 1n },
  pieza: { dimension: 'conteo', factor: 1n },
  caja: { dimension: 'caja', factor: 1n },
  paquete: { dimension: 'paquete', factor: 1n },
} as const;
export type Unidad = keyof typeof UNIDADES;
const ALIAS: Readonly<Record<string, Unidad>> = {
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogramo: 'kg',
  kilogramos: 'kg',
  g: 'g',
  gr: 'g',
  gramo: 'g',
  gramos: 'g',
  l: 'l',
  lt: 'l',
  lts: 'l',
  litro: 'l',
  litros: 'l',
  ml: 'ml',
  mililitro: 'ml',
  mililitros: 'ml',
  m: 'm',
  metro: 'm',
  metros: 'm',
  pieza: 'pieza',
  piezas: 'pieza',
  pza: 'pieza',
  pzas: 'pieza',
  pz: 'pieza',
  unidad: 'pieza',
  unidades: 'pieza',
  und: 'pieza',
  u: 'pieza',
  caja: 'caja',
  cajas: 'caja',
  paquete: 'paquete',
  paquetes: 'paquete',
};

export function normalizarUnidad(texto: string): Unidad {
  const clave = texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const unidad = Object.hasOwn(ALIAS, clave) ? ALIAS[clave] : undefined;
  if (unidad === undefined) {
    throw new ErrorDominio('UNIDAD_INCOMPATIBLE', 'La unidad no está definida en el catálogo.');
  }
  return unidad;
}

/** El contenido de un empaque lo proporciona el catálogo, nunca se supone uno. */
export function convertirUnidad(
  valor: Cantidad,
  origen: string,
  destino: string,
  equivalencia?: string,
): Cantidad {
  const desde = UNIDADES[normalizarUnidad(origen)];
  const hasta = UNIDADES[normalizarUnidad(destino)];
  if (
    desde.dimension !== hasta.dimension &&
    ['caja', 'paquete'].includes(desde.dimension) &&
    equivalencia !== undefined
  ) {
    const factor = cantidad(equivalencia);
    if (factor === 0n)
      throw new ErrorDominio('CANTIDAD_INVALIDA', 'La equivalencia debe ser positiva.');
    return cantidadExacta(valor * factor, ESCALA_CANTIDAD);
  }
  if (desde.dimension !== hasta.dimension) {
    throw new ErrorDominio('UNIDAD_INCOMPATIBLE', 'Las unidades representan medidas distintas.');
  }
  return cantidadExacta(valor * desde.factor, hasta.factor);
}
