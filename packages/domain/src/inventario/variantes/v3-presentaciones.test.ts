import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { cantidad, cantidadATexto } from '../../catalogo/index.ts';
import { calcularConsumo } from '../consumo.ts';
import { consumoDePresentacion } from './v3-presentaciones.ts';

/**
 * V3 · Presentaciones.
 *
 * La plantilla `esencial` no tiene inventario: se vende y el stock no baja, así
 * que el dueño no puede saber qué le falta ni qué le robaron. Lo que estas
 * pruebas vigilan es la única regla que hace que el inventario se pueda sumar:
 * **la existencia se lleva en UNIDAD BASE**, venda lo que venda el mostrador.
 */

const REFRESCO = 'refresco';

function codigo(fn: () => unknown): string {
  try {
    fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('V3 · de la presentación a la unidad base', () => {
  it('la base descuenta uno a uno', () => {
    const [consumo] = consumoDePresentacion(
      { insumoId: REFRESCO, factor: '1', unidadBase: 'pieza' },
      cantidad('3'),
    );
    expect(cantidadATexto(consumo?.cantidad ?? cantidad('0'))).toBe('3');
  });

  it('VENDER UN SIX DESCUENTA SEIS PIEZAS, no un six', () => {
    const [consumo] = consumoDePresentacion(
      { insumoId: REFRESCO, factor: '6', unidadBase: 'pieza' },
      cantidad('3'),
    );
    expect(cantidadATexto(consumo?.cantidad ?? cantidad('0'))).toBe('18');
  });

  it('EL CIGARRO SUELTO: factor 0.05 de una cajetilla de veinte', () => {
    // Es el caso que obliga a que el factor sea decimal. Con entero habría que
    // llevar el inventario de cigarros en cigarros, que es contraintuitivo.
    const [consumo] = consumoDePresentacion(
      { insumoId: 'cigarro', factor: '0.05', unidadBase: 'pieza' },
      cantidad('20'),
    );
    expect(cantidadATexto(consumo?.cantidad ?? cantidad('0'))).toBe('1');
  });

  it('NO ARRASTRA COMA FLOTANTE: 0.05 × 3 no es 0.15000000000000002', () => {
    const [consumo] = consumoDePresentacion(
      { insumoId: 'cigarro', factor: '0.05', unidadBase: 'pieza' },
      cantidad('3'),
    );
    expect(cantidadATexto(consumo?.cantidad ?? cantidad('0'))).toBe('0.15');
  });

  it('el huevo por kilo, con factor fraccionario largo', () => {
    const [consumo] = consumoDePresentacion(
      { insumoId: 'huevo', factor: '16.6667', unidadBase: 'pieza' },
      cantidad('2'),
    );
    expect(cantidadATexto(consumo?.cantidad ?? cantidad('0'))).toBe('33.3334');
  });

  it('UN FACTOR EN CERO no descuenta nada, y eso FALLA', () => {
    // Sin esta guarda, vender dejaría el almacén intacto y el inventario
    // dejaría de significar algo sin que nada fallara.
    expect(
      codigo(() =>
        consumoDePresentacion(
          { insumoId: REFRESCO, factor: '0', unidadBase: 'pieza' },
          cantidad('3'),
        ),
      ),
    ).toBe('CATALOGO_INVALIDO');
  });

  it('una cantidad que no llega a una unidad base falla en vez de descontar cero', () => {
    expect(
      codigo(() =>
        consumoDePresentacion(
          { insumoId: 'cigarro', factor: '0.0001', unidadBase: 'pieza' },
          cantidad('0.0001'),
        ),
      ),
    ).toBe('CANTIDAD_INVALIDA');
  });
});

describe('V3 · el tronco la usa sin conocerla', () => {
  it('EL TRONCO NO CAMBIÓ: se le pide la estrategia y la usa', () => {
    // La prueba de que la extracción de E2 sirvió: añadir V3 fue un `case` en
    // el despacho y un archivo en `variantes/`. Ni una línea de acumulación,
    // de guarda de unidades ni de armado del movimiento se tocó.
    const movimientos = calcularConsumo([
      {
        organizacionId: 'org',
        almacenId: 'alm',
        ordenId: 'orden',
        lineaId: 'l1',
        cantidad: '2',
        permiteVentaSinStock: false,
        estrategiaConsumo: 'presentacion',
        insumoId: REFRESCO,
        factor: '6',
        unidadBase: 'pieza',
      },
    ]);

    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]?.insumoId).toBe(REFRESCO);
    expect(movimientos[0]?.cantidad).toBe('12');
    expect(movimientos[0]?.unidad).toBe('pieza');
  });

  it('DOS PRESENTACIONES DEL MISMO PRODUCTO SUMAN EN UNA SOLA SALIDA', () => {
    // Una caja y tres piezas del mismo refresco son un solo movimiento de 27
    // piezas. Si salieran dos, el ledger tendría dos renglones para el mismo
    // hecho y el kardex de ese producto se leería al doble de largo.
    const comun = {
      organizacionId: 'org',
      almacenId: 'alm',
      ordenId: 'orden',
      permiteVentaSinStock: false,
      estrategiaConsumo: 'presentacion' as const,
      insumoId: REFRESCO,
      unidadBase: 'pieza',
    };
    const movimientos = calcularConsumo([
      { ...comun, lineaId: 'l1', cantidad: '1', factor: '24' },
      { ...comun, lineaId: 'l2', cantidad: '3', factor: '1' },
    ]);

    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]?.cantidad).toBe('27');
  });
});
