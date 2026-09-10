import { cancelarOrden } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/** La salida que faltaba: anula la cuenta con motivo y devuelve la mesa al servicio. */
export const POST = manejadorDeComando(cancelarOrden);

export const runtime = 'nodejs';
