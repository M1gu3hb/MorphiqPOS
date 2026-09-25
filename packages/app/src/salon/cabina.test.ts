import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { abrirProducto, alcanzaLaCabina, alcanzaParaCuantos } from './cabina.ts';

/**
 * F-155 · El doble destino del mismo SKU: cabina y anaquel.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que abrir una pieza sea un TRASPASO de verdad: una pieza que sale del anaquel
 * y `factor_apertura` unidades que entran a cabina, en su unidad. Si sólo
 * entrara «uno», el consumo de tres semanas se descontaría contra una
 * existencia de uno y al segundo servicio la cabina daría negativo.
 *
 * Y que «¿alcanza?» devuelva TODOS los faltantes. Quien va a comprar hace un
 * viaje: enterarse de uno en uno son tres viajes.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const PRODUCTO = 'b0000000-0000-4000-8000-000000000001';
const INSUMO = '1a000000-0000-4000-8000-000000000002';
const OTRO_INSUMO = '1a000000-0000-4000-8000-000000000003';
const VENTA = 'a1000000-0000-4000-8000-000000000004';
const CABINA = 'a1000000-0000-4000-8000-000000000005';

function producto(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PRODUCTO,
    organizacion_id: ORG,
    nombre: 'Shampoo profesional 1 L',
    destino: 'ambos',
    factor_apertura: '1000.0000',
    unidad_cabina: 'ml',
    insumo_base_id: INSUMO,
    ...cambios,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(
    { productos: [producto()], movimientos_stock: [], existencias: [], ...extra },
    {
      predeterminados: {
        movimientos_stock: { referencia_id: null, motivo: null, empleado_id: null },
      },
    },
  );

const APERTURA = {
  productoId: PRODUCTO,
  almacenVentaId: VENTA,
  almacenCabinaId: CABINA,
  piezas: 1,
};

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-155 · abrir una pieza', () => {
  it('SALE UNA PIEZA del anaquel y ENTRA UN LITRO a cabina', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await abrirProducto.ejecutar(ctx, APERTURA);

    expect(salida.unidadesACabina).toBe('1000.0000');
    expect(salida.unidadCabina).toBe('ml');

    const movimientos = base.filas('movimientos_stock');
    expect(movimientos).toHaveLength(2);
    // Lo que sale va en NEGATIVO y en piezas.
    expect(movimientos[0]?.['cantidad']).toBe('-1');
    expect(movimientos[0]?.['almacen_id']).toBe(VENTA);
    // Lo que entra va en positivo y en mililitros. Si entrara «uno», el consumo
    // de tres semanas daría negativo al segundo servicio.
    expect(movimientos[1]?.['cantidad']).toBe('1000.0000');
    expect(movimientos[1]?.['unidad']).toBe('ml');
    expect(movimientos[1]?.['almacen_id']).toBe(CABINA);
  });

  it('abrir dos piezas multiplica el factor', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await abrirProducto.ejecutar(ctx, { ...APERTURA, piezas: 2 });

    expect(salida.unidadesACabina).toBe('2000.0000');
  });

  it('los dos movimientos llevan la MISMA referencia', async () => {
    // Es lo que permite reconstruir el traspaso después: dos movimientos
    // sueltos en dos almacenes no se pueden emparejar en el kardex.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await abrirProducto.ejecutar(ctx, APERTURA);

    const movimientos = base.filas('movimientos_stock');
    expect(movimientos[0]?.['referencia_tipo']).toBe('apertura_cabina');
    expect(movimientos[1]?.['referencia_id']).toBe(PRODUCTO);
  });

  it('LO QUE SÓLO SE VENDE NO SE ABRE', async () => {
    // Abrirlo es sacarlo del anaquel sin cobrarlo. Si de verdad se va a usar en
    // cabina, primero se marca como tal — y eso es una decisión, no un descuido.
    const base = baseDe({ productos: [producto({ destino: 'venta' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const codigo = await codigoDe(() => abrirProducto.ejecutar(ctx, APERTURA));

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
    expect(base.filas('movimientos_stock')).toEqual([]);
  });

  it('sin factor de apertura se dice QUÉ falta', async () => {
    const base = baseDe({ productos: [producto({ factor_apertura: null })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const codigo = await codigoDe(() => abrirProducto.ejecutar(ctx, APERTURA));

    expect(codigo).toBe('CATALOGO_INVALIDO');
  });

  it('un producto de otro negocio no existe para éste', async () => {
    const base = baseDe({ productos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect(await codigoDe(() => abrirProducto.ejecutar(ctx, APERTURA))).toBe(
      'PRODUCTO_NO_ENCONTRADO',
    );
  });
});

describe('F-155 · ¿alcanza la cabina para lo que está agendado?', () => {
  it('con existencia de sobra, alcanza', async () => {
    const base = baseDe({
      existencias: [
        { organizacion_id: ORG, almacen_id: CABINA, insumo_id: INSUMO, cantidad: '900.0000' },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await alcanzaLaCabina.ejecutar(ctx, {
      almacenCabinaId: CABINA,
      consumoEsperado: [{ insumoId: INSUMO, cantidadBase: '300.0000' }],
    });

    expect(salida.alcanza).toBe(true);
    expect(salida.faltantes).toEqual([]);
  });

  it('DEVUELVE TODOS LOS FALTANTES, no sólo el primero', async () => {
    // Quien va a comprar hace un viaje. Enterarse de uno en uno son tres.
    const base = baseDe({
      existencias: [
        { organizacion_id: ORG, almacen_id: CABINA, insumo_id: INSUMO, cantidad: '100.0000' },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await alcanzaLaCabina.ejecutar(ctx, {
      almacenCabinaId: CABINA,
      consumoEsperado: [
        { insumoId: INSUMO, cantidadBase: '300.0000' },
        { insumoId: OTRO_INSUMO, cantidadBase: '60.0000' },
      ],
    });

    expect(salida.alcanza).toBe(false);
    expect(salida.faltantes).toHaveLength(2);
    expect(salida.faltantes[0]?.hay).toBe('100.0000');
    // Lo que no tiene existencia cuenta como cero, no como «no se sabe».
    expect(salida.faltantes[1]?.hay).toBe('0.0000');
  });

  it('justo lo necesario SÍ alcanza', async () => {
    const base = baseDe({
      existencias: [
        { organizacion_id: ORG, almacen_id: CABINA, insumo_id: INSUMO, cantidad: '300.0000' },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await alcanzaLaCabina.ejecutar(ctx, {
      almacenCabinaId: CABINA,
      consumoEsperado: [{ insumoId: INSUMO, cantidadBase: '300.0000' }],
    });

    expect(salida.alcanza).toBe(true);
  });

  it('no mira la existencia de OTRO almacén', async () => {
    // El litro que está en el anaquel no se puede mezclar: hay que abrirlo
    // primero, y eso es justo lo que la pantalla tiene que decir.
    const base = baseDe({
      existencias: [
        { organizacion_id: ORG, almacen_id: VENTA, insumo_id: INSUMO, cantidad: '9000.0000' },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await alcanzaLaCabina.ejecutar(ctx, {
      almacenCabinaId: CABINA,
      consumoEsperado: [{ insumoId: INSUMO, cantidadBase: '10.0000' }],
    });

    expect(salida.alcanza).toBe(false);
  });
});

describe('F-155 · los dos almacenes salen de la SESIÓN cuando no se dicen', () => {
  /**
   * ── Por qué esto hacía falta ────────────────────────────────────────────
   * `estetica-salon/Productos.tsx` exigía los dos ids y `page.tsx` la montaba con
   * dos cadenas vacías: la consulta no corría NUNCA y la pantalla se quedaba en
   * blanco para siempre. Los almacenes son ámbito, y el ámbito lo sabe el servidor.
   */
  const conAlmacenes = (filas: readonly Fila[]) =>
    baseDe({
      almacenes: filas,
      insumos: [{ id: INSUMO, organizacion_id: ORG, unidad_base: 'ml', activo: true }],
      existencias: [
        { organizacion_id: ORG, almacen_id: VENTA, insumo_id: INSUMO, cantidad: '10.0000' },
      ],
    });

  const almacen = (id: string, principal: boolean): Fila => ({
    id,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    principal,
    activo: true,
  });

  it('EL PRINCIPAL ES EL DE VENTA y el otro es la cabina', async () => {
    const base = conAlmacenes([almacen(VENTA, true), almacen(CABINA, false)]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await abrirProducto.ejecutar(ctx, { productoId: PRODUCTO, piezas: 1 });

    // Sale del principal y entra al otro: si se invirtieran, la cabina surtiría al
    // anaquel y el inventario del mostrador subiría solo.
    const movimientos = base.filas('movimientos_stock');
    expect(movimientos[0]?.['almacen_id']).toBe(VENTA);
    expect(movimientos[1]?.['almacen_id']).toBe(CABINA);
  });

  it('SIN SEGUNDO ALMACÉN se dice qué falta, en vez de mezclar los dos destinos', async () => {
    const base = conAlmacenes([almacen(VENTA, true)]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const codigo = await codigoDe(() =>
      abrirProducto.ejecutar(ctx, { productoId: PRODUCTO, piezas: 1 }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
    // Y NADA se movió: un movimiento a medias deja el anaquel descontado y la
    // cabina vacía.
    expect(base.filas('movimientos_stock')).toEqual([]);
  });

  it('LO QUE SE DICE MANDA: un salón con dos sucursales sí elige', async () => {
    const base = conAlmacenes([almacen(VENTA, true), almacen(CABINA, false)]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await abrirProducto.ejecutar(ctx, APERTURA);

    expect(base.filas('movimientos_stock')[0]?.['almacen_id']).toBe(VENTA);
  });
});

/**
 * C.10 de la 2.4 · «¿Alcanza?» dice QUÉ material, en qué unidad y para cuántos servicios.
 * Antes sólo devolvía el id de los que faltaban, y la pantalla adivinaba el nombre por el
 * producto que lo surte.
 */
describe('C.10 · lo que «¿alcanza?» dice de cada material', () => {
  it('trae el nombre y la unidad de cada insumo, y también los que alcanzan', async () => {
    const base = baseDe({
      existencias: [
        { organizacion_id: ORG, almacen_id: CABINA, insumo_id: INSUMO, cantidad: '900.0000' },
      ],
      insumos: [
        { id: INSUMO, organizacion_id: ORG, nombre: 'Tinte 7.1', unidad_base: 'g' },
        { id: OTRO_INSUMO, organizacion_id: ORG, nombre: 'Oxidante 20 vol', unidad_base: 'ml' },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await alcanzaLaCabina.ejecutar(ctx, {
      almacenCabinaId: CABINA,
      consumoEsperado: [
        { insumoId: INSUMO, cantidadBase: '300.0000' },
        { insumoId: OTRO_INSUMO, cantidadBase: '60.0000' },
      ],
    });

    expect(salida.insumos).toEqual([
      expect.objectContaining({ nombre: 'Tinte 7.1', unidad: 'g', falta: false }),
      expect.objectContaining({ nombre: 'Oxidante 20 vol', unidad: 'ml', falta: true }),
    ]);
    // Con el consumo traído por quien pregunta no hay «cuántos servicios».
    expect(salida.insumos[0]?.servicios).toBeNull();
  });

  it('para cuántos servicios alcanza: hacia abajo, y nunca más de los que hay', () => {
    // Cinco tintes piden 300 g y hay 130 g: alcanza para dos.
    expect(alcanzaParaCuantos(1_300_000n, 3_000_000n, 5)).toBe(2);
    expect(alcanzaParaCuantos(9_000_000n, 3_000_000n, 5)).toBe(5);
    expect(alcanzaParaCuantos(0n, 3_000_000n, 5)).toBe(0);
    expect(alcanzaParaCuantos(1_000n, 3_000_000n, null)).toBeNull();
  });
});
