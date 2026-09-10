import { describe, expect, it } from 'vitest';

import { enviarPedido } from './pedido.ts';
import { entregarPedidos, transicionarPedido } from './preparacion.ts';
import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type OpcionesBase,
  type TablasFalsas,
} from './pruebas/base-falsa.ts';
import {
  ambitoDe,
  COMANDA,
  PREDETERMINADOS,
  comanda,
  comandaItem,
  CUENTA,
  estacionGeneral,
  linea,
  mesa,
  ordenDeMesa,
  producto,
  PRODUCTO,
} from './pruebas/sala.ts';

/**
 * El ciclo de cocina, ejecutado de verdad: enviar, transicionar y entregar.
 *
 * Aquí viven las dos correcciones de estado de mesa del veredicto: la mesa que
 * anunciaba «pedido enviado» sin una sola comanda, y la entrega que no entregó
 * nada y aun así movía la mesa.
 */

/**
 * Toda prueba siembra los `default` del DDL: los comandos omiten esas columnas
 * a propósito porque las rellena la base.
 */
const baseDe = (datos: TablasFalsas, opciones: OpcionesBase = {}) =>
  crearBaseFalsa(datos, { predeterminados: PREDETERMINADOS, ...opciones });

const SALON = {
  ordenes: [ordenDeMesa('borrador')],
  mesas: [mesa('esperando_orden')],
  estaciones_preparacion: [estacionGeneral()],
  orden_lineas: [] as Fila[],
};

describe('enviar_pedido · una transacción, cuatro efectos', () => {
  it('escribe línea, comanda e item, confirma la orden y avanza la mesa', async () => {
    const base = baseDe({ ...SALON, productos: [producto()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'));

    const salida = await enviarPedido.ejecutar(ctx, {
      ordenId: CUENTA,
      lineas: [{ productoId: PRODUCTO, cantidad: '2' }],
    });

    // El precio lo puso el catálogo dentro de la transacción: 2 × $100.00.
    expect(salida.totalCentavos).toBe('20000');
    expect(base.filas('orden_lineas')).toHaveLength(1);
    expect(base.campo('orden_lineas', 'precio_unitario_centavos')).toBe(10_000n);
    expect(base.filas('comandas')).toHaveLength(1);
    expect(base.filas('comanda_items')).toHaveLength(1);
    // El item apunta a SU línea: es el vínculo que hoy no existe (F1-04 §10.3).
    expect(base.campo('comanda_items', 'orden_linea_id')).toBe(
      base.campo('orden_lineas', 'id'),
    );
    expect(base.campo('ordenes', 'estado')).toBe('confirmada');
    expect(base.campo('mesas', 'estado')).toBe('pedido_enviado');
  });

  it('un pedido de sólo bebidas NO deja la mesa anunciando «pedido enviado»', async () => {
    // Dos refrescos de botella: `area_preparacion='ninguno'` ⇒ cero comandas.
    // Antes la mesa pasaba igual a 'pedido_enviado', y como ninguna pantalla de
    // cocina la veía, ningún evento de cocina la sacaba nunca de ahí.
    const base = baseDe({
      ...SALON,
      productos: [producto({ area_preparacion: 'ninguno', nombre: 'Refresco' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'));

    const salida = await enviarPedido.ejecutar(ctx, {
      ordenId: CUENTA,
      lineas: [{ productoId: PRODUCTO, cantidad: '2' }],
    });

    expect(salida.comandas).toHaveLength(0);
    expect(base.filas('comandas')).toHaveLength(0);
    // La línea sí se escribió: el consumo existe aunque la cocina no participe.
    expect(base.filas('orden_lineas')).toHaveLength(1);
    expect(base.campo('mesas', 'estado')).toBe('ocupada');
  });

  it('sin comandas nuevas no se pisa una mesa que ya está en preparación', async () => {
    const base = baseDe({
      ...SALON,
      mesas: [mesa('en_preparacion')],
      ordenes: [ordenDeMesa('confirmada')],
      productos: [producto({ area_preparacion: 'ninguno' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'));

    await enviarPedido.ejecutar(ctx, {
      ordenId: CUENTA,
      lineas: [{ productoId: PRODUCTO, cantidad: '1' }],
    });

    expect(base.campo('mesas', 'estado')).toBe('en_preparacion');
  });
});

describe('transicionar_pedido · la versión monotónica sobre filas reales', () => {
  it('marcar listo arrastra los items y pone la mesa en espera de entrega', async () => {
    const base = baseDe({
      ordenes: [ordenDeMesa('confirmada')],
      mesas: [mesa('en_preparacion')],
      comandas: [comanda('en_preparacion')],
      comanda_items: [comandaItem('en_preparacion')],
      orden_lineas: [linea()],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cocina'));

    const salida = await transicionarPedido.ejecutar(ctx, {
      comandaId: COMANDA,
      estado: 'listo',
    });

    expect(salida.estado).toBe('listo');
    expect(base.campo('comandas', 'estado')).toBe('listo');
    expect(base.campo('comanda_items', 'estado')).toBe('listo');
    expect(base.campo('mesas', 'estado')).toBe('en_espera_entrega');
  });

  it('un toque que llega tarde no devuelve el plato al fuego', async () => {
    const base = baseDe({
      ordenes: [ordenDeMesa('confirmada')],
      mesas: [mesa('en_espera_entrega')],
      comandas: [comanda('listo')],
      comanda_items: [comandaItem('listo')],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cocina'));

    await expect(
      transicionarPedido.ejecutar(ctx, {
        comandaId: COMANDA,
        estado: 'en_preparacion',
      }),
    ).rejects.toThrow(/no puede pasar/i);

    expect(base.campo('comandas', 'estado')).toBe('listo');
  });
});

describe('entregar_pedidos · un comando que no hizo nada no escribe estado', () => {
  it('sin nada listo, la mesa se queda donde estaba', async () => {
    // El mesero llegó antes que el plato. Antes, `sincronizarMesa` corría igual
    // y `mesaTrasComanda(estado,'entregado',false)` devolvía 'ocupada': se
    // auditaba y se escribía una entrega que no entregó nada.
    const base = baseDe({
      ordenes: [ordenDeMesa('confirmada')],
      mesas: [mesa('pedido_enviado')],
      comandas: [comanda('en_preparacion')],
    });
    const { ctx, pasos } = contextoFalso(base.tx, ambitoDe('mesero'));

    const salida = await entregarPedidos.ejecutar(ctx, { ordenId: CUENTA });

    expect(salida.entregadas).toHaveLength(0);
    expect(salida.estadoMesa).toBeNull();
    expect(base.campo('mesas', 'estado')).toBe('pedido_enviado');
    expect(pasos).not.toContain('avanzar_mesa');
  });

  it('con una comanda lista, entrega y la mesa pasa a ocupada', async () => {
    const base = baseDe({
      ordenes: [ordenDeMesa('confirmada')],
      mesas: [mesa('en_espera_entrega')],
      comandas: [comanda('listo')],
      comanda_items: [comandaItem('listo')],
      orden_lineas: [linea()],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'));

    const salida = await entregarPedidos.ejecutar(ctx, { ordenId: CUENTA });

    expect(salida.entregadas).toHaveLength(1);
    expect(base.campo('comandas', 'estado')).toBe('entregado');
    expect(base.campo('mesas', 'estado')).toBe('ocupada');
  });
});
