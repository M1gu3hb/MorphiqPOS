import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, PRODUCTO, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { calcularConsumo } from '@morphiqpos/domain/inventario';

import {
  comoConsumoInterno,
  planearConsumoInterno,
  registrarConsumoInterno,
} from './consumo-interno.ts';

/**
 * F-261 · La comida del personal y las cortesías.
 *
 * Lo que vigilan estas pruebas es la regla entera de esta función: **sale del
 * stock y NO entra a ventas.** Hoy esos platos o se registran como merma —y
 * ensucian el número con el que se persigue el desperdicio— o no se registran —y
 * salen como faltante, que es el número con el que se persigue el robo—.
 */

const ALMACEN = 'a1111111-1111-4111-8111-111111111111';
const INSUMO = 'b1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-15T15:00:00.000Z');

function producto(cambios: Fila = {}): Fila {
  return {
    id: PRODUCTO,
    organizacion_id: ORG,
    nombre: 'Enchiladas',
    sku: 'ENCH',
    codigo_barras: null,
    tipo_venta: 'precio_fijo',
    unidad_venta: 'pieza',
    precio_venta_centavos: 10_000n,
    costo_unitario_centavos: 4_000n,
    precio_mayoreo_centavos: null,
    cantidad_minima_mayoreo: null,
    unidad_variable: null,
    precio_por_unidad_variable_centavos: null,
    cantidad_minima_variable: null,
    cantidad_maxima_variable: null,
    incremento_variable: null,
    capacidad_contenedor_ml: null,
    ml_por_porcion: null,
    porciones_por_contenedor: null,
    precio_por_porcion_centavos: null,
    nombre_porcion: null,
    estrategia_consumo: 'sku',
    permite_venta_sin_stock: true,
    activo: true,
    insumo_base_id: null,
    // Columnas del `leftJoin` con `insumos`. La base falsa resuelve sobre una
    // tabla, así que las de la otra se siembran en la misma fila —igual que
    // `producto()` de `pruebas/sala.ts` ya hace con `ib.nombre`—.
    'insumos.id': INSUMO,
    'insumos.unidad_base': 'pieza',
    ...cambios,
  };
}

