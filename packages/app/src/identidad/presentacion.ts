import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import { conTransaccion, obtenerDb, repoSesion } from '@morphiqpos/data';
import { destinosDePresentacion } from '../sesion/permisos-presentacion.ts';
import { resolverSesion } from '../sesion/resolver.ts';
import {
  DURACION_SESION_SEGUNDOS,
  firmarSesion,
  nuevoIdDeSesion,
  verificarSesion,
} from '../sesion/token.ts';
import { abrirSesionEnElEspejo, gemeloEnPresentacion } from '../presentacion/espejo.ts';
import { resolverTerminal } from './entrar.ts';

/**
 * El empleo con el que el dueño general desbloquea la presentación: el de su sesión, o —si
 * está en una sesión delegada (otro modelo, o el restaurante en presentación)— el de su
 * cuenta raíz, que es el que tiene su PIN (21-10).
 */
export async function empleoRaizDePresentacion(sesion: {
  readonly empleoId: string;
  readonly organizacionId: string;
  readonly presentador?: { readonly empleoId: string };
}): Promise<{ readonly empleoId: string; readonly organizacionId: string }> {
  if (sesion.presentador === undefined)
    return { empleoId: sesion.empleoId, organizacionId: sesion.organizacionId };
  const fila = await obtenerDb()
    .selectFrom('empleos')
    .select('organizacion_id')
    .where('id', '=', sesion.presentador.empleoId)
    .executeTakeFirst();
  return {
    empleoId: sesion.presentador.empleoId,
    organizacionId: fila?.organizacion_id ?? sesion.organizacionId,
  };
}

/** Lista cerrada por empleo del dueño, nunca por nombres, prefijos de slug o rol global. */
export async function negociosDePresentacion(
  token: string | undefined,
  secreto: string,
  servidas: readonly string[],
) {
  const origen = await resolverSesion({ token, secreto });
  if (!origen.ok || origen.sesion.presentador !== undefined) return [];
  const destinos = (await destinosDePresentacion(origen.sesion)).filter((d) =>
    servidas.includes(d.organizacionId),
  );
  if (destinos.length === 0) return [];
  const empleados = await obtenerDb()
    .selectFrom('empleos')
    .innerJoin('organizaciones', 'organizaciones.id', 'empleos.organizacion_id')
    .innerJoin('personas', 'personas.id', 'empleos.persona_id')
    .innerJoin('identidades', 'identidades.persona_id', 'personas.id')
    .select([
      'empleos.id as empleoId',
      'empleos.organizacion_id as organizacionId',
      'organizaciones.nombre',
      'organizaciones.paquete',
      'organizaciones.slug',
    ])
    .where(
      'empleos.id',
      'in',
      destinos.map((d) => d.empleoId),
    )
    .where('empleos.rol', '=', 'dueno')
    .where('empleos.activo', '=', true)
    .where('identidades.activa', '=', true)
    .where('organizaciones.activa', '=', true)
    .execute();
  return empleados.filter((e) =>
    destinos.some((d) => d.empleoId === e.empleoId && d.organizacionId === e.organizacionId),
  );
}

export async function cambiarNegocioDePresentacion(peticion: {
  readonly token: string | undefined;
  readonly secreto: string;
  readonly pimienta: string;
  readonly servidas: readonly string[];
  readonly empleoId: string;
  readonly deviceToken: string;
}) {
  const origen = await resolverSesion({ token: peticion.token, secreto: peticion.secreto });
  const destinos = await negociosDePresentacion(
    peticion.token,
    peticion.secreto,
    peticion.servidas,
  );
  const destino = destinos.find((d) => d.empleoId === peticion.empleoId);
  if (!origen.ok || destino === undefined)
    throw new ErrorDominio(
      'ACCESO_NO_ENCONTRADO',
      'Este usuario no tiene acceso a esa presentación.',
    );

  // La ruta sólo entrega la cookie HttpOnly emitida al comprobar el PIN de presentación.
  const raiz = verificarSesion(peticion.token, peticion.secreto);
  if (!raiz.ok) throw new ErrorDominio('ACCESO_NO_ENCONTRADO', 'Vuelve a iniciar sesión.');

  // El restaurante EN presentación se abre en su contexto de presentación (21-10): elegirlo
  // en «Modelos de negocio» no debe sacar al dueño de la presentación que está dando.
  const gemelo = await gemeloEnPresentacion(destino.organizacionId, destino.empleoId);
  if (gemelo !== null) {
    const sesion = await abrirSesionEnElEspejo({
      origenId: destino.organizacionId,
      gemelo,
      deviceToken: peticion.deviceToken,
      pimienta: peticion.pimienta,
      secreto: peticion.secreto,
      presentador: raiz.carga,
    });
    return {
      token: sesion.token,
      maxEdadSegundos: sesion.maxEdadSegundos,
      deviceToken: sesion.deviceToken,
      destino,
    };
  }

  const empleo = await obtenerDb()
    .selectFrom('empleos')
    .innerJoin('identidades', 'identidades.persona_id', 'empleos.persona_id')
    .select(['identidades.id as identidadId', 'empleos.sucursal_id as sucursalId'])
    .where('empleos.id', '=', destino.empleoId)
    .where('empleos.organizacion_id', '=', destino.organizacionId)
    .where('empleos.activo', '=', true)
    .where('empleos.rol', '=', 'dueno')
    .where('identidades.activa', '=', true)
    .executeTakeFirst();
  if (empleo === undefined)
    throw new ErrorDominio('ACCESO_NO_ENCONTRADO', 'Este acceso ya no está disponible.');
  const ahora = new Date();
  const terminal = await resolverTerminal(
    {
      empleoId: destino.empleoId,
      organizacionId: destino.organizacionId,
      pin: '',
      deviceToken: peticion.deviceToken,
      pimienta: peticion.pimienta,
      secretoSesion: peticion.secreto,
    },
    empleo.sucursalId,
    ahora,
  );
  const sid = nuevoIdDeSesion();
  const exp = raiz.carga.exp;
  await conTransaccion(async (tx) => {
    await repoSesion.crearSesion(tx, {
      sid,
      organizacionId: destino.organizacionId,
      empleoId: destino.empleoId,
      creadaEn: ahora,
      expiraEn: new Date(exp * 1000),
    });
    await tx
      .insertInto('auditoria')
      .values({
        organizacion_id: destino.organizacionId,
        identidad_id: empleo.identidadId,
        terminal_id: terminal.terminalId,
        accion: 'presentacion.cambiar_negocio',
        entidad: 'organizacion',
        entidad_id: destino.organizacionId,
        payload: JSON.stringify({
          presentador: { empleoId: origen.sesion.empleoId, identidadId: origen.sesion.identidadId },
          destino: destino.empleoId,
        }),
      })
      .execute();
  });
  return {
    token: firmarSesion(
      {
        sid,
        identidadId: empleo.identidadId,
        empleoId: destino.empleoId,
        terminalId: terminal.terminalId,
        exp,
        presentador: {
          sid: raiz.carga.sid,
          identidadId: raiz.carga.identidadId,
          empleoId: raiz.carga.empleoId,
          terminalId: raiz.carga.terminalId,
        },
      },
      peticion.secreto,
    ),
    maxEdadSegundos: DURACION_SESION_SEGUNDOS,
    deviceToken: terminal.deviceToken,
    destino,
  };
}
