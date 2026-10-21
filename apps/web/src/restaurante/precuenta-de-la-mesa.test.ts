import { describe, expect, it } from 'vitest';

import { OPCIONES_DE_PROPINA, type OpcionDePropina } from './propina-de-la-mesa.ts';
import {
  guardarPrecuenta,
  leerPrecuentaGuardada,
  precuentaDeLaRespuesta,
  type AlmacenMinimo,
  type PrecuentaDeLaMesa,
} from './precuenta-de-la-mesa.ts';
import { hojaDeLaRespuesta, totalesDeLaHoja } from './hoja-de-la-precuenta.ts';

/**
 * Día completo del restaurante (2.4) · LA PRECUENTA QUE EL MESERO LLEVA A LA MESA.
 *
 * Salía sin total —«Subtotal —, IVA —, TOTAL —», sin folio y con «Imprimir» apagado— porque el
 * total de una venta es de rol caja y la hoja lo leía de ahí. El servidor SÍ había dicho los
 * números al pedir la cuenta. Aquí se prueba que se aprovechan, de dónde sale cada cifra y
 * que nunca se inventa un total.
 */

const ORDEN = '33333333-3333-4333-8333-333333333333';

function opcion(clave: string): OpcionDePropina {
  const encontrada = OPCIONES_DE_PROPINA.find((o) => o.clave === clave);
  if (encontrada === undefined) throw new Error(`No hay una opción de propina «${clave}».`);
  return encontrada;
}

/** Lo que `restaurante.solicitar_cuenta` contesta: los importes como texto de BigInt. */
const RESPUESTA = {
  ordenId: ORDEN,
  codigoCaja: 'M01-4821',
  mesaNumero: 1,
  lineas: [],
  subtotalCentavos: '76121',
  descuentoCentavos: '0',
  impuestosCentavos: '12179',
  totalCentavos: '88300',
  propinaSugeridaCentavos: '8830',
  estadoMesa: 'cuenta_solicitada',
};

function almacenEnMemoria(): AlmacenMinimo & { readonly datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => {
      datos.set(clave, valor);
    },
  };
}

function conLaPropinaDel10(): PrecuentaDeLaMesa {
  const precuenta = precuentaDeLaRespuesta(RESPUESTA, opcion('diez'));
  if (precuenta === null) throw new Error('La respuesta de la prueba tiene que servir.');
  return precuenta;
}

describe('la precuenta que contestó el servidor', () => {
  it('pasa a centavos enteros lo que el servidor dijo como texto, y deja la propina elegida', () => {
    expect(precuentaDeLaRespuesta(RESPUESTA, opcion('diez'))).toEqual({
      ordenId: ORDEN,
      codigoCaja: 'M01-4821',
      mesaNumero: 1,
      subtotalCentavos: 76_121,
      descuentoCentavos: 0,
      impuestosCentavos: 12_179,
      totalCentavos: 88_300,
      propina: { tipo: 'porcentaje', puntosBase: 1000, importeCentavos: 8_830 },
    });
  });

  it('«Sin propina» y «la decide la caja» se dicen como lo que son', () => {
    expect(precuentaDeLaRespuesta(RESPUESTA, opcion('sin'))?.propina).toEqual({
      tipo: 'sin_propina',
    });
    expect(precuentaDeLaRespuesta(RESPUESTA, opcion('caja'))?.propina).toEqual({
      tipo: 'a_definir',
    });
  });

  it('si le falta algo que la hoja necesita NO inventa un total: devuelve nada', () => {
    expect(precuentaDeLaRespuesta(null, opcion('diez'))).toBeNull();
    expect(precuentaDeLaRespuesta('88300', opcion('diez'))).toBeNull();
    expect(
      precuentaDeLaRespuesta({ ...RESPUESTA, totalCentavos: undefined }, opcion('diez')),
    ).toBeNull();
    expect(
      precuentaDeLaRespuesta({ ...RESPUESTA, totalCentavos: 88_300 }, opcion('diez')),
    ).toBeNull();
    expect(
      precuentaDeLaRespuesta({ ...RESPUESTA, totalCentavos: '883.00' }, opcion('diez')),
    ).toBeNull();
    expect(precuentaDeLaRespuesta({ ...RESPUESTA, codigoCaja: '' }, opcion('diez'))).toBeNull();
  });
});

