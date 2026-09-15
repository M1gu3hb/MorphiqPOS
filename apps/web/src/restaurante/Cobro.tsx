'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';

/**
 * PANTALLA · restaurante · cobro
 *
 * Convertir una cuenta cerrada en dinero contado. 40–120 veces al día, y siempre
 * con una persona esperando enfrente.
 *
 * ── Por qué el TOTAL es lo más grande de toda la aplicación ──────────────
 * Porque el cajero no lo consulta: lo LEE EN VOZ ALTA. Si tiene que buscarlo
 * entre el desglose lo lee mal, y un total mal dicho es una discusión en la caja
 * con la fila detrás.
 *
 * ── Por qué el desglose se esconde en tablet y en teléfono ───────────────
 * Porque es para cuando alguien pregunta, y casi nadie pregunta. En PC cabe al
 * lado y no estorba; en pantalla chica robaría el sitio del total y de los cuatro
 * métodos, que es lo único que se toca en el 95% de los cobros.
 *
 * ── La única fricción deliberada: el desglose del pago mixto ─────────────
 * Tres campos que tienen que sumar EXACTO, con el botón apagado hasta que
 * cuadren. Con centavos enteros la tolerancia de ±$0.01 del documento sobra:
 * aquí cuadra o no cuadra, y con eso desaparece una clase entera de descuadre
 * que sólo se descubre en el arqueo de las once de la noche.
 *
 * ── Y por qué la propina pendiente es un muro y no un aviso ──────────────
 * Cobrar con la propina sin decidir deja al mesero sin su parte y sin manera de
 * reclamarla: el cobro ya se selló.
 *
 * ── Lo que NO va aquí ────────────────────────────────────────────────────
 * Inventario, reportes, historial y edición de la cuenta. Si hay que corregir un
 * platillo, se corrige en la mesa.
 *
 * ── Alcance recortado para caber en un archivo, dicho y no escondido ─────
 * 1. El documento la llama «diálogo»: el envoltorio lo pone quien la abre desde
 *    Caja. Aquí se monta como superficie para que la ruta exista y se pruebe
 *    sola, en vez de un diálogo sin nada detrás.
 * 2. De la propina quedan los porcentajes con su importe y «Sin propina», con el
 *    mismo peso visual. El campo de monto libre se queda para el diálogo de
 *    propina de Caja; aquí lo que importa es que sin decidirla no se cobra.
 * 3. `F12` va impreso en el botón pero no se engancha al teclado: esa tecla es
 *    del navegador. El atajo se instala en el `AppLayout` al acoplar.
 * 4. Sin id en la ruta se abre la cuenta que lleva más tiempo esperando, que es
 *    la que el cajero cobraría de todos modos.
 */

const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'mixto'] as const;
type Metodo = (typeof METODOS)[number];
type MetodoBase = Exclude<Metodo, 'mixto'>;

const BASES: readonly MetodoBase[] = ['efectivo', 'tarjeta', 'transferencia'];

/** Los `propina_tipo` que significan «todavía nadie la decidió». */
const SIN_DECIDIR = ['pendiente', 'pendiente_cliente', 'decidir_en_caja'];

/** En PUNTOS BASE, como viaja el porcentaje en todo el sistema. El 0 es «sin». */
const PROPINAS = [1000, 1250, 1500, 0];

/** La fila de `Venta` del puente, con sus nombres. Los importes van en PESOS. */
export interface CuentaPorCobrar {
  readonly id: string;
  readonly codigo_caja: string | null;
  readonly cliente_nombre: string | null;
  readonly personas: number | null;
  readonly subtotal: number | null;
  readonly impuestos: number | null;
  readonly total: number | null;
  readonly propina_monto: number | null;
  readonly propina_tipo: string | null;
}

/** La fila de `DetalleVenta`: sólo lo que el comensal reconoce de su cuenta. */
export interface LineaDeCuenta {
  readonly id: string;
  readonly producto_nombre: string | null;
  readonly cantidad: number | null;
  readonly total: number | null;
}

export interface CobroProps {
  /** Cuando llega —aunque sea `null`— la pantalla no consulta. Para pruebas. */
  readonly cuentaInicial?: CuentaPorCobrar | null;
  readonly lineasIniciales?: readonly LineaDeCuenta[];
  readonly onCobrada?: (ordenId: string) => void;
  readonly onImprimir?: (ordenId: string) => void;
}

