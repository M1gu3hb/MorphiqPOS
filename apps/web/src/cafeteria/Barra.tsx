'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@morphiqpos/ui/primitivas/tabs';
import { Aviso, ErrorDePantalla, Esqueleto, Superficie, Vacio } from '@morphiqpos/ui/sistema';
import { BellRing, Check, Clock, Coffee, CupSoda, Timer, TriangleAlert, Undo2 } from 'lucide-react';
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
 * siempre junto al color: a tres metros el tinte se pierde. La tarjeta tardía
 * se rodea entera con un anillo —no un borde lateral, y no un borde que crezca:
 * un anillo no ocupa sitio, así que cruzar el umbral no empuja las de abajo—.
 *
 * ── Tarjetas y no una `Tabla` ────────────────────────────────────────────
 * Una comanda de barra no se compara columna contra columna: se lee a tres
 * metros y se despacha con su botón. Cada columna es un carril (`Superficie`
 * nivel 0, pegado al fondo) y cada pedido una tarjeta en reposo (nivel 1) en
 * una lista ORDENADA: el orden de llegada es el dato.
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
const CAMPANAS_VISIBLES = 3;

/** La píldora del tiempo y la de los llamados: cifras en columna, palabra al lado. */
const PILDORA =
  'inline-flex items-center gap-(--espacio-1) rounded-md px-(--espacio-2) py-(--espacio-1) text-sm font-semibold tabular-nums';

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

/** Qué pedido tiene un toque viajando, y cuál de sus botones lo mandó. */
interface ToqueEnVuelo {
  readonly pedidoId: string;
  readonly ruta: string;
}

type Accion = (ruta: string, pedidoId: string, llamada: boolean) => Promise<void>;

export function segundosDesde(desde: string | null, ahora: number): number {
  if (desde === null || ahora === 0) return 0;
  const segundos = Math.floor((ahora - new Date(desde).getTime()) / 1000);
  return Number.isNaN(segundos) || segundos < 0 ? 0 : segundos;
}

/** `m:ss`, que es como se lee un tiempo de espera de barra. */
export function reloj(segundos: number): string {
  return `${String(Math.floor(segundos / 60))}:${String(segundos % 60).padStart(2, '0')}`;
}

/**
 * El color nunca va solo: cada tramo trae su palabra. `clase` tiñe la píldora
 * del tiempo y `anillo` rodea la tarjeta entera, que es lo que se ve de lejos.
 * El texto de la píldora sigue en `text-texto` también en rojo: rojo sobre tinte
 * rojo apenas pasa 4.5:1, y entre vapor el contraste alto es obligatorio.
 */
