/*
 * Receta «Nib» de React Bits · Sound Lab (DavidHDev/react-bits, commit e12c221). Licencia MIT +
 * Commons Clause: `licencias/react-bits-sound-lab.md`. Se sintetiza con Web Audio: sin archivos.
 */
import type { Recipe } from '../motor/tipos';

const nib: Recipe = {
  duration: 0.08,
  seed: 13,
  loudness: -21,
  lowpass: 8000,
  reverb: { mix: 0.06, decay: 0.18, predelay: 0.01, damp: 5000 },
  layers: [
    {
      type: 'tone',
      freq: { from: 1240, to: 980, time: 0.008, curve: 3 },
      at: 0,
      gain: 0,
      env: { attack: 0.0015, decay: 0.028, curve: 6 },
    },
    {
      type: 'tone',
      freq: { from: 620, to: 560, time: 0.006, curve: 3 },
      at: 0,
      gain: -15,
      env: { attack: 0.0015, decay: 0.02, curve: 6 },
    },
  ],
};

export default nib;
