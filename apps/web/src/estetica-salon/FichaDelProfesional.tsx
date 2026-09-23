'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Aviso,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { CalendarX, CircleCheck, Clock, RefreshCw, Timer, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · estetica-salon · ficha-del-profesional
 *
 * «Mi día»: lo que la estilista mira entre clienta y clienta, de pie.
 *
 * ── Por qué NO es la agenda filtrada ────────────────────────────────────
 * La agenda del salón la lee la recepción para COLOCAR gente; ésta la lee ella,
 * con el teléfono en una mano y el tinte en la otra. Lleva quién sigue, a qué
 * hora, qué le toca hacer y cuánto lleva ganado — y NO lleva el margen del
 * servicio ni el costo del material que absorbe el salón, que no le tocan.
 *
 * ── Por qué lo primero que se ve es CUÁNDO QUEDA LIBRE ──────────────────
 * Porque el procesado la libera aunque la clienta siga sentada, y ése es el
 * minuto en que puede tomar a otra. Sin ese dato la pantalla es una lista de
 * citas, y el 25 %–40 % de capacidad intercalable sigue sin verse. Por eso en la
 * tarjeta de la que sigue es una franja propia, y no media línea gris.
 *
 * ── Por qué la comisión del día se enseña TODOS los días ────────────────
 * La discusión de fin de quincena —«a mí me salían otros números»— se evita
 * dejándola mirar el acumulado todos los días. Un salón que sólo la enseña el
 * día del pago tiene esa discusión cada quince días, con la persona que le está
 * atendiendo a las clientas.
 *
 * ── Y por qué la propina va SEPARADA ────────────────────────────────────
 * No es del salón y no se comisiona. Sumarlas en un solo número haría que
 * pareciera que el salón le paga más de lo que le paga, y que la propina entra
 * en el cálculo de su comisión. Son dos renglones, siempre (04-INTERFAZ §4.3.6).
 *
 * ── El layout, por dispositivo ──────────────────────────────────────────
 * Teléfono primero: una columna, en el orden de la jerarquía —1 la que sigue,
 * 2 lo que lleva hoy, 3 el resto del día— y «Actualizar» al final, en el tercio
 * de abajo, lejos de las esquinas que se rompen. En tableta y PC, lo mismo más
 * ancho: la que sigue y lo ganado a la izquierda, y el día entero a la derecha,
 * con su fila marcada.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben el día, lo siguiente, la comisión y la propina. Queda fuera cobrar,
 * que pasa en el mostrador y es otra pantalla. El detalle de la comisión
 * servicio por servicio que el documento pone al lado en tableta no llega en
 * `mi-dia`: el día que llegue, es una columna más de la tabla.
 */

const RUTA_MI_DIA = '/api/profesionales';

/** Lo que se lee cuando el fallo no trae mensaje propio. */
const SIN_LECTURA = 'No se pudo leer tu día.';

/** Los estados del servicio que todavía le tocan. Los mismos con que el servidor elige `siguiente`. */
const ABIERTOS: ReadonlySet<string> = new Set(['pendiente', 'en_curso']);

export interface CitaDeMiDia {
  readonly citaServicioId: string;
  readonly folio: string;
  readonly clienta: string | null;
  readonly servicio: string;
  readonly estado: string;
  readonly inicio: string;
  readonly fin: string;
  readonly libreDesde: string | null;
  readonly precioCentavos: string;
}

export interface MiDia {
  readonly profesionalId: string;
  readonly fecha: string;
  readonly citas: readonly CitaDeMiDia[];
  readonly comisionDelDiaCentavos: string;
  readonly propinaDelDiaCentavos: string;
  readonly siguiente: CitaDeMiDia | null;
}

export interface FichaDelProfesionalProps {
  readonly profesionalId: string;
  readonly diaInicial?: MiDia;
}

function hora(iso: string): string {
  return iso.slice(11, 16);
}

/** `2026-09-22` → «martes, 22 de septiembre». Si no se entiende, la fecha tal cual. */
function fechaLarga(fecha: string): string {
  const [anio, mes, diaDelMes] = fecha.split('-').map(Number);
  if (anio === undefined || mes === undefined || diaDelMes === undefined) return fecha;
  const instante = Date.UTC(anio, mes - 1, diaDelMes);
  if (Number.isNaN(instante)) return fecha;
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(instante);
}

