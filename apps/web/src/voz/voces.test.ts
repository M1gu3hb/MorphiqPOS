import { describe, expect, it } from 'vitest';

import {
  MUESTRA_DE_VOZ,
  encontrarVoz,
  esEspanol,
  estadoDeLaEleccion,
  nombreCortoDeVoz,
  nombreDeRegion,
  normalizarIdioma,
  puedeSonar,
  vocesParaElegir,
  type VozDelNavegador,
} from './voces';

const PAULINA: VozDelNavegador = { name: 'Paulina', lang: 'es-MX', localService: true };
const SABINA: VozDelNavegador = {
  name: 'Microsoft Sabina - Spanish (Mexico)',
  lang: 'es-MX',
  localService: true,
};
const DALIA: VozDelNavegador = {
  name: 'Microsoft Dalia Online (Natural) - Spanish (Mexico)',
  lang: 'es-MX',
  localService: false,
};
const GOOGLE_US: VozDelNavegador = {
  name: 'Google español de Estados Unidos',
  lang: 'es-US',
  localService: false,
};
const LATAM: VozDelNavegador = { name: 'Soledad', lang: 'es-419', localService: true };
const MONICA: VozDelNavegador = { name: 'Mónica', lang: 'es-ES', localService: true };
const SAMANTHA: VozDelNavegador = { name: 'Samantha', lang: 'en-US', localService: true };
const ANDROID_MX: VozDelNavegador = {
  name: 'es-mx-x-eea-local',
  lang: 'es_MX',
  localService: true,
};

describe('normalizarIdioma', () => {
  it('unifica los formatos de Android y Linux con el estándar', () => {
    expect(normalizarIdioma('es_MX')).toBe('es-MX');
    expect(normalizarIdioma('ES-mx')).toBe('es-MX');
    expect(normalizarIdioma(' es-419 ')).toBe('es-419');
    expect(normalizarIdioma('es')).toBe('es');
  });

  it('no lanza con lo que no es un idioma', () => {
    expect(normalizarIdioma('')).toBe('');
    expect(normalizarIdioma(null)).toBe('');
    expect(normalizarIdioma(undefined)).toBe('');
  });
});

describe('esEspanol', () => {
  it('reconoce el español por su lengua, con o sin región', () => {
    for (const idioma of ['es', 'es-MX', 'es_MX', 'es-419', 'ES-us', 'es-ES']) {
      expect(esEspanol(idioma)).toBe(true);
    }
  });

  it('no se deja engañar por un prefijo de texto', () => {
    // «est» es estonio; «es» como prefijo de texto lo dejaría pasar.
    for (const idioma of ['est-EE', 'en-US', 'fr-FR', 'pt-BR', '', 'ess']) {
      expect(esEspanol(idioma)).toBe(false);
    }
  });
});

describe('vocesParaElegir', () => {
  it('deja sólo las voces en español', () => {
    const lista = vocesParaElegir([SAMANTHA, PAULINA, MONICA]);
    expect(lista.map((voz) => voz.nombre)).toEqual(['Paulina', 'Mónica']);
  });

  it('pone México primero, luego Estados Unidos y América, y España al final', () => {
    const lista = vocesParaElegir([MONICA, GOOGLE_US, LATAM, PAULINA]);
    expect(lista.map((voz) => voz.nombre)).toEqual([
      'Paulina',
      'Soledad',
      'Google español de Estados Unidos',
      'Mónica',
    ]);
    expect(lista.map((voz) => voz.grupo)).toEqual(['mexico', 'latino', 'latino', 'otro']);
  });

  it('dentro de un grupo, las que suenan sin internet van antes que las de la nube', () => {
    const lista = vocesParaElegir([DALIA, SABINA, PAULINA]);
    expect(lista.map((voz) => voz.local)).toEqual([true, true, false]);
    expect(lista[2]?.nombre).toBe(DALIA.name);
  });

  it('reconoce las voces de Android, que escriben el idioma con guion bajo', () => {
    const lista = vocesParaElegir([ANDROID_MX]);
    expect(lista).toHaveLength(1);
    expect(lista[0]?.idioma).toBe('es-MX');
    expect(lista[0]?.grupo).toBe('mexico');
  });

  it('sin internet no ofrece las voces de la nube: no sonarían', () => {
    const lista = vocesParaElegir([PAULINA, DALIA, GOOGLE_US], { enLinea: false });
    expect(lista.map((voz) => voz.nombre)).toEqual(['Paulina']);
  });

  it('con internet, o sin saberlo, sí las ofrece', () => {
    expect(vocesParaElegir([PAULINA, DALIA], { enLinea: true })).toHaveLength(2);
    expect(vocesParaElegir([PAULINA, DALIA])).toHaveLength(2);
  });

  it('une las repetidas y descarta las que no tienen nombre', () => {
    const lista = vocesParaElegir([PAULINA, { ...PAULINA }, { name: '  ', lang: 'es-MX' }]);
    expect(lista).toHaveLength(1);
  });

  it('muestra el nombre sin los sufijos en inglés que traen los sistemas', () => {
    const lista = vocesParaElegir([SABINA, DALIA]);
    expect(lista.map((voz) => voz.etiqueta)).toEqual(['Sabina', 'Dalia Online (Natural)']);
  });

  it('dice la región en español', () => {
    const lista = vocesParaElegir([PAULINA, GOOGLE_US, LATAM, MONICA]);
    expect(lista.map((voz) => voz.region)).toEqual([
      'México',
      'Latinoamérica',
      'Estados Unidos',
      'España',
    ]);
  });

  it('una lista vacía es una lista vacía, no un error', () => {
    expect(vocesParaElegir([])).toEqual([]);
  });

  it('no inventa voces para presentar velocidad o tono como si fueran otras voces', () => {
    // La lista sale 1 a 1 de lo que el sistema instaló: dos voces, dos filas. Ninguna fila
    // «rápida» o «grave» aparece por su cuenta.
    const lista = vocesParaElegir([PAULINA, MONICA]);
    expect(lista).toHaveLength(2);
    expect(JSON.stringify(lista)).not.toMatch(/r[aá]pid|grave|lent/i);
  });
});

