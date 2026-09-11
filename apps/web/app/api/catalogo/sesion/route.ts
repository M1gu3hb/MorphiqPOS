import { responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

export function GET(peticion: Request): Promise<Response> {
  return responderConsulta(peticion, (sesion) => ({
    paquete: sesion.paquete,
    nombreNegocio: sesion.nombreNegocio,
    nombreSucursal: sesion.nombreSucursal,
    rol: sesion.rol,
  }));
}
