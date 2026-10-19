import { expect, test } from '@playwright/test';

import { textosIlegibles } from './ayudantes/estilos-del-rastreo.ts';

/**
 * LA MEDIDA DE CONTRASTE DEL RASTREADOR, vista fallar y aprobar.
 *
 * El rastreador la corre en cada pantalla de cada estilo; aquí se le da una página
 * inventada, sin servidor, para saber que PUEDE acusar —texto gris claro sobre blanco,
 * texto oscuro al 30 %— y que no acusa lo legible sobre un fondo teñido con `color-mix`,
 * que es como Tailwind 4 escribe `bg-x/15`.
 */

const PAGINA = (colorTexto: string, fondo: string, opacidad = 1) => `
<body style="background:#ffffff">
  <table style="background:${fondo}"><tbody><tr>
    <td style="color:${colorTexto}; opacity:${String(opacidad)}">Tornillo 1/4</td>
    <td><span data-dinero="" style="color:#111">$<span style="opacity:0.8">42</span></span></td>
  </tr></tbody></table>
</body>`;

test('la medida de contraste ve lo ilegible y deja pasar lo legible', async ({ page }) => {
  await page.setContent(PAGINA('#bbbbbb', '#ffffff'));
  const malo = await textosIlegibles(page);
  expect(malo.join(' | ')).toContain('Tornillo 1/4');

  await page.setContent(PAGINA('#222222', 'color-mix(in oklab, #1d4ed8 15%, transparent)'));
  expect(await textosIlegibles(page)).toEqual([]);

  // La opacidad cuenta: un texto oscuro al 30 % sobre blanco ya no se lee.
  await page.setContent(PAGINA('#222222', '#ffffff', 0.3));
  expect((await textosIlegibles(page)).join(' | ')).toContain('Tornillo 1/4');
});
