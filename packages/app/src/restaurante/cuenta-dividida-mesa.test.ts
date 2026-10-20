import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { liberarMesa } from './mesas.ts';
import { pasarMesaCobradaALimpieza } from './mesas-escrituras.ts';
import { contextoFalso, crearBaseFalsa } from './pruebas/base-falsa.ts';
import {
  ambitoDe,
  CUENTA,
  EMPLEO,
  mesa,
  MESA_5,
  ORG,
  ordenDeMesa,
  PREDETERMINADOS,
} from './pruebas/sala.ts';

/**
 * LA MESA DE UNA CUENTA DIVIDIDA (día completo del restaurante, 2.4).
 *
 * Una cuenta dividida deja a la madre con la mesa y a cada parte SIN ella. Dos cosas dependían
 * de que fuera al revés y fallaban sin ruido:
 *
 *   · cobrar las partes no devolvía la mesa al servicio —el cobro la busca por la cuenta que
 *     cobra, y ninguna parte es la activa de nadie—, así que la mesa se quedaba ocupada;
 *   · liberarla a mano trataba a la madre, sin líneas porque se las dio a las partes, como una
 *     «apertura sin consumo» y la CANCELABA: una venta cobrada al centavo por sus partes salía
 *     en el corte como cancelada, «mesa liberada sin consumo».
 */

const MADRE = CUENTA;
const PARTE_1 = '12121212-1212-4121-8121-121212121211';
const PARTE_2 = '12121212-1212-4121-8121-121212121212';
const AHORA = new Date('2026-09-20T20:00:00.000Z');

/** La mesa 5 con su cuenta dividida en dos, cada una en el estado que pida la prueba. */
function salon(partes: readonly [string, string], estadoDeLaMesa = 'cuenta_solicitada') {
  return crearBaseFalsa(
    {
      ordenes: [
        ordenDeMesa('dividida', { id: MADRE, orden_padre_id: null }),
        ordenDeMesa(partes[0], {
          id: PARTE_1,
          mesa_id: null,
          orden_padre_id: MADRE,
          division_indice: 1,
        }),
        ordenDeMesa(partes[1], {
          id: PARTE_2,
          mesa_id: null,
          orden_padre_id: MADRE,
          division_indice: 2,
        }),
      ],
      orden_lineas: [],
      mesas: [mesa(estadoDeLaMesa, { orden_activa_id: MADRE })],
      eventos_mesa: [],
    },
    { predeterminados: PREDETERMINADOS },
  );
}

const cobrando = (base: ReturnType<typeof salon>, parte: string) =>
  pasarMesaCobradaALimpieza(base.tx, ORG, parte, { empleoId: EMPLEO, ahora: AHORA });

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('cobrar las partes de una cuenta dividida', () => {
  it('LA PRIMERA PARTE QUE SE COBRA NO RECOGE LA MESA: la otra sigue sentada esperando', async () => {
    const base = salon(['cuenta_solicitada', 'cuenta_solicitada']);

    const tocada = await cobrando(base, PARTE_1);

    expect(tocada).toBeNull();
    expect(base.filas('mesas')[0]?.['estado']).toBe('cuenta_solicitada');
    expect(base.filas('eventos_mesa')).toEqual([]);
  });

  it('LA ÚLTIMA SÍ: la mesa pasa a limpieza y el ledger la deja con la cuenta de la mesa', async () => {
    // La primera ya se cobró; ésta es la que se cobra ahora y todavía figura sin cobrar
    // porque la transacción del cobro no la ha marcado pagada.
    const base = salon(['pagada', 'cuenta_solicitada']);

    const tocada = await cobrando(base, PARTE_2);

    expect(tocada?.numero).toBe(5);
    expect(base.filas('mesas')[0]?.['estado']).toBe('limpieza');
    const evento = base.filas('eventos_mesa')[0];
    expect(evento?.['estado_anterior']).toBe('cuenta_solicitada');
    expect(evento?.['estado_nuevo']).toBe('limpieza');
    // El ledger de la mesa conoce la madre —la cuenta que la abrió—, no la parte.
    expect(evento?.['orden_id']).toBe(MADRE);
  });

  it('una parte CANCELADA ya no espera cobro: la que se cobra entonces es la última', async () => {
    const base = salon(['cancelada', 'cuenta_solicitada']);

    const tocada = await cobrando(base, PARTE_2);

    expect(tocada?.numero).toBe(5);
    expect(base.filas('mesas')[0]?.['estado']).toBe('limpieza');
  });

  it('UNA PARTE DEVUELTA TAMBIÉN ESTÁ SALDADA: la mesa no se queda esperándola', async () => {
    const base = salon(['reembolsada', 'cuenta_solicitada']);

    expect((await cobrando(base, PARTE_2))?.numero).toBe(5);
  });
});

describe('liberar la mesa de una cuenta dividida', () => {
  it('CON TODAS LAS PARTES COBRADAS la mesa se libera y la madre NO se cancela', async () => {
    const base = salon(['pagada', 'pagada'], 'limpieza');
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await liberarMesa.ejecutar(ctx, { mesaId: MESA_5 });

    expect(salida.ordenCancelada).toBeNull();
    expect(base.filas('mesas')[0]?.['estado']).toBe('libre');
    // La madre sigue dividida: su consumo lo cobraron las partes. Cancelarla sacaba del
    // corte, como «cancelada», una venta que se cobró entera.
    const madre = base.filas('ordenes').find((o) => o['id'] === MADRE);
    expect(madre?.['estado']).toBe('dividida');
    expect(madre?.['motivo_cancelacion'] ?? null).toBeNull();
  });

  it('CON UNA PARTE SIN COBRAR la mesa NO se libera: es lo que la caja todavía tiene que cobrar', async () => {
    const base = salon(['pagada', 'cuenta_solicitada']);
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const codigo = await codigoDe(() => liberarMesa.ejecutar(ctx, { mesaId: MESA_5 }));

    expect(codigo).toBe('MESA_NO_LIBERABLE');
    expect(base.filas('mesas')[0]?.['estado']).toBe('cuenta_solicitada');
    expect(base.filas('ordenes').find((o) => o['id'] === MADRE)?.['estado']).toBe('dividida');
  });
});
