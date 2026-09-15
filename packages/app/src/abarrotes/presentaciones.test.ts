import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, PRODUCTO } from '../restaurante/pruebas/sala.ts';
import { crearPresentacion, precioDePresentacion } from './presentaciones.ts';

/**
 * F-111 y F-112 · Presentaciones.
 *
 * Lo que estas pruebas vigilan es la decisión que hace rentable al modelo: el
 * precio de un six NO es seis veces el de la pieza, y el descuento por volumen
 * es justo la razón por la que el tendero vende six. Y que el precio lo ponga
 * el servidor, siempre.
 */

const SIX = 'six';
const AHORA = new Date('2026-09-15T10:00:00.000Z');

function tienda(extra: Record<string, readonly Fila[]> = {}) {
  return crearBaseFalsa(
    {
      // Refresco de $17.50 la pieza.
      productos: [{ id: PRODUCTO, organizacion_id: ORG, precio_venta_centavos: 1_750n }],
      producto_presentaciones: [],
      ...extra,
    },
    { predeterminados: { producto_presentaciones: { codigo_barras: null, sku: null } } },
  );
}

const SEIS = {
  productoId: PRODUCTO,
  nombre: 'Six',
  factor: '6',
  esVentaDefault: false,
  esCompraDefault: false,
};

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-112 · crear una presentación', () => {
  it('queda con su factor y su precio derivado', async () => {
    const base = tienda();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await crearPresentacion.ejecutar(ctx, SEIS);

    expect(salida.factor).toBe('6.0000');
    // 6 × $17.50 = $105.00, y viene marcado como derivado.
    expect(salida.precioVentaCentavos).toBe('10500');
    expect(salida.precioDerivado).toBe(true);
  });

  it('EL PRECIO PROPIO MANDA: un six no cuesta seis veces la pieza', async () => {
    const base = tienda();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await crearPresentacion.ejecutar(ctx, {
      ...SEIS,
      precioVentaCentavos: 9_500,
    });

    expect(salida.precioVentaCentavos).toBe('9500');
    expect(salida.precioDerivado).toBe(false);
  });

  it('EL CLIENTE NO MANDA EL PRECIO DE LA LÍNEA, sólo el del catálogo', () => {
    // Declarar el precio de una presentación es catálogo y lo firma la
    // dirección. Lo que el mostrador manda al vender es QUÉ presentación, nunca
    // cuánto cuesta.
    expect(crearPresentacion.roles).not.toContain('cajero');
    expect(crearPresentacion.roles).toContain('dueno');
  });

  it('UN CÓDIGO DE BARRAS NO APUNTA A DOS PRESENTACIONES', async () => {
    // Es el error que más se va a intentar —pegar el código del six en la
    // pieza— y el que más caro sale: el escáner descontaría seis veces menos de
    // lo que salió del anaquel.
    const base = tienda({
      producto_presentaciones: [
        {
          id: SIX,
          organizacion_id: ORG,
          producto_id: PRODUCTO,
          codigo_barras: '7501055300013',
          activa: true,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect(
      await codigoDe(() =>
        crearPresentacion.ejecutar(ctx, { ...SEIS, codigoBarras: '7501055300013' }),
      ),
    ).toBe('CATALOGO_INVALIDO');
    expect(base.filas('producto_presentaciones')).toHaveLength(1);
  });

  it('LA NUEVA PRESELECCIÓN SUELTA A LA ANTERIOR', async () => {
    const base = tienda({
      producto_presentaciones: [
        {
          id: SIX,
          organizacion_id: ORG,
          producto_id: PRODUCTO,
          es_venta_default: true,
          activa: true,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await crearPresentacion.ejecutar(ctx, { ...SEIS, esVentaDefault: true });

    const vieja = base.filas('producto_presentaciones').find((p) => p['id'] === SIX);
    expect(vieja?.['es_venta_default']).toBe(false);
    const defaults = base
      .filas('producto_presentaciones')
      .filter((p) => p['es_venta_default'] === true);
    expect(defaults).toHaveLength(1);
  });

  it('NO SE CREA UNA SEGUNDA BASE por esta puerta', async () => {
    const base = tienda();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await crearPresentacion.ejecutar(ctx, SEIS);

    expect(base.campo('producto_presentaciones', 'es_base')).toBe(false);
  });

  it('un factor en cero no contiene nada', async () => {
    const base = tienda();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect(await codigoDe(() => crearPresentacion.ejecutar(ctx, { ...SEIS, factor: '0' }))).toBe(
      'CATALOGO_INVALIDO',
    );
  });

  it('un producto de otro catálogo', async () => {
    const base = tienda({ productos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect(await codigoDe(() => crearPresentacion.ejecutar(ctx, SEIS))).toBe(
      'PRODUCTO_NO_ENCONTRADO',
    );
  });

  it('EL FACTOR ES TEXTO: el cigarro suelto es 0.05', () => {
    expect(crearPresentacion.entrada.safeParse({ ...SEIS, factor: 0.05 }).success).toBe(false);
    expect(crearPresentacion.entrada.safeParse({ ...SEIS, factor: '0.05' }).success).toBe(true);
  });
});

describe('F-112 · el precio de una presentación', () => {
  it('el propio manda sobre el derivado', () => {
    expect(precioDePresentacion({ factor: '6', precioPropio: 9_500 }, 1_750n)).toEqual({
      centavos: 9_500n,
      derivado: false,
    });
  });

  it('el derivado multiplica por el factor', () => {
    expect(precioDePresentacion({ factor: '6', precioPropio: null }, 1_750n)).toEqual({
      centavos: 10_500n,
      derivado: true,
    });
  });

  it('EL CIGARRO SUELTO REDONDEA HACIA ARRIBA en el medio centavo', () => {
    // 0.05 × $17.50 = $0.875. Se cobra $0.88: redondear hacia abajo regalaría
    // medio centavo por cigarro, y una tiendita vende cientos al día.
    expect(precioDePresentacion({ factor: '0.05', precioPropio: null }, 1_750n)).toEqual({
      centavos: 88n,
      derivado: true,
    });
  });

  it('NO ARRASTRA COMA FLOTANTE en factores largos', () => {
    // 16.6667 × $45.00 = $750.0015 → $750.00.
    expect(precioDePresentacion({ factor: '16.6667', precioPropio: null }, 4_500n)).toEqual({
      centavos: 75_000n,
      derivado: true,
    });
  });

  it('un precio propio en cero es un precio, no una ausencia', () => {
    // Una presentación de regalo cuesta $0 y eso NO es «derívalo».
    expect(precioDePresentacion({ factor: '6', precioPropio: 0 }, 1_750n)).toEqual({
      centavos: 0n,
      derivado: false,
    });
  });
});
