'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
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
  ListaDeTarjetas,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';
import type { Vocabulario } from '@morphiqpos/domain/vocabulario';
import { ChevronRight, CircleCheckBig, Search, SearchX, TriangleAlert } from 'lucide-react';

/**
 * PANTALLA · restaurante · caja
 *
 * Pantalla de inicio del cajero: 40-120 cobros al día, y la única del modelo
 * donde se BUSCA un dato entre muchos. De ahí las filas compactas y las cifras
 * tabulares a la derecha — aquí lo que adorna, estorba.
 *
 * Abre en «Pendientes» y no en «Buscar» porque el 90 % del trabajo del cajero es
 * cobrar lo que ya está esperando, y un buscador vacío le costaría un clic cien
 * veces al día. La ESPERA es columna y además ordena la fila: una mesa que lleva
 * seis minutos esperando no se libera y la persona se está enojando. Los botones
 * de caja no viven en un menú porque son los momentos en que la caja CAMBIA DE
 * ESTADO, y esconderlos hace que alguien cobre sin caja abierta o que el turno se
 * vaya sin cortar. Y «Caja cerrada» es un MURO, no un aviso: un cobro sin sesión
 * no pertenece a ningún corte, y eso no lo cuadra nadie.
 *
 * ── Una tabla en la PC, tarjetas en la tableta y el teléfono ────────────
 * La PC es el dispositivo de la caja: una `Tabla` densa —código, mesa, mesero,
 * personas, espera, total— que se compara de arriba abajo y se opera con Enter.
 * Por debajo de 1280 px cada cuenta es una tarjeta con la mesa y el total GRANDES
 * arriba y el mesero y la espera abajo; en el teléfono, que es el dueño cobrando
 * porque el cajero fue al baño, el total es lo más grande de la tarjeta. No es la
 * misma lista con otro CSS: la tarjeta junta mesa y total en su cabecera, y eso
 * pide sus propias columnas (`columnasDeTarjeta`).
 *
 * ── Recortado, dicho aquí y no escondido ─────────────────────────────────
 * · La espera cuenta desde que se ABRIÓ la cuenta: el instante en que la mesa la
 *   pidió vive en `eventos_mesa`, que el puente sólo abre a DIRECCIÓN. El número
 *   sale mayor; el ORDEN de la fila, que es para lo que sirve, no. Por eso la
 *   espera no pinta la fila de ámbar: con un número inflado, el color mentiría.
 * · Cobrar es el diálogo «Cobro» y el arqueo es «Cierre diario y arqueo»: dos
 *   pantallas propias. Aquí se elige la cuenta y se abren aquéllas — el conteo es
 *   A CIEGAS, así que ésta nunca adelanta el efectivo esperado.
 * · Fuera quedan `F2` y las flechas y, en teléfono, el menú que escondía
 *   Resumen e Historial: allí esas dos pestañas no se muestran, y «sólo
 *   pendientes», que es lo que el documento pide, se cumple igual. Enter sobre la
 *   fila enfocada sí cobra: lo trae la `Tabla`.
 */

/**
 * Una cuenta esperando cobro. Los nombres de los campos son los del PUENTE, no
 * unos propios: renombrarlos costaría un mapeo entero para no ganar nada, y el
 * mapa de entidades ya advierte que los nombres son los que la base escribe.
 */
export interface FilaDeCaja {
  readonly id: string;
  /** El código impreso que el comensal lleva a la caja: M05-4821. */
  readonly codigo_caja: string | null;
  readonly mesa_numero: number | null;
  readonly usuario_mesero_nombre: string | null;
  readonly personas: number | null;
  /** En PESOS, como la base lo escribe. Se pasa a centavos sólo para pintarlo. */
  readonly total: number | null;
  readonly fecha_apertura: string | null;
}

/** El turno hasta ahora: lo que se enseña cuando no hay nada que cobrar. */
export interface ResumenDeTurno {
  readonly abierta: boolean;
  readonly ventasCentavos: string;
  readonly numeroVentas: number;
}

export interface CajaProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly FilaDeCaja[];
  readonly turnoInicial?: ResumenDeTurno;
  readonly onCobrar?: (ventaId: string) => void;
}

