/**
 * QUITAR LA PROSA SIN QUEDARSE CIEGO · el ayudante que faltaba
 *
 * ── El defecto que lo trae ────────────────────────────────────────────────
 * Seis sitios de tres puertas quitaban los comentarios de bloque con
 * `/\/\*[\s\S]*?\*\//g` sobre el archivo entero. Ese patrón no distingue un comentario
 * de una CADENA que contiene sus delimitadores, y `accept="image/*"` —que está en siete
 * pantallas de este repositorio— abre uno: el buscador corre hasta el `*` + `/`
 * siguiente, que puede estar cientos de líneas más abajo, y todo lo de en medio
 * desaparece del análisis.
 *
 * Lo grave no es que la puerta se calle: es que **da verde sobre lo que no leyó**. En
 * `verificar-acople.mjs` eso escondía un `aria-label` con la palabra de otro giro y la
 * puerta informaba «0 rótulos»; en `verificar-primitivas.mjs` deja **5 141 caracteres**
 * de tres pantallas fuera de la regla del ritmo, de la de emoji y de la del token,
 * medidos el 2026-09-22.
 *
 * ── Lo que hace, y lo que NO hace ────────────────────────────────────────
 * Neutraliza los dos delimitadores DENTRO de una cadena entrecomillada, cambiando el
 * `*` por un espacio. **No mueve ni un carácter**: la longitud y los saltos de línea se
 * conservan, así que los números de línea que una puerta imprima siguen llevando a donde
 * está la cosa.
 *
 * No es un parser de JavaScript y no pretende serlo. No mira plantillas con acentos
 * graves —una cadena de plantilla puede cruzar líneas y ahí el riesgo de romper algo es
 * mayor que el que cubre— y no entiende una cadena partida en dos líneas con una barra
 * invertida. Los dos casos que faltan están declarados aquí en vez de aparentar que
 * están cubiertos; hoy, en este repositorio, no existe ninguno.
 */

/**
 * El mismo texto, con los `/` + `*` y `*` + `/` de dentro de una cadena desactivados.
 *
 * Se aplica ANTES de quitar los comentarios. Después, cualquier patrón de comentario
 * hace lo que dice.
 */
export function sinFalsosDelimitadores(texto) {
  return texto.replaceAll(/(["'])(?:\\.|(?!\1)[^\\\n])*\1/g, (cadena) =>
    cadena.replaceAll(/\/\*|\*\//g, (delimitador) => delimitador.replace('*', ' ')),
  );
}
