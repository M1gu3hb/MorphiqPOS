import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  abrirElQrDeLaMesa,
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
 * DP-9.6 · UNIR MESAS DESDE EL MAPA (fase B), en la tableta, la PC y el teléfono.
 *
 * En «Unir mesas» las mesas tiemblan; la 5 se arrastra hacia la 4, el imán la pega y se funden.
 * Se elige qué número queda: la 5 se oculta del mapa, su QR lleva a la 4 y, desde el mismo mapa,
 * se separan: cada mesa vuelve a su lugar. Todo se lee del SERVIDOR, no de la pantalla.
 */

const SLUG = 'demo-acople-restaurante';
const PRINCIPAL = 4;
const UNIDA = 5;

interface MesaDelPlano {
  readonly id: string;
  readonly numero: number;
  readonly posicion_x: number | null;
  readonly posicion_y: number | null;
  readonly unida_a_mesa_id: string | null;
}

async function mesa(lector: Page, numero: number): Promise<MesaDelPlano> {
  const [fila] = await consultarPuente<MesaDelPlano>(lector, 'Mesa', {
    filtro: { numero },
    limite: 1,
  });
  expect(fila, `El servidor no tiene la mesa ${String(numero)}.`).toBeDefined();
  return fila ?? { id: '', numero, posicion_x: null, posicion_y: null, unida_a_mesa_id: null };
}

async function unionesVivasDe(lector: Page, mesaId: string): Promise<readonly string[]> {
  const filas = await consultarPuente<{ id: string; cerrada_en?: string | null }>(
    lector,
    'UnionMesa',
    { filtro: { mesa_principal_id: mesaId }, limite: 10 },
  );
  return filas.filter((f) => (f.cerrada_en ?? null) === null).map((f) => f.id);
}

async function alModoUnir(sala: Page): Promise<Locator> {
  await sala.goto('/mesero');
  await sala.getByRole('button', { name: 'Unir mesas' }).click();
  const plano = sala.getByRole('region', { name: 'Unir mesas' });
  await expect(plano).toBeVisible();
  return plano;
}

/** «Mesa 4» en el encabezado del portal, y no «Mesa 40». */
const rotuloDeMesa = (numero: number): RegExp => new RegExp(`\\bMesa ${String(numero)}(?!\\d)`);

const animacionDe = (boton: Locator): Promise<string> =>
  boton.evaluate((nodo) => getComputedStyle(nodo).animationName);

