import { Cifra, Dinero, type ColumnaDeTabla } from '@morphiqpos/ui/sistema';
import type { ReactNode } from 'react';

import { centavosDe } from '~/cliente/dinero-del-puente';
import type { Vocabulario } from '@morphiqpos/domain/vocabulario';

import { BASES, type Metodo } from './pagos-del-cobro.ts';
import type { Ilegibles, LineaDeCuenta } from './Cobro';

/**
 * LAS PIEZAS SIN ESTADO DEL COBRO: el importe de una línea, por qué no se puede cobrar y
 * las columnas del desglose. Vivían en `Cobro.tsx`, que pasaba de las 800 líneas; salen
 * aquí tal cual para que el cobro pudiera ganar la propina del mesero, el descuento y la
 * cancelación (día completo del restaurante, 2.4) sin crecer más allá del límite.
 */

/**
 * El importe de una línea, en centavos. `DetalleVenta.total` llega en pesos y la unidad la
 * decide `centavosDe` contando dígitos; sin dato se pinta cero, como siempre se pintó.
 */
export function importeDe(linea: LineaDeCuenta): number {
  return centavosDe('DetalleVenta', 'total', linea.total) ?? 0;
}

/** Qué impide cobrar, dicho con palabras y no sólo con un botón apagado. */
export function bloqueoDe(
  pendiente: boolean,
  total: number,
  metodo: Metodo,
  recibido: number | null,
  suma: number,
  ilegibles: Ilegibles,
  voc: Vocabulario,
): ReactNode {
  if (pendiente) return 'Confirma la propina antes de cobrar.';
  if (total <= 0) return `${voc.conDeterminante('este', 'orden')} no tiene importe que cobrar.`;
  if (metodo === 'efectivo') {
    // Ilegible no es vacío: sin esto, «15OO» cobraba como si hubiera pagado exacto.
    if (ilegibles.recibido) return 'Lo recibido no es un importe.';
    return recibido !== null && recibido > 0 && recibido < total ? 'Lo recibido no alcanza.' : null;
  }
  if (metodo !== 'mixto') return null;
  // Antes que la suma: un campo ilegible contaría como cero y el «Faltan» mentiría.
  if (BASES.some((base) => ilegibles[base])) return 'Alguno de los tres importes no es un número.';
  if (suma === total) return null;
  const falta = total - suma;
  return falta > 0 ? (
    <>
      Faltan <Dinero centavos={falta} tamano="sm" /> por desglosar.
    </>
  ) : (
    <>
      Sobran <Dinero centavos={-falta} tamano="sm" />.
    </>
  );
}

/** Las columnas del desglose: la cantidad alineada, el platillo y su importe. */
export function columnasDeLaCuenta(platillo: string): readonly ColumnaDeTabla<LineaDeCuenta>[] {
  return [
    {
      clave: 'cantidad',
      titulo: 'Cant.',
      numerica: true,
      // En cifras tabulares y en su propia columna: una columna de «2», «12» que no
      // está alineada se relee, y aquí se relee con gente esperando.
      celda: (linea) => {
        const cantidad = linea.cantidad ?? 1;
        return (
          <Cifra valor={cantidad} decimales={Number.isInteger(cantidad) ? 0 : 2} tamano="sm" />
        );
      },
    },
    { clave: 'platillo', titulo: platillo, celda: (linea) => linea.producto_nombre ?? platillo },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (linea) => <Dinero centavos={importeDe(linea)} tamano="sm" />,
    },
  ];
}
