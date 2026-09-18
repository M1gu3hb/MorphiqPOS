import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  calcularComision,
  repartirComision,
  type LineaComisionable,
  type ReglaComision,
} from './comision.ts';

/**
 * F-440, F-423 y F-428 · La comisión con su regla escrita.
 *
 * Hoy se saca con calculadora el domingo, y es la fuente número uno de pleitos
 * y de rotación en un salón. Lo que hace confiable un cálculo de comisión no es
 * la aritmética: es que las cinco preguntas estén contestadas ANTES.
 */

function regla(extra: Partial<ReglaComision> = {}): ReglaComision {
  return {
    esquema: 'porcentaje_fijo',
    tasaServicioBp: 5_000,
    tasaProductoBp: 1_000,
    base: 'cobrado',
    sobreIva: false,
    material: 'salon',
    reparto: 'por_servicio',
    rehacerPaga: false,
    escalones: null,
    ...extra,
  };
}

function linea(extra: Partial<LineaComisionable> = {}): LineaComisionable {
  return {
    tipo: 'servicio',
    // Un tinte de $1,000 con 20 % de descuento: se cobran $800.
    cobradoSinIvaCentavos: 80_000n,
    listaSinIvaCentavos: 100_000n,
    ivaCentavos: 12_800n,
    materialCentavos: 12_000n,
    esRehacer: false,
    acumuladoPrevioCentavos: 0n,
    ...extra,
  };
}

