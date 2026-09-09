'use client';

import { useMemo } from 'react';

import { ALTO_CONTROL } from './controles';
import { aCentavos, CLASE_IMPORTE, pesos } from './dinero';

/**
 * Pago dividido: varias formas para una sola venta (F1.1-C-11).
 *
 * Corrige P1-11 en la pantalla. `repartirPagos` acepta hasta cinco renglones
 * desde hace tiempo y el diálogo mandaba uno solo, así que «la mitad con
 * tarjeta y la mitad en efectivo» acababa registrado como todo efectivo y el
 * arqueo pedía billetes que nunca entraron.
 *
 * ── Las dos decisiones que hacen que esto se pueda usar con prisa ──────────
 * 1 · **El último renglón lleva el resto.** Se teclea sólo lo que el cliente da
 *     con la primera forma; lo que falta se rellena solo. Teclear las dos
 *     cifras es la manera de que no cuadren por un centavo.
 * 2 · **El botón no se habilita hasta que la suma es exacta.** El servidor
 *     rechaza igual —ahí está la garantía—, pero descubrirlo con el cliente
 *     enfrente es tarde.
 */

export type Metodo = 'efectivo' | 'tarjeta' | 'transferencia';

export interface Renglon {
  readonly metodo: Metodo;
  /** Lo que el cajero teclea. Vacío en el renglón que absorbe el resto. */
  readonly importe: string;
}

export interface PagoListo {
  readonly metodo: Metodo;
  readonly montoCentavos: number;
  readonly recibidoCentavos?: number;
}

const METODOS: readonly Metodo[] = ['efectivo', 'tarjeta', 'transferencia'];
const MAXIMO = 5;

/** Los renglones con los que empieza un pago dividido. */
export const RENGLONES_INICIALES: readonly Renglon[] = [
  { metodo: 'tarjeta', importe: '' },
  { metodo: 'efectivo', importe: '' },
];

interface Props {
  readonly totalCentavos: bigint;
  readonly renglones: readonly Renglon[];
  readonly onRenglones: (renglones: readonly Renglon[]) => void;
}

/**
 * Componente controlado: el estado vive en el diálogo.
 *
 * Se intentó al revés —estado aquí y aviso al padre— y salía mal: para que el
 * botón de cobrar reaccionara en el mismo render había que llamar al padre
 * DURANTE el render, que es justo lo que React prohíbe. Con el estado arriba,
 * los pagos se derivan y no hay nada que sincronizar.
 */
export function RenglonesDePago({ totalCentavos, renglones, onRenglones }: Props) {
  const { cubierto, falta } = useMemo(
    () => repartir(renglones, totalCentavos),
    [renglones, totalCentavos],
  );

  function cambiar(i: number, cambio: Partial<Renglon>) {
    onRenglones(renglones.map((r, j) => (i === j ? { ...r, ...cambio } : r)));
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {renglones.map((r, i) => (
          <li key={`${String(i)}-${r.metodo}`} className="flex items-center gap-2">
            <select
              value={r.metodo}
              aria-label={`Forma de pago ${String(i + 1)}`}
              onChange={(e) => {
                cambiar(i, { metodo: e.target.value as Metodo });
              }}
              className={`${ALTO_CONTROL} flex-1 rounded-md border border-borde bg-fondo px-3 text-sm capitalize text-texto focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
            >
              {METODOS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <input
              inputMode="decimal"
              value={r.importe}
              aria-label={`Importe ${String(i + 1)}`}
              onChange={(e) => {
                cambiar(i, { importe: e.target.value });
              }}
              placeholder={i === renglones.length - 1 ? 'el resto' : '0.00'}
              className={`${ALTO_CONTROL} w-32 rounded-md border border-borde bg-fondo px-3 text-right text-texto ${CLASE_IMPORTE} focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
            />

            {renglones.length > 2 && (
              <button
                type="button"
                aria-label={`Quitar la forma de pago ${String(i + 1)}`}
                onClick={() => {
                  onRenglones(renglones.filter((_, j) => j !== i));
                }}
                className={`${ALTO_CONTROL} aspect-square shrink-0 rounded-md text-texto-tenue transition-colors hover:bg-peligro/10 hover:text-peligro focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      {renglones.length < MAXIMO && (
        <button
          type="button"
          onClick={() => {
            onRenglones([...renglones, { metodo: 'efectivo', importe: '' }]);
          }}
          className="text-sm font-medium text-primario underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none"
        >
          + otra forma de pago
        </button>
      )}

      <p className="flex items-baseline justify-between border-t border-borde pt-3 text-sm">
        <span className="text-texto-sutil">
          {falta === 0n ? 'Cubierto' : falta > 0n ? 'Falta por cubrir' : 'Se pasa por'}
        </span>
        <span
          className={`text-lg font-semibold ${CLASE_IMPORTE} ${
            falta === 0n ? 'text-exito' : 'text-peligro'
          }`}
        >
          {falta === 0n
            ? pesos(cubierto.toString())
            : pesos((falta < 0n ? -falta : falta).toString())}
        </span>
      </p>
    </div>
  );
}

/**
 * Convierte los renglones en pagos, o `null` si todavía no cuadran.
 *
 * El ÚLTIMO renglón absorbe el resto. Los demás sólo cuentan si traen un
 * importe válido y mayor que cero: un renglón a medio teclear no debe habilitar
 * el cobro.
 */
export function repartir(
  renglones: readonly Renglon[],
  total: bigint,
): { pagos: readonly PagoListo[] | null; cubierto: bigint; falta: bigint } {
  const explicitos: PagoListo[] = [];
  let suma = 0n;

  for (const r of renglones.slice(0, -1)) {
    const centavos = aCentavos(r.importe);
    if (centavos === null || centavos <= 0) continue;
    explicitos.push({ metodo: r.metodo, montoCentavos: centavos });
    suma += BigInt(centavos);
  }

  const ultimo = renglones[renglones.length - 1];
  const resto = total - suma;

  if (ultimo === undefined || resto <= 0n) {
    return { pagos: null, cubierto: suma, falta: total - suma };
  }

  return {
    pagos: [...explicitos, { metodo: ultimo.metodo, montoCentavos: Number(resto) }],
    cubierto: total,
    falta: 0n,
  };
}
