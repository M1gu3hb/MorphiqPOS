import { generarCodigoDeTerminal } from '@morphiqpos/app/identidad';

import { ejecutarComandoHttp } from '@/servidor/http';

/** Generar el código de enrolamiento de una terminal (F1.1-C-06). */
export const POST = (peticion: Request): Promise<Response> =>
  ejecutarComandoHttp(generarCodigoDeTerminal, peticion);

export const runtime = 'nodejs';
