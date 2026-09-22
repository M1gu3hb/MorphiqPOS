'use client';

import type { ComponentProps, ReactElement } from 'react';
import { useEffect, useState } from 'react';

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

/** «42.9» → 4290 · «1,234.50» → 123450 · «» o «abc» → null. Nunca coma flotante. */
export function centavosDeTexto(texto: string): number | null {
  const limpio = texto.replaceAll(',', '').replace('$', '').trim();
  if (!/^\d+(\.\d{0,2})?$/.test(limpio)) return null;
  const [pesos = '0', centavos = ''] = limpio.split('.');
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
}

export function CampoDeDinero({
  centavos,
  alCambiar,
  className,
  ...resto
}: CampoDeDineroProps): ReactElement {
  const [texto, setTexto] = useState(() => textoParaCampo(centavos));

  // Si el importe cambia DESDE FUERA —un botón de efectivo rápido, «exacto»—, el texto
  // lo sigue. Si es el mismo importe que ya dice el texto («42.» y 4200), no se toca:
  // reescribirlo borraría el punto que alguien está tecleando.
  useEffect(() => {
    if (centavosDeTexto(texto) !== centavos) setTexto(textoParaCampo(centavos));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo reacciona al importe de fuera
  }, [centavos]);

  return (
    <div className={cn('relative', className)}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-(--espacio-3) -translate-y-1/2 text-sm text-texto-sutil"
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
        className="pl-(--espacio-6) text-right font-numeros tabular-nums"
      />
    </div>
  );
}
