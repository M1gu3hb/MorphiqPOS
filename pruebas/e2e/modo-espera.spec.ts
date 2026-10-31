import { expect, test } from '@playwright/test';

import { Equipo } from './ayudantes/roles.ts';
import {
  abrirConReloj,
  cancelarLaCuentaDeLaMesa,
  comandaNueva,
  decidio,
  escribir,
  espera,
  experiencia,
  resetearLaDemo,
  SLUG,
} from './ayudantes/modo-espera.ts';
import { exigirDemostracion } from './ayudantes/sesion.ts';

/**
 * DP-11.2 · EL MODO ESPERA: tras N minutos sin tocar, la pantalla se oscurece con la hora y Morfi
 * dormido; al tocarla, Morfi despierta y la pantalla vuelve tal cual estaba.
 *
 * El reloj de la página lo maneja Playwright (`page.clock`): tres minutos sin tocar pasan en un
 * instante y sin esperar de verdad. Sí en Caja, Tablero, Cocina y administración; nunca en el
 * mesero. En Cocina, con comandas pendientes no se duerme, y una comanda nueva la despierta. El
 * PIN al despertar está en `modo-espera-pin.spec.ts`. Corre en serie (`--workers=1`): cambia la
 * configuración del negocio de prueba y la deja como estaba.
 */

