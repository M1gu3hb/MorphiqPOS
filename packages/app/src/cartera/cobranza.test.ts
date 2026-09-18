import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SESION_CAJA, SUCURSAL, TERMINAL } from '../restaurante/pruebas/sala.ts';
import {
  carteraPorAntiguedad,
  confirmarTransferencia,
  fijarMuroDeCredito,
  registrarPagoCredito,
  transferenciasPendientes,
} from './cobranza.ts';
import { emitirDocumentoCredito, estadoDeCuenta } from './documento.ts';

/**
 * F-611 a F-617 · La cartera, contra la base.
 *
 * ── Las dos cosas que esta prueba defiende ────────────────────────────────
 * Cubre también F-612, el estado de cuenta, que se prueba más abajo: el total y
 * lo vencido van por SEPARADO, porque un cliente con $80 000 por vencer y otro
 * con $80 000 a noventa días no son el mismo riesgo y una sola cifra los pinta
 * igual.
 *
 * Que el pago de un crédito **no sea una venta nueva** —la venta se registró el
 * día que se fió, y volver a contarla duplicaría el ingreso del mes— y que el
 * vencimiento se congele al emitir: si mañana se le cambia el plazo al cliente,
 * lo que ya se fió vence cuando se dijo que vencía.
 */

const CLIENTE = 'c1111111-1111-4111-8111-111111111111';
const AJENO = 'c9999999-9999-4999-8999-999999999999';
const AHORA = new Date('2026-09-16T18:00:00.000Z');
const dias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000);

function cliente(cambios: Partial<Fila> = {}): Fila {
  return {
    id: CLIENTE,
    organizacion_id: ORG,
    nombre: 'Don Chuy',
    limite_credito_centavos: 500_000n,
    dias_plazo: 15,
    bloqueado_por_mora: false,
    ...cambios,
  };
}

function documento(cambios: Partial<Fila> = {}): Fila {
  return {
    id: 'doc1',
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    cliente_id: CLIENTE,
    origen_tipo: 'venta',
    folio: 'CR-A-1',
    emitido_en: dias(-40),
    vence_en: dias(-25),
    importe_centavos: 100_000n,
    saldo_centavos: 100_000n,
    ...cambios,
  };
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      clientes: [cliente()],
      documentos_credito: [],
      pagos_credito: [],
      aplicaciones_pago: [],
      movimientos_caja: [],
      sesiones_caja: [
        {
          id: SESION_CAJA,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          terminal_id: TERMINAL,
          estado: 'abierta',
        },
      ],
      ...extra,
    },
    {
      // `tomarFolio` toma el consecutivo con SQL crudo.
      filasCrudas: [{ siguiente: 1n, serie: 'A' }],
      predeterminados: {
        documentos_credito: { origen_id: null, empleado_id: null },
        pagos_credito: {
          referencia: null,
          movimiento_caja_id: null,
          sesion_caja_id: null,
          sucursal_id: null,
          confirmado: true,
          confirmado_en: null,
          confirmado_por: null,
          recibido_en: null,
        },
        movimientos_caja: { referencia_tipo: null, referencia_id: null, motivo: null },
        clientes: { bloqueado_en: null, bloqueado_por: null, motivo_bloqueo: null },
      },
    },
  );
}

