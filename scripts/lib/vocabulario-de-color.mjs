/**
 * LOS COLORES EN INGLÉS, Y SU NOMBRE EN EL SISTEMA.
 *
 * La tabla de `apps/web/heredado/index.css`, al revés: allí `--card: var(--superficie)`
 * deriva el alias de Miguel del token; aquí `bg-card` se escribe `bg-superficie`. La
 * usan el traductor (`traducir-vocabulario.mjs`) y la puerta (`verify:primitivas`), que
 * así no pueden opinar distinto sobre qué es inglés.
 */
/** El alias en inglés → el token del sistema. Es la tabla de `heredado/index.css`, al revés. */
export const TRADUCCION = new Map([
  ['sidebar-primary-foreground', 'lateral-activo-texto'],
  ['sidebar-accent-foreground', 'lateral-texto'],
  ['sidebar-foreground', 'lateral-texto'],
  ['sidebar-primary', 'lateral-activo'],
  ['sidebar-accent', 'lateral-hover'],
  ['sidebar-border', 'lateral-borde'],
  ['sidebar-ring', 'anillo'],
  ['sidebar', 'lateral-fondo'],
  ['destructive-foreground', 'peligro-texto'],
  ['secondary-foreground', 'texto'],
  ['popover-foreground', 'texto'],
  ['primary-foreground', 'primario-texto'],
  ['success-foreground', 'exito-texto'],
  ['warning-foreground', 'advertencia-texto'],
  ['accent-foreground', 'acento-suave-texto'],
  ['muted-foreground', 'texto-sutil'],
  ['card-foreground', 'texto'],
  ['info-foreground', 'info-texto'],
  ['background', 'fondo'],
  ['foreground', 'texto'],
  ['destructive', 'peligro'],
  ['secondary', 'fondo-sutil'],
  ['popover', 'superficie-elevada'],
  ['primary', 'primario'],
  ['success', 'exito'],
  ['warning', 'advertencia'],
  ['accent', 'acento-suave'],
  ['muted', 'fondo-sutil'],
  ['border', 'borde'],
  ['input', 'borde-fuerte'],
  ['card', 'superficie'],
  ['ring', 'anillo'],
  ['chart-1', 'grafico-1'],
  ['chart-2', 'grafico-2'],
  ['chart-3', 'grafico-3'],
  ['chart-4', 'grafico-4'],
  ['chart-5', 'grafico-5'],
]);

const PREFIJOS =
  'bg|text|border|border-[xytblrse]|ring|ring-offset|outline|fill|stroke|accent|caret|divide|decoration|from|via|to|shadow|placeholder';
const NOMBRES = [...TRADUCCION.keys()].join('|');

/**
 * Una utilidad de color en inglés: su prefijo, su nombre y lo que la cierra.
 *
 * El `!` de «importante» cuenta a los dos lados (C.17 de la 2.4): Tailwind 4 lo pone al
 * FINAL (`text-destructive!`) y Tailwind 3 al PRINCIPIO (`!bg-muted`). Sin él, tres
 * primitivas llevaban `*:[svg]:text-destructive!` y esta puerta no las veía.
 */
export const EN_INGLES = new RegExp(
  `(?<=^|[\\s"'\`:\\[(!])(${PREFIJOS})-(${NOMBRES})(?=[/\\s"'\`\\])!]|$)`,
  'g',
);

export function traducir(texto) {
  return texto.replaceAll(
    EN_INGLES,
    (_, prefijo, nombre) => `${prefijo}-${TRADUCCION.get(nombre)}`,
  );
}
