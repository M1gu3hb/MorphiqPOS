'use client';

import type { ComponentProps, ReactElement } from 'react';
import { useState } from 'react';

import { Input } from '../primitivas/input';
import { cn } from '../utilidades/cn';

/**
 * EL CAMPO DONDE SE TECLEA DINERO · lo recibido, el fondo, un precio.
 *
 * Cada pantalla lo resolvía a mano: un `<Input>` con su estado en texto, un
 * `parseFloat` en un sitio, un `(centavos / 100).toFixed(2)` para rellenarlo en otro,
 * y el `$` puesto o no según el día. Tres formas de convertir entre pesos y centavos
 * son tres formas de perder un centavo.
 *
 * Aquí la pantalla habla SÓLO en centavos —`centavos` entra, `alCambiar` sale— y el
 * texto lo lleva el campo. Lo que no es un importe válido sale como `null`, y la
 * pantalla decide qué hacer con él; el campo no redondea ni adivina.
 */

/** Cifras sueltas, o agrupadas de tres en tres con coma: «1234» o «1,234». */
const PESOS = String.raw`(?:\d+|\d{1,3}(?:,\d{3})+)`;
/** Con punto decimal; la coma, si la hay, sólo separa miles. */
const CON_PUNTO = new RegExp(String.raw`^(${PESOS})(?:\.(\d{0,2}))?$`);
/** Sin punto, UNA coma con una o dos cifras detrás es el decimal: «12,50». */
const CON_COMA_DECIMAL = /^(\d+),(\d{1,2})$/;

/**
 * «42.9» → 4290 · «1,234.50» → 123450 · «12,50» → 1250 · «» o «abc» → null.
 * Nunca coma flotante.
 *
 * La coma NO se quita a ciegas: «12,50» —doce cincuenta, como lo teclea quien viene de
 * otra calculadora— se leía como $1,250.00, cien veces el importe. Una coma seguida de
 * grupos de tres cifras es de miles; una sola, con una o dos cifras detrás y sin punto,
 * es el decimal; cualquier otra forma no es un importe.
 */
export function centavosDeTexto(texto: string): number | null {
  const limpio = texto.replace('$', '').trim();
  const decimal = CON_COMA_DECIMAL.exec(limpio);
  const partes = decimal ?? CON_PUNTO.exec(limpio);
  if (partes === null) return null;
  const pesos = (partes[1] ?? '0').replaceAll(',', '');
  const centavos = partes[2] ?? '';
  return Number(pesos) * 100 + Number(centavos.padEnd(2, '0'));
}

/**
 * 4290 → «42.90», para el VALOR de un campo. No es para pintar: entre dos `<span>`
 * el importe es `<Dinero>`, y `verify:adopcion` lo rechaza como contenido.
 */
export function textoParaCampo(centavos: number | null): string {
  if (centavos === null) return '';
  const absoluto = Math.abs(Math.trunc(centavos));
  const texto = `${String(Math.trunc(absoluto / 100))}.${String(absoluto % 100).padStart(2, '0')}`;
  return centavos < 0 ? `-${texto}` : texto;
}

export interface CampoDeDineroProps extends Omit<
  ComponentProps<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'type'
> {
  readonly centavos: number | null;
  readonly alCambiar: (centavos: number | null) => void;
  /**
   * `grande` para el importe que ES la pantalla —el fondo con el que se abre, lo que
   * se contó en el cajón—: más alto y con cifras más grandes, porque se teclea en la
   * tableta de pie y se relee antes de mandarlo.
   */
  readonly tamano?: 'base' | 'grande';
}

const TAMANO_DEL_CAMPO = {
  base: { simbolo: 'text-sm', campo: 'pl-(--espacio-6)' },
  grande: {
    simbolo: 'text-base',
    campo: 'h-[calc(var(--altura-control)*1.4)] pl-(--espacio-8) text-lg md:text-lg',
  },
} as const;

export function CampoDeDinero({
  centavos,
  alCambiar,
  tamano = 'base',
  className,
  ...resto
}: CampoDeDineroProps): ReactElement {
  const [texto, setTexto] = useState(() => textoParaCampo(centavos));
  const [ultimoDeFuera, setUltimoDeFuera] = useState(centavos);

  // Si el importe cambia DESDE FUERA —un botón de efectivo rápido, «exacto»—, el texto
  // lo sigue. Si es el mismo importe que ya dice el texto («42.» y 4200), no se toca:
  // reescribirlo borraría el punto que alguien está tecleando. Se ajusta DURANTE el
  // pintado y no en un efecto: un efecto pintaría primero el texto viejo y después el
  // nuevo, dos pasadas por un solo cambio.
  if (centavos !== ultimoDeFuera) {
    setUltimoDeFuera(centavos);
    if (centavosDeTexto(texto) !== centavos) setTexto(textoParaCampo(centavos));
  }

  return (
    <div className={cn('relative', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-1/2 left-(--espacio-3) -translate-y-1/2 text-texto-sutil',
          TAMANO_DEL_CAMPO[tamano].simbolo,
        )}
      >
        $
      </span>
      <Input
        {...resto}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={texto}
        onChange={(evento) => {
          setTexto(evento.target.value);
          alCambiar(centavosDeTexto(evento.target.value));
        }}
        className={cn('text-right font-numeros tabular-nums', TAMANO_DEL_CAMPO[tamano].campo)}
      />
    </div>
  );
}
