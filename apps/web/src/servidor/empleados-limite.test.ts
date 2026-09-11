import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RUTA =
  process.env['MORPHIQPOS_EMPLOYEES_ROUTE_PATH'] ??
  fileURLToPath(new URL('../../app/api/auth/empleados/route.ts', import.meta.url));

describe('R-20 · límite de la plantilla anónima', () => {
  it('consume la cuota de entrada antes de enumerar empleados', () => {
    const fuente = readFileSync(RUTA, 'utf8');
    const limite = fuente.indexOf("permitir('entrar'");
    const consulta = fuente.indexOf('empleadosParaEntrar(');

    expect(limite).toBeGreaterThan(-1);
    expect(consulta).toBeGreaterThan(limite);
    expect(fuente).toContain('if (!permiso.ok)');
    expect(fuente).toContain('return json(429');
  });
});
