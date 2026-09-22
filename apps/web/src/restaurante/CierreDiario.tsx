'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@morphiqpos/ui/primitivas/dialog';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Switch } from '@morphiqpos/ui/primitivas/switch';
import { Vacio } from '@morphiqpos/ui/sistema';
import { Lock } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@morphiqpos/ui/primitivas/table';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · restaurante · cierre-diario-y-arqueo
 *
 * Cerrar el día y saber si cuadró. Una vez al día, a las 23:30, el encargado o
 * el dueño. Es la pantalla que menos se usa y la que más cuesta cuando falla.
 *
 * ── El arqueo A CIEGAS es la regla que define esta pantalla ──────────────
 * El campo de conteo va PRIMERO, vacío y con el foco puesto, y el esperado no
 * aparece hasta que hay una cifra escrita. Si se enseñara antes, todo el mundo
 * teclearía ese número y el arqueo dejaría de existir como control: sería un
 * formulario que se copia solo.
 *
 * ── Y sin embargo las secciones van en el orden del PDF ──────────────────
 * Porque quien cierra ya sabe leer ese documento antes de generarlo, y cambiar
 * el orden le obligaría a aprenderlo dos veces. Se resuelve con el ESPACIO y no
 * con el orden: el conteo vive en su propia columna —fija arriba en teléfono y
 * tablet, carril derecho pegajoso en PC—, así que encabeza la jerarquía sin
 * desordenar el 1·2·3. En el DOM va primero, que es lo que decide el foco y lo
 * que oye un lector de pantalla.
 *
 * ── Las mesas abiertas son un MURO, y se comprueba DOS veces ─────────────
 * Al abrir el diálogo y otra vez justo antes de ejecutar. Entre una cosa y la
 * otra pasan los tres minutos que se tarda en contar el cajón, y en esos tres
 * minutos alguien sienta una mesa. Cerrar con una cuenta viva deja esa venta
 * fuera del corte, y eso no lo cuadra nadie después.
 *
 * ── El PDF se descarga solo ──────────────────────────────────────────────
 * Salvo que la perilla esté apagada. El dueño se va y lo lee en el coche; un
 * documento que hay que ir a buscar es un documento que no se lee.
 *
 * ── Lo que NO va aquí ────────────────────────────────────────────────────
 * Inventario, historial, edición de ventas y reportes de otros días. Esto
 * cierra HOY; lo demás se pregunta en «Registros».
 *
 * ── Alcance recortado, dicho y no escondido ──────────────────────────────
 * 1. El efectivo esperado se DERIVA aquí (fondo + ventas en efectivo + propina
 *    en efectivo − gastos pagados en efectivo) para poder enseñar el semáforo
 *    sin cerrar. La cifra que manda es la de `caja.cerrar`, calculada dentro de
 *    su transacción; si difieren gana la del corte, y se ve al cerrar.
 * 2. `caja.cerrar` todavía no recibe el fondo que se deja en el cajón, así que
 *    viaja en `notas`. Cuando el comando lo acepte, sube a campo propio.
 * 3. El comprobante no se genera aquí: la pantalla avisa por `onImprimirElCierre`,
 *    y quien la monta decide cómo se imprime. NO hay generador de PDF en el
 *    sistema —`FORMATOS` de reportes sólo tiene `csv`— y el botón decía
 *    «Descargar el PDF del cierre»: una promesa que nada podía cumplir, y que
 *    además no hacía NADA porque ninguna página pasaba el callback.
 * 4. Los importes se formatean con funciones locales y no importadas de otra
 *    pantalla: una pantalla no depende de otra, y el módulo común de dinero no
 *    es uno de los dos archivos que este encargo puede escribir.
 */

const CANALES = ['efectivo', 'tarjeta', 'transferencia'] as const;
type Canal = (typeof CANALES)[number];

/** Por debajo de esto el descuadre es «se me fue un peso»; por encima, no. */
const TOLERANCIA_CENTAVOS = 2000;

const SECCION = 'rounded-lg border border-border bg-card text-card-foreground shadow-1';
const TITULO = 'cursor-pointer p-(--espacio-3) text-sm font-semibold uppercase tracking-wide';

/** La venta del día tal como la nombra el puente. Los importes van en PESOS. */
export interface VentaDelDia {
  readonly id: string;
  readonly estado: string | null;
  readonly total: number | null;
  readonly costo_total_snapshot: number | null;
  readonly propina_efectivo: number | null;
  readonly propina_tarjeta: number | null;
  readonly propina_transferencia: number | null;
  readonly monto_efectivo: number | null;
  readonly monto_tarjeta: number | null;
  readonly monto_transferencia: number | null;
  readonly usuario_mesero_nombre: string | null;
  readonly fecha_apertura: string | null;
}

