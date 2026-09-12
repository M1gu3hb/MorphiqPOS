import { encolarSincronizacionCorte } from '@morphiqpos/app/caja';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(encolarSincronizacionCorte);

export const runtime = 'nodejs';
