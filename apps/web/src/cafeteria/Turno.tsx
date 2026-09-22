'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@morphiqpos/ui/primitivas/tabs';
import { Vacio } from '@morphiqpos/ui/sistema';
import { History } from 'lucide-react';
import { type ChangeEvent, useCallback, useEffect, useState } from 'react';

import { consultarPuente, ErrorApi, invocarComando } from '~/cliente/api';
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
 * ── Por qué `+ Entrada de cambio` tiene botón propio y los demás no ──────
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
 *    reimpresión son otra pantalla.
 */

/** Los tres cajones del fondo, en el orden en que se cuentan. */
const DENOMINACIONES = [
  { clave: 'monedas', etiqueta: 'Monedas · de $1 a $10' },
  { clave: 'chicos', etiqueta: 'Billetes chicos · de $20 y $50' },
  { clave: 'grandes', etiqueta: 'Billetes grandes · de $100 y más' },
] as const;

type ClaveDenominacion = (typeof DENOMINACIONES)[number]['clave'];
type Desglose = Record<ClaveDenominacion, string>;
type TipoMovimiento = 'retiro' | 'deposito' | 'gasto';

/** Los dos umbrales de morralla, en centavos. Bajo el segundo es urgencia. */
const CAMBIO_POCO = 50_000;
const CAMBIO_URGENTE = 25_000;
const MOTIVO_CAMBIO = 'Entrada de cambio';
/** La pantalla del conteo a ciegas, del mismo documento §4.3. */
const RUTA_ARQUEO = '/cafeteria/cierre-de-turno-y-arqueo';

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const FECHA = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

// Las clases largas viven arriba para que cada elemento quepa en una línea.
const PANEL = 'rounded-lg border border-borde bg-superficie p-(--espacio-4) text-texto shadow-1';
// Teclado numérico grande en tablet y teléfono; en PC el campo vuelve a la
// altura de control del sistema, porque ahí se teclea con teclado de verdad.
const CAMPO = 'h-20 text-center text-3xl font-bold tabular-nums xl:h-(--altura-control)';

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
 * Texto tecleado a centavos, con aritmética entera. `parseFloat` está prohibido
 * por R15: `58.995 * 100` pierde medio centavo y el arqueo deja de cuadrar.
 */
export function centavosDeTexto(texto: string): number {
  const limpio = texto.replace(/[^\d.,]/g, '').replace(',', '.');
  const [entero = '', decimal = ''] = limpio.split('.');
  return (entero === '' ? 0 : Number(entero)) * 100 + Number(`${decimal}00`.slice(0, 2));
}

export function totalDelFondo(fondo: Desglose): number {
  return DENOMINACIONES.reduce((suma, d) => suma + centavosDeTexto(fondo[d.clave]), 0);
}

/** El aviso de cambio: su clase y su palabra. La palabra es la que manda. */
export function avisoDeCambio(centavos: number | null): {
  readonly clase: string;
  readonly palabra: string;
} {
  if (centavos === null) return { clase: 'bg-fondo-sutil', palabra: 'sin desglose en esta sesión' };
  if (centavos < CAMBIO_URGENTE) return { clase: 'bg-peligro/20', palabra: 'consíguelo ya' };
  if (centavos < CAMBIO_POCO) return { clase: 'bg-advertencia/25', palabra: 'va quedando poco' };
  return { clase: 'bg-fondo-sutil', palabra: 'alcanza' };
}

