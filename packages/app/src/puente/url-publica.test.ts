import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Transaccion } from '@morphiqpos/data';
import { describe, expect, it } from 'vitest';

import { entradaActualizarProducto, entradaCrearProducto } from '../catalogo/esquemas.ts';
import { esUrlHttp } from '../validacion/url-http.ts';
import { escribir } from './escribir.ts';

const AMBITO = {
  organizacionId: '11111111-1111-4111-8111-111111111111',
  sucursalId: '22222222-2222-4222-8222-222222222222',
  rol: 'dueno',
} as const;
const FUENTE_MAPA =
  process.env['MORPHIQPOS_URL_MAP_SOURCE_PATH'] ??
  fileURLToPath(new URL('./mapa.ts', import.meta.url));
const FUENTE_VALIDADOR =
  process.env['MORPHIQPOS_URL_VALIDATOR_SOURCE_PATH'] ??
  fileURLToPath(new URL('../validacion/url-http.ts', import.meta.url));
describe('R-27 · URLs que llegan al portal público', () => {
  it('mantiene la marca en ambos campos públicos y un solo validador HTTP(S)', () => {
    expect(readFileSync(FUENTE_MAPA, 'utf8').match(/validacion: 'url_http'/g)).toHaveLength(2);
    expect(esUrlHttp('https://imagenes.example/producto.webp')).toBe(true);
    expect(esUrlHttp('http://localhost:9000/producto.webp')).toBe(true);
    expect(esUrlHttp('javascript:alert(1)')).toBe(false);
    expect(esUrlHttp('data:text/html,peligro')).toBe(false);
    expect(readFileSync(FUENTE_VALIDADOR, 'utf8')).toContain(
      "protocolo === 'https:' || protocolo === 'http:'",
    );
  });

  it('los comandos directos de producto usan la misma política', () => {
    const base = {
      nombre: 'Café',
      precioVenta: '30',
      costoUnitario: '10',
      tipoVenta: 'precio_fijo' as const,
      unidadVenta: 'pieza' as const,
      estrategiaConsumo: 'sku' as const,
      permiteVentaSinStock: false,
      stockMinimo: '0',
      visibleEnPos: true,
    };
    expect(
      entradaCrearProducto.safeParse({ ...base, imagenUrl: 'javascript:alert(1)' }).success,
    ).toBe(false);
    expect(
      entradaActualizarProducto.safeParse({
        productoId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        nombre: 'Café',
        descripcion: null,
        imagenUrl: 'data:text/html,peligro',
        categoriaId: null,
        marca: null,
        visibleEnPos: true,
        permiteVentaSinStock: false,
        stockMinimo: '0',
      }).success,
    ).toBe(false);
  });

  it.each(['ProductoTerminado', 'MenuQRSeccion'])(
    '%s rechaza una imagen que no es URL HTTP(S)',
    async (entidad) => {
      await expect(
        escribir({} as Transaccion, AMBITO, {
          entidad,
          operacion: 'create',
          datos: { imagen_url: 'javascript:alert(1)' },
        }),
      ).rejects.toMatchObject({ codigo: 'PUENTE_CAMPO_INVALIDO' });
    },
  );
});
