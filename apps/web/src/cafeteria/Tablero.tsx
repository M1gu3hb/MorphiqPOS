'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  GraficaDeBarras,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import {
  Armchair,
  Bike,
  Check,
  CupSoda,
  MoveRight,
  Receipt,
  ShoppingBag,
  Smartphone,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · cafetería · EL TABLERO (F-056 · §4.4)
 *
 * ── La hora a la que se mira es lo que lo diseña ──────────────────────────
 * «A las ocho de la mañana **nadie** mira el dashboard»: es la hora de más trabajo
 * del día, y las pantallas que existen a esa hora son la de cobrar y la barra. Éste
 * se mira **a las 10:30, cuando baja la ráfaga, y a las 20:40, al cerrar**.
 *
 * Por eso lo primero es la RÁFAGA —07:00 a 10:30 contra el mismo día de la semana
 * pasada— y no la venta del día: es la única franja con volumen suficiente para que
 * la diferencia signifique algo, y a las 10:30 es lo único que ya pasó.
 *
 * ── Y sobre el turno, no sobre el día ─────────────────────────────────────
 * El dinero que importa es el del turno abierto, porque es el que se va a cortar.
 * Sin turno abierto, la pantalla lo DICE en vez de enseñar ceros que parecen un mal
 * día.
 *
 * ── Tres alturas, y ninguna se mueve sola ─────────────────────────────────
 * Los cuatro de las 10:30 van arriba y con la cifra más grande; el pico lleva la
 * forma del día y por eso su tarjeta es la más ancha. Los cinco del dinero van un
 * escalón abajo, y la utilidad cierra esa fila a lo ancho porque es la respuesta a
 * «¿ganamos?». Abajo, las listas son tablas y las dos cifras sueltas —grano y
 * sellos— van en la columna de la derecha. El orden no cambia con la hora: la
 * memoria muscular es lo que deja leer los números en cuatro segundos.
 */

const RUTA = '/api/reportes/tablero-cafeteria';

/** Arriba de esto la fila se sale a la calle y se pierde gente que ni entra. */
const BEBIDAS_POR_HORA_QUE_APRIETAN = 45;
/** Del cobro a la entrega: bajar de 180 a 120 s deja atender 50 % más gente. */
const SEGUNDOS_QUE_APRIETAN = 180;

const MARCO = 'flex flex-col gap-(--espacio-4) p-(--espacio-3) md:p-(--espacio-4)';
const ROTULO = 'text-xs font-semibold uppercase tracking-wide text-texto-sutil';
const NOTA = 'text-sm text-texto-sutil';
/** La cifra de los cuatro de las 10:30 y de la utilidad: lo primero que se lee. */
const CIFRA = 'text-3xl font-semibold';
/** Un escalón abajo: el dinero del turno y las dos cifras de abajo. */
const CIFRA_CHICA = 'text-2xl font-semibold';

/**
 * La fila 1 le da más ancho al pico porque lleva la forma del día; con cuatro
 * columnas iguales la gráfica quedaba en 200 px y no se leía la ráfaga.
 */
const FILA_DE_LAS_DIEZ =
  'grid gap-(--espacio-3) md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]';
const FILA_DEL_DINERO = 'grid gap-(--espacio-3) md:grid-cols-2 xl:grid-cols-4';
const BLOQUES = 'grid gap-(--espacio-3) md:grid-cols-2 xl:grid-cols-3';

interface BebidaDelDia {
  readonly producto: string;
  readonly unidades: number;
  readonly utilidadCentavos: string;
}

interface MermaPorMotivo {
  readonly motivo: string;
  readonly veces: number;
  readonly costoCentavos: string;
}