/** Lo que se lee de un vistazo: «libre a las 10:40» o «ocupada hasta las 11:50». */
export function cuandoQuedaLibre(cita: CitaDeMiDia): string {
  if (cita.libreDesde === null) return `hasta las ${hora(cita.fin)}`;
  if (cita.libreDesde === cita.fin) return `hasta las ${hora(cita.fin)}`;
  return `libre a las ${hora(cita.libreDesde)}`;
}

/** ¿El procesado la suelta antes de que la clienta se levante? Es el hueco que se vende. */
function liberaAntes(cita: CitaDeMiDia): boolean {
  return cita.libreDesde !== null && cita.libreDesde !== cita.fin;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return SIN_LECTURA;
}

/** El estado del servicio como se lee: `en_curso` → «en curso». */
function EstadoDelServicio({ estado }: { readonly estado: string }) {
  const variante =
    estado === 'en_curso' ? 'default' : ABIERTOS.has(estado) ? 'outline' : 'secondary';
  return <Badge variant={variante}>{estado.replace(/_/g, ' ')}</Badge>;
}

const CONTENEDOR =
  'mx-auto flex w-full max-w-6xl flex-col gap-(--espacio-4) p-(--espacio-3) pb-(--espacio-8) md:p-(--espacio-6)';

/** Dos columnas desde tableta: lo suyo a la izquierda, el día entero a la derecha. */
const REJILLA =
  'grid gap-(--espacio-4) md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:grid-rows-[auto_auto_1fr] md:items-start lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-(--espacio-6)';

function Encabezado({ fecha }: { readonly fecha: string | null }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-(--espacio-2)">
      <h1 className="text-2xl font-bold">Mi día</h1>
      {fecha === null ? null : (
        <time dateTime={fecha} className="text-sm text-texto-sutil first-letter:uppercase">
          {fechaLarga(fecha)}
        </time>
      )}
    </header>
  );
}

/** La que sigue: grande, con la hora a la que queda libre en su propia franja. */
function LaQueSigue({ cita }: { readonly cita: CitaDeMiDia }) {
  const enCurso = cita.estado === 'en_curso';
  const suelta = liberaAntes(cita);
  return (
    <Superficie
      como="section"
      nivel={2}
      relleno={6}
      aria-labelledby="ficha-la-que-sigue"
      className="flex flex-col gap-(--espacio-3) md:col-start-1 md:row-start-1"
    >
      <div className="flex items-baseline justify-between gap-(--espacio-3)">
        <h2
          id="ficha-la-que-sigue"
          className="text-xs font-semibold tracking-wide text-texto-sutil uppercase"
        >
          {enCurso ? 'Ahora' : 'Sigue'}
        </h2>
        <time dateTime={cita.inicio} className="font-numeros text-2xl font-semibold tabular-nums">
          {hora(cita.inicio)}
        </time>
      </div>
      <div className="flex flex-col gap-(--espacio-1)">
        <p className="text-3xl leading-tight font-semibold">{cita.clienta ?? 'Sin nombre'}</p>
        <p className="text-lg text-texto-sutil">{cita.servicio}</p>
      </div>
      {/* La palabra dice si la suelta antes —«libre a las»— o no —«hasta las»—; el
          tinte sólo lo subraya. */}
      <p
        className={`flex items-center gap-(--espacio-2) rounded-md px-(--espacio-3) py-(--espacio-2) text-lg font-semibold ${suelta ? 'bg-exito/10' : 'bg-fondo-sutil'}`}
      >
        {suelta ? (
          <Timer aria-hidden="true" className="size-5 shrink-0 text-exito" />
        ) : (
          <Clock aria-hidden="true" className="size-5 shrink-0 text-texto-sutil" />
        )}
        <span className="font-numeros tabular-nums">{cuandoQuedaLibre(cita)}</span>
      </p>
    </Superficie>
  );
}

function DiaTerminado() {
  return (
    <Superficie
      como="section"
      nivel={0}
      relleno={6}
      aria-label="Tu día"
      className="flex items-center gap-(--espacio-3) md:col-start-1 md:row-start-1"
    >
      <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-exito" />
      <p className="text-lg font-medium">Ya terminaste el día.</p>
    </Superficie>
  );
}

