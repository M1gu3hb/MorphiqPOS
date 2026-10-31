import { describe, expect, it } from 'vitest';

import {
  DISENO_POR_OMISION,
  conDisenoPropio,
  disenoDeLaMesa,
  faltaDelDiseno,
  qrDeMesasLeido,
  sinDisenoPropio,
  tieneDisenoPropio,
  type DisenoDeQr,
} from './diseno';

const MESA = '6f1b3a1e-2f7c-4c1a-9d1e-1a2b3c4d5e6f';
const OTRA = '7a2c4b2f-3a8d-4d2b-8e2f-2b3c4d5e6f70';

const marron: DisenoDeQr = {
  ...DISENO_POR_OMISION,
  modulo: 'dots',
  ojo: 'circle',
  centro: 'circle',
  primerPlano: '#5b2a0e',
  ojos: '#3a1a08',
  marco: {
    tipo: 'band',
    texto: 'Mesa {mesa}',
    textoSecundario: 'Escanea y pide',
    color: '#5b2a0e',
    colorTexto: '#ffffff',
  },
};

describe('el diseño de los QR en la pantalla del dueño', () => {
  it('lo guardado se lee sin confiar: lo que no tiene forma es el QR de siempre', () => {
    expect(qrDeMesasLeido(undefined)).toEqual({ general: DISENO_POR_OMISION, porMesa: {} });
    expect(qrDeMesasLeido({ general: { modulo: 'estrella' }, porMesa: {} }).general).toEqual(
      DISENO_POR_OMISION,
    );
    const leido = qrDeMesasLeido({
      general: marron,
      porMesa: { [MESA]: DISENO_POR_OMISION, [OTRA]: { modulo: 'roto' } },
    });
    expect(leido.general).toEqual(marron);
    expect(Object.keys(leido.porMesa)).toEqual([MESA]);
  });

  it('cada mesa imprime el suyo, o el general', () => {
    const qr = { general: marron, porMesa: { [MESA]: DISENO_POR_OMISION } };
    expect(disenoDeLaMesa(qr, MESA)).toEqual(DISENO_POR_OMISION);
    expect(disenoDeLaMesa(qr, OTRA)).toEqual(marron);
    expect(tieneDisenoPropio(qr, MESA)).toBe(true);
    expect(tieneDisenoPropio(qr, OTRA)).toBe(false);
  });

  it('personalizar y restablecer no tocan lo de las demás mesas ni el original', () => {
    const qr = { general: marron, porMesa: { [OTRA]: marron } };
    const con = conDisenoPropio(qr, MESA, DISENO_POR_OMISION);
    expect(con.porMesa).toEqual({ [OTRA]: marron, [MESA]: DISENO_POR_OMISION });
    expect(qr.porMesa).toEqual({ [OTRA]: marron });
    const sin = sinDisenoPropio(con, MESA);
    expect(sin.porMesa).toEqual({ [OTRA]: marron });
    expect(sin.general).toBe(marron);
  });

  it('dice qué falta antes de guardar, igual que el servidor', () => {
    expect(faltaDelDiseno(marron)).toBeNull();
    expect(faltaDelDiseno({ ...marron, primerPlano: '#f2f2f2' })).toMatch(/no se leería/);
    expect(
      faltaDelDiseno({ ...marron, degradado: { modo: 'linear', color: '#fafafa', angulo: 0 } }),
    ).toMatch(/no se leería/);
    expect(faltaDelDiseno({ ...marron, ojo: 'circle', centro: 'square' })).toMatch(/centro/);
    expect(faltaDelDiseno({ ...marron, tamanoMm: 20 })).toMatch(/30 a 150/);
    const largo = { ...marron.marco!, texto: 'x'.repeat(41) };
    expect(faltaDelDiseno({ ...marron, marco: largo })).toMatch(/40/);
  });
});
