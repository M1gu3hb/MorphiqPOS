import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { INDICES_UNICOS_046, problemasDeSeguridad, type EstadoSeguridad } from './rls.ts';

const SCRIPT =
  process.env['MORPHIQPOS_RLS_VERIFY_SCRIPT_PATH'] ??
  fileURLToPath(new URL('../../../../scripts/verificar-rls.mjs', import.meta.url));
const CONTRATO_RLS =
  process.env['MORPHIQPOS_RLS_CONTRACT_SOURCE_PATH'] ??
  fileURLToPath(new URL('./rls.ts', import.meta.url));
const MIGRACION_046 = fileURLToPath(
  new URL('../migraciones/sql/046_restricciones_restaurante.sql', import.meta.url),
);
const MANIFIESTO =
  process.env['MORPHIQPOS_PACKAGE_JSON_PATH'] ??
  fileURLToPath(new URL('../../../../package.json', import.meta.url));

function leerScripts() {
  const documento: unknown = JSON.parse(readFileSync(MANIFIESTO, 'utf8'));
  if (typeof documento !== 'object' || documento === null || !('scripts' in documento)) {
    throw new Error('package.json no contiene scripts.');
  }
  const scripts = documento.scripts;
  if (typeof scripts !== 'object' || scripts === null) {
    throw new Error('package.json contiene scripts inválidos.');
  }
  return scripts;
}

describe('C-13 · verificación viva de RLS y grants', () => {
  it('detecta RLS desactivada, FORCE ausente y SELECT público', () => {
    const estado: EstadoSeguridad = {
      relaciones: [
        {
          clave: 'public.ordenes',
          tipo: 'tabla',
          rlsActiva: false,
          rlsForzada: true,
          selectAnon: false,
          selectAuthenticated: false,
        },
        {
          clave: 'public.pagos',
          tipo: 'tabla',
          rlsActiva: true,
          rlsForzada: false,
          selectAnon: false,
          selectAuthenticated: false,
        },
        {
          clave: 'public.empleados_visibles',
          tipo: 'vista',
          rlsActiva: null,
          rlsForzada: null,
          selectAnon: true,
          selectAuthenticated: true,
        },
      ],
      indices: INDICES_UNICOS_046.map((nombre) => ({ nombre, unico: true, valido: true })),
      funciones: [],
    };

    const problemas = problemasDeSeguridad(estado).join('\n');
    expect(problemas).toContain('public.ordenes: RLS no está activa');
    expect(problemas).toContain('public.pagos: RLS no está forzada');
    expect(problemas).toContain('public.empleados_visibles: anon conserva SELECT');
    expect(problemas).toContain('public.empleados_visibles: authenticated conserva SELECT');
  });

  it('detecta índices 046 ausentes, no únicos o inválidos', () => {
    const indices = INDICES_UNICOS_046.slice(1).map((nombre) => ({
      nombre,
      unico: nombre !== 'cortes_turno_folio_unico',
      valido: nombre !== 'liquidaciones_folio_unico',
    }));

    const problemas = problemasDeSeguridad({ relaciones: [], indices, funciones: [] }).join('\n');
    expect(problemas).toContain(`${INDICES_UNICOS_046[0]}: índice 046 ausente`);
    expect(problemas).toContain('cortes_turno_folio_unico: el índice no es único');
    expect(problemas).toContain('liquidaciones_folio_unico: el índice no es válido');
  });

  it('detecta EXECUTE heredado por anon o authenticated en cualquier función pública', () => {
    const problemas = problemasDeSeguridad({
      relaciones: [],
      indices: INDICES_UNICOS_046.map((nombre) => ({ nombre, unico: true, valido: true })),
      funciones: [
        {
          clave: 'public.clave_texto(text)',
          executeAnon: true,
          executeAuthenticated: true,
        },
      ],
    }).join('\n');

    expect(problemas).toContain('public.clave_texto(text): anon conserva EXECUTE');
    expect(problemas).toContain('public.clave_texto(text): authenticated conserva EXECUTE');
  });

  it('cubre todos los índices únicos declarados por la migración 046', () => {
    const sql = readFileSync(MIGRACION_046, 'utf8');
    const declarados = [...sql.matchAll(/create\s+unique\s+index\s+([a-z0-9_]+)/gi)].map(
      (coincidencia) => coincidencia[1],
    );

    expect(declarados.sort()).toEqual([...INDICES_UNICOS_046].sort());
  });

  it('consulta el catálogo requerido y está conectado a pnpm verify', () => {
    const fuente = readFileSync(SCRIPT, 'utf8');
    expect(fuente).toContain('c.relrowsecurity');
    expect(fuente).toContain('c.relforcerowsecurity');
    expect(fuente).toContain("has_table_privilege('anon'");
    expect(fuente).toContain("has_table_privilege('authenticated'");
    expect(fuente).toContain('x.indisunique');
    expect(fuente).toContain("has_function_privilege('anon'");
    expect(fuente).toContain("has_function_privilege('authenticated'");

    const contrato = readFileSync(CONTRATO_RLS, 'utf8');
    expect(contrato).toContain('if (relacion.rlsActiva !== true)');
    expect(contrato).toContain("'cortes_folio_unico'");

    const scripts = leerScripts();
    expect('verify:rls' in scripts && scripts['verify:rls']).toContain('verificar-rls.mjs');
    expect('verify' in scripts && scripts.verify).toContain('pnpm verify:rls');
  });
});
