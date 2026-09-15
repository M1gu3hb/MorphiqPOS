import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { enviarTraspaso, recibirTraspaso } from './traspaso.ts';

/**
 * F-105 · El traspaso, con sus dos mitades.
 *
 * ── Por qué esta prueba tenía que existir ──────────────────────────────────
 * `repos/traspasos.ts` llevaba escrito desde la Etapa 2 **sin una sola prueba y
 * sin ningún comando que lo llamara**. El `verify:cobertura` lo daba por
 * construido porque otra prueba —una de aserciones de texto sobre el SQL—
 * nombraba F-105 en su cabecera. Eso es exactamente un falso verde.
 *
 * ── Lo que NO se puede probar aquí, dicho antes de que parezca que sí ──────
 * La guarda `cantidad + delta >= 0` vive en SQL crudo, y la base falsa no
 * interpreta SQL: devuelve `filasCrudas` tal cual. Lo que sí se comprueba es
 * que el comando REACCIONE a la respuesta de esa guarda —cero filas ⇒ error, y
 * el traspaso no se escribe— que es la mitad que sí depende de este código.
 */

const ALMACEN_A = 'a1111111-1111-4111-8111-111111111111';
const ALMACEN_B = 'b2222222-2222-4222-8222-222222222222';
const INSUMO = 'c3333333-3333-4333-8333-333333333333';
const OTRO_INSUMO = 'd4444444-4444-4444-8444-444444444444';
const TRASPASO = 'e5555555-5555-4555-8555-555555555555';
const AHORA = new Date('2026-09-15T16:00:00.000Z');

function almacenes(): Fila[] {
  return [
    { id: ALMACEN_A, organizacion_id: ORG, activo: true },
    { id: ALMACEN_B, organizacion_id: ORG, activo: true },
  ];
}

function baseDe(extra: Partial<TablasFalsas> = {}, hayExistencia = true) {
  return crearBaseFalsa(
    {
      almacenes: almacenes(),
      traspasos: [],
      traspaso_lineas: [],
      movimientos_stock: [],
      ...extra,
    },
    {
      // La base falsa no interpreta el SQL de la guarda: devuelve esto. Una
      // fila = la guarda dejó pasar; ninguna = la guarda rechazó.
      filasCrudas: hayExistencia ? [{ cantidad: '8.0000' }] : [],
      predeterminados: {
        traspasos: { motivo: null, empleado_id: null, enviado_en: null, recibido_en: null },
        traspaso_lineas: { cantidad_recibida: null },
        movimientos_stock: {
          referencia_tipo: null,
          referencia_id: null,
          motivo: null,
          empleado_id: null,
          costo_unitario_centavos: 0n,
          idempotency_key: null,
          sesion_caja_id: null,
        },
      },
    },
  );
}

