import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { fijarTermino, restablecerTermino, vocabularioDelNegocio } from './vocabulario.ts';

/**
 * F-017 · Que el diccionario llegue a la pantalla, no que exista.
 *
 * Lo que faltaba no era `crearVocabulario()` —eso ya estaba probado— sino la
 * mitad que lee el giro de la organización y sus excepciones. Sin ella, tres
 * modelos pedían el diccionario y ninguno lo tenía.
 *
 * El caso que manda es el de La Broca contra Don Chuy: **misma plantilla,
 * vocabulario distinto**. Si el vocabulario colgara de la plantilla, como decía
 * D-04, los dos hablarían igual y uno de los dos hablaría mal.
 */

const AHORA = new Date('2026-09-15T18:00:00.000Z');

function negocio(giro: string, extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    organizaciones: [{ id: ORG, giro, paquete: 'operativo', activa: true }],
    organizacion_modulos: [],
    vocabulario_negocio: [],
    ...extra,
  };
}

const baseDe = (tablas: TablasFalsas) =>
  crearBaseFalsa(tablas, {
    predeterminados: { vocabulario_negocio: { empleado_id: null } },
  });

describe('F-017 · el vocabulario sale del GIRO, no de la plantilla', () => {
  it('la ferretería y la tienda comparten plantilla y NO comparten palabras', async () => {
    const broca = await vocabularioDelNegocio(baseDe(negocio('ferreteria')).tx, ORG);
    const donChuy = await vocabularioDelNegocio(baseDe(negocio('tienda')).tx, ORG);

    // Las dos son plantilla `tienda`. Si el diccionario colgara de la plantilla
    // —como decía D-04— estas dos cadenas serían iguales y una estaría mal.
    expect(broca.singular('producto')).not.toBe(donChuy.singular('producto'));
  });

  it('el giro apaga las entidades que no usa, en vez de traducirlas', async () => {
    const broca = await vocabularioDelNegocio(baseDe(negocio('ferreteria')).tx, ORG);

    // Una ferretería no tiene preparación. Ponerle un nombre a algo que no
    // existe obliga a la pantalla a decidir si lo enseña, que es justo lo que el
    // diccionario venía a evitar.
    expect(broca.usa('preparacion')).toBe(false);
    expect(broca.singular('preparacion')).toBe('');
  });

  it('lo que el negocio cambió a mano pisa al diccionario de su giro', async () => {
    const base = baseDe(
      negocio('restaurante', {
        vocabulario_negocio: [
          {
            organizacion_id: ORG,
            entidad: 'unidad_servicio',
            singular: 'tablón',
            plural: 'tablones',
            genero: 'masculino',
          },
        ],
      }),
    );

    const vocabulario = await vocabularioDelNegocio(base.tx, ORG);

    expect(vocabulario.singular('unidad_servicio')).toBe('tablón');
    // Y el artículo sigue al género DECLARADO, no a la terminación.
    expect(vocabulario.conArticulo('unidad_servicio')).toBe('El tablón');
  });

  it('una fila con un género que no existe se ignora, en vez de escribir «lo mesa»', async () => {
    const base = baseDe(
      negocio('restaurante', {
        vocabulario_negocio: [
          {
            organizacion_id: ORG,
            entidad: 'unidad_servicio',
            singular: 'tablón',
            plural: 'tablones',
            genero: 'neutro',
          },
        ],
      }),
    );

    const vocabulario = await vocabularioDelNegocio(base.tx, ORG);

    expect(vocabulario.singular('unidad_servicio')).toBe('mesa');
  });

  it('una entidad que el código ya no conoce se ignora en vez de romper la pantalla', async () => {
    const base = baseDe(
      negocio('restaurante', {
        vocabulario_negocio: [
          {
            organizacion_id: ORG,
            entidad: 'entidad_retirada',
            singular: 'x',
            plural: 'xs',
            genero: 'femenino',
          },
        ],
      }),
    );

    const vocabulario = await vocabularioDelNegocio(base.tx, ORG);

    expect(vocabulario.singular('unidad_servicio')).toBe('mesa');
  });
});

describe('F-017 · fijar y restablecer un término', () => {
  it('guarda singular, plural y género, y devuelve la frase de ejemplo', async () => {
    const base = baseDe(negocio('estetica'));
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await fijarTermino.ejecutar(ctx, {
      entidad: 'unidad_servicio',
      singular: 'estación',
      plural: 'estaciones',
      genero: 'femenino',
    });

    expect(base.campo('vocabulario_negocio', 'singular')).toBe('estación');
    expect(base.campo('vocabulario_negocio', 'plural')).toBe('estaciones');
    expect(base.campo('vocabulario_negocio', 'genero')).toBe('femenino');
    // El ejemplo es lo que la pantalla enseña al guardar: sin él, nadie
    // descubre que puso el género al revés hasta que lo ve un cliente.
    expect(salida.ejemplo).toBe('La estación está libre');
  });

  it('el género declarado manda sobre la terminación de la palabra', async () => {
    const base = baseDe(negocio('taller'));
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await fijarTermino.ejecutar(ctx, {
      entidad: 'unidad_servicio',
      singular: 'día de taller',
      plural: 'días de taller',
      genero: 'masculino',
    });

    // «día» acaba en -a y es masculino. Cualquier heurística escribiría
    // «La día», que es el error exacto que F-017 existe para impedir.
    expect(salida.ejemplo).toBe('El día de taller está libre');
  });

  it('rechaza un plural igual al singular y no escribe nada', async () => {
    const base = baseDe(negocio('restaurante'));
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const fallo = await fijarTermino
      .ejecutar(ctx, {
        entidad: 'unidad_servicio',
        singular: 'mesa',
        plural: 'mesa',
        genero: 'femenino',
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('vocabulario_negocio')).toHaveLength(0);
  });

  it('restablecer borra la fila y devuelve el nombre del giro', async () => {
    const base = baseDe(
      negocio('restaurante', {
        vocabulario_negocio: [
          {
            organizacion_id: ORG,
            entidad: 'unidad_servicio',
            singular: 'tablón',
            plural: 'tablones',
            genero: 'masculino',
          },
        ],
      }),
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('administrador'), AHORA);

    const salida = await restablecerTermino.ejecutar(ctx, { entidad: 'unidad_servicio' });

    expect(salida.habiaTermino).toBe(true);
    expect(salida.singular).toBe('mesa');
    expect(base.filas('vocabulario_negocio')).toHaveLength(0);
  });

  it('sólo administrador y dueño cambian cómo habla el sistema', () => {
    expect([...fijarTermino.roles].sort()).toEqual(['administrador', 'dueno']);
    expect([...restablecerTermino.roles].sort()).toEqual(['administrador', 'dueno']);
  });
});
