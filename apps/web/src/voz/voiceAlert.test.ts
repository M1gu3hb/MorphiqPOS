import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VozDelNavegador } from './voces';

/**
 * La selección de voz de los avisos, probada contra un `speechSynthesis` simulado.
 *
 * `heredado/lib/voiceAlert.js` es el módulo que habla (mesero, cocina, solicitudes del
 * portal). Aquí se comprueba lo que la pantalla «Voz de los avisos» le promete a quien elige:
 *   · sin elegir nada, suena la voz de siempre (la mejor en español, México primero);
 *   · con una voz elegida que ESTE dispositivo tiene, suena esa;
 *   · con una elegida que este dispositivo NO tiene, cae a la de siempre — sin lanzar;
 *   · la muestra se escucha aunque el mesero tenga las alertas en «silencio».
 *
 * Cada prueba carga el módulo de cero (`vi.resetModules`): su cola de voz es estado de
 * módulo, y una frase pendiente de una prueba bloquearía a la siguiente.
 */

interface Utterance {
  text: string;
  lang: string;
  volume: number;
  rate: number;
  pitch: number;
  voice: VozDelNavegador | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((evento: { error: string }) => void) | null;
}

class UtteranceSimulada implements Utterance {
  lang = '';
  volume = 1;
  rate = 1;
  pitch = 1;
  voice: VozDelNavegador | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((evento: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}

const PAULINA: VozDelNavegador = { name: 'Paulina', lang: 'es-MX', localService: true };
const MONICA: VozDelNavegador = { name: 'Mónica', lang: 'es-ES', localService: true };
const GOOGLE_US: VozDelNavegador = {
  name: 'Google español de Estados Unidos',
  lang: 'es-US',
  localService: false,
};
const SAMANTHA: VozDelNavegador = { name: 'Samantha', lang: 'en-US', localService: true };

function sintesisSimulada(voces: readonly VozDelNavegador[]) {
  const dichas: Utterance[] = [];
  return {
    dichas,
    speaking: false,
    pending: false,
    getVoices: () => voces,
    speak: vi.fn((utter: Utterance) => {
      dichas.push(utter);
    }),
    cancel: vi.fn(),
  };
}

function almacenSimulado(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
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

/** Pone el navegador simulado y carga el módulo de cero. */
async function cargar(opciones: {
  voces: readonly VozDelNavegador[];
  guardado?: Record<string, string>;
  enLinea?: boolean;
}) {
  const sintesis = sintesisSimulada(opciones.voces);
  const almacen = almacenSimulado(opciones.guardado);
  vi.stubGlobal('window', {
    speechSynthesis: sintesis,
    SpeechSynthesisUtterance: UtteranceSimulada,
  });
  vi.stubGlobal('localStorage', almacen);
  vi.stubGlobal('navigator', { onLine: opciones.enLinea ?? true });
  vi.resetModules();
  const modulo = await import('../../heredado/lib/voiceAlert.js');
  return { modulo, sintesis, almacen };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('la voz de los avisos', () => {
  it('sin elegir nada, suena la voz de siempre: la de México', async () => {
    const { modulo, sintesis } = await cargar({ voces: [SAMANTHA, MONICA, PAULINA] });

    modulo.speak('Mesa 4 solicita la cuenta.');

    expect(sintesis.dichas).toHaveLength(1);
    expect(sintesis.dichas[0]?.voice).toBe(PAULINA);
    expect(sintesis.dichas[0]?.lang).toBe('es-MX');
  });

  it('con una voz elegida que este dispositivo tiene, suena esa', async () => {
    const { modulo, sintesis } = await cargar({
      voces: [PAULINA, MONICA],
      guardado: { mh_voice_manual: 'Mónica' },
    });

    modulo.speak('Mesa 4 solicita la cuenta.');

    expect(sintesis.dichas[0]?.voice).toBe(MONICA);
    expect(sintesis.dichas[0]?.lang).toBe('es-ES');
  });

  it('con una voz elegida que ESTE dispositivo no tiene, cae a la de siempre sin lanzar', async () => {
    const { modulo, sintesis } = await cargar({
      voces: [PAULINA, MONICA],
      guardado: { mh_voice_manual: 'Voz de otro teléfono' },
    });

    expect(() => {
      modulo.speak('Pedido listo.');
    }).not.toThrow();

    expect(sintesis.dichas[0]?.voice).toBe(PAULINA);
  });

  it('la elección sigue guardada aunque este dispositivo no tenga la voz, por si vuelve', async () => {
    const { modulo, almacen } = await cargar({
      voces: [PAULINA],
      guardado: { mh_voice_manual: 'Mónica' },
    });

    modulo.speak('Pedido listo.');

    expect(almacen.datos.get('mh_voice_manual')).toBe('Mónica');
  });

  it('una voz de la nube elegida, sin internet, no deja el aviso mudo: cae a la automática', async () => {
    const { modulo, sintesis } = await cargar({
      voces: [PAULINA, GOOGLE_US],
      guardado: { mh_voice_manual: GOOGLE_US.name },
      enLinea: false,
    });

    modulo.speak('Pedido listo.');

    expect(sintesis.dichas[0]?.voice).toBe(PAULINA);
  });

  it('y con internet vuelve a sonar la de la nube que se eligió', async () => {
    const { modulo, sintesis } = await cargar({
      voces: [PAULINA, GOOGLE_US],
      guardado: { mh_voice_manual: GOOGLE_US.name },
      enLinea: true,
    });

    modulo.speak('Pedido listo.');

    expect(sintesis.dichas[0]?.voice).toBe(GOOGLE_US);
  });

  it('la elección de voz se guarda y se lee por el mismo camino que usa la pantalla', async () => {
    const { modulo, almacen } = await cargar({ voces: [PAULINA, MONICA] });

    expect(modulo.getPreferredVoiceName()).toBe('');
    expect(modulo.setPreferredVoice('Mónica')).toBe(true);
    expect(almacen.datos.get('mh_voice_manual')).toBe('Mónica');
    expect(modulo.getPreferredVoiceName()).toBe('Mónica');
    expect(modulo.getBestVoice('es-MX')).toBe(MONICA);

    modulo.setPreferredVoice('');
    expect(modulo.getPreferredVoiceName()).toBe('');
  });

  it('pickAutomaticVoice ignora la elegida: es lo que la pantalla llama «Automática»', async () => {
    const { modulo } = await cargar({
      voces: [PAULINA, MONICA],
      guardado: { mh_voice_manual: 'Mónica' },
    });

    expect(modulo.pickBestVoice('es-MX')).toBe(MONICA);
    expect(modulo.pickAutomaticVoice('es-MX')).toBe(PAULINA);
  });

  it('la velocidad guardada se aplica a los avisos, y sin ella es la de siempre', async () => {
    const normal = await cargar({ voces: [PAULINA] });
    normal.modulo.speak('Pedido listo.');
    expect(normal.sintesis.dichas[0]?.rate).toBe(1);

    const lenta = await cargar({ voces: [PAULINA], guardado: { mh_voice_rate: '0.85' } });
    lenta.modulo.speak('Pedido listo.');
    expect(lenta.sintesis.dichas[0]?.rate).toBe(0.85);
  });

  it('un localStorage que lanza no rompe el aviso: suena la de siempre', async () => {
    const sintesis = sintesisSimulada([PAULINA]);
    vi.stubGlobal('window', {
      speechSynthesis: sintesis,
      SpeechSynthesisUtterance: UtteranceSimulada,
    });
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    });
    vi.resetModules();
    const modulo = await import('../../heredado/lib/voiceAlert.js');

    expect(modulo.getPreferredVoiceName()).toBe('');
    expect(modulo.setPreferredVoice('Paulina')).toBe(false);
    expect(() => {
      modulo.speak('Pedido listo.');
    }).not.toThrow();
    expect(sintesis.dichas[0]?.voice).toBe(PAULINA);
  });
});

describe('la muestra de una voz', () => {
  it('suena aunque las alertas del mesero estén en silencio', async () => {
    const { modulo, sintesis } = await cargar({
      voces: [PAULINA, MONICA],
      guardado: { mh_mesero_alert_config: JSON.stringify({ modo: 'silencio' }) },
    });

    modulo.speak('Esto no debe sonar.');
    expect(sintesis.dichas).toHaveLength(0);

    expect(modulo.speakSample('Mesa cuatro, su orden está lista.', { voiceName: 'Mónica' })).toBe(
      true,
    );
    expect(sintesis.dichas).toHaveLength(1);
    expect(sintesis.dichas[0]?.voice).toBe(MONICA);
    expect(sintesis.dichas[0]?.text).toBe('Mesa cuatro, su orden está lista.');
  });

  it('sin nombre de voz usa la automática, no la guardada', async () => {
    const { modulo, sintesis } = await cargar({
      voces: [PAULINA, MONICA],
      guardado: { mh_voice_manual: 'Mónica' },
    });

    modulo.speakSample('Prueba.', { voiceName: '' });

    expect(sintesis.dichas[0]?.voice).toBe(PAULINA);
  });

  it('con una voz que no existe no lanza: habla con la automática', async () => {
    const { modulo, sintesis } = await cargar({ voces: [PAULINA] });

    expect(() => modulo.speakSample('Prueba.', { voiceName: 'Fantasma' })).not.toThrow();

    expect(sintesis.dichas[0]?.voice).toBe(PAULINA);
  });

  it('usa la velocidad que se le da, para oír el ajuste antes de guardarlo', async () => {
    const { modulo, sintesis } = await cargar({ voces: [PAULINA] });

    modulo.speakSample('Prueba.', { rate: 1.2 });

    expect(sintesis.dichas[0]?.rate).toBe(1.2);
  });

  it('sólo corta lo que ya está sonando: sin nada en curso no llama a cancel()', async () => {
    const { modulo, sintesis } = await cargar({ voces: [PAULINA] });

    modulo.speakSample('Una.');
    expect(sintesis.cancel).not.toHaveBeenCalled();

    sintesis.speaking = true;
    modulo.speakSample('Otra.');
    expect(sintesis.cancel).toHaveBeenCalledTimes(1);
  });

  it('avisa los errores reales de la voz, pero no el corte normal entre dos muestras', async () => {
    const { modulo, sintesis } = await cargar({ voces: [PAULINA] });
    const alFallar = vi.fn();

    modulo.speakSample('Prueba.', { onError: alFallar });
    const utter = sintesis.dichas[0];

    utter?.onerror?.({ error: 'interrupted' });
    utter?.onerror?.({ error: 'canceled' });
    expect(alFallar).not.toHaveBeenCalled();

    utter?.onerror?.({ error: 'synthesis-failed' });
    expect(alFallar).toHaveBeenCalledTimes(1);
    expect(alFallar).toHaveBeenCalledWith('synthesis-failed');
  });

  it('avisa cuándo empieza y cuándo termina', async () => {
    const { modulo, sintesis } = await cargar({ voces: [PAULINA] });
    const alEmpezar = vi.fn();
    const alTerminar = vi.fn();

    modulo.speakSample('Prueba.', { onStart: alEmpezar, onEnd: alTerminar });
    sintesis.dichas[0]?.onstart?.();
    sintesis.dichas[0]?.onend?.();

    expect(alEmpezar).toHaveBeenCalledTimes(1);
    expect(alTerminar).toHaveBeenCalledTimes(1);
  });

  it('en un navegador sin voz devuelve false y no hace nada', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', almacenSimulado());
    vi.resetModules();
    const modulo = await import('../../heredado/lib/voiceAlert.js');

    expect(modulo.isVoiceSupported()).toBe(false);
    expect(modulo.speakSample('Prueba.')).toBe(false);
  });
});