export interface TableroDeCafeteria {
  readonly fecha: string;
  readonly turnoAbierto: boolean;
  readonly rafaga: {
    readonly hoyCentavos: string;
    readonly referenciaCentavos: string;
    readonly bebidas: number;
  };
  readonly pico: { readonly bebidasPorHora: number; readonly hora: string | null };
  /**
   * La serie de la ráfaga, hora por hora. La forma del día, no sólo su máximo.
   *
   * OPCIONAL aquí y obligatorio en el servidor, y no es un descuido: esta interfaz es
   * lo que el CLIENTE puede dar por cierto, e `invocarComando<T>` no valida nada en
   * tiempo de ejecución —el tipo es una promesa, no una garantía—. Durante un
   * despliegue el servidor puede ser todavía el de ayer, y el de ayer no manda este
   * campo. En esta misma fase ese modo de fallo costó una pantalla en blanco: el mapa
   * de mesas llamando `localeCompare` sobre un número que el puente servía entero.
   */
  readonly ritmo?: readonly { readonly hora: string; readonly bebidas: number }[];
  readonly entrega: { readonly segundos: number | null; readonly comandas: number };
  readonly seAcaba: {
    readonly insumo: string | null;
    readonly dias: number | null;
    readonly existencia: string;
    readonly unidad: string | null;
  };
  readonly cajon: { readonly efectivoCentavos: string; readonly cambioCentavos: string };
  readonly costoPorBebida: { readonly centavos: string; readonly bebidas: number };
  readonly tarjeta: { readonly centavos: string; readonly deLaVentaBp: number };
  readonly utilidad: { readonly centavos: string; readonly margenBp: number };
  readonly mezcla: readonly { readonly canal: string; readonly centavos: string }[];
  readonly porUtilidad: readonly BebidaDelDia[];
  readonly grano: { readonly dias: number | null; readonly optimos: number | null };
  readonly merma: readonly MermaPorMotivo[];
  readonly sellos: {
    readonly otorgadosHoy: number;
    readonly vivos: number;
    readonly costoSiSeCanjeanCentavos: string;
  };
}

export interface TableroProps {
  readonly datosIniciales?: TableroDeCafeteria;
}

/**
 * El canal, como se dice en la barra, y con su icono: el color nunca es el único
 * portador (§4.6), y en la mezcla «para llevar» se reconoce antes por la bolsa.
 */
const CANALES: Readonly<Record<string, { readonly etiqueta: string; readonly Icono: LucideIcon }>> =
  {
    aqui: { etiqueta: 'Aquí', Icono: Armchair },
    llevar: { etiqueta: 'Para llevar', Icono: ShoppingBag },
    plataforma: { etiqueta: 'Plataforma', Icono: Smartphone },
    domicilio: { etiqueta: 'A domicilio', Icono: Bike },
  };

interface CanalDeLaMezcla {
  readonly canal: string;
  readonly centavos: number;
  /** De 0 a 100: la parte del día que cobró este canal. */
  readonly parte: number;
}

