import { describe, expect, it } from 'vitest';

import { contarPorPeso, pesoDesdePiezas, piezasDesdePeso, type PesoDePieza } from './peso.ts';

/**
 * F-151 · La doble unidad: se compra por kilo y se vende por pieza.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que la conversión trunque hacia abajo —media pieza no existe, y redondear
 * hacia arriba mete al inventario una pieza que no está— y que contar pesando
 * DIGA su error. Un conteo por báscula presentado como exacto es peor que no
 * contar: el ajuste entra al kardex como si alguien hubiera contado pieza por
 * pieza, y el faltante del mes que viene ya no se puede explicar.
 */

/** Un tornillo de 5 g con la tolerancia por omisión del giro: 8 %. */
function tornillo(cambios: Partial<PesoDePieza> = {}): PesoDePieza {
  return { miligramos: 5_000n, toleranciaBp: 800, ...cambios };
}

describe('F-151 · la conversión', () => {
  it('un costal de 25 kg son 5 000 tornillos de 5 g', () => {
    expect(piezasDesdePeso(25_000_000n, tornillo())).toBe(5_000n);
  });

  it('TRUNCA hacia abajo: media pieza no existe', () => {
    // 12 gramos de tornillos de 5 g son dos piezas y dos gramos de merma, no
    // dos y media. Redondear hacia arriba mete al inventario una que no está.
    expect(piezasDesdePeso(12_000n, tornillo())).toBe(2n);
  });

  it('la vuelta: lo que pesan las piezas es lo que se le paga al proveedor', () => {
    expect(pesoDesdePiezas(1_400n, tornillo())).toBe(7_000_000n);
  });

  it('ida y vuelta NO recupera la merma, y eso es correcto', () => {
    const piezas = piezasDesdePeso(12_000n, tornillo());
    expect(pesoDesdePiezas(piezas, tornillo())).toBe(10_000n);
  });

  it('sin peso por pieza no hay conversión, y se dice', () => {
    expect(() => piezasDesdePeso(1_000n, tornillo({ miligramos: 0n }))).toThrow();
  });

  it('un peso negativo no es una entrada de almacén', () => {
    expect(() => piezasDesdePeso(-1n, tornillo())).toThrow();
  });

  it('una tolerancia fuera de rango se rechaza al declararla', () => {
    expect(() => piezasDesdePeso(1_000n, tornillo({ toleranciaBp: 20_000 }))).toThrow();
  });
});

describe('F-151 · contar pesando DICE su error', () => {
  it('devuelve la estimación Y el rango que la tolerancia admite', () => {
    // Medio kilo de tornillos de 5 g: 100 piezas centrales, y con 8 % de
    // tolerancia puede ser desde 92 hasta 108.
    const conteo = contarPorPeso(500_000n, tornillo());

    expect(conteo.piezas).toBe(100);
    expect(conteo.minimo).toBe(92);
    expect(conteo.maximo).toBe(108);
  });

  it('CON TOLERANCIA ANCHA, el conteo NO es confiable', () => {
    // 16 piezas de holgura sobre 100 estimadas: la báscula no distingue 92 de
    // 108, y presentar «100» sería meter al kardex un ajuste inventado.
    expect(contarPorPeso(500_000n, tornillo()).confiable).toBe(false);
  });

  it('con una pieza muy uniforme, SÍ es confiable', () => {
    // Medio punto porcentual de tolerancia sobre 100 piezas: el rango es de una
    // pieza, y eso sí se puede llevar al kardex.
    const conteo = contarPorPeso(500_000n, tornillo({ toleranciaBp: 50 }));

    expect(conteo.piezas).toBe(100);
    expect(conteo.confiable).toBe(true);
  });

  it('sin tolerancia declarada, el rango es un punto', () => {
    const conteo = contarPorPeso(500_000n, tornillo({ toleranciaBp: 0 }));

    expect(conteo.minimo).toBe(100);
    expect(conteo.maximo).toBe(100);
    expect(conteo.confiable).toBe(true);
  });

  it('con pocas piezas basta una de holgura', () => {
    // Doce tornillos: contarlos a ojo es más rápido que discutir la báscula, y
    // el umbral se ajusta para no marcar como dudoso lo que es trivial.
    const conteo = contarPorPeso(60_000n, tornillo({ toleranciaBp: 300 }));

    expect(conteo.piezas).toBe(12);
    expect(conteo.confiable).toBe(true);
  });

  it('una tolerancia del 100 % no divide entre cero', () => {
    // Es un dato imposible capturado por error. Lo que no puede pasar es que
    // reviente: sale como no confiable, que es la respuesta honesta.
    const conteo = contarPorPeso(500_000n, tornillo({ toleranciaBp: 10_000 }));

    expect(conteo.confiable).toBe(false);
    expect(Number.isFinite(conteo.maximo)).toBe(true);
  });

  it('cero de peso son cero piezas y no un error', () => {
    // La gaveta vacía es un conteo válido, y es justo el que hay que registrar.
    const conteo = contarPorPeso(0n, tornillo());

    expect(conteo.piezas).toBe(0);
    expect(conteo.confiable).toBe(true);
  });
});
