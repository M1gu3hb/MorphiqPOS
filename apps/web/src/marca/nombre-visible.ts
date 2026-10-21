/**
 * LOS NOMBRES QUE VE UNA PERSONA · la marca de la plataforma y el nombre del negocio.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 * Lo que la interfaz imprime como «nombre del negocio» viene de la base
 * (`organizaciones.nombre`) o, cuando no hay nada, de un texto escrito en el código de
 * la plataforma anterior. Los dos dejaban pasar cosas que un cliente no debe leer:
 *
 *   · «Demo del acople · restaurante» — el nombre con que nace una demostración
 *     (`db:alta-negocio`). «Acople» es el nombre interno de la etapa en que se unieron
 *     el frontend y el backend; nadie fuera del equipo sabe qué es.
 *   · «MH Astral Systems» / «MH Astral POS» — la marca de plataforma ANTERIOR a Morphiq,
 *     escrita como valor por omisión en la configuración, los tickets y los PDFs.
 *
 * ── Qué hace, y qué NO ───────────────────────────────────────────────────
 * Es una función de PRESENTACIÓN. No renombra nada: ni el slug (`demo-acople-*`), ni la
 * fila de la base, ni un identificador. El dato sigue siendo el que es; sólo cambia lo que
 * se pinta. Cuando el dato se corrija en la base, estas funciones dejan de hacer algo y no
 * estorban: son un respaldo, no la solución.
 *
 * Son totales (nunca lanzan, aceptan `null`/`undefined`/lo que sea) e idempotentes
 * (aplicarlas dos veces da lo mismo que una), porque se llaman en el camino de pintado
 * de todas las pantallas y no pueden convertir un nombre raro en una pantalla en blanco.
 */

/** La marca de la plataforma, como se escribe en cualquier documento. */
export const MARCA_DE_PLATAFORMA = 'Morphiq';

/** El nombre del producto: lo que dice la pestaña del navegador y la pantalla de acceso. */
export const NOMBRE_DEL_SISTEMA = 'Morphiq POS';

/**
 * El prefijo con que nace una demostración: «Demo del acople», sola o seguida de su
 * separador («·», «-», «:»…). Va anclado al inicio y admite repetirse, para que quitarlo
 * dos veces dé lo mismo que quitarlo una.
 */
const PREFIJO_DE_DEMOSTRACION = /^(?:\s*demo\s+del\s+acople\b\s*(?:[·•|:–—-]\s*)?)+/i;

/**
 * La marca anterior de la plataforma en todas sus formas: «MH Astral Systems»,
 * «MH Astral POS», «MH-Astral-Systems», «POS MH Astral Systems». Se sustituye la marca y
 * se respeta lo demás de la frase, así «MH Astral POS» queda «Morphiq POS».
 *
 * El `\b` final evita comerse una palabra que sólo empiece igual.
 */
const MARCA_ANTERIOR = /\bMH[\s-]*Astral(?:[\s-]*Systems)?\b/gi;

/**
 * El nombre de CÓDIGO del producto —«MorphiqPOS», el del repositorio y el paquete— que el
 * documento del corte usa como marca cuando el negocio no escribió una. Para una persona el
 * producto se llama «Morphiq POS», con espacio.
 */
const NOMBRE_DE_CODIGO = /\bMorphiqPOS\b/g;

/** La marca propia en cualquiera de sus formas: «Morphiq», «Morphiq POS», «MorphiqPOS». */
const ES_LA_MARCA_PROPIA = /^morphiq(?:\s*pos)?$/i;

/**
 * Los cinco giros con que nacen las demostraciones, con su acento. El alta los escribió
 * sin él («cafeteria», «estetica») y un ticket que dice «Cafeteria» parece un descuido.
 * Es una tabla exacta: un nombre que no esté aquí no se toca.
 */
const GIRO_CON_ACENTO: Readonly<Record<string, string>> = {
  tienda: 'Tienda',
  cafeteria: 'Cafetería',
  restaurante: 'Restaurante',
  ferreteria: 'Ferretería',
  estetica: 'Estética',
};

function comoTexto(valor: unknown): string {
  return typeof valor === 'string' ? valor.replace(/\s+/g, ' ').trim() : '';
}

function conMayuscula(texto: string): string {
  const primera = texto.charAt(0);
  return primera === '' ? texto : primera.toLocaleUpperCase('es-MX') + texto.slice(1);
}

/** Cambia la marca anterior y el nombre de código por los de hoy, dentro de una frase. */
function sinLaMarcaAnterior(texto: string): string {
  return texto
    .replace(MARCA_ANTERIOR, MARCA_DE_PLATAFORMA)
    .replace(NOMBRE_DE_CODIGO, NOMBRE_DEL_SISTEMA);
}

/**
 * El nombre de un negocio como se imprime: sin el prefijo de demostración, sin la marca
 * anterior, y con mayúscula inicial si lo que quedó es el giro.
 *
 * Si no queda nada que mostrar —la base devolvió vacío, o sólo «Demo del acople»— cae a la
 * marca de la plataforma, que es lo que un documento sin nombre debe decir.
 */
export function nombreVisibleDelNegocio(nombre: unknown): string {
  const limpio = comoTexto(nombre);
  if (limpio === '') return MARCA_DE_PLATAFORMA;

  const sinPrefijo = limpio.replace(PREFIJO_DE_DEMOSTRACION, '').trim();
  if (sinPrefijo === '') return MARCA_DE_PLATAFORMA;

  // Un nombre que escribió una persona no se retoca: «iStore» no debe volverse «IStore».
  // La mayúscula y el acento sólo se arreglan cuando lo que queda es el resto del alta
  // automática («restaurante», «cafeteria»), que se escribió en minúscula y sin acento.
  if (sinPrefijo === limpio) return sinLaMarcaAnterior(limpio);

  const delGiro = GIRO_CON_ACENTO[sinPrefijo.toLocaleLowerCase('es-MX')];
  return delGiro ?? conMayuscula(sinLaMarcaAnterior(sinPrefijo));
}

/**
 * La marca de la plataforma que firma un documento («Morphiq»). Es un campo editable
 * (`platform_brand`): si el negocio escribió otra cosa, se respeta; sólo se corrige lo que
 * está vacío o lo que todavía dice la marca anterior.
 */
export function marcaVisibleDePlataforma(marca: unknown): string {
  const limpia = comoTexto(marca);
  if (limpia === '') return MARCA_DE_PLATAFORMA;
  const corregida = sinLaMarcaAnterior(limpia);
  return ES_LA_MARCA_PROPIA.test(corregida) ? MARCA_DE_PLATAFORMA : corregida;
}

/**
 * El nombre del sistema («Morphiq POS»), el de la pestaña y el pie de los documentos.
 * Mismo criterio que la marca: vacío o marca anterior se corrigen; lo escrito a mano se
 * respeta.
 */
export function nombreVisibleDelSistema(nombre: unknown): string {
  const limpio = comoTexto(nombre);
  if (limpio === '') return NOMBRE_DEL_SISTEMA;
  return sinLaMarcaAnterior(limpio);
}
