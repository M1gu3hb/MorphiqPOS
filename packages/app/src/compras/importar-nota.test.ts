import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { importarNotaDeProveedor, importeDelRenglon } from './importar-nota.ts';

/**
 * F-631 · La nota del proveedor, capturada sin teclear cien renglones.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que el ORDEN de los tres caminos se respete. Sin él, el nombre gana a la
 * clave y «TORNILLO 1/4» acaba emparejado con el de 1/4 de otra línea. La clave
 * del proveedor es exacta; el nombre es el que se equivoca.
 *
 * Que sólo el empate POR NOMBRE salga marcado como dudoso. Marcar todo obliga a
 * revisarlo todo, y entonces la importación no ahorra nada.
 *
 * Que los renglones que NO casaron se cuenten y se devuelvan: una importación
 * que silencia los quince que no reconoció es peor que no importar, porque
 * nadie va a volver a mirarlos.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const PROVEEDOR = 'f5000000-0000-4000-8000-000000000001';
const TORNILLO = 'f1000000-0000-4000-8000-000000000001';
const TUERCA = 'f1000000-0000-4000-8000-000000000002';
/** Los insumos que llevan su existencia: es a lo que entra la nota. */
const INS_TORNILLO = 'f2000000-0000-4000-8000-000000000001';
const INS_TUERCA = 'f2000000-0000-4000-8000-000000000002';

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa({
    proveedores: [{ id: PROVEEDOR, organizacion_id: ORG, nombre: 'Distribuidora del Norte' }],
    productos: [
      {
        id: TORNILLO,
        organizacion_id: ORG,
        nombre: 'Tornillo 1/4 x 2 galvanizado',
        sku: 'TOR-1425',
        codigo_barras: '7501111111111',
        costo_unitario_centavos: 100n,
        precio_venta_centavos: 180n,
        // El tornillo va ligado como se liga lo que se da de alta: desde su insumo
        // (`insumos.producto_id`). La tuerca, por la liga de consumo. Las dos cuentan.
        insumo_base_id: null,
        activo: true,
      },
      {
        id: TUERCA,
        organizacion_id: ORG,
        nombre: 'Tuerca hexagonal 1/4',
        sku: 'TUE-14',
        codigo_barras: null,
        costo_unitario_centavos: 50n,
        precio_venta_centavos: 90n,
        insumo_base_id: INS_TUERCA,
        activo: true,
      },
    ],
    insumos: [
      {
        id: INS_TORNILLO,
        organizacion_id: ORG,
        producto_id: TORNILLO,
        unidad_base: 'pieza',
        unidad_compra_default: 'caja',
        cantidad_por_compra_default: '100.0000',
        // Por PIEZA: la unidad base.
        costo_unitario_centavos: 100n,
      },
      {
        id: INS_TUERCA,
        organizacion_id: ORG,
        producto_id: null,
        unidad_base: 'pieza',
        unidad_compra_default: null,
        cantidad_por_compra_default: null,
        costo_unitario_centavos: 50n,
      },
    ],
    compras: [],
    compra_lineas: [],
    ...extra,
  });
}

