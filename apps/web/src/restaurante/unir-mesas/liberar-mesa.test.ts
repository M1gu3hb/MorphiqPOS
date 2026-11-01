import { describe, expect, it } from 'vitest';

import { ErrorPuente } from '../../../heredado/api/cliente';
import { ErrorApi } from '~/cliente/api';

import { liberarConDecision, reglaDe, type DecisionDelGrupo } from './liberar-mesa';

const SIN_DECISION = 'MESA_UNIDA_SIN_DECISION';
const unida = () => new ErrorPuente('REGLA_DE_NEGOCIO', 'unida', 422, { regla: SIN_DECISION });

/** Un servidor de mentira: rechaza sin decisión mientras la mesa encabece un grupo. */
function servidor(encabezaGrupo: boolean) {
  const llamadas: unknown[] = [];
  const ejecutar = (entrada: { mesaId: string; grupo?: DecisionDelGrupo }) => {
    llamadas.push(entrada);
    return encabezaGrupo && entrada.grupo === undefined
      ? Promise.reject(unida())
      : Promise.resolve();
  };
  return { llamadas, ejecutar };
}

describe('liberar una mesa que encabeza un grupo', () => {
  it('lee la regla del cliente nuevo y del heredado', () => {
    const nuevo = new ErrorApi(
      { codigo: 'REGLA_DE_NEGOCIO', mensaje: 'unida', datos: { regla: SIN_DECISION } },
      422,
      null,
    );
    expect(reglaDe(nuevo)).toBe(SIN_DECISION);
    expect(reglaDe(unida())).toBe(SIN_DECISION);
    expect(reglaDe(new ErrorPuente('ERROR_INTERNO', 'x', 500))).toBeNull();
    expect(reglaDe(new Error('x'))).toBeNull();
    expect(reglaDe(null)).toBeNull();
  });

  it('sin grupo se libera a la primera, sin preguntar', async () => {
    const { llamadas, ejecutar } = servidor(false);
    let preguntas = 0;
    const liberada = await liberarConDecision('m1', ejecutar, () => {
      preguntas += 1;
      return Promise.resolve('separar');
    });
    expect([liberada, preguntas, llamadas]).toEqual([true, 0, [{ mesaId: 'm1' }]]);
  });

  it.each(['separar', 'mantener'] as const)(
    'con grupo pregunta y vuelve a intentar con «%s»',
    async (decision) => {
      const { llamadas, ejecutar } = servidor(true);
      const liberada = await liberarConDecision('m1', ejecutar, () => Promise.resolve(decision));
      expect(liberada).toBe(true);
      expect(llamadas).toEqual([{ mesaId: 'm1' }, { mesaId: 'm1', grupo: decision }]);
    },
  );

  it('si la pantalla ya sabe que encabeza un grupo, pregunta antes y libera UNA vez', async () => {
    const { llamadas, ejecutar } = servidor(true);
    const liberada = await liberarConDecision(
      'm1',
      ejecutar,
      () => Promise.resolve('mantener'),
      true,
    );
    expect([liberada, llamadas]).toEqual([true, [{ mesaId: 'm1', grupo: 'mantener' }]]);
    const otro = servidor(true);
    expect(await liberarConDecision('m1', otro.ejecutar, () => Promise.resolve(null), true)).toBe(
      false,
    );
    expect(otro.llamadas, 'Se canceló: no se libera nada.').toEqual([]);
  });

  it('si se cancela la pregunta, la mesa sigue como estaba', async () => {
    const { llamadas, ejecutar } = servidor(true);
    const liberada = await liberarConDecision('m1', ejecutar, () => Promise.resolve(null));
    expect([liberada, llamadas]).toEqual([false, [{ mesaId: 'm1' }]]);
  });

  it('cualquier otro rechazo se dice tal cual: no se pregunta por el grupo', async () => {
    const otro = new ErrorPuente('REGLA_DE_NEGOCIO', 'La mesa tiene consumo.', 422, {
      regla: 'MESA_NO_LIBERABLE',
    });
    let preguntas = 0;
    await expect(
      liberarConDecision(
        'm1',
        () => Promise.reject(otro),
        () => {
          preguntas += 1;
          return Promise.resolve('separar');
        },
      ),
    ).rejects.toBe(otro);
    expect(preguntas).toBe(0);
  });
});
