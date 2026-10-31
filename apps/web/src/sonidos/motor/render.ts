/*
 * Motor de sonido de React Bits · Sound Lab (DavidHDev/react-bits, src/tools/sound-lab,
 * commit e12c22192ac7b4b452c5e2feb9b586d74765d696). Licencia MIT + Commons Clause:
 * `licencias/react-bits-sound-lab.md`. Partido en módulos sin cambiar lo que hace (DP-11.3).
 */

import { buildLayer } from './capas';
import { impulse, shaper } from './fuentes';
import { applyEffects } from './efectos';
import { clamp, normalizeTune } from './formas';
import { finish, trimmed } from './mezcla';
import { type Recipe, type RenderOptions, type Tune } from './tipos';

export async function renderSound(recipe: Recipe, tune: Tune = {}, options: RenderOptions = {}) {
  const t = normalizeTune(tune);
  const rate = options.sampleRate ?? 48000;
  const channelCount = options.channels ?? 2;
  const reverb = recipe.reverb;
  const spaceMix = reverb
    ? clamp(reverb.mix * (t.space < 0 ? 1 + t.space : 1 + t.space * 1.6), 0, 0.9)
    : 0;
  const spaceDecay = reverb ? reverb.decay * (1 + Math.max(0, t.space) * 0.8) : 0;
  const echoTail = recipe.echo
    ? (recipe.echo.time * Math.log(0.001)) / Math.log(Math.max(0.05, recipe.echo.feedback))
    : 0;
  const body = recipe.duration * t.length;
  const end =
    body + (spaceMix > 0 ? spaceDecay * 1.1 + (reverb?.predelay ?? 0) : 0) + echoTail + 0.05;
  const context = new OfflineAudioContext(channelCount, Math.ceil(end * rate), rate);
  const bus = context.createGain();
  const variant = Math.max(0, Math.floor(options.variant ?? 0));
  recipe.layers.forEach((layer, index) => {
    buildLayer(context, layer, index, bus, recipe, t, body, variant);
  });
  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = recipe.highpass ?? 24;
  highpass.Q.value = 0.6;
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = clamp(
    (recipe.lowpass ?? 16000) * (1 + t.tone * 0.35),
    400,
    rate / 2 - 200,
  );
  lowpass.Q.value = 0.5;
  const low = context.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 280;
  low.gain.value = -t.tone * 4;
  const high = context.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 3600;
  high.gain.value = t.tone * 7;
  bus.connect(highpass);
  highpass.connect(low);
  low.connect(high);
  high.connect(lowpass);
  let chain: AudioNode = lowpass;
  const drive = clamp((recipe.drive ?? 0) + Math.max(0, t.punch) * 0.25, 0, 1);
  if (drive > 0) {
    const headroom = context.createGain();
    headroom.gain.value = 0.5;
    const shape = context.createWaveShaper();
    shape.curve = shaper(drive);
    shape.oversample = '4x';
    chain.connect(headroom);
    headroom.connect(shape);
    chain = shape;
  }
  const mix = context.createGain();
  chain.connect(mix);
  if (reverb && spaceMix > 0) {
    const convolver = context.createConvolver();
    convolver.normalize = false;
    convolver.buffer = impulse(
      context,
      spaceDecay,
      reverb.predelay ?? 0.01,
      reverb.damp ?? 6500,
      recipe.seed ?? 1,
    );
    const wet = context.createGain();
    wet.gain.value = spaceMix * 2.2;
    if (reverb.lowcut) {
      const lowcut = context.createBiquadFilter();
      lowcut.type = 'highpass';
      lowcut.frequency.value = reverb.lowcut;
      lowcut.Q.value = 0.5;
      chain.connect(lowcut);
      lowcut.connect(convolver);
    } else {
      chain.connect(convolver);
    }
    convolver.connect(wet);
    wet.connect(mix);
  }
  if (recipe.echo) {
    const delay = context.createDelay(4);
    delay.delayTime.value = recipe.echo.time * t.length;
    const feedback = context.createGain();
    feedback.gain.value = clamp(recipe.echo.feedback, 0, 0.92);
    const damp = context.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = recipe.echo.damp ?? 4200;
    const wet = context.createGain();
    wet.gain.value = recipe.echo.mix;
    chain.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    damp.connect(wet);
    wet.connect(mix);
  }
  mix.connect(context.destination);
  const rendered = await context.startRendering();
  const { buffer, length } = finish(rendered, recipe, t);
  return applyEffects(trimmed(buffer, length), t, recipe.seed ?? 1);
}
