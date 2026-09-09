import { ESTADO_HTTP } from '@morphiqpos/contracts';
import { consultar, leerConfiguracionMH, listarUsuariosPOS } from '@morphiqpos/app/puente';

import { conSesion } from '~/servidor/http';

/**
 * El puente de LECTURA (E3-4).
 *
 * Un solo endpoint para las 359 llamadas de su frontend. Todo lo que garantiza
 * está en `packages/app/src/puente/consultar.ts`; aquí sólo se resuelve la
 * sesión y se despachan las tres entidades que no son una tabla con columnas.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Cuerpo {
  readonly entidad?: unknown;
  readonly operacion?: unknown;
  readonly filtro?: unknown;
  readonly id?: unknown;
  readonly orden?: unknown;
  readonly limite?: unknown;
}

export function POST(peticion: Request): Promise<Response> {
  return conSesion(peticion, async (sesion) => {
    const cuerpo = (await peticion.json()) as Cuerpo;
    const entidad = typeof cuerpo.entidad === 'string' ? cuerpo.entidad : '';
    const operacion =
      cuerpo.operacion === 'get' || cuerpo.operacion === 'filter' ? cuerpo.operacion : 'list';

    const ambito = { organizacionId: sesion.organizacionId, rol: sesion.rol };

    // `ConfiguracionNegocio` es un documento JSON, no una tabla con columnas.
    // Su código siempre hace `list()[0]`, así que devolverla como lista de uno
    // es exactamente lo que espera.
    if (entidad === 'ConfiguracionNegocio') {
      const config = await leerConfiguracionMH(sesion.organizacionId);
      return operacion === 'get' ? config : [config];
    }

    // `UsuarioPOS` son tres tablas. Nunca sale el PIN ni su hash.
    if (entidad === 'UsuarioPOS') {
      const usuarios = await listarUsuariosPOS(sesion.organizacionId);
      const filtro = (cuerpo.filtro ?? {}) as Record<string, unknown>;
      const filtrados =
        'activo' in filtro ? usuarios.filter((u) => u['activo'] === filtro['activo']) : usuarios;
      if (operacion === 'get') {
        return filtrados.find((u) => u['id'] === cuerpo.id) ?? null;
      }
      return filtrados;
    }

    const filas = await consultar(ambito, {
      entidad,
      operacion,
      ...(typeof cuerpo.filtro === 'object' && cuerpo.filtro !== null
        ? { filtro: cuerpo.filtro as Record<string, unknown> }
        : {}),
      ...(typeof cuerpo.id === 'string' ? { id: cuerpo.id } : {}),
      ...(typeof cuerpo.orden === 'string' ? { orden: cuerpo.orden } : {}),
      ...(typeof cuerpo.limite === 'number' ? { limite: cuerpo.limite } : {}),
    });

    // Su `get(id)` devuelve el objeto o lanza; `list`/`filter`, un arreglo.
    if (operacion === 'get') {
      const fila = filas[0];
      if (fila === undefined) {
        return Response.json(
          { ok: false, error: { codigo: 'NO_ENCONTRADO', mensaje: 'No existe.' } },
          { status: ESTADO_HTTP.NO_ENCONTRADO },
        );
      }
      return fila;
    }
    return filas;
  });
}
