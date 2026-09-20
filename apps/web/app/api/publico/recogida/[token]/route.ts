import { servirRecogida, type RespuestaDelPortal } from '@morphiqpos/app/portal';

/**
 * `GET /api/publico/recogida/:token` — F-329.
 *
 * La UNICA ruta de lectura sin sesion de todo el sistema, y la superficie mas
 * expuesta: cualquiera que pase por el salon ve esta respuesta. Por eso su
 * contrato es la lista mas corta posible -nombres de pila y estado- y por eso el
 * nombre se recorta EN EL SERVIDOR: lo que no viaja no se puede filtrar.
 *
 * No lleva sesion porque el monitor colgado del salon no tiene quien inicie una,
 * y si hubiera que teclear un PIN la pantalla se quedaria apagada. Se protege
 * con un token de terminal de solo lectura, con caducidad.
 */

export const runtime = 'nodejs';
// Sin cache de ruta: la respuesta es quien esta esperando AHORA.
export const dynamic = 'force-dynamic';

interface Contexto {
  readonly params: Promise<{ readonly token: string }>;
}

export async function GET(peticion: Request, contexto: Contexto): Promise<Response> {
  const { token } = await contexto.params;
  // El host va con el token: el codigo QR que el comensal escaneo lleva la
  // direccion del negocio dentro, y es lo que decide a que negocio sirve esta
  // peticion cuando un despliegue atiende a varios.
  const salida: RespuestaDelPortal = await servirRecogida(token, peticion.headers.get('host'));
  return new Response(JSON.stringify(salida.cuerpo), {
    status: salida.estado,
    headers: salida.cabeceras,
  });
}
