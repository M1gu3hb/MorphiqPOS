import { ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-148 · El código de barras que lleva el peso o el importe dentro.
 *
 * ── Qué es y por qué importa aquí ─────────────────────────────────────────
 * Las básculas de etiqueta de mostrador —el jamón, el queso, la fruta ya
 * empaquetada— no imprimen el código del fabricante: generan un EAN-13 que
 * empieza por 2 y lleva DENTRO el código del artículo y el peso o el importe.
 * Es el estándar de facto del granel empaquetado en México, y hoy
 * `barcodeUtils.js` sólo valida la longitud y no interpreta nada: el jamón se
 * teclea, que es exactamente donde nacen los errores de dedo que descuadran el
 * inventario.
 *
 * ── Por qué NO es lo mismo que la báscula conectada (F-983) ───────────────
 * Son caminos alternativos, no una dependencia. F-148 es para producto YA
 * pesado y etiquetado en el departamento; F-983 es para pesar en el momento
 * frente al cliente. Una tiendita usa el primero y casi nunca el segundo.
 *
 * ── Por qué el prefijo es configurable ────────────────────────────────────
 * El rango 20–29 está reservado por GS1 para uso interno de la tienda, y cada
 * marca de báscula reparte esos dígitos a su manera: unas ponen el peso, otras
 * el importe, y el largo del código de artículo cambia entre modelos. Fijarlo a
 * un layout haría que el sistema funcionara con la báscula de una tienda y
 * fallara en silencio —leyendo un precio como si fuera otro producto— en la de
 * al lado. Se declara por negocio.
 */

export type ContenidoEmbebido = 'peso' | 'importe';

export interface LayoutEanInterno {
  /**
   * El o los prefijos que marcan un código interno. `['2']` cubre todo el rango
   * 20–29; `['21', '22']` distingue dos layouts en la misma tienda.
   */
  readonly prefijos: readonly string[];
  /** Cuántos dígitos, después del prefijo, son el código del artículo. */
  readonly digitosArticulo: number;
  /** Cuántos dígitos son el valor embebido. */
  readonly digitosValor: number;
  readonly contenido: ContenidoEmbebido;
  /**
   * Cuántos decimales lleva el valor. Peso en kilos con tres decimales
   * (`01234` = 1.234 kg) o importe en pesos con dos (`01234` = $12.34).
   */
  readonly decimales: number;
  /**
   * Si la báscula mete su propio dígito verificador ENTRE el artículo y el
   * valor. Varias Torrey y Rhino lo hacen y ocupa un dígito que si no se
   * descuenta desplaza el importe entero.
   */
  readonly verificadorInterno: boolean;
}

export interface CodigoInterpretado {
  /** El código del artículo tal como lo guarda el catálogo interno. */
  readonly codigoArticulo: string;
  readonly contenido: ContenidoEmbebido;
  /** Peso en unidades base o importe en pesos, con sus decimales. `'1.234'`. */
  readonly valor: string;
  /** El importe en centavos, sólo cuando el contenido es un importe. */
  readonly importeCentavos: bigint | null;
}

const LARGO_EAN13 = 13;

/**
 * ¿Este código lo generó la báscula de la tienda, o viene de fábrica?
 *
 * Se mira ANTES de interpretar, porque un código de fábrica que empiece por 2
 * —los hay, en producto importado— tiene que seguir buscándose en el catálogo
 * tal cual. Confundirlos vendería una cosa por otra.
 */
export function esCodigoInterno(codigo: string, layout: LayoutEanInterno): boolean {
  const limpio = codigo.trim();
  if (limpio.length !== LARGO_EAN13 || !/^\d{13}$/.test(limpio)) return false;
  return layout.prefijos.some((prefijo) => limpio.startsWith(prefijo));
}

/**
 * Saca el artículo y el peso o el importe de un EAN-13 interno.
 *
 * ── Por qué se verifica el dígito de control ──────────────────────────────
 * Porque un escáner que lee mal un dígito de un código normal no encuentra
 * producto y no pasa nada; leyendo mal uno de estos, encuentra OTRO artículo o
 * cobra OTRO importe, y la venta se cierra sin que nada falle. El dígito de
 * control es lo único que separa las dos cosas.
 */
export function interpretarCodigoInterno(
  codigo: string,
  layout: LayoutEanInterno,
): CodigoInterpretado {
  const limpio = codigo.trim();

  if (!esCodigoInterno(limpio, layout)) {
    throw new ErrorDominio(
      'CATALOGO_INVALIDO',
      'Ese código no es de los que genera la báscula de la tienda.',
      { codigo: limpio },
    );
  }

  if (!digitoDeControlValido(limpio)) {
    throw new ErrorDominio(
      'CATALOGO_INVALIDO',
      'Ese código viene mal leído: el dígito de control no cuadra.',
      { codigo: limpio },
    );
  }

  const prefijo = layout.prefijos.find((p) => limpio.startsWith(p)) ?? '';
  const inicioArticulo = prefijo.length;
  const finArticulo = inicioArticulo + layout.digitosArticulo;
  const inicioValor = finArticulo + (layout.verificadorInterno ? 1 : 0);
  const finValor = inicioValor + layout.digitosValor;

  // El dígito de control del EAN ocupa la última posición y no es parte del
  // valor. Un layout que se pase de ahí leería el control como el último dígito
  // del importe, y el precio saldría multiplicado por diez.
  if (finValor !== LARGO_EAN13 - 1) {
    throw new ErrorDominio(
      'CATALOGO_INVALIDO',
      'Ese layout de báscula no cabe en trece dígitos: revisa cuántos son de artículo y cuántos de valor.',
      { digitosArticulo: layout.digitosArticulo, digitosValor: layout.digitosValor },
    );
  }

  const codigoArticulo = limpio.slice(inicioArticulo, finArticulo);
  const crudo = limpio.slice(inicioValor, finValor);
  const valor = conDecimales(crudo, layout.decimales);

  return {
    codigoArticulo,
    contenido: layout.contenido,
    valor,
    importeCentavos: layout.contenido === 'importe' ? aCentavos(crudo, layout.decimales) : null,
  };
}

/** `'01234'` con 3 decimales → `'1.234'`. Sin pasar por `Number`, como siempre. */
function conDecimales(crudo: string, decimales: number): string {
  if (decimales === 0) return String(BigInt(crudo));
  const acolchado = crudo.padStart(decimales + 1, '0');
  const corte = acolchado.length - decimales;
  return `${String(BigInt(acolchado.slice(0, corte)))}.${acolchado.slice(corte)}`;
}

/**
 * El importe en centavos.
 *
 * Una báscula con tres decimales de importe existe —es rara y la hay— y
 * truncar el tercero cobraría de menos sistemáticamente. Se rechaza en vez de
 * redondear: un importe que no cabe en centavos es un layout mal declarado, no
 * un caso a resolver a la brava en cada venta.
 */
function aCentavos(crudo: string, decimales: number): bigint {
  if (decimales > 2) {
    throw new ErrorDominio(
      'CATALOGO_INVALIDO',
      'Un importe embebido con más de dos decimales no cabe en centavos.',
      { decimales },
    );
  }
  return BigInt(crudo) * 10n ** BigInt(2 - decimales);
}

/**
 * El dígito de control del EAN-13: suma alterna por 1 y por 3, complemento a 10.
 *
 * Es la misma fórmula del GTIN y vale para el código de fábrica y para el
 * interno; la báscula la calcula igual.
 */
export function digitoDeControlValido(codigo: string): boolean {
  if (!/^\d{13}$/.test(codigo)) return false;

  let suma = 0;
  for (let i = 0; i < 12; i += 1) {
    const digito = codigo.charCodeAt(i) - 48;
    suma += i % 2 === 0 ? digito : digito * 3;
  }
  const control = (10 - (suma % 10)) % 10;
  return control === codigo.charCodeAt(12) - 48;
}
