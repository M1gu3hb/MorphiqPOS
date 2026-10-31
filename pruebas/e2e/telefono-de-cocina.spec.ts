import { devices, expect, type BrowserContext, type Page, test } from '@playwright/test';

import {
  abrirLaMesa,
  alMapa,
  CARTA,
  comandar,
  comandasDeLaCuenta,
} from './ayudantes/mesas-heredadas.ts';
import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  exigirDemostracion,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * DP-9.4 · COCINA EN EL TELÉFONO.
 *
 * El cocinero entra con su PIN a Cocina y toca «Conectar teléfono»: un QR de UNA estación. Un
 * teléfono —otro aparato, sin sesión ni PIN— lo abre, activa el sonido y espera. Llega una
 * comanda de esa estación: la enseña y la lee en voz. La botonera física (teclas) la prepara y la
 * deja lista; la pantalla grande ve lo mismo. Al generar otro código, el teléfono viejo deja de
 * servir. Lo que la pantalla dice se comprueba en el SERVIDOR.
 */

const SLUG = 'demo-acople-restaurante';
const MESA = 6;
/**
 * La estación general del negocio de prueba: sus categorías no tienen estación propia y todo cae
 * ahí. Que el teléfono de una estación no vea las de otra lo prueba la integración
 * (`telefono.integracion.test.ts`), con categorías ligadas a Cocina y a Bebidas.
 */
const ESTACION = 'Cocina general';

async function espiarLaVoz(contexto: BrowserContext): Promise<void> {
  await contexto.addInitScript(() => {
    const dicho: string[] = [];
    Object.defineProperty(window, '__voz', { value: dicho });
    window.speechSynthesis.speak = (frase: SpeechSynthesisUtterance) => {
      dicho.push(frase.text);
      setTimeout(() => {
        frase.dispatchEvent(new Event('end'));
      }, 20);
    };
  });
}

const loQueDijo = (page: Page): Promise<readonly string[]> =>
  page.evaluate(() => [...((window as unknown as { __voz: string[] }).__voz ?? [])]);

async function conectarElTelefono(tono: Page): Promise<string> {
  await tono.getByRole('button', { name: 'Conectar teléfono' }).click();
  const dialogo = tono.getByRole('dialog', { name: 'Conectar teléfono' });
  await dialogo.getByRole('button', { name: ESTACION, exact: true }).click();
  await expect(
    dialogo.getByRole('img', { name: `Código QR del teléfono de ${ESTACION}` }),
  ).toBeVisible();
  const enlace = await dialogo.getByRole('link').getAttribute('href');
  expect(enlace, 'El diálogo no enseña la dirección del teléfono.').toMatch(/\/cocina-telefono\//);
  await tono.keyboard.press('Escape');
  return new URL(enlace ?? '').pathname;
}

test.describe('cocina en el teléfono', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('el teléfono de una estación recibe la comanda con voz y la prepara y deja lista con la botonera', async ({
    browser,
  }, info) => {
    test.setTimeout(6 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const fallos: (() => void)[] = [];
    const uso = info.project.use;
    const contexto = await browser.newContext({
      ...devices['Pixel 7'],
      ...(uso.baseURL === undefined ? {} : { baseURL: uso.baseURL }),
      ...(uso.extraHTTPHeaders === undefined ? {} : { extraHTTPHeaders: uso.extraHTTPHeaders }),
      locale: 'es-MX',
    });

    try {
      const duena = await equipo.pagina(info, 'dueno');
      const reseteo = await duena.request.post('/api/catalogo/demostracion/resetear', {
        headers: cabecerasDeEscrituraDePrueba(),
        data: { confirmacion: 'RESETEAR' },
      });
      expect(reseteo.status(), `resetear_demo: ${await reseteo.text()}`).toBe(200);
      const tono = await equipo.pagina(info, 'cocina');
      fallos.push(vigilarFallos(tono));
      const lupita = await equipo.pagina(info, 'mesero');
      fallos.push(vigilarFallos(lupita));
      await tono.goto('/');
      await tono.waitForURL(/\/cocina$/);
      await lupita.goto('/');
      await lupita.waitForURL(/\/mesero$/);

      await espiarLaVoz(contexto);
      const telefono = await contexto.newPage();
      let fallosDelTelefono: () => void = () => undefined;
      await test.step('Toño conecta el teléfono de su estación; el teléfono, sin sesión, lo abre', async () => {
        await telefono.goto(await conectarElTelefono(tono));
        await telefono.getByRole('button', { name: 'Toca para activar el sonido' }).click();
        await expect(telefono.getByText(ESTACION, { exact: true })).toBeVisible();
        await expect(telefono.getByText('Sin comandas pendientes')).toBeVisible();
        const cookies = await contexto.cookies();
        expect(cookies.filter((c) => c.name.startsWith('morphiqpos_sesion'))).toEqual([]);
        fallosDelTelefono = vigilarFallos(telefono);
      });

      let ordenId = '';
      await test.step('Lupita comanda: el teléfono enseña la comanda y la lee en voz', async () => {
        ordenId = (await abrirLaMesa(lupita, duena, MESA, 2)).ordenId;
        await comandar(lupita, MESA, [{ nombre: CARTA.arrachera.nombre, veces: 1 }]);
        await alMapa(lupita);
        const tarjeta = telefono.getByRole('article', { name: `Comanda de Mesa ${String(MESA)}` });
        await expect(tarjeta).toBeVisible({ timeout: 20_000 });
        await expect(tarjeta).toContainText(CARTA.arrachera.nombre);
        await expect
          .poll(async () => (await loQueDijo(telefono)).join(' | '), {
            message: 'El teléfono no leyó la comanda en voz.',
          })
          .toMatch(/mesa 6/i);
      });

      const deCocina = async () =>
        (await comandasDeLaCuenta(duena, ordenId)).find((c) => c.area === 'cocina');

      await test.step('la botonera: «2» la prepara, «1» repite la voz, «3» la deja lista', async () => {
        await telefono.keyboard.press('2');
        await expect.poll(async () => (await deCocina())?.estado).toBe('en_preparacion');
        const antes = (await loQueDijo(telefono)).length;
        await telefono.keyboard.press('1');
        await expect.poll(async () => (await loQueDijo(telefono)).length).toBeGreaterThan(antes);
        await telefono.keyboard.press('3');
        await expect.poll(async () => (await deCocina())?.estado).toBe('listo');
        await expect(telefono.getByText('Sin comandas pendientes')).toBeVisible();
        // Hasta aquí el teléfono no falló nada; lo que sigue (el código revocado) es a propósito.
        fallosDelTelefono();
      });

      await test.step('generar otro código apaga el teléfono viejo', async () => {
        await conectarElTelefono(tono);
        await expect(telefono.getByText('Este código ya no sirve')).toBeVisible({
          timeout: 20_000,
        });
        // Y nada de la comanda vieja con sus botones: un código revocado no mueve nada.
        await expect(telefono.getByRole('button', { name: /Listo|Preparar/ })).toHaveCount(0);
      });

      for (const exigirSinFallos of fallos) exigirSinFallos();
    } finally {
      await contexto.close();
      await equipo.cerrar();
    }
  });
});