test.describe('el modo espera', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  // Lo de omisión en cada prueba, por si otra suite (o una que falló) lo dejó distinto: Morfi
  // encendido y sin PIN al despertar.
  test.beforeEach(async ({ browser }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await experiencia(duena, { pin_al_despertar: false });
  });

  test('Caja: a los 3 minutos sin tocar, no antes; la hora y Morfi dormido', async ({
    browser,
  }, info) => {
    const caja = await new Equipo(browser, SLUG).pagina(info, 'cajero');
    await abrirConReloj(caja, '/caja');

    await caja.clock.fastForward('02:50');
    await decidio(caja, 'despierta');
    await expect(espera(caja)).toHaveCount(0);
    await caja.clock.fastForward('00:15');
    await expect(espera(caja)).toBeVisible();
    await expect(
      espera(caja)
        .getByText(/\d{1,2}:\d{2}/)
        .first(),
    ).toBeVisible();
    await expect(espera(caja).locator('[data-morfi]')).toHaveCount(1);
  });

  test('Caja: una cuenta pedida la despierta', async ({ browser }, info) => {
    const equipo = new Equipo(browser, SLUG);
    const duena = await equipo.pagina(info, 'dueno');
    const caja = await equipo.pagina(info, 'cajero');
    await cancelarLaCuentaDeLaMesa(duena);
    try {
      await abrirConReloj(caja, '/caja');
      await caja.clock.fastForward('03:10');
      await expect(espera(caja)).toBeVisible();

      const ordenId = await comandaNueva(duena);
      await escribir(duena, '/api/restaurante/solicitar-cuenta', { ordenId });
      // La caja lee cada 2 s: con el reloj detenido, se le dan unas vueltas.
      await caja.clock.runFor(6_000);
      await expect(espera(caja)).toHaveCount(0);
    } finally {
      await cancelarLaCuentaDeLaMesa(duena);
    }
  });

  test('Mesero: nunca, aunque pasen diez minutos', async ({ browser }, info) => {
    const mesero = await new Equipo(browser, SLUG).pagina(info, 'mesero');
    await abrirConReloj(mesero, '/mesero');
    await mesero.clock.fastForward('10:00');
    await decidio(mesero, 'fuera');
    await expect(espera(mesero)).toHaveCount(0);
  });

  test('al cambiar de pantalla, la espera de la anterior no se queda guardada', async ({
    browser,
  }, info) => {
    test.skip(info.project.name !== 'escritorio', 'el menú lateral sólo se ve en la PC');
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await abrirConReloj(duena, '/mesero');
    await duena.getByRole('link', { name: 'Inventario' }).click();
    await expect(duena.getByRole('heading', { level: 1, name: 'Inventario' })).toBeVisible();
    await duena.clock.fastForward('03:10');
    await expect(espera(duena)).toBeVisible();

    // Atrás (el gesto o el botón del navegador) al mesero, donde no hay espera, y adelante otra vez.
    await duena.evaluate(() => {
      history.back();
    });
    await decidio(duena, 'fuera');
    await duena.evaluate(() => {
      history.forward();
    });
    await expect(duena.getByRole('heading', { level: 1, name: 'Inventario' })).toBeVisible();
    await expect(espera(duena)).toHaveCount(0);
  });

  test('Cocina: una comanda nueva la despierta, y con pendientes no se vuelve a dormir', async ({
    browser,
  }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await resetearLaDemo(duena);
    await cancelarLaCuentaDeLaMesa(duena);
    try {
      await abrirConReloj(duena, '/cocina');
      await duena.clock.fastForward('02:10');
      await expect(espera(duena)).toBeVisible();

      await comandaNueva(duena);
      // La cocina lee cada 2 s: con el reloj detenido, se le dan unas vueltas.
      await duena.clock.runFor(6_000);
      await expect(espera(duena)).toHaveCount(0);

      await duena.clock.fastForward('05:00');
      await decidio(duena, 'bloqueada');
      await expect(espera(duena)).toHaveCount(0);
    } finally {
      await cancelarLaCuentaDeLaMesa(duena);
    }
  });

  test('vuelve con lo tecleado; el despertar se puede saltar', async ({ browser }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await abrirConReloj(duena, '/inventario');
    const buscar = duena.getByPlaceholder('Buscar ingrediente...');
    await buscar.fill('tomate');

    await duena.clock.fastForward('03:10');
    await expect(espera(duena)).toBeVisible();
    await espera(duena).click();
    await expect(espera(duena)).toHaveAttribute('data-modo-espera', 'despertando');
    // El clip de despertar dura casi 3 s: si el segundo toque no lo saltara, la capa seguiría.
    await espera(duena).click();
    await expect(espera(duena)).toHaveCount(0, { timeout: 1_000 });
    await expect(buscar).toHaveValue('tomate');
  });

  test('con «reducir movimiento», Morfi duerme en su imagen fija; una tecla la despierta y no cae abajo', async ({
    browser,
  }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await duena.emulateMedia({ reducedMotion: 'reduce' });
    await abrirConReloj(duena, '/inventario');
    const buscar = duena.getByPlaceholder('Buscar ingrediente...');
    await buscar.fill('tomate');
    await duena.clock.fastForward('03:10');
    await expect(espera(duena).locator('img[data-morfi="fijo"]')).toBeVisible();
    // Al irse la capa el foco vuelve al buscador: la letra que la despertó no se le escribe.
    await duena.keyboard.press('x');
    await expect(espera(duena)).toHaveCount(0);
    await expect(buscar).toHaveValue('tomate');
  });

  test('Este aparato: apagado, no se duerme; los minutos son del aparato', async ({
    browser,
  }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await duena.goto('/configuracion?tab=aparato');
    await duena.getByRole('combobox', { name: /Minutos sin tocar/ }).selectOption('1');
    await abrirConReloj(duena, '/inventario');
    await duena.clock.fastForward('01:10');
    await expect(espera(duena)).toBeVisible();
    await espera(duena).click();
    await expect(espera(duena)).toHaveAttribute('data-modo-espera', 'despertando');
    await espera(duena).click();
    await expect(espera(duena)).toHaveCount(0);

    await duena.goto('/configuracion?tab=aparato');
    await duena.getByRole('switch', { name: /Modo espera en este aparato/ }).click();
    await duena.goto('/inventario');
    await expect(duena.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await duena.clock.fastForward('10:00');
    await decidio(duena, 'apagado');
    await expect(espera(duena)).toHaveCount(0);
    await duena.evaluate(() => {
      window.localStorage.removeItem('morphiqpos.modo-espera');
    });
  });

  test('un diálogo abierto debajo no la tapa, y despertarla no lo cierra', async ({
    browser,
  }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await abrirConReloj(duena, '/inventario');
    await duena.getByTitle('Cargar inventario que ya tenías antes de usar el POS').click();
    const debajo = duena.getByRole('dialog', { name: /Registrar inventario existente/ });
    await expect(debajo).toBeVisible();

    // Espías donde escuchan los atajos de la ventana (F12 cobra) y el diálogo de abajo, que se
    // cierra si ve el foco, un toque o Escape fuera de él: con la capa arriba no les llega nada.
    await duena.evaluate(() => {
      const ventana = window as unknown as { __afuera: Record<string, number> };
      ventana.__afuera = { keydown: 0, pointerdown: 0, focusin: 0 };
      window.addEventListener('keydown', () => {
        ventana.__afuera['keydown'] = (ventana.__afuera['keydown'] ?? 0) + 1;
      });
      for (const tipo of ['pointerdown', 'focusin'])
        document.addEventListener(tipo, () => {
          ventana.__afuera[tipo] = (ventana.__afuera[tipo] ?? 0) + 1;
        });
    });
    const afuera = () =>
      duena.evaluate(() => (window as unknown as { __afuera: Record<string, number> }).__afuera);

    await duena.clock.fastForward('03:10');
    await expect(espera(duena)).toBeVisible();
    // Escape despierta la espera y no llega al diálogo de abajo (que se cerraría con él).
    await duena.keyboard.press('Escape');
    await expect(espera(duena)).toHaveAttribute('data-modo-espera', 'despertando');
    expect(await afuera()).toEqual({ keydown: 0, pointerdown: 0, focusin: 0 });
    await espera(duena).click();
    await expect(espera(duena)).toHaveCount(0);
    // Al irse la capa, el foco vuelve al diálogo de abajo (ese `focusin` sí cuenta); el dedo no.
    expect((await afuera())['pointerdown']).toBe(0);
    await expect(debajo).toBeVisible();
  });

  test('un toque la despierta sin caer en el botón de abajo', async ({ browser }, info) => {
    test.skip(info.project.use.hasTouch !== true, 'sólo en los aparatos táctiles');
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await abrirConReloj(duena, '/inventario');
    const boton = duena.getByTitle('Cargar inventario que ya tenías antes de usar el POS');
    const caja = await boton.boundingBox();
    expect(caja, 'el botón de abajo tiene que verse').not.toBeNull();
    const x = (caja?.x ?? 0) + (caja?.width ?? 0) / 2;
    const y = (caja?.y ?? 0) + (caja?.height ?? 0) / 2;

    await duena.clock.fastForward('03:10');
    await expect(espera(duena)).toBeVisible();
    await duena.touchscreen.tap(x, y);
    await expect(espera(duena)).toHaveAttribute('data-modo-espera', 'despertando');
    await duena.touchscreen.tap(x, y);
    await expect(espera(duena)).toHaveCount(0);
    await expect(duena.getByRole('dialog', { name: /Registrar inventario existente/ })).toHaveCount(
      0,
    );
  });
});
