/**
 * DP-10.1 · QUÉ VE CADA QUIEN EN LA PANTALLA DE COCINA.
 *
 * Vivía dentro de `Cocina.jsx` y leía de la sesión `estacion_preparacion_id` y
 * `puede_ver_todas_estaciones`, que la sesión nunca traía: el cocinero de una estación caía en
 * «sin estación» y veía la pantalla vacía. Ahora el PIN y `/api/catalogo/sesion` los mandan
 * (`leerEstacionDeLaSesion` en el servidor) y esto decide con ellos.
 *
 * Es lo que se DIBUJA. Qué comanda puede mover cada quien lo decide el servidor.
 */

/** Lo que la pantalla necesita de la sesión. `rol` en su vocabulario (`administrador`…). */
export interface UsuarioEnLaCocina {
  readonly rol?: string | null;
  readonly estacion_preparacion_id?: string | null;
  readonly estacion_preparacion_nombre?: string | null;
  readonly estacion_preparacion_color?: string | null;
  readonly puede_ver_todas_estaciones?: boolean | null;
}

export type AlcanceDeLaCocina =
  | { readonly mode: 'all'; readonly label: string | null }
  | { readonly mode: 'unassigned'; readonly label: null }
  | {
      readonly mode: 'station';
      readonly stationId: string;
      readonly label: string;
      /** `null` si la estación no trae color: la pantalla pone el gris de la general. */
      readonly color: string | null;
    };

export function alcanceDeLaCocina(
  usuario: UsuarioEnLaCocina | null,
  estacionesActivas: boolean,
): AlcanceDeLaCocina {
  if (!estacionesActivas) return { mode: 'all', label: null };
  // Dueño, gerente y administrador llegan como `administrador` (`rolMH`).
  if (usuario?.rol === 'administrador') return { mode: 'all', label: 'Vista general' };
  if (usuario?.rol !== 'cocina') return { mode: 'all', label: null };
  if (usuario.puede_ver_todas_estaciones === true) {
    return { mode: 'all', label: 'Todas las estaciones' };
  }
  const id = usuario.estacion_preparacion_id ?? null;
  if (id === null || id === '') return { mode: 'unassigned', label: null };
  return {
    mode: 'station',
    stationId: id,
    label: usuario.estacion_preparacion_nombre ?? 'Estación',
    color: usuario.estacion_preparacion_color ?? null,
  };
}

/**
 * Las comandas que ve ese alcance. Una comanda que nació SIN estación (las del portal antes de
 * DP-10.1) sólo la ve la estación general: así no se pierde y no sale en dos pantallas.
 */
export function comandasDelAlcance<T extends { readonly estacion_preparacion_id?: string | null }>(
  comandas: readonly T[],
  alcance: AlcanceDeLaCocina,
  esLaGeneral: boolean,
): readonly T[] {
  if (alcance.mode === 'unassigned') return [];
  if (alcance.mode === 'all') return comandas;
  return comandas.filter((c) => {
    const suya = c.estacion_preparacion_id ?? null;
    if (suya === alcance.stationId) return true;
    return suya === null && esLaGeneral;
  });
}

/** `true` si dos sesiones dicen lo mismo de la cocina: si no, hay que adoptar la nueva. */
export function mismaCocina(
  a: UsuarioEnLaCocina | null | undefined,
  b: UsuarioEnLaCocina | null | undefined,
): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return (
    (a.estacion_preparacion_id ?? null) === (b.estacion_preparacion_id ?? null) &&
    (a.estacion_preparacion_nombre ?? null) === (b.estacion_preparacion_nombre ?? null) &&
    (a.estacion_preparacion_color ?? null) === (b.estacion_preparacion_color ?? null) &&
    (a.puede_ver_todas_estaciones ?? false) === (b.puede_ver_todas_estaciones ?? false)
  );
}
