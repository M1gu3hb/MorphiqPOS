import { describe, expect, it } from 'vitest';

import { idsDeLasLineasVivas, soloLasVivas } from './lineas-vivas.ts';

/**
 * LA CUENTA NO ENSEÑA LO QUE YA SE ANULÓ.
 *
 * El puente lista las líneas de la cuenta con las anuladas dentro —no expone `anulada_en`—, y
 * el servidor, al cotizar, sólo cuenta las vivas. Estas pruebas fijan las dos mitades: leer
 * bien lo que el servidor contestó (y no fingir «ninguna viva» si no lo entiende), y quedarse
 * con las líneas que él reconoce.
 */

const SOPA = '11111111-1111-4111-8111-111111111111';
const ARRACHERA = '22222222-2222-4222-8222-222222222222';
const CERVEZA = '33333333-3333-4333-8333-333333333333';

function estadoCon(...ids: readonly string[]): unknown {
  return {
    cotizacion: {
      ordenId: '99999999-9999-4999-8999-999999999999',
      lineas: ids.map((id) => ({ id, productoNombre: 'x', cantidad: '1.0000' })),
      totalCentavos: '0',
    },
    sesionCajaId: null,
  };
}

describe('idsDeLasLineasVivas', () => {
  it('junta los ids de las líneas que el servidor cotizó', () => {
    expect(idsDeLasLineasVivas(estadoCon(ARRACHERA, CERVEZA))).toEqual(
      new Set([ARRACHERA, CERVEZA]),
    );
  });

  it('una cuenta sin líneas vivas es un conjunto vacío, no una respuesta ilegible', () => {
    expect(idsDeLasLineasVivas(estadoCon())).toEqual(new Set());
  });

  it('no inventa «ninguna viva» cuando la respuesta no tiene la forma esperada', () => {
    expect(idsDeLasLineasVivas(null)).toBeNull();
    expect(idsDeLasLineasVivas('x')).toBeNull();
    expect(idsDeLasLineasVivas({})).toBeNull();
    // Sin cotización (no hay cuenta que cotizar): tampoco se toma por «vacía».
    expect(idsDeLasLineasVivas({ cotizacion: null, sesionCajaId: null })).toBeNull();
    expect(idsDeLasLineasVivas({ cotizacion: { lineas: 'no' } })).toBeNull();
    expect(idsDeLasLineasVivas({ cotizacion: { lineas: [{ id: 7 }] } })).toBeNull();
    expect(idsDeLasLineasVivas({ cotizacion: { lineas: [{ id: '' }] } })).toBeNull();
    expect(idsDeLasLineasVivas({ cotizacion: { lineas: [null] } })).toBeNull();
  });
});

describe('soloLasVivas', () => {
  const delPuente = [
    { id: ARRACHERA, producto_nombre: 'Arrachera', cantidad: 2 },
    { id: SOPA, producto_nombre: 'Sopa de tortilla', cantidad: 1 },
    { id: CERVEZA, producto_nombre: 'Cerveza', cantidad: 2 },
  ] as const;

  it('quita la línea que el servidor ya no cuenta y respeta el orden del puente', () => {
    const vivas = idsDeLasLineasVivas(estadoCon(CERVEZA, ARRACHERA));
    if (vivas === null) throw new Error('la respuesta de prueba debía leerse');
    expect(soloLasVivas(delPuente, vivas).map((l) => l.producto_nombre)).toEqual([
      'Arrachera',
      'Cerveza',
    ]);
  });

  it('con todas vivas no toca nada, y con ninguna viva no enseña nada', () => {
    expect(soloLasVivas(delPuente, new Set([ARRACHERA, SOPA, CERVEZA]))).toHaveLength(3);
    expect(soloLasVivas(delPuente, new Set())).toEqual([]);
  });

  it('una línea anulada por una parte se queda con lo que SIGUE cobrándose', () => {
    // Anular 1 de 3 deja dos filas en el puente: la viva (con 2) y la hermana anulada (con 1).
    const filas = [
      { id: ARRACHERA, producto_nombre: 'Arrachera', cantidad: 2 },
      { id: SOPA, producto_nombre: 'Arrachera', cantidad: 1 },
    ];
    expect(soloLasVivas(filas, new Set([ARRACHERA]))).toEqual([
      { id: ARRACHERA, producto_nombre: 'Arrachera', cantidad: 2 },
    ]);
  });
});