/** Qué impide registrar, con palabras: un botón apagado y mudo se intenta tres veces. */
export function bloqueoDelMovimiento(monto: string, motivo: string): string | null {
  if (centavosDeTexto(monto) <= 0) return 'Falta cuánto.';
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

export function Turno({ estadoInicial, filasIniciales, onTurnoAbierto }: TurnoProps) {
  const voc = useVocabulario();
  const [estado, setEstado] = useState<EstadoDelTurno | null>(estadoInicial ?? null);
  const [historial, setHistorial] = useState<readonly CorteDelHistorial[]>(filasIniciales ?? []);
  const [cargando, setCargando] = useState(estadoInicial === undefined);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [fondo, setFondo] = useState<Desglose>({ monedas: '', chicos: '', grandes: '' });
  const [cambio, setCambio] = useState<number | null>(null);
  const [cambioAbierto, setCambioAbierto] = useState(false);
  const [montoCambio, setMontoCambio] = useState('');
  const [tipo, setTipo] = useState<TipoMovimiento>('retiro');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');

  /**
   * Lee, y NO pinta. La separación no es estilo: un `setState` dentro de la
   * función que el efecto llama de frente encadena un render por lectura.
   */
  const leerTurno = useCallback(async (signal: AbortSignal) => {
    const [vivo, cortes] = await Promise.all([
      invocarComando<EstadoDelTurno>('/api/caja/estado', {}, { signal }),
      consultarPuente<CorteDelHistorial>('CorteCaja', { limite: 20, signal }),
    ]);
    return { vivo, cortes };
  }, []);

  useEffect(() => {
    if (estadoInicial !== undefined) return;
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    leerTurno(control.signal)
      .then(({ vivo, cortes }) => {
        setEstado(vivo);
        setHistorial(cortes);
        setCargando(false);
      })
      .catch((fallo: unknown) => {
        // La pantalla no se queda colgada en el esqueleto por un fallo de red:
        // se dice qué pasó y se deja hacer lo poco que se puede sin datos.
        if (!sigueMontada()) return;
        setError(mensajeDe(fallo, 'No se pudo leer el turno.'));
        setCargando(false);
      });
    return () => {
      control.abort();
    };
  }, [estadoInicial, leerTurno]);

  /** Escribe, relee y deja la pantalla contando la verdad del servidor. */
  async function ejecutar(accion: () => Promise<void>, respaldo: string): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      await accion();
      const { vivo, cortes } = await leerTurno(new AbortController().signal);
      setEstado(vivo);
      setHistorial(cortes);
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
      setCambio(centavosDeTexto(fondo.monedas) + centavosDeTexto(fondo.chicos));
      onTurnoAbierto?.(datos.sesionCajaId);
    }, 'No se pudo abrir el turno. No se abrió nada.');

  const registrar = (cual: TipoMovimiento, texto: string, razon: string) =>
    ejecutar(async () => {
      const centavos = centavosDeTexto(texto);
      // El signo lo pone el servidor a partir del tipo: un gasto que llegara
      // positivo sumaría al arqueo en vez de restarle.
      await invocarComando('/api/caja/movimiento', {
        tipo: cual,
        montoCentavos: centavos,
        motivo: razon.trim(),
      });
      if (razon === MOTIVO_CAMBIO) setCambio((previo) => (previo ?? 0) + centavos);
      setMonto('');
      setMotivo('');
      setMontoCambio('');
      setCambioAbierto(false);
    }, 'No se pudo registrar. El cajón no cambió.');

  const alEscribir =
    (fijar: (valor: string) => void) => (evento: ChangeEvent<HTMLInputElement>) => {
      fijar(evento.target.value);
    };

  const alEscribirFondo = (clave: ClaveDenominacion) => (evento: ChangeEvent<HTMLInputElement>) => {
    const valor = evento.target.value;
    setFondo((previo) => ({
      monedas: clave === 'monedas' ? valor : previo.monedas,
      chicos: clave === 'chicos' ? valor : previo.chicos,
      grandes: clave === 'grandes' ? valor : previo.grandes,
    }));
  };

  /** Un campo con su etiqueta de verdad: todo control tiene nombre accesible. */
  const campo = (
    id: string,
    etiqueta: string,
    valor: string,
    cambiar: (evento: ChangeEvent<HTMLInputElement>) => void,
    dinero = true,
  ) => (
    <div className="grid gap-1">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input
        id={id}
        value={valor}
        onChange={cambiar}
        className={dinero ? CAMPO : ''}
        inputMode={dinero ? 'decimal' : 'text'}
        placeholder={dinero ? '0.00' : 'Garrafón de agua para el mostrador'}
      />
    </div>
  );

  if (cargando) {
    return (
      <div className="space-y-(--espacio-3) p-(--espacio-4)">
        <h1 className="text-2xl font-bold">Turno</h1>
        {/* Esqueletos con la forma de los paneles, nunca un spinner: nada salta
            al llegar los datos y el ojo ya sabe dónde va a caer la cifra. */}
        <Skeleton className="h-20 w-full max-w-md rounded-lg" />
        <div className="grid gap-(--espacio-3) xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  const abierto = estado?.abierta === true;
  const movimientos = estado?.movimientos ?? [];
  const aviso = avisoDeCambio(cambio);
  const bloqueo = bloqueoDelMovimiento(monto, motivo);

  const lista = (filas: readonly MovimientoDelTurno[], vacio: string) =>
    filas.length === 0 ? (
      <p className="p-(--espacio-4) text-sm text-texto-sutil">{vacio}</p>
    ) : (
      <ul className="divide-y divide-borde">
        {filas.map((m) => (
          <li
            key={`${m.registradoEn}-${m.tipo}`}
            className="grid gap-1 p-(--espacio-3) md:grid-cols-2"
          >
            <span className="font-medium">
              {m.motivo ?? 'Sin motivo'} <span className="text-texto-sutil">· {m.tipo}</span>
            </span>
            <span className="tabular-nums md:justify-self-end">
              {PESOS.format(Number(m.montoCentavos) / 100)} · {cuando(m.registradoEn)}
            </span>
          </li>
        ))}
      </ul>
    );

  const registro = (cual: TipoMovimiento, boton: string, filas: readonly MovimientoDelTurno[]) => (
    <div className="grid gap-(--espacio-3) pt-(--espacio-3) xl:grid-cols-2">
      <form
        className={`${PANEL} grid gap-(--espacio-3)`}
        onSubmit={(evento) => {
          evento.preventDefault();
          void registrar(cual, monto, motivo);
        }}
      >
        {campo('movimiento-monto', 'Cuánto', monto, alEscribir(setMonto))}
        {campo('movimiento-motivo', 'Por qué', motivo, alEscribir(setMotivo), false)}
        <p className="text-sm text-texto-sutil">{bloqueo ?? 'Entra al corte del turno.'}</p>
        <Button type="submit" size="lg" disabled={enviando || !abierto || bloqueo !== null}>
          {boton}
        </Button>
      </form>
      <div className={`${PANEL} p-0`}>{lista(filas, 'Todavía no hay nada que listar aquí.')}</div>
    </div>
  );

  return (
    <div className="space-y-(--espacio-4) p-(--espacio-4)">
      <header className="flex flex-wrap items-center gap-(--espacio-3)">
        <h1 className="text-2xl font-bold">Turno</h1>
        {/* El estado se lee: el color nunca es el único que lo dice. */}
        <Badge variant={abierto ? 'default' : 'secondary'}>
          {abierto ? `Abierto desde ${cuando(estado.abiertaEn)}` : 'Cerrado'}
        </Badge>
      </header>

      {error !== null && (
        <p role="alert" className="rounded-md border border-peligro bg-peligro/15 p-(--espacio-3)">
          {error} · Nada se movió; la pantalla conserva el último dato conocido.
        </p>
      )}

      {abierto ? (
        <section aria-label="Acciones de caja" className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <a href={RUTA_ARQUEO}>Cerrar turno</a>
          </Button>
          <Button
            size="lg"
            variant={cambioAbierto ? 'secondary' : 'default'}
            aria-expanded={cambioAbierto}
            onClick={() => {
              setCambioAbierto(!cambioAbierto);
            }}
          >
            + Entrada de cambio
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={RUTA_ARQUEO}>Corte de turno</a>
          </Button>
        </section>
      ) : (
        <form
          className={`${PANEL} space-y-(--espacio-4)`}
          onSubmit={(evento) => {
            evento.preventDefault();
            void abrirTurno();
          }}
        >
          <h2 className="text-lg font-semibold">Fondo de apertura</h2>
          <p className="text-sm text-texto-sutil">
            Se cuenta por denominación y no de un jalón: el total no dice con qué vas a dar cambio,
            y quedarse sin morralla a media ráfaga cuesta media ráfaga.
          </p>
          {/* PC: los tres en fila. Tablet y teléfono: apilados y grandes. */}
          <div className="grid gap-(--espacio-3) xl:grid-cols-3">
            {DENOMINACIONES.map((d) => (
              <div key={d.clave}>
                {campo(`fondo-${d.clave}`, d.etiqueta, fondo[d.clave], alEscribirFondo(d.clave))}
              </div>
            ))}
          </div>
          <p className="text-sm">
            Fondo declarado:{' '}
            <strong className="tabular-nums">{PESOS.format(totalDelFondo(fondo) / 100)}</strong>
          </p>
          <Button type="submit" size="lg" disabled={enviando || totalDelFondo(fondo) <= 0}>
            Abrir turno
          </Button>
        </form>
      )}

      {cambioAbierto && (
        <form
          className={`${PANEL} grid gap-(--espacio-3) xl:max-w-md`}
          onSubmit={(evento) => {
            evento.preventDefault();
            void registrar('deposito', montoCambio, MOTIVO_CAMBIO);
          }}
        >
          {campo('cambio-monto', 'Cuánta morralla entró', montoCambio, alEscribir(setMontoCambio))}
          <Button type="submit" size="lg" disabled={enviando || centavosDeTexto(montoCambio) <= 0}>
            Registrar entrada de cambio
          </Button>
        </form>
      )}

      <Tabs defaultValue={abierto ? 'resumen' : 'historial'}>
        <TabsList className="flex w-full overflow-x-auto">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="pt-(--espacio-3)">
          <dl className={`${PANEL} grid grid-cols-2 gap-(--espacio-3) xl:max-w-xl`}>
            <dt className="text-sm text-texto-sutil">Vendido en el turno</dt>
            <dd className="justify-self-end font-bold tabular-nums">
              {PESOS.format(Number(estado?.ventasCentavos ?? '0') / 100)}
            </dd>
            <dt className="text-sm text-texto-sutil">
              {voc.titulo('unidad_servicio', true)} cobrad{voc.terminacion('unidad_servicio', true)}
            </dt>
            <dd className="justify-self-end font-bold tabular-nums">{estado?.numeroVentas ?? 0}</dd>
            <dt className="text-sm text-texto-sutil">Fondo de apertura</dt>
            <dd className="justify-self-end font-bold tabular-nums">
              {PESOS.format(Number(estado?.fondoInicialCentavos ?? '0') / 100)}
            </dd>
            <dd className={`col-span-2 rounded-md p-(--espacio-3) text-sm ${aviso.clase}`}>
              Cambio en caja: {cambio === null ? '—' : PESOS.format(cambio / 100)} · {aviso.palabra}
              . El bote no se mira durante el turno: se cuenta en el cierre.
            </dd>
          </dl>
        </TabsContent>

        <TabsContent value="movimientos">
          {registro(
            tipo,
            tipo === 'retiro' ? 'Registrar retiro' : 'Registrar entrada',
            movimientos,
          )}
          <div role="group" aria-label="Tipo de movimiento" className="flex gap-2 pt-(--espacio-3)">
            <Button
              aria-pressed={tipo === 'retiro'}
              variant={tipo === 'retiro' ? 'default' : 'outline'}
              onClick={() => {
                setTipo('retiro');
              }}
            >
              Retiro
            </Button>
            <Button
              aria-pressed={tipo === 'deposito'}
              variant={tipo === 'deposito' ? 'default' : 'outline'}
              onClick={() => {
                setTipo('deposito');
              }}
            >
              Entrada general
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="gastos">
          {registro(
            'gasto',
            'Registrar gasto',
            movimientos.filter((m) => m.tipo === 'gasto'),
          )}
        </TabsContent>

        <TabsContent value="historial" className="pt-(--espacio-3)">
          {historial.length === 0 ? (
            // El vacío ENSEÑA: dice qué va a aparecer y para qué va a servir.
            <div className={PANEL}>
              <Vacio
                className="py-(--espacio-6)"
                icono={<History />}
                titulo="Todavía no hay turnos cerrados."
                explicacion="Cada turno que se cierre deja aquí su folio, quién lo abrió y cuánto se contó. Es lo que se mira cuando una caja no cuadra y hay que saber de qué día viene."
              />
            </div>
          ) : (
            <ul className={`${PANEL} divide-y divide-borde p-0`}>
              {historial.map((corte) => (
                <li
                  key={corte.id}
                  className="grid gap-1 p-(--espacio-3) md:grid-cols-3 md:items-center"
                >
                  <span className="font-medium">Folio {corte.folio ?? 's/f'}</span>
                  <span className="text-sm text-texto-sutil">
                    {cuando(corte.fecha_apertura)} → {cuando(corte.fecha_cierre)} ·{' '}
                    {corte.usuario_apertura_nombre ?? 'sin nombre'}
                  </span>
                  <span className="tabular-nums md:justify-self-end">
                    {corte.efectivo_contado === null
                      ? 'en curso'
                      : PESOS.format(corte.efectivo_contado)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
