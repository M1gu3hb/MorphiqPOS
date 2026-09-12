import { describe, expect, it } from 'vitest';

import { contextoCatalogo } from './pruebas.ts';
import {
  archivarProducto,
  asignarCodigoBarras,
  cambiarPrecioProducto,
  crearProducto,
  entradaCrearProducto,
} from './productos.ts';

const PRODUCTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INSUMO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const fijo = {
  nombre: 'Café de olla 350 ml',
  descripcion: 'Piloncillo y canela',
  imagenUrl: 'https://imagenes.morphiq.test/cafe.webp',
  categoriaId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  marca: 'Casa',
  sku: 'CAF-OLLA-350',
  codigoBarras: '7501234567890',
  precioVenta: '42.50',
  costoUnitario: '13.125',
  precioMayoreo: '38.00',
  cantidadMinimaMayoreo: '6',
  tipoVenta: 'precio_fijo',
  unidadVenta: 'pieza',
  estrategiaConsumo: 'sku',
  permiteVentaSinStock: false,
  stockMinimo: '8',
  visibleEnPos: true,
} as const;

describe('B-04 · comandos de producto', () => {
  it('crea el producto y su insumo espejo con dinero convertido en el servidor', async () => {
    const { ctx, operaciones, auditorias } = contextoCatalogo([{ id: PRODUCTO }, undefined]);
    const entrada = entradaCrearProducto.parse(fijo);

    const salida = await crearProducto.ejecutar(ctx, entrada);

    expect(salida).toEqual({ id: PRODUCTO });
    expect(operaciones).toHaveLength(2);
    expect(operaciones[0]).toMatchObject({
      tipo: 'insert',
      tabla: 'productos',
      valores: {
        organizacion_id: ctx.ambito.organizacionId,
        precio_venta_centavos: 4250n,
        costo_unitario_centavos: 1313n,
        precio_mayoreo_centavos: 3800n,
        cantidad_minima_mayoreo: '6',
      },
    });
    expect(operaciones[1]).toMatchObject({
      tipo: 'insert',
      tabla: 'insumos',
      valores: {
        organizacion_id: ctx.ambito.organizacionId,
        producto_id: PRODUCTO,
        unidad_base: 'pieza',
      },
    });
    expect(auditorias).toEqual([
      { entidadId: PRODUCTO, payload: { nombre: fijo.nombre, estrategiaConsumo: 'sku' } },
    ]);
  });

  it('guarda el insumo base y deriva ml por porción sin desechar el cálculo', async () => {
    const { ctx, operaciones } = contextoCatalogo([{ id: PRODUCTO }]);
    const entrada = entradaCrearProducto.parse({
      ...fijo,
      nombre: 'Vino de la casa por copa',
      sku: undefined,
      codigoBarras: undefined,
      tipoVenta: 'porcion_contenedor',
      unidadVenta: 'ml',
      estrategiaConsumo: 'insumo_base',
      insumoBaseId: INSUMO,
      capacidadMl: '750',
      porcionesPorContenedor: '16',
      nombrePorcion: 'copa',
      precioPorcion: '95',
    });

    await crearProducto.ejecutar(ctx, entrada);

    expect(operaciones).toHaveLength(1);
    expect(operaciones[0]?.valores).toMatchObject({
      insumo_base_id: INSUMO,
      ml_por_porcion: '46.875',
      precio_por_porcion_centavos: 9500n,
    });
  });

  it.each([
    [{ ...fijo, precioMayoreo: undefined }, 'mayoreo incompleto'],
    [{ ...fijo, tipoVenta: 'servicio', estrategiaConsumo: 'sku' }, 'servicio con stock'],
    [{ ...fijo, estrategiaConsumo: 'sku', unidadVenta: 'caja' }, 'SKU sin equivalencia'],
    [
      { ...fijo, tipoVenta: 'variable_medida', estrategiaConsumo: 'insumo_base' },
      'variable sin insumo ni precio',
    ],
  ])('rechaza %s: %s', (entrada, descripcion) => {
    expect(entradaCrearProducto.safeParse(entrada).success, descripcion).toBe(false);
  });

  it('cambia precios por id y organización con centavos exactos', async () => {
    const { ctx, operaciones } = contextoCatalogo([{ id: PRODUCTO }]);
    const entrada = cambiarPrecioProducto.entrada.parse({
      productoId: PRODUCTO,
      precioVenta: '1.005',
      costoUnitario: '0.335',
      precioMayoreo: null,
      cantidadMinimaMayoreo: null,
    });

    await cambiarPrecioProducto.ejecutar(ctx, entrada);

    expect(operaciones[0]).toMatchObject({
      tabla: 'productos',
      valores: {
        precio_venta_centavos: 101n,
        costo_unitario_centavos: 34n,
        precio_mayoreo_centavos: null,
      },
      filtros: [
        { columna: 'id', operador: '=', valor: PRODUCTO },
        { columna: 'organizacion_id', operador: '=', valor: ctx.ambito.organizacionId },
      ],
    });
  });

  it('asigna código y SKU sin permitir cambiar la organización', async () => {
    const { ctx, operaciones } = contextoCatalogo([{ id: PRODUCTO }]);
    const entrada = asignarCodigoBarras.entrada.parse({
      productoId: PRODUCTO,
      codigoBarras: '7501055300075',
      sku: 'FRIJOL-NEGRO-900',
    });
    await asignarCodigoBarras.ejecutar(ctx, entrada);
    expect(operaciones[0]?.filtros).toContainEqual({
      columna: 'organizacion_id',
      operador: '=',
      valor: ctx.ambito.organizacionId,
    });
  });

  it('archiva producto e insumo espejo en la misma transacción', async () => {
    const { ctx, operaciones } = contextoCatalogo([{ id: PRODUCTO }, undefined]);
    await archivarProducto.ejecutar(ctx, archivarProducto.entrada.parse({ productoId: PRODUCTO }));
    expect(operaciones.map(({ tabla }) => tabla)).toEqual(['productos', 'insumos']);
    expect(operaciones.every((operacion) => operacion.valores !== undefined)).toBe(true);
  });

  it('declara escritura, roles administrativos y los tres paquetes', () => {
    expect(crearProducto.escribe).toBe(true);
    expect(crearProducto.roles).toEqual(['dueno', 'administrador', 'gerente']);
    expect(crearProducto.paquetes).toEqual(['esencial', 'operativo', 'restaurante_pro']);
  });
});
