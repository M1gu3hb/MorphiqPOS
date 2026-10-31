/*
 * Motor de sonido de React Bits · Sound Lab (DavidHDev/react-bits, src/tools/sound-lab,
 * commit e12c22192ac7b4b452c5e2feb9b586d74765d696). Licencia MIT + Commons Clause:
 * `licencias/react-bits-sound-lab.md`. Partido en módulos sin cambiar lo que hace (DP-11.3).
 */

import { clamp, db, normalizeTune, random } from './formas';
import { type Recipe } from './tipos';

export const loudness = (channels: Float32Array[], rate: number) => {
  const window = Math.max(1, Math.round(rate * 0.05));
  let best = 0;
  const length = channels[0]?.length ?? 0;
  for (let start = 0; start < length; start += Math.round(window / 2)) {
    let sum = 0;
    const stop = Math.min(length, start + window);
    for (let i = start; i < stop; i += 1) {
      for (const data of channels) {
        const sample = data[i] ?? 0;
        sum += sample * sample;
      }
    }
    best = Math.max(best, sum / ((stop - start) * channels.length));
  }
  return Math.sqrt(best);
};

export const finish = (
  buffer: AudioBuffer,
  recipe: Recipe,
  tune: ReturnType<typeof normalizeTune>,
) => {
  const rate = buffer.sampleRate;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    buffer.getChannelData(index),
  );
  if (recipe.stutter) {
    const next = random((recipe.seed ?? 1) * 131 + 7);
    const slice = Math.max(32, Math.round(recipe.stutter.slice * tune.length * rate));
    const copies = channels.map((data) => data.slice());
    const frames = copies[0]?.length ?? 0;
    for (let start = 0; start < frames; start += slice) {
      const roll = next();
      const repeat = roll < recipe.stutter.chance;
      const gate = roll > 1 - recipe.stutter.chance * 0.35;
      const from = repeat ? Math.max(0, start - slice) : start;
      channels.forEach((data, channel) => {
        const copy = copies[channel];
        if (!copy) return;
        for (let i = 0; i < slice && start + i < data.length; i += 1) {
          const edge = Math.min(1, i / 48, (slice - i) / 48);
          data[start + i] = gate ? 0 : (copy[from + i] ?? 0) * edge;
        }
      });
    }
  }
  const crush = recipe.crush;
  if (crush) {
    const levels = Math.pow(2, Math.round(16 - crush * 12));
    const hold = Math.max(1, Math.round(1 + crush * 10));
    channels.forEach((data) => {
      let held = 0;
      for (let i = 0; i < data.length; i += 1) {
        if (i % hold === 0) held = Math.round((data[i] ?? 0) * levels) / levels;
        data[i] = (data[i] ?? 0) * (1 - crush) + held * crush;
      }
    });
  }
  if (recipe.reverse) channels.forEach((data) => data.reverse());
  const floor = db(-70);
  let first = channels[0]?.length ?? 0;
  channels.forEach((data) => {
    for (let i = 0; i < first; i += 1) {
      if (Math.abs(data[i] ?? 0) > floor) {
        first = i;
        break;
      }
    }
  });
  const lead = Math.max(0, first - Math.round(rate * 0.002));
  if (lead > 0) {
    channels.forEach((data) => {
      data.copyWithin(0, lead);
      data.fill(0, data.length - lead);
    });
  }
  let last = 0;
  channels.forEach((data) => {
    for (let i = data.length - 1; i > last; i -= 1) {
      if (Math.abs(data[i] ?? 0) > floor) {
        last = i;
        break;
      }
    }
  });
  const length = Math.min(buffer.length, last + Math.round(rate * 0.02));
  const fadeOut = Math.min(Math.round(rate * 0.02), length);
  const fadeIn = Math.round(rate * 0.0006);
  let mean = 0;
  channels.forEach((data) => {
    for (let i = 0; i < length; i += 1) mean += data[i] ?? 0;
  });
  mean /= length * channels.length;
  const level = loudness(channels, rate);
  const target = db(recipe.loudness ?? -16);
  let gain = level > 1e-6 ? target / level : 1;
  let peak = 0;
  channels.forEach((data) => {
    for (let i = 0; i < length; i += 1) peak = Math.max(peak, Math.abs((data[i] ?? 0) - mean));
  });
  if (peak * gain > db(-1)) gain = db(-1) / peak;
  gain *= db(tune.volume) * db(recipe.gain ?? 0);
  channels.forEach((data) => {
    for (let i = 0; i < data.length; i += 1) {
      if (i >= length) {
        data[i] = 0;
        continue;
      }
      let value = ((data[i] ?? 0) - mean) * gain;
      if (i < fadeIn) value *= Math.sin(((i / fadeIn) * Math.PI) / 2);
      const remaining = length - i;
      if (remaining < fadeOut) value *= 0.5 - 0.5 * Math.cos((remaining / fadeOut) * Math.PI);
      data[i] = Math.abs(value) > 0.999 ? Math.sign(value) * 0.999 : value;
    }
  });
  return { buffer, length };
};

export const trimmed = (source: AudioBuffer, length: number) => {
  if (length >= source.length) return source;
  const buffer = new AudioBuffer({
    length,
    numberOfChannels: source.numberOfChannels,
    sampleRate: source.sampleRate,
  });
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    buffer.copyToChannel(source.getChannelData(channel).subarray(0, length), channel);
  }
  return buffer;
};

export const channelsOf = (buffer: AudioBuffer) =>
  Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));

export const peakOf = (channels: Float32Array[]) => {
  let peak = 0;
  channels.forEach((data) => {
    for (const valor of data) peak = Math.max(peak, Math.abs(valor));
  });
  return peak;
};

export const balance = (mix: number): [number, number] => [
  Math.cos((mix * Math.PI) / 2),
  Math.sin((mix * Math.PI) / 2),
];

export const predelayOf = (decay: number) => clamp(0.004 + decay * 0.006, 0.004, 0.03);
