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
/** Cuánto pesa el vacío en su pantalla. */
export type TamanoDeVacio = 'pantalla' | 'compacto' | 'protagonista';

const TAMANOS_DE_VACIO: Readonly<
  Record<TamanoDeVacio, { readonly caja: string; readonly titulo: string; readonly texto: string }>
> = {
  // Lo normal: el vacío ocupa el hueco de una pantalla o de una lista entera.
  pantalla: {
    caja: 'gap-(--espacio-3) px-(--espacio-6) py-(--espacio-12)',
    titulo: 'text-lg font-medium',
    texto: 'text-sm',
  },
  // Dentro de una tarjeta, de un paso o del hueco de un campo: sin el aire de una
  // pantalla entera, que ahí empuja lo de abajo fuera de la vista.
  compacto: {
    caja: 'gap-(--espacio-2) px-(--espacio-4) py-(--espacio-6)',
    titulo: 'text-base font-medium',
    texto: 'text-sm',
  },
  // El vacío que ES la pantalla: «la fila está vacía» en la barra, «sin comandas» en la
  // cocina. Se lee desde lejos, así que el título va en el paso display.
  protagonista: {
    caja: 'gap-(--espacio-4) px-(--espacio-6) py-(--espacio-16)',
    titulo: 'text-display font-bold leading-none text-balance',
    texto: 'text-lg',
  },
};

/**
 * `exito` es el vacío que es BUENA NOTICIA —nada pendiente—: lleva el tinte de éxito y
 * su icono en ese color, además de la palabra. `neutro` es todo lo demás.
 */
export type TonoDeVacio = 'neutro' | 'exito';

export function Vacio({
  icono,
  titulo,
  explicacion,
  children,
  accion,
  tamano = 'pantalla',
  tono = 'neutro',
  nivelDeTitulo,
  idDelTitulo,
  className,
}: {
  /** Una ilustración o un icono grande. Sin esto el vacío se lee como un error. */
  readonly icono?: ReactNode;
  readonly titulo: string;
  readonly explicacion?: string | undefined;
  /** Lo que la pantalla va a hacer cuando tenga datos: una lista, unos ejemplos. */
  readonly children?: ReactNode;
  /** Qué hacer ahora. Un vacío sin salida es una pared. */
  readonly accion?: ReactNode;
  readonly tamano?: TamanoDeVacio | undefined;
  readonly tono?: TonoDeVacio | undefined;
  /**
   * Con nivel, el título es un ENCABEZADO (`<h2>`/`<h3>`) y no un párrafo: cuando el vacío
   * ocupa el lugar de una sección, quien navega por encabezados tiene que encontrarlo.
   */
  readonly nivelDeTitulo?: 2 | 3 | undefined;
  /** Para que una región tome su nombre del título (`aria-labelledby`). */
  readonly idDelTitulo?: string | undefined;
  readonly className?: string | undefined;
}): ReactElement {
  const medidas = TAMANOS_DE_VACIO[tamano];
  const Titulo = nivelDeTitulo === 2 ? 'h2' : nivelDeTitulo === 3 ? 'h3' : 'p';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        medidas.caja,
        tono === 'exito' ? 'rounded-lg bg-exito/15' : '',
        className,
      )}
    >
      {icono === undefined ? null : (
        <div
          className={cn(
            tono === 'exito' ? 'text-exito' : 'text-texto-sutil',
            tamano === 'protagonista'
              ? '[&_svg]:size-[calc(var(--altura-control)*2)]'
              : '[&_svg]:size-[calc(var(--altura-control)*1.15)]',
          )}
          aria-hidden="true"
        >
          {icono}
        </div>
      )}
      <Titulo id={idDelTitulo} className={cn('text-texto', medidas.titulo)}>
        {titulo}
      </Titulo>
      {explicacion === undefined ? null : (
        <p className={cn('max-w-prose text-texto-sutil', medidas.texto)}>{explicacion}</p>
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
  readonly className?: string | undefined;
  readonly redondo?: boolean | undefined;
}): ReactElement {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse bg-fondo-sutil',
        redondo ? 'rounded-full' : 'rounded-md',
        className,
      )}
    />
  );
}

/** El esqueleto de una lista: `n` filas con la forma de una fila de verdad. */
export function EsqueletoDeLista({
  filas = 5,
  className,
}: {
  readonly filas?: number | undefined;
  readonly className?: string | undefined;
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
 * El esqueleto de una TABLA densa: filas con la forma de sus columnas, sin el círculo
 * de avatar de `EsqueletoDeLista`, que en una lista de existencias o de registros
 * anuncia algo que no va a llegar. La primera columna es la ancha (el nombre); las
 * demás, cifras cortas alineadas a la derecha.
 */
export function EsqueletoDeTabla({
  filas = 6,
  columnas = 4,
  etiqueta = 'Cargando',
  className,
}: {
  readonly filas?: number | undefined;
  readonly columnas?: number | undefined;
  readonly etiqueta?: string | undefined;
  readonly className?: string | undefined;
}): ReactElement {
  return (
    <div
      className={cn('flex flex-col', className)}
      role="status"
      aria-busy="true"
      aria-label={etiqueta}
    >
      <div className="flex items-center gap-(--espacio-4) border-b border-borde py-(--espacio-2)">
        <Esqueleto className="h-3 w-24" />
        {Array.from({ length: columnas - 1 }, (_, indice) => (
          <Esqueleto key={indice} className="ml-auto h-3 w-12" />
        ))}
      </div>
      {Array.from({ length: filas }, (_, indice) => (
        <div
          key={indice}
          className="flex items-center gap-(--espacio-4) border-b border-borde py-(--espacio-3)"
        >
          <Esqueleto className="h-4 flex-1" />
          {Array.from({ length: columnas - 1 }, (_, celda) => (
            <Esqueleto key={celda} className="h-4 w-14" />
          ))}
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
  readonly detalle?: string | undefined;
  readonly reintentar?: ReactNode;
  readonly className?: string | undefined;
}): ReactElement {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-(--espacio-2) rounded-lg border border-peligro/40 bg-peligro/5 p-(--espacio-4)',
        className,
      )}
    >
      <p className="font-medium text-texto">{titulo}</p>
      <p className="text-sm text-texto-sutil">{queHacer}</p>
      {detalle === undefined ? null : (
        <code className="max-w-full overflow-x-auto rounded-sm bg-fondo-sutil px-(--espacio-2) py-(--espacio-1) text-xs text-texto-sutil">
          {detalle}
        </code>
      )}
      {reintentar === undefined ? null : <div className="mt-(--espacio-1)">{reintentar}</div>}
    </div>
  );
}