export interface GastoDelDia {
  readonly id: string;
  readonly monto: number | null;
  readonly metodo_pago: string | null;
}

export interface MesaViva {
  readonly id: string;
  readonly numero: number | null;
  readonly venta_activa_id: string | null;
  readonly mesero_asignado_nombre: string | null;
}

export interface DatosDelDia {
  readonly ventas: readonly VentaDelDia[];
  readonly gastos: readonly GastoDelDia[];
  readonly mesas: readonly MesaViva[];
  /** Lo que se contó al abrir: la primera pieza del efectivo esperado. */
  readonly fondoInicial: number;
  readonly cajaAbierta: boolean;
}

/** Lo que devuelve `caja.cerrar`. Sus importes llegan como texto de BigInt. */
export interface ResultadoDelCierre {
  readonly serie: string;
  readonly folio: string;
  readonly efectivoEsperadoCentavos: string;
  readonly diferenciaCentavos: string;
  readonly numeroVentas: number;
}

export interface MesaQueBloquea {
  readonly id: string;
  readonly rotulo: string;
  readonly mesero: string;
  readonly total: number;
  readonly abierta: string;
}

export interface CierreDiarioProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly datosIniciales?: DatosDelDia;
  readonly onImprimirElCierre?: (corte: ResultadoDelCierre) => void;
}

