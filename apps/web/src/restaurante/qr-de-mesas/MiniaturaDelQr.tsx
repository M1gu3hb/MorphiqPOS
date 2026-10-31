'use client';

import { useMemo } from 'react';

import { svgDeLaPieza, type PiezaDeMesa } from './pieza';

const LADOS = { chico: 'w-[calc(var(--altura-control)*2)]', grande: 'w-full max-w-72' } as const;

/**
 * La vista previa del QR de una mesa con su diseño, como imagen (nunca como marcado en la
 * página): lo que se ve es exactamente lo que se exporta.
 */
export function MiniaturaDelQr({
  contenido,
  numero,
  diseno,
  logo,
  tamano = 'chico',
}: PiezaDeMesa & { readonly tamano?: keyof typeof LADOS }) {
  const fuente = useMemo(() => {
    const svg = svgDeLaPieza({ contenido, numero, diseno, logo }, 512);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [contenido, numero, diseno, logo]);
  return (
    // Un <img> y no `next/image`: es un `data:` dibujado aquí, no hay qué optimizar.
    // eslint-disable-next-line @next/next/no-img-element -- ver arriba
    <img
      src={fuente}
      alt={`QR de la mesa ${String(numero)}`}
      className={`${LADOS[tamano]} h-auto`}
      data-qr-de-mesa={numero}
    />
  );
}
