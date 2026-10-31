/**
 * LAS PIEZAS CON LAS QUE SE DIBUJA UN MÓDULO.
 *
 * Una ruta es una lista de comandos —mover, línea, curva, cerrar— en unidades de módulo: el
 * módulo (3, 5) del QR ocupa de x = 3 a 4 y de y = 5 a 6. Toda la geometría del diseño se
 * calcula así, sin saber de píxeles, y sólo al final se escribe como el atributo `d` de un
 * `<path>`.
 */

export type Comando =
  | readonly ['M', number, number]
  | readonly ['L', number, number]
  | readonly ['C', number, number, number, number, number, number]
  | readonly ['Z'];

export type Ruta = readonly Comando[];

/**
 * Radio de las cuatro esquinas, en este orden: superior izquierda, superior derecha, inferior
 * derecha, inferior izquierda.
 */
export type Esquinas = readonly [number, number, number, number];

/** Un solo radio para las cuatro esquinas, o uno por esquina. */
export type Radios = number | Esquinas;

/** Distancia del punto de control de una Bézier cúbica que aproxima un cuarto de círculo. */
const KAPPA = 0.552284749831;

/** Un número para el SVG: cuatro decimales como máximo y sin ceros de sobra. */
export function formatearNumero(valor: number): string {
  return Number(valor.toFixed(4)).toString();
}

function esquinasDe(radios: Radios): Esquinas {
  return typeof radios === 'number' ? [radios, radios, radios, radios] : radios;
}

/**
 * Un rectángulo con esquinas redondeadas a gusto. Un radio mayor que la mitad del lado se
 * recorta a la mitad: con eso un radio enorme da una cápsula o un círculo, no una figura rota.
 */
export function rectangulo(
  x: number,
  y: number,
  ancho: number,
  alto: number,
  radios: Radios = 0,
): Ruta {
  const limite = Math.min(ancho / 2, alto / 2);
  const [a, b, c, d] = esquinasDe(radios);
  const supIzq = Math.min(a, limite);
  const supDer = Math.min(b, limite);
  const infDer = Math.min(c, limite);
  const infIzq = Math.min(d, limite);
  if (supIzq === 0 && supDer === 0 && infDer === 0 && infIzq === 0) {
    return [
      ['M', x, y],
      ['L', x + ancho, y],
      ['L', x + ancho, y + alto],
      ['L', x, y + alto],
      ['Z'],
    ];
  }
  const derecha = x + ancho;
  const abajo = y + alto;
  return [
    ['M', x + supIzq, y],
    ['L', derecha - supDer, y],
    [
      'C',
      derecha - supDer + supDer * KAPPA,
      y,
      derecha,
      y + supDer - supDer * KAPPA,
      derecha,
      y + supDer,
    ],
    ['L', derecha, abajo - infDer],
    [
      'C',
      derecha,
      abajo - infDer + infDer * KAPPA,
      derecha - infDer + infDer * KAPPA,
      abajo,
      derecha - infDer,
      abajo,
    ],
    ['L', x + infIzq, abajo],
    [
      'C',
      x + infIzq - infIzq * KAPPA,
      abajo,
      x,
      abajo - infIzq + infIzq * KAPPA,
      x,
      abajo - infIzq,
    ],
    ['L', x, y + supIzq],
    ['C', x, y + supIzq - supIzq * KAPPA, x + supIzq - supIzq * KAPPA, y, x + supIzq, y],
    ['Z'],
  ];
}

/** Un polígono cuyos vértices se dan en proporción (0 a 1) de la caja `ancho` × `alto`. */
export function poligono(
  x: number,
  y: number,
  ancho: number,
  alto: number,
  vertices: readonly (readonly [number, number])[],
): Ruta {
  const lados = vertices.map(([a, b], i): Comando =>
    i === 0 ? ['M', x + a * ancho, y + b * alto] : ['L', x + a * ancho, y + b * alto],
  );
  return [...lados, ['Z']];
}

/** La misma ruta desplazada `dx` a la derecha y `dy` hacia abajo. No toca la original. */
export function trasladar(ruta: Ruta, dx: number, dy: number): Ruta {
  return ruta.map((comando): Comando => {
    switch (comando[0]) {
      case 'M':
        return ['M', comando[1] + dx, comando[2] + dy];
      case 'L':
        return ['L', comando[1] + dx, comando[2] + dy];
      case 'C':
        return [
          'C',
          comando[1] + dx,
          comando[2] + dy,
          comando[3] + dx,
          comando[4] + dy,
          comando[5] + dx,
          comando[6] + dy,
        ];
      case 'Z':
        return comando;
    }
  });
}

function comandoSvg(comando: Comando): string {
  switch (comando[0]) {
    case 'M':
    case 'L':
      return `${comando[0]}${formatearNumero(comando[1])} ${formatearNumero(comando[2])}`;
    case 'C':
      return `C${[comando[1], comando[2], comando[3], comando[4], comando[5], comando[6]]
        .map(formatearNumero)
        .join(' ')}`;
    case 'Z':
      return 'Z';
  }
}

/** El atributo `d` de un `<path>`: `M1 2L3 4Z`. */
export function rutaSvg(ruta: Ruta): string {
  return ruta.map(comandoSvg).join('');
}
