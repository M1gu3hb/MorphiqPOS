import { describe, expect, it } from 'vitest';

import {
  margenDelCanal,
  precioParaIgualarMargen,
  precioPorCanal,
  type ProductoConListas,
} from './lista-precio.ts';

/**
 * F-023 · Listas de precio por canal.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que el precio se RESUELVA y nunca se elija, que el canal sin precio propio
 * herede del de barra Y LO DIGA —sin esa distinción no existe la lista de «qué
 * falta por ajustar», que es todo el valor de esta función—, y que la comisión
 * se aplique al precio de venta y no al margen: al margen da un número más
 * bonito y equivocado.
 */

function cafe(cambios: Partial<ProductoConListas> = {}): ProductoConListas {
  return { id: 'p1', precioBaseCentavos: 5800n, listas: [], ...cambios };
}

describe('F-023 · resolver el precio', () => {
  it('el canal con precio propio manda', () => {
    const r = precioPorCanal(
      cafe({ listas: [{ canal: 'plataforma', precioCentavos: 7500n }] }),
      'plataforma',
    );

    expect(r.precioCentavos).toBe(7500n);
    expect(r.propio).toBe(true);
  });

  it('SIN precio propio hereda el de barra, y lo dice', () => {
    // La distinción es la función entera: «$58 porque alguien lo decidió» y
    // «$58 porque nadie lo ha tocado» son cosas distintas, y sólo la segunda
    // sale en la lista de lo que falta por ajustar.
    const r = precioPorCanal(cafe(), 'plataforma');

    expect(r.precioCentavos).toBe(5800n);
    expect(r.propio).toBe(false);
  });

  it('una lista de otro canal no se aplica a éste', () => {
    const r = precioPorCanal(
      cafe({ listas: [{ canal: 'para_llevar', precioCentavos: 6200n }] }),
      'plataforma',
    );

    expect(r.precioCentavos).toBe(5800n);
  });

  it('un precio de lista en `null` es «hereda», no «gratis»', () => {
    const r = precioPorCanal(
      cafe({ listas: [{ canal: 'plataforma', precioCentavos: null }] }),
      'plataforma',
    );

    expect(r.precioCentavos).toBe(5800n);
    expect(r.propio).toBe(false);
  });

  it('un precio negativo se rechaza en vez de cobrarse', () => {
    expect(() =>
      precioPorCanal(cafe({ listas: [{ canal: 'barra', precioCentavos: -100n }] }), 'barra'),
    ).toThrow();
  });
});

describe('F-023 · el margen que de verdad queda', () => {
  it('LA COMISIÓN SALE DEL PRECIO, no del margen', () => {
    // Café de $58 con costo de $18 y comisión del 30 %: quedan $40.60 de venta
    // menos $18 de costo, o sea $22.60. Aplicarla al margen daría $28, que es
    // el número bonito y falso.
    expect(margenDelCanal(5800n, 1800n, 3000)).toBe(2260n);
  });

  it('sin comisión, el margen es el de siempre', () => {
    expect(margenDelCanal(5800n, 1800n, 0)).toBe(4000n);
  });

  it('EL PRECIO DE BARRA EN PLATAFORMA PIERDE DINERO, y aquí se ve', () => {
    // Es exactamente el 29 % de pérdida de margen que nadie ve hoy: de $40 de
    // margen quedan $22.60. Un 43 % menos por el mismo café.
    const enBarra = margenDelCanal(5800n, 1800n, 0);
    const enPlataforma = margenDelCanal(5800n, 1800n, 3000);

    expect(enPlataforma).toBeLessThan(enBarra);
  });

  it('una comisión fuera de rango se rechaza', () => {
    expect(() => margenDelCanal(5800n, 1800n, 12_000)).toThrow();
  });
});

describe('F-023 · el precio que iguala el margen', () => {
  it('sube lo justo para que el canal deje lo mismo que la barra', () => {
    // Con costo $18 y comisión 30 %, el café de $58 hay que ponerlo a $82.86.
    const precio = precioParaIgualarMargen(5800n, 1800n, 3000);

    expect(precio).toBe(8286n);
    // Y el margen resultante NO baja del de barra.
    expect(margenDelCanal(precio, 1800n, 3000)).toBeGreaterThanOrEqual(
      margenDelCanal(5800n, 1800n, 0),
    );
  });

  it('REDONDEA HACIA ARRIBA', () => {
    // Quedarse un centavo corto reproduce el problema que este cálculo viene a
    // resolver, y un peso de más en un café de plataforma no lo nota nadie.
    const precio = precioParaIgualarMargen(1000n, 300n, 3333);

    expect(margenDelCanal(precio, 300n, 3333)).toBeGreaterThanOrEqual(700n);
  });

  it('sin comisión, el precio no cambia', () => {
    expect(precioParaIgualarMargen(5800n, 1800n, 0)).toBe(5800n);
  });

  it('una comisión del 100 % no tiene precio que la compense', () => {
    expect(() => precioParaIgualarMargen(5800n, 1800n, 10_000)).toThrow();
  });
});
