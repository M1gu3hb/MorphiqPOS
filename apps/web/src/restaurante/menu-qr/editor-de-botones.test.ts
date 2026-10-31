import { describe, expect, it } from 'vitest';

import {
  ALTO_MINIMO,
  ANCHO_MINIMO,
  cambiarTipo,
  conLosDeLaPagina,
  estirarBoton,
  faltaDelBoton,
  moverBoton,
  nuevoBoton,
} from './editor-de-botones.ts';

/**
 * DP-9.7 · EL EDITOR DE BOTONES SIN PANTALLA.
 *
 * Moverlo o estirarlo nunca saca un botón de la página ni lo deja intocable; cambiar de tipo no
 * arrastra datos del otro tipo; y no se guarda un botón al que le falta lo suyo.
 */
describe('mover y estirar', () => {
  it('mover no lo saca de la página', () => {
    const b = nuevoBoton('platillo', 'a');
    expect(moverBoton(b, 50, 0).x).toBe(100 - b.ancho);
    expect(moverBoton(b, -50, 0).x).toBe(0);
    expect(moverBoton(b, 0, 80).y).toBe(100 - b.alto);
    expect(moverBoton(b, 1.234, -2.345)).toMatchObject({ x: 11.23, y: 42.66 });
  });

  it('estirar no lo saca de la página ni lo deja más chico que un dedo', () => {
    const b = nuevoBoton('platillo', 'a');
    expect(estirarBoton(b, 50, 0).ancho).toBe(100 - b.x);
    expect(estirarBoton(b, -200, -200)).toMatchObject({ ancho: ANCHO_MINIMO, alto: ALTO_MINIMO });
  });
});

describe('el tipo y lo que le falta', () => {
  it('cambiar de tipo deja sólo lo de ese tipo', () => {
    const conPlatillo = { ...nuevoBoton('platillo', 'a'), productoId: 'p' };
    const grupo = cambiarTipo(conPlatillo, 'grupo');
    expect(grupo.tipo).toBe('grupo');
    expect(grupo.productoId).toBeUndefined();
  });

  it('un platillo sin platillo, o un grupo sin texto o sin fuente, no se guarda', () => {
    expect(faltaDelBoton(nuevoBoton('platillo', 'a'))).toMatch(/platillo/);
    expect(faltaDelBoton({ ...nuevoBoton('platillo', 'a'), productoId: 'p' })).toBeNull();
    const grupo = nuevoBoton('grupo', 'g');
    expect(faltaDelBoton(grupo)).toMatch(/texto/);
    expect(faltaDelBoton({ ...grupo, etiqueta: 'Cócteles' })).toMatch(/categoría/);
    expect(faltaDelBoton({ ...grupo, etiqueta: 'Cócteles', categoriaId: 'c' })).toBeNull();
    expect(
      faltaDelBoton({ ...grupo, etiqueta: 'Cócteles', categoriaId: 'c', productoIds: ['p'] }),
    ).toMatch(/categoría/);
  });
});

describe('guardar una página', () => {
  it('reemplaza los botones de ESA página; una página sin botones se quita', () => {
    const todos = { p1: [nuevoBoton('platillo', 'a')], p2: [nuevoBoton('grupo', 'g')] };
    const nuevos = conLosDeLaPagina(todos, 'p1', [nuevoBoton('platillo', 'b')]);
    expect(nuevos['p1']?.map((b) => b.id)).toEqual(['b']);
    expect(nuevos['p2']).toEqual(todos.p2);
    expect(Object.keys(conLosDeLaPagina(todos, 'p1', []))).toEqual(['p2']);
  });
});