function comoFecha(fecha: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${fecha}T12:00:00`));
}

/** «2:35» se lee mejor que «155 s» cuando se habla de una fila. */
function comoReloj(segundos: number): string {
  const minutos = Math.floor(segundos / 60);
  return `${String(minutos)}:${String(segundos % 60).padStart(2, '0')}`;
}

function dias(cuantos: number): string {
  return cuantos === 1 ? 'día' : 'días';
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.error.mensaje;
  return 'No se pudo cargar el tablero.';
}

/** La mezcla con su parte ya calculada: la barra y el porcentaje salen del mismo número. */
function mezclaConPartes(mezcla: TableroDeCafeteria['mezcla']): readonly CanalDeLaMezcla[] {
  const total = mezcla.reduce((suma, m) => suma + Number(m.centavos), 0);
  return mezcla.map((m) => ({
    canal: m.canal,
    centavos: Number(m.centavos),
    parte: total === 0 ? 0 : (Number(m.centavos) / total) * 100,
  }));
}

/**
 * La ráfaga contra el mismo día de la semana pasada. La flecha y el signo dicen lo
 * mismo que el color, para quien no lo distingue.
 */
function Comparacion({ hoy, referencia }: { readonly hoy: string; readonly referencia: string }) {
  const base = Number(referencia);
  if (base <= 0) return <span>sin ráfaga ese día la semana pasada</span>;
  const cambio = Math.round(((Number(hoy) - base) / base) * 100);
  const Flecha = cambio > 0 ? TrendingUp : cambio < 0 ? TrendingDown : MoveRight;
  const tono = cambio > 0 ? 'text-exito' : cambio < 0 ? 'text-peligro' : 'text-texto';
  return (
    <span>
      <span
        className={`inline-flex items-center gap-(--espacio-1) font-numeros text-base font-semibold tabular-nums ${tono}`}
      >
        <Flecha aria-hidden="true" className="size-4" />
        {cambio > 0 ? '+' : cambio < 0 ? '−' : ''}
        {Math.abs(cambio)} %
      </span>{' '}
      contra el mismo día de la semana pasada
    </span>
  );
}

/** Una tarjeta del tablero: su rótulo arriba y su dato. `alerta` la tiñe y la nota lo dice. */
function Indicador({
  id,
  titulo,
  alerta = false,
  className = '',
  children,
}: {
  readonly id: string;
  readonly titulo: ReactNode;
  readonly alerta?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <Superficie
      como="section"
      aria-labelledby={id}
      className={`flex min-w-0 flex-col gap-(--espacio-2) ${alerta ? 'border-peligro' : ''} ${className}`}
    >
      <h2 id={id} className={ROTULO}>
        {titulo}
      </h2>
      {children}
    </Superficie>
  );
}

/** La línea de debajo de la cifra. Cuando aprieta, lleva el triángulo y la palabra. */
function Nota({
  alerta = false,
  children,
}: {
  readonly alerta?: boolean;
  readonly children: ReactNode;
}) {
  if (!alerta) return <p className={NOTA}>{children}</p>;
  return (
    <p className="flex items-start gap-(--espacio-1) text-sm font-semibold text-peligro">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * El saludo y las dos salidas. Va en los tres estados: aunque el tablero no cargue,
 * cobrar y la barra siguen a un toque. Las acciones son el hermano siguiente del
 * bloque del `h1`, que es como las encuentra `accionesDelTablero`.
 */
function Encabezado({ fecha }: { readonly fecha: ReactNode }) {
  const voc = useVocabulario();
  return (
    <header className="flex flex-wrap items-end justify-between gap-(--espacio-2)">
      <div className="flex flex-col gap-(--espacio-1)">
        <h1 className="text-2xl font-bold">Buen día</h1>
        {fecha}
      </div>
      <div className="flex gap-(--espacio-2)">
        <Button asChild size="sm">
          <a href="/cafeteria/cobrar">Ir a cobrar</a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="/cafeteria/barra">Ver {voc.enFrase('preparacion')}</a>
        </Button>
      </div>
    </header>
  );
}

/** Cargando: la forma de las tres filas, para que al llegar los números nada salte. */
function TableroCargando() {
  return (
    <main className={MARCO}>
      <Encabezado fecha={<Esqueleto className="h-4 w-40" />} />
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando el tablero"
        className="flex flex-col gap-(--espacio-4)"
      >
        <div className={FILA_DE_LAS_DIEZ}>
          {Array.from({ length: 4 }, (_, indice) => (
            <Esqueleto key={indice} className="h-36 w-full rounded-lg" />
          ))}
        </div>
        <div className={FILA_DEL_DINERO}>
          {Array.from({ length: 4 }, (_, indice) => (
            <Esqueleto key={indice} className="h-28 w-full rounded-lg" />
          ))}
          <Esqueleto className="h-20 w-full rounded-lg md:col-span-2 xl:col-span-4" />
        </div>
        <div className={BLOQUES}>
          <Esqueleto className="h-48 w-full rounded-lg" />
          <Esqueleto className="h-48 w-full rounded-lg xl:row-span-2 xl:h-full" />
          <Esqueleto className="h-28 w-full rounded-lg" />
          <Esqueleto className="h-48 w-full rounded-lg" />
          <Esqueleto className="h-28 w-full rounded-lg" />
        </div>
      </div>
    </main>
  );
}

export function Tablero({ datosIniciales }: TableroProps) {
  const voc = useVocabulario();
  const [datos, setDatos] = useState<TableroDeCafeteria | null>(datosIniciales ?? null);
  const [error, setError] = useState<string | null>(null);
  // Cada intento de lectura es un número: «Volver a intentar» lo sube y el efecto
  // lee otra vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (datosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;

    invocarComando<TableroDeCafeteria>(RUTA, {}, { signal: control.signal })
      .then((salida) => {
        if (sigueMontada()) setDatos(salida);
      })
      .catch((fallo: unknown) => {
        if (sigueMontada()) setError(mensajeDe(fallo));
      });

    return () => {
      control.abort();
    };
  }, [datosIniciales, intento]);

  function reintentar(): void {
    setError(null);
    setDatos(null);
    setIntento((previo) => previo + 1);
  }

  if (error !== null) {
    return (
      <main className={MARCO}>
        <Encabezado fecha={null} />
        <ErrorDePantalla
          titulo="No se pudo leer el tablero"
          queHacer="El tablero sólo lee: no se movió nada del turno. Revisa la conexión y vuelve a intentarlo."
          detalle={error}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </main>
    );
  }

  if (datos === null) return <TableroCargando />;

  const { rafaga, pico, ritmo, entrega, seAcaba, cajon, costoPorBebida, tarjeta, utilidad } = datos;
  const { porUtilidad, grano, merma, sellos } = datos;
  const mezcla = mezclaConPartes(datos.mezcla);
  const totalMezcla = mezcla.reduce((suma, m) => suma + m.centavos, 0);
  const totalMerma = merma.reduce((suma, m) => suma + Number(m.costoCentavos), 0);
  const vecesDeMerma = merma.reduce((suma, m) => suma + m.veces, 0);

  const picoAprieta = pico.bebidasPorHora >= BEBIDAS_POR_HORA_QUE_APRIETAN;
  const entregaAprieta = entrega.segundos !== null && entrega.segundos > SEGUNDOS_QUE_APRIETAN;
  const granoPasado = grano.dias !== null && grano.optimos !== null && grano.dias > grano.optimos;
  const utilidadNegativa = Number(utilidad.centavos) < 0;

  const columnasDeMezcla: readonly ColumnaDeTabla<CanalDeLaMezcla>[] = [
    {
      clave: 'canal',
      titulo: 'Canal',
      celda: (fila) => {
        const canal = CANALES[fila.canal];
        const Icono = canal?.Icono;
        return (
          <span className="flex items-center gap-(--espacio-2)">
            {Icono === undefined ? null : (
              <Icono aria-hidden="true" className="size-4 shrink-0 text-texto-sutil" />
            )}
            {canal?.etiqueta ?? fila.canal}
          </span>
        );
      },
    },
    {
      clave: 'parte',
      titulo: 'Parte del día',
      celda: (fila) => (
        <span className="flex items-center gap-(--espacio-2)">
          {/* La barra es la proporción, que es lo único que una gráfica hace mejor
              que una lista. El número de al lado dice lo mismo en texto. */}
          <span
            aria-hidden="true"
            className="block h-1.5 min-w-12 flex-1 rounded-full bg-fondo-sutil"
          >
            <span
              className="block h-full rounded-full bg-primario"
              style={{ width: `${String(Math.round(fila.parte))}%` }}
            />
          </span>
          <Cifra
            valor={Math.round(fila.parte)}
            unidad="%"
            tamano="sm"
            className="w-12 text-right"
          />
        </span>
      ),
    },
    {
      clave: 'importe',
      titulo: 'Cobrado',
      numerica: true,
      celda: (fila) => <Dinero centavos={fila.centavos} tamano="sm" />,
    },
  ];

  const columnasDeUtilidad: readonly ColumnaDeTabla<BebidaDelDia>[] = [
    {
      clave: 'producto',
      titulo: voc.titulo('linea_orden'),
      celda: (bebida) => <span className="line-clamp-1">{bebida.producto}</span>,
    },
    {
      clave: 'unidades',
      titulo: 'Vendidas',
      numerica: true,
      celda: (bebida) => <Cifra valor={bebida.unidades} tamano="sm" className="text-texto-sutil" />,
    },
    {
      clave: 'utilidad',
      titulo: 'Utilidad',
      numerica: true,
      celda: (bebida) => <Dinero centavos={Number(bebida.utilidadCentavos)} tamano="sm" />,
    },
  ];

  const columnasDeMerma: readonly ColumnaDeTabla<MermaPorMotivo>[] = [
    {
      clave: 'motivo',
      titulo: 'Motivo',
      celda: (fila) => <span className="line-clamp-1">{fila.motivo}</span>,
    },
    {
      clave: 'veces',
      titulo: 'Veces',
      numerica: true,
      celda: (fila) => <Cifra valor={fila.veces} tamano="sm" />,
    },
    {
      clave: 'costo',
      titulo: 'Costo',
      numerica: true,
      celda: (fila) => <Dinero centavos={Number(fila.costoCentavos)} tamano="sm" />,
    },
  ];

  return (
    <main className={MARCO}>
      <Encabezado fecha={<p className={NOTA}>{comoFecha(datos.fecha)}</p>} />

      {datos.turnoAbierto ? null : (
        <Aviso
          tono="atencion"
          titulo="Sin turno abierto"
          accion={
            <Button asChild size="sm" variant="outline">
              <a href="/cafeteria/turno">Abrir turno</a>
            </Button>
          }
        >
          Lo del turno está en cero porque todavía no empieza, no porque haya ido mal. Ábrelo en
          Turno y el tablero se llena solo.
        </Aviso>
      )}

      {/* ── FILA 1 · los cuatro de las 10:30 ────────────────────────────── */}
      <div className={FILA_DE_LAS_DIEZ}>
        <Indicador id="t-rafaga" titulo="Lo cobrado en la ráfaga">
          <Dinero centavos={Number(rafaga.hoyCentavos)} tamano="lg" className={CIFRA} />
          <p className="text-sm">
            <Comparacion hoy={rafaga.hoyCentavos} referencia={rafaga.referenciaCentavos} />
          </p>
          <p className={`mt-auto ${NOTA}`}>De 07:00 a 10:30</p>
        </Indicador>

        {/* 2 · EL PICO, y debajo LA FORMA DEL DÍA.
            El número dice cuánto; la gráfica dice cuándo y cuánto DURA, y son dos
            decisiones distintas: 45 bebidas en una hora suelta es un día raro, y 40,
            45 y 38 seguidas son tres horas en las que hace falta un tercero. Es la
            única gráfica de este tablero, y es la que define al giro: una cafetería
            ES su ráfaga de la mañana. */}
        <Indicador
          id="t-pico"
          titulo={`${voc.titulo('linea_orden', true)} por hora en el pico`}
          alerta={picoAprieta}
        >
          <Cifra valor={pico.bebidasPorHora} tamano="lg" className={CIFRA} />
          <Nota alerta={picoAprieta}>
            {pico.hora === null ? 'sin movimiento todavía' : `la hora de las ${pico.hora}`}
            {picoAprieta ? ' · con dos personas la fila se sale a la calle' : ''}
          </Nota>
          {/* `?? []` y no `ritmo.length` a secas: `invocarComando<T>` NO valida nada en
              tiempo de ejecución, así que el tipo es una promesa y no una garantía. En
              esta misma fase eso costó una pantalla en blanco —el mapa de mesas
              llamando `localeCompare` sobre un número— y el modo de fallo es idéntico:
              un servidor de una versión anterior devuelve el tablero sin este campo y
              lo que ve la dueña es la página de error del navegador, no un hueco. */}
          {(ritmo ?? []).length > 1 && (
            <GraficaDeBarras
              className="mt-auto"
              titulo={`${voc.titulo('linea_orden', true)} por hora, de la apertura al cierre`}
              ejes={(ritmo ?? []).map((punto) => punto.hora)}
              series={[{ etiqueta: 'Hoy', valores: (ritmo ?? []).map((punto) => punto.bebidas) }]}
              formato={(valor) => String(Math.round(valor))}
              alto={140}
            />
          )}
        </Indicador>

        <Indicador id="t-entrega" titulo="Del cobro a la entrega" alerta={entregaAprieta}>
          <p className={`font-numeros tabular-nums ${CIFRA}`}>
            {entrega.segundos === null ? '—' : comoReloj(entrega.segundos)}
          </p>
          <Nota alerta={entregaAprieta}>
            {entrega.comandas === 0
              ? 'todavía no se entrega nada hoy'
              : `${String(entrega.comandas)} entregas · bajar a 2:00 deja atender 50 % más`}
          </Nota>
        </Indicador>

        <Indicador id="t-acaba" titulo="Lo que se acaba primero">
          {seAcaba.dias === null ? (
            <p className={CIFRA}>—</p>
          ) : (
            <Cifra valor={seAcaba.dias} unidad={dias(seAcaba.dias)} tamano="lg" className={CIFRA} />
          )}
          <Nota>
            {seAcaba.insumo === null
              ? 'todavía no hay consumo que medir'
              : `${seAcaba.insumo} · quedan ${seAcaba.existencia} ${seAcaba.unidad ?? ''}`}
          </Nota>
        </Indicador>
      </div>

      {/* ── FILA 2 · los cinco del dinero ───────────────────────────────── */}
      <div className={FILA_DEL_DINERO}>
        <Indicador id="t-cajon" titulo="Efectivo en el cajón">
          <Dinero centavos={Number(cajon.efectivoCentavos)} tamano="lg" className={CIFRA_CHICA} />
          <Nota>El cajón está en {voc.enFrase('preparacion')}, a la vista de la calle.</Nota>
        </Indicador>

        <Indicador id="t-cambio" titulo="Cambio disponible">
          <Dinero centavos={Number(cajon.cambioCentavos)} tamano="lg" className={CIFRA_CHICA} />
          <Nota>
            En monedas y billetes chicos. Quedarse sin cambio a las 8:00 con quince personas en fila
            es perder la ráfaga entera.
          </Nota>
        </Indicador>

        <Indicador id="t-costo" titulo={`Costo por ${voc.singular('linea_orden')}`}>
          <Dinero centavos={Number(costoPorBebida.centavos)} tamano="lg" className={CIFRA_CHICA} />
          <Nota>
            {costoPorBebida.bebidas} en el turno · si sube, o el molino está mal calibrado o alguien
            sirve de más
          </Nota>
        </Indicador>

        <Indicador id="t-tarjeta" titulo="Tarjeta del turno">
          <Dinero centavos={Number(tarjeta.centavos)} tamano="lg" className={CIFRA_CHICA} />
          <Nota>
            <Cifra valor={tarjeta.deLaVentaBp / 100} decimales={1} unidad="%" tamano="sm" /> de lo
            cobrado
          </Nota>
        </Indicador>

        {/* La utilidad cierra la fila a lo ancho: es la respuesta a «¿ganamos esta
            mañana?», verde o roja, y la roja además entre paréntesis. */}
        <Superficie
          como="section"
          aria-labelledby="t-utilidad"
          className={`flex flex-col gap-(--espacio-2) md:col-span-2 md:flex-row md:items-center md:justify-between xl:col-span-4 ${utilidadNegativa ? 'border-peligro' : ''}`}
        >
          <div className="flex flex-col gap-(--espacio-1)">
            <h2 id="t-utilidad" className={ROTULO}>
              Utilidad del turno
            </h2>
            <Nota>
              <Cifra valor={utilidad.margenBp / 100} decimales={1} unidad="%" tamano="sm" /> de
              margen, con los gastos del turno ya restados
            </Nota>
          </div>
          <Dinero
            centavos={Number(utilidad.centavos)}
            tamano="lg"
            className={utilidadNegativa ? CIFRA : `${CIFRA} text-exito`}
          />
        </Superficie>
      </div>

      {/* ── BLOQUES DE ABAJO ────────────────────────────────────────────── */}
      <div className={BLOQUES}>
        <Indicador id="t-mezcla" titulo="Mezcla del día">
          <Tabla
            etiqueta="Mezcla del día por canal"
            columnas={columnasDeMezcla}
            filas={mezcla}
            claveDe={(fila) => fila.canal}
            pie={{ canal: 'Total', importe: <Dinero centavos={totalMezcla} tamano="sm" /> }}
            vacio={
              <Vacio
                icono={<Receipt />}
                titulo="Todavía no se cobra nada hoy."
                className="py-(--espacio-6)"
              />
            }
          />
        </Indicador>

        <Indicador
          id="t-utilidades"
          titulo={`${voc.titulo('linea_orden', true)} por utilidad`}
          className="xl:row-span-2"
        >
          <Tabla
            etiqueta={`${voc.titulo('linea_orden', true)} del día por utilidad`}
            columnas={columnasDeUtilidad}
            filas={porUtilidad}
            claveDe={(bebida) => bebida.producto}
            vacio={
              <Vacio
                icono={<CupSoda />}
                titulo="Todavía no se vende nada hoy."
                className="py-(--espacio-6)"
              />
            }
          />
          <p className="mt-auto text-xs text-texto-sutil">
            Por lo que DEJAN, no por unidades: el latte vende más y el americano deja más.
          </p>
        </Indicador>

        <Indicador id="t-grano" titulo="Frescura del grano abierto" alerta={granoPasado}>
          {grano.dias === null ? (
            <p className={CIFRA_CHICA}>—</p>
          ) : (
            <Cifra
              valor={grano.dias}
              unidad={dias(grano.dias)}
              tamano="lg"
              className={CIFRA_CHICA}
            />
          )}
          <Nota alerta={granoPasado}>
            {grano.dias === null
              ? 'no hay lote abierto declarado'
              : grano.optimos === null
                ? 'desde el tueste'
                : `desde el tueste · óptimo hasta ${String(grano.optimos)} ${dias(grano.optimos)}`}
          </Nota>
        </Indicador>

        <Indicador id="t-merma" titulo={<>Merma de {voc.singular('preparacion')} del turno</>}>
          <Tabla
            etiqueta={`Merma de ${voc.singular('preparacion')} por motivo`}
            columnas={columnasDeMerma}
            filas={merma}
            claveDe={(fila) => fila.motivo}
            pie={{
              motivo: 'Total',
              veces: <Cifra valor={vecesDeMerma} tamano="sm" />,
              costo: <Dinero centavos={totalMerma} tamano="sm" />,
            }}
            vacio={
              <Vacio
                icono={<Check />}
                titulo="Sin merma declarada en este turno."
                className="py-(--espacio-6)"
              />
            }
          />
        </Indicador>

        <Indicador id="t-sellos" titulo="Sellos">
          <p className="flex flex-wrap items-baseline gap-x-(--espacio-3) gap-y-(--espacio-1)">
            <span>
              <Cifra valor={sellos.otorgadosHoy} tamano="lg" className={CIFRA_CHICA} />{' '}
              <span className={NOTA}>otorgados hoy</span>
            </span>
            <span>
              <Cifra valor={sellos.vivos} tamano="lg" className={CIFRA_CHICA} />{' '}
              <span className={NOTA}>vivos</span>
            </span>
          </p>
          <Nota>
            Costarían <Dinero centavos={Number(sellos.costoSiSeCanjeanCentavos)} tamano="sm" /> si
            se canjearan todos.
          </Nota>
        </Indicador>
      </div>
    </main>
  );
}
