import { describe, expect, it } from 'vitest';

import { desglosarImpuestos, type LineaConImpuesto } from './impuesto-mixto.ts';

/**
 * F-011 · IVA mixto por línea e IEPS con sus tres mecánicas.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que el redondeo ocurra UNA VEZ por bloque de tasa y no por línea. Un ticket
 * de catorce artículos redondeado línea a línea descuadra por centavos contra
 * el mismo cálculo hecho sobre la suma, y ésos son los centavos que hacen que
 * el tendero deje de creerle al ticket — y después, al inventario.
 *
 * Y que el IEPS se extraiga ANTES que el IVA. El precio de anaquel trae los
 * dos dentro, y el IVA se causa sobre el precio que ya incluye IEPS: hacerlo al
 * revés da un IVA menor y una base de IEPS mayor. El error no salta en ninguna
 * pantalla: sólo declara mal.
 */

function linea(cambios: Partial<LineaConImpuesto> = {}): LineaConImpuesto {
  return {
    id: 'l1',
    importeCentavos: 1600n,
    tasaIvaBp: 1600,
    ieps: { forma: 'ninguna' },
    ...cambios,
  };
}

describe('F-011 · el IVA extraído por línea', () => {
  it('el 16 % sale del precio, no se suma encima', () => {
    // $11.60 con IVA dentro: $10.00 de base y $1.60 de impuesto.
    const d = desglosarImpuestos([linea({ importeCentavos: 1160n })]);

    expect(d.totalCentavos).toBe(1160n);
    expect(d.ivaCentavos).toBe(160n);
    expect(d.subtotalCentavos).toBe(1000n);
  });

  it('la tasa 0 % no causa nada, y sigue siendo una tasa', () => {
    // El frijol, la leche y el pan. Tratarlos como «exentos y ya» los sacaría
    // del desglose, y el ticket tiene que poder imprimir su renglón.
    const d = desglosarImpuestos([linea({ importeCentavos: 2500n, tasaIvaBp: 0 })]);

    expect(d.ivaCentavos).toBe(0n);
    expect(d.subtotalCentavos).toBe(2500n);
    expect(d.porTasa).toHaveLength(1);
    expect(d.porTasa[0]?.tasaIvaBp).toBe(0);
  });

  it('LAS DOS TASAS EN EL MISMO TICKET, cada una en su renglón', () => {
    const d = desglosarImpuestos([
      linea({ id: 'leche', importeCentavos: 2500n, tasaIvaBp: 0 }),
      linea({ id: 'jabon', importeCentavos: 1160n, tasaIvaBp: 1600 }),
    ]);

    expect(d.totalCentavos).toBe(3660n);
    expect(d.ivaCentavos).toBe(160n);
    expect(d.porTasa.map((b) => b.tasaIvaBp)).toEqual([0, 1600]);
    expect(d.porTasa[1]?.baseCentavos).toBe(1000n);
  });

  it('el orden de los renglones NO depende del orden de captura', () => {
    // Un desglose que cambia de orden entre tickets parece dos cálculos
    // distintos, y el tendero compara tickets.
    const d = desglosarImpuestos([
      linea({ id: 'jabon', importeCentavos: 1160n, tasaIvaBp: 1600 }),
      linea({ id: 'leche', importeCentavos: 2500n, tasaIvaBp: 0 }),
    ]);

    expect(d.porTasa.map((b) => b.tasaIvaBp)).toEqual([0, 1600]);
  });
});

describe('F-011 · EL REDONDEO, UNA VEZ POR BLOQUE', () => {
  it('catorce líneas al 16 % dan lo mismo que su suma', () => {
    // Éste es el corazón del asunto. Si se redondeara por línea, cada una
    // perdería una fracción y el ticket descuadraría contra el mismo cálculo
    // hecho sobre el total del bloque.
    const catorce = Array.from({ length: 14 }, (_, i) =>
      linea({ id: `l${i}`, importeCentavos: 1999n }),
    );
    const d = desglosarImpuestos(catorce);

    const suma = 1999n * 14n;
    expect(d.totalCentavos).toBe(suma);
    expect(d.ivaCentavos).toBe((suma * 1600n) / 11_600n);
    // Y esa cifra NO es la suma de los IVAs por línea, que se queda corta.
    const porLinea = ((1999n * 1600n) / 11_600n) * 14n;
    expect(d.ivaCentavos).not.toBe(porLinea);
  });

  it('el subtotal más el IVA más el IEPS reconstruyen el total, siempre', () => {
    const d = desglosarImpuestos([
      linea({ id: 'a', importeCentavos: 1999n }),
      linea({ id: 'b', importeCentavos: 777n, tasaIvaBp: 0 }),
      linea({
        id: 'c',
        importeCentavos: 1800n,
        ieps: { forma: 'cuota_litro', cuotaCentavosPorLitro: 308n },
        litros: 0.6,
      }),
    ]);

    expect(d.subtotalCentavos + d.ivaCentavos + d.iepsCentavos).toBe(d.totalCentavos);
  });
});

