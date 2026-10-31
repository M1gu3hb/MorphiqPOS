import { expect, type Page, test } from '@playwright/test';

import {
  abrirElQrDeLaMesa,
  CARTA,
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
 * DP-9.7 · LOS BOTONES SOBRE LA CARTA DEL MENÚ QR.
 *
 * La dueña abre el editor de una página, coloca un botón de platillo arrastrándolo y uno de grupo
 * («Cervezas»), lo ve como comensal y guarda; elige el aspecto del portal. El comensal ve la carta
 * con los botones ENCIMA —el precio vigente del sistema, no el de la imagen—, sin la lista repetida
 * de abajo, despliega el grupo y pide tocando el platillo. Todo se comprueba en el servidor.
 */

const SLUG = 'demo-acople-restaurante';
const MESA = 6;
const PAGINA = 'Lo fuerte';

async function escribir(duena: Page, entidad: string, operacion: string, datos: object) {
  const r = await duena.request.post('/api/datos/escribir', {
    headers: cabecerasDeEscrituraDePrueba(),
    data: { entidad, operacion, datos },
  });
  expect(r.status(), `${entidad}.${operacion}: ${await r.text()}`).toBe(200);
}

async function elegir(page: Page, etiqueta: string, opcion: string) {
  await page.getByRole('combobox', { name: etiqueta }).click();
  await page.getByRole('option', { name: opcion, exact: true }).click();
}

test.describe('los botones del menú QR', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('la dueña coloca botones sobre la carta; el comensal pide tocando el platillo en la imagen', async ({
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
      const token = await prepararElPortalDelComensal(duena, {
        mesa: MESA,
        zona: 'Interior',
        mesero: null,
        pedidosDelComensal: true,
      });
      await escribir(duena, 'ConfiguracionNegocio', 'update', {
        portal_qr_modo_menu: 'menu_subido',
      });
      const imagen = new URL('/platillos/arrachera-al-carbon.webp', duena.url()).href;
      await escribir(duena, 'MenuQRSeccion', 'create', {
        nombre: PAGINA,
        imagen_url: imagen,
        orden: 1,
        activo: true,
      });
      const [pagina] = await consultarPuente<{ id: string }>(duena, 'MenuQRSeccion', {
        filtro: { nombre: PAGINA },
        limite: 1,
      });
      const paginaId = pagina?.id ?? '';

      await test.step('la dueña coloca un platillo arrastrándolo y un grupo, lo ve como comensal y guarda', async () => {
        await duena.goto('/portal-qr');
        await duena.getByRole('tab', { name: 'Menú QR' }).click();
        await duena.getByRole('button', { name: 'Botones', exact: true }).click();
        const editor = duena.getByRole('dialog', { name: `Botones de «${PAGINA}»` });
        await expect(editor).toBeVisible();

        await editor.getByRole('button', { name: 'Platillo', exact: true }).first().click();
        await elegir(duena, 'Platillo', CARTA.arrachera.nombre);
        const enLaCarta = editor.getByRole('button', { name: /^Botón Arrachera/ });
        const caja = await enLaCarta.boundingBox();
        expect(caja, 'El botón nuevo no está sobre la carta.').not.toBeNull();
        if (caja !== null) {
          await duena.mouse.move(caja.x + 30, caja.y + caja.height / 2);
          await duena.mouse.down();
          await duena.mouse.move(caja.x + 30, caja.y + caja.height / 2 - 60, { steps: 6 });
          await duena.mouse.up();
        }

        await editor.getByRole('button', { name: 'Grupo', exact: true }).first().click();
        await editor.getByLabel('Texto del grupo').fill('Cervezas');
        await elegir(duena, 'Categoría', 'Cervezas');

        await editor.getByRole('button', { name: 'Vista previa' }).click();
        await expect(
          editor.getByRole('button', { name: `Agregar ${CARTA.arrachera.nombre}` }),
        ).toBeVisible();
        await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
        await expect(editor).toBeHidden();

        const guardados = (await configuracionDelNegocio(duena))['portal_qr_botones'] as Record<
          string,
          readonly { tipo: string; y: number; productoId?: string; etiqueta?: string }[]
        >;
        const botones = guardados[paginaId] ?? [];
        expect(botones.map((b) => b.tipo)).toEqual(['platillo', 'grupo']);
        expect(botones[0]?.y, 'Arrastrar el botón no lo movió.').toBeLessThan(45);
        expect(botones[1]?.etiqueta).toBe('Cervezas');
      });

      await test.step('la dueña elige el aspecto del portal', async () => {
        const aspecto = duena.getByRole('region', { name: 'Aspecto del portal' });
        await elegir(duena, 'Estilo', 'Papel');
        await elegir(duena, 'Tipografía', 'Clásica, con patines');
        await elegir(duena, 'Fondo', 'Liso');
        await aspecto.getByRole('button', { name: 'Guardar aspecto' }).click();
        await expect
          .poll(async () => (await configuracionDelNegocio(duena))['portal_qr_tema'])
          .toEqual({ estilo: 'papel', tipografia: 'clasica', fondo: 'liso' });
      });

      await test.step('el comensal toca el platillo EN la carta, con el precio vigente, y lo pide', async () => {
        const comensal = await abrirElQrDeLaMesa(browser, info, SLUG, token);
        telefonos.push(comensal);
        const telefono = comensal.page;
        const carta = telefono.getByRole('article', { name: PAGINA });
        await expect(carta).toBeVisible();
        await expect(
          telefono.locator('[data-estilo="papel"][data-tipografia="clasica"]'),
        ).toHaveCount(1);
        await expect(telefono.getByRole('list', { name: `Pedir de ${PAGINA}` })).toHaveCount(0);

        const agregar = carta.getByRole('button', { name: `Agregar ${CARTA.arrachera.nombre}` });
        await expect(agregar).toContainText('$329.00');
        const [img, boton] = await Promise.all([
          carta.getByRole('img', { name: PAGINA }).boundingBox(),
          agregar.boundingBox(),
        ]);
        expect(
          img !== null &&
            boton !== null &&
            boton.y >= img.y &&
            boton.y + boton.height <= img.y + img.height,
          'El botón no quedó encima de la imagen.',
        ).toBe(true);

        await carta.getByRole('button', { name: 'Ver Cervezas' }).click();
        await expect(
          carta.getByRole('button', { name: `Agregar ${CARTA.cerveza.nombre}` }),
        ).toBeVisible();

        await agregar.click();
        await telefono.getByRole('button', { name: 'Abrir mesa' }).click();
        await expect.poll(async () => (await mesaEnElServidor(duena, MESA)).ordenId).not.toBeNull();
        await agregar.click();
        await telefono
          .getByRole('button', { name: /^Agregar/ })
          .last()
          .click();
        const enviado = enviarElPedidoDeLaMesa(telefono, token);
        expect((await enviado).status()).toBe(200);
      });

      for (const exigirSinFallos of fallos) exigirSinFallos();
    } finally {
      for (const telefono of telefonos) await telefono.cerrar();
      await equipo.cerrar();
    }
  });
});
