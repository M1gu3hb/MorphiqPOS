import { describe, expect, it } from 'vitest';

import {
  CLAVE_DE_LA_ESPERA,
  ESPERA_DE_OMISION,
  guardarPreferenciaDeEspera,
  leerPreferenciaDeEspera,
} from './preferencia-del-aparato';

/**
 * DP-11.2 · EL MODO ESPERA ES DEL APARATO: la tableta de la caja puede dormirse a los 3 minutos
 * y la pantalla de la cocina a los 2, o no dormirse. Se guarda en el aparato, con respaldo si el
 * navegador lo niega (ventana privada, datos bloqueados): ahí se queda con lo de omisión.
 */

function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => {
      datos.set(clave, valor);
    },
    datos,
  };
}

const roto = {
  getItem: (): string | null => {
    throw new Error('SecurityError');
  },
  setItem: (): void => {
    throw new Error('QuotaExceededError');
  },
};

describe('la preferencia del modo espera en este aparato', () => {
  it('sin nada guardado: encendido y con los minutos de cada pantalla', () => {
    expect(leerPreferenciaDeEspera(almacen())).toEqual(ESPERA_DE_OMISION);
    expect(ESPERA_DE_OMISION).toEqual({ activa: true, minutos: null });
    expect(leerPreferenciaDeEspera(null)).toEqual(ESPERA_DE_OMISION);
  });

  it('se guarda y se vuelve a leer', () => {
    const a = almacen();
    expect(guardarPreferenciaDeEspera(a, { activa: false, minutos: 5 })).toBe(true);
    expect(leerPreferenciaDeEspera(a)).toEqual({ activa: false, minutos: 5 });
    expect(a.datos.has(CLAVE_DE_LA_ESPERA)).toBe(true);
  });

  it('lo que no tiene forma se lee como lo de omisión', () => {
    expect(leerPreferenciaDeEspera(almacen({ [CLAVE_DE_LA_ESPERA]: 'no es json' }))).toEqual(
      ESPERA_DE_OMISION,
    );
    expect(
      leerPreferenciaDeEspera(
        almacen({ [CLAVE_DE_LA_ESPERA]: JSON.stringify({ activa: 'sí', minutos: 2 }) }),
      ),
    ).toEqual(ESPERA_DE_OMISION);
    expect(
      leerPreferenciaDeEspera(
        almacen({ [CLAVE_DE_LA_ESPERA]: JSON.stringify({ activa: true, minutos: 500 }) }),
      ),
    ).toEqual({ activa: true, minutos: null });
    // Minutos con decimales o de más de una hora: los de cada pantalla.
    for (const minutos of [2.5, 61, 0])
      expect(
        leerPreferenciaDeEspera(
          almacen({ [CLAVE_DE_LA_ESPERA]: JSON.stringify({ activa: true, minutos }) }),
        ).minutos,
      ).toBeNull();
    expect(
      leerPreferenciaDeEspera(
        almacen({ [CLAVE_DE_LA_ESPERA]: JSON.stringify({ activa: true, minutos: 60 }) }),
      ).minutos,
    ).toBe(60);
  });

  it('con el almacén bloqueado no lanza: lee lo de omisión y dice que no guardó', () => {
    expect(leerPreferenciaDeEspera(roto)).toEqual(ESPERA_DE_OMISION);
    expect(guardarPreferenciaDeEspera(roto, { activa: false, minutos: null })).toBe(false);
    expect(guardarPreferenciaDeEspera(null, { activa: false, minutos: null })).toBe(false);
  });
});
