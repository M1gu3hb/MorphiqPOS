import { entradaEnviarPedido } from '@morphiqpos/app/restaurante';
import { describe, expect, it } from 'vitest';

import { lineasDelEnvio } from './envio-a-cocina.ts';

/**
 * Día completo del restaurante (2.4) · LA COMANDA QUE MANDA LA MESA ACTIVA, la que el
 * servidor acepta. Mandaba la cantidad como número y `enviar_pedido` la rechazaba siempre:
 * ni una comanda llegaba a cocina desde la pantalla de inicio del mesero.
 */

const TACOS = '11111111-1111-4111-8111-111111111111';
const CERVEZA = '22222222-2222-4222-8222-222222222222';
const ORDEN = '33333333-3333-4333-8333-333333333333';

describe('lo que la mesa activa manda a cocina', () => {
  it('el ESQUEMA DEL COMANDO acepta el cuerpo que arma la pantalla', () => {
    const lineas = lineasDelEnvio({ [TACOS]: 1, [CERVEZA]: 2 });
    const veredicto = entradaEnviarPedido.safeParse({ ordenId: ORDEN, lineas });
    expect(veredicto.success, JSON.stringify(veredicto.error?.issues)).toBe(true);
  });

  it('cada renglón lleva sus piezas como cadena decimal, una por producto', () => {
    expect(lineasDelEnvio({ [TACOS]: 1, [CERVEZA]: 2 })).toEqual([
      { productoId: TACOS, cantidad: '1' },
      { productoId: CERVEZA, cantidad: '2' },
    ]);
  });

  it('lo que no es una pieza entera y positiva no viaja', () => {
    expect(lineasDelEnvio({ [TACOS]: 0, [CERVEZA]: -1 })).toEqual([]);
    expect(lineasDelEnvio({ [TACOS]: 1.5 })).toEqual([]);
  });
});
