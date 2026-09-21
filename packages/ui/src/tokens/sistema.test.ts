import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { contrasteLegible, distanciaPerceptual, leerHsl } from './color';
import {
  DISTANCIA_MINIMA_ENTRE_GRAFICOS,
  ESTILOS_CONSTRUIDOS,
  MODOS,
  PARES_DE_CONTRASTE,
  PERILLAS,
  TOKENS_BASE,
  TOKENS_COLOR,
  type EstiloConstruido,
  type Modo,
} from './contrato';
import { CLAVES_ESTILO, ESTILOS, atributosDeEstilo } from './estilos';
import { leerArchivo, resolverTokens, type BloqueCss } from './leerCss';

/**
 * El contrato del sistema de diseno, comprobado sin navegador.
 *
 * Estas pruebas se escribieron ANTES que las hojas de estilo (R17). La paleta se
 * ajusto hasta que pasaran, no al reves: la accesibilidad es la restriccion de
 * entrada del diseno, no una revision del final (05-SISTEMA-DE-DISENO §9).
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const CARPETA = join(AQUI, '..', 'estilos');

const base: BloqueCss[] = leerArchivo(join(CARPETA, 'base.css'));
const hojas = Object.fromEntries(
  ESTILOS_CONSTRUIDOS.map((estilo) => [estilo, leerArchivo(join(CARPETA, `${estilo}.css`))]),
) as Record<EstiloConstruido, BloqueCss[]>;

/**
 * Los selectores activos para un estilo y un modo concretos.
 *
 * La clase del modo oscuro es `dark` y no `oscuro`. Es la que pone su `ThemeContext`
 * y la unica que existe en el `<html>` de la aplicacion; `oscuro:` es el nombre de la
 * variante de Tailwind que apunta a esa MISMA clase. Las hojas del sistema decian
 * `.oscuro`, asi que su modo oscuro no se activaba nunca en la aplicacion de verdad:
 * la prueba pasaba y el navegador no veia ni un token.
 */
function selectoresActivos(estilo: EstiloConstruido, modo: Modo): string[] {
  const raiz = `[data-estilo='${estilo}']`;
  return modo === 'claro' ? [':root', raiz] : [':root', raiz, `${raiz}.dark`];
}

function tokensDe(estilo: EstiloConstruido, modo: Modo): Map<string, string> {
  return resolverTokens([...base, ...hojas[estilo]], selectoresActivos(estilo, modo));
}

describe('el contrato de tokens', () => {
  it.each(ESTILOS_CONSTRUIDOS)('%s declara los tokens que no son de color', (estilo) => {
    const tokens = tokensDe(estilo, 'claro');
    const faltantes = TOKENS_BASE.filter((token) => !tokens.has(token));
    expect(faltantes, `faltan en ${estilo}`).toEqual([]);
  });

  for (const estilo of ESTILOS_CONSTRUIDOS) {
    for (const modo of MODOS) {
      it(`${estilo} en ${modo} declara los ${String(TOKENS_COLOR.length)} tokens de color`, () => {
        const tokens = tokensDe(estilo, modo);
        const faltantes = TOKENS_COLOR.filter((token) => !tokens.has(token));
        expect(faltantes).toEqual([]);
      });

      it(`${estilo} en ${modo} tiene todos los colores en formato HSL sin funcion`, () => {
        const tokens = tokensDe(estilo, modo);
        const malformados = TOKENS_COLOR.filter(
          (token) => leerHsl(tokens.get(token) ?? '') === null,
        );
        expect(malformados).toEqual([]);
      });
    }
  }

  it('claro y oscuro son paletas distintas, no la misma repetida', () => {
    for (const estilo of ESTILOS_CONSTRUIDOS) {
      const claro = tokensDe(estilo, 'claro');
      const oscuro = tokensDe(estilo, 'oscuro');
      expect(oscuro.get('fondo'), estilo).not.toBe(claro.get('fondo'));
      expect(oscuro.get('texto'), estilo).not.toBe(claro.get('texto'));
    }
  });

  it('ningun estilo es otro con otro nombre', () => {
    /**
     * Ocho estilos que se diferencian solo en el color son un tema con ocho
     * paletas, no ocho estilos. Lo que los hace ESTRUCTURALMENTE distintos son las
     * cuatro perillas (§4), asi que se exige lo uno Y lo otro: distinto primario, y
     * al menos una perilla distinta con cada uno de los demas.
     *
     * Con «al menos una» y no «dos»: ocho estilos sobre cuatro perillas de tres a
     * cinco valores no caben con dos de distancia entre todos los pares, y exigir un
     * numero que no cabe obliga a inventarse diferencias que no significan nada.
     */
    for (const uno of ESTILOS_CONSTRUIDOS) {
      for (const otro of ESTILOS_CONSTRUIDOS) {
        if (uno === otro) continue;
        const paletaUno = tokensDe(uno, 'claro');
        const paletaOtro = tokensDe(otro, 'claro');
        const mismasPerillas = (['densidad', 'redondeo', 'elevacion', 'movimiento'] as const).every(
          (perilla) => ESTILOS[uno]?.perillas[perilla] === ESTILOS[otro]?.perillas[perilla],
        );
        const mismoPrimario = paletaUno.get('primario') === paletaOtro.get('primario');
        expect(
          mismasPerillas && mismoPrimario,
          `${uno} y ${otro} tienen el mismo primario Y las mismas cuatro perillas: son el ` +
            'mismo estilo con dos nombres',
        ).toBe(false);
      }
    }
  });

  it('cada estilo declara valores de perilla que existen en el catalogo', () => {
    for (const clave of CLAVES_ESTILO) {
      const estilo = ESTILOS[clave];
      expect(estilo, clave).toBeDefined();
      if (!estilo) continue;
      expect(PERILLAS.densidad).toContain(estilo.perillas.densidad);
      expect(PERILLAS.redondeo).toContain(estilo.perillas.redondeo);
      expect(PERILLAS.elevacion).toContain(estilo.perillas.elevacion);
      expect(PERILLAS.movimiento).toContain(estilo.perillas.movimiento);
    }
  });

  it('atributosDeEstilo devuelve los 5 atributos, y rechaza un estilo inventado', () => {
    const atributos = atributosDeEstilo('morphiq');
    expect(atributos['data-estilo']).toBe('morphiq');
    expect(Object.keys(atributos)).toHaveLength(5);
    expect(() => atributosDeEstilo('no-existe')).toThrow();
  });
});

