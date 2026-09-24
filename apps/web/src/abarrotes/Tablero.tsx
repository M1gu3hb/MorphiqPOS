'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  GraficaDeBarras,
  Superficie,
  Tabla,
  Vacio,
  dineroEnTexto,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import {
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  Check,
  ClipboardList,
  Lock,
  LockOpen,
  MoveRight,
  PackageCheck,
  PackagePlus,
  ScanBarcode,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · abarrotes · EL TABLERO DE LA TIENDITA (F-056)
 *
 * ── Por qué esta pantalla existe, y por qué no es la que había ─────────────
 * El tablero que servía `/` es el del RESTAURANTE: nueve indicadores de una cena
 * —ventas, costo, utilidad, ticket promedio, la dona de métodos de pago, propinas—.
 * `abarrotes/04-INTERFAZ.md` §4.4 pide otro, con nombres y apellidos: **siete
 * indicadores**, cada uno con la decisión que dispara, y dos de los del restaurante
 * están PROHIBIDOS aquí:
 *
 *   · el **ticket promedio**, porque en un surtido de $20 a $80 se mueve por azar y
 *     no dispara nada;
 *   · la **dona de métodos de pago**, porque en 390 px una lista ordenada contesta
 *     mejor y ocupa menos.
 *
 * ── Para 390 px, y en ese orden ────────────────────────────────────────────
 * Lo lee el dueño en el teléfono, dos veces al día: a las 6:50 antes de abrir y a
 * las 22:45 después del corte. El orden de las tarjetas NO cambia con la hora —una
 * pantalla que se recompone destruye la memoria muscular, que es lo que permite
 * leerla en cuatro segundos— y lo que cambia es lo que cada tarjeta dice.
 *
 * ── El layout, dispositivo por dispositivo (§4.4 · Layout) ─────────────────
 * Teléfono, el principal: una columna, la venta y el margen en UNA tarjeta doble
 * arriba, y del 3 al 7 apilados. Tableta: dos columnas, con «Qué pedir» a todo lo
 * ancho arriba. PC: tres columnas —1, 2 y 7 a la izquierda; 3, el más grande, en
 * medio; 4, 5 y 6 a la derecha—. El orden del DOM es el del teléfono, así que el
 * lector de pantalla lee en el orden en que el dueño lo lee en la cama.
 *
 * ── Qué hace cada número, en una línea ────────────────────────────────────
 * 1 · Venta de hoy contra el MISMO DÍA de la semana pasada · ¿voy bien o voy mal?
 * 2 · Margen de hoy y del mes · ¿vendí mucho o gané mucho?
 * 3 · Qué pedir, por proveedor, el de mañana arriba · ¿qué le pido al que viene?
 * 4 · Diferencia de conteo del mes contra el 1.5–2.5 % de referencia · ¿me roban?
 * 5 · Fiado: total, vencido, otorgado hoy y los tres más viejos · ¿a quién le hablo?
 * 6 · Se vence esta semana, a costo · ¿qué remato el fin de semana?
 * 7 · Caja: quién la tiene, cuánto lleva y el último cierre · ¿cerró bien ayer?
 */

const RUTA = '/api/reportes/tablero-tienda';

/** La referencia del giro para la diferencia de conteo, en puntos base. */
const CONTEO_ACEPTABLE_BP = 250;

const ROTULO = 'text-xs font-semibold uppercase tracking-wide text-texto-sutil';
const NOTA = 'text-sm text-texto-sutil';

/**
 * Dónde va cada indicador. Una rejilla y no tres columnas sueltas: así el orden
 * del DOM sigue siendo el del teléfono y la PC sólo RECOLOCA.
 */
const REJILLA =
  'grid gap-(--espacio-3) md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start';
const EN = {
  ventaYMargen: 'xl:col-start-1 xl:row-start-1',
  pedir: 'md:col-span-2 md:row-start-1 xl:col-span-1 xl:col-start-2 xl:row-span-3',
  conteo: 'xl:col-start-3 xl:row-start-1',
  fiado: 'xl:col-start-3 xl:row-start-2',
  vence: 'xl:col-start-3 xl:row-start-3',
  caja: 'xl:col-start-1 xl:row-start-2',
} as const;

interface PorPedir {
  readonly proveedor: string;
  readonly pasaManana: boolean;
  readonly claves: number;
  readonly importeCentavos: string;
}

interface DeudorViejo {
  readonly cliente: string;
  readonly saldoCentavos: string;
  readonly dias: number;
}

interface PorVencer {
  readonly producto: string;
  readonly dias: number;
  readonly valorCentavos: string;
}

export interface TableroDeTienda {
  readonly fecha: string;
  readonly venta: {
    readonly hoyCentavos: string;
    readonly referenciaCentavos: string;
    readonly tickets: number;
  };
  readonly margen: {
    readonly hoyCentavos: string;
    readonly hoyBp: number;
    readonly mesCentavos: string;
    readonly mesBp: number;
  };
  readonly porPedir: readonly PorPedir[];
  readonly conteo: {
    readonly hayConteos: boolean;
    readonly tomas: number;
    readonly diferenciaCentavos: string;
    readonly sobreVentaBp: number;
  };
  readonly fiado: {
    readonly totalCentavos: string;
    readonly vencidoCentavos: string;
    readonly otorgadoHoyCentavos: string;
    readonly masViejos: readonly DeudorViejo[];
  };
  readonly porVencer: readonly PorVencer[];
  readonly caja: {
    readonly abierta: boolean;
    readonly quien: string | null;
    readonly efectivoEsperadoCentavos: string;
    readonly diferenciaUltimoCierreCentavos: string | null;
  };
}

export interface TableroProps {
  /** Para la prueba y para el prerenderizado: lo mismo que devuelve la ruta. */
  readonly datosIniciales?: TableroDeTienda;
}

/**
 * La fecha del negocio a mediodía y no a medianoche: `new Date('2026-09-20')` es
 * medianoche UTC, que en México es el día ANTERIOR a las 18:00, y el tablero
 * saldría fechado ayer.
 */
function aMediodia(fecha: string): Date {
  return new Date(`${fecha}T12:00:00`);
}

/** La fecha del negocio, como se lee: «domingo, 20 de septiembre». */
function comoFecha(fecha: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(aMediodia(fecha));
}

/** El día de la semana, para decir «contra el martes pasado» y no una fórmula. */
function diaDeLaSemana(fecha: string): string {
  return new Intl.DateTimeFormat('es-MX', { weekday: 'long' }).format(aMediodia(fecha));
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.error.mensaje;
  return 'No se pudo cargar el tablero.';
}

/** Un porcentaje guardado en puntos base, con un decimal y cifras tabulares. */
function Porcentaje({ bp }: { readonly bp: number }) {
  return <Cifra valor={bp / 100} decimales={1} unidad="%" tamano="sm" />;
}

/**
 * La comparación, en la única forma que sirve: con su signo, su flecha y su palabra.
 *
 * «$6,400» no significa nada; «$6,400, −18 % contra el martes pasado» sí. Cuando la
 * semana pasada no hubo venta ese día se dice eso y no se inventa un porcentaje
 * sobre cero. El verde y el rojo nunca van solos: los acompañan el signo y la flecha.
 */
function Comparacion({
  hoy,
  referencia,
  dia,
}: {
  readonly hoy: string;
  readonly referencia: string;
  readonly dia: string;
}) {
  const base = Number(referencia);
  if (base <= 0) return <span className="text-texto-sutil">sin venta el {dia} pasado</span>;
  const cambio = Math.round(((Number(hoy) - base) / base) * 100);
  const sube = cambio > 0;
  const baja = cambio < 0;
  const Flecha = sube ? TrendingUp : baja ? TrendingDown : MoveRight;
  const tono = sube ? 'text-exito' : baja ? 'text-peligro' : 'text-texto-sutil';
  return (
    <span>
      <span
        className={`inline-flex items-center gap-(--espacio-1) font-numeros font-semibold tabular-nums ${tono}`}
      >
        <Flecha aria-hidden="true" className="size-4" />
        {sube ? '+' : baja ? '−' : ''}
        {Math.abs(cambio)} %
      </span>{' '}
      <span className="text-texto-sutil">contra el {dia} pasado</span>
    </span>
  );
}

/** Una tarjeta del tablero: su rótulo arriba, su dato, y su salida al pie. */
function Indicador({
  id,
  titulo,
  children,
  salida,
  className = '',
}: {
  readonly id: string;
  readonly titulo: ReactNode;
  readonly children: ReactNode;
  /** A dónde se va a actuar sobre lo que se acaba de leer. */
  readonly salida?: ReactNode;
  readonly className?: string;
}) {
  return (
    <Superficie
      como="section"
      relleno={3}
      aria-labelledby={id}
      className={`flex min-w-0 flex-col gap-(--espacio-2) md:p-(--espacio-4) ${className}`}
    >
      <h2 id={id} className={ROTULO}>
        {titulo}
      </h2>
      {children}
      {salida === undefined ? null : <div className="mt-auto pt-(--espacio-1)">{salida}</div>}
    </Superficie>
  );
}

/** El enlace al pie de una tarjeta: lleva a otra pantalla, no dispara nada. */
function Salida({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <Button asChild size="sm" variant="secondary">
      <a href={href}>
        {children}
        <ArrowRight aria-hidden="true" />
      </a>
    </Button>
  );
}

/**
 * El encabezado de los tres estados. La MISMA forma que el `PageHeader` heredado
 * —el bloque del título y, de hermano, el de las acciones— porque es la relación
 * por la que la prueba encuentra las acciones de un tablero sin agarrarse a una
 * clase. Las acciones no dependen de los datos: están aunque el tablero no cargue.
 */
function Encabezado({ fecha }: { readonly fecha: string | null }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-(--espacio-2)">
      <div>
        <h1 className="text-2xl font-bold">Buen día</h1>
        {fecha === null ? null : (
          <p className={`${NOTA} first-letter:uppercase`}>{comoFecha(fecha)}</p>
        )}
      </div>
      <div className="flex gap-(--espacio-2)">
        <Button asChild size="sm">
          <a href="/abarrotes/cobrar">
            <ScanBarcode aria-hidden="true" />
            Ir a Caja
          </a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="/abarrotes/entradas">
            <PackagePlus aria-hidden="true" />
            Registrar compra
          </a>
        </Button>
      </div>
    </header>
  );
}

