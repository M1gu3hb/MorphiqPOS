'use client';

import type { MesaEnPlano } from '@morphiqpos/domain/sala';

/**
 * LAS MESAS DIBUJADAS EN «UNIR MESAS» (DP-9.6): al tocarse se funden en una sola mancha —un
 * filtro SVG «gooey»: desenfoque y umbral de opacidad, sin librerías— y tiemblan para decir «me
 * puedes mover» (sólo transform; con movimiento reducido, quietas). Es sólo dibujo: los toques
 * los reciben los botones que van encima.
 */
export function MesasQueSeFunden({
  plano,
  escala,
  grupo,
  formaDe,
}: {
  readonly plano: readonly MesaEnPlano[];
  readonly escala: number;
  readonly grupo: readonly string[];
  readonly formaDe: (id: string) => string;
}) {
  return (
    <svg className="absolute inset-0 size-full" aria-hidden="true">
      <defs>
        <filter id="mesas-que-se-funden">
          <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="borroso" />
          <feColorMatrix
            in="borroso"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
            result="liquido"
          />
          <feComposite in="SourceGraphic" in2="liquido" operator="atop" />
        </filter>
      </defs>
      <g filter="url(#mesas-que-se-funden)" transform={`scale(${String(escala)})`}>
        {plano.map((m) => {
          const tono = `${grupo.includes(m.id) ? 'fill-primario' : 'fill-borde-fuerte'} origin-center animate-temblar [transform-box:fill-box] motion-reduce:animate-none`;
          return formaDe(m.id) === 'redonda' ? (
            <ellipse
              key={m.id}
              className={tono}
              cx={m.x + m.ancho / 2}
              cy={m.y + m.alto / 2}
              rx={m.ancho / 2}
              ry={m.alto / 2}
            />
          ) : (
            <rect
              key={m.id}
              className={tono}
              x={m.x}
              y={m.y}
              width={m.ancho}
              height={m.alto}
              rx={12}
            />
          );
        })}
      </g>
    </svg>
  );
}
