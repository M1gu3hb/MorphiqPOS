import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { leerLaCita, type Consultar } from './cita-en-curso.ts';

/**
 * «Cita en curso» toma a la clienta de la CITA, no de la dirección (D.1 de la 2.4): la
 * agenda sólo manda `?cita=`, y con la clienta en nulo la pantalla decía «Sin registrar» y
 * nunca enseñaba la fórmula de la vez pasada.
 */

function puenteFalso(filas: Readonly<Record<string, readonly unknown[]>>) {
  const pedidas: { entidad: string; filtro: unknown }[] = [];
  const consultar: Consultar = <T>(
    entidad: string,
    opciones: { readonly filtro?: Readonly<Record<string, unknown>> },
  ) => {
    pedidas.push({ entidad, filtro: opciones.filtro });
    return Promise.resolve((filas[entidad] ?? []) as readonly T[]);
  };
  return { pedidas, consultar };
}

describe('lo que «Cita en curso» lee al abrir', () => {
  it('la clienta y su historial salen del `cliente_id` de la cita', async () => {
    const { pedidas, consultar } = puenteFalso({
      Cita: [{ id: 'c1', agendada_para: 'x', inicio_real: null, cliente_id: 'mariana' }],
      Cliente: [{ nombre: 'Mariana Ortiz' }],
      CitaServicio: [{ id: 's1' }],
      FormulaAplicada: [{ id: 'f1' }],
    });

    const leida = await leerLaCita(consultar, 'c1');

    expect(leida.clienta?.nombre).toBe('Mariana Ortiz');
    expect(leida.formulas).toEqual([{ id: 'f1' }]);
    expect(pedidas).toContainEqual({ entidad: 'Cliente', filtro: { id: 'mariana' } });
    expect(pedidas).toContainEqual({
      entidad: 'FormulaAplicada',
      filtro: { cliente_id: 'mariana' },
    });
  });

  it('una walk-in sin ficha no pregunta por «nadie»: sin clienta y sin historial ajeno', async () => {
    const { pedidas, consultar } = puenteFalso({
      Cita: [{ id: 'c1', agendada_para: 'x', inicio_real: null, cliente_id: null }],
      FormulaAplicada: [{ id: 'de-otra' }],
    });

    const leida = await leerLaCita(consultar, 'c1');

    expect(leida.clienta).toBeUndefined();
    expect(leida.formulas).toEqual([]);
    expect(pedidas.map((p) => p.entidad)).toEqual(['Cita', 'CitaServicio']);
  });

  it('si el historial no carga, la captura sigue en pie: `null`, no un fallo', async () => {
    const consultar: Consultar = <T>(entidad: string) =>
      entidad === 'FormulaAplicada'
        ? Promise.reject(new Error('sin red'))
        : Promise.resolve(
            (entidad === 'Cita'
              ? [{ id: 'c1', agendada_para: 'x', inicio_real: null, cliente_id: 'mariana' }]
              : []) as unknown as readonly T[],
          );

    const leida = await leerLaCita(consultar, 'c1');

    expect(leida.formulas).toBeNull();
  });
});

describe('la pantalla lee así', () => {
  it('«Cita en curso» usa `leerLaCita` y ya no toma a la clienta de la dirección', () => {
    const pantalla = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'CitaEnCurso.tsx'),
      'utf8',
    );
    expect(pantalla).toContain('leerLaCita(consultarPuente, citaId, señal)');
    expect(pantalla).not.toContain("get('clienta')");
  });
});