export function FichaDelProfesional({ profesionalId, diaInicial }: FichaDelProfesionalProps) {
  const voc = useVocabulario();
  const [dia, setDia] = useState<MiDia | null>(diaInicial ?? null);
  const [error, setError] = useState<string | null>(null);

  // Cada lectura pedida a mano es un número: «Actualizar» y «Volver a intentar» lo
  // suben y el efecto lee otra vez, sin esperar al latido del minuto. El estado se
  // limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (diaInicial !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      // Sin id no se consulta.
      //
      // Estas pantallas se abren SIN nada seleccionado -`page.tsx` las monta con
      // la cadena vacia- y consultar con ella manda un `where id = ''` a una
      // columna uuid: Postgres contesta 22P02 y la pantalla se lleva un 500 en
      // cada apertura. El estado de «elige algo» ya esta escrito debajo; lo que
      // faltaba era no pedir datos de lo que nadie eligio.
      if (profesionalId === '') return;
      invocarComando<MiDia>(`${RUTA_MI_DIA}/${profesionalId}/mi-dia`, { fecha: null })
        .then((datos) => {
          if (!sigueMontada()) return;
          setDia(datos);
          // Una lectura buena borra el aviso de la mala: si no, «no se pudo
          // actualizar» se quedaba pegado sobre datos ya frescos.
          setError(null);
        })
        .catch((fallo: unknown) => {
          if (sigueMontada()) setError(mensajeDe(fallo));
        });
    };
    const arranque = setTimeout(cargar);
    // Se refresca solo: la pantalla se mira de pie y nadie la va a recargar
    // entre clienta y clienta.
    const latido = setInterval(cargar, 60_000);
    return () => {
      clearTimeout(arranque);
      clearInterval(latido);
      control.abort();
    };
  }, [profesionalId, diaInicial, intento]);

  function releer(): void {
    setError(null);
    setDia(null);
    setIntento((previo) => previo + 1);
  }

  // El VACÍO QUE ENSEÑA: la ficha es de UNA profesional.
  //
  // `page.tsx` la monta sin ninguna elegida —se llega desde la liquidación o desde
  // «Mi día»— y sin esto la pantalla se quedaba en su esqueleto para siempre.
  if (profesionalId === '' && diaInicial === undefined) {
    return (
      <main className="mx-auto w-full max-w-2xl p-(--espacio-3) md:p-(--espacio-8)">
        <h1 className="sr-only">Ficha del profesional</h1>
        <Vacio
          icono={<UserRound />}
          titulo="Aquí se abre la ficha de una profesional"
          explicacion={`Su día, sus ${voc.plural('orden')}, lo que lleva cobrado y su comisión. Se elige en Liquidación —o cada una abre la suya en «Mi día», donde sólo ve lo propio.`}
          accion={
            <Button asChild>
              <a href="/estetica-salon/liquidacion">Ir a Liquidación</a>
            </Button>
          }
        />
      </main>
    );
  }

  // No leyó nada: sin esto no se sabe quién sigue ni cuánto lleva.
  if (dia === null && error !== null) {
    return (
      <main className={CONTENEDOR}>
        <Encabezado fecha={null} />
        <ErrorDePantalla
          titulo="No se pudo leer tu día"
          queHacer="Sin él no se sabe quién sigue ni cuánto llevas hoy. Revisa la conexión y vuelve a intentarlo; la pantalla también lo reintenta sola cada minuto."
          {...(error === SIN_LECTURA ? {} : { detalle: error })}
          reintentar={<Button onClick={releer}>Volver a intentar</Button>}
        />
      </main>
    );
  }

  if (dia === null) {
    // La forma de lo que viene —la que sigue, lo ganado y el día—, no una rueda: al
    // llegar los datos nada salta de sitio.
    return (
      <main aria-busy="true" className={CONTENEDOR}>
        <Encabezado fecha={null} />
        <div className={REJILLA}>
          <Esqueleto className="h-52 w-full rounded-lg md:col-start-1 md:row-start-1" />
          <Esqueleto className="h-40 w-full rounded-lg md:col-start-1 md:row-start-2" />
          <EsqueletoDeLista filas={6} className="md:col-start-2 md:row-span-3 md:row-start-1" />
        </div>
      </main>
    );
  }

  const porAtender = dia.citas.filter((cita) => ABIERTOS.has(cita.estado)).length;

  const columnas: readonly ColumnaDeTabla<CitaDeMiDia>[] = [
    {
      clave: 'hora',
      titulo: 'Hora',
      celda: (cita) => (
        <time dateTime={cita.inicio} className="font-numeros font-semibold tabular-nums">
          {hora(cita.inicio)}
        </time>
      ),
    },
    {
      clave: 'clienta',
      titulo: voc.titulo('cliente'),
      celda: (cita) => (
        <span className="flex flex-col">
          <span className="font-medium">{cita.clienta ?? 'Sin nombre'}</span>
          <span className="text-xs text-texto-sutil">
            {cita.servicio} ·{' '}
            <span className="font-numeros tabular-nums">{cuandoQuedaLibre(cita)}</span>
          </span>
        </span>
      ),
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      celda: (cita) => <EstadoDelServicio estado={cita.estado} />,
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      desde: 'sm',
      celda: (cita) => <Dinero centavos={Number(cita.precioCentavos)} tamano="sm" />,
    },
  ];

  return (
    <main className={CONTENEDOR}>
      <Encabezado fecha={dia.fecha} />

      {error === null ? null : (
        // Leyó antes y ahora no: lo de abajo es la última lectura, y se dice.
        <Aviso tono="atencion" titulo="No se pudo actualizar tu día">
          {error === SIN_LECTURA ? '' : `${error} `}Lo que ves es lo último que se leyó; se vuelve a
          intentar solo cada minuto.
        </Aviso>
      )}

      <div className={REJILLA}>
        {dia.siguiente !== null ? <LaQueSigue cita={dia.siguiente} /> : null}
        {dia.siguiente === null && dia.citas.length > 0 ? <DiaTerminado /> : null}

        {/* Comisión y propina en DOS renglones, siempre: sumadas, parecería que el
            salón le paga lo que le deja la clienta. */}
        <Superficie
          como="section"
          aria-labelledby="ficha-hoy-llevas"
          className="flex flex-col gap-(--espacio-2) md:col-start-1 md:row-start-2"
        >
          <h2
            id="ficha-hoy-llevas"
            className="text-xs font-semibold tracking-wide text-texto-sutil uppercase"
          >
            Hoy llevas
          </h2>
          <dl className="flex flex-col divide-y divide-borde">
            <div className="flex items-baseline justify-between gap-(--espacio-3) py-(--espacio-2)">
              <dt className="text-base">Comisión</dt>
              <dd>
                <Dinero centavos={Number(dia.comisionDelDiaCentavos)} tamano="lg" />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-(--espacio-3) py-(--espacio-2)">
              <dt className="text-base">Propina</dt>
              <dd>
                <Dinero centavos={Number(dia.propinaDelDiaCentavos)} tamano="lg" />
              </dd>
            </div>
          </dl>
          <p className="text-sm text-texto-sutil">
            {voc.conNumero('orden', dia.citas.length)} ·{' '}
            <span className="font-numeros tabular-nums">{porAtender}</span> por atender
          </p>
        </Superficie>

        <section
          aria-labelledby="ficha-todo-el-dia"
          className="flex flex-col gap-(--espacio-2) md:col-start-2 md:row-span-3 md:row-start-1"
        >
          <h2 id="ficha-todo-el-dia" className="text-base font-semibold">
            Todo el día
          </h2>
          <Tabla
            etiqueta="Todo el día"
            columnas={columnas}
            filas={dia.citas}
            claveDe={(cita) => cita.citaServicioId}
            // La que sigue, marcada también aquí: el ojo la encuentra en la lista
            // sin volver a leer la hora.
            {...(dia.siguiente === null ? {} : { activa: dia.siguiente.citaServicioId })}
            // Lo cerrado se atenúa y la celda de estado dice por qué.
            tonoDeFila={(cita) => (ABIERTOS.has(cita.estado) ? undefined : 'tenue')}
            alto="max-h-none md:max-h-[70vh]"
            vacio={
              <Superficie nivel={0} relleno={0}>
                <Vacio
                  icono={<CalendarX />}
                  titulo={`Hoy no tienes ${voc.plural('orden')}.`}
                  explicacion={`En cuanto te agenden ${voc.enFraseCon('un', 'orden')}, aparece aquí con la hora a la que quedas libre. La pantalla se actualiza sola cada minuto.`}
                />
              </Superficie>
            }
          />
        </section>

        <Button
          variant="outline"
          className="h-[calc(var(--altura-control)*1.4)] w-full text-base md:col-start-1 md:row-start-3"
          onClick={releer}
        >
          <RefreshCw aria-hidden="true" />
          Actualizar
        </Button>
      </div>
    </main>
  );
}
