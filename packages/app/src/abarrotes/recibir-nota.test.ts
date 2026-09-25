import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SESION_CAJA, SUCURSAL, TERMINAL } from '../restaurante/pruebas/sala.ts';
import { recibirNota } from './recibir-nota.ts';

/**
 * F-106 + F-631 · La nota del repartidor, con sus caducidades.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que la fecha capturada en la entrada ALIMENTE la lista de la mañana. Sin la
 * fila de `caducidades`, capturarla no sirve de nada y a la semana nadie la
 * captura.
 *
 * Que la caducidad sea OPCIONAL por línea. El pan no caduca y la leche sí, y
 * obligar a contestar la fecha de los doce renglones es lo que hace que se
 * conteste cualquier cosa.
 *
 * Y que la cantidad entre en unidad BASE. La línea se capturó en cajas y la
 * existencia vive en piezas: guardar «2» donde hay 24 haría que la lista de la
 * mañana dijera que se pierden dos cartones cuando se pierden veinticuatro.
 */

const AHORA = new Date('2026-09-16T07:00:00.000Z');
const INSUMO_LECHE = 'e1000000-0000-4000-8000-000000000001';
const INSUMO_PAN = 'e1000000-0000-4000-8000-000000000002';
const PROD_LECHE = 'e2000000-0000-4000-8000-000000000001';
const ALMACEN = 'e3000000-0000-4000-8000-000000000001';
const PROVEEDOR = 'e4000000-0000-4000-8000-000000000001';

const fecha = (n: number) => new Date(AHORA.getTime() + n * 86_400_000).toISOString().slice(0, 10);

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      almacenes: [
        {
          id: ALMACEN,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          nombre: 'Trastienda',
          activo: true,
          principal: true,
        },
      ],
      proveedores: [{ id: PROVEEDOR, organizacion_id: ORG, nombre: 'Lala', activo: true }],
      insumos: [
        {
          id: INSUMO_LECHE,
          organizacion_id: ORG,
          nombre: 'Leche entera',
          unidad_base: 'pieza',
          costo_unitario_centavos: 2_000n,
          activo: true,
        },
        {
          id: INSUMO_PAN,
          organizacion_id: ORG,
          nombre: 'Bolillo',
          unidad_base: 'pieza',
          costo_unitario_centavos: 200n,
          activo: true,
        },
      ],
      productos: [
        {
          id: PROD_LECHE,
          organizacion_id: ORG,
          nombre: 'Leche entera 1 L',
          insumo_base_id: INSUMO_LECHE,
        },
      ],
      compras: [],
      compra_lineas: [],
      caducidades: [],
      movimientos_stock: [],
      existencias: [],
      sesiones_caja: [
        {
          id: SESION_CAJA,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          terminal_id: TERMINAL,
          estado: 'abierta',
        },
      ],
      movimientos_caja: [],
      ...extra,
    },
    {
      // La base falsa contesta lo mismo a TODA consulta cruda: esta fila
      // sirve al folio (`siguiente`, `serie`) y al `upsert` de existencias
      // (`cantidad`), que son las dos que la compra hace en SQL.
      filasCrudas: [{ siguiente: 1n, serie: 'A', cantidad: '24.0000' }],
      predeterminados: {
        caducidades: { consumida: '0.0000', compra_id: null, registrada_por: null },
        compra_lineas: { caduca_el: null, notas: null, clave_proveedor: null },
        movimientos_stock: { idempotency_key: null, sesion_caja_id: null },
        movimientos_caja: { referencia_tipo: null, referencia_id: null, motivo: null },
      },
    },
  );
}

