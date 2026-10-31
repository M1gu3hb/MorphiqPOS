import { readdirSync, readFileSync, statSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { join, relative } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { idAlAzar } from './id-al-azar';

/**
 * UN ID AL AZAR QUE TAMBIÉN SIRVE POR HTTP (DP-11.0).
 *
 * `crypto.randomUUID` sólo existe en un contexto seguro (https o `localhost`). Por la red del
 * local —la demo de los teléfonos y el servidor de la Fase C— la página va por http y la
 * función no está: el teléfono de cocina no podía preparar una comanda, el editor de botones
 * del menú QR no agregaba uno y el portal del comensal de `fase-b` no cargaba el menú.
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('idAlAzar', () => {
  it('sin randomUUID (http en la red del local) da un UUID v4 con el azar de getRandomValues', () => {
    const getRandomValues = vi.fn(<T extends Uint8Array>(a: T): T => webcrypto.getRandomValues(a));
    vi.stubGlobal('crypto', { getRandomValues });

    const ids = Array.from({ length: 500 }, () => idAlAzar());

    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getRandomValues).toHaveBeenCalledTimes(500);
  });

  it('con randomUUID (https) usa el del navegador', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '11111111-2222-4333-8444-555555555555',
      getRandomValues: () => {
        throw new Error('no debía usarse');
      },
    });

    expect(idAlAzar()).toBe('11111111-2222-4333-8444-555555555555');
  });
});

/**
 * Y NADIE MÁS LO LLAMA DIRECTO en lo que corre en el navegador: `apps/web/src` sin `servidor/`,
 * `apps/web/heredado` y las páginas de `apps/web/app` fuera de `api/` (Node siempre lo tiene).
 */
const WEB = process.cwd().endsWith('web') ? process.cwd() : join(process.cwd(), 'apps', 'web');
const PERMITIDO = 'src/cliente/id-al-azar.ts';

function archivosDelNavegador(): readonly string[] {
  const encontrados: string[] = [];
  const recorrer = (carpeta: string): void => {
    for (const entrada of readdirSync(carpeta)) {
      const completa = join(carpeta, entrada);
      const enWeb = relative(WEB, completa).split('\\').join('/');
      if (entrada === 'node_modules' || enWeb === 'src/servidor' || enWeb === 'app/api') continue;
      if (statSync(completa).isDirectory()) {
        recorrer(completa);
        continue;
      }
      if (/\.(jsx?|tsx?)$/.test(entrada) && !entrada.includes('.test.')) encontrados.push(enWeb);
    }
  };
  for (const carpeta of ['src', 'heredado', 'app']) recorrer(join(WEB, carpeta));
  return encontrados;
}

describe('contrato: randomUUID sólo por idAlAzar en el navegador', () => {
  it('ningún archivo del navegador llama crypto.randomUUID por su cuenta', () => {
    const archivos = archivosDelNavegador();
    // Anti-vacío: si el recorrido se rompe, no pasa en verde por no ver nada.
    expect(archivos.length).toBeGreaterThan(300);

    const directos = archivos.filter(
      (a) => a !== PERMITIDO && /randomUUID\s*\(/.test(readFileSync(join(WEB, a), 'utf8')),
    );
    expect(directos).toEqual([]);
    // Lee unos mil archivos: con la suite entera en paralelo pasa de los 5 s por omisión.
  }, 30_000);
});
