import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * 058 · El renombre de plantillas no puede mandar a un cliente a la plantilla
 * de otro giro.
 *
 * ── Cómo está escrito, y por qué así ───────────────────────────────────────
 * No busca cadenas sueltas. **Extrae los brazos del `case` y los EJECUTA**
 * contra los cuatro negocios vivos. La diferencia importa: un contrato que
 * comprobara `expect(sql).toContain("then 'cafeteria'")` pasaría igual con el
 * `when` equivocado delante, que es exactamente el defecto que este archivo
 * existe para impedir.
 *
 * Lo que NO puede ver: que la migración se aplique de verdad, y que Postgres
 * evalúe el `case` como yo lo interpreto aquí. Es un cerco, no una
 * demostración. La aplicación real va con los negocios cerrados (P-04).
 */

const SQL = readFileSync(
  fileURLToPath(new URL('./sql/058_plantillas_de_negocio.sql', import.meta.url)),
  'utf8',
);

/** El `update … set paquete = case … end` completo, sin comentarios. */
function cuerpoDelCase(): string {
  const sinComentarios = SQL.replace(/^\s*--.*$/gm, '');
  const m = /set paquete = case([\s\S]*?)\bend\b/i.exec(sinComentarios);
  if (m?.[1] === undefined) throw new Error('No se encontró el `case` del renombre');
  return m[1];
}

interface Brazo {
  readonly giros: readonly string[] | null;
  readonly paquete: string | null;
  readonly destino: string;
}

/** Los brazos en ORDEN. El orden es el invariante: el primero que encaja gana. */
function brazos(): Brazo[] {
  const salida: Brazo[] = [];
  for (const m of cuerpoDelCase().matchAll(/when([\s\S]*?)then\s*'(\w+)'/gi)) {
    const condicion = m[1] ?? '';
    const lista = /giro in \(([^)]*)\)/i.exec(condicion)?.[1];
    const paquete = /paquete\s*=\s*'(\w+)'/i.exec(condicion)?.[1];
    salida.push({
      giros: lista === undefined ? null : [...lista.matchAll(/'(\w+)'/g)].map((g) => g[1] ?? ''),
      paquete: paquete ?? null,
      destino: m[2] ?? '',
    });
  }
  const porOmision = /\belse\s*'(\w+)'/i.exec(cuerpoDelCase())?.[1];
  if (porOmision !== undefined) salida.push({ giros: null, paquete: null, destino: porOmision });
  return salida;
}

/** Ejecuta el `case` tal y como lo haría Postgres: primer brazo que encaja. */
function aplicar(giro: string, paquete: string): string {
  for (const brazo of brazos()) {
    const giroEncaja = brazo.giros === null || brazo.giros.includes(giro);
    const paqueteEncaja = brazo.paquete === null || brazo.paquete === paquete;
    if (giroEncaja && paqueteEncaja) return brazo.destino;
  }
  throw new Error('El case no tiene rama por omisión');
}

describe('058 · el renombre reparte POR GIRO (D-12)', () => {
  it('el `case` se pudo leer: si no, todo lo de abajo pasaría vacío', () => {
    // Sin esto, un cambio de forma del SQL dejaría el contrato afirmando en su
    // nombre algo que ya no mira. Es el fallo que documenta la skill de
    // contratos por mutación.
    expect(brazos().length).toBeGreaterThanOrEqual(5);
    expect(brazos().at(-1)?.giros).toBeNull();
  });

  const VIVOS = [
    {
      negocio: 'Restaurante MH',
      giro: 'restaurante',
      paquete: 'restaurante_pro',
      destino: 'restaurante',
    },
    {
      negocio: 'Café Jacaranda',
      giro: 'cafeteria',
      paquete: 'restaurante_pro',
      destino: 'restaurante',
    },
    { negocio: 'Abarrotes Don Chuy', giro: 'tienda', paquete: 'operativo', destino: 'tienda' },
    { negocio: 'Ferretería La Broca', giro: 'ferreteria', paquete: 'operativo', destino: 'tienda' },
  ] as const;

  for (const caso of VIVOS) {
    it(`${caso.negocio} → ${caso.destino}`, () => {
      expect(aplicar(caso.giro, caso.paquete)).toBe(caso.destino);
    });
  }

  it('NINGÚN negocio de retail acaba en cafeteria', () => {
    // Es el daño concreto que D-12 existe para impedir, y el que un `update`
    // plano habría causado a dos clientes que pagan.
    for (const giro of ['tienda', 'ferreteria', 'farmacia']) {
      for (const paquete of ['esencial', 'operativo', 'restaurante_pro']) {
        expect(aplicar(giro, paquete), `${giro} + ${paquete}`).not.toBe('cafeteria');
      }
    }
  });

  it('el MISMO paquete cae en dos plantillas distintas según el giro', () => {
    expect(aplicar('cafeteria', 'operativo')).toBe('cafeteria');
    expect(aplicar('ferreteria', 'operativo')).toBe('tienda');
  });

  it('esencial va a tienda en los cinco giros', () => {
    for (const giro of ['tienda', 'ferreteria', 'farmacia', 'cafeteria', 'restaurante']) {
      expect(aplicar(giro, 'esencial')).toBe('tienda');
    }
  });

  it('la rama por omisión es la MÁS RESTRICTIVA', () => {
    expect(brazos().at(-1)?.destino).toBe('tienda');
  });
});

describe('058 · el orden y las guardas', () => {
  it('los `check` viejos se sueltan ANTES del update', () => {
    // Si el update corriera primero, Postgres lo rechazaría contra el `check`
    // viejo, que sólo admite los tres valores anteriores. Es orden, no estilo,
    // así que se afirma sobre el ORDEN y no sobre la distancia.
    const drop = SQL.indexOf('drop constraint organizaciones_paquete_check');
    const update = SQL.indexOf('set paquete = case');
    expect(drop).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(drop);
  });

  it('el `check` nuevo cierra el dominio a las tres plantillas', () => {
    expect(SQL).toMatch(/check \(paquete in \('tienda',\s*'cafeteria',\s*'restaurante'\)\)/);
  });

  it('la plantilla restaurante sigue exigiendo giro de alimentos', () => {
    expect(SQL).toMatch(
      /paquete <> 'restaurante'[\s\S]{0,80}giro in \('cafeteria', 'restaurante'\)/,
    );
  });

  it('hay poscondición, y ABORTA en vez de avisar', () => {
    // Una migración que detecta el daño y continúa no sirve de nada: la regla
    // de `supabase-vercel-produccion` §3 es fallar sin tocar nada.
    expect(SQL).toContain('raise exception');
    expect(SQL).toMatch(/descolocadas > 0/);
  });

  it('la tabla de perillas guarda excepciones, no el estado completo', () => {
    expect(SQL).toContain('create table organizacion_modulos');
    expect(SQL).toContain('primary key (organizacion_id, modulo)');
    // Sin RLS, cualquier sesión podría encenderse módulos que no contrató.
    expect(SQL).toContain('alter table organizacion_modulos enable row level security');
    expect(SQL).toContain('alter table organizacion_modulos force row level security');
  });

  it('las perillas revocan a los roles públicos', () => {
    expect(SQL).toMatch(/revoke all privileges on table organizacion_modulos/);
  });
});
