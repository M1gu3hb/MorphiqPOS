import { describe, expect, it } from 'vitest';

import { resolverCombo, type ComponenteDeCombo } from './combo.ts';

/**
 * F-030 · Paquetes y combos.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que el combo se resuelva en SUS COMPONENTES —si se vende como un producto
 * suelto, el café y la concha nunca se descuentan del inventario y el conteo
 * del sábado deja de cuadrar— y que el descuento se reparta cerrando EXACTO:
 * repartir $13 entre tres partes deja centavos sueltos, y un combo cuyas partes
 * no suman su precio es un ticket que el cliente puede sumar y desmentir.
 */

function componente(cambios: Partial<ComponenteDeCombo> = {}): ComponenteDeCombo {
  return { productoId: 'cafe', cantidad: 1, precioSueltoCentavos: 5800n, ...cambios };
}

const DESAYUNO = [
  componente({ productoId: 'cafe', precioSueltoCentavos: 5800n }),
  componente({ productoId: 'concha', precioSueltoCentavos: 2000n }),
];

describe('F-030 · el combo se resuelve en sus partes', () => {
  it('devuelve UNA línea por componente, nunca una del combo', () => {
    // Es la diferencia entre poder descontar inventario y no poder.
    const r = resolverCombo(6500n, DESAYUNO);

    expect(r.lineas.map((l) => l.productoId)).toEqual(['cafe', 'concha']);
    expect(r.valorSuelto).toBe(7800n);
    expect(r.descuentoTotal).toBe(1300n);
  });

  it('LAS PARTES SUMAN EL PRECIO DEL COMBO, al centavo', () => {
    const r = resolverCombo(6500n, DESAYUNO);
    const suma = r.lineas.reduce((s, l) => s + l.precioCentavos, 0n);

    expect(suma).toBe(6500n);
  });

  it('el descuento se reparte A PRORRATA, no en partes iguales', () => {
    // El café vale el 74 % del combo y carga el 74 % del descuento. En partes
    // iguales, la concha de $20 cargaría $6.50 y su margen saldría absurdo.
    const r = resolverCombo(6500n, DESAYUNO);

    // 1300 × 5800 / 7800 = 966.6… → 966, y 1300 × 2000 / 7800 = 333.3… → 333.
    // Sobra un centavo, que se le carga al más caro: 967 y 333.
    expect(r.lineas[0]?.descuentoCentavos).toBe(967n);
    expect(r.lineas[1]?.descuentoCentavos).toBe(333n);
  });

  it('EL CENTAVO SOBRANTE va al componente más caro', () => {
    // Tres partes iguales de un descuento de 10: 3 + 3 + 3 y sobra 1. Sin esta
    // regla, las partes suman 1 centavo menos que el combo y el cliente lo suma.
    const r = resolverCombo(20n, [
      componente({ productoId: 'a', precioSueltoCentavos: 10n }),
      componente({ productoId: 'b', precioSueltoCentavos: 10n }),
      componente({ productoId: 'c', precioSueltoCentavos: 10n }),
    ]);

    expect(r.lineas.reduce((s, l) => s + l.precioCentavos, 0n)).toBe(20n);
    // Empate de precio: gana el `productoId` menor, para que el resultado no
    // dependa del orden en que la pantalla mandó los componentes.
    expect(r.lineas[0]?.descuentoCentavos).toBe(4n);
  });

  it('el resultado NO depende del orden de captura', () => {
    const enOrden = resolverCombo(6500n, DESAYUNO);
    const alReves = resolverCombo(6500n, [...DESAYUNO].reverse());

    const porId = (r: typeof enOrden) =>
      Object.fromEntries(r.lineas.map((l) => [l.productoId, l.precioCentavos]));
    expect(porId(alReves)).toEqual(porId(enOrden));
  });

  it('sin descuento, cada parte cobra su precio suelto', () => {
    const r = resolverCombo(7800n, DESAYUNO);

    expect(r.descuentoTotal).toBe(0n);
    expect(r.lineas.every((l) => l.descuentoCentavos === 0n)).toBe(true);
  });

  it('el combo GRATIS reparte el descuento entero', () => {
    // La promoción de apertura existe, y no puede reventar la aritmética.
    const r = resolverCombo(0n, DESAYUNO);

    expect(r.lineas.reduce((s, l) => s + l.precioCentavos, 0n)).toBe(0n);
  });
});

describe('F-030 · lo que se rechaza', () => {
  it('un combo MÁS CARO que sus partes no es un combo', () => {
    // Es un error de captura que el cliente descubre sumando, y con razón.
    expect(() => resolverCombo(9000n, DESAYUNO)).toThrow();
  });

  it('un combo sin componentes no vende nada', () => {
    expect(() => resolverCombo(6500n, [])).toThrow();
  });

  it('componentes que suman cero no dejan sobre qué repartir', () => {
    expect(() => resolverCombo(0n, [componente({ precioSueltoCentavos: 0n })])).toThrow();
  });

  it('un componente con precio negativo se rechaza', () => {
    expect(() =>
      resolverCombo(100n, [componente({ precioSueltoCentavos: -1n }), componente()]),
    ).toThrow();
  });
});
