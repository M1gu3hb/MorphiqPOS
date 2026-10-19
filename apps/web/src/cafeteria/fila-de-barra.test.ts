import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sigueEnLaFila } from './fila-de-barra';

/**
 * C.14 de la 2.4 · Los estados de `comandas` salen del `check` de la base, no de una
 * lista escrita a mano: si la migración añade uno, esta prueba lo ve.
 */
const MIGRACION = fileURLToPath(
  new URL('../../../../packages/data/src/migraciones/sql/082_fila_barra.sql', import.meta.url),
);

function estadosDeLaBase(): readonly string[] {
  const sql = readFileSync(MIGRACION, 'utf8');
  const lista = /comandas_estado_check check \(\s*estado in \(([^)]*)\)/.exec(sql)?.[1] ?? '';
  return [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? '');
}

describe('la fila de la barra', () => {
  it('sólo nuevo, en preparación y listo siguen en la fila; lo demás ya salió', () => {
    const estados = estadosDeLaBase();
    expect(estados).toContain('entregado');
    expect(estados.filter((e) => sigueEnLaFila(e))).toEqual(['nuevo', 'en_preparacion', 'listo']);
  });
});
