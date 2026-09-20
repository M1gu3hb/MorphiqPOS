import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, EMPLEO, ORG, SESION_CAJA, TERMINAL } from '../restaurante/pruebas/sala.ts';
import { abrirPresencia } from './presencia.ts';

/**
 * F-248 · La hora a la que alguien entró al turno.
 *
 * ── Qué defienden estas pruebas ──────────────────────────────────────────
 * Que el SEGUNDO PIN del turno no sea una entrada nueva. El barista teclea su PIN
 * varias veces —para cobrar, al volver del descanso, porque la tablet se bloquea— y
 * con una presencia por tecleo el bote se reparte entre seis presencias de la misma
 * persona.
 *
 * Que sin TURNO no se registre nada: la presencia es del turno, no del día, y es lo
 * que ata las horas al bote que se va a repartir.
 *
 * Y que un empleo de OTRO negocio no cuelgue horas de este turno.
 */

const AHORA = new Date('2026-09-19T15:00:00.000Z');
const ANTES = new Date('2026-09-19T14:00:00.000Z');
const OTRA_ORG = 'a9999999-9999-4999-8999-999999999999';
const PRESENCIA = 'd1111111-1111-4111-8111-111111111111';

function baseDe(extra: Partial<Record<string, readonly Fila[]>> = {}) {
  return crearBaseFalsa(
    {
      sesiones_caja: [
        {
          id: SESION_CAJA,
          organizacion_id: ORG,
          terminal_id: TERMINAL,
          estado: 'abierta',
          abierta_en: ANTES,
        },
      ],
      empleos: [{ id: EMPLEO, organizacion_id: ORG, activo: true }],
      presencias_turno: [],
      ...extra,
    },
    {
      predeterminados: {
        presencias_turno: {
          salio_en: null,
          minutos: null,
          ajustada_por: null,
          motivo_ajuste: null,
        },
      },
    },
  );
}

describe('F-248 · abrir la presencia del turno', () => {
  it('EL PRIMER PIN ABRE LA PRESENCIA, con su hora y su origen', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await abrirPresencia.ejecutar(ctx, { quienEntraId: EMPLEO });

    expect(salida.yaEstaba).toBe(false);
    expect(base.filas('presencias_turno')).toHaveLength(1);
    expect(base.campo('presencias_turno', 'entro_en')).toEqual(AHORA);
    expect(base.campo('presencias_turno', 'sesion_caja_id')).toBe(SESION_CAJA);
    // `pin` y no `manual`: lo registró el tecleo. La diferencia es la que permite
    // auditar quién se infló las horas.
    expect(base.campo('presencias_turno', 'origen')).toBe('pin');
  });

  it('EL SEGUNDO PIN NO ABRE OTRA: devuelve la que ya estaba', async () => {
    const base = baseDe({
      presencias_turno: [
        {
          id: PRESENCIA,
          organizacion_id: ORG,
          sesion_caja_id: SESION_CAJA,
          empleado_id: EMPLEO,
          entro_en: ANTES,
          salio_en: null,
          origen: 'pin',
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await abrirPresencia.ejecutar(ctx, { quienEntraId: EMPLEO });

    expect(salida.yaEstaba).toBe(true);
    expect(salida.presenciaId).toBe(PRESENCIA);
    // Y la hora de entrada NO se mueve: el descanso no empieza el turno de nuevo.
    expect(salida.entroEn).toBe(ANTES.toISOString());
    expect(base.filas('presencias_turno')).toHaveLength(1);
  });

  it('SIN TURNO ABIERTO no se registra nada', async () => {
    const base = baseDe({ sesiones_caja: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await abrirPresencia
      .ejecutar(ctx, { quienEntraId: EMPLEO })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('CAJA_CERRADA');
    expect(base.filas('presencias_turno')).toEqual([]);
  });

  it('UN EMPLEO DE OTRO NEGOCIO no cuelga horas de este turno', async () => {
    const base = baseDe({ empleos: [{ id: EMPLEO, organizacion_id: OTRA_ORG, activo: true }] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await abrirPresencia
      .ejecutar(ctx, { quienEntraId: EMPLEO })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('ACCESO_NO_ENCONTRADO');
    expect(base.filas('presencias_turno')).toEqual([]);
  });
});
