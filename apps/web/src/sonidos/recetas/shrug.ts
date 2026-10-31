/*
 * Receta «Shrug» de React Bits · Sound Lab (DavidHDev/react-bits, commit e12c221). Licencia MIT +
 * Commons Clause: `licencias/react-bits-sound-lab.md`. Se sintetiza con Web Audio: sin archivos.
 */
import type { Recipe } from '../motor/tipos';

const shrug: Recipe = {
  duration: 0.55,
  seed: 43,
  loudness: -18,
  lowpass: 5500,
  reverb: { mix: 0.12, decay: 0.5, predelay: 0.01, damp: 4500 },
  layers: [
    {
      type: 'tone',
      freq: 659.26,
      at: 0,
      gain: 0,
      partials: [
        [1, 1, 1],
        [2, 0.096, 0.55],
        [3, 0.024, 0.35],
      ],
      env: { attack: 0.006, decay: 0.22, curve: 6 },
    },
    {
      type: 'tone',
      freq: 523.25,
      at: 0.12,
      gain: 0,
      partials: [
        [1, 1, 1],
        [2, 0.096, 0.55],
        [3, 0.024, 0.35],
      ],
      env: { attack: 0.006, decay: 0.32, curve: 6 },
    },
  ],
};

export default shrug;
