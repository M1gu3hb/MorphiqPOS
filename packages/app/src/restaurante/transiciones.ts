import { ErrorDominio } from '@morphiqpos/contracts';

/**
 * La tabla de transiciones de comanda, de item y de mesa (F1-04 §8.2 y §10).
 *
 * Puro a propósito: se prueba sin base de datos y es el ÚNICO sitio donde se
 * decide si un cambio de estado es legítimo. Hoy esa decisión está repartida
 * entre `Cocina.jsx:221`, `Cocina.jsx:258`, `entregaPedidos.js:183` y
 * `Mesero.jsx:234`, cada uno con su propia idea de qué sigue a qué.
 *
 * ── La versión monotónica, y por qué ES el estado y no una columna ─────────
 * `comandas` no tiene columna `version`: en `packages/data/src/esquema.ts` sólo
 * la tienen `ordenes` y `configuracion`. Aquí la versión es el RANGO del
 * estado — cada transición declarada avanza y ninguna retrocede. Así, el toque
 * que se quedó en la red y llega tarde pidiendo `en_preparacion` sobre una
 * comanda que ya está `listo` se rechaza con `TRANSICION_INVALIDA` en vez de
 * devolver el plato al fuego.
 */

export const ESTADOS_COMANDA = [
  'nuevo',
  'en_preparacion',
  'listo',
  'entregado',
  'cancelado',
] as const;
export type EstadoComanda = (typeof ESTADOS_COMANDA)[number];

/**
 * Los mismos cinco hechos, con el nombre que usan la línea de venta y el item.
 *
 * `orden_lineas.estado_preparacion` y `comanda_items.estado` llaman `pendiente`
 * a lo que la comanda llama `nuevo`. La incoherencia es heredada —Mesero
 * escribe `pendiente` (`Mesero.jsx:595`) y POS escribe `nuevo`
 * (`POS.jsx:403`)— y F1-04 §7.5 manda normalizarla aquí, no en cada consulta.
 */
export const ESTADOS_ITEM = [
  'pendiente',
  'en_preparacion',
  'listo',
  'entregado',
  'cancelado',
] as const;
export type EstadoItem = (typeof ESTADOS_ITEM)[number];

/** Comanda que todavía es trabajo vivo en cocina (`entregaPedidos.js:167`). */
export const ESTADOS_COMANDA_ACTIVOS = ['nuevo', 'en_preparacion', 'listo'] as const;

export const ESTADOS_MESA = [
  'libre',
  'esperando_orden',
  'pedido_enviado',
  'en_preparacion',
  'en_espera_entrega',
  'ocupada',
  'cuenta_solicitada',
  'limpieza',
  'pagada',
  'cancelada',
] as const;
export type EstadoMesa = (typeof ESTADOS_MESA)[number];

/**
 * Estados de mesa que la cocina NO puede pisar (`entregaPedidos.js:180`).
 *
 * Que un plato salga listo cinco segundos después de que el comensal pidió la
 * cuenta no puede devolver la mesa a `en_espera_entrega`: la caja ya la tiene
 * en su lista de cobro.
 */
export const ESTADOS_MESA_CERRADOS = [
  'cuenta_solicitada',
  'pagada',
  'cancelada',
  'libre',
  'limpieza',
] as const;

/**
 * Qué puede seguir a qué. Los saltos hacia adelante se admiten —una guarnición
 * que sale directa del pase va de `nuevo` a `listo` sin pasar por el fuego—;
 * los saltos hacia atrás no existen, y ahí está toda la monotonía.
 */
const TRANSICIONES_COMANDA: Readonly<Record<EstadoComanda, readonly EstadoComanda[]>> = {
  nuevo: ['en_preparacion', 'listo', 'cancelado'],
  en_preparacion: ['listo', 'cancelado'],
  listo: ['entregado', 'cancelado'],
  entregado: [],
  cancelado: [],
};

export function esTransicionValida(desde: EstadoComanda, hacia: EstadoComanda): boolean {
  return TRANSICIONES_COMANDA[desde].includes(hacia);
}

