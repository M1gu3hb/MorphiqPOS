'use client';

import { PARES_DE_CONTRASTE, TOKENS_COLOR } from '@morphiqpos/ui';
import { useEffect, useState } from 'react';

/**
 * Los tokens de color, con su contraste MEDIDO en el navegador.
 *
 * No se muestran valores precalculados: se leen del DOM con
 * `getComputedStyle`, asi que reflejan el estilo y el modo que hay en pantalla
 * ahora mismo. Es la unica forma de que la cifra no mienta cuando alguien
 * cambia la marca del cliente encima del estilo (05-SISTEMA-DE-DISENO §6).
 */

function hslATriple(valor: string): [number, number, number] | null {
  const partes = valor.trim().split(/[\s,]+/);
  if (partes.length < 3) return null;
  const numeros = [
    Number.parseFloat(partes[0] ?? ''),
    Number.parseFloat((partes[1] ?? '').replace('%', '')),
    Number.parseFloat((partes[2] ?? '').replace('%', '')),
  ];
  return numeros.every(Number.isFinite) ? [numeros[0]!, numeros[1]!, numeros[2]!] : null;
}

function luminancia([h, s, l]: [number, number, number]): number {
  const sat = s / 100;
  const lum = l / 100;
  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = lum - c / 2;
  const lineal = (canal: number) =>
    canal <= 0.040_45 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lineal(r + m) + 0.7152 * lineal(g + m) + 0.0722 * lineal(b + m);
}

function razon(a: string, b: string): number | null {
  const uno = hslATriple(a);
  const dos = hslATriple(b);
  if (!uno || !dos) return null;
  const la = luminancia(uno);
  const lb = luminancia(dos);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function SeccionColor({ clave }: { clave: string }) {
  const [valores, setValores] = useState<Record<string, string>>({});

  // `clave` cambia cuando cambia el estilo o el modo: fuerza la relectura.
  useEffect(() => {
    const estilos = getComputedStyle(document.documentElement);
    const leidos: Record<string, string> = {};
    for (const token of TOKENS_COLOR) {
      leidos[token] = estilos.getPropertyValue(`--${token}`).trim();
    }
    setValores(leidos);
  }, [clave]);

  return (
    <section aria-labelledby="color" className="space-y-6">
      <header>
        <h2 id="color" className="text-[length:var(--tamano-2xl)] font-[var(--peso-fuerte)]">
          Color
        </h2>
        <p className="mt-1 max-w-prose text-texto-sutil">
          {TOKENS_COLOR.length} tokens. Ningún componente escribe un color: todos salen de
          aquí, y por eso cambiar de estilo o aplicar la marca de un cliente no toca
          ni un archivo de interfaz.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {TOKENS_COLOR.map((token) => (
          <div key={token} className="overflow-hidden rounded-md border border-borde">
            <div
              className="h-[calc(var(--altura-control)*1.4)] w-full border-b border-borde"
              style={{ backgroundColor: `hsl(var(--${token}))` }}
            />
            <div className="px-2 py-1.5">
              <p className="truncate text-[length:var(--tamano-xs)] font-[var(--peso-medio)]">
                {token}
              </p>
              <p className="truncate text-[length:var(--tamano-xs)] text-texto-tenue tabular-nums">
                {valores[token] ?? '…'}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-3 text-[length:var(--tamano-lg)] font-[var(--peso-medio)]">
          Contraste medido en esta pantalla
        </h3>
        <p className="mb-4 max-w-prose text-texto-sutil">
          Cada par se audita en CI, en los 2 estilos × 2 modos. Aquí se recalcula en vivo,
          así que si algún día un color de marca rompe el contraste, se ve aquí antes que
          en la caja de un cliente.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-borde text-[length:var(--tamano-xs)] text-texto-tenue uppercase">
                <th className="py-2 pr-4 font-[var(--peso-medio)]">Par</th>
                <th className="py-2 pr-4 font-[var(--peso-medio)]">Mínimo</th>
                <th className="py-2 pr-4 font-[var(--peso-medio)]">Medido</th>
                <th className="py-2 font-[var(--peso-medio)]">Por qué</th>
              </tr>
            </thead>
            <tbody>
              {PARES_DE_CONTRASTE.map((par) => {
                const medido = razon(valores[par.frente] ?? '', valores[par.fondo] ?? '');
                const cumple = medido !== null && medido >= par.minimo;
                return (
                  <tr key={`${par.frente}-${par.fondo}`} className="border-b border-borde/60">
                    <td className="py-2 pr-4 text-[length:var(--tamano-sm)]">
                      {par.frente} <span className="text-texto-tenue">sobre</span> {par.fondo}
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-texto-sutil">{par.minimo}:1</td>
                    <td className="py-2 pr-4 tabular-nums">
                      <span
                        className={
                          cumple
                            ? 'rounded-sm bg-exito px-1.5 py-0.5 text-exito-texto'
                            : 'rounded-sm bg-peligro px-1.5 py-0.5 text-peligro-texto'
                        }
                      >
                        {medido === null ? '—' : `${medido.toFixed(1)}:1`}
                        <span className="sr-only">{cumple ? ' cumple' : ' no cumple'}</span>
                      </span>
                    </td>
                    <td className="py-2 text-[length:var(--tamano-sm)] text-texto-sutil">
                      {par.porque}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
