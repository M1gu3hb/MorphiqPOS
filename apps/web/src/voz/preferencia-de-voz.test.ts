import { describe, expect, it } from 'vitest';

import {
  CLAVE_VELOCIDAD_DE_VOZ,
  CLAVE_VOZ_ELEGIDA,
  VELOCIDAD_MAXIMA,
  VELOCIDAD_MINIMA,
  VELOCIDAD_POR_OMISION,
  acotarVelocidad,
  guardarVelocidad,
  guardarVozElegida,
  leerVelocidad,
  leerVozElegida,
  type AlmacenDeVoz,
} from './preferencia-de-voz';

function almacenEnMemoria(inicial: Record<string, string> = {}): AlmacenDeVoz & {
  readonly datos: Map<string, string>;
} {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => {
      datos.set(clave, valor);
    },
    removeItem: (clave) => {
      datos.delete(clave);
    },
  };
}

/** Un `localStorage` de ventana privada o con los datos del sitio bloqueados: todo lanza. */
const ALMACEN_ROTO: AlmacenDeVoz = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('la voz elegida en este dispositivo', () => {
  it('conserva la clave que `voiceAlert.js` ya usaba, para no perder las voces ya guardadas', () => {
    expect(CLAVE_VOZ_ELEGIDA).toBe('mh_voice_manual');
  });

  it('sin nada guardado es la automática (texto vacío)', () => {
    expect(leerVozElegida(almacenEnMemoria())).toBe('');
  });

  it('guarda y lee el nombre de la voz', () => {
    const almacen = almacenEnMemoria();
    expect(guardarVozElegida('Paulina', almacen)).toBe(true);
    expect(almacen.datos.get(CLAVE_VOZ_ELEGIDA)).toBe('Paulina');
    expect(leerVozElegida(almacen)).toBe('Paulina');
  });

  it('un texto vacío borra la elección y vuelve a la automática', () => {
    const almacen = almacenEnMemoria({ [CLAVE_VOZ_ELEGIDA]: 'Paulina' });
    expect(guardarVozElegida('', almacen)).toBe(true);
    expect(almacen.datos.has(CLAVE_VOZ_ELEGIDA)).toBe(false);
    expect(leerVozElegida(almacen)).toBe('');
  });

  it('lee la voz que ya estaba guardada de antes', () => {
    expect(leerVozElegida(almacenEnMemoria({ mh_voice_manual: 'Mónica' }))).toBe('Mónica');
  });

  it('con un almacén que lanza, nunca lanza: lee vacío y dice que no pudo guardar', () => {
    expect(leerVozElegida(ALMACEN_ROTO)).toBe('');
    expect(guardarVozElegida('Paulina', ALMACEN_ROTO)).toBe(false);
  });

  it('sin almacén (no hay localStorage) pasa lo mismo', () => {
    expect(leerVozElegida(null)).toBe('');
    expect(guardarVozElegida('Paulina', null)).toBe(false);
  });
});

describe('acotarVelocidad', () => {
  it('deja pasar lo que está en rango', () => {
    expect(acotarVelocidad(1)).toBe(1);
    expect(acotarVelocidad(0.85)).toBe(0.85);
    expect(acotarVelocidad('1.2')).toBe(1.2);
  });

  it('corta lo que se sale del rango que se entiende', () => {
    expect(acotarVelocidad(0.1)).toBe(VELOCIDAD_MINIMA);
    expect(acotarVelocidad(5)).toBe(VELOCIDAD_MAXIMA);
  });

  it('lo que no es un número es la velocidad normal', () => {
    for (const roto of [Number.NaN, 'abc', undefined, null, {}, Number.POSITIVE_INFINITY]) {
      expect(acotarVelocidad(roto)).toBe(VELOCIDAD_POR_OMISION);
    }
  });

  it('redondea a dos decimales: un control deslizante entrega 1.0500000000000003', () => {
    expect(acotarVelocidad(1.0500000000000003)).toBe(1.05);
  });
});

describe('la velocidad de este dispositivo', () => {
  it('sin nada guardado es la normal, la que había antes de poder cambiarla', () => {
    expect(leerVelocidad(almacenEnMemoria())).toBe(1);
  });

  it('guarda la velocidad ya acotada y devuelve la que quedó', () => {
    const almacen = almacenEnMemoria();
    expect(guardarVelocidad(1.2, almacen)).toBe(1.2);
    expect(leerVelocidad(almacen)).toBe(1.2);
    expect(guardarVelocidad(9, almacen)).toBe(VELOCIDAD_MAXIMA);
    expect(almacen.datos.get(CLAVE_VELOCIDAD_DE_VOZ)).toBe(String(VELOCIDAD_MAXIMA));
  });

  it('volver a la normal borra la clave en vez de guardar un 1', () => {
    const almacen = almacenEnMemoria({ [CLAVE_VELOCIDAD_DE_VOZ]: '1.2' });
    expect(guardarVelocidad(1, almacen)).toBe(1);
    expect(almacen.datos.has(CLAVE_VELOCIDAD_DE_VOZ)).toBe(false);
  });

  it('un valor guardado dañado es la velocidad normal', () => {
    expect(leerVelocidad(almacenEnMemoria({ [CLAVE_VELOCIDAD_DE_VOZ]: 'rapidisimo' }))).toBe(1);
  });

  it('con un almacén que lanza, la velocidad vale para esta sesión y no truena', () => {
    expect(leerVelocidad(ALMACEN_ROTO)).toBe(1);
    expect(guardarVelocidad(1.1, ALMACEN_ROTO)).toBe(1.1);
    expect(guardarVelocidad(1.1, null)).toBe(1.1);
  });
});
