import { expect, type Page, test } from '@playwright/test';

import {
  abrirElQrDeLaMesa,
  CARTA,
  comandasDeLaCuenta,
  mesaEnElServidor,
  prepararElPortalDelComensal,
  type TelefonoDelComensal,
} from './ayudantes/mesas-heredadas.ts';
import { enviarElPedidoDeLaMesa } from './ayudantes/pedido-de-la-mesa.ts';
import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  exigirDemostracion,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * DP-9.5 · EL PEDIDO COMPARTIDO DE LA MESA (fase B).
 *
 * Dos teléfonos escanean el QR de la misma mesa. Lo que agrega uno lo ve el otro; cada quien
 * quita sólo lo suyo; arriba se ve cuántas personas están conectadas y que esperen a todos.
 * Uno lo manda —«¿Ya pidieron todos?»— y sale UNA vez, con una comanda por estación; el otro
 * ve «Pedido enviado» y el carrito vacío.
 */

const SLUG = 'demo-acople-restaurante';
const MESA = 4;

function tarjetaDe(telefono: Page, nombre: string) {
  return telefono
    .locator('button.rounded-2xl')
    .filter({ has: telefono.getByText(nombre, { exact: true }) });
}

async function agregar(telefono: Page, nombre: string) {
  await tarjetaDe(telefono, nombre).click();
  await telefono.getByRole('button', { name: /^Agregar/ }).click();
  await expect(telefono.getByText(`${nombre} agregado al pedido de la mesa`)).toBeVisible();
}

test.describe('el pedido compartido de la mesa', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('dos teléfonos arman UN pedido y sale una sola vez', async ({ browser }, info) => {
    test.setTimeout(5 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const telefonos: TelefonoDelComensal[] = [];
    const fallos: (() => void)[] = [];
    try {
      const duena = await equipo.pagina(info, 'dueno');
      fallos.push(vigilarFallos(duena));
      const reseteo = await duena.request.post('/api/catalogo/demostracion/resetear', {
        headers: cabecerasDeEscrituraDePrueba(),
        data: { confirmacion: 'RESETEAR' },
      });
      expect(reseteo.status(), `resetear_demo: ${await reseteo.text()}`).toBe(200);
      const token = await prepararElPortalDelComensal(duena, {
        mesa: MESA,
        zona: 'Interior',
        mesero: null,
        pedidosDelComensal: true,
      });

      const uno = await abrirElQrDeLaMesa(browser, info, SLUG, token);
      const dos = await abrirElQrDeLaMesa(browser, info, SLUG, token);
      telefonos.push(uno, dos);
      const [a, b] = [uno.page, dos.page];
      fallos.push(vigilarFallos(a), vigilarFallos(b));

      await test.step('un teléfono abre la mesa (para dos) y cada quien agrega lo suyo', async () => {
        await tarjetaDe(a, CARTA.cerveza.nombre).click();
        await a.getByRole('button', { name: 'Abrir mesa' }).click();
        await expect.poll(async () => (await mesaEnElServidor(duena, MESA)).ordenId).not.toBeNull();
        await agregar(a, CARTA.cerveza.nombre);
        await expect(b.getByRole('button', { name: /^Pedido de la mesa \(1\)/ })).toBeVisible();
        await agregar(b, CARTA.arrachera.nombre);
        for (const telefono of [a, b]) {
          await expect(
            telefono.getByRole('button', { name: /^Pedido de la mesa \(2\)/ }),
          ).toBeVisible();
          await expect(telefono.getByText('2 personas conectadas')).toBeVisible();
          await expect(
            telefono.getByText('Esperen a que todos agreguen su pedido antes de enviarlo.').first(),
          ).toBeVisible();
        }
      });

      await test.step('cada quien ve lo de todos, pero sólo quita lo suyo', async () => {
        await b.getByRole('button', { name: /^Pedido de la mesa/ }).click();
        const hoja = b.getByRole('dialog', { name: 'El pedido de la mesa' });
        await expect(hoja.getByText(CARTA.cerveza.nombre)).toBeVisible();
        await expect(hoja.getByText('De otro teléfono')).toHaveCount(1);
        await expect(hoja.getByRole('button', { name: 'Quitar' })).toHaveCount(1);
        await hoja.getByRole('button', { name: 'Seguir viendo el menú' }).click();
      });

      await test.step('uno lo manda, con «¿Ya pidieron todos?»: sale una vez, una comanda por estación', async () => {
        const enviado = await enviarElPedidoDeLaMesa(a, token);
        expect(enviado.status(), 'El servidor rechazó el pedido de la mesa.').toBe(200);
        await expect(a.getByText('¡Pedido enviado a cocina!')).toBeVisible();
        await expect(b.getByText(/Pedido enviado: la cocina ya lo tiene/)).toBeVisible();
        for (const telefono of [a, b]) {
          await expect(telefono.getByRole('button', { name: /^Pedido de la mesa/ })).toBeHidden();
        }
        const { ordenId } = await mesaEnElServidor(duena, MESA);
        const comandas = await comandasDeLaCuenta(duena, ordenId ?? '');
        const delPortal = comandas.filter((c) => c.origen === 'portal_qr');
        expect(delPortal.map((c) => c.area).sort(), 'Una comanda por estación, una vez.').toEqual([
          'barra',
          'cocina',
        ]);
      });

      for (const sinFallos of fallos) sinFallos();
    } finally {
      for (const telefono of telefonos) await telefono.cerrar();
      await equipo.cerrar();
    }
  });
});
