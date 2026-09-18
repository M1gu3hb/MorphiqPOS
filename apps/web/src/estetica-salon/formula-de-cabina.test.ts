import { describe, expect, it } from 'vitest';

import { PASO, mover, sobrante, transcurrido, type Mezcla } from './formula-de-cabina';

/**
 * F-154 y F-436 · La fórmula capturada al aplicar.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * El sobrante, que es el 10-20 % del producto de cabina que hoy se tira sin
 * apunte y el número que convierte «el tinte se acaba muy rápido» en una cifra.
 * Y que editar la fórmula de hoy NO toque la de la visita anterior, que se
 * enseña al lado: mutarla haría que el botón REPETIR dejara de repetir lo que
 * la clienta vio.
 */

function mezcla(cambios: Partial<Mezcla> = {}): Mezcla {
  return {
    mezclado: 90,
    usado: 90,
    componentes: [
      { nombre: '6.0', cantidad: 60, unidad: 'g' },
      { nombre: 'ox 20 vol', cantidad: 90, unidad: 'ml' },
    ],
    minutos: 35,
    ...cambios,
  };
}

describe('F-154 · el sobrante', () => {
  it('es lo mezclado menos lo usado', () => {
    expect(sobrante(120, 90)).toBe(30);
  });

  it('usar TODO deja cero, no un hueco', () => {
    expect(sobrante(90, 90)).toBe(0);
  });

  it('NUNCA es negativo', () => {
    // Usar más de lo mezclado es imposible en la realidad y es un tecleo en la
    // pantalla. Un sobrante en rojo sería un dato imposible enseñado como si
    // fuera cierto, y de ahí saldría un costo de servicio equivocado.
    expect(sobrante(90, 120)).toBe(0);
  });
});

describe('F-154 · el cronómetro de la cita', () => {
  it('se dice en hh:mm, no en segundos', () => {
    const inicio = Date.parse('2026-09-15T10:00:00.000Z');
    expect(transcurrido(inicio, inicio + 23 * 60_000)).toBe('00:23');
  });

  it('pasa de la hora sin romperse', () => {
    const inicio = Date.parse('2026-09-15T10:00:00.000Z');
    expect(transcurrido(inicio, inicio + 95 * 60_000)).toBe('01:35');
  });

  it('un reloj que va atrás da cero y no un número negativo', () => {
    // Pasa de verdad: el reloj del servidor y el de la tablet no son el mismo, y
    // «en curso -00:02» es lo que hace que nadie vuelva a mirar ese renglón.
    const inicio = Date.parse('2026-09-15T10:00:00.000Z');
    expect(transcurrido(inicio, inicio - 120_000)).toBe('00:00');
  });
});

describe('F-154 · mover un componente', () => {
  it('sube de diez en diez, porque nadie pesa de a un gramo', () => {
    const movida = mover(mezcla(), 0, PASO);

    expect(movida.componentes[0]?.cantidad).toBe(70);
    expect(PASO).toBe(10);
  });

  it('NO MUTA la mezcla que recibe', () => {
    // La fórmula de la visita anterior se enseña al lado mientras se edita la de
    // hoy: mutarla haría que REPETIR dejara de repetir lo que la clienta vio.
    const original = mezcla();
    mover(original, 0, PASO);

    expect(original.componentes[0]?.cantidad).toBe(60);
  });

  it('no baja de cero', () => {
    const movida = mover(mezcla(), 0, -1000);

    expect(movida.componentes[0]?.cantidad).toBe(0);
  });

  it('sólo toca el componente que se pidió', () => {
    const movida = mover(mezcla(), 1, PASO);

    expect(movida.componentes[0]?.cantidad).toBe(60);
    expect(movida.componentes[1]?.cantidad).toBe(100);
  });

  it('un índice que no existe deja la mezcla igual', () => {
    const movida = mover(mezcla(), 9, PASO);

    expect(movida.componentes.map((c) => c.cantidad)).toEqual([60, 90]);
  });

  it('conserva los minutos de procesado', () => {
    // El tiempo no es un adorno: es la mitad de lo que hay que repetir.
    expect(mover(mezcla(), 0, PASO).minutos).toBe(35);
  });
});