describe('F-105 · enviar', () => {
  it('descuenta del origen y escribe el movimiento con su referencia', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const salida = await enviarTraspaso.ejecutar(ctx, {
      almacenOrigen: ALMACEN_A,
      almacenDestino: ALMACEN_B,
      lineas: [{ insumoId: INSUMO, cantidad: '3.5000', unidad: 'kg' }],
    });

    expect(base.campo('movimientos_stock', 'almacen_id')).toBe(ALMACEN_A);
    expect(base.campo('movimientos_stock', 'tipo')).toBe('traspaso_salida');
    // NEGATIVO: del origen sale.
    expect(base.campo('movimientos_stock', 'cantidad')).toBe('-3.5000');
    // Sin la referencia, el kardex no puede explicar de qué traspaso salió.
    expect(base.campo('movimientos_stock', 'referencia_tipo')).toBe('traspaso');
    expect(base.campo('movimientos_stock', 'referencia_id')).toBe(salida.traspasoId);
  });

  it('deja el traspaso ENVIADO con su fecha, que es lo que el check exige', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    await enviarTraspaso.ejecutar(ctx, {
      almacenOrigen: ALMACEN_A,
      almacenDestino: ALMACEN_B,
      lineas: [{ insumoId: INSUMO, cantidad: '1', unidad: 'pieza' }],
    });

    expect(base.campo('traspasos', 'estado')).toBe('enviado');
    expect(base.campo('traspasos', 'enviado_en')).toEqual(AHORA);
  });

  it('rechaza dos renglones del mismo artículo ANTES de tocar el stock', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const fallo = await enviarTraspaso
      .ejecutar(ctx, {
        almacenOrigen: ALMACEN_A,
        almacenDestino: ALMACEN_B,
        lineas: [
          { insumoId: INSUMO, cantidad: '1', unidad: 'pieza' },
          { insumoId: INSUMO, cantidad: '2', unidad: 'pieza' },
        ],
      })
      .catch((e: unknown) => e);

    // La tabla tiene `unique (traspaso_id, insumo_id)`: dejarlo pasar reventaría
    // con un 23505 DESPUÉS de haber descontado el primer renglón.
    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('traspasos')).toHaveLength(0);
    expect(base.filas('movimientos_stock')).toHaveLength(0);
  });

  it('rechaza un traspaso de un almacén a sí mismo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const fallo = await enviarTraspaso
      .ejecutar(ctx, {
        almacenOrigen: ALMACEN_A,
        almacenDestino: ALMACEN_A,
        lineas: [{ insumoId: INSUMO, cantidad: '1', unidad: 'pieza' }],
      })
      .catch((e: unknown) => e);

    // El `check (almacen_origen <> almacen_destino)` de la 061 lo impide en la
    // base. Esto comprueba que el COMANDO también lo impida: la migración no
    // está aplicada en esta fase, así que hoy la base no protege nada.
    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('movimientos_stock')).toHaveLength(0);
  });

  it('rechaza un almacén que no es de esta organización', async () => {
    const base = baseDe({
      almacenes: [{ id: ALMACEN_A, organizacion_id: ORG, activo: true }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const fallo = await enviarTraspaso
      .ejecutar(ctx, {
        almacenOrigen: ALMACEN_A,
        almacenDestino: ALMACEN_B,
        lineas: [{ insumoId: INSUMO, cantidad: '1', unidad: 'pieza' }],
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('traspasos')).toHaveLength(0);
  });

  it('rechaza un almacén inactivo: no se traspasa a una bodega cerrada', async () => {
    const base = baseDe({
      almacenes: [
        { id: ALMACEN_A, organizacion_id: ORG, activo: true },
        { id: ALMACEN_B, organizacion_id: ORG, activo: false },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const fallo = await enviarTraspaso
      .ejecutar(ctx, {
        almacenOrigen: ALMACEN_A,
        almacenDestino: ALMACEN_B,
        lineas: [{ insumoId: INSUMO, cantidad: '1', unidad: 'pieza' }],
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });

  it('si la guarda de existencia no deja pasar, NO escribe el movimiento', async () => {
    const base = baseDe({}, false);
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const fallo = await enviarTraspaso
      .ejecutar(ctx, {
        almacenOrigen: ALMACEN_A,
        almacenDestino: ALMACEN_B,
        lineas: [{ insumoId: INSUMO, cantidad: '99', unidad: 'kg' }],
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('movimientos_stock')).toHaveLength(0);
  });
});

describe('F-105 · recibir', () => {
  function conTraspasoEnviado() {
    return baseDe({
      traspasos: [
        {
          id: TRASPASO,
          organizacion_id: ORG,
          almacen_origen: ALMACEN_A,
          almacen_destino: ALMACEN_B,
          estado: 'enviado',
          enviado_en: new Date('2026-09-15T10:00:00.000Z'),
          recibido_en: null,
        },
      ],
      traspaso_lineas: [
        { traspaso_id: TRASPASO, insumo_id: INSUMO, cantidad: '10.0000', cantidad_recibida: null },
      ],
    });
  }

  it('suma al DESTINO lo que de verdad llegó', async () => {
    const base = conTraspasoEnviado();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    await recibirTraspaso.ejecutar(ctx, {
      traspasoId: TRASPASO,
      recibido: [{ insumoId: INSUMO, cantidad: '9.0000', unidad: 'kg' }],
    });

    expect(base.campo('movimientos_stock', 'almacen_id')).toBe(ALMACEN_B);
    expect(base.campo('movimientos_stock', 'tipo')).toBe('traspaso_entrada');
    // Nueve, no diez: se recibe lo que llegó, no lo que salió.
    expect(base.campo('movimientos_stock', 'cantidad')).toBe('9.0000');
  });

  it('devuelve la DIFERENCIA, que es el dato que importa', async () => {
    const base = conTraspasoEnviado();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const salida = await recibirTraspaso.ejecutar(ctx, {
      traspasoId: TRASPASO,
      recibido: [{ insumoId: INSUMO, cantidad: '9.0000', unidad: 'kg' }],
      motivoDiferencia: 'Llegó una caja rota',
    });

    // Sin esto, el traspaso cuadra siempre en el papel y nunca en el estante.
    expect(salida.diferencias).toEqual([INSUMO]);
    expect(base.campo('movimientos_stock', 'motivo')).toBe('Llegó una caja rota');
  });

  it('deja el traspaso RECIBIDO con sus dos fechas', async () => {
    const base = conTraspasoEnviado();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    await recibirTraspaso.ejecutar(ctx, {
      traspasoId: TRASPASO,
      recibido: [{ insumoId: INSUMO, cantidad: '10.0000', unidad: 'kg' }],
    });

    expect(base.campo('traspasos', 'estado')).toBe('recibido');
    expect(base.campo('traspasos', 'recibido_en')).toEqual(AHORA);
    // `traspaso_recibido_completo` exige las DOS: sin `enviado_en` revienta.
    expect(base.campo('traspasos', 'enviado_en')).not.toBeNull();
  });

  it('un renglón que llegó en CERO no genera movimiento', async () => {
    const base = conTraspasoEnviado();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const salida = await recibirTraspaso.ejecutar(ctx, {
      traspasoId: TRASPASO,
      recibido: [{ insumoId: INSUMO, cantidad: '0', unidad: 'kg' }],
      motivoDiferencia: 'No llegó nada de este renglón',
    });

    // Un movimiento de cero es un renglón del kardex que no dice nada. Lo que
    // sí dice algo —la diferencia— sigue ahí.
    expect(base.filas('movimientos_stock')).toHaveLength(0);
    expect(salida.diferencias).toEqual([INSUMO]);
  });

  it('no se puede recibir dos veces: la segunda no encuentra el traspaso enviado', async () => {
    const base = baseDe({
      traspasos: [
        {
          id: TRASPASO,
          organizacion_id: ORG,
          almacen_origen: ALMACEN_A,
          almacen_destino: ALMACEN_B,
          estado: 'recibido',
          enviado_en: new Date('2026-09-15T10:00:00.000Z'),
          recibido_en: new Date('2026-09-15T12:00:00.000Z'),
        },
      ],
      traspaso_lineas: [
        {
          traspaso_id: TRASPASO,
          insumo_id: INSUMO,
          cantidad: '10.0000',
          cantidad_recibida: '10.0000',
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const fallo = await recibirTraspaso
      .ejecutar(ctx, {
        traspasoId: TRASPASO,
        recibido: [{ insumoId: INSUMO, cantidad: '10.0000', unidad: 'kg' }],
      })
      .catch((e: unknown) => e);

    // Recibir dos veces duplicaría la entrada de stock, que es el error que más
    // caro sale aquí: aparece producto que nunca llegó.
    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('movimientos_stock')).toHaveLength(0);
  });

  it('rechaza un traspaso de otra organización', async () => {
    const base = baseDe({
      traspasos: [
        {
          id: TRASPASO,
          organizacion_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          almacen_origen: ALMACEN_A,
          almacen_destino: ALMACEN_B,
          estado: 'enviado',
          enviado_en: AHORA,
          recibido_en: null,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const fallo = await recibirTraspaso
      .ejecutar(ctx, {
        traspasoId: TRASPASO,
        recibido: [{ insumoId: OTRO_INSUMO, cantidad: '1', unidad: 'pieza' }],
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });
});
