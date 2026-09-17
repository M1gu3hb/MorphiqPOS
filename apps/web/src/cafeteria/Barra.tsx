'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@morphiqpos/ui/primitivas/tabs';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · cafeteria · barra
 *
 * El tablero de despacho (F-328). No se «abre»: vive encendido el turno entero,
 * se mira de reojo entre vapor y se toca con una sola mano.
 *
 * ── Dos columnas y no tres, como la cocina de `restaurante` ──────────────
 * «Preparando» dura lo que tarda en cruzarse la vista: con noventa segundos por
 * bebida el barista toma la tarjeta y la termina sin soltarla. Pedirle «inicié»
 * y luego «terminé» son dos toques donde hace falta uno, ciento sesenta veces
 * al día. La transición ocurre igual, sola, en el servidor, y sirve para el
 * reloj — pero no cuesta un toque.
 *
 * ── El nombre es lo más grande, por encima de la bebida ──────────────────
 * Porque el nombre es lo que se grita. La bebida ya la sabe quien la está
 * haciendo: la tiene en la mano. Lo que hay que leer desde el otro lado de la
 * barra, con los lentes empañados, es a quién se le grita.
 *
 * ── Un botón con dos verbos, y sale gratis ───────────────────────────────
 * Marcar listo sin llamar deja al cliente mirando su vaso en la ventana, y en
 * dos botones alguien acaba tocando sólo el primero. `cafeteria.llamar_pedido`
 * sella `lista_en` en el primer llamado: un comando para los dos efectos.
 *
 * ── El reloj mide desde el COBRO, no desde que se empezó a preparar ──────
 * Es lo que vive el cliente. Ámbar a los 4 minutos, rojo a los 6, y la palabra
 * siempre junto al color: a tres metros el tinte se pierde.
 *
 * ── El refresco no mueve nada debajo del dedo ────────────────────────────
 * Cada 2 s, y dentro de cada columna manda la llegada ASCENDENTE: lo nuevo
 * entra por abajo y nada salta de sitio, porque el barista está a punto de
 * tocar el botón de la primera. Mientras un toque viaja no se relee.
 *
 * ── «nadie vino» aparece al tercer llamado y no antes ────────────────────
 * Ofrecerlo al primero invita a usarlo, y lo que marca es una bebida pagada
 * que se va al corte con su costo.
 *
 * ── Lo que NO va, y lo que hoy no se puede abrir ─────────────────────────
 * Ni catálogo, ni cobro, ni reportes, ni inventario en números. Y **nunca el
 * nombre completo del cliente**: esta pantalla se ve desde el salón. El puente
 * expone `PedidoPreparacion` sin `nombre_pedido`, `llamados` ni `cobrado_en`:
 * el nombre cae a «Sin nombre», las campanas arrancan en cero y se corrigen
 * con el `numeroLlamado` que responde el comando, y el reloj corre desde la
 * creación de la comanda — que en cafetería se escribe en la misma transacción
 * del cobro. Recortados para caber en un archivo: el aviso sonoro con su
 * permiso de audio y el menú «⋯ merma · rehacer · ticket» de la tarjeta.
 */

/** Las cuatro escrituras. Rutas que ya existen; ninguna se inventa aquí. */
const RUTA_LLAMAR = '/api/cafeteria/llamar-pedido';
const RUTA_ENTREGAR = '/api/cafeteria/entregar-pedido';
const RUTA_NO_RECOGIDO = '/api/cafeteria/no-recogido';
const RUTA_DESHACER = '/api/cafeteria/deshacer-entrega';

const TELEFONO = '(max-width: 767px)';
const SEGUNDOS_AMBAR = 240;
const SEGUNDOS_ROJO = 360;
/** El deshacer dura un minuto. El servidor lo valida igual; esto sólo lo pinta. */
const SEGUNDOS_DESHACER = 60;
const LLAMADOS_PARA_ABANDONAR = 3;

const TARJETA = 'rounded-lg border border-border bg-card p-3 text-card-foreground shadow-1';
const CHIP = 'rounded-md px-2 py-1 text-sm font-semibold tabular-nums';
const BANDA = 'rounded-md border border-destructive bg-destructive/15 p-2 text-sm';

