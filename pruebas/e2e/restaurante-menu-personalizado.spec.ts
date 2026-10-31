import { expect, test, type Page } from '@playwright/test';

import {
  abrirElQrDeLaMesa,
  abrirLaMesa,
  CARTA,
  comandasDeLaCuenta,
  prepararElPortalDelComensal,
  type TelefonoDelComensal,
  unidadesEsperadas,
  unidadesPorPlatillo,
} from './ayudantes/mesas-heredadas.ts';
import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  consultarPuente,
  exigirDemostracion,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * EL MENÚ PERSONALIZADO DEL PORTAL QR TAMBIÉN PIDE (DP-5).
 *
 * La dueña sube su menú —una página con su imagen— y le pone de título las categorías que trae,
 * separadas por «·». El comensal, en su teléfono y sin sesión, ve la página y debajo sus platillos
 * (de ESAS categorías y de ninguna otra), toca «Agregar», elige la opción del platillo, y su
 * pedido llega a la cuenta de la mesa con la opción en la nota. Se lee del SERVIDOR, no de la
 * pantalla.
 */

const SLUG = 'prueba-restaurante';
const MESA = 6;
const ZONA = 'Interior';
const MESERO = 'Lupita';
/** Dos categorías de la siembra del restaurante de prueba. «Bebidas» queda fuera a propósito. */
const PAGINA = 'Platos fuertes · Cervezas';
const OPCION = { grupo: 'Temperatura', nombre: 'Bien fría' };

async function escribir(duena: Page, datos: Record<string, unknown>, ruta = '/api/datos/escribir') {
  const respuesta = await duena.request.post(ruta, {
    headers: cabecerasDeEscrituraDePrueba(),
    data: datos,
  });
  expect(respuesta.ok(), `${ruta}: ${await respuesta.text()}`).toBe(true);
}

test.describe('el menú personalizado del portal QR', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('una página del menú subido lleva sus platillos, y desde ahí se pide con su opción', async ({
    browser,
  }, info) => {
    test.setTimeout(6 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const fallos: (() => void)[] = [];
    const telefonos: TelefonoDelComensal[] = [];

    try {
      const duena = await equipo.pagina(info, 'dueno');
      fallos.push(vigilarFallos(duena));
      const reseteo = await duena.request.post('/api/pruebas/resetear', {
        headers: cabecerasDeEscrituraDePrueba(),
        data: { confirmacion: 'RESETEAR' },
      });
      expect(reseteo.status(), `resetear: ${await reseteo.text()}`).toBe(200);

      let token = '';
      await test.step('la dueña deja el portal en «menú subido», con su página y la opción de la cerveza', async () => {
        token = await prepararElPortalDelComensal(duena, {
          mesa: MESA,
          zona: ZONA,
          mesero: MESERO,
          pedidosDelComensal: true,
        });
        const base = new URL(info.project.use.baseURL ?? 'http://localhost:3200').origin;
        await escribir(duena, {
          entidad: 'MenuQRSeccion',
          operacion: 'create',
          datos: {
            nombre: PAGINA,
            imagen_url: `${base}/menu-qr/02-lo-fuerte.webp`,
            orden: 0,
            activo: true,
          },
        });
        await escribir(duena, {
          entidad: 'ConfiguracionNegocio',
          operacion: 'update',
          datos: { portal_qr_modo_menu: 'menu_subido' },
        });
        const [cerveza] = await consultarPuente<{ id: string }>(duena, 'ProductoTerminado', {
          filtro: { nombre: CARTA.cerveza.nombre },
          limite: 1,
        });
        expect(cerveza, 'La siembra no trae la cerveza clara.').toBeDefined();
        await escribir(
          duena,
          {
            productoId: cerveza?.id,
            grupos: [
              { nombre: OPCION.grupo, obligatorio: true, opciones: [{ nombre: OPCION.nombre }] },
            ],
          },
          '/api/catalogo/modificadores',
        );
      });

      let ordenId = '';
      await test.step('Lupita abre la mesa 6 para dos', async () => {
        const lupita = await equipo.pagina(info, 'mesero');
        fallos.push(vigilarFallos(lupita));
        await lupita.goto('/');
        await lupita.waitForURL(/\/mesero$/);
        ordenId = (await abrirLaMesa(lupita, duena, MESA, 2)).ordenId;
      });

      await test.step('el comensal ve la página con SUS platillos y pide la cerveza bien fría', async () => {
        const comensal = await abrirElQrDeLaMesa(browser, info, SLUG, token);
        telefonos.push(comensal);
        const telefono = comensal.page;
        fallos.push(vigilarFallos(telefono));

        const lista = telefono.getByRole('list', { name: `Pedir de ${PAGINA}` });
        await expect(lista, 'La página del menú subido no trae sus platillos.').toBeVisible();
        await expect(
          lista.getByRole('button', { name: `Agregar ${CARTA.arrachera.nombre}` }),
        ).toBeVisible();
        await expect(
          lista.getByRole('button', { name: `Agregar ${CARTA.limonada.nombre}` }),
          'La página trae un platillo de una categoría que su título no nombra.',
        ).toHaveCount(0);

        await lista.getByRole('button', { name: `Agregar ${CARTA.cerveza.nombre}` }).click();
        // El diálogo del platillo es una hoja propia (no `role=dialog`): se busca por su contenido.
        await telefono.getByText(OPCION.nombre, { exact: true }).click();
        // «Agregar · $55.00»: el de la hoja, no los «Agregar <platillo>» de la página.
        await telefono.getByRole('button', { name: /^Agregar\s*·/ }).click();
        await telefono.getByRole('button', { name: /Ver mi pedido/ }).click();
        const enviado = telefono.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === `/api/publico/qr/${token}/pedido` &&
            r.request().method() === 'POST',
        );
        await telefono.getByRole('button', { name: 'Enviar a cocina' }).click();
        expect((await enviado).status(), 'El servidor rechazó el pedido del comensal.').toBe(200);
      });

      await test.step('en el servidor: la cerveza es de la cuenta de la mesa, con su opción en la nota', async () => {
        await expect
          .poll(async () => unidadesPorPlatillo(await comandasDeLaCuenta(duena, ordenId)), {
            message: 'El pedido desde la página no llegó a la cuenta de la mesa.',
          })
          .toEqual(unidadesEsperadas([{ nombre: CARTA.cerveza.nombre, veces: 1 }]));
        const lineas = await consultarPuente<{
          producto_nombre?: string;
          notas_producto?: string | null;
        }>(duena, 'DetalleVenta', { filtro: { venta_id: ordenId }, limite: 20 });
        const cerveza = lineas.find((l) => l.producto_nombre === CARTA.cerveza.nombre);
        expect(cerveza?.notas_producto ?? '', 'La opción elegida no viajó en la nota.').toContain(
          OPCION.nombre,
        );
      });

      for (const exigirSinFallos of fallos) exigirSinFallos();
      // La mesa 6 queda con su cuenta abierta: se deja la demo en limpio para la que siga (el
      // cierre del día de `restaurante.spec.ts` no se deja hacer con una cuenta abierta).
      const limpieza = await duena.request.post('/api/pruebas/resetear', {
        headers: cabecerasDeEscrituraDePrueba(),
        data: { confirmacion: 'RESETEAR' },
      });
      expect(limpieza.status(), `resetear al final: ${await limpieza.text()}`).toBe(200);
    } finally {
      for (const t of telefonos) await t.cerrar();
      await equipo.cerrar();
    }
  });
});
