import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ENTIDADES } from '@morphiqpos/domain/vocabulario';
import { describe, expect, it } from 'vitest';

/**
 * 059 · La lista de entidades de la base y la del dominio tienen que ser LA
 * MISMA.
 *
 * ── Por qué este contrato, y no una prueba de que el SQL «contiene» algo ────
 * El `check` de la tabla y el tipo `Entidad` del dominio son dos copias de la
 * misma lista. Cuando se añada una entidad nueva —«recurso» para el arquetipo
 * de espacio, «expediente» para el de salud— se va a añadir en un sitio y no en
 * el otro. Si se añade sólo al código, la base rechaza la personalización con
 * un error de restricción que nadie va a entender. Si se añade sólo a la base,
 * el negocio guarda una palabra que ninguna pantalla lee.
 *
 * Este contrato deriva la lista de AMBOS lados y los compara, así que el día
 * que alguien añada una entidad y olvide el otro sitio, falla aquí y no en
 * producción.
 */

const SQL = readFileSync(
  fileURLToPath(new URL('./sql/059_vocabulario_del_giro.sql', import.meta.url)),
  'utf8',
);

function entidadesDelCheck(): string[] {
  const bloque = /vocabulario_negocio_entidad_conocida check \(\s*entidad in \(([\s\S]*?)\)/.exec(
    SQL,
  );
  if (bloque?.[1] === undefined) throw new Error('No se encontró el check de entidades');
  return [...bloque[1].matchAll(/'(\w+)'/g)].map((m) => m[1] ?? '').sort();
}

describe('059 · el vocabulario de la base y el del dominio no pueden divergir', () => {
  it('el check se pudo leer: si no, la comparación de abajo sería vacía', () => {
    expect(entidadesDelCheck().length).toBeGreaterThan(0);
  });

  it('la base admite EXACTAMENTE las entidades que el dominio conoce', () => {
    expect(entidadesDelCheck()).toEqual([...ENTIDADES].sort());
  });

  it('el género es una columna con dominio cerrado', () => {
    // Deducirlo de la terminación escribiría «la día» tarde o temprano.
    expect(SQL).toMatch(/genero\s+text\s+not null/);
    expect(SQL).toContain("check (genero in ('femenino', 'masculino'))");
  });

  it('no se pueden guardar nombres vacíos', () => {
    // Un singular vacío deja un hueco donde debería ir el sustantivo, y se lee
    // peor que el nombre por omisión.
    expect(SQL).toMatch(/singular_no_vacio check \(length\(btrim\(singular\)\) > 0\)/);
    expect(SQL).toMatch(/plural_no_vacio check \(length\(btrim\(plural\)\) > 0\)/);
  });

  it('una sola personalización por entidad y negocio', () => {
    expect(SQL).toContain('primary key (organizacion_id, entidad)');
  });

  it('lleva RLS y revoca a los roles públicos', () => {
    expect(SQL).toContain('alter table vocabulario_negocio enable row level security');
    expect(SQL).toContain('alter table vocabulario_negocio force row level security');
    expect(SQL).toMatch(/revoke all privileges on table vocabulario_negocio/);
  });
});
