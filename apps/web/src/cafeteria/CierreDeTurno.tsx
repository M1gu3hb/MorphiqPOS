'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@morphiqpos/ui/primitivas/accordion';
import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@morphiqpos/ui/primitivas/dialog';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  CampoDeDinero,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Check, Milk, OctagonAlert, ShoppingBag, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · cafeteria · cierre-de-turno-y-arqueo
 *
 * Dos veces al día: el barista saliente cuenta y la dueña mira.
 *
 * ── Los DOS arqueos a ciegas son la regla que define la pantalla ─────────
 * Los cuatro campos van primero, vacíos, con el foco en el primero, y los
 * esperados NO existen hasta después. Enseñarlos antes convierte el arqueo en
 * un dictado: se teclea el número que se ve y deja de ser un control.
 *
 * Y va un paso más allá del enunciado: el efectivo esperado **no viaja al
 * navegador** antes del cierre. Lo deriva `caja.cerrar` dentro de su propia
 * transacción y llega en la respuesta. Un esperado precargado, aunque esté
 * tapado por CSS, se lee abriendo las herramientas del navegador — y quien
 * cierra la caja es justo quien tendría motivo para mirarlo.
 *
 * ── El bloqueo por pedidos sin entregar, verificado DOS veces ────────────
 * F-262. Una al cargar —el aviso de arriba— y otra contra el servidor al tocar
 * CERRAR TURNO: los dos minutos del conteo alcanzan para que alguien cobre un
 * café. Tres salidas y sólo tres, sin puerta trasera. La lista del diálogo es
 * una `Tabla` porque cada fila lleva sus tres botones y se lee por columnas:
 * nombre, bebida, hora de cobro y minutos esperando.
 *
 * ── «Confirmar reparto» y no «Guardar» ───────────────────────────────────
 * Porque lo que pasa después del botón es que se cuentan billetes sobre la
 * barra. Va DESPUÉS del cierre porque `cafeteria.repartir_bote` exige la sesión
 * cerrada: repartir un bote abierto es repartir un número que aún va a cambiar.
 * Cerrado el turno pasa a ser el botón primario: ya es lo único que queda.
 *
 * ── Una columna, secciones colapsables, el conteo fijo arriba ────────────
 * El teléfono importa aquí: hay dueñas que cierran desde el teléfono mientras
 * el barista cuenta. En teléfono y tableta el conteo se queda pegado arriba
 * MIENTRAS se cuenta; cerrado el turno se suelta, porque lo que queda por leer
 * —el resumen y el reparto— está debajo y necesita la pantalla. En PC el conteo
 * va a la izquierda y las cuatro secciones se leen a la derecha en el orden del
 * PDF, que es el que quien cierra ya sabe.
 *
 * ── El semáforo nunca es sólo un color ───────────────────────────────────
 * Cada tramo lleva su palabra y su forma: palomita si cuadró, triángulo si la
 * diferencia es morralla, octágono si es una pregunta.
 *
 * ── Qué estado es cuál ───────────────────────────────────────────────────
 * No leyó el turno → `ErrorDePantalla` con reintento: un fallo de red no puede
 * leerse como «no hay turno». Sin turno abierto → `Aviso` de atención con la
 * salida a abrirlo: es un muro de negocio, no un error. Un comando que falla →
 * `Aviso` de peligro con lo que NO pasó.
 *
 * ── Alcance recortado, dicho y no escondido ──────────────────────────────
 * `Bebidas`, `Comisión estimada`, el canal y la merma de barra no tienen campo
 * en el puente: entran por props o se pintan «—». En una pantalla de arqueo no
 * se inventa un número. El bote esperado sí se deriva aquí, de
 * `Venta.propina_efectivo`, así que es menos ciego que el efectivo. Y el PDF
 * que «se descarga solo» necesita una ruta de impresión que aún no existe: en
 * su lugar se enseña el folio del corte.
 */

const RUTA_CERRAR = '/api/caja/cerrar';
const RUTA_REPARTIR = '/api/propinas/repartir-bote';
const RUTA_ENTREGAR = '/api/cafeteria/entregar-pedido';
const RUTA_NADIE_VINO = '/api/cafeteria/no-recogido';
const RUTA_DEVOLVER = '/api/venta/devolver';

/** Hasta $20 de descuadre es morralla; más arriba es una pregunta. */
const TOLERANCIA_CENTAVOS = 2_000;

/** La hora de cobro de un pedido en la fila: «08:15». */
const HORA = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });

/**
 * Los cuatro campos del conteo. Los dos primeros son obligatorios y van `enorme`:
 * son la pantalla, se teclean de pie y se releen antes de mandar un número que ya
 * no se puede cambiar.
 */
