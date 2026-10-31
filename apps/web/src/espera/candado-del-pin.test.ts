import { describe, expect, it } from 'vitest';

import { CLAVE_DEL_CANDADO, abrir, cerrar, estaCerrado } from './candado-del-pin';

/** DP-11.2 · EL CANDADO DEL PIN: sobrevive a una recarga y es de una sola persona. */

function almacen() {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => {
      datos.set(clave, valor);
    },
    removeItem: (clave: string) => {
      datos.delete(clave);
    },
  };
}

const roto = {
  getItem: () => {
    throw new Error('bloqueado');
  },
  setItem: () => {
    throw new Error('bloqueado');
  },
  removeItem: () => {
    throw new Error('bloqueado');
  },
};

describe('el candado del PIN', () => {
  it('se cierra para quien tiene la sesión y se abre con su PIN', () => {
    const a = almacen();
    expect(estaCerrado(a, 'ana')).toBe(false);
    cerrar(a, 'ana');
    expect(a.datos.get(CLAVE_DEL_CANDADO)).toBe('ana');
    expect(estaCerrado(a, 'ana')).toBe(true);
    abrir(a);
    expect(estaCerrado(a, 'ana')).toBe(false);
  });

  it('el de otra persona no cierra la pantalla de quien entró después', () => {
    const a = almacen();
    cerrar(a, 'ana');
    expect(estaCerrado(a, 'beto')).toBe(false);
  });

  it('sin almacén o con el almacén bloqueado, no lanza ni inventa un candado', () => {
    expect(estaCerrado(null, 'ana')).toBe(false);
    expect(estaCerrado(roto, 'ana')).toBe(false);
    expect(() => {
      cerrar(roto, 'ana');
      abrir(roto);
      cerrar(null, 'ana');
      abrir(null);
    }).not.toThrow();
  });
});
