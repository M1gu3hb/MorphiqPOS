import { editarCliente } from '@morphiqpos/app/clientes';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-040 · Editar la ficha. Toca SOLO lo que viene: mandar el formulario
 * entero borraria las notas de cobranza al corregir un telefono.
 *
 * El identificador viaja EN LA RUTA y se mete en el cuerpo antes de validar.
 */
export const POST = manejadorDeComandoConParametro(editarCliente, 'clienteId');

export const runtime = 'nodejs';
