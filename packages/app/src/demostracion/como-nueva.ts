import type { Giro } from '@morphiqpos/contracts';

import type { AparienciaGuardada } from '../configuracion/apariencia.ts';

/**
 * CÓMO ES UNA DEMOSTRACIÓN RECIÉN NACIDA · lo que el reseteo repone (bloque B.2 de la 2.4).
 *
 * El reseteo borraba ventas, catálogo e inventario y dejaba TODO lo demás como lo había
 * dejado la última prueba: el PIN que `humo-accesos` cambió, la credencial bloqueada por
 * intentos, el IVA que `humo-impuesto` movió, la plantilla que la suite cambió para
 * comparar vocabularios, el estilo que alguien probó en el selector y las terminales que
 * cada corrida de Playwright deja. La siguiente corrida —o la demostración delante de un
 * cliente— empezaba sobre eso.
 *
 * Aquí está escrito, en un solo sitio, a qué se devuelve cada cosa.
 */

/**
 * EL ESTILO DE CADA DEMO, con las perillas que el propio estilo declara en
 * `packages/ui/src/tokens/estilos.ts` (la prueba lo compara, para que no se desfasen).
 *
 *   · ferretería → TALLER · materiales de verdad, 56 px de control para el guante.
 *   · estética → CRISTAL · translúcido y caro.
 *   · tiendita → BLOQUE · feo y legible a propósito: la hora pico.
 *   · restaurante → NOCHE · para operar a oscuras.
 *   · cafetería → MORPHIQ · el base; alguna de las cinco tiene que enseñarlo.
 */
export const APARIENCIA_DE_DEMO: Readonly<Record<Giro, AparienciaGuardada>> = {
  ferreteria: {
    estilo: 'taller',
    densidad: 'guantes',
    redondeo: 'media',
    elevacion: 'doble-bisel',
    movimiento: 'normal',
  },
  estetica: {
    estilo: 'cristal',
    densidad: 'normal',
    redondeo: 'amplia',
    elevacion: 'sombra',
    movimiento: 'expresiva',
  },
  tienda: {
    estilo: 'bloque',
    densidad: 'guantes',
    redondeo: 'nula',
    elevacion: 'linea-dura',
    movimiento: 'sutil',
  },
  // `farmacia` no tiene demo propia (su modelo no está construido): si alguna vez se
  // resetea una, se pinta con el base.
  farmacia: {
    estilo: 'morphiq',
    densidad: 'normal',
    redondeo: 'media',
    elevacion: 'sombra',
    movimiento: 'normal',
  },
  restaurante: {
    estilo: 'noche',
    densidad: 'comoda',
    redondeo: 'media',
    elevacion: 'sombra',
    movimiento: 'sutil',
  },
  cafeteria: {
    estilo: 'morphiq',
    densidad: 'normal',
    redondeo: 'media',
    elevacion: 'sombra',
    movimiento: 'normal',
  },
};

/** El IVA de una demo: el general de México, incluido en el precio. */
export const IMPUESTO_DE_DEMO = { puntosBase: 1600, incluidoEnPrecio: true } as const;

/**
 * Los topes de descuento por rol, los mismos que la migración 078 siembra para todo
 * negocio. Hay que reponerlos porque un tope que no existe se lee como CERO: sin ellos,
 * tras un reseteo nadie podría descontar nada, ni el dueño.
 */
export const TOPES_DE_DESCUENTO: readonly {
  readonly rol: string;
  readonly topeCentavos: bigint;
  readonly topeBp: number;
}[] = [
  { rol: 'dueno', topeCentavos: 100_000_000n, topeBp: 10_000 },
  { rol: 'administrador', topeCentavos: 500_000n, topeBp: 5_000 },
  { rol: 'gerente', topeCentavos: 200_000n, topeBp: 3_000 },
  { rol: 'cajero', topeCentavos: 5_000n, topeBp: 1_000 },
  { rol: 'mesero', topeCentavos: 0n, topeBp: 0 },
  { rol: 'cocina', topeCentavos: 0n, topeBp: 0 },
  { rol: 'almacen', topeCentavos: 0n, topeBp: 0 },
];

/** El PIN del dueño de cada demo, el que pone `db:bootstrap` (ACCESOS-DEMO §2). */
export const PIN_DEL_DUENO_DE_DEMO = '1234';
