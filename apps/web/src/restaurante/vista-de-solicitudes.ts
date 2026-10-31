/**
 * LA VISTA «SOLICITUDES» DENTRO DE MESAS (DP-9.3).
 *
 * Arriba de las zonas, un selector convierte la pantalla de Mesas en la lista de solicitudes
 * pendientes: mesa, qué pide, hace cuánto y «Atender». Sirve de estación: un aparato se queda en
 * esa vista (se recuerda en ESE aparato) y es el ÚNICO lugar donde la voz anuncia las
 * solicitudes. En las zonas se ven los globos, sin voz.
 */

import { esTipoDeSolicitud, type SolicitudPendiente } from './globos-de-solicitud';

export type VistaDeMesas = 'mesas' | 'solicitudes';

/** Dónde recuerda el aparato la vista: es suyo, no de quien entra. */
export const CLAVE_DE_LA_VISTA = 'morphiqpos:vista-de-mesas';

type Lector = Pick<Storage, 'getItem'>;
type Escritor = Pick<Storage, 'setItem'>;

/** El almacén del aparato, o nada: en el servidor no hay, y un navegador puede negarlo. */
export function almacenDelAparato(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** La vista que este aparato dejó puesta; «mesas» si nunca eligió o si no se puede leer. */
export function leerVistaGuardada(almacen: Lector | null): VistaDeMesas {
  try {
    return almacen?.getItem(CLAVE_DE_LA_VISTA) === 'solicitudes' ? 'solicitudes' : 'mesas';
  } catch {
    // Ventana privada o datos del sitio bloqueados: la pantalla abre en su vista de siempre.
    return 'mesas';
  }
}

/** Recuerda la vista en este aparato. Si no se puede, la pantalla funciona igual. */
export function guardarVista(almacen: Escritor | null, vista: VistaDeMesas): boolean {
  try {
    almacen?.setItem(CLAVE_DE_LA_VISTA, vista);
    return almacen !== null;
  } catch {
    return false;
  }
}

const MINUTO = 60_000;

/** «hace un momento», «hace 4 min», «hace 1 h 5 min»: cuánto lleva esperando la mesa. */
export function haceCuanto(desde: string | null | undefined, ahora: number): string {
  const inicio = desde === null || desde === undefined ? Number.NaN : Date.parse(desde);
  if (Number.isNaN(inicio)) return '';
  const minutos = Math.max(0, Math.floor((ahora - inicio) / MINUTO));
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${String(minutos)} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `hace ${String(horas)} h` : `hace ${String(horas)} h ${String(resto)} min`;
}

/** La lista: sólo tipos que existen, y primero la que lleva más tiempo esperando. */
export function solicitudesEnOrden(
  solicitudes: readonly SolicitudPendiente[],
): readonly SolicitudPendiente[] {
  return solicitudes
    .filter((s) => esTipoDeSolicitud(s.tipo))
    .toSorted((a, b) => (a.created_date ?? '').localeCompare(b.created_date ?? ''));
}

/** Las que todavía no se anunciaron en voz, en el orden en que llegaron. */
export function nuevasParaAnunciar(
  solicitudes: readonly SolicitudPendiente[],
  anunciadas: ReadonlySet<string>,
): readonly SolicitudPendiente[] {
  return solicitudesEnOrden(solicitudes).filter((s) => !anunciadas.has(s.id));
}
