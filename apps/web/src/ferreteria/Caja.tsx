'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · caja
 *
 * Cobrar la nota que el mostrador armó. 25 a 60 veces al día, siempre con una
 * persona enfrente y casi siempre con otra detrás de ella.
 *
 * ── Por qué es una pantalla aparte del mostrador ─────────────────────────
 * Por el modo B: el que despacha no cobra. Son dos personas y dos
 * responsabilidades, y juntarlas obligaría a la caja a ver el catálogo y al
 * mostrador a ver el dinero. En modo A el bloque de cobro se expande a la
 * derecha de la pantalla 1 — eso lo decide quien la monta, no este archivo.
 *
 * ── Por qué los cuatro métodos son del MISMO tamaño ──────────────────────
 * En abarrotes el efectivo gana 200 de 220 veces y los demás son desvíos. Aquí
 * los cuatro compiten de verdad, y presuponer uno sale caro: una venta de
 * $6,000 marcada como efectivo cuando entró por transferencia descuadra el
 * arqueo de forma escandalosa. Por eso «A cuenta» se ve tan disponible como
 * «Efectivo»: es un tercio del valor del giro, y esconderlo en un menú sería
 * negar la forma del negocio.
 *
 * ── Por qué «pagadas, sin entregar» no se puede plegar ───────────────────
 * Porque es el descuadre que hace que alguien entregue dos veces el mismo
 * material. Verla todo el día, aunque estorbe, es justo lo que lo evita.
 *
 * ── Por qué el saldo del cliente se repite aquí ──────────────────────────
 * Ya se vio en el mostrador, sí, pero quien cobra es OTRA persona y la
 * decisión de dar crédito es suya. El dato tiene que estar delante de quien
 * decide, no de quien decidió antes.
 *
 * ── Por qué el teléfono no es esta pantalla ──────────────────────────────
 * La caja no se opera desde el teléfono: el cajón, la impresora y la terminal
 * están en el mostrador. Lo único que se hace desde fuera es confirmar una
 * transferencia contra el banco, y eso es lo único que el teléfono trae.
 *
 * ── Los tres fallos que tenía esta pantalla, y qué se hizo ───────────────
 * 1. Filtraba por `pendiente_cobro`, un estado que **no existe** en el `check`
 *    de `ordenes.estado`: su lista de notas pendientes no podía tener una fila
 *    nunca. Ahora lee `NotaDeCaja`, la vista `notas_de_caja` (169/170), cuyo
 *    estado se calcula de los dos reales —el de la orden dice si entró el
 *    dinero, el de la nota si salió el material—.
 * 2. Leía once campos que la entidad `Venta` no tiene —`codigo_caja`,
 *    `atendio`, `vence`, `saldo_cliente`…—, así que cada renglón habría salido
 *    «—» incluso con el estado arreglado. Ahora salen de la vista.
 * 3. Publicaba en `/api/venta/cobrar` un cuerpo que ese comando rechaza
 *    (`{ventaId, metodo}` en vez de `{ordenId, pagos:[…]}`): **la caja nunca
 *    cobró**. Ahora manda los pagos como el comando los pide.
 *
 * ── Y «A cuenta» no es un método de pago ─────────────────────────────────
 * `venta.cobrar` acepta efectivo, tarjeta y transferencia, y hace bien: a
 * cuenta **no entra dinero**. Lo que pasa es que el material sale firmado, y eso
 * es `credito.registrar_remision`: sube el saldo del cliente, toma folio de
 * remisión y sella quién recibió. Mandarlo por el cobro habría necesitado un
 * cuarto método que no mueve caja y dejaría el arqueo cuadrando de milagro.
 *
 * ── Alcance recortado, dicho y no escondido ──────────────────────────────
 * 1. Apertura con denominaciones, movimientos, arqueo a ciegas y los cuatro
 *    bloqueos de cierre se heredan de `abarrotes` §PANTALLA 9 y viven en sus
 *    propias pantallas; por eso el pie muestra lo que esta lectura sí sabe
 *    —lo que falta por cobrar— y no el fondo del cajón, que no llega aquí.
 * 2. El desglose de pago mixto y el cálculo de cambio no caben en un archivo:
 *    esta pantalla sella un método por nota.
 */

