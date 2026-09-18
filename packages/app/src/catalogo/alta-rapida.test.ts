import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { altaRapida } from './alta-rapida.ts';
import { asignarFiscalMasivo } from './fiscal-masivo.ts';

/**
 * F-201 y F-012 · El catálogo que se completa solo, y el impuesto que es de la
 * categoría.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que lo que nace en el mostrador quede MARCADO con sus pendientes. Sin esa
 * lista, los cuarenta productos que nacieron con prisa se pierden entre los seis
 * mil y nadie vuelve a ponerles costo — y un producto sin costo miente en el
 * margen todos los días sin que nadie sepa cuál es.
 *
 * Que el código repetido diga CUÁL es. «Ese código ya existe» con el cliente
 * enfrente deja al cajero buscándolo a mano; con el nombre, lo cobra.
 *
 * Y que el fiscal masivo NO APLIQUE por omisión. Marcar cuatrocientas claves
 * como cerveza porque alguien eligió la categoría equivocada se descubre en la
 * declaración, y para entonces ya se vendieron.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const REFRESCO = 'b1000000-0000-4000-8000-000000000001';
const FRITURA = 'b1000000-0000-4000-8000-000000000002';
const CATEGORIA = 'b2000000-0000-4000-8000-000000000001';

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    { productos: [], ...extra },
    {
      predeterminados: {
        productos: {
          descripcion: null,
          imagen_url: null,
          marca: null,
          precio_mayoreo_centavos: null,
        },
      },
    },
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

describe('F-201 · el alta rápida', () => {
  it('nace con lo mínimo y DICE QUÉ LE FALTA', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await altaRapida.ejecutar(ctx, {
      codigoBarras: '7501234567890',
      nombre: 'Refresco de cola 600 ml',
      precioVentaCentavos: 2_200,
      costoUnitarioCentavos: null,
      categoriaId: null,
    });

    expect(salida.pendientes).toEqual(['costo', 'categoria']);
    expect(base.filas('productos')).toHaveLength(1);
  });

  it('SIN CÓDIGO genera un SKU interno y lo marca', async () => {
    // Media tiendita vende cosas sin código y tienen que poder escanearse.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await altaRapida.ejecutar(ctx, {
      codigoBarras: null,
      nombre: 'Dulce a granel',
      precioVentaCentavos: 100,
      costoUnitarioCentavos: 60,
      categoriaId: CATEGORIA,
    });

    expect(salida.codigoGenerado).toBe(true);
    expect(salida.codigo.startsWith('INT-')).toBe(true);
    expect(salida.pendientes).toEqual(['etiqueta']);
  });

  it('EL CÓDIGO REPETIDO DICE CUÁL ES', async () => {
    // «Ese código ya existe» deja al cajero buscándolo a mano con el cliente
    // enfrente; con el nombre, lo cobra.
    const base = baseDe({
      productos: [
        {
          id: REFRESCO,
          organizacion_id: ORG,
          nombre: 'Refresco de cola 600 ml',
          codigo_barras: '7501234567890',
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await altaRapida
      .ejecutar(ctx, {
        codigoBarras: '7501234567890',
        nombre: 'Otro refresco',
        precioVentaCentavos: 2_200,
        costoUnitarioCentavos: null,
        categoriaId: null,
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    if (esErrorDominio(fallo)) {
      expect(fallo.message).toContain('Refresco de cola 600 ml');
    }
    expect(base.filas('productos')).toHaveLength(1);
  });

  it('completo no tiene pendientes', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await altaRapida.ejecutar(ctx, {
      codigoBarras: '7501234567890',
      nombre: 'Refresco',
      precioVentaCentavos: 2_200,
      costoUnitarioCentavos: 1_500,
      categoriaId: CATEGORIA,
    });

    expect(salida.pendientes).toEqual([]);
  });
});

describe('F-012 · el impuesto por categoría', () => {
  function conRefrescos(extra: Record<string, unknown> = {}) {
    return baseDe({
      productos: [
        {
          id: REFRESCO,
          organizacion_id: ORG,
          nombre: 'Refresco de cola 600 ml',
          categoria_id: CATEGORIA,
          activo: true,
          tasa_iva_bp: 1_600,
          regimen_ieps: null,
          litros_por_unidad: '0.6000',
          ...extra,
        },
        {
          id: FRITURA,
          organizacion_id: ORG,
          nombre: 'Papas 45 g',
          categoria_id: CATEGORIA,
          activo: true,
          tasa_iva_bp: 1_600,
          regimen_ieps: null,
          litros_por_unidad: null,
        },
      ],
    });
  }

  it('POR OMISIÓN NO APLICA: sólo dice qué pasaría', async () => {
    // Marcar cuatrocientas claves como cerveza por elegir mal la categoría se
    // descubre en la declaración, y para entonces ya se vendieron.
    const base = conRefrescos();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await asignarFiscalMasivo.ejecutar(ctx, {
      categoriaId: CATEGORIA,
      productoIds: [],
      tasaIvaBp: 0,
      regimenIeps: null,
      aplicar: false,
    });

    expect(salida.aplicado).toBe(false);
    expect(salida.alcanzados).toBe(2);
    expect(base.campo('productos', 'tasa_iva_bp')).toBe(1_600);
  });

  it('con `aplicar` sí escribe', async () => {
    const base = conRefrescos();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    await asignarFiscalMasivo.ejecutar(ctx, {
      categoriaId: CATEGORIA,
      productoIds: [],
      tasaIvaBp: 0,
      regimenIeps: null,
      aplicar: true,
    });

    expect(base.campo('productos', 'tasa_iva_bp')).toBe(0);
    expect(base.campo('productos', 'tasa_iva_bp', 1)).toBe(0);
  });

  it('LA CUOTA POR LITRO EXIGE LITROS, y dice cuáles faltan', async () => {
    // Sin litros el IEPS sale cero, y «faltan 12» manda a alguien a buscar
    // cuáles entre ochocientas claves.
    const base = conRefrescos();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await asignarFiscalMasivo.ejecutar(ctx, {
      categoriaId: CATEGORIA,
      productoIds: [],
      tasaIvaBp: null,
      regimenIeps: 'bebida_saborizada',
      aplicar: true,
    });

    expect(salida.sinLitros).toEqual([{ productoId: FRITURA, nombre: 'Papas 45 g' }]);
    expect(salida.alcanzados).toBe(1);
    // Y el que no tenía litros NO quedó marcado.
    expect(base.campo('productos', 'regimen_ieps', 1)).toBeNull();
  });

  it('cuenta los que YA ESTABAN así', async () => {
    // Lo que no cambia no debería alarmar a nadie.
    const base = conRefrescos({ tasa_iva_bp: 0 });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await asignarFiscalMasivo.ejecutar(ctx, {
      categoriaId: CATEGORIA,
      productoIds: [],
      tasaIvaBp: 0,
      regimenIeps: null,
      aplicar: false,
    });

    expect(salida.yaEstaban).toBe(1);
  });

  it('SIN FILTRO se rechaza: alcanzaría al catálogo entero', async () => {
    const base = conRefrescos();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const codigo = await codigoDe(() =>
      asignarFiscalMasivo.ejecutar(ctx, {
        categoriaId: null,
        productoIds: [],
        tasaIvaBp: 0,
        regimenIeps: null,
        aplicar: true,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });

  it('sin decir QUÉ poner se rechaza', async () => {
    const base = conRefrescos();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const codigo = await codigoDe(() =>
      asignarFiscalMasivo.ejecutar(ctx, {
        categoriaId: CATEGORIA,
        productoIds: [],
        tasaIvaBp: null,
        regimenIeps: null,
        aplicar: true,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });
});
