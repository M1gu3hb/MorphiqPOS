import { describe, expect, it } from 'vitest';

import { elegirNegocioDeLaEntrada, slugDeLaRutaDeEntrada } from './entrada.ts';

/**
 * LA ENTRADA ES DE UN NEGOCIO (bloque A de la 2.4).
 *
 * Producción servía a Restaurante MH y a las cinco demos en el mismo despliegue, y la
 * pantalla de acceso —sin sesión— enseñaba a la gente de los seis mezclada. Estas
 * pruebas fijan la regla que lo impide: el negocio lo dice la dirección, y un despliegue
 * de varios negocios, sin dirección, no enseña a nadie.
 */
const MH = { organizacionId: 'aefc918b', nombre: 'Restaurante MH', slug: 'mh-restaurante' };
const TIENDA = { organizacionId: '1c20ddfe', nombre: 'Tienda demo', slug: 'demo-acople-tienda' };
const VARIOS = [MH, TIENDA];

describe('elegirNegocioDeLaEntrada', () => {
  it('un despliegue de varios, sin dirección, no enseña a NADIE', () => {
    expect(elegirNegocioDeLaEntrada(VARIOS, null)).toBeNull();
    expect(elegirNegocioDeLaEntrada(VARIOS, '')).toBeNull();
  });

  it('con la dirección, sólo ese negocio', () => {
    expect(elegirNegocioDeLaEntrada(VARIOS, 'demo-acople-tienda')).toBe(TIENDA);
    expect(elegirNegocioDeLaEntrada(VARIOS, 'MH-Restaurante')).toBe(MH);
  });

  it('un slug que el despliegue no sirve es igual que uno que no existe: nada', () => {
    expect(elegirNegocioDeLaEntrada([TIENDA], 'mh-restaurante')).toBeNull();
    expect(elegirNegocioDeLaEntrada(VARIOS, 'no-existe')).toBeNull();
  });

  it('un despliegue de un solo negocio entra sin dirección, como siempre', () => {
    expect(elegirNegocioDeLaEntrada([MH], null)).toBe(MH);
    expect(elegirNegocioDeLaEntrada([MH], 'demo-acople-tienda')).toBeNull();
  });
});

describe('slugDeLaRutaDeEntrada', () => {
  it('lee el negocio de /n/<slug>/…', () => {
    expect(slugDeLaRutaDeEntrada('/n/demo-acople-tienda/login-pos')).toBe('demo-acople-tienda');
    expect(slugDeLaRutaDeEntrada('/n/mh-restaurante')).toBe('mh-restaurante');
  });

  it('cualquier otra ruta no dice negocio', () => {
    expect(slugDeLaRutaDeEntrada('/login-pos')).toBeNull();
    expect(slugDeLaRutaDeEntrada('/nada/n/x')).toBeNull();
    expect(slugDeLaRutaDeEntrada('/n/../login-pos')).toBeNull();
    expect(slugDeLaRutaDeEntrada(null)).toBeNull();
  });
});