export interface ItemDeBarra {
  readonly id: string;
  readonly producto_nombre: string | null;
  readonly cantidad: number | null;
  readonly notas: string | null;
}

/** Los nombres son los del PUENTE, en snake_case. Aquí no se traduce nada. */
export interface PedidoDeBarra {
  readonly id: string;
  readonly estado: string;
  /** El nombre de PILA que se grita. Nunca el completo, nunca el teléfono. */
  readonly nombre_pedido: string | null;
  readonly origen_pedido: string | null;
  readonly created_date: string | null;
  readonly fecha_entregado: string | null;
  readonly notas_alergias: string | null;
  readonly items: readonly ItemDeBarra[];
}

export interface BarraProps {
  /** Cuando llega, la pantalla no consulta ni refresca: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly PedidoDeBarra[];
}

export function segundosDesde(desde: string | null, ahora: number): number {
  if (desde === null || ahora === 0) return 0;
  const segundos = Math.floor((ahora - new Date(desde).getTime()) / 1000);
  return Number.isNaN(segundos) || segundos < 0 ? 0 : segundos;
}

/** `m:ss`, que es como se lee un tiempo de espera de barra. */
export function reloj(segundos: number): string {
  return `${String(Math.floor(segundos / 60))}:${String(segundos % 60).padStart(2, '0')}`;
}

/** El color nunca va solo: cada tramo trae su palabra. */
export function urgencia(segundos: number): { readonly clase: string; readonly palabra: string } {
  if (segundos >= SEGUNDOS_ROJO) return { clase: 'bg-destructive/25', palabra: 'muy tarde' };
  if (segundos >= SEGUNDOS_AMBAR) return { clase: 'bg-warning/30', palabra: 'tarde' };
  return { clase: 'bg-muted text-muted-foreground', palabra: 'a tiempo' };
}

/** Lo nuevo entra por abajo: dentro de la columna manda la hora de llegada. */
export function porLlegada(
  filas: readonly PedidoDeBarra[],
  estados: readonly string[],
): readonly PedidoDeBarra[] {
  return filas
    .filter((pedido) => estados.includes(pedido.estado))
    .sort((a, b) => (a.created_date ?? '').localeCompare(b.created_date ?? ''));
}

/** Sesenta segundos de gracia: deshacer tiene que costar menos que corregir. */
export function entregadosRecientes(
  filas: readonly PedidoDeBarra[],
  ahora: number,
): readonly PedidoDeBarra[] {
  if (ahora === 0) return [];
  return filas.filter(
    (p) => p.estado === 'entregado' && segundosDesde(p.fecha_entregado, ahora) < SEGUNDOS_DESHACER,
  );
}

/**
 * Se decide en JS y no con `hidden md:*` porque la alternativa es pintar cada
 * tarjeta dos veces: el lector de pantalla las leería dos veces.
 */
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

export function Barra({ filasIniciales }: BarraProps) {
  const voc = useVocabulario();
  const [pedidos, setPedidos] = useState<readonly PedidoDeBarra[] | null>(filasIniciales ?? null);
  const [llamados, setLlamados] = useState<Readonly<Record<string, number>>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(0);
  const enVuelo = useRef(0);
  const esTelefono = useEsTelefono();

  // `ahora` nace en 0 y no en Date.now(): un reloj sembrado en el servidor es
  // un desajuste de hidratación garantizado.
  useEffect(() => {
    let vivo = true;
    const refrescar = (): void => {
      setAhora(Date.now());
      if (filasIniciales !== undefined || enVuelo.current > 0) return;
      consultarPuente<PedidoDeBarra>('PedidoPreparacion', { limite: 80 })
        .then((filas) => {
          if (!vivo) return;
          setPedidos(filas);
          setError(null);
        })
        .catch((fallo: unknown) => {
          // La barra NUNCA se vacía por un fallo de red: un dato de hace diez
          // segundos sigue diciendo a quién hay que gritarle.
          if (vivo) setError(fallo instanceof Error ? fallo.message : 'No se pudo leer la fila.');
        });
    };
    refrescar();
    const latido = setInterval(refrescar, 2000);
    return () => {
      vivo = false;
      clearInterval(latido);
    };
  }, [filasIniciales]);

  const ejecutar = useCallback(async (ruta: string, pedidoId: string, llamada: boolean) => {
    setOcupado(pedidoId);
    enVuelo.current += 1;
    try {
      const datos = await invocarComando<{ readonly numeroLlamado?: number }>(
        ruta,
        llamada ? { pedidoId, medio: 'pantalla' } : { pedidoId },
      );
      // El contador autoritativo es el del servidor: dos pantallas de barra
      // abiertas a la vez no se inventan campanas distintas.
      const numero = datos.numeroLlamado;
      if (typeof numero === 'number') setLlamados((prev) => ({ ...prev, [pedidoId]: numero }));
      setError(null);
    } catch (fallo: unknown) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo completar la acción.');
    } finally {
      enVuelo.current -= 1;
      setOcupado(null);
    }
  }, []);

