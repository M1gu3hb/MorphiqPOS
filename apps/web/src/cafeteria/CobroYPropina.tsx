'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Progress } from '@morphiqpos/ui/primitivas/progress';
import {
  Aviso,
  CampoDeDinero,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  Vacio,
  centavosDeTexto,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import {
  ArrowLeftRight,
  Banknote,
  Check,
  CircleCheck,
  CreditCard,
  CupSoda,
  Monitor,
  MonitorOff,
  Split,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { AvisoSinConexion, useEnLinea } from '~/cliente/en-linea';
import { useVocabulario } from '~/cliente/vocabulario';

import { origenDeLaPropina } from './origen-de-propina';
import type { Vocabulario } from '@morphiqpos/domain/vocabulario';

/**
 * PANTALLA · cafeteria · cobro-y-propina
 *
 * Convertir el pedido en dinero contado y dejar que el cliente decida la propina
 * sin que nadie lo mire. 150–220 veces al día, barista y cliente a la vez.
 *
 * ── Por qué un solo archivo pinta DOS pantallas ──────────────────────────
 * Es la única del sistema que se ve desde dos lados al mismo tiempo, y cada lado
 * tiene su destinatario. Partirla en dos componentes obligaría a sincronizar por
 * red lo que aquí es un `useState`, y el fallo de esa sincronización sería un
 * cobro sin propina.
 *
 * ── Dos lados, dos jerarquías ────────────────────────────────────────────
 * La terminal es una herramienta: el ticket es un recibo denso (`Tabla`, con el
 * total en su pie), los cuatro métodos son lo más grande porque son lo primero que
 * el barista decide, y lo recibido y el cambio van justo debajo. La cara del
 * cliente es lo contrario: una superficie levantada, centrada, con el TOTAL en el
 * tamaño de display y cinco botones iguales. Nada de la terminal se repite ahí.
 *
 * ── El barista NUNCA toca la propina (F-249, regla 1) ────────────────────
 * No hay un control de propina dentro de «Terminal»: todos viven en el panel del
 * cliente. Sin segunda pantalla ese panel sigue estando, pero se rotula
 * **Respaldo** y el cobro viaja con el origen de la propina TECLEADA en el mostrador
 * (`tradicional`), para que el reporte separe lo que eligió el cliente (`portal_qr`)
 * de lo que tecleó el empleado. Mandaba `'barista'` y `'cliente'`, que no están en la
 * lista del servidor ni en el `check` de la base: el cobro contestaba «datos
 * incompletos» SIEMPRE y esta pantalla no cobró nunca (C.14 de la 2.4, D-18).
 *
 * ── «Sin propina» va en la MISMA fila y del mismo tamaño (regla 2) ───────
 * El diagrama la dibuja en un renglón aparte; la regla escrita dice misma fila y
 * mismo tamaño, y gana la regla porque no es de estética: la propina es
 * voluntaria por ley, y una pantalla que esconde la salida no lo es en la
 * práctica. Aquí las cinco opciones son cinco celdas idénticas.
 *
 * ── Importes y no porcentajes (regla 3); el total y nada más (regla 4) ───
 * Sobre $118 un 15 % son $17.70, y nadie deja $17.70 en un mostrador. Y quien
 * espera con fila detrás no quiere subtotal ni IVA: quiere ver cuánto es.
 *
 * ── Ocho segundos y se resuelve solo (regla 5) ───────────────────────────
 * Nadie espera a que alguien decida y, sobre todo, nadie tiene que preguntar en
 * voz alta «¿me dejas propina?» — que es lo que esta pantalla viene a evitar. La
 * cuenta atrás se ve, con número y con barra: un temporizador invisible engaña.
 *
 * ── Tres layouts, no uno encogido ────────────────────────────────────────
 * PC: dos columnas, terminal y segunda pantalla lado a lado. Tablet: el panel
 * del cliente cae abajo y a todo el ancho, que es donde se gira el aparato hacia
 * él. Teléfono: no hay segunda pantalla — el panel ES el respaldo, rotulado.
 *
 * ── Lo tecleado que no es un importe ─────────────────────────────────────
 * `CampoDeDinero` entrega `null` tanto por un campo vacío como por uno con basura,
 * y aquí NO son lo mismo: vacío en «Recibido» es «pagó exacto», y basura tiene que
 * detener el cobro con su razón. Por eso la pantalla anota, al teclear, qué campos
 * tienen texto que no se lee como importe.
 *
 * ── F12, y lo que hace un solo cobro ─────────────────────────────────────
 * `F12`, que iba impreso en el botón sin hacer nada, cobra con las mismas guardas
 * que el botón (C.5 de la 2.4). Las cuatro cosas del cobro —pago, inventario,
 * encolado en barra y sellos— son UNA transacción del servidor: aquí sale un solo
 * `venta.cobrar`. Sin id en la ruta se abre el pedido que lleva más tiempo esperando.
 */

const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'mixto'] as const;
type Metodo = (typeof METODOS)[number];
type Base = Exclude<Metodo, 'mixto'>;
const BASES: readonly Base[] = ['efectivo', 'tarjeta', 'transferencia'];
const ESPERA = 8;

/** El icono acompaña a la palabra; la palabra es la que manda. */
const ICONO_DE_METODO: Readonly<Record<Metodo, LucideIcon>> = {
  efectivo: Banknote,
  tarjeta: CreditCard,
  transferencia: ArrowLeftRight,
  mixto: Split,
};

/**
 * Las cinco opciones del cliente, en centavos. `null` abre el importe libre. Las
 * que llevan `texto` lo dicen con palabras; las demás son un importe y se pintan
 * con `Dinero`, con las mismas cifras que el total de arriba.
 */
const PROPINAS: readonly {
  readonly clave: string;
  readonly texto?: string;
  readonly centavos: number | null;
}[] = [
  { clave: 'cinco', centavos: 500 },
  { clave: 'diez', centavos: 1000 },
  { clave: 'quince', centavos: 1500 },
  { clave: 'otro', texto: 'Otro', centavos: null },
  { clave: 'sin', texto: 'Sin propina', centavos: 0 },
];

export interface PedidoPorCobrar {
  readonly id: string;
  readonly cliente_nombre: string | null;
  readonly canal: string | null;
  readonly total: number | null;
}

/** Un renglón del ticket. Los combos llegan con `total` negativo y se ven así. */
export interface LineaDelTicket {
  readonly id: string;
  readonly producto_nombre: string | null;
  readonly cantidad: number | null;
  readonly total: number | null;
}

export interface CobroYPropinaProps {
  /**
   * La orden que se cobra, de la dirección (`?pedido=`): un apartado se cobra al
   * recogerlo (C.14), y su orden está CONFIRMADA, no «por cobrar». Sin ella se abre
   * la venta por cobrar que lleva más tiempo esperando.
   */
  readonly pedidoId?: string;
  /** Cuando llega —aunque sea `null`— la pantalla no consulta. Para pruebas. */
  readonly pedidoInicial?: PedidoPorCobrar | null;
  readonly lineasIniciales?: readonly LineaDelTicket[];
  /** Sin ella el panel del cliente es respaldo y la propina es del barista. */
  readonly segundaPantallaConectada?: boolean;
  readonly onCobrado?: (ordenId: string) => void;
}

/**
 * Qué impide cobrar. Un descuadre del mixto lleva el importe que falta (o, en
 * negativo, el que sobra): la frase lo nombra y se pinta con `Dinero`.
 */
export type Bloqueo = string | { readonly faltan: number };

/** Hay texto y no se lee como importe. Vacío no es ilegible: es «nada». */
function esIlegible(texto: string): boolean {
  return texto.trim() !== '' && centavosDeTexto(texto) === null;
}

/**
 * Qué impide cobrar, con palabras: un botón apagado sin razón es un muro mudo.
 * Con centavos enteros la tolerancia de ±$0.01 del documento sobra — el mixto
 * cuadra o no cuadra, y desaparece una clase entera de descuadre de las once.
 */
export function bloqueoDe(
  total: number,
  metodo: Metodo,
  mano: number,
  suma: number,
  voc: Vocabulario,
): Bloqueo | null {
  if (total <= 0)
    return `${voc.conDeterminante('este', 'unidad_servicio')} no tiene importe que cobrar.`;
  if (metodo === 'efectivo' && mano < 0) return 'Lo recibido no es un importe.';
  if (metodo === 'efectivo') return mano > 0 && mano < total ? 'Lo recibido no alcanza.' : null;
  if (metodo !== 'mixto' || suma === total) return null;
  if (suma < 0) return 'Alguno de los tres importes no es un número.';
  return { faltan: total - suma };
}

/**
 * Los renglones de `venta.cobrar` (F-245). La propina se reconoce de efectivo
 * hacia abajo: el billete que se deja de más va a la bolsa esa misma noche; la
 * de tarjeta espera a la liquidación.
 */
function renglonesDePago(
  metodo: Metodo,
  partes: Readonly<Record<Base, number | null>>,
  venta: number,
  propina: number,
  mano: number,
): readonly Record<string, unknown>[] {
  if (metodo !== 'mixto') {
    const enMano = metodo === 'efectivo' && mano > 0 ? { recibidoCentavos: mano } : {};
    return [{ metodo, montoCentavos: venta, propinaCentavos: propina, ...enMano }];
  }
  let porAsignar = propina;
  return BASES.map((base) => {
    const suya = Math.min(partes[base] ?? 0, porAsignar);
    porAsignar -= suya;
    return {
      metodo: base,
      montoCentavos: (partes[base] ?? 0) - suya,
      propinaCentavos: suya,
    };
  }).filter((renglon) => renglon.montoCentavos > 0 || renglon.propinaCentavos > 0);
}

/** El fallo, dicho como lo entiende quien tiene fila detrás. El 429 va aparte. */
function mensajeDeFallo(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === 429) return 'Demasiados intentos seguidos. Espera unos segundos.';
    return fallo.error.codigo === 'COMANDO_EN_CURSO'
      ? 'Este cobro ya va en camino.'
      : fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo cobrar.';
}

