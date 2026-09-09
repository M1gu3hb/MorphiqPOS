import { responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

export function GET(): Promise<Response> {
  return responderConsulta((sesion) => ({
    paquete: sesion.paquete,
    nombreNegocio: sesion.nombreNegocio,
    nombreSucursal: sesion.nombreSucursal,
    rol: sesion.rol,
  }));
}
