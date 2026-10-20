import { describe, expect, it } from 'vitest';

import { buscarEnLaZona } from './buscar-en-la-zona.ts';

const ZONA = [
  { id: 'leche', codigo: '7501055300075', nombre: 'Leche entera 1 L' },
  { id: 'crema', codigo: null, nombre: 'Crema ácida 450 ml' },
];

describe('el Enter del buscador del conteo', () => {
  it('encuentra por el código que manda el escáner', () => {
    expect(buscarEnLaZona(' 7501055300075 ', ZONA)).toEqual({
      tipo: 'encontrado',
      producto: ZONA[0],
    });
  });

  it('encuentra por un pedazo del nombre, sin importar mayúsculas', () => {
    expect(buscarEnLaZona('CREMA', ZONA)).toEqual({ tipo: 'encontrado', producto: ZONA[1] });
  });

  it('dice que no está en la zona, con lo que se tecleó', () => {
    expect(buscarEnLaZona(' 750100000 ', ZONA)).toEqual({
      tipo: 'sin_coincidencia',
      texto: '750100000',
    });
  });

  it('un Enter con el campo vacío también contesta', () => {
    expect(buscarEnLaZona('   ', ZONA)).toEqual({ tipo: 'vacia' });
  });
});
