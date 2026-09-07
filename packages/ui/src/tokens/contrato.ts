/**
 * El contrato del sistema de diseno: que tokens deben existir, en que estilos y
 * modos, y que pares de color deben cumplir contraste.
 *
 * Este archivo es la ESPECIFICACION. Las hojas de estilo se comprueban contra
 * el, no al reves. Agregar un estilo nuevo sin definir todos los tokens hace
 * fallar la prueba; bajar el contraste de un par tambien.
 *
 * Sale de `05-SISTEMA-DE-DISENO §3, §4, §5 y §9`.
 */

/** Los estilos intercambiables. F1.0 construye los dos primeros. */
export const ESTILOS_F1_0 = ['premium', 'editorial'] as const;
export type EstiloF1_0 = (typeof ESTILOS_F1_0)[number];

/** Claro y oscuro son ortogonales al estilo: 2 estilos x 2 modos. */
export const MODOS = ['claro', 'oscuro'] as const;
export type Modo = (typeof MODOS)[number];

/** Tokens de color. Todos, en todos los estilos y modos (§3). */
export const TOKENS_COLOR = [
  'fondo',
  'fondo-sutil',
  'superficie',
  'superficie-elevada',
  'texto',
  'texto-sutil',
  'texto-tenue',
  'borde',
  'borde-fuerte',
  'anillo',
  'primario',
  'primario-texto',
  'acento',
  'acento-texto',
  'exito',
  'exito-texto',
  'advertencia',
  'advertencia-texto',
  'peligro',
  'peligro-texto',
  'info',
  'info-texto',
  'grafico-1',
  'grafico-2',
  'grafico-3',
  'grafico-4',
  'grafico-5',
  'grafico-6',
  'lateral-fondo',
  'lateral-texto',
  'lateral-activo',
  'lateral-borde',
] as const;

/** Tokens que no son color y viven una sola vez, en la base (§3). */
export const TOKENS_BASE = [
  // tipografia
  'fuente-ui',
  'fuente-numeros',
  'fuente-display',
  'tamano-xs',
  'tamano-sm',
  'tamano-base',
  'tamano-lg',
  'tamano-xl',
  'tamano-2xl',
  'tamano-3xl',
  'peso-normal',
  'peso-medio',
  'peso-fuerte',
  'interlinea-compacta',
  'interlinea-normal',
  'interlinea-amplia',
  'tracking-compacto',
  'tracking-normal',
  // espacio
  'espacio-0',
  'espacio-1',
  'espacio-2',
  'espacio-3',
  'espacio-4',
  'espacio-5',
  'espacio-6',
  'espacio-8',
  'espacio-10',
  'espacio-12',
  'espacio-16',
  // radio
  'radio-sm',
  'radio-md',
  'radio-lg',
  'radio-completo',
  // sombra
  'sombra-0',
  'sombra-1',
  'sombra-2',
  'sombra-3',
  'sombra-4',
  // borde
  'borde-ancho',
  'borde-estilo',
  // movimiento
  'duracion-rapida',
  'duracion-normal',
  'duracion-lenta',
  'curva-entrada',
  'curva-salida',
  'curva-resorte',
  // altura de control, que depende de la densidad
  'altura-control',
] as const;

/**
 * Las cuatro perillas estructurales (§4). Son lo que hace que los estilos se
 * sientan distintos de verdad y no solo "pintados de otro color".
 */
export const PERILLAS = {
  densidad: ['comoda', 'normal', 'compacta'],
  redondeo: ['nula', 'sutil', 'media', 'amplia', 'pastilla'],
  elevacion: ['plana', 'sombra', 'doble-bisel', 'linea-dura'],
  movimiento: ['nula', 'sutil', 'normal', 'expresiva'],
} as const;

export type Densidad = (typeof PERILLAS.densidad)[number];
export type Redondeo = (typeof PERILLAS.redondeo)[number];
export type Elevacion = (typeof PERILLAS.elevacion)[number];
export type Movimiento = (typeof PERILLAS.movimiento)[number];

/** Un par de colores que debe cumplir un minimo de contraste. */
export interface ParDeContraste {
  /** Token del frente: texto, icono o borde. */
  readonly frente: string;
  /** Token del fondo sobre el que se dibuja. */
  readonly fondo: string;
  /** Minimo exigido: 4.5 texto normal, 3 texto grande y elementos de interfaz. */
  readonly minimo: number;
  /** Por que existe este par. Sale en el mensaje cuando falla. */
  readonly porque: string;
}

