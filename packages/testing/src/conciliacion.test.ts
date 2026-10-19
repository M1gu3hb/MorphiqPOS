import { describe, expect, it } from 'vitest';

import {
  comisionDeLaRegla,
  conciliarElDia,
  efectivoEsperadoDelLibro,
  type LibroDelDia,
  type ServidorDelDia,
} from './conciliacion.ts';

/**
 * Un día pequeño que CUADRA: la caja de Rosa abre con $500, cobra una venta en efectivo
 * de $120 con $20 de propina en efectivo, una mixta de $300 —$100 en efectivo y $200
 * con tarjeta— con $30 de propina con tarjeta, retira $50 y cuenta $1 de más. La caja
 * de Diana abre con $300, cobra $80 en efectivo y cuenta $1 de menos. La conciliación
 * tiene que decir que no hay nada.
 */
function libroQueCuadra(): LibroDelDia {
  return {
    cajas: [
      {
        referencia: 'la caja de Rosa',
        sesionCajaId: 's1',
        fondoCentavos: 50_000n,
        movimientos: [{ concepto: 'retiro', efectivoCentavos: -5_000n }],
        contadoCentavos: 69_100n,
      },
      {
        referencia: 'la caja de Diana',
        sesionCajaId: 's2',
        fondoCentavos: 30_000n,
        movimientos: [],
        contadoCentavos: 37_900n,
      },
    ],
    cobros: [
      {
        referencia: 'la mesa 1',
        ventaId: 'v1',
        sesionCajaId: 's1',
        ventaCentavos: 12_000n,
        pagos: { efectivo: 14_000n },
        propinaPorMetodo: { efectivo: 2_000n },
      },
      {
        referencia: 'la mesa 2',
        ventaId: 'v2',
        sesionCajaId: 's1',
        ventaCentavos: 30_000n,
        pagos: { efectivo: 10_000n, tarjeta: 23_000n },
        propinaPorMetodo: { tarjeta: 3_000n },
      },
      {
        referencia: 'el capuchino',
        ventaId: 'v3',
        sesionCajaId: 's2',
        ventaCentavos: 8_000n,
        pagos: { efectivo: 8_000n },
        propinaPorMetodo: {},
      },
    ],
    pasivos: [{ concepto: 'recarga Telcel', centavos: 5_000n }],
    comisiones: [{ profesional: 'Karla', baseCentavos: 35_000n, puntosBase: 4_000 }],
    inventario: [{ producto: 'Refresco 600 ml', antes: 24, despues: 22 }],
  };
}

function servidorQueCuadra(): ServidorDelDia {
  return {
    ventas: [
      {
        id: 'v1',
        folio: 'V-1',
        totalCentavos: 12_000n,
        pagos: { efectivo: 14_000n },
        propinaPorMetodo: { efectivo: 2_000n },
        costoCentavos: 4_000n,
        utilidadCentavos: 8_000n,
      },
      {
        id: 'v2',
        folio: 'V-2',
        totalCentavos: 30_000n,
        pagos: { efectivo: 10_000n, tarjeta: 23_000n },
        propinaPorMetodo: { tarjeta: 3_000n },
        costoCentavos: 10_000n,
        utilidadCentavos: 20_000n,
      },
      {
        id: 'v3',
        folio: 'V-3',
        totalCentavos: 8_000n,
        pagos: { efectivo: 8_000n },
        propinaPorMetodo: {},
        costoCentavos: 2_000n,
        utilidadCentavos: 6_000n,
      },
    ],
    cajas: [
      {
        sesionCajaId: 's1',
        folio: 'C-1',
        fondoCentavos: 50_000n,
        esperadoCentavos: 69_000n,
        contadoCentavos: 69_100n,
        movimientos: [
          { tipo: 'apertura', montoCentavos: 50_000n },
          { tipo: 'venta', montoCentavos: 12_000n },
          { tipo: 'propina', montoCentavos: 2_000n },
          { tipo: 'venta', montoCentavos: 10_000n },
          { tipo: 'retiro', montoCentavos: -5_000n },
        ],
      },
      {
        sesionCajaId: 's2',
        folio: 'C-2',
        fondoCentavos: 30_000n,
        esperadoCentavos: 38_000n,
        contadoCentavos: 37_900n,
        movimientos: [
          { tipo: 'apertura', montoCentavos: 30_000n },
          { tipo: 'venta', montoCentavos: 8_000n },
        ],
      },
    ],
    pasivos: [{ concepto: 'recarga Telcel', centavos: 5_000n }],
    comisiones: [{ profesional: 'Karla', centavos: 14_000n }],
    movimientosDeInventario: [
      { producto: 'Refresco 600 ml', cantidad: -2, origen: 'salida_venta' },
    ],
  };
}

