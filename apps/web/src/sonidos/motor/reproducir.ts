/*
 * Motor de sonido de React Bits · Sound Lab (DavidHDev/react-bits, src/tools/sound-lab,
 * commit e12c22192ac7b4b452c5e2feb9b586d74765d696). Licencia MIT + Commons Clause:
 * `licencias/react-bits-sound-lab.md`. Partido en módulos sin cambiar lo que hace (DP-11.3).
 */

import { variantsOf } from './fuentes';
import { clamp, db } from './formas';
import { renderSound } from './render';
import { type Recipe, type Tune } from './tipos';

let sharedContext: AudioContext | null = null;
let masterVolume = 1;
let muted = false;
export const cache = new Map<string, Promise<AudioBuffer>>();
export const ids = new WeakMap<Recipe, number>();
export const lastVariant = new WeakMap<Recipe, number>();
let nextId = 1;

export const recipeId = (recipe: Recipe) => {
  let id = ids.get(recipe);
  if (!id) {
    id = nextId;
    nextId += 1;
    ids.set(recipe, id);
  }
  return id;
};

export const audio = () => {
  if (!sharedContext) {
    // Safari viejo sólo trae el prefijado.
    const Context =
      'AudioContext' in window
        ? window.AudioContext
        : (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedContext = new Context({ latencyHint: 'interactive' });
  }
  return sharedContext;
};

export const pickVariant = (recipe: Recipe) => {
  const count = variantsOf(recipe);
  if (count < 2) return 0;
  const last = lastVariant.get(recipe) ?? -1;
  let next = Math.floor(Math.random() * (last < 0 ? count : count - 1));
  if (last >= 0 && next >= last) next += 1;
  lastVariant.set(recipe, next);
  return next;
};

export const bufferFor = (recipe: Recipe, tune: Tune, rate: number, variant = 0) => {
  // Solo los campos con valor: un undefined explícito no cabe en Tune (exactOptionalPropertyTypes), y
  // JSON.stringify ya los omitía en la llave de caché, así que la llave y el render no cambian.
  const shape: Tune = {
    ...(tune.pitch !== undefined ? { pitch: tune.pitch } : {}),
    ...(tune.tone !== undefined ? { tone: tune.tone } : {}),
    ...(tune.length !== undefined ? { length: tune.length } : {}),
    ...(tune.space !== undefined ? { space: tune.space } : {}),
    ...(tune.punch !== undefined ? { punch: tune.punch } : {}),
    ...(tune.reverb !== undefined ? { reverb: tune.reverb } : {}),
    ...(tune.echo !== undefined ? { echo: tune.echo } : {}),
    ...(tune.filter !== undefined ? { filter: tune.filter } : {}),
    ...(tune.chorus !== undefined ? { chorus: tune.chorus } : {}),
    ...(tune.lofi !== undefined ? { lofi: tune.lofi } : {}),
  };
  const key = `${recipeId(recipe)}:${rate}:${variant}:${JSON.stringify(shape)}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = renderSound(recipe, shape, { sampleRate: rate, variant });
    cache.set(key, pending);
    // Añadido en POS Don Poncho (DP-11.3): una síntesis que falla no se queda en la caché; el
    // siguiente toque lo vuelve a intentar.
    const enCurso = pending;
    enCurso.catch(() => {
      if (cache.get(key) === enCurso) cache.delete(key);
    });
    if (cache.size > 96) {
      const masVieja = cache.keys().next();
      if (masVieja.done !== true) cache.delete(masVieja.value);
    }
  }
  return pending;
};

/**
 * Añadido en POS Don Poncho (DP-11.3): crea y reanuda el contexto de audio DENTRO del toque que
 * lo desbloquea. Safari sólo deja sonar si esto pasa en el mismo gesto, no después de un `await`.
 */
export function prepararAudio(): Promise<void> {
  const context = audio();
  // Cualquier estado que no sea «running»: también el «interrupted» de iOS (bloqueo de pantalla,
  // llamada, cambio de app), que el tipo de TypeScript no trae.
  return context.state === 'running' ? Promise.resolve() : context.resume();
}

export function setSoundVolume(value: number) {
  masterVolume = clamp(value, 0, 1);
}

export function setSoundMuted(value: boolean) {
  muted = value;
}

export function preloadSound(recipe: Recipe, tune: Tune = {}) {
  if (typeof window === 'undefined') return;
  for (let variant = 0; variant < variantsOf(recipe); variant += 1) {
    bufferFor(recipe, tune, audio().sampleRate, variant).catch(() => undefined);
  }
}

export async function playSound(recipe: Recipe, tune: Tune = {}) {
  if (typeof window === 'undefined' || muted || masterVolume <= 0) return;
  const context = audio();
  if (context.state === 'suspended') await context.resume();
  const buffer = await bufferFor(recipe, tune, context.sampleRate, pickVariant(recipe));
  const source = context.createBufferSource();
  source.buffer = buffer;
  const variation = clamp(tune.variation ?? 0, 0, 1);
  if (variation > 0) source.detune.value = (Math.random() * 2 - 1) * variation * 80;
  const gain = context.createGain();
  gain.gain.value = masterVolume * db(clamp(tune.volume ?? 0, -48, 12));
  source.connect(gain);
  gain.connect(context.destination);
  source.start();
  await new Promise<void>((resolve) => {
    source.onended = () => {
      resolve();
    };
  });
}
