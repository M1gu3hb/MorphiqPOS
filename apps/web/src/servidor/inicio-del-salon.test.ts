import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { abreEnLaAgenda, veLaListaDeEspera } from './inicio-del-salon.ts';

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

describe('quién lee la lista de espera en la agenda', () => {
  it('la recepción y quien dirige', () => {
    for (const rol of ['cajero', 'gerente', 'administrador', 'dueno']) {
      expect(veLaListaDeEspera(rol), rol).toBe(true);
    }
  });

  it('la estilista NO: abre la agenda, pero la lista es de la recepción', () => {
    expect(veLaListaDeEspera('mesero')).toBe(false);
    expect(veLaListaDeEspera('almacen')).toBe(false);
  });
});

describe('la raíz de una estética usa esa respuesta', () => {
  it('`(interno)/page.tsx` manda al almacén a su inicio en vez de pintarle la agenda', () => {
    const pagina = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', '(interno)', 'page.tsx'),
      'utf8',
    ).replace(/\/\/.*$/gm, '');
    expect(pagina).toMatch(
      /paquete === 'estetica'\) \{\s*return abreEnLaAgenda\(sesion\.rol\) \? \(\s*<AgendaDelDia veLaEspera=\{veLaListaDeEspera\(sesion\.rol\)\} \/>\s*\) : \(\s*<IrAlInicioDelRol \/>\s*\);/,
    );
  });
});