/**
 * Los pares que se auditan en CI, en los dos estilos y los dos modos.
 *
 * No estan todos los pares posibles: estan los que **de verdad se dibujan uno
 * sobre otro** en el producto. Auditar combinaciones que nadie usa produce
 * ruido y acaba con la gente bajando el umbral.
 */
export const PARES_DE_CONTRASTE: readonly ParDeContraste[] = [
  {
    frente: 'texto',
    fondo: 'fondo',
    minimo: 4.5,
    porque: 'Texto principal sobre el fondo de la pagina',
  },
  {
    frente: 'texto',
    fondo: 'superficie',
    minimo: 4.5,
    porque: 'Texto dentro de una tarjeta o un dialogo',
  },
  {
    frente: 'texto',
    fondo: 'superficie-elevada',
    minimo: 4.5,
    porque: 'Texto en una superficie flotante: menu, popover, tooltip',
  },
  {
    frente: 'texto-sutil',
    fondo: 'fondo',
    minimo: 4.5,
    porque: 'Etiquetas de formulario y encabezados de tabla. Se leen, no se adivinan',
  },
  {
    frente: 'texto-sutil',
    fondo: 'superficie',
    minimo: 4.5,
    porque: 'Etiquetas dentro de tarjetas',
  },
  {
    frente: 'texto-tenue',
    fondo: 'fondo',
    minimo: 3,
    porque: 'Texto auxiliar y marcas de agua. Solo en tamano grande',
  },
  {
    frente: 'primario-texto',
    fondo: 'primario',
    minimo: 4.5,
    porque: 'La etiqueta del boton principal: es el boton de COBRAR',
  },
  {
    frente: 'acento-texto',
    fondo: 'acento',
    minimo: 4.5,
    porque: 'Etiqueta sobre el color de acento',
  },
  {
    frente: 'exito-texto',
    fondo: 'exito',
    minimo: 4.5,
    porque: 'Confirmacion de cobro: se lee de lejos y con prisa',
  },
  {
    frente: 'advertencia-texto',
    fondo: 'advertencia',
    minimo: 4.5,
    porque: 'Aviso de stock bajo',
  },
  {
    frente: 'peligro-texto',
    fondo: 'peligro',
    minimo: 4.5,
    porque: 'Error de cobro y confirmacion de borrado. El peor sitio para no leerse',
  },
  {
    frente: 'info-texto',
    fondo: 'info',
    minimo: 4.5,
    porque: 'Mensajes informativos',
  },
  {
    frente: 'lateral-texto',
    fondo: 'lateral-fondo',
    minimo: 4.5,
    porque: 'Navegacion lateral',
  },
  {
    frente: 'borde-fuerte',
    fondo: 'fondo',
    minimo: 3,
    porque: 'Borde de un campo de formulario. WCAG 1.4.11, contraste de elementos no textuales',
  },
  {
    frente: 'anillo',
    fondo: 'fondo',
    minimo: 3,
    porque:
      'Anillo de foco. Si no se ve, la navegacion por teclado no existe, y la caja ' +
      'se opera con teclado diez horas al dia',
  },
  {
    frente: 'anillo',
    fondo: 'superficie',
    minimo: 3,
    porque: 'Anillo de foco dentro de una tarjeta o un dialogo',
  },
];

/**
 * Los seis colores de grafica deben distinguirse entre si.
 *
 * `05-SISTEMA-DE-DISENO §9` — "El color nunca es el unico indicador de estado".
 * En una grafica el color SI carga informacion, asi que dos series necesitan
 * separacion suficiente para no confundirse.
 *
 * La medida es distancia perceptual en OKLab, NO razon de contraste de WCAG.
 * El contraste mide luminancia, y exigirlo entre colores categoricos obligaria a
 * escalonar las seis series por claridad, que es justo lo que hace ilegible una
 * grafica de barras. Referencia practica: por debajo de 0.10 dos colores se
 * confunden en una pantalla barata con poca luz — que es la pantalla donde va a
 * correr esto.
 */
export const DISTANCIA_MINIMA_ENTRE_GRAFICOS = 0.12;