const renglon = (cambios: Record<string, unknown> = {}) => ({
  claveProveedor: null,
  codigoBarras: null,
  descripcion: 'TORNILLO 1/4 X 2 GALVANIZADO',
  cantidad: '100',
  costoUnitarioCentavos: 100,
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

describe('F-631 · importar la nota', () => {
  it('LA CLAVE DEL PROVEEDOR GANA al nombre', async () => {
    // Sin el orden, «TORNILLO 1/4» acaba emparejado con el de 1/4 de otra línea.
    const base = baseDe({
      compras: [{ id: 'c1', organizacion_id: ORG, proveedor_id: PROVEEDOR, created_at: AHORA }],
      compra_lineas: [
        {
          id: 'cl1',
          organizacion_id: ORG,
          compra_id: 'c1',
          insumo_id: INS_TUERCA,
          clave_proveedor: 'TN-1425',
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await importarNotaDeProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      folioProveedor: 'N-9001',
      renglones: [renglon({ claveProveedor: 'TN-1425' })],
    });

    // El nombre apuntaba al tornillo; la clave manda y apunta a la tuerca: al
    // PRODUCTO por su insumo base, y al INSUMO al que entra la nota.
    expect(salida.renglones[0]?.productoId).toBe(TUERCA);
    expect(salida.renglones[0]?.insumoId).toBe(INS_TUERCA);
    // Sin presentación de compra: su unidad base, de a una.
    expect(salida.renglones[0]).toMatchObject({ unidadCompra: 'pieza', equivalencia: '1' });
    expect(salida.renglones[0]?.porQue).toBe('clave');
    expect(salida.renglones[0]?.dudoso).toBe(false);
  });

  it('el CÓDIGO DE BARRAS empareja sin marcar dudoso', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await importarNotaDeProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      folioProveedor: 'N-9001',
      renglones: [renglon({ codigoBarras: '7501111111111', descripcion: 'lo que sea' })],
    });

    expect(salida.renglones[0]?.porQue).toBe('codigo');
    expect(salida.renglones[0]?.dudoso).toBe(false);
    expect(salida.renglones[0]?.insumoId).toBe(INS_TORNILLO);
    // «3» del tornillo son 3 CAJAS de 100: la presentación viaja con el renglón.
    expect(salida.renglones[0]).toMatchObject({ unidadCompra: 'caja', equivalencia: '100.0000' });
  });

  it('SÓLO EL NOMBRE SALE MARCADO COMO DUDOSO', async () => {
    // Es el único camino que se equivoca. Marcar todo obliga a revisarlo todo.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await importarNotaDeProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      folioProveedor: 'N-9001',
      renglones: [renglon()],
    });

    expect(salida.renglones[0]?.productoId).toBe(TORNILLO);
    expect(salida.renglones[0]?.porQue).toBe('nombre');
    expect(salida.dudosos).toBe(1);
  });

  it('el nombre empareja aunque cambie el ORDEN y sobren acentos', async () => {
    // Lo que cambia entre la hoja del proveedor y el catálogo es el orden y las
    // abreviaturas, no las letras.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await importarNotaDeProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      folioProveedor: 'N-9001',
      renglones: [renglon({ descripcion: 'galvanizado tornillo 1/4 x 2' })],
    });

    expect(salida.renglones[0]?.productoId).toBe(TORNILLO);
  });

  it('LO QUE NO CASA SE CUENTA Y SE DEVUELVE', async () => {
    // Silenciar los que no reconoció es peor que no importar.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await importarNotaDeProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      folioProveedor: 'N-9001',
      renglones: [renglon({ descripcion: 'CODO PVC 90 GRADOS 2 PULGADAS' })],
    });

    expect(salida.sinEmparejar).toBe(1);
    expect(salida.renglones[0]?.productoId).toBeNull();
    expect(salida.renglones[0]?.insumoId).toBeNull();
    expect(salida.renglones[0]?.unidadCompra).toBeNull();
    expect(salida.renglones[0]?.porQue).toBe('ninguno');
  });

  it('SEÑALA las subidas fuertes de costo, POR PIEZA', async () => {
    // Una subida de más del 20 % casi nunca es el mercado: es un renglón mal
    // casado, y es lo que hay que mirar primero. La caja de 100 a $300 son $3 por
    // tornillo contra $1: el triple.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await importarNotaDeProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      folioProveedor: 'N-9001',
      renglones: [renglon({ codigoBarras: '7501111111111', costoUnitarioCentavos: 30_000 })],
    });

    expect(salida.renglones[0]).toMatchObject({
      variacionCostoBp: 20_000,
      costoAnteriorCentavos: '100',
      costoNuevoCentavos: '300',
      precioVentaCentavos: '180',
      // El mismo margen con el costo nuevo: $1.80 × 3 = $5.40.
      precioSugeridoCentavos: '540',
    });
    expect(salida.subidasFuertes).toBe(1);
  });

  it('UNA CAJA DE 100 AL MISMO COSTO POR PIEZA no es una subida', async () => {
    // Antes se comparaba el costo de la CAJA contra el de la PIEZA: toda caja salía
    // como subida fuerte de miles por ciento y el aviso dejaba de servir.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await importarNotaDeProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      folioProveedor: 'N-9001',
      renglones: [renglon({ codigoBarras: '7501111111111', costoUnitarioCentavos: 10_000 })],
    });

    expect(salida.renglones[0]).toMatchObject({
      variacionCostoBp: 0,
      precioSugeridoCentavos: null,
    });
    expect(salida.subidasFuertes).toBe(0);
  });

  it('LO QUE CASÓ POR NOMBRE trae el nombre DEL CATÁLOGO, para revisarlo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await importarNotaDeProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      folioProveedor: 'N-9001',
      renglones: [renglon()],
    });

    expect(salida.renglones[0]).toMatchObject({
      descripcion: 'TORNILLO 1/4 X 2 GALVANIZADO',
      productoNombre: 'Tornillo 1/4 x 2 galvanizado',
      dudoso: true,
    });
  });

  it('un insumo que no es de este negocio no se recibe', async () => {
    // La memoria de claves apunta a un insumo que ya no está en el catálogo.
    const base = baseDe({
      compras: [{ id: 'c1', organizacion_id: ORG, proveedor_id: PROVEEDOR, created_at: AHORA }],
      compra_lineas: [
        {
          id: 'cl1',
          organizacion_id: ORG,
          compra_id: 'c1',
          insumo_id: 'f2000000-0000-4000-8000-0000000000ff',
          clave_proveedor: 'TN-1425',
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await importarNotaDeProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      folioProveedor: 'N-9001',
      renglones: [renglon({ claveProveedor: 'TN-1425' })],
    });

    expect(salida.renglones[0]?.insumoId).toBeNull();
  });

  it('EL TOTAL respeta la cantidad con decimales: 12.5 m no se cobran como 13', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await importarNotaDeProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      folioProveedor: 'N-9001',
      renglones: [
        renglon({ cantidad: '12.5', costoUnitarioCentavos: 1_000 }),
        renglon({ cantidad: '3', costoUnitarioCentavos: 199 }),
      ],
    });

    expect(salida.totalCentavos).toBe('13097');
  });

  it('el importe del renglón va al centavo, medio hacia arriba', () => {
    expect(importeDelRenglon(1_000, '12.5')).toBe(12_500n);
    expect(importeDelRenglon(333, '0.0015')).toBe(0n);
    expect(importeDelRenglon(333, '1.0015')).toBe(333n);
    expect(importeDelRenglon(250, '0.002')).toBe(1n);
  });

  it('NO APLICA NADA: sólo propone', async () => {
    // Emparejar automáticamente doscientos renglones es meter material en
    // claves equivocadas a una escala que después nadie desenreda.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    await importarNotaDeProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      folioProveedor: 'N-9001',
      renglones: [renglon()],
    });

    expect(base.filas('compras')).toHaveLength(0);
    expect(base.filas('compra_lineas')).toHaveLength(0);
  });

  it('un proveedor de otro negocio no existe', async () => {
    const base = baseDe({ proveedores: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const codigo = await codigoDe(() =>
      importarNotaDeProveedor.ejecutar(ctx, {
        proveedorId: PROVEEDOR,
        folioProveedor: 'N-9001',
        renglones: [renglon()],
      }),
    );

    expect(codigo).toBe('PUENTE_NO_ENCONTRADO');
  });
});
