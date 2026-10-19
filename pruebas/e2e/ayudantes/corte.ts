import { readFileSync } from 'node:fs';

import { expect, type Page } from '@playwright/test';

/**
 * EL PDF DEL CORTE, exigido de punta a punta (C.6 de la 2.4, F-234).
 *
 * No basta con que «se descargue algo». Se exige:
 *   1 · que el navegador BAJE un archivo `.pdf` que empieza por `%PDF` y pesa lo de una
 *       hoja rasterizada —un PDF vacío o una página de error guardada como PDF no pasa—;
 *   2 · que la hoja pintada (`#cash-cut-pdf-document`, lo que html2canvas captura) diga el
 *       título de SU giro y SU folio, y cada texto que el giro exige —el dinero dejado en
 *       caja, la sección que define su documento—.
 *
 * `pulsando` es para cuando la descarga sola espera algo que la prueba no hace —en la
 * cafetería espera el reparto del bote—: entonces se toca el botón, que es lo que haría
 * quien cierra.
 */
export async function exigirElPdfDelCorte(
  page: Page,
  exigido: {
    readonly titulo: string;
    readonly textos: readonly (string | RegExp)[];
    readonly pulsando?: boolean;
  },
): Promise<void> {
  const descarga = page.waitForEvent('download', { timeout: 60_000 });
  if (exigido.pulsando === true) {
    await page
      .getByRole('button', { name: 'Descargar el PDF del corte' })
      .click({ timeout: 30_000 });
  }
  const archivo = await descarga;

  expect(archivo.suggestedFilename(), 'El corte bajó con un nombre que no es de PDF.').toMatch(
    /\.pdf$/,
  );
  const ruta = await archivo.path();
  const bytes = readFileSync(ruta);
  expect(bytes.subarray(0, 4).toString('latin1'), 'Lo que bajó no es un PDF.').toBe('%PDF');
  expect(
    bytes.length,
    'El PDF del corte pesa como una hoja en blanco: html2canvas capturó un nodo vacío.',
  ).toBeGreaterThan(20_000);

  const hoja = page.locator('#cash-cut-pdf-document');
  await expect(hoja, 'No se pintó la hoja del corte que se captura.').toHaveCount(1);
  // `innerText` devuelve el texto como se VE: los rótulos van en mayúsculas por CSS. Se
  // compara sin distinguir mayúsculas, que es como lo lee quien tiene la hoja en la mano.
  const texto = (await hoja.innerText()).replace(/\s+/g, ' ').toUpperCase();
  expect(texto, `La hoja no dice «${exigido.titulo}».`).toContain(exigido.titulo.toUpperCase());
  expect(texto, 'La hoja no lleva folio.').toMatch(/FOLIO: [A-Z]+-\d+/);
  for (const debe of exigido.textos) {
    if (typeof debe === 'string') {
      expect(texto, `La hoja del corte no dice «${debe}».`).toContain(debe.toUpperCase());
    } else {
      expect(texto, `La hoja del corte no dice ${String(debe)}.`).toMatch(
        new RegExp(debe.source, `${debe.flags.replace('i', '')}i`),
      );
    }
  }
}

/**
 * EL CORTE, LEÍDO EN EL TELÉFONO DEL DUEÑO (D.6 de la 2.4): en «Cortes anteriores» hay una
 * TARJETA —en el teléfono la tabla no cabe y no se pinta— con lo que se contó y lo que sobró
 * o faltó, al centavo. Se busca por la diferencia, que es lo que el dueño busca con la vista.
 */
export async function exigirElCorteEnElTelefono(
  telefono: Page,
  corte: { readonly contadoCentavos: number; readonly diferenciaCentavos: number },
): Promise<void> {
  const historico = telefono.locator('section[aria-labelledby="cortes-anteriores"]');
  await expect(historico, 'El teléfono no enseñó los cortes anteriores.').toBeVisible({
    timeout: 30_000,
  });
  await expect(
    historico.getByRole('table'),
    'En el teléfono el histórico va en tarjetas: una tabla de cinco columnas no cabe.',
  ).toHaveCount(0);
  const palabra =
    corte.diferenciaCentavos === 0 ? 'Cuadra' : corte.diferenciaCentavos > 0 ? 'Sobra' : 'Falta';
  const tarjeta = historico
    .getByRole('listitem')
    .filter({ hasText: palabra })
    .filter({ hasText: enPesos(Math.abs(corte.diferenciaCentavos)) })
    .first();
  await expect(tarjeta, `No hay una tarjeta que diga «${palabra}».`).toBeVisible();
  await expect(tarjeta).toContainText(enPesos(corte.contadoCentavos));
}

/**
 * Pesos como los LEE `<Dinero>` —su `aria-label`—: «1,500 pesos con 00 centavos». Es como
 * se encuentra un importe en pantalla, porque a la vista va partido en tres `<span>`.
 */
export function enPalabras(centavos: number): string {
  const pesos = Math.trunc(Math.abs(centavos) / 100).toLocaleString('es-MX');
  const resto = String(Math.abs(centavos) % 100).padStart(2, '0');
  return `${pesos} pesos con ${resto} centavos`;
}

/** Pesos como los pinta la hoja: `$1,500.00`. */
export function enPesos(centavos: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
    centavos / 100,
  );
}
