import { responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

/**
 * Quién está dentro, según el SERVIDOR.
 *
 * Es la fuente de verdad de la sesión para toda la interfaz portada del
 * restaurante: su `POSAuthContext` guardaba el usuario en `sessionStorage` y
 * lo creía. Ahora la cookie es `HttpOnly`, la firma se comprueba en cada
 * petición y el empleo se relee de la base, así que una baja a media jornada
 * cierra la barra lateral en la siguiente navegación.
 *
 * No devuelve identificadores internos que la pantalla no necesite: nombre,
 * rol y los datos del negocio. El `empleoId` y el `identidadId` se quedan en
 * el servidor, que es donde deciden algo.
 */
export function GET(): Promise<Response> {
  return responderConsulta((sesion) => ({
    rol: sesion.rol,
    nombre: sesion.nombrePersona,
    paquete: sesion.paquete,
    nombreNegocio: sesion.nombreNegocio,
    nombreSucursal: sesion.nombreSucursal,
    tieneTerminal: sesion.terminalId !== null,
  }));
}
