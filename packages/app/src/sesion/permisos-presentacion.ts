import 'server-only';

import { obtenerDb } from '@morphiqpos/data';
import { z } from 'zod';

const Permiso = z.object({
  presentacion_dueno_empleo: z.uuid(),
  presentacion_destinos: z
    .array(
      z.object({
        empleoId: z.uuid(),
        organizacionId: z.uuid(),
      }),
    )
    .max(20),
});

export interface DuenoDePresentacion {
  readonly empleoId: string;
  readonly organizacionId: string;
  readonly rol: string;
}

/** Estos permisos sólo se aprovisionan en servidor. No salen ni se editan por el puente. */
export async function destinosDePresentacion(dueno: DuenoDePresentacion) {
  if (dueno.rol !== 'dueno') return [];
  const fila = await obtenerDb()
    .selectFrom('configuracion')
    .select('valores')
    .where('organizacion_id', '=', dueno.organizacionId)
    .executeTakeFirst();
  const permiso = Permiso.safeParse(fila?.valores);
  if (!permiso.success || permiso.data.presentacion_dueno_empleo !== dueno.empleoId) return [];
  return permiso.data.presentacion_destinos;
}

export async function autorizaPresentacion(
  dueno: DuenoDePresentacion,
  destino: DuenoDePresentacion,
) {
  if (destino.rol !== 'dueno') return false;
  const destinos = await destinosDePresentacion(dueno);
  return destinos.some(
    (d) => d.empleoId === destino.empleoId && d.organizacionId === destino.organizacionId,
  );
}
