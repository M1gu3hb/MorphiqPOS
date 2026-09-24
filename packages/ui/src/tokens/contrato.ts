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

/**
 * LOS ESTILOS CONSTRUIDOS, y todos pasan la misma auditoria.
 *
 * `morphiq` va primero porque es EL BASE: es la paleta de Miguel, es de donde se
 * derivan los nombres en ingles que pinta la aplicacion, y los otros siete son
 * variaciones sobre su esqueleto. Cada uno tiene un PUNTO DE VISTA y un giro al que
 * sirve —un estilo sin razon es adorno; con razon, es producto—:
 *
 *   morphiq   el base, el que ya vende
 *   cristal   translucido y caro: estetica, spa, joyeria
 *   relieve   tallado, monocromo: recepcion, panel quieto
 *   taller    materiales de verdad: ferreteria, taller, refaccionaria
 *   bloque    feo y legible a proposito: mostrador rapido, hora pico
 *   terminal  fosforo y teclado: quien viene de un POS viejo
 *   papel     el sistema desaparece: despacho, consultorio, agencia
 *   noche     para operar a oscuras: barra, cocina, cine
 *
 * `premium` y `editorial`, de la Fase 1, se retiran aqui: `papel` es el editorial
 * afinado y con nombre propio, y `premium` era el mismo territorio que `morphiq`.
 * Dos nombres para un sitio es la misma enfermedad que dos vocabularios de tokens.
 *
 * Esta lista se llamaba `ESTILOS_F1_0`. El nombre ataba una constante viva a una
 * fase que ya paso, y con ella la auditoria: anadir un estilo obligaba a mirar dos
 * veces si «F1_0» seguia queriendo decir «todos». Ahora dice lo que hace.
 */
export const ESTILOS_CONSTRUIDOS = [
  'morphiq',
  'cristal',
  'relieve',
  'taller',
  'bloque',
  'terminal',
  'papel',
  'noche',
] as const;
export type EstiloConstruido = (typeof ESTILOS_CONSTRUIDOS)[number];

/** Claro y oscuro son ortogonales al estilo: N estilos x 2 modos. */
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
  /**
   * EL ACENTO SUAVE: una superficie teñida, y la tinta que va encima.
   *
   * No es lo mismo que `acento`, y la diferencia importa. `acento` es un color
   * saturado que sostiene texto claro —una insignia, un boton secundario—. Esto es la
   * SUPERFICIE tenue: el fondo de un elemento al pasar el raton, la fila resaltada de
   * una tabla, el chip de un filtro puesto.
   *
   * Existe porque la paleta de Miguel ya lo tenia y el contrato no: su `--accent` es
   * un azul clarisimo (`199 89% 92%`) con tinta azul oscura encima. Sin este par,
   * derivar `--accent` de `acento` habria pintado de cian oscuro cada superficie de
   * hover de la aplicacion — es decir, habria «unificado» rompiendo su diseno.
   */
  'acento-suave',
  'acento-suave-texto',
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
  'velo',
  'lateral-fondo',
  'lateral-texto',
  'lateral-activo',
  /**
   * La tinta del elemento ACTIVO de la barra lateral.
   *
   * La barra pinta el activo con un degradado de `lateral-activo` y le pone texto
   * encima. Sin un token para esa tinta, el componente heredado escribia `text-white`
   * a mano sobre un azul de claridad 60 %: **3.1:1**, por debajo de AA para texto
   * normal, en el elemento que dice donde estas.
   */
  'lateral-activo-texto',
  /**
   * El fondo de un elemento de la barra al pasar el raton.
   *
   * La barra lateral es OSCURA en los dos modos —decision de Miguel, y se conserva—,
   * asi que su hover no puede salir del acento suave de la pagina: en modo claro eso
   * seria una superficie clarisima sobre una barra casi negra. Necesita el suyo.
   */
  'lateral-hover',
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
  /**
   * El paso de DISPLAY, y por que es el octavo y no un `text-5xl` suelto.
   *
   * Las pantallas escribian `text-5xl xl:text-6xl` a mano para el total del cobro
   * —fuera de la escala, sin tokens y distinto en cada modelo—. Es el unico importe
   * que no se lee: se dice en voz alta con alguien esperando enfrente. Asi que tiene
   * su paso, es fluido, y sale del contrato como los otros siete.
   */
  'tamano-display',
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
  /**
   * `guantes` es la cuarta, y no es un capricho de tamaño.
   *
   * El mínimo táctil de WCAG son 44 px y el sistema lo cumple en las tres primeras.
   * Pero hay giros que se operan **con guantes puestos** —una ferretería en invierno,
   * un taller, una cocina con el trapo en la mano— y ahí 44 px es el suelo de una
   * mano desnuda y quieta. 56 px es el tamaño al que se acierta con el dedo gordo de
   * un guante y con prisa, y es lo que usan los estilos BLOQUE y TALLER, que son
   * justo los de esos giros.
   */
  densidad: ['guantes', 'comoda', 'normal', 'compacta'],
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
    frente: 'texto-sutil',
    fondo: 'fondo-sutil',
    minimo: 4.5,
    porque:
      'La cabecera y el pie de TODA tabla van en fondo-sutil. El rastreador midio sus titulos en 4.24:1 en morphiq: el par que el contrato decia cubrir no era el que se pinta',
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
    frente: 'lateral-activo-texto',
    fondo: 'lateral-activo',
    minimo: 4.5,
    porque:
      'La tinta del elemento ACTIVO de la barra: es lo que dice donde estas, y se lee ' +
      'de reojo diez horas al dia',
  },
  {
    frente: 'acento-suave-texto',
    fondo: 'acento-suave',
    minimo: 4.5,
    porque: 'Tinta sobre la superficie tenue: el hover del menu y la fila resaltada',
  },
  {
    frente: 'lateral-texto',
    fondo: 'lateral-hover',
    minimo: 4.5,
    porque: 'El rotulo de la barra lateral cuando el raton esta encima',
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
