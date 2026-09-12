import { consultarRecetasProduccion, guardarReceta } from '@morphiqpos/app/inventario';

import { ejecutarComandoHttp, responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

export function GET(): Promise<Response> {
  return responderConsulta((sesion) => consultarRecetasProduccion(sesion.organizacionId), {
    paquetes: ['operativo', 'restaurante_pro'],
    roles: ['dueno', 'administrador', 'gerente', 'almacen'],
  });
}

export function POST(peticion: Request): Promise<Response> {
  return ejecutarComandoHttp(guardarReceta, peticion);
}
