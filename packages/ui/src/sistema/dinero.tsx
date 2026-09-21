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
 *       gramática. Va más pequeño y más tenue para que el número mande.
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
export type TamanoDeDinero = 'xs' | 'sm' | 'base' | 'lg' | 'total';

const TAMANOS: Readonly<Record<TamanoDeDinero, string>> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-xl font-medium',
  // El total domina la pantalla de cobro: es lo primero que se ve y lo único que
  // se lee desde el otro lado del mostrador.
  total: 'text-3xl font-bold tracking-tight',
};

/** El símbolo y los centavos, un escalón por debajo del cuerpo del número. */
const SECUNDARIO: Readonly<Record<TamanoDeDinero, string>> = {
  // A este tamano no se puede bajar otro escalon sin dejar de leerse, asi que el
  // simbolo y los centavos van igual que el cuerpo y lo que los separa es la opacidad.
  xs: 'text-xs',
  sm: 'text-xs',
  base: 'text-sm',
  lg: 'text-base',
  total: 'text-xl',
};

export interface DineroProps {
  /** SIEMPRE en centavos. El dinero en coma flotante pierde un centavo al año. */
  readonly centavos: number;
  readonly tamano?: TamanoDeDinero;
  /** Pinta los positivos en verde. Para movimientos, no para totales. */
  readonly conSigno?: boolean;
  /** Oculta el símbolo: para una columna cuya cabecera ya dice que es dinero. */
  readonly sinSimbolo?: boolean;
  readonly className?: string;
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

export function Dinero({
  centavos,
  tamano = 'base',
  conSigno = false,
  sinSimbolo = false,
  className,
}: DineroProps): ReactElement {
  const negativo = centavos < 0;
  const partes = partir(centavos);
  const color = negativo ? 'text-destructive' : conSigno && centavos > 0 ? 'text-success' : '';

  return (
    <span
      // `tabular-nums` es la razón de ser de este componente: sin él, una columna
      // de importes no se puede comparar de un vistazo aunque esté alineada.
      className={cn(
        'inline-flex items-baseline gap-px font-numeros tabular-nums whitespace-nowrap',
        TAMANOS[tamano],
        color,
        className,
      )}
      // Lo que lee un lector de pantalla: el importe entero, sin paréntesis ni
      // símbolos sueltos que se deletreen.
      aria-label={`${negativo ? 'menos ' : ''}${partes.pesos} pesos con ${partes.centavos} centavos`}
    >
      {negativo ? <span aria-hidden="true">(</span> : null}
      {sinSimbolo ? null : (
        <span aria-hidden="true" className={cn('opacity-70', SECUNDARIO[tamano])}>
          $
        </span>
      )}
      <span aria-hidden="true">{partes.pesos}</span>
      <span aria-hidden="true" className={cn('opacity-80', SECUNDARIO[tamano])}>
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
  decimales = 0,
  tamano = 'base',
  className,
}: {
  readonly valor: number;
  readonly unidad?: string;
  readonly decimales?: number;
  readonly tamano?: TamanoDeDinero;
  readonly className?: string;
}): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1 font-numeros tabular-nums whitespace-nowrap',
        TAMANOS[tamano],
        className,
      )}
    >
      <span>
        {valor.toLocaleString('es-MX', {
          minimumFractionDigits: decimales,
          maximumFractionDigits: decimales,
        })}
      </span>
      {unidad === undefined ? null : (
        <span className={cn('text-muted-foreground', SECUNDARIO[tamano])}>{unidad}</span>
      )}
    </span>
  );
}
