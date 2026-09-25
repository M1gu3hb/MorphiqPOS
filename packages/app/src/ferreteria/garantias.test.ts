import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { garantiasPendientes, recibirGarantia, resolverGarantia } from './garantias.ts';

/**
 * F-146 · La garantía que se mandó al proveedor y no ha vuelto.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que «se la cambié» y «se la debo» sean cosas distintas. Sólo en la primera
 * salió una pieza buena del anaquel, y contarlas igual deja el inventario
 * corto o largo para siempre según cuál de las dos se confunda.
 *
 * Que cerrar una garantía SIN decir cómo acabó se rechace: la deja contando
 * como pendiente para siempre, que es justo el número que esto viene a
 * arreglar.
 *
 * Y que el ticket NO sea obligatorio. Media ferretería acepta la garantía con
 * la caja, y exigirlo es perder al cliente para ahorrarse una columna nula.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const PROVEEDOR = 'f5000000-0000-4000-8000-000000000001';
const TALADRO = 'f1000000-0000-4000-8000-000000000009';
const INSUMO = 'f3000000-0000-4000-8000-000000000009';
const ALMACEN = 'f2000000-0000-4000-8000-000000000001';
const GARANTIA = 'f6000000-0000-4000-8000-000000000001';

const dias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000);

function garantia(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: GARANTIA,
    organizacion_id: ORG,
    proveedor_id: PROVEEDOR,
    producto_id: TALADRO,
    piezas: 1,
    costo_unitario_centavos: 120_000n,
    falla: 'no enciende',
    estado: 'recibida',
    recibida_en: dias(-20),
    repuesta_al_cliente: true,
    ...cambios,
  };
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      productos: [
        {
          id: TALADRO,
          organizacion_id: ORG,
          nombre: 'Taladro 1/2',
          costo_unitario_centavos: 120_000n,
          insumo_base_id: INSUMO,
        },
      ],
      proveedores: [{ id: PROVEEDOR, organizacion_id: ORG, nombre: 'Distribuidora del Norte' }],
      garantias_proveedor: [],
      movimientos_stock: [],
      ...extra,
    },
    {
      predeterminados: {
        garantias_proveedor: {
          orden_id: null,
          cliente_id: null,
          enviada_en: null,
          folio_proveedor: null,
          resuelta_en: null,
          resolucion: null,
          empleado_id: null,
        },
        movimientos_stock: { idempotency_key: null, sesion_caja_id: null },
      },
    },
  );
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-146 · recibir la garantía', () => {
  it('SIN TICKET se recibe igual', async () => {
    // Exigirlo es perder al cliente para ahorrarse una columna nula.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await recibirGarantia.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      productoId: TALADRO,
      piezas: 1,
      falla: 'no enciende',
      ordenId: null,
      clienteId: null,
      repuestaAlCliente: true,
      almacenId: ALMACEN,
    });

    expect(salida.estado).toBe('recibida');
    expect(salida.valorEnLimboCentavos).toBe('120000');
  });

  it('REPONER AL CLIENTE saca una pieza del anaquel', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await recibirGarantia.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      productoId: TALADRO,
      piezas: 2,
      falla: 'no enciende',
      ordenId: null,
      clienteId: null,
      repuestaAlCliente: true,
      almacenId: ALMACEN,
    });

    expect(base.filas('movimientos_stock')).toHaveLength(1);
    expect(base.campo('movimientos_stock', 'cantidad')).toBe('-2');
    expect(base.campo('movimientos_stock', 'tipo')).toBe('garantia_proveedor');
  });

  it('REPONER sale del insumo de REVENTA, la liga de todo lo dado de alta', async () => {
    // `insumos.producto_id` es como se liga lo que se da de alta. Leer sólo
    // `insumo_base_id` dejaba la reposición sin salida: una pieza de más para siempre.
    const base = baseDe({
      productos: [
        {
          id: TALADRO,
          organizacion_id: ORG,
          nombre: 'Taladro 1/2',
          costo_unitario_centavos: 120_000n,
          insumo_base_id: null,
        },
      ],
      insumos: [{ id: INSUMO, organizacion_id: ORG, producto_id: TALADRO }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await recibirGarantia.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      productoId: TALADRO,
      piezas: 1,
      falla: 'no enciende',
      ordenId: null,
      clienteId: null,
      repuestaAlCliente: true,
      almacenId: ALMACEN,
    });

    expect(base.campo('movimientos_stock', 'insumo_id')).toBe(INSUMO);
  });

  it('NO REPONERLA no mueve nada del anaquel', async () => {
    // «Se la debo» no sacó ninguna pieza buena. Contar una salida aquí dejaría
    // el inventario corto para siempre.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await recibirGarantia.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      productoId: TALADRO,
      piezas: 1,
      falla: 'no enciende',
      ordenId: null,
      clienteId: null,
      repuestaAlCliente: false,
      almacenId: ALMACEN,
    });

    expect(salida.repuestaAlCliente).toBe(false);
    expect(base.filas('movimientos_stock')).toHaveLength(0);
  });

  it('el COSTO SE CONGELA al recibirla', async () => {
    // El proveedor puede subir el precio mañana y lo que está en limbo vale lo
    // que valía el día que salió.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await recibirGarantia.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      productoId: TALADRO,
      piezas: 1,
      falla: 'no enciende',
      ordenId: null,
      clienteId: null,
      repuestaAlCliente: true,
      almacenId: ALMACEN,
    });

    expect(base.campo('garantias_proveedor', 'costo_unitario_centavos')).toBe(120_000n);
  });

  it('un proveedor de otro negocio no existe', async () => {
    const base = baseDe({ proveedores: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      recibirGarantia.ejecutar(ctx, {
        proveedorId: PROVEEDOR,
        productoId: TALADRO,
        piezas: 1,
        falla: 'no enciende',
        ordenId: null,
        clienteId: null,
        repuestaAlCliente: true,
        almacenId: ALMACEN,
      }),
    );

    expect(codigo).toBe('PUENTE_NO_ENCONTRADO');
  });
});

describe('F-146 · resolverla', () => {
  it('enviarla le pone fecha de envío', async () => {
    const base = baseDe({ garantias_proveedor: [garantia()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await resolverGarantia.ejecutar(ctx, {
      garantiaId: GARANTIA,
      estado: 'enviada',
      folioProveedor: 'G-9021',
      resolucion: null,
    });

    expect(salida.estado).toBe('enviada');
    expect(base.campo('garantias_proveedor', 'enviada_en')).toEqual(AHORA);
    // Sigue en limbo: se mandó, no volvió.
    expect(salida.valorEnLimboCentavos).toBe('120000');
  });

  it('CERRARLA SIN DECIR CÓMO ACABÓ SE RECHAZA', async () => {
    // La deja contando como pendiente para siempre.
    const base = baseDe({ garantias_proveedor: [garantia({ estado: 'enviada' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const codigo = await codigoDe(() =>
      resolverGarantia.ejecutar(ctx, {
        garantiaId: GARANTIA,
        estado: 'repuesta',
        folioProveedor: null,
        resolucion: null,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
    expect(base.campo('garantias_proveedor', 'estado')).toBe('enviada');
  });

  it('cerrarla la saca del limbo', async () => {
    const base = baseDe({ garantias_proveedor: [garantia({ estado: 'enviada' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await resolverGarantia.ejecutar(ctx, {
      garantiaId: GARANTIA,
      estado: 'repuesta',
      folioProveedor: 'G-9021',
      resolucion: 'llegó el reemplazo el 16',
    });

    expect(salida.valorEnLimboCentavos).toBe('0');
    expect(base.campo('garantias_proveedor', 'resuelta_en')).toEqual(AHORA);
  });

  it('una garantía ya resuelta no se vuelve a resolver', async () => {
    const base = baseDe({
      garantias_proveedor: [
        garantia({ estado: 'repuesta', resuelta_en: dias(-1), resolucion: 'ya llegó' }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const codigo = await codigoDe(() =>
      resolverGarantia.ejecutar(ctx, {
        garantiaId: GARANTIA,
        estado: 'rechazada',
        folioProveedor: null,
        resolucion: 'el proveedor dice que no',
      }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
  });
});

describe('F-146 · lo que está en limbo', () => {
  it('suma el valor y dice CUÁNTO LLEVA ESPERANDO lo más viejo', async () => {
    // Es el número de la conversación con el proveedor.
    const base = baseDe({
      garantias_proveedor: [
        garantia({ id: 'g1', recibida_en: dias(-90) }),
        garantia({ id: 'g2', recibida_en: dias(-10), piezas: 2 }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await garantiasPendientes.ejecutar(ctx, { proveedorId: null });

    expect(salida.totalCentavos).toBe('360000');
    expect(salida.diasDelMasViejo).toBe(90);
  });

  it('lo RESUELTO ya no cuenta', async () => {
    const base = baseDe({
      garantias_proveedor: [
        garantia({ id: 'g1' }),
        garantia({
          id: 'g2',
          estado: 'repuesta',
          resuelta_en: dias(-1),
          resolucion: 'ok cambiada',
        }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await garantiasPendientes.ejecutar(ctx, { proveedorId: null });

    expect(salida.pendientes).toHaveLength(1);
    expect(salida.totalCentavos).toBe('120000');
  });

  it('sin garantías vivas el limbo es cero, no un hueco', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await garantiasPendientes.ejecutar(ctx, { proveedorId: null });

    expect(salida.totalCentavos).toBe('0');
    expect(salida.diasDelMasViejo).toBe(0);
  });
});
