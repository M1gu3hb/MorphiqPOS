'use client';

import type { ReactElement, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '../utilidades/cn';

/**
 * RETROALIMENTACIÓN · decir qué pasó sin estorbar lo que se está haciendo.
 */

/**
 * PROGRESO · cuánto falta, cuando se sabe.
 *
 * Con `valor` es determinado y dice el porcentaje; sin él es indeterminado y sólo
 * dice «sigo trabajando». La diferencia importa: una barra indeterminada que finge
 * avanzar miente, y quien la mira calcula mal cuánto esperar.
 */
export function Progreso({
  valor,
  etiqueta,
  className,
}: {
  /** De 0 a 100. Si falta, la barra es indeterminada. */
  readonly valor?: number;
  readonly etiqueta: string;
  readonly className?: string;
}): ReactElement {
  const determinado = valor !== undefined;
  const acotado = determinado ? Math.max(0, Math.min(100, valor)) : 0;
  return (
    <div className={cn('flex flex-col gap-(--espacio-1)', className)}>
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>{etiqueta}</span>
        {determinado ? (
          <span className="font-numeros tabular-nums">{`${String(Math.round(acotado))} %`}</span>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-label={etiqueta}
        aria-valuenow={determinado ? Math.round(acotado) : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full rounded-full bg-primary',
            determinado
              ? 'transition-[width] duration-(--duracion-normal) ease-[cubic-bezier(0.23,1,0.32,1)]'
              : 'w-1/3 animate-pulse',
          )}
          style={determinado ? { width: `${String(acotado)}%` } : undefined}
        />
      </div>
    </div>
  );
}

/**
 * GUARDANDO / GUARDADO · el indicador que NO debe parpadear.
 *
 * ── El defecto que este componente evita ──────────────────────────────────
 * Lo obvio es pintar «Guardando…» mientras la petición viaja y «Guardado» cuando
 * vuelve. Con una red rápida eso es un parpadeo de 80 ms en cada tecla: la pantalla
 * tirita y nadie alcanza a leer nada. Es el mismo defecto que un esqueleto que
 * aparece y desaparece antes de verse.
 *
 * Aquí hay dos suelos, y los dos son deliberados:
 *   · **No se anuncia «guardando» hasta pasados 400 ms.** Lo que tarda menos que eso
 *     se siente instantáneo y no necesita anuncio.
 *   · **«Guardado» se queda 2 segundos** aunque llegue otro guardado. Un mensaje que
 *     se va antes de leerse no informó a nadie.
 *
 * `aria-live="polite"` y no `assertive`: guardar es rutina, no una alarma.
 */
export type EstadoDeGuardado = 'quieto' | 'guardando' | 'guardado' | 'error';

const RETRASO_ANUNCIO_MS = 400;
const PERMANENCIA_MS = 2_000;

export function IndicadorDeGuardado({
  estado,
  className,
}: {
  readonly estado: EstadoDeGuardado;
  readonly className?: string;
}): ReactElement {
  /**
   * TRES FASES, y ningún reloj leído durante el render.
   *
   *   espera    · hay algo pasando y todavía no se anuncia (los primeros 400 ms)
   *   mostrando · se está enseñando
   *   oculto    · ya se enseñó lo suyo y se apagó
   *
   * La fase cambia en dos sitios y sólo en dos: al CAMBIAR el estado que llega
   * —ajustando el estado durante el render, que es el patrón que React documenta
   * para esto— y dentro del temporizador. Nunca en el cuerpo de un efecto, que
   * encadena renders, y nunca leyendo `Date.now()` en el render, que es impuro y
   * rompe con renderizado concurrente.
   */
  const [anterior, setAnterior] = useState<EstadoDeGuardado>(estado);
  const [fase, setFase] = useState<'espera' | 'mostrando' | 'oculto'>('oculto');

  if (estado !== anterior) {
    setAnterior(estado);
    // «Guardando» ESPERA: lo que tarda menos de 400 ms se siente instantáneo y
    // anunciarlo es un parpadeo. Lo demás se enseña ya.
    setFase(estado === 'quieto' ? 'oculto' : estado === 'guardando' ? 'espera' : 'mostrando');
  }

  useEffect(() => {
    if (fase === 'espera') {
      const id = setTimeout(() => {
        setFase('mostrando');
      }, RETRASO_ANUNCIO_MS);
      return () => {
        clearTimeout(id);
      };
    }
    // Un resultado se queda 2 segundos: un mensaje que se va antes de leerse no
    // informó a nadie. «Guardando» no caduca solo — caduca cuando llega su resultado.
    if (fase === 'mostrando' && estado !== 'guardando') {
      const id = setTimeout(() => {
        setFase('oculto');
      }, PERMANENCIA_MS);
      return () => {
        clearTimeout(id);
      };
    }
    return undefined;
  }, [fase, estado]);

  const visible: EstadoDeGuardado = fase === 'mostrando' ? estado : 'quieto';
  const texto =
    visible === 'guardando'
      ? 'Guardando…'
      : visible === 'guardado'
        ? 'Guardado'
        : visible === 'error'
          ? 'No se pudo guardar'
          : '';

  return (
    <p
      aria-live="polite"
      className={cn(
        'flex items-center gap-(--espacio-2) text-xs transition-opacity duration-(--duracion-normal)',
        visible === 'error' ? 'text-destructive' : 'text-muted-foreground',
        visible === 'quieto' ? 'opacity-0' : 'opacity-100',
        className,
      )}
    >
      {visible === 'guardando' ? (
        <span
          aria-hidden="true"
          className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {/* El texto se conserva mientras se desvanece: si se vaciara, el renglón
          cambiaría de alto y movería lo que tiene debajo. */}
      {texto === '' ? ' ' : texto}
    </p>
  );
}

/**
 * CONFIRMACIÓN DESTRUCTIVA · con el nombre de lo que se va a borrar.
 *
 * «¿Estás seguro?» no informa de nada: quien va a borrar siempre está seguro de
 * algo, la duda es de QUÉ. Por eso el nombre es obligatorio y va en el cuerpo del
 * mensaje, no en el título.
 *
 * Y el botón destructivo NO es el que tiene el foco al abrir: el foco va en
 * «Cancelar». Un Enter reflejo sobre un diálogo que acaba de aparecer no puede
 * borrar el día de trabajo de alguien.
 */
export function ConfirmacionDestructiva({
  abierta,
  queSeBorra,
  consecuencia,
  alConfirmar,
  alCancelar,
  textoConfirmar = 'Sí, eliminar',
}: {
  readonly abierta: boolean;
  /** El NOMBRE de lo que se va a borrar. No «el elemento»: su nombre. */
  readonly queSeBorra: string;
  /** Qué se pierde. Lo que no se puede deshacer se dice antes, no después. */
  readonly consecuencia?: string;
  readonly alConfirmar: () => void;
  readonly alCancelar: () => void;
  readonly textoConfirmar?: string;
}): ReactElement | null {
  const cancelar = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!abierta) return;
    cancelar.current?.focus();
  }, [abierta]);

  if (!abierta) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirmacion-titulo"
      aria-describedby="confirmacion-cuerpo"
      className="fixed inset-0 z-50 flex items-center justify-center p-(--espacio-4)"
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') alCancelar();
      }}
    >
      <div
        aria-hidden="true"
        onClick={alCancelar}
        className="absolute inset-0 bg-[hsl(var(--velo)/0.6)] backdrop-blur-[2px]"
      />
      {/* Un diálogo NO escala desde su disparador: aparece centrado y por eso su
          origen es el centro. Lo que escala desde su disparador son los popovers. */}
      <div className="relative w-full max-w-md rounded-lg border border-border bg-card p-(--espacio-6) shadow-4">
        <h2 id="confirmacion-titulo" className="text-lg font-medium">
          Esto no se puede deshacer
        </h2>
        <p id="confirmacion-cuerpo" className="mt-(--espacio-2) text-sm text-muted-foreground">
          Se va a eliminar <strong className="text-foreground">{queSeBorra}</strong>
          {consecuencia === undefined ? '.' : `. ${consecuencia}`}
        </p>
        <div className="mt-(--espacio-6) flex justify-end gap-(--espacio-2)">
          <button
            ref={cancelar}
            type="button"
            onClick={alCancelar}
            className="h-(--altura-control) rounded-md border border-border px-(--espacio-4) text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.97]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={alConfirmar}
            className="h-(--altura-control) rounded-md bg-destructive px-(--espacio-4) text-sm font-medium text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.97]"
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * AVISO · lo que hay que saber sin que tape lo que se está haciendo.
 *
 * Los cuatro semánticos del sistema, y el color NUNCA va solo: cada uno lleva su
 * icono y su palabra. Un aviso que sólo se distingue por el tono del borde no
 * existe para quien no distingue ese tono.
 */
