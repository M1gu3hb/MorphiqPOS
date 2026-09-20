/**
 * F-986 y F-029 · El lector de código de barras, que es un TECLADO.
 *
 * ── Ésta es la función que define el modelo de abarrotes ─────────────────
 * Entre el 60 % y el 90 % de las líneas de venta entran por aquí. Si sale mal,
 * no hay producto: el tendero teclea a mano un dato que está impreso en la
 * bolsa, y a la tercera vez deja de usar el sistema en hora pico.
 *
 * ── Por qué NO es un `<input>` ───────────────────────────────────────────
 * Porque el foco se pierde. El cajero toca un botón, abre un diálogo, contesta
 * el teléfono — y el siguiente código se escribe en cualquier sitio o en
 * ninguno. El capturador escucha en `document` y funciona aunque nadie haya
 * hecho clic en un campo. Perder el foco en hora pico es perder la venta.
 *
 * ── Cómo se distingue del humano: por TIEMPO ENTRE TECLAS ────────────────
 * El lector USB teclea la ristra a una velocidad que ninguna persona alcanza.
 * La regla es: ocho caracteres o más, con menos de ~35 ms entre ellos, y un
 * `Enter` al final. No hay heurística de contenido, y es a propósito: un código
 * con letras —los hay— y uno de báscula con prefijo 2x tienen formas distintas,
 * y filtrar por forma es cómo se pierde justo el que importa.
 *
 * ── Y SIN «cooldown», ni entre códigos distintos ni entre repeticiones ───
 * El componente de cámara del sistema heredado espera 1 500 ms entre lecturas,
 * y para una cámara está bien: evita leer tres veces la misma etiqueta. Aquí es
 * inaceptable — hace imposible pasar seis refrescos iguales seguidos. Seis
 * refrescos son seis lecturas y `×6` en la línea, no un producto ignorado cinco
 * veces.
 */

/** Lo que separa al lector de una persona tecleando rápido. */
export const MAXIMO_MS_ENTRE_TECLAS = 35;

/** Por debajo de esto no es un código: es alguien buscando un atajo. */
export const MINIMO_DE_CARACTERES = 8;

/** Lo que el capturador acumula entre `Enter` y `Enter`. */
export interface EstadoDelLector {
  readonly buffer: string;
  /** Instante de la última tecla, en ms. `null` cuando no hay nada empezado. */
  readonly ultimaTecla: number | null;
}

export type Resultado =
  /** No pasó nada que la pantalla tenga que atender. */
  | { readonly tipo: 'sigue'; readonly estado: EstadoDelLector }
  /** Una ristra completa y veloz: es un código. */
  | { readonly tipo: 'codigo'; readonly codigo: string; readonly estado: EstadoDelLector }
  /**
   * Terminó en `Enter` pero NO era del lector. La pantalla no debe tratarlo
   * como código —sería buscar «3» cada vez que alguien pulsa Intro— y sí debe
   * saberlo, porque el foco puede estar en un campo de búsqueda manual.
   */
  | { readonly tipo: 'humano'; readonly texto: string; readonly estado: EstadoDelLector };

export const ESTADO_INICIAL: EstadoDelLector = { buffer: '', ultimaTecla: null };

/**
 * Normaliza un código antes de compararlo.
 *
 * Quita todo lo que no sea dígito o letra y sube a mayúsculas. El lector a
 * veces manda un retorno de carro suelto, y un espacio invisible al final es lo
 * que hace que un producto que SÍ está en el catálogo salga como no encontrado.
 */
export function normalizarCodigo(bruto: string): string {
  return bruto.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

/** Dos códigos son el mismo si lo son ya normalizados. */
export function mismoCodigo(a: string, b: string): boolean {
  const izquierda = normalizarCodigo(a);
  return izquierda.length > 0 && izquierda === normalizarCodigo(b);
}

/**
 * ¿Tiene forma de código de barras?
 *
 * Deliberadamente permisivo: sólo longitud y alfabeto. Los EAN-13 de báscula
 * con prefijo `2` traen peso dentro, los códigos internos de una tienda pueden
 * llevar letras, y validar el dígito verificador aquí haría que un código
 * legítimo mal impreso se descartara en silencio — que es peor que buscarlo y
 * no encontrarlo, porque al menos eso abre el alta rápida.
 */
export function pareceCodigo(bruto: string): boolean {
  const limpio = normalizarCodigo(bruto);
  return limpio.length >= MINIMO_DE_CARACTERES && limpio.length <= 48;
}

/**
 * Un pulsación de tecla, y lo que el capturador decide con ella.
 *
 * `ahora` entra como parámetro y no se lee del reloj: es lo que hace que esto
 * se pueda probar con números y sin temporizadores falsos, y lo que permite
 * afirmar cosas sobre milisegundos sin que la prueba sea intermitente.
 */
export function pulsar(estado: EstadoDelLector, tecla: string, ahora: number): Resultado {
  if (tecla === 'Enter') {
    const texto = estado.buffer;
    const limpio = ESTADO_INICIAL;
    if (pareceCodigo(texto)) {
      return { tipo: 'codigo', codigo: normalizarCodigo(texto), estado: limpio };
    }
    // Un `Enter` sin ristra detrás es alguien confirmando un diálogo, y no
    // puede convertirse en una búsqueda de catálogo.
    return texto.length === 0
      ? { tipo: 'sigue', estado: limpio }
      : { tipo: 'humano', texto, estado: limpio };
  }

  // Sólo cuentan los caracteres imprimibles de uno en uno: `Shift`, `Tab` y las
  // flechas no forman parte de la ristra y tampoco la rompen.
  if (tecla.length !== 1) return { tipo: 'sigue', estado };

  const lento = estado.ultimaTecla !== null && ahora - estado.ultimaTecla > MAXIMO_MS_ENTRE_TECLAS;

  // Si la tecla llegó tarde, lo de antes era de una persona: se empieza de
  // nuevo. Sin esto, teclear «12» a mano y después escanear daría «12» pegado
  // al código y el producto no se encontraría.
  const buffer = lento ? tecla : estado.buffer + tecla;
  return { tipo: 'sigue', estado: { buffer, ultimaTecla: ahora } };
}