const CAMPOS = [
  { clave: 'efectivo', etiqueta: 'Efectivo contado en el cajón *', grande: true },
  { clave: 'bote', etiqueta: 'Bote de propina contado *', grande: true },
  { clave: 'dejado', etiqueta: 'Dinero que dejas en caja', grande: false },
  { clave: 'cambio', etiqueta: '· de eso, en cambio', grande: false },
] as const;

type ClaveDeConteo = (typeof CAMPOS)[number]['clave'];

/**
 * Lo tecleado en un campo: un importe en centavos, `'vacio'` o `'ilegible'` —hay
 * texto y no es un importe: «1.500», «1 500»—. No es lo mismo no haber contado que
 * haber contado y escribirlo de una forma que no se lee, y la pantalla dice cuál.
 */
type Lectura = number | 'vacio' | 'ilegible';

type Conteo = Readonly<Record<ClaveDeConteo, Lectura>>;

const CONTEO_VACIO: Conteo = {
  efectivo: 'vacio',
  bote: 'vacio',
  dejado: 'vacio',
  cambio: 'vacio',
};

/** Los centavos de una lectura, o `null` si no hay importe. */
function centavosDe(lectura: Lectura): number | null {
  return typeof lectura === 'number' ? lectura : null;
}

/** Una cifra que llega ya escrita, por props: el canal y la merma. */
export interface CifraDelTurno {
  readonly etiqueta: string;
  readonly valor: string;
}

/** Los nombres son los del PUENTE, en snake_case. Aquí no se traduce nada. */
export interface TurnoDeCierre {
  readonly id: string;
  readonly estado: string | null;
  readonly usuario_apertura_nombre: string | null;
}

export interface VentaDelTurno {
  readonly estado: string | null;
  readonly total: number | null;
  readonly costo_total_snapshot: number | null;
  readonly propina_efectivo: number | null;
}

export interface GastoDelTurno {
  readonly monto: number | null;
}

export interface PedidoEnFila {
  readonly id: string;
  readonly estado: string | null;
  readonly nombre_pedido: string | null;
  readonly created_date: string | null;
  readonly items?: readonly { readonly id: string; readonly producto_nombre: string | null }[];
}

/** Lo que responde `caja.cerrar`: aquí nacen los esperados y los semáforos. */
interface ResultadoCierre {
  readonly sesionCajaId: string;
  readonly serie: string;
  readonly folio: string;
  readonly efectivoEsperadoCentavos: string;
  readonly diferenciaCentavos: string;
}

interface ParteDelBote {
  readonly empleoId: string;
  readonly minutos: number;
  readonly montoCentavos: string;
}

export interface CierreDeTurnoProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly turnoInicial?: TurnoDeCierre | null;
  readonly ventasIniciales?: readonly VentaDelTurno[];
  readonly gastosIniciales?: readonly GastoDelTurno[];
  readonly filaInicial?: readonly PedidoEnFila[];
  readonly canalesIniciales?: readonly CifraDelTurno[];
  readonly mermasIniciales?: readonly CifraDelTurno[];
  readonly onCerrado?: (sesionCajaId: string) => void;
}

