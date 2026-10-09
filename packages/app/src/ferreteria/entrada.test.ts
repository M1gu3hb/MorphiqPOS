import { esErrorDominio } from '@morphiqpos/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SESION_CAJA, SUCURSAL, TERMINAL } from '../restaurante/pruebas/sala.ts';
import { entradaRecibirEntrada, recibirEntrada } from './entrada.ts';

// La foto que el sistema acepta es la que devolvió `archivos/subir`: del origen de
// `APP_URL` y bajo `privado/<este negocio>/` (auditoría de la 2.4).
beforeAll(() => {
  vi.stubEnv('APP_URL', 'https://pos.example.mx');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

/**
 * F-631 · Guardar la entrada del proveedor (`compras.recibir_entrada`).
 *
 * No tenía pruebas. Lo que éstas defienden: que una entrada sin renglones no se
 * guarde, que a crédito exija el folio, que la CLAVE DEL PROVEEDOR de cada renglón
 * quede en la línea —es la memoria con que se empareja la nota siguiente— y que la
 * foto de la nota en papel quede en las notas de la compra (C.10 de la 2.4).
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const ALMACEN = 'e3000000-0000-4000-8000-000000000001';
const PROVEEDOR = 'e4000000-0000-4000-8000-000000000001';
const CABLE = 'e1000000-0000-4000-8000-000000000001';
const FOTO = `https://pos.example.mx/api/archivos/privado/${ORG}/2026/09/00000002-0000-4000-8000-000000000002.jpg`;

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      almacenes: [
        {
          id: ALMACEN,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          nombre: 'Bodega',
          activo: true,
          principal: true,
        },
      ],
      proveedores: [
        {
          id: PROVEEDOR,
          organizacion_id: ORG,
          nombre: 'Distribuidora del Norte',
          dias_credito: 30,
          activo: true,
        },
      ],
      insumos: [
        {
          id: CABLE,
          organizacion_id: ORG,
          nombre: 'Cable THW calibre 12',
          unidad_base: 'm',
          costo_unitario_centavos: 900n,
          activo: true,
        },
      ],
      productos: [],
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
      filasCrudas: [{ siguiente: 1n, serie: 'A', cantidad: '100.0000' }],
      predeterminados: {
        caducidades: { consumida: '0.0000', compra_id: null, registrada_por: null },
        compra_lineas: { caduca_el: null, notas: null, clave_proveedor: null },
        movimientos_stock: { idempotency_key: null, sesion_caja_id: null },
        movimientos_caja: { referencia_tipo: null, referencia_id: null, motivo: null },
      },
    },
  );
}

const renglon = (cambios: Record<string, unknown> = {}) => ({
  insumoId: CABLE,
  cantidadCapturada: '1',
  unidadCapturada: 'rollo',
  equivalencia: '100',
  costoTotal: '950.00',
  ...cambios,
});

const deContado = (cambios: Record<string, unknown> = {}) =>
  entradaRecibirEntrada.parse({
    proveedorId: PROVEEDOR,
    folio: null,
    aCredito: false,
    dias: null,
    camino: 'archivo',
    lineas: [renglon()],
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

describe('F-631 · guardar la entrada', () => {
  it('SIN RENGLONES no es una entrada: es un botón apretado antes de capturar', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect(await codigoDe(() => recibirEntrada.ejecutar(ctx, deContado({ lineas: [] })))).toBe(
      'CONFIGURACION_INVALIDA',
    );
    expect(base.filas('compras')).toEqual([]);
  });

  it('A CRÉDITO SIN FOLIO no se guarda: el documento por pagar no se podría conciliar', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect(await codigoDe(() => recibirEntrada.ejecutar(ctx, deContado({ aCredito: true })))).toBe(
      'CONFIGURACION_INVALIDA',
    );
  });

  it('LA CLAVE DEL PROVEEDOR queda en cada línea, para emparejar sola la nota siguiente', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await recibirEntrada.ejecutar(
      ctx,
      deContado({ lineas: [renglon({ claveProveedor: 'CAB-THW-12' })] }),
    );

    expect(base.campo('compra_lineas', 'clave_proveedor')).toBe('CAB-THW-12');
  });

  it('LA FOTO DE LA NOTA queda en las notas de la compra, con el camino', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await recibirEntrada.ejecutar(ctx, deContado({ fotoDeLaNota: FOTO }));

    expect(base.campo('compras', 'notas')).toBe(
      `Entrada capturada por archivo del proveedor · foto de la nota: ${FOTO}`,
    );
  });

  it('sin foto, las notas dicen sólo el camino', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await recibirEntrada.ejecutar(ctx, deContado({ camino: 'manual' }));

    expect(base.campo('compras', 'notas')).toBe('Entrada capturada por captura manual');
  });

  it('la foto sólo si es un archivo de ESTE negocio: un enlace cualquiera no entra a la compra', async () => {
    for (const ajena of [
      'javascript:alert(1)',
      'https://archivos.morphiqpos.mx/nota.jpg',
      // El mismo origen, pero el archivo de OTRO negocio.
      'https://pos.example.mx/api/archivos/privado/22222222-2222-4222-8222-222222222222/2026/09/00000009-0000-4000-8000-000000000009.jpg',
    ]) {
      const base = baseDe();
      const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);
      await expect(
        recibirEntrada.ejecutar(ctx, deContado({ fotoDeLaNota: ajena })),
      ).rejects.toMatchObject({ codigo: 'PUENTE_CAMPO_INVALIDO' });
      expect(base.filas('compras')).toHaveLength(0);
    }
  });
});
