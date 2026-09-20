import { describe, expect, it } from 'vitest';

import { crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { pasarMesaCobradaALimpieza } from '../restaurante/mesas-escrituras.ts';

/**
 * LA MESA COBRADA TIENE QUE PASAR A LIMPIEZA.
 *
 * ── El defecto ─────────────────────────────────────────────────────────────
 * La pantalla de cobro dice, con estas palabras: «Cobrado · cambio $X · la mesa pasa
 * sola a limpieza». No pasaba. `venta.cobrar` no tocaba `mesas`, así que la mesa se
 * quedaba en `cuenta_solicitada` con su orden ya `pagada`:
 *
 *   · el mapa de mesas enseñaba «la cuenta está pedida» sobre una cuenta pagada,
 *   · y `restaurante.abrir_mesa` contestaba «la mesa 1 ya está abierta» para
 *     siempre: esa mesa NO volvía al servicio.
 *
 * Se vio corriendo dos veces el recorrido de restaurante sobre la misma
 * demostración: la segunda no pudo sentar a nadie en la mesa 1.
 *
 * ── Y por qué a LIMPIEZA y no a LIBRE ─────────────────────────────────────
 * Porque hay platos encima. `libre` sentaría a la siguiente pareja sobre la mesa sin
 * recoger; el paso a libre lo da quien limpia, con `restaurante.liberar_mesa`.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const SUCURSAL = '22222222-2222-4222-8222-222222222222';
const ORDEN = '33333333-3333-4333-8333-333333333333';
const MESA = '44444444-4444-4444-8444-444444444444';
const EMPLEO = '55555555-5555-4555-8555-555555555555';
const AHORA = new Date('2026-09-20T20:00:00.000Z');

function mesa(cambios: Fila = {}): Fila {
  return {
    id: MESA,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    numero: 1,
    estado: 'cuenta_solicitada',
    orden_activa_id: ORDEN,
    ...cambios,
  };
}

const baseDe = (filas: readonly Fila[]) =>
  crearBaseFalsa(
    { mesas: [...filas], eventos_mesa: [] },
    {
      predeterminados: {
        eventos_mesa: { personas: null, empleado_id: null, orden_id: null },
      },
    },
  );

describe('la mesa al cobrar', () => {
  it('PASA A LIMPIEZA, y no a libre: hay platos encima', async () => {
    const base = baseDe([mesa()]);

    const tocada = await pasarMesaCobradaALimpieza(base.tx, ORG, ORDEN, {
      empleoId: EMPLEO,
      ahora: AHORA,
    });

    expect(tocada?.numero).toBe(1);
    expect(base.filas('mesas')[0]?.['estado']).toBe('limpieza');
    // `orden_activa_id` se queda: es de qué cuenta viene la mesa mientras se
    // recoge, y es lo que `liberar_mesa` lee para no cancelar nada.
    expect(base.filas('mesas')[0]?.['orden_activa_id']).toBe(ORDEN);
  });

  it('SELLA la transición: un ledger con huecos fusiona dos ciclos de ocupación', async () => {
    const base = baseDe([mesa()]);

    await pasarMesaCobradaALimpieza(base.tx, ORG, ORDEN, { empleoId: EMPLEO, ahora: AHORA });

    const evento = base.filas('eventos_mesa')[0];
    expect(evento?.['estado_anterior']).toBe('cuenta_solicitada');
    expect(evento?.['estado_nuevo']).toBe('limpieza');
    expect(evento?.['mesa_id']).toBe(MESA);
  });

  it('UNA VENTA DE MOSTRADOR no toca ninguna mesa', async () => {
    // La orden no es de ninguna mesa: es la mayoría de las ventas del sistema.
    const base = baseDe([mesa({ orden_activa_id: null, estado: 'libre' })]);

    const tocada = await pasarMesaCobradaALimpieza(base.tx, ORG, ORDEN, {
      empleoId: EMPLEO,
      ahora: AHORA,
    });

    expect(tocada).toBeNull();
    expect(base.filas('mesas')[0]?.['estado']).toBe('libre');
    expect(base.filas('eventos_mesa')).toEqual([]);
  });

  it('UN REINTENTO no vuelve a sellar la transición', async () => {
    // Cobrar dos veces la misma cuenta no puede pasar, pero un reintento
    // idempotente sí: el segundo no es un error ni una transición nueva.
    const base = baseDe([mesa({ estado: 'limpieza' })]);

    const tocada = await pasarMesaCobradaALimpieza(base.tx, ORG, ORDEN, {
      empleoId: EMPLEO,
      ahora: AHORA,
    });

    expect(tocada?.numero).toBe(1);
    expect(base.filas('eventos_mesa')).toEqual([]);
  });
});
