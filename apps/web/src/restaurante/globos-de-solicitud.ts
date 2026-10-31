/**
 * LOS GLOBOS DE SOLICITUD SOBRE CADA MESA (DP-9.2).
 *
 * El comensal pide ayuda, la cuenta o que vengan a tomarle la orden desde su QR. Cada solicitud
 * pendiente se pinta como un globo sobre su mesa, en los dos modos (con y sin asignación), legible
 * de lejos —una tablet a 2 o 3 m— y de cerca. Si una mesa tiene varias, se ven: unas cuantas
 * apiladas y el resto en un contador. El color nunca va solo (cada tipo lleva icono y texto) y el
 * globo no se confunde con el estado de la mesa: es una burbuja oscura con cola, y ningún estado
 * de mesa es oscuro ni tiene esa forma.
 */

export type TipoSolicitud = 'ordenar' | 'cuenta' | 'ayuda';

export interface SolicitudPendiente {
  readonly id: string;
  readonly mesa_id: string | null;
  readonly tipo: string;
  readonly created_date?: string | null;
}

export interface DescripcionDelTipo {
  /** Lo que cabe en el globo y se lee de lejos. */
  readonly corto: string;
  /** Lo que lee un lector de pantalla y la lista de Solicitudes. */
  readonly completo: string;
  /** El token de color del círculo del icono. */
  readonly tono: 'peligro' | 'exito' | 'acento';
}

export const TIPOS_DE_SOLICITUD: Readonly<Record<TipoSolicitud, DescripcionDelTipo>> = {
  ayuda: { corto: 'Ayuda', completo: 'Necesita ayuda', tono: 'peligro' },
  cuenta: { corto: 'Cuenta', completo: 'Pide la cuenta', tono: 'exito' },
  ordenar: { corto: 'Ordenar', completo: 'Quiere ordenar', tono: 'acento' },
};

/** Cuántos globos se apilan antes de pasar al contador: más no se leen de lejos. */
export const MAXIMO_DE_GLOBOS = 3;

export function esTipoDeSolicitud(valor: string): valor is TipoSolicitud {
  return Object.hasOwn(TIPOS_DE_SOLICITUD, valor);
}

/** Por mesa, y dentro de la mesa de la más vieja a la más nueva. */
export function solicitudesPorMesa(
  solicitudes: readonly SolicitudPendiente[],
): ReadonlyMap<string, readonly SolicitudPendiente[]> {
  const porMesa = new Map<string, SolicitudPendiente[]>();
  for (const solicitud of solicitudes) {
    if (solicitud.mesa_id === null || !esTipoDeSolicitud(solicitud.tipo)) continue;
    const lista = porMesa.get(solicitud.mesa_id) ?? [];
    porMesa.set(solicitud.mesa_id, [...lista, solicitud]);
  }
  const ordenadas = new Map<string, readonly SolicitudPendiente[]>();
  for (const [mesa, lista] of porMesa) {
    ordenadas.set(
      mesa,
      [...lista].sort((a, b) => (a.created_date ?? '').localeCompare(b.created_date ?? '')),
    );
  }
  return ordenadas;
}

export function globosDeLaMesa(solicitudes: readonly SolicitudPendiente[]): {
  readonly visibles: readonly SolicitudPendiente[];
  readonly restantes: number;
} {
  return {
    visibles: solicitudes.slice(0, MAXIMO_DE_GLOBOS),
    restantes: Math.max(0, solicitudes.length - MAXIMO_DE_GLOBOS),
  };
}
