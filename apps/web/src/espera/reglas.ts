/**
 * EL MODO ESPERA (DP-11.2) · dónde entra y cuándo. Puro.
 *
 * Sí en Caja, Tablero, Cocina (Bebidas es una estación de Cocina) y administración: pantallas que
 * se quedan solas en un mostrador o en la pared. Nunca en el mesero, el mapa ni la mesa activa
 * —se usan con la charola en la otra mano—, ni en el portal del comensal ni en el teléfono de
 * cocina, que ya tiene su propia pantalla encendida.
 */
export type PuestoDeEspera = 'caja' | 'tablero' | 'cocina' | 'administracion';

export const MINUTOS_POR_OMISION: Readonly<Record<PuestoDeEspera, number>> = {
  caja: 3,
  tablero: 3,
  cocina: 2,
  administracion: 3,
};

/** El tope de lo que un aparato puede elegir: más de una hora ya no es «espera». */
export const MINUTOS_MAXIMOS = 60;

const PUESTOS: Readonly<Record<string, PuestoDeEspera>> = {
  '/': 'tablero',
  '/caja': 'caja',
  '/pos': 'caja',
  '/restaurante/cierre-diario-y-arqueo': 'caja',
  '/cocina': 'cocina',
  '/ventas': 'administracion',
  '/inventario': 'administracion',
  '/compras': 'administracion',
  '/recetas': 'administracion',
  '/productos': 'administracion',
  '/registros': 'administracion',
  '/portal-qr': 'administracion',
  '/configuracion': 'administracion',
};

/** El puesto de una ruta, o `null` donde el modo espera no entra nunca. */
export function puestoDeEspera(ruta: string): PuestoDeEspera | null {
  const camino = ruta.split('?')[0] ?? '';
  const limpio = camino.length > 1 ? camino.replace(/\/+$/, '') : camino;
  return PUESTOS[limpio] ?? null;
}

/** Los minutos de este aparato, o los del puesto si no eligió (o eligió algo fuera de rango). */
export function minutosDe(puesto: PuestoDeEspera, elegidos: number | null): number {
  if (
    elegidos !== null &&
    Number.isInteger(elegidos) &&
    elegidos >= 1 &&
    elegidos <= MINUTOS_MAXIMOS
  )
    return elegidos;
  return MINUTOS_POR_OMISION[puesto];
}

/** ¿Ya toca dormir? `bloqueada`: algo la mantiene despierta (Cocina con comandas pendientes). */
export function debeDormir(estado: {
  readonly ahora: number;
  readonly ultimaActividad: number;
  readonly minutos: number;
  readonly bloqueada: boolean;
}): boolean {
  if (estado.bloqueada) return false;
  return estado.ahora - estado.ultimaActividad >= estado.minutos * 60_000;
}

/** Con el candado del PIN puesto, la pantalla del PIN vuelve a dormirse a los 30 s sin tocar. */
export const SEGUNDOS_DEL_PIN_SIN_TOCAR = 30;

/**
 * Lo que decidió cada revisión, y por qué. Se deja escrito en `data-espera-decision` del
 * documento: así una prueba sabe que la revisión ya pasó y que NO tocaba dormir, sin depender de
 * cuándo pinta React.
 */
export type DecisionDeEspera = 'fuera' | 'apagado' | 'bloqueada' | 'despierta' | 'dormir';

export function decidirEspera(estado: {
  readonly puesto: PuestoDeEspera | null;
  /** El modo espera de este aparato (Configuración → Este aparato). */
  readonly activa: boolean;
  readonly ahora: number;
  readonly ultimaActividad: number;
  /** Los minutos de este aparato en este puesto (`minutosDe`). */
  readonly minutos: number;
  readonly bloqueada: boolean;
  /** ¿Está puesto el candado del PIN (la pantalla del PIN a la vista)? */
  readonly cerrada: boolean;
}): DecisionDeEspera {
  if (estado.puesto === null) return 'fuera';
  if (!estado.activa) return 'apagado';
  if (estado.bloqueada) return 'bloqueada';
  const minutos = estado.cerrada ? SEGUNDOS_DEL_PIN_SIN_TOCAR / 60 : estado.minutos;
  return debeDormir({ ...estado, minutos }) ? 'dormir' : 'despierta';
}
