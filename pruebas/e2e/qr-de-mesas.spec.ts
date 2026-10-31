import { readFile } from 'node:fs/promises';

import { expect, type Download, type Page, test } from '@playwright/test';
import jsQR from 'jsqr';

import { configuracionDelNegocio } from './ayudantes/mesas-heredadas.ts';
import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  consultarPuente,
  exigirDemostracion,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * DP-9.8 · LOS QR DE LAS MESAS CON DISEÑO.
 *
 * La dueña diseña los QR de todas las mesas (un diseño que no se leería no se deja guardar),
 * personaliza una mesa y la regresa al diseño general, y saca el PDF de todas y el PNG y el SVG
 * de una. El PNG se lee aquí con un lector aparte y tiene que decir la dirección de SU mesa: el
 * contenido del QR nunca cambia.
 */

const SLUG = 'demo-acople-restaurante';
/** 60 mm a 300 ppp. */
const PNG_DE_60_MM = 709;

interface QrGuardado {
  readonly general: { readonly modulo: string; readonly marco: { readonly tipo: string } | null };
  readonly porMesa: Readonly<Record<string, unknown>>;
}

async function elegir(page: Page, etiqueta: string, opcion: string) {
  await page.getByRole('combobox', { name: etiqueta, exact: true }).click();
  await page.getByRole('option', { name: opcion, exact: true }).click();
}

async function contenidoDe(descarga: Download): Promise<Buffer> {
  const ruta = await descarga.path();
  return readFile(ruta);
}