/** El ticket es un recibo: cantidad × nombre a la izquierda, importe alineado. */
function columnasDelTicket(nombreDeLinea: string): readonly ColumnaDeTabla<LineaDelTicket>[] {
  return [
    {
      clave: 'producto',
      titulo: nombreDeLinea,
      celda: (linea) => (
        <span className="line-clamp-2">
          <span className="font-numeros tabular-nums">{linea.cantidad ?? 1} ×</span>{' '}
          {linea.producto_nombre ?? 'Producto'}
        </span>
      ),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      // El puente sirve el importe en pesos; `centavosDe` lo pasa a centavos contando
      // dígitos, según la unidad del campo y no su nombre.
      celda: (linea) => (
        <Dinero centavos={centavosDe('DetalleVenta', 'total', linea.total) ?? 0} tamano="sm" />
      ),
    },
  ];
}

interface CaraDelClienteProps {
  readonly total: number;
  readonly propina: number | null;
  readonly conectada: boolean;
  readonly espera: number;
  /** `undefined`: el importe libre está cerrado. `null`: abierto y sin importe. */
  readonly otro: number | null | undefined;
  readonly alElegir: (centavos: number) => void;
  readonly alAbrirOtro: () => void;
  readonly alCambiarOtro: (centavos: number | null) => void;
}

