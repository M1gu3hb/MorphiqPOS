import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { diaDelNegocio } from '../reportes/dia.ts';
import { CLAVE_DE_VERSIONES, versionVigente } from './ambito.ts';

export const entradaConectarTelefono = z.object({ estacionId: z.uuid() }).strict();

/** Lo que el servidor firma después (la ruta, con su pimienta): el comando no ve secretos. */
export interface TelefonoConectado {
  readonly organizacionId: string;
  readonly estacionId: string;
  readonly estacionNombre: string;
  readonly dia: string;
  readonly version: number;
  readonly vigenteHasta: string;
}

/**
 * «Conectar teléfono» en la pantalla de Cocina (DP-9.4): emite el código de UNA estación para
 * hoy y revoca el anterior (sube la versión). Lo hace quien cocina en esa estación, o dirección.
 * Un cocinero con estación fija sólo conecta la suya; uno que ve todas, o sin estación (estaciones
 * apagadas), elige cuál.
 */
export const conectarTelefonoDeCocina = definirComando<
  Transaccion,
  typeof entradaConectarTelefono,
  TelefonoConectado
>({
  nombre: 'restaurante.conectar_telefono_de_cocina',
  entidad: 'estacion_preparacion',
  escribe: true,
  roles: ['cocina', 'gerente', 'administrador', 'dueno'],
  paquetes: PAQUETES_RESTAURANTE,
  modulo: 'cocina',
  entrada: entradaConectarTelefono,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId, rol } = ctx.ambito;

    const estacion = await ctx.paso('cargar_estacion', () =>
      ctx.tx
        .selectFrom('estaciones_preparacion')
        .select(['id', 'nombre'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.estacionId)
        .where('activa', '=', true)
        .executeTakeFirst(),
    );
    if (estacion === undefined) {
      throw new ErrorDominio('ESTACION_NO_ENCONTRADA', 'Esa estación no existe o está apagada.');
    }

    if (rol === 'cocina') {
      await ctx.paso('exigir_su_estacion', () =>
        exigirSuEstacion(ctx.tx, organizacionId, empleoId, estacion.id),
      );
    }

    const version =
      (await ctx.paso('leer_version', () => versionVigente(ctx.tx, organizacionId, estacion.id))) +
      1;
    await ctx.paso('revocar_el_anterior', () =>
      guardarVersion(ctx.tx, organizacionId, estacion.id, version),
    );
    const dia = await ctx.paso('dia_de_operacion', () =>
      diaDelNegocio(ctx.tx, organizacionId, ctx.ahora),
    );

    ctx.auditar({
      entidadId: estacion.id,
      payload: { estacion: estacion.nombre, version, dia: dia.fecha },
    });
    return {
      organizacionId,
      estacionId: estacion.id,
      estacionNombre: estacion.nombre,
      dia: dia.fecha,
      version,
      vigenteHasta: dia.hasta.toISOString(),
    };
  },
});

/** Un cocinero con estación fija conecta SU estación; el que ve todas, cualquiera. */
async function exigirSuEstacion(
  tx: Transaccion,
  organizacionId: string,
  empleoId: string,
  estacionId: string,
): Promise<void> {
  const empleo = await tx
    .selectFrom('empleos')
    .select(['estacion_preparacion_id', 've_todas_las_estaciones'])
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', empleoId)
    .executeTakeFirst();
  const fija =
    empleo?.ve_todas_las_estaciones === true ? null : (empleo?.estacion_preparacion_id ?? null);
  if (fija !== null && fija !== estacionId) {
    throw new ErrorDominio('ESTACION_AJENA', 'Sólo puedes conectar el teléfono de tu estación.');
  }
}

/** La versión nueva, sin tocar ninguna otra clave de la configuración. */
async function guardarVersion(
  tx: Transaccion,
  organizacionId: string,
  estacionId: string,
  version: number,
): Promise<void> {
  const parche = JSON.stringify({ [estacionId]: version });
  await sql`
    insert into configuracion (organizacion_id, valores)
    values (${organizacionId}, jsonb_build_object(${CLAVE_DE_VERSIONES}::text, ${parche}::jsonb))
    on conflict (organizacion_id) do update
       set valores = configuracion.valores
         || jsonb_build_object(
              ${CLAVE_DE_VERSIONES}::text,
              coalesce(configuracion.valores -> ${CLAVE_DE_VERSIONES}, '{}'::jsonb) || ${parche}::jsonb
            )
  `.execute(tx);
}
