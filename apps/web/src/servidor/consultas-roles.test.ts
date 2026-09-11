import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const FUENTE_HTTP =
  process.env['MORPHIQPOS_HTTP_SOURCE_PATH'] ??
  fileURLToPath(new URL('./http.ts', import.meta.url));

const RUTAS_PRIVADAS = [
  'catalogo/sesion',
  'catalogo/categorias',
  'catalogo/configuracion',
  'catalogo/inicio',
  'catalogo/productos',
  'inventario/resumen',
  'inventario/recetas',
  'identidad/accesos',
] as const;
const RUTA_PRODUCTOS =
  process.env['MORPHIQPOS_CATALOGO_PRODUCTS_ROUTE_PATH'] ??
  fileURLToPath(new URL('../../app/api/catalogo/productos/route.ts', import.meta.url));
const RUTA_ACCESOS =
  process.env['MORPHIQPOS_ACCESOS_ROUTE_PATH'] ??
  fileURLToPath(new URL('../../app/api/identidad/accesos/route.ts', import.meta.url));

describe('C-8 · roles explícitos en consultas GET privadas', () => {
  it('el envoltorio comprueba el rol resuelto por la sesión', () => {
    expect(readFileSync(FUENTE_HTTP, 'utf8')).toContain(
      'rolPermitidoParaConsulta(sesion.sesion.rol, opciones.roles)',
    );
  });

  it.each(RUTAS_PRIVADAS)('%s declara una allowlist de roles', (ruta) => {
    const archivo =
      ruta === 'catalogo/productos'
        ? RUTA_PRODUCTOS
        : ruta === 'identidad/accesos'
          ? RUTA_ACCESOS
          : fileURLToPath(new URL(`../../app/api/${ruta}/route.ts`, import.meta.url));
    expect(readFileSync(archivo, 'utf8')).toMatch(/responderConsulta\([\s\S]*?roles:/);
  });

  it('C-9 · accesos sólo admite dueño y administrador', () => {
    const codigo = readFileSync(RUTA_ACCESOS, 'utf8');
    expect(codigo).toContain("roles: ['dueno', 'administrador']");
    expect(codigo).not.toContain('roles: ROLES');
  });
});
