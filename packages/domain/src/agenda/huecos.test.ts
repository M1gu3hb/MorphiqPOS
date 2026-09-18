import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { planearCita } from './duracion.ts';
import { aQuienSeLeOfrece, huecosDeAgenda, type CandidataEnEspera } from './huecos.ts';

/**
 * F-404 y F-409 · Los huecos y a quién se le ofrecen.
 *
 * «¿A qué hora le puedo dar un corte?» es la pregunta que se hace en el
 * mostrador con alguien esperando respuesta. Un hueco de doce minutos no es una
 * respuesta: es ruido.
 */

const A_LAS = (hhmm: string) => new Date(`2026-09-15T${hhmm}:00.000Z`);
const MANANA = [{ inicio: A_LAS('09:00'), fin: A_LAS('14:00') }];
const TINTE = { activa1Min: 40, pasivaMin: 45, activa2Min: 25, cierreMin: 10 };

function codigoDe(fn: () => unknown): string {
  try {
    fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('huecosDeAgenda', () => {
  it('EL PROCESADO ES UN HUECO, y ahí está el dinero', () => {
    // Los 45 minutos en que la clienta del tinte está sentada sola.
    const tinte = planearCita(TINTE, A_LAS('10:00'));
    const huecos = huecosDeAgenda(MANANA, tinte.rangosActivos, 30);

    expect(huecos.map((h) => [h.inicio, h.fin])).toEqual([
      [A_LAS('09:00'), A_LAS('10:00')],
      [A_LAS('10:40'), A_LAS('11:25')],
      [A_LAS('11:50'), A_LAS('14:00')],
    ]);
  });

  it('LO QUE NO ALCANZA NO ES UN HUECO', () => {
    // Doce minutos entre dos citas no caben en ningún servicio y sólo ensucian
    // la pantalla justo cuando hay alguien esperando.
    const huecos = huecosDeAgenda(
      MANANA,
      [
        { inicio: A_LAS('09:00'), fin: A_LAS('10:00') },
        { inicio: A_LAS('10:12'), fin: A_LAS('14:00') },
      ],
      30,
    );

    expect(huecos).toEqual([]);
  });

  it('EL HUECO JUSTO SÍ CUENTA', () => {
    const huecos = huecosDeAgenda(
      MANANA,
      [
        { inicio: A_LAS('09:00'), fin: A_LAS('10:00') },
        { inicio: A_LAS('10:30'), fin: A_LAS('14:00') },
      ],
      30,
    );

    expect(huecos).toHaveLength(1);
    expect(huecos[0]?.minutos).toBe(30);
  });

  it('DOS CITAS QUE SE ENCABALGAN no producen un hueco negativo', () => {
    // El terminado de una dentro del procesado de otra. Sin avanzar el reloj
    // con un máximo, el hueco siguiente se contaría dos veces.
    const huecos = huecosDeAgenda(
      MANANA,
      [
        { inicio: A_LAS('10:00'), fin: A_LAS('12:00') },
        { inicio: A_LAS('10:30'), fin: A_LAS('11:00') },
      ],
      30,
    );

    expect(huecos.map((h) => [h.inicio, h.fin])).toEqual([
      [A_LAS('09:00'), A_LAS('10:00')],
      [A_LAS('12:00'), A_LAS('14:00')],
    ]);
  });

  it('EL DESORDEN DE ENTRADA no rompe el barrido', () => {
    const huecos = huecosDeAgenda(
      MANANA,
      [
        { inicio: A_LAS('12:00'), fin: A_LAS('13:00') },
        { inicio: A_LAS('10:00'), fin: A_LAS('11:00') },
      ],
      30,
    );

    expect(huecos.map((h) => [h.inicio, h.fin])).toEqual([
      [A_LAS('09:00'), A_LAS('10:00')],
      [A_LAS('11:00'), A_LAS('12:00')],
      [A_LAS('13:00'), A_LAS('14:00')],
    ]);
  });

  it('LO QUE NO TOCA ESTA VENTANA no la recorta', () => {
    // Un bloqueo de la tarde no puede comerse la mañana.
    const huecos = huecosDeAgenda(MANANA, [{ inicio: A_LAS('16:00'), fin: A_LAS('18:00') }], 30);

    expect(huecos).toEqual([{ inicio: A_LAS('09:00'), fin: A_LAS('14:00'), minutos: 300 }]);
  });

  it('VARIAS VENTANAS: la comida parte el día', () => {
    const huecos = huecosDeAgenda(
      [
        { inicio: A_LAS('09:00'), fin: A_LAS('14:00') },
        { inicio: A_LAS('15:00'), fin: A_LAS('19:00') },
      ],
      [],
      30,
    );

    expect(huecos).toHaveLength(2);
  });

  it('una ventana al revés no produce huecos', () => {
    expect(huecosDeAgenda([{ inicio: A_LAS('14:00'), fin: A_LAS('09:00') }], [], 30)).toEqual([]);
  });

  it('un hueco se busca para un servicio que dura algo', () => {
    expect(codigoDe(() => huecosDeAgenda(MANANA, [], 0))).toBe('CONFIGURACION_INVALIDA');
  });
});

describe('aQuienSeLeOfrece', () => {
  const HUECO = { inicio: A_LAS('10:00'), fin: A_LAS('11:00') };
  const KARLA = 'karla';

  const candidata = (extra: Partial<CandidataEnEspera> = {}): CandidataEnEspera => ({
    id: 'c1',
    apuntadaEn: A_LAS('08:00'),
    ventanas: [{ inicio: A_LAS('09:00'), fin: A_LAS('14:00') }],
    minutosNecesarios: 30,
    profesionalId: null,
    ...extra,
  });

  it('POR ORDEN DE LLEGADA, que es la única justicia que hay', () => {
    // Ordenarla por cuánto gasta convierte una promesa en una subasta, y eso se
    // nota a la tercera vez.
    const lista = aQuienSeLeOfrece(HUECO, KARLA, [
      candidata({ id: 'tarde', apuntadaEn: A_LAS('09:30') }),
      candidata({ id: 'temprano', apuntadaEn: A_LAS('08:00') }),
    ]);

    expect(lista.map((c) => c.id)).toEqual(['temprano', 'tarde']);
  });

  it('A QUIEN NO PUEDE A ESA HORA no se le gasta el mensaje', () => {
    // Es el único mensaje que la clienta va a leer.
    const lista = aQuienSeLeOfrece(HUECO, KARLA, [
      candidata({ id: 'tarde', ventanas: [{ inicio: A_LAS('16:00'), fin: A_LAS('19:00') }] }),
    ]);

    expect(lista).toEqual([]);
  });

  it('EL HUECO TIENE QUE CABER ENTERO en la ventana de la clienta', () => {
    // Que se toquen no basta: si dijo que puede de 10:30 a 12:00, un hueco que
    // empieza a las 10:00 no le sirve, y la llamada se gasta igual.
    const lista = aQuienSeLeOfrece(HUECO, KARLA, [
      candidata({ ventanas: [{ inicio: A_LAS('10:30'), fin: A_LAS('12:00') }] }),
    ]);

    expect(lista).toEqual([]);
  });

  it('A QUIEN NO LE CABE EL SERVICIO tampoco', () => {
    const lista = aQuienSeLeOfrece(HUECO, KARLA, [candidata({ minutosNecesarios: 120 })]);

    expect(lista).toEqual([]);
  });

  it('QUIEN PIDIÓ A OTRA PROFESIONAL no recibe este hueco', () => {
    const lista = aQuienSeLeOfrece(HUECO, KARLA, [
      candidata({ id: 'de_dany', profesionalId: 'dany' }),
      candidata({ id: 'de_karla', profesionalId: KARLA }),
      candidata({ id: 'le_da_igual', profesionalId: null }),
    ]);

    expect(lista.map((c) => c.id)).toEqual(['de_karla', 'le_da_igual']);
  });

  it('el hueco justo cabe', () => {
    const lista = aQuienSeLeOfrece(HUECO, KARLA, [candidata({ minutosNecesarios: 60 })]);

    expect(lista).toHaveLength(1);
  });
});
