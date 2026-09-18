import { validarEntorno } from '@morphiqpos/contracts';
import { leerCookie, permitir } from '@morphiqpos/app/http';
import { empleadosParaEntrar } from '@morphiqpos/app/identidad';
import { negociosDelDespliegue } from '@morphiqpos/app/negocio';
import { correlationIdDe, registrar } from '@morphiqpos/app/observabilidad';
import { colorDePersona, etiquetaDeRol, rolMH } from '@morphiqpos/app/puente';

import { NOMBRE_COOKIE_DISPOSITIVO } from '~/servidor/dispositivo';

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
    // TODOS los negocios a los que sirve este despliegue. El HOST gana cuando la
    // direccion lleva el slug —`mh-restaurante.morphiqpos.app` ensena solo a la
    // gente de MH—; si no, es la lista de `ORGANIZACION`, que puede ser una sola
    // -produccion- o varias -las cinco demostraciones en un despliegue-.
    const negocios = await negociosDelDespliegue(
      entorno.ORGANIZACION,
      peticion.headers.get('host'),
    );

    // Se devuelve con la forma que espera SU pantalla —`UsuarioPOS`— para que
    // su `POSLogin.jsx` no cambie: id, nombre, rol en su vocabulario, la
    // etiqueta real y un color estable para la tarjeta. Nunca el PIN, nunca su
    // hash, nunca los intentos fallidos.
    //
    // Y cada persona viaja CON SU NEGOCIO. Es lo que permite que un despliegue
    // sirva a los cinco: se toca a Lupita y se entra en el restaurante, se toca
    // a Diana y se entra en la cafeteria, sin redesplegar y sin que el cliente
    // elija negocio —elige persona, y la persona trae el suyo—.
    const usuarios = [];
    // `empleados` conserva SU forma cruda —con `empleoId`— porque los cuatro
    // guiones de humo la leen asi: `empleados[0].empleoId`. Cambiarla los habria
    // roto en silencio, y son lo que comprueba el despliegue desde fuera.
    const empleados = [];
    for (const negocio of negocios) {
      const gente = await empleadosParaEntrar(negocio.organizacionId, token, entorno.PIN_PEPPER);
      for (const e of gente) {
        empleados.push({
          empleoId: e.empleoId,
          nombre: e.nombre,
          rol: e.rol,
          negocio: negocio.nombre,
          negocioSlug: negocio.slug,
        });
        usuarios.push({
          id: e.empleoId,
          nombre: e.nombre,
          rol: rolMH(e.rol) ?? e.rol,
          etiqueta: etiquetaDeRol(e.rol),
          color: colorDePersona(e.empleoId),
          activo: true,
          negocio: negocio.nombre,
          negocioSlug: negocio.slug,
        });
      }
    }

    // `slug` va junto al nombre porque el nombre NO identifica a un negocio.
    // La guarda de las pruebas de extremo a extremo comparaba por nombre y su
    // lista traia «Cafe Jacaranda» Y «Cafeteria Jacaranda», las dos, porque
    // nadie sabia cual era la de verdad. El slug es lo que `ORGANIZACION`
    // resuelve y lo unico con lo que se puede afirmar «esto es la demo y no el
    // negocio de alguien». No es un secreto: es el valor que quien configuro el
    // despliegue escribio a mano.
    //
    // `negocio` y `slug` en singular siguen siendo el PRIMERO de la lista, que
    // con un solo negocio -produccion- es el de siempre: su `POSLogin.jsx` los
    // pinta en la cabecera y la guarda de las pruebas los compara. `negocios`
    // es la lista entera, para cuando hay mas de uno.
    const primero = negocios[0];
    return json(200, {
      ok: true,
      datos: {
        negocio: primero?.nombre ?? '',
        slug: primero?.slug ?? '',
        negocios: negocios.map((n) => ({ nombre: n.nombre, slug: n.slug })),
        usuarios,
        empleados,
      },
    });
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
