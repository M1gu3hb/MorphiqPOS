import { imprimirPrecuenta } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-330 · La hoja que el comensal tiene en la mano.
 *
 * La pantalla de precuenta tiene una sola acción y publicaba aquí: **esto no
 * existía**. El fallo no se tragaba —la pantalla ofrece la salida alterna— pero el
 * servidor no se enteraba de que la hoja había salido, 40 a 100 veces al día.
 *
 * Cuenta la hoja y suma con `cotizar`, el mismo código que usa el cobro. Desde la
 * segunda, la precuenta sale marcada como reimpresión: una cuenta se escapa cuando
 * el cajero cobra la hoja vieja de una mesa que siguió consumiendo.
 *
 * NO cambia el estado de la cuenta: eso es `solicitar-cuenta`, que sí existía.
 */
export const POST = manejadorDeComando(imprimirPrecuenta);

export const runtime = 'nodejs';
