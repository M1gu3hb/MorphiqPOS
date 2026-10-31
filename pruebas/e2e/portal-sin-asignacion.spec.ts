import { expect, type Page, test } from '@playwright/test';

import {
  abrirElQrDeLaMesa,
  avisosDeLaMesa,
  CARTA,
  comandasDeLaCuenta,
  configuracionDelNegocio,
  mesaEnElServidor,
  prepararElPortalDelComensal,
  type TelefonoDelComensal,
} from './ayudantes/mesas-heredadas.ts';
import { enviarElPedidoDeLaMesa } from './ayudantes/pedido-de-la-mesa.ts';
import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  consultarPuente,
  exigirDemostracion,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * DP-9.2 · EL PORTAL SIN ASIGNACIÓN DE MESAS, Y LOS GLOBOS SOBRE CADA MESA.
 *
 * Con la asignación de mesas apagada el portal no dejaba abrir ni pedir: exigía un mesero
 * asignado que en ese modo no existe. Ahora la dueña enciende los pedidos del comensal sin
 * asignación; el comensal abre su mesa, pide y llama; la mesera ve el globo «Ayuda» SOBRE esa
 * mesa, lo toca, y se queda con la mesa y con su cuenta (la propina y el corte salen de ahí).
 *
 * Lo que la pantalla enseña no prueba nada: cada paso se lee del SERVIDOR por el puente con la
 * sesión de la dueña.
 */

const SLUG = 'demo-acople-restaurante';
const MESA = 6;
const ZONA = 'Interior';
const MESERO = 'Lupita';

/** La cuenta de la mesa y quién la atiende, como la lee dirección. */
async function quienAtiende(
  duena: Page,
): Promise<{ readonly mesa: string | null; readonly cuenta: string | null }> {
  const { mesaId, ordenId } = await mesaEnElServidor(duena, MESA);
  const [mesa] = await consultarPuente<{ atendido_por_nombre?: string | null }>(duena, 'Mesa', {
    filtro: { id: mesaId },
    limite: 1,
  });
  const [cuenta] =
    ordenId === null
      ? []
      : await consultarPuente<{ usuario_mesero_nombre?: string | null }>(duena, 'Venta', {
          filtro: { id: ordenId },
          limite: 1,
        });
  return {
    mesa: mesa?.atendido_por_nombre ?? null,
    cuenta: cuenta?.usuario_mesero_nombre ?? null,
  };
}

