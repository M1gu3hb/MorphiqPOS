import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, type Page, test } from '@playwright/test';

import { DEMOS as DEMOS_CONOCIDAS } from '../../packages/contracts/src/negocios/index.ts';

import { Equipo, giroDeLaDemo } from './ayudantes/roles.ts';
import { cabecerasDeEscrituraDePrueba, exigirDemostracion } from './ayudantes/sesion.ts';

/**
 * EL AISLAMIENTO ENTRE NEGOCIOS, contra el servidor (D.4 de la 2.4).
 *
 * El dueño de una demo pide recursos de OTRA demo por su id —por el puente y por cada ruta
 * de comando que recibe ids— y la respuesta tiene que ser INDISTINGUIBLE de la de un id que
 * no existe: mismo estado, mismo código, mismo mensaje. Un «esa orden es de otro negocio»
 * ya dice que existe; un 200 donde el id al azar da 404 es una fuga.
 *
 * Las rutas, sus cuerpos y a qué tabla apunta cada id salen del código
 * (`scripts/generar-rutas-de-aislamiento.mjs` → `aislamiento.json`). Los ids de la otra demo
 * se leen con la sesión de SU dueño —y se comprueba que él sí los ve: un id que nadie ve no
 * prueba nada—.
 *
 * Y la entrada del bloque A: la lista de personas de cada negocio es sólo suya.
 *
 * Las demos se piden por el entorno (`MORPHIQPOS_DEMOS_AISLAMIENTO`, separadas por coma; por
 * omisión las cinco). Hacen falta dos.
 */

interface RutaConIds {
  readonly ruta: string;
  readonly comando: string;
  readonly escribe: boolean;
  readonly roles: readonly string[];
  readonly paquetes: readonly string[];
  readonly idRequerido: boolean;
  readonly cuerpo: unknown;
  readonly ids: readonly { readonly camino: string; readonly tabla: string | null }[];
}

const DATOS = JSON.parse(readFileSync(join('pruebas', 'e2e', 'aislamiento.json'), 'utf8')) as {
  readonly entidades: readonly { readonly entidad: string; readonly tabla: string }[];
  readonly rutas: readonly RutaConIds[];
};

const DEMOS = (
  process.env['MORPHIQPOS_DEMOS_AISLAMIENTO'] ?? DEMOS_CONOCIDAS.map((d) => d.slug).join(',')
)
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s !== '');

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const FECHA = /\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?/g;

/** La respuesta sin lo que cambia de una petición a otra: ids, fechas y correlación. */
function huella(estado: number, cuerpo: unknown): string {
  const texto = JSON.stringify(cuerpo, (clave, valor: unknown) =>
    clave === 'correlationId' ? undefined : valor,
  );
  return `${String(estado)} ${(texto ?? '').replace(UUID, '⟨id⟩').replace(FECHA, '⟨fecha⟩')}`;
}

async function pedir(page: Page, ruta: string, cuerpo: unknown): Promise<string> {
  const respuesta = await page.request.post(ruta, {
    headers: cabecerasDeEscrituraDePrueba(),
    data: cuerpo,
  });
  const leido: unknown = await respuesta.json().catch(() => null);
  return huella(respuesta.status(), leido);
}

/** La plantilla con sus marcas llenas: `⟨tabla⟩`, `⟨?⟩`, `⟨hoy⟩`, `⟨ahora⟩`. */
function llenar(plantilla: unknown, idDe: (tabla: string) => string): unknown {
  if (typeof plantilla === 'string') {
    const marca = /^⟨(.+)⟩$/.exec(plantilla)?.[1];
    if (marca === undefined) return plantilla;
    if (marca === '?') return randomUUID();
    if (marca === 'ahora') return new Date().toISOString();
    if (marca === 'hoy') return new Date().toLocaleDateString('en-CA');
    return idDe(marca);
  }
  if (Array.isArray(plantilla)) return plantilla.map((v) => llenar(v, idDe));
  if (typeof plantilla === 'object' && plantilla !== null) {
    return Object.fromEntries(Object.entries(plantilla).map(([k, v]) => [k, llenar(v, idDe)]));
  }
  return plantilla;
}

async function primerId(page: Page, entidad: string, filtro?: object): Promise<string | null> {
  const respuesta = await page.request.post('/api/datos/consultar', {
    headers: cabecerasDeEscrituraDePrueba(),
    data: { entidad, operacion: 'listar', limite: 1, ...(filtro === undefined ? {} : { filtro }) },
  });
  if (respuesta.status() !== 200) return null;
  // El puente contesta el arreglo pelado o `{ filas }`, según la entidad (`consultarPuente`).
  const cuerpo = (await respuesta.json()) as {
    datos?: { id?: string }[] | { filas?: { id?: string }[] };
  };
  const filas = Array.isArray(cuerpo.datos) ? cuerpo.datos : cuerpo.datos?.filas;
  return filas?.[0]?.id ?? null;
}

/** Un id de cada tabla de la otra demo, leído con la sesión de SU dueño. */
async function idsDeLaOtra(page: Page, slug: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const { entidad, tabla } of DATOS.entidades) {
    const id = await primerId(page, entidad);
    if (id !== null) ids.set(tabla, id);
  }
  const personas = await page.request.get(`/api/auth/empleados?negocio=${slug}`);
  const lista = (await personas.json()) as { datos?: { usuarios?: { id: string }[] } };
  const persona = lista.datos?.usuarios?.at(-1)?.id;
  if (persona !== undefined) ids.set('empleos', persona);
  return ids;
}