interface Ticket {
  readonly totalCentavos: string;
  readonly cambioCentavos: string;
}

/**
 * Pesos del puente a centavos enteros sin multiplicación flotante: `1234.995 *
 * 100` da `123499.49999…`, y contar dígitos no tiene ese error (R15).
 */
function aCentavos(pesos: number | null | undefined): number {
  if (pesos === null || pesos === undefined || !Number.isFinite(pesos)) return 0;
  const [entero = '0', decimal = '00'] = Math.abs(pesos).toFixed(2).split('.');
  return (pesos < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

/** Lo que teclea el cajero. `null` es «esto no es un importe», nunca cero. */
export function centavosDeTexto(texto: string): number | null {
  const limpio = texto.trim().replace(/[\s,$]/g, '');
  if (limpio === '') return 0;
  const partes = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(limpio);
  if (partes === null) return null;
  return Number(partes[1]) * 100 + Number((partes[2] ?? '').padEnd(2, '0'));
}

/** Centavos a pesos para una persona. Aritmética entera de punta a punta. */
export function enPesos(monto: number): string {
  const bruto = Math.abs(monto);
  const enteros = Math.trunc(bruto / 100).toString();
  const miles = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${monto < 0 ? '-' : ''}$${miles}.${(bruto % 100).toString().padStart(2, '0')}`;
}

/** Qué impide cobrar, dicho con palabras y no sólo con un botón apagado. */
function bloqueoDe(pendiente: boolean, total: number, metodo: Metodo, mano: number, suma: number) {
  if (pendiente) return 'Confirma la propina antes de cobrar.';
  if (total <= 0) return 'Esta cuenta no tiene importe que cobrar.';
  if (metodo === 'efectivo') return mano > 0 && mano < total ? 'Lo recibido no alcanza.' : null;
  if (metodo !== 'mixto' || suma === total) return null;
  if (suma < 0) return 'Alguno de los tres importes no es un número.';
  const falta = total - suma;
  return falta > 0 ? `Faltan ${enPesos(falta)} por desglosar.` : `Sobran ${enPesos(-falta)}.`;
}

/**
 * Los renglones que recibe `venta.cobrar`. La propina se reconoce de efectivo
 * hacia abajo: el billete que el comensal deja de más va a la bolsa del mesero
 * esa misma noche, y la de tarjeta espera a la liquidación. Sumados, los
 * `montoCentavos` dan exactamente la venta —que es lo que el servidor exige— y
 * los `propinaCentavos` exactamente la propina.
 */
function renglonesDePago(
  metodo: Metodo,
  partes: Record<MetodoBase, string>,
  venta: number,
  propina: number,
  mano: number,
): readonly Record<string, unknown>[] {
  if (metodo !== 'mixto') {
    const recibido = metodo === 'efectivo' && mano > 0 ? { recibidoCentavos: mano } : {};
    return [{ metodo, montoCentavos: venta, propinaCentavos: propina, ...recibido }];
  }
  let porAsignar = propina;
  return BASES.map((base) => {
    const importe = centavosDeTexto(partes[base]) ?? 0;
    const suya = Math.min(importe, porAsignar);
    porAsignar -= suya;
    return { metodo: base, montoCentavos: importe - suya, propinaCentavos: suya };
  }).filter((renglon) => renglon.montoCentavos > 0 || renglon.propinaCentavos > 0);
}

/** Un importe que el cajero teclea. Siempre con etiqueta: nunca un campo mudo. */
function Campo(props: {
  readonly id: string;
  readonly etiqueta: string;
  readonly valor: string;
  readonly alCambiar: (valor: string) => void;
}) {
  return (
    <div className="grow space-y-1">
      <Label htmlFor={props.id} className="capitalize">
        {props.etiqueta}
      </Label>
      <Input
        id={props.id}
        inputMode="decimal"
        value={props.valor}
        onChange={(evento) => {
          props.alCambiar(evento.target.value);
        }}
      />
    </div>
  );
}

export function Cobro({ cuentaInicial, lineasIniciales, onCobrada, onImprimir }: CobroProps) {
  const [cuenta, setCuenta] = useState<CuentaPorCobrar | null | undefined>(cuentaInicial);
  const [lineas, setLineas] = useState<readonly LineaDeCuenta[]>(lineasIniciales ?? []);
  const [metodo, setMetodo] = useState<Metodo>('efectivo');
  const [recibido, setRecibido] = useState('');
  const [partes, setPartes] = useState<Record<MetodoBase, string>>({
    efectivo: '',
    tarjeta: '',
    transferencia: '',
  });
  const [propinaResuelta, setPropinaResuelta] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cuentaInicial !== undefined) return;
    let vivo = true;
    void (async () => {
      try {
        const filtro = { estado: 'cuenta_solicitada' };
        const [fila] = await consultarPuente<CuentaPorCobrar>('Venta', { filtro, limite: 1 });
        if (!vivo) return;
        setCuenta(fila ?? null);
        if (fila === undefined) return;
        const suyas = await consultarPuente<LineaDeCuenta>('DetalleVenta', {
          filtro: { venta_id: fila.id },
          limite: 200,
        });
        if (vivo) setLineas(suyas);
      } catch (fallo) {
        if (vivo) setError(fallo instanceof Error ? fallo.message : 'No se pudo leer la cuenta.');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [cuentaInicial]);

  const venta = aCentavos(cuenta?.total);
  const propina = propinaResuelta ?? aCentavos(cuenta?.propina_monto);
  const total = venta + propina;
  const pendiente = propinaResuelta === null && SIN_DECIDIR.includes(cuenta?.propina_tipo ?? '');
  const mano = centavosDeTexto(recibido) ?? -1;
  const suma = BASES.reduce((acumula, base) => acumula + (centavosDeTexto(partes[base]) ?? -1), 0);
  const bloqueo = bloqueoDe(pendiente, total, metodo, mano, suma);

  // La pantalla no se vacía por un error: la banda va encima del último dato
  // conocido, y lo primero que dice es que la cuenta sigue sin pagarse.
  const banda =
    error === null ? null : (
      <p role="alert" className="rounded-md border border-destructive p-2 text-sm">
        {error} · La cuenta NO se marcó como pagada.
      </p>
    );

  async function cobrar(id: string): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const entrada = {
        ordenId: id,
        pagos: renglonesDePago(metodo, partes, venta, propina, mano),
        totalEsperadoCentavos: venta,
        propinaOrigen: 'caja',
      };
      setTicket(await invocarComando<Ticket>('/api/venta/cobrar', entrada));
      onCobrada?.(id);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo cobrar.');
    } finally {
      setEnviando(false);
    }
  }

  // Esqueletos con la forma del cobro: así el total no salta de sitio al cargar.
  if (cuenta === undefined) {
    return (
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Skeleton className="h-64 w-full rounded-lg xl:order-1" />
        <Skeleton className="h-64 w-full rounded-lg xl:order-2" />
        <div className="xl:col-span-2">{banda}</div>
      </div>
    );
  }

  // El vacío ENSEÑA de dónde salen las cuentas; no se disculpa por no tener.
  if (cuenta === null) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-8 text-center">
        <p className="text-xl font-semibold">Ninguna cuenta está esperando cobro.</p>
        <p className="text-muted-foreground">
          Una cuenta llega aquí cuando el mesero la cierra y el comensal pide pagar. Mientras tanto,
          el salón es el sitio donde mirar.
        </p>
        <Button asChild>
          <a href="/restaurante/mapa-de-mesas">Ver el mapa de mesas</a>
        </Button>
        {banda}
      </div>
    );
  }

  const detalle = (
    <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <ul className="space-y-1 text-sm">
        {lineas.map((linea) => (
          <li key={linea.id} className="flex items-baseline justify-between gap-3">
            <span className="truncate">
              {linea.cantidad ?? 1} × {linea.producto_nombre ?? 'Platillo'}
            </span>
            <span className="tabular-nums">{enPesos(aCentavos(linea.total))}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
        {[
          ['Subtotal', aCentavos(cuenta.subtotal)],
          ['Impuestos', aCentavos(cuenta.impuestos)],
          ['Propina', propina],
        ].map(([etiqueta, monto]) => (
          <div key={String(etiqueta)} className="flex justify-between">
            <dt className="text-muted-foreground">{etiqueta}</dt>
            <dd className="tabular-nums">{enPesos(Number(monto))}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <header className="xl:col-span-2">
        <h1 className="text-xl font-bold">Cobro · {cuenta.codigo_caja ?? 'sin código'}</h1>
        <p className="text-sm text-muted-foreground">
          {cuenta.cliente_nombre ?? 'Sin nombre'} · {cuenta.personas ?? 1} personas
        </p>
      </header>
      <div className="xl:col-span-2">{banda}</div>

      {/* El cobro va primero en el DOM: en teléfono es lo único que se ve, y para
          quien navega con lector de pantalla el total tiene que ser lo primero. */}
      <section aria-label="Cobro" className="space-y-3 xl:order-2">
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-sm font-medium uppercase text-muted-foreground">Total</p>
          <p className="text-5xl font-bold tabular-nums xl:text-6xl">{enPesos(total)}</p>
        </div>

        {ticket !== null ? (
          <div role="status" className="space-y-2 rounded-lg border border-primary p-4">
            <p className="text-lg font-semibold">Cobrado {enPesos(Number(ticket.totalCentavos))}</p>
            <p className="text-sm">
              Cambio {enPesos(Number(ticket.cambioCentavos))} · la mesa pasa sola a limpieza.
            </p>
            <Button className="w-full" onClick={() => onImprimir?.(cuenta.id)}>
              Imprimir ticket
            </Button>
          </div>
        ) : (
          <>
            {pendiente && (
              <div className="space-y-2 rounded-lg border border-warning/50 p-3">
                <p role="alert" className="text-sm font-medium">
                  Confirma la propina antes de cobrar.
                </p>
                {/* «Sin propina» pesa lo mismo que los porcentajes: es
                    voluntaria y la pantalla tiene que dejarlo obvio. */}
                <div className="grid grid-cols-4 gap-2">
                  {PROPINAS.map((puntos) => (
                    <Button
                      key={puntos}
                      variant="outline"
                      className="min-h-20 flex-col"
                      onClick={() => {
                        setPropinaResuelta(Math.round((venta * puntos) / 10000));
                      }}
                    >
                      <span className="font-bold">
                        {puntos === 0 ? 'Sin' : `${puntos / 100} %`}
                      </span>
                      <span className="text-xs tabular-nums">
                        {enPesos(Math.round((venta * puntos) / 10000))}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
              {METODOS.map((opcion) => (
                <Button
                  key={opcion}
                  variant={metodo === opcion ? 'default' : 'outline'}
                  aria-pressed={metodo === opcion}
                  className="justify-between capitalize"
                  onClick={() => {
                    setMetodo(opcion);
                  }}
                >
                  {opcion}
                  {/* La palomita: el color no puede ser el único que lo diga. */}
                  <span aria-hidden>{metodo === opcion ? '✓' : ''}</span>
                </Button>
              ))}
            </div>

            {metodo === 'efectivo' && (
              <div className="space-y-1">
                <Campo id="recibido" etiqueta="Recibido" valor={recibido} alCambiar={setRecibido} />
                <p className="text-sm tabular-nums">Cambio {enPesos(Math.max(mano - total, 0))}</p>
              </div>
            )}

            {/* El desglose exacto. Cada campo lleva el importe COMPLETO que entra
                por ese método —venta y propina juntas—, que es lo que el cajero ve
                pasar; separarlas es aritmética, no una segunda cuenta a mano. */}
            {metodo === 'mixto' &&
              BASES.map((base) => (
                <Campo
                  key={base}
                  id={base}
                  etiqueta={base}
                  valor={partes[base]}
                  alCambiar={(valor) => {
                    setPartes({ ...partes, [base]: valor });
                  }}
                />
              ))}

            <Button
              size="lg"
              className="w-full text-lg"
              disabled={enviando || bloqueo !== null}
              onClick={() => {
                void cobrar(cuenta.id);
              }}
            >
              {enviando ? 'Cobrando…' : 'COBRAR · F12'}
            </Button>
            {bloqueo !== null && <p className="text-center text-sm">{bloqueo}</p>}
          </>
        )}
      </section>

      {/* `details` nativo y no un acordeón: el teclado y el lector de pantalla ya
          saben abrirlo, y en PC no hace falta nada que abrir. */}
      <section aria-label="La cuenta" className="xl:order-1">
        <details className="rounded-lg border border-border xl:hidden">
          <summary className="cursor-pointer p-3 text-sm">{lineas.length} platillos</summary>
          {detalle}
        </details>
        <div className="hidden xl:block">{detalle}</div>
      </section>
    </div>
  );
}
