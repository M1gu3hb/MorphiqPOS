import { consultarRecetasProduccion, guardarReceta } from '@morphiqpos/app/inventario';

import { ejecutarComandoHttp, responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

export function GET(peticion: Request): Promise<Response> {
  return responderConsulta(
    peticion,
    (sesion) => consultarRecetasProduccion(sesion.organizacionId),
    ['cafeteria', 'restaurante'],
  );
}

export function POST(peticion: Request): Promise<Response> {
  return ejecutarComandoHttp(guardarReceta, peticion);
}
