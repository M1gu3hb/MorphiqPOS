import { expect, type Page, test } from '@playwright/test';

import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  consultarPuente,
  exigirDemostracion,
  irPorElMenu,
  menuLateral,
  soltarLaCaja,
} from './ayudantes/sesion.ts';

// EXPLORACIÓN TEMPORAL (se borra): qué hace hoy cada pantalla del restaurante.
const SLUG = 'demo-acople-restaurante';

async function paso(nombre: string, fn: () => Promise<void>): Promise<void> {
  try {
    await test.step(nombre, fn);
    console.log(`OK   ${nombre}`);
  } catch (e) {
    console.log(`FALLA ${nombre}: ${(e instanceof Error ? e.message : String(e)).slice(0, 600)}`);
  }
}

async function mesas(page: Page): Promise<string> {
  const filas = await consultarPuente<{
    numero?: number;
    estado?: string;
    venta_activa_id?: string | null;
  }>(page, 'Mesa', { limite: 20 });
  return filas
    .map((m) => `${String(m.numero)}:${m.estado ?? ''}:${(m.venta_activa_id ?? '-').slice(0, 6)}`)
    .join(' ');
}

async function ventas(page: Page): Promise<string> {
  const filas = await consultarPuente<Record<string, unknown>>(page, 'Venta', { limite: 20 });
  return filas
    .map(
      (v) =>
        `${String(v['folio'])}|${String(v['estado'])}|t=${String(v['total'])}|pt=${String(v['propina_tipo'])}|pp=${String(v['propina_porcentaje'])}|pm=${String(v['propina_monto'])}|padre=${String(v['orden_padre_id'] ?? '')}|${String(v['id']).slice(0, 6)}`,
    )
    .join('\n');
}


