import { expect, test } from '@playwright/test';

import { DUENO_DE_DEMO } from '../../packages/contracts/src/negocios/equipo-demo.ts';
import { Equipo, personaDe } from './ayudantes/roles.ts';
import {
  abrirConReloj,
  cancelarLaCuentaDeLaMesa,
  comandaNueva,
  escribir,
  espera,
  experiencia,
  focoFueraDeLaCapa,
  pinDe,
  SLUG,
} from './ayudantes/modo-espera.ts';
import { entrar, exigirDemostracion } from './ayudantes/sesion.ts';

/**
 * DP-11.2 · «PEDIR PIN AL DESPERTAR»: quien tiene la sesión teclea su PIN para volver, y el
 * candado no se quita con el teclado, recargando, con Escape ni porque el navegador cierre la
 * capa; sí con el PIN, al entrar con PIN y al cerrar la sesión. Corre en serie (`--workers=1`):
 * enciende y apaga el PIN del negocio de prueba.
 */

test.describe('el PIN al despertar', () => {
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

  test('con la caja dormida, el PIN que se enciende en otro aparato vale al despertar', async ({
    browser,
  }, info) => {
    const equipo = new Equipo(browser, SLUG);
    const duena = await equipo.pagina(info, 'dueno');
    const caja = await equipo.pagina(info, 'cajero');
    await abrirConReloj(caja, '/caja');
    await caja.clock.fastForward('03:10');
    await expect(espera(caja)).toBeVisible();

    await experiencia(duena, { pin_al_despertar: true });
    try {
      // Mientras duerme vuelve a leer la configuración cada minuto.
      const relectura = caja.waitForResponse(
        (r) =>
          r.url().endsWith('/api/datos/consultar') &&
          (r.request().postData() ?? '').includes('ConfiguracionNegocio'),
      );
      await caja.clock.runFor(61_000);
      await relectura;
      await espera(caja).click();
      await expect(espera(caja)).toHaveAttribute('data-modo-espera', 'despertando');
      await espera(caja).click();
      await expect(pinDe(caja)).toBeVisible();
    } finally {
      await experiencia(duena, { pin_al_despertar: false });
    }
  });

  test('«Pedir PIN al despertar»: sin el PIN no vuelve, ni con el teclado ni recargando', async ({
    browser,
  }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await experiencia(duena, { pin_al_despertar: true });
    try {
      await abrirConReloj(duena, '/inventario');
      await duena.getByPlaceholder('Buscar ingrediente...').fill('cebolla');
      await duena.clock.fastForward('03:10');
      await espera(duena).click();
      await expect(espera(duena)).toHaveAttribute('data-modo-espera', 'despertando');
      await espera(duena).click();

      const pin = pinDe(duena);
      await expect(pin).toBeVisible();
      // Ni Escape dos veces ni que el navegador cierre el diálogo (el gesto Atrás de Android)
      // quitan la pantalla del PIN.
      await duena.keyboard.press('Escape');
      await duena.keyboard.press('Escape');
      await expect(pin).toBeVisible();
      await pin.evaluate((dialogo) => {
        (dialogo as HTMLDialogElement).close();
      });
      await expect(pin).toBeVisible();
      await expect(pin).toHaveJSProperty('open', true);
      // El Tab no sale de la capa: nada de la pantalla de abajo se alcanza.
      for (let vuelta = 0; vuelta < 15; vuelta += 1) {
        await duena.keyboard.press('Tab');
        expect(await focoFueraDeLaCapa(duena), `Tab número ${String(vuelta + 1)}`).toBe(false);
      }
      // Un PIN equivocado, con el teclado físico: no vuelve y lo dice.
      await duena.keyboard.type('9999');
      await expect(pin.getByRole('alert')).toBeVisible();
      await expect(pin).toBeVisible();
      for (const digito of DUENO_DE_DEMO.pin) {
        await pin.getByRole('button', { name: digito, exact: true }).click();
      }
      await expect(pin).toHaveCount(0);
      await expect(duena.getByPlaceholder('Buscar ingrediente...')).toHaveValue('cebolla');

      // Otra vez dormida y con el PIN a la vista: recargar no quita el candado.
      await duena.clock.fastForward('03:10');
      await espera(duena).click();
      await expect(espera(duena)).toHaveAttribute('data-modo-espera', 'despertando');
      await espera(duena).click();
      await expect(pinDe(duena)).toBeVisible();
      await duena.reload();
      await expect(pinDe(duena)).toBeVisible();
      await duena.keyboard.type(DUENO_DE_DEMO.pin);
      await expect(pinDe(duena)).toHaveCount(0);
    } finally {
      await experiencia(duena, { pin_al_despertar: false });
    }
  });

  test('con el PIN, una cuenta pedida despierta al PIN y no a la caja', async ({
    browser,
  }, info) => {
    const equipo = new Equipo(browser, SLUG);
    const duena = await equipo.pagina(info, 'dueno');
    const caja = await equipo.pagina(info, 'cajero');
    await cancelarLaCuentaDeLaMesa(duena);
    await experiencia(duena, { pin_al_despertar: true });
    try {
      await abrirConReloj(caja, '/caja');
      await caja.clock.fastForward('03:10');
      await expect(espera(caja)).toBeVisible();

      const ordenId = await comandaNueva(duena);
      await escribir(duena, '/api/restaurante/solicitar-cuenta', { ordenId });
      // La caja lee cada 2 s: con el reloj detenido, se le dan unas vueltas.
      await caja.clock.runFor(6_000);
      await expect(pinDe(caja)).toBeVisible();
      await expect(espera(caja)).toHaveCount(0);

      // Si nadie teclea, la pantalla del PIN vuelve a dormirse a los 30 s.
      await caja.clock.fastForward('00:35');
      await expect(espera(caja)).toBeVisible();
      await espera(caja).click();
      await expect(espera(caja)).toHaveAttribute('data-modo-espera', 'despertando');
      await espera(caja).click();
      await expect(pinDe(caja)).toBeVisible();

      // «Cambiar de persona» cierra la sesión y lleva a la entrada.
      const empleo = await caja.evaluate(() => localStorage.getItem('morphiqpos.candado-del-pin'));
      expect(empleo, 'el candado se puso al dormirse con el PIN').not.toBeNull();
      await pinDe(caja).getByRole('button', { name: 'Cambiar de persona' }).click();
      await expect(caja).toHaveURL(/login-pos/);
      expect(
        await caja.evaluate(() => localStorage.getItem('morphiqpos.candado-del-pin')),
        'cerrar la sesión quita el candado',
      ).toBeNull();

      // Un candado viejo de la misma persona (su sesión venció con el PIN a la vista) se quita al
      // entrar con su PIN: no se le vuelve a pedir nada más entrar.
      await caja.evaluate((id) => {
        localStorage.setItem('morphiqpos.candado-del-pin', id ?? '');
      }, empleo);
      await entrar(caja, personaDe(SLUG, 'cajero'));
      await caja.goto('/caja');
      await expect(caja.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(pinDe(caja)).toHaveCount(0);
    } finally {
      await cancelarLaCuentaDeLaMesa(duena);
      await experiencia(duena, { pin_al_despertar: false });
    }
  });
});
