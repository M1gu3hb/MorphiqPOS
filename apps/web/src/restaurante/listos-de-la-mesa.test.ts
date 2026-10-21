import { describe, expect, it } from 'vitest';

import {
  descripcionDeLosListos,
  nombresQueYaSalieron,
  platillosListos,
  type ComandaLeida,
} from './listos-de-la-mesa.ts';

/**
 * Día completo del restaurante (2.4) · LO QUE COCINA YA DEJÓ EN LA VENTANA.
 *
 * El bloque «Listos para recoger» de la mesa activa no se pintaba nunca: lo recibía por props
 * que ninguna página pasaba. Aquí se prueba la regla —qué cuenta como listo— con comandas
 * armadas como el puente las sirve: cocina y barra son dos, la cantidad puede llegar como
 * texto y una comanda ya entregada no es nada que recoger.
 */

const cocina: ComandaLeida = {
  id: 'c1',
  estado: 'listo',
  items: [
    { producto_nombre: 'Arrachera al carbón', cantidad: 2 },
    { producto_nombre: 'Sopa de tortilla', cantidad: '1.0000' },
  ],
};
const barra: ComandaLeida = {
  id: 'c2',
  estado: 'listo',
  items: [{ producto_nombre: 'Cerveza clara 355 ml', cantidad: '2.0000' }],
};

describe('lo que el mesero tiene que recoger', () => {
  it('cuenta los platillos de las comandas LISTAS, cocina y barra juntas', () => {
    expect(platillosListos([cocina, barra])).toEqual([
      { nombre: 'Arrachera al carbón', cantidad: 2 },
      { nombre: 'Sopa de tortilla', cantidad: 1 },
      { nombre: 'Cerveza clara 355 ml', cantidad: 2 },
    ]);
  });

  it('lo que cocina todavía prepara, y lo que ya se entregó, NO está en la ventana', () => {
    const enPreparacion: ComandaLeida = { ...cocina, id: 'c3', estado: 'en_preparacion' };
    const nueva: ComandaLeida = { ...cocina, id: 'c4', estado: 'nuevo' };
    const entregada: ComandaLeida = { ...barra, id: 'c5', estado: 'entregado' };
    const cancelada: ComandaLeida = { ...barra, id: 'c6', estado: 'cancelado' };
    expect(platillosListos([enPreparacion, nueva, entregada, cancelada])).toEqual([]);
  });

  it('UN PLATILLO ANULADO EN LA MESA no está en la ventana, ni es algo que ya se preparó', () => {
    const conLaSopaAnulada: ComandaLeida = {
      id: 'c3',
      estado: 'listo',
      items: [
        { producto_nombre: 'Arrachera al carbón', cantidad: 2, estado: 'listo' },
        { producto_nombre: 'Sopa de tortilla', cantidad: 1, estado: 'cancelado' },
      ],
    };

    expect(platillosListos([conLaSopaAnulada])).toEqual([
      { nombre: 'Arrachera al carbón', cantidad: 2 },
    ]);
    expect([...nombresQueYaSalieron([conLaSopaAnulada])]).toEqual(['Arrachera al carbón']);
  });

  it('el mismo platillo en dos comandas listas se suma', () => {
    const otra: ComandaLeida = { ...cocina, id: 'c7' };
    expect(platillosListos([cocina, otra]).find((p) => p.nombre === 'Arrachera al carbón')).toEqual(
      {
        nombre: 'Arrachera al carbón',
        cantidad: 4,
      },
    );
  });

  it('una línea sin nombre o sin unidades positivas no se cuenta', () => {
    const rara: ComandaLeida = {
      id: 'c8',
      estado: 'listo',
      items: [
        { producto_nombre: null, cantidad: 1 },
        { producto_nombre: '  ', cantidad: 1 },
        { producto_nombre: 'Flan de la casa', cantidad: 0 },
        { producto_nombre: 'Churros con chocolate', cantidad: 'mucho' },
        { producto_nombre: 'Esquites con queso', cantidad: -1 },
      ],
    };
    expect(platillosListos([rara])).toEqual([]);
  });
});

describe('lo que ya salió de cocina', () => {
  it('es lo listo Y lo entregado: el insumo se gastó cuando el plato se hizo', () => {
    const entregada: ComandaLeida = { ...barra, id: 'c5', estado: 'entregado' };
    const nueva: ComandaLeida = {
      id: 'c9',
      estado: 'nuevo',
      items: [{ producto_nombre: 'Flan de la casa', cantidad: 1 }],
    };
    const salieron = nombresQueYaSalieron([cocina, entregada, nueva]);
    expect(salieron.has('Arrachera al carbón')).toBe(true);
    expect(salieron.has('Cerveza clara 355 ml')).toBe(true);
    expect(salieron.has('Flan de la casa')).toBe(false);
  });
});

describe('cómo se dice lo que está listo', () => {
  it('con cuántos, no sólo cuáles', () => {
    expect(descripcionDeLosListos(platillosListos([cocina, barra]))).toBe(
      '2 × Arrachera al carbón · 1 × Sopa de tortilla · 2 × Cerveza clara 355 ml',
    );
  });

  it('sin nada listo no dice nada', () => {
    expect(descripcionDeLosListos([])).toBe('');
  });
});
