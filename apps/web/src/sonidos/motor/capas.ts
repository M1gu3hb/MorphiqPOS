/*
 * Motor de sonido de React Bits · Sound Lab (DavidHDev/react-bits, src/tools/sound-lab,
 * commit e12c22192ac7b4b452c5e2feb9b586d74765d696). Licencia MIT + Commons Clause:
 * `licencias/react-bits-sound-lab.md`. Partido en módulos sin cambiar lo que hace (DP-11.3).
 */

import {
  applyCurve,
  clamp,
  db,
  envelopeLength,
  envelopeShape,
  normalizeTune,
  rampShape,
} from './formas';
import { noiseBuffer, filters, decodePcm } from './fuentes';
import { type Layer, type Recipe } from './tipos';

export const buildLayer = (
  context: OfflineAudioContext,
  layer: Layer,
  index: number,
  destination: AudioNode,
  recipe: Recipe,
  tune: ReturnType<typeof normalizeTune>,
  end: number,
  variant: number,
) => {
  const rate = context.sampleRate;
  const stretch = tune.length;
  const ratio = Math.pow(2, tune.pitch / 12);
  const start = (layer.at ?? 0) * stretch;
  const env = layer.env ?? { attack: 0.002, decay: 0.2 };
  const sample = layer.type === 'sample' ? layer : null;
  const bank = sample?.data
    ? { rate: sample.rate ?? 48000, data: sample.data }
    : sample
      ? recipe.samples
      : undefined;
  const encoded =
    sample && bank?.data.length
      ? bank.data[(variant + (sample.offset ?? 0)) % bank.data.length]
      : undefined;
  const pcm = encoded !== undefined ? decodePcm(encoded) : null;
  const speed = sample ? ratio * Math.pow(2, (sample.pitch ?? 0) / 12) : ratio;
  const natural = pcm && bank ? pcm.length / bank.rate / speed : 0;
  const span = Math.min(
    (pcm && !layer.env ? natural : envelopeLength(env, stretch)) + 0.01,
    end - start,
  );
  if (span <= 0) return;
  const nyquist = rate / 2 - 100;
  let gain = db(layer.gain ?? 0);
  if (layer.punch) gain *= db(tune.punch * 6);
  const output = context.createGain();
  output.gain.value = gain;
  let tail: AudioNode = output;
  if (layer.tremolo) {
    const depth = clamp(layer.tremolo.depth, 0, 1);
    const wobble = context.createGain();
    wobble.gain.value = 1 - depth / 2;
    const lfo = context.createOscillator();
    lfo.frequency.value = layer.tremolo.rate;
    const swing = context.createGain();
    swing.gain.value = depth / 2;
    lfo.connect(swing);
    swing.connect(wobble.gain);
    lfo.start(start);
    lfo.stop(start + span);
    output.connect(wobble);
    tail = wobble;
  }
  filters(layer).forEach((spec) => {
    const node = context.createBiquadFilter();
    node.type = spec.type;
    if (spec.gain !== undefined) node.gain.value = spec.gain;
    const freqShape = rampShape(spec.freq, stretch, true);
    applyCurve(node.frequency, freqShape, start, span, 400, (value) =>
      clamp(value * ratio, 10, nyquist),
    );
    if (spec.q !== undefined)
      applyCurve(node.Q, rampShape(spec.q, stretch, false), start, span, 200);
    tail.connect(node);
    tail = node;
  });
  if (layer.pan !== undefined) {
    const panner = context.createStereoPanner();
    applyCurve(panner.pan, rampShape(layer.pan, stretch, false), start, span, 200, (value) =>
      clamp(value, -1, 1),
    );
    tail.connect(panner);
    tail = panner;
  }
  tail.connect(destination);
  const seed = (recipe.seed ?? 1) * 7919 + index * 104729;
  if (layer.type === 'sample') {
    if (!pcm || !bank) return;
    const buffer = context.createBuffer(1, pcm.length, bank.rate);
    buffer.copyToChannel(pcm, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = speed;
    if (layer.env) {
      const amp = context.createGain();
      applyCurve(amp.gain, envelopeShape(env, stretch), start, span, 600);
      source.connect(amp);
      amp.connect(output);
    } else {
      source.connect(output);
    }
    source.start(start);
    return;
  }
  if (layer.type === 'noise') {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(context, layer.color ?? 'white', span + 0.05, seed);
    const amp = context.createGain();
    applyCurve(amp.gain, envelopeShape(env, stretch), start, span, 600);
    source.connect(amp);
    amp.connect(output);
    source.start(start);
    source.stop(start + span);
    return;
  }
  const freqShape = rampShape(layer.freq, stretch, true);
  const partials: [number, number, number][] = layer.partials
    ? layer.partials.map(([partialRatio, partialGain, decay]) => [
        partialRatio,
        partialGain,
        decay ?? 1,
      ])
    : [[1, 1, 1]];
  const voices = Math.max(1, Math.round(layer.voices ?? 1));
  const spread = layer.detune ?? 0;
  partials.forEach(([partialRatio, partialGain, decayScale], partialIndex) => {
    const amp = context.createGain();
    applyCurve(
      amp.gain,
      envelopeShape(env, stretch, decayScale),
      start,
      span,
      600,
      (value) => value * partialGain,
    );
    amp.connect(output);
    for (let voice = 0; voice < voices; voice += 1) {
      const osc = context.createOscillator();
      if (layer.harmonics && !layer.partials) {
        const real = new Float32Array(layer.harmonics.length + 1);
        const imag = new Float32Array(layer.harmonics.length + 1);
        layer.harmonics.forEach((value, harmonic) => {
          imag[harmonic + 1] = value;
        });
        osc.setPeriodicWave(context.createPeriodicWave(real, imag));
      } else {
        osc.type = layer.wave ?? 'sine';
      }
      const offset = voices > 1 ? (voice / (voices - 1) - 0.5) * 2 * spread : 0;
      applyCurve(osc.frequency, freqShape, start, span, 400, (value) =>
        clamp(value * ratio * partialRatio, 1, nyquist),
      );
      osc.detune.value = offset;
      if (layer.vibrato) {
        const lfo = context.createOscillator();
        const depth = context.createGain();
        lfo.frequency.value = layer.vibrato.rate;
        depth.gain.value = layer.vibrato.depth;
        lfo.connect(depth);
        depth.connect(osc.detune);
        lfo.start(start);
        lfo.stop(start + span);
      }
      if (layer.fm && partialIndex === 0) {
        const fm = layer.fm;
        const mod = context.createOscillator();
        const depth = context.createGain();
        applyCurve(mod.frequency, freqShape, start, span, 400, (value) =>
          clamp(value * ratio * fm.ratio, 1, nyquist),
        );
        const indexShape = rampShape(fm.index, stretch, false);
        applyCurve(
          depth.gain,
          (time) => indexShape(time) * freqShape(time) * ratio * fm.ratio,
          start,
          span,
          400,
        );
        mod.connect(depth);
        depth.connect(osc.frequency);
        mod.start(start);
        mod.stop(start + span);
      }
      let target: AudioNode = amp;
      if (voices > 1) {
        const voiceGain = context.createGain();
        voiceGain.gain.value = 1 / Math.sqrt(voices);
        const pan = context.createStereoPanner();
        pan.pan.value = clamp((voice / (voices - 1) - 0.5) * 2 * (recipe.width ?? 0.6), -1, 1);
        voiceGain.connect(pan);
        pan.connect(amp);
        target = voiceGain;
      }
      osc.connect(target);
      osc.start(start);
      osc.stop(start + span);
    }
  });
};
