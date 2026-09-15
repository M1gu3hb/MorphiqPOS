import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { cambiarMesaComando } from './cambio-de-mesa.ts';
import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from './pruebas/base-falsa.ts';
import {
  ambitoDe,
  comanda,
  CUENTA,
  mesa,
  MESA_5,
  ordenDeMesa,
  PREDETERMINADOS,
} from './pruebas/sala.ts';

/**
 * F-303 · «Nos pasamos a la terraza.»
 *
 * Lo que estas pruebas vigilan no es que `ordenes.mesa_id` cambie —eso es una
 * línea— sino las tres cosas que se olvidan y que son las que duelen: que la
 * comanda viva reapunte (o cocina saca el plato a una mesa vacía), que el reloj
 * de ocupación VIAJE con la cuenta (o la rotación del negocio sale el doble de
 * buena de lo que es), y que la mesa vieja quede realmente libre.
 */

const TERRAZA = '66666666-6666-4666-8666-666666666667';
const SENTADOS = new Date('2026-09-14T19:00:00.000Z');
const AHORA = new Date('2026-09-14T20:30:00.000Z');

function salon(cambiosOrigen: Fila = {}, cambiosDestino: Fila = {}): TablasFalsas {
  return {
    ordenes: [ordenDeMesa('en_preparacion', { union_id: null })],
    mesas: [
      mesa('en_preparacion', {
        personas_actuales: 4,
        ocupada_desde: SENTADOS,
        cliente_temporal: 'Familia Pérez',
        notas_alergias: 'sin cacahuate',
        ...cambiosOrigen,
      }),
      mesa('libre', {
        id: TERRAZA,
        numero: 12,
        orden_activa_id: null,
        personas_actuales: 0,
        ocupada_desde: null,
        empleado_atiende_id: null,
        cliente_temporal: null,
        notas_alergias: null,
        ...cambiosDestino,
      }),
    ],
    comandas: [comanda('en_preparacion')],
    eventos_mesa: [],
    movimientos_cuenta: [],
  };
}

const baseDe = (origen: Fila = {}, destino: Fila = {}) =>
  crearBaseFalsa(salon(origen, destino), { predeterminados: PREDETERMINADOS });

const A_LA_TERRAZA = { ordenId: CUENTA, mesaDestinoId: TERRAZA };

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-303 · la cuenta se muda, y todo lo suyo se muda con ella', () => {
  it('la cuenta queda en la mesa destino', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await cambiarMesaComando.ejecutar(ctx, A_LA_TERRAZA);

    expect(salida.mesaDestinoId).toBe(TERRAZA);
    expect(base.filas('ordenes')[0]?.['mesa_id']).toBe(TERRAZA);
  });

  it('LA COMANDA VIVA REAPUNTA — o el plato sale a una mesa vacía', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await cambiarMesaComando.ejecutar(ctx, A_LA_TERRAZA);

    expect(salida.comandasReapuntadas).toBe(1);
    expect(base.campo('comandas', 'mesa_id')).toBe(TERRAZA);
  });

  it('EL RELOJ DE OCUPACIÓN VIAJA: cambiar de mesa no es sentarse de nuevo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await cambiarMesaComando.ejecutar(ctx, A_LA_TERRAZA);

    const terraza = base.filas('mesas').find((m) => m['id'] === TERRAZA);
    // Hora en que se sentaron, no la del cambio. Con la del cambio, F-305
    // contaría dos ocupaciones donde hubo una y la rotación saldría al doble.
    expect(terraza?.['ocupada_desde']).toEqual(SENTADOS);
  });

  it('lo del comensal viaja con él: personas, alergias y quien lo atiende', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await cambiarMesaComando.ejecutar(ctx, A_LA_TERRAZA);

    const terraza = base.filas('mesas').find((m) => m['id'] === TERRAZA);
    expect(terraza?.['personas_actuales']).toBe(4);
    expect(terraza?.['notas_alergias']).toBe('sin cacahuate');
    expect(terraza?.['cliente_temporal']).toBe('Familia Pérez');
    expect(terraza?.['estado']).toBe('en_preparacion');
    expect(terraza?.['orden_activa_id']).toBe(CUENTA);
  });

  it('LA MESA VIEJA QUEDA REALMENTE LIBRE, no sólo sin cuenta', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await cambiarMesaComando.ejecutar(ctx, A_LA_TERRAZA);

    const vieja = base.filas('mesas').find((m) => m['id'] === MESA_5);
    expect(vieja?.['estado']).toBe('libre');
    expect(vieja?.['orden_activa_id']).toBeNull();
    expect(vieja?.['ocupada_desde']).toBeNull();
    expect(vieja?.['personas_actuales']).toBe(0);
    expect(vieja?.['notas_alergias']).toBeNull();
  });

  it('el ledger de F-305 recibe las DOS transiciones', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await cambiarMesaComando.ejecutar(ctx, A_LA_TERRAZA);

    const eventos = base.filas('eventos_mesa');
    expect(eventos).toHaveLength(2);
    expect(eventos[0]?.['mesa_id']).toBe(MESA_5);
    expect(eventos[0]?.['estado_nuevo']).toBe('libre');
    expect(eventos[1]?.['mesa_id']).toBe(TERRAZA);
    expect(eventos[1]?.['estado_anterior']).toBe('libre');
    expect(eventos[1]?.['estado_nuevo']).toBe('en_preparacion');
    expect(eventos[1]?.['personas']).toBe(4);
  });

  it('deja bitácora del movimiento', async () => {
    const base = baseDe();
    const { ctx, auditorias } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await cambiarMesaComando.ejecutar(ctx, A_LA_TERRAZA);

    const movimientos = base.filas('movimientos_cuenta');
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]?.['tipo']).toBe('cambio_mesa');
    expect(movimientos[0]?.['mesa_origen_id']).toBe(MESA_5);
    expect(movimientos[0]?.['mesa_destino_id']).toBe(TERRAZA);
    expect(auditorias[0]?.payload['mesaDestino']).toBe(12);
  });
});

