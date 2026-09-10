import { eliminarCorte } from '@morphiqpos/app/caja';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * Sustituye a `api.entidades.CorteCaja.delete(c.id)` de `Registros.jsx:89`.
 *
 * El `if (!isAdmin)` de aquella vivía en el navegador. Aquí el rol lo decide
 * `comando()` con el ámbito de la sesión, antes de mirar siquiera la entrada.
 */
export const POST = manejadorDeComando(eliminarCorte);

export const runtime = 'nodejs';
