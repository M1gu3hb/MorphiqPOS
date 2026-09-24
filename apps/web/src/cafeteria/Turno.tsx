'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@morphiqpos/ui/primitivas/tabs';
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
import { Coins, History, Lock, LockOpen, Plus, ReceiptText } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { consultarPuente, ErrorApi, invocarComando } from '~/cliente/api';
import { centavosDelPuente } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · cafeteria · turno
 *
 * La caja del mostrador: se abre por la mañana, se mueve dinero durante el día
 * y se cierra por la tarde. 4–8 veces al día, barista y dueña.
 *
 * ── Por qué la apertura pide TRES cifras y no una ────────────────────────
 * Porque «$1,500 de fondo» no dice si hay con qué dar cambio. Mil quinientos
 * pesos en billetes de $500 dejan la caja sin morralla antes de las nueve. El
 * desglose —monedas, $20 y $50, $100 y más— es lo único que permite el **aviso
 * de cambio bajo**, que es el indicador exclusivo de este giro.
 *
 * ── Por qué `Entrada de cambio` tiene botón propio y los demás no ────────
 * Se usa ocho veces al día; el retiro, una por semana. Ponerlos al mismo nivel
 * haría que el frecuente costara lo mismo que el raro. Por eso vive arriba, al
 * lado de la apertura, y pide un solo número. El retiro, el gasto y la entrada
 * general viven detrás de sus pestañas.
 *
 * ── Los tres botones de arriba son los tres cambios de estado del cajón ──
 * Abrir, corte de turno y cerrar: esconderlos en un menú es como alguien cobra
 * sin caja abierta o se va sin cortar. Los dos últimos LLEVAN a «Cierre de
 * turno y arqueo» en vez de resolverse aquí, porque el conteo es a CIEGAS: si
 * esta pantalla enseñara el efectivo esperado, nadie contaría —se teclearía esa
 * cifra— y el corte dejaría de detectar faltantes. Ese corte **cierra también
 * la sesión**, a diferencia de `restaurante`.
 *
 * ── La jerarquía, de arriba abajo ────────────────────────────────────────
 * 1 el estado del turno, 2 sus acciones —en la misma franja, porque son las que
 * cambian ese estado—, 3 el resumen y 4 el historial. En tableta y teléfono la
 * franja se apila y los botones ocupan el ancho: la tableta está en un soporte
 * y el dedo llega sin mirar.
 *
 * ── Lo que NO va aquí ────────────────────────────────────────────────────
 * El catálogo, la barra y el inventario. Y no va la propina como cifra suelta:
 * un bote visible todo el día es un bote que se mira todo el día.
 *
 * ── Alcance recortado, dicho y no escondido ──────────────────────────────
 * 1. `/api/caja/abrir` acepta un solo `fondoInicialCentavos`: el desglose se
 *    suma y se manda como total, así que el aviso de cambio sólo vive mientras
 *    esta pestaña siga abierta. Al recargar dice «sin desglose» con palabras,
 *    en vez de inventar un número.
 * 2. El arqueo, el reparto del bote y el PDF son la pantalla de cierre.
 * 3. El historial lista los turnos por el puente; el detalle de cada corte y su
 *    reimpresión son otra pantalla. Se lee APARTE del turno: si falla, el turno
 *    leído se sigue operando y el fallo se dice en su pestaña, no en toda la
 *    pantalla.
 */

/** Los tres cajones del fondo, en el orden en que se cuentan. */
const DENOMINACIONES = [
  { clave: 'monedas', etiqueta: 'Monedas · de $1 a $10' },
  { clave: 'chicos', etiqueta: 'Billetes chicos · de $20 y $50' },
  { clave: 'grandes', etiqueta: 'Billetes grandes · de $100 y más' },
] as const;

type ClaveDenominacion = (typeof DENOMINACIONES)[number]['clave'];
/** Cada cajón en centavos; `null` mientras lo tecleado no sea un importe. */
type Desglose = Readonly<Record<ClaveDenominacion, number | null>>;
type TipoMovimiento = 'retiro' | 'deposito' | 'gasto';

