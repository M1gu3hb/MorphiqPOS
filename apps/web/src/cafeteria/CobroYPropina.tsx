'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Progress } from '@morphiqpos/ui/primitivas/progress';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';
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
 * ── El barista NUNCA toca la propina (F-249, regla 1) ────────────────────
 * No hay un control de propina dentro de «Terminal»: todos viven en el panel del
 * cliente. Sin segunda pantalla ese panel sigue estando, pero se rotula
 * **Respaldo** y el cobro viaja con `propinaOrigen: 'barista'`, para que el
 * reporte separe lo que eligió el cliente de lo que tecleó el empleado.
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
 * ── Alcance recortado para caber en un archivo, dicho y no escondido ─────
 * 1. `F12` va impreso en el botón pero no enganchado: esa tecla es del navegador.
 * 2. Las cuatro cosas del cobro —pago, inventario, encolado en barra y sellos—
 *    son UNA transacción del servidor: aquí sale un solo `venta.cobrar`.
 * 3. El desglose fiscal del barista se queda en el total: las líneas del ticket
 *    sí van, subtotal e IVA no caben y se ven en el ticket impreso.
 * 4. Sin id en la ruta se abre el pedido que lleva más tiempo esperando cobro.
 */

const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'mixto'] as const;
type Metodo = (typeof METODOS)[number];
type Base = Exclude<Metodo, 'mixto'>;
const BASES: readonly Base[] = ['efectivo', 'tarjeta', 'transferencia'];
const ESPERA = 8;

/** Las cinco opciones del cliente, en centavos. `null` abre el importe libre. */
const PROPINAS: readonly { readonly texto: string; readonly centavos: number | null }[] = [
  { texto: '$5', centavos: 500 },
  { texto: '$10', centavos: 1000 },
  { texto: '$15', centavos: 1500 },
  { texto: 'Otro', centavos: null },
  { texto: 'Sin propina', centavos: 0 },
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
  /** Cuando llega —aunque sea `null`— la pantalla no consulta. Para pruebas. */
  readonly pedidoInicial?: PedidoPorCobrar | null;
  readonly lineasIniciales?: readonly LineaDelTicket[];
  /** Sin ella el panel del cliente es respaldo y la propina es del barista. */
  readonly segundaPantallaConectada?: boolean;
  readonly onCobrado?: (ordenId: string) => void;
}

