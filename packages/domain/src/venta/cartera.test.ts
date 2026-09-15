import { describe, expect, it } from 'vitest';

import {
  antiguedadDeSaldos,
  avisosDeVencimiento,
  hayMora,
  type DocumentoDeCartera,
} from './cartera.ts';
import { repartirPago, type DocumentoPorCobrar } from './credito.ts';

/**
 * F-613, F-614, F-616 y F-617 · La cartera de crédito.
 *
 * Las tres puertas de pérdida del giro: se fía sin límite, se fía sin plazo, y
 * nadie sabe cuánto lleva vencido. Esto prueba la tercera, que es la que no
 * cierra ninguna columna.
 *
 * Y prueba también que `repartirPago` —que E6 ya había escrito para F-614—
 * sirve tal cual para el fiado de una tiendita. Ésa es la comprobación que
 * convierte una sospecha de reutilización en una reutilización: si no sirviera,
 * habría que reclasificar la función a `[≠]` y decirlo.
 */

const HOY = new Date('2026-09-16T12:00:00.000Z');

function doc(cambios: Partial<DocumentoDeCartera> = {}): DocumentoDeCartera {
  return {
    id: 'd1',
    folio: 'R-001',
    emitidoEn: new Date('2026-08-16T12:00:00.000Z'),
    venceEn: new Date('2026-09-15T12:00:00.000Z'),
    importeCentavos: 100_000n,
    saldoCentavos: 100_000n,
    ...cambios,
  };
}

const dias = (n: number) => new Date(HOY.getTime() + n * 86_400_000);

describe('F-613 · antigüedad de saldos', () => {
  it('reparte por tramos de días VENCIDOS', () => {
    const a = antiguedadDeSaldos(
      [
        doc({ id: 'a', venceEn: dias(5), saldoCentavos: 10_000n }),
        doc({ id: 'b', venceEn: dias(-10), saldoCentavos: 20_000n }),
        doc({ id: 'c', venceEn: dias(-45), saldoCentavos: 30_000n }),
        doc({ id: 'd', venceEn: dias(-75), saldoCentavos: 40_000n }),
        doc({ id: 'e', venceEn: dias(-200), saldoCentavos: 50_000n }),
      ],
      HOY,
    );

    expect(a.porTramo.por_vencer).toBe(10_000n);
    expect(a.porTramo.v1_30).toBe(20_000n);
    expect(a.porTramo.v31_60).toBe(30_000n);
    expect(a.porTramo.v61_90).toBe(40_000n);
    expect(a.porTramo.v90_mas).toBe(50_000n);
    expect(a.totalCentavos).toBe(150_000n);
    // Lo por vencer NO es mora: separar los dos números es la mitad del valor.
    expect(a.vencidoCentavos).toBe(140_000n);
    expect(a.diasDelMasViejo).toBe(200);
  });

  it('«por vencer» es un tramo y no una ausencia', () => {
    // Un cliente con $80 000 por vencer y otro con $80 000 a 90 días no son el
    // mismo riesgo. Una tabla que sólo enseñara lo vencido los pintaría igual.
    const a = antiguedadDeSaldos([doc({ venceEn: dias(7) })], HOY);

    expect(a.porTramo.por_vencer).toBe(100_000n);
    expect(a.vencidoCentavos).toBe(0n);
    expect(a.diasDelMasViejo).toBe(0);
  });

  it('el documento saldado no cuenta', () => {
    const a = antiguedadDeSaldos([doc({ saldoCentavos: 0n, venceEn: dias(-200) })], HOY);

    expect(a.totalCentavos).toBe(0n);
    expect(a.diasDelMasViejo).toBe(0);
  });

  it('el día exacto del vencimiento todavía NO está vencido', () => {
    const a = antiguedadDeSaldos([doc({ venceEn: HOY })], HOY);

    expect(a.porTramo.por_vencer).toBe(100_000n);
  });
});

/** El documento de cartera, visto como lo que `repartirPago` ya sabía leer. */
function porCobrar(d: DocumentoDeCartera): DocumentoPorCobrar {
  // `fecha` es el VENCIMIENTO y no la emisión: `repartirPago` ordena por ese
  // campo, y lo que tiene que pagarse primero es lo que venció primero.
  return { id: d.id, saldoCentavos: d.saldoCentavos, fecha: d.venceEn };
}

