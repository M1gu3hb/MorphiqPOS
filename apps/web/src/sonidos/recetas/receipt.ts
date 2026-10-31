/*
 * Receta «Receipt» de React Bits · Sound Lab (DavidHDev/react-bits, commit e12c221). Licencia MIT +
 * Commons Clause: `licencias/react-bits-sound-lab.md`. Se sintetiza con Web Audio: sin archivos.
 */
import type { Recipe } from '../motor/tipos';

const receipt: Recipe = {
  duration: 0.1,
  seed: 236,
  loudness: -23,
  lowpass: 8000,
  reverb: { mix: 0.06, decay: 0.2, predelay: 0.01, damp: 5000 },
  layers: [
    {
      type: 'tone',
      freq: 1760,
      at: 0,
      gain: 0,
      partials: [
        [1, 1, 1],
        [2.76, 0.048, 0.4],
        [5.4, 0.012, 0.22],
      ],
      env: { attack: 0.0025, decay: 0.03, curve: 6 },
    },
    {
      type: 'tone',
      freq: 1760,
      at: 0.045,
      gain: -2,
      partials: [
        [1, 1, 1],
        [2.76, 0.048, 0.4],
        [5.4, 0.012, 0.22],
      ],
      env: { attack: 0.0025, decay: 0.04, curve: 6 },
    },
  ],
};

export default receipt;
