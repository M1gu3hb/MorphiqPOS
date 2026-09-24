import { describe, expect, it } from 'vitest';

import {
  DEMOS,
  NEGOCIOS_REALES,
  NoEsUnaDemo,
  demoPorSlug,
  esDeUnProyectoIntocable,
  exigirDemo,
} from './index.ts';

/**
 * La guarda de todo lo que prueba, siembra o resetea (bloque B de la 2.4).
 *
 * Lo que fija: la regla es POSITIVA —sólo las cinco demos pasan— y el prefijo `demo-`
 * no significa nada, porque tres de los cuatro negocios reales lo llevan.
 */
describe('las dos listas', () => {
  it('no comparten ni un ID ni un slug', () => {
    const reales = new Set(NEGOCIOS_REALES.flatMap((n) => [n.id, n.slug]));
    for (const demo of DEMOS) {
      expect(reales.has(demo.id)).toBe(false);
      expect(reales.has(demo.slug)).toBe(false);
    }
  });

  it('son las cuatro y las cinco que declara el encargo', () => {
    expect(NEGOCIOS_REALES.map((n) => n.slug).sort()).toEqual([
      'demo-abarrotes-don-chuy',
      'demo-cafe-jacaranda',
      'demo-ferreteria-la-broca',
      'mh-restaurante',
    ]);
    expect(DEMOS.map((n) => n.slug).sort()).toEqual([
      'demo-acople-cafeteria',
      'demo-acople-estetica',
      'demo-acople-ferreteria',
      'demo-acople-restaurante',
      'demo-acople-tienda',
    ]);
  });
});

describe('exigirDemo', () => {
  it('deja pasar a una demo, por ID y por slug', () => {
    const tienda = demoPorSlug('demo-acople-tienda');
    expect(tienda).not.toBeNull();
    expect(exigirDemo({ id: tienda?.id ?? '' }, 'x').slug).toBe('demo-acople-tienda');
    expect(exigirDemo({ slug: 'demo-acople-tienda' }, 'x').id).toBe(tienda?.id);
    expect(exigirDemo({ id: tienda?.id ?? '', slug: 'demo-acople-tienda' }, 'x').slug).toBe(
      'demo-acople-tienda',
    );
  });

  it('para a CADA negocio real, aunque su slug empiece por demo-', () => {
    for (const real of NEGOCIOS_REALES) {
      expect(() => exigirDemo({ id: real.id }, 'resetear')).toThrow(NoEsUnaDemo);
      expect(() => exigirDemo({ slug: real.slug }, 'resetear')).toThrow(NoEsUnaDemo);
      expect(() => exigirDemo({ id: real.id }, 'resetear')).toThrow(real.nombre);
    }
  });

  it('para a un negocio que no está en ninguna lista: la regla es positiva', () => {
    expect(() => exigirDemo({ id: '99999999-0000-4000-8000-000000000000' }, 'sembrar')).toThrow(
      NoEsUnaDemo,
    );
    expect(() => exigirDemo({ slug: 'demo-acople-farmacia' }, 'sembrar')).toThrow(NoEsUnaDemo);
    expect(() => exigirDemo({}, 'sembrar')).toThrow(NoEsUnaDemo);
    expect(() => exigirDemo({ id: '', slug: '' }, 'sembrar')).toThrow(NoEsUnaDemo);
  });

  it('para un slug de demo con el ID de un cliente', () => {
    const mh = NEGOCIOS_REALES[0];
    expect(() => exigirDemo({ id: mh?.id ?? '', slug: 'demo-acople-tienda' }, 'x')).toThrow(
      NoEsUnaDemo,
    );
  });
});

describe('esDeUnProyectoIntocable', () => {
  it('reconoce el proyecto de producción por su referencia, en URL directa y del pooler', () => {
    expect(
      esDeUnProyectoIntocable(
        'postgresql://postgres:x@db.wyqmzhliurwyxuyxznpb.supabase.co:5432/postgres',
      ),
    ).toBe(true);
    expect(
      esDeUnProyectoIntocable(
        'postgresql://postgres.wyqmzhliurwyxuyxznpb:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      ),
    ).toBe(true);
    expect(esDeUnProyectoIntocable('postgresql://postgres:postgres@localhost:5432/prueba')).toBe(
      false,
    );
  });
});
