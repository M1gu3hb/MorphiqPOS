import { validarEntorno } from '@morphiqpos/contracts';
import { leerCookie, permitir } from '@morphiqpos/app/http';
import { empleadosParaEntrar } from '@morphiqpos/app/identidad';
import { negocioDelDespliegue } from '@morphiqpos/app/negocio';
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
    const negocio = await negocioDelDespliegue(entorno.ORGANIZACION);
    const empleados = await empleadosParaEntrar(negocio.organizacionId, token, entorno.PIN_PEPPER);

    // Se devuelve con la forma que espera SU pantalla —`UsuarioPOS`— para que
    // su `POSLogin.jsx` no cambie: id, nombre, rol en su vocabulario, la
    // etiqueta real y un color estable para la tarjeta. Nunca el PIN, nunca su
    // hash, nunca los intentos fallidos.
    const usuarios = empleados.map((e) => ({
      id: e.empleoId,
      nombre: e.nombre,
      rol: rolMH(e.rol) ?? e.rol,
      etiqueta: etiquetaDeRol(e.rol),
      color: colorDePersona(e.empleoId),
      activo: true,
    }));

    return json(200, {
      ok: true,
      datos: { negocio: negocio.nombre, usuarios, empleados },
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
