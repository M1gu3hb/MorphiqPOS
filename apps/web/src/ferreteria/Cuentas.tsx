'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Checkbox } from '@morphiqpos/ui/primitivas/checkbox';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@morphiqpos/ui/primitivas/sheet';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Vacio } from '@morphiqpos/ui/sistema';
import { FileSignature, Phone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · cuentas
 *
 * La cartera de crédito: quién debe, desde cuándo, de qué obra y a quién
 * hablarle. 10 a 20 consultas rápidas al día más una revisión completa, sobre
 * un tercio del valor del giro. Acción principal: REGISTRAR PAGO.
 *
 * ── Por qué la fila se abre POR OBRA ─────────────────────────────────────
 * F-639 hecho visible. El saldo de un contratista sin desglose por obra es un
 * número con el que no se puede tener una conversación de cobro; con desglose
 * la llamada es «de Las Torres me debes $12,100, y ésa ya te la pagaron». Por
 * eso lo que se lee es la vista `CarteraPorObra` —un renglón por obra— y el
 * cliente se arma aquí, no en la base.
 *
 * ── «Más viejo» y no «fecha del último cargo» ────────────────────────────
 * Porque la pregunta es «¿desde cuándo me debe?», no «¿qué le vendí al
 * final?». La antigüedad es la que decide a quién se le llama hoy.
 *
 * ── El semáforo y el límite son DOS problemas distintos ──────────────────
 * Días: verde hasta 15, ámbar 16–30, rojo 31+. El ⚠ del límite es
 * independiente del color, porque un cliente puede estar al corriente y aun
 * así pasado de límite. Y el color nunca va solo: cada punto lleva su palabra
 * al lado, porque quien no distingue rojo de ámbar también cobra.
 *
 * ── «Cobrado hoy» arriba, con el método ──────────────────────────────────
 * Las transferencias entran fuera de la sesión de caja (`02` §8.3): si no se
 * ven aquí no se ven en ningún lado hasta el corte, y para entonces el arqueo
 * ya no cuadra y nadie se acuerda de por qué.
 *
 * ── El pago se aplica a DOCUMENTOS, no al saldo ──────────────────────────
 * F-614 en variante. La ficha lista las remisiones abiertas con casillas y
 * trae la más vieja marcada de entrada: sugiere, no impone, y la casilla se
 * quita. Aplicar al saldo automáticamente le rompe al contratista la
 * conciliación con su propio cliente, y ése es el motivo por el que cambia de
 * proveedor.
 *
 * ── El teléfono NO es esta pantalla encogida ─────────────────────────────
 * Es la pantalla que más se usa desde el teléfono. A 390 px cada cliente es
 * un renglón de dos líneas ordenado por vencido, con su botón de llamar a un
 * toque, y la ficha entra como hoja inferior. De tablet para arriba vuelven
 * las cinco columnas del documento y la ficha se va al costado.
 *
 * ── Alcance recortado, dicho y no escondido ──────────────────────────────
 * 1. QUIÉN PUEDE RECOGER (F-638) y el alta de obras y autorizados no caben en
 *    300 líneas: viven en la ficha completa del cliente.
 * 2. «Nuevo cliente», «Estado de cuenta» y «A quién hablarle» tampoco; de la
 *    cobranza, esta pantalla sólo trae el teléfono a un toque.
 * 3. `/api/credito/pago` está nombrada en `05-DATOS-Y-BACKEND` §6. Las tres
 *    lecturas van por el puente, que es el único camino de lectura.
 */

/** Los tres tramos de antigüedad. El color SIEMPRE viaja con su palabra. */
const SEMAFORO = [
  { hasta: 15, punto: 'bg-success', palabra: 'al corriente' },
  { hasta: 30, punto: 'bg-warning', palabra: 'por vencer' },
  { hasta: Number.POSITIVE_INFINITY, punto: 'bg-destructive', palabra: 'vencido' },
] as const;

/** A partir de aquí la deuda cuenta como vencida, en la cifra y en el filtro. */
const DIAS_VENCIDO = 30;

/** Los dos métodos que entran por esta pantalla; la tarjeta pasa por caja. */
const METODOS = [
  { clave: 'efectivo', etiqueta: 'Efectivo' },
  { clave: 'transferencia', etiqueta: 'Transferencia' },
] as const;

const FILTROS = [
  { clave: 'todos', etiqueta: 'Todos' },
  { clave: 'vencidos', etiqueta: 'Vencidos' },
  { clave: 'hoy', etiqueta: 'Hoy' },
] as const;

type ClaveFiltro = (typeof FILTROS)[number]['clave'];
type ClaveMetodo = (typeof METODOS)[number]['clave'];

/** Un renglón de `CarteraPorObra`: uno por OBRA, no uno por cliente. */
export interface RenglonDeCartera {
  readonly id: string;
  readonly cliente_id: string;
  readonly cliente_nombre: string | null;
  readonly telefono: string | null;
  readonly obra_nombre: string | null;
  readonly saldo_centavos: number | null;
  readonly dias_mas_viejo: number | null;
  readonly limite_centavos: number | null;
  readonly dias_ultimo_pago: number | null;
}

export interface PagoDeCredito {
  readonly id: string;
  readonly cliente_id: string;
  readonly metodo: string | null;
  readonly monto_centavos: number | null;
  readonly fecha: string | null;
}

/** Una remisión abierta: a esto se aplica el pago, no al saldo. */
export interface DocumentoPorCobrar {
  readonly id: string;
  readonly folio: string | null;
  readonly obra_nombre: string | null;
  /**
   * Los DÍAS de la remisión no se sirven: son la diferencia contra hoy, y una
   * columna con eso dentro estaría mal el día siguiente. Se calcula al pintar.
   */
  readonly dias?: number | null;
  /** `saldo_documento_centavos`, que es como lo sirve `Remision`. */
  readonly saldo_documento_centavos: number | null;
  /** Cuándo se entregó: de aquí salen los días. */
  readonly entregada_en: string | null;
}

export interface ClienteDeCartera {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly debe: number;
  readonly dias: number;
  readonly limite: number;
  readonly diasUltimoPago: number | null;
  readonly obras: readonly RenglonDeCartera[];
}

export interface CuentasProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly renglonesIniciales?: readonly RenglonDeCartera[];
  readonly pagosIniciales?: readonly PagoDeCredito[];
  readonly documentosIniciales?: readonly DocumentoPorCobrar[];
  readonly onPagoRegistrado?: (clienteId: string, centavos: number) => void;
}