describe('F-611 · el vencimiento se congela al emitir', () => {
  it('suma los días de plazo del cliente a la fecha de emisión', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await emitirDocumentoCredito.ejecutar(ctx, {
      clienteId: CLIENTE,
      origenTipo: 'venta',
      importeCentavos: 50_000,
    });

    expect(new Date(salida.venceEn).getTime()).toBe(dias(15).getTime());
    // Guardado, no calculado al leer: si mañana se le amplía el plazo, lo que ya
    // se fió vence cuando se dijo que vencía.
    expect(base.campo('documentos_credito', 'vence_en')).toEqual(dias(15));
  });

  it('un cliente de contado emite con vencimiento el mismo día', async () => {
    const base = baseDe({ clientes: [cliente({ dias_plazo: 0 })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await emitirDocumentoCredito.ejecutar(ctx, {
      clienteId: CLIENTE,
      origenTipo: 'venta',
      importeCentavos: 1000,
    });

    expect(new Date(salida.venceEn).getTime()).toBe(AHORA.getTime());
  });
});

describe('F-617 · emitir comprueba el crédito, que es el único momento', () => {
  it('no emite por encima del límite', async () => {
    const base = baseDe({
      documentos_credito: [documento({ saldo_centavos: 450_000n, vence_en: dias(10) })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await emitirDocumentoCredito
      .ejecutar(ctx, { clienteId: CLIENTE, origenTipo: 'venta', importeCentavos: 100_000 })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('documentos_credito')).toHaveLength(1);
  });

  it('la MORA corta aunque quede límite de sobra', async () => {
    // $1 000 debidos con 25 días de retraso, y $5 000 de límite. Mirar sólo el
    // límite es cómo una cartera pasa de tres morosos a treinta.
    const base = baseDe({ documentos_credito: [documento()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await emitirDocumentoCredito
      .ejecutar(ctx, { clienteId: CLIENTE, origenTipo: 'venta', importeCentavos: 1000 })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });

  it('el bloqueo a mano corta sin mirar nada más', async () => {
    const base = baseDe({ clientes: [cliente({ bloqueado_por_mora: true })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await emitirDocumentoCredito
      .ejecutar(ctx, { clienteId: CLIENTE, origenTipo: 'venta', importeCentavos: 100 })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });

  it('no emite a nombre de un cliente de otra organización', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await emitirDocumentoCredito
      .ejecutar(ctx, { clienteId: AJENO, origenTipo: 'venta', importeCentavos: 100 })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });
});

describe('F-614 y F-615 · registrar el pago', () => {
  it('aplica a lo más viejo, deja la aplicación escrita y salda', async () => {
    const base = baseDe({
      documentos_credito: [
        documento({ id: 'viejo', folio: 'CR-A-1', vence_en: dias(-60), saldo_centavos: 40_000n }),
        documento({ id: 'nuevo', folio: 'CR-A-2', vence_en: dias(-5), saldo_centavos: 40_000n }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarPagoCredito.ejecutar(ctx, {
      clienteId: CLIENTE,
      montoCentavos: 40_000,
      metodo: 'efectivo',
    });

    expect(base.campo('aplicaciones_pago', 'documento_id')).toBe('viejo');
    expect(salida.documentosSaldados).toBe(1);
    // Sin la fila de aplicación, «pagó $400» no dice qué quedó saldado y las dos
    // partes llevan cuentas distintas desde el primer pago parcial.
    expect(base.filas('aplicaciones_pago')).toHaveLength(1);
  });

  it('el pago NO es una venta: entra como depósito con su propia referencia', async () => {
    const base = baseDe({ documentos_credito: [documento()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarPagoCredito.ejecutar(ctx, {
      clienteId: CLIENTE,
      montoCentavos: 10_000,
      metodo: 'efectivo',
    });

    // Volver a contarla como venta duplicaría el ingreso del mes: el error más
    // caro de un sistema de crédito, y el más fácil de cometer.
    expect(base.campo('movimientos_caja', 'referencia_tipo')).toBe('pago_credito');
    expect(base.campo('movimientos_caja', 'tipo')).toBe('deposito');
    expect(base.filas('ordenes')).toHaveLength(0);
  });

  it('un pago con TARJETA no toca el cajón', async () => {
    const base = baseDe({ documentos_credito: [documento()], sesiones_caja: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarPagoCredito.ejecutar(ctx, {
      clienteId: CLIENTE,
      montoCentavos: 10_000,
      metodo: 'tarjeta',
      referencia: 'TDC 4412',
    });

    // Exigir caja abierta para una tarjeta dejaría al cobrador sin poder
    // registrar un cobro que ya está autorizado por la terminal bancaria.
    expect(base.filas('movimientos_caja')).toHaveLength(0);
    expect(base.campo('pagos_credito', 'referencia')).toBe('TDC 4412');
  });

  it('LA TRANSFERENCIA NO BAJA EL SALDO hasta que alguien ve el banco', async () => {
    // El comprobante se ve en la pantalla del cliente y el sistema no puede
    // saber si es real. Aplicarla al registrarse es cómo un comprobante falso de
    // $12,000 sale por la puerta convertido en material.
    const base = baseDe({ documentos_credito: [documento()], sesiones_caja: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarPagoCredito.ejecutar(ctx, {
      clienteId: CLIENTE,
      montoCentavos: 10_000,
      metodo: 'transferencia',
      referencia: 'SPEI 4412',
    });

    expect(salida.pendienteDeConfirmar).toBe(true);
    expect(salida.aplicadoCentavos).toBe('0');
    // El saldo que se devuelve es el que SIGUE debiendo: decir el ya restado
    // sería mentirle a la pantalla donde el mostradorista lo lee en voz alta.
    expect(salida.saldoDespuesCentavos).toBe('100000');
    expect(base.campo('documentos_credito', 'saldo_centavos')).toBe(100_000n);
    expect(base.campo('pagos_credito', 'confirmado')).toBe(false);
  });

  it('el efectivo SE APLICA en el momento: ya está en el cajón', async () => {
    const base = baseDe({ documentos_credito: [documento()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarPagoCredito.ejecutar(ctx, {
      clienteId: CLIENTE,
      montoCentavos: 10_000,
      metodo: 'efectivo',
    });

    expect(salida.pendienteDeConfirmar).toBe(false);
    expect(base.campo('documentos_credito', 'saldo_centavos')).toBe(90_000n);
  });

  it('el efectivo SÍ necesita caja abierta', async () => {
    const base = baseDe({ documentos_credito: [documento()], sesiones_caja: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await registrarPagoCredito
      .ejecutar(ctx, { clienteId: CLIENTE, montoCentavos: 1000, metodo: 'efectivo' })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('pagos_credito')).toHaveLength(0);
  });

  it('lo que sobra queda a cuenta, no se pierde ni se reparte', async () => {
    const base = baseDe({ documentos_credito: [documento({ saldo_centavos: 10_000n })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarPagoCredito.ejecutar(ctx, {
      clienteId: CLIENTE,
      montoCentavos: 30_000,
      metodo: 'efectivo',
    });

    expect(salida.aCuentaCentavos).toBe('20000');
    expect(base.campo('pagos_credito', 'a_cuenta_centavos')).toBe(20_000n);
  });

  it('no cobra a un cliente que no debe nada', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await registrarPagoCredito
      .ejecutar(ctx, { clienteId: CLIENTE, montoCentavos: 1000, metodo: 'efectivo' })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });
});

describe('F-612 y F-613 · lo que se le enseña al cliente', () => {
  it('el estado de cuenta trae el total Y lo vencido, que son dos conversaciones', async () => {
    const base = baseDe({
      documentos_credito: [
        documento({ id: 'a', folio: 'CR-A-1', vence_en: dias(-60), saldo_centavos: 62_000n }),
        documento({ id: 'b', folio: 'CR-A-2', vence_en: dias(10), saldo_centavos: 18_000n }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await estadoDeCuenta.ejecutar(ctx, { clienteId: CLIENTE });

    expect(salida.totalCentavos).toBe('80000');
    expect(salida.vencidoCentavos).toBe('62000');
    expect(salida.renglones).toHaveLength(2);
  });

  it('la cartera reparte por tramos y dice a quién avisar', async () => {
    const base = baseDe({
      documentos_credito: [
        documento({ id: 'a', folio: 'CR-A-1', vence_en: dias(-45), saldo_centavos: 30_000n }),
        documento({ id: 'b', folio: 'CR-A-2', vence_en: dias(2), saldo_centavos: 10_000n }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await carteraPorAntiguedad.ejecutar(ctx, { diasDeAviso: 3 });

    expect(salida.porTramo['v31_60']).toBe('30000');
    expect(salida.vencidoCentavos).toBe('30000');
    // El aviso amable no lleva morosos dentro: eso es cobranza y va aparte.
    expect(salida.porVencer.map((p) => p.folio)).toEqual(['CR-A-2']);
  });

  it('el cajero no ve la cartera del negocio entero', () => {
    expect([...carteraPorAntiguedad.roles]).not.toContain('cajero');
  });
});

describe('F-617 · el muro', () => {
  it('lo pone con motivo y con autor, las tres columnas juntas', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await fijarMuroDeCredito.ejecutar(ctx, {
      clienteId: CLIENTE,
      bloquear: true,
      motivo: 'Tres meses sin pagar y no contesta el teléfono',
    });

    // El `check` de la 161 exige el motivo cuando el muro está puesto: un muro
    // sin motivo no se puede levantar delante del cliente.
    expect(base.campo('clientes', 'bloqueado_por_mora')).toBe(true);
    expect(base.campo('clientes', 'bloqueado_en')).toEqual(AHORA);
    expect(base.campo('clientes', 'motivo_bloqueo')).toBe(
      'Tres meses sin pagar y no contesta el teléfono',
    );
  });

  it('SIEMPRE hay llave: se puede quitar, también con motivo', async () => {
    const base = baseDe({
      clientes: [cliente({ bloqueado_por_mora: true, motivo_bloqueo: 'no pagaba' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    await fijarMuroDeCredito.ejecutar(ctx, {
      clienteId: CLIENTE,
      bloquear: false,
      motivo: 'Liquidó todo el viernes y trajo el comprobante',
    });

    expect(base.campo('clientes', 'bloqueado_por_mora')).toBe(false);
    expect(base.campo('clientes', 'bloqueado_en')).toBeNull();
  });

  it('el cajero no levanta ni pone el muro', () => {
    expect([...fijarMuroDeCredito.roles]).not.toContain('cajero');
  });
});

describe('F-212 · confirmar la transferencia', () => {
  function pago(cambios: Partial<Fila> = {}): Fila {
    return {
      id: 'pg1',
      organizacion_id: ORG,
      sucursal_id: SUCURSAL,
      cliente_id: CLIENTE,
      monto_centavos: 30_000n,
      metodo: 'transferencia',
      referencia: 'SPEI 4412',
      a_cuenta_centavos: 0n,
      empleado_id: 'e1',
      confirmado: false,
      created_at: dias(-1),
      ...cambios,
    };
  }

  it('CONFIRMAR ES LO QUE BAJA EL SALDO', async () => {
    // Si el pago se hubiera aplicado al registrarse, confirmar sería un adorno.
    const base = baseDe({ documentos_credito: [documento()], pagos_credito: [pago()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await confirmarTransferencia.ejecutar(ctx, {
      pagoId: 'pg1',
      referenciaBancaria: 'SPEI 998877',
    });

    expect(salida.aplicadoCentavos).toBe('30000');
    expect(base.campo('documentos_credito', 'saldo_centavos')).toBe(70_000n);
    expect(base.campo('pagos_credito', 'confirmado')).toBe(true);
  });

  it('NO SE CONFIRMA DOS VECES', async () => {
    // Aplicaría el pago dos veces y le regalaría el doble al cliente. Dos
    // pestañas abiertas son dos peticiones.
    const base = baseDe({
      documentos_credito: [documento()],
      pagos_credito: [pago({ confirmado: true, confirmado_en: dias(-1) })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const fallo = await confirmarTransferencia
      .ejecutar(ctx, { pagoId: 'pg1', referenciaBancaria: null })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.campo('documentos_credito', 'saldo_centavos')).toBe(100_000n);
  });

  it('lo que YA ESTÁ EN EL CAJÓN no se confirma', async () => {
    // El efectivo está confirmado en el momento en que se cobra.
    const base = baseDe({
      documentos_credito: [documento()],
      pagos_credito: [pago({ metodo: 'efectivo', confirmado: true })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const fallo = await confirmarTransferencia
      .ejecutar(ctx, { pagoId: 'pg1', referenciaBancaria: null })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });

  it('LO PENDIENTE VA EN EL CORTE, con las horas que lleva esperando', async () => {
    // Una lista que hay que acordarse de abrir es una lista que no se abre.
    const base = baseDe({
      documentos_credito: [documento()],
      pagos_credito: [
        pago({ id: 'pg1', created_at: new Date(AHORA.getTime() - 5 * 3_600_000) }),
        pago({ id: 'pg2', confirmado: true, confirmado_en: AHORA }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await transferenciasPendientes.ejecutar(ctx, { horas: 72 });

    expect(salida.pendientes.map((p) => p.pagoId)).toEqual(['pg1']);
    expect(salida.pendientes[0]?.horasEsperando).toBe(5);
    expect(salida.totalCentavos).toBe('30000');
  });

  it('sin transferencias pendientes el corte no enseña una lista vacía con total nulo', async () => {
    const base = baseDe({ documentos_credito: [documento()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await transferenciasPendientes.ejecutar(ctx, { horas: 72 });

    expect(salida.pendientes).toEqual([]);
    expect(salida.totalCentavos).toBe('0');
  });
});
