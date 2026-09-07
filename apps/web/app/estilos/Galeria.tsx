'use client';

import { useApariencia } from '@morphiqpos/ui/hooks';
import { useTheme } from 'next-themes';

import { Controles } from './Controles';
import { SeccionColor } from './SeccionColor';
import { SeccionComponentes } from './SeccionComponentes';
import { SeccionTipografia } from './SeccionTipografia';

/**
 * La galeria viva del sistema de diseno (F1.0-T08).
 *
 * Sirve para tres cosas, y las tres importan igual (05-SISTEMA-DE-DISENO §10):
 *   1. Detectar regresiones visuales.
 *   2. Revisar contraste.
 *   3. Ensenarsela a un cliente en la demostracion.
 *
 * Por eso los ejemplos usan contenido real de un punto de venta y no
 * marcadores: es la diferencia entre una galeria y algo que se puede mostrar.
 */
export function Galeria() {
  const { apariencia, cambiarEstilo, ajustar } = useApariencia('premium');
  const { resolvedTheme } = useTheme();

  return (
    <>
      <Controles apariencia={apariencia} onEstilo={cambiarEstilo} onPerilla={ajustar} />

      <main className="mx-auto max-w-6xl space-y-16 px-6 py-12">
        <section className="max-w-prose space-y-3">
          <p className="text-[length:var(--tamano-sm)] text-texto-tenue">
            Estilo activo: <strong className="text-texto">{apariencia.estilo}</strong> ·
            densidad {apariencia.densidad} · redondeo {apariencia.redondeo} · elevación{' '}
            {apariencia.elevacion} · movimiento {apariencia.movimiento}
          </p>
          <h2 className="text-[length:var(--tamano-3xl)] leading-[var(--interlinea-compacta)] font-[var(--peso-fuerte)] tracking-[var(--tracking-compacto)]">
            Un solo juego de componentes.
            <br />
            Cuatro perillas que lo cambian entero.
          </h2>
          <p className="text-texto-sutil">
            Cambiar de estilo aquí arriba no carga otra hoja ni otro componente: mueve los
            tokens y las cuatro perillas estructurales. Es la misma operación que hará
            Miguel delante de un cliente para preguntarle cuál le late.
          </p>
        </section>

        <SeccionTipografia />
        <SeccionColor clave={`${apariencia.estilo}-${resolvedTheme ?? 'claro'}`} />
        <SeccionComponentes />
      </main>

      <footer className="border-t border-borde bg-fondo-sutil">
        <div className="mx-auto max-w-6xl px-6 py-8 text-[length:var(--tamano-sm)] text-texto-sutil">
          <p>
            Corte F1.0 · Fundación. Los estilos <strong>industrial</strong> y{' '}
            <strong>skeuomórfico</strong> llegan en F1.4 y F1.5.
          </p>
        </div>
      </footer>
    </>
  );
}