/** El puente: cada entidad de la otra demo, pedida por su id, no trae nada. */
async function revisarElPuente(
  propia: Page,
  ajena: Page,
  ids: Map<string, string>,
): Promise<{ readonly fallas: string[]; readonly probadas: number }> {
  const fallas: string[] = [];
  let probadas = 0;
  for (const { entidad, tabla } of DATOS.entidades) {
    const id = ids.get(tabla);
    if (id === undefined) continue;
    // El control: su dueño SÍ la ve por ese id. Si no, la entidad no filtra por id.
    if ((await primerId(ajena, entidad, { id })) !== id) continue;
    probadas += 1;
    const conAjeno = await pedir(propia, '/api/datos/consultar', {
      entidad,
      operacion: 'listar',
      filtro: { id },
    });
    const conNinguno = await pedir(propia, '/api/datos/consultar', {
      entidad,
      operacion: 'listar',
      filtro: { id: randomUUID() },
    });
    if (conAjeno !== conNinguno) fallas.push(`puente ${entidad}: ${conAjeno} ≠ ${conNinguno}`);
  }
  return { fallas, probadas };
}

interface CuentaDeRutas {
  readonly fallas: string[];
  probadas: number;
  conIdAjeno: number;
  pasaronZod: number;
  saltadas: number;
}

/** Cada ruta de comando, con los ids de la otra demo y con ids que no existen. */
async function revisarLasRutas(
  propia: Page,
  paquete: string,
  ids: Map<string, string>,
): Promise<CuentaDeRutas> {
  const cuenta: CuentaDeRutas = {
    fallas: [],
    probadas: 0,
    conIdAjeno: 0,
    pasaronZod: 0,
    saltadas: 0,
  };
  for (const ruta of DATOS.rutas) {
    const aplica = ruta.paquetes.includes(paquete) && ruta.roles.includes('dueno');
    // Un comando que escribe y cuyos ids son opcionales podría escribir con el id al azar.
    if (!aplica || (ruta.escribe && !ruta.idRequerido)) {
      cuenta.saltadas += 1;
      continue;
    }
    cuenta.probadas += 1;
    if (ruta.ids.some((i) => i.tabla !== null && ids.has(i.tabla))) cuenta.conIdAjeno += 1;
    const conAjeno = await pedir(
      propia,
      ruta.ruta,
      llenar(ruta.cuerpo, (tabla) => ids.get(tabla) ?? randomUUID()),
    );
    const conNinguno = await pedir(
      propia,
      ruta.ruta,
      llenar(ruta.cuerpo, () => randomUUID()),
    );
    if (!conNinguno.startsWith('400 ')) cuenta.pasaronZod += 1;
    if (conAjeno !== conNinguno) {
      cuenta.fallas.push(`${ruta.ruta} (${ruta.comando}): ${conAjeno} ≠ ${conNinguno}`);
    }
  }
  return cuenta;
}

test.describe('el aislamiento entre negocios', () => {
  test.skip(DEMOS.length < 2, 'Hacen falta dos demos para pedir lo de una desde la otra.');
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test('ningún negocio ve el personal de otro en su entrada', async ({ request }) => {
    const vistos = new Map<string, string>();
    for (const slug of DEMOS) {
      const respuesta = await request.get(`/api/auth/empleados?negocio=${slug}`);
      expect(respuesta.status(), slug).toBe(200);
      const lista = (await respuesta.json()) as {
        datos?: { usuarios?: { id: string; negocioSlug?: string }[] };
      };
      const usuarios = lista.datos?.usuarios ?? [];
      expect(usuarios.length, `${slug} enseña a su gente`).toBeGreaterThan(0);
      for (const u of usuarios) {
        expect(u.negocioSlug, `${u.id} en la entrada de ${slug}`).toBe(slug);
        expect(vistos.get(u.id), `${u.id} aparece en dos negocios`).toBeUndefined();
        vistos.set(u.id, slug);
      }
    }
  });

  for (const [i, propio] of DEMOS.entries()) {
    const ajeno = DEMOS[(i + 1) % DEMOS.length] ?? propio;
    test(`${propio} no ve nada de ${ajeno}`, async ({ browser, playwright }, info) => {
      test.setTimeout(20 * 60_000);
      await exigirDemostracion(playwright, info, propio);
      await exigirDemostracion(playwright, info, ajeno);
      const nuestro = new Equipo(browser, propio);
      const suyo = new Equipo(browser, ajeno);
      try {
        const propia = await nuestro.pagina(info, 'dueno');
        const ajena = await suyo.pagina(info, 'dueno');
        const ids = await idsDeLaOtra(ajena, ajeno);
        const puente = await revisarElPuente(propia, ajena, ids);
        const rutas = await revisarLasRutas(propia, giroDeLaDemo(propio), ids);
        info.annotations.push({
          type: 'aislamiento',
          description:
            `${propio} ← ${ajeno}: ${String(ids.size)} tablas con id ajeno · puente ` +
            `${String(puente.probadas)} entidades · rutas ${String(rutas.probadas)} probadas ` +
            `(${String(rutas.conIdAjeno)} con id ajeno, ${String(rutas.pasaronZod)} pasaron ` +
            `zod), ${String(rutas.saltadas)} fuera`,
        });
        // Un piso, no una meta: una demo recién reseteada tiene filas en una decena de tablas.
        expect(
          puente.probadas,
          'entidades del puente con un id de la otra demo',
        ).toBeGreaterThanOrEqual(8);
        const fallas = [...puente.fallas, ...rutas.fallas];
        expect(fallas, fallas.join('\n')).toEqual([]);
      } finally {
        await nuestro.cerrar();
        await suyo.cerrar();
      }
    });
  }
});
