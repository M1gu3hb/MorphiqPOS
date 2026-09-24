import { validarEntorno } from '@morphiqpos/contracts';
import { leerCookie, permitir } from '@morphiqpos/app/http';
import { empleadosParaEntrar } from '@morphiqpos/app/identidad';
import { terminosDeLaOrganizacion } from '@morphiqpos/app/configuracion';
import { correlationIdDe, registrar } from '@morphiqpos/app/observabilidad';
import {
  colorDePersona,
  etiquetaDeRol,
  etiquetaDeRolEnElGiro,
  rolMH,
} from '@morphiqpos/app/puente';

import { NOMBRE_COOKIE_DISPOSITIVO } from '~/servidor/dispositivo';
import { cookieDeEntrada, negocioDeEstaEntrada } from '~/servidor/entrada';

/**
 * Quien puede entrar (F1.1-A-03, revisada en T2 del port del restaurante).
 *
 * Devuelve nombre y rol. Nunca el hash, nunca los intentos fallidos. Enumerar a
 * los empleados del negocio EN SU PROPIA PANTALLA DE ACCESO no es una fuga:
 * quien esta frente a la caja los ve por la puerta. El secreto sigue siendo el
 * PIN, y el PIN se verifica en el servidor.
 *
 * La organizacion la decide el SERVIDOR —la del despliegue—, nunca un parametro
 * del cliente. Si el dispositivo ya es una caja de una sucursal, se acota a esa
 * sucursal; si es nuevo, es la plantilla del negocio.
 */

export const runtime = 'nodejs';

export async function GET(peticion: Request): Promise<Response> {
  const entorno = validarEntorno(process.env);
  const correlationId = correlationIdDe(
    peticion.headers.get('x-correlation-id') ?? peticion.headers.get('x-morphiqpos-correlacion'),
  );
  const permiso = await permitir('empleados', peticion.headers, entorno.PIN_PEPPER);
  if (!permiso.ok) {
    return json(429, {
      ok: false,
      error: {
        codigo: 'LIMITE_DE_TASA',
        mensaje: 'Demasiadas consultas desde esta red. Espera unos minutos.',
      },
    });
  }
  const token = leerCookie(peticion.headers.get('cookie'), NOMBRE_COOKIE_DISPOSITIVO) ?? '';

  try {
    /**
     * EL negocio de esta entrada, y sólo él (bloque A de la 2.4).
     *
     * Devolvía a la gente de TODOS los negocios del despliegue mezclada, sin sesión:
     * producción enseñaba al personal de Restaurante MH junto al de las cinco demos a
     * cualquiera que abriera la dirección. Ahora el negocio lo dice la ENTRADA —el host
     * cuando lleva el slug, o `?negocio=<slug>`, que manda la pantalla de
     * `/n/<slug>/login-pos`— y tiene que ser uno de los que este despliegue sirve. El
     * orden completo, con la entrada recordada y la terminal, está en
     * `negocioDeEstaEntrada`.
     *
     * Sin negocio en un despliegue de varios, o con uno que no sirve —exista o no—, la
     * respuesta es la MISMA 404: la entrada no puede servir para averiguar qué negocios
     * existen. Con un despliegue de un solo negocio, sin `negocio` entra como siempre.
     */
    const pedido = new URL(peticion.url).searchParams.get('negocio');
    const negocio = await negocioDeEstaEntrada({
      host: peticion.headers.get('host'),
      cookies: peticion.headers.get('cookie'),
      pedido,
      organizacionConfigurada: entorno.ORGANIZACION,
      pimienta: entorno.PIN_PEPPER,
    });
    if (negocio === null) {
      return json(404, {
        ok: false,
        error: { codigo: 'NO_ENCONTRADO', mensaje: 'No encontramos ese negocio.' },
      });
    }

    // El rol de quien atiende se rotula como lo llama SU giro: en la estética las
    // estilistas tienen rol `mesero` y salían «Mesero» (A.8).
    // Es un rótulo: si la configuración no se pudiera leer, se rotula con el genérico.
    const terminos = await terminosDeLaOrganizacion(negocio.organizacionId).catch(() => null);

    // Se devuelve con la forma que espera SU pantalla —`UsuarioPOS`— para que
    // su `POSLogin.jsx` no cambie: id, nombre, rol en su vocabulario, la
    // etiqueta real y un color estable para la tarjeta. Nunca el PIN, nunca su
    // hash, nunca los intentos fallidos. `empleados` conserva su forma cruda —con
    // `empleoId` y `negocioSlug`— porque los guiones de humo y las pruebas la leen así.
    const gente = await empleadosParaEntrar(negocio.organizacionId, token, entorno.PIN_PEPPER);
    const empleados = gente.map((e) => ({
      empleoId: e.empleoId,
      nombre: e.nombre,
      rol: e.rol,
      negocio: negocio.nombre,
      negocioSlug: negocio.slug,
    }));
    const usuarios = gente.map((e) => ({
      id: e.empleoId,
      nombre: e.nombre,
      rol: rolMH(e.rol) ?? e.rol,
      etiqueta:
        terminos === null
          ? etiquetaDeRol(e.rol)
          : etiquetaDeRolEnElGiro(e.rol, terminos.giro, terminos.personalizado),
      color: colorDePersona(e.empleoId),
      activo: true,
      negocio: negocio.nombre,
      negocioSlug: negocio.slug,
    }));

    // `negocios` sigue en la respuesta —con UNO— porque la precondición de las pruebas
    // lo lee; ya no hay forma de que traiga dos.
    const respuesta = json(200, {
      ok: true,
      datos: {
        negocio: negocio.nombre,
        slug: negocio.slug,
        negocios: [{ nombre: negocio.nombre, slug: negocio.slug }],
        usuarios,
        empleados,
      },
    });
    // Se recuerda la dirección por la que se entró, para que cerrar sesión —que manda
    // a `/login-pos`— vuelva a ESTA entrada y no a la pantalla sin nombres.
    if (pedido !== null && pedido !== '') {
      respuesta.headers.append(
        'set-cookie',
        cookieDeEntrada(negocio.slug, entorno.NODE_ENV === 'production'),
      );
    }
    return respuesta;
  } catch {
    // Un despliegue mal configurado tiene que decirlo en la consola del
    // servidor con su mensaje entero. Al navegador se le da lo justo: la
    // pantalla ya sabe ensenar «no pudimos cargar los usuarios · Reintentar».
    registrar({
      nivel: 'error',
      modulo: 'auth_empleados',
      correlationId,
      organizacionId: null,
      mensaje: 'No se pudo resolver el negocio.',
    });
    return json(500, {
      ok: false,
      error: { codigo: 'ERROR_INTERNO', mensaje: 'No fue posible cargar los usuarios.' },
    });
  }
}

function json(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
