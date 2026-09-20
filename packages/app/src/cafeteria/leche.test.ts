import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { contarLeche } from './leche.ts';

/**
 * El conteo de leche de la barra.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que el cartón abierto se cuente EN CUARTOS. Nadie mira un cartón y dice
 * «quedan 380»: dice «uno y tres cuartos». Pedir mililitros es pedir un número
 * inventado, y un número inventado convierte el conteo en ruido.
 *
 * Que la diferencia salga CON SIGNO. Lo que falta es merma de barra —lo que se
 * tiró al vaporizar de más, lo que se quedó en la jarra— y es el 3 %–8 % del
 * costo de la leche que hoy no aparece en ningún sitio.
 *
 * Y que NO AJUSTE SOLO. Un cartón mal contado a las siete de la mañana se
 * convertiría en una merma de dos litros sin que nadie lo hubiera mirado, y a la
 * segunda vez el barista deja de contar.
 */

const AHORA = new Date('2026-09-16T07:00:00.000Z');
const ENTERA = 'c1000000-0000-4000-8000-000000000001';
const AVENA = 'c1000000-0000-4000-8000-000000000002';
const ALMACEN = 'c2000000-0000-4000-8000-000000000001';

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa({
    insumos: [
      { id: ENTERA, organizacion_id: ORG, nombre: 'Leche entera', unidad_base: 'ml' },
      { id: AVENA, organizacion_id: ORG, nombre: 'Leche de avena', unidad_base: 'ml' },
    ],
    existencias: [
      { organizacion_id: ORG, almacen_id: ALMACEN, insumo_id: ENTERA, cantidad: '5000.0000' },
    ],
    movimientos_stock: [],
    ...extra,
  });
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('el conteo de leche', () => {
  it('EL ABIERTO SE CUENTA EN CUARTOS', async () => {
    // Cuatro cartones cerrados y uno a tres cuartos son 4 750 ml.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await contarLeche.ejecutar(ctx, {
      almacenId: ALMACEN,
      conteos: [
        { insumoId: ENTERA, cartonesCerrados: 4, cuartosDelAbierto: 3, mlPorCarton: 1_000 },
      ],
    });

    expect(salida.diferencias[0]?.contadoMl).toBe('4750.0000');
  });

  it('LA DIFERENCIA SALE CON SIGNO: lo que falta es merma de barra', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await contarLeche.ejecutar(ctx, {
      almacenId: ALMACEN,
      conteos: [
        { insumoId: ENTERA, cartonesCerrados: 4, cuartosDelAbierto: 3, mlPorCarton: 1_000 },
      ],
    });

    // El sistema creía 5 000 y hay 4 750: faltan 250.
    expect(salida.diferencias[0]?.diferenciaMl).toBe('-250.0000');
    expect(salida.faltanteTotalMl).toBe('250.0000');
  });

  it('SEÑALA lo que se pasa del desvío normal de barra', async () => {
    // Más del 8 % no es vaporizar de más: es un cartón que no se contó.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await contarLeche.ejecutar(ctx, {
      almacenId: ALMACEN,
      conteos: [
        { insumoId: ENTERA, cartonesCerrados: 3, cuartosDelAbierto: 0, mlPorCarton: 1_000 },
      ],
    });

    // 3 000 contra 5 000 esperados: −40 %.
    expect(salida.diferencias[0]?.desvioBp).toBe(-4_000);
    expect(salida.fueraDeRango).toBe(1);
  });

  it('un desvío pequeño NO se marca', async () => {
    // Avisar cuarenta veces al día es cómo un aviso deja de mirarse.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await contarLeche.ejecutar(ctx, {
      almacenId: ALMACEN,
      conteos: [
        { insumoId: ENTERA, cartonesCerrados: 4, cuartosDelAbierto: 3, mlPorCarton: 1_000 },
      ],
    });

    expect(salida.fueraDeRango).toBe(0);
  });

  it('un insumo SIN EXISTENCIA cuenta contra cero, no revienta', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await contarLeche.ejecutar(ctx, {
      almacenId: ALMACEN,
      conteos: [{ insumoId: AVENA, cartonesCerrados: 2, cuartosDelAbierto: 0, mlPorCarton: 1_000 }],
    });

    expect(salida.diferencias[0]?.esperadoMl).toBe('0.0000');
    expect(salida.diferencias[0]?.diferenciaMl).toBe('2000.0000');
    // Sobrar no es faltar: el faltante es lo que se perdió.
    expect(salida.faltanteTotalMl).toBe('0.0000');
  });

  it('NO AJUSTA SOLO: no escribe ningún movimiento', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await contarLeche.ejecutar(ctx, {
      almacenId: ALMACEN,
      conteos: [
        { insumoId: ENTERA, cartonesCerrados: 1, cuartosDelAbierto: 0, mlPorCarton: 1_000 },
      ],
    });

    expect(base.filas('movimientos_stock')).toHaveLength(0);
  });

  it('lo que NO se mide en mililitros no se cuenta por cartones', async () => {
    // Convertiría cada cartón en mil piezas.
    const base = baseDe({
      insumos: [{ id: ENTERA, organizacion_id: ORG, nombre: 'Vasos 12 oz', unidad_base: 'pieza' }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const codigo = await codigoDe(() =>
      contarLeche.ejecutar(ctx, {
        almacenId: ALMACEN,
        conteos: [
          { insumoId: ENTERA, cartonesCerrados: 1, cuartosDelAbierto: 0, mlPorCarton: 1_000 },
        ],
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });

  it('un insumo de otro negocio no existe', async () => {
    const base = baseDe({ insumos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const codigo = await codigoDe(() =>
      contarLeche.ejecutar(ctx, {
        almacenId: ALMACEN,
        conteos: [
          { insumoId: ENTERA, cartonesCerrados: 1, cuartosDelAbierto: 0, mlPorCarton: 1_000 },
        ],
      }),
    );

    expect(codigo).toBe('PUENTE_NO_ENCONTRADO');
  });
});
