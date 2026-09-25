import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SESION_CAJA, SUCURSAL, TERMINAL } from '../restaurante/pruebas/sala.ts';
import {
  moverDepositoEnvase,
  registrarAbonoFiado,
  registrarComision,
  uuidDeProveedor,
} from './pasivos.ts';

/**
 * F-254, F-255 y F-256 · El dinero que pasa por el cajón y NO es del negocio.
 *
 * Hoy las recargas o se registran como venta —y destruyen el margen reportado,
 * porque la mitad de lo que pasa por el cajón no es suyo— o no se registran —y
 * el cajón sobra cada noche—. Las dos opciones son malas y hoy sólo existen
 * esas dos.
 *
 * Los tres comandos son EL MISMO movimiento con distinta naturaleza, sobre el
 * ledger que E2 construyó. Es la prueba de que «un ledger, cuatro vistas» valía
 * la pena.
 */

const CLIENTE = 'c1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-15T12:00:00.000Z');

function tienda(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    sesiones_caja: [
      {
        id: SESION_CAJA,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        terminal_id: TERMINAL,
        estado: 'abierta',
      },
    ],
    clientes: [{ id: CLIENTE, organizacion_id: ORG, nombre: 'Doña Mary' }],
    pasivos_terceros: [],
    movimientos_caja: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(tienda(extra), {
    predeterminados: {
      pasivos_terceros: {
        titular_id: null,
        referencia_id: null,
        motivo: null,
        movimiento_caja_id: null,
      },
    },
  });

const RECARGA = {
  tipo: 'recarga' as const,
  proveedorServicio: 'Telcel',
  referencia: '5512345678',
  montoRecibidoCentavos: 20_000,
  comisionNegocioCentavos: 600,
};

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-255 · la recarga que hoy destruye el margen', () => {
  it('LO DEL PROVEEDOR ES PASIVO, NO VENTA', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarComision.ejecutar(ctx, RECARGA);

    const pasivo = base.filas('pasivos_terceros')[0];
    expect(pasivo?.['naturaleza']).toBe('servicio_terceros');
    // $200 recibidos menos $6 de comisión: $194 se le deben a Telcel.
    expect(pasivo?.['monto_centavos']).toBe(19_400n);
    // Y NO hay ninguna orden: no pasó por ventas.
    expect(base.filas('ordenes')).toEqual([]);
  });

  it('LA COMISIÓN SE SEPARA EN EL MISMO ACTO', async () => {
    // Guardarla como deuda para descontarla después es lo que hace que nunca
    // se descuente.
    const base = baseDe();
    const { ctx, auditorias } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarComision.ejecutar(ctx, RECARGA);

    expect(salida.comisionNegocioCentavos).toBe('600');
    expect(salida.montoRecibidoCentavos).toBe('20000');
    expect(auditorias[0]?.payload['comisionCentavos']).toBe(600);
  });

  it('EL MOVIMIENTO DE CAJA GEMELO explica de dónde salió el dinero', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarComision.ejecutar(ctx, RECARGA);

    const movimiento = base.filas('movimientos_caja')[0];
    // Entra al cajón lo que el cliente dio, no lo que se le debe al proveedor.
    expect(movimiento?.['monto_centavos']).toBe(20_000n);
    expect(movimiento?.['referencia_id']).toBe(salida.pasivoId);
  });

  it('EL SALDO SE DERIVA DEL LEDGER, y suma recargas del mismo proveedor', async () => {
    const base = baseDe();
    const uno = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    await registrarComision.ejecutar(uno.ctx, RECARGA);

    const dos = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    const salida = await registrarComision.ejecutar(dos.ctx, RECARGA);

    expect(salida.saldoDelProveedorCentavos).toBe('38800');
  });

  it('UNA COMISIÓN QUE SE COME EL IMPORTE es un tecleo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        registrarComision.ejecutar(ctx, { ...RECARGA, comisionNegocioCentavos: 20_000 }),
      ),
    ).toBe('CONFIGURACION_INVALIDA');
    expect(base.filas('pasivos_terceros')).toEqual([]);
  });

  it('SIN CAJA ABIERTA no se registra: el pasivo quedaría sin turno', async () => {
    const base = baseDe({ sesiones_caja: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => registrarComision.ejecutar(ctx, RECARGA))).toBe('CAJA_CERRADA');
  });
});

