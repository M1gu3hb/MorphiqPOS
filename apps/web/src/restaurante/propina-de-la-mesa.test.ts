import { entradaSolicitarCuenta } from '@morphiqpos/app/restaurante';
import { describe, expect, it } from 'vitest';

import {
  entradaDePedirLaCuenta,
  importeSugerido,
  OPCIONES_DE_PROPINA,
  type OpcionDePropina,
} from './propina-de-la-mesa.ts';

/**
 * Día completo del restaurante (2.4) · LA PROPINA QUE EL MESERO PREGUNTA AL PEDIR LA CUENTA.
 *
 * La pantalla de la mesa pedía la cuenta siempre con `decidir_en_caja`: la mesa que decía
 * «déjale el diez por ciento» llegaba a caja sin su propina. Aquí se prueba que cada opción
 * viaja como el comando la espera y que el importe que se le enseña a la mesa es el que el
 * dominio calcula.
 */

const ORDEN = '33333333-3333-4333-8333-333333333333';

function opcion(clave: string): OpcionDePropina {
  const encontrada = OPCIONES_DE_PROPINA.find((o) => o.clave === clave);
  if (encontrada === undefined) throw new Error(`No hay una opción de propina «${clave}».`);
  return encontrada;
}

describe('lo que viaja a restaurante.solicitar_cuenta', () => {
  it('el ESQUEMA DEL COMANDO acepta cada una de las opciones que ofrece la pantalla', () => {
    for (const o of OPCIONES_DE_PROPINA) {
      const veredicto = entradaSolicitarCuenta.safeParse(entradaDePedirLaCuenta(ORDEN, o));
      expect(veredicto.success, `${o.etiqueta}: ${JSON.stringify(veredicto.error?.issues)}`).toBe(
        true,
      );
    }
  });

  it('el 10 % viaja como PUNTOS BASE enteros, nunca como 0.1 ni como un importe', () => {
    expect(entradaDePedirLaCuenta(ORDEN, opcion('diez'))).toEqual({
      ordenId: ORDEN,
      propinaTipo: 'porcentaje',
      propinaPuntosBase: 1000,
    });
    expect(entradaDePedirLaCuenta(ORDEN, opcion('doce-y-medio')).propinaPuntosBase).toBe(1250);
    expect(entradaDePedirLaCuenta(ORDEN, opcion('quince')).propinaPuntosBase).toBe(1500);
  });

  it('«Sin propina» y «la decide la caja» no llevan porcentaje', () => {
    expect(entradaDePedirLaCuenta(ORDEN, opcion('sin'))).toEqual({
      ordenId: ORDEN,
      propinaTipo: 'sin_propina',
    });
    expect(entradaDePedirLaCuenta(ORDEN, opcion('caja'))).toEqual({
      ordenId: ORDEN,
      propinaTipo: 'decidir_en_caja',
    });
  });

  it('«Sin propina» pesa lo mismo que los porcentajes: es una opción más, no un enlace', () => {
    expect(OPCIONES_DE_PROPINA.map((o) => o.etiqueta)).toEqual([
      '10 %',
      '12.5 %',
      '15 %',
      'Sin propina',
      'La decide la caja',
    ]);
  });
});

describe('el importe que se le enseña a la mesa', () => {
  it('es el porcentaje del consumo, redondeado como el cobro: 10 % de $883.00 son $88.30', () => {
    expect(importeSugerido(88_300, opcion('diez'))).toBe(8_830);
    expect(importeSugerido(88_300, opcion('quince'))).toBe(13_245);
  });

  it('redondea al centavo sin pasar por flotantes: 12.5 % de $0.99 son $0.12', () => {
    expect(importeSugerido(99, opcion('doce-y-medio'))).toBe(12);
  });

  it('«Sin propina» es cero; la que decide la caja no tiene importe que decir', () => {
    expect(importeSugerido(88_300, opcion('sin'))).toBe(0);
    expect(importeSugerido(88_300, opcion('caja'))).toBeNull();
  });

  it('sin un total conocido no inventa un importe', () => {
    expect(importeSugerido(null, opcion('diez'))).toBeNull();
    expect(importeSugerido(Number.NaN, opcion('diez'))).toBeNull();
    expect(importeSugerido(-1, opcion('diez'))).toBeNull();
  });
});
