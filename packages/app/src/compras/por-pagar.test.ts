import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { loQueDebo, pagarAProveedor, registrarPorPagar } from './por-pagar.ts';

/**
 * F-635 · Cuentas por pagar.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que el pago se aplique a LO MÁS VIEJO primero. Aplicarlo a la factura más
 * nueva deja para siempre una de hace dos años en el tramo de 90 días: el
 * proveedor ve mora crónica donde sólo hay una aplicación mal hecha, y corta el
 * crédito por un error de captura.
 *
 * Y que el mismo folio del mismo proveedor no entre dos veces. La factura
 * capturada dos veces es la factura que se paga dos veces.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const PROVEEDOR = '9f000000-0000-4000-8000-000000000001';
const dias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000);

function documento(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'd1',
    organizacion_id: ORG,
    proveedor_id: PROVEEDOR,
    folio_proveedor: 'A-1',
    emitido_en: dias(-30),
    vence_en: dias(-10),
    importe_centavos: 100_000n,
    saldo_centavos: 100_000n,
    ...cambios,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(
    { documentos_por_pagar: [], pagos_a_proveedor: [], ...extra },
    {
      predeterminados: {
        documentos_por_pagar: { compra_id: null, empleado_id: null },
        pagos_a_proveedor: { documento_id: null, referencia: null, sesion_caja_id: null },
      },
    },
  );

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-635 · registrar lo que se debe', () => {
  it('nace con el saldo COMPLETO', async () => {
    // Registrarla como pagada es registrar una factura que nadie va a volver a
    // mirar.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await registrarPorPagar.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      folioProveedor: 'A-100',
      compraId: null,
      importeCentavos: 100_000,
      venceEn: dias(30).toISOString(),
    });

    expect(salida.saldoCentavos).toBe('100000');
    expect(base.filas('documentos_por_pagar')[0]?.['importe_centavos']).toBe(100_000n);
  });

  it('EL MISMO FOLIO NO ENTRA DOS VECES', async () => {
    // Es la factura que se paga dos veces.
    const base = baseDe({ documentos_por_pagar: [documento({ folio_proveedor: 'A-100' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const codigo = await codigoDe(() =>
      registrarPorPagar.ejecutar(ctx, {
        proveedorId: PROVEEDOR,
        folioProveedor: 'A-100',
        compraId: null,
        importeCentavos: 100_000,
        venceEn: dias(30).toISOString(),
      }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
    expect(base.filas('documentos_por_pagar')).toHaveLength(1);
  });

  it('una factura que NACE VENCIDA se rechaza', async () => {
    // Casi siempre es una fecha mal tecleada, y entra directa al tramo de mora:
    // el reporte del lunes dice que el negocio está atrasado cuando no lo está.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const codigo = await codigoDe(() =>
      registrarPorPagar.ejecutar(ctx, {
        proveedorId: PROVEEDOR,
        folioProveedor: 'A-200',
        compraId: null,
        importeCentavos: 100_000,
        venceEn: dias(-1).toISOString(),
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });
});

describe('F-635 · pagar', () => {
  const dos = [
    documento({ id: 'viejo', folio_proveedor: 'A-1', vence_en: dias(-60) }),
    documento({ id: 'nuevo', folio_proveedor: 'A-2', vence_en: dias(-5) }),
  ];

  it('LO MÁS VIEJO PRIMERO', async () => {
    const base = baseDe({ documentos_por_pagar: dos });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await pagarAProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      montoCentavos: 100_000,
      metodo: 'transferencia',
      referencia: null,
      sesionCajaId: null,
    });

    expect(salida.aplicaciones).toHaveLength(1);
    expect(salida.aplicaciones[0]?.documentoId).toBe('viejo');
    expect(base.filas('documentos_por_pagar')[0]?.['saldo_centavos']).toBe(0n);
    expect(base.filas('documentos_por_pagar')[1]?.['saldo_centavos']).toBe(100_000n);
  });

  it('un pago grande cubre varios EN ORDEN', async () => {
    const base = baseDe({ documentos_por_pagar: dos });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await pagarAProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      montoCentavos: 150_000,
      metodo: 'transferencia',
      referencia: null,
      sesionCajaId: null,
    });

    expect(salida.aplicaciones.map((a) => a.documentoId)).toEqual(['viejo', 'nuevo']);
    expect(salida.aplicaciones[1]?.montoCentavos).toBe('50000');
  });

  it('cuando cubre VARIOS, el pago no se ata a ninguno', async () => {
    // Atarlo al primero haría que el histórico del segundo no lo encontrara.
    const base = baseDe({ documentos_por_pagar: dos });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await pagarAProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      montoCentavos: 150_000,
      metodo: 'transferencia',
      referencia: null,
      sesionCajaId: null,
    });

    expect(base.filas('pagos_a_proveedor')[0]?.['documento_id']).toBeNull();
  });

  it('lo que SOBRA no se reparte contra lo que no ha vencido', async () => {
    // Quedaría pagado por adelantado algo que todavía se puede devolver.
    const base = baseDe({ documentos_por_pagar: [documento({ saldo_centavos: 30_000n })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await pagarAProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      montoCentavos: 50_000,
      metodo: 'efectivo',
      referencia: null,
      sesionCajaId: null,
    });

    expect(salida.sobranteCentavos).toBe('20000');
  });

  it('un documento ya saldado no se vuelve a tocar', async () => {
    const base = baseDe({ documentos_por_pagar: [documento({ saldo_centavos: 0n })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await pagarAProveedor.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      montoCentavos: 10_000,
      metodo: 'efectivo',
      referencia: null,
      sesionCajaId: null,
    });

    expect(salida.aplicaciones).toEqual([]);
    expect(salida.sobranteCentavos).toBe('10000');
  });
});

describe('F-635 · cuánto debo', () => {
  it('usa LA MISMA aritmética que la cartera de cobros', async () => {
    // Dos aritméticas para el mismo concepto acaban dando números distintos, y
    // entonces ninguno se cree.
    const base = baseDe({
      documentos_por_pagar: [
        documento({ id: 'a', folio_proveedor: 'A-1', vence_en: dias(5), saldo_centavos: 10_000n }),
        documento({
          id: 'b',
          folio_proveedor: 'A-2',
          vence_en: dias(-45),
          saldo_centavos: 30_000n,
        }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await loQueDebo.ejecutar(ctx, { proveedorId: null });

    expect(salida.totalCentavos).toBe('40000');
    // Lo por vencer NO es mora: separar los dos números es la mitad del valor.
    expect(salida.vencidoCentavos).toBe('30000');
    expect(salida.porTramo['v31_60']).toBe('30000');
    expect(salida.diasDelMasViejo).toBe(45);
  });

  it('se puede preguntar por UN proveedor', async () => {
    const base = baseDe({
      documentos_por_pagar: [
        documento({ id: 'a', folio_proveedor: 'A-1' }),
        documento({
          id: 'b',
          folio_proveedor: 'B-1',
          proveedor_id: '9f000000-0000-4000-8000-0000000000ff',
        }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await loQueDebo.ejecutar(ctx, { proveedorId: PROVEEDOR });

    expect(salida.totalCentavos).toBe('100000');
  });

  it('sin deuda, el resumen es cero y no un hueco', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await loQueDebo.ejecutar(ctx, { proveedorId: null });

    expect(salida.totalCentavos).toBe('0');
    expect(salida.diasDelMasViejo).toBe(0);
  });
});
