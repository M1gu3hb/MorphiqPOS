/**
 * QUÉ DESPIERTA Y QUÉ MANTIENE DESPIERTA LA PANTALLA (DP-11.2), sin que el modo espera conozca a
 * las pantallas: ellas avisan.
 *
 * · `despertarLaPantalla(motivo)`: una comanda nueva en Cocina, una cuenta pedida o un pago que
 *   entra en Caja. Si estaba dormida, despierta al instante; si no, cuenta como actividad.
 * · `mantenerDespierta(clave, si)`: mientras alguien diga que sí (Cocina con comandas pendientes de
 *   su estación), no se duerme. Cada quien con su clave, para no pisarse.
 *
 * Es un almacén de módulo: una pestaña, una pantalla de espera.
 */
export type MotivoParaDespertar = 'comanda' | 'cuenta' | 'pago' | 'toque';

const escuchas = new Set<(motivo: MotivoParaDespertar) => void>();
const quienesLaMantienen = new Set<string>();

export function despertarLaPantalla(motivo: MotivoParaDespertar): void {
  for (const escucha of escuchas) escucha(motivo);
}

export function alDespertar(escucha: (motivo: MotivoParaDespertar) => void): () => void {
  escuchas.add(escucha);
  return () => {
    escuchas.delete(escucha);
  };
}

export function mantenerDespierta(clave: string, si: boolean): void {
  if (si) quienesLaMantienen.add(clave);
  else quienesLaMantienen.delete(clave);
}

export function estaBloqueada(): boolean {
  return quienesLaMantienen.size > 0;
}

/** Sólo para las pruebas. */
export function vaciarDespertador(): void {
  escuchas.clear();
  quienesLaMantienen.clear();
}
