import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { reprogramarCita } from './reprogramar.ts';

/**
 * Reprogramar una cita.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que la cita se DESPLACE entera y conserve su folio. Cancelarla y volver a
 * agendarla —que es lo que se hace sin esto— cuesta el folio que la clienta
 * trae anotado, el anticipo que colgaba de ella, y un historial que dice que
 * faltó cuando sólo cambió de día.
 *
 * Que la duración no cambie. Los servicios y las personas son los mismos:
 * replanear desde el catálogo le movería la hora de salida a la clienta sin que
 * nadie lo pidiera.
 *
 * Y que la cita NO SE ESTORBE A SÍ MISMA. Comprobar el choque sin excluirla
 * haría que nada se pudiera mover nunca.
 */

const AHORA = new Date('2026-09-16T09:00:00.000Z');
const CITA = 'b1000000-0000-4000-8000-000000000001';
const OTRA = 'b1000000-0000-4000-8000-000000000002';
const KARLA = 'aa000000-0000-4000-8000-000000000001';

const hora = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 16, h, m, 0, 0));
const rango = (h1: number, m1: number, h2: number, m2: number) =>
  `[${hora(h1, m1).toISOString()},${hora(h2, m2).toISOString()})`;
const multi = (...partes: string[]) => `{${partes.join(',')}}`;

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa({
    citas: [
      {
        id: CITA,
        organizacion_id: ORG,
        folio: 'CITA-42',
        estado: 'agendada',
        agendada_para: hora(10, 0),
        notas: null,
      },
    ],
    cita_servicios: [
      {
        id: 'cs1',
        organizacion_id: ORG,
        cita_id: CITA,
        profesional_id: KARLA,
        rango_activo: multi(rango(10, 0, 10, 40), rango(11, 25, 11, 50)),
        rango_ocupacion: rango(10, 0, 11, 50),
      },
    ],
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

describe('reprogramar', () => {
  it('CONSERVA EL FOLIO y desplaza la cita entera', async () => {
    // Es lo que la clienta trae anotado. Cancelar y volver a agendar lo pierde.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await reprogramarCita.ejecutar(ctx, {
      citaId: CITA,
      inicio: hora(14, 0).toISOString(),
      motivo: null,
    });

    expect(salida.folio).toBe('CITA-42');
    expect(salida.minutosMovidos).toBe(240);
    expect(base.campo('citas', 'agendada_para')).toEqual(hora(14, 0));
  });

  it('LA DURACIÓN NO CAMBIA: se mueve, no se replanea', async () => {
    // Un cambio de duración en el catálogo entre ayer y hoy no puede alterarle
    // la hora de salida a quien sólo pidió otro día.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await reprogramarCita.ejecutar(ctx, {
      citaId: CITA,
      inicio: hora(14, 0).toISOString(),
      motivo: null,
    });

    expect(base.campo('cita_servicios', 'rango_ocupacion')).toBe(rango(14, 0, 15, 50));
    // Los DOS tramos activos se conservan: el procesado sigue siendo procesado.
    expect(base.campo('cita_servicios', 'rango_activo')).toBe(
      multi(rango(14, 0, 14, 40), rango(15, 25, 15, 50)),
    );
  });

  it('LA CITA NO SE ESTORBA A SÍ MISMA', async () => {
    // Sin excluirla del choque, nada se podría mover nunca: su posición vieja
    // le taparía la nueva en cuanto se solaparan.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await reprogramarCita.ejecutar(ctx, {
      citaId: CITA,
      inicio: hora(10, 30).toISOString(),
      motivo: null,
    });

    expect(salida.minutosMovidos).toBe(30);
  });

  it('CHOCAR con otra persona lo impide', async () => {
    const base = baseDe({
      citas: [
        {
          id: CITA,
          organizacion_id: ORG,
          folio: 'CITA-42',
          estado: 'agendada',
          agendada_para: hora(10, 0),
          notas: null,
        },
        {
          id: OTRA,
          organizacion_id: ORG,
          folio: 'CITA-43',
          estado: 'agendada',
          agendada_para: hora(14, 0),
          notas: null,
        },
      ],
      cita_servicios: [
        {
          id: 'cs1',
          organizacion_id: ORG,
          cita_id: CITA,
          profesional_id: KARLA,
          rango_activo: multi(rango(10, 0, 10, 40)),
          rango_ocupacion: rango(10, 0, 10, 40),
        },
        {
          id: 'cs2',
          organizacion_id: ORG,
          cita_id: OTRA,
          profesional_id: KARLA,
          rango_activo: multi(rango(14, 0, 15, 0)),
          rango_ocupacion: rango(14, 0, 15, 0),
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      reprogramarCita.ejecutar(ctx, {
        citaId: CITA,
        inicio: hora(14, 20).toISOString(),
        motivo: null,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
    // Y no dejó nada movido a medias.
    expect(base.campo('citas', 'agendada_para')).toEqual(hora(10, 0));
  });

  it('una cita EN CURSO ya no se mueve', async () => {
    // La clienta ya está sentada.
    const base = baseDe({
      citas: [
        {
          id: CITA,
          organizacion_id: ORG,
          folio: 'CITA-42',
          estado: 'en_curso',
          agendada_para: hora(10, 0),
          notas: null,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      reprogramarCita.ejecutar(ctx, {
        citaId: CITA,
        inicio: hora(14, 0).toISOString(),
        motivo: null,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
  });

  it('el motivo SE AÑADE a las notas, no las pisa', async () => {
    // Una cita movida dos veces tiene dos motivos, y el segundo pisando al
    // primero deja la historia a medias.
    const base = baseDe({
      citas: [
        {
          id: CITA,
          organizacion_id: ORG,
          folio: 'CITA-42',
          estado: 'agendada',
          agendada_para: hora(10, 0),
          notas: 'alérgica al amoniaco',
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await reprogramarCita.ejecutar(ctx, {
      citaId: CITA,
      inicio: hora(14, 0).toISOString(),
      motivo: 'la clienta pidió más tarde',
    });

    expect(base.campo('citas', 'notas')).toBe(
      'alérgica al amoniaco\nReprogramada: la clienta pidió más tarde',
    );
  });

  it('mover a LA MISMA hora se rechaza', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      reprogramarCita.ejecutar(ctx, {
        citaId: CITA,
        inicio: hora(10, 0).toISOString(),
        motivo: null,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });

  it('una cita de otro negocio no existe', async () => {
    const base = baseDe({ citas: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      reprogramarCita.ejecutar(ctx, {
        citaId: CITA,
        inicio: hora(14, 0).toISOString(),
        motivo: null,
      }),
    );

    expect(codigo).toBe('PUENTE_NO_ENCONTRADO');
  });
});
