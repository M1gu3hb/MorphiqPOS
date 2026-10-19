import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { componerElDia, leerPropinaDelDia, rutaDeLaCita, type Invocar } from './mi-dia.ts';

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

/**
 * D.1 de la 2.4 · «VER FÓRMULA» LLEVA A SU CITA, y «HOY LLEVAS» LEE SU PROPINA.
 *
 * «Ver fórmula» abría la cita en curso sin cita —el botón de guardar salía apagado— y la
 * propina del día se quedaba en «sin dato todavía» para siempre.
 */
describe('Mi día · la cita y la propina', () => {
  it('«Ver fórmula» lleva a la cita en curso DE ESA cita', () => {
    expect(rutaDeLaCita('a1b2')).toBe('/estetica-salon/cita-en-curso?cita=a1b2');
  });

  it('la propina del día es la del servidor, y sin dato es `null`, no cero', async () => {
    const rutas: string[] = [];
    const conDato: Invocar = <T>(ruta: string) => {
      rutas.push(ruta);
      return Promise.resolve({ propinaDelDiaCentavos: '5400' } as T);
    };
    expect(await leerPropinaDelDia(conDato, 'karla')).toBe(5_400);
    expect(rutas).toEqual(['/api/profesionales/karla/mi-dia']);

    const sinRed: Invocar = () => Promise.reject(new Error('sin red'));
    expect(await leerPropinaDelDia(sinRed, 'karla')).toBeNull();
    const sinCampo: Invocar = <T>() => Promise.resolve({} as T);
    expect(await leerPropinaDelDia(sinCampo, 'karla')).toBeNull();
  });

  it('la pantalla usa las dos: lleva a la cita y pinta la propina leída', () => {
    const pantalla = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'MiDia.tsx'),
      'utf8',
    );
    expect(pantalla).toContain('router.push(rutaDeLaCita(citaId))');
    expect(pantalla).toContain('leerPropinaDelDia(invocarComando, yo)');
    expect(pantalla).toContain('propinaCentavos: propinaDelDia,');
  });
});