/** Los cuatro métodos, en el orden del documento y con el mismo peso visual. */
const METODOS = [
  { clave: 'efectivo', etiqueta: 'Efectivo' },
  { clave: 'tarjeta', etiqueta: 'Tarjeta' },
  { clave: 'transferencia', etiqueta: 'Transferencia' },
  { clave: 'cuenta', etiqueta: 'A cuenta' },
] as const;

export type MetodoDeCobro = (typeof METODOS)[number]['clave'];

/**
 * Los tres estados que la vista calcula, escritos una vez.
 *
 * `por_entregar` se llama por lo que FALTA y no por lo que entró: la pregunta de
 * la segunda lista no es «¿ya pagaron?» sino «¿esto ya salió?», porque lo que
 * evita es entregar dos veces el mismo material. Una nota pagada en efectivo y
 * una firmada a crédito están en el mismo sitio: cerradas para la caja, con el
 * material todavía en el patio.
 */
const PENDIENTE = 'por_cobrar';
const POR_ENTREGAR = 'por_entregar';
const APARTADA = 'apartada';

/** Minutos de vigencia a partir de los cuales la nota ya se avisa. */
const AVISO_MINUTOS = 10;

export interface NotaDeCaja {
  /** La ORDEN: es lo que `venta.cobrar` recibe y con lo que se leen sus partidas. */
  readonly id: string;
  /** La NOTA, para entregarla. No es lo mismo, y confundirlas cobra otra venta. */
  readonly nota_id: string | null;
  readonly codigo_caja: string | null;
  readonly cliente_nombre: string | null;
  readonly cliente_id: string | null;
  readonly obra: string | null;
  readonly recoge_nombre: string | null;
  readonly recoge_autorizado: boolean;
  readonly atendio: string | null;
  readonly creada: string | null;
  readonly vence: string | null;
  readonly estado: string | null;
  /** En CENTAVOS, como los sirve la vista. Sin división de ida y vuelta. */
  readonly totalCentavos: number | null;
  readonly saldoClienteCentavos: number | null;
  readonly limiteClienteCentavos: number | null;
}

/** F-212 · Una transferencia de crédito que todavía no se vio en el banco. */
export interface TransferenciaPendiente {
  readonly pagoId: string;
  readonly montoCentavos: string;
  readonly referencia: string | null;
  readonly horasEsperando: number;
}

export interface LineaDeNota {
  readonly id: string;
  readonly venta_id: string;
  readonly producto_nombre: string | null;
  readonly cantidad: number | null;
  readonly unidad: string | null;
  readonly total: number | null;
}

export interface CajaProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly notasIniciales?: readonly NotaDeCaja[];
  readonly lineasIniciales?: readonly LineaDeNota[];
  readonly transferenciasIniciales?: readonly TransferenciaPendiente[];
  readonly onCobrada?: (notaId: string, metodo: MetodoDeCobro) => void;
}

