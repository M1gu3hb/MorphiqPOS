import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { cancelarOrden } from './cancelacion.ts';
import { solicitarCuenta } from './cuenta.ts';
import { abrirMesa, liberarMesa } from './mesas.ts';
import { enviarPedido } from './pedido.ts';
import {
  contextoFalso,
  crearBaseFalsa,
  type OpcionesBase,
  type TablasFalsas,
} from './pruebas/base-falsa.ts';
import {
  ambitoDe,
  PREDETERMINADOS,
  CARRITO_MOSTRADOR,
  comanda,
  comandaItem,
  CUENTA,
  estacionGeneral,
  linea,
  mesa,
  MESA_5,
  ordenDeMesa,
  ordenDeMostrador,
  producto,
  PRODUCTO,
} from './pruebas/sala.ts';

/**
 * Los DOS BLOQUEANTES del veredicto, escritos como pruebas que los ejecutan.
 *
 * La suite anterior tenía 48 pruebas y los seis comandos al 0 % de cobertura:
 * sólo tocaba la tabla de transiciones, el reparto por estación y la forma de
 * los esquemas. Ninguna de aquellas pruebas podía cazar ninguno de los dos
 * fallos, porque ninguna llegaba a ejecutar una línea de un comando. Éstas sí:
 * corren el cuerpo entero contra una base en memoria y afirman sobre las filas
 * que quedaron escritas.
 */

/**
 * Toda prueba siembra los `default` del DDL: los comandos omiten esas columnas
 * a propósito porque las rellena la base.
 */
const baseDe = (datos: TablasFalsas, opciones: OpcionesBase = {}) =>
  crearBaseFalsa(datos, { predeterminados: PREDETERMINADOS, ...opciones });

const CODIGO = (error: unknown): string =>
  esErrorDominio(error) ? error.codigo : `INESPERADO:${String(error)}`;

async function fallaCon(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
    return 'NO_LANZO';
  } catch (error) {
    return CODIGO(error);
  }
}

const UNA_LINEA = { orden_lineas: [linea()] };

// ───────────────────────────────────── BLOQUEANTE 2 · el carrito envenenado