describe('guardar la precuenta para la pantalla que sigue', () => {
  it('se guarda por cuenta y se lee igual', () => {
    const almacen = almacenEnMemoria();
    const precuenta = conLaPropinaDel10();
    expect(guardarPrecuenta(precuenta, almacen)).toBe(true);
    expect(leerPrecuentaGuardada(ORDEN, almacen)).toEqual(precuenta);
  });

  it('la de OTRA cuenta no se usa', () => {
    const almacen = almacenEnMemoria();
    guardarPrecuenta(conLaPropinaDel10(), almacen);
    expect(leerPrecuentaGuardada('44444444-4444-4444-8444-444444444444', almacen)).toBeNull();
  });

  it('un valor que no es nuestro o está torcido se ignora', () => {
    const almacen = almacenEnMemoria();
    almacen.setItem(`morphiqpos:precuenta:${ORDEN}`, 'no es json');
    expect(leerPrecuentaGuardada(ORDEN, almacen)).toBeNull();
    almacen.setItem(
      `morphiqpos:precuenta:${ORDEN}`,
      JSON.stringify({ ...conLaPropinaDel10(), totalCentavos: '88300' }),
    );
    expect(leerPrecuentaGuardada(ORDEN, almacen)).toBeNull();
    almacen.setItem(
      `morphiqpos:precuenta:${ORDEN}`,
      JSON.stringify({ ...conLaPropinaDel10(), ordenId: 'otra' }),
    );
    expect(leerPrecuentaGuardada(ORDEN, almacen)).toBeNull();
  });

  it('sin almacén, o con un almacén que lanza, la hoja no se cae: no hay nada guardado', () => {
    expect(guardarPrecuenta(conLaPropinaDel10(), null)).toBe(false);
    expect(leerPrecuentaGuardada(ORDEN, null)).toBeNull();
    const roto: AlmacenMinimo = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('cuota');
      },
    };
    expect(guardarPrecuenta(conLaPropinaDel10(), roto)).toBe(false);
    expect(leerPrecuentaGuardada(ORDEN, roto)).toBeNull();
  });
});

describe('lo que la hoja impresa por el servidor dice', () => {
  it('se valida igual que la precuenta', () => {
    expect(
      hojaDeLaRespuesta({
        codigo: 'M01-4821',
        subtotalCentavos: '76121',
        impuestosCentavos: '12179',
        totalCentavos: '88300',
        copia: 1,
      }),
    ).toEqual({
      codigo: 'M01-4821',
      subtotalCentavos: 76_121,
      impuestosCentavos: 12_179,
      totalCentavos: 88_300,
      copia: 1,
    });
    expect(hojaDeLaRespuesta({ codigo: 'M01', totalCentavos: '1', copia: 1 })).toBeNull();
    expect(hojaDeLaRespuesta(undefined)).toBeNull();
  });
});

describe('de dónde sale cada número de la hoja', () => {
  const sinDinero = { subtotal: null, impuestos: null, total: null } as const;

  it('el MESERO, que no lee el dinero de la venta, ve lo que el servidor le contestó', () => {
    const hoja = totalesDeLaHoja(sinDinero, conLaPropinaDel10(), null);
    expect(hoja.origen).toBe('guardada');
    expect(hoja.total).toBe(88_300);
    expect(hoja.impuestos).toBe(12_179);
    expect(hoja.codigo).toBe('M01-4821');
    expect(hoja.propina).toEqual({ tipo: 'porcentaje', puntosBase: 1000, importeCentavos: 8_830 });
    expect(hoja.aPagar).toBe(97_130);
  });

  it('con la propina que decide la caja, A PAGAR es el consumo y la hoja lo dice', () => {
    const guardada = precuentaDeLaRespuesta(RESPUESTA, opcion('caja'));
    const hoja = totalesDeLaHoja(sinDinero, guardada, null);
    expect(hoja.propina).toEqual({ tipo: 'a_definir' });
    expect(hoja.aPagar).toBe(88_300);
  });

  it('quien SÍ lee el dinero de la venta usa el del puente', () => {
    const hoja = totalesDeLaHoja(
      { subtotal: 76_121, impuestos: 12_179, total: 88_300 },
      null,
      null,
    );
    expect(hoja.origen).toBe('puente');
    expect(hoja.aPagar).toBe(88_300);
  });

  it('lo que el servidor IMPRIMIÓ manda sobre lo guardado: la mesa pidió otro platillo', () => {
    const hoja = totalesDeLaHoja(sinDinero, conLaPropinaDel10(), {
      codigo: 'M01-4821',
      subtotalCentavos: 85_345,
      impuestosCentavos: 13_655,
      totalCentavos: 99_000,
      copia: 2,
    });
    expect(hoja.origen).toBe('impresa');
    expect(hoja.total).toBe(99_000);
    // El 10 % es el de LO QUE LA HOJA DICE AHORA, no el importe de hace diez minutos.
    expect(hoja.propina).toEqual({ tipo: 'porcentaje', puntosBase: 1000, importeCentavos: 9_900 });
    expect(hoja.aPagar).toBe(99_000 + 9_900);
  });

  it('sin ninguna fuente NO hay total: no se inventa uno', () => {
    const hoja = totalesDeLaHoja(sinDinero, null, null);
    expect(hoja.origen).toBe('ninguno');
    expect(hoja.total).toBeNull();
    expect(hoja.aPagar).toBeNull();
    expect(hoja.codigo).toBeNull();
  });
});
