import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { aCentesimas, aDecimal, guardarEsquemaPropina } from './esquema.ts';
import { repartirLiquidacion } from './pool.ts';

/**
 * F-242 · El reparto por puntos, del esquema al documento.
 *
 * Lo que vigilan estas pruebas es lo que convierte esta función en algo que
 * cierra un pleito en vez de abrir otro: que los PUNTOS salgan del esquema y
 * nunca del cuerpo de la petición, que un esquema fuera de vigencia no se pueda
 * usar, y que la fórmula quede congelada en el documento.
 */

const ESQUEMA = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const LIQUIDACION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac';
const M1 = '55555555-5555-4555-8555-555555555555';
const C1 = '55555555-5555-4555-8555-555555555557';
const HOY = new Date('2026-09-14T23:00:00.000Z');

function esquema(cambios: Fila = {}): Fila {
  return {
    id: ESQUEMA,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    nombre: 'Reparto 2026',
    vigente_desde: '2026-01-01',
    vigente_hasta: null,
    activo: true,
    empleado_id: null,
    ...cambios,
  };
}

const PUNTOS = [
  { esquema_id: ESQUEMA, puesto: 'mesero', puntos: '10.00' },
  { esquema_id: ESQUEMA, puesto: 'cocina', puntos: '4.00' },
];

function baseDe(extra: Record<string, readonly Fila[]> = {}) {
  return crearBaseFalsa({
    esquemas_propina: [esquema()],
    esquema_propina_puntos: PUNTOS,
    liquidacion_propina_beneficiarios: [],
    liquidaciones_propina: [{ id: LIQUIDACION, organizacion_id: ORG, total_centavos: 140_000n }],
    ...extra,
  });
}

const PEDIDOS = [
  { empleoId: M1, puesto: 'mesero' },
  { empleoId: C1, puesto: 'cocina' },
];

const DATOS = {
  organizacionId: ORG,
  sucursalId: SUCURSAL,
  liquidacionId: LIQUIDACION,
  esquemaId: ESQUEMA,
  totalCentavos: 140_000n,
  pedidos: PEDIDOS,
  liquidadaEn: HOY,
};

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-242 · los puntos salen del esquema', () => {
  it('reparte el pool y escribe a cada beneficiario', async () => {
    const base = baseDe();

    const salida = await repartirLiquidacion(base.tx, DATOS);

    expect(salida.esquemaNombre).toBe('Reparto 2026');
    const filas = base.filas('liquidacion_propina_beneficiarios');
    expect(filas).toHaveLength(2);
    const porEmpleado = new Map(filas.map((f) => [f['empleado_id'], f['monto_centavos']]));
    // 10 y 4 puntos sobre $1,400: $1,000 y $400.
    expect(porEmpleado.get(M1)).toBe(100_000n);
    expect(porEmpleado.get(C1)).toBe(40_000n);
  });

  it('CONGELA EL PUESTO Y LOS PUNTOS en el documento', async () => {
    const base = baseDe();

    await repartirLiquidacion(base.tx, DATOS);

    const fila = base
      .filas('liquidacion_propina_beneficiarios')
      .find((f) => f['empleado_id'] === C1);
    expect(fila?.['puesto']).toBe('cocina');
    expect(fila?.['puntos']).toBe('4.00');
  });

  it('CONGELA LA FÓRMULA: el esquema se puede cerrar y el papel no cambia', async () => {
    const base = baseDe();

    await repartirLiquidacion(base.tx, DATOS);

    const liquidacion = base.filas('liquidaciones_propina')[0];
    expect(liquidacion?.['esquema_id']).toBe(ESQUEMA);
    const formula = JSON.parse(String(liquidacion?.['formula_snapshot'])) as {
      esquema: string;
      puntos: { puesto: string; puntos: string }[];
    };
    expect(formula.esquema).toBe('Reparto 2026');
    expect(formula.puntos).toHaveLength(2);
  });

  it('UN ESQUEMA FUERA DE VIGENCIA no liquida el turno de otro mes', async () => {
    const base = baseDe({
      esquemas_propina: [esquema({ vigente_desde: '2025-01-01', vigente_hasta: '2025-12-31' })],
    });

    expect(await codigoDe(() => repartirLiquidacion(base.tx, DATOS))).toBe('LIQUIDACION_INVALIDA');
    expect(base.filas('liquidacion_propina_beneficiarios')).toEqual([]);
  });

  it('un esquema que todavía no empieza, tampoco', async () => {
    const base = baseDe({ esquemas_propina: [esquema({ vigente_desde: '2027-01-01' })] });

    expect(await codigoDe(() => repartirLiquidacion(base.tx, DATOS))).toBe('LIQUIDACION_INVALIDA');
  });

  it('UN PUESTO QUE EL ESQUEMA NO REPARTE falla en vez de dejarlo en cero', async () => {
    // Si el acuerdo no menciona a lavaloza, meterlo con cero pesos sería
    // decidir por el dueño que no le toca nada. Se falla y que lo acuerden.
    const base = baseDe();

    expect(
      await codigoDe(() =>
        repartirLiquidacion(base.tx, {
          ...DATOS,
          pedidos: [...PEDIDOS, { empleoId: 'x', puesto: 'lavaloza' }],
        }),
      ),
    ).toBe('LIQUIDACION_INVALIDA');
  });

  it('un esquema de otra sucursal se ve como inexistente', async () => {
    const base = baseDe({
      esquemas_propina: [esquema({ sucursal_id: '99999999-9999-4999-8999-999999999999' })],
    });

    expect(await codigoDe(() => repartirLiquidacion(base.tx, DATOS))).toBe('LIQUIDACION_INVALIDA');
  });
});

