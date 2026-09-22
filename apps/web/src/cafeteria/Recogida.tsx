'use client';

import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useRef, useState } from 'react';

import { consultarPuente } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · cafeteria · recogida
 *
 * La que mira el cliente (F-329). No se opera: se lee. Su único trabajo es que
 * la persona que está parada sepa que lo suyo ya está.
 *
 * ── Por qué es una SALIDA y no una interfaz ──────────────────────────────
 * Es la única pantalla del sistema dirigida a alguien sin sesión, sin
 * dispositivo y sin idea de que existe un punto de venta. Eso la saca de todas
 * las reglas normales: no hay navegación, ni menú, ni logotipo grande, ni
 * promociones — una pantalla de recogida con publicidad es una pantalla que la
 * gente deja de mirar. Y si el monitor resulta ser táctil, la entrada se apaga
 * aquí con `pointer-events-none`: nadie debe poder cambiar nada desde el salón.
 *
 * ── Por qué el nombre que acaba de salir se queda 20 segundos ────────────
 * Veinte segundos es lo que tarda alguien en levantar la vista del teléfono,
 * oír su nombre por segunda vez y caminar. Pasados, baja a «también listos» y
 * le deja el sitio al siguiente. Cuando nadie acabó de salir no queda un hueco:
 * los listos se reparten la pantalla en una rejilla y siguen siendo enormes,
 * porque el vacío visual también enseña — y lo que enseñaría es que la pantalla
 * está apagada.
 *
 * ── Por qué la voz va siempre con el texto, y nunca sola ─────────────────
 * Medio salón está mirando el teléfono y la otra mitad está de espaldas. El
 * texto y el sonido van juntos: nada depende sólo de uno de los dos. La primera
 * lectura SIEMBRA los nombres sin hablar; al encender el monitor a media mañana
 * hay ocho pedidos listos y ninguno es noticia.
 *
 * ── Por qué el error es un punto discreto y no una banda roja ────────────
 * Quien lee es un cliente, no un operador. La pantalla nunca se pone en blanco
 * ni enseña un mensaje técnico: mantiene los últimos nombres y enciende un
 * punto con su palabra al lado — el color nunca va solo. La banda de error que
 * llevan las pantallas de trabajo aquí sería ruido volcado al salón.
 *
 * ── Por qué sólo el nombre de pila ───────────────────────────────────────
 * «Mariana Gutiérrez» a 96 px delante de quince desconocidos es una fuga de
 * datos personales, no una cortesía. Se corta en el primer espacio y ya.
 *
 * ── Layout único, a propósito ────────────────────────────────────────────
 * No tiene versión de tablet ni de teléfono porque no tendría sentido: es un
 * monitor colgado o parado sobre la barra. Lo que sí escala es el tipo, con
 * `clamp` sobre el ancho del viewport, para que el mismo cartel quepa en un
 * monitor de 24 pulgadas y en el televisor de 50 sin recortarse. El mínimo del
 * nombre destacado son 96 px: legible a cinco metros y de reojo.
 *
 * ── Lo que queda fuera, y por qué ────────────────────────────────────────
 * El TEMA CLARO FIJO que pide el documento —esta pantalla se ve contra una
 * ventana con sol— no se resuelve desde el componente: exigiría colores
 * literales, que la puerta de primitivas prohíbe. Se fija en el dispositivo.
 * Y el puente todavía no expone `nombre_pedido`: hasta que lo haga, la pantalla
 * llama por las últimas cuatro del folio, que es lo que trae el ticket.
 */

/** Lo que dura destacado el último en salir. El documento dice veinte. */
const MS_DESTACADO = 20_000;
/** Mismo latido que la barra: su botón enciende este cartel, y se tiene que notar. */
const MS_REFRESCO = 2000;

const MARCO =
  'pointer-events-none flex min-h-dvh select-none flex-col justify-between gap-(--espacio-8) ' +
  'bg-fondo p-(--espacio-8) text-texto';
const ZONA =
  'flex w-full flex-1 flex-col items-center justify-center gap-(--espacio-6) text-center';
const ROTULO =
  'text-[clamp(1.25rem,3vw,2.5rem)] font-semibold uppercase tracking-[0.4em] text-texto-sutil';
const NOMBRE_ENORME = 'text-[clamp(6rem,17vw,17rem)] font-black uppercase leading-none break-words';
const NOMBRE_GRANDE = 'text-[clamp(3rem,9vw,7rem)] font-black uppercase leading-none break-words';
const NOMBRE_MEDIO = 'text-[clamp(1.75rem,5vw,4rem)] font-bold uppercase leading-none';

