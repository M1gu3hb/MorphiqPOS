import { describe, expect, it } from 'vitest';

import { conExpedienteYFaltas } from './ficha-de-clienta.ts';

/**
 * C.9 de la 2.4 · la alergia y las faltas llegan a la agenda.
 *
 * Los dos avisos existían en la pantalla y no salían nunca: el cliente del puente no traía
 * ni `alergias` ni `faltas_6m`.
 */

const AHORA = new Date('2026-09-25T12:00:00.000Z');
const LUPITA = { id: 'cl1', nombre: 'Lupita' };
const ANA = { id: 'cl2', nombre: 'Ana' };

describe('conExpedienteYFaltas', () => {
  it('marca la alergia del expediente y cuenta las faltas de seis meses', () => {
    const [lupita, ana] = conExpedienteYFaltas(
      [LUPITA, ANA],
      [
        { id: 'cl1', alergias: 'Amoniaco' },
        { id: 'cl2', alergias: '' },
      ],
      [
        { cliente_id: 'cl1', ocurrio_en: '2026-09-01T16:00:00.000Z' },
        { cliente_id: 'cl1', ocurrio_en: '2026-06-10T16:00:00.000Z' },
        // Hace más de seis meses: ya no cuenta.
        { cliente_id: 'cl1', ocurrio_en: '2026-01-10T16:00:00.000Z' },
      ],
      AHORA,
    );
    expect(lupita).toMatchObject({ nombre: 'Lupita', alergias: true, faltas_6m: 2 });
    expect(ana).toMatchObject({ alergias: false, faltas_6m: 0 });
  });

  it('una falta sin fecha o sin clienta no se cuenta', () => {
    const [lupita] = conExpedienteYFaltas(
      [LUPITA],
      [],
      [
        { cliente_id: 'cl1', ocurrio_en: null },
        { cliente_id: null, ocurrio_en: '2026-09-01T16:00:00.000Z' },
      ],
      AHORA,
    );
    expect(lupita?.faltas_6m).toBe(0);
  });
});