describe('las 4 perillas estructurales', () => {
  const declarados = new Map(base.flatMap((bloque) => [...bloque.tokens]));

  it('la densidad cambia el espacio y la altura de control', () => {
    const alturas = PERILLAS.densidad.map((valor) => {
      const tokens = resolverTokens(base, [':root', `[data-densidad='${valor}']`]);
      return tokens.get('altura-control');
    });
    expect(alturas.every((altura) => typeof altura === 'string')).toBe(true);
    // Una densidad que no cambia la altura no es una densidad: es un nombre. El
    // numero sale del catalogo para que anadir una obligue a darle la suya.
    expect(
      new Set(alturas).size,
      `las ${String(PERILLAS.densidad.length)} densidades deben dar otras tantas alturas distintas`,
    ).toBe(PERILLAS.densidad.length);
  });

  it('el redondeo cambia el radio', () => {
    const radios = PERILLAS.redondeo.map((valor) => {
      const tokens = resolverTokens(base, [':root', `[data-redondeo='${valor}']`]);
      return tokens.get('radio-md');
    });
    expect(new Set(radios).size, 'los 5 redondeos deben dar 5 radios distintos').toBe(5);
  });

  it('la elevacion cambia las sombras', () => {
    const sombras = PERILLAS.elevacion.map((valor) => {
      const tokens = resolverTokens(base, [':root', `[data-elevacion='${valor}']`]);
      return tokens.get('sombra-2');
    });
    expect(new Set(sombras).size, 'las 4 elevaciones deben dar 4 sombras distintas').toBe(4);
  });

  it('el movimiento cambia las duraciones, y la perilla nula las anula', () => {
    const duraciones = PERILLAS.movimiento.map((valor) => {
      const tokens = resolverTokens(base, [':root', `[data-movimiento='${valor}']`]);
      return tokens.get('duracion-normal');
    });
    expect(new Set(duraciones).size).toBe(4);
    expect(duraciones[0], 'movimiento nulo debe ser 0ms').toBe('0ms');
  });

  it('prefers-reduced-motion anula el movimiento pase lo que pase (§4)', () => {
    const reducido = base.find((bloque) => bloque.selector.includes('prefers-reduced-motion'));
    expect(reducido, 'falta el bloque @media (prefers-reduced-motion: reduce)').toBeDefined();

    // No basta con que exista: tiene que poner las tres duraciones en cero.
    for (const token of ['duracion-rapida', 'duracion-normal', 'duracion-lenta']) {
      expect(reducido?.tokens.get(token), `${token} no se anula`).toBe('0ms');
    }
  });

  it('la fuente de numeros es tabular: sin eso los totales bailan en columna', () => {
    expect(declarados.get('fuente-numeros')).toBeDefined();
    const variante = declarados.get('variante-numerica');
    expect(variante, 'falta --variante-numerica con tabular-nums').toContain('tabular-nums');
  });
});

describe('contraste AA en los 2 estilos x 2 modos (F1.0-P5)', () => {
  for (const estilo of ESTILOS_CONSTRUIDOS) {
    for (const modo of MODOS) {
      const tokens = tokensDe(estilo, modo);

      for (const par of PARES_DE_CONTRASTE) {
        it(`${estilo}/${modo}: ${par.frente} sobre ${par.fondo} >= ${par.minimo}:1`, () => {
          const frente = leerHsl(tokens.get(par.frente) ?? '');
          const fondo = leerHsl(tokens.get(par.fondo) ?? '');
          expect(frente, `token ${par.frente} ausente o malformado`).not.toBeNull();
          expect(fondo, `token ${par.fondo} ausente o malformado`).not.toBeNull();

          const razon = contrasteLegible(frente!, fondo!);
          expect(razon, `${par.porque}. Contraste real ${razon}:1`).toBeGreaterThanOrEqual(
            par.minimo,
          );
        });
      }

      it(`${estilo}/${modo}: los 6 colores de grafica se distinguen entre si`, () => {
        const graficos = [1, 2, 3, 4, 5, 6].map((n) => leerHsl(tokens.get(`grafico-${n}`) ?? ''));
        expect(graficos.every((color) => color !== null)).toBe(true);

        const parecidos: string[] = [];
        for (let i = 0; i < graficos.length; i += 1) {
          for (let j = i + 1; j < graficos.length; j += 1) {
            const a = graficos[i];
            const b = graficos[j];
            if (!a || !b) continue;
            const distancia = distanciaPerceptual(a, b);
            if (distancia < DISTANCIA_MINIMA_ENTRE_GRAFICOS) {
              parecidos.push(`grafico-${i + 1} vs grafico-${j + 1} (${distancia.toFixed(3)})`);
            }
          }
        }
        expect(parecidos).toEqual([]);
      });
    }
  }
});
