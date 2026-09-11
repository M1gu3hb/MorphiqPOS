import { guardarConfiguracion } from '@morphiqpos/app/configuracion';
import { consultarConfiguracionProduccion } from '@morphiqpos/app/gestion';

import { ejecutarComandoHttp, responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

export function GET(peticion: Request): Promise<Response> {
  return responderConsulta(peticion, (sesion) =>
    consultarConfiguracionProduccion(sesion.organizacionId),
  );
}

export function POST(peticion: Request): Promise<Response> {
  return ejecutarComandoHttp(guardarConfiguracion, peticion);
}
