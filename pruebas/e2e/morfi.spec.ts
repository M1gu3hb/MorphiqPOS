import { expect, test, type Page } from '@playwright/test';

import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  consultarPuente,
  exigirDemostracion,
} from './ayudantes/sesion.ts';

/**
 * DP-11.1 · MORFI EN EL POS: la página que no existe (la de la aplicación y la del portal QR) y
 * la carga larga de una pantalla entera, con «Mascota Morfi» encendida y apagada.
 *
 * Morfi es un clip: en Chromium, WebM con transparencia que se REPRODUCE; con «reducir
 * movimiento», su imagen fija; en Safari (y en todo el iPhone), el WebP animado. Se cierra con un
 * toque. Lo que se lee es siempre texto real.
 *
 * La suite apaga la mascota del negocio de prueba: corre en serie (`--workers=1`) y la deja
 * encendida al terminar.
 */

const SLUG = 'demo-acople-restaurante';
const NO_EXISTE = '/esta-pagina-no-existe-dp11';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';

async function ponerLaMascota(duena: Page, encendida: boolean): Promise<void> {
  const respuesta = await duena.request.post('/api/datos/escribir', {
    headers: cabecerasDeEscrituraDePrueba(),
    data: {
      entidad: 'ConfiguracionNegocio',
      operacion: 'update',
      datos: { experiencia: { mascota: encendida } },
    },
  });
  expect(respuesta.status(), (await respuesta.text()).slice(0, 300)).toBe(200);
}

async function mascotaGuardada(duena: Page): Promise<unknown> {
  const [configuracion] = await consultarPuente<{ experiencia?: unknown }>(
    duena,
    'ConfiguracionNegocio',
    { limite: 1 },
  );
  return configuracion?.experiencia;
}

test.describe('Morfi en el POS', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('la página que no existe: Morfi se asoma por el hoyo, se mueve y se cierra con un toque', async ({
    page,
  }) => {
    const respuesta = await page.goto(NO_EXISTE);
    expect(respuesta?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible();
    await expect(page.getByText('Puede que la hayan movido o borrado.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir al inicio' })).toBeVisible();

    const morfi = page.locator('video[data-morfi="webm"]');
    await expect(morfi).toBeVisible();
    await expect
      .poll(() => morfi.evaluate((video: HTMLVideoElement) => video.currentTime), {
        message: 'El clip de Morfi no se está reproduciendo.',
      })
      .toBeGreaterThan(0.3);

    await page.getByRole('button', { name: 'Ocultar a Morfi' }).click();
    await expect(page.locator('[data-morfi]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ir al inicio' })).toBeVisible();
  });

  test('con «reducir movimiento», Morfi se queda en su imagen fija', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(NO_EXISTE);
    await expect(page.locator('img[data-morfi="fijo"]')).toBeVisible();
    await expect(page.locator('video[data-morfi]')).toHaveCount(0);
  });

  test('en el iPhone (WebKit, sin WebM con transparencia) va el WebP animado, y carga', async ({
    browser,
  }) => {
    const contexto = await browser.newContext({ userAgent: IPHONE });
    try {
      const pagina = await contexto.newPage();
      await pagina.goto(NO_EXISTE);
      const morfi = pagina.locator('img[data-morfi="webp"]');
      await expect(morfi).toBeVisible();
      await expect
        .poll(() => morfi.evaluate((imagen: HTMLImageElement) => imagen.naturalWidth))
        .toBeGreaterThan(0);
    } finally {
      await contexto.close();
    }
  });

  test('el portal: el QR que no lleva a ninguna mesa también es la página de Morfi', async ({
    page,
  }) => {
    await page.goto('/qr/un-codigo-que-no-existe-dp11');
    await expect(page.getByText('Mesa no encontrada')).toBeVisible();
    await expect(page.getByText('Llama a un mesero para que te ayude.')).toBeVisible();
    await expect(page.locator('[data-morfi]')).toHaveCount(1);
    // Sin botón: recargar el mismo QR no lo arregla; el texto dice qué hacer.
    await expect(page.getByRole('button', { name: 'Volver a intentar' })).toHaveCount(0);
  });

  test('la carga larga: nada antes de 600 ms; luego la tarjeta que dice qué carga, con Morfi', async ({
    browser,
  }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await duena.route('**/api/catalogo/sesion', async (ruta) => {
      await new Promise((listo) => {
        setTimeout(listo, 2500);
      });
      await ruta.continue();
    });
    await duena.goto('/caja', { waitUntil: 'commit' });

    const tarjeta = duena.getByRole('status').filter({ hasText: 'Cargando tu caja' });
    await tarjeta.waitFor({ state: 'attached' });
    const aparece = tarjeta.locator('.carga-aparece');
    expect(await aparece.evaluate((e) => getComputedStyle(e).animationDelay)).toBe('0.6s');
    // Sin depender del reloj de la máquina: la animación se pausa y se pone en un instante.
    const opacidadEn = (ms: number): Promise<string> =>
      aparece.evaluate((e, t) => {
        const animacion = e
          .getAnimations()
          .find((a) => (a as CSSAnimation).animationName === 'carga-aparece');
        if (animacion === undefined) return 'sin animación';
        animacion.pause();
        animacion.currentTime = t;
        return getComputedStyle(e).opacity;
      }, ms);
    expect(await opacidadEn(300)).toBe('0');
    expect(await opacidadEn(590)).toBe('0');
    await aparece.evaluate((e) => {
      for (const animacion of e.getAnimations()) animacion.play();
    });
    await expect.poll(() => aparece.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
    await expect(tarjeta.locator('[data-morfi]')).toHaveCount(1);
    // Que el manejador demorado termine aquí y no en la prueba siguiente.
    await duena.unrouteAll({ behavior: 'wait' });
  });

  /**
   * Con la sesión de la dueña: el servidor de pruebas sirve a DOS negocios, y sin sesión una
   * página no sabe de cuál es (se pinta con lo de omisión, como la apariencia). Producción sirve a
   * uno solo y ahí lo sabe también sin sesión.
   */
  test('con «Mascota Morfi» apagada cada lugar usa su versión sin mascota; se enciende en Apariencia', async ({
    browser,
  }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await ponerLaMascota(duena, false);
    try {
      await duena.goto(NO_EXISTE);
      await expect(duena.getByText('Esta página no existe')).toBeVisible();
      await expect(duena.getByRole('link', { name: 'Ir al inicio' })).toBeVisible();
      await expect(duena.locator('[data-morfi]')).toHaveCount(0);

      await duena.goto('/configuracion?tab=apariencia');
      const interruptor = duena.getByRole('switch', { name: /Mascota Morfi/ });
      await expect(interruptor).toBeVisible();
      // La pestaña cabe a lo ancho también en el teléfono (el fieldset de la voz la desbordaba).
      expect(
        await duena.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await expect(interruptor).not.toBeChecked();
      await interruptor.click();
      await expect(interruptor).toBeChecked();
      await expect.poll(() => mascotaGuardada(duena)).toEqual({ mascota: true });

      await duena.goto(NO_EXISTE);
      await expect(duena.locator('[data-morfi]')).toHaveCount(1);
    } finally {
      await ponerLaMascota(duena, true);
    }
  });
});