describe('F-303 · lo que rechaza', () => {
  it('UNA MESA DESTINO OCUPADA — dos cuentas vivas en una mesa es el bug clásico', async () => {
    const base = baseDe({}, { estado: 'ocupada', orden_activa_id: 'otra-cuenta' });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(await codigoDe(() => cambiarMesaComando.ejecutar(ctx, A_LA_TERRAZA))).toBe(
      'MESA_YA_ABIERTA',
    );
  });

  it('UNA MESA EN LIMPIEZA tampoco recibe: todavía no está lista', async () => {
    // Sin comprobar el ESTADO —y no sólo `orden_activa_id`— una mesa que el
    // garrotero está limpiando recibiría a la familia sobre los platos sucios.
    // Son dos guardas porque cubren dos huecos distintos: una mesa puede estar
    // sin cuenta y aun así no estar disponible.
    const base = baseDe({}, { estado: 'limpieza', orden_activa_id: null });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(await codigoDe(() => cambiarMesaComando.ejecutar(ctx, A_LA_TERRAZA))).toBe(
      'MESA_YA_ABIERTA',
    );
    expect(base.filas('ordenes')[0]?.['mesa_id']).toBe(MESA_5);
  });

  it('UNA MESA HUÉRFANA —libre pero con cuenta colgando— tampoco recibe', async () => {
    // El estado imposible que `detectarHuerfano` busca hoy con heurísticas: la
    // mesa dice `libre` y sigue apuntando a una venta. Es la razón de que la
    // guarda mire las DOS columnas y no sólo `estado`: mover una cuenta encima
    // dejaría dos ventas vivas en la misma mesa y una de las dos sin cobrar.
    const base = baseDe({}, { estado: 'libre', orden_activa_id: 'cuenta-huerfana' });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(await codigoDe(() => cambiarMesaComando.ejecutar(ctx, A_LA_TERRAZA))).toBe(
      'MESA_YA_ABIERTA',
    );
  });

  it('NO ESCRIBE NADA cuando el destino está ocupado', async () => {
    const base = baseDe({}, { estado: 'ocupada', orden_activa_id: 'otra-cuenta' });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await codigoDe(() => cambiarMesaComando.ejecutar(ctx, A_LA_TERRAZA));

    expect(base.filas('ordenes')[0]?.['mesa_id']).toBe(MESA_5);
    expect(base.campo('comandas', 'mesa_id')).toBe(MESA_5);
    expect(base.filas('eventos_mesa')).toEqual([]);
    expect(base.filas('movimientos_cuenta')).toEqual([]);
  });

  it('una cuenta ya cobrada', async () => {
    const base = crearBaseFalsa(
      { ...salon(), ordenes: [ordenDeMesa('pagada', { union_id: null })] },
      { predeterminados: PREDETERMINADOS },
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(await codigoDe(() => cambiarMesaComando.ejecutar(ctx, A_LA_TERRAZA))).toBe(
      'ORDEN_NO_EDITABLE',
    );
  });

  it('una cuenta de un GRUPO UNIDO: primero se separa', async () => {
    const base = crearBaseFalsa(
      { ...salon(), ordenes: [ordenDeMesa('confirmada', { union_id: 'u1' })] },
      { predeterminados: PREDETERMINADOS },
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(await codigoDe(() => cambiarMesaComando.ejecutar(ctx, A_LA_TERRAZA))).toBe(
      'MESA_NO_LIBERABLE',
    );
  });

  it('mover a la MISMA mesa no es mover', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(
      await codigoDe(() =>
        cambiarMesaComando.ejecutar(ctx, { ordenId: CUENTA, mesaDestinoId: MESA_5 }),
      ),
    ).toBe('MESA_YA_ABIERTA');
  });

  it('UNA MESA DE OTRA SUCURSAL: una cuenta no se muda de local', async () => {
    const base = baseDe({}, { sucursal_id: '99999999-9999-4999-8999-999999999999' });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(await codigoDe(() => cambiarMesaComando.ejecutar(ctx, A_LA_TERRAZA))).toBe(
      'MESA_NO_ENCONTRADA',
    );
  });

  it('una mesa dada de baja', async () => {
    const base = baseDe({}, { activa: false });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(await codigoDe(() => cambiarMesaComando.ejecutar(ctx, A_LA_TERRAZA))).toBe(
      'MESA_NO_ENCONTRADA',
    );
  });
});

describe('F-303 · quién mueve', () => {
  it('EL MESERO SÍ: mover no hace desaparecer dinero, es sala', () => {
    expect(cambiarMesaComando.roles).toContain('mesero');
    expect(cambiarMesaComando.roles).toContain('cajero');
  });

  it('el cliente no manda estados ni personas: sólo a qué mesa', () => {
    const analisis = cambiarMesaComando.entrada.safeParse({
      ordenId: CUENTA,
      mesaDestinoId: TERRAZA,
      estado: 'pagada',
      personas: 99,
    });
    expect(analisis.success).toBe(true);
    expect(analisis.success ? Object.keys(analisis.data).sort() : []).toEqual([
      'mesaDestinoId',
      'ordenId',
    ]);
  });
});
