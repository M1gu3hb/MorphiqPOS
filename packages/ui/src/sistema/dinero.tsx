import type { ReactElement } from 'react';

import { cn } from '../utilidades/cn';

/**
 * DINERO · el componente que más se mira en todo el sistema.
 *
 * ── Por qué merece un componente propio ───────────────────────────────────
 * Un POS enseña importes en cada pantalla y un cajero los lee de reojo, con prisa y
 * con gente esperando. Escribir `${(centavos / 100).toFixed(2)}` en cada sitio deja
 * tres cosas al azar, y las tres se notan:
 *
 *   1 · **Las cifras bailan.** Sin cifras tabulares, el `1` es más estrecho que el
 *       `8` y una columna de precios deja de estar alineada aunque lo esté. Una
 *       columna que baila es una columna que no se puede comparar de un vistazo.
 *   2 · **El símbolo pesa lo mismo que la cantidad.** El `$` no es información: es
 *       gramática. Va más pequeño para que el número mande.
 *   3 · **Los centavos compiten con los pesos.** En «$1,234.50» lo que se decide
 *       está en los pesos. Los centavos van un punto más pequeños: se leen si hacen
 *       falta y no roban el primer golpe de vista.
 *
 * ── Los negativos ──────────────────────────────────────────────────────────
 * En rojo Y entre paréntesis. El color no puede ser el único portador de
 * significado —hay quien no lo distingue, y hay pantallas de cocina con el brillo a
 * tope— así que el paréntesis dice lo mismo sin color. Es además la convención
 * contable que cualquiera que lleve una caja reconoce.
 *
 * ── El tamaño `total` ──────────────────────────────────────────────────────
 * La pantalla de cobro se usa de 150 a 400 veces al día y su jerarquía es: 1 el
 * total, 2 los métodos de pago, 3 el desglose. `total` es ese primer nivel, y por
 * eso es el único tamaño que usa la fuente de display con tracking cerrado.
 */

/** Cuánto pesa el importe en la jerarquía de su pantalla. */
export type TamanoDeDinero = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | 'total';

const TAMANOS: Readonly<Record<TamanoDeDinero, string>> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-xl font-medium',
  // La cifra de un TABLERO o de un resumen —«lo que me deben», «lo que debería haber»—:
  // grande sin ser el total del cobro, que en media tarjeta de teléfono no cabe.
  xl: 'text-3xl font-semibold tracking-tight',
  // El total domina la pantalla de cobro: es lo primero que se ve y lo único que
  // se lee desde el otro lado del mostrador. Va en el paso `display`, que es fluido
  // —de 40 a 64 px según la ventana— porque a esa distancia el tamaño que sobra en
  // un monitor de 13 pulgadas falta en la pantalla de una barra.
  total: 'text-display font-bold tracking-tight',
};

/**
 * El símbolo y los centavos, un escalón por debajo del cuerpo del número.
 *
 * SÓLO por tamaño. Iban además al 70 % y al 80 % de opacidad, y el rastreador en los
 * ocho estilos lo midió: dentro de un texto que ya es secundario —«IVA incluido» en
 * `text-texto-sutil`— el símbolo en el estilo `bloque` quedaba en 4.25:1, por debajo de
 * AA. La opacidad se MULTIPLICA con el color que el importe hereda, y el componente no
 * sabe qué color le va a tocar; el tamaño no depende de eso.
 */
const SECUNDARIO: Readonly<Record<TamanoDeDinero, string>> = {
  // A este tamano no se puede bajar otro escalon sin dejar de leerse, asi que el
  // simbolo y los centavos van igual que el cuerpo: a 12 px manda leerse, no la
  // jerarquia.
  xs: 'text-xs',
  sm: 'text-xs',
  base: 'text-sm',
  lg: 'text-base',
  xl: 'text-xl',
  total: 'text-2xl',
};

export interface DineroProps {
  /** SIEMPRE en centavos. El dinero en coma flotante pierde un centavo al año. */
  readonly centavos: number;
  readonly tamano?: TamanoDeDinero;
  /**
   * Para movimientos y diferencias, no para totales: los positivos llevan «+» Y van en
   * verde. El signo escrito es lo que dice «sobra» a quien no distingue el verde.
   */
  readonly conSigno?: boolean | undefined;
  /** Oculta el símbolo: para una columna cuya cabecera ya dice que es dinero. */
  readonly sinSimbolo?: boolean | undefined;
  readonly className?: string | undefined;
}

/** `123456` → `{ pesos: '1,234', centavos: '56' }`. */
function partir(centavos: number): { readonly pesos: string; readonly centavos: string } {
  const absoluto = Math.abs(Math.trunc(centavos));
  const pesos = Math.trunc(absoluto / 100);
  const resto = absoluto % 100;
  return {
    pesos: pesos.toLocaleString('es-MX'),
    centavos: String(resto).padStart(2, '0'),
  };
}

/**
 * EL MISMO IMPORTE, EN TEXTO · para donde no cabe un componente.
 *
 * Un `aria-label`, el texto que se copia al portapapeles, el mensaje de WhatsApp de un
 * fiado, la etiqueta de un eje de gráfica en SVG. Ahí no se puede poner `<Dinero>`, y
 * escribir otro formateador en la pantalla es exactamente como el sistema acaba con
 * tres formatos de dinero distintos.
 *
 * Da **carácter por carácter** lo que se lee en `<Dinero>` —su prueba lo compara—, y
 * `verify:adopcion` rechaza que se pinte como contenido: entre dos `<span>` el importe
 * es `<Dinero>`, con sus cifras tabulares y su jerarquía.
 */
