/*
 * Motor de sonido de React Bits · Sound Lab (DavidHDev/react-bits, src/tools/sound-lab,
 * commit e12c22192ac7b4b452c5e2feb9b586d74765d696). Licencia MIT + Commons Clause:
 * `licencias/react-bits-sound-lab.md`. Partido en módulos sin cambiar lo que hace (DP-11.3).
 */

import { impulse } from './fuentes';
import { type Settings, TAU, clamp, db } from './formas';
import { balance, channelsOf, loudness, peakOf, predelayOf, trimmed } from './mezcla';

export const addEcho = (
  context: OfflineAudioContext,
  input: AudioNode,
  echo: NonNullable<Settings['echo']>,
) => {
  const [dryLevel, wetLevel] = balance(echo.mix);
  const output = context.createGain();
  const dry = context.createGain();
  dry.gain.value = dryLevel;
  input.connect(dry);
  dry.connect(output);
  const wet = context.createGain();
  wet.gain.value = wetLevel;
  wet.connect(output);
  const send = context.createGain();
  if (echo.pingPong) {
    send.channelCount = 1;
    send.channelCountMode = 'explicit';
  }
  input.connect(send);
  const nyquist = context.sampleRate / 2 - 200;
  const taps = (echo.pingPong ? [-0.7, 0.7] : [0]).map((side) => {
    const delay = context.createDelay(2.5);
    delay.delayTime.value = echo.time;
    const damp = context.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = Math.min(nyquist, 4200 * Math.pow(2, echo.tone * 1.6));
    damp.Q.value = 0.5;
    const thin = context.createBiquadFilter();
    thin.type = 'highpass';
    thin.frequency.value = 140;
    thin.Q.value = 0.5;
    const pan = context.createStereoPanner();
    pan.pan.value = side;
    delay.connect(damp);
    damp.connect(thin);
    thin.connect(pan);
    pan.connect(wet);
    return { delay, thin };
  });
  taps.forEach((tap, index) => {
    const feedback = context.createGain();
    feedback.gain.value = echo.feedback;
    tap.thin.connect(feedback);
    const next = taps[(index + 1) % taps.length];
    if (next) feedback.connect(next.delay);
  });
  const primero = taps[0];
  if (primero) send.connect(primero.delay);
  return output;
};

export const addReverb = (
  context: OfflineAudioContext,
  input: AudioNode,
  reverb: NonNullable<Settings['reverb']>,
  seed: number,
) => {
  const [dryLevel, wetLevel] = balance(reverb.mix);
  const output = context.createGain();
  const dry = context.createGain();
  dry.gain.value = dryLevel;
  input.connect(dry);
  dry.connect(output);
  const thin = context.createBiquadFilter();
  thin.type = 'highpass';
  thin.frequency.value = 160;
  thin.Q.value = 0.5;
  const convolver = context.createConvolver();
  convolver.normalize = false;
  const damp = Math.min(context.sampleRate / 2 - 500, 6500 * Math.pow(2, reverb.tone * 1.4));
  convolver.buffer = impulse(context, reverb.decay, predelayOf(reverb.decay), damp, seed + 101);
  const wet = context.createGain();
  wet.gain.value = wetLevel;
  input.connect(thin);
  thin.connect(convolver);
  convolver.connect(wet);
  wet.connect(output);
  return output;
};

export const addFilter = (
  context: OfflineAudioContext,
  input: AudioNode,
  filter: NonNullable<Settings['filter']>,
  span: number,
) => {
  const node = context.createBiquadFilter();
  const nyquist = context.sampleRate / 2 - 200;
  const from = clamp(filter.cutoff, 20, nyquist);
  node.type = filter.type;
  node.Q.value = 0.5 * Math.pow(16, filter.resonance);
  node.frequency.setValueAtTime(from, 0);
  if (filter.sweep !== 0) {
    const to = clamp(filter.cutoff * Math.pow(2, filter.sweep * 4), 20, nyquist);
    node.frequency.exponentialRampToValueAtTime(to, Math.max(0.05, span));
  }
  input.connect(node);
  return node;
};

export const sine = (context: BaseAudioContext, phase: number) =>
  context.createPeriodicWave(
    new Float32Array([0, Math.sin(phase)]),
    new Float32Array([0, Math.cos(phase)]),
  );