export function urgencia(segundos: number): {
  readonly clase: string;
  readonly palabra: string;
  readonly anillo: string;
} {
  if (segundos >= SEGUNDOS_ROJO)
    return {
      clase: 'bg-peligro/20 text-texto',
      palabra: 'muy tarde',
      anillo: 'border-peligro ring-2 ring-peligro',
    };
  if (segundos >= SEGUNDOS_AMBAR)
    return {
      clase: 'bg-advertencia/30 text-texto',
      palabra: 'tarde',
      anillo: 'border-advertencia ring-2 ring-advertencia',
    };
  return { clase: 'bg-fondo-sutil text-texto-sutil', palabra: 'a tiempo', anillo: '' };
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
  const [ocupado, setOcupado] = useState<ToqueEnVuelo | null>(null);
  // Dos fallos distintos, dos avisos distintos: no leer la fila no es lo mismo
  // que no poder marcar un pedido, y cada uno dice lo que NO pasó.
  const [falloDeLectura, setFalloDeLectura] = useState<string | null>(null);
  const [falloDeAccion, setFalloDeAccion] = useState<string | null>(null);
  const [ahora, setAhora] = useState(0);
  // Cada intento de lectura es un número: el botón de reintentar lo sube y el
  // efecto vuelve a arrancar el latido. El estado se limpia EN EL CLIC.
  const [intento, setIntento] = useState(0);
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
          setFalloDeLectura(null);
        })
        .catch((fallo: unknown) => {
          // La barra NUNCA se vacía por un fallo de red: un dato de hace diez
          // segundos sigue diciendo a quién hay que gritarle.
          if (vivo)
            setFalloDeLectura(fallo instanceof Error ? fallo.message : 'No se pudo leer la fila.');
        });
    };
    refrescar();
    const latido = setInterval(refrescar, 2000);
    return () => {
      vivo = false;
      clearInterval(latido);
    };
  }, [filasIniciales, intento]);

  const ejecutar = useCallback<Accion>(async (ruta, pedidoId, llamada) => {
    setOcupado({ pedidoId, ruta });
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
      setFalloDeAccion(null);
    } catch (fallo: unknown) {
      setFalloDeAccion(fallo instanceof Error ? fallo.message : 'No se pudo completar la acción.');
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

  const columnas: readonly DatosDeColumna[] = [
    {
      clave: 'fila',
      titulo: 'En la fila',
      filas: enFila,
      listo: false,
      vacio: 'Nada por preparar.',
    },
    {
      clave: 'listos',
      titulo: 'Listos',
      filas: listos,
      listo: true,
      vacio: `Nadie esperando su ${voc.singular('unidad_servicio')}.`,
    },
  ];
  const comunes = { ahora, llamados, ocupado, onAccion: ejecutar };

  const cuerpo = (() => {
    if (pedidos === null && falloDeLectura !== null) {
      return (
        <ErrorDePantalla
          titulo={`No se pudo leer la fila de ${voc.enFrase('preparacion')}`}
          queHacer="Sin la fila no se sabe qué preparar ni a quién llamar. Se vuelve a intentar sola cada dos segundos; si no vuelve, revisa la conexión."
          detalle={falloDeLectura}
          reintentar={
            <Button
              type="button"
              onClick={() => {
                setFalloDeLectura(null);
                setIntento((previo) => previo + 1);
              }}
            >
              Volver a intentar
            </Button>
          }
          className="mx-auto w-full max-w-lg"
        />
      );
    }
    if (pedidos === null) return <EsqueletoDeBarra />;
    if (enFila.length === 0 && listos.length === 0) return <FilaVacia />;
    if (esTelefono) {
      // En teléfono la barra sobrevive entera: una columna y dos pestañas,
      // porque en el turno vespertino vive en el bolsillo del mandil.
      return (
        <Tabs defaultValue="fila" className="flex-1">
          <TabsList className="w-full">
            {columnas.map((c) => (
              <TabsTrigger key={c.clave} value={c.clave} className="flex-1">
                {c.titulo} ({c.filas.length})
              </TabsTrigger>
            ))}
          </TabsList>
          {columnas.map((c) => (
            <TabsContent key={c.clave} value={c.clave} className="pt-(--espacio-2)">
              <ListaDePedidos columna={c} {...comunes} />
            </TabsContent>
          ))}
        </Tabs>
      );
    }
    return (
      <div className="grid flex-1 items-start gap-(--espacio-4) md:grid-cols-2">
        {columnas.map((c) => (
          <Columna key={c.clave} columna={c} {...comunes} />
        ))}
      </div>
    );
  })();

  return (
    <div className="flex min-h-dvh flex-col gap-(--espacio-3) bg-fondo p-(--espacio-3) text-texto md:gap-(--espacio-4) md:p-(--espacio-4)">
      <Encabezado
        titulo={voc.titulo('preparacion')}
        cargado={pedidos !== null}
        promedio={promedio}
        sinEspera={`Sin ${voc.plural('unidad_servicio')} en espera`}
        ahora={ahora}
      />

      {/* El aviso de lectura NO vacía la pantalla: debajo sigue la última fila. */}
      {pedidos !== null && falloDeLectura !== null && (
        <Aviso tono="atencion" titulo={falloDeLectura}>
          Se muestra la última fila conocida.
        </Aviso>
      )}
      {falloDeAccion !== null && (
        <Aviso tono="peligro" titulo={falloDeAccion}>
          {`Nada cambió: ${voc.enFrase('unidad_servicio')} sigue como estaba.`}
        </Aviso>
      )}

      {cuerpo}

      {recien.length > 0 && <Entregados recien={recien} ocupado={ocupado} onAccion={ejecutar} />}
    </div>
  );
}

interface EncabezadoProps {
  readonly titulo: string;
  readonly cargado: boolean;
  readonly promedio: number | null;
  readonly sinEspera: string;
  readonly ahora: number;
}

/**
 * El único dato del encabezado es el promedio del turno: bajarlo de tres a dos
 * minutos es atender la mitad más de gente en la misma ráfaga. La hora, al
 * lado, porque el tablero vive colgado y no hay otro reloj a la vista.
 */
function Encabezado({ titulo, cargado, promedio, sinEspera, ahora }: EncabezadoProps) {
  const hora =
    ahora === 0
      ? null
      : new Date(ahora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return (
    <header className="flex flex-wrap items-center justify-between gap-(--espacio-3)">
      <h1 className="text-xl font-bold tracking-wide uppercase">{titulo}</h1>
      {cargado && (
        <div className="flex items-center gap-(--espacio-4) text-sm text-texto-sutil">
          <p className="inline-flex items-center gap-(--espacio-2)">
            <Timer aria-hidden="true" className="size-5 shrink-0" />
            {promedio === null ? (
              sinEspera
            ) : (
              <>
                prom. en fila{' '}
                <span className="font-numeros text-lg font-semibold text-texto tabular-nums">
                  {reloj(promedio)}
                </span>
              </>
            )}
          </p>
          {hora !== null && (
            <time
              dateTime={new Date(ahora).toISOString()}
              className="font-numeros text-lg font-semibold text-texto tabular-nums"
            >
              {hora}
            </time>
          )}
        </div>
      )}
    </header>
  );
}

/** Esqueletos con la forma de las columnas y sus tarjetas: al llegar nada salta. */
function EsqueletoDeBarra() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando la fila"
      className="grid flex-1 items-start gap-(--espacio-4) md:grid-cols-2"
    >
      {[0, 1].map((columna) => (
        <div
          key={columna}
          className={`flex-col gap-(--espacio-3) ${columna === 0 ? 'flex' : 'hidden md:flex'}`}
        >
          <Esqueleto className="h-5 w-32" />
          {[0, 1].map((tarjeta) => (
            <Esqueleto key={tarjeta} className="h-48 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * El único vacío de la aplicación que es una BUENA noticia, y se ve así: el tipo
 * más grande de la pantalla (`protagonista`, en el paso display), en el tinte del
 * éxito (`tono="exito"`), y ni una sola disculpa. Ocupa todo el alto que queda.
 */
function FilaVacia() {
  return (
    <Vacio
      icono={<Coffee />}
      titulo="La fila está vacía."
      explicacion="Buen momento para reponer leche."
      tamano="protagonista"
      tono="exito"
      className="flex-1"
    />
  );
}

interface DatosDeColumna {
  readonly clave: string;
  readonly titulo: string;
  readonly filas: readonly PedidoDeBarra[];
  readonly listo: boolean;
  /** Qué se dice cuando ESTA columna está vacía y la otra no. */
  readonly vacio: string;
}

interface ListaProps {
  readonly columna: DatosDeColumna;
  readonly ahora: number;
  readonly llamados: Readonly<Record<string, number>>;
  readonly ocupado: ToqueEnVuelo | null;
  readonly onAccion: Accion;
}

/** Un carril: pegado al fondo (nivel 0), y las tarjetas en reposo encima. */
function Columna(props: ListaProps) {
  const { clave, titulo, filas } = props.columna;
  const id = `columna-${clave}`;
  return (
    <Superficie
      como="section"
      nivel={0}
      relleno={3}
      aria-labelledby={id}
      className="flex flex-col gap-(--espacio-3) bg-fondo-sutil"
    >
      <h2
        id={id}
        className="flex items-baseline justify-between text-sm font-bold tracking-wide uppercase"
      >
        <span>{titulo}</span>
        <span className="font-numeros tabular-nums">({filas.length})</span>
      </h2>
      <ListaDePedidos {...props} />
    </Superficie>
  );
}

/** En el orden en que llegaron: por eso es una lista ORDENADA. */
function ListaDePedidos({ columna, ahora, llamados, ocupado, onAccion }: ListaProps) {
  if (columna.filas.length === 0) {
    return <Vacio titulo={columna.vacio} className="py-(--espacio-6)" />;
  }
  return (
    <ol className="flex flex-col gap-(--espacio-3)">
      {columna.filas.map((pedido) => (
        <li key={pedido.id}>
          <TarjetaDePedido
            pedido={pedido}
            listo={columna.listo}
            segundos={segundosDesde(pedido.created_date, ahora)}
            campanas={llamados[pedido.id] ?? 0}
            enVuelo={ocupado?.pedidoId === pedido.id ? ocupado.ruta : null}
            onAccion={onAccion}
          />
        </li>
      ))}
    </ol>
  );
}

interface TarjetaProps {
  readonly pedido: PedidoDeBarra;
  readonly listo: boolean;
  readonly segundos: number;
  readonly campanas: number;
  /** La ruta del toque que viaja para ESTE pedido, o `null`. */
  readonly enVuelo: string | null;
  readonly onAccion: Accion;
}

function TarjetaDePedido({ pedido, listo, segundos, campanas, enVuelo, onAccion }: TarjetaProps) {
  const nombre = pedido.nombre_pedido ?? 'Sin nombre';
  const tramo = urgencia(segundos);
  const idNombre = `pedido-${pedido.id}`;
  return (
    <Superficie
      como="article"
      relleno={3}
      aria-labelledby={idNombre}
      className={`flex flex-col gap-(--espacio-2) ${tramo.anillo}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-(--espacio-2)">
        {/* Lo más grande de la pantalla: es el dato que se dice en voz alta. En
            el paso display en TODOS los anchos (40 px o más en el teléfono, más de
            48 desde la tableta, que es el caso real): si no cabe, parte renglón,
            pero la letra no baja. */}
        <h3 id={idNombre} className="text-display leading-none font-bold break-words">
          {nombre}
        </h3>
        <CanalDelPedido origen={pedido.origen_pedido} />
      </header>

      <div className="flex flex-wrap items-center gap-(--espacio-2)">
        <span className={`${PILDORA} ${tramo.clase}`}>
          <Clock aria-hidden="true" className="size-4 shrink-0" />
          {listo ? 'listo · ' : ''}
          {reloj(segundos)} · {tramo.palabra}
        </span>
        {campanas > 0 && (
          <span className={`${PILDORA} bg-fondo-sutil text-texto`}>
            <span aria-hidden="true" className="inline-flex">
              {Array.from({ length: Math.min(campanas, CAMPANAS_VISIBLES) }, (_, indice) => (
                <BellRing key={indice} className="size-4 shrink-0" />
              ))}
            </span>
            {campanas} llamado{campanas === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-(--espacio-1) text-base">
        {pedido.items.map((item) => (
          <li key={item.id}>
            <span className="font-numeros font-semibold tabular-nums">{item.cantidad ?? 1}</span>{' '}
            <span className="font-medium">{item.producto_nombre ?? 'Producto sin nombre'}</span>
            {item.notas !== null && item.notas !== '' && (
              <span className="block pl-(--espacio-4) text-sm text-texto-sutil">{item.notas}</span>
            )}
          </li>
        ))}
      </ul>

      {/* No se colapsa ni espera a que nadie la pida: un error aquí no es un
          descuadre, es una urgencia médica. Rojo lleno, con icono y con palabra. */}
      {pedido.notas_alergias !== null && pedido.notas_alergias !== '' && (
        <Superficie
          como="p"
          nivel={0}
          radio="md"
          relleno={3}
          className="flex items-start gap-(--espacio-2) border-peligro bg-peligro text-sm font-bold text-peligro-texto"
        >
          <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
          <span>ALERGIA: {pedido.notas_alergias}</span>
        </Superficie>
      )}

      <BotonesDeLaTarjeta
        pedidoId={pedido.id}
        nombre={nombre}
        listo={listo}
        campanas={campanas}
        enVuelo={enVuelo}
        onAccion={onAccion}
      />
    </Superficie>
  );
}

/** El canal, chiquito: el barista ya sabe qué vaso usar por él. */
function CanalDelPedido({ origen }: { readonly origen: string | null }) {
  const llevar = origen === 'para_llevar';
  const Icono = llevar ? CupSoda : Coffee;
  return (
    <span className="inline-flex items-center gap-(--espacio-1) text-sm text-texto-sutil">
      <Icono aria-hidden="true" className="size-4 shrink-0" />
      {llevar ? 'para llevar' : 'aquí'}
    </span>
  );
}

interface BotonesProps {
  readonly pedidoId: string;
  readonly nombre: string;
  readonly listo: boolean;
  readonly campanas: number;
  readonly enVuelo: string | null;
  readonly onAccion: Accion;
}

function BotonesDeLaTarjeta({
  pedidoId,
  nombre,
  listo,
  campanas,
  enVuelo,
  onAccion,
}: BotonesProps) {
  const espera = enVuelo !== null;
  if (!listo) {
    // Un botón, dos efectos: el comando sella `lista_en` al llamar. Es lo más
    // pesado de la tarjeta porque es lo único que se toca en ella.
    return (
      <Button
        type="button"
        size="lg"
        className="mt-(--espacio-1) min-h-[calc(var(--altura-control)*1.5)] w-full text-lg font-bold"
        disabled={espera}
        cargando={enVuelo === RUTA_LLAMAR}
        aria-label={`Marcar listo y llamar a ${nombre}`}
        onClick={() => {
          void onAccion(RUTA_LLAMAR, pedidoId, true);
        }}
      >
        {enVuelo === RUTA_LLAMAR ? null : <BellRing aria-hidden="true" className="size-5" />}
        LISTO Y LLAMAR
      </Button>
    );
  }
  return (
    <div className="mt-(--espacio-1) grid grid-cols-2 gap-(--espacio-2)">
      <Button
        type="button"
        size="lg"
        variant="outline"
        disabled={espera}
        cargando={enVuelo === RUTA_LLAMAR}
        aria-label={`Llamar otra vez a ${nombre}`}
        onClick={() => {
          void onAccion(RUTA_LLAMAR, pedidoId, true);
        }}
      >
        {enVuelo === RUTA_LLAMAR ? null : <BellRing aria-hidden="true" />}
        Llamar otra vez
      </Button>
      <Button
        type="button"
        size="lg"
        variant="success"
        disabled={espera}
        cargando={enVuelo === RUTA_ENTREGAR}
        aria-label={`Marcar entregado el pedido de ${nombre}`}
        onClick={() => {
          void onAccion(RUTA_ENTREGAR, pedidoId, false);
        }}
      >
        {enVuelo === RUTA_ENTREGAR ? null : <Check aria-hidden="true" />}
        Entregado
      </Button>
      {campanas >= LLAMADOS_PARA_ABANDONAR && (
        <Button
          type="button"
          variant="ghost"
          className="col-span-2"
          disabled={espera}
          cargando={enVuelo === RUTA_NO_RECOGIDO}
          aria-label={`Marcar que nadie recogió el pedido de ${nombre}`}
          onClick={() => {
            void onAccion(RUTA_NO_RECOGIDO, pedidoId, false);
          }}
        >
          Nadie vino
        </Button>
      )}
    </div>
  );
}

interface EntregadosProps {
  readonly recien: readonly PedidoDeBarra[];
  readonly ocupado: ToqueEnVuelo | null;
  readonly onAccion: Accion;
}

/**
 * La tercera zona, de una línea. El error más frecuente de esta pantalla es
 * marcar entregado el de arriba en vez del de abajo: deshacer cuesta un toque.
 */
function Entregados({ recien, ocupado, onAccion }: EntregadosProps) {
  return (
    <footer className="flex flex-wrap items-center gap-(--espacio-2) border-t border-borde pt-(--espacio-3) text-sm text-texto-sutil">
      <span>Entregados hace un momento:</span>
      {recien.map((p) => {
        const deshaciendo = ocupado?.pedidoId === p.id;
        return (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant="outline"
            disabled={deshaciendo}
            cargando={deshaciendo}
            aria-label={`Deshacer la entrega de ${p.nombre_pedido ?? 'un pedido sin nombre'}`}
            onClick={() => {
              void onAccion(RUTA_DESHACER, p.id, false);
            }}
          >
            {p.nombre_pedido ?? 'Sin nombre'}
            {deshaciendo ? null : <Undo2 aria-hidden="true" />}
          </Button>
        );
      })}
    </footer>
  );
}