describe('F-011 · el IEPS, con sus tres mecánicas', () => {
  it('cuota por LITRO: el refresco de 600 ml', () => {
    // $3.0818 por litro en 2026, redondeado a 308 centavos en la tabla.
    // 0.6 L × 308 = 184.8 → 184 centavos, truncado hacia abajo.
    const d = desglosarImpuestos([
      linea({
        importeCentavos: 1800n,
        ieps: { forma: 'cuota_litro', cuotaCentavosPorLitro: 308n },
        litros: 0.6,
      }),
    ]);

    expect(d.iepsCentavos).toBe(184n);
    // Y el IVA se calcula sobre lo que queda, no sobre los $18.
    expect(d.ivaCentavos).toBe(((1800n - 184n) * 1600n) / 11_600n);
  });

  it('AD VALOREM se extrae del precio, no se calcula sobre él', () => {
    // La botana de $10.80 con 8 % de IEPS dentro trae 80 centavos, no 86.
    // Calcularlo como 8 % del precio final es el error de siempre.
    const d = desglosarImpuestos([
      linea({ importeCentavos: 1080n, ieps: { forma: 'ad_valorem', tasaBp: 800 } }),
    ]);

    expect(d.iepsCentavos).toBe(80n);
  });

  it('cuota por PIEZA: el cigarro', () => {
    const d = desglosarImpuestos([
      linea({
        importeCentavos: 8000n,
        ieps: { forma: 'cuota_pieza', cuotaCentavosPorPieza: 64n },
        piezas: 20,
      }),
    ]);

    expect(d.iepsCentavos).toBe(1280n);
  });

  it('sin IEPS, el desglose no lo inventa', () => {
    expect(desglosarImpuestos([linea()]).iepsCentavos).toBe(0n);
  });

  it('una cuota mal capturada NO deja el subtotal negativo', () => {
    // Un refresco de $18 con «10 litros» daría un IEPS de $30.80. Sin este
    // corte, el ticket imprimiría un subtotal negativo como si fuera cierto.
    expect(() =>
      desglosarImpuestos([
        linea({
          importeCentavos: 1800n,
          ieps: { forma: 'cuota_litro', cuotaCentavosPorLitro: 308n },
          litros: 10,
        }),
      ]),
    ).toThrow();
  });

  it('un importe negativo se rechaza en vez de restarse del ticket', () => {
    expect(() => desglosarImpuestos([linea({ importeCentavos: -100n })])).toThrow();
  });
});

describe('F-011 · el ticket de una tiendita de verdad', () => {
  it('leche, refresco y botana, cada uno con lo suyo', () => {
    const d = desglosarImpuestos([
      // Tasa 0 %, sin IEPS: LIVA art. 2-A.
      linea({ id: 'leche', importeCentavos: 2800n, tasaIvaBp: 0 }),
      // 16 % más cuota por litro.
      linea({
        id: 'refresco',
        importeCentavos: 1800n,
        tasaIvaBp: 1600,
        ieps: { forma: 'cuota_litro', cuotaCentavosPorLitro: 308n },
        litros: 0.6,
      }),
      // 16 % más 8 % ad valorem.
      linea({
        id: 'botana',
        importeCentavos: 1080n,
        tasaIvaBp: 1600,
        ieps: { forma: 'ad_valorem', tasaBp: 800 },
      }),
    ]);

    expect(d.totalCentavos).toBe(5680n);
    expect(d.iepsCentavos).toBe(264n);
    // Los dos gravados se agrupan en UN bloque de 16 % antes de redondear.
    expect(d.porTasa).toHaveLength(2);
    expect(d.porTasa[1]?.tasaIvaBp).toBe(1600);
    expect(d.subtotalCentavos + d.ivaCentavos + d.iepsCentavos).toBe(5680n);
  });
});
