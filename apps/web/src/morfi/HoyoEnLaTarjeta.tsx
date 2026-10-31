import type { CSSProperties } from 'react';

/**
 * EL HOYO EN LA TARJETA de la página que no existe (DP-11.1): interfaz, no parte del clip. Su
 * contorno sale de la escena `07_pagina_no_encontrada` (caja de 560 × 440 a partir de (700, 220)
 * en el cuadro de 1920 × 1080); su orilla de abajo, en 370, es la línea detrás de la que Morfi se
 * asoma. Los colores son tokens: en claro y en oscuro sigue siendo un hoyo de esta tarjeta.
 */
const CONTORNO =
  'M80 362 L66 318 L62 265 L65 212 L85 170 L112 128 L150 97 L190 90 L225 70 L268 77 L345 80 ' +
  'L378 105 L395 148 L432 175 L455 220 L460 318 L445 365 L385 375 L300 367 L220 373 Z';

const GRIETAS = [
  'M268 77 L272 48 L262 38',
  'M150 97 L140 76 L120 72',
  'M378 105 L398 92 L403 73',
  'M65 212 L45 205 L25 214',
  'M455 220 L476 226 L495 216',
  'M80 362 L60 371 L53 390',
  'M220 373 L210 391 L214 412',
  'M445 365 L460 383 L481 386',
] as const;

export function HoyoEnLaTarjeta({
  className,
  style,
}: {
  readonly className?: string;
  readonly style?: CSSProperties;
}) {
  return (
    <svg viewBox="0 0 560 440" aria-hidden="true" className={className} style={style} fill="none">
      <path
        d={CONTORNO}
        className="fill-fondo-sutil stroke-texto"
        strokeWidth={5}
        strokeLinejoin="round"
      />
      {GRIETAS.map((grieta) => (
        <path
          key={grieta}
          d={grieta}
          className="stroke-texto"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
