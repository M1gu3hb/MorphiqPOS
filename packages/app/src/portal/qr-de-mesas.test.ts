import { describe, expect, it } from 'vitest';

import {
  DISENO_DE_QR,
  DISENO_POR_OMISION,
  MAXIMO_DE_MESAS_PROPIAS,
  QR_DE_MESAS,
  disenoDeLaMesa,
  qrDeMesasGuardado,
  type DisenoDeQr,
} from './qr-de-mesas.ts';

const MESA = '6f1b3a1e-2f7c-4c1a-9d1e-1a2b3c4d5e6f';
const OTRA = '7a2c4b2f-3a8d-4d2b-8e2f-2b3c4d5e6f70';

const disenado: DisenoDeQr = {
  ...DISENO_POR_OMISION,
  modulo: 'dots',
  ojo: 'circle',
  centro: 'circle',
  primerPlano: '#5b2a0e',
  ojos: '#3a1a08',
  degradado: { modo: 'linear', color: '#7a3b12', angulo: 45 },
  conLogo: true,
  marco: {
    tipo: 'band',
    texto: 'Mesa {mesa}',
    textoSecundario: 'Escanea y pide',
    color: '#5b2a0e',
    colorTexto: '#ffffff',
  },
  tamanoMm: 70,
};

describe('el diseño de un QR de mesa', () => {
  it('el diseño por omisión es el QR de siempre: negro sobre blanco, recto, sin logo ni marco', () => {
    expect(DISENO_DE_QR.safeParse(DISENO_POR_OMISION).success).toBe(true);
    expect(DISENO_POR_OMISION).toMatchObject({
      modulo: 'square',
      ojo: 'square',
      centro: 'square',
      primerPlano: '#000000',
      fondo: '#ffffff',
      degradado: null,
      conLogo: false,
      marco: null,
    });
  });

  it('acepta un diseño completo del catálogo', () => {
    expect(DISENO_DE_QR.safeParse(disenado).success).toBe(true);
  });

  it('rechaza estilos que no son del catálogo', () => {
    expect(DISENO_DE_QR.safeParse({ ...disenado, modulo: 'estrella' }).success).toBe(false);
    expect(DISENO_DE_QR.safeParse({ ...disenado, ojo: 'triangulo' }).success).toBe(false);
    expect(
      DISENO_DE_QR.safeParse({ ...disenado, marco: { ...disenado.marco, tipo: 'nube' } }).success,
    ).toBe(false);
  });

  it('el centro del ojo tiene que ir con su ojo (como en el estudio)', () => {
    // «circle» acepta circle, classy y extra-rounded; «square» no.
    const r = DISENO_DE_QR.safeParse({ ...disenado, ojo: 'circle', centro: 'square' });
    expect(r.success).toBe(false);
  });

  it('un QR que no se leería no se guarda: tinta clara, fondo oscuro o degradado sin contraste', () => {
    for (const malo of [
      { ...disenado, primerPlano: '#f0f0f0' },
      { ...disenado, fondo: '#202020' },
      { ...disenado, ojos: '#eeeeee' },
      { ...disenado, degradado: { modo: 'radial', color: '#fafafa', angulo: 0 } },
    ]) {
      const r = DISENO_DE_QR.safeParse(malo);
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.message).toMatch(/no se leería/);
    }
  });

  it('colores sólo como #rrggbb, textos del marco cortos y tamaño impreso de 30 a 150 mm', () => {
    expect(DISENO_DE_QR.safeParse({ ...disenado, fondo: 'white' }).success).toBe(false);
    expect(DISENO_DE_QR.safeParse({ ...disenado, tamanoMm: 29 }).success).toBe(false);
    expect(DISENO_DE_QR.safeParse({ ...disenado, tamanoMm: 151 }).success).toBe(false);
    expect(DISENO_DE_QR.safeParse({ ...disenado, tamanoMm: 30 }).success).toBe(true);
    expect(DISENO_DE_QR.safeParse({ ...disenado, tamanoMm: 150 }).success).toBe(true);
    expect(
      DISENO_DE_QR.safeParse({
        ...disenado,
        marco: { ...disenado.marco, texto: 'x'.repeat(41) },
      }).success,
    ).toBe(false);
  });

  it('nada que no esté en la forma: ni campos de más ni el contenido del QR', () => {
    expect(DISENO_DE_QR.safeParse({ ...disenado, contenido: 'https://otro.mx' }).success).toBe(
      false,
    );
  });
});

describe('los QR de las mesas: general y por mesa', () => {
  it('cada mesa usa el suyo si lo tiene; si no, el general', () => {
    const qr = QR_DE_MESAS.parse({ general: disenado, porMesa: { [MESA]: DISENO_POR_OMISION } });
    expect(disenoDeLaMesa(qr, MESA)).toEqual(DISENO_POR_OMISION);
    expect(disenoDeLaMesa(qr, OTRA)).toEqual(disenado);
  });

  it('las llaves por mesa son ids de mesa, y no más de las que caben', () => {
    expect(
      QR_DE_MESAS.safeParse({ general: disenado, porMesa: { 'mesa-1': disenado } }).success,
    ).toBe(false);
    const muchas = Object.fromEntries(
      Array.from({ length: MAXIMO_DE_MESAS_PROPIAS + 1 }, (_, i) => [
        `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        disenado,
      ]),
    );
    expect(QR_DE_MESAS.safeParse({ general: disenado, porMesa: muchas }).success).toBe(false);
  });

  it('lo guardado se lee sin confiar: sin forma, vuelve el QR de siempre para todas', () => {
    expect(qrDeMesasGuardado(undefined)).toEqual({ general: DISENO_POR_OMISION, porMesa: {} });
    expect(qrDeMesasGuardado({ general: { modulo: 'estrella' } })).toEqual({
      general: DISENO_POR_OMISION,
      porMesa: {},
    });
    expect(qrDeMesasGuardado({ general: disenado, porMesa: {} }).general).toEqual(disenado);
  });
});
