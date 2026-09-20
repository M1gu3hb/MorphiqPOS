import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { marchaDe } from './lineas.ts';
import { marcharTiempo } from './marcha.ts';
import { enviarPedido } from './pedido.ts';
import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from './pruebas/base-falsa.ts';
import {
  ambitoDe,
  CUENTA,
  estacionGeneral,
  linea,
  mesa,
  ordenDeMesa,
  PREDETERMINADOS,
  producto,
  PRODUCTO,
} from './pruebas/sala.ts';
import { tiemposDePreparacion } from './tiempos.ts';

/**
 * F-323 · Marchar por tiempos · y F-315 · el reloj que arranca ahí.
 *
 * Lo que vigilan estas pruebas es la mitad de F-323 que se puede olvidar sin
 * que nada falle: que lo RETENIDO no llegue a cocina. Las líneas se escriben
 * igual, la cuenta cuadra igual, y el fuerte sale con la sopa.
 */

const FUERTE = '99999999-9999-4999-8999-99999999999a';
const AHORA = new Date('2026-09-14T21:00:00.000Z');
const MARCHA = new Date('2026-09-14T21:25:00.000Z');

function cocina(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    ordenes: [ordenDeMesa('borrador')],
    mesas: [mesa('esperando_orden')],
    orden_lineas: [],
    comandas: [],
    comanda_items: [],
    estaciones_preparacion: [estacionGeneral()],
    // La entrada va inmediata; el fuerte, en el tiempo 2.
    productos: [
      producto({ tiempo_servicio_default: 1, minutos_preparacion: 8 }),
      producto({
        id: FUERTE,
        nombre: 'Arrachera',
        tiempo_servicio_default: 2,
        minutos_preparacion: 20,
      }),
    ],
    configuracion: [],
    eventos_mesa: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(cocina(extra), { predeterminados: PREDETERMINADOS });

const PEDIDO = {
  ordenId: CUENTA,
  lineas: [
    { productoId: PRODUCTO, cantidad: '1' },
    { productoId: FUERTE, cantidad: '1' },
  ],
};

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-323 · qué nace retenido', () => {
  it('el tiempo 1 y el plato sin tiempo van inmediatos', () => {
    expect(marchaDe(null)).toBe('inmediata');
    expect(marchaDe(1)).toBe('inmediata');
  });

  it('del tiempo 2 en adelante NACE RETENIDO', () => {
    expect(marchaDe(2)).toBe('retenida');
    expect(marchaDe(3)).toBe('retenida');
    expect(marchaDe(6)).toBe('retenida');
  });
});

describe('F-323 · enviar el pedido no manda el fuerte', () => {
  it('LO RETENIDO NO LLEGA A COCINA', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await enviarPedido.ejecutar(ctx, PEDIDO);

    // Las dos líneas están en la cuenta…
    expect(base.filas('orden_lineas')).toHaveLength(2);
    // …y sólo una llegó a cocina.
    const items = base.filas('comanda_items');
    expect(items).toHaveLength(1);
    expect(items[0]?.['producto_nombre']).toBe('Enchiladas');
  });

  it('la línea retenida queda marcada y con su tiempo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await enviarPedido.ejecutar(ctx, PEDIDO);

    const fuerte = base.filas('orden_lineas').find((l) => l['producto_id'] === FUERTE);
    expect(fuerte?.['marcha_estado']).toBe('retenida');
    expect(fuerte?.['tiempo_servicio']).toBe(2);

    const entrada = base.filas('orden_lineas').find((l) => l['producto_id'] === PRODUCTO);
    expect(entrada?.['marcha_estado']).toBe('inmediata');
  });

  it('EL MESERO PUEDE CAMBIAR EL TIEMPO: la mesa que pide el postre primero existe', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await enviarPedido.ejecutar(ctx, {
      ordenId: CUENTA,
      lineas: [{ productoId: FUERTE, cantidad: '1', tiempoServicio: 1 }],
    });

    const fuerte = base.filas('orden_lineas')[0];
    expect(fuerte?.['marcha_estado']).toBe('inmediata');
    expect(base.filas('comanda_items')).toHaveLength(1);
  });

  it('EL RELOJ DE COCINA SE SELLA al crear la comanda inmediata', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await enviarPedido.ejecutar(ctx, PEDIDO);

    expect(base.campo('comandas', 'marchada_en')).toEqual(AHORA);
    // Y el item congela lo que el menú dice que tarda.
    expect(base.campo('comanda_items', 'minutos_estimados')).toBe(8);
  });
});

