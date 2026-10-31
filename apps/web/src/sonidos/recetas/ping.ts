/*
 * Receta «Ping» de React Bits · Sound Lab (DavidHDev/react-bits, commit e12c221). Licencia MIT +
 * Commons Clause: `licencias/react-bits-sound-lab.md`. Se sintetiza con Web Audio: sin archivos.
 */
import type { Recipe } from '../motor/tipos';

const ping: Recipe = {
  duration: 1.2,
  seed: 53,
  loudness: -17,
  lowpass: 8000,
  reverb: { mix: 0.2, decay: 1.2, predelay: 0.01, damp: 6000 },
  layers: [
    {
      type: 'tone',
      freq: 880,
      at: 0,
      gain: 0,
      partials: [
        [1, 1, 1],
        [2, 0.128, 0.55],
        [3, 0.032, 0.35],
      ],
      env: { attack: 0.004, decay: 1.1, curve: 6 },
    },
  ],
};

export default ping;
