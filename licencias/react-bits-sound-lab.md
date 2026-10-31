# React Bits · Sound Lab

- **Origen:** `DavidHDev/react-bits`, carpeta `src/tools/sound-lab` y el registro
  `https://reactbits.dev/r/Sound*-TS.json`, commit `e12c22192ac7b4b452c5e2feb9b586d74765d696`
  (DP-11.3, 30-10-2026).
- **Qué entró:** el motor de Web Audio (`react-bits-sound.ts`, partido en módulos de menos de 300
  líneas sin cambiar lo que calcula; sólo se guardaron las lecturas por índice que el TypeScript
  estricto del repositorio exige) y 25 recetas: Arrive, Bead, Boop, Check, Clasp, Confetti, Dawn,
  Dispatch, Dusk, Felt, Fold, Halo, Hint, Keycap, Nib, Notch, Pebble, Ping, Popover, Receipt,
  Retreat, Shrug, Signal, Thock y Unclasp. Se sintetizan en el navegador: no hay archivos de
  audio y suenan sin internet.
- **Lo que permite:** usarlos dentro del producto, también de forma comercial.
- **Lo que no:** venderlos, sublicenciarlos o redistribuirlos sueltos (los componentes, la
  herramienta o los sonidos, solos, en un paquete o portados), ni ofrecer la herramienta como
  servicio. Por eso viven dentro de la aplicación y no se publican como paquete aparte.

## Texto de la licencia (tal cual, del commit de arriba)

MIT + Commons Clause License Condition v1.0

Copyright (c) 2026 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software **as part of an application, website, or product**, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

## Commons Clause Restriction

You may use this Software, including for any commercial purpose, **so long as you do not sell, sublicense, or redistribute the components themselves-whether alone, in a bundle, or as a ported version.**

The same restriction covers the React Bits tools (Background Studio, Texture Lab, Shape Magic, Center Stage, Sound Lab and any tools added later) and the sounds in the sound library. **You may not sell, sublicense, or redistribute the tools or the sounds themselves, or offer the tools or a substantially similar copy of them as a hosted service-whether alone, in a bundle, or as a ported version.**

What you make with the tools is yours to use. You can use exported code, images, videos, and audio files in any personal or commercial application, website, or product, including paid ones. **You may not sell or redistribute the exports on their own, either individually or as the product itself, such as a sound, texture, background, or template pack.**

## No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
