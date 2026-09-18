'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@morphiqpos/ui/primitivas/tabs';
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
 * todo el mundo. El color nunca va solo: cada columna trae palabra, conteo y
 * emoji. Y el rojo no es de aquí: queda para lo que está MAL —la alergia—,
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
 * ── Lo que NO va aquí, y lo que hubo que recortar ────────────────────────
 * Ni precios, ni totales, ni propinas, ni nombres de comensales: ningún dato de
 * dinero, y no porque la pantalla no los pinte —el servidor no los manda—. Por
 * tamaño quedan fuera las estaciones enteras (filtro, pantalla de bloqueo y
 * vista agrupada por mesa), que piden resolver la sesión en el servidor, y del
 * encabezado el reloj absoluto y el aviso sonoro.
 */

/** Las tres columnas, en el orden exacto de la jerarquía de la pantalla. */
const COLUMNAS = [
  {
    estado: 'nuevo',
    titulo: '🕐 Nuevos',
    corto: '🕐 Nuevos',
    accion: 'Iniciar',
    destino: 'en_preparacion',
    banda: 'bg-primary text-primary-foreground',
    tinte: 'bg-primary/10',
  },
  {
    estado: 'en_preparacion',
    titulo: '🔥 En preparación',
    corto: '🔥 En prep.',
    accion: 'Marcar listo',
    destino: 'listo',
    banda: 'bg-warning text-warning-foreground',
    tinte: 'bg-warning/10',
  },
  {
    estado: 'listo',
    titulo: '✅ Listos',
    corto: '✅ Listos',
    accion: 'Quitar de la lista',
    destino: 'entregado',
    banda: 'bg-success text-success-foreground',
    tinte: 'bg-success/10',
  },
] as const;

type Col = (typeof COLUMNAS)[number];
type EstadoDestino = Col['destino'];

const RUTA_TRANSICION = '/api/restaurante/transicionar-pedido';
const TELEFONO = '(max-width: 767px)';
const SECCION = 'flex flex-col gap-3 rounded-lg border border-border pb-3';
const BANDA = 'flex justify-between px-3 py-2 text-sm font-bold tracking-wide uppercase';
const TARJETA = 'mx-3 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-1';
const ALERGIA = 'mt-2 rounded-md border border-destructive bg-destructive/15 p-2 text-sm font-bold';

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
  }, [filasIniciales, voc]);

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

  // Esqueletos con la forma de las columnas: la pantalla no salta al cargar.
  if (comandas === null) {
    return (
      <div className="grid min-h-dvh gap-4 p-4 md:grid-cols-3">
        {COLUMNAS.map((col) => (
          <Skeleton key={col.estado} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const columnas = grupos.map(({ col, filas }) => (
    <Columna key={col.estado} col={col} filas={filas} ahora={ahora} onAvanzar={avanzar} />
  ));

  return (
    <div className="flex min-h-dvh flex-col gap-4 bg-background p-4 text-foreground">
      <h1 className="text-xl font-bold tracking-wide uppercase">{voc.titulo('preparacion')}</h1>
      {error !== null && (
        <p role="alert" className="rounded-md border border-destructive p-2 text-sm">
          {error} · Se muestra el último tablero conocido.
        </p>
      )}
      {comandas.length === 0 ? (
        // El único vacío de la aplicación que es una BUENA noticia, y se ve así:
        // el tipo más grande de la pantalla, y sin una sola disculpa.
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg bg-success/15 p-8 text-center">
          <p className="text-4xl font-bold sm:text-5xl">Sin comandas pendientes.</p>
          <p className="text-muted-foreground">Lo que se envíe desde el salón aparece aquí solo.</p>
        </div>
      ) : esTelefono ? (
        <Tabs defaultValue="nuevo">
          <TabsList className="w-full">
            {grupos.map(({ col, filas }) => (
              <TabsTrigger key={col.estado} value={col.estado}>
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
        <div className="grid flex-1 gap-4 md:grid-cols-3">{columnas}</div>
      )}
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
    <section aria-labelledby={`col-${col.estado}`} className={`${SECCION} ${col.tinte}`}>
      <h2 id={`col-${col.estado}`} className={`${BANDA} ${col.banda}`}>
        <span>{col.titulo}</span>
        <span>({filas.length})</span>
      </h2>
      {filas.map((comanda) => {
        const mesa = comanda.mesa_numero === null ? 'Para llevar' : `Mesa ${comanda.mesa_numero}`;
        return (
          <article key={comanda.id} className={TARJETA}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-bold">{mesa}</h3>
              <span className="text-xs text-muted-foreground">
                {haceCuanto(comanda.created_date, ahora)}
              </span>
            </div>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {comanda.items.map((item) => (
                <li key={item.id}>
                  <span className="font-semibold">{item.cantidad ?? 1}</span>{' '}
                  {item.producto_nombre ?? 'Producto sin nombre'}
                  {item.notas !== null && item.notas !== '' && (
                    <span className="block pl-4 text-xs text-muted-foreground">{item.notas}</span>
                  )}
                </li>
              ))}
            </ul>
            {/* No se colapsa ni espera a que nadie la pida: es lo único de toda
                la aplicación que se enseña sin haberlo pedido. */}
            {comanda.notas_alergias !== null && comanda.notas_alergias !== '' && (
              <p className={ALERGIA}>⚠️ ALERGIA: {comanda.notas_alergias}</p>
            )}
            <Button
              className="mt-3 w-full"
              variant={col.destino === 'entregado' ? 'outline' : 'default'}
              aria-label={`${col.accion} — ${mesa}`}
              onClick={() => {
                void onAvanzar(comanda, col.destino);
              }}
            >
              {col.accion}
            </Button>
          </article>
        );
      })}
    </section>
  );
}