/**
 * El resultado de pedir un cambio de estado.
 *
 * `sin_cambio` no es un error: dos meseros tocando «listo» con claves de
 * idempotencia distintas describen el mismo hecho, y fallarle al segundo sería
 * ruido. Lo que no se admite es retroceder.
 */
export type Movimiento = { readonly tipo: 'avanza' } | { readonly tipo: 'sin_cambio' };

export function evaluarTransicion(desde: EstadoComanda, hacia: EstadoComanda): Movimiento {
  if (desde === hacia) return { tipo: 'sin_cambio' };
  if (esTransicionValida(desde, hacia)) return { tipo: 'avanza' };
  throw new ErrorDominio(
    'TRANSICION_INVALIDA',
    `Ese pedido está en "${etiqueta(desde)}" y no puede pasar a "${etiqueta(hacia)}".`,
    { desde, hacia },
  );
}

/**
 * Los estados de item que TODAVÍA pueden avanzar hasta `destino`.
 *
 * Es la mitad monotónica del propagado: una comanda que pasa a `listo` sólo
 * puede mover sus items que estén en `pendiente` o `en_preparacion`. Uno que ya
 * se entregó o se canceló no vuelve, y sin esta lista un `update` sin `where`
 * lo devolvería sin que nadie lo note.
 */
export function estadosItemPorDebajoDe(destino: EstadoComanda): readonly EstadoItem[] {
  switch (destino) {
    case 'nuevo':
      return [];
    case 'en_preparacion':
      return ['pendiente'];
    case 'listo':
      return ['pendiente', 'en_preparacion'];
    case 'entregado':
    case 'cancelado':
      return ['pendiente', 'en_preparacion', 'listo'];
  }
}

/** El nombre del estado en la línea de venta y en el item de comanda. */
export function estadoItemDe(estado: EstadoComanda): EstadoItem {
  return estado === 'nuevo' ? 'pendiente' : estado;
}

/** El camino de vuelta: `pendiente` del item es `nuevo` de la comanda. */
export function estadoComandaDeItem(estado: EstadoItem): EstadoComanda {
  return estado === 'pendiente' ? 'nuevo' : estado;
}

/**
 * A qué estado pasa la mesa cuando una de sus comandas cambia (F1-04 §8.2).
 *
 * Devuelve `null` cuando la mesa no se toca: o porque ya está en un estado que
 * la cocina no manda, o porque quedan comandas vivas en otras estaciones. Esa
 * segunda condición es la regla de `Cocina.jsx:249-259`: si la barra terminó
 * pero la cocina sigue, la mesa todavía no está lista.
 */
export function mesaTrasComanda(
  estadoMesa: EstadoMesa,
  estadoComanda: EstadoComanda,
  quedanComandasActivas: boolean,
): EstadoMesa | null {
  if ((ESTADOS_MESA_CERRADOS as readonly string[]).includes(estadoMesa)) return null;

  const destino = destinoDeMesa(estadoComanda, quedanComandasActivas);
  if (destino === null || destino === estadoMesa) return null;
  return destino;
}

function destinoDeMesa(
  estadoComanda: EstadoComanda,
  quedanComandasActivas: boolean,
): EstadoMesa | null {
  switch (estadoComanda) {
    case 'nuevo':
      return 'pedido_enviado';
    case 'en_preparacion':
      return 'en_preparacion';
    case 'listo':
      // Sólo cuando ninguna otra estación sigue trabajando.
      return quedanComandasActivas ? null : 'en_espera_entrega';
    case 'entregado':
    case 'cancelado':
      // Entregado todo lo que había: la mesa sigue ocupada, sin nada en cocina.
      return quedanComandasActivas ? null : 'ocupada';
  }
}

const ETIQUETAS: Readonly<Record<EstadoComanda, string>> = {
  nuevo: 'nuevo',
  en_preparacion: 'en preparación',
  listo: 'listo',
  entregado: 'entregado',
  cancelado: 'cancelado',
};

function etiqueta(estado: EstadoComanda): string {
  return ETIQUETAS[estado];
}
