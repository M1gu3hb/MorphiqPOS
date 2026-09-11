import 'server-only';

import { obtenerDb } from '@morphiqpos/data';

/**
 * Lo que la pantalla de accesos necesita saber (F1.1-C-05 y C-06).
 *
 * Empleados y terminales de la organización, con lo justo para decidir: quién
 * tiene PIN, quién está bloqueado, qué terminal está enrolada y en qué aparato.
 *
 * **Nunca sale el hash, ni un prefijo suyo.** Que alguien tenga PIN se dice con
 * un booleano; el hash no aporta nada a la pantalla y sí sería una copia más de
 * la credencial viajando por la red.
 */

export interface EmpleadoConAcceso {
  readonly empleoId: string;
  readonly nombre: string;
  readonly rol: string;
  readonly tienePin: boolean;
  /** ISO, o `null`. Sirve para decir «se desbloquea a las 3:12». */
  readonly bloqueadaHasta: string | null;
  readonly intentosFallidos: number;
}

export async function empleadosConAcceso(
  organizacionId: string,
): Promise<readonly EmpleadoConAcceso[]> {
  const filas = await obtenerDb()
    .selectFrom('empleos')
    .innerJoin('personas', 'personas.id', 'empleos.persona_id')
    .leftJoin('identidades', 'identidades.persona_id', 'personas.id')
    // `leftJoin` y no `innerJoin`: un empleado sin PIN todavía TIENE que salir
    // en la lista. Con `innerJoin` desaparecería justo el que hay que dar de
    // alta, y la pantalla parecería estar completa.
    .leftJoin('credenciales_pin', 'credenciales_pin.identidad_id', 'identidades.id')
    .select([
      'empleos.id as empleoId',
      'personas.nombre as nombre',
      'empleos.rol as rol',
      'credenciales_pin.id as credencialId',
      'credenciales_pin.bloqueada_hasta as bloqueadaHasta',
      'credenciales_pin.intentos_fallidos as intentosFallidos',
    ])
    .where('empleos.organizacion_id', '=', organizacionId)
    .where('empleos.activo', '=', true)
    .orderBy('personas.nombre')
    .limit(200)
    .execute();

  return filas.map((f) => ({
    empleoId: f.empleoId,
    nombre: f.nombre,
    rol: f.rol,
    tienePin: f.credencialId !== null,
    bloqueadaHasta: f.bloqueadaHasta === null ? null : f.bloqueadaHasta.toISOString(),
    intentosFallidos: f.intentosFallidos ?? 0,
  }));
}

export interface TerminalDeGestion {
  readonly terminalId: string;
  readonly nombre: string;
  readonly sucursal: string;
  readonly enrolada: boolean;
  readonly enroladaEn: string | null;
  readonly ultimaActividad: string | null;
}

export async function terminalesDeGestion(
  organizacionId: string,
): Promise<readonly TerminalDeGestion[]> {
  const filas = await obtenerDb()
    .selectFrom('terminales')
    .innerJoin('sucursales', 'sucursales.id', 'terminales.sucursal_id')
    .select([
      'terminales.id as terminalId',
      'terminales.nombre as nombre',
      'sucursales.nombre as sucursal',
      'terminales.enrolada_en as enroladaEn',
      'terminales.ultima_actividad as ultimaActividad',
    ])
    .where('terminales.organizacion_id', '=', organizacionId)
    .where('terminales.activa', '=', true)
    .orderBy('sucursales.nombre')
    .orderBy('terminales.nombre')
    .limit(200)
    .execute();

  return filas.map((f) => ({
    terminalId: f.terminalId,
    nombre: f.nombre,
    sucursal: f.sucursal,
    enrolada: f.enroladaEn !== null,
    enroladaEn: f.enroladaEn === null ? null : f.enroladaEn.toISOString(),
    ultimaActividad: f.ultimaActividad === null ? null : f.ultimaActividad.toISOString(),
  }));
}