/** Centavos a pesos para una persona. Aritmética entera de punta a punta. */
export function enPesos(centavos: number): string {
  const bruto = Math.abs(centavos);
  const miles = Math.trunc(bruto / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${centavos < 0 ? '-' : ''}$${miles}.${(bruto % 100).toString().padStart(2, '0')}`;
}

function tramoDe(dias: number): { readonly punto: string; readonly palabra: string } {
  return SEMAFORO.find((tramo) => dias <= tramo.hasta) ?? SEMAFORO[2];
}

/** Sólo los pagos de hoy: la cifra de arriba es el corte del día. */
function esDeHoy(fecha: string | null): boolean {
  if (fecha === null) return false;
  const momento = new Date(fecha);
  if (Number.isNaN(momento.getTime())) return false;
  return momento.toDateString() === new Date().toDateString();
}

/** Los renglones por obra se vuelven clientes con sus obras dentro (F-639). */
export function agruparPorCliente(
  renglones: readonly RenglonDeCartera[],
): readonly ClienteDeCartera[] {
  const porId = new Map<string, ClienteDeCartera>();
  for (const fila of renglones) {
    const base = porId.get(fila.cliente_id) ?? {
      id: fila.cliente_id,
      nombre: fila.cliente_nombre ?? 'Cliente sin nombre',
      telefono: fila.telefono,
      debe: 0,
      dias: 0,
      limite: 0,
      diasUltimoPago: fila.dias_ultimo_pago,
      obras: [],
    };
    porId.set(fila.cliente_id, {
      ...base,
      debe: base.debe + (fila.saldo_centavos ?? 0),
      dias: Math.max(base.dias, fila.dias_mas_viejo ?? 0),
      limite: Math.max(base.limite, fila.limite_centavos ?? 0),
      obras: [...base.obras, fila],
    });
  }
  // Por vencido y no por nombre: lo que hay que cobrar primero se ve primero.
  return [...porId.values()].sort((a, b) =>
    b.dias === a.dias ? b.debe - a.debe : b.dias - a.dias,
  );
}

/** Los códigos estables de la API, traducidos a algo que Beto puede hacer. */
function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === 429) return 'Demasiados intentos seguidos. Espera unos segundos.';
    if (fallo.error.codigo === 'SIN_PERMISO') return 'Tu usuario no registra cobros de crédito.';
    if (fallo.error.codigo === 'CONFLICTO_ESTADO')
      return 'Alguien más aplicó un pago a estos documentos. Vuelve a abrir la ficha.';
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo hablar con el servidor.';
}

export function Cuentas({
  renglonesIniciales,
  pagosIniciales,
  documentosIniciales,
  onPagoRegistrado,
}: CuentasProps) {
  const voc = useVocabulario();
  const [renglones, setRenglones] = useState<readonly RenglonDeCartera[] | null>(
    renglonesIniciales ?? null,
  );
  const [pagos, setPagos] = useState<readonly PagoDeCredito[]>(pagosIniciales ?? []);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<ClaveFiltro>('todos');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ficha, setFicha] = useState<string | null>(null);
  const [documentos, setDocumentos] = useState<readonly DocumentoPorCobrar[] | null>(null);
  const [elegidos, setElegidos] = useState<readonly string[]>([]);
  const [metodo, setMetodo] = useState<ClaveMetodo>('efectivo');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (renglonesIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    // Las dos lecturas viajan juntas porque la cabecera es una sola frase: lo
    // que me deben y lo que ya entró hoy se leen de un vistazo, o no sirven.
    Promise.all([
      consultarPuente<RenglonDeCartera>('CarteraPorObra', { limite: 400, signal: control.signal }),
      consultarPuente<PagoDeCredito>('PagoCredito', { limite: 120, signal: control.signal }),
    ])
      .then(([cartera, cobros]) => {
        if (!sigueMontada()) return;
        setRenglones(cartera);
        setPagos(cobros.filter((pago) => esDeHoy(pago.fecha)));
      })
      .catch((fallo: unknown) => {
        if (sigueMontada()) setError(mensajeDe(fallo));
      });
    return () => {
      control.abort();
    };
  }, [renglonesIniciales]);

  useEffect(() => {
    if (ficha === null || documentosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    consultarPuente<DocumentoPorCobrar>('Remision', {
      filtro: { cliente_id: ficha },
      signal: control.signal,
    })
      .then((filas) => {
        if (!sigueMontada()) return;
        const pendientes = filas
          .filter((doc) => (doc.saldo_documento_centavos ?? 0) > 0)
          .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
        setDocumentos(pendientes);
        // La sugerencia es el más viejo, ya marcado. Se puede desmarcar.
        const viejo = pendientes[0];
        setElegidos(viejo === undefined ? [] : [viejo.id]);
      })
      .catch((fallo: unknown) => {
        if (sigueMontada()) setError(mensajeDe(fallo));
      });
    return () => {
      control.abort();
    };
  }, [ficha, documentosIniciales]);

  const clientes = useMemo(() => agruparPorCliente(renglones ?? []), [renglones]);
  const pagaronHoy = useMemo(() => new Set(pagos.map((pago) => pago.cliente_id)), [pagos]);
  const visibles = useMemo(() => {
    const aguja = busqueda.trim().toLowerCase();
    return clientes.filter((cliente) => {
      const obras = cliente.obras.map((obra) => obra.obra_nombre ?? '').join(' ');
      if (aguja !== '' && !`${cliente.nombre} ${obras}`.toLowerCase().includes(aguja)) return false;
      if (filtro === 'vencidos') return cliente.dias > DIAS_VENCIDO;
      if (filtro === 'hoy') return pagaronHoy.has(cliente.id);
      return true;
    });
  }, [clientes, busqueda, filtro, pagaronHoy]);

  const atrasados = (renglones ?? []).filter((fila) => (fila.dias_mas_viejo ?? 0) > DIAS_VENCIDO);
  const totalDebido = clientes.reduce((suma, cliente) => suma + cliente.debe, 0);
  const totalVencido = atrasados.reduce((suma, fila) => suma + (fila.saldo_centavos ?? 0), 0);
  const cobradoHoy = pagos.reduce((suma, pago) => suma + (pago.monto_centavos ?? 0), 0);
  const elegida = clientes.find((cliente) => cliente.id === ficha) ?? null;
  const pendientes = documentos ?? [];
  const sumaElegida = pendientes
    .filter((doc) => elegidos.includes(doc.id))
    .reduce((suma, doc) => suma + (doc.saldo_documento_centavos ?? 0), 0);

  function abrirFicha(clienteId: string): void {
    setFicha(clienteId);
    setDocumentos(documentosIniciales ?? null);
    setElegidos([]);
    setAviso(null);
  }

  async function registrarPago(cliente: ClienteDeCartera): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      /**
       * LOS DOCUMENTOS ELEGIDOS SUMAN, NO DIRIGEN — y antes se mandaban como si
       * dirigieran.
       *
       * `credito.registrar_pago` aplica el dinero con `repartirPago` POR
       * VENCIMIENTO —«lo que se paga primero es lo que venció primero», y es la misma
       * función en los dos giros—. La clave `documentos` no está en su esquema, así
       * que zod la tiraba EN SILENCIO: la cajera elegía la remisión 3 y el pago
       * bajaba de la 1. El importe era correcto y la aplicación no, sin un error en
       * ninguna parte.
       *
       * La selección se queda porque SIRVE: es como se arma el importe. Lo que se
       * quita es la clave que prometía dirigir el pago, y la pantalla dice en voz
       * alta a qué se aplica.
       */
      await invocarComando('/api/credito/pago', {
        clienteId: cliente.id,
        metodo,
        montoCentavos: sumaElegida,
      });
      // Se relee la cartera entera: un pago toca el saldo de varias obras a la
      // vez, y adivinar aquí cuál bajó cuánto es inventar el estado del servidor.
      setRenglones(await consultarPuente<RenglonDeCartera>('CarteraPorObra', { limite: 400 }));
      // Lo que se dice es lo que pasa: el importe sale de lo elegido y el sistema
      // lo aplica a lo que venció primero.
      setAviso(`Pago de ${enPesos(sumaElegida)} registrado. Se aplica a lo que venció primero.`);
      setFicha(null);
      onPagoRegistrado?.(cliente.id, sumaElegida);
    } catch (fallo) {
      setError(mensajeDe(fallo));
    } finally {
      setEnviando(false);
    }
  }

  // La banda va ENCIMA del último dato conocido, nunca en lugar de él, y lo
  // primero que dice es que no se aplicó ningún pago.
  const banda =
    error === null ? null : (
      <p role="alert" className="mb-3 rounded-md border border-destructive p-2 text-sm">
        {error} · Ningún pago quedó registrado.
      </p>
    );

  if (renglones === null && error === null) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-40" />
        {/* Esqueletos con la forma de la cartera: las cifras no saltan al llegar. */}
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[calc(var(--altura-control)*1.4)] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (renglones !== null && renglones.length === 0) {
    // El vacío ENSEÑA el flujo: de dónde sale un cliente de cuenta.
    return (
      <div className="mx-auto max-w-lg p-(--espacio-8)">
        <Vacio
          icono={<FileSignature />}
          titulo="Todavía no le das crédito a nadie."
          explicacion="Cuando despaches con «Remisión a cuenta» (F11) en el mostrador, el cliente aparece aquí con su obra, su antigüedad y su límite."
          accion={
            <Button asChild>
              <a href="/ferreteria/mostrador">Ir al mostrador</a>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="mb-3 text-xl font-bold">Cuentas</h1>
      {banda}
      {aviso !== null && (
        <p role="status" className="mb-3 rounded-md border border-border bg-muted p-2 text-sm">
          {aviso}
        </p>
      )}

      {/* Primero el total, después lo vencido, después lo que ya entró hoy. */}
      <dl className="mb-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <dt className="text-xs uppercase text-muted-foreground">Lo que me deben</dt>
          <dd className="text-2xl font-bold tabular-nums">{enPesos(totalDebido)}</dd>
          <dd className="text-xs text-muted-foreground">{clientes.length} clientes</dd>
        </div>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <dt className="text-xs uppercase text-muted-foreground">Vencido · 31 días o más</dt>
          <dd className="text-2xl font-bold tabular-nums">{enPesos(totalVencido)}</dd>
          <dd className="text-xs text-muted-foreground">
            {new Set(atrasados.map((fila) => fila.cliente_id)).size} clientes
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <dt className="text-xs uppercase text-muted-foreground">Cobrado hoy</dt>
          <dd className="text-2xl font-bold tabular-nums">{enPesos(cobradoHoy)}</dd>
          <dd className="text-xs text-muted-foreground">
            {METODOS.map(
              (uno) =>
                `${uno.etiqueta} ${enPesos(
                  pagos
                    .filter((pago) => pago.metodo === uno.clave)
                    .reduce((suma, pago) => suma + (pago.monto_centavos ?? 0), 0),
                )}`,
            ).join(' · ')}
          </dd>
        </div>
      </dl>

      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
        <Input
          type="search"
          aria-label={`Buscar ${voc.singular('cliente')} u obra`}
          placeholder={`Buscar ${voc.singular('cliente')} u obra`}
          value={busqueda}
          onChange={(evento) => {
            setBusqueda(evento.target.value);
          }}
          className="md:max-w-xs"
        />
        <div role="group" aria-label="Filtro de la cartera" className="flex gap-1">
          {FILTROS.map((uno) => (
            <Button
              key={uno.clave}
              type="button"
              size="sm"
              variant={filtro === uno.clave ? 'default' : 'outline'}
              aria-pressed={filtro === uno.clave}
              onClick={() => {
                setFiltro(uno.clave);
              }}
            >
              {uno.etiqueta}
            </Button>
          ))}
        </div>
      </div>

      {/* La cabecera de columnas es de tablet para arriba: en teléfono cada
          renglón se explica solo y una cabecera ahí sería una línea perdida. */}
      <div className="hidden grid-cols-[minmax(0,1fr)_7rem_9rem_7rem_6rem] gap-3 px-3 pb-1 text-xs uppercase text-muted-foreground md:grid">
        <span>{voc.titulo('cliente')} / obra</span>
        <span className="text-right">Debe</span>
        <span>Más viejo</span>
        <span className="text-right">Límite</span>
        <span>Últ. pago</span>
      </div>

      <ul className="space-y-1">
        {visibles.map((cliente) => {
          const tramo = tramoDe(cliente.dias);
          const excede = cliente.limite > 0 && cliente.debe > cliente.limite;
          const desplegado = abierto === cliente.id;
          return (
            <li key={cliente.id} className="rounded-lg border border-border bg-card">
              <div className="flex items-center">
                <button
                  type="button"
                  aria-expanded={desplegado}
                  aria-controls={`obras-${cliente.id}`}
                  onClick={() => {
                    setAbierto(desplegado ? null : cliente.id);
                  }}
                  className="grid flex-1 grid-cols-[minmax(0,1fr)_7rem] items-center gap-x-3 gap-y-1 rounded-lg p-3 text-left hover:bg-accent md:grid-cols-[minmax(0,1fr)_7rem_9rem_7rem_6rem]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      <span aria-hidden>{desplegado ? '▾' : '▸'}</span> {cliente.nombre}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {cliente.obras.length} obra(s)
                    </span>
                    {/* El aviso de límite es OTRO problema que la antigüedad. */}
                    {excede && (
                      <Badge variant="destructive" className="ml-2">
                        ⚠ pasa el límite
                      </Badge>
                    )}
                  </span>
                  <span className="text-right text-lg font-semibold tabular-nums md:text-base">
                    {enPesos(cliente.debe)}
                  </span>
                  {/* El punto de color NUNCA va solo: al lado va su palabra. */}
                  <span className="col-span-2 flex items-center gap-2 text-xs md:col-span-1 md:text-sm">
                    <span aria-hidden className={`h-2 w-2 rounded-full ${tramo.punto}`} />
                    {cliente.dias} d · {tramo.palabra}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums text-muted-foreground md:block">
                    {cliente.limite === 0 ? 'sin límite' : enPesos(cliente.limite)}
                  </span>
                  <span className="hidden text-sm text-muted-foreground md:block">
                    {cliente.diasUltimoPago === null
                      ? 'sin pagos'
                      : `hace ${cliente.diasUltimoPago} d`}
                  </span>
                </button>
                {/* Llamar a un toque desde la fila: así se cobra de verdad. */}
                {cliente.telefono !== null && (
                  <a
                    href={`tel:${cliente.telefono}`}
                    aria-label={`Llamar a ${cliente.nombre}`}
                    className="px-3 py-4 text-lg hover:bg-accent"
                  >
                    <Phone aria-hidden="true" className="inline size-4 shrink-0" />
                  </a>
                )}
                <Button
                  size="sm"
                  className="mr-3"
                  onClick={() => {
                    abrirFicha(cliente.id);
                  }}
                >
                  Registrar pago
                </Button>
              </div>

              {desplegado && (
                <ul id={`obras-${cliente.id}`} className="border-t border-border px-3 py-2">
                  {cliente.obras.map((obra) => {
                    const suyo = tramoDe(obra.dias_mas_viejo ?? 0);
                    return (
                      <li
                        key={obra.id}
                        className="flex items-center justify-between gap-2 py-1 text-sm"
                      >
                        <span className="min-w-0 truncate">· {obra.obra_nombre ?? 'Sin obra'}</span>
                        <span className="flex shrink-0 items-center gap-2 tabular-nums">
                          {enPesos(obra.saldo_centavos ?? 0)}
                          <span className="text-muted-foreground">
                            {obra.dias_mas_viejo ?? 0} d · {suyo.palabra}
                          </span>
                          <span aria-hidden className={`h-2 w-2 rounded-full ${suyo.punto}`} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {visibles.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">
          {voc.conDeterminante('ningun', 'cliente')} cae en este filtro. Quita la búsqueda o vuelve
          a «Todos».
        </p>
      )}

      {/* Hoja inferior en teléfono, costado en PC: la lista no se pierde. */}
      <Sheet
        open={elegida !== null}
        onOpenChange={(visible) => {
          if (!visible) setFicha(null);
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-y-auto md:inset-y-0 md:left-auto md:max-h-none md:w-full md:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>{elegida?.nombre ?? 'Cliente'}</SheetTitle>
            <SheetDescription>
              Debe {enPesos(elegida?.debe ?? 0)} · más viejo {elegida?.dias ?? 0} días · límite{' '}
              {elegida === null || elegida.limite === 0 ? 'sin definir' : enPesos(elegida.limite)}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 px-4 pb-6">
            <div role="group" aria-label="Método del pago" className="flex gap-2">
              {METODOS.map((uno) => (
                <Button
                  key={uno.clave}
                  type="button"
                  size="sm"
                  variant={metodo === uno.clave ? 'default' : 'outline'}
                  aria-pressed={metodo === uno.clave}
                  onClick={() => {
                    setMetodo(uno.clave);
                  }}
                >
                  {uno.etiqueta}
                </Button>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">
              El pago se aplica a documentos, no al saldo. Viene marcado el más viejo; el cliente
              decide.
            </p>

            {documentos === null ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-[calc(var(--altura-control)*1.1)] w-full" />
                ))}
              </div>
            ) : pendientes.length === 0 ? (
              <p className="rounded-md border border-border p-3 text-sm">
                Este cliente no tiene remisiones abiertas: su saldo ya quedó aplicado a documentos
                cerrados.
              </p>
            ) : (
              <>
                <p className="text-muted-foreground text-xs">
                  Lo que marques SUMA el importe. El pago se aplica a lo que venció primero, que es
                  como se lleva una cuenta de crédito.
                </p>
                <ul className="space-y-1">
                  {pendientes.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center gap-3 rounded-md border border-border p-2"
                    >
                      <Checkbox
                        id={`doc-${doc.id}`}
                        checked={elegidos.includes(doc.id)}
                        onCheckedChange={(marcado) => {
                          setElegidos(
                            marcado === true
                              ? [...elegidos, doc.id]
                              : elegidos.filter((uno) => uno !== doc.id),
                          );
                        }}
                      />
                      <label htmlFor={`doc-${doc.id}`} className="flex flex-1 flex-col text-sm">
                        <span className="font-medium">
                          {doc.folio ?? 'Sin folio'} · {enPesos(doc.saldo_documento_centavos ?? 0)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {doc.obra_nombre ?? 'Sin obra'} · {doc.dias ?? 0} días
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <Separator />
            <div className="flex items-center justify-between gap-3">
              <span className="text-lg font-bold tabular-nums">{enPesos(sumaElegida)}</span>
              <Button
                disabled={enviando || elegidos.length === 0 || elegida === null}
                onClick={() => {
                  if (elegida !== null) void registrarPago(elegida);
                }}
              >
                {enviando ? 'Registrando…' : 'Registrar pago'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
