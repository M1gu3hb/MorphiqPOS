import { expect, test } from '@playwright/test';

/**
 * El sistema de diseno, probado como lo va a usar Miguel delante de un cliente.
 *
 * Cubre `F1.0-P5` (contraste AA) en el navegador real y la revision a 100 %,
 * 125 % y 200 % de zoom que pide `05-SISTEMA-DE-DISENO §8` — que hasta ahora
 * era una revision manual, o sea, una que se deja de hacer.
 */

test.describe('la pagina de estilos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/estilos');
  });

  // Si la CSP bloquea los scripts, la pagina se ve bien y no responde. Esta
  // prueba existe porque eso paso de verdad durante F1.0-T11.
  test('hidrata: cambiar de estilo cambia la pagina en vivo', async ({ page }) => {
    await expect(page.getByText('Estilo activo: premium')).toBeVisible();

    await page.getByRole('button', { name: 'Editorial' }).click();

    await expect(page.getByText('Estilo activo: editorial')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-estilo', 'editorial');
    // El estilo no es solo color: cambia la forma. Editorial usa redondeo sutil
    // y elevacion plana, premium usa amplia y doble-bisel.
    await expect(page.locator('html')).toHaveAttribute('data-redondeo', 'sutil');
    await expect(page.locator('html')).toHaveAttribute('data-elevacion', 'plana');
  });

  test('la perilla de densidad da la altura EXACTA de cada densidad', async ({ page }) => {
    const boton = page.getByRole('button', { name: 'Cobrar' });

    // Las alturas de `05-SISTEMA-DE-DISENO §4`: cómoda 48 px, normal 40 px,
    // compacta 32 px. Se afirman exactas y no solo "una menor que otra".
    //
    // La razón: la escala de espaciado de Tailwind está aliada a nuestros
    // tokens `--espacio-*`, que ya dependen de la densidad. Eso hace que un
    // `h-10` literal TAMBIÉN encoja, y una prueba de orden lo daría por bueno.
    // Con la altura exacta, solo pasa lo que sale de `--altura-control`.
    const esperado = [
      { densidad: 'comoda', alto: 48 },
      { densidad: 'normal', alto: 40 },
      { densidad: 'compacta', alto: 32 },
    ] as const;

    for (const caso of esperado) {
      await page.getByRole('button', { name: caso.densidad, exact: true }).first().click();
      await expect(page.locator('html')).toHaveAttribute('data-densidad', caso.densidad);

      const medido = (await boton.boundingBox())?.height ?? 0;
      expect(medido, `densidad ${caso.densidad}`).toBeCloseTo(caso.alto, 0);
    }
  });

  test('ningun par de contraste sale reprobado, en los 2 estilos x 2 modos', async ({ page }) => {
    for (const estilo of ['Premium', 'Editorial']) {
      await page.getByRole('button', { name: estilo }).click();

      for (const modo of ['claro', 'oscuro']) {
        await page.emulateMedia({ colorScheme: modo === 'oscuro' ? 'dark' : 'light' });

        // La tabla marca cada par como cumple / no cumple para lectores de
        // pantalla. Aqui se lee esa misma marca: si el color no es el unico
        // indicador de estado (§9), la prueba tampoco depende del color.
        const reprobados = page.getByText('no cumple', { exact: false });
        await expect(
          reprobados,
          `${estilo} en modo ${modo} tiene pares de contraste reprobados`,
        ).toHaveCount(0);
      }
    }
  });

  test('el contenido sobrevive al zoom de 100 %, 125 % y 200 % (§8)', async ({ page }) => {
    for (const zoom of [1, 1.25, 2]) {
      await page.setViewportSize({
        width: Math.round(1280 / zoom),
        height: Math.round(800 / zoom),
      });

      // Nada de desbordamiento horizontal: en un POS eso esconde el total.
      const desborda = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(desborda, `hay desbordamiento horizontal al ${zoom * 100} %`).toBe(false);

      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });

  test('se puede operar con teclado y el foco siempre se ve', async ({ page }) => {
    // Se recorren varios controles, no solo el primero: el agujero tipico es
    // que el foco se vea en los botones y desaparezca en los campos.
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');

      const foco = await page.evaluate(() => {
        const activo = document.activeElement;
        if (!activo || activo === document.body) return null;
        const estilo = getComputedStyle(activo);

        return {
          etiqueta: `${activo.tagName}.${activo.className.slice(0, 24)}`,
          // Dos mecanismos validos, y hay que aceptar los dos:
          //   · outline, que es lo que pone la regla global del sistema;
          //   · box-shadow, que es como shadcn dibuja su anillo (usa
          //     `outline-hidden` y `focus-visible:ring`).
          // Exigir solo outline haria fallar a toda primitiva adoptada, y la
          // reaccion seria bajar la prueba en vez de arreglar nada.
          outline: Number.parseFloat(estilo.outlineWidth) > 0 && estilo.outlineStyle !== 'none',
          anillo: estilo.boxShadow !== 'none' && estilo.boxShadow.length > 0,
        };
      });

      expect(
        foco,
        `el paso ${i + 1} de tabulacion no dejo el foco en ningun control`,
      ).not.toBeNull();
      expect(
        (foco?.outline ?? false) || (foco?.anillo ?? false),
        `el control enfocado "${foco?.etiqueta ?? '?'}" no muestra indicador de foco`,
      ).toBe(true);
    }
  });
});
