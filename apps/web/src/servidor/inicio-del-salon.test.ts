import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { abreEnLaAgenda } from './inicio-del-salon.ts';

/**
 * La casa de cada puesto en un salón (D.1 de la 2.4): la agenda para quien la puede leer,
 * y su propio inicio para quien no —el almacén recibía un 403 en su primera pantalla—.
 */
describe('quién abre en la agenda del salón', () => {
  it('la recepción, las estilistas y quien dirige', () => {
    for (const rol of ['cajero', 'mesero', 'gerente', 'administrador', 'dueno']) {
      expect(abreEnLaAgenda(rol), rol).toBe(true);
    }
  });

  it('el almacén NO: su puesto no lee la agenda y va a su inicio', () => {
    expect(abreEnLaAgenda('almacen')).toBe(false);
    expect(abreEnLaAgenda('cocina')).toBe(false);
  });
});

describe('la raíz de una estética usa esa respuesta', () => {
  it('`(interno)/page.tsx` manda al almacén a su inicio en vez de pintarle la agenda', () => {
    const pagina = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', '(interno)', 'page.tsx'),
      'utf8',
    ).replace(/\/\/.*$/gm, '');
    expect(pagina).toMatch(
      /paquete === 'estetica'\) \{\s*return abreEnLaAgenda\(sesion\.rol\) \? <AgendaDelDia \/> : <IrAlInicioDelRol \/>;/,
    );
  });
});
