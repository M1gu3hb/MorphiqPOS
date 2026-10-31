/**
 * NUNCA DOS MORFIS A LA VEZ (DP-11.1, reglas de `ux-pos`).
 *
 * Cada lugar que quiere animarlo pide turno con su prioridad; se anima el de más prioridad (a
 * igual prioridad, el que lo pidió primero) y los demás se quedan en su imagen fija. Al
 * soltarse, el siguiente vuelve a moverse. Es un almacén de módulo para `useSyncExternalStore`:
 * hay un solo Morfi por pestaña.
 */
export const PRIORIDAD = {
  cargando: 1,
  noEncontrada: 2,
  espera: 3,
} as const;

const pedidos = new Map<string, { readonly prioridad: number; readonly orden: number }>();
const escuchas = new Set<() => void>();
let siguienteOrden = 0;

function avisar(): void {
  for (const escucha of escuchas) escucha();
}

function ganador(): string | null {
  let mejor: { id: string; prioridad: number; orden: number } | null = null;
  for (const [id, { prioridad, orden }] of pedidos) {
    if (
      mejor === null ||
      prioridad > mejor.prioridad ||
      (prioridad === mejor.prioridad && orden < mejor.orden)
    ) {
      mejor = { id, prioridad, orden };
    }
  }
  return mejor?.id ?? null;
}

export function pedirTurno(id: string, prioridad: number): void {
  if (pedidos.has(id)) return;
  siguienteOrden += 1;
  pedidos.set(id, { prioridad, orden: siguienteOrden });
  avisar();
}

export function soltarTurno(id: string): void {
  if (pedidos.delete(id)) avisar();
}

export function tieneTurno(id: string): boolean {
  return ganador() === id;
}

export function suscribirAlTurno(escucha: () => void): () => void {
  escuchas.add(escucha);
  return () => {
    escuchas.delete(escucha);
  };
}

/** Sólo para las pruebas: deja el almacén como al cargar la página. */
export function vaciarTurnos(): void {
  pedidos.clear();
  avisar();
}
