import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, EMPLEO, ORG } from '../restaurante/pruebas/sala.ts';
import {
  agendaDelDia,
  clientesPorVolver,
  huecosDisponibles,
  proximosHuecos,
  reporteDeHuecos,
  reporteDeOcupacion,
} from './consultas.ts';

/**
 * F-404, F-415, F-417 y F-951 · Lo que la agenda contesta.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que el tramo PASIVO de una cita se ofrezca como hueco. Es el 25 %–40 % de
 * capacidad que F-415 vino a recuperar, y una resta ingenua lo tira entero: si
 * esta prueba se pone verde con la ocupación completa restada, el modelo volvió
 * a ser una agenda de un solo número.
 *
 * Que la ocupación se mida contra SU horario. Quien trabaja de dos a ocho y
 * llena seis horas está al 100 %, no al 25 %.
 *
 * Que el bloqueo de TODO el salón le toque a todas las columnas. Pintarlo sólo
 * en la de quien lo creó hace que la rejilla ofrezca la hora de la junta en las
 * demás.
 *
 * Y que «le toca volver» use SU ritmo. Un umbral único mete a la de tinte cada
 * cinco semanas y a la de corte cada cuatro meses en la misma lista equivocada.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const KARLA = 'aa000000-0000-4000-8000-000000000001';
const DANY = 'aa000000-0000-4000-8000-000000000002';
const CLIENTA = 'cc000000-0000-4000-8000-000000000001';

/** `2026-09-16` es MIÉRCOLES en UTC: `dia_semana` 3. */
const HOY = '2026-09-16';
const MIERCOLES = 3;

const hora = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 16, h, m, 0, 0)).toISOString();
const rango = (h1: number, m1: number, h2: number, m2: number) =>
  `[${hora(h1, m1)},${hora(h2, m2)})`;
const multi = (...partes: string[]) => `{${partes.join(',')}}`;
const dias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000);

function profesional(id: string, nombre: string, orden: number): Record<string, unknown> {
  return {
    id,
    organizacion_id: ORG,
    nombre_corto: nombre,
    nombre_completo: nombre,
    color_agenda: '#c94f7c',
    activo: true,
    orden_agenda: orden,
    empleo_id: 'e1',
  };
}

function horario(profesionalId: string, inicio: string, fin: string): Record<string, unknown> {
  return {
    organizacion_id: ORG,
    profesional_id: profesionalId,
    dia_semana: MIERCOLES,
    hora_inicio: inicio,
    hora_fin: fin,
    vigente_desde: '2026-01-01',
    vigente_hasta: null,
  };
}

/** Un tinte: aplicación 10:00-10:40, procesado hasta 11:25, terminado 11:25-11:50. */
function tinte(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cs1',
    organizacion_id: ORG,
    cita_id: 'c1',
    profesional_id: KARLA,
    servicio_id: 's1',
    estado: 'pendiente',
    precio_centavos: 90_000n,
    rango_activo: multi(rango(10, 0, 10, 40), rango(11, 25, 11, 50)),
    rango_ocupacion: rango(10, 0, 11, 50),
    ...cambios,
  };
}

/** La cita a la que cuelga el tinte. Va en su tabla: el comando lee las dos. */
function citaDe(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c1',
    organizacion_id: ORG,
    folio: 'A-1',
    cliente_id: CLIENTA,
    estado: 'agendada',
    agendada_para: new Date(hora(10, 0)),
    ...cambios,
  };
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa({
    profesionales: [profesional(KARLA, 'Karla', 1)],
    horarios_profesional: [horario(KARLA, '09:00:00', '19:00:00')],
    cita_servicios: [],
    citas: [],
    bloqueos_agenda: [],
    expedientes_belleza: [],
    clientes: [],
    ...extra,
  });
}

