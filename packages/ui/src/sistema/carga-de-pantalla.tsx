import type { ReactElement, ReactNode } from 'react';

import { cn } from '../utilidades/cn';
import { Superficie } from './superficie';

/**
 * LA CARGA LARGA (DP-11.1) · cuando una pantalla ENTERA tarda y no hay forma que esqueletar.
 *
 * Entrar con el PIN, abrir el menú del portal: ahí no hay una lista con su silueta, hay una
 * pantalla en blanco. Antes era un círculo girando suelto en medio; ahora es una tarjeta que dice
 * QUÉ carga («Cargando tu caja») con una barra que recorre su riel. Las cargas DENTRO de una
 * pantalla siguen siendo `Esqueleto`: esto no las reemplaza.
 *
 * ── Nada antes de 600 ms ──────────────────────────────────────────────────────
 * Una carga corta no tiene que parpadear: la tarjeta existe desde el primer instante (así lo que
 * lleva dentro, la mascota, ya se está descargando) pero no se ve hasta `retrasoMs`. Es CSS
 * (`carga-aparece` en `base.css`), sin temporizadores: con movimiento nulo aparece seca.
 *
 * ── La mascota ───────────────────────────────────────────────────────────────
 * Se asoma DETRÁS de la tarjeta con las manos en la orilla: la pinta quien llama, porque sólo
 * ella sabe su recorte. Lo único que la tarjeta necesita saber es cuánto de su cara tapan las
 * manos (`solapeDeLaMascota`, fracción de su ancho), para que el texto empiece debajo.
 */
export interface PantallaDeCargaProps {
  readonly titulo?: string;
  /** `pantalla`: fija, al frente, sobre todo. `contenida`: el hueco de su sección. */
  readonly variante?: 'pantalla' | 'contenida';
  readonly mascota?: ReactNode;
  readonly solapeDeLaMascota?: number;
  readonly retrasoMs?: number;
}

export function PantallaDeCarga({
  titulo = 'Cargando',
  variante = 'pantalla',
  mascota,
  solapeDeLaMascota = 0,
  retrasoMs = 600,
}: PantallaDeCargaProps): ReactElement {
  const conMascota = mascota !== undefined && mascota !== null;
  const solape = `${String(Math.round(solapeDeLaMascota * 10000) / 100)}%`;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'grid place-items-center px-(--espacio-4)',
        variante === 'pantalla' ? 'fixed inset-0 z-50 bg-fondo' : 'py-(--espacio-16)',
      )}
    >
      <div
        className="carga-aparece relative w-full max-w-md"
        style={{ animationDelay: `${String(retrasoMs)}ms` }}
      >
        <Superficie
          nivel={3}
          relleno={6}
          style={conMascota ? { paddingTop: `calc(${solape} + var(--espacio-4))` } : undefined}
        >
          <p className="text-center text-base font-semibold text-texto">{titulo}</p>
          <div
            aria-hidden="true"
            className="carga-riel mt-(--espacio-3) h-(--espacio-1) overflow-hidden rounded-full bg-fondo-sutil"
          >
            <div className="carga-barra h-full w-1/3 rounded-full bg-primario" />
          </div>
        </Superficie>
        {mascota}
      </div>
    </div>
  );
}
