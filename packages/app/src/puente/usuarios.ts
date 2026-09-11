import 'server-only';

import { obtenerDb } from '@morphiqpos/data';

import { colorDePersona, etiquetaDeRol, rolMH } from './roles.ts';

/**
 * `UsuarioPOS` — la entidad que son tres tablas.
 *
 * Su sistema guardaba usuario, rol y PIN en un solo registro. Aquí son
 * `personas` (quién es), `empleos` (qué hace y dónde) y `credenciales_pin`
 * (cómo entra). El identificador que ve su frontend es el del EMPLEO, porque
 * es lo que identifica «esta persona, en este negocio, con este rol».
 *
 * ── El PIN no sale. Nunca. ────────────────────────────────────────────────
 * Ni el PIN ni su hash ni los intentos fallidos. Esta consulta no toca
 * `credenciales_pin` más que para saber si HAY credencial, y eso viaja como un
 * booleano. Era el defecto D-01: su `POSLogin` descargaba los PIN de toda la
 * plantilla al navegador y los comparaba ahí.
 */

type Registro = Record<string, unknown>;

export async function listarUsuariosPOS(organizacionId: string): Promise<Registro[]> {
  const filas = await obtenerDb()
    .selectFrom('empleos')
    .innerJoin('personas', 'personas.id', 'empleos.persona_id')
    .leftJoin('identidades', 'identidades.persona_id', 'personas.id')
    // `leftJoin` y no `innerJoin`: un empleado sin PIN todavía TIENE que salir
    // en la lista. Con `innerJoin` desaparecería justo el que hay que dar de
    // alta, y la pantalla parecería estar completa.
    .leftJoin('credenciales_pin', 'credenciales_pin.identidad_id', 'identidades.id')
    .select([
      'empleos.id as id',
      'personas.nombre as nombre',
      'personas.telefono as telefono',
      'empleos.rol as rolBase',
      'empleos.activo as activo',
      'empleos.created_at as createdAt',
      'empleos.updated_at as updatedAt',
      'credenciales_pin.id as credencialId',
    ])
    .where('empleos.organizacion_id', '=', organizacionId)
    .orderBy('personas.nombre')
    .limit(200)
    .execute();

  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    telefono: f.telefono,
    // El rol viaja en SU vocabulario, que es el que entienden su
    // `permissions.js` y su `ROLE_HOME_ROUTES`.
    rol: rolMH(f.rolBase) ?? f.rolBase,
    etiqueta: etiquetaDeRol(f.rolBase),
    color: colorDePersona(f.id),
    activo: f.activo,
    tiene_pin: f.credencialId !== null,
    created_date: f.createdAt.toISOString(),
    updated_date: f.updatedAt.toISOString(),
  }));
}
