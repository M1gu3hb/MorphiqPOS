import { abrirMesa } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/** E6-2 · abre la mesa y ata mesa<->orden en una transacción. */
export const POST = manejadorDeComando(abrirMesa);

export const runtime = 'nodejs';
