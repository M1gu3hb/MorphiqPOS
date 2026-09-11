import { abrirMesaDesdeQR, manejadorPublico } from '@morphiqpos/app/portal';

/**
 * `POST /api/publico/qr/:token/mesa` — E7-3.
 *
 * El comensal abre su propia mesa. El índice único parcial
 * `ordenes_una_activa_por_mesa` impide la segunda venta activa, que es lo que
 * hoy se limpia después cancelando duplicados (D-16 y D-17).
 *
 * `manejadorPublico` resuelve el negocio del despliegue, cuenta el límite de
 * peticiones por token, abre la transacción y aplica la idempotencia. Aquí no
 * hay ninguna decisión que tomar, y ese es el punto.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const manejar = manejadorPublico(abrirMesaDesdeQR);

interface Contexto {
  readonly params: Promise<{ readonly token: string }>;
}

export async function POST(peticion: Request, contexto: Contexto): Promise<Response> {
  const { token } = await contexto.params;
  const salida = await manejar(token, peticion);
  return new Response(JSON.stringify(salida.cuerpo), {
    status: salida.estado,
    headers: salida.cabeceras,
  });
}
