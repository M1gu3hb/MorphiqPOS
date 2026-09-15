import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const SITIOS = [
  ['auditoria', 'packages/app/src/auditoria.ts', 'MORPHIQPOS_LOG_AUDITORIA_SOURCE_PATH'],
  ['comando', 'packages/app/src/comando.ts', 'MORPHIQPOS_LOG_COMANDO_SOURCE_PATH'],
  ['limite', 'packages/app/src/http/limite.ts', 'MORPHIQPOS_LOG_LIMITE_SOURCE_PATH'],
  [
    'portal comando',
    'packages/app/src/portal/comando-publico.ts',
    'MORPHIQPOS_LOG_PORTAL_COMANDO_SOURCE_PATH',
  ],
  ['portal http', 'packages/app/src/portal/http.ts', 'MORPHIQPOS_LOG_PORTAL_HTTP_SOURCE_PATH'],
  [
    'portal limite',
    'packages/app/src/portal/limite.ts',
    'MORPHIQPOS_LOG_PORTAL_LIMITE_SOURCE_PATH',
  ],
  ['http web', 'apps/web/src/servidor/http.ts', 'MORPHIQPOS_LOG_HTTP_WEB_SOURCE_PATH'],
  [
    'auth entrar',
    'apps/web/app/api/auth/entrar/route.ts',
    'MORPHIQPOS_LOG_AUTH_ENTRAR_SOURCE_PATH',
  ],
  [
    'auth empleados',
    'apps/web/app/api/auth/empleados/route.ts',
    'MORPHIQPOS_LOG_AUTH_EMPLEADOS_SOURCE_PATH',
  ],
  ['pool postgres', 'packages/data/src/cliente.ts', 'MORPHIQPOS_LOG_DATA_CLIENT_SOURCE_PATH'],
  ['purga de cuotas', 'packages/data/src/repos/limite.ts', 'MORPHIQPOS_LOG_DATA_LIMIT_SOURCE_PATH'],
] as const;

function leer(ruta: string, variable: string): string {
  return readFileSync(process.env[variable] ?? resolve(process.cwd(), ruta), 'utf8');
}

describe('adopcion del registro estructurado', () => {
  for (const [nombre, ruta, variable] of SITIOS) {
    it(`${nombre} entrega el error al registrador con contexto`, () => {
      const fuente = leer(ruta, variable);
      const inicio = fuente.indexOf('registrar({');
      const bloque = fuente.slice(inicio, inicio + 500);

      expect(fuente).not.toContain('console.error');
      expect(inicio).toBeGreaterThanOrEqual(0);
      expect(bloque).toContain('nivel:');
      expect(bloque).toContain('modulo:');
      expect(bloque).toMatch(/\bcorrelationId(?:\s*:|\s*,)/);
      expect(bloque).toContain('organizacionId:');
      expect(bloque).toContain('mensaje:');
    });
  }

  for (const [nombre, ruta, variable] of SITIOS.filter(([nombre]) => nombre.includes('limite'))) {
    it(`${nombre} eleva una alerta cuando falla el contador`, () => {
      expect(leer(ruta, variable)).toContain("nivel: 'alerta'");
    });
  }
});
