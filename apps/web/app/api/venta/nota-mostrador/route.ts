import { apartarNota } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-140 · Apartar la nota: «déjamelo apartado, ahorita vuelvo con la camioneta».
 * Apartar EXIGE fecha de caducidad, o el patio se llena de material
 * comprometido para clientes que no volvieron.
 */
export const POST = manejadorDeComando(apartarNota);

export const runtime = 'nodejs';
