import { expect, type Page, test } from '@playwright/test';

import {
  abrirElQrDeLaMesa,
  avisosDeLaMesa,
  mesaEnElServidor,
  prepararElPortalDelComensal,
  type TelefonoDelComensal,
} from './ayudantes/mesas-heredadas.ts';
import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  exigirDemostracion,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * DP-9.3 · LA VISTA «SOLICITUDES» DENTRO DE MESAS.
 *
 * Arriba de las zonas, «Solicitudes» convierte la pantalla en la lista de pendientes; el aparato
 * la recuerda (sirve de estación). La voz de las solicitudes suena SÓLO ahí: en el plano se ven
 * los globos, callados. La caja no las ve ni en la pantalla ni en el servidor.
 *
 * La voz se escucha espiando `speechSynthesis.speak` antes de que cargue la página: lo que el
 * aparato habría dicho queda en `window.__voz`.
 */

const SLUG = 'demo-acople-restaurante';
const ZONA = 'Interior';

async function espiarLaVoz(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const dicho: string[] = [];
    Object.defineProperty(window, '__voz', { value: dicho });
    // La cola de voz del heredado espera el fin de cada frase para decir la siguiente: el espía
    // la termina enseguida, como un aparato que habla rápido.
    window.speechSynthesis.speak = (frase: SpeechSynthesisUtterance) => {
      dicho.push(frase.text);
      setTimeout(() => {
        frase.dispatchEvent(new Event('end'));
      }, 20);
    };
  });
}

function loQueDijo(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => [...((window as unknown as { __voz: string[] }).__voz ?? [])]);
}

async function pedirAyuda(telefono: Page): Promise<void> {
  await telefono.getByRole('button', { name: 'Atención' }).click();
  await telefono.getByRole('button', { name: 'Necesito ayuda' }).click();
  await expect(telefono.getByText('Solicitud enviada')).toBeVisible();
}

test.describe('la vista «Solicitudes» dentro de Mesas', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('la lista de pendientes es una estación con voz; el plano tiene globos sin voz; la caja no las ve', async ({
    browser,
  }, info) => {
    test.setTimeout(6 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const fallos: (() => void)[] = [];
    const telefonos: TelefonoDelComensal[] = [];

    try {
      const duena = await equipo.pagina(info, 'dueno');
      fallos.push(vigilarFallos(duena));
      const reseteo = await duena.request.post('/api/catalogo/demostracion/resetear', {
        headers: cabecerasDeEscrituraDePrueba(),
        data: { confirmacion: 'RESETEAR' },
      });
      expect(reseteo.status(), `resetear_demo: ${await reseteo.text()}`).toBe(200);
      const token6 = await prepararElPortalDelComensal(duena, {
        mesa: 6,
        zona: ZONA,
        mesero: null,
      });
      // La otra mesa, también de Interior (la zona que la pantalla enseña): su código ya existe.
      const token5 = (await mesaEnElServidor(duena, 5)).qrToken ?? '';

      const lupita = await equipo.pagina(info, 'mesero');
      fallos.push(vigilarFallos(lupita));
      await espiarLaVoz(lupita);
      await lupita.goto('/');
      await lupita.waitForURL(/\/mesero$/);

      await test.step('Lupita pasa a «Solicitudes»: la pantalla entera es la lista, y el aparato lo recuerda', async () => {
        await lupita.getByRole('button', { name: /^Solicitudes/ }).click();
        await expect(lupita.getByRole('button', { name: /^Solicitudes/ })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await expect(lupita.getByText('Sin solicitudes pendientes')).toBeVisible();
        await expect(lupita.getByRole('button', { name: new RegExp(`^${ZONA}`) })).toBeHidden();
        await lupita.reload();
        await expect(
          lupita.getByText('Sin solicitudes pendientes'),
          'Al recargar, el aparato no se quedó en «Solicitudes».',
        ).toBeVisible();
      });

      await test.step('la mesa 6 pide ayuda: aparece en la lista con hace cuánto, y la voz lo anuncia', async () => {
        const comensal = await abrirElQrDeLaMesa(browser, info, SLUG, token6);
        telefonos.push(comensal);
        await pedirAyuda(comensal.page);
        const fila = lupita.getByRole('listitem', { name: 'Mesa 6: Necesita ayuda' });
        await expect(fila).toBeVisible({ timeout: 20_000 });
        await expect(fila).toContainText('hace un momento');
        await expect
          .poll(() => loQueDijo(lupita), { message: 'La vista «Solicitudes» no anunció en voz.' })
          .toContain('Mesa 6 requiere ayuda.');
      });

      await test.step('en el plano, la mesa 5 pide ayuda: globo sí, voz no', async () => {
        await lupita.getByRole('button', { name: /^Mesas/ }).click();
        const dichoAntes = await loQueDijo(lupita);
        const comensal = await abrirElQrDeLaMesa(browser, info, SLUG, token5);
        telefonos.push(comensal);
        await pedirAyuda(comensal.page);
        await expect(
          lupita.getByRole('button', { name: 'Mesa 5: Necesita ayuda. Tocar para atender.' }),
        ).toBeVisible({ timeout: 20_000 });
        expect(await loQueDijo(lupita), 'La voz anunció la solicitud fuera de su vista.').toEqual(
          dichoAntes,
        );
      });

      await test.step('desde la lista, «Atender» la quita y el servidor la da por atendida', async () => {
        await lupita.getByRole('button', { name: /^Solicitudes/ }).click();
        await lupita.getByRole('button', { name: 'Atender Mesa 6: Necesita ayuda' }).click();
        await expect(lupita.getByRole('listitem', { name: 'Mesa 6: Necesita ayuda' })).toBeHidden({
          timeout: 20_000,
        });
        expect((await avisosDeLaMesa(duena, 6)).map((a) => a.estado)).toEqual(['atendida']);
        await expect(
          lupita.getByRole('listitem', { name: 'Mesa 5: Necesita ayuda' }),
        ).toBeVisible();
      });

      await test.step('la caja no lee las solicitudes en el servidor', async () => {
        const rosa = await equipo.pagina(info, 'cajero');
        const lectura = await rosa.request.post('/api/datos/consultar', {
          headers: cabecerasDeEscrituraDePrueba(),
          data: { entidad: 'SolicitudQR', operacion: 'list', limite: 10 },
        });
        expect(lectura.status(), 'La caja leyó las solicitudes del comensal.').toBe(403);
      });

      for (const exigirSinFallos of fallos) exigirSinFallos();
    } finally {
      for (const telefono of telefonos) await telefono.cerrar();
      await equipo.cerrar();
    }
  });
});
