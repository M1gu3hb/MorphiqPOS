import { registrarMerma } from '@morphiqpos/app/inventario';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-109 · La merma con motivo de la tabla, no con texto libre. */
export const POST = manejadorDeComando(registrarMerma);

export const runtime = 'nodejs';
