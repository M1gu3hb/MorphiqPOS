'use client';
// =====================================================
// utils/entregaPedidos.js
// =====================================================
// F3.2: Entrega de pedidos LISTOS por estación.
//
// Reglas críticas (no romper bajo ninguna condición):
//  - SOLO marca como entregado los pedidos en estado "listo".
//  - NUNCA toca pedidos "nuevo" / "en_preparacion" / "cancelado" / ya "entregado".
//  - NO descuenta inventario.
//  - NO cobra.
//  - NO cierra venta.
//  - NO genera ticket/PDF.
//  - Devuelve un objeto resultado con métricas para que el caller decida UI/toasts.
//
// Las cinco reglas de arriba ya NO las impone este archivo: las impone la tabla
// de transiciones del servidor. `entregar_pedidos` sólo mueve las comandas que
// están en `listo`, y `transicionar_pedido` rechaza con TRANSICION_INVALIDA
// cualquier retroceso. Aquí sólo queda decidir a qué comando llamar y traducir
// su respuesta al objeto que las pantallas ya consumen.
// =====================================================

import { api } from '@/api/cliente';

/** Estados de venta que siguen vivos en sala. */
const ESTADOS_VENTA_ACTIVA = ['abierta', 'enviada', 'en_preparacion', 'lista', 'cuenta_solicitada'];

/**
 * Resuelve la orden activa de una mesa.
 * Intenta en este orden:
 *   1. ventaIdHint si viene.
 *   2. mesa.venta_activa_id.
 *   3. buscar Venta por mesa_id con estado activo.
 *
 * Las tres lecturas PROPAGAN su error. Antes la tercera llevaba
 * `catch {}` encima (F1-06 §4.16): cuando fallaba, la entrega seguía sin
 * ordenId y el cierre de la mesa no se disparaba nunca.
 */
async function resolverOrdenActiva({ mesaId, ventaIdHint }) {
  if (ventaIdHint) return ventaIdHint;

  const mesa = await api.entidades.Mesa.get(mesaId);
  if (mesa?.venta_activa_id) return mesa.venta_activa_id;

  const ventas = await api.entidades.Venta.filter({ mesa_id: mesaId });
  const arr = Array.isArray(ventas) ? ventas : [];
  const viva = arr
    .filter((x) => x && ESTADOS_VENTA_ACTIVA.includes(x.estado))
    .sort(
      (a, b) =>
        new Date(b?.fecha_apertura || b?.created_date || 0) -
        new Date(a?.fecha_apertura || a?.created_date || 0),
    )[0];
  return viva?.id || null;
}

/** El texto que ya veía el mesero, armado con lo que responde el servidor. */
function mensajeDeEntrega(estaciones, entregados) {
  if (estaciones.length === 1) return `Entregado: ${estaciones[0]}.`;
  if (estaciones.length > 1) return `Entregado: ${estaciones.join(' y ')}.`;
  return `Entregado (${entregados}).`;
}

/**
 * Marca como entregados SOLO los pedidos que están en estado "listo".
 * Si después de entregar ya no quedan pedidos activos (nuevo/en_preparacion/listo),
 * la mesa vuelve a 'ocupada' — y esa decisión la toma el servidor, dentro de la
 * misma transacción que mueve las comandas.
 *
 * @param {Object} opts
 * @param {string} opts.mesaId        ID de la mesa.
 * @param {string} [opts.ventaId]     Hint del id de venta (recomendado).
 * @param {string[]} [opts.pedidoIds] Si se pasa, solo entrega ESOS pedidos.
 *                                    Útil para "entregar solo una estación".
 * @param {string[]} [opts.estaciones] Nombres de las estaciones de `pedidoIds`,
 *                                    para el texto del toast. `entregar_pedidos`
 *                                    los devuelve solo; `transicionar_pedido` no.
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   entregados: number,
 *   estaciones: string[],          // nombres de estaciones entregadas
 *   pedidoIdsEntregados: string[], // ids de los pedidos actualizados
 *   mesaCambiada: boolean,         // si la mesa cambió de estado
 *   estadoMesa: string|null,       // el estado al que la dejó el servidor
 *   mensaje: string,
 * }>}
 */
export async function entregarPedidosListosDeMesa({ mesaId, ventaId, pedidoIds, estaciones }) {
  const resultado = {
    ok: false,
    entregados: 0,
    estaciones: [],
    pedidoIdsEntregados: [],
    mesaCambiada: false,
    estadoMesa: null,
    mensaje: '',
  };

  if (!mesaId) {
    resultado.mensaje = 'No hay mesa activa.';
    return resultado;
  }

  const ordenId = await resolverOrdenActiva({ mesaId, ventaIdHint: ventaId });
  if (!ordenId) {
    resultado.mensaje = 'No se encontró venta activa para esta mesa.';
    return resultado;
  }

  const soloAlgunas = Array.isArray(pedidoIds) && pedidoIds.length > 0;

  if (soloAlgunas) {
    // Entregar SOLO una estación: cada comanda es su propia transición, y cada
    // una es su propia transacción. Si una falla, el error sube y el mesero lo
    // ve — antes cada update llevaba su try/catch y las que fallaban sólo
    // bajaban el contador sin explicación.
    let estadoMesa = null;
    for (const comandaId of pedidoIds) {
      const r = await api.comandos.ejecutar('/api/restaurante/transicionar-pedido', {
        comandaId,
        estado: 'entregado',
      });
      resultado.pedidoIdsEntregados.push(r.comandaId);
      if (r.estadoMesa) estadoMesa = r.estadoMesa;
    }
    resultado.entregados = resultado.pedidoIdsEntregados.length;
    resultado.estaciones = (Array.isArray(estaciones) ? estaciones : []).filter(Boolean);
    resultado.estadoMesa = estadoMesa;
  } else {
    // Todo lo que la cocina dejó listo para esa cuenta, de una vez. El comando
    // devuelve QUÉ movió: ni el conteo ni los nombres de estación se deducen ya
    // de una lista que el navegador leyó por su cuenta.
    const r = await api.comandos.ejecutar('/api/restaurante/entregar-pedidos', { ordenId });
    resultado.pedidoIdsEntregados = Array.isArray(r?.entregadas) ? [...r.entregadas] : [];
    resultado.entregados = resultado.pedidoIdsEntregados.length;
    resultado.estaciones = Array.isArray(r?.estaciones) ? [...r.estaciones] : [];
    resultado.estadoMesa = r?.estadoMesa ?? null;
  }

  resultado.mesaCambiada = resultado.estadoMesa !== null;

  // Que no hubiera nada listo no es un fallo: es un mesero que llegó antes que
  // el plato. El servidor lo dice devolviendo una lista vacía, no un error.
  if (resultado.entregados === 0) {
    resultado.mensaje = 'No hay pedidos listos para entregar.';
    return resultado;
  }

  resultado.ok = true;
  resultado.mensaje = mensajeDeEntrega(resultado.estaciones, resultado.entregados);
  return resultado;
}
