import { describe, expect, it } from 'vitest';

import { abrirMesa, liberarMesa } from './mesas.ts';
import { rotacionDeMesas } from './ocupacion.ts';
import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from './pruebas/base-falsa.ts';
import { ambitoDe, CUENTA, mesa, MESA_5, ordenDeMesa, PREDETERMINADOS } from './pruebas/sala.ts';

/**
 * F-305 · Cuánto tarda una mesa.
 *
 * Son dos pruebas distintas y las dos hacen falta:
 *
 *   · que TODA transición deje su sello. Un ledger al que se le olvida una
 *     liberación no deja un hueco: fusiona ese ciclo con el siguiente y da una
 *     ocupación del doble de larga, que es peor que no tener el dato.
 *   · que el promedio y la mediana se calculen sobre los ciclos CERRADOS, y que
 *     el ciclo vigente —la mesa que está ocupada ahora mismo— no entre.
 */

const AHORA = new Date('2026-09-14T21:00:00.000Z');

function ciclo(mesaId: string, numero: number, minutos: number, cambios: Fila = {}): Fila {
  return {
    organizacion_id: '11111111-1111-4111-8111-111111111111',
    sucursal_id: '22222222-2222-4222-8222-222222222222',
    mesa_id: mesaId,
    ciclo: 0,
    orden_id: CUENTA,
    personas: 4,
    inicio: new Date(AHORA.getTime() - minutos * 60_000),
    fin: AHORA,
    minutos_ocupada: minutos,
    minutos_hasta_cuenta: Math.round(minutos * 0.8),
    // La vista y su `left join` con mesas.
    numero,
    ...cambios,
  };
}

const MESA_6 = '66666666-6666-4666-8666-666666666668';

function conCiclos(filas: readonly Fila[]): TablasFalsas {
  return { ocupacion_mesas: filas, mesas: [] };
}