/** Desde este ancho la lista es la tabla del cajero; por debajo, tarjetas. */
const PC = '(min-width: 1280px)';
/** En teléfono sobreviven Pendientes y Buscar: lo demás es trabajo de mostrador. */
const SOLO_PC = 'hidden md:inline-flex';

/** Texto de espera: el dato se lee siempre, nunca se infiere de un color. */
export function esperaDesde(iso: string | null, ahora: number): string {
  if (iso === null) return 'sin dato';
  const minutos = Math.floor((ahora - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutos) || minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${String(minutos)} min`;
  return `hace ${String(Math.floor(minutos / 60))} h`;
}

/** Pesos del puente a centavos contando dígitos: `58.995 * 100` pierde medio centavo. */
function aCentavos(pesos: number | null | undefined): number {
  if (pesos === null || pesos === undefined || !Number.isFinite(pesos)) return 0;
  const [entero = '0', decimal = '00'] = Math.abs(pesos).toFixed(2).split('.');
  return (pesos < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

function rotulo(numero: number | null, voc: Vocabulario): string {
  return numero === null
    ? `Sin ${voc.singular('unidad_servicio')}`
    : `${voc.titulo('unidad_servicio')} ${String(numero)}`;
}

function mesero(fila: FilaDeCaja, voc: Vocabulario): string {
  return fila.usuario_mesero_nombre ?? `sin ${voc.singular('responsable')}`;
}

/** Quién atiende y cuánta gente: dos datos chicos que en la tarjeta comparten renglón. */
function quien(fila: FilaDeCaja, voc: Vocabulario): string {
  const gente = fila.personas === null ? '' : ` · ${String(fila.personas)} p.`;
  return `${mesero(fila, voc)}${gente}`;
}

/**
 * El importe de la cuenta. Un ticket en $0.00 se abrió y se cerró sin consumo: se
 * dice con palabras al lado de la cifra, porque el tono de la fila solo no se lee.
 */
function importe(fila: FilaDeCaja, cifra: ReactNode): ReactNode {
  if (fila.total !== 0) return cifra;
  return (
    <>
      <span className="mr-(--espacio-2) text-xs font-medium text-texto-sutil">sin consumo</span>
      {cifra}
    </>
  );
}

/** La tabla del cajero en la PC: densa, cada columna alineada, el total a la derecha. */
function columnasDeTabla(voc: Vocabulario, ahora: number): readonly ColumnaDeTabla<FilaDeCaja>[] {
  return [
    {
      clave: 'codigo',
      titulo: 'Código',
      celda: (f) => (
        <span className="font-numeros tracking-wide text-texto-sutil tabular-nums">
          {f.codigo_caja ?? '—'}
        </span>
      ),
    },
    {
      clave: 'mesa',
      titulo: voc.titulo('unidad_servicio'),
      celda: (f) => <span className="font-semibold">{rotulo(f.mesa_numero, voc)}</span>,
    },
    { clave: 'mesero', titulo: voc.titulo('responsable'), celda: (f) => mesero(f, voc) },
    {
      clave: 'personas',
      titulo: 'Personas',
      numerica: true,
      celda: (f) => (f.personas === null ? '—' : <Cifra valor={f.personas} tamano="sm" />),
    },
    {
      clave: 'espera',
      titulo: 'Espera',
      orden: (f) => f.fecha_apertura ?? '',
      celda: (f) => <span className="font-medium">{esperaDesde(f.fecha_apertura, ahora)}</span>,
    },
    {
      clave: 'total',
      titulo: 'Total',
      numerica: true,
      orden: (f) => f.total ?? 0,
      celda: (f) => importe(f, <Dinero centavos={aCentavos(f.total)} className="font-semibold" />),
    },
    {
      clave: 'cobrar',
      titulo: 'Cobrar',
      celda: () => (
        <span className="flex justify-end text-texto-tenue">
          <ChevronRight aria-hidden="true" className="size-4" />
        </span>
      ),
    },
  ];
}

/**
 * La tarjeta de tableta y teléfono: la mesa y el total arriba, en grande, y el
 * total más grande que la mesa —en el teléfono es lo único que se dice en voz
 * alta—; debajo, el mesero, la espera y el código.
 */
function columnasDeTarjeta(voc: Vocabulario, ahora: number): readonly ColumnaDeTabla<FilaDeCaja>[] {
  return [
    {
      clave: 'mesa',
      titulo: voc.titulo('unidad_servicio'),
      celda: (f) => (
        <span className="flex items-baseline justify-between gap-(--espacio-3)">
          <span className="text-lg font-semibold md:text-2xl">{rotulo(f.mesa_numero, voc)}</span>
          <span>
            {importe(
              f,
              <Dinero centavos={aCentavos(f.total)} tamano="lg" className="text-2xl font-bold" />,
            )}
          </span>
        </span>
      ),
    },
    { clave: 'mesero', titulo: voc.titulo('responsable'), celda: (f) => quien(f, voc) },
    {
      clave: 'espera',
      titulo: 'Espera',
      celda: (f) => <span className="font-medium">{esperaDesde(f.fecha_apertura, ahora)}</span>,
    },
    {
      clave: 'codigo',
      titulo: 'Código',
      celda: (f) => <span className="font-numeros tabular-nums">{f.codigo_caja ?? '—'}</span>,
    },
  ];
}

/** Lo decide el ancho, como `TablaAdaptable`; en el servidor, la PC, que es la de la caja. */
function useEsPC(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const medio = window.matchMedia(PC);
      medio.addEventListener('change', avisar);
      return () => {
        medio.removeEventListener('change', avisar);
      };
    },
    () => window.matchMedia(PC).matches,
    () => true,
  );
}

/**
 * `Mesa` dice QUIÉN pidió la cuenta y `Venta` trae el dinero, que el puente sólo
 * abre a caja: ninguna basta sola, y unirlas aquí evita inventar una ruta de API
 * que el documento no nombra. Sale ordenado por espera, de más a menos.
 */
async function leerPendientes(signal: AbortSignal): Promise<readonly FilaDeCaja[]> {
  const [mesas, ventas] = await Promise.all([
    consultarPuente<{ venta_activa_id: string | null }>('Mesa', {
      filtro: { estado: 'cuenta_solicitada' },
      limite: 200,
      signal,
    }),
    consultarPuente<FilaDeCaja>('Venta', { limite: 300, signal }),
  ]);
  const esperando = new Set(mesas.map((mesa) => mesa.venta_activa_id));
  return ventas
    .filter((venta) => esperando.has(venta.id))
    .sort((a, b) => (a.fecha_apertura ?? '').localeCompare(b.fecha_apertura ?? ''));
}

export function Caja({ filasIniciales, turnoInicial, onCobrar }: CajaProps) {
  const voc = useVocabulario();
  const esPC = useEsPC();
  const [filas, setFilas] = useState<readonly FilaDeCaja[] | null>(filasIniciales ?? null);
  const [turno, setTurno] = useState<ResumenDeTurno | null>(turnoInicial ?? null);
  /** No se leyó NADA: sin lista no hay pantalla, y se dice con su reintento. */
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  /** Se leyó, y un comando falló: la lista se queda con el último dato. */
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [pestana, setPestana] = useState('pendientes');
  const [busqueda, setBusqueda] = useState('');
  const [fondo, setFondo] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  /**
   * Lee, y NO pinta.
   *
   * La separación no es estilo: `setState` dentro de una función que el efecto
   * llama de frente encadena un render por cada lectura. Lo que se lee vuelve
   * como dato y quien lo pidió decide cuándo escribirlo.
   */
  const leerCaja = useCallback(async (signal: AbortSignal) => {
    const [pendientes, estado] = await Promise.all([
      leerPendientes(signal),
      invocarComando<ResumenDeTurno>('/api/caja/estado', {}, { signal }),
    ]);
    return { pendientes, estado };
  }, []);

  useEffect(() => {
    // El reloj avanza solo: si no, «hace 1 min» sigue diciendo eso cuando ya van
    // nueve y la columna que ordena la fila miente.
    const reloj = setInterval(() => {
      setAhora(Date.now());
    }, 30_000);
    const control = new AbortController();
    if (filasIniciales === undefined) {
      // Una lectura abortada —la pantalla se fue, o el modo estricto la montó dos
      // veces— no es un fallo: su rechazo no debe tapar la lectura que sí llegó.
      leerCaja(control.signal)
        .then(({ pendientes, estado }) => {
          if (control.signal.aborted) return;
          setFilas(pendientes);
          setTurno(estado);
        })
        .catch((fallo: unknown) => {
          if (control.signal.aborted) return;
          setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer la caja.');
        });
    }
    return () => {
      clearInterval(reloj);
      control.abort();
    };
  }, [filasIniciales, leerCaja, intento]);

  /** El estado se limpia EN EL CLIC, no en el efecto: el efecto sólo vuelve a leer. */
  function reintentar(): void {
    setFalloDeCarga(null);
    setFilas(null);
    setTurno(null);
    setIntento((previo) => previo + 1);
  }

  const visibles = useMemo(() => {
    const aguja = busqueda.trim().toLowerCase();
    if (aguja === '') return filas ?? [];
    const texto = (f: FilaDeCaja) =>
      `${f.codigo_caja ?? ''} ${rotulo(f.mesa_numero, voc)} ${quien(f, voc)}`;
    return (filas ?? []).filter((f) => texto(f).toLowerCase().includes(aguja));
  }, [filas, busqueda, voc]);

  const sinConsumo = useMemo(() => (filas ?? []).filter((f) => f.total === 0), [filas]);
  const columnasPC = useMemo(() => columnasDeTabla(voc, ahora), [voc, ahora]);
  const columnasTarjeta = useMemo(() => columnasDeTarjeta(voc, ahora), [voc, ahora]);

  const alBuscar = (evento: ChangeEvent<HTMLInputElement>) => {
    setBusqueda(evento.target.value);
  };

  const cobrar = (id: string) => {
    onCobrar?.(id);
  };

  // Ruta por convención /api/<dominio>/<verbo>: la salida que ya existe para anular
  // una cuenta. Su motivo es obligatorio en la base, así que va siempre.
  const eliminarVacio = (id: string) => () => {
    const motivo = 'Cuenta sin consumo eliminada desde caja';
    invocarComando('/api/restaurante/cancelar-orden', { ordenId: id, motivo })
      .then(() => {
        setFilas((previas) => (previas ?? []).filter((fila) => fila.id !== id));
      })
      .catch((fallo: unknown) => {
        setError(fallo instanceof Error ? fallo.message : 'No se pudo eliminar el ticket.');
      });
  };

  const alAbrirCaja = () => {
    invocarComando('/api/caja/abrir', {
      fondoInicialCentavos: fondo !== null && fondo > 0 ? fondo : 0,
    })
      .then(async () => leerCaja(new AbortController().signal))
      .then(({ pendientes, estado }) => {
        setFilas(pendientes);
        setTurno(estado);
        setError(null);
      })
      .catch((fallo: unknown) => {
        setError(fallo instanceof Error ? fallo.message : 'No se pudo abrir la caja.');
      });
  };

  if (falloDeCarga !== null) {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-(--espacio-4) p-(--espacio-6)">
        <h1 className="text-2xl font-bold">Caja</h1>
        <ErrorDePantalla
          titulo={`No se pudieron leer ${voc.enFrase('orden', true)} pendientes`}
          queHacer={`Sin esta lista no se sabe qué ${voc.plural('unidad_servicio')} esperan pagar ni si la caja está abierta. Revisa la conexión y vuelve a intentarlo.`}
          detalle={falloDeCarga}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </main>
    );
  }

  // La forma de lo que viene, nunca una rueda: tarjetas altas en tableta y
  // teléfono, renglones compactos en la PC. Al llegar los datos nada salta.
  if (filas === null || turno === null) {
    return (
      <main className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
        <header className="flex flex-col gap-(--espacio-3) xl:flex-row xl:items-center xl:justify-between">
          <h1 className="text-2xl font-bold">Caja</h1>
          <div className="grid grid-cols-2 gap-(--espacio-2) xl:flex">
            <Esqueleto className="h-(--altura-control) xl:w-28" />
            <Esqueleto className="h-(--altura-control) xl:w-36" />
          </div>
        </header>
        <Esqueleto className="h-(--altura-control) w-full max-w-md" />
        <div
          role="status"
          aria-busy="true"
          aria-label="Leyendo la caja"
          className="flex flex-col gap-(--espacio-2)"
        >
          {Array.from({ length: 6 }, (_, indice) => (
            <Esqueleto
              key={indice}
              className="h-24 w-full rounded-lg xl:h-(--altura-control) xl:rounded-md"
            />
          ))}
        </div>
      </main>
    );
  }

  if (!turno.abierta) {
    // El muro es la tarjeta ámbar del documento, y no un `Aviso` con un enlace:
    // aquí mismo se declara el fondo y se abre, sin ir a otra pantalla.
    return (
      <main className="flex min-h-dvh items-center justify-center p-(--espacio-4)">
        <Superficie
          como="section"
          nivel={2}
          relleno={6}
          aria-labelledby="caja-muro"
          className="flex w-full max-w-md flex-col gap-(--espacio-4) border-advertencia/50 bg-advertencia/10"
        >
          <div className="flex flex-col gap-(--espacio-2)">
            <h1 id="caja-muro" className="flex items-center gap-(--espacio-2) text-2xl font-bold">
              <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
              Caja cerrada
            </h1>
            <p className="text-sm text-texto-sutil">
              Sin sesión de caja, un cobro no entra en ningún corte. Declara el fondo y ábrela.
            </p>
          </div>
          {error === null ? null : <Aviso tono="peligro" titulo={error} />}
          <div className="flex flex-col gap-(--espacio-2)">
            <Label htmlFor="caja-fondo">Fondo inicial</Label>
            <CampoDeDinero id="caja-fondo" autoFocus centavos={fondo} alCambiar={setFondo} />
          </div>
          <Button size="lg" className="w-full" onClick={alAbrirCaja}>
            Abrir caja
          </Button>
        </Superficie>
      </main>
    );
  }

  const vendido = Number(turno.ventasCentavos);
  const resumen = (
    <Superficie
      como="dl"
      relleno={4}
      className="grid w-full max-w-md grid-cols-[1fr_auto] items-baseline gap-x-(--espacio-4) gap-y-(--espacio-2) text-left"
    >
      <dt className="text-sm text-texto-sutil">Vendido en el turno</dt>
      <dd className="justify-self-end">
        <Dinero centavos={Number.isFinite(vendido) ? vendido : 0} tamano="lg" />
      </dd>
      <dt className="text-sm text-texto-sutil">
        {voc.titulo('orden', true)} cobrad{voc.terminacion('orden', true)}
      </dt>
      <dd className="justify-self-end">
        <Cifra valor={turno.numeroVentas} tamano="lg" />
      </dd>
    </Superficie>
  );

  const aguja = busqueda.trim();
  // El vacío ENSEÑA: sin nadie esperando, el resumen del turno es lo que el cajero
  // haría con ese hueco. Con una búsqueda que no encontró, se dice qué se buscó.
  const vacio =
    filas.length === 0 || aguja === '' ? (
      <Vacio
        icono={<CircleCheckBig />}
        titulo={`${voc.conDeterminante('ningun', 'unidad_servicio')} está esperando pagar.`}
      >
        {resumen}
      </Vacio>
    ) : (
      <Vacio
        icono={<SearchX />}
        titulo={`${voc.conDeterminante('ningun', 'orden')} coincide con «${aguja}».`}
        explicacion={`Se busca por código, ${voc.singular('unidad_servicio')} o ${voc.singular('responsable')}.`}
        accion={
          <Button
            variant="outline"
            onClick={() => {
              setBusqueda('');
            }}
          >
            Limpiar búsqueda
          </Button>
        }
      />
    );

  const etiqueta = `${voc.titulo('orden', true)} pendientes de cobro`;
  const lista = esPC ? (
    <Tabla
      etiqueta={etiqueta}
      columnas={columnasPC}
      filas={visibles}
      claveDe={(f) => f.id}
      alActivar={cobrar}
      // El ámbar nunca va solo: la celda del total dice «sin consumo».
      tonoDeFila={(f) => (f.total === 0 ? 'advertencia' : undefined)}
      alto="max-h-[70vh]"
      vacio={vacio}
    />
  ) : (
    <ListaDeTarjetas
      columnas={columnasTarjeta}
      filas={visibles}
      claveDe={(f) => f.id}
      principal="mesa"
      alActivar={cobrar}
      vacio={vacio}
    />
  );

  return (
    <main className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
      <header className="flex flex-col gap-(--espacio-3) xl:flex-row xl:items-center xl:justify-between">
        <h1 className="text-2xl font-bold">Caja</h1>
        {/* En tablet y teléfono ocupan una fila de ancho completo. */}
        <nav aria-label="Estado de la caja" className="grid grid-cols-2 gap-(--espacio-2) xl:flex">
          <Button variant="secondary" size="sm" disabled title="Ya está abierta">
            Abrir caja
          </Button>
          {/*
            DOS ENLACES A UNA PANTALLA QUE NO EXISTE, y con 404 en el navegador.

            Decían «Corte de turno» y «Cierre diario» y los dos llevaban a
            `/restaurante/cierre-diario`, que **no es una ruta**: la pantalla se
            llama `cierre-diario-y-arqueo`. Los dos daban 404, y ninguna puerta lo
            veía porque la de rutas llamadas comprueba las de `/api/` —un enlace a
            una PANTALLA que no existe no pasaba por ahí—.

            Y eran dos para una: la pantalla de cierre no lee `?arqueo=turno` ni
            distingue turno de día, así que los dos botones habrían hecho lo mismo.
            Uno, con el nombre de la pantalla a la que lleva.
          */}
          <Button variant="outline" size="sm" asChild>
            <a href="/restaurante/cierre-diario-y-arqueo">Cierre y arqueo</a>
          </Button>
        </nav>
      </header>

      {error === null ? null : (
        <Aviso tono="peligro" titulo={error}>
          La lista quedó congelada con el último dato conocido.
        </Aviso>
      )}

      <Tabs value={pestana} onValueChange={setPestana}>
        <TabsList>
          <TabsTrigger value="pendientes">
            Pendientes <Badge variant="secondary">{String(filas.length)}</Badge>
          </TabsTrigger>
          <TabsTrigger value="buscar">Buscar</TabsTrigger>
          {/* En teléfono sobrevive Pendientes: cobrar desde ahí sólo pasa cuando el
              dueño releva al cajero que fue al baño. */}
          <TabsTrigger value="resumen" className={SOLO_PC}>
            Resumen
          </TabsTrigger>
          <TabsTrigger value="historial" className={SOLO_PC}>
            Historial
          </TabsTrigger>
        </TabsList>
        <TabsContent value="buscar" className="mt-(--espacio-3) max-w-sm">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-4 -translate-y-1/2 text-texto-sutil"
            />
            <Input
              id="caja-buscar"
              aria-label={`Buscar ${voc.singular('orden')}`}
              placeholder={`Código, ${voc.singular('unidad_servicio')} o ${voc.singular('responsable')}`}
              value={busqueda}
              onChange={alBuscar}
              className="pl-(--espacio-8)"
            />
          </div>
        </TabsContent>
        <TabsContent value="resumen" className="mt-(--espacio-3)">
          {resumen}
        </TabsContent>
        <TabsContent value="historial" className="mt-(--espacio-3) text-sm text-texto-sutil">
          Los cobros ya cerrados viven en Registros, con su folio y su corte.
        </TabsContent>
      </Tabs>

      {pestana === 'pendientes' || pestana === 'buscar' ? (
        <>
          {/* Se señala y se ofrece eliminarlo, FUERA de la tarjeta: en la tableta la
              tarjeta entera es el botón de cobrar, y un botón dentro de otro cobra
              al querer eliminar. */}
          {sinConsumo.length === 0 ? null : (
            <Aviso
              tono="atencion"
              titulo={`${voc.conNumero('orden', sinConsumo.length)} sin consumo`}
            >
              <p>Se abrieron y se cerraron sin consumo: no hay nada que cobrar.</p>
              <ul className="mt-(--espacio-2) flex flex-col gap-(--espacio-2)">
                {sinConsumo.map((fila) => (
                  <li
                    key={fila.id}
                    className="flex flex-wrap items-center justify-between gap-(--espacio-2)"
                  >
                    <span className="font-medium text-texto">
                      {rotulo(fila.mesa_numero, voc)} · {fila.codigo_caja ?? '—'}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Eliminar el ticket sin consumo de ${rotulo(fila.mesa_numero, voc)}`}
                      onClick={eliminarVacio(fila.id)}
                    >
                      Eliminar ticket
                    </Button>
                  </li>
                ))}
              </ul>
            </Aviso>
          )}
          {lista}
        </>
      ) : null}
    </main>
  );
}
