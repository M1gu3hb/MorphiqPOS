import { validarEntorno } from '@morphiqpos/contracts';
import { cookieDeSesion, leerCookie, permitir } from '@morphiqpos/app/http';
import { entrarConPin } from '@morphiqpos/app/identidad';
import { z } from 'zod';

import { NOMBRE_COOKIE_DISPOSITIVO } from '@/servidor/dispositivo';
import { peticionDeEscrituraValida } from '@/servidor/seguridad-http';

/**
 * Entrada con PIN (F1.1-A-03).
 *
 * No usa `manejadorDeComando`: ese resuelve el ámbito de la sesión, y aquí es
 * donde la sesión nace. Es una de las tres rutas del sistema sin ámbito previo,
 * junto con el enrolamiento y la lista de empleados de la terminal.
 */

export const runtime = 'nodejs';

const Entrada = z.object({
  empleoId: z.uuid(),
  pin: z.string().min(4).max(8),
});

export async function POST(peticion: Request): Promise<Response> {
  const entorno = validarEntorno(process.env);

  // Origen propio y cabecera de la aplicación: un formulario de otro sitio no
  // puede montar esta petición sin disparar el preflight de CORS.
  if (!peticionDeEscrituraValida(peticion)) {
    return json(403, {
      ok: false,
      error: { codigo: 'SIN_PERMISO', mensaje: 'Petición rechazada.' },
    });
  }

  // Límite por IP (gate PRS §09). El bloqueo del PIN cuenta por credencial y
  // frena a quien ataca una cuenta; esto frena a quien barre la plantilla
  // entera probando el mismo PIN en cada empleado.
  const permiso = await permitir('entrar', peticion.headers, entorno.PIN_PEPPER);
  if (!permiso.ok) {
    return json(429, {
      ok: false,
      error: {
        codigo: 'LIMITE_DE_TASA',
        mensaje: `Demasiados intentos desde esta red. Espera ${String(Math.ceil(permiso.esperaSegundos / 60))} minuto(s).`,
      },
    });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await peticion.json();
  } catch {
    return json(400, { ok: false, error: fallo('El cuerpo de la petición no es JSON.') });
  }

  const validada = Entrada.safeParse(cuerpo);
  // Un PIN mal formado responde igual que uno incorrecto: decir «faltan dígitos»
  // le regala al que prueba la longitud correcta.
  if (!validada.success) {
    return json(401, { ok: false, error: fallo('Empleado o PIN incorrectos.') });
  }

  const deviceToken = leerCookie(peticion.headers.get('cookie'), NOMBRE_COOKIE_DISPOSITIVO) ?? '';

  const resultado = await entrarConPin({
    empleoId: validada.data.empleoId,
    pin: validada.data.pin,
    deviceToken,
    pimienta: entorno.PIN_PEPPER,
    secretoSesion: entorno.SESSION_SECRET,
  });

  if (!resultado.ok) {
    if (resultado.motivo === 'terminal') {
      return json(403, {
        ok: false,
        error: {
          codigo: 'SIN_PERMISO',
          mensaje: 'Esta terminal no está dada de alta. Pide a un encargado que la enrole.',
        },
      });
    }
    if (resultado.motivo === 'bloqueada') {
      const minutos = Math.ceil((resultado.esperaSegundos ?? 60) / 60);
      return json(429, {
        ok: false,
        error: {
          codigo: 'LIMITE_DE_TASA',
          mensaje: `Demasiados intentos. Espera ${String(minutos)} minuto(s) e intenta otra vez.`,
        },
      });
    }
    return json(401, { ok: false, error: fallo('Empleado o PIN incorrectos.') });
  }

  return json(
    200,
    { ok: true, datos: { organizacionId: resultado.organizacionId, rol: resultado.rol } },
    cookieDeSesion({
      token: resultado.token,
      maxEdadSegundos: resultado.maxEdadSegundos,
      // Sin HTTPS el navegador descarta una cookie `Secure`, y en la red local
      // de una demostración eso significaría no poder entrar nunca.
      seguro: entorno.NODE_ENV === 'production',
    }),
  );
}

function fallo(mensaje: string) {
  return { codigo: 'NO_AUTENTICADO', mensaje };
}

function json(estado: number, cuerpo: unknown, cookie?: string): Response {
  const cabeceras: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
  if (cookie !== undefined) cabeceras['set-cookie'] = cookie;
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: cabeceras });
}
