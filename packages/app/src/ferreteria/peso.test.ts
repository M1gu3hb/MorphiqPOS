import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { calibrarPeso, conteoPorPeso } from './peso.ts';

/**
 * F-151 · Contar pesando, y por qué no es contar.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que el conteo por báscula salga CON SU RANGO y con la marca de si es fiable.
 * Un número presentado como exacto entra al kardex como si alguien hubiera
 * contado pieza por pieza, y a partir de ahí nadie puede distinguir un faltante
 * real de la tolerancia de la balanza.
 *
 * Que contar sin calibrar se rechace. Es inventarse el número, y el mensaje
 * tiene que decir qué falta: «no se puede» manda a alguien a buscar por qué.
 *
 * Y que la TARA se descuente. Pesar la cubeta con los tornillos y no restarla
 * suma dos kilos de plástico al conteo de tornillería.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const TORNILLO = 'f1000000-0000-4000-8000-000000000001';
const INSUMO = 'f3000000-0000-4000-8000-000000000001';
const TOMA = 'f4000000-0000-4000-8000-000000000001';
const ALMACEN = 'f2000000-0000-4000-8000-000000000001';

function producto(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: TORNILLO,
    organizacion_id: ORG,
    nombre: 'Tornillo 1/4 x 2',
    // 5 g por pieza: el tornillo de referencia del catálogo.
    peso_por_pieza_mg: 5_000n,
    tolerancia_peso_pct: '8.00',
    insumo_base_id: INSUMO,
    ...cambios,
  };
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      productos: [producto()],
      tomas_inventario: [
        { id: TOMA, organizacion_id: ORG, almacen_id: ALMACEN, estado: 'abierta' },
      ],
      toma_conteos: [],
      existencias: [{ almacen_id: ALMACEN, insumo_id: INSUMO, cantidad: '6000' }],
      ...extra,
    },
    { predeterminados: { toma_conteos: { movimiento_ajuste_id: null } } },
  );
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-151 · calibrar', () => {
  it('el peso por pieza sale de la MUESTRA, truncado a entero', async () => {
    // El medio miligramo no lo mide ninguna báscula de mostrador.
    const base = baseDe({ productos: [producto({ peso_por_pieza_mg: null })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await calibrarPeso.ejecutar(ctx, {
      productoId: TORNILLO,
      pesoMuestraMg: 502_400,
      piezasMuestra: 100,
      toleranciaPct: 8,
    });

    expect(salida.pesoPorPiezaMg).toBe('5024');
    expect(base.campo('productos', 'peso_por_pieza_mg')).toBe(5_024n);
  });

  it('AVISA cuánto se movió contra lo que había', async () => {
    // Recalibrar de 5 g a 50 g casi siempre es un cero de más al teclear, y a
    // partir de ahí el conteo da la décima parte de lo que hay durante meses.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await calibrarPeso.ejecutar(ctx, {
      productoId: TORNILLO,
      pesoMuestraMg: 5_000_000,
      piezasMuestra: 100,
      toleranciaPct: 8,
    });

    // De 5 000 a 50 000 son diez veces: +900 %.
    expect(salida.variacionPct).toBe('900.00');
  });

  it('la PRIMERA calibración no tiene con qué comparar', async () => {
    const base = baseDe({ productos: [producto({ peso_por_pieza_mg: null })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await calibrarPeso.ejecutar(ctx, {
      productoId: TORNILLO,
      pesoMuestraMg: 500_000,
      piezasMuestra: 100,
      toleranciaPct: 8,
    });

    expect(salida.variacionPct).toBeNull();
  });

  it('queda QUIÉN calibró', async () => {
    // Un peso mal puesto descuadra el conteo entero de esa clave.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    await calibrarPeso.ejecutar(ctx, {
      productoId: TORNILLO,
      pesoMuestraMg: 500_000,
      piezasMuestra: 100,
      toleranciaPct: 8,
    });

    expect(base.campo('productos', 'peso_calibrado_por')).not.toBeNull();
    expect(base.campo('productos', 'peso_calibrado_en')).toEqual(AHORA);
  });

  it('una muestra que da menos de un miligramo por pieza se rechaza', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const codigo = await codigoDe(() =>
      calibrarPeso.ejecutar(ctx, {
        productoId: TORNILLO,
        pesoMuestraMg: 50,
        piezasMuestra: 100,
        toleranciaPct: 8,
      }),
    );

    expect(codigo).toBe('CANTIDAD_INVALIDA');
  });
});

describe('F-151 · contar pesando', () => {
  it('DEVUELVE EL RANGO, no sólo el número', async () => {
    // Un conteo por báscula presentado como exacto no se puede distinguir
    // después de uno contado pieza por pieza.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await conteoPorPeso.ejecutar(ctx, {
      tomaId: TOMA,
      productoId: TORNILLO,
      pesoTotalMg: 30_000_000,
      taraMg: 0,
    });

    expect(salida.piezasEstimadas).toBe(6_000);
    expect(salida.minimo).toBeLessThan(salida.piezasEstimadas);
    expect(salida.maximo).toBeGreaterThan(salida.piezasEstimadas);
  });

  it('CUENTA el producto ligado desde su insumo, como se liga lo dado de alta', async () => {
    // Leer sólo `insumo_base_id` rechazaba el conteo de todo producto dado de alta.
    const base = baseDe({
      productos: [producto({ insumo_base_id: null })],
      insumos: [{ id: INSUMO, organizacion_id: ORG, producto_id: TORNILLO }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await conteoPorPeso.ejecutar(ctx, {
      tomaId: TOMA,
      productoId: TORNILLO,
      pesoTotalMg: 30_000_000,
      taraMg: 0,
    });

    expect(salida.piezasEstimadas).toBe(6_000);
  });

  it('LA TARA SE DESCUENTA', async () => {
    // Pesar la cubeta con los tornillos y no restarla suma dos kilos de
    // plástico al conteo de tornillería.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await conteoPorPeso.ejecutar(ctx, {
      tomaId: TOMA,
      productoId: TORNILLO,
      pesoTotalMg: 32_000_000,
      taraMg: 2_000_000,
    });

    expect(salida.piezasEstimadas).toBe(6_000);
  });

  it('el conteo se anota con CÓMO se llegó al número', async () => {
    // Cuando alguien reclame «yo conté seis mil», tiene que poder verse que
    // nadie contó: que se pesó y que el sistema dividió.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await conteoPorPeso.ejecutar(ctx, {
      tomaId: TOMA,
      productoId: TORNILLO,
      pesoTotalMg: 30_000_000,
      taraMg: 0,
    });

    const capturas = String(base.campo('toma_conteos', 'capturas'));
    expect(capturas).toContain('bascula');
    expect(capturas).toContain('30000000');
    expect(base.campo('toma_conteos', 'contado')).toBe('6000');
  });

  it('CONTAR SIN CALIBRAR SE RECHAZA, y dice qué falta', async () => {
    const base = baseDe({ productos: [producto({ peso_por_pieza_mg: null })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      conteoPorPeso.ejecutar(ctx, {
        tomaId: TOMA,
        productoId: TORNILLO,
        pesoTotalMg: 30_000_000,
        taraMg: 0,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
    expect(base.filas('toma_conteos')).toHaveLength(0);
  });

  it('la tara mayor que el total se rechaza', async () => {
    // Es el recipiente equivocado, y sin la guarda entraría un conteo negativo.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      conteoPorPeso.ejecutar(ctx, {
        tomaId: TOMA,
        productoId: TORNILLO,
        pesoTotalMg: 1_000,
        taraMg: 2_000_000,
      }),
    );

    expect(codigo).toBe('CANTIDAD_INVALIDA');
  });

  it('una toma CERRADA ya no admite captura', async () => {
    const base = baseDe({
      tomas_inventario: [
        { id: TOMA, organizacion_id: ORG, almacen_id: ALMACEN, estado: 'cerrada' },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      conteoPorPeso.ejecutar(ctx, {
        tomaId: TOMA,
        productoId: TORNILLO,
        pesoTotalMg: 30_000_000,
        taraMg: 0,
      }),
    );

    expect(codigo).toBe('INVENTARIO_INVALIDO');
  });

  it('un producto que no lleva existencia no tiene nada que contar', async () => {
    const base = baseDe({ productos: [producto({ insumo_base_id: null })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      conteoPorPeso.ejecutar(ctx, {
        tomaId: TOMA,
        productoId: TORNILLO,
        pesoTotalMg: 30_000_000,
        taraMg: 0,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });
});
