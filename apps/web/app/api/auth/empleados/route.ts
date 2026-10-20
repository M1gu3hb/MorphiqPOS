import { validarEntorno } from '@morphiqpos/contracts';
import { leerCookie, permitir } from '@morphiqpos/app/http';
import { empleadosParaEntrar } from '@morphiqpos/app/identidad';
import { terminosDeLaOrganizacion } from '@morphiqpos/app/configuracion';
import { negociosDelDespliegue, elegirNegocioDeLaEntrada } from '@morphiqpos/app/negocio';
import { destinosDePresentacion } from '@morphiqpos/app/sesion';
import { correlationIdDe, registrar } from '@morphiqpos/app/observabilidad';
import { colorDePersona, etiquetaDeRolEnElGiro, rolMH } from '@morphiqpos/app/puente';

import { NOMBRE_COOKIE_DISPOSITIVO } from '~/servidor/dispositivo';
import { cookieDeEntrada } from '~/servidor/entrada';

export const runtime = 'nodejs';

/**
 * D-42: entrada central del Master POS. La lista del SERVIDOR delimita los
 * contextos de demostración. Una cookie del último contexto no encierra el
 * siguiente acceso. Los enlaces antiguos por slug siguen acotando la lista.
 * Sólo salen nombres/roles; el PIN se verifica en /entrar y nunca se publica.
 */
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
    const servidos = await negociosDelDespliegue(
      entorno.ORGANIZACION,
      peticion.headers.get('host'),
    );
    const pedido = new URL(peticion.url).searchParams.get('negocio')?.trim() ?? '';
    const explicito = pedido === '' ? null : elegirNegocioDeLaEntrada(servidos, pedido);
    if (pedido !== '' && explicito === null) {
      return json(404, {
        ok: false,
        error: { codigo: 'NO_ENCONTRADO', mensaje: 'No encontramos ese negocio.' },
      });
    }
    const contextos = explicito === null ? servidos : [explicito];
    const listas = await Promise.all(
      contextos.map(async (negocio) => {
        const [gente, terminos] = await Promise.all([
          empleadosParaEntrar(negocio.organizacionId, token, entorno.PIN_PEPPER),
          terminosDeLaOrganizacion(negocio.organizacionId),
        ]);
        return Promise.all(
          gente.map(async (e) => {
            const esDuenoGeneral =
              e.rol === 'dueno' &&
              (
                await destinosDePresentacion({
                  empleoId: e.empleoId,
                  organizacionId: negocio.organizacionId,
                  rol: e.rol,
                })
              ).length > 0;
            const usuario = {
              id: e.empleoId,
              nombre: e.nombre,
              rol: rolMH(e.rol) ?? e.rol,
              etiqueta: esDuenoGeneral
                ? 'Dueño general'
                : etiquetaDeRolEnElGiro(e.rol, terminos.giro, terminos.personalizado),
              color: colorDePersona(e.empleoId),
              activo: true,
              negocio: negocio.nombre,
              negocioSlug: negocio.slug,
              modelo: terminos.giro,
              esDuenoGeneral,
            };
            return {
              usuario,
              empleado: {
                empleoId: e.empleoId,
                nombre: e.nombre,
                rol: e.rol,
                negocio: negocio.nombre,
                negocioSlug: negocio.slug,
              },
            };
          }),
        );
      }),
    );
    const personas = listas.flat();
    const usuarios = personas.map((e) => e.usuario);
    const empleados = personas.map((e) => e.empleado);
    const unico = contextos.length === 1 ? contextos[0] : undefined;
    const respuesta = json(200, {
      ok: true,
      datos: {
        negocio: unico?.nombre ?? 'Morphiq POS',
        slug: unico?.slug,
        negocios: contextos.map(({ nombre, slug }) => ({ nombre, slug })),
        usuarios,
        empleados,
      },
    });
    if (explicito !== null)
      respuesta.headers.append(
        'set-cookie',
        cookieDeEntrada(explicito.slug, entorno.NODE_ENV === 'production'),
      );
    return respuesta;
  } catch {
    registrar({
      nivel: 'error',
      modulo: 'auth_empleados',
      correlationId,
      organizacionId: null,
      mensaje: 'No se pudo cargar el acceso central.',
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
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