describe('bloqueante 2 · un carrito de mostrador no entra al flujo de restaurante', () => {
  it('solicitar_cuenta rechaza la venta de mostrador y NO la toca', async () => {
    // El cajero tiene un carrito abierto y alguien teclea ESE id en
    // /api/restaurante/solicitar-cuenta. Antes: la venta salía de 'borrador',
    // se le pisaban los totales y se le estampaba un código «M00-####».
    const base = baseDe({
      ordenes: [ordenDeMostrador()],
      orden_lineas: [linea({ orden_id: CARRITO_MOSTRADOR })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const codigo = await fallaCon(
      solicitarCuenta.ejecutar(ctx, { ordenId: CARRITO_MOSTRADOR, propinaPuntosBase: 1000 }),
    );

    expect(codigo).toBe('ORDEN_NO_ENCONTRADA');
    // Lo que importa no es el error: es que la venta siga siendo cobrable.
    expect(base.campo('ordenes', 'estado')).toBe('borrador');
    expect(base.campo('ordenes', 'codigo_caja')).toBeNull();
  });

  it('enviar_pedido rechaza la venta de mostrador sin escribir comandas', async () => {
    const base = baseDe({
      ordenes: [ordenDeMostrador()],
      productos: [producto()],
      estaciones_preparacion: [estacionGeneral()],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'));

    const codigo = await fallaCon(
      enviarPedido.ejecutar(ctx, {
        ordenId: CARRITO_MOSTRADOR,
        lineas: [{ productoId: PRODUCTO, cantidad: '1' }],
      }),
    );

    expect(codigo).toBe('ORDEN_NO_ENCONTRADA');
    expect(base.filas('comandas')).toHaveLength(0);
    expect(base.filas('orden_lineas')).toHaveLength(0);
    expect(base.campo('ordenes', 'estado')).toBe('borrador');
  });

  it('la misma llamada sobre una cuenta de MESA sí funciona', async () => {
    // El contraste importa: una guarda que rechaza todo también «pasaría» la
    // prueba de arriba. Ésta es la que impide cerrarla de más.
    const base = baseDe({
      ordenes: [ordenDeMesa('confirmada')],
      mesas: [mesa('pedido_enviado')],
      ...UNA_LINEA,
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const precuenta = await solicitarCuenta.ejecutar(ctx, { ordenId: CUENTA });

    expect(precuenta.codigoCaja).toMatch(/^M05-\d{4}$/);
    expect(base.campo('ordenes', 'estado')).toBe('cuenta_solicitada');
  });
});

// ───────────────────────────────── BLOQUEANTE 1 · la mesa vuelve al servicio

describe('bloqueante 1 · cancelar_orden es la salida que faltaba', () => {
  const salonConCuentaViva = () =>
    baseDe({
      ordenes: [ordenDeMesa('confirmada')],
      mesas: [mesa('pedido_enviado')],
      comandas: [comanda('nuevo')],
      comanda_items: [comandaItem('pendiente')],
      ...UNA_LINEA,
    });

  it('anula la cuenta con motivo, apaga la cocina y libera la mesa', async () => {
    const base = salonConCuentaViva();
    const ahora = new Date('2026-09-09T21:30:00.000Z');
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), ahora);

    const salida = await cancelarOrden.ejecutar(ctx, {
      ordenId: CUENTA,
      motivo: 'El cliente se fue sin consumir',
    });

    expect(salida.mesaLiberada).toBe(true);
    expect(salida.comandasCanceladas).toBe(1);

    expect(base.campo('ordenes', 'estado')).toBe('cancelada');
    expect(base.campo('ordenes', 'motivo_cancelacion')).toBe('El cliente se fue sin consumir');
    // Los `check` de la tabla se cumplen juntos o la fila no entra.
    expect(base.campo('ordenes', 'cancelada_en')).toEqual(ahora);
    expect(base.campo('ordenes', 'cerrada_en')).toEqual(ahora);

    expect(base.campo('comandas', 'estado')).toBe('cancelado');
    expect(base.campo('comanda_items', 'estado')).toBe('cancelado');
    expect(base.campo('orden_lineas', 'estado_preparacion')).toBe('cancelado');

    // LO QUE DEVUELVE LA MESA AL SERVICIO. Sin esto, `ordenes_una_activa_por_mesa`
    // seguiría impidiendo abrir otra cuenta en la mesa 5.
    expect(base.campo('mesas', 'estado')).toBe('libre');
    expect(base.campo('mesas', 'orden_activa_id')).toBeNull();
  });

  it('tras cancelar, la mesa se puede volver a abrir', async () => {
    // La prueba del veredicto entera: mesa fuera de servicio → mesa operando.
    const base = salonConCuentaViva();
    const primera = contextoFalso(base.tx, ambitoDe('cajero'));
    await cancelarOrden.ejecutar(primera.ctx, { ordenId: CUENTA, motivo: 'Mesa abandonada' });

    const segunda = contextoFalso(base.tx, ambitoDe('mesero'));
    const apertura = await abrirMesa.ejecutar(segunda.ctx, {
      mesaId: MESA_5,
      personas: 2,
      celebracionEspecial: false,
    });

    expect(apertura.estadoMesa).toBe('esperando_orden');
    expect(base.filas('ordenes')).toHaveLength(2);
    expect(base.campo('mesas', 'orden_activa_id')).toBe(apertura.ordenId);
  });

  it('el segundo toque no es un error: no vuelve a escribir', async () => {
    const base = baseDe({
      ordenes: [ordenDeMesa('cancelada', { motivo_cancelacion: 'Ya estaba' })],
      mesas: [mesa('libre', { orden_activa_id: null })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'));

    const salida = await cancelarOrden.ejecutar(ctx, { ordenId: CUENTA, motivo: 'Otro motivo' });

    expect(salida.yaEstabaCancelada).toBe(true);
    expect(base.campo('ordenes', 'motivo_cancelacion')).toBe('Ya estaba');
  });

  it('una cuenta ya cobrada no se cancela: se reembolsa', async () => {
    const base = baseDe({
      ordenes: [ordenDeMesa('pagada', { folio: 12n })],
      mesas: [mesa('pagada')],
      ...UNA_LINEA,
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('administrador'));

    const codigo = await fallaCon(
      cancelarOrden.ejecutar(ctx, { ordenId: CUENTA, motivo: 'Me equivoqué' }),
    );

    expect(codigo).toBe('ORDEN_NO_EDITABLE');
    expect(base.campo('ordenes', 'estado')).toBe('pagada');
  });

  it('el mesero no puede anular una cuenta, y el motivo es obligatorio', async () => {
    // La autorización sale de `ctx.ambito.rol` (sesión del servidor), no del
    // cuerpo: aquí se afirma sobre la DECLARACIÓN, que es lo que lee `comando()`.
    expect(cancelarOrden.roles).not.toContain('mesero');
    expect(cancelarOrden.roles).toContain('cajero');
    expect(cancelarOrden.entrada.safeParse({ ordenId: CUENTA }).success).toBe(false);
    expect(cancelarOrden.entrada.safeParse({ ordenId: CUENTA, motivo: '  ' }).success).toBe(false);
  });

  it('cancelar_orden tampoco acepta una venta de mostrador', async () => {
    const base = baseDe({ ordenes: [ordenDeMostrador()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const codigo = await fallaCon(
      cancelarOrden.ejecutar(ctx, { ordenId: CARRITO_MOSTRADOR, motivo: 'No es mía' }),
    );

    expect(codigo).toBe('ORDEN_NO_ENCONTRADA');
    expect(base.campo('ordenes', 'estado')).toBe('borrador');
  });
});

describe('liberar_mesa sigue negándose a borrar una cuenta sin cobrar', () => {
  it('falla con MESA_NO_LIBERABLE cuando la cuenta tiene consumo', async () => {
    const base = baseDe({
      ordenes: [ordenDeMesa('confirmada')],
      mesas: [mesa('pedido_enviado')],
      ...UNA_LINEA,
    });
    const { ctx, pasos } = contextoFalso(base.tx, ambitoDe('mesero'));

    const codigo = await fallaCon(liberarMesa.ejecutar(ctx, { mesaId: MESA_5 }));

    expect(codigo).toBe('MESA_NO_LIBERABLE');
    expect(base.campo('mesas', 'estado')).toBe('pedido_enviado');
    // La lectura que decide tiene nombre de paso: el arnés puede interrumpirla.
    expect(pasos).toContain('mirar_consumo');
  });

  it('la apertura sin consumo sí se cancela al liberar', async () => {
    const base = baseDe({
      ordenes: [ordenDeMesa('borrador')],
      mesas: [mesa('esperando_orden')],
      orden_lineas: [],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'));

    const salida = await liberarMesa.ejecutar(ctx, { mesaId: MESA_5 });

    expect(salida.ordenCancelada).toBe(CUENTA);
    expect(base.campo('ordenes', 'estado')).toBe('cancelada');
    expect(base.campo('mesas', 'estado')).toBe('libre');
  });
});
