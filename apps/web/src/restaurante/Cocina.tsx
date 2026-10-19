'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@morphiqpos/ui/primitivas/tabs';
import {
  Aviso,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Vacio,
  type NivelDeElevacion,
} from '@morphiqpos/ui/sistema';
import { Check, Clock, Flame, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · restaurante · cocina
 *
 * El tablero de la cocina: encendido todo el turno, mirado de reojo, a dos
 * metros, con las manos ocupadas. Todo lo de este archivo sale de ahí.
 *
 * ── Tres columnas y no una lista con estados ─────────────────────────────
 * A dos metros la POSICIÓN de una tarjeta dice su estado más rápido que
 * cualquier etiqueta, y moverla de columna es un toque que cambia lo que ve
 * todo el mundo. El color nunca va solo: cada columna trae palabra, conteo e
 * icono. Y el rojo no es de aquí: queda para lo que está MAL —la alergia—,
 * porque si significara «apúrate», el día que signifique «alguien se puede
 * morir» ya nadie lo miraría.
 *
 * ── El tiempo: sin umbral, y sin mover nada bajo el dedo ─────────────────
 * El reloj de la tarjeta no tiene color: es el hueco de F-315, y sin saber que
 * la arrachera tarda 14 minutos y el pescado 22, «hace 9 minutos» no significa
 * nada. El refresco es cada 2 s, pero el orden dentro de cada columna es la
 * fecha de creación ASCENDENTE: lo nuevo se añade al final y nada salta de
 * sitio. El toque pinta primero y confirma después, y mientras viaja no se
 * relee: una respuesta vieja devolvería la tarjeta a su columna anterior.
 *
 * ── Cada columna se desplaza sola ────────────────────────────────────────
 * Desde la tableta de la pared hacia arriba, el tablero ocupa el alto exacto de
 * la pantalla y cada columna tiene su propio desplazamiento: bajar por los
 * nuevos no se lleva las bandas ni las otras dos columnas fuera de la vista. Lo
 * que se agranda en la PC es lo que se lee desde la plancha —la mesa, los
 * platillos, el botón—, no el relleno.
 *
 * ── Un fallo de red no vacía el tablero ──────────────────────────────────
 * Si nunca se leyó nada, la pantalla lo dice y ofrece leer ya; si ya había
 * tablero, se queda el último conocido con un aviso encima. Una cocina sin
 * tablero se para, y un dato de hace diez segundos todavía sirve.
 *
 * ── Lo que NO va aquí, y lo que hubo que recortar ────────────────────────
 * Ni precios, ni totales, ni propinas, ni nombres de comensales: ningún dato de
 * dinero, y no porque la pantalla no los pinte —el servidor no los manda—. Por
 * tamaño quedan fuera las estaciones enteras (filtro, pantalla de bloqueo y
 * vista agrupada por mesa), que piden resolver la sesión en el servidor, y del
 * encabezado el reloj absoluto y el aviso sonoro.
 */

/**
 * Las tres columnas, en el orden exacto de la jerarquía de la pantalla.
 *
 * Los colores son los semánticos del sistema aplicados al giro: `info` para lo
 * que espera, `advertencia` para lo que está en curso, `exito` para lo que ya
 * salió. Y la jerarquía también se ve en la altura: las listas ya no piden
 * trabajo, así que sus tarjetas se quedan pegadas al fondo (`nivel` 0).
 */
const COLUMNAS: readonly {
  readonly estado: 'nuevo' | 'en_preparacion' | 'listo';
  readonly Icono: typeof Clock;
  readonly titulo: string;
  readonly corto: string;
  readonly accion: string;
  readonly destino: 'en_preparacion' | 'listo' | 'entregado';
  readonly banda: string;
  readonly tinte: string;
  readonly nivel: NivelDeElevacion;
}[] = [
  {
    estado: 'nuevo',
    // El icono NO es decoración en una pantalla de cocina: se lee a dos metros,
    // con vapor y con las manos ocupadas, y la forma se reconoce antes que la
    // palabra. Antes eran emoji —🕐 🔥 ✅— y un emoji lo dibuja el sistema: el
    // mismo carácter salía de un color en el Windows del negocio, de otro en el
    // Android del repartidor, y no heredaba el color de su banda.
    Icono: Clock,
    titulo: 'Nuevos',
    corto: 'Nuevos',
    accion: 'Iniciar',
    destino: 'en_preparacion',
    banda: 'bg-info text-info-texto',
    tinte: 'bg-info/10',
    nivel: 1,
  },
  {
    estado: 'en_preparacion',
    Icono: Flame,
    titulo: 'En preparación',
    corto: 'En prep.',
    accion: 'Marcar listo',
    destino: 'listo',
    banda: 'bg-advertencia text-advertencia-texto',
    tinte: 'bg-advertencia/10',
    nivel: 1,
  },
  {
    estado: 'listo',
    Icono: Check,
    titulo: 'Listos',
    corto: 'Listos',
    accion: 'Quitar de la lista',
    destino: 'entregado',
    banda: 'bg-exito text-exito-texto',
    tinte: 'bg-exito/10',
    nivel: 0,
  },
];

type Col = (typeof COLUMNAS)[number];
type EstadoDestino = Col['destino'];

const RUTA_TRANSICION = '/api/restaurante/transicionar-pedido';
const TELEFONO = '(max-width: 767px)';
const BANDA =
  'flex items-center justify-between gap-(--espacio-2) px-(--espacio-3) py-(--espacio-2) text-sm font-bold tracking-wide uppercase xl:text-base';

export interface ItemDeComanda {
  readonly id: string;
  readonly producto_nombre: string | null;
  readonly cantidad: number | null;
  readonly notas: string | null;
}

/**
 * Los nombres son los del PUENTE, en snake_case, y no se traducen al entrar: el
 * único sitio donde se decide cómo se llama un campo es `puente/mapa.ts`.
 */
export interface ComandaDeCocina {
  readonly id: string;
  readonly estado: string;
  readonly mesa_numero: number | null;
  readonly created_date: string | null;
  readonly notas_alergias: string | null;
  readonly items: readonly ItemDeComanda[];
}

/** «hace 9 minutos», con las palabras que el cocinero usa de verdad. */
export function haceCuanto(desde: string | null, ahora: number): string {
  if (desde === null) return 'recién';
  const minutos = Math.floor((ahora - new Date(desde).getTime()) / 60_000);
  if (Number.isNaN(minutos) || minutos < 1) return 'hace menos de un minuto';
  return minutos === 1 ? 'hace 1 minuto' : `hace ${minutos} minutos`;
}

/** Las de una columna, siempre de la más vieja a la más nueva. */
function deLaColumna(todas: readonly ComandaDeCocina[], estado: string) {
  return todas
    .filter((c) => c.estado === estado)
    .sort((a, b) => (a.created_date ?? '').localeCompare(b.created_date ?? ''));
}

/** En JS y no con `hidden md:*`: así no se pinta cada tarjeta dos veces. */
function useEsTelefono(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const medio = window.matchMedia(TELEFONO);
      medio.addEventListener('change', avisar);
      return () => {
        medio.removeEventListener('change', avisar);
      };
    },
    () => window.matchMedia(TELEFONO).matches,
    () => false,
  );
}

