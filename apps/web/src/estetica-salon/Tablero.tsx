'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Progress } from '@morphiqpos/ui/primitivas/progress';
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
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  HandCoins,
  MoveRight,
  Phone,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · estetica-salon · reportes
 *
 * EL TABLERO DEL SALÓN, que vive dentro de reportes (F-056 · §4.4)
 *
 * ── Por qué no es la pantalla de inicio, y en los otros cuatro modelos sí ──
 * Porque su carpeta le dedica una sección a defenderlo: «a las 9:45 de la mañana,
 * casi todos los indicadores de un dashboard son adornos». Lo único que a esa hora
 * todavía cambia el resultado de hoy es a quién llamar para llenar el hueco de las
 * once, y eso está en la agenda. La agenda se abre cuarenta a ochenta veces al día;
 * esto, dos: a las 9:45 después de leerla, y a las 21:00 con el corte.
 *
 * ── Y por qué lo primero es MAÑANA ────────────────────────────────────────
 * Porque es el único número de la pantalla sobre el que todavía se puede actuar.
 * Los otros siete informan; éste se opera, y por eso ocupa el ancho completo y no
 * es un número solo: trae los huecos con su hora, de la lista de espera quién los
 * quería, y cuántas siguen sin confirmar. «Un indicador que sólo dijera 68 % sería
 * un adorno; lo que lo hace indicador es lo que tiene debajo.»
 *
 * ── Cómo se ve, y por qué ─────────────────────────────────────────────────
 * La tarjeta de mañana es la ÚNICA levantada (`nivel 2`) y la única con la cifra
 * en `display`: nada más en la pantalla compite con ella. Debajo, en PC, dos
 * columnas de tarjetas en el orden de su §4.4.2; en tableta y teléfono una sola,
 * que es el caso real —la dueña lo abre el lunes, que está cerrado—. La propina es
 * una franja al pie y no una tarjeta: su §4.4.2 la llama «línea al pie».
 *
 * ── Lo que NO está aquí, y es una decisión ────────────────────────────────
 * El ranking del equipo por lo que vende cada quien. Su §4.4.3: «suena útil y es
 * tóxico» —con carteras y esquemas distintos compara peras con manzanas y produce
 * resentimiento—. Lo que sí va es la OCUPACIÓN, que mide el uso del recurso y no a
 * la persona. Por eso ninguna tabla de aquí se ordena por dinero. Tampoco el ticket
 * promedio del salón, que mezcla un corte de $250 con un balayage de $3,200.
 */

const RUTA = '/api/reportes/tablero-estetica';

/** La referencia del giro para el no-show, que es lo que hace legible el número. */
const NO_SHOW_QUE_APRIETA_BP = 800;

/** Debajo de esto, quien atiende está cobrando y no recomendando (§4.4.2 · 6). */
const PRODUCTO_QUE_APRIETA_BP = 1000;

/** Una propina que lleva más de una semana en el cajón ya es desorden. */
const DIAS_DE_PROPINA_QUE_APRIETAN = 7;

const ROTULO = 'text-xs font-semibold uppercase tracking-wide text-texto-sutil';
const NOTA = 'text-sm text-texto-sutil';
/** La cifra de una tarjeta. La de mañana es la única en `display`. */
const CIFRA = 'text-3xl font-bold';

/**
 * Una rejilla y no columnas sueltas: el orden del DOM es el del teléfono —el de su
 * §4.4.2— y la PC sólo lo reparte en dos columnas debajo de mañana.
 */
const REJILLA = 'grid gap-(--espacio-3) xl:grid-cols-2';

interface OcupacionDeAlguien {
  readonly nombre: string;
  readonly ocupacionBp: number;
  readonly citas: number;
}

interface HuecoDeManana {
  readonly nombre: string;
  readonly inicio: string;
  readonly minutos: number;
}

