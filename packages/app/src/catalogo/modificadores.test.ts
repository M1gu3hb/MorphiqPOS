import { PAQUETES_OPERATIVOS, PAQUETES_RESTAURANTE, PLANTILLAS } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { crearModificadorProducto } from './modificadores.ts';
import { contextoCatalogo } from './pruebas.ts';

const PRODUCTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MODIFICADOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('B-04 · modificadores normalizados', () => {
  it('crea grupo, opciones con precio extra y vínculo al producto', async () => {
    const { ctx, operaciones, auditorias } = contextoCatalogo([
      { id: PRODUCTO },
      { id: MODIFICADOR },
      undefined,
      undefined,
    ]);
    const entrada = crearModificadorProducto.entrada.parse({
      productoId: PRODUCTO,
      nombre: 'Tamaño',
      obligatorio: true,
      tipo: 'unica',
      opciones: [
        { nombre: 'Mediano', precioExtra: '0' },
        { nombre: 'Grande', precioExtra: '12.50' },
      ],
    });

    const salida = await crearModificadorProducto.ejecutar(ctx, entrada);

    expect(salida).toEqual({ id: MODIFICADOR });
    expect(operaciones.map(({ tipo, tabla }) => `${tipo}:${tabla}`)).toEqual([
      'update:productos',
      'insert:modificadores',
      'insert:modificador_opciones',
      'insert:producto_modificadores',
    ]);
    expect(operaciones[2]?.valores).toEqual([
      { modificador_id: MODIFICADOR, nombre: 'Mediano', precio_extra_centavos: 0n, orden: 0 },
      {
        modificador_id: MODIFICADOR,
        nombre: 'Grande',
        precio_extra_centavos: 1250n,
        orden: 1,
      },
    ]);
    expect(operaciones[3]?.valores).toMatchObject({ organizacion_id: ctx.ambito.organizacionId });
    expect(auditorias[0]).toMatchObject({ entidadId: MODIFICADOR });
  });

  it('rechaza un grupo vacío y un precio extra negativo', () => {
    expect(
      crearModificadorProducto.entrada.safeParse({
        productoId: PRODUCTO,
        nombre: 'Tamaño',
        obligatorio: true,
        tipo: 'unica',
        opciones: [],
      }).success,
    ).toBe(false);
    expect(
      crearModificadorProducto.entrada.safeParse({
        productoId: PRODUCTO,
        nombre: 'Tamaño',
        obligatorio: true,
        tipo: 'unica',
        opciones: [{ nombre: 'Grande', precioExtra: '-1' }],
      }).success,
    ).toBe(false);
  });
});

/**
 * B-04 · en QUÉ plantillas existe este comando.
 *
 * ── Por qué esta afirmación estaba y ya no ─────────────────────────────────
 * La vigilaba `comando.autorizacion.test.ts`, con el caso «un comando real de
 * modificadores devuelve 403 fuera de cafetería/restaurante». Ese caso dejó de
 * ser cierto con el renombre de D-01: `PAQUETES_OPERATIVOS` pasó a ser las TRES
 * plantillas, porque `MODULOS_POR_PLANTILLA` le da a `tienda` el bloque de
 * operación entero y un comando cerrado por plantilla con su módulo encendido
 * es un menú que enseña lo que el POST rechaza.
 *
 * Al cambiar el sujeto de aquel caso, este comando se quedó SIN nadie que
 * mirara su lista, y el arnés `verify:comandos-catalogo` lo notó de la forma
 * correcta: su mutación —cambiar la constante por otra— dejó de romper nada.
 * Una mutación que sobrevive no es una prueba superada; es una prueba que falta.
 *
 * Lo que se afirma aquí es más fuerte que lo de antes: no una lista escrita a
 * mano, sino la IDENTIDAD con la constante. Estrecharla a `PAQUETES_RESTAURANTE`
 * —el arreglo que alguien haría para «quitar» modificadores de una ferretería—
 * se pone rojo, y ampliarla a una lista suelta también.
 */
describe('B-04 · modificadores por plantilla', () => {
  it('declara la constante de operación, no una lista propia', () => {
    expect(crearModificadorProducto.paquetes).toBe(PAQUETES_OPERATIVOS);
  });

  it('existe en las tres plantillas, porque las tres traen el bloque de operación', () => {
    for (const plantilla of PLANTILLAS) {
      expect(crearModificadorProducto.paquetes, plantilla).toContain(plantilla);
    }
  });

  it('y no se le puede estrechar a sala sin que esto se caiga', () => {
    // El contraste que hace útil al caso de arriba: si alguien cambiara la
    // constante por la de restaurante, `tienda` dejaría de estar.
    expect([...PAQUETES_RESTAURANTE]).not.toContain('tienda');
  });
});
