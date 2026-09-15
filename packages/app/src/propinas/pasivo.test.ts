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
  EMPLEO,
  ORG,
  SESION_CAJA,
  SUCURSAL,
  TERMINAL,
} from '../restaurante/pruebas/sala.ts';
import { anotarPropinaPorEntregar, entregarPropina } from './pasivo.ts';

/**
 * F-260 · La propina de tarjeta es una DEUDA, no dinero del negocio.
 *
 * ── El hueco que cierra ────────────────────────────────────────────────────
 * El ledger de la 063 admite cuatro naturalezas y el código escribía tres.
 * `propina_por_entregar` estaba en el `check` y no la escribía nadie: la cuarta
 * vista del mismo objeto, y la que más dinero mueve en un salón.
 *
 * ── Lo que se prueba, en una línea ─────────────────────────────────────────
 * Que el dinero entre al ledger de pasivos y NO a ventas; que la entrega sea
 * una CONTRAPARTIDA y no un `update`; y que no se pueda entregar más de lo que
 * se debe, porque eso convertiría la propina en un préstamo.
 */

const PROFESIONAL = 'e1111111-1111-4111-8111-111111111111';
const AJENO = 'e9999999-9999-4999-8999-999999999999';
const AHORA = new Date('2026-09-15T21:00:00.000Z');

function empleos(): Fila[] {
  return [
    { id: EMPLEO, organizacion_id: ORG, rol: 'cajero' },
    { id: PROFESIONAL, organizacion_id: ORG, rol: 'mesero' },
    { id: AJENO, organizacion_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', rol: 'mesero' },
  ];
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      empleos: empleos(),
      pasivos_terceros: [],
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
      predeterminados: {
        pasivos_terceros: {
          referencia_tipo: null,
          referencia_id: null,
          movimiento_caja_id: null,
          sesion_caja_id: null,
          motivo: null,
          empleado_id: null,
        },
        movimientos_caja: { referencia_tipo: null, referencia_id: null, motivo: null },
      },
    },
  );
}

function pasivo(monto: bigint, cambios: Partial<Fila> = {}): Fila {
  return {
    id: `p-${monto.toString()}`,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    naturaleza: 'propina_por_entregar',
    titular_tipo: 'empleo',
    titular_id: PROFESIONAL,
    monto_centavos: monto,
    ...cambios,
  };
}

describe('F-260 · anotar la propina como deuda', () => {
  it('escribe en el ledger de PASIVOS con la naturaleza correcta y en positivo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await anotarPropinaPorEntregar.ejecutar(ctx, {
      empleoBeneficiarioId: PROFESIONAL,
      montoCentavos: 20_000,
      metodo: 'tarjeta',
    });

    expect(base.campo('pasivos_terceros', 'naturaleza')).toBe('propina_por_entregar');
    expect(base.campo('pasivos_terceros', 'titular_tipo')).toBe('empleo');
    expect(base.campo('pasivos_terceros', 'titular_id')).toBe(PROFESIONAL);
    // POSITIVO: el negocio contrae la deuda. Entra dinero ajeno.
    expect(base.campo('pasivos_terceros', 'monto_centavos')).toBe(20_000n);
    expect(salida.saldoDelBeneficiarioCentavos).toBe('20000');
  });

  it('NO escribe una venta, ni un pago, ni un movimiento de caja al anotarla', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await anotarPropinaPorEntregar.ejecutar(ctx, {
      empleoBeneficiarioId: PROFESIONAL,
      montoCentavos: 20_000,
      metodo: 'tarjeta',
    });

    // «Las propinas NO entran en ventas, utilidad, costo ni margen. Nunca.»
    // Y el dinero de tarjeta no pasa por el cajón: llega al banco.
    expect(base.filas('ordenes')).toHaveLength(0);
    expect(base.filas('pagos')).toHaveLength(0);
    expect(base.filas('movimientos_caja')).toHaveLength(0);
  });

  it('ata la propina a la orden de la que salió, para que el corte la explique', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    const ORDEN = 'd1111111-1111-4111-8111-111111111111';

    await anotarPropinaPorEntregar.ejecutar(ctx, {
      empleoBeneficiarioId: PROFESIONAL,
      montoCentavos: 5000,
      metodo: 'tarjeta',
      ordenId: ORDEN,
    });

    expect(base.campo('pasivos_terceros', 'referencia_tipo')).toBe('orden');
    expect(base.campo('pasivos_terceros', 'referencia_id')).toBe(ORDEN);
  });

  it('rechaza un beneficiario de otra organización', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await anotarPropinaPorEntregar
      .ejecutar(ctx, { empleoBeneficiarioId: AJENO, montoCentavos: 5000, metodo: 'tarjeta' })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('pasivos_terceros')).toHaveLength(0);
  });

  it('suma varias propinas del mismo profesional en un solo saldo', async () => {
    const base = baseDe({ pasivos_terceros: [pasivo(15_000n)] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await anotarPropinaPorEntregar.ejecutar(ctx, {
      empleoBeneficiarioId: PROFESIONAL,
      montoCentavos: 8000,
      metodo: 'transferencia',
    });

    expect(salida.saldoDelBeneficiarioCentavos).toBe('23000');
  });
});

