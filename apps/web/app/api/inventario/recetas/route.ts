import { consultarRecetasProduccion, guardarReceta } from '@morphiqpos/app/inventario';
import { PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';

import { ejecutarComandoHttp, responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

export function GET(): Promise<Response> {
  return responderConsulta((sesion) => consultarRecetasProduccion(sesion.organizacionId), {
    // La lista NO se escribe a mano: sale de la constante, que es la misma que
    // declara el comando de escritura. Escritas aparte, la consulta y el
    // comando acaban discrepando y el menú enseña lo que el POST rechaza.
    paquetes: PAQUETES_OPERATIVOS,
    roles: ['dueno', 'administrador', 'gerente', 'almacen'],
  });
}

export function POST(peticion: Request): Promise<Response> {
  return ejecutarComandoHttp(guardarReceta, peticion);
}
