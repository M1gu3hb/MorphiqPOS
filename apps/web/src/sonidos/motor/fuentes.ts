/*
 * Motor de sonido de React Bits · Sound Lab (DavidHDev/react-bits, src/tools/sound-lab,
 * commit e12c22192ac7b4b452c5e2feb9b586d74765d696). Licencia MIT + Commons Clause:
 * `licencias/react-bits-sound-lab.md`. Partido en módulos sin cambiar lo que hace (DP-11.3).
 */

import { TAU, random } from './formas';
import { type Layer, type NoiseLayer, type Recipe } from './tipos';

export const noiseBuffer = (
  context: BaseAudioContext,
  color: NoiseLayer['color'],
  length: number,
  seed: number,
) => {
  const frames = Math.max(1, Math.ceil(length * context.sampleRate));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  const next = random(seed);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let brown = 0;
  const density = 45 / context.sampleRate;
  for (let i = 0; i < frames; i += 1) {
    const white = next() * 2 - 1;
    if (color === 'crackle') {
      data[i] = next() < density ? white * (0.4 + next() * 0.6) : 0;
    } else if (color === 'pink') {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    } else if (color === 'brown') {
      brown = (brown + 0.02 * white) / 1.02;
      data[i] = brown * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buffer;
};

export const impulse = (
  context: BaseAudioContext,
  decay: number,
  predelay: number,
  damp: number,
  seed: number,
) => {
  const rate = context.sampleRate;
  const length = Math.ceil((decay * 1.15 + predelay) * rate);
  const buffer = context.createBuffer(2, length, rate);
  const taps = [0.0071, 0.0113, 0.0167, 0.0229, 0.0311, 0.0373];
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    const next = random(seed * 31 + channel * 977 + 17);
    let low = 0;
    let energy = 0;
    for (let i = 0; i < length; i += 1) {
      const time = i / rate - predelay;
      if (time < 0) continue;
      const cutoff = damp * Math.pow(0.18, time / decay) + 300;
      const a = 1 - Math.exp((-TAU * cutoff) / rate);
      low += a * (next() * 2 - 1 - low);
      const swell = Math.min(1, time / 0.004);
      const value = low * Math.exp((-6.9 * time) / decay) * swell;
      data[i] = value;
      energy += value * value;
    }
    taps.forEach((tap, index) => {
      const at = Math.round((predelay + tap * (channel ? 1.13 : 1)) * rate);
      if (at < length)
        data[at] = (data[at] ?? 0) + (0.5 - index * 0.06) * Math.sqrt(energy / length) * 3;
    });
    let total = 0;
    for (let i = 0; i < length; i += 1) {
      const sample = data[i] ?? 0;
      total += sample * sample;
    }
    const scale = 1 / Math.sqrt(Math.max(total, 1e-12));
    for (let i = 0; i < length; i += 1) data[i] = (data[i] ?? 0) * scale;
  }
  return buffer;
};

export const shaper = (amount: number) => {
  const curve = new Float32Array(2048);
  const drive = 1 + amount * 6;
  const norm = Math.tanh(drive);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
};

export const filters = (layer: Layer) =>
  layer.filter ? (Array.isArray(layer.filter) ? layer.filter : [layer.filter]) : [];

export const decodePcm = (data: string) => {
  const bytes = atob(data);
  const pcm = new Float32Array(bytes.length >> 1);
  for (let i = 0; i < pcm.length; i += 1) {
    const value = bytes.charCodeAt(i * 2) | (bytes.charCodeAt(i * 2 + 1) << 8);
    pcm[i] = (value >= 32768 ? value - 65536 : value) / 32768;
  }
  return pcm;
};

export const variantsOf = (recipe: Recipe) =>
  recipe.layers.reduce(
    (count, layer) =>
      layer.type === 'sample'
        ? Math.max(count, (layer.data ?? recipe.samples?.data ?? []).length)
        : count,
    1,
  );
