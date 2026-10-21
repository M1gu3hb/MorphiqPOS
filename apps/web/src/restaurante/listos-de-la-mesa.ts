/**
 * LO QUE COCINA YA DEJÓ EN LA VENTANA, visto desde la mesa, sin pantalla (día completo del
 * restaurante, 2.4).
 *
 * ── El defecto que esto arregla ──────────────────────────────────────────────
 * `04-INTERFAZ` pone «Listos para recoger» ARRIBA DE TODO en la mesa activa —«es información
 * que caduca: cuando el mesero abre la mesa 5 para agregar un postre, lo primero que tiene
 * que saber es que hay dos platos esperando en la ventana desde hace tres minutos»— y la
 * pantalla lo recibía por props que NINGUNA página pasaba: el bloque no se pintaba jamás.
 * Para saber que su plato salió, el mesero tenía que irse a la pantalla heredada de
 * «Meseros», que además le pide cosas que su puesto no puede leer. Lo encontró el día
 * completo, que cocina, vuelve a la mesa y busca el plato listo como lo hace Lupita.
 *
 * Aquí se decide QUÉ platillos cuentan como listos a partir de las comandas de la cuenta
 * tal como las sirve el puente; leerlas, refrescarlas y entregarlas es de la pantalla.
 */

import { platillosPorPreparar } from './platillos-de-cocina.ts';

/** Una línea de una comanda, con los nombres del puente (`PedidoPreparacionItem`). */
export interface ItemDeComandaLeido {
  readonly producto_nombre: string | null;
  /** `decimal`: puede llegar como número o como texto (`'2.0000'`) según el conductor. */
  readonly cantidad: number | string | null;
  /** `cancelado`: se anuló en la mesa. No es un plato que recoger ni que ya se preparó. */
  readonly estado?: string | null;
}

/** Una comanda de la cuenta (`PedidoPreparacion`): cocina y barra son dos. */
export interface ComandaLeida {
  readonly id: string;
  readonly estado: string;
  readonly items: readonly ItemDeComandaLeido[];
}

/** Un platillo que espera en la ventana: cuántas unidades y cómo se llama. */
export interface PlatilloListo {
  readonly nombre: string;
  readonly cantidad: number;
}

/** Cuántas unidades dice una línea. Lo que no es un número positivo no cuenta. */
function unidadesDe(item: ItemDeComandaLeido): number {
  const cantidad = Number(item.cantidad ?? 0);
  return Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 0;
}

/** Suma por nombre, en el orden en que aparecen: «2 × Arrachera» en dos comandas son 2. */
function sumarPorNombre(comandas: readonly ComandaLeida[]): readonly PlatilloListo[] {
  const porNombre = new Map<string, number>();
  for (const comanda of comandas) {
    for (const item of platillosPorPreparar(comanda.items)) {
      const nombre = (item.producto_nombre ?? '').trim();
      const unidades = unidadesDe(item);
      if (nombre === '' || unidades === 0) continue;
      porNombre.set(nombre, (porNombre.get(nombre) ?? 0) + unidades);
    }
  }
  return [...porNombre.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad }));
}

/**
 * Lo que el mesero tiene que recoger: las comandas en estado `listo`. Una comanda que cocina
 * todavía prepara no está en la ventana, y una que ya se entregó no hay nada que recoger.
 */
export function platillosListos(comandas: readonly ComandaLeida[]): readonly PlatilloListo[] {
  return sumarPorNombre(comandas.filter((comanda) => comanda.estado === 'listo'));
}

/**
 * Los platillos que YA SALIERON de cocina —listos o ya entregados—. Es lo que decide el
 * aviso de anular una línea: el insumo se gastó cuando el plato se hizo, no cuando se entregó,
 * y un platillo entregado también «ya se preparó».
 */
export function nombresQueYaSalieron(comandas: readonly ComandaLeida[]): ReadonlySet<string> {
  return new Set(
    sumarPorNombre(
      comandas.filter((comanda) => comanda.estado === 'listo' || comanda.estado === 'entregado'),
    ).map((platillo) => platillo.nombre),
  );
}

/** «2 × Arrachera al carbón · 1 × Sopa de tortilla»: se dice cuántos, no sólo cuáles. */
export function descripcionDeLosListos(listos: readonly PlatilloListo[]): string {
  return listos
    .map(
      (platillo) =>
        `${Number.isInteger(platillo.cantidad) ? String(platillo.cantidad) : platillo.cantidad.toFixed(2)} × ${platillo.nombre}`,
    )
    .join(' · ');
}
