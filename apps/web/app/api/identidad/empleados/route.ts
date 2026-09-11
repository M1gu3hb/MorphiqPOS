import { guardarEmpleado } from '@morphiqpos/app/identidad';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F1.1-C-05 · alta y edición de la plantilla.
 *
 * `UsuarioPOS` es una entidad que el puente sólo sabe LEER: sin esta ruta,
 * crear o editar un usuario del POS no tenía a dónde ir.
 */
export const POST = manejadorDeComando(guardarEmpleado);

export const runtime = 'nodejs';