export interface PedidoListo {
  readonly id: string;
  readonly estado: string;
  /** Nombre de PILA. Nunca el completo: esto se lee desde la calle. */
  readonly nombre_pedido: string | null;
  readonly fecha_listo: string | null;
}

export interface RecogidaProps {
  /** Cuando llega, la pantalla no consulta ni refresca: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly PedidoListo[];
  /** Sale de la configuración del negocio. La pantalla no lo inventa. */
  readonly nombreNegocio?: string;
}

export interface Reparto {
  readonly destacado: PedidoListo | null;
  readonly tambien: readonly PedidoListo[];
}

/** El nombre que se canta. Se corta en el primer espacio, siempre. */
export function nombreVisible(pedido: PedidoListo): string {
  const pila = (pedido.nombre_pedido ?? '').trim().split(/\s+/)[0] ?? '';
  if (pila !== '') return pila;
  return pedido.id.slice(-4).toUpperCase();
}

/** Ventana cerrada por los dos lados: una fecha del futuro no destaca nada. */
export function esReciente(fecha: string | null, ahora: number, ms: number): boolean {
  if (fecha === null || ahora === 0) return false;
  const transcurrido = ahora - new Date(fecha).getTime();
  return !Number.isNaN(transcurrido) && transcurrido >= 0 && transcurrido < ms;
}

/** Los listos, el último en salir primero. */
export function listosPorSalida(filas: readonly PedidoListo[]): readonly PedidoListo[] {
  return filas
    .filter((pedido) => pedido.estado === 'listo')
    .sort((a, b) => (b.fecha_listo ?? '').localeCompare(a.fecha_listo ?? ''));
}

/** Separa al que acaba de salir del resto. Es toda la jerarquía de la pantalla. */
export function repartir(filas: readonly PedidoListo[], ahora: number): Reparto {
  const listos = listosPorSalida(filas);
  const primero = listos[0];
  if (primero !== undefined && esReciente(primero.fecha_listo, ahora, MS_DESTACADO)) {
    return { destacado: primero, tambien: listos.slice(1) };
  }
  return { destacado: null, tambien: listos };
}

/**
 * El tipo dice que la síntesis de voz siempre está; el navegador de un monitor
 * viejo dice que no. La anotación es la que hace necesaria la guarda.
 */
function hablar(nombre: string): void {
  // El tipo de `window` promete que `speechSynthesis` siempre está; el
  // navegador de un monitor viejo colgado sobre la barra dice otra cosa. Se
  // lee por una forma que SÍ admite el hueco, para que la guarda de abajo no
  // sea código muerto a ojos del compilador.
  const { speechSynthesis: sintesis } = window as { speechSynthesis?: SpeechSynthesis };
  if (sintesis === undefined) return;
  const frase = new SpeechSynthesisUtterance(`${nombre}, tu pedido está listo.`);
  frase.lang = 'es-MX';
  sintesis.speak(frase);
}

/** Canta lo que ACABA de entrar. La primera lectura sólo siembra el registro. */
function anunciar(
  registro: { current: ReadonlySet<string> | null },
  listos: readonly PedidoListo[],
): void {
  const previos = registro.current;
  registro.current = new Set(listos.map((pedido) => pedido.id));
  if (previos === null) return;
  for (const pedido of listos) {
    if (!previos.has(pedido.id)) hablar(nombreVisible(pedido));
  }
}

