/**
 * IMÁGENES DE LOGO PARA LAS PRUEBAS. No se usa fuera de ellas.
 */

import type { ImagenLogo } from './logo.ts';

/** Un PNG válido de 1 × 1 píxel en base64: lo mínimo que acepta la frontera del logo. */
export const PNG_MINIMO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Un logo apaisado (3 : 1) y transparente, como suele ser un logotipo. */
export const MAPA_DE_BITS: ImagenLogo = {
  ancho: 600,
  alto: 200,
  transparente: true,
  datos: PNG_MINIMO,
};

/** Un logo vectorial cuadrado. */
export const VECTOR: ImagenLogo = {
  ancho: 10,
  alto: 10,
  svg: '<svg width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" fill="#f00"/></svg>',
};
