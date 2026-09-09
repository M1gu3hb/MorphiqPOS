'use client';

import { Moon, Sun } from 'lucide-react';

import { useTheme } from '@/mh/lib/ThemeContext';

import { ESTILOS, PERILLAS } from '@morphiqpos/ui';
import type { Apariencia } from '@morphiqpos/ui/hooks';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Label } from '@morphiqpos/ui/primitivas/label';

/**
 * La barra que hace la jugada de venta: Miguel cambia el sistema entero de
 * aspecto delante del dueno y le pregunta cual le late (05-SISTEMA-DE-DISENO §1).
 *
 * Los estilos van como botones, no como lista desplegable: el gesto tiene que
 * ser de un toque y verse desde el otro lado de la mesa.
 */

interface Props {
  readonly apariencia: Apariencia;
  readonly onEstilo: (estilo: string) => void;
  readonly onPerilla: <C extends keyof Omit<Apariencia, 'estilo'>>(
    perilla: C,
    valor: Apariencia[C],
  ) => void;
}

const PERILLAS_AJUSTABLES = [
  { clave: 'densidad', titulo: 'Densidad', valores: PERILLAS.densidad },
  { clave: 'redondeo', titulo: 'Redondeo', valores: PERILLAS.redondeo },
  { clave: 'elevacion', titulo: 'Elevación', valores: PERILLAS.elevacion },
  { clave: 'movimiento', titulo: 'Movimiento', valores: PERILLAS.movimiento },
] as const;

export function Controles({ apariencia, onEstilo, onPerilla }: Props) {
  // El tema lo lleva su `ThemeContext`, que es el unico del sistema desde el
  // port del restaurante. El parpadeo del icono ya no hace falta cubrirlo con
  // `useSyncExternalStore`: el estado arranca en claro en servidor y cliente, y
  // el guion en linea del layout es quien pinta la clase antes del primer
  // pintado.
  const { isDark: esOscuro, toggle } = useTheme();

  return (
    <div className="sticky top-0 z-40 border-b border-borde bg-superficie/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-6 px-6 py-4">
        <div className="mr-auto">
          <p className="text-[length:var(--tamano-xs)] tracking-[var(--tracking-normal)] text-texto-tenue uppercase">
            MorphiqPOS
          </p>
          <h1 className="text-[length:var(--tamano-xl)] font-[var(--peso-fuerte)] text-texto">
            Sistema de diseño
          </h1>
        </div>

        <fieldset className="flex flex-col gap-2">
          <Label className="text-texto-sutil">Estilo</Label>
          <div className="flex gap-2">
            {Object.values(ESTILOS).map((estilo) => (
              <Button
                key={estilo.clave}
                variant={apariencia.estilo === estilo.clave ? 'default' : 'outline'}
                onClick={() => {
                  onEstilo(estilo.clave);
                }}
                aria-pressed={apariencia.estilo === estilo.clave}
                title={`${estilo.referencia} — ${estilo.para}`}
              >
                {estilo.nombre}
              </Button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <Label className="text-texto-sutil">Modo</Label>
          <Button
            variant="outline"
            size="icon"
            onClick={toggle}
            aria-label={esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {esOscuro ? <Sun aria-hidden /> : <Moon aria-hidden />}
          </Button>
        </fieldset>
      </div>

      <div className="mx-auto flex max-w-6xl flex-wrap gap-x-8 gap-y-3 border-t border-borde px-6 py-3">
        {PERILLAS_AJUSTABLES.map((perilla) => (
          <fieldset key={perilla.clave} className="flex items-center gap-2">
            <Label className="text-[length:var(--tamano-xs)] text-texto-tenue">
              {perilla.titulo}
            </Label>
            <div className="flex gap-1">
              {perilla.valores.map((valor) => {
                const activo = apariencia[perilla.clave] === valor;
                return (
                  <button
                    key={valor}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => {
                      onPerilla(perilla.clave, valor);
                    }}
                    className={[
                      'rounded-sm border px-2 py-1 text-[length:var(--tamano-xs)] transition-colors',
                      'duration-[var(--duracion-rapida)]',
                      activo
                        ? 'border-primario bg-primario text-primario-texto'
                        : 'border-borde text-texto-sutil hover:bg-fondo-sutil',
                    ].join(' ')}
                  >
                    {valor}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
