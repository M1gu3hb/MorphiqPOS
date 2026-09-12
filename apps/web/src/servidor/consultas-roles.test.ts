import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { OpcionesConsulta } from './http.ts';

const FUENTE_HTTP =
  process.env['MORPHIQPOS_HTTP_SOURCE_PATH'] ??
  fileURLToPath(new URL('./http.ts', import.meta.url));

const RUTA_ACCESOS =
  process.env['MORPHIQPOS_ACCESOS_ROUTE_PATH'] ??
  fileURLToPath(new URL('../../app/api/identidad/accesos/route.ts', import.meta.url));

describe('C-8 · roles explícitos en consultas GET privadas', () => {
  it('hace obligatoria la decisión y ofrece una declaración pública explícita', () => {
    const privada = { roles: ['dueno'] } satisfies OpcionesConsulta;
    const publica = { roles: 'PUBLICA' } satisfies OpcionesConsulta;
    const fuente = readFileSync(FUENTE_HTTP, 'utf8');

    expect(privada.roles).toEqual(['dueno']);
    expect(publica.roles).toBe('PUBLICA');
    expect(fuente).toContain('readonly roles: readonly Rol[] | typeof PUBLICA');
    expect(fuente).toContain('opciones.roles !== PUBLICA');
    expect(fuente).toContain('rolPermitidoParaConsulta(sesion.sesion.rol, opciones.roles)');
    expect(fuente).not.toContain('opciones: OpcionesConsulta = {}');
  });

  it('C-9 · accesos sólo admite dueño y administrador', () => {
    const codigo = readFileSync(RUTA_ACCESOS, 'utf8');
    expect(codigo).toContain("roles: ['dueno', 'administrador']");
    expect(codigo).not.toContain('roles: ROLES');
  });
});