interface ClientaQueSeVa {
  readonly nombre: string;
  readonly diasDesde: number;
  readonly cadaDias: number;
}

interface Reincidente {
  readonly nombre: string;
  readonly veces: number;
}

interface ProductoDeAlguien {
  readonly nombre: string;
  readonly conProductoBp: number;
  readonly hoyCentavos: string;
}

export interface TableroDeEstetica {
  readonly fecha: string;
  readonly manana: {
    readonly fecha: string;
    readonly hayHorario: boolean;
    readonly ocupacionBp: number;
    readonly profesionales: readonly OcupacionDeAlguien[];
    readonly huecos: readonly HuecoDeManana[];
    readonly valorDelTiempoLibreCentavos: string;
    readonly laQuerian: readonly string[];
    readonly sinConfirmar: number;
  };
  readonly seVan: {
    readonly clientas: number;
    readonly nombres: readonly ClientaQueSeVa[];
    readonly enRiesgoAlMesCentavos: string;
  };
  readonly noLlegaron: {
    readonly citas: number;
    readonly deCitas: number;
    readonly proporcionBp: number;
    readonly costoCentavos: string;
    readonly reincidentes: readonly Reincidente[];
  };
  readonly porProfesional: readonly OcupacionDeAlguien[];
  readonly venta: {
    readonly hoyCentavos: string;
    readonly referenciaCentavos: string;
    readonly tickets: number;
    readonly servicioBp: number;
  };
  readonly producto: readonly ProductoDeAlguien[];
  readonly leQuedo: {
    readonly ventaCentavos: string;
    readonly comisionCentavos: string;
    readonly materialCentavos: string;
    readonly gastosCentavos: string;
    readonly quedoCentavos: string;
    readonly quedoBp: number;
    readonly comisionBp: number;
  };
  readonly propina: {
    readonly pendienteCentavos: string;
    readonly diasLaMasVieja: number;
  };
}

export interface TableroProps {
  readonly datosIniciales?: TableroDeEstetica;
}

/** Puntos base a por ciento entero, para meterlo en una frase: `4380` → «44 %». */
const entero = (bp: number): string => `${String(Math.round(bp / 100))} %`;