describe('F-323 · marchar el segundo tiempo', () => {
  async function conFuerteRetenido() {
    const base = baseDe();
    const envio = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);
    await enviarPedido.ejecutar(envio.ctx, PEDIDO);
    return base;
  }

  it('suelta la línea y CREA su comanda', async () => {
    const base = await conFuerteRetenido();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), MARCHA);

    const salida = await marcharTiempo.ejecutar(ctx, { ordenId: CUENTA, tiempoServicio: 2 });

    expect(salida.lineasMarchadas).toBe(1);
    const fuerte = base.filas('orden_lineas').find((l) => l['producto_id'] === FUERTE);
    expect(fuerte?.['marcha_estado']).toBe('marchada');
    expect(base.filas('comandas')).toHaveLength(2);
    expect(base.filas('comanda_items')).toHaveLength(2);
  });

  it('EL RELOJ DE F-315 ARRANCA EN LA MARCHA, no en la captura', async () => {
    const base = await conFuerteRetenido();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), MARCHA);

    await marcharTiempo.ejecutar(ctx, { ordenId: CUENTA, tiempoServicio: 2 });

    const comandas = base.filas('comandas');
    // La de la entrada arrancó al enviar; la del fuerte, veinticinco minutos
    // después. Medir las dos desde la captura pondría en rojo a una cocina que
    // no había recibido el plato.
    expect(comandas[0]?.['marchada_en']).toEqual(AHORA);
    expect(comandas[1]?.['marchada_en']).toEqual(MARCHA);
  });

  it('el item del fuerte congela SUS minutos estimados, no los de la entrada', async () => {
    const base = await conFuerteRetenido();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), MARCHA);

    await marcharTiempo.ejecutar(ctx, { ordenId: CUENTA, tiempoServicio: 2 });

    const items = base.filas('comanda_items');
    expect(items.map((i) => i['minutos_estimados'])).toEqual([8, 20]);
  });

  it('marchar dos veces el mismo tiempo NO duplica la comanda', async () => {
    const base = await conFuerteRetenido();
    const uno = contextoFalso(base.tx, ambitoDe('mesero'), MARCHA);
    await marcharTiempo.ejecutar(uno.ctx, { ordenId: CUENTA, tiempoServicio: 2 });

    const dos = contextoFalso(base.tx, ambitoDe('mesero'), MARCHA);
    expect(
      await codigoDe(() => marcharTiempo.ejecutar(dos.ctx, { ordenId: CUENTA, tiempoServicio: 2 })),
    ).toBe('COMANDA_NO_ENCONTRADA');
    expect(base.filas('comandas')).toHaveLength(2);
  });

  it('marchar un tiempo que nadie pidió no inventa una comanda vacía', async () => {
    const base = await conFuerteRetenido();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), MARCHA);

    expect(
      await codigoDe(() => marcharTiempo.ejecutar(ctx, { ordenId: CUENTA, tiempoServicio: 5 })),
    ).toBe('COMANDA_NO_ENCONTRADA');
  });

  it('UNA LÍNEA ANULADA NO SE MARCHA: no se cocina lo que nadie paga', async () => {
    const base = baseDe({
      orden_lineas: [
        linea({
          producto_id: FUERTE,
          marcha_estado: 'retenida',
          tiempo_servicio: 2,
          anulada_en: new Date('2026-09-14T21:10:00.000Z'),
          motivo_anulacion: 'cliente_cambio',
        }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), MARCHA);

    expect(
      await codigoDe(() => marcharTiempo.ejecutar(ctx, { ordenId: CUENTA, tiempoServicio: 2 })),
    ).toBe('COMANDA_NO_ENCONTRADA');
    expect(base.filas('comandas')).toEqual([]);
  });

  it('una cuenta ya cobrada no admite marcha', async () => {
    const base = baseDe({
      ordenes: [ordenDeMesa('pagada')],
      orden_lineas: [
        linea({
          producto_id: FUERTE,
          marcha_estado: 'retenida',
          tiempo_servicio: 2,
          anulada_en: null,
        }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), MARCHA);

    expect(
      await codigoDe(() => marcharTiempo.ejecutar(ctx, { ordenId: CUENTA, tiempoServicio: 2 })),
    ).toBe('ORDEN_NO_EDITABLE');
  });

  it('marchar lo hace SALA: el mesero ve que la mesa va terminando', () => {
    expect(marcharTiempo.roles).toContain('mesero');
  });

  it('no hay tiempo 0 ni tiempo 7', () => {
    expect(marcharTiempo.entrada.safeParse({ ordenId: CUENTA, tiempoServicio: 0 }).success).toBe(
      false,
    );
    expect(marcharTiempo.entrada.safeParse({ ordenId: CUENTA, tiempoServicio: 7 }).success).toBe(
      false,
    );
  });
});

describe('F-315 · qué tan tarde va la cocina', () => {
  function plato(
    nombre: string,
    estimados: number | null,
    reales: number,
    cambios: Fila = {},
  ): Fila {
    return {
      id: `t-${nombre}-${String(reales)}`,
      organizacion_id: ORG_DE_PRUEBA,
      sucursal_id: SUCURSAL_DE_PRUEBA,
      comanda_id: 'c1',
      estacion_preparacion_id: null,
      orden_linea_id: null,
      producto_id: nombre,
      producto_nombre: nombre,
      minutos_estimados: estimados,
      minutos_reales: reales,
      desviacion_bp:
        estimados === null || estimados === 0
          ? null
          : Math.round(((reales - estimados) * 10_000) / estimados),
      arrancado_en: AHORA,
      listo_en: MARCHA,
      ...cambios,
    };
  }

  const ORG_DE_PRUEBA = '11111111-1111-4111-8111-111111111111';
  const SUCURSAL_DE_PRUEBA = '22222222-2222-4222-8222-222222222222';

  it('agrupa por PLATILLO y ordena por el que más se desvía', async () => {
    const base = crearBaseFalsa({
      tiempos_preparacion: [
        plato('Arrachera', 20, 45),
        plato('Arrachera', 20, 41),
        plato('Ensalada', 5, 6),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cocina'), MARCHA);

    const salida = await tiemposDePreparacion.ejecutar(ctx, { dias: 7 });

    expect(salida.platos).toBe(3);
    expect(salida.porProducto[0]?.nombre).toBe('Arrachera');
    // Mediana de 45 y 41 es 43; estimados 20 → +115 %.
    expect(salida.porProducto[0]?.minutosMedianos).toBe(43);
    expect(salida.porProducto[0]?.desviacionBp).toBe(11_500);
    expect(salida.porProducto[1]?.nombre).toBe('Ensalada');
  });

  it('CUENTA LOS QUE PASARON DEL DOBLE: eso ya no es «un poco tarde»', async () => {
    const base = crearBaseFalsa({
      tiempos_preparacion: [
        plato('Arrachera', 20, 45),
        plato('Ensalada', 5, 6),
        plato('Sopa', 10, 11),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cocina'), MARCHA);

    const salida = await tiemposDePreparacion.ejecutar(ctx, { dias: 7 });

    expect(salida.fueraDeTiempo).toBe(1);
  });

  it('un platillo SIN TIEMPO EN EL MENÚ no reporta desviación inventada', async () => {
    const base = crearBaseFalsa({ tiempos_preparacion: [plato('Postre', null, 12)] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cocina'), MARCHA);

    const salida = await tiemposDePreparacion.ejecutar(ctx, { dias: 7 });

    expect(salida.porProducto[0]?.desviacionBp).toBeNull();
    expect(salida.porProducto[0]?.minutosMedianos).toBe(12);
  });

  it('EL PLATO QUE TODAVÍA NO SALE no entra en el promedio', async () => {
    const base = crearBaseFalsa({
      tiempos_preparacion: [
        plato('Arrachera', 20, 20),
        plato('Arrachera', 20, 999, { listo_en: null, minutos_reales: null }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cocina'), MARCHA);

    const salida = await tiemposDePreparacion.ejecutar(ctx, { dias: 7 });

    expect(salida.platos).toBe(1);
    expect(salida.minutosMedianos).toBe(20);
  });

  it('COCINA SÍ LEE SU PROPIO DESEMPEÑO: no es el margen del negocio', () => {
    expect(tiemposDePreparacion.roles).toContain('cocina');
    expect(tiemposDePreparacion.escribe).toBe(false);
  });
});
