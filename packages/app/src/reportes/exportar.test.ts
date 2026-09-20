import { describe, expect, it } from 'vitest';

import { aCsv, campoDelRango, celdaCsv } from './exportar.ts';

/**
 * F-322 · El exporte de los registros.
 *
 * ── Qué defienden estas pruebas ──────────────────────────────────────────
 * Que una coma dentro de un nombre NO parta la fila. «Refresco 600 ml, lata» sin
 * comillas convierte una fila de ocho columnas en una de nueve, y Excel abre el
 * archivo torcido sin avisar: el contador recibe números que no cuadran y nadie
 * sabe por qué.
 *
 * Que una celda que empieza con `=` salga NEUTRALIZADA. Excel la interpreta como
 * fórmula, y un CSV descargado que ejecuta algo en la máquina del contador es un
 * agujero de verdad, no una molestia de formato.
 *
 * Que el campo del rango salga del MAPA del puente y no de una lista tecleada
 * aquí: una lista propia diría «fecha» el día que la entidad cambie de columna.
 */

describe('el CSV de los registros', () => {
  it('UNA COMA NO PARTE LA FILA', () => {
    expect(celdaCsv('Refresco 600 ml, lata')).toBe('"Refresco 600 ml, lata"');
  });

  it('LAS COMILLAS SE DOBLAN, como manda el RFC', () => {
    expect(celdaCsv('Tubo de 1/2"')).toBe('"Tubo de 1/2"""');
  });

  it('UN SALTO DE LÍNEA se queda dentro de la celda', () => {
    expect(celdaCsv('nota\ncon dos renglones')).toBe('"nota\ncon dos renglones"');
  });

  it('UNA CELDA QUE EMPIEZA CON `=` NO ES UNA FÓRMULA', () => {
    // El apóstrofo delante es lo que hace que Excel la trate como texto.
    expect(celdaCsv('=1+1')).toBe("'=1+1");
    expect(celdaCsv('+52 55 1234 5678')).toBe("'+52 55 1234 5678");
    expect(celdaCsv('-3')).toBe("'-3");
    expect(celdaCsv('@arroba')).toBe("'@arroba");
  });

  it('UNA FÓRMULA CON COMA lleva las dos defensas', () => {
    // El apóstrofo Y las comillas: con una sola, o se ejecuta o parte la fila.
    expect(celdaCsv('=SUMA(A1,B1)')).toBe('"\'=SUMA(A1,B1)"');
  });

  it('EL VACÍO ES VACÍO, y no la palabra «null»', () => {
    expect(celdaCsv(null)).toBe('');
    expect(celdaCsv(undefined)).toBe('');
  });

  it('UN NÚMERO GRANDE NO PIERDE DÍGITOS', () => {
    // Los importes del puente llegan como `bigint`: pasarlos por `Number` los
    // redondearía justo en la venta grande.
    expect(celdaCsv(9_007_199_254_740_993n)).toBe('9007199254740993');
  });

  it('UN JSON SE SERIALIZA, no sale «[object Object]»', () => {
    expect(celdaCsv({ tamano: 'grande' })).toBe('"{""tamano"":""grande""}"');
  });

  it('LA CABECERA SON TODAS LAS COLUMNAS, aunque una fila no traiga una', () => {
    // El puente recorta campos por rol fila a fila; si la cabecera saliera de la
    // primera, las columnas de las demás se desplazarían una posición.
    const csv = aCsv([
      { folio: '1', total: '100' },
      { folio: '2', total: '200', propina: '20' },
    ]);
    expect(csv.split('\n')[0]).toBe('folio,total,propina');
    expect(csv.split('\n')[1]).toBe('1,100,');
    expect(csv.split('\n')[2]).toBe('2,200,20');
  });

  it('SIN FILAS sale sólo la cabecera vacía, no un error', () => {
    expect(aCsv([])).toBe('');
  });
});

describe('el campo por el que se acota el tiempo', () => {
  it('LAS SEIS ENTIDADES DE LA PANTALLA tienen su fecha', () => {
    // Si alguna dejara de tenerla, el exporte saldría con TODO el histórico en vez
    // del mes que se pidió, y nadie lo notaría hasta abrir el archivo.
    for (const entidad of [
      'CorteCaja',
      'Venta',
      'LiquidacionPropina',
      'CompraInsumo',
      'MovimientoCuenta',
      'GastoOperativo',
    ]) {
      expect(campoDelRango(entidad), entidad).not.toBeNull();
    }
  });

  it('UNA ENTIDAD QUE NO EXISTE no tiene campo, y no revienta', () => {
    expect(campoDelRango('NoExiste')).toBeNull();
  });

  it('UN DÍA SIN HORA TAMBIÉN ACOTA: `compras.fecha` es una columna `date`', () => {
    // Aceptar sólo la conversión `fecha` dejaba el exporte de compras con TODO el
    // histórico en vez del mes pedido, y sin que nada fallara.
    expect(campoDelRango('CompraInsumo')).toBe('fecha');
  });

  it('UNA ENTIDAD ORDENADA POR ALGO QUE NO ES FECHA se exporta sin rango', () => {
    // `Zona` se ordena por `orden`, que es un entero: filtrar «del 1 al 31» sobre
    // esa columna devolvería las zonas 1 a 31, no las de ese mes.
    expect(campoDelRango('Zona')).toBeNull();
  });
});