const linea = (cambios: Record<string, unknown> = {}) => ({
  insumoId: INSUMO_LECHE,
  cantidadCapturada: '2',
  unidadCapturada: 'caja',
  // Una caja trae doce cartones: la existencia vive en piezas.
  equivalencia: '12',
  costoTotal: '480.00',
  ...cambios,
});

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-106 + F-631 · recibir la nota', () => {
  it('LA FECHA ALIMENTA LA LISTA DE LA MAÑANA', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await recibirNota.ejecutar(ctx, {
      almacenId: ALMACEN,
      proveedorId: PROVEEDOR,
      lineas: [linea({ caducaEl: fecha(5) })],
    });

    expect(salida.caducidadesRegistradas).toBe(1);
    expect(base.filas('caducidades')).toHaveLength(1);
    expect(base.campo('caducidades', 'producto_id')).toBe(PROD_LECHE);
  });

  it('LA CANTIDAD ENTRA EN UNIDAD BASE', async () => {
    // Guardar «2» donde hay 24 haría que la lista dijera que se pierden dos
    // cartones cuando se pierden veinticuatro.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await recibirNota.ejecutar(ctx, {
      almacenId: ALMACEN,
      proveedorId: PROVEEDOR,
      lineas: [linea({ caducaEl: fecha(5) })],
    });

    expect(base.campo('caducidades', 'cantidad')).toBe('24.0000');
  });

  it('LA CADUCIDAD ES OPCIONAL POR LÍNEA', async () => {
    // El pan no caduca, y obligar a contestar los doce renglones hace que se
    // conteste cualquier cosa.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await recibirNota.ejecutar(ctx, {
      almacenId: ALMACEN,
      proveedorId: PROVEEDOR,
      lineas: [
        linea({ caducaEl: fecha(5) }),
        linea({
          insumoId: INSUMO_PAN,
          cantidadCapturada: '30',
          equivalencia: '1',
          costoTotal: '60.00',
        }),
      ],
    });

    expect(salida.lineas).toBe(2);
    expect(salida.caducidadesRegistradas).toBe(1);
  });

  it('la SEGUNDA caja del mismo lote suma a la fila que hay', async () => {
    const base = baseDe({
      caducidades: [
        {
          id: 'c1',
          organizacion_id: ORG,
          almacen_id: ALMACEN,
          producto_id: PROD_LECHE,
          caduca_el: fecha(5),
          cantidad: '12.0000',
          consumida: '0.0000',
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await recibirNota.ejecutar(ctx, {
      almacenId: ALMACEN,
      proveedorId: PROVEEDOR,
      lineas: [linea({ caducaEl: fecha(5) })],
    });

    expect(base.filas('caducidades')).toHaveLength(1);
    expect(base.campo('caducidades', 'cantidad')).toBe('36.0000');
  });

  it('un insumo SIN PRODUCTO se cuenta y se dice', async () => {
    // La lista de la mañana enseña qué REMATAR, y un insumo que no se vende no
    // se remata.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await recibirNota.ejecutar(ctx, {
      almacenId: ALMACEN,
      proveedorId: PROVEEDOR,
      lineas: [
        linea({
          insumoId: INSUMO_PAN,
          caducaEl: fecha(2),
          cantidadCapturada: '30',
          equivalencia: '1',
          costoTotal: '60.00',
        }),
      ],
    });

    expect(salida.sinProducto).toBe(1);
    expect(base.filas('caducidades')).toHaveLength(0);
  });

  it('el ASIENTO lo sigue haciendo la compra', async () => {
    // No se reimplementa: copiar aquí el costo promedio ponderado daría dos
    // aritméticas de costo, y la de este comando sería la que nadie revisa.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await recibirNota.ejecutar(ctx, {
      almacenId: ALMACEN,
      proveedorId: PROVEEDOR,
      lineas: [linea({ caducaEl: fecha(5) })],
    });

    expect(base.filas('compras')).toHaveLength(1);
    expect(base.filas('movimientos_stock')).toHaveLength(1);
    expect(salida.totalCentavos).toBe('48000');
  });

  it('EL CANJE EN LA MISMA NOTA: sale del inventario ligado a la compra y se descuenta (C.10)', async () => {
    // +2 cajas de leche ($480) y el repartidor se lleva 6 cartones caducados de $20.
    const base = baseDe({
      motivos_merma: [
        { clave: 'caducado', etiqueta: 'Caducado', giro: null, imputable: false, activo: true },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await recibirNota.ejecutar(ctx, {
      canjes: [{ insumoId: INSUMO_LECHE, cantidad: '6', motivo: 'caducado' }],
      almacenId: ALMACEN,
      proveedorId: PROVEEDOR,
      lineas: [linea()],
    });

    const canje = base.filas('movimientos_stock').find((m) => m['tipo'] === 'devolucion_proveedor');
    expect(canje?.['cantidad']).toBe('-6');
    expect(canje?.['referencia_tipo']).toBe('compra');
    expect(canje?.['referencia_id']).toBe(salida.compraId);
    expect(canje?.['motivo']).toBe('caducado');
    // $480 de la nota menos $120 del canje: lo que se le paga al proveedor.
    expect(salida.canjeCentavos).toBe('12000');
    expect(salida.totalCentavos).toBe('36000');
    expect(base.campo('compras', 'total_centavos')).toBe(36_000n);
  });

  it('un canje con un motivo que no existe no mueve nada del canje', async () => {
    const base = baseDe({ motivos_merma: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      recibirNota.ejecutar(ctx, {
        canjes: [{ insumoId: INSUMO_LECHE, cantidad: '6', motivo: 'inventado' }],
        almacenId: ALMACEN,
        proveedorId: PROVEEDOR,
        lineas: [linea()],
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
    // Se comprueba ANTES de la compra: ni la nota ni el canje.
    expect(base.filas('compras')).toHaveLength(0);
  });

  it('un almacén de otro negocio no existe', async () => {
    const base = baseDe({ almacenes: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      recibirNota.ejecutar(ctx, {
        almacenId: ALMACEN,
        proveedorId: PROVEEDOR,
        lineas: [linea({ caducaEl: fecha(5) })],
      }),
    );

    expect(codigo).toBe('PUENTE_NO_ENCONTRADO');
    expect(base.filas('compras')).toHaveLength(0);
  });
});
