import { describe, expect, it } from 'vitest';

import {
  piezasOcupadasEnPico,
  rangoDelRecurso,
  recursosDisponibles,
  type OcupacionDeRecurso,
} from './recursos.ts';

/**
 * F-403 · La agenda por recurso: lavabo, secadora, cabina.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que un salón con cuatro estilistas y UN lavabo no pueda agendar cuatro
 * lavados a la misma hora. La agenda de personas dice que sí y el salón dice
 * que no, y eso no se descubre en la pantalla: se descubre con cuatro clientas
 * sentadas esperando.
 *
 * Y que se mire el PICO y no el promedio: dos lavados de media hora dentro de
 * una hora dan un promedio de uno y un pico de dos, y lo que decide si cabe es
 * el pico.
 */

const h = (hora: number, minuto = 0): Date => new Date(Date.UTC(2026, 8, 16, hora, minuto, 0, 0));

const rango = (desde: number, hasta: number) => ({ inicio: h(desde), fin: h(hasta) });
/** Con minutos, para los casos donde media hora importa. */
const rangoM = (d: number, dm: number, ha: number, hm: number) => ({
  inicio: h(d, dm),
  fin: h(ha, hm),
});

function ocupacion(cambios: Partial<OcupacionDeRecurso> = {}): OcupacionDeRecurso {
  return { tipo: 'lavabo', rango: rango(10, 11), piezas: 1, ...cambios };
}

const UN_LAVABO = [{ tipo: 'lavabo', capacidad: 1 }];
const DOS_LAVABOS = [{ tipo: 'lavabo', capacidad: 2 }];
const PIDE_LAVABO = [{ tipo: 'lavabo', piezas: 1 }];

describe('F-403 · el pico de ocupación', () => {
  it('sin nada ocupado, el pico es cero', () => {
    expect(piezasOcupadasEnPico('lavabo', rango(10, 11), [])).toBe(0);
  });

  it('cuenta lo SIMULTÁNEO, no lo que pasa por la ventana', () => {
    // Dos lavados de media hora dentro de la misma hora, uno detrás de otro: el
    // pico es uno, no dos. Contarlos sumados diría que el lavabo está saturado
    // cuando está libre media hora.
    const pico = piezasOcupadasEnPico('lavabo', rango(10, 11), [
      ocupacion({ rango: rangoM(10, 0, 10, 30) }),
      ocupacion({ rango: rangoM(10, 30, 11, 0) }),
    ]);

    expect(pico).toBe(1);
  });

  it('DOS A LA VEZ dan pico dos', () => {
    const pico = piezasOcupadasEnPico('lavabo', rango(10, 11), [
      ocupacion({ rango: rango(10, 11) }),
      ocupacion({ rango: rango(10, 11) }),
    ]);

    expect(pico).toBe(2);
  });

  it('una ocupación de OTRO tipo no cuenta', () => {
    const pico = piezasOcupadasEnPico('lavabo', rango(10, 11), [ocupacion({ tipo: 'secadora' })]);

    expect(pico).toBe(0);
  });

  it('lo que termina justo cuando empieza la cita NO estorba', () => {
    // `[inicio, fin)`: el lavabo que se suelta a las 10:00 está libre a las
    // 10:00. Contarlo haría perder un hueco por cada cita del día.
    const pico = piezasOcupadasEnPico('lavabo', rango(10, 11), [
      ocupacion({ rango: rango(9, 10) }),
    ]);

    expect(pico).toBe(0);
  });

  it('una ocupación que pide DOS piezas cuenta como dos', () => {
    // El color a dos cabezas existe.
    const pico = piezasOcupadasEnPico('lavabo', rango(10, 11), [ocupacion({ piezas: 2 })]);

    expect(pico).toBe(2);
  });
});

describe('F-403 · si cabe o no', () => {
  it('con el lavabo libre, cabe', () => {
    const v = recursosDisponibles(rango(10, 11), PIDE_LAVABO, UN_LAVABO, []);

    expect(v.cabe).toBe(true);
    expect(v.saturados).toEqual([]);
  });

  it('CUATRO ESTILISTAS Y UN LAVABO: la segunda cita no cabe', () => {
    const v = recursosDisponibles(rango(10, 11), PIDE_LAVABO, UN_LAVABO, [ocupacion()]);

    expect(v.cabe).toBe(false);
    // Y se dice CUÁL satura: «no hay lavabo a esa hora» en vez de «no se
    // puede», que es lo que hace que la recepcionista llame al dueño.
    expect(v.saturados).toEqual(['lavabo']);
  });

  it('con dos lavabos, la segunda sí cabe y la tercera no', () => {
    const cabeLaSegunda = recursosDisponibles(rango(10, 11), PIDE_LAVABO, DOS_LAVABOS, [
      ocupacion(),
    ]);
    const laTercera = recursosDisponibles(rango(10, 11), PIDE_LAVABO, DOS_LAVABOS, [
      ocupacion(),
      ocupacion(),
    ]);

    expect(cabeLaSegunda.cabe).toBe(true);
    expect(laTercera.cabe).toBe(false);
  });

  it('un recurso que el salón NO TIENE satura siempre', () => {
    // Un servicio que pide cabina en un salón sin cabina es una configuración a
    // medias. Agendarlo en silencio se descubre con la clienta sentada.
    const v = recursosDisponibles(rango(10, 11), [{ tipo: 'cabina', piezas: 1 }], UN_LAVABO, []);

    expect(v.cabe).toBe(false);
    expect(v.saturados).toEqual(['cabina']);
  });

  it('un servicio sin recursos siempre cabe', () => {
    // El corte de caballero no necesita nada, y no puede quedar bloqueado por
    // el lavabo de otra.
    const v = recursosDisponibles(rango(10, 11), [], UN_LAVABO, [ocupacion()]);

    expect(v.cabe).toBe(true);
  });

  it('dice TODOS los tipos que saturan, no sólo el primero', () => {
    const v = recursosDisponibles(
      rango(10, 11),
      [
        { tipo: 'lavabo', piezas: 1 },
        { tipo: 'secadora', piezas: 1 },
      ],
      [
        { tipo: 'lavabo', capacidad: 1 },
        { tipo: 'secadora', capacidad: 1 },
      ],
      [ocupacion(), ocupacion({ tipo: 'secadora' })],
    );

    expect(v.saturados).toEqual(['lavabo', 'secadora']);
  });

  it('un rango invertido se rechaza en vez de dar «cabe»', () => {
    expect(() => recursosDisponibles(rango(11, 10), PIDE_LAVABO, UN_LAVABO, [])).toThrow();
  });

  it('pedir cero piezas de un recurso es un error de catálogo', () => {
    expect(() =>
      recursosDisponibles(rango(10, 11), [{ tipo: 'lavabo', piezas: 0 }], UN_LAVABO, []),
    ).toThrow();
  });
});

describe('F-403 · el rango que ocupa el recurso', () => {
  it('es el COMPLETO, procesado incluido', () => {
    // La asimetría que define el modelo: durante el procesado la profesional
    // queda libre y el lavabo NO. Restarlo aquí promete lavabos que no hay.
    const cita = rango(10, 12);

    expect(rangoDelRecurso(cita)).toEqual(cita);
  });
});