/** Pesos a centavos contando dígitos: `1234.995 * 100` pierde medio centavo. */
function aCentavos(pesos: number | null | undefined): number {
  if (pesos === null || pesos === undefined || !Number.isFinite(pesos)) return 0;
  const [entero = '0', decimal = '00'] = Math.abs(pesos).toFixed(2).split('.');
  return (pesos < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

/** Centavos a pesos para una persona. Aritmética entera de punta a punta. */
export function enPesos(centavos: number): string {
  const bruto = Math.abs(centavos);
  const miles = Math.trunc(bruto / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${centavos < 0 ? '-' : ''}$${miles}.${(bruto % 100).toString().padStart(2, '0')}`;
}

/** Minutos enteros que faltan. `null` cuando no caduca o todavía no hay reloj. */
export function minutosPara(vence: string | null, ahora: number | null): number | null {
  if (vence === null || ahora === null) return null;
  const limite = Date.parse(vence);
  if (Number.isNaN(limite)) return null;
  return Math.ceil((limite - ahora) / 60000);
}

function horaDe(iso: string | null): string {
  if (iso === null) return '';
  const momento = new Date(iso);
  if (Number.isNaN(momento.getTime())) return '';
  return momento.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/** Una nota sin cliente es del mostrador, y así se dice en la lista. */
function nombreDe(nota: NotaDeCaja): string {
  return nota.cliente_nombre ?? 'mostrador';
}

/** El total de la nota, en centavos. Nulo es cero: una nota vacía no debe nada. */
function totalDe(nota: NotaDeCaja): number {
  return nota.totalCentavos ?? 0;
}

function sumaDe(notas: readonly NotaDeCaja[]): number {
  return notas.reduce((suma, nota) => suma + totalDe(nota), 0);
}

export function Caja({
  notasIniciales,
  lineasIniciales,
  transferenciasIniciales,
  onCobrada,
}: CajaProps) {
  const voc = useVocabulario();
  const [notas, setNotas] = useState<readonly NotaDeCaja[] | null>(notasIniciales ?? null);
  const [lineas, setLineas] = useState<readonly LineaDeNota[]>(lineasIniciales ?? []);
  const [elegida, setElegida] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferencias, setTransferencias] = useState<readonly TransferenciaPendiente[]>(
    transferenciasIniciales ?? [],
  );
  // El aviso del banco va APARTE del de cobrar: «no se pudo leer el banco» y
  // «ninguna nota se marcó como pagada» son dos cosas, y juntarlas diría que
  // falló un cobro que nadie intentó.
  const [avisoBanco, setAvisoBanco] = useState<string | null>(null);
  // Arranca en `null` y lo llena el efecto: el reloj del servidor y el del
  // navegador no son el mismo, y pintarlo en el HTML inicial rompe la hidratación.
  const [ahora, setAhora] = useState<number | null>(null);

  useEffect(() => {
    const tic = (): void => {
      setAhora(Date.now());
    };
    // El primer tic va en el siguiente turno del bucle, no en el cuerpo del
    // efecto: así la hora entra sin encadenar un render extra en cada montaje.
    const primero = setTimeout(tic);
    const reloj = setInterval(tic, 30000);
    return () => {
      clearTimeout(primero);
      clearInterval(reloj);
    };
  }, []);

  useEffect(() => {
    if (notasIniciales !== undefined) return;
    let vivo = true;
    // `NotaDeCaja`, no `Venta`: lo que la caja lista son NOTAS —con su folio, su
    // caducidad y su propio estado—, y una orden pagada cuyo material sigue en el
    // patio no se distingue mirando `ordenes`.
    consultarPuente<NotaDeCaja>('NotaDeCaja', { limite: 80 })
      .then((filas) => {
        if (vivo) setNotas(filas);
      })
      .catch((fallo: unknown) => {
        // La caja NUNCA se queda en blanco por la red: el cajero prefiere la
        // lista de hace diez segundos a no tener ninguna.
        if (vivo) setError(fallo instanceof Error ? fallo.message : 'No se pudo leer la caja.');
      });
    return () => {
      vivo = false;
    };
  }, [notasIniciales]);

  const todas = notas ?? [];
  const pendientes = todas.filter((nota) => nota.estado === PENDIENTE);
  const porEntregar = todas.filter((nota) => nota.estado === POR_ENTREGAR);
  // Apartadas no se cobran —el cliente dijo «ahorita vuelvo»— pero tampoco se
  // esconden: son material comprometido, y no verlas es como el patio se llena.
  const apartadas = todas.filter((nota) => nota.estado === APARTADA);
  const seleccionada = todas.find((nota) => nota.id === elegida) ?? pendientes[0] ?? null;
  const notaId = seleccionada === null ? null : seleccionada.id;

  useEffect(() => {
    if (lineasIniciales !== undefined || notaId === null) return;
    let vivo = true;
    consultarPuente<LineaDeNota>('DetalleVenta', { filtro: { venta_id: notaId } })
      .then((filas) => {
        if (vivo) setLineas(filas);
      })
      .catch((fallo: unknown) => {
        if (vivo)
          setError(
            fallo instanceof Error ? fallo.message : `No se pudo leer ${voc.enFrase('orden')}.`,
          );
      });
    return () => {
      vivo = false;
    };
  }, [lineasIniciales, notaId, voc]);

  useEffect(() => {
    if (transferenciasIniciales !== undefined) return;
    let vivo = true;
    invocarComando<{ readonly pendientes: readonly TransferenciaPendiente[] }>(
      '/api/credito/transferencias-pendientes',
      { horas: 72 },
    )
      .then((resultado) => {
        if (vivo) setTransferencias(resultado.pendientes);
      })
      .catch((fallo: unknown) => {
        if (vivo)
          setAvisoBanco(
            fallo instanceof Error
              ? fallo.message
              : 'No se pudieron leer las transferencias por confirmar.',
          );
      });
    return () => {
      vivo = false;
    };
  }, [transferenciasIniciales]);

  const suyas = lineas.filter((linea) => linea.venta_id === notaId);
  const total = seleccionada === null ? 0 : totalDe(seleccionada);
  const saldo = seleccionada?.saldoClienteCentavos ?? 0;
  const limite = seleccionada?.limiteClienteCentavos ?? 0;
  const excede = limite > 0 && saldo + total > limite;
  // A cuenta necesita a alguien a quien fiarle: sin ficha no hay saldo que subir
  // ni documento que cobrar después.
  const sinFicha = seleccionada !== null && seleccionada.cliente_id === null;

  async function sellar(nota: NotaDeCaja, metodo: MetodoDeCobro): Promise<void> {
    setEnviando(`${nota.id}·${metodo}`);
    setError(null);
    try {
      if (metodo === 'cuenta') {
        // A CUENTA · no entra dinero, sale material firmado. Es una remisión:
        // sube el saldo del cliente, toma su propio folio y sella quién recibió.
        await invocarComando('/api/credito/remision', {
          ordenId: nota.id,
          clienteId: nota.cliente_id,
          importeCentavos: totalDe(nota),
          // Quien firma es quien viene por el material: el autorizado si hay
          // uno, y si no el cliente mismo. El documento sin nombre no sirve.
          nombreFirmante: nota.recoge_nombre ?? nota.cliente_nombre ?? 'Sin nombre',
        });
      } else {
        // El cuerpo que `venta.cobrar` pide. `totalEsperadoCentavos` no cobra:
        // si el servidor recalcula otro total, rechaza en vez de cobrar el suyo
        // en silencio —el cajero ya le dijo un número al cliente—.
        await invocarComando('/api/venta/cobrar', {
          ordenId: nota.id,
          totalEsperadoCentavos: totalDe(nota),
          pagos: [
            {
              metodo,
              montoCentavos: totalDe(nota),
              // En efectivo, lo recibido sirve para el cambio. Esta pantalla
              // sella un método exacto por nota, así que es el total.
              ...(metodo === 'efectivo' ? { recibidoCentavos: totalDe(nota) } : {}),
            },
          ],
        });
      }
      // Cerrada para la caja; el material sigue en el patio hasta que se entrega.
      setNotas(
        todas.map((fila) => (fila.id === nota.id ? { ...fila, estado: POR_ENTREGAR } : fila)),
      );
      setElegida(null);
      onCobrada?.(nota.id, metodo);
    } catch (fallo) {
      setError(
        fallo instanceof Error ? fallo.message : `No se pudo cobrar ${voc.enFrase('orden')}.`,
      );
    } finally {
      setEnviando(null);
    }
  }

  /**
   * F-212 · Confirmar contra el banco lo que un cliente dijo que transfirió.
   *
   * Es lo ÚNICO que se hace desde fuera del mostrador, y es de la cartera, no de
   * esta venta: lo que se confirma es un pago de crédito (`pagos_credito`), y
   * hasta que se confirma no baja ningún saldo. La versión anterior mandaba
   * `{ventaId}` al comando, que pide `{pagoId}` sobre otra tabla: no confirmaba
   * nada.
   */
  async function confirmar(transferencia: TransferenciaPendiente): Promise<void> {
    setEnviando(`${transferencia.pagoId}·transferencia`);
    setAvisoBanco(null);
    try {
      await invocarComando('/api/credito/confirmar-transferencia', {
        pagoId: transferencia.pagoId,
        referenciaBancaria: null,
      });
      setTransferencias(transferencias.filter((t) => t.pagoId !== transferencia.pagoId));
    } catch (fallo) {
      setAvisoBanco(fallo instanceof Error ? fallo.message : 'No se pudo confirmar.');
    } finally {
      setEnviando(null);
    }
  }

  // La banda va ENCIMA del último dato conocido, nunca en lugar de él, y lo
  // primero que dice es que nada se cobró.
  const banda = (
    <>
      {error !== null && (
        <p role="alert" className="mb-3 rounded-md border border-destructive p-2 text-sm">
          {error} · Ninguna nota se marcó como pagada.
        </p>
      )}
      {avisoBanco !== null && (
        <p role="alert" className="mb-3 rounded-md border border-destructive p-2 text-sm">
          {avisoBanco} · Ninguna transferencia se marcó como confirmada.
        </p>
      )}
    </>
  );

  if (notas === null) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-40" />
        {banda}
        {/* Esqueletos con la forma de la caja: el total no salta de sitio al llegar. */}
        <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]">
          <Skeleton className="h-72 w-full rounded-lg" />
          <Skeleton className="h-72 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (todas.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-8 text-center">
        {banda}
        <p className="text-xl font-semibold">La caja está al día.</p>
        {/* El vacío ENSEÑA de dónde salen las notas; no se disculpa por no tener. */}
        <p className="text-muted-foreground">
          Una nota llega aquí cuando el mostrador la cierra. Mientras no haya ninguna, el sitio
          donde mirar es el mostrador.
        </p>
        <Button asChild>
          <a href="/ferreteria/mostrador">Ir al mostrador</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="mb-3 text-xl font-bold">Caja</h1>
      {banda}

      {/* TELÉFONO · otra pantalla, no ésta encogida. Fuera del mostrador lo
          único que se hace es cotejar una transferencia contra el banco. */}
      <section aria-label="Transferencias por confirmar" className="space-y-3 md:hidden">
        <p className="text-sm text-muted-foreground">
          La caja se opera en el mostrador. Desde el teléfono sólo se confirman transferencias.
        </p>
        {transferencias.length === 0 ? (
          <p className="rounded-lg border border-border p-4 text-sm">
            Ninguna transferencia espera confirmación. Cuando un cliente pague su cuenta así, el
            pago aparece aquí para cotejarlo contra el banco — y hasta entonces su saldo no baja.
          </p>
        ) : (
          <ul className="space-y-2">
            {transferencias.map((transferencia) => (
              <li
                key={transferencia.pagoId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <span className="min-w-0">
                  <span className="block font-medium tabular-nums">
                    {enPesos(Number(transferencia.montoCentavos))}
                  </span>
                  {/* Las horas esperando van en la lista: una de hace veinte
                      minutos y una de hace tres días no se revisan con la misma
                      prisa. */}
                  <span className="block truncate text-sm text-muted-foreground">
                    {transferencia.referencia ?? 'sin referencia'} · hace{' '}
                    {transferencia.horasEsperando} h
                  </span>
                </span>
                <Button
                  disabled={enviando !== null}
                  onClick={() => {
                    void confirmar(transferencia);
                  }}
                >
                  Confirmar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* PC y TABLET · las notas a la izquierda, la que se cobra a la derecha.
          En tablet la columna de notas se estrecha, pero no se esconde: elegir
          a quién cobrar es la mitad del trabajo. */}
      <div className="hidden gap-4 md:grid md:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section aria-label={`${voc.titulo('orden', true)} pendientes`}>
            <h2 className="mb-2 text-sm font-semibold uppercase">
              Notas pendientes ({pendientes.length})
            </h2>
            <ul className="space-y-1">
              {pendientes.map((nota) => {
                const activa = notaId === nota.id;
                const faltan = minutosPara(nota.vence, ahora);
                return (
                  <li key={nota.id}>
                    <button
                      type="button"
                      aria-current={activa ? 'true' : undefined}
                      onClick={() => {
                        setElegida(nota.id);
                      }}
                      className={[
                        'flex w-full items-baseline gap-2 rounded-md px-2 py-2 text-left',
                        'transition-colors hover:bg-accent hover:text-accent-foreground',
                        activa ? 'bg-accent text-accent-foreground' : '',
                      ].join(' ')}
                    >
                      {/* El punto, no sólo el fondo: el color nunca decide solo. */}
                      <span aria-hidden className="w-3">
                        {activa ? '●' : ''}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium tabular-nums">{nota.codigo_caja ?? '—'}</span>{' '}
                        {nombreDe(nota)}
                      </span>
                      <span className="tabular-nums">{enPesos(totalDe(nota))}</span>
                    </button>
                    {/* Avisa ANTES de liberar el material, no después. */}
                    {faltan !== null && faltan <= AVISO_MINUTOS && (
                      <p className="px-2 text-xs text-muted-foreground">
                        ⏱ {nota.codigo_caja ?? voc.conDeterminante('este', 'orden')}{' '}
                        {faltan > 0 ? `vence en ${faltan} min` : 'ya venció'}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Siempre a la vista, nunca plegable: es lo que evita entregar dos
              veces el mismo material. Están las pagadas y las firmadas a
              crédito, porque las dos dejan material esperando en el patio. */}
          <section aria-label="Cerradas, sin entregar">
            <h2 className="mb-2 text-sm font-semibold uppercase">
              Cerradas, sin entregar ({porEntregar.length})
            </h2>
            {porEntregar.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">Nada cerrado espera en el andén.</p>
            ) : (
              <ul className="space-y-1">
                {porEntregar.map((nota) => (
                  <li key={nota.id} className="flex gap-2 px-2 py-1 text-sm">
                    <span className="tabular-nums">{nota.codigo_caja ?? '—'}</span>
                    <span className="min-w-0 flex-1 truncate">{nombreDe(nota)}</span>
                    <span className="tabular-nums">{enPesos(totalDe(nota))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Separator />
          <p className="text-sm text-muted-foreground">
            Por cobrar · {pendientes.length} notas · {enPesos(sumaDe(pendientes))}
          </p>
          {/* Lo apartado no se cobra hoy, y tampoco se esconde: es material
              comprometido, y no verlo es como el patio se llena de pedidos de
              clientes que no volvieron. */}
          {apartadas.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Apartadas · {apartadas.length} notas · {enPesos(sumaDe(apartadas))} esperando a su
              dueño
            </p>
          )}
        </aside>

        <section
          aria-label={`${voc.titulo('orden')} seleccionad${voc.terminacion('orden')}`}
          className="space-y-3"
        >
          {seleccionada === null ? (
            <p className="rounded-lg border border-border p-6 text-center text-muted-foreground">
              Elige {voc.enFraseCon('un', 'orden')} de la izquierda para cobrarla.
            </p>
          ) : (
            <>
              <header>
                <h2 className="text-lg font-semibold">
                  Nota {seleccionada.codigo_caja ?? '—'} · {seleccionada.atendio ?? 'mostrador'} ·{' '}
                  {horaDe(seleccionada.creada)}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {nombreDe(seleccionada)}
                  {seleccionada.obra === null ? '' : ` · obra ${seleccionada.obra}`}
                </p>
                {seleccionada.recoge_nombre !== null && (
                  <p className="mt-1 text-sm">
                    Recoge: {seleccionada.recoge_nombre}{' '}
                    <Badge variant={seleccionada.recoge_autorizado ? 'secondary' : 'destructive'}>
                      {seleccionada.recoge_autorizado ? '✓ autorizado' : '✗ sin autorizar'}
                    </Badge>
                  </p>
                )}
              </header>

              <ul className="space-y-1 rounded-lg border border-border p-3 text-sm">
                {suyas.map((linea) => (
                  <li key={linea.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">{linea.producto_nombre ?? 'Material'}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {linea.cantidad ?? 1} {linea.unidad ?? 'pz'}
                    </span>
                    <span className="shrink-0 tabular-nums">{enPesos(aCentavos(linea.total))}</span>
                  </li>
                ))}
              </ul>

              {/* Región con nombre, como en los otros cuatro modelos: es EL
                  número que se dice en voz alta, y tenerlo nombrado es lo que
                  permite que un lector de pantalla —y la suite— lo encuentren
                  sin agarrarse de una clase de CSS. */}
              <section
                aria-label={`Total de ${voc.enFrase('orden')}`}
                className="rounded-lg border border-border bg-card p-4 text-center text-card-foreground"
              >
                <span className="block text-sm font-medium uppercase text-muted-foreground">
                  Total
                </span>
                <span className="block text-4xl font-bold tabular-nums xl:text-5xl">
                  {enPesos(total)}
                </span>
              </section>

              {/* Los cuatro en la misma rejilla y del mismo tamaño: aquí compiten
                  de verdad, y presuponer uno descuadra el arqueo de la noche. */}
              <div className="grid grid-cols-2 gap-2">
                {METODOS.map((metodo) => (
                  <Button
                    key={metodo.clave}
                    size="lg"
                    variant={
                      metodo.clave === 'cuenta' && (excede || sinFicha) ? 'outline' : 'default'
                    }
                    disabled={
                      enviando !== null || (metodo.clave === 'cuenta' && (excede || sinFicha))
                    }
                    className="min-h-20 text-base"
                    onClick={() => {
                      void sellar(seleccionada, metodo.clave);
                    }}
                  >
                    {enviando === `${seleccionada.id}·${metodo.clave}`
                      ? 'Cobrando…'
                      : metodo.etiqueta}
                  </Button>
                ))}
              </div>

              {/* El saldo se repite aquí porque quien cobra es otra persona, y el
                  bloqueo se dice con palabras: un botón apagado no explica nada. */}
              {limite > 0 && (
                <p className="text-sm">
                  ⓘ A cuenta: debe {enPesos(saldo)} de {enPesos(limite)}.
                  {excede ? ' Con esta nota pasa de su límite: no se puede cobrar a cuenta.' : ''}
                </p>
              )}
              {/* Un botón apagado no explica nada, y ésta es la razón más común
                  de que lo esté: la nota es del mostrador, sin nadie a quien
                  fiarle. */}
              {sinFicha && (
                <p className="text-sm">
                  ⓘ Esta nota es de mostrador, sin {voc.enFrase('cliente')} con cuenta: a cuenta no
                  se puede. Dale de alta {voc.enFraseCon('un', 'cliente')} para fiarle.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
