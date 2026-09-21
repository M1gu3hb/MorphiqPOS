import { validarEntorno } from '@morphiqpos/contracts';
import { cuerpoDentroDelLimite, cookieDeSesion, leerCookie, permitir } from '@morphiqpos/app/http';
import { entrarConPin, organizacionDeQuienEntra } from '@morphiqpos/app/identidad';
import { negociosDelDespliegue } from '@morphiqpos/app/negocio';
import { correlationIdDe, registrar } from '@morphiqpos/app/observabilidad';
import { etiquetaDeRol, rolMH } from '@morphiqpos/app/puente';
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
  const correlationId = correlationIdDe(
    peticion.headers.get('x-correlation-id') ?? peticion.headers.get('x-morphiqpos-correlacion'),
  );

  // Origen propio y cabecera de la aplicación: un formulario de otro sitio no
  // puede montar esta petición sin disparar el preflight de CORS.
  if (!peticionDeEscrituraValida(peticion, entorno.APP_URL, entorno.APP_URL_ALTERNAS)) {
    return json(403, {
      ok: false,
      error: { codigo: 'SIN_PERMISO', mensaje: 'Petición rechazada.' },
    });
  }
  if (!cuerpoDentroDelLimite(peticion.headers)) {
    return json(413, {
      ok: false,
      error: { codigo: 'CUERPO_DEMASIADO_GRANDE', mensaje: 'El cuerpo supera 256 KiB.' },
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

  /**
   * LA ORGANIZACIÓN SALE DE QUIEN ENTRA, NO DEL BUILD.
   *
   * Antes salía de `negocioDelDespliegue`, que es una variable del build: la
   * misma para todas las peticiones, así que un despliegue sólo podía servir a un
   * negocio. Ahora se resuelve del EMPLEO que la pantalla mandó, y el empleo
   * identifica un solo negocio.
   *
   * Los dos pasos, en este orden, porque el orden es la frontera:
   * 1 · a qué negocios sirve este despliegue —del host o de `ORGANIZACION`, que
   *     admite una lista—, decidido por el SERVIDOR;
   * 2 · de cuál de ésos es el empleo, filtrado DENTRO de la consulta.
   *
   * La organización sigue sin llegar en un parámetro (R16): el cliente manda una
   * persona, no un negocio, y un `empleoId` de un negocio que este despliegue no
   * sirve no se encuentra. Y encontrarlo no autentica nada — debajo todavía está
   * el PIN, con Argon2id y pimienta, contra la credencial de ESE empleo.
   */
  let servidas: readonly string[];
  try {
    const negocios = await negociosDelDespliegue(
      entorno.ORGANIZACION,
      peticion.headers.get('host'),
    );
    servidas = negocios.map((n) => n.organizacionId);
  } catch {
    registrar({
      nivel: 'error',
      modulo: 'auth_entrar',
      correlationId,
      organizacionId: null,
      mensaje: 'No se pudo resolver el negocio.',
    });
    return json(500, {
      ok: false,
      error: { codigo: 'ERROR_INTERNO', mensaje: 'No fue posible completar la operación.' },
    });
  }

  const organizacionId = await organizacionDeQuienEntra(validada.data.empleoId, servidas);
  // Un empleo que no es de ninguno de los negocios servidos responde lo MISMO
  // que un PIN incorrecto. Decir «ese empleado no trabaja aquí» le regalaría a
  // quien prueba identificadores saber dónde sí trabaja, y es justo la fuga que
  // el mensaje único de arriba evita para el PIN.
  if (organizacionId === null) {
    return json(401, { ok: false, error: fallo('Empleado o PIN incorrectos.') });
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
      // La forma que espera su `POSAuthContext`: `id`, `nombre` y `rol` en SU
      // vocabulario, que es el que entienden su `permissions.js` y su
      // `ROLE_HOME_ROUTES`. El identificador que devuelve es el del EMPLEO,
      // que es lo que su pantalla mandó — no un identificador interno nuevo.
      datos: {
        id: validada.data.empleoId,
        nombre: resultado.nombre,
        rol: rolMH(resultado.rol) ?? resultado.rol,
        etiqueta: etiquetaDeRol(resultado.rol),
        activo: true,
        organizacionId: resultado.organizacionId,
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