/** Pesos a centavos contando dígitos: `118.995 * 100` pierde medio centavo. */
function aCentavos(pesos: number | null | undefined): number {
  if (pesos === null || pesos === undefined || !Number.isFinite(pesos)) return 0;
  const [entero = '0', decimal = '00'] = Math.abs(pesos).toFixed(2).split('.');
  return (pesos < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

/** Lo tecleado. `null` es «esto no es un importe», que no es lo mismo que cero. */
export function centavosDeTexto(texto: string): number | null {
  const limpio = texto.trim().replace(/[\s,$]/g, '');
  if (limpio === '') return 0;
  const partes = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(limpio);
  return partes === null
    ? null
    : Number(partes[1]) * 100 + Number((partes[2] ?? '').padEnd(2, '0'));
}

/** Centavos a pesos para una persona. Aritmética entera de punta a punta. */
export function enPesos(monto: number): string {
  const bruto = Math.abs(monto);
  const con = String(Math.trunc(bruto / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${monto < 0 ? '-' : ''}$${con}.${(bruto % 100).toString().padStart(2, '0')}`;
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
): string | null {
  if (total <= 0)
    return `${voc.conDeterminante('este', 'unidad_servicio')} no tiene importe que cobrar.`;
  if (metodo === 'efectivo' && mano < 0) return 'Lo recibido no es un importe.';
  if (metodo === 'efectivo') return mano > 0 && mano < total ? 'Lo recibido no alcanza.' : null;
  if (metodo !== 'mixto' || suma === total) return null;
  if (suma < 0) return 'Alguno de los tres importes no es un número.';
  const falta = total - suma;
  return falta > 0 ? `Faltan ${enPesos(falta)} por desglosar.` : `Sobran ${enPesos(-falta)}.`;
}

/**
 * Los renglones de `venta.cobrar` (F-245). La propina se reconoce de efectivo
 * hacia abajo: el billete que se deja de más va a la bolsa esa misma noche; la
 * de tarjeta espera a la liquidación.
 */
function renglonesDePago(
  metodo: Metodo,
  partes: Readonly<Record<Base, string>>,
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
    const suya = Math.min(centavosDeTexto(partes[base]) ?? 0, porAsignar);
    porAsignar -= suya;
    return {
      metodo: base,
      montoCentavos: (centavosDeTexto(partes[base]) ?? 0) - suya,
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

export function CobroYPropina({
  pedidoInicial,
  lineasIniciales,
  segundaPantallaConectada = false,
  onCobrado,
}: CobroYPropinaProps) {
  const voc = useVocabulario();
  const [pedido, setPedido] = useState<PedidoPorCobrar | null | undefined>(pedidoInicial);
  const [lineas, setLineas] = useState<readonly LineaDelTicket[]>(lineasIniciales ?? []);
  const [metodo, setMetodo] = useState<Metodo>('efectivo');
  const [recibido, setRecibido] = useState('');
  const [partes, setPartes] = useState<Record<Base, string>>({
    efectivo: '',
    tarjeta: '',
    transferencia: '',
  });
  /** `null` es «nadie la ha decidido», que no es lo mismo que cero. */
  const [propina, setPropina] = useState<number | null>(null);
  const [otro, setOtro] = useState<string | null>(null);
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
          filtro: { estado: 'por_cobrar' },
          limite: 1,
          signal: control.signal,
        });
        if (!sigueMontada()) return;
        setPedido(fila ?? null);
        if (fila === undefined) return;
        const suyas = await consultarPuente<LineaDelTicket>('DetalleVenta', {
          filtro: { venta_id: fila.id },
          signal: control.signal,
        });
        if (sigueMontada()) setLineas(suyas);
      } catch (fallo) {
        // Un aborto no es un error: es esta misma pantalla, que ya no está.
        if (!sigueMontada()) return;
        setError(
          fallo instanceof Error
            ? fallo.message
            : `No se pudo leer ${voc.enFrase('unidad_servicio')}.`,
        );
      }
    })();
    return () => {
      control.abort();
    };
  }, [pedidoInicial, voc]);

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

  const venta = aCentavos(pedido?.total);
  const total = venta + (propina ?? 0);
  const mano = centavosDeTexto(recibido) ?? -1;
  const suma = BASES.reduce((suman, base) => suman + (centavosDeTexto(partes[base]) ?? -1), 0);
  const bloqueo = bloqueoDe(total, metodo, mano, suma, voc);
  /** El origen separa en el reporte lo elegido de lo tecleado. Regla 1. */
  const origen = segundaPantallaConectada ? 'cliente' : 'barista';

  // La pantalla NUNCA se vacía por un error: la banda va encima del último dato.
  const banda =
    error === null ? null : (
      <p
        role="alert"
        className="rounded-md border border-destructive bg-destructive/15 p-2 text-sm"
      >
        {error} · No se cobró nada y el pedido no entró a la fila de la barra.
      </p>
    );

  async function cobrar(id: string): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const hecho = await invocarComando<{ readonly cambioCentavos: string }>('/api/venta/cobrar', {
        ordenId: id,
        pagos: renglonesDePago(metodo, partes, venta, propina ?? 0, mano),
        totalEsperadoCentavos: venta,
        propinaCentavos: propina ?? 0,
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

  // Esqueletos con la forma de las dos pantallas: el TOTAL no salta de sitio.
  if (pedido === undefined) {
    return (
      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
        {banda}
      </div>
    );
  }

  // El vacío ENSEÑA de dónde salen los cobros; no se disculpa por no tener uno.
  if (pedido === null) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-8 text-center">
        <p className="text-xl font-semibold">
          No hay {voc.enFraseCon('ningun', 'unidad_servicio')} esperando cobro.
        </p>
        <p className="text-muted-foreground">
          Un pedido llega aquí en cuanto se arma en la barra. Al cobrarlo se registra el pago, se
          descuenta el inventario y se encola para prepararlo — todo en el mismo toque.
        </p>
        <Button asChild>
          <a href="/cafeteria/cobrar">Armar {voc.enFraseCon('un', 'unidad_servicio')}</a>
        </Button>
        {banda}
      </div>
    );
  }

  if (cambio !== null) {
    return (
      <div role="status" className="mx-auto max-w-lg space-y-3 p-8 text-center">
        <p className="text-5xl font-bold tabular-nums">{enPesos(total)}</p>
        <p>
          Cobrado · cambio {enPesos(cambio)} · propina {enPesos(propina ?? 0)} ({origen}) · ya está
          en la fila de la barra.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_28rem]">
      <header className="flex flex-wrap items-baseline gap-2 xl:col-span-2">
        <h1 className="text-xl font-bold">{pedido.cliente_nombre ?? 'Sin nombre'}</h1>
        <Badge variant="secondary">{pedido.canal === 'aqui' ? 'Aquí' : 'Para llevar'}</Badge>
        <div className="w-full">{banda}</div>
      </header>

      <section aria-label={`Terminal del ${voc.singular('responsable')}`} className="space-y-3">
        <ul className="space-y-1 rounded-lg border border-border bg-card p-3 text-sm text-card-foreground">
          {lineas.map((linea) => (
            <li key={linea.id} className="flex items-baseline justify-between gap-3">
              <span className="truncate">
                {linea.cantidad ?? 1} × {linea.producto_nombre ?? 'Producto'}
              </span>
              <span className="tabular-nums">{enPesos(aCentavos(linea.total))}</span>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-3 border-t border-border pt-1 font-semibold">
            <span>Total con propina</span>
            <span className="tabular-nums">{enPesos(total)}</span>
          </li>
        </ul>

        {/* Los cuatro métodos en 2×2, como el documento. La palomita —y no sólo
            el relleno— dice cuál está elegido: el color nunca va solo. */}
        <div className="grid grid-cols-2 gap-2">
          {METODOS.map((opcion) => (
            <Button
              key={opcion}
              variant={metodo === opcion ? 'default' : 'outline'}
              aria-pressed={metodo === opcion}
              className="min-h-20 justify-between text-base uppercase"
              onClick={() => {
                setMetodo(opcion);
              }}
            >
              {opcion}
              <span aria-hidden>{metodo === opcion ? '✓' : ''}</span>
            </Button>
          ))}
        </div>

        {metodo === 'efectivo' && (
          <label className="block space-y-1 text-sm">
            Recibido
            <Input
              inputMode="decimal"
              value={recibido}
              onChange={(evento) => {
                setRecibido(evento.target.value);
              }}
            />
            <span className="tabular-nums">Cambio {enPesos(Math.max(mano - total, 0))}</span>
          </label>
        )}

        {/* El desglose del mixto: cada campo lleva el importe COMPLETO que entra
            por ese método —venta y propina juntas—, que es lo que el barista ve
            pasar. Sale en menos del 2 % de los cobros, y es el pedido de oficina
            de $780 en el que más duele equivocarse. */}
        {metodo === 'mixto' &&
          BASES.map((base) => (
            <label key={base} className="block space-y-1 text-sm capitalize">
              {base}
              <Input
                inputMode="decimal"
                value={partes[base]}
                onChange={(evento) => {
                  setPartes({ ...partes, [base]: evento.target.value });
                }}
              />
            </label>
          ))}

        <Button
          size="lg"
          className="min-h-20 w-full text-lg"
          disabled={enviando || bloqueo !== null}
          onClick={() => {
            void cobrar(pedido.id);
          }}
        >
          {enviando ? 'Cobrando…' : 'COBRAR · F12'}
        </Button>
        {bloqueo !== null && <p className="text-center text-sm">{bloqueo}</p>}
      </section>

      {/* La segunda pantalla. En PC es la columna de al lado; en tablet cae abajo
          a todo el ancho, que es donde se gira el aparato; en teléfono no existe
          y esto es el respaldo, rotulado como tal. */}
      <section
        aria-label={
          segundaPantallaConectada ? 'Lo que ve el cliente' : 'Respaldo de propina en la terminal'
        }
        className="flex flex-col items-center gap-4 rounded-lg border-2 border-primary/40 bg-card p-4 text-center text-card-foreground shadow-2"
      >
        {!segundaPantallaConectada && (
          <Badge variant="outline">Respaldo · queda marcado como capturado por el empleado</Badge>
        )}
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Total</p>
        <p className="text-6xl font-bold tabular-nums">{enPesos(total)}</p>

        {propina !== null && (
          <p className="text-lg">
            {propina === 0 ? 'Sin propina' : `Propina ${enPesos(propina)}`} · ¡gracias!
          </p>
        )}

        {propina === null && otro === null && (
          // Cinco celdas idénticas: la salida no se esconde. En teléfono la fila
          // se parte en dos, nunca en una lista con «Sin propina» al pie.
          <div className="grid w-full grid-cols-3 gap-2 sm:grid-cols-5">
            {PROPINAS.map((opcion) => (
              <Button
                key={opcion.texto}
                variant="outline"
                className="min-h-20 text-base tabular-nums"
                onClick={() => {
                  if (opcion.centavos === null) setOtro('');
                  else setPropina(opcion.centavos);
                }}
              >
                {opcion.texto}
              </Button>
            ))}
          </div>
        )}

        {propina === null && otro !== null && (
          <div className="flex w-full items-end gap-2">
            <label className="flex-1 text-left text-sm">
              Otra cantidad
              <Input
                inputMode="decimal"
                value={otro}
                onChange={(evento) => {
                  setOtro(evento.target.value);
                }}
              />
            </label>
            <Button
              onClick={() => {
                setPropina(centavosDeTexto(otro) ?? 0);
              }}
            >
              Dejar
            </Button>
          </div>
        )}

        {propina === null && (
          <div className="w-full space-y-1">
            <Progress
              value={(espera / ESPERA) * 100}
              aria-label="Tiempo antes de cobrar sin propina"
            />
            <p className="text-xs text-muted-foreground">
              Si no tocas nada, se cobra sin propina en {String(espera)} s.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
