import { expect, type Page, test } from '@playwright/test';

import {
  abrirElQrDeLaMesa,
  CARTA,
  prepararElPortalDelComensal,
  type TelefonoDelComensal,
} from './ayudantes/mesas-heredadas.ts';
import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  consultarPuente,
  exigirDemostracion,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * DP-10.3 · EL QR DE UNA MESA UNIDA LLEVA A LA PRINCIPAL (el puente de `main`).
 *
 * La sala une la 5 a la 4. El comensal escanea el QR de la 5: el portal dice «Mesa 4» y «Esta
 * mesa está unida a la mesa 4». Separadas, el QR de la 5 vuelve a ser de la 5.
 */

const SLUG = 'demo-acople-restaurante';

/** «Mesa 4» en el encabezado del portal, y no «Mesa 40» (el aviso dice «mesa», con minúscula). */
const rotuloDeMesa = (numero: number): RegExp => new RegExp(`\\bMesa ${String(numero)}(?!\\d)`);

async function escribir(duena: Page, ruta: string, datos: Record<string, unknown>) {
  const respuesta = await duena.request.post(ruta, {
    headers: cabecerasDeEscrituraDePrueba(),
    data: datos,
  });
  const texto = await respuesta.text();
  expect(respuesta.status(), `${ruta}: ${texto.slice(0, 300)}`).toBe(200);
  return JSON.parse(texto) as { readonly datos?: Record<string, unknown> };
}

async function idDeLaMesa(duena: Page, numero: number): Promise<string> {
  const [mesa] = await consultarPuente<{ id: string }>(duena, 'Mesa', {
    filtro: { numero },
    limite: 1,
  });
  expect(mesa, `No está la mesa ${String(numero)}.`).toBeDefined();
  return mesa?.id ?? '';
}

test.describe('el QR de una mesa unida', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('la 5 unida a la 4: su QR dice «Mesa 4» y que está unida; separadas, vuelve a la 5', async ({
    browser,
  }, info) => {
    test.setTimeout(4 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const telefonos: TelefonoDelComensal[] = [];
    try {
      const duena = await equipo.pagina(info, 'dueno');
      const sinFallos = vigilarFallos(duena);
      const reseteo = await duena.request.post('/api/catalogo/demostracion/resetear', {
        headers: cabecerasDeEscrituraDePrueba(),
        data: { confirmacion: 'RESETEAR' },
      });
      expect(reseteo.status(), `resetear: ${await reseteo.text()}`).toBe(200);
      const token = await prepararElPortalDelComensal(duena, {
        mesa: 5,
        zona: 'Interior',
        mesero: null,
      });
      const [cuatro, cinco] = [await idDeLaMesa(duena, 4), await idDeLaMesa(duena, 5)];
      const apertura = await escribir(duena, '/api/restaurante/abrir-mesa', {
        mesaId: cuatro,
        personas: 4,
      });
      const productos = await consultarPuente<{ id: string; nombre: string }>(
        duena,
        'ProductoTerminado',
        { limite: 80 },
      );
      await escribir(duena, '/api/restaurante/enviar-pedido', {
        ordenId: String(apertura.datos?.['ordenId']),
        lineas: [
          {
            productoId: productos.find((p) => p.nombre === CARTA.guacamole.nombre)?.id,
            cantidad: '1',
          },
        ],
      });
      const union = await escribir(duena, '/api/restaurante/unir-mesas', {
        mesaPrincipalId: cuatro,
        mesaIds: [cinco],
      });

      const telefono = await abrirElQrDeLaMesa(browser, info, SLUG, token);
      telefonos.push(telefono);
      await expect(telefono.page.getByText('Esta mesa está unida a la mesa 4')).toBeVisible();
      await expect(telefono.page.getByText(rotuloDeMesa(4)).first()).toBeVisible();
      await expect(telefono.page.getByText(rotuloDeMesa(5))).toHaveCount(0);

      await escribir(duena, '/api/restaurante/separar-mesas', {
        unionId: String(union.datos?.['unionId']),
      });
      await telefono.page.reload();
      await expect(telefono.page.getByText(rotuloDeMesa(5)).first()).toBeVisible();
      await expect(telefono.page.getByText(/unida a la mesa/)).toHaveCount(0);
      sinFallos();
    } finally {
      for (const telefono of telefonos) await telefono.cerrar();
      await equipo.cerrar();
    }
  });
});
