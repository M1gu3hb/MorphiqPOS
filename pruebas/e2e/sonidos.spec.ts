import { expect, test, type Page } from '@playwright/test';

import { abrirLaMesa, armarElPedido, botonDeLaMesa, CARTA } from './ayudantes/mesas-heredadas.ts';
import { Equipo, opcionesDelProyecto } from './ayudantes/roles.ts';
import {
  abrirConReloj,
  cancelarLaCuentaDeLaMesa,
  escribir,
  espera,
  experiencia,
  pinDe,
  resetearLaDemo,
  SLUG,
} from './ayudantes/modo-espera.ts';
import { entradaDe, exigirDemostracion } from './ayudantes/sesion.ts';

/**
 * DP-11.3 · LOS SONIDOS DE LA INTERFAZ: un solo gestor, con el perfil de cada aparato (Apagado,
 * Suave, Normal) y lo del negocio (el sonido del teclado). Lo que sonó la última vez queda en
 * `data-ultimo-sonido` del documento, así que se prueba sin tarjeta de audio: el sonido se decide
 * al tocar; sintetizarlo y oírlo es del navegador. Corre en serie (`--workers=1`): cambia la
 * configuración del negocio de prueba y la deja como estaba.
 */

/** Una mesa de «Interior», la zona con la que abre el mapa. */
const MESA_DEL_SALON = 1;

async function sono(page: Page, receta: string): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-ultimo-sonido', receta);
}

async function olvidarLoQueSono(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.removeAttribute('data-ultimo-sonido');
  });
}

async function perfil(page: Page, nombre: 'Apagado' | 'Suave' | 'Normal'): Promise<void> {
  await page.goto('/configuracion?tab=aparato');
  await page.getByRole('radio', { name: nombre }).click();
  await expect(page.getByRole('radio', { name: nombre })).toHaveAttribute('aria-checked', 'true');
}

test.describe('los sonidos de la interfaz', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  // Lo de omisión en cada prueba: el teclado en Nib, sin PIN al despertar, y este aparato en
  // «Suave» (lo guardado en el navegador se borra).
  test.beforeEach(async ({ browser }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await experiencia(duena, { pin_al_despertar: false });
    await escribir(duena, '/api/datos/escribir', {
      entidad: 'ConfiguracionNegocio',
      operacion: 'update',
      datos: { experiencia: { tecla: 'nib' } },
    });
    await duena.goto('/configuracion?tab=aparato');
    await duena.evaluate(() => {
      window.localStorage.removeItem('morphiqpos.sonidos');
    });
  });

  test('«Suave» por omisión: una pestaña suena a Notch y un interruptor a Clasp y Unclasp', async ({
    browser,
  }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await duena.goto('/configuracion?tab=aparato');
    await duena.getByRole('tab', { name: 'Sonidos' }).click();
    await sono(duena, 'notch');

    await duena.getByRole('tab', { name: 'Este aparato' }).click();
    const interruptor = duena.getByRole('switch', { name: /Modo espera en este aparato/ });
    await interruptor.click();
    await sono(duena, 'unclasp');
    await interruptor.click();
    await sono(duena, 'clasp');
  });

  test('un diálogo que se abre suena a Popover y al cerrarse a Fold', async ({ browser }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await duena.goto('/inventario');
    await duena.getByTitle('Cargar inventario que ya tenías antes de usar el POS').click();
    await expect(
      duena.getByRole('dialog', { name: /Registrar inventario existente/ }),
    ).toBeVisible();
    await sono(duena, 'popover');
    await duena.keyboard.press('Escape');
    await expect(duena.getByRole('dialog', { name: /Registrar inventario existente/ })).toHaveCount(
      0,
    );
    await sono(duena, 'fold');
  });

  test('en «Apagado» no suena nada; «Oír» sí, para poder escuchar el mapa', async ({
    browser,
  }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await perfil(duena, 'Apagado');
    await olvidarLoQueSono(duena);
    await duena.getByRole('tab', { name: 'Sonidos' }).click();
    await expect(duena.getByRole('tab', { name: 'Sonidos' })).toHaveAttribute(
      'data-state',
      'active',
    );
    await expect(duena.locator('html')).not.toHaveAttribute('data-ultimo-sonido', /.+/);

    await duena.getByRole('button', { name: 'Oír Thock' }).click();
    await sono(duena, 'thock');
    await duena.getByRole('button', { name: 'Oír: Cobro hecho' }).click();
    await sono(duena, 'halo');
  });

  test('el teclado del PIN suena con el sonido que eligió el negocio', async ({
    browser,
  }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await duena.goto('/configuracion?tab=sonidos');
    await duena.getByRole('radio', { name: 'Keycap' }).click();
    await expect(duena.getByRole('radio', { name: 'Keycap' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await experiencia(duena, { pin_al_despertar: true });
    try {
      await abrirConReloj(duena, '/inventario');
      await duena.clock.fastForward('03:10');
      await espera(duena).click();
      await expect(espera(duena)).toHaveAttribute('data-modo-espera', 'despertando');
      await espera(duena).click();
      await expect(pinDe(duena)).toBeVisible();
      await pinDe(duena).getByRole('button', { name: '1', exact: true }).click();
      await sono(duena, 'keycap');
    } finally {
      await experiencia(duena, { pin_al_despertar: false });
    }
  });

  test('el mesero: agregar un platillo suena a Pebble y enviarlo a cocina a Dispatch', async ({
    browser,
  }, info) => {
    // La dueña ve todas las mesas en «Mesas y pedidos»; un mesero, sólo las que tiene asignadas.
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await resetearLaDemo(duena);
    try {
      await duena.goto('/mesero');
      await abrirLaMesa(duena, duena, MESA_DEL_SALON, 2);
      await armarElPedido(duena, MESA_DEL_SALON, [{ nombre: CARTA.guacamole.nombre, veces: 1 }]);
      await sono(duena, 'pebble');
      await (await botonDeLaMesa(duena, MESA_DEL_SALON, 'Enviar a Cocina')).click();
      await expect(duena.getByText('¡Pedido enviado a cocina!').first()).toBeVisible({
        timeout: 30_000,
      });
      await sono(duena, 'dispatch');
    } finally {
      await cancelarLaCuentaDeLaMesa(duena, MESA_DEL_SALON);
    }
  });

  test('el primer aviso de error de la pantalla suena a Shrug (la lista de avisos llega con él)', async ({
    browser,
  }, info) => {
    // Sin sesión: la entrada con PIN. Teclear el PIN sin tocar un nombre es un aviso de error que
    // no llega al servidor (no gasta intentos), y es el primero de la pantalla.
    const contexto = await browser.newContext(opcionesDelProyecto(info));
    const entrada = await contexto.newPage();
    try {
      await entrada.goto(entradaDe(SLUG));
      const teclado = entrada.locator('[data-sonido="tecla"]');
      for (const digito of ['1', '2', '3', '4'])
        await teclado.getByRole('button', { name: digito, exact: true }).click();
      await expect(entrada.getByText('Toca tu nombre para entrar')).toBeVisible();
      await sono(entrada, 'shrug');
    } finally {
      await contexto.close();
    }
  });

  test('un botón cualquiera, el toque de siempre (Felt)', async ({ browser }, info) => {
    test.skip(
      info.project.name !== 'escritorio',
      'el botón «Colapsar» del menú sólo está en la PC',
    );
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await duena.goto('/inventario');
    await duena.getByRole('button', { name: 'Colapsar' }).click();
    await sono(duena, 'felt');
  });
});
