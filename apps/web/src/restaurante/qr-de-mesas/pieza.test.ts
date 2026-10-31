import { describe, expect, it } from 'vitest';

import { DISENO_POR_OMISION, type DisenoDeQr } from './diseno';
import { conNumeroDeMesa, opcionesDeLaPieza, svgDeLaPieza } from './pieza';

const CONTENIDO = 'https://pos-don-poncho.vercel.app/qr/Zx9_a8Kq2LmN4pQr7sTu1vWx3yZb5cDe';
const LOGO = { ancho: 100, alto: 100, datos: 'data:image/png;base64,iVBORw0KGgo=' } as const;

const enmarcado: DisenoDeQr = {
  ...DISENO_POR_OMISION,
  modulo: 'dots',
  ojo: 'circle',
  centro: 'circle',
  degradado: { modo: 'linear', color: '#333333', angulo: 45 },
  conLogo: true,
  marco: {
    tipo: 'band',
    texto: 'Mesa {mesa}',
    textoSecundario: 'Escanea y pide · {mesa}',
    color: '#5b2a0e',
    colorTexto: '#ffffff',
  },
};

describe('la pieza de una mesa', () => {
  it('«{mesa}» se cambia por el número, todas las veces', () => {
    expect(conNumeroDeMesa('Mesa {mesa} · {mesa}', 7)).toBe('Mesa 7 · 7');
    expect(conNumeroDeMesa('Escanea y pide', 7)).toBe('Escanea y pide');
  });

  it('el diseño por omisión es el QR plano: sin degradado, sin logo, sin marco', () => {
    const opciones = opcionesDeLaPieza(
      { contenido: CONTENIDO, numero: 3, diseno: DISENO_POR_OMISION, logo: LOGO },
      512,
    );
    expect(opciones).toMatchObject({ modulo: 'square', ojo: 'square', tamano: 512 });
    expect(opciones).not.toHaveProperty('degradado');
    expect(opciones).not.toHaveProperty('logo');
    expect(opciones).not.toHaveProperty('marco');
  });

  it('lleva el estilo, el degradado, el logo y el marco con el número de la mesa', () => {
    const opciones = opcionesDeLaPieza(
      { contenido: CONTENIDO, numero: 12, diseno: enmarcado, logo: LOGO },
      1024,
    );
    expect(opciones).toMatchObject({
      modulo: 'dots',
      degradado: { modo: 'linear', color: '#333333', angulo: 45 },
      logo: { imagen: LOGO },
      marco: { tipo: 'band', texto: 'Mesa 12', textoSecundario: 'Escanea y pide · 12' },
    });
  });

  it('con logo pedido pero el negocio sin logo, sale sin logo (y no se rompe)', () => {
    const opciones = opcionesDeLaPieza(
      { contenido: CONTENIDO, numero: 1, diseno: enmarcado, logo: null },
      1024,
    );
    expect(opciones).not.toHaveProperty('logo');
  });

  it('el SVG es uno por mesa: sus ids no chocan con los de otra mesa en la misma página', () => {
    const a = svgDeLaPieza({ contenido: CONTENIDO, numero: 1, diseno: enmarcado, logo: LOGO });
    const b = svgDeLaPieza({ contenido: CONTENIDO, numero: 2, diseno: enmarcado, logo: LOGO });
    expect(a.startsWith('<svg')).toBe(true);
    expect(a).toContain('Mesa 1');
    const ids = (svg: string) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(a).length).toBeGreaterThan(0);
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
  });

  it('el texto del marco se escapa: no se cuela marcado en el SVG', () => {
    const malicioso: DisenoDeQr = {
      ...enmarcado,
      marco: { ...enmarcado.marco!, texto: '<script>x</script>' },
    };
    const svg = svgDeLaPieza({ contenido: CONTENIDO, numero: 1, diseno: malicioso, logo: null });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});
