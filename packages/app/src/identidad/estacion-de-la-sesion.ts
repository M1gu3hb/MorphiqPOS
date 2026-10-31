import 'server-only';

import { obtenerDb } from '@morphiqpos/data';

/**
 * DP-10.1 · QUÉ ESTACIÓN VE QUIEN ENTRÓ, dicho por el SERVIDOR.
 *
 * La pantalla de Cocina filtra las comandas con `estacion_preparacion_id` y
 * `puede_ver_todas_estaciones` de la sesión, pero ni el PIN ni `/api/catalogo/sesion` los
 * mandaban: con las estaciones encendidas el cocinero de una estación caía en «sin estación»,
 * y con ellas apagadas todos veían comida y bebidas revueltas. Ahora los dos contestan con
 * esto, leído del EMPLEO en cada respuesta (nunca de lo que guardó el navegador).
 *
 * No viaja en el ámbito de cada petición: sólo lo piden esas dos rutas, y meterlo en
 * `resolverAmbito` sería un join más en el camino caliente de todas.
 *
 * Esto NO es autorización: qué comandas puede mover cada quien lo decide el servidor en
 * cada comando. Esto decide qué se DIBUJA.
 */

/** Quien dirige el negocio ve todas las estaciones sin que nadie se lo marque. */
const DIRIGEN: ReadonlySet<string> = new Set(['dueno', 'administrador', 'gerente']);

export interface EstacionDeLaSesion {
  readonly estacion_preparacion_id: string | null;
  readonly estacion_preparacion_nombre: string | null;
  readonly estacion_preparacion_color: string | null;
  readonly puede_ver_todas_estaciones: boolean;
}

/** Lo que el empleo dice de la cocina. `estacion` es `null` si no tiene o si está apagada. */
export interface EmpleoEnLaCocina {
  readonly veTodas: boolean;
  readonly estacion: {
    readonly id: string;
    readonly nombre: string;
    readonly color: string;
  } | null;
}

const NINGUNA: EstacionDeLaSesion = {
  estacion_preparacion_id: null,
  estacion_preparacion_nombre: null,
  estacion_preparacion_color: null,
  puede_ver_todas_estaciones: false,
};

export function estacionDeLaSesion(
  rol: string,
  empleo: EmpleoEnLaCocina | null,
): EstacionDeLaSesion {
  if (DIRIGEN.has(rol)) return { ...NINGUNA, puede_ver_todas_estaciones: true };
  if (rol !== 'cocina' || empleo === null) return NINGUNA;
  if (empleo.veTodas) return { ...NINGUNA, puede_ver_todas_estaciones: true };
  if (empleo.estacion === null) return NINGUNA;
  return {
    estacion_preparacion_id: empleo.estacion.id,
    estacion_preparacion_nombre: empleo.estacion.nombre,
    estacion_preparacion_color: empleo.estacion.color,
    puede_ver_todas_estaciones: false,
  };
}

/**
 * La lee de la base. La estación cuenta sólo si es del MISMO negocio y está encendida: una
 * estación apagada no recibe comandas, y filtrar por ella dejaría al cocinero mirando nada.
 */
export async function leerEstacionDeLaSesion(
  organizacionId: string,
  empleoId: string,
  rol: string,
): Promise<EstacionDeLaSesion> {
  const fila = await obtenerDb()
    .selectFrom('empleos')
    .leftJoin('estaciones_preparacion as e', (join) =>
      join
        .onRef('e.id', '=', 'empleos.estacion_preparacion_id')
        .onRef('e.organizacion_id', '=', 'empleos.organizacion_id')
        .on('e.activa', '=', true),
    )
    .select([
      'empleos.ve_todas_las_estaciones as veTodas',
      'e.id as estacionId',
      'e.nombre as estacionNombre',
      'e.color as estacionColor',
    ])
    .where('empleos.id', '=', empleoId)
    .where('empleos.organizacion_id', '=', organizacionId)
    .executeTakeFirst();

  if (fila === undefined) return estacionDeLaSesion(rol, null);
  return estacionDeLaSesion(rol, {
    veTodas: fila.veTodas,
    estacion:
      fila.estacionId === null
        ? null
        : {
            id: fila.estacionId,
            nombre: fila.estacionNombre ?? '',
            color: fila.estacionColor ?? '',
          },
  });
}