/** Pesos a centavos contando dígitos: `1234.995 * 100` pierde medio centavo. */
function aCentavos(pesos: number | null | undefined): number {
  if (pesos === null || pesos === undefined || !Number.isFinite(pesos)) return 0;
  const [entero = '0', decimal = '00'] = Math.abs(pesos).toFixed(2).split('.');
  return (pesos < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

/** Centavos a pesos para una persona. Aritmética entera de punta a punta. */
export function enPesos(monto: number): string {
  const bruto = Math.abs(monto);
  const con = String(Math.trunc(bruto / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${monto < 0 ? '-' : ''}$${con}.${(bruto % 100).toString().padStart(2, '0')}`;
}

/** Lo que se teclea. `null` es «todavía no hay un importe», nunca cero. */
export function centavosDeTexto(texto: string): number | null {
  const limpio = texto.trim().replace(/[\s,$]/g, '');
  const partes = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(limpio);
  if (partes === null) return null;
  return Number(partes[1]) * 100 + Number((partes[2] ?? '').padEnd(2, '0'));
}

export interface ResumenDelDia {
  readonly ventas: number;
  readonly tickets: number;
  readonly promedio: number;
  readonly costo: number;
  readonly utilidad: number;
  /** En puntos base sobre la venta: 6543 se lee 65.43 %. */
  readonly margen: number;
  readonly gastos: number;
  readonly neta: number;
  readonly propinas: Readonly<Record<Canal, number>>;
  readonly porCanal: Readonly<Record<Canal, number>>;
  readonly gastosEnEfectivo: number;
}

/**
 * El resumen del día, SIN propinas dentro del dinero del negocio.
 *
 * La propina no es venta ni margen: es dinero de los meseros que pasó por la
 * caja. Mezclarla infla la utilidad del día, y quien lea el PDF creerá que ganó
 * lo que en realidad debe.
 */
export function resumirDia(
  ventas: readonly VentaDelDia[],
  gastos: readonly GastoDelDia[],
): ResumenDelDia {
  const pagadas = ventas.filter((venta) => venta.estado === 'pagada');
  const suma = (lee: (venta: VentaDelDia) => number | null): number =>
    pagadas.reduce((total, venta) => total + aCentavos(lee(venta)), 0);
  const total = suma((venta) => venta.total);
  const costo = suma((venta) => venta.costo_total_snapshot);
  const utilidad = total - costo;
  const operativos = gastos.reduce((lleva, gasto) => lleva + aCentavos(gasto.monto), 0);
  return {
    ventas: total,
    tickets: pagadas.length,
    promedio: pagadas.length === 0 ? 0 : Math.round(total / pagadas.length),
    costo,
    utilidad,
    margen: total === 0 ? 0 : Math.round((utilidad * 10000) / total),
    gastos: operativos,
    neta: utilidad - operativos,
    propinas: {
      efectivo: suma((venta) => venta.propina_efectivo),
      tarjeta: suma((venta) => venta.propina_tarjeta),
      transferencia: suma((venta) => venta.propina_transferencia),
    },
    porCanal: {
      efectivo: suma((venta) => venta.monto_efectivo),
      tarjeta: suma((venta) => venta.monto_tarjeta),
      transferencia: suma((venta) => venta.monto_transferencia),
    },
    gastosEnEfectivo: gastos
      .filter((gasto) => gasto.metodo_pago === 'efectivo' || gasto.metodo_pago === null)
      .reduce((lleva, gasto) => lleva + aCentavos(gasto.monto), 0),
  };
}

/** Lo que DEBERÍA haber en el cajón. No se enseña hasta que hay un conteo. */
export function esperadoEnCaja(datos: DatosDelDia, resumen: ResumenDelDia): number {
  const entra = resumen.porCanal.efectivo + resumen.propinas.efectivo;
  return datos.fondoInicial + entra - resumen.gastosEnEfectivo;
}

export interface Semaforo {
  readonly texto: string;
  readonly marca: string;
  readonly clase: string;
}

/** Dice la PALABRA además del color: el color nunca viaja solo. */
export function semaforoDe(diferencia: number): Semaforo {
  if (diferencia === 0) {
    return { texto: 'Cuadra exacto', marca: '✓', clase: 'border-success bg-success/15' };
  }
  const falta = diferencia < 0;
  if (Math.abs(diferencia) <= TOLERANCIA_CENTAVOS) {
    const texto = falta ? 'Falta poco' : 'Sobra poco';
    return { texto, marca: '•', clase: 'border-warning bg-warning/15' };
  }
  const texto = falta ? 'FALTA dinero en el cajón' : 'SOBRA dinero en el cajón';
  return { texto, marca: '!', clase: 'border-destructive bg-destructive/20' };
}

/** Traduce el fallo a algo accionable. El 429 no es un código: es el estado. */
export function mensajeDe(fallo: unknown, porOmision: string): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === 429) return 'Demasiados intentos seguidos. Espera un minuto y vuelve.';
    if (fallo.error.codigo === 'CONFLICTO_ESTADO') return 'Esa caja ya se cerró en otra terminal.';
    if (fallo.error.codigo === 'SIN_PERMISO') return 'Tu usuario no puede cerrar la caja.';
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : porOmision;
}

/** Cuánto lleva abierta, en palabras: el dato se lee, nunca se infiere. */
function desdeHace(iso: string | null, ahora: number): string {
  if (iso === null) return 'sin dato';
  const minutos = Math.floor((ahora - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutos) || minutos < 1) return 'recién';
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

/** Las mesas con cuenta viva, con las cuatro columnas que pide el documento. */
export function mesasQueBloquean(datos: DatosDelDia, ahora: number): readonly MesaQueBloquea[] {
  const porId = new Map(datos.ventas.map((venta) => [venta.id, venta]));
  return datos.mesas
    .filter((mesa) => mesa.venta_activa_id !== null)
    .map((mesa) => {
      const viva = mesa.venta_activa_id === null ? undefined : porId.get(mesa.venta_activa_id);
      return {
        id: mesa.id,
        rotulo: mesa.numero === null ? 'Sin número' : `Mesa ${mesa.numero}`,
        mesero: viva?.usuario_mesero_nombre ?? mesa.mesero_asignado_nombre ?? 'sin mesero',
        total: aCentavos(viva?.total),
        abierta: desdeHace(viva?.fecha_apertura ?? null, ahora),
      };
    });
}

interface SesionDeCaja {
  readonly estado: string | null;
  readonly efectivo_inicial_contado: number | null;
}

async function leerElDia(signal: AbortSignal): Promise<DatosDelDia> {
  const [ventas, gastos, mesas, sesiones] = await Promise.all([
    consultarPuente<VentaDelDia>('Venta', { limite: 500, signal }),
    consultarPuente<GastoDelDia>('GastoOperativo', { limite: 200, signal }),
    consultarPuente<MesaViva>('Mesa', { limite: 200, signal }),
    consultarPuente<SesionDeCaja>('CorteCaja', { limite: 1, signal }),
  ]);
  const sesion = sesiones[0];
  return {
    ventas,
    gastos,
    mesas,
    fondoInicial: aCentavos(sesion?.efectivo_inicial_contado),
    cajaAbierta: sesion?.estado === 'abierto',
  };
}

type Dialogo =
  | { readonly tipo: 'confirmar' }
  | { readonly tipo: 'bloqueo'; readonly mesas: readonly MesaQueBloquea[] };

export function CierreDiario({ datosIniciales, onImprimirElCierre }: CierreDiarioProps) {
  const voc = useVocabulario();
  const [datos, setDatos] = useState<DatosDelDia | null>(datosIniciales ?? null);
  const [contado, setContado] = useState('');
  const [fondo, setFondo] = useState('');
  const [alImprimir, setAlImprimir] = useState(true);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [corte, setCorte] = useState<ResultadoDelCierre | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (datosIniciales !== undefined) return;
    // El centinela es la señal de aborto: dice si la pantalla sigue montada y
    // además cancela las cuatro lecturas en vuelo.
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    leerElDia(control.signal)
      .then((frescos) => {
        if (sigueMontada()) setDatos(frescos);
      })
      .catch((fallo: unknown) => {
        if (sigueMontada()) setError(mensajeDe(fallo, 'No se pudo leer el día.'));
      });
    return () => {
      control.abort();
    };
  }, [datosIniciales]);

  // La pantalla NUNCA se vacía por un error: la banda va encima del último dato.
  const banda =
    error === null ? null : (
      <p
        role="alert"
        className="rounded-md border border-destructive bg-destructive/15 p-2 text-sm"
      >
        {error} · La caja NO se cerró.
      </p>
    );

  if (datos === null) {
    return (
      <div className="grid gap-(--espacio-4) p-(--espacio-4) xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Esqueletos con la forma de las cuatro secciones: nada salta de sitio. */}
        <Skeleton className="h-72 w-full rounded-lg xl:order-2" />
        <div className="space-y-(--espacio-4) xl:order-1">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
        {banda}
      </div>
    );
  }

  // El vacío ENSEÑA de dónde sale un cierre; no se disculpa por no tenerlo.
  if (!datos.cajaAbierta && corte === null) {
    return (
      <div className="mx-auto max-w-lg p-(--espacio-8)">
        <Vacio
          icono={<Lock />}
          titulo="No hay ninguna caja abierta que cerrar."
          explicacion="El día se cierra desde la terminal donde se abrió la caja: ahí vive el fondo que se contó por la mañana y de esa sesión cuelgan las ventas que entran al corte."
          accion={
            <Button asChild>
              <a href="/restaurante/caja">Ir a la caja</a>
            </Button>
          }
        />
        {banda}
      </div>
    );
  }

  if (corte !== null) {
    const diferencia = Number(corte.diferenciaCentavos);
    const cerrado = semaforoDe(diferencia);
    return (
      <div
        role="status"
        className="mx-auto max-w-lg space-y-(--espacio-3) p-(--espacio-8) text-center"
      >
        <p className="text-sm uppercase text-muted-foreground">
          Corte {corte.serie}-{corte.folio} · {corte.numeroVentas} tickets
        </p>
        <p className={`rounded-lg border-2 p-(--espacio-4) ${cerrado.clase}`}>
          <span className="block font-numeros text-display font-bold tabular-nums">
            {enPesos(diferencia)}
          </span>
          <span className="font-medium">
            {cerrado.marca} {cerrado.texto}
          </span>
        </p>
        <p className="text-muted-foreground">
          Esperado {enPesos(Number(corte.efectivoEsperadoCentavos))} · contado{' '}
          {enPesos(centavosDeTexto(contado) ?? 0)}
        </p>
        <Button className="w-full" onClick={() => onImprimirElCierre?.(corte)}>
          Imprimir el cierre
        </Button>
      </div>
    );
  }

  const resumen = resumirDia(datos.ventas, datos.gastos);
  const cuenta = centavosDeTexto(contado);
  const dejado = centavosDeTexto(fondo) ?? 0;
  const esperado = esperadoEnCaja(datos, resumen);
  const semaforo = semaforoDe((cuenta ?? 0) - esperado);
  const financiero: readonly (readonly [string, string])[] = [
    ['Ventas reales', enPesos(resumen.ventas)],
    ['Tickets', `${resumen.tickets}`],
    ['Ticket promedio', enPesos(resumen.promedio)],
    ['Costo de ventas', enPesos(resumen.costo)],
    ['Utilidad bruta', enPesos(resumen.utilidad)],
    ['Margen promedio', `${(resumen.margen / 100).toFixed(2)} %`],
    ['Gastos operativos', enPesos(resumen.gastos)],
    ['Utilidad neta est.', enPesos(resumen.neta)],
  ];
  const propinas: readonly (readonly [string, number])[] = [
    ['Total', CANALES.reduce((suman, canal) => suman + resumen.propinas[canal], 0)],
    ...CANALES.map((canal) => [canal, resumen.propinas[canal]] as readonly [string, number]),
  ];

  /** Primera verificación: al abrir el diálogo. */
  async function pedirCierre(): Promise<void> {
    setError(null);
    try {
      const frescos = await leerElDia(new AbortController().signal);
      setDatos(frescos);
      const abiertas = mesasQueBloquean(frescos, Date.now());
      const paso = abiertas.length === 0 ? 'confirmar' : 'bloqueo';
      setDialogo(
        paso === 'confirmar' ? { tipo: 'confirmar' } : { tipo: 'bloqueo', mesas: abiertas },
      );
    } catch (fallo) {
      setError(mensajeDe(fallo, 'No se pudo releer el salón.'));
    }
  }

  /**
   * Segunda verificación, y sólo entonces la escritura. Entre el diálogo y este
   * clic pasan los minutos de contar el cajón, y en esos minutos se sienta una
   * mesa que nadie ha vuelto a mirar.
   */
  async function cerrar(contadoCentavos: number): Promise<void> {
    setEnviando(true);
    try {
      const frescos = await leerElDia(new AbortController().signal);
      setDatos(frescos);
      const abiertas = mesasQueBloquean(frescos, Date.now());
      if (abiertas.length > 0) {
        setDialogo({ tipo: 'bloqueo', mesas: abiertas });
        return;
      }
      const hecho = await invocarComando<ResultadoDelCierre>('/api/caja/cerrar', {
        efectivoContadoCentavos: String(contadoCentavos),
        notas: `Dinero dejado en caja (fondo): ${enPesos(dejado)}`,
      });
      setDialogo(null);
      setCorte(hecho);
      if (alImprimir) onImprimirElCierre?.(hecho);
    } catch (fallo) {
      setDialogo(null);
      setError(mensajeDe(fallo, 'No se pudo cerrar la caja.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid items-start gap-(--espacio-4) p-(--espacio-4) xl:grid-cols-[minmax(0,1fr)_24rem]">
      <h1 className="text-xl font-bold xl:col-span-2">Cierre diario y arqueo</h1>
      <div className="xl:col-span-2">{banda}</div>

      {/* 4 · CONTEO — primero en el DOM porque encabeza la jerarquía y se lleva
          el foco; en PC se va al carril derecho con `xl:order-2`. */}
      <section
        aria-labelledby="titulo-conteo"
        className={`sticky top-0 z-10 space-y-(--espacio-3) p-(--espacio-3) xl:order-2 xl:top-4 ${SECCION}`}
      >
        <h2 id="titulo-conteo" className="text-sm font-semibold uppercase tracking-wide">
          4 · Conteo de efectivo y fondo
        </h2>
        <div className="space-y-1">
          <Label htmlFor="contado">Efectivo contado físicamente *</Label>
          <Input
            id="contado"
            autoFocus
            inputMode="decimal"
            placeholder="0.00"
            aria-describedby="ayuda-contado"
            className="h-[var(--altura-control)] text-2xl tabular-nums"
            value={contado}
            onChange={(evento) => {
              setContado(evento.target.value);
            }}
          />
          <p id="ayuda-contado" className="text-xs text-muted-foreground">
            Cuenta el cajón antes de mirar nada más: el esperado aparece cuando escribas, para que
            el arqueo siga siendo un control y no un número que se copia.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="fondo">Dinero dejado en caja (fondo)</Label>
          <Input
            id="fondo"
            inputMode="decimal"
            placeholder="0.00"
            className="h-[var(--altura-control)] tabular-nums"
            value={fondo}
            onChange={(evento) => {
              setFondo(evento.target.value);
            }}
          />
        </div>

        {cuenta !== null && (
          <dl
            role="status"
            className={`grid grid-cols-2 gap-1 rounded-md border-2 p-(--espacio-3) text-sm ${semaforo.clase}`}
          >
            <dt>Esperado</dt>
            <dd className="text-right tabular-nums">{enPesos(esperado)}</dd>
            <dt className="font-semibold">
              {semaforo.marca} {semaforo.texto}
            </dt>
            <dd className="text-right text-lg font-bold tabular-nums">
              {enPesos(cuenta - esperado)}
            </dd>
            <dd className="col-span-2 text-xs">
              A entregar hoy: {enPesos(Math.max(cuenta - dejado, 0))}
            </dd>
          </dl>
        )}

        <div className="flex items-center gap-2">
          <Switch id="imprimir" checked={alImprimir} onCheckedChange={setAlImprimir} />
          <Label htmlFor="imprimir" className="font-normal">
            Imprimir el cierre al terminar
          </Label>
        </div>
        <Button
          size="lg"
          className="w-full text-lg"
          disabled={enviando || cuenta === null}
          onClick={() => {
            void pedirCierre();
          }}
        >
          CERRAR CAJA
        </Button>
        {cuenta === null && (
          <p className="text-center text-sm text-muted-foreground">
            Escribe primero el efectivo contado.
          </p>
        )}
      </section>

      {/* 1 · 2 · 3 en el orden del PDF. `details` nativo: el teclado y el lector
          de pantalla ya saben abrirlo, y en teléfono se colapsan sin código. */}
      <div className="space-y-(--espacio-4) xl:order-1">
        <details open className={SECCION}>
          <summary className={TITULO}>1 · Resumen financiero (sin propinas)</summary>
          <dl className="grid grid-cols-2 gap-x-(--espacio-4) gap-y-(--espacio-3) p-(--espacio-3) pt-0 md:grid-cols-4">
            {financiero.map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt className="text-xs text-muted-foreground">{rotulo}</dt>
                <dd className="text-lg font-semibold tabular-nums">{valor}</dd>
              </div>
            ))}
          </dl>
        </details>

        <details open className={SECCION}>
          <summary className={TITULO}>2 · Propinas del día (pendientes de liquidar)</summary>
          <dl className="grid grid-cols-2 gap-x-(--espacio-4) gap-y-(--espacio-3) p-(--espacio-3) pt-0 md:grid-cols-4">
            {propinas.map(([rotulo, monto]) => (
              <div key={rotulo}>
                <dt className="text-xs capitalize text-muted-foreground">{rotulo}</dt>
                <dd className="text-lg font-semibold tabular-nums">{enPesos(monto)}</dd>
              </div>
            ))}
          </dl>
          <p className="px-(--espacio-3) pb-(--espacio-3) text-xs text-muted-foreground">
            No entran en la utilidad: son dinero de {voc.enFrase('responsable', true)} que pasó por
            la caja.
          </p>
        </details>

        <details open className={SECCION}>
          <summary className={TITULO}>3 · Métodos de pago (ventas + propinas)</summary>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Ventas</TableHead>
                <TableHead className="text-right">Propinas</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CANALES.map((canal) => (
                <TableRow key={canal}>
                  <TableCell className="capitalize">{canal}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {enPesos(resumen.porCanal[canal])}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {enPesos(resumen.propinas[canal])}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {enPesos(resumen.porCanal[canal] + resumen.propinas[canal])}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </details>
      </div>

      <Dialog
        open={dialogo !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setDialogo(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogo?.tipo === 'bloqueo' ? 'Hay mesas con cuenta abierta' : '¿Cerrar la caja?'}
            </DialogTitle>
            <DialogDescription>
              {dialogo?.tipo === 'bloqueo'
                ? 'Cobra o cancela estas cuentas antes de cerrar: si la caja se cierra ahora, esas ventas quedan fuera del corte y ya no las cuadra nadie.'
                : 'El corte se sella y no se puede editar. El salón se vuelve a revisar justo antes de ejecutar.'}
            </DialogDescription>
          </DialogHeader>
          {dialogo?.tipo === 'bloqueo' && (
            <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
              {dialogo.mesas.map((mesa) => (
                <li
                  key={mesa.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border p-2 text-sm"
                >
                  <span className="font-semibold">{mesa.rotulo}</span>
                  <span className="text-muted-foreground">{mesa.mesero}</span>
                  <span className="tabular-nums">{enPesos(mesa.total)}</span>
                  <span className="text-muted-foreground">abierta {mesa.abierta}</span>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            {dialogo?.tipo === 'bloqueo' ? (
              <Button asChild>
                <a href="/restaurante/mapa-de-mesas">
                  Ver el mapa de {voc.plural('unidad_servicio')}
                </a>
              </Button>
            ) : (
              <Button
                disabled={enviando || cuenta === null}
                onClick={() => {
                  if (cuenta !== null) void cerrar(cuenta);
                }}
              >
                {enviando ? 'Cerrando…' : 'Sí, cerrar el día'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
