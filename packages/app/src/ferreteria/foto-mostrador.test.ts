import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { guardarFotoDeMostrador } from './foto-mostrador.ts';

/**
 * F-061 · La foto de mostrador.
 *
 * ── Lo que esta prueba defiende ──────────────────────────────────────────
 * Que guardar la foto NO borre la ubicación. La foto sirve para reconocer la
 * pieza; la ubicación, para encontrarla — y de las dos, la cara es la segunda:
 * un mostradorista nuevo tarda seis meses en aprender dónde está cada cosa. Una
 * pantalla que manda el formulario entero con la ubicación vacía borraría justo
 * eso.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const PRODUCTO = 'b0000000-0000-4000-8000-000000000001';
const GAVETA = 'c0000000-0000-4000-8000-000000000002';
const URL = 'https://archivos.morphiqpos.mx/fotos/tornillo-1-4.jpg';

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa({
    productos: [
      {
        id: PRODUCTO,
        organizacion_id: ORG,
        nombre: 'Tornillo tirafondo 1/4 x 2',
        ubicacion_id: GAVETA,
        foto_mostrador_url: null,
      },
    ],
    ubicaciones: [{ id: GAVETA, organizacion_id: ORG, codigo: 'P3-A-14' }],
    ...extra,
  });

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-061 · guardar la foto', () => {
  it('ata la URL al producto', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await guardarFotoDeMostrador.ejecutar(ctx, {
      productoId: PRODUCTO,
      url: URL,
      ubicacionId: null,
      nota: null,
    });

    expect(salida.url).toBe(URL);
    expect(base.filas('productos')[0]?.['foto_mostrador_url']).toBe(URL);
  });

  it('SIN UBICACIÓN EN LA ENTRADA, la que tenía NO se borra', async () => {
    // Es el dato caro de los dos: sin él la foto es una foto más.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await guardarFotoDeMostrador.ejecutar(ctx, {
      productoId: PRODUCTO,
      url: URL,
      ubicacionId: null,
      nota: null,
    });

    expect(base.filas('productos')[0]?.['ubicacion_id']).toBe(GAVETA);
    expect(salida.conUbicacion).toBe(true);
  });

  it('con ubicación, la actualiza', async () => {
    const base = baseDe({
      productos: [
        {
          id: PRODUCTO,
          organizacion_id: ORG,
          nombre: 'Tornillo',
          ubicacion_id: null,
          foto_mostrador_url: null,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await guardarFotoDeMostrador.ejecutar(ctx, {
      productoId: PRODUCTO,
      url: URL,
      ubicacionId: GAVETA,
      nota: null,
    });

    expect(base.filas('productos')[0]?.['ubicacion_id']).toBe(GAVETA);
    expect(salida.conUbicacion).toBe(true);
  });

  it('una gaveta de otro negocio manda a un pasillo que no existe', async () => {
    const base = baseDe({ ubicaciones: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      guardarFotoDeMostrador.ejecutar(ctx, {
        productoId: PRODUCTO,
        url: URL,
        ubicacionId: GAVETA,
        nota: null,
      }),
    );

    expect(codigo).toBe('PUENTE_NO_ENCONTRADO');
    expect(base.filas('productos')[0]?.['foto_mostrador_url']).toBeNull();
  });

  it('un producto de otro negocio no existe para éste', async () => {
    const base = baseDe({ productos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      guardarFotoDeMostrador.ejecutar(ctx, {
        productoId: PRODUCTO,
        url: URL,
        ubicacionId: null,
        nota: null,
      }),
    );

    expect(codigo).toBe('PRODUCTO_NO_ENCONTRADO');
  });

  it('la foto de mostrador NO pisa la del catálogo', async () => {
    // Son dos trabajos distintos: una vende y la otra encuentra. En el mismo
    // campo, el catálogo se llena de tornillos borrosos y se apaga la foto.
    const base = baseDe({
      productos: [
        {
          id: PRODUCTO,
          organizacion_id: ORG,
          nombre: 'Tornillo',
          ubicacion_id: GAVETA,
          foto_mostrador_url: null,
          imagen_url: 'https://archivos.morphiqpos.mx/catalogo/tornillo.webp',
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await guardarFotoDeMostrador.ejecutar(ctx, {
      productoId: PRODUCTO,
      url: URL,
      ubicacionId: null,
      nota: null,
    });

    expect(base.filas('productos')[0]?.['imagen_url']).toBe(
      'https://archivos.morphiqpos.mx/catalogo/tornillo.webp',
    );
  });
});