/** Pesos a centavos contando dígitos: `58.995 * 100` pierde medio centavo. */
export function aCentavos(valor: number | string | null | undefined): number {
  const numero = typeof valor === 'string' ? Number(valor.replace(/[^\d.-]/g, '')) : (valor ?? 0);
  if (!Number.isFinite(numero)) return 0;
  const [entero = '0', decimal = '00'] = Math.abs(numero).toFixed(2).split('.');
  return (numero < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

export type TonoDelSemaforo = 'exito' | 'advertencia' | 'peligro';

/** El semáforo del arqueo. La palabra manda; el color y la forma sólo acompañan. */
export function semaforo(diferencia: number): {
  readonly tono: TonoDelSemaforo;
  readonly clase: string;
  readonly palabra: string;
} {
  if (diferencia === 0) {
    return { tono: 'exito', clase: 'border-exito/50 bg-exito/10', palabra: 'cuadró exacto' };
  }
  if (Math.abs(diferencia) <= TOLERANCIA_CENTAVOS) {
    return {
      tono: 'advertencia',
      clase: 'border-advertencia/60 bg-advertencia/15',
      palabra: diferencia > 0 ? 'sobra poco' : 'falta poco',
    };
  }
  return {
    tono: 'peligro',
    clase: 'border-peligro/50 bg-peligro/10',
    palabra: diferencia > 0 ? 'SOBRA' : 'FALTA',
  };
}

/** Minutos que un pedido lleva esperando desde que se cobró. */
export function minutosEsperando(desde: string | null, ahora: number): number {
  if (desde === null) return 0;
  const minutos = Math.floor((ahora - new Date(desde).getTime()) / 60_000);
  return Number.isNaN(minutos) || minutos < 0 ? 0 : minutos;
}

/** Una cifra del resumen: dinero, un conteo, un porcentaje, o «—» si el puente no la tiene. */
export type ValorDelResumen =
  | { readonly tipo: 'dinero'; readonly centavos: number }
  | { readonly tipo: 'cuenta'; readonly valor: number }
  | { readonly tipo: 'porcentaje'; readonly valor: number }
  | { readonly tipo: 'sinDato' };

export interface RenglonDelResumen {
  readonly etiqueta: string;
  readonly valor: ValorDelResumen;
}

export interface ResumenDelTurno {
  /** Las nueve primeras cifras del §2, en el orden del PDF. */
  readonly renglones: readonly RenglonDelResumen[];
  /** La décima, la utilidad neta estimada: va al pie, debajo de su columna. */
  readonly netaCentavos: number;
}

const SIN_DATO: ValorDelResumen = { tipo: 'sinDato' };

function enCentavos(centavos: number): ValorDelResumen {
  return { tipo: 'dinero', centavos };
}

/** Las diez cifras del §2, en el orden del PDF. Lo que no hay se pinta «—». */
export function resumenDelTurno(
  ventas: readonly VentaDelTurno[],
  gastos: readonly GastoDelTurno[],
): ResumenDelTurno {
  const cobradas = ventas.filter((v) => v.estado !== 'cancelada' && v.estado !== 'abierta');
  const total = cobradas.reduce((suma, v) => suma + aCentavos(v.total), 0);
  const costo = cobradas.reduce((suma, v) => suma + aCentavos(v.costo_total_snapshot), 0);
  const gasto = gastos.reduce((suma, g) => suma + aCentavos(g.monto), 0);
  const bruta = total - costo;
  return {
    renglones: [
      { etiqueta: 'Ventas', valor: enCentavos(total) },
      { etiqueta: 'Tickets', valor: { tipo: 'cuenta', valor: cobradas.length } },
      {
        etiqueta: 'Ticket promedio',
        valor: enCentavos(cobradas.length === 0 ? 0 : Math.round(total / cobradas.length)),
      },
      { etiqueta: 'Bebidas', valor: SIN_DATO },
      { etiqueta: 'Comisión estimada', valor: SIN_DATO },
      { etiqueta: 'Costo', valor: enCentavos(costo) },
      { etiqueta: 'Utilidad bruta', valor: enCentavos(bruta) },
      {
        etiqueta: 'Margen',
        valor: total === 0 ? SIN_DATO : { tipo: 'porcentaje', valor: (bruta / total) * 100 },
      },
      { etiqueta: 'Gastos', valor: enCentavos(gasto) },
    ],
    netaCentavos: bruta - gasto,
  };
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    // El límite de intentos no es un código de la API: es el 429.
    if (fallo.estado === 429) return 'Demasiados intentos seguidos. Espera un momento.';
    return fallo.message;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo completar la operación.';
}

/** La hora a la que se cobró un pedido, o «—» si no se sabe. */
function horaDe(fecha: string | null): string {
  if (fecha === null) return '—';
  const instante = new Date(fecha);
  return Number.isNaN(instante.getTime()) ? '—' : HORA.format(instante);
}

/** La fila que sigue viva. El servidor manda; esto sólo la pinta. */
async function leerFila(signal?: AbortSignal): Promise<readonly PedidoEnFila[]> {
  const filas = await consultarPuente<PedidoEnFila>('PedidoPreparacion', {
    limite: 60,
    ...(signal === undefined ? {} : { signal }),
  });
  return filas.filter((f) => f.estado !== 'entregada' && f.estado !== 'cancelada');
}

/** Cada tipo de cifra con su pieza: el dinero es `Dinero`; lo demás, `Cifra`. */
function ValorDeRenglon({ valor }: { readonly valor: ValorDelResumen }): ReactNode {
  if (valor.tipo === 'dinero') return <Dinero centavos={valor.centavos} tamano="sm" />;
  if (valor.tipo === 'cuenta') return <Cifra valor={valor.valor} tamano="sm" />;
  if (valor.tipo === 'porcentaje') {
    return <Cifra valor={valor.valor} decimales={1} unidad="%" tamano="sm" />;
  }
  return <span className="text-texto-sutil">—</span>;
}

const COLUMNAS_DEL_RESUMEN: readonly ColumnaDeTabla<RenglonDelResumen>[] = [
  { clave: 'concepto', titulo: 'Concepto', celda: (renglon) => renglon.etiqueta },
  {
    clave: 'valor',
    titulo: 'Este turno',
    numerica: true,
    celda: (renglon) => <ValorDeRenglon valor={renglon.valor} />,
  },
];

/** Etiqueta y número, para lo que llega ya escrito. La misma forma en el canal y la merma. */
function columnasDeCifras(concepto: string): readonly ColumnaDeTabla<CifraDelTurno>[] {
  return [
    { clave: 'concepto', titulo: concepto, celda: (cifra) => cifra.etiqueta },
    { clave: 'valor', titulo: 'Este turno', numerica: true, celda: (cifra) => cifra.valor },
  ];
}

const ICONO_DEL_SEMAFORO = {
  exito: Check,
  advertencia: TriangleAlert,
  peligro: OctagonAlert,
} as const;

/** Un recipiente contado contra su esperado. Sólo existe DESPUÉS del cierre. */
function Arqueo({
  nombre,
  esperado,
  diferencia,
}: {
  readonly nombre: string;
  readonly esperado: number;
  readonly diferencia: number;
}) {
  const marca = semaforo(diferencia);
  const Icono = ICONO_DEL_SEMAFORO[marca.tono];
  return (
    <Superficie
      nivel={0}
      radio="md"
      relleno={3}
      className={`flex flex-col gap-(--espacio-1) ${marca.clase}`}
    >
      <dt className="text-sm text-texto-sutil">
        {nombre} · esperado <Dinero centavos={esperado} tamano="sm" />
      </dt>
      {/* El color nunca va solo: cada tramo trae su forma y su palabra. */}
      <dd className="flex items-center justify-between gap-(--espacio-2)">
        <span className="inline-flex items-center gap-(--espacio-1) font-semibold">
          <Icono aria-hidden="true" className="size-4 shrink-0" />
          {marca.palabra}
        </span>
        <Dinero centavos={diferencia} tamano="lg" />
      </dd>
    </Superficie>
  );
}

export function CierreDeTurno({
  turnoInicial,
  ventasIniciales,
  gastosIniciales,
  filaInicial,
  canalesIniciales,
  mermasIniciales,
  onCerrado,
}: CierreDeTurnoProps) {
  const voc = useVocabulario();
  // `undefined` es «todavía no se sabe»; `null` es «no hay turno abierto».
  const [turno, setTurno] = useState<TurnoDeCierre | null | undefined>(turnoInicial);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [ventas, setVentas] = useState<readonly VentaDelTurno[]>(ventasIniciales ?? []);
  const [gastos, setGastos] = useState<readonly GastoDelTurno[]>(gastosIniciales ?? []);
  const [fila, setFila] = useState<readonly PedidoEnFila[]>(filaInicial ?? []);
  const [conteo, setConteo] = useState<Conteo>(CONTEO_VACIO);
  const [resultado, setResultado] = useState<ResultadoCierre | null>(null);
  const [partes, setPartes] = useState<readonly ParteDelBote[] | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Cada lectura es un número: reintentar lo sube y el efecto lee otra vez. El
  // estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  /**
   * El reloj NO se lee durante el render. Leerlo ahí da un valor en el
   * servidor y otro en el navegador —un desajuste de hidratación por cada
   * pedido de la fila— y además hace impura la función. Entra por el efecto y
   * avanza solo, porque «esperando 4 min» deja de ser cierto en 60 segundos.
   */
  const [reloj, setReloj] = useState(0);
  useEffect(() => {
    const tic = (): void => {
      setReloj(Date.now());
    };
    const primero = setTimeout(tic);
    const cada = setInterval(tic, 30_000);
    return () => {
      clearTimeout(primero);
      clearInterval(cada);
    };
  }, []);

  useEffect(() => {
    if (turnoInicial !== undefined) return;
    // Centinela real y no un `let vivo`: el compilador da por siempre-cierto un
    // booleano que sólo cambia en la limpieza, y la lectura no se cancelaría.
    const control = new AbortController();
    const senal = control.signal;
    Promise.all([
      consultarPuente<TurnoDeCierre>('CorteCaja', { limite: 5, signal: senal }),
      consultarPuente<VentaDelTurno>('Venta', { limite: 400, signal: senal }),
      consultarPuente<GastoDelTurno>('GastoOperativo', { limite: 100, signal: senal }),
      leerFila(senal),
    ])
      .then(([turnos, deVenta, deGasto, enFila]) => {
        setTurno(turnos.find((t) => t.estado === 'abierto') ?? null);
        setVentas(deVenta);
        setGastos(deGasto);
        setFila(enFila);
      })
      .catch((fallo: unknown) => {
        // No leyó nada, y eso NO es «no hay turno»: se dice qué pasó y se deja
        // volver a leer. Confundirlo mandaría a abrir un turno que ya está abierto.
        if (senal.aborted) return;
        setFalloDeCarga(mensajeDe(fallo));
      });
    return () => {
      control.abort();
    };
  }, [turnoInicial, intento]);

  function reintentar(): void {
    setFalloDeCarga(null);
    setTurno(undefined);
    setIntento((previo) => previo + 1);
  }

  const resumen = useMemo(() => resumenDelTurno(ventas, gastos), [ventas, gastos]);
  const boteEsperado = ventas.reduce((suma, v) => suma + aCentavos(v.propina_efectivo), 0);
  const contadoBote = centavosDe(conteo.bote) ?? 0;
  const faltaContar = conteo.efectivo === 'vacio' || conteo.bote === 'vacio';
  // Contado, pero escrito de una forma que no se lee: el botón no cierra y la
  // pantalla dice POR QUÉ, que no es «cuenta el cajón».
  const conteoIlegible = conteo.efectivo === 'ilegible' || conteo.bote === 'ilegible';
  const cerrado = resultado !== null;

  /** Las tres salidas del diálogo y ninguna más. */
  async function resolverPedido(pedidoId: string, ruta: string): Promise<void> {
    setError(null);
    try {
      await invocarComando(ruta, { pedidoId });
      const quedan = await leerFila();
      setFila(quedan);
      if (quedan.length === 0) setDialogo(false);
    } catch (fallo) {
      setError(mensajeDe(fallo));
    }
  }

  async function cerrarTurno(): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      // F-262, segunda verificación: entre el conteo y el toque alguien pudo
      // cobrar un café, y ese café ya está en la fila.
      const enFila = await leerFila();
      if (enFila.length > 0) {
        setFila(enFila);
        setDialogo(true);
        return;
      }
      /**
       * UN SOLO COMANDO, y ésta es la corrección.
       *
       * Aquí había una llamada previa a `/api/cafeteria/contar-bote` con un
       * comentario que decía «el documento no nombra la ruta y todavía no existe
       * ninguna». **No existía.** El 404 devolvía la página de error de Next, que
       * no es `{ok, datos}`, así que el cliente decía «El servidor respondió algo
       * inesperado» y el turno no se cerraba NUNCA — ni el bote se contaba, ni la
       * caja se cerraba, porque el cierre venía después.
       *
       * El bote va ahora dentro de `caja.cerrar`: se cuenta el cajón y se cuenta
       * el bote con las manos en el mismo dinero y en el mismo momento, así que
       * es una sola transacción. Y `cafeteria.repartir_bote`, que EXIGE ese
       * número, por fin lo encuentra escrito.
       *
       * Lo que NO se guarda todavía —y se dice en vez de fingir— es «dinero que
       * dejas en caja» y «de eso, en cambio»: `sesiones_caja` no tiene columnas
       * para ellos. Se siguen pidiendo porque ayudan a quien cuenta, y el día que
       * haya que conservarlos hará falta una migración.
       */
      const corte = await invocarComando<ResultadoCierre>(RUTA_CERRAR, {
        efectivoContadoCentavos: centavosDe(conteo.efectivo) ?? 0,
        boteContadoCentavos: contadoBote,
      });
      setResultado(corte);
      onCerrado?.(corte.sesionCajaId);
    } catch (fallo) {
      setError(mensajeDe(fallo));
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarReparto(sesionCajaId: string): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const hecho = await invocarComando<{ readonly partes: readonly ParteDelBote[] }>(
        RUTA_REPARTIR,
        { sesionCajaId },
      );
      setPartes(hecho.partes);
    } catch (fallo) {
      setError(mensajeDe(fallo));
    } finally {
      setEnviando(false);
    }
  }

  if (falloDeCarga !== null) {
    return (
      <div className="mx-auto max-w-lg p-(--espacio-6)">
        <ErrorDePantalla
          titulo="No se pudo leer el turno"
          queHacer="Sin el turno, sus ventas y la fila de la barra no hay contra qué contar el cajón ni el bote. Revisa la conexión y vuelve a intentarlo: no se cerró nada."
          detalle={falloDeCarga}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </div>
    );
  }

  if (turno === undefined) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando el turno"
        className="grid gap-(--espacio-3) p-(--espacio-3) xl:grid-cols-[22rem_minmax(0,1fr)] xl:items-start xl:gap-(--espacio-4)"
      >
        {/* La forma del conteo y de las secciones, nunca una rueda: así nada
            salta de sitio cuando llegan los datos. */}
        <Esqueleto className="h-(--altura-control) w-48 xl:col-span-2" />
        <div className="flex flex-col gap-(--espacio-3)">
          <Esqueleto className="h-20 w-full rounded-lg" />
          <Esqueleto className="h-20 w-full rounded-lg" />
          <Esqueleto className="h-(--altura-control) w-full" />
          <Esqueleto className="h-20 w-full rounded-lg" />
        </div>
        <div className="flex flex-col gap-(--espacio-3)">
          <Esqueleto className="h-64 w-full rounded-lg" />
          <Esqueleto className="h-(--altura-control) w-full" />
          <Esqueleto className="h-(--altura-control) w-full" />
          <Esqueleto className="h-(--altura-control) w-full" />
        </div>
      </div>
    );
  }

  if (turno === null && !cerrado) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-(--espacio-4) p-(--espacio-6)">
        <h1 className="text-xl font-bold">Cierre de turno</h1>
        {/* Un MURO de negocio, no un error: sin turno no hay contra qué contar. */}
        <Aviso
          tono="atencion"
          titulo="No hay ningún turno abierto que cerrar."
          accion={
            <Button asChild>
              <a href="/cafeteria/turno">Abrir el turno</a>
            </Button>
          }
        >
          El cierre cuenta dos recipientes físicos —el cajón y el bote— contra lo que el turno dice
          que debería haber. Sin turno no hay contra qué contar: el turno se abre al empezar el día,
          con el fondo desglosado por denominación.
        </Aviso>
      </div>
    );
  }

  const loQueNoPaso = cerrado
    ? 'El turno ya quedó cerrado; el bote todavía no se repartió.'
    : 'No se cerró el turno ni se repartió el bote.';

  const columnasDelReparto: readonly ColumnaDeTabla<ParteDelBote>[] = [
    { clave: 'persona', titulo: voc.titulo('responsable'), celda: (parte) => parte.empleoId },
    {
      clave: 'tiempo',
      titulo: 'Horas',
      numerica: true,
      celda: (parte) => (
        <>
          <Cifra valor={Math.floor(parte.minutos / 60)} unidad="h" tamano="sm" />{' '}
          <Cifra valor={parte.minutos % 60} unidad="min" tamano="sm" />
        </>
      ),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (parte) => <Dinero centavos={Number(parte.montoCentavos)} />,
    },
  ];

  const columnasDeLaFila: readonly ColumnaDeTabla<PedidoEnFila>[] = [
    {
      clave: 'pedido',
      titulo: voc.titulo('unidad_servicio'),
      celda: (pedido) => (
        <span className="flex flex-col">
          <span className="font-medium">{pedido.nombre_pedido ?? 'Sin nombre'}</span>
          <span className="text-xs text-texto-sutil">
            {pedido.items?.[0]?.producto_nombre ?? 'Bebida'}
          </span>
        </span>
      ),
    },
    {
      clave: 'cobrado',
      titulo: 'Cobrado',
      desde: 'sm',
      celda: (pedido) => <span className="tabular-nums">{horaDe(pedido.created_date)}</span>,
    },
    {
      clave: 'esperando',
      titulo: 'Esperando',
      numerica: true,
      celda: (pedido) => (
        <Cifra valor={minutosEsperando(pedido.created_date, reloj)} unidad="min" tamano="sm" />
      ),
    },
    {
      clave: 'salidas',
      titulo: 'Resolver',
      celda: (pedido) => (
        <span className="flex flex-wrap justify-end gap-(--espacio-1)">
          <Button
            size="sm"
            onClick={() => {
              void resolverPedido(pedido.id, RUTA_ENTREGAR);
            }}
          >
            Entregarlo
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void resolverPedido(pedido.id, RUTA_NADIE_VINO);
            }}
          >
            Nadie vino
          </Button>
          {/* Devolver el dinero: saca el efectivo del cajón con su renglón y
              deja los pagos en «reembolsado», para que el corte no cuente una
              venta que se devolvió. */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void resolverPedido(pedido.id, RUTA_DEVOLVER);
            }}
          >
            Devolverlo
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-(--espacio-3) p-(--espacio-3) pb-(--espacio-8) xl:grid-cols-[22rem_minmax(0,1fr)] xl:items-start xl:gap-(--espacio-4)">
      <header className="flex flex-wrap items-baseline justify-between gap-(--espacio-2) xl:col-span-2">
        <h1 className="text-xl font-bold">Cierre de turno</h1>
        <p className="text-sm text-texto-sutil">
          {turno?.usuario_apertura_nombre ?? 'Turno sin nombre'}
          {resultado === null ? '' : ` · corte ${resultado.serie}-${resultado.folio}`}
        </p>
      </header>

      {error !== null && (
        <Aviso tono="peligro" titulo={error} className="xl:col-span-2">
          {loQueNoPaso}
        </Aviso>
      )}

      {fila.length > 0 && !cerrado && (
        <Aviso
          tono="atencion"
          titulo={`Hay ${voc.conNumero('unidad_servicio', fila.length)} cobrad${voc.terminacion('unidad_servicio', fila.length !== 1)} que nadie ha entregado.`}
          className="xl:col-span-2"
        >
          {fila.length === 1
            ? 'El turno no cierra hasta resolverlo.'
            : 'El turno no cierra hasta resolverlos uno por uno.'}
        </Aviso>
      )}

      {/* 1 · CONTEO. Fijo arriba en teléfono y tableta mientras se cuenta, a la
          izquierda en PC: es lo primero, y lo único obligatorio de la pantalla. */}
      <Superficie
        como="section"
        nivel={cerrado ? 1 : 2}
        aria-label="Conteo del cajón y del bote"
        className={`z-20 flex flex-col gap-(--espacio-3) xl:static xl:shadow-1 ${cerrado ? '' : 'sticky top-0'}`}
      >
        <h2 className="text-xs font-semibold tracking-wide text-texto-sutil uppercase">Conteo</h2>
        <div className="grid grid-cols-2 gap-(--espacio-3)">
          {CAMPOS.map((campo) => {
            const id = `cierre-${campo.clave}`;
            const ilegible = conteo[campo.clave] === 'ilegible';
            return (
              <div
                key={campo.clave}
                className={`flex flex-col gap-(--espacio-1) ${campo.grande ? 'col-span-2' : ''}`}
              >
                <Label htmlFor={id}>{campo.etiqueta}</Label>
                <CampoDeDinero
                  id={id}
                  tamano={campo.grande ? 'enorme' : 'base'}
                  autoFocus={campo.clave === 'efectivo'}
                  disabled={cerrado}
                  placeholder="0.00"
                  aria-required={campo.grande || undefined}
                  aria-invalid={ilegible || undefined}
                  aria-describedby={ilegible ? `${id}-ilegible` : undefined}
                  centavos={centavosDe(conteo[campo.clave])}
                  alCambiar={(centavos, { vacio }) => {
                    const lectura: Lectura = vacio ? 'vacio' : (centavos ?? 'ilegible');
                    setConteo((previo) => ({ ...previo, [campo.clave]: lectura }));
                  }}
                />
                {ilegible && (
                  <p id={`${id}-ilegible`} className="text-sm text-peligro">
                    Eso no es un importe: escríbelo como 1500 o 1,500.00.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* ... y HASTA ENTONCES los dos esperados con sus dos semáforos. */}
        {resultado !== null && (
          <dl className="flex flex-col gap-(--espacio-2) border-t border-borde pt-(--espacio-3)">
            <Arqueo
              nombre="Cajón"
              esperado={Number(resultado.efectivoEsperadoCentavos)}
              diferencia={Number(resultado.diferenciaCentavos)}
            />
            <Arqueo nombre="Bote" esperado={boteEsperado} diferencia={contadoBote - boteEsperado} />
          </dl>
        )}

        {!cerrado && (
          <>
            <Button
              size="lg"
              className="min-h-20 w-full text-lg"
              disabled={enviando || faltaContar || conteoIlegible}
              cargando={enviando}
              onClick={() => {
                void cerrarTurno();
              }}
            >
              {enviando ? 'Cerrando…' : 'CERRAR TURNO'}
            </Button>
            {/* Un botón apagado sin razón es un muro mudo, y con la razón
                equivocada es peor: a quien ya contó no se le pide que cuente. */}
            {conteoIlegible ? (
              <p className="text-center text-sm text-texto-sutil">
                Corrige el conteo que no es un importe para poder cerrar.
              </p>
            ) : (
              faltaContar && (
                <p className="text-center text-sm text-texto-sutil">
                  Cuenta el cajón y el bote. Los dos, antes de ver nada.
                </p>
              )
            )}
          </>
        )}
      </Superficie>

      {/* 2 a 5 · en el orden del PDF y colapsables, porque en teléfono la dueña
          baja con el pulgar mientras el barista cuenta. */}
      <Superficie relleno={0} className="px-(--espacio-4)">
        <Accordion type="multiple" defaultValue={['resumen', 'canal', 'bote', 'merma']}>
          <AccordionItem value="resumen" className="border-borde">
            <AccordionTrigger className="text-base font-semibold">
              Resumen del turno (sin propinas)
            </AccordionTrigger>
            <AccordionContent>
              <Tabla
                etiqueta="Resumen del turno"
                columnas={COLUMNAS_DEL_RESUMEN}
                filas={resumen.renglones}
                claveDe={(renglon) => renglon.etiqueta}
                pie={{
                  concepto: 'Utilidad neta estimada',
                  valor: <Dinero centavos={resumen.netaCentavos} />,
                }}
                alto="max-h-none"
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="canal" className="border-borde">
            <AccordionTrigger className="text-base font-semibold">
              {voc.titulo('linea_orden', true)} por canal
            </AccordionTrigger>
            <AccordionContent>
              <Tabla
                etiqueta={`${voc.titulo('linea_orden', true)} por canal`}
                columnas={columnasDeCifras('Canal')}
                filas={canalesIniciales ?? []}
                claveDe={(cifra) => cifra.etiqueta}
                vacio={
                  <Vacio
                    icono={<ShoppingBag />}
                    titulo="El puente aún no expone el canal de la venta ni el empaque consumido."
                    explicacion="En cuanto lo haga, aquí van Aquí · Para llevar · Plataforma."
                    className="py-(--espacio-4)"
                  />
                }
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="bote" className="border-borde">
            <AccordionTrigger className="text-base font-semibold">Bote y reparto</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-(--espacio-3)">
              <p className="flex items-baseline justify-between gap-(--espacio-2)">
                <span className="font-semibold">Total a repartir</span>
                {cerrado ? (
                  <Dinero centavos={contadoBote} tamano="lg" />
                ) : (
                  <span className="text-texto-sutil">—</span>
                )}
              </p>
              {partes === null ? (
                <>
                  <p className="text-texto-sutil">
                    Se reparte por las horas de cada quien y se confirma delante de las personas del
                    turno: después del botón se cuentan billetes sobre la barra.
                  </p>
                  <Button
                    size="lg"
                    variant={cerrado ? 'default' : 'secondary'}
                    className="min-h-20 w-full"
                    disabled={enviando || !cerrado}
                    cargando={enviando && cerrado}
                    onClick={() => {
                      if (resultado !== null) void confirmarReparto(resultado.sesionCajaId);
                    }}
                  >
                    {cerrado ? 'Confirmar reparto' : 'Primero cierra el turno'}
                  </Button>
                </>
              ) : (
                <Tabla
                  etiqueta="Reparto del bote"
                  columnas={columnasDelReparto}
                  filas={partes}
                  claveDe={(parte) => parte.empleoId}
                  alto="max-h-none"
                />
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="merma" className="border-borde">
            <AccordionTrigger className="text-base font-semibold">
              Merma de {voc.singular('preparacion')} del turno
            </AccordionTrigger>
            <AccordionContent>
              <Tabla
                etiqueta={`Merma de ${voc.singular('preparacion')} del turno`}
                columnas={columnasDeCifras('Motivo')}
                filas={mermasIniciales ?? []}
                claveDe={(cifra) => cifra.etiqueta}
                vacio={
                  <Vacio
                    icono={<Milk />}
                    titulo="Sin merma registrada en este turno."
                    explicacion="Se registra desde la barra, en el momento en que se tira la bebida, no aquí."
                    className="py-(--espacio-4)"
                  />
                }
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Superficie>

      {/* F-262 · tres salidas y sólo tres. No hay «cerrar de todos modos». */}
      <Dialog
        open={dialogo}
        onOpenChange={(abierto) => {
          setDialogo(abierto);
        }}
      >
        <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {voc.titulo('unidad_servicio', true)} cobrad{voc.terminacion('unidad_servicio', true)}{' '}
              que nadie ha entregado
            </DialogTitle>
            <DialogDescription>
              Cada uno es un café pagado. Resuélvelos y vuelve a tocar CERRAR TURNO.
            </DialogDescription>
          </DialogHeader>
          {/* El diálogo tapa la pantalla: un fallo al resolver se dice AQUÍ. */}
          {error !== null && (
            <Aviso tono="peligro" titulo={error}>
              El turno sigue abierto.
            </Aviso>
          )}
          <Tabla
            etiqueta={`${voc.titulo('unidad_servicio', true)} sin entregar`}
            columnas={columnasDeLaFila}
            filas={fila}
            claveDe={(pedido) => pedido.id}
            alto="max-h-[55dvh]"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