const reglas = (libro: LibroDelDia, servidor: ServidorDelDia): string[] =>
  conciliarElDia(libro, servidor).hallazgos.map((h) => h.regla);

const conVenta = (
  servidor: ServidorDelDia,
  i: number,
  cambio: Partial<ServidorDelDia['ventas'][number]>,
): ServidorDelDia => ({
  ...servidor,
  ventas: servidor.ventas.map((v, j) => (j === i ? { ...v, ...cambio } : v)),
});

const conCaja = (
  servidor: ServidorDelDia,
  i: number,
  cambio: Partial<ServidorDelDia['cajas'][number]>,
): ServidorDelDia => ({
  ...servidor,
  cajas: servidor.cajas.map((c, j) => (j === i ? { ...c, ...cambio } : c)),
});

describe('conciliarElDia · el dinero cuadra al centavo', () => {
  it('un día que cuadra no tiene hallazgos, y su resumen dice lo cobrado', () => {
    const resultado = conciliarElDia(libroQueCuadra(), servidorQueCuadra());
    expect(resultado.hallazgos).toEqual([]);
    expect(resultado.resumen).toEqual({
      ventasCentavos: 50_000n,
      propinasCentavos: 5_000n,
      cobradoCentavos: 55_000n,
      esperadoCentavos: 107_000n,
      diferenciaCentavos: 0n,
    });
    const [rosa, diana] = libroQueCuadra().cajas;
    expect(efectivoEsperadoDelLibro(libroQueCuadra(), rosa!)).toBe(69_000n);
    expect(efectivoEsperadoDelLibro(libroQueCuadra(), diana!)).toBe(38_000n);
  });

  it('UN CENTAVO DE MÁS en un cobro y la conciliación falla', () => {
    const conUnCentavo = conVenta(servidorQueCuadra(), 0, {
      totalCentavos: 12_001n,
      pagos: { efectivo: 14_001n },
    });
    expect(reglas(libroQueCuadra(), conUnCentavo)).toContain('propina-fuera');
    expect(reglas(libroQueCuadra(), conUnCentavo)).toContain('pagos-por-metodo');

    // Y sin costos a la vista —la cajera no los ve—, el centavo lo caza el total solo:
    // la comprobación de utilidad no puede ser la única que lo vea.
    const sinCostos: ServidorDelDia = {
      ...conUnCentavo,
      ventas: conUnCentavo.ventas.map((v) => ({
        ...v,
        costoCentavos: null,
        utilidadCentavos: null,
      })),
    };
    expect(reglas(libroQueCuadra(), sinCostos)).toEqual(['propina-fuera', 'pagos-por-metodo']);
  });

  it('un centavo de más SÓLO en el pago también se ve', () => {
    const conUnCentavo = conVenta(servidorQueCuadra(), 0, { pagos: { efectivo: 14_001n } });
    expect(reglas(libroQueCuadra(), conUnCentavo)).toEqual([
      'pagos-por-metodo',
      'pagos-por-metodo',
    ]);
  });

  it('la propina prorrateada entre métodos no pasa aunque sume lo mismo', () => {
    const prorrateada = conVenta(servidorQueCuadra(), 1, {
      propinaPorMetodo: { efectivo: 1_000n, tarjeta: 2_000n },
    });
    expect(reglas(libroQueCuadra(), prorrateada)).toEqual(['propina-exacta']);
  });

  it('la propina metida en la venta o en la utilidad se ve', () => {
    const enLaVenta = conVenta(servidorQueCuadra(), 0, {
      totalCentavos: 14_000n,
      propinaPorMetodo: {},
    });
    expect(reglas(libroQueCuadra(), enLaVenta)).toContain('propina-fuera');

    const enLaUtilidad = conVenta(servidorQueCuadra(), 0, { utilidadCentavos: 10_000n });
    expect(reglas(libroQueCuadra(), enLaUtilidad)).toEqual(['propina-fuera']);
  });

  it('una venta que la prueba no hizo es dinero que salió de ninguna parte', () => {
    const servidor = servidorQueCuadra();
    const conOtra: ServidorDelDia = {
      ...servidor,
      ventas: [
        ...servidor.ventas,
        {
          id: 'v9',
          folio: 'V-9',
          totalCentavos: 100n,
          pagos: { efectivo: 100n },
          propinaPorMetodo: {},
          costoCentavos: null,
          utilidadCentavos: null,
        },
      ],
    };
    expect(reglas(libroQueCuadra(), conOtra)).toEqual(['venta-sin-anotar']);
  });

  it('el esperado del corte tiene que ser el fondo más los movimientos, por las dos cuentas', () => {
    const esperadoMal = conCaja(servidorQueCuadra(), 0, { esperadoCentavos: 69_001n });
    expect(reglas(libroQueCuadra(), esperadoMal)).toEqual([
      'efectivo-esperado',
      'efectivo-esperado',
    ]);

    const servidor = servidorQueCuadra();
    const movimientoPerdido = conCaja(servidor, 0, {
      movimientos: servidor.cajas[0]!.movimientos.filter((m) => m.tipo !== 'retiro'),
    });
    expect(reglas(libroQueCuadra(), movimientoPerdido)).toEqual(['efectivo-esperado']);
  });

  it('el efectivo de un cobro entra a SU caja y a ninguna otra', () => {
    const libro = libroQueCuadra();
    const enLaOtra: LibroDelDia = {
      ...libro,
      cobros: libro.cobros.map((c) => (c.ventaId === 'v3' ? { ...c, sesionCajaId: 's1' } : c)),
    };
    expect(reglas(enLaOtra, servidorQueCuadra())).toEqual([
      'efectivo-esperado',
      'efectivo-esperado',
    ]);
  });

  it('una caja abierta que la prueba no abrió también es un hallazgo', () => {
    const servidor = servidorQueCuadra();
    const conOtra: ServidorDelDia = {
      ...servidor,
      cajas: [
        ...servidor.cajas,
        {
          sesionCajaId: 's9',
          folio: 'C-9',
          fondoCentavos: 0n,
          esperadoCentavos: 0n,
          contadoCentavos: null,
          movimientos: [],
        },
      ],
    };
    expect(reglas(libroQueCuadra(), conOtra)).toEqual(['caja-sin-anotar']);
  });

  it('el arqueo guarda lo que se contó: el sobrante y el faltante se ven', () => {
    expect(
      reglas(libroQueCuadra(), conCaja(servidorQueCuadra(), 0, { contadoCentavos: 69_000n })),
    ).toEqual(['arqueo']);
    expect(
      reglas(libroQueCuadra(), conCaja(servidorQueCuadra(), 1, { contadoCentavos: 38_000n })),
    ).toEqual(['arqueo']);
  });

  it('un pasivo que falta del ledger, una comisión que no es la regla y una unidad sin dueño', () => {
    const servidor = servidorQueCuadra();
    expect(reglas(libroQueCuadra(), { ...servidor, pasivos: [] })).toEqual(['pasivo']);
    expect(
      reglas(libroQueCuadra(), {
        ...servidor,
        comisiones: [{ profesional: 'Karla', centavos: 14_001n }],
      }),
    ).toEqual(['comision']);
    expect(
      reglas(libroQueCuadra(), {
        ...servidor,
        movimientosDeInventario: [
          { producto: 'Refresco 600 ml', cantidad: -1, origen: 'salida_venta' },
        ],
      }),
    ).toEqual(['inventario']);
    expect(
      reglas(libroQueCuadra(), {
        ...servidor,
        movimientosDeInventario: [{ producto: 'Refresco 600 ml', cantidad: -2, origen: 'magia' }],
      }),
    ).toEqual(['inventario']);
  });

  it('la comisión redondea la mitad hacia arriba, como `aplicarPorcentaje` del dominio', () => {
    expect(comisionDeLaRegla(35_000n, 4_000)).toBe(14_000n);
    expect(comisionDeLaRegla(12_345n, 3_500)).toBe(4_321n);
    expect(comisionDeLaRegla(1n, 5_000)).toBe(1n);
  });
});
