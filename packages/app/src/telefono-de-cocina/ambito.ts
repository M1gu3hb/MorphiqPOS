import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

import { diaDelNegocio } from '../reportes/dia.ts';
import { leerTokenDeEstacion } from './token-de-estacion.ts';

/** Dónde vive la versión vigente de cada estación: `{ [estacionId]: version }`. */
export const CLAVE_DE_VERSIONES = 'telefonos_de_cocina';

export interface AmbitoDeEstacion {
  readonly organizacionId: string;
  readonly estacionId: string;
  readonly estacionNombre: string;
  readonly estacionColor: string | null;
  /** Hasta cuándo vale el token: el fin del día de operación. */
  readonly vigenteHasta: Date;
}

/**
 * Todos los rechazos dicen lo mismo, a propósito: quien prueba tokens no aprende si falló la
 * firma, el negocio, el día, la versión o la estación.
 */
function codigoInvalido(): ErrorDominio {
  return new ErrorDominio(
    'TELEFONO_DE_COCINA_INVALIDO',
    'Este código ya no sirve. Pide uno nuevo en la pantalla de Cocina.',
  );
}

/**
 * El ámbito de un teléfono de cocina a partir de su token: la firma, el negocio del despliegue,
 * el día de operación de HOY y la versión vigente de la estación, todo comprobado contra la base
 * dentro de la transacción de quien lo pide.
 */
export async function resolverAmbitoDeEstacion(
  tx: Transaccion,
  peticion: {
    readonly token: string;
    readonly organizacionId: string;
    readonly pimienta: string;
    readonly ahora: Date;
  },
): Promise<AmbitoDeEstacion> {
  const contenido = leerTokenDeEstacion(peticion.token, peticion.pimienta);
  if (contenido?.organizacionId !== peticion.organizacionId) throw codigoInvalido();

  const dia = await diaDelNegocio(tx, contenido.organizacionId, peticion.ahora);
  if (dia.fecha !== contenido.dia) throw codigoInvalido();

  const version = await versionVigente(tx, contenido.organizacionId, contenido.estacionId);
  if (version !== contenido.version) throw codigoInvalido();

  const estacion = await tx
    .selectFrom('estaciones_preparacion')
    .select(['id', 'nombre', 'color'])
    .where('organizacion_id', '=', contenido.organizacionId)
    .where('id', '=', contenido.estacionId)
    .where('activa', '=', true)
    .executeTakeFirst();
  if (estacion === undefined) throw codigoInvalido();

  return {
    organizacionId: contenido.organizacionId,
    estacionId: estacion.id,
    estacionNombre: estacion.nombre,
    estacionColor: estacion.color,
    vigenteHasta: dia.hasta,
  };
}

/** La versión vigente del teléfono de una estación; 0 si nunca se conectó uno. */
export async function versionVigente(
  tx: Transaccion,
  organizacionId: string,
  estacionId: string,
): Promise<number> {
  const fila = await sql<{ version: string | null }>`
    select valores -> ${CLAVE_DE_VERSIONES} ->> ${estacionId} as version
      from configuracion
     where organizacion_id = ${organizacionId}
  `.execute(tx);
  const version = Number(fila.rows[0]?.version ?? 0);
  return Number.isInteger(version) && version > 0 ? version : 0;
}
