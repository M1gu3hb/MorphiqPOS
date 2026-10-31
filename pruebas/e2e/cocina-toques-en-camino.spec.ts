import { expect, test, type Page } from '@playwright/test';

import { CARTA } from './ayudantes/mesas-heredadas.ts';
import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  consultarPuente,
  exigirDemostracion,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * UN TOQUE EN CAMINO NO LO DESHACE LA LECTURA DE OTRO (la cocina heredada, DP-7).
 *
 * Toño toca «Preparar» en dos comandas seguidas. La primera contesta luego; la segunda tarda
 * —aquí, a propósito, tres segundos—. Al contestar la primera, la pantalla relee la lista, y esa
 * lectura todavía trae la segunda en «nuevo»: la pantalla la regresaba a «Nuevos», con su
 * «Preparar» otra vez, hasta que la segunda contestaba. En la CI eso hizo que el segundo «Listo»
 * cayera otra vez sobre la primera comanda y la de la barra se quedara en el fuego.
 *
 * Lo que se exige: mientras la segunda va en camino, su comanda NO vuelve a «Nuevos». Y al final
 * el servidor tiene las dos en preparación.
 *
 * Y el caso de UNA comanda (DP-D19, segunda parte): «Preparar» tarda y Toño toca «Listo» de esa
 * misma, que la pantalla ya le enseña. Mandados juntos, el «Listo» llegaba primero y el
 * «Preparar» atrasado se rechazaba (422), o al revés: la CI lo vio en la tableta. Ahora el
 * «Listo» espera a que conteste su «Preparar», y los dos entran.
 */

const SLUG = 'prueba-restaurante';
const MESA = 5;
const RUTA = '/api/restaurante/transicionar-pedido';
const DEMORA_MS = 3_000;
const MUESTREO_MS = 100;

async function escribir(duena: Page, ruta: string, datos: Record<string, unknown>) {
  const respuesta = await duena.request.post(ruta, {
    headers: cabecerasDeEscrituraDePrueba(),
    data: datos,
  });
  const texto = await respuesta.text();
  expect(respuesta.status(), `${ruta}: ${texto.slice(0, 300)}`).toBe(200);
  return JSON.parse(texto) as { readonly datos?: Record<string, unknown> };
}

async function resetear(duena: Page): Promise<void> {
  const respuesta = await duena.request.post('/api/pruebas/resetear', {
    headers: cabecerasDeEscrituraDePrueba(),
    data: { confirmacion: 'RESETEAR' },
  });
  expect(respuesta.status(), `resetear: ${await respuesta.text()}`).toBe(200);
}

/** La mesa 5 abierta, con un platillo de la cocina y una bebida de la barra: dos comandas. */
async function mesaConDosComandas(duena: Page): Promise<string> {
  const [mesa] = await consultarPuente<{ id: string }>(duena, 'Mesa', {
    filtro: { numero: MESA },
    limite: 1,
  });
  const productos = await consultarPuente<{ id: string; nombre: string }>(
    duena,
    'ProductoTerminado',
    { limite: 80 },
  );
  const idDe = (nombre: string): string => {
    const producto = productos.find((p) => p.nombre === nombre);
    expect(producto, `La siembra no trae «${nombre}».`).toBeDefined();
    return producto?.id ?? '';
  };
  const apertura = await escribir(duena, '/api/restaurante/abrir-mesa', {
    mesaId: mesa?.id,
    personas: 2,
  });
  const ordenId = String(apertura.datos?.['ordenId']);
  await escribir(duena, '/api/restaurante/enviar-pedido', {
    ordenId,
    lineas: [
      { productoId: idDe(CARTA.guacamole.nombre), cantidad: '1' },
      { productoId: idDe(CARTA.limonada.nombre), cantidad: '1' },
    ],
  });
  return ordenId;
}

async function estadosEnElServidor(duena: Page, ordenId: string): Promise<string[]> {
  const comandas = await consultarPuente<{ estado: string }>(duena, 'PedidoPreparacion', {
    filtro: { venta_id: ordenId },
    limite: 10,
  });
  return comandas.map((c) => c.estado).sort();
}

