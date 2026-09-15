import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  fileURLToPath(new URL('./sql/054_separar_giro_paquete.sql', import.meta.url)),
  'utf8',
);

describe('054 · giro y paquete comercial', () => {
  it('conserva el giro anterior y migra el paquete a los tres valores comerciales', () => {
    expect(sql).toContain('add column giro text');
    expect(sql).toContain('set giro = paquete');
    expect(sql).toContain("when giro in ('cafeteria', 'restaurante') then 'restaurante_pro'");
    expect(sql).toContain("else 'operativo'");
  });

  it('cierra los dominios y la incompatibilidad de Restaurante Pro', () => {
    expect(sql).toContain("check (paquete in ('esencial', 'operativo', 'restaurante_pro'))");
    expect(sql).toContain("paquete <> 'restaurante_pro'");
    expect(sql).toContain("giro in ('cafeteria', 'restaurante')");
  });

  it('la restricción de unidades consulta el giro real', () => {
    expect(sql).toContain('select o.giro into giro');
    expect(sql).not.toContain('select paquete into giro');
  });
});
