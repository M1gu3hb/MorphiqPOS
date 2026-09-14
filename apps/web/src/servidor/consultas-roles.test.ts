import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

const dobles = vi.hoisted(() => ({
  headers: vi.fn(),
  resolverSesion: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: dobles.headers }));

vi.mock('@morphiqpos/contracts', async () => {
  const original =
    await vi.importActual<typeof import('@morphiqpos/contracts')>('@morphiqpos/contracts');
  return {
    ...original,
    validarEntorno: () => ({ APP_URL: 'https://pos.example', SESSION_SECRET: 'secreto' }),
  };
});

vi.mock('@morphiqpos/app/sesion', () => ({ resolverSesion: dobles.resolverSesion }));

import { responderConsulta, type OpcionesConsulta } from './http.ts';

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

  it('ejecuta la autorización y responde 403 para una sesión fuera de la lista', async () => {
    dobles.headers.mockResolvedValueOnce(new Headers({ cookie: 'morphiqpos_sesion=firmada' }));
    dobles.resolverSesion.mockResolvedValueOnce({
      ok: true,
      ambito: {
        organizacionId: '11111111-1111-4111-8111-111111111111',
        sucursalId: '22222222-2222-4222-8222-222222222222',
        terminalId: '33333333-3333-4333-8333-333333333333',
        identidadId: '44444444-4444-4444-8444-444444444444',
        empleoId: '55555555-5555-4555-8555-555555555555',
        rol: 'cocina',
      },
      sesion: {
        organizacionId: '11111111-1111-4111-8111-111111111111',
        sucursalId: '22222222-2222-4222-8222-222222222222',
        terminalId: '33333333-3333-4333-8333-333333333333',
        identidadId: '44444444-4444-4444-8444-444444444444',
        empleoId: '55555555-5555-4555-8555-555555555555',
        rol: 'cocina',
        paquete: 'restaurante_pro',
        nombrePersona: 'Cocinera',
        nombreNegocio: 'MorphiqPOS',
        nombreSucursal: 'Centro',
      },
    });
    const consulta = vi.fn();

    const respuesta = await responderConsulta(consulta, {
      roles: ['dueno', 'administrador'],
    });

    expect(respuesta.status).toBe(403);
    await expect(respuesta.json()).resolves.toMatchObject({
      ok: false,
      error: { codigo: 'SIN_PERMISO' },
    });
    expect(consulta).not.toHaveBeenCalled();
  });
});