test.describe('la cocina con dos toques en camino', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('la lectura que llega mientras otro toque va en camino no regresa su comanda', async ({
    browser,
  }, info) => {
    test.setTimeout(3 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const fallos: (() => void)[] = [];

    try {
      const duena = await equipo.pagina(info, 'dueno');
      fallos.push(vigilarFallos(duena));
      await resetear(duena);

      const ordenId = await mesaConDosComandas(duena);

      await test.step('Toño prepara las dos y la segunda tarda: no vuelve a «Nuevos»', async () => {
        const tono = await equipo.pagina(info, 'cocina');
        fallos.push(vigilarFallos(tono));
        let pedidas = 0;
        let contestadas = 0;
        await tono.route(`**${RUTA}`, async (ruta) => {
          pedidas += 1;
          if (pedidas === 2) await new Promise((listo) => setTimeout(listo, DEMORA_MS));
          await ruta.continue();
        });
        tono.on('response', (r) => {
          if (new URL(r.url()).pathname === RUTA) contestadas += 1;
        });

        await tono.goto('/');
        await tono.waitForURL(/\/cocina$/);
        const preparar = tono.getByRole('button', { name: 'Preparar', exact: true });
        await expect(preparar, 'La cocina no tiene las dos comandas en «Nuevos».').toHaveCount(2, {
          timeout: 30_000,
        });
        await preparar.first().click();
        await expect(preparar).toHaveCount(1);
        await preparar.first().click();
        await expect(preparar).toHaveCount(0);

        // Mientras la segunda va en camino, la primera contesta y la pantalla relee: se mira
        // cada 100 ms si alguna comanda volvió a «Nuevos».
        let reaparecidas = 0;
        const limite = Date.now() + DEMORA_MS * 3;
        while (contestadas < 2 && Date.now() < limite) {
          reaparecidas = Math.max(reaparecidas, await preparar.count());
          await tono.waitForTimeout(MUESTREO_MS);
        }
        expect(contestadas, 'La segunda transición no contestó.').toBe(2);
        expect(
          reaparecidas,
          'Una lectura que llegó con el toque en camino regresó su comanda a «Nuevos».',
        ).toBe(0);
      });

      await test.step('en el servidor: las dos comandas, en preparación', async () => {
        await expect
          .poll(() => estadosEnElServidor(duena, ordenId))
          .toEqual(['en_preparacion', 'en_preparacion']);
      });

      for (const exigirSinFallos of fallos) exigirSinFallos();
      // La mesa queda con su cuenta abierta: se deja la demo en limpio para la que siga.
      await resetear(duena);
    } finally {
      await equipo.cerrar();
    }
  });

  test('«Listo» tocado con el «Preparar» de la misma comanda en camino espera su turno', async ({
    browser,
  }, info) => {
    test.setTimeout(3 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const fallos: (() => void)[] = [];

    try {
      const duena = await equipo.pagina(info, 'dueno');
      fallos.push(vigilarFallos(duena));
      await resetear(duena);
      const ordenId = await mesaConDosComandas(duena);

      await test.step('Toño toca «Preparar» (tarda) y enseguida «Listo» de la MISMA', async () => {
        const tono = await equipo.pagina(info, 'cocina');
        fallos.push(vigilarFallos(tono));
        const respuestas: { estado: string; codigo: number }[] = [];
        let pedidas = 0;
        await tono.route(`**${RUTA}`, async (ruta) => {
          pedidas += 1;
          if (pedidas === 1) await new Promise((listo) => setTimeout(listo, DEMORA_MS));
          await ruta.continue();
        });
        tono.on('response', (r) => {
          if (new URL(r.url()).pathname !== RUTA) return;
          const { estado } = r.request().postDataJSON() as { estado: string };
          respuestas.push({ estado, codigo: r.status() });
        });

        await tono.goto('/');
        await tono.waitForURL(/\/cocina$/);
        const preparar = tono.getByRole('button', { name: 'Preparar', exact: true });
        await expect(preparar).toHaveCount(2, { timeout: 30_000 });
        await preparar.first().click();
        const listo = tono.getByRole('button', { name: 'Listo', exact: true });
        await expect(listo, 'La comanda tocada no se pintó en preparación.').toHaveCount(1);
        await listo.first().click();

        await expect.poll(() => respuestas.length, { timeout: DEMORA_MS * 4 }).toBe(2);
        expect(
          respuestas,
          'El «Listo» salió antes de que contestara su «Preparar» y el servidor lo rechazó.',
        ).toEqual([
          { estado: 'en_preparacion', codigo: 200 },
          { estado: 'listo', codigo: 200 },
        ]);
      });

      await test.step('en el servidor: una lista y la otra sin tocar', async () => {
        await expect.poll(() => estadosEnElServidor(duena, ordenId)).toEqual(['listo', 'nuevo']);
      });

      for (const exigirSinFallos of fallos) exigirSinFallos();
      await resetear(duena);
    } finally {
      await equipo.cerrar();
    }
  });
});
