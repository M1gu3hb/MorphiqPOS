/**
 * «CAMBIAR DE MESA»: a qué mesas se puede llevar la cuenta. Libres, sin cuenta y —desde DP-9.6—
 * no ocultas en una unión: la gente de una mesa absorbida está en su principal.
 */

/** Lo que el puente sirve de una mesa, lo que aquí se usa para elegir. */
export interface MesaElegible {
  readonly id: string;
  readonly numero: number;
  readonly estado: string;
  readonly zona: string | null;
  readonly venta_activa_id: string | null;
  /** DP-9.6 · Absorbida en una unión: oculta en el mapa, no recibe cuentas. */
  readonly unida_a_mesa_id?: string | null;
}

/** Las mesas a las que se puede ir: libres, sin cuenta y no ocultas en una unión. */
export function mesasElegibles(
  mesas: readonly MesaElegible[],
  propiaId: string,
): readonly MesaElegible[] {
  const libres = mesas.filter(
    (m) =>
      m.id !== propiaId &&
      m.estado === 'libre' &&
      m.venta_activa_id === null &&
      (m.unida_a_mesa_id ?? null) === null,
  );
  return [...libres].sort((a, b) => a.numero - b.numero);
}