test.describe('unir mesas desde el mapa', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('se arrastra la 5 hacia la 4, se funden y se unen; la 5 se oculta, su QR lleva a la 4 y se separan desde el mapa', async ({
    browser,
  }, info) => {
    test.setTimeout(6 * 60_000);
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
      const tokenDeLaUnida = await prepararElPortalDelComensal(duena, {
        mesa: UNIDA,
        zona: 'Interior',
        mesero: null,
      });
      const cuatro = await mesa(duena, PRINCIPAL);
      const cincoAntes = await mesa(duena, UNIDA);

      await test.step('en «Unir mesas» tiemblan; la 5 se arrastra hacia la 4 y el imán la pega', async () => {
        const plano = await alModoUnir(duena);
        const laCinco = plano.getByRole('button', { name: `Mesa ${String(UNIDA)}`, exact: true });
        const laCuatro = plano.getByRole('button', {
          name: `Mesa ${String(PRINCIPAL)}`,
          exact: true,
        });
        expect(await animacionDe(laCinco), 'Las mesas no tiemblan en «Unir mesas».').toBe(
          'temblar',
        );
        const caja5 = await laCinco.boundingBox();
        const caja4 = await laCuatro.boundingBox();
        if (caja5 === null || caja4 === null) throw new Error('Las mesas no están en el plano.');
        // Se suelta a medio camino del hueco: lo que falta lo cierra el imán.
        const hueco = caja5.x - (caja4.x + caja4.width);
        const desde = { x: caja5.x + caja5.width / 2, y: caja5.y + caja5.height / 2 };
        await duena.mouse.move(desde.x, desde.y);
        await duena.mouse.down();
        await duena.mouse.move(desde.x - hueco * 0.7, desde.y, { steps: 8 });
        await duena.mouse.up();
        await expect(laCinco).toHaveAttribute('aria-pressed', 'true');
        await expect(laCuatro).toHaveAttribute('aria-pressed', 'true');
        await expect(plano.getByRole('button', { name: /^Unir 2 mesas/ })).toBeEnabled();
      });

      await test.step('se elige qué número queda y se unen: la 4, nunca «45»', async () => {
        const plano = duena.getByRole('region', { name: 'Unir mesas' });
        await plano.getByRole('button', { name: /^Unir 2 mesas/ }).click();
        const numero = duena.getByRole('alertdialog', { name: '¿Qué número queda?' });
        await expect(numero.getByRole('radio')).toHaveText([
          `Mesa ${String(PRINCIPAL)}`,
          `Mesa ${String(UNIDA)}`,
        ]);
        await numero.getByRole('radio', { name: `Mesa ${String(PRINCIPAL)}` }).click();
        await numero.getByRole('button', { name: 'Unir', exact: true }).click();
        // El diálogo es modal: mientras está abierto el plano no se ve, aunque siga ahí. Primero
        // se cierra el diálogo (el servidor contestó) y luego se va el plano (se unieron).
        await expect(numero).toBeHidden();
        await expect(plano).toBeHidden();
        expect(await unionesVivasDe(duena, cuatro.id)).toHaveLength(1);
        const unida = await mesa(duena, UNIDA);
        expect(unida.unida_a_mesa_id, 'La 5 no quedó unida a la 4.').toBe(cuatro.id);
        // Quedó donde el imán la pegó: tocando a la 4 (120 + 160 de ancho), no donde estaba.
        expect(unida.posicion_x).toBe((cuatro.posicion_x ?? 0) + 160);
      });

      await test.step('en el mapa la 5 se oculta: su gente está en la 4', async () => {
        await duena.goto('/restaurante/mapa-de-mesas');
        await expect(duena.getByRole('button', { name: /^4\s/ })).toBeVisible();
        await expect(duena.getByRole('button', { name: /^5\s/ })).toHaveCount(0);
      });

      await test.step('el QR de la 5 lleva a la 4', async () => {
        const telefono = await abrirElQrDeLaMesa(browser, info, SLUG, tokenDeLaUnida);
        telefonos.push(telefono);
        await expect(telefono.page.getByText(rotuloDeMesa(PRINCIPAL))).toBeVisible();
        await expect(telefono.page.getByText(rotuloDeMesa(UNIDA))).toHaveCount(0);
      });

      await test.step('desde el mapa se separan: cada mesa vuelve a su lugar y la 5 a su QR', async () => {
        // Con movimiento reducido no tiemblan (y Playwright las ve quietas para tocarlas).
        await duena.emulateMedia({ reducedMotion: 'reduce' });
        const plano = await alModoUnir(duena);
        const laCuatro = plano.getByRole('button', {
          name: `Mesa ${String(PRINCIPAL)}`,
          exact: true,
        });
        expect(await animacionDe(laCuatro), 'Con movimiento reducido siguen temblando.').toBe(
          'none',
        );
        await expect(
          plano.getByRole('button', { name: `Mesa ${String(UNIDA)}`, exact: true }),
        ).toHaveCount(0);
        await laCuatro.click();
        await plano.getByRole('button', { name: 'Separar mesas' }).click();
        const pregunta = duena.getByRole('alertdialog', { name: '¿Separar las mesas?' });
        await pregunta.getByRole('button', { name: 'Separar mesas' }).click();
        await expect(pregunta).toBeHidden();
        await expect(plano).toBeHidden();
        expect(await unionesVivasDe(duena, cuatro.id)).toHaveLength(0);
        const cinco = await mesa(duena, UNIDA);
        expect(
          [cinco.unida_a_mesa_id, cinco.posicion_x, cinco.posicion_y],
          'La 5 no volvió a su lugar.',
        ).toEqual([null, cincoAntes.posicion_x, cincoAntes.posicion_y]);
        const telefono = telefonos[0];
        if (telefono === undefined) throw new Error('No hay teléfono del comensal.');
        await telefono.page.reload();
        await expect(telefono.page.getByText(rotuloDeMesa(UNIDA))).toBeVisible();
      });

      for (const sinFallos of fallos) sinFallos();
    } finally {
      for (const telefono of telefonos) await telefono.cerrar();
      await equipo.cerrar();
    }
  });
});