function codigoDe(fn: () => unknown): string {
  try {
    fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('calcularComision · pregunta 1 · cobrado, lista o mitad', () => {
  it('SOBRE LO COBRADO: el descuento lo pagan los dos', () => {
    expect(calcularComision(regla({ base: 'cobrado' }), linea()).montoCentavos).toBe(40_000n);
  });

  it('SOBRE LISTA: el descuento lo pone el salón entero', () => {
    expect(calcularComision(regla({ base: 'lista' }), linea()).montoCentavos).toBe(50_000n);
  });

  it('MITAD: el trato más común y el que nadie modela', () => {
    // Ni el salón lo absorbe entero ni ella lo paga entero. Sin esta opción, el
    // salón elige una de las dos y la estilista descubre el trato el domingo.
    expect(calcularComision(regla({ base: 'mitad' }), linea()).montoCentavos).toBe(45_000n);
  });

  it('EL CENTAVO IMPAR DE LA MITAD se queda en el salón, y se dice', () => {
    const impar = linea({ cobradoSinIvaCentavos: 80_001n, listaSinIvaCentavos: 100_000n });
    // (80001 + 100000) / 2 = 90000.5 → 90000.
    expect(calcularComision(regla({ base: 'mitad' }), impar).baseCentavos).toBe(90_000n);
  });
});

describe('calcularComision · pregunta 2 · sobre el IVA', () => {
  it('POR OMISIÓN NO se comisiona el IVA', () => {
    // El IVA no es del salón: es del SAT. Comisionarlo por omisión regalaría el
    // 8 % de un impuesto que sólo se está guardando.
    expect(calcularComision(regla({ sobreIva: false }), linea()).baseCentavos).toBe(80_000n);
  });

  it('cuando el trato lo dice, entra', () => {
    expect(calcularComision(regla({ sobreIva: true }), linea()).baseCentavos).toBe(92_800n);
  });
});

describe('calcularComision · pregunta 3 · el material', () => {
  it('EL SALÓN LO PONE: la comisión no se toca', () => {
    const comision = calcularComision(regla({ material: 'salon' }), linea());

    expect(comision.montoCentavos).toBe(40_000n);
    expect(comision.materialDescontadoCentavos).toBe(0n);
    expect(comision.materialACargoCentavos).toBe(0n);
  });

  it('SE DESCUENTA DE LA BASE: sale de la comisión', () => {
    const comision = calcularComision(regla({ material: 'descuenta_base' }), linea());

    expect(comision.montoCentavos).toBe(28_000n);
    expect(comision.materialDescontadoCentavos).toBe(12_000n);
  });

  it('LO PAGA ELLA: se cobra APARTE, no restando la comisión', () => {
    const comision = calcularComision(regla({ material: 'cobra_profesional' }), linea());

    expect(comision.montoCentavos).toBe(40_000n);
    expect(comision.materialACargoCentavos).toBe(12_000n);
    expect(comision.materialDescontadoCentavos).toBe(0n);
  });

  it('LA COMISIÓN NUNCA SALE NEGATIVA', () => {
    // Un material más caro que la comisión no convierte el servicio en una
    // deuda: la comisión llega a cero. Una comisión negativa en la liquidación
    // se lee como un castigo y nadie entiende de dónde salió.
    const caro = linea({ materialCentavos: 90_000n });
    const comision = calcularComision(regla({ material: 'descuenta_base' }), caro);

    expect(comision.montoCentavos).toBe(0n);
  });
});

describe('calcularComision · pregunta 5 · rehacer', () => {
  it('REHACER NO SE PAGA DOS VECES, por omisión', () => {
    const comision = calcularComision(regla(), linea({ esRehacer: true }));

    expect(comision.montoCentavos).toBe(0n);
  });

  it('salvo que el trato diga lo contrario', () => {
    const comision = calcularComision(regla({ rehacerPaga: true }), linea({ esRehacer: true }));

    expect(comision.montoCentavos).toBe(40_000n);
  });

  it('EL MATERIAL DEL REHACER SE COBRA IGUAL cuando el trato es que ella lo paga', () => {
    // El producto se fue del almacén. Perdonarlo haría que rehacer saliera
    // gratis para quien lo rehace y caro para el salón: el incentivo al revés.
    const comision = calcularComision(
      regla({ material: 'cobra_profesional' }),
      linea({ esRehacer: true }),
    );

    expect(comision.montoCentavos).toBe(0n);
    expect(comision.materialACargoCentavos).toBe(12_000n);
  });
});

describe('calcularComision · esquemas', () => {
  it('SIN COMISIÓN es un esquema, no una tasa de cero', () => {
    // La recepcionista y la asistente cobran así. Una tasa de cero se lee como
    // un error de captura.
    const comision = calcularComision(regla({ esquema: 'sin_comision' }), linea());

    expect(comision.montoCentavos).toBe(0n);
    expect(comision.tasaBp).toBe(0);
  });

  it('EL PRODUCTO LLEVA SU PROPIA TASA', () => {
    // Vender shampoo no se paga igual que hacer un tinte.
    const comision = calcularComision(regla(), linea({ tipo: 'producto' }));

    expect(comision.tasaBp).toBe(1_000);
    expect(comision.montoCentavos).toBe(8_000n);
  });

  it('EL ESCALÓN PREMIA EL MES, no el ticket', () => {
    // Decidirlo por la línea haría que un servicio de $2,000 pagara al 50 % y
    // uno de $200 al 40 % el mismo día, que no es lo que nadie acordó.
    const escalonado = regla({
      esquema: 'escalonado',
      escalones: [
        { hastaCentavos: 2_000_000n, tasaBp: 4_000 },
        { hastaCentavos: 5_000_000n, tasaBp: 5_000 },
      ],
    });

    expect(calcularComision(escalonado, linea({ acumuladoPrevioCentavos: 0n })).tasaBp).toBe(4_000);
    expect(
      calcularComision(escalonado, linea({ acumuladoPrevioCentavos: 3_000_000n })).tasaBp,
    ).toBe(5_000);
  });

  it('POR ENCIMA DEL ÚLTIMO ESCALÓN manda el último', () => {
    // Dejarlo en cero castigaría justo al que más vendió.
    const escalonado = regla({
      esquema: 'escalonado',
      escalones: [{ hastaCentavos: 2_000_000n, tasaBp: 4_000 }],
    });

    expect(
      calcularComision(escalonado, linea({ acumuladoPrevioCentavos: 9_000_000n })).tasaBp,
    ).toBe(4_000);
  });

  it('un escalonado sin escalones no calcula nada', () => {
    expect(codigoDe(() => calcularComision(regla({ esquema: 'escalonado' }), linea()))).toBe(
      'CONFIGURACION_INVALIDA',
    );
  });
});

describe('repartirComision · pregunta 4', () => {
  const KARLA = { profesionalId: 'karla', participacionBp: 6_000 };
  const DANY = { profesionalId: 'dany', participacionBp: 4_000 };

  it('TODO A QUIEN LO TOMÓ', () => {
    const reparto = repartirComision(40_000n, [KARLA, DANY], 'todo_a_quien_tomo');

    expect(reparto).toEqual([{ profesionalId: 'karla', montoCentavos: 40_000n }]);
  });

  it('POR PARTICIPACIÓN', () => {
    // Karla aplica el tinte y Dany lo termina porque Karla salió a comer.
    const reparto = repartirComision(40_000n, [KARLA, DANY], 'por_servicio');

    expect(reparto).toEqual([
      { profesionalId: 'karla', montoCentavos: 24_000n },
      { profesionalId: 'dany', montoCentavos: 16_000n },
    ]);
  });

  it('LO REPARTIDO SUMA SIEMPRE EL TOTAL', () => {
    for (const monto of [1n, 7n, 333n, 40_001n, 999_999n]) {
      const reparto = repartirComision(monto, [KARLA, DANY], 'por_servicio');
      expect(reparto.reduce((a, r) => a + r.montoCentavos, 0n)).toBe(monto);
    }
  });

  it('EL CENTAVO SOBRANTE VA A QUIEN MÁS PARTICIPÓ', () => {
    // Tiene que ir a algún lado, y por orden de lista caería siempre en la
    // misma persona.
    const reparto = repartirComision(
      1n,
      [
        { profesionalId: 'poco', participacionBp: 3_000 },
        { profesionalId: 'mucho', participacionBp: 7_000 },
      ],
      'por_servicio',
    );

    expect(reparto.find((r) => r.profesionalId === 'mucho')?.montoCentavos).toBe(1n);
  });

  it('PARTICIPACIONES QUE NO SUMAN EL TOTAL repartirían de más o de menos', () => {
    // Y la diferencia aparecería en la liquidación sin renglón que la explique.
    expect(
      codigoDe(() =>
        repartirComision(40_000n, [KARLA, { ...DANY, participacionBp: 3_000 }], 'por_servicio'),
      ),
    ).toBe('CONFIGURACION_INVALIDA');
  });

  it('un servicio sin nadie que lo haya hecho', () => {
    expect(codigoDe(() => repartirComision(40_000n, [], 'por_servicio'))).toBe(
      'CONFIGURACION_INVALIDA',
    );
  });
});