describe('F-400 · la rejilla del día', () => {
  it('una columna por profesional, con sus ventanas', async () => {
    const base = baseDe({
      profesionales: [profesional(KARLA, 'Karla', 1), profesional(DANY, 'Dany', 2)],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agendaDelDia.ejecutar(ctx, { fecha: HOY, profesionalId: null });

    expect(salida.columnas.map((c) => c.nombreCorto)).toEqual(['Karla', 'Dany']);
    expect(salida.columnas[0]?.ventanas[0]?.inicio).toBe(hora(9, 0));
  });

  it('lo OCUPADO son los tramos activos, NO la ocupación entera', async () => {
    // Contar el procesado como ocupado es lo que hace que la agenda se vea
    // llena a las once cuando hay hueco para un corte.
    const base = baseDe({ cita_servicios: [tinte()], citas: [citaDe()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agendaDelDia.ejecutar(ctx, { fecha: HOY, profesionalId: null });

    // 40 + 25 minutos activos, no los 110 de la ocupación.
    expect(salida.columnas[0]?.minutosOcupados).toBe(65);
    expect(salida.columnas[0]?.citas[0]?.activos).toHaveLength(2);
  });

  it('el bloqueo de TODO el salón le toca a todas las columnas', async () => {
    // Pintarlo sólo en la de quien lo creó hace que la rejilla ofrezca la hora
    // de la junta en las demás.
    const base = baseDe({
      profesionales: [profesional(KARLA, 'Karla', 1), profesional(DANY, 'Dany', 2)],
      horarios_profesional: [
        horario(KARLA, '09:00:00', '19:00:00'),
        horario(DANY, '09:00:00', '19:00:00'),
      ],
      bloqueos_agenda: [{ organizacion_id: ORG, profesional_id: null, rango: rango(14, 0, 15, 0) }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agendaDelDia.ejecutar(ctx, { fecha: HOY, profesionalId: null });

    expect(salida.columnas[0]?.bloqueos).toHaveLength(1);
    expect(salida.columnas[1]?.bloqueos).toHaveLength(1);
  });
});

describe('F-404 + F-415 · los huecos', () => {
  it('EL PROCESADO SE OFRECE COMO HUECO', async () => {
    // Es el 25 %–40 % de capacidad que ningún competidor aprovecha. Si esta
    // prueba se pone verde restando la ocupación entera, el modelo volvió a ser
    // una agenda de un solo número.
    const base = baseDe({ cita_servicios: [tinte()], citas: [citaDe()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await huecosDisponibles.ejecutar(ctx, {
      desde: HOY,
      hasta: '2026-09-17',
      minutos: 40,
      profesionalId: null,
    });

    const intercalado = salida.huecos.find((h) => h.inicio === hora(10, 40));
    expect(intercalado).toBeDefined();
    expect(intercalado?.minutos).toBe(45);
    expect(intercalado?.esIntercalado).toBe(true);
  });

  it('un hueco que NO alcanza no se ofrece', async () => {
    // Doce minutos entre dos citas no sirven para nada y sólo ensucian la
    // pantalla del mostrador con alguien esperando respuesta.
    const base = baseDe({ cita_servicios: [tinte()], citas: [citaDe()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await huecosDisponibles.ejecutar(ctx, {
      desde: HOY,
      hasta: '2026-09-17',
      minutos: 50,
      profesionalId: null,
    });

    expect(salida.huecos.some((h) => h.inicio === hora(10, 40))).toBe(false);
  });

  it('el BLOQUEO recorta el hueco', async () => {
    const base = baseDe({
      bloqueos_agenda: [{ organizacion_id: ORG, profesional_id: KARLA, rango: rango(9, 0, 18, 0) }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await huecosDisponibles.ejecutar(ctx, {
      desde: HOY,
      hasta: '2026-09-17',
      minutos: 40,
      profesionalId: null,
    });

    expect(salida.huecos).toHaveLength(1);
    expect(salida.huecos[0]?.inicio).toBe(hora(18, 0));
  });

  it('un bloqueo de OTRA persona no recorta el mío', async () => {
    const base = baseDe({
      bloqueos_agenda: [{ organizacion_id: ORG, profesional_id: DANY, rango: rango(9, 0, 18, 0) }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await huecosDisponibles.ejecutar(ctx, {
      desde: HOY,
      hasta: '2026-09-17',
      minutos: 40,
      profesionalId: null,
    });

    expect(salida.huecos[0]?.inicio).toBe(hora(9, 0));
  });

  it('sin horario ese día no hay huecos que ofrecer', async () => {
    const base = baseDe({ horarios_profesional: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await huecosDisponibles.ejecutar(ctx, {
      desde: HOY,
      hasta: '2026-09-17',
      minutos: 40,
      profesionalId: null,
    });

    expect(salida.huecos).toEqual([]);
  });

  it('un horario que YA NO RIGE no ofrece nada', async () => {
    // La agenda de marzo se explica con el horario de marzo: aplicarle el de
    // hoy inventa huecos que en marzo no existían.
    const base = baseDe({
      horarios_profesional: [
        { ...horario(KARLA, '09:00:00', '19:00:00'), vigente_hasta: '2026-03-31' },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await huecosDisponibles.ejecutar(ctx, {
      desde: HOY,
      hasta: '2026-09-17',
      minutos: 40,
      profesionalId: null,
    });

    expect(salida.huecos).toEqual([]);
  });
});

describe('los próximos huecos', () => {
  it('NO OFRECE LO QUE YA PASÓ', async () => {
    // Ofrecer las nueve de la mañana a las doce es cómo se agenda una cita que
    // ya pasó.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await proximosHuecos.ejecutar(ctx, {
      minutos: 40,
      profesionalId: null,
      cuantos: 6,
      dias: 1,
    });

    expect(salida.huecos[0]?.inicio).toBe(AHORA.toISOString());
  });

  it('devuelve como mucho los que caben en la pantalla', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await proximosHuecos.ejecutar(ctx, {
      minutos: 40,
      profesionalId: null,
      cuantos: 2,
      dias: 14,
    });

    expect(salida.huecos.length).toBeLessThanOrEqual(2);
  });
});

describe('F-426 · la ocupación', () => {
  it('SE MIDE CONTRA SU HORARIO, no contra el día natural', async () => {
    // Quien trabaja de dos a ocho y llena seis horas está al 100 %, no al 25 %.
    const base = baseDe({
      horarios_profesional: [horario(KARLA, '14:00:00', '20:00:00')],
      cita_servicios: [
        tinte({
          rango_activo: multi(rango(14, 0, 20, 0)),
          rango_ocupacion: rango(14, 0, 20, 0),
        }),
      ],
      citas: [citaDe({ agendada_para: new Date(hora(14, 0)) })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await reporteDeOcupacion.ejecutar(ctx, { desde: HOY, hasta: '2026-09-17' });

    expect(salida.profesionales[0]?.minutosDisponibles).toBe(360);
    expect(salida.profesionales[0]?.ocupacionBp).toBe(10_000);
  });

  it('sin horario la ocupación es cero y NO una división entre cero', async () => {
    const base = baseDe({ horarios_profesional: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await reporteDeOcupacion.ejecutar(ctx, { desde: HOY, hasta: '2026-09-17' });

    expect(salida.profesionales[0]?.ocupacionBp).toBe(0);
  });
});

describe('F-417 · lo que no se vendió', () => {
  it('valora el hueco al ticket medio DE ESA PERSONA', async () => {
    // El hueco de quien hace tintes vale el triple que el de quien hace cortes,
    // y promediarlos esconde justo dónde duele.
    const base = baseDe({ cita_servicios: [tinte()], citas: [citaDe()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await reporteDeHuecos.ejecutar(ctx, { desde: HOY, hasta: '2026-09-17' });

    // 90 000 centavos en 65 minutos activos = 1 384 centavos por minuto.
    // Libres: 09:00–10:00, 10:40–11:25 y 11:50–19:00 = 60 + 45 + 430 = 535.
    expect(salida.minutosPerdidos).toBe(535);
    expect(salida.valorEstimadoCentavos).toBe((535n * 1_384n).toString());
  });

  it('un día sin ventas no vale nada, y no NaN', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await reporteDeHuecos.ejecutar(ctx, { desde: HOY, hasta: '2026-09-17' });

    expect(salida.valorEstimadoCentavos).toBe('0');
    expect(salida.minutosPerdidos).toBe(600);
  });
});

describe('F-951 · a quién le toca volver', () => {
  const expediente = (frecuencia: number | null): Record<string, unknown> => ({
    cliente_id: CLIENTA,
    organizacion_id: ORG,
    frecuencia_dias: frecuencia,
  });
  const ficha = {
    id: CLIENTA,
    organizacion_id: ORG,
    nombre: 'Karla R.',
    telefono: '5512345678',
  };

  it('USA SU RITMO, no un promedio', async () => {
    const base = baseDe({
      expedientes_belleza: [expediente(35)],
      clientes: [ficha],
      citas: [
        {
          id: 'c1',
          organizacion_id: ORG,
          cliente_id: CLIENTA,
          estado: 'cobrada',
          agendada_para: dias(-60),
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await clientesPorVolver.ejecutar(ctx, { holguraDias: 7, limite: 100 });

    expect(salida.clientas).toHaveLength(1);
    expect(salida.clientas[0]?.diasDeRetraso).toBe(25);
  });

  it('LA HOLGURA no llama a quien lleva un día de retraso', async () => {
    // Una lista que incluye a media cartera no se usa.
    const base = baseDe({
      expedientes_belleza: [expediente(35)],
      clientes: [ficha],
      citas: [
        {
          id: 'c1',
          organizacion_id: ORG,
          cliente_id: CLIENTA,
          estado: 'cobrada',
          agendada_para: dias(-36),
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await clientesPorVolver.ejecutar(ctx, { holguraDias: 7, limite: 100 });

    expect(salida.clientas).toEqual([]);
  });

  it('quien NO DECLARÓ su frecuencia no entra', async () => {
    const base = baseDe({
      expedientes_belleza: [expediente(null)],
      clientes: [ficha],
      citas: [
        {
          id: 'c1',
          organizacion_id: ORG,
          cliente_id: CLIENTA,
          estado: 'cobrada',
          agendada_para: dias(-400),
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await clientesPorVolver.ejecutar(ctx, { holguraDias: 7, limite: 100 });

    expect(salida.clientas).toEqual([]);
  });

  it('SIN VISITA COBRADA no se llama a nadie', async () => {
    // «Vuelve, que te toca» a quien no ha venido jamás es la llamada que hace
    // que el salón apague la función.
    const base = baseDe({ expedientes_belleza: [expediente(35)], clientes: [ficha] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await clientesPorVolver.ejecutar(ctx, { holguraDias: 7, limite: 100 });

    expect(salida.clientas).toEqual([]);
  });

  it('una cita CANCELADA no cuenta como visita', async () => {
    const base = baseDe({
      expedientes_belleza: [expediente(35)],
      clientes: [ficha],
      citas: [
        {
          id: 'c1',
          organizacion_id: ORG,
          cliente_id: CLIENTA,
          estado: 'cancelada',
          agendada_para: dias(-10),
        },
        {
          id: 'c2',
          organizacion_id: ORG,
          cliente_id: CLIENTA,
          estado: 'cobrada',
          agendada_para: dias(-80),
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await clientesPorVolver.ejecutar(ctx, { holguraDias: 7, limite: 100 });

    expect(salida.clientas[0]?.diasDesde).toBe(80);
  });
});

/** C.10 de la 2.4 · la estilista ve SU columna sola en la agenda (`agenda.dia`). */
describe('C.10 · la agenda de la estilista', () => {
  const dos = () =>
    baseDe({
      profesionales: [
        { ...profesional(KARLA, 'Karla', 1), empleo_id: EMPLEO },
        { ...profesional(DANY, 'Dany', 2), empleo_id: 'otro-empleo' },
      ],
    });

  it('sin pedir a nadie, ve sólo su columna', async () => {
    const { ctx } = contextoFalso(dos().tx, ambitoDe('mesero'), AHORA);
    const salida = await agendaDelDia.ejecutar(ctx, { fecha: HOY, profesionalId: null });
    expect(salida.columnas.map((c) => c.nombreCorto)).toEqual(['Karla']);
  });

  it('pidiendo la de otra, se le niega', async () => {
    const { ctx } = contextoFalso(dos().tx, ambitoDe('mesero'), AHORA);
    await expect(
      agendaDelDia.ejecutar(ctx, { fecha: HOY, profesionalId: DANY }),
    ).rejects.toMatchObject({ codigo: 'PUENTE_SIN_PERMISO' });
  });

  it('la recepción ve todas las columnas', async () => {
    const { ctx } = contextoFalso(dos().tx, ambitoDe('cajero'), AHORA);
    const salida = await agendaDelDia.ejecutar(ctx, { fecha: HOY, profesionalId: null });
    expect(salida.columnas.map((c) => c.nombreCorto)).toEqual(['Karla', 'Dany']);
  });
});