/**
 * LA CARA DEL CLIENTE · el total, la pregunta y cinco botones iguales.
 *
 * Una superficie levantada y centrada: se lee desde el otro lado del mostrador, y
 * el cliente no tiene que buscar nada. Sin segunda pantalla es el respaldo en la
 * terminal, y lo dice arriba con su palabra, no sólo con el icono.
 */
function CaraDelCliente({
  total,
  propina,
  conectada,
  espera,
  otro,
  alElegir,
  alAbrirOtro,
  alCambiarOtro,
}: CaraDelClienteProps) {
  return (
    <Superficie
      como="section"
      nivel={2}
      relleno={6}
      aria-label={conectada ? 'Lo que ve el cliente' : 'Respaldo de propina en la terminal'}
      className="flex flex-col items-center gap-(--espacio-6) text-center"
    >
      {/* El rótulo va arriba y a la izquierda, fuera del eje del cliente: es para
          quien opera, no para quien paga. En respaldo parte renglón en teléfono. */}
      {conectada ? (
        <p className="flex items-center gap-(--espacio-2) self-stretch text-left text-xs font-medium tracking-wide text-texto-sutil uppercase">
          <Monitor aria-hidden="true" className="size-4 shrink-0" />
          Lo que ve el cliente
        </p>
      ) : (
        <p className="flex items-start gap-(--espacio-2) self-stretch text-left text-xs text-texto-sutil">
          <MonitorOff aria-hidden="true" className="size-4 shrink-0" />
          <span>
            <strong className="font-semibold tracking-wide text-texto uppercase">Respaldo</strong> ·
            queda marcado como capturado por el empleado
          </span>
        </p>
      )}

      {/* La cifra primero y el rótulo debajo: lo que la persona busca al girar
          la pantalla es cuánto es, no la palabra «total». */}
      <div className="flex flex-col items-center gap-(--espacio-2) py-(--espacio-4)">
        <Dinero centavos={total} tamano="total" className="leading-none" />
        <p className="text-xs font-medium tracking-wide text-texto-sutil uppercase">Total</p>
      </div>

      {propina !== null && (
        <p className="inline-flex items-baseline gap-(--espacio-1) text-lg">
          {propina === 0 ? (
            'Sin propina'
          ) : (
            <>
              Propina <Dinero centavos={propina} tamano="lg" />
            </>
          )}{' '}
          · ¡gracias!
        </p>
      )}

      {propina === null && otro === undefined && (
        <div className="flex w-full flex-col gap-(--espacio-3)">
          <p className="text-lg font-medium">¿Quieres dejar propina?</p>
          {/* Cinco celdas idénticas: la salida no se esconde. En teléfono la fila
              se parte en dos, nunca en una lista con «Sin propina» al pie. */}
          <div className="grid w-full grid-cols-3 gap-(--espacio-2) sm:grid-cols-5">
            {PROPINAS.map((opcion) => (
              <Button
                key={opcion.clave}
                type="button"
                variant="outline"
                className="min-h-20 text-base leading-tight whitespace-normal"
                onClick={() => {
                  if (opcion.centavos === null) alAbrirOtro();
                  else alElegir(opcion.centavos);
                }}
              >
                {opcion.texto ?? <Dinero centavos={opcion.centavos ?? 0} tamano="lg" />}
              </Button>
            ))}
          </div>
        </div>
      )}

      {propina === null && otro !== undefined && (
        <div className="flex w-full items-end gap-(--espacio-2)">
          <div className="flex flex-1 flex-col gap-(--espacio-1) text-left">
            <Label htmlFor="cobro-propina-otra">Otra cantidad</Label>
            <CampoDeDinero
              id="cobro-propina-otra"
              tamano="grande"
              centavos={otro}
              alCambiar={alCambiarOtro}
            />
          </div>
          <Button
            type="button"
            size="lg"
            onClick={() => {
              alElegir(otro ?? 0);
            }}
          >
            Dejar
          </Button>
        </div>
      )}

      {propina === null && (
        <div className="flex w-full flex-col gap-(--espacio-2)">
          <Progress
            value={(espera / ESPERA) * 100}
            aria-label="Tiempo antes de cobrar sin propina"
          />
          <p className="flex items-center justify-center gap-(--espacio-1) text-xs text-texto-sutil">
            <Timer aria-hidden="true" className="size-3.5" />
            Si no tocas nada, se cobra sin propina en {String(espera)} s.
          </p>
        </div>
      )}
    </Superficie>
  );
}

