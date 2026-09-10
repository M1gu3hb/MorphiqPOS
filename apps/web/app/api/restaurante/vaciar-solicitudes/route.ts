import { vaciarSolicitudes } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * E7-3 · vacía TODO el historial de avisos. Sólo dueño y administrador.
 *
 * Está separada de `limpiar-solicitudes` porque los roles son distintos, y una
 * lista de roles que depende del valor de un campo no llega al contrato que
 * `pnpm docs:comandos` publica ni al que F1.5 sembrará en `permisos_rol`.
 */
export const POST = manejadorDeComando(vaciarSolicitudes);

export const runtime = 'nodejs';