async function enviarPorApi(page: Page, numero: number, nombres: readonly string[]): Promise<string> {
  const ms = await consultarPuente<{ id?: string; numero?: number; venta_activa_id?: string | null }>(page, 'Mesa', { limite: 20 });
  const orden = ms.find((m) => m.numero === numero)?.venta_activa_id ?? '';
  const ps = await consultarPuente<{ id?: string; nombre?: string }>(page, 'ProductoTerminado', { limite: 300 });
  const lineas = nombres.map((n) => ({ productoId: ps.find((p) => p.nombre === n)?.id, cantidad: '1' }));
  const r = await page.request.post('/api/restaurante/enviar-pedido', { headers: cabecerasDeEscrituraDePrueba(), data: { ordenId: orden, lineas } });
  console.log('enviar por api', numero, r.status(), (await r.text()).slice(0, 200));
  return orden;
}

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test('exploración del restaurante', async ({ browser, playwright }, info) => {
  test.setTimeout(20 * 60_000);
  await exigirDemostracion(playwright, info, SLUG);
  const equipo = new Equipo(browser, SLUG);
  let rosa: Page | null = null;
  try {
    const dueno = await equipo.pagina(info, 'dueno');
    const r = await dueno.request.post('/api/catalogo/demostracion/resetear', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: { confirmacion: 'RESETEAR' },
    });
    console.log('reset', r.status());

    for (const rol of ['mesero', 'cajero', 'cocina', 'almacen', 'gerente'] as const) {
      const p = await equipo.pagina(info, rol);
      await p.goto('/');
      await p.waitForLoadState('networkidle').catch(() => undefined);
      const menu = await menuLateral(p).catch(() => null);
      const etiquetas =
        menu === null
          ? '(sin menú)'
          : (await menu.getByRole('link').allInnerTexts()).map((t) => t.trim()).join(' · ');
      console.log(`MENÚ ${rol} @ ${new URL(p.url()).pathname}: ${etiquetas}`);
    }

    rosa = await equipo.pagina(info, 'cajero');
    const cajera = rosa;
    await paso('Rosa abre la caja', async () => {
      await cajera.goto('/');
      await irPorElMenu(cajera, 'Caja', /Caja/);
      await cajera.locator('#caja-fondo').fill('1500');
      await cajera.getByRole('button', { name: 'Abrir caja' }).click();
      await expect(cajera.getByText('Pendientes')).toBeVisible({ timeout: 20_000 });
    });

    const lupita = await equipo.pagina(info, 'mesero');
    await paso('Lupita abre la mesa 1 y comanda', async () => {
      await lupita.goto('/');
      await irPorElMenu(lupita, 'Mesas', /Mesas/);
      await lupita
        .getByRole('region', { name: 'Mesas' })
        .getByRole('button', { name: /^1\b/ })
        .click();
      await lupita.getByRole('button', { name: 'Abrir la mesa' }).click();
      await lupita.getByRole('button', { name: /Orden de tacos al pastor/ }).click();
      await lupita.getByRole('button', { name: /Cerveza clara 355 ml/ }).click();
      await lupita.getByRole('button', { name: /^Abrir el pedido/ }).click();
      await lupita.getByRole('button', { name: 'ENVIAR A COCINA' }).click();
      await expect(lupita.getByRole('button', { name: 'ENVIAR A COCINA' })).toBeHidden();
      await lupita.screenshot({ path: `${info.outputDir}/mesa1.png` });
      console.log('mesa1 texto:', (await lupita.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 500));
      console.log('mesas', await mesas(dueno));
      const comandas = await consultarPuente<Record<string, unknown>>(dueno, 'PedidoPreparacion', { limite: 20 });
      console.log('comandas', JSON.stringify(comandas).slice(0, 800));
      await enviarPorApi(lupita, 1, ['Orden de tacos al pastor', 'Cerveza clara 355 ml']);
    });

    const tono = await equipo.pagina(info, 'cocina');
    await paso('Toño marca la comanda', async () => {
      await tono.goto('/');
      await irPorElMenu(tono, 'Cocinas', /Sin comandas|Nuevos|En preparación/i);
      console.log('cocina url', tono.url());
      console.log('cocina texto:', (await tono.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 500));
      await expect(tono.getByRole('button', { name: /— Mesa 1$/ }).first()).toBeVisible({
        timeout: 20_000,
      });
      const botones = tono.getByRole('button', { name: /— Mesa/ });
      console.log('botones cocina:', (await botones.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')))).join(' | '));
      for (let i = 0; i < 12; i += 1) {
        const b = tono.getByRole('button', { name: /— Mesa 1$/ }).first();
        if ((await b.count()) === 0) break;
        const n = await b.getAttribute('aria-label');
        await b.click();
        await tono.waitForTimeout(1200);
        console.log('clic', n);
      }
      console.log('cocina después:', (await tono.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 400));
    });

    await paso('Lupita pide la cuenta en el heredado con 10%', async () => {
      await lupita.goto('/');
      await irPorElMenu(lupita, 'Meseros', /Mesero/);
      await lupita.screenshot({ path: `${info.outputDir}/mesero.png` });
      const uno = lupita.getByText('1', { exact: true });
      console.log('candidatos "1":', await uno.count());
      await uno.first().click();
      await lupita.waitForTimeout(1500);
      console.log('mesero dialog:', (await lupita.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 900));
      await lupita.screenshot({ path: `${info.outputDir}/mesero-mesa.png` });
      await lupita.getByRole('button', { name: 'Solicitar cuenta' }).click();
      await lupita.getByRole('button', { name: /^10%/ }).click();
      await lupita.getByRole('button', { name: 'Aplicar' }).click();
      await expect(lupita.getByText('Pre-cuenta lista')).toBeVisible({ timeout: 20_000 });
      console.log('ventas\n', await ventas(dueno));
      console.log('mesas', await mesas(dueno));
    });

    await paso('Rosa ve la mesa 1 en caja y entra al cobro', async () => {
      await cajera.goto('/');
      await irPorElMenu(cajera, 'Caja', /Caja/);
      await cajera.screenshot({ path: `${info.outputDir}/caja.png` });
      await cajera.getByText(/Mesa 1/).first().click();
      await cajera.waitForURL(/\/restaurante\/cobro\?cuenta=/);
      await expect(cajera.getByText('Total a cobrar')).toBeVisible();
      await cajera.screenshot({ path: `${info.outputDir}/cobro.png` });
      console.log('cobro texto:', (await cajera.getByRole('region', { name: 'Cobro' }).innerText()).replace(/\s+/g, ' ').slice(0, 400));
    });

    await paso('Lupita abre la mesa 2, comanda; Beatriz divide', async () => {
      await lupita.goto('/');
      await irPorElMenu(lupita, 'Mesas', /Mesas/);
      await lupita
        .getByRole('region', { name: 'Mesas' })
        .getByRole('button', { name: /^2\b/ })
        .click();
      await lupita.getByRole('button', { name: 'Abrir la mesa' }).click();
      await lupita.getByRole('button', { name: /Sopa de tortilla/ }).click();
      await lupita.getByRole('button', { name: /Refresco de cola 355 ml/ }).click();
      await lupita.getByRole('button', { name: /^Abrir el pedido/ }).click();
      await lupita.getByRole('button', { name: 'ENVIAR A COCINA' }).click();
      await expect(lupita.getByRole('button', { name: 'ENVIAR A COCINA' })).toBeHidden();
      await enviarPorApi(lupita, 2, ['Sopa de tortilla', 'Refresco de cola 355 ml']);
      const beatriz = await equipo.pagina(info, 'gerente');
      await beatriz.goto('/');
      await irPorElMenu(beatriz, 'Mesas', /Mesas/);
      await beatriz
        .getByRole('region', { name: 'Mesas' })
        .getByRole('button', { name: /^2\b/ })
        .click();
      await beatriz.getByRole('button', { name: /^Abrir el pedido/ }).click();
      await beatriz.getByRole('button', { name: /^Dividir/ }).click();
      await beatriz.getByRole('button', { name: /^Añadir Sopa de tortilla a la cuenta 1/ }).click();
      await beatriz
        .getByRole('button', { name: /^Añadir Refresco de cola 355 ml a la cuenta 2/ })
        .click();
      await beatriz.getByRole('button', { name: /^Dividir en 2/ }).click();
      await expect(beatriz.getByRole('button', { name: /^Dividir en 2/ })).toBeHidden({
        timeout: 20_000,
      });
      console.log('ventas tras dividir\n', await ventas(dueno));
      console.log('mesas', await mesas(dueno));
      await cajera.goto('/');
      await irPorElMenu(cajera, 'Caja', /Caja/);
      console.log('caja tras dividir:', (await cajera.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 600));
    });

    await paso('Rosa abre el cierre y escribe lo contado', async () => {
      await cajera.goto('/');
      await irPorElMenu(cajera, 'Cierre y arqueo', /Cierre diario|No hay ninguna caja/);
      await cajera.locator('#contado').fill('1500');
      console.log('cierre:', (await cajera.getByRole('status').first().innerText()).replace(/\s+/g, ' '));
      await cajera.getByRole('button', { name: 'CERRAR CAJA' }).click();
      await cajera.waitForTimeout(3000);
      console.log('diálogo:', (await cajera.getByRole('dialog').innerText().catch(() => '(nada)')).replace(/\s+/g, ' ').slice(0, 500));
    });
  } finally {
    if (rosa !== null) console.log('caja:', await soltarLaCaja(rosa));
    await equipo.cerrar();
  }
});
