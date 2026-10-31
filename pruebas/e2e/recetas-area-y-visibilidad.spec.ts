import { expect, test, type Page } from '@playwright/test';

import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  consultarPuente,
  exigirDemostracion,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * DP-9.1 · RECETAS NO PISA EL ÁREA NI LA VISIBILIDAD DEL PLATILLO.
 *
 * Recetas guardaba SIEMPRE `area_preparacion: 'cocina'` y `visible_en_menu_digital: true`: al
 * capturar la receta de una bebida, la bebida dejaba de ir a la barra, y un platillo escondido
 * del QR reaparecía. Se lee del SERVIDOR lo que quedó, no de la pantalla.
 */

const SLUG = 'demo-acople-restaurante';
const BEBIDA = 'Limonada natural 500 ml';
const NUEVA = 'Limonada de pepino 500 ml';

interface Platillo {
  readonly id: string;
  readonly nombre: string;
  readonly area_preparacion: string;
  readonly visible_en_menu_digital: boolean;
}

async function platillo(duena: Page, nombre: string): Promise<Platillo | undefined> {
  const [fila] = await consultarPuente<Platillo>(duena, 'ProductoTerminado', {
    filtro: { nombre },
    limite: 1,
  });
  return fila;
}

async function escribir(duena: Page, datos: Record<string, unknown>): Promise<void> {
  const r = await duena.request.post('/api/datos/escribir', {
    headers: cabecerasDeEscrituraDePrueba(),
    data: datos,
  });
  expect(r.ok(), await r.text()).toBe(true);
}

async function resetear(duena: Page): Promise<void> {
  const r = await duena.request.post('/api/catalogo/demostracion/resetear', {
    headers: cabecerasDeEscrituraDePrueba(),
    data: { confirmacion: 'RESETEAR' },
  });
  expect(r.status(), await r.text()).toBe(200);
}

test.describe('Recetas y el área del platillo', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('editar la receta de una bebida no la manda a cocina ni la vuelve a enseñar', async ({
    browser,
  }, info) => {
    test.setTimeout(3 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    try {
      const duena = await equipo.pagina(info, 'dueno');
      const exigirSinFallos = vigilarFallos(duena);
      await resetear(duena);

      const antes = await platillo(duena, BEBIDA);
      expect(antes?.area_preparacion).toBe('barra');
      // Escondida del QR por la dueña: editar su receta no la puede volver a encender.
      await escribir(duena, {
        entidad: 'ProductoTerminado',
        operacion: 'update',
        id: antes?.id,
        datos: { visible_en_menu_digital: false },
      });

      await test.step('la dueña abre la receta de la limonada y la guarda', async () => {
        await duena.goto('/recetas');
        // Cada fila trae su «Editar receta»: se busca dentro de la de la limonada.
        const fila = duena.locator(`#receta-${antes?.id ?? ''}`);
        await fila
          .getByRole('button', { name: new RegExp(BEBIDA) })
          .first()
          .click();
        await fila.getByRole('button', { name: 'Editar receta' }).click();
        const dialogo = duena.getByRole('dialog', { name: 'Editar receta' });
        await expect(dialogo.getByText('Área de preparación')).toBeVisible();
        await expect(dialogo.getByRole('combobox', { name: 'Área de preparación' })).toHaveText(
          'Bebidas (barra)',
        );
        await dialogo.getByRole('button', { name: 'Guardar cambios' }).click();
        await expect(dialogo).toBeHidden({ timeout: 30_000 });
      });

      const despues = await platillo(duena, BEBIDA);
      expect(despues?.area_preparacion, 'La receta mandó la bebida a cocina.').toBe('barra');
      expect(
        despues?.visible_en_menu_digital,
        'La receta volvió a enseñar en el QR un platillo escondido.',
      ).toBe(false);
      exigirSinFallos();
    } finally {
      await equipo.cerrar();
    }
  });

  test('una receta nueva en Bebidas nace en la barra, aprendida de su categoría', async ({
    browser,
  }, info) => {
    test.setTimeout(3 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    try {
      const duena = await equipo.pagina(info, 'dueno');
      const exigirSinFallos = vigilarFallos(duena);
      await resetear(duena);

      await duena.goto('/recetas');
      await duena.getByRole('button', { name: 'Nueva receta' }).first().click();
      const dialogo = duena.getByRole('dialog', { name: 'Nueva receta' });
      await dialogo.getByPlaceholder('Ej: Capuchino').fill(NUEVA);
      await dialogo.getByPlaceholder('0.00').first().fill('45');
      await dialogo.getByRole('combobox').first().click();
      await duena.getByRole('option', { name: 'Bebidas', exact: true }).click();
      await expect(dialogo.getByRole('combobox', { name: 'Área de preparación' })).toHaveText(
        'Según su categoría',
      );
      await dialogo.getByRole('button', { name: 'Crear receta' }).click();
      await expect(dialogo).toBeHidden({ timeout: 30_000 });

      await expect
        .poll(async () => (await platillo(duena, NUEVA))?.area_preparacion, {
          message: 'La receta nueva de Bebidas no nació en la barra.',
        })
        .toBe('barra');
      exigirSinFallos();
      await resetear(duena);
    } finally {
      await equipo.cerrar();
    }
  });
});