export function Aviso({
  tono,
  titulo,
  children,
  accion,
  className,
}: {
  readonly tono: 'info' | 'exito' | 'atencion' | 'peligro';
  readonly titulo: string;
  readonly children?: ReactNode;
  readonly accion?: ReactNode;
  readonly className?: string;
}): ReactElement {
  const estilo = {
    info: { caja: 'border-info/40 bg-info/5', texto: 'text-info', simbolo: 'i' },
    exito: { caja: 'border-success/40 bg-success/5', texto: 'text-success', simbolo: '✓' },
    atencion: { caja: 'border-warning/50 bg-warning/10', texto: 'text-foreground', simbolo: '!' },
    peligro: {
      caja: 'border-destructive/40 bg-destructive/5',
      texto: 'text-destructive',
      simbolo: '×',
    },
  }[tono];

  return (
    <div
      role={tono === 'peligro' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-(--espacio-3) rounded-lg border p-(--espacio-4)',
        estilo.caja,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
          estilo.texto,
        )}
      >
        {estilo.simbolo}
      </span>
      <div className="flex-1">
        <p className={cn('text-sm font-medium', estilo.texto)}>{titulo}</p>
        {children === undefined ? null : (
          <div className="mt-(--espacio-1) text-sm text-muted-foreground">{children}</div>
        )}
      </div>
      {accion}
    </div>
  );
}
