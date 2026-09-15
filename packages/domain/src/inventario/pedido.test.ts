import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  alertasDeMinimo,
  diasHastaLaVisita,
  sugerirPedido,
  type DatosDeSugerencia,
} from './pedido.ts';

/**
 * F-107 · Alerta de mínimo y sugerencia de pedido por proveedor.
 *
 * Bimbo llega el martes a las siete y se va en diez minutos. Lo que se prueba
 * aquí es que el sistema conteste «pide cuatro rejas» con el repartidor
 * delante, y no «te queda poco refresco», que no es una respuesta.
 */

function datos(extra: Partial<DatosDeSugerencia> = {}): DatosDeSugerencia {
  return {
    existenciaBase: '40.0000',
    stockMinimo: '50.0000',
    // 420 refrescos en catorce días: 30 al día.
    ventaDelPeriodoBase: '420.0000',
    diasDelPeriodo: 14,
    diasDeCobertura: 7,
    // La reja de refrescos trae veinticuatro.
    factorCompra: '24.0000',
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

describe('sugerirPedido', () => {
  it('LA VENTA MANDA, NO EL MÍNIMO', () => {
    // 30 al día por siete días son 210, contra un mínimo de 50. Pedir hasta el
    // mínimo es cómo se agota el martes por la tarde con el pedido recién hecho.
    const sugerencia = sugerirPedido(datos());

    expect(sugerencia.faltanBase).toBe('170.0000');
    // 170 entre 24 son 7.08 rejas: ocho.
    expect(sugerencia.presentacionesSugeridas).toBe(8);
    expect(sugerencia.enBase).toBe('192.0000');
  });

  it('SE PIDE EN REJAS ENTERAS, HACIA ARRIBA', () => {
    // Media reja no se pide, y redondear hacia abajo deja corto justo antes de
    // la siguiente visita.
    const sugerencia = sugerirPedido(
      datos({
        existenciaBase: '0.0000',
        stockMinimo: '0.0000',
        ventaDelPeriodoBase: '25.0000',
        diasDelPeriodo: 14,
        diasDeCobertura: 14,
      }),
    );

    // 25 en catorce días, cubriendo catorce: 25 exactos. Una reja de 24 deja
    // corto por uno, así que van dos.
    expect(sugerencia.presentacionesSugeridas).toBe(2);
  });

  it('EL MÍNIMO ES UN PISO cuando la venta es más baja', () => {
    // Producto que casi no rota pero que no puede faltar: el mínimo gana.
    const sugerencia = sugerirPedido(
      datos({ existenciaBase: '0.0000', stockMinimo: '50.0000', ventaDelPeriodoBase: '14.0000' }),
    );

    // 1 al día por siete son 7, contra un mínimo de 50: manda el 50.
    expect(sugerencia.faltanBase).toBe('50.0000');
  });

  it('LO QUE YA ESTÁ CUBIERTO NO SE PIDE, y no sale en negativo', () => {
    const sugerencia = sugerirPedido(datos({ existenciaBase: '400.0000' }));

    expect(sugerencia.presentacionesSugeridas).toBe(0);
    expect(sugerencia.faltanBase).toBe('0.0000');
    expect(sugerencia.motivo).toBe('ninguno');
  });

  it('EL MOTIVO DISTINGUE URGENCIA DE PREVISIÓN', () => {
    // Por debajo del piso es «hoy»; por cobertura es «cuando venga». La
    // pantalla los lee distinto y por eso se separan aquí.
    expect(sugerirPedido(datos({ existenciaBase: '40.0000' })).motivo).toBe('bajo_minimo');
    expect(sugerirPedido(datos({ existenciaBase: '60.0000' })).motivo).toBe('cobertura');
  });

  it('SIN VENTA Y CON EXISTENCIA SOBRE EL PISO no se pide nada', () => {
    // Producto muerto. Sugerirlo llenaría la lista de lo que nadie compra, que
    // es cómo la lista deja de mirarse.
    const sugerencia = sugerirPedido(
      datos({ existenciaBase: '60.0000', ventaDelPeriodoBase: '0.0000' }),
    );

    expect(sugerencia.presentacionesSugeridas).toBe(0);
  });

  it('SIN VENTA Y BAJO EL PISO sí se pide, hasta el piso', () => {
    const sugerencia = sugerirPedido(
      datos({ existenciaBase: '10.0000', ventaDelPeriodoBase: '0.0000' }),
    );

    expect(sugerencia.faltanBase).toBe('40.0000');
    expect(sugerencia.motivo).toBe('bajo_minimo');
  });

  it('EL GRANEL NO PIERDE DECIMALES', () => {
    // 3.5 kg en catorce días, cubriendo siete: 1.75 kg. Dividir al principio
    // daría cero y el jamón no se pediría nunca.
    const sugerencia = sugerirPedido(
      datos({
        existenciaBase: '0.0000',
        stockMinimo: '0.0000',
        ventaDelPeriodoBase: '3.5000',
        factorCompra: '1.0000',
      }),
    );

    expect(sugerencia.faltanBase).toBe('1.7500');
    // Una pieza de jamón entera: 1.75 kg no se pide en fracción de pieza.
    expect(sugerencia.presentacionesSugeridas).toBe(2);
  });

  it('SE DIVIDE AL FINAL: el ritmo diario no se trunca antes de multiplicar', () => {
    // 10 kg en tres días, cubriendo siete. Dividir primero deja 3.3333 al día y
    // al multiplicar por siete se pierden dos diezmilésimas por artículo y por
    // pedido: poco cada vez, y siempre hacia abajo.
    const sugerencia = sugerirPedido(
      datos({
        existenciaBase: '0.0000',
        stockMinimo: '0.0000',
        ventaDelPeriodoBase: '10.0000',
        diasDelPeriodo: 3,
        diasDeCobertura: 7,
        factorCompra: '1.0000',
      }),
    );

    expect(sugerencia.faltanBase).toBe('23.3333');
  });

  it('un factor de compra en cero no convierte nada', () => {
    expect(codigoDe(() => sugerirPedido(datos({ factorCompra: '0' })))).toBe('CATALOGO_INVALIDO');
  });

  it('un periodo de cero días no predice nada', () => {
    expect(codigoDe(() => sugerirPedido(datos({ diasDelPeriodo: 0 })))).toBe('INVENTARIO_INVALIDO');
  });
});

describe('alertasDeMinimo', () => {
  const articulo = (extra: Record<string, string> = {}) => ({
    insumoId: 'i1',
    existenciaBase: '40.0000',
    stockMinimo: '50.0000',
    stockCritico: '10.0000',
    ...extra,
  });

  it('DOS NIVELES, porque una lista donde todo es urgente no se lee', () => {
    const alertas = alertasDeMinimo([
      articulo({ insumoId: 'bajo', existenciaBase: '40.0000' }),
      articulo({ insumoId: 'critico', existenciaBase: '8.0000' }),
    ]);

    expect(alertas).toEqual([
      { insumoId: 'bajo', nivel: 'bajo' },
      { insumoId: 'critico', nivel: 'critico' },
    ]);
  });

  it('EL CRÍTICO GANA AL BAJO: un artículo sale una vez', () => {
    // Ocho está por debajo de los dos umbrales. Listarlo dos veces haría que la
    // misma caja de leche ocupara dos renglones del pedido.
    expect(alertasDeMinimo([articulo({ existenciaBase: '8.0000' })])).toHaveLength(1);
  });

  it('UN PISO EN CERO ES «NO LO VIGILES»', () => {
    // Sin esto, todo el catálogo que nunca declaró mínimo aparecería en crítico
    // el día que se agote algo legítimo.
    expect(
      alertasDeMinimo([
        articulo({ existenciaBase: '0.0000', stockMinimo: '0', stockCritico: '0' }),
      ]),
    ).toEqual([]);
  });

  it('EN EL UMBRAL YA SE AVISA', () => {
    // Avisar sólo por debajo llega un día tarde: con exactamente el mínimo, la
    // siguiente venta ya deja corto.
    expect(alertasDeMinimo([articulo({ existenciaBase: '50.0000' })])[0]?.nivel).toBe('bajo');
  });

  it('lo que está por encima del piso no alerta', () => {
    expect(alertasDeMinimo([articulo({ existenciaBase: '80.0000' })])).toEqual([]);
  });
});

describe('diasHastaLaVisita', () => {
  // 2026-09-15 es martes.
  const MARTES = new Date('2026-09-15T12:00:00.000Z');

  it('HOY CUENTA COMO CERO: el repartidor está en la puerta', () => {
    // Devolver siete diría «no vuelve en una semana» justo cuando llegó, y el
    // pedido que se hace es el de hoy.
    expect(diasHastaLaVisita([2, 5], MARTES)).toBe(0);
  });

  it('LA MÁS PRÓXIMA DE VARIAS', () => {
    // Bimbo viene martes y viernes. El miércoles faltan dos, no cinco.
    const miercoles = new Date('2026-09-16T12:00:00.000Z');
    expect(diasHastaLaVisita([2, 5], miercoles)).toBe(2);
  });

  it('DA LA VUELTA A LA SEMANA', () => {
    // El sábado, con visita sólo los martes, faltan tres: no menos tres.
    const sabado = new Date('2026-09-19T12:00:00.000Z');
    expect(diasHastaLaVisita([2], sabado)).toBe(3);
  });

  it('el domingo es el 7, no el 0', () => {
    const domingo = new Date('2026-09-20T12:00:00.000Z');
    expect(diasHastaLaVisita([7], domingo)).toBe(0);
    expect(diasHastaLaVisita([1], domingo)).toBe(1);
  });

  it('SIN RUTA DECLARADA no se inventa una', () => {
    // Un proveedor al que se le llama por teléfono no tiene día de visita.
    // Devolver cero haría que su lista apareciera cada mañana.
    expect(diasHastaLaVisita([], MARTES)).toBeNull();
    expect(diasHastaLaVisita([0, 9], MARTES)).toBeNull();
  });
});
