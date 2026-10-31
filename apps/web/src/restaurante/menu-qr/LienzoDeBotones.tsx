'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

import { cajaDelBoton } from './botones-de-pagina';
import { estirarBoton, moverBoton, type BotonEditable } from './editor-de-botones';

/** Cuánto se mueve con una flecha del teclado (en % de la imagen). */
const PASO_DE_TECLADO = 0.5;

const FLECHAS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-PASO_DE_TECLADO, 0],
  ArrowRight: [PASO_DE_TECLADO, 0],
  ArrowUp: [0, -PASO_DE_TECLADO],
  ArrowDown: [0, PASO_DE_TECLADO],
};

interface Arrastre {
  readonly modo: 'mover' | 'estirar';
  readonly desdeX: number;
  readonly desdeY: number;
  readonly original: BotonEditable;
}

/**
 * La página con sus botones para colocarlos (DP-9.7): se arrastran con el dedo o el mouse, se
 * estiran desde la esquina, y con el teclado las flechas los mueven y Mayúsculas + flechas los
 * estiran. Todo en % de la imagen: lo que se ve aquí es lo que ve el comensal en su teléfono.
 */
export function LienzoDeBotones({
  imagenUrl,
  nombre,
  botones,
  seleccionado,
  nombreDe,
  alSeleccionar,
  alCambiar,
}: {
  readonly imagenUrl: string;
  readonly nombre: string;
  readonly botones: readonly BotonEditable[];
  readonly seleccionado: string | null;
  /** Lo que se lee en el botón mientras se coloca: el platillo o el texto del grupo. */
  readonly nombreDe: (boton: BotonEditable) => string;
  readonly alSeleccionar: (id: string) => void;
  readonly alCambiar: (boton: BotonEditable) => void;
}) {
  const lienzo = useRef<HTMLDivElement>(null);
  const arrastre = useRef<Arrastre | null>(null);

  function enPorcentaje(dxPx: number, dyPx: number): { dx: number; dy: number } {
    const caja = lienzo.current?.getBoundingClientRect();
    if (caja === undefined || caja.width === 0 || caja.height === 0) return { dx: 0, dy: 0 };
    return { dx: (dxPx / caja.width) * 100, dy: (dyPx / caja.height) * 100 };
  }

  function empezar(
    evento: PointerEvent<HTMLElement>,
    boton: BotonEditable,
    modo: Arrastre['modo'],
  ) {
    evento.stopPropagation();
    evento.currentTarget.setPointerCapture(evento.pointerId);
    arrastre.current = { modo, desdeX: evento.clientX, desdeY: evento.clientY, original: boton };
    alSeleccionar(boton.id);
  }

  function seguir(evento: PointerEvent<HTMLElement>) {
    const a = arrastre.current;
    if (a === null) return;
    const { dx, dy } = enPorcentaje(evento.clientX - a.desdeX, evento.clientY - a.desdeY);
    alCambiar(
      a.modo === 'mover' ? moverBoton(a.original, dx, dy) : estirarBoton(a.original, dx, dy),
    );
  }

  function soltar() {
    arrastre.current = null;
  }

  function conTeclado(evento: KeyboardEvent<HTMLElement>, boton: BotonEditable) {
    const flecha = FLECHAS[evento.key];
    if (flecha === undefined) return;
    evento.preventDefault();
    const [dx, dy] = flecha;
    alCambiar(evento.shiftKey ? estirarBoton(boton, dx, dy) : moverBoton(boton, dx, dy));
  }

  return (
    <div ref={lienzo} className="relative touch-none select-none">
      {/* eslint-disable-next-line @next/next/no-img-element -- la carta del negocio, tal cual */}
      <img src={imagenUrl} alt={nombre} draggable={false} className="block h-auto w-full" />
      {botones.map((boton) => {
        const activo = seleccionado === boton.id;
        return (
          <Button
            key={boton.id}
            type="button"
            variant="ghost"
            aria-pressed={activo}
            aria-label={`Botón ${nombreDe(boton)}. Flechas: mover. Mayúsculas y flechas: estirar.`}
            style={cajaDelBoton(boton)}
            className={`absolute h-auto cursor-move justify-start overflow-visible rounded-md border-2 p-0 text-xs font-semibold ${activo ? 'border-primario bg-primario/25' : 'border-primario/60 bg-primario/10'}`}
            onPointerDown={(evento) => {
              empezar(evento, boton, 'mover');
            }}
            onPointerMove={seguir}
            onPointerUp={soltar}
            onPointerCancel={soltar}
            onKeyDown={(evento) => {
              conTeclado(evento, boton);
            }}
          >
            <span className="pointer-events-none truncate px-(--espacio-1)">{nombreDe(boton)}</span>
            <span
              aria-hidden
              onPointerDown={(evento) => {
                empezar(evento, boton, 'estirar');
              }}
              onPointerMove={seguir}
              onPointerUp={soltar}
              className="absolute right-0 bottom-0 size-4 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-full bg-primario"
            />
          </Button>
        );
      })}
    </div>
  );
}
