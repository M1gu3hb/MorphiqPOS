import { validarEntorno } from '@morphiqpos/contracts';
import { leerCookie } from '@morphiqpos/app/http';
import { empleadosDeLaTerminal } from '@morphiqpos/app/identidad';

import { NOMBRE_COOKIE_DISPOSITIVO } from '@/servidor/dispositivo';

/**
 * Quien puede entrar en esta terminal (F1.1-A-03).
 *
 * Devuelve nombre y rol. Nunca el hash, nunca los intentos fallidos. Enumerar a
 * los empleados de la sucursal EN SU PROPIA TERMINAL no es una fuga: quien esta
 * frente a la caja los ve por la puerta. El secreto sigue siendo el PIN.
 *
 * La terminal se identifica por su cookie de dispositivo: sin ella, lista vacia.
 */

export const runtime = 'nodejs';

export async function GET(peticion: Request): Promise<Response> {
  const entorno = validarEntorno(process.env);
  const token = leerCookie(peticion.headers.get('cookie'), NOMBRE_COOKIE_DISPOSITIVO) ?? '';

  const empleados = await empleadosDeLaTerminal(token, entorno.PIN_PEPPER);

  return new Response(JSON.stringify({ ok: true, datos: { empleados } }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
