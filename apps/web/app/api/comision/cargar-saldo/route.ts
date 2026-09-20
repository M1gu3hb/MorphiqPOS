import { cargarSaldo } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-255 · «Deposité $1,000 y me dieron $1,065 para vender.»
 *
 * Es la otra mitad del almacén de dinero del comisionista. Sin ella el saldo sólo
 * puede bajar —cada recarga lo gasta— y el panel acabaría enseñando un número
 * negativo que no significa nada.
 */
export const POST = manejadorDeComando(cargarSaldo);

export const runtime = 'nodejs';