describe('F-260 · entregar la propina', () => {
  it('escribe una CONTRAPARTIDA negativa, nunca un update de la fila anterior', async () => {
    const base = baseDe({ pasivos_terceros: [pasivo(20_000n)] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await entregarPropina.ejecutar(ctx, {
      empleoBeneficiarioId: PROFESIONAL,
      montoCentavos: 20_000,
    });

    const filas = base.filas('pasivos_terceros');
    // Dos filas: la deuda y su saldado. El ledger es inmutable — un `update`
    // borraría la historia de una entrega que alguien puede reclamar.
    expect(filas).toHaveLength(2);
    expect(filas[0]?.['monto_centavos']).toBe(20_000n);
    expect(filas[1]?.['monto_centavos']).toBe(-20_000n);
  });

  it('baja el cajón con un movimiento de caja, no con un gasto', async () => {
    const base = baseDe({ pasivos_terceros: [pasivo(20_000n)] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await entregarPropina.ejecutar(ctx, {
      empleoBeneficiarioId: PROFESIONAL,
      montoCentavos: 12_000,
    });

    // Registrarlo como gasto lo metería en el estado de resultados. El negocio
    // no gastó ese dinero: sólo lo custodiaba.
    expect(base.campo('movimientos_caja', 'tipo')).toBe('retiro');
    expect(base.campo('movimientos_caja', 'monto_centavos')).toBe(12_000n);
    expect(base.campo('movimientos_caja', 'referencia_tipo')).toBe('pasivo');
  });

  it('deja el saldo en cero cuando se entrega todo', async () => {
    const base = baseDe({ pasivos_terceros: [pasivo(20_000n)] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await entregarPropina.ejecutar(ctx, {
      empleoBeneficiarioId: PROFESIONAL,
      montoCentavos: 20_000,
    });

    expect(salida.saldoDelBeneficiarioCentavos).toBe('0');
  });

  it('NO deja entregar más de lo que se debe', async () => {
    const base = baseDe({ pasivos_terceros: [pasivo(20_000n)] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await entregarPropina
      .ejecutar(ctx, { empleoBeneficiarioId: PROFESIONAL, montoCentavos: 25_000 })
      .catch((e: unknown) => e);

    // Un saldo negativo significaría que la estilista le debe dinero al salón,
    // que no es una situación que exista: eso es un anticipo de sueldo.
    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('pasivos_terceros')).toHaveLength(1);
    expect(base.filas('movimientos_caja')).toHaveLength(0);
  });

  it('no cuenta las propinas de OTRO profesional para decidir cuánto se debe', async () => {
    const base = baseDe({
      pasivos_terceros: [pasivo(20_000n), pasivo(50_000n, { id: 'p-otro', titular_id: EMPLEO })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await entregarPropina
      .ejecutar(ctx, { empleoBeneficiarioId: PROFESIONAL, montoCentavos: 30_000 })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });

  it('no entrega con la caja cerrada: el dinero sale del cajón', async () => {
    const base = baseDe({ pasivos_terceros: [pasivo(20_000n)], sesiones_caja: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await entregarPropina
      .ejecutar(ctx, { empleoBeneficiarioId: PROFESIONAL, montoCentavos: 5000 })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('movimientos_caja')).toHaveLength(0);
  });
});
