import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { consumirCaducidad, proximasACaducar, registrarCaducidad } from './caducidad.ts';

/**
 * F-106 · La caducidad sin lote.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que lo CONSUMIDO no se reste de lo que entró. La diferencia entre las dos
 * columnas ES la merma que ese producto genera en ese anaquel, y ése es el
 * número que el negocio nunca ha tenido. Restar de `cantidad` lo haría
 * desaparecer.
 *
 * Que la segunda captura del mismo lote SUME a la fila que ya existe. Dos filas
 * hermanas dejan a alguien decidiendo cuál rematar primero, y las dos caducan el
 * mismo día.
 *
 * Y que la urgencia se devuelva en DÍAS con signo. «Se vence pronto» no es
 * accionable; «quedan 3 días y hay 14 piezas por $420» decide si se remata al
 * 30 % o se tira.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const LECHE = 'a1000000-0000-4000-8000-000000000001';
const PAN = 'a1000000-0000-4000-8000-000000000002';
const ALMACEN = 'a2000000-0000-4000-8000-000000000001';

const fecha = (n: number) => new Date(AHORA.getTime() + n * 86_400_000).toISOString().slice(0, 10);

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      productos: [
        {
          id: LECHE,
          organizacion_id: ORG,
          nombre: 'Leche entera 1 L',
          controla_caducidad: true,
          precio_venta_centavos: 2_800n,
        },
        {
          id: PAN,
          organizacion_id: ORG,
          nombre: 'Bolillo',
          controla_caducidad: false,
          precio_venta_centavos: 300n,
        },
      ],
      caducidades: [],
      ...extra,
    },
    { predeterminados: { caducidades: { consumida: '0.0000', compra_id: null } } },
  );
}

function caducidad(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c1',
    organizacion_id: ORG,
    almacen_id: ALMACEN,
    producto_id: LECHE,
    caduca_el: fecha(3),
    cantidad: '12.0000',
    consumida: '0.0000',
    ...cambios,
  };
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-106 · registrar la caducidad', () => {
  it('la segunda captura del mismo lote SUMA a la fila que hay', async () => {
    const base = baseDe({ caducidades: [caducidad()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarCaducidad.ejecutar(ctx, {
      almacenId: ALMACEN,
      productoId: LECHE,
      caducaEl: fecha(3),
      cantidad: '6',
      compraId: null,
    });

    expect(salida.sumoAExistente).toBe(true);
    expect(salida.cantidad).toBe('18.0000');
    expect(base.filas('caducidades')).toHaveLength(1);
  });

  it('una fecha distinta es OTRA fila', async () => {
    const base = baseDe({ caducidades: [caducidad()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarCaducidad.ejecutar(ctx, {
      almacenId: ALMACEN,
      productoId: LECHE,
      caducaEl: fecha(10),
      cantidad: '6',
      compraId: null,
    });

    expect(salida.sumoAExistente).toBe(false);
    expect(base.filas('caducidades')).toHaveLength(2);
  });

  it('LO QUE NO CADUCA no se captura', async () => {
    // Una lista de la mañana llena de bolillos deja de leerse.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      registrarCaducidad.ejecutar(ctx, {
        almacenId: ALMACEN,
        productoId: PAN,
        caducaEl: fecha(2),
        cantidad: '20',
        compraId: null,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
    expect(base.filas('caducidades')).toHaveLength(0);
  });
});

describe('F-106 · lo que está por caducar', () => {
  it('devuelve los DÍAS con signo y el valor en riesgo', async () => {
    const base = baseDe({ caducidades: [caducidad({ caduca_el: fecha(3), cantidad: '14.0000' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await proximasACaducar.ejecutar(ctx, { almacenId: ALMACEN, dias: 7 });

    expect(salida.lotes[0]?.diasRestantes).toBe(3);
    // 14 × $28.00 = $392.00
    expect(salida.valorEnRiesgoCentavos).toBe('39200');
  });

  it('LO YA VENCIDO sale con días NEGATIVOS y se cuenta aparte', async () => {
    // Sigue contado como existencia vendible, y ése es el problema.
    const base = baseDe({ caducidades: [caducidad({ caduca_el: fecha(-2) })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await proximasACaducar.ejecutar(ctx, { almacenId: ALMACEN, dias: 7 });

    expect(salida.lotes[0]?.diasRestantes).toBe(-2);
    expect(salida.vencidos).toBe(1);
  });

  it('lo AGOTADO ya no sale', async () => {
    // Una lista que repite lo resuelto deja de leerse a la tercera mañana.
    const base = baseDe({
      caducidades: [caducidad({ cantidad: '12.0000', consumida: '12.0000' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await proximasACaducar.ejecutar(ctx, { almacenId: ALMACEN, dias: 7 });

    expect(salida.lotes).toEqual([]);
    expect(salida.valorEnRiesgoCentavos).toBe('0');
  });

  it('lo que caduca DESPUÉS de la ventana no sale', async () => {
    const base = baseDe({ caducidades: [caducidad({ caduca_el: fecha(30) })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await proximasACaducar.ejecutar(ctx, { almacenId: ALMACEN, dias: 7 });

    expect(salida.lotes).toEqual([]);
  });

  it('el valor se calcula sobre lo QUE QUEDA, no sobre lo que entró', async () => {
    const base = baseDe({
      caducidades: [caducidad({ cantidad: '12.0000', consumida: '10.0000' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await proximasACaducar.ejecutar(ctx, { almacenId: ALMACEN, dias: 7 });

    expect(salida.lotes[0]?.porVencer).toBe('2.0000');
    expect(salida.valorEnRiesgoCentavos).toBe('5600');
  });
});

describe('F-106 · consumir', () => {
  it('LO CONSUMIDO NO SE RESTA DE LO QUE ENTRÓ', async () => {
    // La diferencia entre las dos columnas ES la merma de ese anaquel. Restar
    // de `cantidad` la haría desaparecer.
    const base = baseDe({ caducidades: [caducidad()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await consumirCaducidad.ejecutar(ctx, {
      caducidadId: 'c1',
      cantidad: '5',
      motivo: 'venta',
    });

    expect(base.campo('caducidades', 'cantidad')).toBe('12.0000');
    expect(base.campo('caducidades', 'consumida')).toBe('5.0000');
  });

  it('consumir de MÁS se rechaza', async () => {
    // La fila diría que se vendieron quince cartones de un lote de doce, y la
    // merma saldría negativa.
    const base = baseDe({ caducidades: [caducidad()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      consumirCaducidad.ejecutar(ctx, {
        caducidadId: 'c1',
        cantidad: '15',
        motivo: 'merma',
      }),
    );

    expect(codigo).toBe('CANTIDAD_INVALIDA');
    expect(base.campo('caducidades', 'consumida')).toBe('0.0000');
  });

  it('agotarla la marca como agotada', async () => {
    const base = baseDe({ caducidades: [caducidad({ consumida: '10.0000' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await consumirCaducidad.ejecutar(ctx, {
      caducidadId: 'c1',
      cantidad: '2',
      motivo: 'merma',
    });

    expect(salida.agotada).toBe(true);
    expect(salida.restante).toBe('0.0000');
  });

  it('una caducidad de otro negocio no existe', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        consumirCaducidad.ejecutar(ctx, { caducidadId: 'c1', cantidad: '1', motivo: 'venta' }),
      ),
    ).toBe('PUENTE_NO_ENCONTRADO');
  });
});