describe('nombreDeRegion', () => {
  it('usa los nombres de aquí y cae a Intl para el resto', () => {
    expect(nombreDeRegion('MX')).toBe('México');
    expect(nombreDeRegion('419')).toBe('Latinoamérica');
    expect(nombreDeRegion('AR')).toBe('Argentina');
    expect(nombreDeRegion('')).toBe('Español');
  });
});

describe('nombreCortoDeVoz', () => {
  it('quita el fabricante y el idioma entre paréntesis', () => {
    expect(nombreCortoDeVoz('Microsoft Sabina - Spanish (Mexico)')).toBe('Sabina');
    expect(nombreCortoDeVoz('Paulina')).toBe('Paulina');
    expect(nombreCortoDeVoz('Google español')).toBe('Google español');
  });

  it('si limpiar la deja vacía, conserva el nombre original', () => {
    expect(nombreCortoDeVoz('- Spanish')).toBe('- Spanish');
  });
});

describe('encontrarVoz', () => {
  it('la encuentra por nombre o por voiceURI', () => {
    const voces = [PAULINA, { ...MONICA, voiceURI: 'uri-monica' }];
    expect(encontrarVoz(voces, 'Paulina')).toBe(PAULINA);
    expect(encontrarVoz(voces, 'uri-monica')).toBe(voces[1]);
  });

  it('devuelve null si este dispositivo no la tiene o no se eligió ninguna', () => {
    expect(encontrarVoz([PAULINA], 'Mónica')).toBeNull();
    expect(encontrarVoz([PAULINA], '')).toBeNull();
    expect(encontrarVoz([PAULINA], null)).toBeNull();
    expect(encontrarVoz([], 'Paulina')).toBeNull();
  });
});

describe('puedeSonar', () => {
  it('una local siempre; una de la nube sólo con internet o sin saberlo', () => {
    expect(puedeSonar(PAULINA, false)).toBe(true);
    expect(puedeSonar(DALIA, false)).toBe(false);
    expect(puedeSonar(DALIA, true)).toBe(true);
    expect(puedeSonar(DALIA, undefined)).toBe(true);
  });
});

describe('estadoDeLaEleccion', () => {
  const voces = [PAULINA, DALIA];

  it('sin elección es la automática', () => {
    expect(estadoDeLaEleccion(voces, '')).toBe('automatica');
    expect(estadoDeLaEleccion(voces, null)).toBe('automatica');
  });

  it('con una voz que este dispositivo tiene, es la elegida', () => {
    expect(estadoDeLaEleccion(voces, 'Paulina')).toBe('elegida');
  });

  it('con una voz que este dispositivo no tiene, avisa que no está disponible', () => {
    expect(estadoDeLaEleccion(voces, 'Mónica')).toBe('no-disponible');
  });

  it('con una voz de la nube y sin internet, avisa que falta la conexión', () => {
    expect(estadoDeLaEleccion(voces, DALIA.name, { enLinea: false })).toBe('sin-conexion');
    expect(estadoDeLaEleccion(voces, DALIA.name, { enLinea: true })).toBe('elegida');
  });
});

describe('MUESTRA_DE_VOZ', () => {
  it('es la frase que oye un mesero de verdad', () => {
    expect(MUESTRA_DE_VOZ).toBe('Mesa cuatro, su orden está lista.');
  });
});