/** El PNG pintado en el navegador y leído con jsQR aquí, fuera de la aplicación. */
async function leerPng(page: Page, png: Buffer): Promise<string | null> {
  const { ancho, alto, datos } = await page.evaluate(async (b64) => {
    const imagen = new Image();
    imagen.src = `data:image/png;base64,${b64}`;
    await imagen.decode();
    const lienzo = document.createElement('canvas');
    lienzo.width = imagen.naturalWidth;
    lienzo.height = imagen.naturalHeight;
    const ctx = lienzo.getContext('2d');
    if (ctx === null) throw new Error('sin lienzo');
    ctx.drawImage(imagen, 0, 0);
    const pixeles = ctx.getImageData(0, 0, lienzo.width, lienzo.height).data;
    let binario = '';
    for (let i = 0; i < pixeles.length; i += 0x8000) {
      binario += String.fromCharCode(...pixeles.subarray(i, i + 0x8000));
    }
    return { ancho: lienzo.width, alto: lienzo.height, datos: btoa(binario) };
  }, png.toString('base64'));
  const rgba = new Uint8ClampedArray(Buffer.from(datos, 'base64'));
  return jsQR(rgba, ancho, alto, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

test.describe('los QR de las mesas con diseño', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('la dueña diseña los QR, personaliza una mesa, la restablece e imprime lo que se lee', async ({
    browser,
  }, info) => {
    test.setTimeout(6 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    try {
      const duena = await equipo.pagina(info, 'dueno');
      const sinFallos = vigilarFallos(duena);
      const reseteo = await duena.request.post('/api/catalogo/demostracion/resetear', {
        headers: cabecerasDeEscrituraDePrueba(),
        data: { confirmacion: 'RESETEAR' },
      });
      expect(reseteo.status(), `resetear_demo: ${await reseteo.text()}`).toBe(200);

      await duena.goto('/portal-qr');
      await duena.getByRole('tab', { name: 'Mesas QR' }).click();
      duena.once('dialog', (aviso) => void aviso.accept());
      await duena.getByRole('button', { name: 'Generar tokens faltantes' }).click();
      const panel = duena.getByRole('region', { name: 'Diseño de los QR' });
      await expect(panel.getByRole('button', { name: /PDF de todas \([1-9]\d*\)/ })).toBeEnabled();
      const mesaUno = duena.getByRole('group', { name: 'Diseño del QR de la mesa 1', exact: true });

      await test.step('un diseño que no se leería no se deja guardar; uno que sí, se guarda', async () => {
        await panel.getByRole('button', { name: 'Diseñar los QR' }).click();
        const editor = duena.getByRole('dialog', { name: 'Diseño general de los QR' });
        await elegir(duena, 'Módulos', 'Puntos');
        await editor.getByLabel('Tinta', { exact: true }).fill('#eeeeee');
        await expect(editor.getByRole('alert')).toContainText('no se leería');
        await expect(editor.getByRole('button', { name: 'Guardar diseño' })).toBeDisabled();

        await editor.getByLabel('Tinta', { exact: true }).fill('#5b2a0e');
        await elegir(duena, 'Marco', 'Banda inferior · Etiquetas');
        await expect(editor.getByRole('status')).toContainText('Se lee: tal cual', {
          timeout: 30_000,
        });
        await editor.getByRole('button', { name: 'Guardar diseño' }).click();
        await expect(editor).toBeHidden();
        await expect
          .poll(async () => {
            const qr = (await configuracionDelNegocio(duena))['qr_de_mesas'] as QrGuardado;
            return [qr.general.modulo, qr.general.marco?.tipo];
          })
          .toEqual(['dots', 'band']);
      });

      await test.step('una mesa con su propio diseño, y de regreso al general', async () => {
        const [mesa] = await consultarPuente<{ id: string }>(duena, 'Mesa', {
          filtro: { numero: 1 },
          limite: 1,
        });
        await mesaUno.getByRole('button', { name: 'Personalizar' }).click();
        const editor = duena.getByRole('dialog', { name: 'QR de la mesa 1' });
        await elegir(duena, 'Esquinas', 'Hojas');
        await expect(editor.getByRole('status')).toContainText('Se lee: tal cual', {
          timeout: 30_000,
        });
        await editor.getByRole('button', { name: 'Guardar diseño' }).click();
        await expect(editor).toBeHidden();
        await expect(mesaUno.getByText('Diseño propio')).toBeVisible();
        await expect
          .poll(async () => {
            const qr = (await configuracionDelNegocio(duena))['qr_de_mesas'] as QrGuardado;
            return Object.keys(qr.porMesa);
          })
          .toEqual([mesa?.id]);

        await mesaUno.getByRole('button', { name: 'Restablecer al diseño general' }).click();
        await expect(mesaUno.getByText('Diseño propio')).toBeHidden();
        await expect
          .poll(async () => {
            const qr = (await configuracionDelNegocio(duena))['qr_de_mesas'] as QrGuardado;
            return Object.keys(qr.porMesa);
          })
          .toEqual([]);
      });

      await test.step('el PDF de todas las mesas sale revisado', async () => {
        const descarga = duena.waitForEvent('download', { timeout: 120_000 });
        await panel.getByRole('button', { name: /PDF de todas/ }).click();
        const pdf = await descarga;
        expect(pdf.suggestedFilename()).toBe('QR-de-las-mesas.pdf');
        const bytes = await contenidoDe(pdf);
        expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
        expect(bytes.length).toBeGreaterThan(20_000);
      });

      await test.step('el PNG y el SVG de una mesa: a su tamaño, y el PNG dice SU dirección', async () => {
        const tarjeta = duena.locator('.premium-sheen', { has: mesaUno });
        await tarjeta.getByRole('button', { name: 'Ver QR' }).click();
        const dialogo = duena.getByRole('dialog', { name: /QR Mesa 1/ });
        const direccion = ((await dialogo.locator('p.break-all').textContent()) ?? '').trim();
        expect(direccion).toMatch(/\/qr\/[\w-]{20,}$/);

        const descargaPng = duena.waitForEvent('download', { timeout: 60_000 });
        await dialogo.getByRole('button', { name: 'PNG' }).click();
        const png = await contenidoDe(await descargaPng);
        expect(png.readUInt32BE(16), 'ancho del PNG').toBe(PNG_DE_60_MM);
        expect(await leerPng(duena, png)).toBe(direccion);

        const descargaSvg = duena.waitForEvent('download', { timeout: 60_000 });
        await dialogo.getByRole('button', { name: 'SVG' }).click();
        const svg = await descargaSvg;
        expect(svg.suggestedFilename()).toBe('QR-Mesa-1.svg');
        expect((await contenidoDe(svg)).toString('utf8')).toMatch(/^<svg [^>]*width="60mm"/);
      });

      sinFallos();
    } finally {
      await equipo.cerrar();
    }
  });
});