export function dineroEnTexto(
  centavos: number,
  { sinSimbolo = false }: { readonly sinSimbolo?: boolean } = {},
): string {
  const partes = partir(centavos);
  const importe = `${sinSimbolo ? '' : '$'}${partes.pesos}.${partes.centavos}`;
  return centavos < 0 ? `(${importe})` : importe;
}

export function Dinero({
  centavos,
  tamano = 'base',
  conSigno = false,
  sinSimbolo = false,
  className,
}: DineroProps): ReactElement {
  const negativo = centavos < 0;
  const positivoConSigno = conSigno && centavos > 0;
  const partes = partir(centavos);
  const color = negativo ? 'text-peligro' : positivoConSigno ? 'text-exito' : '';

  return (
    <span
      /**
       * `tabular-nums` es la razón de ser de este componente: sin él, una columna de
       * importes no se puede comparar de un vistazo aunque esté alineada.
       *
       * ── Y por qué esto NO es un `inline-flex` ──────────────────────────
       * Lo fue, con `items-baseline` y `gap-px`, y **partía el número**. Los hijos de
       * un contenedor flex son elementos de BLOQUE, así que el texto que se extrae de
       * este nodo no era `$42.90`: eran `$`, `42` y `.90` separados. A un lector de
       * pantalla le llega bien —para eso está el `aria-label`— pero cualquier cosa
       * que lea el TEXTO ve un número roto: **copiar el total y pegarlo** daba
       * «$ 42 .90», y la prueba de cobro de la tienda leyó **$42.00** donde la
       * pantalla decía $42.90.
       *
       * En línea no hace falta flex para nada de lo que este componente quiere: el
       * contenido en línea se alinea a la línea base por sí solo —era lo único que
       * `items-baseline` estaba pidiendo— y el `$` y los centavos siguen un escalón
       * por debajo por tamaño, que es donde vive la jerarquía.
       */
      className={cn(
        'font-numeros tabular-nums whitespace-nowrap',
        TAMANOS[tamano],
        color,
        className,
      )}
      // Lo que lee un lector de pantalla: el importe entero, sin paréntesis ni
      // símbolos sueltos que se deletreen.
      aria-label={`${negativo ? 'menos ' : positivoConSigno ? 'más ' : ''}${partes.pesos} pesos con ${partes.centavos} centavos`}
      // Para que una prueba de navegador encuentre TODOS los importes de una pantalla y
      // compare lo que se lee con lo que dice el `aria-label`.
      data-dinero=""
    >
      {negativo ? <span aria-hidden="true">(</span> : null}
      {positivoConSigno ? <span aria-hidden="true">+</span> : null}
      {sinSimbolo ? null : (
        <span aria-hidden="true" className={SECUNDARIO[tamano]}>
          $
        </span>
      )}
      <span aria-hidden="true">{partes.pesos}</span>
      <span aria-hidden="true" className={SECUNDARIO[tamano]}>
        .{partes.centavos}
      </span>
      {negativo ? <span aria-hidden="true">)</span> : null}
    </span>
  );
}

/**
 * UNA CIFRA QUE NO ES DINERO: existencias, piezas, minutos.
 *
 * Existe por lo mismo que `Dinero` —cifras tabulares— y separada por lo contrario:
 * poner un `$` donde hay kilos es peor que no poner nada. La unidad va detrás, en
 * pequeño, porque «12 kg» se lee como una cosa y «12» seguido de «kg» a igual peso
 * se lee como dos.
 */
export function Cifra({
  valor,
  unidad,
  decimales = 'auto',
  conSigno = false,
  tamano = 'base',
  className,
}: {
  /**
   * `null` o `undefined` pintan «—». El puente sirve `null` para lo que no tiene fila
   * todavía —los sellos de un cliente sin movimientos, los minutos de una fórmula sin
   * procesado—, y `valor.toLocaleString()` sobre un nulo tiraba la pantalla entera.
   */
  readonly valor: number | null | undefined;
  readonly unidad?: string | undefined;
  /**
   * `'auto'` —por omisión—: los decimales que el valor TIENE, hasta dos, y ninguno si es
   * entero. Con cero fijo, «12.5 m» de cable se leía «13 m». Un número fija la cantidad.
   */
  readonly decimales?: number | 'auto' | undefined;
  /** «+3» y «-3»: el sentido de una diferencia escrito, no sólo coloreado. */
  readonly conSigno?: boolean | undefined;
  readonly tamano?: TamanoDeDinero | undefined;
  readonly className?: string | undefined;
}): ReactElement {
  const hayValor = typeof valor === 'number' && Number.isFinite(valor);
  const texto = hayValor
    ? valor.toLocaleString('es-MX', {
        minimumFractionDigits: decimales === 'auto' ? 0 : decimales,
        maximumFractionDigits: decimales === 'auto' ? 2 : decimales,
      })
    : '—';
  const signo = hayValor && conSigno && valor > 0 ? '+' : '';
  /**
   * EN LÍNEA, y con un ESPACIO de verdad entre el valor y la unidad.
   *
   * Era `inline-flex items-baseline gap-1` —el mismo patrón que partió el importe de
   * `Dinero`—: los hijos de un flex son bloques, así que lo que se leía era `12` y
   * `kg` en renglones distintos, y el `gap` ponía el aire que el texto no tenía:
   * copiado, «12 kg» salía «12kg». El espacio va en el TEXTO, que es donde se lee.
   */
  return (
    <span className={cn('font-numeros tabular-nums whitespace-nowrap', TAMANOS[tamano], className)}>
      {signo}
      {texto}
      {unidad === undefined ? null : (
        <>
          {' '}
          <span className={cn('text-texto-sutil', SECUNDARIO[tamano])}>{unidad}</span>
        </>
      )}
    </span>
  );
}
