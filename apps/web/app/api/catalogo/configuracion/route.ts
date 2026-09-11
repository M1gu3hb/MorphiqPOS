import { guardarConfiguracion } from '@morphiqpos/app/configuracion';
import { consultarConfiguracionProduccion } from '@morphiqpos/app/consultas-produccion';

import { ejecutarComandoHttp, responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

export function GET(): Promise<Response> {
  return responderConsulta((sesion) => consultarConfiguracionProduccion(sesion.organizacionId), {
    roles: ['dueno', 'administrador', 'gerente'],
  });
}

export function POST(peticion: Request): Promise<Response> {
  return ejecutarComandoHttp(guardarConfiguracion, peticion);
}
