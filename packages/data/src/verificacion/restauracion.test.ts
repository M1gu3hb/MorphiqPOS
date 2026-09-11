import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ruta =
  process.env['MORPHIQPOS_RESTORE_DRILL_SOURCE_PATH'] ??
  resolve(process.cwd(), 'scripts/ensayar-restauracion.mjs');

describe('ensayo de restauracion', () => {
  it('queda fijado al proyecto MorphiqPOS y migra sólo el destino temporal', () => {
    const fuente = readFileSync(ruta, 'utf8');
    expect(fuente).toContain("const PROYECTO_MORPHIQPOS = 'wyqmzhliurwyxuyxznpb'");
    expect(fuente).toMatch(/['"]db['"],\s*['"]query/);
    expect(fuente).toContain("['db:migrate']");
    expect(fuente).toContain("MORPHIQPOS_SUPABASE_PROJECT_REF: ''");
  });

  it('compara filas y huellas antes de declarar éxito', () => {
    const fuente = readFileSync(ruta, 'utf8');
    expect(fuente).toContain('checksum');
    expect(fuente.match(/compararVerificacion\(/g)).toHaveLength(2);
    expect(fuente).toContain('pg_ctl');
    expect(fuente).toContain('finally');
  });
});
