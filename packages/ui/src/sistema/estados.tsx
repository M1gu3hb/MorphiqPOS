import type { ReactElement, ReactNode } from 'react';

import { cn } from '../utilidades/cn';

/**
 * LOS TRES ESTADOS QUE SIEMPRE SE OLVIDAN · vacío, cargando y error.
 *
 * Una pantalla no es su caso feliz. Es su caso feliz más estos tres, y los tres se
 * ven MÁS que el caso feliz el primer día de un negocio: el catálogo está vacío, la
 * agenda está vacía, la red va mal. Dejarlos sin diseñar es dejar sin diseñar la
 * primera impresión.
 */

/**
 * VACÍO · una oportunidad, no un hueco.
 *
 * «No hay datos» es una pared. Un catálogo vacío en una ferretería tiene que enseñar
 * cómo importar desde Excel; una agenda vacía en una estética, cómo agendar la
 * primera cita. Por eso la acción no es opcional en la práctica: un estado vacío sin
 * salida es una pantalla que no sabe para qué existe.
 *
 * El texto lo pone quien llama, con el vocabulario de SU giro. Aquí no hay ni una
 * palabra de producto: poner «No hay productos» aquí sería escribir «productos» en
 * una ferretería que dice «materiales».
 *
 * ── `children`, y por qué no bastaban título, explicación y acción ────────
 * Los mejores vacíos del sistema traen algo más: la pantalla de existencias de una
 * ferretería enumera las CUATRO PREGUNTAS que va a contestar en cuanto entre la
 * primera nota, y ésa es la mitad de por qué el vacío no se lee como un fallo. Eso no
 * es la explicación —es una lista— ni es la acción —no se toca—. Sin un hueco propio,
 * cada pantalla con ese contenido se quedaba fuera del componente y volvía a
 * escribirse a mano, que es exactamente como muere una biblioteca.
 */
export function Vacio({
  icono,
  titulo,
  explicacion,
  children,
  accion,
  className,
}: {
  /** Una ilustración o un icono grande. Sin esto el vacío se lee como un error. */
  readonly icono?: ReactNode;
  readonly titulo: string;
  readonly explicacion?: string;
  /** Lo que la pantalla va a hacer cuando tenga datos: una lista, unos ejemplos. */
  readonly children?: ReactNode;
  /** Qué hacer ahora. Un vacío sin salida es una pared. */
  readonly accion?: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-(--espacio-3) px-(--espacio-6) py-(--espacio-12) text-center',
        className,
      )}
    >
      {icono === undefined ? null : (
        <div
          className="text-muted-foreground [&_svg]:size-[calc(var(--altura-control)*1.15)]"
          aria-hidden="true"
        >
          {icono}
        </div>
      )}
      <p className="text-lg font-medium text-foreground">{titulo}</p>
      {explicacion === undefined ? null : (
        <p className="max-w-prose text-sm text-muted-foreground">{explicacion}</p>
      )}
      {children}
      {accion === undefined ? null : <div className="mt-(--espacio-2)">{accion}</div>}
    </div>
  );
}

/**
 * CARGANDO · un esqueleto, nunca una rueda suelta.
 *
 * Una rueda dice «espera» y no dice cuánto ni qué viene. Un esqueleto dice las dos
 * cosas: se ve la FORMA de lo que va a llegar, así que el ojo ya empieza a
 * orientarse y el salto al contenido real no mueve nada de sitio. Eso es además la
 * mitad de no tener saltos de diseño: el hueco ya estaba reservado.
 *
 * La animación es un pulso de opacidad y no un barrido: el barrido es movimiento
 * bajo el dedo en una lista que se va a poder tocar en medio segundo.
 */
export function Esqueleto({
  className,
  redondo = false,
}: {
  readonly className?: string;
  readonly redondo?: boolean;
}): ReactElement {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse bg-muted', redondo ? 'rounded-full' : 'rounded-md', className)}
    />
  );
}

/** El esqueleto de una lista: `n` filas con la forma de una fila de verdad. */
export function EsqueletoDeLista({
  filas = 5,
  className,
}: {
  readonly filas?: number;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      className={cn('flex flex-col gap-(--espacio-2)', className)}
      role="status"
      aria-busy="true"
      aria-label="Cargando"
    >
      {Array.from({ length: filas }, (_, indice) => (
        <div key={indice} className="flex items-center gap-(--espacio-3)">
          <Esqueleto redondo className="size-(--altura-control)" />
          <Esqueleto className="h-4 flex-1" />
          <Esqueleto className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * ERROR · qué pasó y qué hacer. Nunca sólo lo primero.
 *
 * «Ocurrió un error» no es un mensaje: es una disculpa. Lo que necesita quien está
 * cobrando con gente esperando es saber si puede reintentar, si tiene que llamar a
 * alguien, o si lo que hizo se guardó o no. Por eso `queHacer` y `reintentar` están
 * aquí y no en un `TODO`.
 */
export function ErrorDePantalla({
  titulo,
  queHacer,
  detalle,
  reintentar,
  className,
}: {
  readonly titulo: string;
  /** La frase accionable. Sin ella esto es una disculpa, no un mensaje. */
  readonly queHacer: string;
  /** El detalle técnico, para quien tenga que reportarlo. Va en pequeño y aparte. */
  readonly detalle?: string;
  readonly reintentar?: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-(--espacio-2) rounded-lg border border-destructive/40 bg-destructive/5 p-(--espacio-4)',
        className,
      )}
    >
      <p className="font-medium text-foreground">{titulo}</p>
      <p className="text-sm text-muted-foreground">{queHacer}</p>
      {detalle === undefined ? null : (
        <code className="max-w-full overflow-x-auto rounded-sm bg-muted px-(--espacio-2) py-(--espacio-1) text-xs text-muted-foreground">
          {detalle}
        </code>
      )}
      {reintentar === undefined ? null : <div className="mt-(--espacio-1)">{reintentar}</div>}
    </div>
  );
}