test.describe('el portal sin asignación de mesas', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('el comensal abre, pide y llama sin mesero asignado; la mesera atiende el globo y se queda con la mesa', async ({
    browser,
  }, info) => {
    test.setTimeout(6 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const fallos: (() => void)[] = [];
    const telefonos: TelefonoDelComensal[] = [];
    let telefonoDelComensal: Page | null = null;

    try {
      const duena = await equipo.pagina(info, 'dueno');
      fallos.push(vigilarFallos(duena));
      const reseteo = await duena.request.post('/api/catalogo/demostracion/resetear', {
        headers: cabecerasDeEscrituraDePrueba(),
        data: { confirmacion: 'RESETEAR' },
      });
      expect(reseteo.status(), `resetear_demo: ${await reseteo.text()}`).toBe(200);

      let token = '';
      await test.step('la dueña enciende el portal y los pedidos del comensal SIN asignación de mesas', async () => {
        token = await prepararElPortalDelComensal(duena, {
          mesa: MESA,
          zona: ZONA,
          mesero: null,
          pedidosDelComensal: true,
        });
        expect(await configuracionDelNegocio(duena)).toMatchObject({
          asignacion_mesas_activa: false,
          portal_qr_activo: true,
          portal_qr_permitir_pedidos_cliente: true,
        });
        expect(await mesaEnElServidor(duena, MESA)).toMatchObject({
          estado: 'libre',
          mesero: null,
          qrActivo: true,
        });
      });

      // La tableta de la mesera lee la configuración al cargar: entra con el portal ya encendido.
      const lupita = await equipo.pagina(info, 'mesero');
      fallos.push(vigilarFallos(lupita));
      await lupita.goto('/');
      await lupita.waitForURL(/\/mesero$/);

      await test.step('el comensal abre la mesa y pide: la cuenta nace sin responsable y el pedido sale', async () => {
        const comensal = await abrirElQrDeLaMesa(browser, info, SLUG, token);
        telefonos.push(comensal);
        const telefono = comensal.page;
        telefonoDelComensal = telefono;
        fallos.push(vigilarFallos(telefono));
        const tarjeta = telefono
          .locator('button.rounded-2xl')
          .filter({ has: telefono.getByText(CARTA.cerveza.nombre, { exact: true }) });
        await expect(
          tarjeta,
          'Sin asignación el menú no deja pedir: las tarjetas no se pueden tocar.',
        ).toHaveCount(1);

        // Primer toque: la mesa está libre, se abre.
        await tarjeta.click();
        await expect(telefono.getByText(`Abrir Mesa ${String(MESA)}`)).toBeVisible();
        await telefono.getByRole('button', { name: 'Abrir mesa' }).click();
        await expect
          .poll(async () => (await mesaEnElServidor(duena, MESA)).ordenId, {
            message: 'La mesa no quedó abierta en el servidor.',
          })
          .not.toBeNull();
        expect(await quienAtiende(duena), 'La cuenta nació con un responsable.').toEqual({
          mesa: null,
          cuenta: null,
        });

        // Y ahora sí, el pedido.
        await tarjeta.click();
        await telefono.getByRole('button', { name: /^Agregar/ }).click();
        const enviado = enviarElPedidoDeLaMesa(telefono, token);
        expect((await enviado).status(), 'El servidor rechazó el pedido del comensal.').toBe(200);
        await expect(telefono.getByText('¡Pedido enviado a cocina!')).toBeVisible();
        const { ordenId } = await mesaEnElServidor(duena, MESA);
        const comandas = await comandasDeLaCuenta(duena, ordenId ?? '');
        expect(
          comandas.filter((c) => c.origen === 'portal_qr').map((c) => c.area),
          'El pedido del comensal no salió a la barra.',
        ).toEqual(['barra']);
      });

      await test.step('el comensal pide ayuda: el globo aparece sobre SU mesa en la pantalla de la mesera', async () => {
        const telefono = telefonoDelComensal!;
        await telefono.getByRole('button', { name: 'Atención' }).click();
        await telefono.getByRole('button', { name: 'Necesito ayuda' }).click();
        await expect(telefono.getByText('Solicitud enviada')).toBeVisible();
        await expect
          .poll(async () => (await avisosDeLaMesa(duena, MESA)).map((a) => [a.tipo, a.estado]), {
            message: 'La petición de ayuda no quedó guardada en el servidor.',
          })
          .toEqual([['ayuda', 'pendiente']]);

        const globo = lupita.getByRole('button', {
          name: `Mesa ${String(MESA)}: Necesita ayuda. Tocar para atender.`,
        });
        await expect(globo, 'La mesera no ve el globo de ayuda sobre la mesa 6.').toBeVisible({
          timeout: 20_000,
        });
        await expect(globo).toContainText('Ayuda');
      });

      await test.step('la mesera toca el globo: la solicitud queda atendida y la mesa y su cuenta son suyas', async () => {
        const globo = lupita.getByRole('button', {
          name: `Mesa ${String(MESA)}: Necesita ayuda. Tocar para atender.`,
        });
        const atendida = lupita.waitForResponse(
          (r) => new URL(r.url()).pathname === '/api/restaurante/atender-solicitud',
        );
        await globo.click();
        expect((await atendida).status(), 'El servidor no atendió la solicitud.').toBe(200);
        await expect(globo, 'El globo siguió en la mesa después de atenderlo.').toBeHidden({
          timeout: 20_000,
        });

        expect((await avisosDeLaMesa(duena, MESA)).map((a) => [a.tipo, a.estado])).toEqual([
          ['ayuda', 'atendida'],
        ]);
        expect(
          await quienAtiende(duena),
          'La mesera atendió la mesa pero la cuenta siguió sin responsable.',
        ).toEqual({ mesa: MESERO, cuenta: MESERO });
      });

      for (const exigirSinFallos of fallos) exigirSinFallos();
    } finally {
      for (const telefono of telefonos) await telefono.cerrar();
      await equipo.cerrar();
    }
  });
});
