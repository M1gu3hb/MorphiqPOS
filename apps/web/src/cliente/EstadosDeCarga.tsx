import { Button } from '@morphiqpos/ui/primitivas/button';
import { ErrorDePantalla, Esqueleto, EsqueletoDeLista } from '@morphiqpos/ui/sistema';
import type { ReactElement } from 'react';

/**
 * LO QUE SE PINTA MIENTRAS UNA PANTALLA HEREDADA ESPERA SU PRIMERA LECTURA.
 *
 * Las pantallas de `heredado/` pintaban «nada» como si fuera «vacío»: una lista con
 * `initialData: []` es, para la pantalla, una lista que respondió y no trajo nada, así que
 * enseñaba «Sin cobros pendientes», «0 cobros», `$0.00` y el aviso de que no había mesas
 * mientras la red todavía iba por el primer byte. Con la red del local, eso dura segundos.
 *
 * Hay cuatro estados y no se confunden:
 *   · CARGA INICIAL — no hay dato alguno todavía: esto (esqueleto, nunca un cero).
 *   · ACTUALIZACIÓN — hay dato y se está releyendo: se sigue pintando el dato.
 *   · VACÍO — respondió y no hay nada: el mensaje de vacío de cada pantalla.
 *   · ERROR — falló: el mensaje de error de cada pantalla.
 *
 * Viven aquí, en TypeScript y sobre el sistema de diseño, y las pantallas heredadas sólo los
 * importan: así `verify:aspecto` no ve clases ni textos nuevos en ellas, y la forma de un
 * esqueleto se cambia en un sitio.
 */

/**
 * La espera de un plano de mesas: un indicador al centro del lienzo, que ya tiene su alto
 * reservado. NO dibuja mesas —ni en rejilla ni en ninguna posición—: un plano provisional es
 * justo lo que no debe verse, porque se lee como el plano de verdad y se toca.
 */
export function EsperaDelPlano({
  etiqueta = 'Cargando las mesas',
}: {
  readonly etiqueta?: string;
}): ReactElement {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        role="status"
        aria-busy="true"
        aria-label={etiqueta}
        className="flex flex-col items-center gap-(--espacio-3)"
      >
        <Esqueleto redondo className="size-(--altura-control)" />
        <Esqueleto className="h-4 w-40" />
      </div>
    </div>
  );
}

/**
 * Lo mismo que `EsperaDelPlano` para cuando la lectura de las mesas FALLÓ y no hay ningún
 * plano anterior: en el centro del lienzo, con su botón de releer. Un lienzo vacío sin más se
 * lee como «no hay mesas» y manda al mesero a llamar al administrador.
 */
export function ErrorDelPlano({
  queNoSePudoLeer = 'las mesas',
  alReintentar,
}: {
  readonly queNoSePudoLeer?: string;
  readonly alReintentar: () => void;
}): ReactElement {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-(--espacio-4)">
      <ErrorDeLectura queNoSePudoLeer={queNoSePudoLeer} alReintentar={alReintentar} />
    </div>
  );
}

/** La fila de pestañas de zonas (o de categorías) mientras todavía no se sabe cuáles hay. */
export function EsqueletoDePestanas({
  cantidad = 3,
}: {
  readonly cantidad?: number;
}): ReactElement {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando las zonas"
      className="flex gap-(--espacio-2)"
    >
      {Array.from({ length: cantidad }, (_, indice) => (
        <Esqueleto key={indice} className="h-8 w-24 rounded-full" />
      ))}
    </div>
  );
}

/**
 * La lectura falló y no hay NINGÚN dato anterior que enseñar. Se dice qué no se pudo leer y
 * se ofrece releer; nunca se pinta un vacío, que se leería como «no hay nada» y mandaría a
 * la cajera a cobrar de memoria.
 *
 * Si ya había un dato, no es esto: se sigue enseñando el último y la próxima lectura lo
 * corrige.
 */
export function ErrorDeLectura({
  queNoSePudoLeer,
  alReintentar,
  className,
}: {
  /** Lo que no se pudo leer, en la voz de la pantalla: «las mesas», «los cobros pendientes». */
  readonly queNoSePudoLeer: string;
  readonly alReintentar: () => void;
  readonly className?: string;
}): ReactElement {
  return (
    <ErrorDePantalla
      className={className}
      titulo={`No se pudo leer ${queNoSePudoLeer}`}
      queHacer="Revisa la conexión y vuelve a intentarlo. Mientras tanto no se muestra nada para no darte un dato falso."
      reintentar={
        <Button type="button" onClick={alReintentar}>
          Volver a intentar
        </Button>
      }
    />
  );
}

/** Filas con la forma de una lista de tarjetas o renglones; reserva el alto de `filas` filas. */
export function EsqueletoDeFilas({
  filas = 4,
  className,
}: {
  readonly filas?: number;
  readonly className?: string;
}): ReactElement {
  return <EsqueletoDeLista filas={filas} className={className} />;
}

/** Un bloque que reserva el lugar de una tarjeta o de una franja de cifras que todavía no llegan. */
export function EsqueletoDeBloque({
  etiqueta = 'Cargando',
  conSeparacion = false,
}: {
  readonly etiqueta?: string;
  /** Deja el aire de arriba que lleva la tarjeta a la que sustituye. */
  readonly conSeparacion?: boolean;
}): ReactElement {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={etiqueta}
      className={conSeparacion ? 'mt-(--espacio-4)' : undefined}
    >
      <Esqueleto className="h-16 w-full" />
    </div>
  );
}

/** Las clases, escritas enteras: Tailwind no ve las que se arman con texto. */
const COLUMNAS_EN_PANTALLA_GRANDE = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
} as const;

/**
 * Una hilera de cifras del tablero (ventas, costo, utilidad…): cada una reserva el alto de una
 * tarjeta, para que al llegar los números nada se mueva y nadie lea un `$0.00` que no es.
 */
export function EsqueletoDeCifras({
  cantidad = 4,
  etiqueta = 'Cargando las cifras',
  className,
}: {
  readonly cantidad?: 2 | 3 | 4 | 5;
  readonly etiqueta?: string;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={etiqueta}
      className={`grid grid-cols-2 gap-(--espacio-3) ${COLUMNAS_EN_PANTALLA_GRANDE[cantidad]} ${className ?? ''}`}
    >
      {Array.from({ length: cantidad }, (_, indice) => (
        <div
          key={indice}
          className="flex flex-col gap-(--espacio-2) rounded-lg border border-borde p-(--espacio-4)"
        >
          <Esqueleto className="h-3 w-20" />
          <Esqueleto className="h-7 w-28" />
          <Esqueleto className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