export interface CocinaProps {
  /** Cuando llega, la pantalla no consulta ni refresca: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly ComandaDeCocina[];
}

export function Cocina({ filasIniciales }: CocinaProps) {
  const voc = useVocabulario();
  const [comandas, setComandas] = useState<readonly ComandaDeCocina[] | null>(
    filasIniciales ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(0);
  // El botón de «leer ya» sube este número y el efecto vuelve a arrancar. El
  // error se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const enVuelo = useRef(0);
  const esTelefono = useEsTelefono();

  // `ahora` nace en 0 y no en Date.now(): un reloj sembrado en el servidor es un
  // desajuste de hidratación garantizado.
  useEffect(() => {
    let vivo = true;
    const refrescar = (): void => {
      setAhora(Date.now());
      if (filasIniciales !== undefined || enVuelo.current > 0) return;
      consultarPuente<ComandaDeCocina>('PedidoPreparacion', { limite: 120 })
        .then((filas) => {
          if (!vivo) return;
          setComandas(filas);
          setError(null);
        })
        .catch((fallo: unknown) => {
          // El tablero NUNCA se vacía por un fallo de red: una cocina sin
          // tablero se para, y un dato de hace diez segundos todavía sirve.
          if (vivo)
            setError(
              fallo instanceof Error
                ? fallo.message
                : `No se pudo leer ${voc.enFrase('preparacion')}.`,
            );
        });
    };
    refrescar();
    const reloj = setInterval(refrescar, 2000);
    return () => {
      vivo = false;
      clearInterval(reloj);
    };
  }, [filasIniciales, voc, intento]);

  const grupos = useMemo(
    () => COLUMNAS.map((col) => ({ col, filas: deLaColumna(comandas ?? [], col.estado) })),
    [comandas],
  );

  const avanzar = useCallback(async (comanda: ComandaDeCocina, destino: EstadoDestino) => {
    // Pinta primero: un toque que tarda medio segundo en verse se repite, y un
    // toque repetido en cocina es un plato que sale dos veces.
    const mover = (estado: string) => (previas: readonly ComandaDeCocina[] | null) =>
      previas === null ? previas : previas.map((c) => (c.id === comanda.id ? { ...c, estado } : c));
    setComandas(mover(destino));
    enVuelo.current += 1;
    try {
      // `transicionar_pedido` (E6-6) rechaza el retroceso solo: dos pantallas de
      // cocina abiertas a la vez no se pisan.
      await invocarComando(RUTA_TRANSICION, { comandaId: comanda.id, estado: destino });
    } catch (fallo: unknown) {
      setComandas(mover(comanda.estado));
      setError(fallo instanceof Error ? fallo.message : 'No se pudo mover la comanda.');
    } finally {
      enVuelo.current -= 1;
    }
  }, []);

  function leerYa(): void {
    setError(null);
    setIntento((previo) => previo + 1);
  }

  if (comandas === null) {
    // Nunca se leyó nada: no hay «último tablero conocido» que enseñar. El
    // refresco sigue intentándolo solo; el botón es para no esperar dos segundos.
    if (error !== null) {
      return (
        <div className="mx-auto flex min-h-dvh max-w-lg items-center p-(--espacio-6)">
          <ErrorDePantalla
            titulo={`No se pudo leer el tablero de ${voc.enFrase('preparacion')}`}
            queHacer="La pantalla lo vuelve a intentar sola cada 2 segundos. Si no aparece, revisa la conexión de este equipo: lo que se mandó desde el salón sigue guardado y aparece en cuanto se lea."
            detalle={error}
            reintentar={<Button onClick={leerYa}>Volver a intentar</Button>}
          />
        </div>
      );
    }
    return <TableroCargando etiqueta={`Cargando ${voc.enFrase('preparacion')}`} />;
  }

  const columnas = grupos.map(({ col, filas }) => (
    <Columna key={col.estado} col={col} filas={filas} ahora={ahora} onAvanzar={avanzar} />
  ));

  return (
    <div className="flex min-h-dvh flex-col gap-(--espacio-3) bg-fondo p-(--espacio-3) text-texto md:h-dvh xl:gap-(--espacio-4) xl:p-(--espacio-4)">
      <h1 className="text-xl font-bold tracking-wide uppercase">{voc.titulo('preparacion')}</h1>
      {error !== null && (
        <Aviso tono="peligro" titulo={error}>
          Se muestra el último tablero conocido.
        </Aviso>
      )}
      {comandas.length === 0 ? (
        // El único vacío de la aplicación que es una BUENA noticia, y se ve así:
        // el tipo más grande de la pantalla, en verde y sin una sola disculpa. Es
        // el vacío que ES la pantalla (`protagonista`: el título en el paso
        // `display`), porque se lee desde la plancha, a dos metros, sin acercarse.
        <Vacio
          icono={<Check />}
          titulo="Sin comandas pendientes."
          explicacion="Lo que se envíe desde el salón aparece aquí solo."
          tamano="protagonista"
          tono="exito"
          className="flex-1"
        />
      ) : esTelefono ? (
        <Tabs defaultValue="nuevo">
          <TabsList className="w-full">
            {grupos.map(({ col, filas }) => (
              <TabsTrigger key={col.estado} value={col.estado}>
                <col.Icono aria-hidden="true" className="mr-1 inline size-4 shrink-0" />
                {col.corto} ({filas.length})
              </TabsTrigger>
            ))}
          </TabsList>
          {grupos.map(({ col }, indice) => (
            <TabsContent key={col.estado} value={col.estado}>
              {columnas[indice]}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="grid flex-1 gap-(--espacio-3) md:min-h-0 md:grid-cols-3 md:grid-rows-1 xl:gap-(--espacio-4)">
          {columnas}
        </div>
      )}
    </div>
  );
}

/**
 * Esqueletos con la forma del tablero —la banda y dos tarjetas por columna—: al
 * llegar los datos nada salta de sitio. En el teléfono queda una sola columna,
 * y la banda hace de la fila de pestañas.
 */
function TableroCargando({ etiqueta }: { readonly etiqueta: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={etiqueta}
      className="flex min-h-dvh flex-col gap-(--espacio-3) bg-fondo p-(--espacio-3) xl:gap-(--espacio-4) xl:p-(--espacio-4)"
    >
      <Esqueleto className="h-[calc(var(--altura-control)*0.7)] w-40" />
      <div className="grid flex-1 gap-(--espacio-3) md:grid-cols-3 xl:gap-(--espacio-4)">
        {COLUMNAS.map((col, indice) => (
          <div
            key={col.estado}
            className={`flex flex-col gap-(--espacio-3) ${indice > 0 ? 'max-md:hidden' : ''}`}
          >
            <Esqueleto className="h-(--altura-control) w-full" />
            <Esqueleto className="h-48 w-full rounded-lg" />
            <Esqueleto className="h-36 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface ColumnaProps {
  readonly col: Col;
  readonly filas: readonly ComandaDeCocina[];
  readonly ahora: number;
  readonly onAvanzar: (comanda: ComandaDeCocina, destino: EstadoDestino) => Promise<void>;
}

function Columna({ col, filas, ahora, onAvanzar }: ColumnaProps) {
  return (
    <Superficie
      como="section"
      nivel={0}
      relleno={0}
      aria-labelledby={`col-${col.estado}`}
      className={`flex flex-col overflow-hidden md:min-h-0 ${col.tinte}`}
    >
      <h2 id={`col-${col.estado}`} className={`${BANDA} ${col.banda}`}>
        <span className="inline-flex items-center gap-(--espacio-2)">
          <col.Icono aria-hidden="true" className="size-4 shrink-0 xl:size-5" />
          {col.titulo}
        </span>
        <span className="font-numeros tabular-nums">({filas.length})</span>
      </h2>
      {/* Una lista ORDENADA: la de arriba es la más vieja, y ése es el orden en
          que se prepara. */}
      <ol className="flex flex-col gap-(--espacio-3) p-(--espacio-3) md:min-h-0 md:flex-1 md:overflow-y-auto">
        {filas.map((comanda) => (
          <Tarjeta
            key={comanda.id}
            col={col}
            comanda={comanda}
            ahora={ahora}
            onAvanzar={onAvanzar}
          />
        ))}
      </ol>
    </Superficie>
  );
}

interface TarjetaProps {
  readonly col: Col;
  readonly comanda: ComandaDeCocina;
  readonly ahora: number;
  readonly onAvanzar: ColumnaProps['onAvanzar'];
}

/**
 * La comanda: la mesa grande, el tiempo sin color, los platillos con su cantidad
 * alineada en su propia columna —se cuentan platos, no se leen frases—, la
 * alergia en rojo y el botón que la mueve, a todo lo ancho.
 */
function Tarjeta({ col, comanda, ahora, onAvanzar }: TarjetaProps) {
  const mesa = comanda.mesa_numero === null ? 'Para llevar' : `Mesa ${comanda.mesa_numero}`;
  const titulo = `comanda-${comanda.id}`;
  return (
    <Superficie
      como="li"
      nivel={col.nivel}
      radio="md"
      relleno={3}
      aria-labelledby={titulo}
      className="flex flex-col gap-(--espacio-2) xl:gap-(--espacio-3) xl:p-(--espacio-4)"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-(--espacio-2)">
        <h3 id={titulo} className="text-xl font-bold xl:text-2xl">
          {mesa}
        </h3>
        <span className="text-sm text-texto-sutil tabular-nums xl:text-base">
          {haceCuanto(comanda.created_date, ahora)}
        </span>
      </div>
      <ul className="flex flex-col gap-(--espacio-1) text-base xl:text-lg">
        {comanda.items.map((item) => (
          <li key={item.id} className="grid grid-cols-[3ch_minmax(0,1fr)] gap-x-(--espacio-2)">
            <span className="text-right font-numeros font-bold tabular-nums">
              {item.cantidad ?? 1}
            </span>
            <span>{item.producto_nombre ?? 'Producto sin nombre'}</span>
            {item.notas !== null && item.notas !== '' && (
              <span className="col-start-2 text-sm text-texto-sutil xl:text-base">
                {item.notas}
              </span>
            )}
          </li>
        ))}
      </ul>
      {/* No se colapsa ni espera a que nadie la pida: es lo único de toda la
          aplicación que se enseña sin haberlo pedido. Rojo, con icono y con la
          palabra: el color nunca va solo. */}
      {comanda.notas_alergias !== null && comanda.notas_alergias !== '' && (
        <Superficie
          como="p"
          nivel={0}
          radio="md"
          relleno={0}
          className="flex items-start gap-(--espacio-2) border-peligro bg-peligro/15 px-(--espacio-3) py-(--espacio-2) text-sm font-bold xl:text-base"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-peligro" />
          <span>ALERGIA: {comanda.notas_alergias}</span>
        </Superficie>
      )}
      <Button
        size="lg"
        className="mt-(--espacio-1) w-full"
        variant={col.destino === 'entregado' ? 'outline' : 'default'}
        aria-label={`${col.accion} — ${mesa}`}
        onClick={() => {
          void onAvanzar(comanda, col.destino);
        }}
      >
        {col.accion}
      </Button>
    </Superficie>
  );
}