describe('F-614 y F-615 · a qué se aplica el pago · con la función de E6', () => {
  it('lo MÁS VIEJO primero, y eso no es una preferencia', () => {
    const reparto = repartirPago(
      50_000n,
      [
        doc({ id: 'nuevo', folio: 'R-009', venceEn: dias(-5), saldoCentavos: 50_000n }),
        doc({ id: 'viejo', folio: 'R-001', venceEn: dias(-200), saldoCentavos: 50_000n }),
      ].map(porCobrar),
    );

    // Aplicarlo al más nuevo dejaría para siempre una factura de hace dos años
    // en el tramo de 90 días: la cartera diría que hay mora crónica donde sólo
    // hay una aplicación mal hecha.
    expect(reparto.aplicaciones).toHaveLength(1);
    expect(reparto.aplicaciones[0]?.documentoId).toBe('viejo');
  });

  it('un pago parcial deja el documento con su saldo, no lo salda', () => {
    const reparto = repartirPago(30_000n, [doc({ saldoCentavos: 100_000n })].map(porCobrar));

    expect(reparto.aplicaciones[0]?.montoCentavos).toBe(30_000n);
    expect(reparto.sobranteCentavos).toBe(0n);
  });

  it('cubre varios documentos en orden hasta que se acaba', () => {
    const reparto = repartirPago(
      70_000n,
      [
        doc({ id: 'a', folio: 'R-001', venceEn: dias(-90), saldoCentavos: 40_000n }),
        doc({ id: 'b', folio: 'R-002', venceEn: dias(-60), saldoCentavos: 40_000n }),
        doc({ id: 'c', folio: 'R-003', venceEn: dias(-30), saldoCentavos: 40_000n }),
      ].map(porCobrar),
    );

    expect(reparto.aplicaciones.map((a) => [a.documentoId, a.montoCentavos])).toEqual([
      ['a', 40_000n],
      ['b', 30_000n],
    ]);
  });

  it('lo que sobra queda A FAVOR, no se reparte contra lo no vencido', () => {
    const reparto = repartirPago(50_000n, [doc({ saldoCentavos: 20_000n })].map(porCobrar));

    // Repartirlo cancelaría por adelantado un crédito que el cliente no ha
    // usado, y el día que devuelva mercancía habría que deshacer la aplicación.
    expect(reparto.sobranteCentavos).toBe(30_000n);
  });

  it('rechaza un pago de cero', () => {
    expect(() => repartirPago(0n, [doc()].map(porCobrar))).toThrow();
  });
});

describe('F-617 · la mora, que es la mitad que faltaba', () => {
  it('hay mora cuando el documento más viejo pasa la tolerancia', () => {
    const conMora = antiguedadDeSaldos([doc({ venceEn: dias(-90) })], HOY);
    expect(hayMora(conMora, 15)).toBe(true);
  });

  it('quince días de retraso NO son mora si se toleran quince', () => {
    // El tope es «hasta», no «menos de»: un cliente que paga el día quince
    // cumplió, y bloquearlo por cumplir es cómo se pierde un cliente bueno.
    const justo = antiguedadDeSaldos([doc({ venceEn: dias(-15) })], HOY);
    expect(hayMora(justo, 15)).toBe(false);
  });

  it('lo que sólo está por vencer nunca es mora', () => {
    const sinMora = antiguedadDeSaldos([doc({ venceEn: dias(5) })], HOY);
    expect(hayMora(sinMora, 0)).toBe(false);
  });

  it('con tolerancia cero, un día de retraso ya es mora', () => {
    // Es la perilla que separa los dos giros: en una tiendita el fiado se cobra
    // el viernes; en una obra a sesenta días, quince de retraso es martes.
    const unDia = antiguedadDeSaldos([doc({ venceEn: dias(-1) })], HOY);
    expect(hayMora(unDia, 0)).toBe(true);
    expect(hayMora(unDia, 15)).toBe(false);
  });

  it('rechaza una tolerancia que no es un entero de cero para arriba', () => {
    const a = antiguedadDeSaldos([doc()], HOY);
    expect(() => hayMora(a, -1)).toThrow();
  });
});

describe('F-616 · el aviso de vencimiento', () => {
  it('avisa ANTES, no después', () => {
    const avisos = avisosDeVencimiento(
      [
        doc({ id: 'a', folio: 'R-001', venceEn: dias(2) }),
        doc({ id: 'b', folio: 'R-002', venceEn: dias(-1) }),
        doc({ id: 'c', folio: 'R-003', venceEn: dias(30) }),
      ],
      HOY,
      3,
    );

    // Lo ya vencido es cobranza y tiene su propia pantalla. Mezclarlos haría
    // que el aviso amable llegara con los morosos dentro.
    expect(avisos.map((a) => a.documentoId)).toEqual(['a']);
  });

  it('ordena por urgencia: lo que vence antes va primero', () => {
    const avisos = avisosDeVencimiento(
      [
        doc({ id: 'a', folio: 'R-001', venceEn: dias(3) }),
        doc({ id: 'b', folio: 'R-002', venceEn: dias(1) }),
      ],
      HOY,
      3,
    );

    expect(avisos.map((a) => a.documentoId)).toEqual(['b', 'a']);
  });

  it('no avisa de lo ya saldado', () => {
    expect(avisosDeVencimiento([doc({ venceEn: dias(1), saldoCentavos: 0n })], HOY, 3)).toEqual([]);
  });

  it('rechaza unos días de aviso que no son un entero', () => {
    expect(() => avisosDeVencimiento([doc()], HOY, -1)).toThrow();
  });
});