export function Recogida({ filasIniciales, nombreNegocio }: RecogidaProps) {
  const voc = useVocabulario();
  const [pedidos, setPedidos] = useState<readonly PedidoListo[] | null>(filasIniciales ?? null);
  const [sinConexion, setSinConexion] = useState(false);
  const [ahora, setAhora] = useState(0);
  const anunciados = useRef<ReadonlySet<string> | null>(null);

  // `ahora` nace en 0 y no en Date.now(): un reloj sembrado en el servidor es
  // un desajuste de hidratación garantizado.
  useEffect(() => {
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;

    const latir = (): void => {
      setAhora(Date.now());
      if (filasIniciales !== undefined) return;
      consultarPuente<PedidoListo>('PedidoPreparacion', { limite: 40, signal: control.signal })
        .then((filas) => {
          if (!sigueMontada()) return;
          setPedidos(filas);
          setSinConexion(false);
          anunciar(anunciados, listosPorSalida(filas));
        })
        .catch(() => {
          // Ni se vacía ni enseña el fallo: se queda el último cartel y se
          // enciende el punto de la esquina.
          if (sigueMontada()) setSinConexion(true);
        });
    };

    // El primer latido va en un `setTimeout` y no en el cuerpo del efecto:
    // escribir estado aquí de forma síncrona es lo que caza set-state-in-effect.
    const arranque = setTimeout(latir);
    const latido = setInterval(latir, MS_REFRESCO);
    return () => {
      control.abort();
      clearTimeout(arranque);
      clearInterval(latido);
    };
  }, [filasIniciales]);

  if (pedidos === null) {
    return (
      <main className={MARCO} aria-label="Pantalla de recogida">
        {/* Esqueletos con la forma del cartel, nunca un disco girando: desde el
            salón se ve una pantalla a punto, no una computadora trabajando. */}
        <div className={ZONA}>
          <Skeleton className="h-5 w-40 rounded-full" />
          <Skeleton className="h-40 w-full max-w-3xl rounded-3xl" />
          <div className="flex flex-wrap justify-center gap-(--espacio-4)">
            <Skeleton className="h-20 w-48 rounded-2xl" />
            <Skeleton className="h-20 w-48 rounded-2xl" />
          </div>
        </div>
      </main>
    );
  }

  const { destacado, tambien } = repartir(pedidos, ahora);

  return (
    <main className={MARCO} aria-label="Pantalla de recogida">
      {destacado !== null ? (
        <section className={ZONA} aria-live="polite">
          {/* La palabra arriba y el nombre debajo: el cartel se entiende sin
              haberlo visto nunca antes, que es el caso de casi todos. */}
          <div className="rounded-[2.5rem] bg-exito/15 px-(--espacio-10) py-(--espacio-12)">
            <p className={ROTULO}>Listo</p>
            <p className={`mt-(--espacio-4) ${NOMBRE_ENORME}`}>{nombreVisible(destacado)}</p>
          </div>
        </section>
      ) : tambien.length > 0 ? (
        // Sin nadie recién salido no queda un hueco: los listos se reparten la
        // pantalla entera y siguen leyéndose desde la puerta.
        <section className={ZONA} aria-live="polite">
          <p className={ROTULO}>Listos</p>
          <ul className="grid gap-x-(--espacio-16) gap-y-(--espacio-8) sm:grid-cols-2 xl:grid-cols-3">
            {tambien.map((pedido) => (
              <li key={pedido.id} className={NOMBRE_GRANDE}>
                {nombreVisible(pedido)}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        // El vacío ENSEÑA: quien lo lee todavía no sabe cómo funciona esto.
        <section className={ZONA}>
          <p className="text-[clamp(2.5rem,7vw,6rem)] leading-tight font-black text-balance">
            Tu nombre aparecerá aquí
          </p>
          <p className="max-w-3xl text-[clamp(1.125rem,2.5vw,2rem)] text-texto-sutil">
            En cuanto tu {voc.singular('unidad_servicio')} esté listo lo verás en esta pantalla y lo
            oirás en voz alta. No tienes que hacer nada.
          </p>
        </section>
      )}

      {destacado !== null && tambien.length > 0 && (
        <section className="flex flex-col items-center gap-(--espacio-4)" aria-live="polite">
          <Separator className="max-w-3xl" />
          <p className="text-[clamp(0.875rem,1.5vw,1.25rem)] tracking-[0.3em] text-texto-sutil uppercase">
            También listos
          </p>
          <ul className="flex flex-wrap items-baseline justify-center gap-x-(--espacio-6) gap-y-(--espacio-3)">
            {tambien.map((pedido, indice) => (
              <li key={pedido.id} className="flex items-baseline gap-x-(--espacio-6)">
                {indice > 0 && (
                  <span aria-hidden className="text-texto-sutil">
                    ·
                  </span>
                )}
                <span className={NOMBRE_MEDIO}>{nombreVisible(pedido)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="flex items-end justify-between gap-(--espacio-4)">
        {sinConexion ? (
          // Un punto y su palabra. Ni «error», ni un código, ni un reintento.
          <p role="alert" className="flex items-center gap-2 text-sm text-texto-sutil">
            <span aria-hidden className="h-3 w-3 rounded-full border border-borde bg-fondo-sutil" />
            Sin conexión · estos son los últimos nombres
          </p>
        ) : (
          <span />
        )}
        {nombreNegocio !== undefined && nombreNegocio !== '' && (
          <p className="text-[clamp(1rem,1.5vw,1.5rem)] font-semibold text-texto-sutil">
            {nombreNegocio}
          </p>
        )}
      </footer>
    </main>
  );
}
