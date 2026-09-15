import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { elProfesionalPuede, planearCita, seEnciman } from './duracion.ts';

/**
 * F-401 y F-415 · La duración como secuencia.
 *
 * Un tinte son 40 de aplicación, 45 de procesado, 25 de terminado y 10 de
 * limpieza. Si la agenda bloquea al profesional durante el procesado, el salón
 * atiende 6 clientas al día; si lo libera, 9 con la misma gente. Es el 25 %–40 %
 * de capacidad que ningún competidor aprovecha, y todo sale de aquí.
 */

const TINTE = { activa1Min: 40, pasivaMin: 45, activa2Min: 25, cierreMin: 10 };
/** Barbería: no hay procesado, y el mismo modelo sirve sin una sola rama. */
const CORTE = { activa1Min: 30, pasivaMin: 0, activa2Min: 0, cierreMin: 5 };

const A_LAS = (hhmm: string) => new Date(`2026-09-15T${hhmm}:00.000Z`);

function codigoDe(fn: () => unknown): string {
  try {
    fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('planearCita', () => {
  it('EL PROCESADO NO OCUPA AL PROFESIONAL, y ésa es la función entera', () => {
    const cita = planearCita(TINTE, A_LAS('10:00'));

    // La estación está ocupada las dos horas completas.
    expect(cita.rangoOcupacion.inicio).toEqual(A_LAS('10:00'));
    expect(cita.rangoOcupacion.fin).toEqual(A_LAS('12:00'));

    // Pero el profesional sólo 65 minutos, en DOS rangos con un hueco en medio.
    expect(cita.rangosActivos).toEqual([
      { inicio: A_LAS('10:00'), fin: A_LAS('10:40') },
      { inicio: A_LAS('11:25'), fin: A_LAS('11:50') },
    ]);
    expect(cita.minutosActivos).toBe(65);
    expect(cita.minutosIntercalables).toBe(45);
  });

  it('LOS CUATRO TRAMOS, en orden y encadenados', () => {
    const cita = planearCita(TINTE, A_LAS('10:00'));

    expect(cita.tramos.map((t) => t.tipo)).toEqual(['activa_1', 'pasiva', 'activa_2', 'cierre']);
    for (let i = 1; i < cita.tramos.length; i += 1) {
      expect(cita.tramos[i]?.inicio).toEqual(cita.tramos[i - 1]?.fin);
    }
  });

  it('EL CIERRE OCUPA LA ESTACIÓN, no al profesional', () => {
    // Limpiar el lavabo lo hace quien esté libre; lo que no se puede es sentar
    // a la siguiente en un lavabo sucio. Contarlo como tiempo del profesional
    // le quitaría una hora de agenda al día.
    const cita = planearCita(TINTE, A_LAS('10:00'));

    expect(cita.rangoOcupacion.fin).toEqual(A_LAS('12:00'));
    expect(cita.rangosActivos.at(-1)?.fin).toEqual(A_LAS('11:50'));
  });

  it('SIN PROCESADO, un solo rango activo y el modelo no se ramifica', () => {
    const cita = planearCita(CORTE, A_LAS('10:00'));

    expect(cita.rangosActivos).toEqual([{ inicio: A_LAS('10:00'), fin: A_LAS('10:30') }]);
    expect(cita.rangoOcupacion.fin).toEqual(A_LAS('10:35'));
    expect(cita.minutosIntercalables).toBe(0);
  });

  it('EL FACTOR ACELERA LO ACTIVO, no la química', () => {
    // Karla hace el mismo tinte en menos tiempo, pero el procesado tarda lo que
    // tarda: aplicárselo sería prometer que la más rápida procesa más rápido, y
    // a la clienta le queda el tono a medias.
    const karla = planearCita(TINTE, A_LAS('10:00'), 7_500);

    expect(karla.minutosActivos).toBe(49); // 30 + 19
    expect(karla.tramos[1]?.tipo).toBe('pasiva');
    const pasiva = karla.tramos[1];
    expect((pasiva!.fin.getTime() - pasiva!.inicio.getTime()) / 60_000).toBe(45);
  });

  it('EL FACTOR REDONDEA AL MINUTO: la rejilla no tiene medios minutos', () => {
    const cita = planearCita(CORTE, A_LAS('10:00'), 8_300);

    // 30 × 0.83 = 24.9 → 25.
    expect(cita.minutosActivos).toBe(25);
  });

  it('UN PROCESADO SIN TERMINADO no existe: alguien enjuaga', () => {
    // Dejaría a la clienta sentada y a nadie esperándola, y el hueco
    // intercalable se calcularía sobre un tramo que nunca termina.
    expect(
      codigoDe(() =>
        planearCita({ activa1Min: 40, pasivaMin: 45, activa2Min: 0, cierreMin: 0 }, A_LAS('10:00')),
      ),
    ).toBe('CONFIGURACION_INVALIDA');
  });

  it('un servicio sin aplicación no se agenda', () => {
    expect(codigoDe(() => planearCita({ ...CORTE, activa1Min: 0 }, A_LAS('10:00')))).toBe(
      'CONFIGURACION_INVALIDA',
    );
  });

  it('ningún tramo dura menos que cero', () => {
    expect(codigoDe(() => planearCita({ ...CORTE, cierreMin: -5 }, A_LAS('10:00')))).toBe(
      'CONFIGURACION_INVALIDA',
    );
  });

  it('un factor que no es entero positivo', () => {
    expect(codigoDe(() => planearCita(CORTE, A_LAS('10:00'), 0))).toBe('CONFIGURACION_INVALIDA');
    expect(codigoDe(() => planearCita(CORTE, A_LAS('10:00'), 1.5))).toBe('CONFIGURACION_INVALIDA');
  });
});

describe('seEnciman', () => {
  it('DOS CITAS QUE SE TOCAN NO CHOCAN', () => {
    // Una termina a las 11:00 y la otra empieza a las 11:00. Contarlo como
    // choque perdería un hueco de cada dos por un minuto que nadie usa.
    expect(
      seEnciman(
        { inicio: A_LAS('10:00'), fin: A_LAS('11:00') },
        { inicio: A_LAS('11:00'), fin: A_LAS('12:00') },
      ),
    ).toBe(false);
  });

  it('un minuto de traslape sí es traslape', () => {
    expect(
      seEnciman(
        { inicio: A_LAS('10:00'), fin: A_LAS('11:00') },
        { inicio: A_LAS('10:59'), fin: A_LAS('12:00') },
      ),
    ).toBe(true);
  });

  it('uno dentro del otro', () => {
    expect(
      seEnciman(
        { inicio: A_LAS('10:00'), fin: A_LAS('12:00') },
        { inicio: A_LAS('10:30'), fin: A_LAS('11:00') },
      ),
    ).toBe(true);
  });
});

describe('elProfesionalPuede', () => {
  it('UNA CITA CABE DENTRO DEL PROCESADO DE OTRA', () => {
    // Es la venta entera del modelo: mientras la clienta del tinte procesa, el
    // profesional corta a otra.
    const tinte = planearCita(TINTE, A_LAS('10:00'));
    const corte = planearCita(CORTE, A_LAS('10:45'));

    expect(elProfesionalPuede(corte.rangosActivos, tinte.rangosActivos)).toBe(true);
    // Y contra la ocupación completa NO cabría: comprobar ahí devolvería la
    // agenda al modelo de un solo número y tiraría la función.
    expect(elProfesionalPuede(corte.rangosActivos, [tinte.rangoOcupacion])).toBe(false);
  });

  it('LO QUE SE ENCIMA CON EL ACTIVO no cabe', () => {
    const tinte = planearCita(TINTE, A_LAS('10:00'));
    const corte = planearCita(CORTE, A_LAS('10:20'));

    expect(elProfesionalPuede(corte.rangosActivos, tinte.rangosActivos)).toBe(false);
  });

  it('SE MIRAN TODOS LOS RANGOS del nuevo, no sólo el primero', () => {
    // El terminado del segundo tinte choca con la aplicación de una cita de la
    // tarde. Mirar sólo el primer rango dejaría pasar el choque.
    const tarde = planearCita(CORTE, A_LAS('11:30'));
    const tinte = planearCita(TINTE, A_LAS('10:00'));

    expect(elProfesionalPuede(tinte.rangosActivos, tarde.rangosActivos)).toBe(false);
  });

  it('una agenda vacía acepta cualquier cosa', () => {
    const corte = planearCita(CORTE, A_LAS('10:00'));

    expect(elProfesionalPuede(corte.rangosActivos, [])).toBe(true);
  });
});