describe('F-305 · el número del que depende la rotación', () => {
  it('promedia y saca mediana de los ciclos cerrados', async () => {
    const base = crearBaseFalsa(
      conCiclos([
        ciclo(MESA_5, 5, 40),
        ciclo(MESA_5, 5, 50),
        ciclo(MESA_6, 6, 60),
        ciclo(MESA_6, 6, 90),
      ]),
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await rotacionDeMesas.ejecutar(ctx, { dias: 7 });

    expect(salida.ciclos).toBe(4);
    expect(salida.minutosPromedio).toBe(60);
    expect(salida.minutosMediana).toBe(55);
    expect(salida.porMesa.map((m) => m.numero)).toEqual([5, 6]);
    expect(salida.porMesa[0]?.minutosPromedio).toBe(45);
  });

  it('LA MEDIANA AGUANTA la mesa que nadie liberó, y el promedio no', async () => {
    // Cuatro mesas normales y una que se quedó abierta toda la noche. El
    // promedio se dispara; la mediana sigue describiendo el servicio real, y
    // ver los dos juntos es lo que enseña que hay un dato raro.
    const base = crearBaseFalsa(
      conCiclos([
        ciclo(MESA_5, 5, 45),
        ciclo(MESA_5, 5, 50),
        ciclo(MESA_5, 5, 55),
        ciclo(MESA_5, 5, 60),
        ciclo(MESA_5, 5, 600),
      ]),
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await rotacionDeMesas.ejecutar(ctx, { dias: 7 });

    expect(salida.minutosMediana).toBe(55);
    expect(salida.minutosPromedio).toBe(162);
  });

  it('LA MEDIANA ORDENA: los ciclos llegan en el orden de la vista, no ordenados', async () => {
    // La vista ordena por fecha, no por duración. Sin ordenar, «la mediana»
    // sería el ciclo que quedó en medio de la lista —el tercero de la noche—,
    // que no dice nada. Con estos cinco, el del medio por fecha es 90 y la
    // mediana real es 50.
    const base = crearBaseFalsa(
      conCiclos([
        ciclo(MESA_5, 5, 30),
        ciclo(MESA_5, 5, 120),
        ciclo(MESA_5, 5, 90),
        ciclo(MESA_5, 5, 40),
        ciclo(MESA_5, 5, 50),
      ]),
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await rotacionDeMesas.ejecutar(ctx, { dias: 7 });

    expect(salida.minutosMediana).toBe(50);
  });

  it('sin ciclos cerrados no inventa un promedio: contesta cero', async () => {
    const base = crearBaseFalsa(conCiclos([]));
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await rotacionDeMesas.ejecutar(ctx, { dias: 7 });

    expect(salida.ciclos).toBe(0);
    expect(salida.minutosPromedio).toBe(0);
    expect(salida.minutosMediana).toBe(0);
  });

  it('EL CICLO VIGENTE NO ENTRA: todavía no se sabe cuánto va a durar', async () => {
    // La mesa que está ocupada AHORA sale de la vista con `fin` nulo. Contarla
    // diría que tardó lo que lleva sentada, que es un número que aún no existe.
    const base = crearBaseFalsa(
      conCiclos([
        ciclo(MESA_5, 5, 40),
        ciclo(MESA_5, 5, 999, { fin: null, minutos_ocupada: null }),
      ]),
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await rotacionDeMesas.ejecutar(ctx, { dias: 7 });

    expect(salida.ciclos).toBe(1);
    expect(salida.minutosPromedio).toBe(40);
  });

  it('LO DE HACE UN MES NO ENTRA en el promedio de la semana', async () => {
    const hace40Dias = new Date(AHORA.getTime() - 40 * 24 * 60 * 60 * 1000);
    const base = crearBaseFalsa(
      conCiclos([
        ciclo(MESA_5, 5, 40),
        ciclo(MESA_5, 5, 900, { inicio: hace40Dias, fin: hace40Dias }),
      ]),
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await rotacionDeMesas.ejecutar(ctx, { dias: 7 });

    expect(salida.ciclos).toBe(1);
    expect(salida.minutosPromedio).toBe(40);
  });

  it('el mesero no lee la rotación del negocio', () => {
    expect(rotacionDeMesas.roles).not.toContain('mesero');
    expect(rotacionDeMesas.roles).not.toContain('cajero');
    expect(rotacionDeMesas.escribe).toBe(false);
  });
});

describe('F-305 · toda transición deja su sello', () => {
  function salonVacio(): TablasFalsas {
    return {
      ordenes: [],
      mesas: [mesa('libre', { orden_activa_id: null, personas_actuales: 0, ocupada_desde: null })],
      orden_lineas: [],
      eventos_mesa: [],
      union_mesa_miembros: [],
      uniones_mesa: [],
    };
  }

  it('ABRIR sella la transición y arranca el reloj', async () => {
    const base = crearBaseFalsa(salonVacio(), { predeterminados: PREDETERMINADOS });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await abrirMesa.ejecutar(ctx, { mesaId: MESA_5, personas: 4, celebracionEspecial: false });

    const eventos = base.filas('eventos_mesa');
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.['estado_anterior']).toBe('libre');
    expect(eventos[0]?.['estado_nuevo']).toBe('esperando_orden');
    expect(eventos[0]?.['personas']).toBe(4);

    const cinco = base.filas('mesas').find((m) => m['id'] === MESA_5);
    expect(cinco?.['ocupada_desde']).toEqual(AHORA);
  });

  it('LIBERAR sella la transición y para el reloj', async () => {
    const base = crearBaseFalsa(
      {
        ...salonVacio(),
        ordenes: [ordenDeMesa('borrador')],
        mesas: [mesa('esperando_orden', { ocupada_desde: new Date('2026-09-14T19:00:00.000Z') })],
      },
      { predeterminados: PREDETERMINADOS },
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await liberarMesa.ejecutar(ctx, { mesaId: MESA_5 });

    const eventos = base.filas('eventos_mesa');
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.['estado_anterior']).toBe('esperando_orden');
    expect(eventos[0]?.['estado_nuevo']).toBe('libre');

    const cinco = base.filas('mesas').find((m) => m['id'] === MESA_5);
    expect(cinco?.['ocupada_desde']).toBeNull();
  });
});
