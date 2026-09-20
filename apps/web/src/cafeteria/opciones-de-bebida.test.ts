import { describe, expect, it } from 'vitest';

import {
  agrupar,
  etiquetaDelta,
  porOmisionDe,
  totalCentavos,
  type OpcionDeBebida,
} from './opciones-de-bebida';

/**
 * F-027 · Los modificadores de la bebida.
 *
 * Se prueban las cuatro funciones que deciden QUÉ SE COBRA y cuál viene
 * marcada. El resto de la pantalla pinta; éstas suman, y un error aquí no falla:
 * sale el ticket, el cliente paga, y el margen se va sin que nadie vea nada.
 */

function opcion(cambios: Partial<OpcionDeBebida> = {}): OpcionDeBebida {
  return {
    id: 'o1',
    grupo: 'Leche',
    nombre: 'Entera',
    delta_precio_centavos: 0,
    por_omision: false,
    agotado: false,
    varias: false,
    ...cambios,
  };
}

describe('F-027 · el agrupado', () => {
  it('junta las filas planas del puente y respeta la jerarquía del documento', () => {
    const grupos = agrupar([
      opcion({ id: 'c', grupo: 'Extras', nombre: 'Shot', varias: true }),
      opcion({ id: 'a', grupo: 'Leche', nombre: 'Entera' }),
      opcion({ id: 'b', grupo: 'Leche', nombre: 'Deslactosada' }),
    ]);

    // Leche antes que Extras aunque Extras llegara primero: el orden es 1 Leche
    // · 2 Tamaño · 3 Temperatura · 4 Extras, y lo fija el documento.
    expect(grupos.map((g) => g.nombre)).toEqual(['Leche', 'Extras']);
    expect(grupos[0]?.opciones).toHaveLength(2);
  });

  it('un grupo que el documento no nombra va al final', () => {
    const grupos = agrupar([
      opcion({ id: 'z', grupo: 'Jarabes' }),
      opcion({ id: 'a', grupo: 'Leche' }),
    ]);

    expect(grupos.map((g) => g.nombre)).toEqual(['Leche', 'Jarabes']);
  });

  it('el grupo hereda «varias» de cualquiera de sus filas', () => {
    // El puente entrega filas planas: la bandera viaja por fila y el grupo la
    // tiene que recomponer, o los extras dejarían de poder acumularse.
    const grupos = agrupar([
      opcion({ id: 'a', grupo: 'Extras', varias: false }),
      opcion({ id: 'b', grupo: 'Extras', varias: true }),
    ]);

    expect(grupos[0]?.varias).toBe(true);
  });
});

describe('F-027 · la opción por omisión', () => {
  it('la marcada gana', () => {
    const grupo = agrupar([
      opcion({ id: 'a' }),
      opcion({ id: 'b', nombre: 'Deslactosada', por_omision: true }),
    ])[0]!;

    expect(porOmisionDe(grupo)).toBe('b');
  });

  it('UNA MARCADA QUE SE AGOTÓ NO SE ELIGE', () => {
    // Si siguiera marcada, el barista prepararía con leche entera la bebida de
    // quien pidió deslactosada. Aquí eso no es un descuadre: es un cliente que
    // no vuelve.
    const grupo = agrupar([
      opcion({ id: 'a', nombre: 'Entera' }),
      opcion({ id: 'b', nombre: 'Deslactosada', por_omision: true, agotado: true }),
    ])[0]!;

    expect(porOmisionDe(grupo)).toBe('a');
  });

  it('sin nadie marcado, elige la primera que quede', () => {
    const grupo = agrupar([opcion({ id: 'a', agotado: true }), opcion({ id: 'b' })])[0]!;

    expect(porOmisionDe(grupo)).toBe('b');
  });

  it('un grupo de VARIAS no elige nada por su cuenta', () => {
    // Marcar un extra por omisión sería cobrar un shot que nadie pidió.
    const grupo = agrupar([opcion({ id: 'a', grupo: 'Extras', varias: true })])[0]!;

    expect(porOmisionDe(grupo)).toBeNull();
  });

  it('un grupo entero agotado no devuelve nada', () => {
    const grupo = agrupar([opcion({ id: 'a', agotado: true })])[0]!;

    expect(porOmisionDe(grupo)).toBeNull();
  });
});

describe('F-027 · lo que se cobra', () => {
  it('el total es la base MÁS cada delta activo', () => {
    const total = totalCentavos(4500, [
      opcion({ delta_precio_centavos: 800 }),
      opcion({ id: 'o2', delta_precio_centavos: 1200 }),
    ]);

    expect(total).toBe(6500);
  });

  it('una opción sin delta no mueve el precio', () => {
    expect(totalCentavos(4500, [opcion({ delta_precio_centavos: null })])).toBe(4500);
  });

  it('un delta NEGATIVO baja el total', () => {
    // El café de la casa en vaso propio existe, y sumarlo en positivo cobraría
    // de más justo a quien trae el vaso.
    expect(totalCentavos(4500, [opcion({ delta_precio_centavos: -300 })])).toBe(4200);
  });

  it('sin opciones, el total es la base', () => {
    expect(totalCentavos(4500, [])).toBe(4500);
  });
});

describe('F-027 · la etiqueta del delta', () => {
  it('sin centavos, se dice en voz alta: «+$22»', () => {
    expect(etiquetaDelta(2200)).toBe('+$22');
  });

  it('con centavos, se escriben los dos', () => {
    expect(etiquetaDelta(2250)).toBe('+$22.50');
  });

  it('el descuento lleva el signo de menos tipográfico', () => {
    expect(etiquetaDelta(-300)).toBe('−$3');
  });

  it('un delta de cero NO se pinta', () => {
    // «+$0» al lado de una opción es ruido que el barista aprende a ignorar, y
    // entonces deja de mirar los que sí cuestan.
    expect(etiquetaDelta(0)).toBeNull();
  });
});
