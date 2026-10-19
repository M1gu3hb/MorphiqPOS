import { pasivosDelDia } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

/** El dinero del día que pasó por el cajón y no es del negocio (D.2 de la 2.4). */
export const POST = manejadorDeComando(pasivosDelDia);

export const runtime = 'nodejs';
