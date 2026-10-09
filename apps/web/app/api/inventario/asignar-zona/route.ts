import { asignarZona } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-149 · Las zonas del anaquel del conteo cíclico (D-33 de la 2.4). */
export const POST = manejadorDeComando(asignarZona);

export const runtime = 'nodejs';
