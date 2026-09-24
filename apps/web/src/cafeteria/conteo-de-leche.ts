/**
 * EL CONTEO DE LECHE, VALIDADO DONDE SE TECLEA.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * El campo de «cartones cerrados» es texto libre —`inputMode="numeric"` es una pista
 * para el teclado del teléfono, no una validación— y la pantalla mandaba
 * `Number(texto)` tal cual. Con una letra suelta eso es `NaN`, con `12.5` no es
 * entero y con `999` se pasa del tope: las tres cosas las rechaza el comando con un
 * **400 `ENTRADA_INVALIDA`**, y lo único que el barista veía era la banda de error
 * genérica, sin saber QUÉ campo estaba mal.
 *
 * El rastreador lo cazó en CI —`400 /api/cafeteria/contar-leche`— después de teclear
 * datos de sonda en ese campo. Y tardó tres corridas en decir de dónde salía, porque
 * la puerta de la consola hablaba antes que la de red; eso también se arregló.
 *
 * ── Lo que esto NO es ──────────────────────────────────────────────────────
 * No sustituye la validación del servidor: el navegador no es de fiar y el comando
 * sigue siendo la frontera. Esto es lo otro que hace falta —fallar pronto y decir
 * cuál campo—, que es exactamente lo que `coding-style` pide en los límites.
 *
 * Los topes son los del contrato de `entradaContarLeche`, y si allí cambian, aquí
 * fallan las pruebas.
 */

/** El tope de `cartonesCerrados` en `entradaContarLeche`. */
export const TOPE_DE_CARTONES = 200;

/** Los cuartos que el desplegable ofrece, y los únicos que el comando acepta. */
export type CuartosDelAbierto = 0 | 1 | 2 | 3 | 4;

export interface ConteoTecleado {
  readonly cerrados: string;
  readonly cuartos: CuartosDelAbierto;
}

/**
 * El número de cartones que ese texto significa, o `null` si no significa ninguno.
 *
 * Vacío es CERO a propósito: un refrigerador sin cartones cerrados es un conteo
 * válido, y obligar a teclear un 0 en cada leche para poder confirmar sería peor.
 * Lo que no pasa: espacios con letras, decimales, negativos y cualquier cosa por
 * encima del tope.
 */
export function cartonesDe(texto: string): number | null {
  const limpio = texto.trim();
  if (limpio === '') return 0;
  if (!/^\d+$/.test(limpio)) return null;
  const valor = Number(limpio);
  if (!Number.isSafeInteger(valor) || valor > TOPE_DE_CARTONES) return null;
  return valor;
}

/**
 * SÓLO SE CUENTA POR CARTONES LO QUE SE MIDE EN MILILITROS.
 *
 * ── El 400 que el rastreador cazó tres veces ──────────────────────────────
 * La pantalla agrupa los insumos por familia con pistas en el nombre, y la familia
 * «Leche» incluye la pista `crema`. En la demostración de la cafetería eso mete
 * **«Bagel integral con queso crema»** —`unidad_base` = `pieza`— entre las leches, y
 * el diálogo ofrece contarlo POR CARTONES. El comando hace lo correcto y lo rechaza:
 * `CONFIGURACION_INVALIDA · «Bagel …» no se mide en mililitros`, que sale como **400**.
 *
 * No es un artefacto del rastreador: le pasa a un barista **cada vez que abre el
 * conteo**, con los campos vacíos y sin teclear nada. Por eso esta regla vive aquí, al
 * lado de la validación, y no en un `if` dentro del render: es la MISMA regla que el
 * comando aplica, y tenerla en dos sitios con dos formas distintas es cómo una se
 * queda atrás.
 */
export function seCuentaPorCartones(unidadBase: string | null | undefined): boolean {
  return unidadBase === 'ml';
}

export interface LecheQueSeCuenta {
  readonly id: string;
  readonly nombre: string;
}

/**
 * La primera leche cuyo conteo el comando rechazaría, con su nombre para decirlo.
 *
 * Se devuelve LA PRIMERA y no todas porque el diálogo enfoca un campo, y el nombre
 * es lo que permite escribir «Leche entera: los cartones cerrados…» en vez de
 * «entrada inválida».
 */
export function primeraLecheInvalida(
  leches: readonly LecheQueSeCuenta[],
  conteos: Readonly<Record<string, ConteoTecleado>>,
): LecheQueSeCuenta | null {
  for (const leche of leches) {
    if (cartonesDe(conteos[leche.id]?.cerrados ?? '') === null) return leche;
  }
  return null;
}

/**
 * El aviso que se le enseña a quien está contando.
 *
 * Dice el nombre de la leche, el rango y qué se acepta. Un mensaje que no dice el
 * rango obliga a adivinarlo tecleando.
 */
export function avisoDeConteoInvalido(leche: LecheQueSeCuenta): string {
  return (
    `${leche.nombre}: los cartones cerrados van en números enteros, de 0 a ` +
    `${String(TOPE_DE_CARTONES)}. Lo que queda del cartón abierto se elige al lado, en cuartos.`
  );
}
