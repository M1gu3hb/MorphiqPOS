import { describe, expect, it } from 'vitest';

import { componerElDia } from './mi-dia.ts';

/**
 * C.9 de la 2.4 · «Mi día» con lo que el puente SÍ sirve.
 *
 * El nombre del servicio llegaba en `null` aunque el puente ya lo derivaba, los minutos
 * de procesado también, y la alergia se buscaba en las notas de la cita: una clienta con
 * alergia declarada en su expediente y sin la palabra en la nota salía sin bandera.
 */

const HOY = new Date('2026-09-25T18:00:00');
const CITA = {
  id: 'c1',
  folio: 'CITA-7',
  cliente_id: 'cl1',
  estado: 'agendada',
  agendada_para: new Date('2026-09-25T17:00:00').toISOString(),
  notas: 'Viene con su hija',
};
const SERVICIO = {
  id: 'cs1',
  cita_id: 'c1',
  precio_pesos: 900,
  servicio_nombre: 'Tinte raíz',
  minutos_procesado: 45,
};

describe('componerElDia', () => {
  it('trae el nombre del servicio y sus minutos de procesado', () => {
    const [fila] = componerElDia([SERVICIO], [CITA], [{ id: 'cl1', nombre: 'Lupita' }], [], HOY);
    expect(fila?.servicio).toBe('Tinte raíz');
    expect(fila?.minutosProcesado).toBe(45);
    expect(fila?.precioCentavos).toBe(90_000);
  });

  it('la alergia sale del EXPEDIENTE, aunque la nota no diga «alergia»', () => {
    const [fila] = componerElDia(
      [SERVICIO],
      [CITA],
      [],
      [{ id: 'cl1', alergias: 'PPD: ardor en el cuero cabelludo' }],
      HOY,
    );
    expect(fila?.alergias).toBe(true);
  });

  it('una nota que dice «alergia» sin expediente NO pone la bandera, y un expediente en blanco tampoco', () => {
    const conNota = { ...CITA, notas: 'Preguntar por alergias la próxima' };
    expect(componerElDia([SERVICIO], [conNota], [], [], HOY)[0]?.alergias).toBe(false);
    expect(
      componerElDia([SERVICIO], [CITA], [], [{ id: 'cl1', alergias: '   ' }], HOY)[0]?.alergias,
    ).toBe(false);
  });

  it('las citas de otro día no entran', () => {
    const ayer = { ...CITA, agendada_para: new Date('2026-09-24T17:00:00').toISOString() };
    expect(componerElDia([SERVICIO], [ayer], [], [], HOY)).toHaveLength(0);
  });
});