describe('F-254 · el abono de fiado, sobre la cartera (C.10 de la 2.4)', () => {
  // Lo que la tienda fió: dos documentos, el más viejo vence primero.
  const DEBE = [
    {
      id: 'viejo',
      organizacion_id: ORG,
      cliente_id: CLIENTE,
      folio: 'CR-1',
      emitido_en: new Date(AHORA.getTime() - 20 * 86_400_000),
      vence_en: new Date(AHORA.getTime() - 5 * 86_400_000),
      importe_centavos: 3_000n,
      saldo_centavos: 3_000n,
    },
    {
      id: 'nuevo',
      organizacion_id: ORG,
      cliente_id: CLIENTE,
      folio: 'CR-2',
      emitido_en: AHORA,
      vence_en: new Date(AHORA.getTime() + 15 * 86_400_000),
      importe_centavos: 4_000n,
      saldo_centavos: 4_000n,
    },
  ];

  const conCartera = (extra: Partial<TablasFalsas> = {}) =>
    crearBaseFalsa(
      tienda({
        clientes: [
          {
            id: CLIENTE,
            organizacion_id: ORG,
            nombre: 'Doña Mary',
            limite_credito_centavos: 50_000n,
            dias_plazo: 15,
            bloqueado_por_mora: false,
          },
        ],
        documentos_credito: DEBE.map((d) => ({ ...d })),
        pagos_credito: [],
        aplicaciones_pago: [],
        ...extra,
      }),
      {
        predeterminados: {
          pagos_credito: {
            referencia: null,
            movimiento_caja_id: null,
            sesion_caja_id: null,
            sucursal_id: null,
          },
          movimientos_caja: { referencia_tipo: null, referencia_id: null, motivo: null },
        },
      },
    );

  it('BAJA LA DEUDA QUE LA PANTALLA LEE: el documento más viejo primero', async () => {
    // El abono iba a `pasivos_terceros`, que nadie lee: el saldo volvía al recargar.
    const base = conCartera();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarAbonoFiado.ejecutar(ctx, {
      clienteId: CLIENTE,
      montoCentavos: 5_000,
      metodo: 'efectivo',
    });

    const saldos = Object.fromEntries(
      base.filas('documentos_credito').map((d) => [d['id'], d['saldo_centavos']]),
    );
    expect(saldos).toEqual({ viejo: 0n, nuevo: 2_000n });
    expect(salida.saldoDespuesCentavos).toBe('2000');
    expect(base.filas('pagos_credito')).toHaveLength(1);
    // Y el libro paralelo ya no se escribe.
    expect(base.filas('pasivos_terceros')).toEqual([]);
  });

  it('EL EFECTIVO ENTRA AL CAJÓN como depósito, no como venta', async () => {
    const base = conCartera();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarAbonoFiado.ejecutar(ctx, {
      clienteId: CLIENTE,
      montoCentavos: 5_000,
      metodo: 'efectivo',
    });

    expect(base.campo('movimientos_caja', 'tipo')).toBe('deposito');
    expect(base.campo('movimientos_caja', 'monto_centavos')).toBe(5_000n);
  });

  it('SÓLO EL EFECTIVO ENTRA AL CAJÓN: la tarjeta baja el saldo y no lo toca', async () => {
    const base = conCartera();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarAbonoFiado.ejecutar(ctx, {
      clienteId: CLIENTE,
      montoCentavos: 5_000,
      metodo: 'tarjeta',
    });

    expect(base.filas('movimientos_caja')).toEqual([]);
    expect(
      base.filas('documentos_credito').find((d) => d['id'] === 'viejo')?.['saldo_centavos'],
    ).toBe(0n);
  });

  it('LA TRANSFERENCIA queda por confirmar: el saldo no baja hasta que alguien mire el banco', async () => {
    const base = conCartera();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarAbonoFiado.ejecutar(ctx, {
      clienteId: CLIENTE,
      montoCentavos: 5_000,
      metodo: 'transferencia',
    });

    expect(salida.pendienteDeConfirmar).toBe(true);
    expect(base.filas('documentos_credito').map((d) => d['saldo_centavos'])).toEqual([
      3_000n,
      4_000n,
    ]);
  });

  it('un cliente de otro negocio', async () => {
    const base = conCartera({ clientes: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        registrarAbonoFiado.ejecutar(ctx, {
          clienteId: CLIENTE,
          montoCentavos: 5_000,
          metodo: 'efectivo',
        }),
      ),
    ).toBe('PUENTE_NO_ENCONTRADO');
  });
});

describe('F-256 · el casco', () => {
  it('SE LE DEBE AL PORTADOR, sin titular', async () => {
    // El casco se le debe a quien traiga el envase: no se sabe quién es.
    // Inventarle un cliente convertiría una deuda al portador en una nominal
    // que nadie podría cobrar.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await moverDepositoEnvase.ejecutar(ctx, {
      montoCentavos: 3_000,
      cantidad: 2,
      devolucion: false,
    });

    expect(base.campo('pasivos_terceros', 'titular_tipo')).toBe('portador');
    expect(base.campo('pasivos_terceros', 'titular_id')).toBeNull();
  });

  it('DEVOLVER EL CASCO SACA DINERO DEL CAJÓN', async () => {
    // Registrarlo como depósito dejaría el arqueo sobrando exactamente lo que
    // se devolvió.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await moverDepositoEnvase.ejecutar(ctx, {
      montoCentavos: 3_000,
      cantidad: 2,
      devolucion: true,
    });

    expect(salida.montoCentavos).toBe('-3000');
    expect(base.campo('movimientos_caja', 'tipo')).toBe('retiro');
  });
});

describe('el titular derivado de un proveedor de servicio', () => {
  it('ES ESTABLE: dos recargas a Telcel suman al mismo saldo', () => {
    expect(uuidDeProveedor('Telcel')).toBe(uuidDeProveedor('Telcel'));
    // Y normaliza espacios y mayúsculas: «Telcel» y «telcel » son el mismo.
    expect(uuidDeProveedor('Telcel')).toBe(uuidDeProveedor('  telcel  '));
  });

  it('distingue proveedores distintos', () => {
    expect(uuidDeProveedor('Telcel')).not.toBe(uuidDeProveedor('CFE'));
  });

  it('tiene forma de uuid v4', () => {
    expect(uuidDeProveedor('Telcel')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
