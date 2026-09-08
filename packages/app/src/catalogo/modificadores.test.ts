import { describe, expect, it } from 'vitest';

import { crearModificadorProducto } from './modificadores';
import { contextoCatalogo } from './pruebas';

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
