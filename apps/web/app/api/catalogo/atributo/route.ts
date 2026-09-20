import { declararAtributo } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(declararAtributo);

export const runtime = 'nodejs';
