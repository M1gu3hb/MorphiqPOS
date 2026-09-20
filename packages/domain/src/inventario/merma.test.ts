import { describe, expect, it } from 'vitest';

import { motivosDelGiro, planearMerma, type MotivoDeMerma } from './merma.ts';

/**
 * F-109 · La merma como estrategia.
 *
 * Lo que se prueba es la razón por la que esta función NO está en el tronco: la
 * merma de una cocina, la de un lote caducado y el retazo de un corte no se
 * registran igual, y la del retazo es la única donde el sobrante **puede no ser
 * una pérdida**.
 */

function motivo(cambios: Partial<MotivoDeMerma> = {}): MotivoDeMerma {
  return {
    clave: 'caducado',
    etiqueta: 'Caducado',
    giro: null,
    imputable: false,
    activo: true,
    ...cambios,
  };
}

describe('F-109 · qué motivos puede usar cada giro', () => {
  const todos: MotivoDeMerma[] = [
    motivo({ clave: 'robo', etiqueta: 'Faltante sin explicación', imputable: true }),
    motivo({ clave: 'caducado', etiqueta: 'Caducado' }),
    motivo({ clave: 'calibracion', etiqueta: 'Calibración de molino', giro: 'cafeteria' }),
    motivo({ clave: 'retazo', etiqueta: 'Retazo inservible', giro: 'ferreteria' }),
    motivo({ clave: 'viejo', etiqueta: 'Motivo retirado', activo: false }),
  ];

  it('mezcla los del tronco con los del giro, y deja fuera los de otros giros', () => {
    const claves = motivosDelGiro(todos, 'cafeteria').map((m) => m.clave);

    expect(claves).toContain('calibracion');
    expect(claves).toContain('caducado');
    expect(claves).not.toContain('retazo');
  });

  it('no ofrece los motivos apagados', () => {
    expect(motivosDelGiro(todos, 'cafeteria').map((m) => m.clave)).not.toContain('viejo');
  });

  it('pone los IMPUTABLES al final, para que no se elijan sin pensar', () => {
    const lista = motivosDelGiro(todos, 'ferreteria');

    // «Faltante sin explicación» dispara una investigación. Una lista que
    // empieza por él invita a elegirlo porque sí.
    expect(lista[lista.length - 1]?.clave).toBe('robo');
  });
});

describe('F-109 · el movimiento que hay que escribir', () => {
  it('una merma de insumo sale del almacén EN NEGATIVO', () => {
    const plan = planearMerma({
      estrategia: 'insumo',
      cantidad: '2.5000',
      factorABase: '1',
      motivo: motivo(),
    });

    expect(plan.deltaBase).toBe('-2.5000');
    expect(plan.seRecupera).toBe(false);
    expect(plan.imputable).toBe(false);
  });

  it('convierte a la unidad base antes de descontar', () => {
    // Tres cajas de 24 piezas: se pierden 72 piezas, no 3.
    const plan = planearMerma({
      estrategia: 'presentacion',
      cantidad: '3',
      factorABase: '24',
      motivo: motivo(),
    });

    expect(plan.deltaBase).toBe('-72.0000');
  });

  it('rechaza una conversión que no cabe en cuatro decimales', () => {
    expect(() =>
      planearMerma({
        estrategia: 'presentacion',
        cantidad: '1.0001',
        factorABase: '0.3333',
        motivo: motivo(),
      }),
    ).toThrow();
  });

  it('arrastra el motivo y si es imputable: es lo que separa merma de robo', () => {
    const plan = planearMerma({
      estrategia: 'insumo',
      cantidad: '1',
      factorABase: '1',
      motivo: motivo({ clave: 'robo', imputable: true }),
    });

    expect(plan.motivo).toBe('robo');
    expect(plan.imputable).toBe(true);
  });

  it('rechaza una cantidad de cero: no es una merma, es un tecleo', () => {
    expect(() =>
      planearMerma({ estrategia: 'insumo', cantidad: '0', factorABase: '1', motivo: motivo() }),
    ).toThrow();
  });

  it('rechaza un motivo apagado', () => {
    expect(() =>
      planearMerma({
        estrategia: 'insumo',
        cantidad: '1',
        factorABase: '1',
        motivo: motivo({ activo: false }),
      }),
    ).toThrow();
  });

  it('rechaza un factor de cero: sin factor no se sabe cuánto sale', () => {
    expect(() =>
      planearMerma({ estrategia: 'insumo', cantidad: '1', factorABase: '0', motivo: motivo() }),
    ).toThrow();
  });
});

describe('F-109 · el retazo, que es la única estrategia con recuperación', () => {
  it('un retazo que ALCANZA el mínimo útil no es merma: se recupera', () => {
    // Un metro de cable que sobra de un corte se guarda y se vende.
    const plan = planearMerma({
      estrategia: 'retazo',
      cantidad: '1',
      factorABase: '1',
      minimoUtilBase: '0.5000',
      motivo: motivo({ clave: 'retazo', etiqueta: 'Retazo' }),
    });

    expect(plan.seRecupera).toBe(true);
    // El movimiento de stock es CERO: no se perdió nada.
    expect(plan.deltaBase).toBe('0.0000');
    expect(plan.recuperadoBase).toBe('1.0000');
  });

  it('un retazo por DEBAJO del mínimo sí es merma', () => {
    // Ocho centímetros de cable no se venden.
    const plan = planearMerma({
      estrategia: 'retazo',
      cantidad: '0.0800',
      factorABase: '1',
      minimoUtilBase: '0.5000',
      motivo: motivo({ clave: 'retazo' }),
    });

    expect(plan.seRecupera).toBe(false);
    expect(plan.deltaBase).toBe('-0.0800');
  });

  it('exactamente el mínimo se recupera: el mínimo es «a partir de»', () => {
    const plan = planearMerma({
      estrategia: 'retazo',
      cantidad: '0.5000',
      factorABase: '1',
      minimoUtilBase: '0.5000',
      motivo: motivo({ clave: 'retazo' }),
    });

    expect(plan.seRecupera).toBe(true);
  });

  it('un retazo SIN mínimo útil se rechaza: no se puede clasificar', () => {
    // Tratar todos los sobrantes igual —como merma o como inventario— es el
    // error que hace que el inventario de una ferretería nunca cuadre.
    expect(() =>
      planearMerma({
        estrategia: 'retazo',
        cantidad: '1',
        factorABase: '1',
        motivo: motivo({ clave: 'retazo' }),
      }),
    ).toThrow();
  });

  it('un retazo recuperado NUNCA se marca imputable', () => {
    const plan = planearMerma({
      estrategia: 'retazo',
      cantidad: '2',
      factorABase: '1',
      minimoUtilBase: '0.5000',
      motivo: motivo({ clave: 'robo', imputable: true }),
    });

    // No se perdió nada: marcar a alguien por un sobrante que sigue en el
    // estante es acusar por un dato que ni siquiera es una pérdida.
    expect(plan.imputable).toBe(false);
  });
});
