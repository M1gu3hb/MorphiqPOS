import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, type Page, test } from '@playwright/test';

import { equipoDeDemo } from '../../packages/contracts/src/negocios/equipo-demo.ts';

import { Equipo, giroDeLaDemo, type RolDePrueba } from './ayudantes/roles.ts';
import { cabecerasDeEscrituraDePrueba, exigirDemostracion } from './ayudantes/sesion.ts';

/**
 * LA MATRIZ DE PERMISOS, contra el servidor (D.3 de la 2.4).
 *
 * `matriz-de-permisos.json` sale del código (`scripts/generar-matriz-de-permisos.mjs`): cada
 * ruta de comando con los roles que su comando declara. Aquí, con la sesión de CADA persona
 * de CADA demo, se le manda a cada ruta un cuerpo vacío:
 *
 *   · si el rol NO está en el comando → 403 `SIN_PERMISO`, y nada más;
 *   · si el rol SÍ está → cualquier cosa MENOS `SIN_PERMISO` (normalmente 400 de zod: el
 *     cuerpo vacío no llega a escribir nada, así que esto es seguro contra cualquier base).
 *
 * Y dos reglas que el dueño dice en voz alta y que se comprueban aparte:
 *   · la cocina nunca ve costos —ni en el puente, ni en el menú—;
 *   · el almacén no toca la caja.
 *
 * Las demos se piden por el entorno (`MORPHIQPOS_DEMOS_MATRIZ`, separadas por coma): en CI
 * corre la del trabajo; con todas, una corrida recorre las cinco.
 */

interface RutaDeLaMatriz {
  readonly ruta: string;
  readonly comando: string;
  readonly roles: readonly string[];
  readonly paquetes: readonly string[];
}

const MATRIZ = JSON.parse(
  readFileSync(join('pruebas', 'e2e', 'matriz-de-permisos.json'), 'utf8'),
) as { readonly incluidas: readonly RutaDeLaMatriz[] };

const DEMOS = (process.env['MORPHIQPOS_DEMOS_MATRIZ'] ?? process.env['MORPHIQPOS_ORG_DEMO'] ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s !== '');

/** El rol de la sesión tal como lo llama el comando. El dueño de demo entra como dueño. */
const ROLES_DE_PRUEBA: readonly RolDePrueba[] = [
  'dueno',
  'gerente',
  'cajero',
  'mesero',
  'cocina',
  'almacen',
];

interface Contestacion {
  readonly estado: number;
  readonly codigo: string;
}

async function tocar(page: Page, ruta: string): Promise<Contestacion> {
  const respuesta = await page.request.post(ruta, {
    headers: cabecerasDeEscrituraDePrueba(),
    data: {},
  });
  let codigo = '';
  try {
    codigo = ((await respuesta.json()) as { error?: { codigo?: string } }).error?.codigo ?? '';
  } catch {
    // Un cuerpo que no es JSON: el estado basta para decidir.
  }
  return { estado: respuesta.status(), codigo };
}

for (const slug of DEMOS) {
  test.describe(`matriz de permisos · ${slug}`, () => {
    test.beforeAll(async ({ playwright }, info) => {
      await exigirDemostracion(playwright, info, slug);
    });

    test('cada rol puede exactamente lo que su comando declara', async ({ browser }, info) => {
      test.setTimeout(15 * 60_000);
      const equipo = new Equipo(browser, slug);
      const roles = ROLES_DE_PRUEBA.filter(
        (rol) => rol === 'dueno' || equipoDeDemo(giroDeLaDemo(slug)).some((e) => e.rol === rol),
      );
      const fallas: string[] = [];
      let tocadas = 0;
      try {
        for (const rol of roles) {
          const page = await equipo.pagina(info, rol);
          for (const entrada of MATRIZ.incluidas) {
            const contestacion = await tocar(page, entrada.ruta);
            tocadas += 1;
            // El dueño de demo entra como `dueno`; el comando lo admite si declara `dueno`.
            const puede = entrada.roles.includes(rol);
            const negado = contestacion.estado === 403 && contestacion.codigo === 'SIN_PERMISO';
            if (!puede && !negado) {
              fallas.push(
                `${rol} → ${entrada.ruta} (${entrada.comando}): debía ser 403 SIN_PERMISO y fue ` +
                  `${String(contestacion.estado)} ${contestacion.codigo}`,
              );
            }
            if (puede && contestacion.codigo === 'SIN_PERMISO') {
              fallas.push(
                `${rol} → ${entrada.ruta} (${entrada.comando}): el comando lo admite y el servidor ` +
                  'contestó SIN_PERMISO',
              );
            }
            if (contestacion.estado >= 500) {
              fallas.push(`${rol} → ${entrada.ruta}: reventó con ${String(contestacion.estado)}`);
            }
          }
        }
      } finally {
        await equipo.cerrar();
      }
      info.annotations.push({
        type: 'matriz',
        description: `${slug}: ${String(tocadas)} combinaciones rol × ruta · ${String(fallas.length)} fallas`,
      });
      expect(fallas, fallas.join('\n')).toEqual([]);
    });

    test('la cocina nunca ve costos', async ({ browser }, info) => {
      const giro = giroDeLaDemo(slug);
      test.skip(
        !equipoDeDemo(giro).some((e) => e.rol === 'cocina'),
        `${slug} no tiene a nadie en cocina: no hay a quién preguntarle.`,
      );
      const equipo = new Equipo(browser, slug);
      try {
        const cocina = await equipo.pagina(info, 'cocina');
        for (const entidad of ['Venta', 'ProductoTerminado', 'Ingrediente']) {
          const respuesta = await cocina.request.post('/api/datos/consultar', {
            headers: cabecerasDeEscrituraDePrueba(),
            data: { entidad, limite: 5 },
          });
          if (respuesta.status() === 403) continue;
          expect(respuesta.status(), `${entidad} para la cocina`).toBe(200);
          const filas =
            ((await respuesta.json()) as { datos?: Record<string, unknown>[] }).datos ?? [];
          for (const fila of filas) {
            const conCosto = Object.entries(fila).filter(
              ([clave, valor]) =>
                /costo|utilidad|margen/i.test(clave) && valor !== null && valor !== undefined,
            );
            expect(
              conCosto.map(([clave]) => clave),
              `La cocina lee ${entidad} con costos: ${conCosto.map(([c]) => c).join(', ')}.`,
            ).toEqual([]);
          }
        }
        await cocina.goto('/');
        await expect(
          cocina.getByRole('link', { name: /Costos|Utilidad|Rentabilidad/ }),
        ).toHaveCount(0);
      } finally {
        await equipo.cerrar();
      }
    });

    test('el almacén no toca la caja', async ({ browser }, info) => {
      const equipo = new Equipo(browser, slug);
      try {
        const almacen = await equipo.pagina(info, 'almacen');
        const deCaja = MATRIZ.incluidas.filter((e) => e.comando.startsWith('caja.'));
        expect(deCaja.length, 'La matriz no trae ninguna ruta de caja.').toBeGreaterThan(5);
        for (const { ruta, roles } of deCaja) {
          expect(roles, `${ruta} admite al almacén en el código`).not.toContain('almacen');
          const contestacion = await tocar(almacen, ruta);
          expect(contestacion, `el almacén en ${ruta}`).toEqual({
            estado: 403,
            codigo: 'SIN_PERMISO',
          });
        }
        await almacen.goto('/');
        await expect(almacen.getByRole('link', { name: /^(Caja|Cobrar|Cortes)$/ })).toHaveCount(0);
      } finally {
        await equipo.cerrar();
      }
    });
  });
}