function comoFecha(fecha: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${fecha}T12:00:00`));
}

/** «miércoles 15», que es como se nombra el día siguiente en voz alta. */
function comoDiaCorto(fecha: string): string {
  return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric' }).format(
    new Date(`${fecha}T12:00:00`),
  );
}

function comoHora(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.error.mensaje;
  return 'No se pudo cargar el tablero.';
}

/**
 * Siempre contra el MISMO DÍA de la semana pasada, nunca contra ayer.
 *
 * La semana de un salón tiene forma fija y extrema —lunes cerrado, martes muerto,
 * sábado que vale por dos— y comparar contra ayer dice mentiras todos los días.
 * El verde y el rojo nunca van solos: los acompañan el signo y la flecha.
 */
function Comparacion({ hoy, referencia }: { readonly hoy: string; readonly referencia: string }) {
  const base = Number(referencia);
  if (base <= 0) {
    return <p className={NOTA}>El mismo día de la semana pasada no hubo con qué comparar.</p>;
  }
  const cambio = Math.round(((Number(hoy) - base) / base) * 100);
  const Flecha = cambio > 0 ? TrendingUp : cambio < 0 ? TrendingDown : MoveRight;
  const tono = cambio > 0 ? 'text-exito' : cambio < 0 ? 'text-peligro' : 'text-texto-sutil';
  return (
    <p className="text-sm">
      <span
        className={`inline-flex items-center gap-(--espacio-1) font-numeros font-semibold tabular-nums ${tono}`}
      >
        <Flecha aria-hidden="true" className="size-4" />
        {cambio > 0 ? '+' : ''}
        {cambio} %
      </span>{' '}
      <span className="text-texto-sutil">contra el mismo día de la semana pasada</span>
    </p>
  );
}

/**
 * El encabezado de los tres estados. El bloque del título y, de hermano, el de las
 * acciones: es la relación por la que la prueba encuentra las acciones del tablero
 * sin agarrarse a una clase. Las dos son ENLACES —toda acción de este modelo se
 * ejecuta en otra pantalla— y están aunque el tablero no cargue.
 */
function Encabezado({ fecha }: { readonly fecha: string | null }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-(--espacio-3)">
      <div>
        <h1 className="text-2xl font-bold">Cómo va el salón</h1>
        {fecha === null ? null : (
          <p className={`${NOTA} first-letter:uppercase`}>{comoFecha(fecha)}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-(--espacio-2)">
        <Button asChild size="sm">
          <a href="/estetica-salon/agenda-del-dia">
            <CalendarDays aria-hidden="true" />
            Ir a la agenda
          </a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="/estetica-salon/liquidacion">
            <HandCoins aria-hidden="true" />
            Ir a liquidar
          </a>
        </Button>
      </div>
    </header>
  );
}

/** Una tarjeta del tablero: su rótulo arriba y su dato debajo. */
function Indicador({
  id,
  titulo,
  children,
  className = '',
}: {
  readonly id: string;
  readonly titulo: ReactNode;
  readonly children: ReactNode;
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
    </Superficie>
  );
}

/**
 * La ocupación de cada quien: su barra de relleno, que es exactamente la gráfica que
 * ese número necesita. Es el uso de la silla, no una calificación, y por eso la
 * tabla no se ordena: no es un podio.
 */
function OcupacionPorProfesional({
  filas,
  etiqueta,
  nombreDeBarra,
  vacio,
}: {
  readonly filas: readonly OcupacionDeAlguien[];
  readonly etiqueta: string;
  readonly nombreDeBarra: (nombre: string) => string;
  readonly vacio: ReactNode;
}) {
  const columnas: readonly ColumnaDeTabla<OcupacionDeAlguien>[] = [
    {
      clave: 'profesional',
      titulo: 'Profesional',
      celda: (persona) => <span className="font-medium">{persona.nombre}</span>,
    },
    {
      clave: 'ocupacion',
      titulo: 'Ocupación',
      celda: (persona) => (
        <span className="flex items-center gap-(--espacio-3)">
          <Progress
            value={Math.min(100, persona.ocupacionBp / 100)}
            aria-label={nombreDeBarra(persona.nombre)}
            className="min-w-24 flex-1"
          />
          <Cifra
            valor={Math.round(persona.ocupacionBp / 100)}
            unidad="%"
            tamano="sm"
            className="w-14 text-right font-semibold"
          />
        </span>
      ),
    },
  ];
  return (
    <Tabla
      etiqueta={etiqueta}
      columnas={columnas}
      filas={filas}
      claveDe={(persona) => persona.nombre}
      vacio={vacio}
    />
  );
}

/** Un renglón de la resta de lo que le quedó al salón. */
function Renglon({ concepto, centavos }: { readonly concepto: string; readonly centavos: string }) {
  return (
    <div className="flex items-baseline justify-between gap-(--espacio-3) py-(--espacio-1)">
      <dt className="text-texto-sutil">{concepto}</dt>
      <dd>
        <Dinero centavos={Number(centavos)} tamano="sm" />
      </dd>
    </div>
  );
}

export function Tablero({ datosIniciales }: TableroProps) {
  const voc = useVocabulario();
  const [datos, setDatos] = useState<TableroDeEstetica | null>(datosIniciales ?? null);
  const [error, setError] = useState<string | null>(null);
  // Cada lectura es un número: reintentar lo sube y el efecto lee otra vez. El estado
  // se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (datosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;

    invocarComando<TableroDeEstetica>(RUTA, {}, { signal: control.signal })
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
      <main className="flex flex-col gap-(--espacio-4) p-(--espacio-3) md:p-(--espacio-4)">
        <Encabezado fecha={null} />
        <ErrorDePantalla
          titulo="No se pudo leer el tablero"
          queHacer="Revisa la conexión y vuelve a intentarlo. El tablero sólo lee: en el salón no cambió nada."
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
      <main className="flex flex-col gap-(--espacio-4) p-(--espacio-3) md:p-(--espacio-4)">
        <Encabezado fecha={null} />
        {/* La forma del tablero, cada tarjeta en su sitio: mañana a todo lo ancho y
            las demás debajo. Al llegar los datos nada salta. */}
        <div role="status" aria-busy="true" aria-label="Cargando el tablero" className={REJILLA}>
          <Esqueleto className="h-80 rounded-lg xl:col-span-2" />
          <Esqueleto className="h-56 rounded-lg" />
          <Esqueleto className="h-56 rounded-lg" />
          <Esqueleto className="h-48 rounded-lg" />
          <Esqueleto className="h-48 rounded-lg" />
          <Esqueleto className="h-64 rounded-lg" />
          <Esqueleto className="h-64 rounded-lg" />
          <Esqueleto className="h-20 rounded-lg xl:col-span-2" />
        </div>
      </main>
    );
  }

  const { manana, seVan, noLlegaron, porProfesional, venta, producto, leQuedo, propina } = datos;
  const noShowAlto = noLlegaron.proporcionBp > NO_SHOW_QUE_APRIETA_BP;
  const propinaVieja = propina.diasLaMasVieja > DIAS_DE_PROPINA_QUE_APRIETAN;
  /** Lo de debajo de mañana: con horario, siempre; sin él, sólo si hay a quién hablarle. */
  const hayDetalleDeManana =
    manana.hayHorario || manana.sinConfirmar > 0 || manana.laQuerian.length > 0;

  const columnasDeHuecos: readonly ColumnaDeTabla<HuecoDeManana>[] = [
    {
      clave: 'hora',
      titulo: 'Hora',
      celda: (hueco) => (
        <span className="font-numeros font-semibold tabular-nums">{comoHora(hueco.inicio)}</span>
      ),
    },
    { clave: 'profesional', titulo: 'Profesional', celda: (hueco) => hueco.nombre },
    {
      clave: 'libre',
      titulo: 'Libre',
      numerica: true,
      celda: (hueco) => <Cifra valor={hueco.minutos} unidad="min" tamano="sm" />,
    },
  ];

  const columnasDeSeVan: readonly ColumnaDeTabla<ClientaQueSeVa>[] = [
    { clave: 'clienta', titulo: voc.titulo('cliente'), celda: (quien) => quien.nombre },
    {
      clave: 'hace',
      titulo: 'Hace',
      numerica: true,
      celda: (quien) => <Cifra valor={quien.diasDesde} unidad="d" tamano="sm" />,
    },
    {
      clave: 'cada',
      titulo: 'Viene cada',
      numerica: true,
      celda: (quien) => <Cifra valor={quien.cadaDias} unidad="d" tamano="sm" />,
    },
  ];

  const columnasDeProducto: readonly ColumnaDeTabla<ProductoDeAlguien>[] = [
    {
      clave: 'profesional',
      titulo: 'Profesional',
      celda: (persona) => <span className="font-medium">{persona.nombre}</span>,
    },
    {
      clave: 'mes',
      titulo: 'Del mes',
      numerica: true,
      // La fila se tiñe y la celda dice por qué: el icono y el número en rojo.
      celda: (persona) =>
        persona.conProductoBp < PRODUCTO_QUE_APRIETA_BP ? (
          <span className="inline-flex items-center gap-(--espacio-1) font-semibold text-peligro">
            <TriangleAlert aria-hidden="true" className="size-4" />
            <Cifra valor={Math.round(persona.conProductoBp / 100)} unidad="%" tamano="sm" />
            <span className="sr-only">, debajo de {entero(PRODUCTO_QUE_APRIETA_BP)}</span>
          </span>
        ) : (
          <Cifra valor={Math.round(persona.conProductoBp / 100)} unidad="%" tamano="sm" />
        ),
    },
    {
      clave: 'hoy',
      titulo: 'Hoy',
      numerica: true,
      celda: (persona) => <Dinero centavos={Number(persona.hoyCentavos)} tamano="sm" />,
    },
  ];

  return (
    <main className="flex flex-col gap-(--espacio-4) p-(--espacio-3) md:p-(--espacio-4)">
      <Encabezado fecha={datos.fecha} />

      <div className={REJILLA}>
        {/* ── 1 · MAÑANA · el estrella, a todo lo ancho y la única levantada ── */}
        <Superficie
          como="section"
          nivel={2}
          relleno={0}
          aria-labelledby="t-manana"
          className="min-w-0 overflow-hidden xl:col-span-2"
        >
          <div className="grid gap-(--espacio-4) p-(--espacio-4) md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:p-(--espacio-6)">
            <div className="flex flex-col gap-(--espacio-1)">
              <h2 id="t-manana" className={ROTULO}>
                Ocupación de mañana
              </h2>
              <p className="text-lg font-semibold first-letter:uppercase">
                {comoDiaCorto(manana.fecha)}
              </p>
              {/* Cero entre cero no es cero por ciento: con el salón cerrado es un
                  guión, porque un 0 % mandaría a llenar una agenda que no existe. */}
              {manana.hayHorario ? (
                <Cifra
                  valor={Math.round(manana.ocupacionBp / 100)}
                  unidad="%"
                  tamano="total"
                  className="mt-(--espacio-2)"
                />
              ) : (
                <>
                  <p className="mt-(--espacio-2) font-numeros text-display font-bold text-texto-sutil">
                    —
                  </p>
                  <p className={NOTA}>El salón cierra.</p>
                </>
              )}
            </div>

            <OcupacionPorProfesional
              filas={manana.profesionales}
              etiqueta="Ocupación de mañana por profesional"
              nombreDeBarra={(nombre) => `Ocupación de ${nombre}`}
              vacio={
                <Vacio
                  icono={<CalendarOff />}
                  titulo="Mañana no hay nadie con horario, así que no hay nada que llenar."
                  explicacion="No es un cero: es que no se abre."
                  className="py-(--espacio-4)"
                />
              }
            />
          </div>

          {/* Sin horario no hay huecos que medir, pero SÍ puede haber citas de mañana
              sin confirmar y gente en la lista de espera: `sinConfirmar` cuenta las
              citas agendadas sin mirar el horario, y agendar tampoco lo mira. Así que
              sólo los huecos dependen del horario; a quién hablarle se queda mientras
              haya a quién. */}
          {hayDetalleDeManana ? (
            <div
              className={`grid border-t border-borde ${manana.hayHorario ? 'md:grid-cols-2 md:divide-x md:divide-borde' : ''}`}
            >
              {manana.hayHorario ? (
                <section
                  aria-labelledby="t-huecos"
                  className="flex min-w-0 flex-col gap-(--espacio-2) p-(--espacio-4)"
                >
                  <h3 id="t-huecos" className={ROTULO}>
                    Huecos
                  </h3>
                  <Tabla
                    etiqueta="Huecos de mañana"
                    columnas={columnasDeHuecos}
                    filas={manana.huecos}
                    claveDe={(hueco) => `${hueco.nombre}-${hueco.inicio}`}
                    alto="max-h-72"
                    vacio={
                      <Vacio
                        icono={<CalendarCheck />}
                        titulo="Mañana no queda hueco vendible."
                        explicacion="Es el día que se quiere."
                        className="py-(--espacio-4)"
                      />
                    }
                  />
                  <p className={NOTA}>
                    Valor del tiempo libre ·{' '}
                    <Dinero
                      centavos={Number(manana.valorDelTiempoLibreCentavos)}
                      tamano="sm"
                      className="font-semibold text-texto"
                    />{' '}
                    · estimado al ritmo de cada quien
                  </p>
                </section>
              ) : null}

              <section
                aria-labelledby="t-la-querian"
                className={`flex min-w-0 flex-col gap-(--espacio-3) p-(--espacio-4) ${manana.hayHorario ? 'border-t border-borde md:border-t-0' : ''}`}
              >
                <h3 id="t-la-querian" className={ROTULO}>
                  {manana.hayHorario ? 'Quién quería esas horas' : 'Quién quería mañana'}
                </h3>
                {manana.laQuerian.length === 0 ? (
                  <p className={NOTA}>
                    Nadie anotado en la lista de espera para mañana.
                    {manana.hayHorario ? ' El hueco se llena llamando.' : null}
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-(--espacio-1)" aria-label="Lista de espera">
                    {manana.laQuerian.map((nombre) => (
                      <li key={nombre}>
                        <Badge variant="secondary" className="text-sm">
                          {nombre}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="flex items-baseline gap-(--espacio-2)">
                  <span className={ROTULO}>Sin confirmar</span>
                  <Cifra
                    valor={manana.sinConfirmar}
                    tamano="lg"
                    className={manana.sinConfirmar > 0 ? 'font-bold text-peligro' : ''}
                  />
                </p>
                <div className="mt-auto">
                  <Button asChild size="sm" variant="outline">
                    <a href="/estetica-salon/clientas">
                      <Phone aria-hidden="true" />
                      Ver a quién hablarle
                    </a>
                  </Button>
                </div>
              </section>
            </div>
          ) : null}
        </Superficie>

        {/* ── 2 · la cartera que se va ─────────────────────────────────────── */}
        <Indicador id="t-se-van" titulo="Se están yendo">
          <p className="flex flex-wrap items-baseline gap-x-(--espacio-2)">
            <Cifra valor={seVan.clientas} tamano="lg" className={CIFRA} />
            <span className={NOTA}>{voc.titulo('cliente', true)} que pasaron su ciclo</span>
          </p>
          <p className="text-sm">
            En riesgo{' '}
            <Dinero
              centavos={Number(seVan.enRiesgoAlMesCentavos)}
              tamano="sm"
              className="font-semibold"
            />{' '}
            al mes
          </p>
          {seVan.nombres.length > 0 ? (
            <Tabla
              etiqueta={`${voc.titulo('cliente', true)} que pasaron su ciclo`}
              columnas={columnasDeSeVan}
              filas={seVan.nombres}
              claveDe={(quien) => quien.nombre}
              alto="max-h-72"
            />
          ) : null}
        </Indicador>

        {/* ── 3 · la que no llegó, con su referencia ───────────────────────── */}
        <Indicador id="t-no-llegaron" titulo="No llegaron, últimos 30 días">
          {noLlegaron.deCitas === 0 ? (
            <p className={NOTA}>
              Sin {voc.plural('orden')} en los últimos 30 días: no hay con qué medir.
            </p>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-(--espacio-2)">
                <Cifra
                  valor={noLlegaron.proporcionBp / 100}
                  decimales={1}
                  unidad="%"
                  tamano="lg"
                  className={noShowAlto ? `${CIFRA} text-peligro` : CIFRA}
                />
                {noShowAlto ? (
                  <Badge variant="destructive">
                    <TriangleAlert aria-hidden="true" />
                    Arriba de {entero(NO_SHOW_QUE_APRIETA_BP)}
                  </Badge>
                ) : null}
              </p>
              <p className="text-sm">
                <Cifra valor={noLlegaron.citas} tamano="sm" /> de{' '}
                <Cifra valor={noLlegaron.deCitas} unidad={voc.plural('orden')} tamano="sm" /> ·
                cuesta{' '}
                <Dinero
                  centavos={Number(noLlegaron.costoCentavos)}
                  tamano="sm"
                  className="font-semibold"
                />{' '}
                en el mes
              </p>
            </>
          )}
          <p className={NOTA}>
            La referencia del giro es 15 % a 20 % sin nada puesto, y menos de 8 % con recordatorio,
            confirmación y anticipo.
          </p>
          {noLlegaron.reincidentes.length > 0 ? (
            <div className="flex flex-col gap-(--espacio-1)">
              <span className={ROTULO}>Reinciden</span>
              <ul className="flex flex-wrap gap-(--espacio-1)">
                {noLlegaron.reincidentes.map((quien) => (
                  <li key={quien.nombre}>
                    <Badge variant="outline" className="text-sm">
                      {quien.nombre} ({quien.veces})
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Indicador>

        {/* ── 4 · la semana de cada quien ──────────────────────────────────── */}
        <Indicador id="t-semana" titulo="Ocupación de la semana">
          <OcupacionPorProfesional
            filas={porProfesional}
            etiqueta="Ocupación de la semana por profesional"
            nombreDeBarra={(nombre) => `Ocupación de ${nombre} en la semana`}
            vacio={
              <Vacio
                icono={<CalendarOff />}
                titulo="Todavía no hay horario cargado para medir la semana."
                className="py-(--espacio-4)"
              />
            }
          />
          <p className={NOTA}>
            Es el uso de la silla, no una calificación: a quien está bajo se le pasa trabajo o se le
            ajusta el horario.
          </p>
        </Indicador>

        {/* ── 5 · el dinero de hoy ─────────────────────────────────────────── */}
        <Indicador id="t-cobrado" titulo="Lo cobrado hoy">
          <Dinero centavos={Number(venta.hoyCentavos)} tamano="lg" className={CIFRA} />
          <Comparacion hoy={venta.hoyCentavos} referencia={venta.referenciaCentavos} />
          {/* La mezcla sólo existe si hay algo cobrado. Con el día en cero, «0 % · 100 %»
              sería una proporción de nada que se lee como si todo hubiera sido anaquel. */}
          {Number(venta.hoyCentavos) > 0 ? (
            <p className="text-sm">
              {voc.titulo('linea_orden')}{' '}
              <Cifra valor={Math.round(venta.servicioBp / 100)} unidad="%" tamano="sm" /> ·{' '}
              {voc.titulo('producto')}{' '}
              <Cifra valor={Math.round((10_000 - venta.servicioBp) / 100)} unidad="%" tamano="sm" />
            </p>
          ) : (
            <p className={NOTA}>Todavía no se cobra nada hoy.</p>
          )}
        </Indicador>

        {/* ── 6 · a quién capacitar en recomendar ──────────────────────────── */}
        <Indicador id="t-producto" titulo={`${voc.titulo('producto')} por profesional`}>
          <Tabla
            etiqueta={`${voc.titulo('producto')} por profesional`}
            columnas={columnasDeProducto}
            filas={producto}
            claveDe={(persona) => persona.nombre}
            tonoDeFila={(persona) =>
              persona.conProductoBp < PRODUCTO_QUE_APRIETA_BP ? 'advertencia' : undefined
            }
            vacio={
              <Vacio
                icono={<ShoppingBag />}
                titulo="Este mes todavía no hay nada cobrado con lo que medir la recomendación."
                className="py-(--espacio-4)"
              />
            }
          />
          <p className={NOTA}>
            Es el margen que no depende del horario, y sólo se vende si quien atiende lo recomienda
            con la cabeza mojada. Quien está al 6 % no está vendiendo: está cobrando.
          </p>
        </Indicador>

        {/* ── 7 · lo que quedó ─────────────────────────────────────────────── */}
        <Indicador id="t-quedo" titulo="Lo que le quedó al salón">
          <dl className="flex flex-col text-sm">
            <Renglon concepto="Cobrado del mes" centavos={leQuedo.ventaCentavos} />
            <Renglon
              concepto={`− Comisión (${entero(leQuedo.comisionBp)})`}
              centavos={leQuedo.comisionCentavos}
            />
            <Renglon concepto="− Insumo de cabina" centavos={leQuedo.materialCentavos} />
            <Renglon concepto="− Gastos" centavos={leQuedo.gastosCentavos} />
            <div className="mt-(--espacio-1) flex items-baseline justify-between gap-(--espacio-3) border-t border-borde pt-(--espacio-2)">
              <dt className="font-semibold">Le quedó</dt>
              <dd className="flex items-baseline gap-(--espacio-2)">
                <Dinero
                  centavos={Number(leQuedo.quedoCentavos)}
                  tamano="lg"
                  className="font-bold"
                />
                <Cifra
                  valor={Math.round(leQuedo.quedoBp / 100)}
                  unidad="%"
                  tamano="sm"
                  className="text-texto-sutil"
                />
              </dd>
            </div>
          </dl>
          {/* LA GRÁFICA DE ESTE TABLERO, y por qué va aquí y no en la ocupación.
              La ocupación ya se dibuja: cada profesional lleva su barra de relleno.
              Lo que no se ve en ninguna parte es la PROPORCIÓN de esta resta —cuatro
              renglones de cifras dicen cuánto se fue, y ninguno dice si la comisión se
              llevó un tercio o dos—, y de esa proporción sale la decisión más cara del
              salón: si se contrata a alguien más o si se sube el precio. */}
          <GraficaDeBarras
            titulo="De lo cobrado del mes, a dónde se fue"
            ejes={['Cobrado', 'Comisión', 'Insumo', 'Gastos', 'Le quedó']}
            series={[
              {
                etiqueta: 'Del mes',
                valores: [
                  Number(leQuedo.ventaCentavos),
                  Number(leQuedo.comisionCentavos),
                  Number(leQuedo.materialCentavos),
                  Number(leQuedo.gastosCentavos),
                  Number(leQuedo.quedoCentavos),
                ],
              },
            ]}
            formato={(valor) => dineroEnTexto(valor)}
            alto={150}
          />
          <p className={NOTA}>
            Con la comisión restada, siempre: sin ella este renglón diría 78 % donde hay 28 %, y
            sobre ese 78 % se contrata gente que no se puede pagar.
          </p>
        </Indicador>

        {/* ── 8 · lo que no es del salón · una franja al pie, no una tarjeta ─── */}
        <Superficie
          como="section"
          nivel={0}
          relleno={3}
          aria-labelledby="t-propina"
          className={`flex min-w-0 flex-wrap items-baseline gap-x-(--espacio-4) gap-y-(--espacio-1) md:p-(--espacio-4) xl:col-span-2 ${propinaVieja ? 'border-advertencia bg-advertencia/10' : ''}`}
        >
          <h2 id="t-propina" className={ROTULO}>
            Propina por entregar
          </h2>
          <Dinero
            centavos={Number(propina.pendienteCentavos)}
            tamano="lg"
            className="text-2xl font-bold"
          />
          <p
            className={
              propinaVieja
                ? 'inline-flex items-center gap-(--espacio-1) text-sm font-semibold'
                : NOTA
            }
          >
            {propinaVieja ? <TriangleAlert aria-hidden="true" className="size-4" /> : null}
            {propina.diasLaMasVieja === 0
              ? 'Nada pendiente de entregar.'
              : `La más vieja lleva ${String(propina.diasLaMasVieja)} días en el cajón.`}
          </p>
          <p className={`${NOTA} basis-full`}>
            Es dinero que no es del salón y está en su caja. Casi siempre es desorden, no mala fe, y
            un renglón visible lo arregla.
          </p>
        </Superficie>
      </div>
    </main>
  );
}
