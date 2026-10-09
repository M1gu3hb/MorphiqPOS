import type { EstadoCaja } from '@morphiqpos/app/caja';
import { describe, expect, it } from 'vitest';

import {
  estadoDeLaPantalla,
  horaDeApertura,
  type EstadoCajaDelServidor,
} from './estado-de-caja.ts';

/**
 * La pantalla de Caja del mostrador lee lo que `caja.estado` DEVUELVE (día completo de
 * la tienda, 2.4): «Lo que debería haber» salía «$NaN.NaN» porque leía tres campos que
 * el comando no tiene.
 */

describe('el estado de la caja, como lo pinta la pantalla', () => {
  it('lo que debería haber es el esperado del comando, y los montones su desglose', () => {
    // TIPADO con el del comando: si `caja.estado` cambia de forma, esto deja de compilar.
    const delComando: EstadoCaja = {
      abierta: true,
      puedeAdministrar: true,
      sesionCajaId: 's1',
      abiertaEn: '2026-10-09T13:05:00.000Z',
      fondoInicialCentavos: '80000',
      ventasCentavos: '12000',
      numeroVentas: 1,
      movimientos: [],
      efectivoEsperadoCentavos: '92000',
      diferenciaCentavos: '-92000',
      fondoDesglosado: {
        monedasCentavos: '30000',
        chicosCentavos: '40000',
        grandesCentavos: '10000',
      },
    };
    const leido: EstadoCajaDelServidor = delComando;
    expect(estadoDeLaPantalla(leido)).toEqual({
      sesionCajaId: 's1',
      fondoEsperadoCentavos: '92000',
      fondoMonedasCentavos: '30000',
      fondoChicosCentavos: '40000',
      abiertaEn: '2026-10-09T13:05:00.000Z',
      puedeAdministrar: true,
    });
  });

  it('cerrada no tiene sesión, y sin desglose no inventa montones', () => {
    expect(
      estadoDeLaPantalla({
        abierta: false,
        sesionCajaId: null,
        abiertaEn: null,
        fondoInicialCentavos: '0',
        fondoDesglosado: null,
      }),
    ).toMatchObject({
      sesionCajaId: null,
      fondoMonedasCentavos: null,
      fondoChicosCentavos: null,
      puedeAdministrar: false,
    });
  });

  it('la hora de apertura no es la de UTC', () => {
    expect(horaDeApertura(null)).toBe('');
    // 13:05 UTC son las 07:05 en el centro de México (UTC−6, sin horario de verano).
    expect(horaDeApertura('2026-10-09T13:05:00.000Z', 'America/Mexico_City')).toBe('07:05');
  });
});