export function CobroYPropina({
  pedidoId: pedidoPedido,
  pedidoInicial,
  lineasIniciales,
  segundaPantallaConectada = false,
  onCobrado,
}: CobroYPropinaProps) {
  const voc = useVocabulario();
  const enLinea = useEnLinea();
  const [pedido, setPedido] = useState<PedidoPorCobrar | null | undefined>(pedidoInicial);
  /** `null` es «todavía no llegan». Con el pedido dado por props, no se leen. */
  const [lineas, setLineas] = useState<readonly LineaDelTicket[] | null>(
    lineasIniciales ?? (pedidoInicial === undefined ? null : []),
  );
  /**
   * Dos lecturas, dos fallos. Sin el pedido no hay nada que cobrar; sin sus líneas
   * el total sí está y se cobra igual. Por eso reintentar las líneas NO vuelve a
   * leer el pedido: tirarlo reiniciaría la pantalla con la cuenta atrás de la
   * propina a medias —«se cobra sin propina en 0 s» con segundos por delante— y
   * una propina elegida que podría caer en otro pedido.
   */
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [falloDeLineas, setFalloDeLineas] = useState<string | null>(null);
  // Cada intento de lectura es un número: reintentar lo sube y el efecto lee otra
  // vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [intentoDeLineas, setIntentoDeLineas] = useState(0);
  const [metodo, setMetodo] = useState<Metodo>('efectivo');
  const [recibido, setRecibido] = useState<number | null>(null);
  const [partes, setPartes] = useState<Readonly<Record<Base, number | null>>>({
    efectivo: null,
    tarjeta: null,
    transferencia: null,
  });
  /** Los campos con texto que no es un importe. Ver «Lo tecleado…» arriba. */
  const [ilegibles, setIlegibles] = useState<ReadonlySet<string>>(new Set());
  /** `null` es «nadie la ha decidido», que no es lo mismo que cero. */
  const [propina, setPropina] = useState<number | null>(null);
  const [otro, setOtro] = useState<number | null | undefined>(undefined);
  const [espera, setEspera] = useState(ESPERA);
  const [enviando, setEnviando] = useState(false);
  const [cambio, setCambio] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pedidoInicial !== undefined) return;
    // El centinela es la señal de aborto: dice si la pantalla sigue montada y de
    // paso cancela la lectura en vuelo. Se pregunta con una LLAMADA, porque
    // entre un `await` y el siguiente la respuesta cambia.
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    void (async () => {
      try {
        const [fila] = await consultarPuente<PedidoPorCobrar>('Venta', {
          filtro: pedidoPedido === undefined ? { estado: 'por_cobrar' } : { id: pedidoPedido },
          limite: 1,
          signal: control.signal,
        });
        if (sigueMontada()) setPedido(fila ?? null);
      } catch (fallo) {
        // Un aborto no es un error: es esta misma pantalla, que ya no está.
        if (!sigueMontada()) return;
        setFalloDeCarga(
          fallo instanceof Error
            ? fallo.message
            : `No se pudo leer ${voc.enFrase('unidad_servicio')}.`,
        );
      }
    })();
    return () => {
      control.abort();
    };
  }, [pedidoPedido, pedidoInicial, voc, intento]);

  // Las líneas del ticket, aparte y DESPUÉS del pedido: su reintento lee sólo
  // esto. Con el pedido dado por props, las líneas también llegan dadas.
  const pedidoId = pedido?.id ?? null;
  useEffect(() => {
    if (pedidoInicial !== undefined || pedidoId === null) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    void (async () => {
      try {
        const suyas = await consultarPuente<LineaDelTicket>('DetalleVenta', {
          filtro: { venta_id: pedidoId },
          signal: control.signal,
        });
        if (sigueMontada()) setLineas(suyas);
      } catch (fallo) {
        if (!sigueMontada()) return;
        setFalloDeLineas(
          fallo instanceof Error
            ? fallo.message
            : `No se pudieron leer ${voc.enFrase('linea_orden', true)}.`,
        );
      }
    })();
    return () => {
      control.abort();
    };
  }, [pedidoInicial, pedidoId, voc, intentoDeLineas]);

  useEffect(() => {
    // Los ocho segundos sólo corren cuando hay algo que cobrar y nadie decidió.
    if (propina !== null || pedido === undefined || pedido === null) return;
    const fin = setTimeout(() => {
      setPropina(0);
    }, ESPERA * 1000);
    const reloj = setInterval(() => {
      setEspera((previo) => Math.max(previo - 1, 0));
    }, 1000);
    return () => {
      clearTimeout(fin);
      clearInterval(reloj);
    };
  }, [propina, pedido]);

  /** Sólo cuando NO se leyó el pedido: no hay cuenta atrás ni propina que perder. */
  function reintentar(): void {
    setFalloDeCarga(null);
    setPedido(undefined);
    setLineas(null);
    setIntento((previo) => previo + 1);
  }

  /** Las líneas y nada más: el pedido, la propina y su cuenta atrás siguen donde iban. */
  function reintentarLineas(): void {
    setFalloDeLineas(null);
    setLineas(null);
    setIntentoDeLineas((previo) => previo + 1);
  }

  function anotarTexto(campo: string, texto: string): void {
    const ilegible = esIlegible(texto);
    setIlegibles((previos) => {
      if (previos.has(campo) === ilegible) return previos;
      const siguientes = new Set(previos);
      if (ilegible) siguientes.add(campo);
      else siguientes.delete(campo);
      return siguientes;
    });
  }

  /** Lo que vale un campo para las cuentas: basura es −1, vacío es cero. */
  function leido(campo: string, centavos: number | null): number {
    return centavos ?? (ilegibles.has(campo) ? -1 : 0);
  }

  // En centavos: es lo que piden `totalEsperadoCentavos` y los renglones del cobro.
  const venta = centavosDe('Venta', 'total', pedido?.total) ?? 0;
  const total = venta + (propina ?? 0);
  const mano = leido('recibido', recibido);
  const suma = BASES.reduce((suman, base) => suman + leido(base, partes[base]), 0);
  const bloqueo = bloqueoDe(total, metodo, mano, suma, voc);
  /** El origen separa en el reporte lo elegido de lo tecleado. Regla 1, D-18. */
  const origen = origenDeLaPropina(segundaPantallaConectada);

  async function cobrar(id: string): Promise<void> {
    // Sin red no se cobra (F-988, A-27): no hay cola que guarde el cobro para después.
    if (!enLinea) return;
    setEnviando(true);
    setError(null);
    try {
      const hecho = await invocarComando<{ readonly cambioCentavos: string }>('/api/venta/cobrar', {
        ordenId: id,
        pagos: renglonesDePago(metodo, partes, venta, propina ?? 0, mano),
        totalEsperadoCentavos: venta,
        // La propina viaja EN CADA PAGO (`renglonesDePago`), no suelta en la raíz: el
        // servidor valida en estricto y una clave que no conoce rechaza el cobro
        // entero. Aquí iba `propinaCentavos` y esta pantalla no cobró nunca (C.14).
        propinaOrigen: origen,
      });
      setCambio(Number(hecho.cambioCentavos));
      onCobrado?.(id);
    } catch (fallo) {
      setError(mensajeDeFallo(fallo));
    } finally {
      setEnviando(false);
    }
  }

  // F12 cobra con las MISMAS guardas que el botón: la tecla no hace nada que el
  // botón apagado no haría.
  const alTeclear = useEffectEvent((evento: KeyboardEvent) => {
    if (evento.key !== 'F12') return;
    evento.preventDefault();
    if (pedido === undefined || pedido === null || enviando || bloqueo !== null) return;
    void cobrar(pedido.id);
  });

  useEffect(() => {
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, []);

  // No se leyó el pedido: sin él no hay total ni propina. Nada que enseñar debajo.
  if (falloDeCarga !== null) {
    return (
      <div className="mx-auto max-w-lg p-(--espacio-6)">
        <ErrorDePantalla
          titulo={`No se pudo leer ${voc.enFrase('unidad_servicio')} por cobrar`}
          queHacer="Sin él no hay total que cobrar ni propina que ofrecer. Revisa la conexión y vuelve a intentarlo; no se cobró nada."
          detalle={falloDeCarga}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </div>
    );
  }

  // Esqueletos con la forma de las dos pantallas: el TOTAL no salta de sitio.
  if (pedido === undefined) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={`Cargando ${voc.enFrase('unidad_servicio')} por cobrar`}
        className="grid gap-(--espacio-4) p-(--espacio-3) xl:grid-cols-2 xl:items-start"
      >
        <Esqueleto className="h-(--altura-control) w-56 xl:col-span-2" />
        <div className="flex flex-col gap-(--espacio-4)">
          <Esqueleto className="h-32 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-(--espacio-2)">
            {METODOS.map((opcion) => (
              <Esqueleto key={opcion} className="min-h-20 w-full rounded-lg" />
            ))}
          </div>
          <Esqueleto className="min-h-20 w-full rounded-lg" />
        </div>
        <Esqueleto className="h-80 w-full rounded-lg" />
      </div>
    );
  }

  // El vacío ENSEÑA de dónde salen los cobros; no se disculpa por no tener uno.
  if (pedido === null) {
    return (
      <div className="mx-auto max-w-lg p-(--espacio-4)">
        <Vacio
          icono={<CupSoda />}
          titulo={`No hay ${voc.enFraseCon('ningun', 'unidad_servicio')} esperando cobro.`}
          explicacion="Un pedido llega aquí en cuanto se arma en la barra. Al cobrarlo se registra el pago, se descuenta el inventario y se encola para prepararlo — todo en el mismo toque."
          accion={
            <Button asChild>
              <a href="/cafeteria/cobrar">Armar {voc.enFraseCon('un', 'unidad_servicio')}</a>
            </Button>
          }
        />
      </div>
    );
  }

  if (cambio !== null) {
    return (
      <div role="status" className="mx-auto max-w-lg p-(--espacio-4)">
        {/* El CAMBIO manda en la confirmación, no el total: el total ya se dijo en voz
            alta y lo que queda por hacer es contar el vuelto. */}
        <Superficie
          nivel={2}
          relleno={6}
          como="section"
          className="flex flex-col items-center gap-(--espacio-3) text-center"
        >
          <p className="flex items-center gap-(--espacio-1) text-sm font-medium tracking-wide text-exito uppercase">
            <CircleCheck aria-hidden="true" className="size-4" />
            Cobrado
          </p>
          <span className="flex flex-col items-center gap-(--espacio-1)">
            <span className="text-xs text-texto-sutil">Cambio</span>
            <Dinero centavos={cambio} tamano="total" />
          </span>
          <p className="text-sm text-texto-sutil">
            Se cobraron <Dinero centavos={total} tamano="sm" /> · propina{' '}
            <Dinero centavos={propina ?? 0} tamano="sm" /> (
            {origen === 'portal_qr' ? 'la eligió el cliente' : 'la tecleó el barista'}) · ya está en
            la fila de la barra.
          </p>
        </Superficie>
      </div>
    );
  }

  const fraseDeBloqueo: ReactNode =
    bloqueo === null || typeof bloqueo === 'string' ? (
      bloqueo
    ) : bloqueo.faltan > 0 ? (
      <>
        Faltan <Dinero centavos={bloqueo.faltan} tamano="sm" /> por desglosar.
      </>
    ) : (
      <>
        Sobran <Dinero centavos={-bloqueo.faltan} tamano="sm" />.
      </>
    );

  // El ticket es lo tercero en la jerarquía: denso, con su total en el pie. Si
  // sus líneas no llegaron, el total sí, y se puede cobrar igual.
  const ticket = (() => {
    if (falloDeLineas !== null) {
      return (
        <ErrorDePantalla
          titulo={`No se pudieron leer ${voc.enFrase('linea_orden', true)} de ${voc.enFraseCon('este', 'unidad_servicio')}`}
          queHacer="El total sí llegó y se puede cobrar: lo que falta es el desglose. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDeLineas}
          reintentar={
            <Button variant="outline" onClick={reintentarLineas}>
              Volver a intentar
            </Button>
          }
        />
      );
    }
    if (lineas === null) return <EsqueletoDeLista filas={3} />;
    return (
      <Tabla
        etiqueta={`Ticket de ${voc.enFraseCon('este', 'unidad_servicio')}`}
        columnas={columnasDelTicket(voc.titulo('linea_orden'))}
        filas={lineas}
        claveDe={(linea) => linea.id}
        alto="max-h-[40vh]"
        pie={{
          producto: 'Total con propina',
          importe: <Dinero centavos={total} tamano="base" />,
        }}
      />
    );
  })();

  return (
    <div className="grid gap-(--espacio-4) p-(--espacio-3) xl:grid-cols-2 xl:items-start">
      <header className="flex flex-wrap items-center gap-(--espacio-2) xl:col-span-2">
        <h1 className="text-xl font-bold">{pedido.cliente_nombre ?? 'Sin nombre'}</h1>
        <Badge variant="secondary">{pedido.canal === 'aqui' ? 'Aquí' : 'Para llevar'}</Badge>
      </header>
      {enLinea ? null : <AvisoSinConexion className="xl:col-span-2" />}

      <section
        aria-label={`Terminal del ${voc.singular('responsable')}`}
        className="flex flex-col gap-(--espacio-4)"
      >
        {ticket}

        {/* Los cuatro métodos en 2×2, como el documento, y lo más grande de la
            terminal: es lo primero que el barista decide. La palomita —y no sólo
            el relleno— dice cuál está elegido: el color nunca va solo. */}
        <div
          role="group"
          aria-label="Método de pago"
          className="grid grid-cols-2 gap-(--espacio-2)"
        >
          {METODOS.map((opcion) => {
            const Icono = ICONO_DE_METODO[opcion];
            const elegido = metodo === opcion;
            return (
              <Button
                key={opcion}
                type="button"
                variant={elegido ? 'default' : 'outline'}
                aria-pressed={elegido}
                className="relative min-h-20 flex-col gap-(--espacio-1) text-sm uppercase sm:text-base"
                onClick={() => {
                  setMetodo(opcion);
                }}
              >
                <Icono aria-hidden="true" className="size-5" />
                {opcion}
                {elegido ? (
                  <Check
                    aria-hidden="true"
                    className="absolute top-(--espacio-2) right-(--espacio-2) size-4"
                  />
                ) : null}
              </Button>
            );
          })}
        </div>

        {/* Lo segundo: cuánto dio y cuánto se le devuelve, lado a lado. El cambio
            es el número que se dice en voz alta. Se ESCONDE en vez de desmontarse:
            el texto lo guarda el campo, y al volver de otro método tiene que seguir
            diciendo lo que se tecleó. */}
        <div
          className={
            metodo === 'efectivo' ? 'grid grid-cols-2 items-end gap-(--espacio-3)' : 'hidden'
          }
        >
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="cobro-recibido">Recibido</Label>
            <CampoDeDinero
              id="cobro-recibido"
              tamano="grande"
              centavos={recibido}
              alCambiar={setRecibido}
              aria-invalid={ilegibles.has('recibido') ? true : undefined}
              onInput={(evento) => {
                anotarTexto('recibido', evento.currentTarget.value);
              }}
            />
          </div>
          <p className="flex flex-col items-end gap-(--espacio-1)">
            <span className="text-sm text-texto-sutil">Cambio</span>
            <Dinero centavos={Math.max(mano - total, 0)} tamano="lg" />
          </p>
        </div>

        {/* El desglose del mixto: cada campo lleva el importe COMPLETO que entra
            por ese método —venta y propina juntas—, que es lo que el barista ve
            pasar. Sale en menos del 2 % de los cobros, y es el pedido de oficina
            de $780 en el que más duele equivocarse. */}
        <div className={metodo === 'mixto' ? 'grid gap-(--espacio-3) sm:grid-cols-3' : 'hidden'}>
          {BASES.map((base) => (
            <div key={base} className="flex flex-col gap-(--espacio-1)">
              <Label htmlFor={`cobro-mixto-${base}`} className="capitalize">
                {base}
              </Label>
              <CampoDeDinero
                id={`cobro-mixto-${base}`}
                centavos={partes[base]}
                alCambiar={(centavos) => {
                  setPartes((previas) => ({ ...previas, [base]: centavos }));
                }}
                aria-invalid={ilegibles.has(base) ? true : undefined}
                onInput={(evento) => {
                  anotarTexto(base, evento.currentTarget.value);
                }}
              />
            </div>
          ))}
        </div>

        {error === null ? null : (
          <Aviso tono="peligro" titulo={error}>
            No se cobró nada y el pedido no entró a la fila de la barra.
          </Aviso>
        )}

        <Button
          size="lg"
          className="min-h-20 w-full justify-between text-lg"
          disabled={enviando || bloqueo !== null}
          onClick={() => {
            void cobrar(pedido.id);
          }}
        >
          <span>{enviando ? 'Cobrando…' : 'COBRAR · F12'}</span>
          <Dinero centavos={total} tamano="lg" />
        </Button>
        {fraseDeBloqueo === null ? null : (
          <p className="text-center text-sm text-texto-sutil">{fraseDeBloqueo}</p>
        )}
      </section>

      {/* La segunda pantalla. En PC es la columna de al lado; en tablet cae abajo
          a todo el ancho, que es donde se gira el aparato; en teléfono no existe
          y esto es el respaldo, rotulado como tal. */}
      <CaraDelCliente
        total={total}
        propina={propina}
        conectada={segundaPantallaConectada}
        espera={espera}
        otro={otro}
        alElegir={setPropina}
        alAbrirOtro={() => {
          setOtro(null);
        }}
        alCambiarOtro={setOtro}
      />
    </div>
  );
}