export const addChorus = (
  context: OfflineAudioContext,
  input: AudioNode,
  chorus: NonNullable<Settings['chorus']>,
) => {
  const [dryLevel, wetLevel] = balance(chorus.mix);
  const output = context.createGain();
  const dry = context.createGain();
  dry.gain.value = dryLevel;
  input.connect(dry);
  dry.connect(output);
  const wet = context.createGain();
  wet.gain.value = wetLevel;
  wet.connect(output);
  [-0.75, 0.75].forEach((side, index) => {
    const delay = context.createDelay(0.1);
    delay.delayTime.value = 0.014 + index * 0.005;
    const lfo = context.createOscillator();
    lfo.setPeriodicWave(sine(context, (index * Math.PI) / 2));
    lfo.frequency.value = chorus.rate * (1 + index * 0.13);
    const depth = context.createGain();
    depth.gain.value = 0.0003 + chorus.depth * 0.0027;
    lfo.connect(depth);
    depth.connect(delay.delayTime);
    lfo.start();
    const pan = context.createStereoPanner();
    pan.pan.value = side;
    input.connect(delay);
    delay.connect(pan);
    pan.connect(wet);
  });
  return output;
};

export const crunch = (source: AudioBuffer, lofi: NonNullable<Settings['lofi']>) => {
  const rate = source.sampleRate;
  const hold = Math.max(1, rate / lofi.rate);
  const steps = Math.pow(2, lofi.bits - 1);
  const squash = Math.log(256);
  const smooth = 1 - Math.exp((-TAU * Math.min(rate * 0.45, lofi.rate * 0.45)) / rate);
  const [dryLevel, wetLevel] = balance(lofi.mix);
  const buffer = new AudioBuffer({
    length: source.length,
    numberOfChannels: source.numberOfChannels,
    sampleRate: rate,
  });
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const output = buffer.getChannelData(channel);
    let held = 0;
    let phase = hold;
    let low = 0;
    for (let i = 0; i < input.length; i += 1) {
      const sample = input[i] ?? 0;
      phase += 1;
      if (phase >= hold) {
        phase -= hold;
        const level = Math.round((Math.log(1 + 255 * Math.abs(sample)) / squash) * steps) / steps;
        held = (Math.sign(sample) * (Math.pow(256, level) - 1)) / 255;
      }
      low += smooth * (held - low);
      output[i] = sample * dryLevel + low * wetLevel;
    }
  }
  return buffer;
};

export const settle = (buffer: AudioBuffer, reference: AudioBuffer) => {
  const rate = buffer.sampleRate;
  const channels = channelsOf(buffer);
  const source = channelsOf(reference);
  const level = loudness(channels, rate);
  let gain = level > 1e-9 ? loudness(source, rate) / level : 1;
  const ceiling = Math.max(peakOf(source), db(-1));
  const peak = peakOf(channels);
  if (peak * gain > ceiling) gain = ceiling / peak;
  const floor = db(-70);
  let last = 0;
  channels.forEach((data) => {
    for (let i = data.length - 1; i > last; i -= 1) {
      if (Math.abs((data[i] ?? 0) * gain) > floor) {
        last = i;
        break;
      }
    }
  });
  const length = Math.min(buffer.length, last + Math.round(rate * 0.02));
  const fade = Math.min(Math.round(rate * 0.02), length);
  channels.forEach((data) => {
    for (let i = 0; i < length; i += 1) {
      let value = (data[i] ?? 0) * gain;
      const remaining = length - i;
      if (remaining < fade) value *= 0.5 - 0.5 * Math.cos((remaining / fade) * Math.PI);
      data[i] = Math.abs(value) > 0.999 ? Math.sign(value) * 0.999 : value;
    }
  });
  return trimmed(buffer, length);
};

export const applyEffects = async (dry: AudioBuffer, settings: Settings, seed: number) => {
  const echo = settings.echo && settings.echo.mix > 0 ? settings.echo : null;
  const reverb = settings.reverb && settings.reverb.mix > 0 ? settings.reverb : null;
  const chorus = settings.chorus && settings.chorus.mix > 0 ? settings.chorus : null;
  const lofi = settings.lofi && settings.lofi.mix > 0 ? settings.lofi : null;
  const filter = settings.filter;
  if (!echo && !reverb && !chorus && !lofi && !filter) return dry;
  const rate = dry.sampleRate;
  const echoTail = echo
    ? echo.time * (1 + Math.log(0.001) / Math.log(Math.max(0.05, echo.feedback)))
    : 0;
  const reverbTail = reverb ? reverb.decay * 1.15 + predelayOf(reverb.decay) : 0;
  const total = dry.duration + Math.min(12, echoTail) + reverbTail + (chorus ? 0.03 : 0) + 0.05;
  const context = new OfflineAudioContext(dry.numberOfChannels, Math.ceil(total * rate), rate);
  const source = context.createBufferSource();
  source.buffer = lofi ? crunch(dry, lofi) : dry;
  let chain: AudioNode = source;
  if (filter) chain = addFilter(context, chain, filter, dry.duration);
  if (chorus) chain = addChorus(context, chain, chorus);
  if (echo) chain = addEcho(context, chain, echo);
  if (reverb) chain = addReverb(context, chain, reverb, seed);
  chain.connect(context.destination);
  source.start();
  return settle(await context.startRendering(), dry);
};