const COLUMNAS_DE_PEDIDO: readonly ColumnaDeTabla<PorPedir>[] = [
  {
    clave: 'proveedor',
    titulo: 'Proveedor',
    celda: (fila) => (
      <span className="flex flex-col items-start gap-(--espacio-1)">
        <span className="font-medium">{fila.proveedor}</span>
        {fila.pasaManana ? (
          <Badge>
            <CalendarClock aria-hidden="true" />
            pasa mañana
          </Badge>
        ) : null}
      </span>
    ),
  },
  {
    clave: 'claves',
    titulo: 'Claves',
    numerica: true,
    celda: (fila) => <Cifra valor={fila.claves} unidad="claves" tamano="sm" />,
  },
  {
    clave: 'importe',
    titulo: 'Importe',
    numerica: true,
    celda: (fila) => <Dinero centavos={Number(fila.importeCentavos)} className="font-medium" />,
  },
];

export function Tablero({ datosIniciales }: TableroProps) {
  const voc = useVocabulario();
  const [datos, setDatos] = useState<TableroDeTienda | null>(datosIniciales ?? null);
  const [error, setError] = useState<string | null>(null);
  // Cada lectura es un número: «Volver a intentar» lo sube y el efecto lee otra vez.
  // El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (datosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;

    invocarComando<TableroDeTienda>(RUTA, {}, { signal: control.signal })
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

  if (error !== null) {
    return (
      <main className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
        <Encabezado fecha={null} />
        <ErrorDePantalla
          titulo="No se pudo leer el tablero"
          queHacer="Revisa la conexión y vuelve a intentarlo. El tablero sólo lee: en la tienda no cambió nada."
          detalle={error}
          reintentar={
            <Button
              onClick={() => {
                setError(null);
                setDatos(null);
                setIntento((previo) => previo + 1);
              }}
            >
              Volver a intentar
            </Button>
          }
        />
      </main>
    );
  }

  if (datos === null) {
    return (
      <main className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
        <Encabezado fecha={null} />
        {/* La forma de las siete tarjetas, cada una en su sitio: al llegar los
            datos nada salta, y el ojo ya sabe dónde va a mirar. */}
        <div role="status" aria-busy="true" aria-label="Cargando el tablero" className={REJILLA}>
          <Esqueleto className={`h-36 rounded-lg ${EN.ventaYMargen}`} />
          <Esqueleto className={`h-64 rounded-lg ${EN.pedir}`} />
          <Esqueleto className={`h-32 rounded-lg ${EN.conteo}`} />
          <Esqueleto className={`h-48 rounded-lg ${EN.fiado}`} />
          <Esqueleto className={`h-40 rounded-lg ${EN.vence}`} />
          <Esqueleto className={`h-28 rounded-lg ${EN.caja}`} />
        </div>
      </main>
    );
  }

  const { venta, margen, porPedir, conteo, fiado, porVencer, caja } = datos;
  const dia = diaDeLaSemana(datos.fecha);
  /**
   * LA SUMA DE LO QUE SE VE, y no «Total»: el servidor corta la lista en los ocho
   * proveedores de más importe (`leerPorPedir`, `limit 8`), así que con más de ocho
   * bajo mínimo esta suma deja fuera a los demás. Un pedido planeado con un «Total»
   * más bajo que el real es dinero que falta el día que pasa el proveedor. Con una
   * sola fila no hay nada que sumar.
   */
  const sumaDeLoVisible = porPedir.reduce((suma, fila) => suma + Number(fila.importeCentavos), 0);
  const pieDelPedido =
    porPedir.length < 2
      ? undefined
      : {
          proveedor: `Suma de estos ${String(porPedir.length)}`,
          importe: <Dinero centavos={sumaDeLoVisible} className="font-semibold" />,
        };
  const conteoExcede = Math.abs(conteo.sobreVentaBp) > CONTEO_ACEPTABLE_BP;
  const faltaMaterial = Number(conteo.diferenciaCentavos) < 0;
  const diferenciaDeCierre =
    caja.diferenciaUltimoCierreCentavos === null
      ? null
      : Number(caja.diferenciaUltimoCierreCentavos);

  const columnasDeFiado: readonly ColumnaDeTabla<DeudorViejo>[] = [
    {
      clave: 'cliente',
      titulo: voc.titulo('cliente'),
      celda: (quien) => <span className="line-clamp-1">{quien.cliente}</span>,
    },
    {
      clave: 'dias',
      titulo: 'Hace',
      numerica: true,
      celda: (quien) => <Cifra valor={quien.dias} unidad="d" tamano="sm" />,
    },
    {
      clave: 'saldo',
      titulo: 'Debe',
      numerica: true,
      celda: (quien) => <Dinero centavos={Number(quien.saldoCentavos)} tamano="sm" />,
    },
  ];

  const columnasDeVencimiento: readonly ColumnaDeTabla<PorVencer>[] = [
    {
      clave: 'producto',
      titulo: voc.titulo('producto'),
      celda: (fila) => <span className="line-clamp-1">{fila.producto}</span>,
    },
    {
      clave: 'cuando',
      titulo: 'Cuándo',
      // La palabra dice por qué la fila va en rojo: el tono nunca va solo.
      celda: (fila) =>
        fila.dias <= 0 ? (
          <span className="font-semibold text-peligro">vencido</span>
        ) : (
          <span className="whitespace-nowrap">
            en <Cifra valor={fila.dias} unidad="d" tamano="sm" />
          </span>
        ),
    },
    {
      clave: 'valor',
      titulo: 'A costo',
      numerica: true,
      celda: (fila) => <Dinero centavos={Number(fila.valorCentavos)} tamano="sm" />,
    },
  ];

  return (
    <main className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
      <Encabezado fecha={datos.fecha} />

      <div className={REJILLA}>
        {/* 1 y 2 · LA TARJETA DOBLE. La venta y el margen, lado a lado en el
            teléfono porque se leen juntos: «¿vendí mucho o gané mucho?» es UNA
            pregunta con dos números. En la columna angosta de la PC, uno sobre otro. */}
        <Superficie
          relleno={0}
          className={`grid min-w-0 grid-cols-2 divide-x divide-borde xl:grid-cols-1 xl:divide-x-0 xl:divide-y ${EN.ventaYMargen}`}
        >
          <section
            aria-labelledby="t-venta"
            className="flex min-w-0 flex-col gap-(--espacio-1) p-(--espacio-3) md:p-(--espacio-4)"
          >
            {/* El sustantivo del giro: una tiendita lee «Venta» y el día que la dueña
                llame «nota» a lo que cobra, este rótulo la sigue. */}
            <h2 id="t-venta" className={ROTULO}>
              {voc.titulo('orden')} de hoy
            </h2>
            <Dinero
              centavos={Number(venta.hoyCentavos)}
              tamano="lg"
              className="text-2xl font-semibold sm:text-3xl"
            />
            <p className="text-sm">
              <Comparacion
                hoy={venta.hoyCentavos}
                referencia={venta.referenciaCentavos}
                dia={dia}
              />
            </p>
            <p className={NOTA}>{voc.conNumero('orden', venta.tickets)}</p>
          </section>

          {/* 2 · EL MARGEN, que es otra cosa que la venta. */}
          <section
            aria-labelledby="t-margen"
            className="flex min-w-0 flex-col gap-(--espacio-1) p-(--espacio-3) md:p-(--espacio-4)"
          >
            <h2 id="t-margen" className={ROTULO}>
              Margen de hoy
            </h2>
            <Dinero
              centavos={Number(margen.hoyCentavos)}
              tamano="lg"
              className="text-2xl font-semibold sm:text-3xl"
            />
            <p className="text-sm font-semibold">
              <Porcentaje bp={margen.hoyBp} />
            </p>
            <p className={NOTA}>
              En el mes <Dinero centavos={Number(margen.mesCentavos)} tamano="sm" /> ·{' '}
              <Porcentaje bp={margen.mesBp} />
            </p>
          </section>
        </Superficie>

        {/* 3 · QUÉ PEDIR. No «63 claves bajo mínimo»: a quién y cuánto. Es el más
            grande en la PC y va a todo lo ancho en la tableta. */}
        <Indicador
          id="t-pedir"
          titulo="Qué pedir"
          className={EN.pedir}
          salida={<Salida href="/abarrotes/entradas">Ver el pedido renglón por renglón</Salida>}
        >
          <Tabla
            etiqueta="Qué pedir, por proveedor"
            columnas={COLUMNAS_DE_PEDIDO}
            filas={porPedir}
            claveDe={(fila) => fila.proveedor}
            alto="max-h-none"
            className="border-0"
            pie={pieDelPedido}
            vacio={
              <Vacio
                icono={<PackageCheck />}
                titulo="Nada bajo mínimo: el surtido está completo."
                className="py-(--espacio-6)"
              />
            }
          />
        </Indicador>

        {/* 4 · EL CONTEO. Sin conteos, lo dice: un cero aquí sería mentira. */}
        <Indicador id="t-conteo" titulo="Diferencia de conteo del mes" className={EN.conteo}>
          {!conteo.hayConteos ? (
            <Vacio
              icono={<ClipboardList />}
              titulo="Sin conteos este mes"
              explicacion="El conteo cíclico no se está haciendo: un cero aquí sería mentira."
              accion={<Salida href="/abarrotes/conteo">Contar una zona</Salida>}
              className="px-0 py-(--espacio-3)"
            />
          ) : (
            <>
              <Dinero
                centavos={Number(conteo.diferenciaCentavos)}
                tamano="lg"
                className="text-2xl font-semibold"
              />
              <p className={conteoExcede ? 'text-sm font-semibold text-peligro' : NOTA}>
                {conteoExcede ? (
                  <TriangleAlert
                    aria-hidden="true"
                    className="mr-(--espacio-1) inline size-4 align-text-bottom"
                  />
                ) : null}
                <Porcentaje bp={Math.abs(conteo.sobreVentaBp)} /> de la venta del mes
                {conteoExcede ? ', arriba de' : ' ·'} la referencia del giro, 1.5 a 2.5 %
              </p>
              <p className={NOTA}>
                {conteo.tomas} zona(s) contada(s)
                {faltaMaterial ? ' · falta material' : ''}
              </p>
            </>
          )}
        </Indicador>

        {/* 5 · EL FIADO. El «otorgado hoy» es el que corrige la conducta esta noche. */}
        <Indicador
          id="t-fiado"
          titulo="Lo que me deben"
          className={EN.fiado}
          salida={<Salida href="/abarrotes/fiado">Ver la libreta</Salida>}
        >
          <Dinero
            centavos={Number(fiado.totalCentavos)}
            tamano="lg"
            className="text-2xl font-semibold"
          />
          <p className={NOTA}>
            Vencido <Dinero centavos={Number(fiado.vencidoCentavos)} tamano="sm" /> · otorgado hoy{' '}
            <Dinero
              centavos={Number(fiado.otorgadoHoyCentavos)}
              tamano="sm"
              className="font-semibold text-texto"
            />
          </p>
          {fiado.masViejos.length > 0 ? (
            <Tabla
              etiqueta="Los que más tiempo llevan debiendo"
              columnas={columnasDeFiado}
              filas={fiado.masViejos}
              claveDe={(quien) => `${quien.cliente}-${String(quien.dias)}`}
              alto="max-h-none"
              className="border-0"
            />
          ) : null}
        </Indicador>

        {/* 6 · LO QUE SE VENCE. Merma prevenible, en las líneas de menor margen. */}
        <Indicador id="t-vence" titulo="Se vence esta semana" className={EN.vence}>
          {/* LA ÚNICA GRÁFICA DE ESTE TABLERO, y va aquí y no en la venta.
              §4.4 prohíbe la dona de métodos de pago —«en 390 px una lista ordenada
              contesta mejor y ocupa menos»— y el mismo criterio decide dónde SÍ
              cabe una: donde la pregunta es «¿cuál primero?» y las magnitudes son
              comparables. La tabla de abajo dice qué y cuánto; lo que no dice es si
              el remate del sábado empieza por uno solo que se come la mitad del
              riesgo o hay que bajarle el precio a los cinco. */}
          {porVencer.length > 1 ? (
            <GraficaDeBarras
              titulo="Lo que se vence esta semana, a costo"
              ejes={porVencer.map((fila) => fila.producto)}
              series={[
                {
                  etiqueta: 'A costo',
                  valores: porVencer.map((fila) => Number(fila.valorCentavos)),
                },
              ]}
              formato={(valor) => dineroEnTexto(valor)}
              alto={140}
            />
          ) : null}
          <Tabla
            etiqueta="Lo que se vence esta semana"
            columnas={columnasDeVencimiento}
            filas={porVencer}
            claveDe={(fila) => `${fila.producto}-${String(fila.dias)}`}
            alto="max-h-none"
            className="border-0"
            tonoDeFila={(fila) => (fila.dias <= 0 ? 'peligro' : undefined)}
            vacio={
              <Vacio
                icono={<CalendarCheck />}
                titulo="Nada se vence esta semana."
                className="py-(--espacio-4)"
              />
            }
          />
        </Indicador>

        {/* 7 · LA CAJA. Dos preguntas de control con una mirada. */}
        <Indicador id="t-caja" titulo="Caja" className={EN.caja}>
          {caja.abierta ? (
            <>
              <p className="flex items-center gap-(--espacio-2) font-semibold">
                <LockOpen aria-hidden="true" className="size-4 text-exito" />
                Abierta
              </p>
              <p className="text-sm">
                <Dinero
                  centavos={Number(caja.efectivoEsperadoCentavos)}
                  tamano="lg"
                  className="font-semibold"
                />{' '}
                en el cajón
              </p>
              <p className={NOTA}>La tiene {caja.quien ?? 'sin firma'}</p>
            </>
          ) : (
            <p className="flex items-center gap-(--espacio-2) font-semibold">
              <Lock aria-hidden="true" className="size-4 text-texto-sutil" />
              Cerrada
            </p>
          )}
          <p className={`flex items-center gap-(--espacio-1) ${NOTA}`}>
            {diferenciaDeCierre === null ? (
              'Todavía no hay ningún corte.'
            ) : (
              <>
                {diferenciaDeCierre === 0 ? (
                  <Check aria-hidden="true" className="size-4 shrink-0 text-exito" />
                ) : (
                  <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-advertencia" />
                )}
                <span>
                  Último cierre: <Dinero centavos={diferenciaDeCierre} tamano="sm" /> de diferencia.
                </span>
              </>
            )}
          </p>
        </Indicador>
      </div>
    </main>
  );
}
