/*
 * Motor de sonido de React Bits · Sound Lab (DavidHDev/react-bits, src/tools/sound-lab,
 * commit e12c22192ac7b4b452c5e2feb9b586d74765d696). Licencia MIT + Commons Clause:
 * `licencias/react-bits-sound-lab.md`. Partido en módulos sin cambiar lo que hace (DP-11.3).
 */

import { type Envelope, type Ramp, type Tune } from './tipos';

export const TAU = Math.PI * 2;
export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export const db = (value: number) => Math.pow(10, value / 20);

export const random = (seed: number) => {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const filterType = (type?: string): BiquadFilterType =>
  type === 'highpass' || type === 'bandpass' ? type : 'lowpass';

export const normalizeTune = (tune: Tune = {}) => ({
  pitch: clamp(tune.pitch ?? 0, -24, 24),
  tone: clamp(tune.tone ?? 0, -1, 1),
  length: clamp(tune.length ?? 1, 0.25, 4),
  space: clamp(tune.space ?? 0, -1, 1),
  punch: clamp(tune.punch ?? 0, -1, 1),
  volume: clamp(tune.volume ?? 0, -48, 12),
  variation: clamp(tune.variation ?? 0, 0, 1),
  reverb: tune.reverb
    ? {
        mix: clamp(tune.reverb.mix ?? 0.25, 0, 1),
        decay: clamp(tune.reverb.decay ?? 1.4, 0.1, 12),
        tone: clamp(tune.reverb.tone ?? 0, -1, 1),
      }
    : null,
  echo: tune.echo
    ? {
        time: clamp(tune.echo.time ?? 0.24, 0.01, 2),
        feedback: clamp(tune.echo.feedback ?? 0.35, 0, 0.95),
        mix: clamp(tune.echo.mix ?? 0.25, 0, 1),
        tone: clamp(tune.echo.tone ?? 0, -1, 1),
        pingPong: Boolean(tune.echo.pingPong),
      }
    : null,
  filter: tune.filter
    ? {
        type: filterType(tune.filter.type),
        cutoff: clamp(tune.filter.cutoff ?? 1000, 20, 20000),
        resonance: clamp(tune.filter.resonance ?? 0.4, 0, 1),
        sweep: clamp(tune.filter.sweep ?? 0, -1, 1),
      }
    : null,
  chorus: tune.chorus
    ? {
        mix: clamp(tune.chorus.mix ?? 0.5, 0, 1),
        rate: clamp(tune.chorus.rate ?? 0.9, 0.05, 8),
        depth: clamp(tune.chorus.depth ?? 0.5, 0, 1),
      }
    : null,
  lofi: tune.lofi
    ? {
        bits: clamp(Math.round(tune.lofi.bits ?? 5), 2, 16),
        rate: clamp(tune.lofi.rate ?? 6000, 500, 48000),
        mix: clamp(tune.lofi.mix ?? 0.7, 0, 1),
      }
    : null,
});

export type Settings = ReturnType<typeof normalizeTune>;

export type Shape = (time: number) => number;

export const rampShape = (ramp: Ramp, scaleTime: number, log: boolean): Shape => {
  if (typeof ramp === 'number') return () => ramp;
  if ('points' in ramp) {
    const points = ramp.points.map(
      ([time, value]) => [time * scaleTime, value] as [number, number],
    );
    const primero = points[0];
    const ultimo = points[points.length - 1];
    if (!primero || !ultimo) return () => 0;
    return (time) => {
      if (time <= primero[0]) return primero[1];
      for (let i = 1; i < points.length; i += 1) {
        const siguiente = points[i];
        const anterior = points[i - 1];
        if (!siguiente || !anterior) break;
        const [t1, v1] = siguiente;
        if (time <= t1) {
          const [t0, v0] = anterior;
          const y = t1 > t0 ? (time - t0) / (t1 - t0) : 1;
          const s = y * y * (3 - 2 * y);
          return log && v0 > 0 && v1 > 0 ? v0 * Math.pow(v1 / v0, s) : v0 + (v1 - v0) * s;
        }
      }
      return ultimo[1];
    };
  }
  const delay = (ramp.delay ?? 0) * scaleTime;
  const span = Math.max(1e-4, (ramp.time ?? 0.1) * scaleTime);
  const curve = ramp.curve ?? 2;
  return (time) => {
    const y = clamp((time - delay) / span, 0, 1);
    const e = curve >= 1 ? 1 - Math.pow(1 - y, curve) : Math.pow(y, 1 / curve);
    return log && ramp.from > 0 && ramp.to > 0
      ? ramp.from * Math.pow(ramp.to / ramp.from, e)
      : ramp.from + (ramp.to - ramp.from) * e;
  };
};

export const envelopeLength = (env: Envelope, stretch: number) =>
  ((env.attack ?? 0.002) +
    (env.hold ?? 0) +
    (env.decay ?? 0.2) +
    ((env.sustain ?? 0) > 0 ? (env.release ?? 0.1) : 0)) *
  stretch;

export const envelopeShape = (env: Envelope, stretch: number, decayScale = 1): Shape => {
  const attack = Math.max(0.0004, (env.attack ?? 0.002) * stretch);
  const hold = (env.hold ?? 0) * stretch;
  const decay = Math.max(0.002, (env.decay ?? 0.2) * stretch * decayScale);
  const sustain = clamp(env.sustain ?? 0, 0, 1);
  const release = Math.max(0.002, (env.release ?? 0.1) * stretch);
  const k = env.curve ?? 5;
  const rise = env.rise;
  const fall = (y: number) => (Math.exp(-k * y) - Math.exp(-k)) / (1 - Math.exp(-k));
  return (time) => {
    if (time <= 0) return 0;
    if (time < attack) {
      const y = time / attack;
      return rise ? Math.pow(y, rise) : Math.sin((y * Math.PI) / 2);
    }
    let t = time - attack;
    if (t < hold) return 1;
    t -= hold;
    if (t < decay) return sustain + (1 - sustain) * fall(t / decay);
    if (sustain <= 0) return 0;
    t -= decay;
    if (t < release) return sustain * fall(t / release);
    return 0;
  };
};

export const applyCurve = (
  param: AudioParam,
  shape: Shape,
  start: number,
  length: number,
  rate: number,
  map = (v: number) => v,
) => {
  const steps = clamp(Math.ceil(length * rate), 2, 4096);
  const values = new Float32Array(steps);
  for (let i = 0; i < steps; i += 1) values[i] = map(shape((i / (steps - 1)) * length));
  param.value = values[0] ?? 0;
  param.setValueCurveAtTime(values, start, length);
};
