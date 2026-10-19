import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import {
  ambitoDe,
  CUENTA,
  linea,
  ORG,
  ordenDeMesa,
  PREDETERMINADOS,
  sesionCajaAbierta,
} from '../restaurante/pruebas/sala.ts';
import { cobrarOrden } from './cobrar.ts';

/**
 * EL FIADO SE COBRA EN EL COBRO (C.10 de la 2.4).
 *
 * ── El defecto ─────────────────────────────────────────────────────────────
 * El cobro de la tienda enseñaba «Fiado F11» y lo mandaba como método; la ruta y el
 * comando aceptaban sólo efectivo, tarjeta y transferencia, así que F11 contestaba «La
 * venta llegó incompleta» y la tienda no podía fiar desde su pantalla de cobro. La
 * cartera del fiado se llenaba sólo por la siembra.
 *
 * ── Lo que la regla del giro pide (`02-DINERO-Y-CAJA` §1 de abarrotes) ──────
 * La venta ocurre al ENTREGAR: suma a la venta, baja el inventario, NO suma al cajón, y
 * deja la deuda a nombre de alguien. Las cuatro cosas en una transacción, o ninguna.
 */

const CLIENTE = 'c1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-25T18:00:00.000Z');

function cliente(cambios: Fila = {}): Fila {
  return {
    id: CLIENTE,
    organizacion_id: ORG,
    nombre: 'Doña Meche',
    limite_credito_centavos: 50_000n,
    dias_plazo: 15,
    bloqueado_por_mora: false,
    ...cambios,
  };
}

function tablas(extra: TablasFalsas = {}): TablasFalsas {
  return {
    ordenes: [ordenDeMesa('borrador', { cliente_id: null })],
    orden_lineas: [linea()],
    sesiones_caja: [sesionCajaAbierta()],
    almacenes: [],
    configuracion: [],
    clientes: [cliente()],
    documentos_credito: [],
    ...extra,
  };
}

const baseDe = (extra: TablasFalsas = {}) =>
  crearBaseFalsa(tablas(extra), {
    predeterminados: {
      ...PREDETERMINADOS,
      documentos_credito: { origen_id: null, empleado_id: null },
    },
    // El folio del ticket y el del documento se toman con SQL crudo.
    filasCrudas: [{ siguiente: 1n }],
  });

async function codigoDe(promesa: Promise<unknown>): Promise<string> {
  return promesa
    .then(() => 'NO_LANZO')
    .catch((error: unknown) => (esErrorDominio(error) ? error.codigo : String(error)));
}

describe('el fiado en el cobro', () => {
  it('suma a la venta, NO al cajón, y deja la deuda a nombre del cliente', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cobrarOrden.ejecutar(ctx, {
      ordenId: CUENTA,
      clienteId: CLIENTE,
      pagos: [{ metodo: 'fiado', montoCentavos: 10_000 }],
    });

    expect(salida.totalCentavos).toBe('10000');
    expect(base.campo('ordenes', 'estado')).toBe('pagada');
    expect(base.campo('ordenes', 'cliente_id')).toBe(CLIENTE);
    expect(base.campo('pagos', 'metodo')).toBe('fiado');
    expect(base.campo('pagos', 'monto_centavos')).toBe(10_000n);
    // El cajón no se entera: no entró un peso.
    expect(base.filas('movimientos_caja')).toHaveLength(0);

    const documentos = base.filas('documentos_credito');
    expect(documentos).toHaveLength(1);
    expect(documentos[0]?.['cliente_id']).toBe(CLIENTE);
    expect(documentos[0]?.['origen_tipo']).toBe('venta');
    expect(documentos[0]?.['origen_id']).toBe(CUENTA);
    expect(documentos[0]?.['importe_centavos']).toBe(10_000n);
    expect(documentos[0]?.['saldo_centavos']).toBe(10_000n);
    // Serie propia: el fiado no se come un folio de la serie del ticket.
    expect(documentos[0]?.['folio']).toBe('CR-1');
  });

  it('mixto: lo que se pagó en efectivo va al cajón y SÓLO el resto se fía', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cobrarOrden.ejecutar(ctx, {
      ordenId: CUENTA,
      clienteId: CLIENTE,
      pagos: [
        { metodo: 'efectivo', montoCentavos: 4_000, recibidoCentavos: 4_000 },
        { metodo: 'fiado', montoCentavos: 6_000 },
      ],
    });

    expect(base.filas('movimientos_caja')).toHaveLength(1);
    expect(base.campo('movimientos_caja', 'monto_centavos')).toBe(4_000n);
    expect(base.campo('documentos_credito', 'importe_centavos')).toBe(6_000n);
  });

  it('sin cliente no se fía, y no se escribe ni un pago', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(
      cobrarOrden.ejecutar(ctx, {
        ordenId: CUENTA,
        pagos: [{ metodo: 'fiado', montoCentavos: 10_000 }],
      }),
    );

    expect(codigo).toBe('PAGO_NO_CUADRA');
    expect(base.filas('pagos')).toHaveLength(0);
    expect(base.filas('documentos_credito')).toHaveLength(0);
    expect(base.campo('ordenes', 'estado')).toBe('borrador');
  });

  it('por encima del límite, el crédito dice que no y el cobro entero falla', async () => {
    // $400 debidos de $500 de límite, y se quieren fiar $100 más.
    const base = baseDe({
      documentos_credito: [
        {
          id: 'previo',
          organizacion_id: ORG,
          cliente_id: CLIENTE,
          folio: 'CR-0',
          emitido_en: AHORA,
          vence_en: new Date(AHORA.getTime() + 10 * 86_400_000),
          importe_centavos: 45_000n,
          saldo_centavos: 45_000n,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(
      cobrarOrden.ejecutar(ctx, {
        ordenId: CUENTA,
        clienteId: CLIENTE,
        pagos: [{ metodo: 'fiado', montoCentavos: 10_000 }],
      }),
    );

    // En la base de verdad la transacción revierte el pago y el folio; aquí basta con que
    // la deuda no se haya escrito y el cobro no se haya dado por bueno.
    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
    expect(base.filas('documentos_credito')).toHaveLength(1);
  });

  it('la propina no se fía', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(
      cobrarOrden.ejecutar(ctx, {
        ordenId: CUENTA,
        clienteId: CLIENTE,
        pagos: [{ metodo: 'fiado', montoCentavos: 10_000, propinaCentavos: 1_000 }],
      }),
    );

    expect(codigo).toBe('PAGO_NO_CUADRA');
    expect(base.filas('pagos')).toHaveLength(0);
  });
});
