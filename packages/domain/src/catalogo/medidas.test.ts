import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { mismaMedida, normalizarMedida, piezasDesdePeso } from './medidas.ts';

/**
 * F-059 y F-151 · La medida técnica y la pesada.
 *
 * `1/4"`, `.25` y `6.35 mm` son el mismo dato y tres escrituras: el
 * distribuidor manda una, el mostradorista teclea otra y la etiqueta dice la
 * tercera. Si no se unen, el mismo tornillo vive tres veces en el catálogo, y
 * con la clave duplicada el conteo no cuadra nunca.
 */

function codigoDe(fn: () => unknown): string {
  try {
    fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('normalizarMedida', () => {
  it('LAS TRES ESCRITURAS DAN EL MISMO NÚMERO', () => {
    // Es la razón de existir de la función. Sin esto el tornillo de 1/4" vive
    // tres veces en el catálogo y el conteo no cuadra nunca.
    expect(normalizarMedida('1/4"').micras).toBe(6_350n);
    expect(normalizarMedida('.25').micras).toBe(6_350n);
    expect(normalizarMedida('6.35 mm').micras).toBe(6_350n);
  });

  it('UN OCTAVO NO SE PIERDE: 3,175 µm exactos', () => {
    // En milímetros enteros `1/8"` se redondea a 3 y deja de ser lo que es; con
    // decimales vuelven los flotantes. Por eso micras.
    expect(normalizarMedida('1/8"').micras).toBe(3_175n);
  });

  it('EL NÚMERO MIXTO del mostrador', () => {
    // «Una y media pulgadas» se teclea `1 1/2`, no `1.5`.
    expect(normalizarMedida('1 1/2"').micras).toBe(38_100n);
  });

  it('UNA FRACCIÓN SIN COMILLA ES PULGADAS', () => {
    // Nadie escribe una fracción de milímetro, y exigir la comilla haría que la
    // mitad de las capturas fallaran por un carácter que nadie teclea.
    expect(normalizarMedida('3/8').micras).toBe(9_525n);
    expect(normalizarMedida('3/8').sistema).toBe('fraccion_pulgada');
  });

  it('UN DECIMAL SIN UNIDAD TAMBIÉN ES PULGADAS', () => {
    // `.25` viene de la lista del distribuidor. Suponer milímetros lo haría 25
    // veces más chico: el tornillo equivocado, sin que nada falle.
    expect(normalizarMedida('.25').sistema).toBe('decimal_pulgada');
    expect(normalizarMedida('.25').micras).toBe(6_350n);
  });

  it('EL MÉTRICO SE DECLARA Y SE RECONOCE', () => {
    expect(normalizarMedida('13 mm').micras).toBe(13_000n);
    expect(normalizarMedida('13mm').micras).toBe(13_000n);
    expect(normalizarMedida('2 m').micras).toBe(2_000_000n);
    expect(normalizarMedida('1.5 cm').micras).toBe(15_000n);
    expect(normalizarMedida('13 mm').sistema).toBe('metrico');
  });

  it('LAS TRES COMILLAS: la recta, la tipográfica y la doble prima', () => {
    // El catálogo del distribuidor llega con las tres, según de qué hoja de
    // cálculo salió.
    for (const escritura of ['1/2"', '1/2”', '1/2″']) {
      expect(normalizarMedida(escritura).micras).toBe(12_700n);
    }
  });

  it('«pulgadas» escrito con letra', () => {
    expect(normalizarMedida('2 pulgadas').micras).toBe(50_800n);
    expect(normalizarMedida('2 pulg').micras).toBe(50_800n);
  });

  it('EL ORIGINAL SE CONSERVA TAL CUAL', () => {
    // El mostradorista busca `1/4` y espera ver `1/4"`, no `6.35 mm`. Y
    // reconstruir la fracción desde el decimal es ambiguo: la correcta es la
    // que se capturó.
    expect(normalizarMedida('  1/4"  ').original).toBe('1/4"');
  });

  it('UNA FRACCIÓN MÉTRICA NO EXISTE en ninguna lista', () => {
    expect(codigoDe(() => normalizarMedida('3/8 mm'))).toBe('CATALOGO_INVALIDO');
  });

  it('una fracción entre cero', () => {
    expect(codigoDe(() => normalizarMedida('1/0'))).toBe('CATALOGO_INVALIDO');
  });

  it('lo que no es una medida se rechaza en vez de valer cero', () => {
    expect(codigoDe(() => normalizarMedida('tornillo'))).toBe('CATALOGO_INVALIDO');
    expect(codigoDe(() => normalizarMedida('   '))).toBe('CATALOGO_INVALIDO');
  });

  it('LA DIVISIÓN VA AL FINAL: un tercio de pulgada no pierde milímetros', () => {
    // 25400 / 3 = 8466.66… Dividir la pulgada antes de multiplicar dejaría el
    // error en la décima de milímetro en vez de en la micra.
    expect(normalizarMedida('1/3"').micras).toBe(8_466n);
    // Con numerador mayor que uno la diferencia se ve: 50800/3 = 16,933, y
    // dividir primero da 2 × 8,466 = 16,932. Una micra por ahora; sobre un
    // rollo de cien metros, centímetros.
    expect(normalizarMedida('2/3"').micras).toBe(16_933n);
  });
});

describe('mismaMedida', () => {
  it('MEDIA PULGADA Y TRECE MILÍMETROS SON LA MISMA TUERCA', () => {
    // 12,700 contra 13,000: trescientas micras. Comparar por igualdad exacta
    // haría que el mostradorista no encontrara nunca la equivalencia que usa
    // todos los días.
    expect(mismaMedida(12_700n, 13_000n, 300n)).toBe(true);
  });

  it('LA TOLERANCIA SE PASA, NO SE FIJA', () => {
    // 300 µm sobre media pulgada es nada; sobre un tornillo de 1/16" es otro
    // tornillo. Quien busca sabe en qué línea está; el dominio no.
    expect(mismaMedida(12_700n, 13_000n, 100n)).toBe(false);
  });

  it('el orden no importa', () => {
    expect(mismaMedida(13_000n, 12_700n, 300n)).toBe(true);
  });

  it('una tolerancia negativa no acepta nada', () => {
    expect(codigoDe(() => mismaMedida(1n, 1n, -1n))).toBe('CATALOGO_INVALIDO');
  });
});

describe('piezasDesdePeso', () => {
  // Un tornillo de 5 gramos.
  const TORNILLO = { pesoPorPiezaMg: 5_000n, toleranciaPct: '8.00' };

  it('UN KILO DE TORNILLO SON DOSCIENTAS PIEZAS', () => {
    const conteo = piezasDesdePeso(1_000_000n, TORNILLO);

    expect(conteo.piezas).toBe(200n);
    expect(conteo.dentroDeTolerancia).toBe(true);
  });

  it('AL ENTERO MÁS CERCANO, no hacia abajo', () => {
    // Hacia abajo se regalaría una pieza en cada venta grande; hacia arriba se
    // cobraría una de más. 1,002 g de tornillos de 5 g son 200.4: doscientos.
    expect(piezasDesdePeso(1_002_000n, TORNILLO).piezas).toBe(200n);
    // Y 1,003 g son 200.6: doscientos uno.
    expect(piezasDesdePeso(1_003_000n, TORNILLO).piezas).toBe(201n);
  });

  it('LA TOLERANCIA AVISA, NO BLOQUEA', () => {
    // Un lote con 8 % de desviación es un lote real, no un fraude. Lo que hace
    // falta es que el mostrador lo sepa para recalibrar, no que la venta se
    // detenga con el cliente delante.
    const conteo = piezasDesdePeso(1_100_000n, TORNILLO);

    expect(conteo.piezas).toBe(220n);
    expect(conteo.dentroDeTolerancia).toBe(true);
  });

  it('FUERA DE TOLERANCIA SE DICE, y la pesada sigue valiendo', () => {
    // El lote viene de otra fundición y pesa distinto. Con tolerancia apretada
    // —una décima de punto— 2 g de desviación sobre 1 kg ya se pasa: la venta
    // NO se detiene, pero el mostrador sabe que hay que recalibrar.
    const apretado = { pesoPorPiezaMg: 5_000n, toleranciaPct: '0.10' };
    const conteo = piezasDesdePeso(1_002_000n, apretado);

    expect(conteo.piezas).toBe(200n);
    expect(conteo.pesoEsperadoMg).toBe(1_000_000n);
    expect(conteo.dentroDeTolerancia).toBe(false);
  });

  it('EL ESPERADO SE ENSEÑA, para poder discutir la diferencia', () => {
    const conteo = piezasDesdePeso(1_002_000n, TORNILLO);

    expect(conteo.pesoEsperadoMg).toBe(1_000_000n);
  });

  it('MEDIA PIEZA NO SE COBRA NI SE REGALA: se dice', () => {
    // Cobrar cero sería regalarla; cobrar una sería inventar la mitad que falta.
    expect(codigoDe(() => piezasDesdePeso(2_000n, TORNILLO))).toBe('CANTIDAD_INVALIDA');
  });

  it('sin peso por pieza no hay conversión', () => {
    expect(
      codigoDe(() => piezasDesdePeso(1_000n, { pesoPorPiezaMg: 0n, toleranciaPct: '8.00' })),
    ).toBe('CATALOGO_INVALIDO');
  });

  it('una pesada de cero no vende nada', () => {
    expect(codigoDe(() => piezasDesdePeso(0n, TORNILLO))).toBe('CANTIDAD_INVALIDA');
  });

  it('una tolerancia que no es porcentaje', () => {
    expect(
      codigoDe(() =>
        piezasDesdePeso(1_000_000n, { pesoPorPiezaMg: 5_000n, toleranciaPct: 'ocho' }),
      ),
    ).toBe('CONFIGURACION_INVALIDA');
  });
});
