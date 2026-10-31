/**
 * MARCOS EDITORIALES Y DE TELÉFONO: TARJETAS CON LLAMADA, BANNERS Y VISORES.
 *
 * Los que más texto llevan: una llamada principal, un nombre y una descripción (tarjetas
 * «discover»), o una llamada junto a un teléfono que invita a escanear.
 */

import type { Dibujo, DibujosDe } from './tipos.ts';

/** Un banner horizontal con un teléfono a la izquierda y una punta que sobresale de él. */
function bannerConTelefono(ancho: number, grosorDelTelefono: number): Dibujo {
  return ({ rect, ruta, telefono, relleno, claro, principal, secundario, texto }) => ({
    ancho,
    alto: 116,
    izquierda: 9,
    x: ancho - 104,
    y: 8,
    decoracion:
      rect(0, 0, ancho, 116, relleno, 8) +
      ruta('M0 39l-9 19 9 19Z') +
      telefono(9, 12, 32, 83, claro, grosorDelTelefono),
    rotulos:
      texto(principal, 79, 49, 65, claro, 16, 2) + texto(secundario, 77, 88, 60, claro, 4.5, 2),
  });
}

export const TARJETAS_Y_DISPOSITIVOS: DibujosDe<
  | 'discover-portrait'
  | 'discover-landscape'
  | 'banner-phone'
  | 'banner-compact'
  | 'phone-side'
  | 'brackets-side'
  | 'phone-outline'
> = {
  'discover-portrait': ({
    rect,
    ruta,
    telefono,
    relleno,
    claro,
    principal,
    secundario,
    pie,
    texto,
  }) => ({
    ancho: 132,
    alto: 194,
    x: 16,
    y: 49,
    decoracion:
      rect(0, 0, 132, 194, relleno, 7) +
      ruta('M24 157H51M81 157H108', 'none', claro, 0.6) +
      telefono(60, 150, 12, 15, claro, 1),
    rotulos:
      texto(principal, 66, 25, 102, claro, 7.5, 3) +
      texto(secundario, 66, 169, 105, claro, 6, 1) +
      texto(pie, 66, 184, 108, claro, 4, 2),
  }),
  'discover-landscape': ({
    rect,
    ruta,
    telefono,
    relleno,
    claro,
    principal,
    secundario,
    pie,
    texto,
  }) => ({
    ancho: 224,
    alto: 124,
    x: 116,
    y: 12,
    decoracion:
      rect(0, 0, 224, 124, relleno, 8) +
      ruta('M15 59H38M72 59H95', 'none', claro, 0.6) +
      telefono(49, 48, 12, 20, claro, 1),
    rotulos:
      texto(principal, 55, 27, 90, claro, 7.5, 3) +
      texto(secundario, 55, 79, 90, claro, 5.5, 1) +
      texto(pie, 55, 102, 88, claro, 4, 3),
  }),
  'banner-phone': bannerConTelefono(218, 2),
  'banner-compact': bannerConTelefono(207, 1.2),
  'phone-side': ({ rect, telefono, relleno, tinta, claro, principal, secundario, texto }) => ({
    ancho: 164,
    alto: 142,
    x: 56,
    y: 22,
    decoracion: telefono(50, 1, 113, 139, tinta, 2) + rect(0, 24, 43, 35, relleno, 2),
    rotulos: texto(principal, 21, 41, 37, claro, 9, 2) + texto(secundario, 21, 78, 40, tinta, 5, 3),
  }),
  'brackets-side': ({
    rect,
    telefono,
    corchetes,
    relleno,
    claro,
    principal,
    secundario,
    texto,
  }) => ({
    ancho: 202,
    alto: 116,
    x: 4,
    y: 8,
    decoracion:
      corchetes(1, 1, 110, 114) +
      rect(114, 27, 86, 62, relleno, 5) +
      telefono(119, 36, 17, 44, claro, 1.2),
    rotulos:
      texto(principal, 169, 48, 52, claro, 9, 2) + texto(secundario, 169, 77, 50, claro, 4, 2),
  }),
  'phone-outline': ({ telefono, tinta, principal, texto }) => ({
    ancho: 110,
    alto: 150,
    x: 5,
    y: 21,
    decoracion: telefono(1, 1, 108, 148, tinta, 2),
    rotulos: texto(principal, 55, 132, 90, tinta, 7),
  }),
};