  const enFila = useMemo(() => porLlegada(pedidos ?? [], ['nuevo', 'en_preparacion']), [pedidos]);
  const listos = useMemo(() => porLlegada(pedidos ?? [], ['listo']), [pedidos]);
  const recien = useMemo(() => entregadosRecientes(pedidos ?? [], ahora), [pedidos, ahora]);
  const esperas = [...enFila, ...listos].map((p) => segundosDesde(p.created_date, ahora));
  const promedio =
    esperas.length === 0 ? null : Math.round(esperas.reduce((s, v) => s + v, 0) / esperas.length);

  // Esqueletos con la forma de las tarjetas: la pantalla no salta al cargar.
  if (pedidos === null) {
    return (
      <div className="grid min-h-dvh gap-4 bg-background p-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const columnas = [
    { clave: 'fila', titulo: 'En la fila', filas: enFila, listo: false },
    { clave: 'listos', titulo: 'Listos', filas: listos, listo: true },
  ] as const;
  const secciones = columnas.map((c) => (
    <Columna
      key={c.clave}
      {...c}
      ahora={ahora}
      llamados={llamados}
      ocupado={ocupado}
      onAccion={ejecutar}
    />
  ));

  return (
    <div className="flex min-h-dvh flex-col gap-4 bg-background p-4 text-foreground">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold tracking-wide uppercase">{voc.titulo('preparacion')}</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {promedio === null
            ? `Sin ${voc.plural('unidad_servicio')} en espera`
            : `⏱ prom. en fila ${reloj(promedio)}`}
        </p>
      </header>

      {/* La banda avisa, pero NO vacía la pantalla: debajo sigue la última fila. */}
      {error !== null && (
        <p role="alert" className={BANDA}>
          {error} · Se muestra la última fila conocida.
        </p>
      )}

      {enFila.length === 0 && listos.length === 0 ? (
        // El único vacío de la aplicación que es una BUENA noticia, y se ve así:
        // el tipo más grande de la pantalla, y ni una sola disculpa.
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg bg-success/15 p-8 text-center">
          <p className="text-4xl font-bold sm:text-6xl">La fila está vacía.</p>
          <p className="text-muted-foreground">Buen momento para reponer leche.</p>
        </div>
      ) : esTelefono ? (
        // En teléfono la barra sobrevive entera: una columna y dos pestañas,
        // porque en el turno vespertino vive en el bolsillo del mandil.
        <Tabs defaultValue="fila">
          <TabsList className="w-full">
            {columnas.map((c) => (
              <TabsTrigger key={c.clave} value={c.clave}>
                {c.titulo} ({c.filas.length})
              </TabsTrigger>
            ))}
          </TabsList>
          {columnas.map((c, indice) => (
            <TabsContent key={c.clave} value={c.clave}>
              {secciones[indice]}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="grid flex-1 gap-4 md:grid-cols-2">{secciones}</div>
      )}

      {recien.length > 0 && (
        <footer className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Entregados hace un momento:</span>
          {recien.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant="outline"
              disabled={ocupado === p.id}
              aria-label={`Deshacer la entrega de ${p.nombre_pedido ?? 'un pedido sin nombre'}`}
              onClick={() => {
                void ejecutar(RUTA_DESHACER, p.id, false);
              }}
            >
              {p.nombre_pedido ?? 'Sin nombre'} ↩
            </Button>
          ))}
        </footer>
      )}
    </div>
  );
}

interface ColumnaProps {
  readonly clave: string;
  readonly titulo: string;
  readonly filas: readonly PedidoDeBarra[];
  readonly listo: boolean;
  readonly ahora: number;
  readonly llamados: Readonly<Record<string, number>>;
  readonly ocupado: string | null;
  readonly onAccion: (ruta: string, pedidoId: string, llamada: boolean) => Promise<void>;
}

function Columna({
  clave,
  titulo,
  filas,
  listo,
  ahora,
  llamados,
  ocupado,
  onAccion,
}: ColumnaProps) {
  const id = `columna-${clave}`;
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3"
    >
      <h2 id={id} className="flex justify-between text-sm font-bold tracking-wide uppercase">
        <span>{titulo}</span>
        <span>({filas.length})</span>
      </h2>
      {filas.map((pedido) => {
        const nombre = pedido.nombre_pedido ?? 'Sin nombre';
        const tramo = urgencia(segundosDesde(pedido.created_date, ahora));
        const campanas = llamados[pedido.id] ?? 0;
        const espera = ocupado === pedido.id;
        return (
          <article key={pedido.id} className={TARJETA}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {/* Lo más grande de la pantalla: es el dato que se dice en voz alta. */}
              <h3 className="text-3xl leading-none font-bold xl:text-4xl">{nombre}</h3>
              {/* El canal, chiquito: el barista ya sabe qué vaso usar por él. */}
              <span className="text-sm text-muted-foreground">
                {pedido.origen_pedido === 'para_llevar' ? '🥤 para llevar' : '☕ aquí'}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`${CHIP} ${tramo.clase}`}>
                {listo ? 'listo · ' : ''}
                {reloj(segundosDesde(pedido.created_date, ahora))} · {tramo.palabra}
              </span>
              {campanas > 0 && (
                <span className={`${CHIP} bg-secondary text-secondary-foreground`}>
                  <span aria-hidden>{'🔔'.repeat(Math.min(campanas, 3))} </span>
                  {campanas} llamado{campanas === 1 ? '' : 's'}
                </span>
              )}
            </div>

            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {pedido.items.map((item) => (
                <li key={item.id}>
                  <span className="font-semibold">{item.cantidad ?? 1}</span>{' '}
                  {item.producto_nombre ?? 'Producto sin nombre'}
                  {item.notas !== null && item.notas !== '' && (
                    <span className="block pl-4 text-xs text-muted-foreground">{item.notas}</span>
                  )}
                </li>
              ))}
            </ul>

            {/* No se colapsa ni espera a que nadie la pida: un error aquí no es
                un descuadre, es una urgencia médica. */}
            {pedido.notas_alergias !== null && pedido.notas_alergias !== '' && (
              <p className="mt-2 rounded-md border border-destructive bg-destructive/15 p-2 text-sm font-bold">
                <span aria-hidden>⚠️ </span>ALERGIA: {pedido.notas_alergias}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {listo ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={espera}
                    aria-label={`Llamar otra vez a ${nombre}`}
                    onClick={() => {
                      void onAccion(RUTA_LLAMAR, pedido.id, true);
                    }}
                  >
                    <span aria-hidden>🔔 </span>Llamar otra vez
                  </Button>
                  <Button
                    type="button"
                    disabled={espera}
                    aria-label={`Marcar entregado el pedido de ${nombre}`}
                    onClick={() => {
                      void onAccion(RUTA_ENTREGAR, pedido.id, false);
                    }}
                  >
                    Entregado
                  </Button>
                  {campanas >= LLAMADOS_PARA_ABANDONAR && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={espera}
                      aria-label={`Marcar que nadie recogió el pedido de ${nombre}`}
                      onClick={() => {
                        void onAccion(RUTA_NO_RECOGIDO, pedido.id, false);
                      }}
                    >
                      Nadie vino
                    </Button>
                  )}
                </>
              ) : (
                // Un botón, dos efectos: el comando sella `lista_en` al llamar.
                <Button
                  type="button"
                  className="w-full py-5 text-lg font-bold"
                  disabled={espera}
                  aria-label={`Marcar listo y llamar a ${nombre}`}
                  onClick={() => {
                    void onAccion(RUTA_LLAMAR, pedido.id, true);
                  }}
                >
                  LISTO Y LLAMAR
                </Button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