/** Los dos umbrales de morralla, en centavos. Bajo el segundo es urgencia. */
const CAMBIO_POCO = 50_000;
const CAMBIO_URGENTE = 25_000;
const MOTIVO_CAMBIO = 'Entrada de cambio';
/** La pantalla del conteo a ciegas, del mismo documento §4.3. */
const RUTA_ARQUEO = '/cafeteria/cierre-de-turno-y-arqueo';
const FONDO_VACIO: Desglose = { monedas: null, chicos: null, grandes: null };

/** Cómo se dice cada tipo del servidor en la fila; uno desconocido se enseña tal cual. */
const TIPO_EN_PALABRAS: Readonly<Record<string, string>> = {
  retiro: 'Retiro',
  deposito: 'Entrada',
  gasto: 'Gasto',
};

const FECHA = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

// Las clases largas viven arriba para que cada elemento quepa en una línea.
const CONTENEDOR =
  'mx-auto flex w-full max-w-6xl flex-col gap-(--espacio-4) p-(--espacio-3) md:p-(--espacio-4)';
const FRANJA =
  'flex flex-col gap-(--espacio-4) xl:flex-row xl:items-center xl:justify-between xl:gap-(--espacio-6)';
// Los botones que cambian el cajón: alto de dedo y todo el ancho en la tableta. El
// alto sale de la perilla de densidad, no de un número: en «compacta» encoge con todo.
const ALTO_DE_DEDO = 'min-h-[calc(var(--altura-control)*1.4)]';
const BOTON_DE_CAJA = `${ALTO_DE_DEDO} w-full xl:w-auto`;
// La chapa del candado, junto al estado: del mismo alto que el título y su línea.
const CHAPA = 'size-[calc(var(--altura-control)*1.25)] shrink-0';
const REGISTRO =
  'grid gap-(--espacio-3) pt-(--espacio-3) xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:items-start';

export interface MovimientoDelTurno {
  readonly tipo: string;
  readonly montoCentavos: string;
  readonly motivo: string | null;
  readonly registradoEn: string;
}

/** Lo que devuelve `caja.estado`. Nunca trae el efectivo esperado, a propósito. */
export interface EstadoDelTurno {
  readonly abierta: boolean;
  readonly abiertaEn: string | null;
  readonly fondoInicialCentavos: string;
  readonly ventasCentavos: string;
  readonly numeroVentas: number;
  readonly movimientos: readonly MovimientoDelTurno[];
}

/** Los nombres son los del PUENTE, no unos propios: renombrarlos no gana nada. */
export interface CorteDelHistorial {
  readonly id: string;
  readonly folio: string | null;
  readonly estado: string | null;
  readonly fecha_apertura: string | null;
  readonly fecha_cierre: string | null;
  readonly efectivo_contado: number | null;
  readonly usuario_apertura_nombre: string | null;
}

export interface TurnoProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly estadoInicial?: EstadoDelTurno;
  readonly filasIniciales?: readonly CorteDelHistorial[];
  readonly onTurnoAbierto?: (sesionCajaId: string) => void;
}

/**
 * Lo que se leyó: el turno SIEMPRE, y el historial si se pudo.
 *
 * Son dos lecturas de peso distinto. Sin el turno no se sabe si la caja está
 * abierta y no hay nada que hacer; sin el historial —jerarquía 4, lo sirve el
 * puente con sus propios permisos— se sigue abriendo, moviendo y cortando. Por
 * eso un fallo del historial no tira la lectura: viaja aparte, con su palabra.
 */
interface LecturaDelTurno {
  readonly vivo: EstadoDelTurno;
  /** `null` cuando el historial no se pudo leer. */
  readonly cortes: readonly CorteDelHistorial[] | null;
  readonly falloDeCortes: string | null;
}

const LIMITE_DEL_HISTORIAL = 20;

export function totalDelFondo(fondo: Desglose): number {
  return DENOMINACIONES.reduce((suma, d) => suma + (fondo[d.clave] ?? 0), 0);
}

