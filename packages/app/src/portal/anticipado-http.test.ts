import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Las rutas públicas del pedido anticipado (auditoría de la 2.4).
 *
 * Dos peticiones con la misma clave a la vez: la segunda chocaba con
 * `ordenes_idempotencia` y le contestaba 500 a quien sí había apartado. Y el orden de las
 * comprobaciones: la clave obligatoria, el límite por IP antes de todo, el slug con forma
 * antes de buscarlo y el cupo del negocio sólo para un negocio que existe.
 */

const llamadas: string[] = [];
let choques = 0;
let restriccion = 'ordenes_idempotencia';

vi.mock('@morphiqpos/data', () => ({
  obtenerDb: () => ({}),
  conTransaccion: async (fn: (tx: unknown) => Promise<unknown>) => {
    if (choques > 0) {
      choques -= 1;
      llamadas.push('chocó');
      throw Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: restriccion,
      });
    }
    llamadas.push('apartó');
    return fn({});
  },
}));
vi.mock('./anticipado.ts', async (original) => ({
  ...(await original<typeof import('./anticipado.ts')>()),
  apartarAnticipado: async () => ({ pedidoId: 'p1', ordenId: 'o1', nombre: 'Ana' }),
}));

const { apartarOElQueYaHay } = await import('./anticipado-http.ts');

const NEGOCIO = { organizacionId: 'org', sucursalId: 'suc' };
const ENTRADA = { nombre: 'Ana', horaPrometida: '2026-09-26T18:00:00.000Z', items: [] };

describe('la carrera de la clave', () => {
  beforeEach(() => {
    llamadas.length = 0;
    choques = 0;
    restriccion = 'ordenes_idempotencia';
  });

  it('EL CHOQUE CON LA MISMA CLAVE devuelve el apartado que ya hay, no un 500', async () => {
    choques = 1;
    const salida = await apartarOElQueYaHay(NEGOCIO, ENTRADA, 'clave-0001');
    expect(salida.pedidoId).toBe('p1');
    expect(llamadas).toEqual(['chocó', 'apartó']);
  });

  it('el choque con OTRO índice no se disfraza de apartado: se dice', async () => {
    choques = 1;
    restriccion = 'pedidos_anticipados_otro';
    await expect(apartarOElQueYaHay(NEGOCIO, ENTRADA, 'clave-0001')).rejects.toMatchObject({
      code: '23505',
    });
    expect(llamadas).toEqual(['chocó']);
  });
});

describe('el orden de las comprobaciones (contrato sobre el archivo)', () => {
  const texto = readFileSync(new URL('./anticipado-http.ts', import.meta.url), 'utf8');
  const inicio = texto.indexOf('export async function atenderApartado');
  const cuerpo = texto.slice(inicio, texto.indexOf('\n}\n', inicio)).replace(/^\s*\/\/.*$/gm, '');

  it('sin clave, 400 antes de contar ni de buscar nada', () => {
    const exigeClave = cuerpo.search(/if \(!CLAVE\.test\(clave\)\)\s*\{\s*return errorHttp\(400/);
    expect(exigeClave).toBeGreaterThan(-1);
    expect(exigeClave).toBeLessThan(cuerpo.indexOf("exigirPermiso('apartar_anticipado'"));
  });

  it('el límite es POR IP, y el slug se valida antes de buscar el negocio', () => {
    expect(cuerpo).toMatch(
      /exigirPermiso\('apartar_anticipado', `anticipado:\$\{ipDe\(peticion\)\}`/,
    );
    expect(cuerpo.indexOf('SLUG.test(slug)')).toBeLessThan(cuerpo.indexOf('negocioDeLaCafeteria('));
  });

  it('el cupo del negocio se cuenta DESPUÉS de saber que el negocio existe, por su id', () => {
    const busca = cuerpo.indexOf('negocioDeLaCafeteria(');
    const cupo = cuerpo.search(/exigirPermiso\('apartados_del_negocio', negocio\.organizacionId/);
    expect(cupo).toBeGreaterThan(busca);
  });

  it('la IP sale de `origenDe`, no de la primera del reenvío', () => {
    const ip = texto.slice(
      texto.indexOf('function ipDe'),
      texto.indexOf('\n}\n', texto.indexOf('function ipDe')),
    );
    expect(ip).toMatch(/origenDe\(peticion\.headers\)/);
    expect(ip).not.toMatch(/split\(','\)\[0\]/);
  });
});
