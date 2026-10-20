'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Split } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useVocabulario } from '~/cliente/vocabulario';

import { DividirCuentaDialog } from './DividirCuentaDialog';

/**
 * DIVIDIR LA CUENTA DESDE LA CAJA (día completo del restaurante, 2.4).
 *
 * La mesa pide «cuentas separadas» al final, con la cuenta sobre la mesa y delante de quien
 * la cobra. El diálogo de dividir vivía sólo en la mesa activa —la pantalla del mesero, que no
 * puede dividir— y la caja no tenía por dónde: quien cobra no puede abandonar la cuenta,
 * buscar la mesa en el mapa y volver. Aquí se divide la cuenta que se está cobrando, con el
 * mismo diálogo de siempre.
 *
 * Al dividir, la cuenta madre deja de cobrarse y sus PARTES son las cuentas que esperan en la
 * caja: se va a su lista, donde cada una aparece con su nombre («Mesa 5 · cuenta 1 de 2»).
 */

/** Lo que la pantalla de cobro sabe de cada línea: lo único que hace falta para repartirla. */
export interface LineaDeLaCuentaPorDividir {
  readonly id: string;
  readonly producto_nombre: string | null;
  readonly cantidad: number | null;
}

export function DividirLaCuenta({
  ordenId,
  lineas,
  className,
}: {
  readonly ordenId: string;
  /** `null` mientras no se leen: sin lo que se consumió no hay qué repartir. */
  readonly lineas: readonly LineaDeLaCuentaPorDividir[] | null;
  readonly className?: string;
}) {
  const voc = useVocabulario();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  // Cada apertura, un diálogo NUEVO: lo que se había repartido en la anterior apuntaba a líneas
  // que ya no existen cuando se divide.
  const [apertura, setApertura] = useState(0);

  const repartibles = (lineas ?? []).map((linea) => ({
    id: linea.id,
    nombre: linea.producto_nombre ?? 'Producto sin nombre',
    cantidad: linea.cantidad ?? 0,
  }));
  // Dividir en dos cuentas pide al menos dos unidades que repartir.
  const unidades = repartibles.reduce((suma, linea) => suma + linea.cantidad, 0);

  return (
    <>
      <Button
        variant="outline"
        className={className}
        disabled={lineas === null || unidades < 2}
        onClick={() => {
          setApertura((n) => n + 1);
          setAbierto(true);
        }}
      >
        <Split aria-hidden="true" />
        Dividir {voc.singular('orden')}
      </Button>
      <DividirCuentaDialog
        key={apertura}
        abierto={abierto}
        ordenId={ordenId}
        lineas={repartibles}
        onCerrar={() => {
          setAbierto(false);
        }}
        onDividida={() => {
          router.push('/restaurante/caja');
        }}
      />
    </>
  );
}