function almacen(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    almacenes: [
      {
        id: ALMACEN,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        nombre: 'Principal',
        activo: true,
      },
    ],
    productos: [producto()],
    insumos: [
      {
        id: INSUMO,
        organizacion_id: ORG,
        producto_id: PRODUCTO,
        nombre: 'Enchiladas',
        unidad_base: 'pieza',
        costo_unitario_centavos: 4_000n,
      },
    ],
    existencias: [
      { organizacion_id: ORG, almacen_id: ALMACEN, insumo_id: INSUMO, cantidad: '10.0000' },
    ],
    producto_recetas: [],
    movimientos_stock: [],
    consumos_internos: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(almacen(extra), { filasCrudas: [{ cantidad: '8.0000' }] });

const DOS_PLATOS = {
  tipo: 'personal' as const,
  productoId: PRODUCTO,
  cantidad: '2',
  motivo: 'comida del turno de la tarde',
};

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-261 · registrar lo que se come el personal', () => {
  it('queda el registro con su tipo, su motivo y quién lo autorizó', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await registrarConsumoInterno.ejecutar(ctx, DOS_PLATOS);

    const fila = base.filas('consumos_internos')[0];
    expect(fila?.['tipo']).toBe('personal');
    expect(fila?.['motivo']).toBe('comida del turno de la tarde');
    expect(fila?.['producto_nombre']).toBe('Enchiladas');
    expect(fila?.['empleado_id']).toBe('55555555-5555-4555-8555-555555555555');
    expect(fila?.['orden_id']).toBeNull();
  });

  it('EL COSTO LO CALCULA EL SERVIDOR, de la receta', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await registrarConsumoInterno.ejecutar(ctx, DOS_PLATOS);

    // Dos piezas a $40 de costo: $80.
    expect(salida.costoCentavos).toBe('8000');
    expect(base.campo('consumos_internos', 'costo_centavos')).toBe(8_000n);
  });

  it('EL CLIENTE NO MANDA EL COSTO: la entrada no lo acepta', () => {
    const analisis = registrarConsumoInterno.entrada.safeParse({
      ...DOS_PLATOS,
      costoCentavos: 1,
      costo_centavos: 1,
    });
    expect(analisis.success).toBe(true);
    expect(analisis.success ? Object.keys(analisis.data).sort() : []).toEqual([
      'cantidad',
      'motivo',
      'productoId',
      'tipo',
    ]);
  });

  it('descuenta del almacén el insumo del producto', async () => {
    const base = baseDe();
    const { ctx, pasos } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await registrarConsumoInterno.ejecutar(ctx, DOS_PLATOS);

    expect(salida.insumosDescontados).toBe(1);
    // `aplicarMovimientos` escribe el ledger con SQL crudo, que la base falsa
    // no observa. Lo que sí se puede afirmar aquí es que el paso corrió; el
    // reetiquetado se comprueba abajo, sobre la función pura.
    expect(pasos).toContain('descontar_stock');
  });

  it('NO TOCA `ordenes`: no hay ruta por la que se convierta en venta', async () => {
    const base = baseDe({ ordenes: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await registrarConsumoInterno.ejecutar(ctx, DOS_PLATOS);

    expect(base.filas('ordenes')).toEqual([]);
  });

  it('una CORTESÍA sí cuelga de la cuenta a la que se le regaló', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await registrarConsumoInterno.ejecutar(ctx, {
      ...DOS_PLATOS,
      tipo: 'cortesia',
      ordenId: '77777777-7777-4777-8777-777777777777',
      motivo: 'cliente frecuente',
    });

    expect(base.campo('consumos_internos', 'orden_id')).toBe(
      '77777777-7777-4777-8777-777777777777',
    );
  });

  it('LA COMIDA DEL PERSONAL NO cuelga de ninguna cuenta', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect(
      await codigoDe(() =>
        registrarConsumoInterno.ejecutar(ctx, {
          ...DOS_PLATOS,
          ordenId: '77777777-7777-4777-8777-777777777777',
        }),
      ),
    ).toBe('INVENTARIO_INVALIDO');
    expect(base.filas('consumos_internos')).toEqual([]);
  });

  it('un producto que no está en el catálogo', async () => {
    const base = baseDe({ productos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect(await codigoDe(() => registrarConsumoInterno.ejecutar(ctx, DOS_PLATOS))).toBe(
      'PRODUCTO_NO_ENCONTRADO',
    );
  });

  it('una sucursal sin almacén no tiene de dónde descontar', async () => {
    const base = baseDe({ almacenes: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect(await codigoDe(() => registrarConsumoInterno.ejecutar(ctx, DOS_PLATOS))).toBe(
      'INVENTARIO_INVALIDO',
    );
  });

  it('UN SERVICIO no descuenta nada, y no es un error', async () => {
    const base = baseDe({
      productos: [producto({ estrategia_consumo: 'ninguno' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await registrarConsumoInterno.ejecutar(ctx, DOS_PLATOS);

    expect(salida.insumosDescontados).toBe(0);
    expect(salida.costoCentavos).toBe('0');
    // El registro queda igual: alguien se comió algo y está anotado.
    expect(base.filas('consumos_internos')).toHaveLength(1);
  });

  it('LO AUTORIZA QUIEN RESPONDE DEL INVENTARIO, no quien se lo come', () => {
    expect(registrarConsumoInterno.roles).not.toContain('cocina');
    expect(registrarConsumoInterno.roles).not.toContain('mesero');
    expect(registrarConsumoInterno.roles).not.toContain('cajero');
    expect(registrarConsumoInterno.roles).toContain('gerente');
  });

  it('el motivo es obligatorio y no vale un espacio', () => {
    expect(registrarConsumoInterno.entrada.safeParse({ ...DOS_PLATOS, motivo: '  ' }).success).toBe(
      false,
    );
  });

  it('LA CANTIDAD ES TEXTO: 0.1 + 0.2 no es 0.3', () => {
    expect(registrarConsumoInterno.entrada.safeParse({ ...DOS_PLATOS, cantidad: 2 }).success).toBe(
      false,
    );
    expect(
      registrarConsumoInterno.entrada.safeParse({ ...DOS_PLATOS, cantidad: '0.3500' }).success,
    ).toBe(true);
  });

  it('SALE DEL STOCK como movimiento de consumo interno, NO de venta', () => {
    // Si esto dijera `salida_venta`, el costo de ventas incluiría lo que nadie
    // pagó, que es exactamente lo que F-261 viene a separar.
    const [movimiento] = comoConsumoInterno(
      [
        {
          organizacionId: ORG,
          almacenId: ALMACEN,
          insumoId: INSUMO,
          tipo: 'salida_venta',
          cantidad: '2.0000',
          unidad: 'pieza',
          permiteNegativo: false,
          referenciaTipo: 'orden',
          referenciaId: 'una-orden',
          idempotencyKey: 'inventario:una-orden:insumo',
          origenes: ['linea'],
        },
      ],
      'consumo-1',
      'empleo-1',
    );

    expect(movimiento?.tipo).toBe('salida_consumo_interno');
    expect(movimiento?.referenciaTipo).toBe('consumo_interno');
    expect(movimiento?.referenciaId).toBe('consumo-1');
    expect(movimiento?.empleadoId).toBe('empleo-1');
    // La clave de idempotencia también cambia: si conservara la de la orden,
    // dos consumos del mismo insumo se pisarían entre sí.
    expect(movimiento?.idempotencyKey).toBe('consumo_interno:consumo-1:' + INSUMO);
    // Lo que NO cambia: el insumo, la cantidad y la unidad. Es la misma receta
    // que descontaría el cobro, porque el plato lleva los mismos ingredientes.
    expect(movimiento?.insumoId).toBe(INSUMO);
    expect(movimiento?.cantidad).toBe('2.0000');
  });

  it('UN CONSUMO INTERNO NO DEJA EL ALMACÉN EN NEGATIVO: si no hay, no se comió', () => {
    // Al COBRAR sí se permite, porque el cliente ya se llevó el plato y el
    // dinero está en el cajón. Aquí no: la comida del personal que no existe no
    // se sirvió, y permitirlo convertiría esta función en la puerta por la que
    // el inventario se vuelve negativo sin que nadie lo note.
    const movimientos = calcularConsumo(
      planearConsumoInterno(
        { organizacionId: ORG, almacenId: ALMACEN, empleadoId: 'empleo-1', cantidad: '2' },
        {
          ...(producto() as unknown as Parameters<typeof planearConsumoInterno>[1]),
          id: PRODUCTO,
          estrategiaConsumo: 'sku',
          insumoId: INSUMO,
          unidadBaseInsumo: 'pieza',
          unidadVenta: 'pieza',
          permiteVentaSinStock: true,
        },
        [],
      ),
    );

    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]?.permiteNegativo).toBe(false);
  });

  it('un tipo inventado no entra', () => {
    expect(
      registrarConsumoInterno.entrada.safeParse({ ...DOS_PLATOS, tipo: 'regalo' }).success,
    ).toBe(false);
  });
});