describe('F-242 · guardar el acuerdo', () => {
  it('CIERRA EL VIGENTE el día anterior: dos vigentes a la vez no se puede', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), HOY);

    const salida = await guardarEsquemaPropina.ejecutar(ctx, {
      nombre: 'Reparto 2027',
      vigenteDesde: '2027-01-01',
      puntos: [{ puesto: 'mesero', puntosCentesimas: 1_000 }],
    });

    expect(salida.cerroAnterior).toBe('2026-12-31');
    const viejo = base.filas('esquemas_propina').find((e) => e['id'] === ESQUEMA);
    expect(viejo?.['vigente_hasta']).toBe('2026-12-31');
    expect(viejo?.['activo']).toBe(false);
  });

  it('UN ESQUEMA NUEVO NO REESCRIBE EL VIEJO: nace otra fila', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), HOY);

    await guardarEsquemaPropina.ejecutar(ctx, {
      nombre: 'Reparto 2027',
      vigenteDesde: '2027-01-01',
      puntos: [{ puesto: 'mesero', puntosCentesimas: 1_000 }],
    });

    expect(base.filas('esquemas_propina')).toHaveLength(2);
    // La liquidación de febrero sigue pudiendo enseñar la fórmula de febrero.
    const viejo = base.filas('esquemas_propina').find((e) => e['id'] === ESQUEMA);
    expect(viejo?.['nombre']).toBe('Reparto 2026');
  });

  it('un esquema que empieza ANTES que el vigente se rechaza', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), HOY);

    expect(
      await codigoDe(() =>
        guardarEsquemaPropina.ejecutar(ctx, {
          nombre: 'Retroactivo',
          vigenteDesde: '2025-06-01',
          puntos: [{ puesto: 'mesero', puntosCentesimas: 1_000 }],
        }),
      ),
    ).toBe('LIQUIDACION_INVALIDA');
    expect(base.filas('esquemas_propina')).toHaveLength(1);
  });

  it('UN ESQUEMA DE CERO PUNTOS falla al guardarlo, no la noche que se use', async () => {
    const base = baseDe({ esquemas_propina: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), HOY);

    expect(
      await codigoDe(() =>
        guardarEsquemaPropina.ejecutar(ctx, {
          nombre: 'Vacío',
          vigenteDesde: '2027-01-01',
          puntos: [{ puesto: 'mesero', puntosCentesimas: 0 }],
        }),
      ),
    ).toBe('LIQUIDACION_INVALIDA');
  });

  it('el mismo puesto dos veces se rechaza', async () => {
    const base = baseDe({ esquemas_propina: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), HOY);

    expect(
      await codigoDe(() =>
        guardarEsquemaPropina.ejecutar(ctx, {
          nombre: 'Doble',
          vigenteDesde: '2027-01-01',
          puntos: [
            { puesto: 'mesero', puntosCentesimas: 1_000 },
            { puesto: 'mesero', puntosCentesimas: 500 },
          ],
        }),
      ),
    ).toBe('LIQUIDACION_INVALIDA');
  });

  it('EL REPARTO LO ACUERDA LA DIRECCIÓN, no el turno', () => {
    expect(guardarEsquemaPropina.roles).not.toContain('gerente');
    expect(guardarEsquemaPropina.roles).toContain('dueno');
  });

  it('un puesto que no existe en el giro no entra', () => {
    expect(
      guardarEsquemaPropina.entrada.safeParse({
        nombre: 'x',
        vigenteDesde: '2027-01-01',
        puntos: [{ puesto: 'chofer', puntosCentesimas: 100 }],
      }).success,
    ).toBe(false);
  });

  it('LOS PUNTOS SON ENTEROS EN CENTÉSIMAS: 2.5 no entra como flotante', () => {
    expect(
      guardarEsquemaPropina.entrada.safeParse({
        nombre: 'x',
        vigenteDesde: '2027-01-01',
        puntos: [{ puesto: 'mesero', puntosCentesimas: 2.5 }],
      }).success,
    ).toBe(false);
  });
});

describe('F-242 · centésimas sin coma flotante', () => {
  it('ida y vuelta exactas', () => {
    for (const centesimas of [0, 1, 99, 100, 250, 1_000, 999_999]) {
      expect(aCentesimas(aDecimal(centesimas)), String(centesimas)).toBe(centesimas);
    }
  });

  it('el formato es el de numeric(6,2)', () => {
    expect(aDecimal(250)).toBe('2.50');
    expect(aDecimal(1_000)).toBe('10.00');
    expect(aDecimal(5)).toBe('0.05');
  });
});
