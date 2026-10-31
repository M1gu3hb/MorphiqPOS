/**
 * MARCOS DE CONTORNO: UN TRAZO ALREDEDOR DEL QR Y EL TEXTO DEBAJO.
 *
 * No rellenan: dibujan el borde con la tinta y dejan el fondo del QR a la vista.
 */

import type { DibujosDe } from './tipos.ts';

const RECTANGULO_RECORTADO = 'M7 1H109L115 7V133L109 139H7L1 133V7Z';
const ESCUDO = 'M15 1H101Q115 1 115 15V128Q115 136 105 138L58 150 11 138Q1 136 1 128V15Q1 1 15 1Z';

export const CONTORNOS: DibujosDe<
  'outline' | 'double' | 'notch' | 'minimal' | 'corners' | 'scan-label-outline' | 'shield-outline'
> = {
  outline: ({ rect, fondo, tinta, principal, texto }) => ({
    decoracion: rect(1, 1, 114, 138, fondo, 2, tinta),
    rotulos: texto(principal, 58, 125, 95, tinta),
  }),
  double: ({ rect, fondo, tinta, principal, texto }) => ({
    decoracion: rect(1, 1, 114, 138, fondo, 2, tinta) + rect(4, 4, 108, 132, 'none', 1, tinta, 0.7),
    rotulos: texto(principal, 58, 125, 95, tinta),
  }),
  notch: ({ ruta, fondo, tinta, principal, texto }) => ({
    decoracion: ruta(RECTANGULO_RECORTADO, fondo, tinta),
    rotulos: texto(principal, 58, 125, 95, tinta),
  }),
  minimal: ({ ruta, tinta, principal, texto }) => ({
    decoracion: ruta('M8 114H108', 'none', tinta, 1),
    rotulos: texto(principal, 58, 125, 95, tinta),
  }),
  corners: ({ corchetes, tinta, principal, texto }) => ({
    decoracion: corchetes(1, 1, 114, 138),
    rotulos: texto(principal, 58, 125, 95, tinta),
  }),
  'scan-label-outline': ({ rect, ruta, telefono, fondo, tinta, principal, texto }) => ({
    decoracion:
      rect(1, 1, 114, 138, fondo, 9, tinta, 2) +
      telefono(12, 118, 6, 11, tinta, 0.8) +
      ruta('M22 125H29M90 125H103', 'none', tinta, 0.8),
    rotulos: texto(principal, 58, 125, 63, tinta, 6.5),
  }),
  'shield-outline': ({ ruta, fondo, tinta, principal, texto }) => ({
    alto: 152,
    y: 9,
    decoracion: ruta(ESCUDO, fondo, tinta, 2),
    rotulos: texto(principal, 58, 125, 97, tinta, 7),
  }),
};
