import { describe, expect, it } from 'vitest';

import { clasesDePaleta, sinColores } from './clases-de-color.mjs';

/**
 * C.16 · La definición de «clase de color» de la que dependen dos puertas: la que
 * demuestra que un commit del heredado sólo tradujo colores, y la que impide que
 * vuelvan los de paleta.
 */

describe('sinColores', () => {
  it('UNA TRADUCCIÓN DE COLOR deja el archivo igual', () => {
    const antes = `<div className="bg-white p-2 text-emerald-700 dark:bg-gray-900 hover:bg-gray-50/70">Hola</div>`;
    const despues = `<div className="bg-superficie p-2 text-exito hover:bg-fondo-sutil/70">Hola</div>`;
    expect(sinColores(antes)).toBe(sinColores(despues));
  });

  it('en un objeto de JS también, y con variantes de estado', () => {
    const antes = `const TONO = { activo: 'bg-emerald-100 text-emerald-700 data-[state=open]:bg-amber-50' };`;
    const despues = `const TONO = { activo: 'bg-exito/15 text-exito data-[state=open]:bg-advertencia/10' };`;
    expect(sinColores(antes)).toBe(sinColores(despues));
  });

  it('QUITAR una clase que no es de color SE NOTA', () => {
    expect(sinColores(`className="bg-white p-2"`)).not.toBe(
      sinColores(`className="bg-superficie"`),
    );
  });

  it('cambiar un texto, un tamaño o un icono SE NOTA', () => {
    expect(sinColores(`<b className="text-sm">Cobrar</b>`)).not.toBe(
      sinColores(`<b className="text-sm">Cobrar ahora</b>`),
    );
    expect(sinColores(`className="text-sm text-gray-600"`)).not.toBe(
      sinColores(`className="text-base text-texto-sutil"`),
    );
    expect(sinColores(`import { Check } from 'lucide-react'`)).not.toBe(
      sinColores(`import { CheckCircle } from 'lucide-react'`),
    );
  });

  it('no confunde clases que no pintan: text-center, border-2, ring-2, bg-cover', () => {
    const texto = `className="text-center border-2 ring-2 bg-cover text-xs"`;
    expect(sinColores(texto)).toBe(texto.replace(/\s+/g, ''));
  });
});

describe('clasesDePaleta', () => {
  it('ve las de paleta con sus prefijos y opacidad, y no los tokens', () => {
    expect(
      clasesDePaleta(
        `"bg-white/70 dark:text-emerald-300 border-borde text-peligro hover:bg-rose-50"`,
      ),
    ).toEqual(['bg-white/70', 'dark:text-emerald-300', 'hover:bg-rose-50']);
  });
});
