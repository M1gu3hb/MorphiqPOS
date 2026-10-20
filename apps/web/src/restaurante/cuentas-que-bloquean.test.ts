import { describe, expect, it } from 'vitest';

import {
  desdeHace,
  mesasQueBloquean,
  type CuentaParaElCierre,
  type MesaParaElCierre,
} from './cuentas-que-bloquean.ts';

/**
 * Día completo del restaurante (2.4) · LO QUE IMPIDE CERRAR EL DÍA.
 *
 * El muro del cierre contaba toda mesa con `venta_activa_id`, y una mesa cobrada NO suelta su
 * cuenta: pasa a limpieza apuntando a la orden ya pagada. Con la jornada cobrada entera el muro
 * decía «hay mesas con cuenta abierta» y el día no se podía cerrar. Los importes del puente van
 * en PESOS: 883 son $883.00.
 */

const AHORA = Date.parse('2026-09-20T22:00:00.000Z');
const HACE_UNA_HORA = '2026-09-20T21:00:00.000Z';

function cuenta(id: string, estado: string, cambios: Partial<CuentaParaElCierre> = {}) {
  return {
    id,
    estado,
    total: 883,
    usuario_mesero_nombre: 'Lupita',
    fecha_apertura: HACE_UNA_HORA,
    ...cambios,
  } satisfies CuentaParaElCierre;
}

function mesa(numero: number, ventaActiva: string | null): MesaParaElCierre {
  return {
    id: `mesa-${String(numero)}`,
    numero,
    venta_activa_id: ventaActiva,
    mesero_asignado_nombre: null,
  };
}

describe('qué cuentas impiden cerrar el día', () => {
  it('UNA MESA COBRADA YA NO BLOQUEA: su cuenta pagada sigue apuntada hasta que se limpia', () => {
    const bloquean = mesasQueBloquean([cuenta('c1', 'pagada')], [mesa(1, 'c1')], AHORA);

    expect(bloquean).toEqual([]);
  });

  it('una mesa con la cuenta pedida bloquea, con su total, su mesero y cuánto lleva', () => {
    const bloquean = mesasQueBloquean([cuenta('c1', 'cuenta_solicitada')], [mesa(7, 'c1')], AHORA);

    expect(bloquean).toEqual([
      { id: 'mesa-7', rotulo: 'Mesa 7', mesero: 'Lupita', total: 88_300, abierta: '1 h 0 min' },
    ]);
  });

  it('una mesa abierta apenas, sin cuenta pedida, también bloquea', () => {
    for (const estado of ['abierta', 'enviada']) {
      expect(mesasQueBloquean([cuenta('c1', estado)], [mesa(2, 'c1')], AHORA)).toHaveLength(1);
    }
  });

  it('una cuenta cancelada, dividida o devuelta ya no es una cuenta viva', () => {
    for (const estado of ['cancelada', 'dividida', 'reembolsada', 'parcialmente_reembolsada']) {
      expect(mesasQueBloquean([cuenta('c1', estado)], [mesa(1, 'c1')], AHORA)).toEqual([]);
    }
  });

  it('una mesa sin cuenta no bloquea', () => {
    expect(mesasQueBloquean([], [mesa(3, null)], AHORA)).toEqual([]);
  });

  it('LO QUE NO SE RECONOCE BLOQUEA: cerrar de más cuesta un clic, cerrar a ciegas un descuadre', () => {
    expect(
      mesasQueBloquean([cuenta('c1', 'en_un_estado_nuevo')], [mesa(4, 'c1')], AHORA),
    ).toHaveLength(1);
    // Y una cuenta que la lista no trae —más allá de lo leído— tampoco se da por cerrada.
    expect(mesasQueBloquean([], [mesa(5, 'desconocida')], AHORA)).toHaveLength(1);
  });

  it('LAS PARTES DE UNA CUENTA DIVIDIDA BLOQUEAN: no cuelgan de ninguna mesa y siguen sin cobrarse', () => {
    const madre = cuenta('madre', 'dividida');
    const parte1 = cuenta('p1', 'pagada', { cliente_nombre: 'Mesa 9 · cuenta 1 de 2' });
    const parte2 = cuenta('p2', 'cuenta_solicitada', {
      cliente_nombre: 'Mesa 9 · cuenta 2 de 2',
      total: 554,
    });

    const bloquean = mesasQueBloquean([madre, parte1, parte2], [mesa(9, 'madre')], AHORA);

    // La mesa no bloquea —su cuenta es la madre, ya repartida—; la parte sin cobrar, sí.
    expect(bloquean.map((b) => [b.rotulo, b.total])).toEqual([['Mesa 9 · cuenta 2 de 2', 55_400]]);
  });

  it('con todas las partes cobradas, la mesa dividida deja cerrar', () => {
    const cuentas = [
      cuenta('madre', 'dividida'),
      cuenta('p1', 'pagada', { cliente_nombre: 'Mesa 9 · cuenta 1 de 2' }),
      cuenta('p2', 'pagada', { cliente_nombre: 'Mesa 9 · cuenta 2 de 2' }),
    ];

    expect(mesasQueBloquean(cuentas, [mesa(9, 'madre')], AHORA)).toEqual([]);
  });

  it('una cuenta viva sin mesa y sin nombre es de otro flujo: no la cuenta el salón', () => {
    expect(mesasQueBloquean([cuenta('carrito', 'abierta')], [], AHORA)).toEqual([]);
  });
});

describe('cuánto lleva abierta una cuenta', () => {
  it('se dice en palabras', () => {
    expect(desdeHace(null, AHORA)).toBe('sin dato');
    expect(desdeHace('2026-09-20T21:59:40.000Z', AHORA)).toBe('recién');
    expect(desdeHace('2026-09-20T21:15:00.000Z', AHORA)).toBe('45 min');
    expect(desdeHace('2026-09-20T19:30:00.000Z', AHORA)).toBe('2 h 30 min');
  });
});
