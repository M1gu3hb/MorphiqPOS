import { validarEntorno } from '@morphiqpos/contracts';
import { cookieDeSesion, leerCookie, permitir } from '@morphiqpos/app/http';
import { entrarConPin } from '@morphiqpos/app/identidad';
import { negocioDelDespliegue } from '@morphiqpos/app/negocio';
import { z } from 'zod';

import { cookieDeDispositivo, NOMBRE_COOKIE_DISPOSITIVO } from '~/servidor/dispositivo';
import { peticionDeEscrituraValida } from '~/servidor/seguridad-http';

/**
 * Entrada con PIN (F1.1-A-03, revisada en T2 del port del restaurante).
 *
 * No usa `manejadorDeComando`: ese resuelve el ámbito de la sesión, y aquí es
 * donde la sesión nace. Es una de las dos rutas del sistema sin ámbito previo,
 * junto con la lista de empleados.
 *
 * ── Lo que cambió ─────────────────────────────────────────────────────────
 * Ya no hace falta que la terminal esté enrolada con un código de seis dígitos.
 * Si el navegador es nuevo, el servidor le da de alta su terminal DESPUÉS de
 * verificar el PIN, y la cookie del dispositivo viaja en esta misma respuesta.
 *
 * ── Lo que NO cambió ──────────────────────────────────────────────────────
 * El PIN se verifica aquí, con Argon2id y pimienta. Nunca en el navegador. Ese
 * era el agujero P0-01 del sistema original —`usuarios.find(u => u.pin === …)`
 * en el cliente, con los PIN de toda la plantilla descargados— y no vuelve.
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

  let organizacionId: string;
  try {
    organizacionId = (await negocioDelDespliegue(entorno.ORGANIZACION)).organizacionId;
  } catch (error) {
    console.error('[auth/entrar] no se pudo resolver el negocio', error);
    return json(500, {
      ok: false,
      error: { codigo: 'ERROR_INTERNO', mensaje: 'No fue posible completar la operación.' },
    });
  }

  const deviceToken = leerCookie(peticion.headers.get('cookie'), NOMBRE_COOKIE_DISPOSITIVO) ?? '';

  const resultado = await entrarConPin({
    empleoId: validada.data.empleoId,
    pin: validada.data.pin,
    deviceToken,
    organizacionId,
    pimienta: entorno.PIN_PEPPER,
    secretoSesion: entorno.SESSION_SECRET,
  });

  if (!resultado.ok) {
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

  // Sin HTTPS el navegador descarta una cookie `Secure`, y en la red local de
  // una demostración eso significaría no poder entrar nunca.
  const seguro = entorno.NODE_ENV === 'production';
  const cookies = [
    cookieDeSesion({
      token: resultado.token,
      maxEdadSegundos: resultado.maxEdadSegundos,
      seguro,
    }),
  ];
  if (resultado.deviceToken !== undefined) {
    cookies.push(
      cookieDeDispositivo({
        token: resultado.deviceToken,
        maxEdadSegundos: resultado.maxEdadDispositivoSegundos ?? 0,
        seguro,
      }),
    );
  }

  return json(
    200,
    {
      ok: true,
      datos: {
        organizacionId: resultado.organizacionId,
        rol: resultado.rol,
        nombre: resultado.nombre,
      },
    },
    cookies,
  );
}

function fallo(mensaje: string) {
  return { codigo: 'NO_AUTENTICADO', mensaje };
}

function json(estado: number, cuerpo: unknown, cookies: readonly string[] = []): Response {
  const cabeceras = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  // `append` y no `set`: una respuesta puede llevar DOS `Set-Cookie` —la de
  // sesión y la del dispositivo recién dado de alta— y `set` se comería la
  // primera dejando al navegador sin terminal.
  for (const cookie of cookies) cabeceras.append('set-cookie', cookie);
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: cabeceras });
}
