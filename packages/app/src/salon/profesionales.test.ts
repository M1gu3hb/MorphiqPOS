import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import {
  comisionesDelProfesional,
  comprobanteDeLiquidacion,
  listaDeProfesionales,
  miDia,
} from './profesionales.ts';

/**
 * F-420, F-426 y F-427 · Quién atiende, qué hizo y qué se le debe.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que quien RENTA la estación quede marcada. Presentarla igual que a una
 * empleada haría que el salón le calculara una nómina que no existe.
 *
 * Que «mi día» diga CUÁNDO QUEDA LIBRE, que es el final del primer tramo
 * activo y no el final de la cita. Sin eso la pantalla es la agenda filtrada y
 * el 25 %–40 % de capacidad intercalable sigue sin verse.
 *
 * Que el comprobante salga de LAS MISMAS FILAS que la liquidación marcó.
 * Recalcularlo por fechas daría un comprobante que no suma su propio total en
 * cuanto una comisión se causara fuera del periodo y se liquidara dentro —que
 * es lo que pasa con el servicio del día 15.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const KARLA = 'aa000000-0000-4000-8000-000000000001';
const DANY = 'aa000000-0000-4000-8000-000000000002';
const CLIENTA = 'cc000000-0000-4000-8000-000000000001';
const LIQUIDACION = 'dd000000-0000-4000-8000-000000000001';

const hora = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 16, h, m, 0, 0));
const rango = (h1: number, m1: number, h2: number, m2: number) =>
  `[${hora(h1, m1).toISOString()},${hora(h2, m2).toISOString()})`;
const multi = (...partes: string[]) => `{${partes.join(',')}}`;

function profesional(id: string, nombre: string, empleoId: string | null): Record<string, unknown> {
  return {
    id,
    organizacion_id: ORG,
    nombre_completo: `${nombre} Ramírez`,
    nombre_corto: nombre,
    foto_url: null,
    tipo_relacion: empleoId === null ? 'renta' : 'empleada',
    nivel: 'senior',
    color_agenda: '#c94f7c',
    activo: true,
    orden_agenda: 1,
    empleo_id: empleoId,
  };
}

function comision(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'k1',
    organizacion_id: ORG,
    profesional_id: KARLA,
    cita_servicio_id: 'cs1',
    tipo: 'servicio',
    base_centavos: 90_000n,
    tasa_bp: 4_000,
    monto_centavos: 36_000n,
    material_descontado_centavos: 0n,
    liquidacion_id: null,
    causada_en: hora(11, 0),
    ...cambios,
  };
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa({
    profesionales: [profesional(KARLA, 'Karla', 'e1')],
    citas: [],
    cita_servicios: [],
    clientes: [],
    productos: [],
    comisiones_causadas: [],
    movimientos_propina: [],
    liquidaciones: [],
    ...extra,
  });
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-420 · quién atiende', () => {
  it('marca a quien RENTA la estación', async () => {
    // No cobra comisión, paga renta. Presentarla igual que a una empleada haría
    // que el salón le calculara una nómina que no existe.
    const base = baseDe({
      profesionales: [profesional(KARLA, 'Karla', 'e1'), profesional(DANY, 'Dany', null)],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await listaDeProfesionales.ejecutar(ctx, { incluirInactivos: false });

    expect(salida.profesionales.map((p) => p.rentaEstacion)).toEqual([false, true]);
  });

  it('los de BAJA no salen salvo que se pidan', async () => {
    // Siguen en el histórico: se piden aparte, no se esconden.
    const base = baseDe({
      profesionales: [{ ...profesional(DANY, 'Dany', 'e2'), activo: false }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const sinInactivos = await listaDeProfesionales.ejecutar(ctx, { incluirInactivos: false });
    const conInactivos = await listaDeProfesionales.ejecutar(ctx, { incluirInactivos: true });

    expect(sinInactivos.profesionales).toEqual([]);
    expect(conInactivos.profesionales).toHaveLength(1);
  });
});

describe('F-426 · mi día', () => {
  const dia = {
    citas: [
      {
        id: 'c1',
        organizacion_id: ORG,
        folio: 'CITA-42',
        cliente_id: CLIENTA,
        estado: 'agendada',
        agendada_para: hora(10, 0),
      },
    ],
    cita_servicios: [
      {
        id: 'cs1',
        organizacion_id: ORG,
        cita_id: 'c1',
        profesional_id: KARLA,
        servicio_id: 's1',
        estado: 'pendiente',
        precio_centavos: 90_000n,
        rango_activo: multi(rango(10, 0, 10, 40), rango(11, 25, 11, 50)),
        rango_ocupacion: rango(10, 0, 11, 50),
      },
    ],
    clientes: [{ id: CLIENTA, organizacion_id: ORG, nombre: 'Lupita' }],
    productos: [{ id: 's1', organizacion_id: ORG, nombre: 'Tinte raíz' }],
  };

  it('dice CUÁNDO QUEDA LIBRE, no cuándo acaba la cita', async () => {
    // Queda libre a las 10:40 aunque la clienta siga sentada hasta las 11:50.
    // Ésa es toda la razón por la que existe esta pantalla.
    const base = baseDe(dia);
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await miDia.ejecutar(ctx, { profesionalId: KARLA, fecha: '2026-09-16' });

    expect(salida.citas[0]?.libreDesde).toBe(hora(10, 40).toISOString());
    expect(salida.citas[0]?.fin).toBe(hora(11, 50).toISOString());
  });

  it('trae el nombre de la clienta y del servicio', async () => {
    const base = baseDe(dia);
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await miDia.ejecutar(ctx, { profesionalId: KARLA, fecha: '2026-09-16' });

    expect(salida.citas[0]?.clienta).toBe('Lupita');
    expect(salida.citas[0]?.servicio).toBe('Tinte raíz');
  });

  it('SIGUIENTE es lo que todavía no cerró', async () => {
    const base = baseDe({
      ...dia,
      cita_servicios: [
        { ...dia.cita_servicios[0], id: 'cs0', estado: 'cerrado' },
        { ...dia.cita_servicios[0], id: 'cs1', estado: 'pendiente' },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await miDia.ejecutar(ctx, { profesionalId: KARLA, fecha: '2026-09-16' });

    expect(salida.siguiente?.citaServicioId).toBe('cs1');
  });

  it('un día terminado no tiene siguiente, y no es un error', async () => {
    const base = baseDe({
      ...dia,
      cita_servicios: [{ ...dia.cita_servicios[0], estado: 'cerrado' }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await miDia.ejecutar(ctx, { profesionalId: KARLA, fecha: '2026-09-16' });

    expect(salida.siguiente).toBeNull();
    expect(salida.citas).toHaveLength(1);
  });

  it('suma la comisión y la propina DEL DÍA, por separado', async () => {
    // Juntarlas haría que el salón le pagara comisión sobre su propia propina.
    const base = baseDe({
      ...dia,
      comisiones_causadas: [comision()],
      movimientos_propina: [
        {
          id: 'p1',
          organizacion_id: ORG,
          profesional_id: KARLA,
          tipo: 'recibida',
          monto_centavos: 5_000n,
          medio: 'efectivo',
          created_at: hora(12, 0),
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await miDia.ejecutar(ctx, { profesionalId: KARLA, fecha: '2026-09-16' });

    expect(salida.comisionDelDiaCentavos).toBe('36000');
    expect(salida.propinaDelDiaCentavos).toBe('5000');
  });

  it('un día sin citas devuelve la lista vacía', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await miDia.ejecutar(ctx, { profesionalId: KARLA, fecha: '2026-09-16' });

    expect(salida.citas).toEqual([]);
    expect(salida.comisionDelDiaCentavos).toBe('0');
  });
});

describe('F-427 · las comisiones', () => {
  it('separa lo CAUSADO de lo LIQUIDADO, y resta el pendiente', async () => {
    // El pendiente es el único número que importa el día 15.
    const base = baseDe({
      comisiones_causadas: [
        comision({ id: 'k1', monto_centavos: 36_000n, liquidacion_id: LIQUIDACION }),
        comision({ id: 'k2', monto_centavos: 12_000n, liquidacion_id: null }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await comisionesDelProfesional.ejecutar(ctx, {
      profesionalId: KARLA,
      desde: '2026-09-01',
      hasta: '2026-10-01',
    });

    expect(salida.causadoCentavos).toBe('48000');
    expect(salida.liquidadoCentavos).toBe('36000');
    expect(salida.pendienteCentavos).toBe('12000');
  });

  it('una contrapartida NEGATIVA resta de verdad', async () => {
    // El servicio que se rehace descuenta: sumarla en positivo le pagaría dos
    // veces el mismo trabajo.
    const base = baseDe({
      comisiones_causadas: [
        comision({ id: 'k1', monto_centavos: 36_000n }),
        comision({ id: 'k2', monto_centavos: -36_000n, tipo: 'contrapartida' }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await comisionesDelProfesional.ejecutar(ctx, {
      profesionalId: KARLA,
      desde: '2026-09-01',
      hasta: '2026-10-01',
    });

    expect(salida.causadoCentavos).toBe('0');
  });

  it('sin comisiones el periodo vale cero, no un hueco', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await comisionesDelProfesional.ejecutar(ctx, {
      profesionalId: KARLA,
      desde: '2026-09-01',
      hasta: '2026-10-01',
    });

    expect(salida.pendienteCentavos).toBe('0');
    expect(salida.lineas).toEqual([]);
  });
});

describe('F-427 · el comprobante', () => {
  const liquidacion = {
    id: LIQUIDACION,
    organizacion_id: ORG,
    profesional_id: KARLA,
    nombre_completo: 'Karla Ramírez',
    periodo_desde: '2026-09-01',
    periodo_hasta: '2026-09-15',
    comision_centavos: 36_000n,
    propina_centavos: 5_000n,
    material_cargado_centavos: 2_000n,
    renta_centavos: 0n,
    cobrado_por_ella_centavos: 0n,
    anticipos_centavos: 0n,
    total_centavos: 39_000n,
    pagada_en: null,
  };

  it('el detalle sale de LAS MISMAS FILAS que la liquidación marcó', async () => {
    // La comisión causada el 31 de agosto y liquidada el 15 de septiembre entra
    // igual: recalcular por fechas la dejaría fuera y el comprobante no sumaría
    // su propio total.
    const base = baseDe({
      liquidaciones: [liquidacion],
      comisiones_causadas: [
        comision({
          id: 'k1',
          liquidacion_id: LIQUIDACION,
          causada_en: new Date('2026-08-31T18:00:00.000Z'),
        }),
        comision({ id: 'k2', liquidacion_id: null }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await comprobanteDeLiquidacion.ejecutar(ctx, { liquidacionId: LIQUIDACION });

    expect(salida.lineas.map((l) => l.comisionId)).toEqual(['k1']);
    expect(salida.totalCentavos).toBe('39000');
  });

  it('la PROPINA va separada de la comisión', async () => {
    // Nunca es del salón.
    const base = baseDe({ liquidaciones: [liquidacion] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await comprobanteDeLiquidacion.ejecutar(ctx, { liquidacionId: LIQUIDACION });

    expect(salida.comisionCentavos).toBe('36000');
    expect(salida.propinaCentavos).toBe('5000');
  });

  it('una liquidación de otro negocio no existe', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    expect(
      await codigoDe(() => comprobanteDeLiquidacion.ejecutar(ctx, { liquidacionId: LIQUIDACION })),
    ).toBe('PUENTE_NO_ENCONTRADO');
  });
});