/** El aviso de cambio: su clase y su palabra. La palabra es la que manda. */
export function avisoDeCambio(centavos: number | null): {
  readonly clase: string;
  readonly palabra: string;
} {
  if (centavos === null) {
    return { clase: 'bg-fondo-sutil text-texto-sutil', palabra: 'sin desglose en esta sesión' };
  }
  if (centavos < CAMBIO_URGENTE)
    return { clase: 'bg-peligro/15 text-peligro', palabra: 'consíguelo ya' };
  if (centavos < CAMBIO_POCO) return { clase: 'bg-advertencia/25', palabra: 'va quedando poco' };
  return { clase: 'bg-fondo-sutil text-texto-sutil', palabra: 'alcanza' };
}

/** Qué impide registrar, con palabras: un botón apagado y mudo se intenta tres veces. */
export function bloqueoDelMovimiento(monto: number | null, motivo: string): string | null {
  if (monto === null || monto <= 0) return 'Falta cuánto.';
  if (motivo.trim().length < 3) return 'Falta por qué, aunque sean tres letras.';
  return null;
}

function mensajeDe(fallo: unknown, respaldo: string): string {
  // El límite de intentos no es un código de la API: es el 429 del transporte.
  if (fallo instanceof ErrorApi) {
    return fallo.estado === 429
      ? 'Demasiados intentos seguidos. Espera unos segundos y vuelve a intentarlo.'
      : fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : respaldo;
}

function cuando(iso: string | null): string {
  if (iso === null) return 'sin fecha';
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? 'sin fecha' : FECHA.format(fecha);
}

/** El movimiento: qué fue, cuándo y cuánto. Un recibo, no un escaparate. */
const COLUMNAS_DE_MOVIMIENTO: readonly ColumnaDeTabla<MovimientoDelTurno>[] = [
  {
    clave: 'motivo',
    titulo: 'Movimiento',
    celda: (m) => (
      <span className="flex flex-col">
        <span className="font-medium">{m.motivo ?? 'Sin motivo'}</span>
        <span className="text-xs text-texto-sutil">{TIPO_EN_PALABRAS[m.tipo] ?? m.tipo}</span>
      </span>
    ),
  },
  {
    clave: 'hora',
    titulo: 'Hora',
    celda: (m) => <span className="text-texto-sutil">{cuando(m.registradoEn)}</span>,
  },
  {
    clave: 'importe',
    titulo: 'Importe',
    numerica: true,
    celda: (m) => <Dinero centavos={Number(m.montoCentavos)} tamano="sm" />,
  },
];

/** Lo que se mira cuando una caja no cuadra: de qué día viene y cuánto se contó. */
const COLUMNAS_DEL_HISTORIAL: readonly ColumnaDeTabla<CorteDelHistorial>[] = [
  {
    clave: 'folio',
    titulo: 'Folio',
    celda: (corte) => (
      <span className="font-medium font-numeros tabular-nums">{corte.folio ?? 's/f'}</span>
    ),
  },
  { clave: 'apertura', titulo: 'Apertura', celda: (corte) => cuando(corte.fecha_apertura) },
  { clave: 'cierre', titulo: 'Cierre', celda: (corte) => cuando(corte.fecha_cierre) },
  // Sin `desde`: quién abrió es la mitad de lo que se busca cuando una caja no
  // cuadra, y en el teléfono también. La tabla trae su propio desplazamiento.
  {
    clave: 'abrio',
    titulo: 'Abrió',
    celda: (corte) => corte.usuario_apertura_nombre ?? 'sin nombre',
  },
  {
    clave: 'contado',
    titulo: 'Contado',
    numerica: true,
    celda: (corte) => {
      // El puente lo sirve en PESOS: de vuelta a centavos contando dígitos.
      const contado = centavosDelPuente(corte.efectivo_contado);
      return contado === null ? (
        <span className="text-texto-sutil">en curso</span>
      ) : (
        <Dinero centavos={contado} tamano="sm" />
      );
    },
  },
];

/** El historial, por el puente. Aparte del turno: ver `LecturaDelTurno`. */
function leerHistorial(signal: AbortSignal): Promise<readonly CorteDelHistorial[]> {
  return consultarPuente<CorteDelHistorial>('CorteCaja', { limite: LIMITE_DEL_HISTORIAL, signal });
}

export function Turno({ estadoInicial, filasIniciales, onTurnoAbierto }: TurnoProps) {
  const voc = useVocabulario();
  const [estado, setEstado] = useState<EstadoDelTurno | null>(estadoInicial ?? null);
  const [historial, setHistorial] = useState<readonly CorteDelHistorial[]>(filasIniciales ?? []);
  const [cargando, setCargando] = useState(estadoInicial === undefined);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [falloDeHistorial, setFalloDeHistorial] = useState<string | null>(null);
  const [leyendoHistorial, setLeyendoHistorial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [fondo, setFondo] = useState<Desglose>(FONDO_VACIO);
  const [cambio, setCambio] = useState<number | null>(null);
  const [cambioAbierto, setCambioAbierto] = useState(false);
  const [montoCambio, setMontoCambio] = useState<number | null>(null);
  const [tipo, setTipo] = useState<TipoMovimiento>('retiro');
  const [monto, setMonto] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  // Cada intento de lectura es un número: el botón de reintentar lo sube y el
  // efecto lee otra vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);

  /**
   * Lee, y NO pinta. La separación no es estilo: un `setState` dentro de la
   * función que el efecto llama de frente encadena un render por lectura.
   */
  const leerTurno = useCallback(async (signal: AbortSignal): Promise<LecturaDelTurno> => {
    // Las dos salen a la vez, pero NO caen juntas: el historial se resuelve a su
    // propio resultado, y sólo el fallo del turno rechaza la lectura.
    const historialLeido = leerHistorial(signal).then(
      (cortes) => ({ cortes, falloDeCortes: null }),
      (fallo: unknown) => ({
        cortes: null,
        falloDeCortes: mensajeDe(fallo, 'No se pudo leer el historial.'),
      }),
    );
    const vivo = await invocarComando<EstadoDelTurno>('/api/caja/estado', {}, { signal });
    return { vivo, ...(await historialLeido) };
  }, []);

  useEffect(() => {
    if (estadoInicial !== undefined) return;
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    leerTurno(control.signal)
      .then(({ vivo, cortes, falloDeCortes }) => {
        if (!sigueMontada()) return;
        setEstado(vivo);
        if (cortes !== null) setHistorial(cortes);
        setFalloDeHistorial(falloDeCortes);
        setCargando(false);
      })
      .catch((fallo: unknown) => {
        // La pantalla no se queda colgada en el esqueleto por un fallo de red:
        // dice qué pasó y deja volver a leer.
        if (!sigueMontada()) return;
        setFalloDeCarga(mensajeDe(fallo, 'No se pudo leer el turno.'));
        setCargando(false);
      });
    return () => {
      control.abort();
    };
  }, [estadoInicial, leerTurno, intento]);

  function volverALeer(): void {
    setFalloDeCarga(null);
    setCargando(true);
    setIntento((previo) => previo + 1);
  }

  /** Sólo el historial: el turno ya está leído y no se vuelve a tapar con un esqueleto. */
  async function volverALeerHistorial(): Promise<void> {
    if (leyendoHistorial) return;
    setLeyendoHistorial(true);
    try {
      setHistorial(await leerHistorial(new AbortController().signal));
      setFalloDeHistorial(null);
    } catch (fallo) {
      setFalloDeHistorial(mensajeDe(fallo, 'No se pudo leer el historial.'));
    } finally {
      setLeyendoHistorial(false);
    }
  }

  /** Escribe, relee y deja la pantalla contando la verdad del servidor. */
  async function ejecutar(accion: () => Promise<void>, respaldo: string): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      await accion();
      const { vivo, cortes, falloDeCortes } = await leerTurno(new AbortController().signal);
      setEstado(vivo);
      if (cortes !== null) setHistorial(cortes);
      setFalloDeHistorial(falloDeCortes);
    } catch (fallo) {
      setError(mensajeDe(fallo, respaldo));
    } finally {
      setEnviando(false);
    }
  }

  const abrirTurno = () =>
    ejecutar(async () => {
      const datos = await invocarComando<{ sesionCajaId: string }>('/api/caja/abrir', {
        fondoInicialCentavos: totalDelFondo(fondo),
      });
      // El desglose no viaja: la morralla declarada se queda aquí, que es el
      // único sitio donde existe mientras la apertura acepte una sola cifra.
      setCambio((fondo.monedas ?? 0) + (fondo.chicos ?? 0));
      onTurnoAbierto?.(datos.sesionCajaId);
    }, 'No se pudo abrir el turno. No se abrió nada.');

  const registrar = (cual: TipoMovimiento, centavos: number | null, razon: string) =>
    ejecutar(async () => {
      const importe = centavos ?? 0;
      // El signo lo pone el servidor a partir del tipo: un gasto que llegara
      // positivo sumaría al arqueo en vez de restarle.
      await invocarComando('/api/caja/movimiento', {
        tipo: cual,
        montoCentavos: importe,
        motivo: razon.trim(),
      });
      if (razon === MOTIVO_CAMBIO) setCambio((previo) => (previo ?? 0) + importe);
      setMonto(null);
      setMotivo('');
      setMontoCambio(null);
      setCambioAbierto(false);
    }, 'No se pudo registrar. El cajón no cambió.');

  /** Un importe con su etiqueta de verdad: todo control tiene nombre accesible. */
  const campoDeDinero = (
    id: string,
    etiqueta: string,
    centavos: number | null,
    alCambiar: (centavos: number | null) => void,
  ) => (
    <div className="grid gap-(--espacio-1)">
      <Label htmlFor={id}>{etiqueta}</Label>
      <CampoDeDinero
        id={id}
        tamano="grande"
        placeholder="0.00"
        centavos={centavos}
        alCambiar={alCambiar}
      />
    </div>
  );

  // La cabecera se pinta igual en las tres formas —leyendo, sin leer y leída—:
  // el título no salta y el ojo ya sabe dónde va a caer el estado.
  const titulo = <h1 className="text-2xl font-bold">Turno</h1>;

  if (cargando) {
    return (
      <div className={CONTENEDOR}>
        <Superficie como="header" className={FRANJA}>
          <div className="flex items-center gap-(--espacio-3)">
            <Esqueleto redondo className={CHAPA} />
            <div className="flex flex-col gap-(--espacio-2)">
              {titulo}
              <Esqueleto className="h-4 w-40" />
            </div>
          </div>
          <Esqueleto className="h-[calc(var(--altura-control)*1.4)] w-full xl:w-96" />
        </Superficie>
        {/* La forma de las pestañas y del panel, nunca una rueda. */}
        <div
          role="status"
          aria-busy="true"
          aria-label="Leyendo el turno"
          className="flex flex-col gap-(--espacio-3)"
        >
          <Esqueleto className="h-(--altura-control) w-full max-w-md" />
          <Esqueleto className="h-48 w-full rounded-lg xl:max-w-3xl" />
        </div>
      </div>
    );
  }

  if (falloDeCarga !== null) {
    return (
      <div className={CONTENEDOR}>
        {titulo}
        <ErrorDePantalla
          className="max-w-2xl"
          titulo="No se pudo leer el turno"
          queHacer="Sin saber si la caja está abierta no se puede abrir, mover dinero ni cortar. Revisa la conexión y vuelve a leerlo."
          detalle={falloDeCarga}
          reintentar={<Button onClick={volverALeer}>Volver a leer</Button>}
        />
      </div>
    );
  }

  const abierto = estado?.abierta === true;
  const movimientos = estado?.movimientos ?? [];
  const aviso = avisoDeCambio(cambio);
  const bloqueo = bloqueoDelMovimiento(monto, motivo);
  const fondoDeclarado = totalDelFondo(fondo);

  const registro = (cual: TipoMovimiento, boton: string, filas: readonly MovimientoDelTurno[]) => (
    <>
      {abierto ? null : (
        // Un muro de negocio, dicho: el botón apagado solo no explica nada.
        <Aviso tono="atencion" titulo="El turno está cerrado." className="mt-(--espacio-3)">
          Retiros, entradas y gastos se registran con el turno abierto: si no, no caen en ningún
          corte.
        </Aviso>
      )}
      <div className={REGISTRO}>
        <Superficie
          como="form"
          className="grid gap-(--espacio-3)"
          onSubmit={(evento) => {
            evento.preventDefault();
            void registrar(cual, monto, motivo);
          }}
        >
          {cual === 'gasto' ? null : (
            <div
              role="group"
              aria-label="Tipo de movimiento"
              className="grid grid-cols-2 gap-(--espacio-2)"
            >
              <Button
                type="button"
                aria-pressed={tipo === 'retiro'}
                variant={tipo === 'retiro' ? 'default' : 'outline'}
                onClick={() => {
                  setTipo('retiro');
                }}
              >
                Retiro
              </Button>
              <Button
                type="button"
                aria-pressed={tipo === 'deposito'}
                variant={tipo === 'deposito' ? 'default' : 'outline'}
                onClick={() => {
                  setTipo('deposito');
                }}
              >
                Entrada general
              </Button>
            </div>
          )}
          {campoDeDinero('movimiento-monto', 'Cuánto', monto, setMonto)}
          <div className="grid gap-(--espacio-1)">
            <Label htmlFor="movimiento-motivo">Por qué</Label>
            <Input
              id="movimiento-motivo"
              value={motivo}
              placeholder="Garrafón de agua para el mostrador"
              onChange={(evento) => {
                setMotivo(evento.target.value);
              }}
            />
          </div>
          <p className="text-sm text-texto-sutil">{bloqueo ?? 'Entra al corte del turno.'}</p>
          <Button
            type="submit"
            size="lg"
            className={ALTO_DE_DEDO}
            disabled={enviando || !abierto || bloqueo !== null}
          >
            {boton}
          </Button>
        </Superficie>
        <Tabla
          etiqueta={cual === 'gasto' ? 'Gastos del turno' : 'Movimientos del turno'}
          columnas={COLUMNAS_DE_MOVIMIENTO}
          filas={filas}
          claveDe={(m) => `${m.registradoEn}-${m.tipo}`}
          vacio={
            <Superficie>
              <Vacio
                className="py-(--espacio-4)"
                icono={<ReceiptText />}
                titulo="Todavía no hay nada que listar aquí."
                explicacion="Cada registro del turno aparece aquí con su hora y su importe, y entra al corte."
              />
            </Superficie>
          }
        />
      </div>
    </>
  );

  return (
    <div className={CONTENEDOR}>
      {/* 1 · EL ESTADO, y a su lado lo que lo cambia. El color nunca es el único
          que lo dice: la palabra y el candado van con él. */}
      <Superficie como="header" className={FRANJA}>
        <div className="flex items-center gap-(--espacio-3)">
          <span
            aria-hidden="true"
            className={`flex ${CHAPA} items-center justify-center rounded-full ${abierto ? 'bg-exito/15 text-exito' : 'bg-fondo-sutil text-texto-sutil'}`}
          >
            {abierto ? <LockOpen /> : <Lock />}
          </span>
          <div className="flex flex-col">
            {titulo}
            {/* El nivel 1 de la pantalla: en el color del texto y no en el sutil,
                y al menos tan pesado como las cifras del resumen. */}
            <p className="text-xl font-semibold text-texto">
              {abierto ? `Abierto desde ${cuando(estado.abiertaEn)}` : 'Cerrado'}
            </p>
          </div>
        </div>

        {abierto ? (
          <section
            aria-label="Acciones de caja"
            className="grid gap-(--espacio-2) sm:grid-cols-3 xl:flex xl:flex-wrap xl:justify-end"
          >
            <Button asChild size="lg" className={BOTON_DE_CAJA}>
              <a href={RUTA_ARQUEO}>Cerrar turno</a>
            </Button>
            <Button
              size="lg"
              className={BOTON_DE_CAJA}
              variant={cambioAbierto ? 'secondary' : 'default'}
              aria-expanded={cambioAbierto}
              aria-controls="entrada-de-cambio"
              onClick={() => {
                setCambioAbierto(!cambioAbierto);
              }}
            >
              <Plus aria-hidden="true" />
              Entrada de cambio
            </Button>
            <Button asChild size="lg" variant="outline" className={BOTON_DE_CAJA}>
              <a href={RUTA_ARQUEO}>Corte de turno</a>
            </Button>
          </section>
        ) : null}
      </Superficie>

      {error === null ? null : (
        <Aviso tono="peligro" titulo={error}>
          Nada se movió; la pantalla conserva el último dato conocido.
        </Aviso>
      )}

      {/* 2 · LA APERTURA. PC: los tres cajones en fila. Tableta y teléfono:
          apilados, y cada uno con su campo grande. */}
      {abierto ? null : (
        <Superficie
          como="form"
          aria-labelledby="fondo-de-apertura"
          className="flex flex-col gap-(--espacio-4)"
          onSubmit={(evento) => {
            evento.preventDefault();
            void abrirTurno();
          }}
        >
          <div className="flex flex-col gap-(--espacio-1)">
            <h2 id="fondo-de-apertura" className="text-lg font-semibold">
              Fondo de apertura
            </h2>
            <p className="max-w-prose text-sm text-texto-sutil">
              Se cuenta por denominación y no de un jalón: el total no dice con qué vas a dar
              cambio, y quedarse sin morralla a media ráfaga cuesta media ráfaga.
            </p>
          </div>
          <div className="grid gap-(--espacio-3) xl:grid-cols-3">
            {DENOMINACIONES.map((d) => (
              <div key={d.clave}>
                {campoDeDinero(`fondo-${d.clave}`, d.etiqueta, fondo[d.clave], (centavos) => {
                  setFondo((previo) => ({ ...previo, [d.clave]: centavos }));
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-(--espacio-3) border-t border-borde pt-(--espacio-4) xl:flex-row xl:items-center xl:justify-between">
            <p className="flex items-baseline justify-between gap-(--espacio-3) xl:justify-start">
              <span className="text-sm text-texto-sutil">Fondo declarado</span>
              <Dinero centavos={fondoDeclarado} tamano="lg" />
            </p>
            <Button
              type="submit"
              size="lg"
              className={BOTON_DE_CAJA}
              disabled={enviando || fondoDeclarado <= 0}
            >
              Abrir turno
            </Button>
          </div>
        </Superficie>
      )}

      {/* El movimiento de ocho veces al día: un número y un botón, justo debajo
          del que lo abre. */}
      {cambioAbierto ? (
        <Superficie
          como="form"
          id="entrada-de-cambio"
          aria-label="Entrada de cambio"
          className="grid gap-(--espacio-3) xl:max-w-md"
          onSubmit={(evento) => {
            evento.preventDefault();
            void registrar('deposito', montoCambio, MOTIVO_CAMBIO);
          }}
        >
          {campoDeDinero('cambio-monto', 'Cuánta morralla entró', montoCambio, setMontoCambio)}
          <Button
            type="submit"
            size="lg"
            className={ALTO_DE_DEDO}
            disabled={enviando || (montoCambio ?? 0) <= 0}
          >
            Registrar entrada de cambio
          </Button>
        </Superficie>
      ) : null}

      <Tabs defaultValue={abierto ? 'resumen' : 'historial'}>
        <TabsList className="flex w-full overflow-x-auto">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        {/* 3 · EL RESUMEN. Es el nivel 3: sus cifras van al paso del fondo de
            apertura y no más arriba, para no pesar más que el estado de la franja
            (`total` es sólo el del cobro). Lo vendido va primero; el cambio va
            aparte y con su palabra. */}
        <TabsContent value="resumen" className="pt-(--espacio-3)">
          <Superficie className="xl:max-w-3xl">
            <dl className="grid gap-(--espacio-4) sm:grid-cols-3">
              <div className="flex flex-col gap-(--espacio-1)">
                <dt className="text-sm text-texto-sutil">Vendido en el turno</dt>
                <dd>
                  <Dinero centavos={Number(estado?.ventasCentavos ?? '0')} tamano="lg" />
                </dd>
              </div>
              <div className="flex flex-col gap-(--espacio-1)">
                <dt className="text-sm text-texto-sutil">
                  {voc.titulo('unidad_servicio', true)} cobrad
                  {voc.terminacion('unidad_servicio', true)}
                </dt>
                <dd>
                  <Cifra valor={estado?.numeroVentas ?? 0} tamano="lg" />
                </dd>
              </div>
              <div className="flex flex-col gap-(--espacio-1)">
                <dt className="text-sm text-texto-sutil">Fondo de apertura</dt>
                <dd>
                  <Dinero centavos={Number(estado?.fondoInicialCentavos ?? '0')} tamano="lg" />
                </dd>
              </div>
              <div
                className={`flex flex-col gap-(--espacio-1) rounded-md p-(--espacio-3) text-sm sm:col-span-3 ${aviso.clase}`}
              >
                <dt className="flex items-center gap-(--espacio-2) font-medium">
                  <Coins aria-hidden="true" className="size-4" />
                  Cambio en caja
                </dt>
                <dd className="flex flex-wrap items-baseline gap-(--espacio-2)">
                  {cambio === null ? '—' : <Dinero centavos={cambio} tamano="base" />}
                  <span className="font-semibold">· {aviso.palabra}</span>
                </dd>
                <dd className="text-xs">
                  El bote no se mira durante el turno: se cuenta en el cierre.
                </dd>
              </div>
            </dl>
          </Superficie>
        </TabsContent>

        <TabsContent value="movimientos">
          {registro(
            tipo,
            tipo === 'retiro' ? 'Registrar retiro' : 'Registrar entrada',
            movimientos,
          )}
        </TabsContent>

        <TabsContent value="gastos">
          {registro(
            'gasto',
            'Registrar gasto',
            movimientos.filter((m) => m.tipo === 'gasto'),
          )}
        </TabsContent>

        {/* 4 · EL HISTORIAL. El detalle de cada corte es otra pantalla. Si no se
            leyó, se dice AQUÍ: el turno de arriba sí se leyó y se sigue operando. */}
        <TabsContent value="historial" className="pt-(--espacio-3)">
          <div className="flex flex-col gap-(--espacio-3)">
            {falloDeHistorial === null ? null : (
              <ErrorDePantalla
                className="max-w-2xl"
                titulo="No se pudo leer el historial de turnos"
                queHacer="El turno de hoy sí se leyó: se puede abrir, mover dinero y cortar. Lo que falta son los turnos anteriores; vuelve a leerlos."
                detalle={falloDeHistorial}
                reintentar={
                  <Button
                    cargando={leyendoHistorial}
                    onClick={() => {
                      void volverALeerHistorial();
                    }}
                  >
                    Volver a leer el historial
                  </Button>
                }
              />
            )}
            {/* Sin historial leído, la tabla vacía diría «todavía no hay turnos», que
              no es verdad: sólo se pinta si hay filas de una lectura anterior. */}
            {falloDeHistorial !== null && historial.length === 0 ? null : (
              <Tabla
                etiqueta="Historial de turnos"
                columnas={COLUMNAS_DEL_HISTORIAL}
                filas={historial}
                claveDe={(corte) => corte.id}
                vacio={
                  // El vacío ENSEÑA: dice qué va a aparecer y para qué va a servir.
                  <Superficie>
                    <Vacio
                      className="py-(--espacio-6)"
                      icono={<History />}
                      titulo="Todavía no hay turnos cerrados."
                      explicacion="Cada turno que se cierre deja aquí su folio, quién lo abrió y cuánto se contó. Es lo que se mira cuando una caja no cuadra y hay que saber de qué día viene."
                    />
                  </Superficie>
                }
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
