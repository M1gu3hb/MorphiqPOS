/**
 * MARCOS DE SELLO Y BOLETO: SILUETAS RELLENAS CON PUNTA, ONDAS O MUESCAS.
 *
 * El borde inferior (o el costado) lleva la forma que les da nombre: un listón, una insignia,
 * una ola, el troquel de un boleto.
 */

import type { DibujosDe } from './tipos.ts';

const BOLETO =
  'M4 0H112Q116 0 116 4V54a7 7 0 0 0 0 14V136Q116 140 112 140H4Q0 140 0 136V68a7 7 0 0 0 0-14V4Q0 0 4 0Z';
const BOLETO_ANCHO =
  'M0 0H50a5 5 0 0 0 10 0H160V27a7 7 0 0 0 0 14V75a7 7 0 0 0 0 14V116H60a5 5 0 0 0-10 0H0V78a10 10 0 0 0 0-20Z';
const SELLO_ONDULADO =
  'M0 4Q0 0 4 0H112Q116 0 116 4V140q-4-12-8 0t-8 0t-8 0t-8 0t-8 0t-8 0t-8 0t-8 0t-8 0t-8 0t-8 0t-8 0t-8 0t-12 0V4Z';

export const SELLOS: DibujosDe<
  | 'ticket'
  | 'ticket-wide'
  | 'ribbon'
  | 'badge'
  | 'wave-stamp'
  | 'wave-gradient'
  | 'shield-label'
  | 'bookmark-circle'
> = {
  ticket: ({ ruta, principal, texto }) => ({
    decoracion: ruta(BOLETO),
    rotulos: texto(principal, 58, 125, 96),
  }),
  'ticket-wide': ({ ruta, claro, principal, texto }) => ({
    ancho: 160,
    alto: 116,
    x: 54,
    decoracion:
      ruta(BOLETO_ANCHO) +
      `<path d="M43 6V110" stroke="${claro}" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 5"/>`,
    rotulos: texto(principal, 21, 58, 88, claro, 10, 2, -90),
  }),
  ribbon: ({ ruta, claro, principal, texto }) => ({
    alto: 150,
    decoracion: ruta('M0 0H116V150L58 135 0 150Z'),
    rotulos: texto(principal, 58, 122, 94, claro, 8),
  }),
  badge: ({ ruta, principal, texto }) => ({
    alto: 145,
    decoracion: ruta('M0 0H116V128L58 145 0 128Z'),
    rotulos: texto(principal, 58, 121, 92),
  }),
  'wave-stamp': ({ ruta, claro, principal, texto }) => ({
    alto: 146,
    decoracion: ruta(SELLO_ONDULADO),
    rotulos: texto(principal, 58, 123, 94, claro, 8),
  }),
  'wave-gradient': ({ ruta, relleno, tinta, claro, principal, texto }) => ({
    alto: 149,
    decoracion:
      ruta('M1 1H115V136Q87 153 58 143T1 138Z', relleno, tinta, 1.5) +
      ruta('M4 138Q30 151 58 140T112 134M4 133Q31 146 58 135T112 129', 'none', claro, 1.2),
    rotulos: texto(principal, 58, 121, 94, claro, 7.5),
  }),
  'shield-label': ({ ruta, corchetes, claro, principal, texto }) => ({
    alto: 145,
    y: 4,
    decoracion:
      ruta('M14 96H102L114 102V131L58 145 2 131V102Z') + corchetes(8, 112, 100, 18, claro),
    rotulos: texto(principal, 58, 122, 83, claro, 8),
  }),
  'bookmark-circle': ({ ruta, rect, circulo, fondo, tinta, principal, texto }) => ({
    ancho: 142,
    alto: 220,
    x: 21,
    y: 43,
    decoracion:
      ruta('M20 0H122V220L71 181 20 220Z') +
      circulo(71, 93, 69, fondo, tinta, 1.5) +
      rect(28, 165, 86, 22, fondo, 11),
    rotulos: texto(principal, 71, 176, 74, tinta, 7),
  }),
};
