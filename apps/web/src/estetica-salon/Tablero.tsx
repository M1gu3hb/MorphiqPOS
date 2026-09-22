'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Progress } from '@morphiqpos/ui/primitivas/progress';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { GraficaDeBarras } from '@morphiqpos/ui/sistema';
import { useEffect, useState } from 'react';

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
 * ── Lo que NO está aquí, y es una decisión ────────────────────────────────
 * El ranking del equipo por lo que vende cada quien. Su §4.4.3: «suena útil y es
 * tóxico» —con carteras y esquemas distintos compara peras con manzanas y produce
 * resentimiento—. Lo que sí va es la OCUPACIÓN, que mide el uso del recurso y no a
 * la persona. Tampoco el ticket promedio del salón, que mezcla un corte de $250 con
 * un balayage de $3,200.
 */

const RUTA = '/api/reportes/tablero-estetica';

const PESOS = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

/** La referencia del giro para el no-show, que es lo que hace legible el número. */
const NO_SHOW_QUE_APRIETA_BP = 800;

/** Debajo de esto, quien atiende está cobrando y no recomendando (§4.4.2 · 6). */
const PRODUCTO_QUE_APRIETA_BP = 1000;

/** Una propina que lleva más de una semana en el cajón ya es desorden. */
const DIAS_DE_PROPINA_QUE_APRIETAN = 7;

const TARJETA = 'rounded-xl border border-border bg-card p-4 text-card-foreground';
const ROTULO = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const CIFRA = 'text-3xl font-bold tabular-nums';
const CIFRA_ENORME = 'font-numeros text-display font-bold tabular-nums';
const CIFRA_CHICA = 'text-xl font-semibold tabular-nums';
const RENGLON = 'flex items-baseline justify-between gap-3 py-1';
const AVISO = 'text-sm font-semibold text-destructive';
const AL_PIE = 'text-sm text-muted-foreground';

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

const pesos = (centavos: string): string => PESOS.format(Number(centavos) / 100);
const porciento = (bp: number): string => `${(bp / 100).toFixed(1)} %`;
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

/**
 * Siempre contra el MISMO DÍA de la semana pasada, nunca contra ayer.
 *
 * La semana de un salón tiene forma fija y extrema —lunes cerrado, martes muerto,
 * sábado que vale por dos— y comparar contra ayer dice mentiras todos los días.
 */
function comparacion(hoy: string, referencia: string): string {
  const base = Number(referencia);
  if (base <= 0) return 'el mismo día de la semana pasada no hubo con qué comparar';
  const cambio = Math.round(((Number(hoy) - base) / base) * 100);
  return `${cambio > 0 ? '+' : ''}${String(cambio)} % contra el mismo día de la semana pasada`;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.error.mensaje;
  return 'No se pudo cargar el tablero.';
}

export function Tablero({ datosIniciales }: TableroProps) {
  const voc = useVocabulario();
  const [datos, setDatos] = useState<TableroDeEstetica | null>(datosIniciales ?? null);
  const [error, setError] = useState<string | null>(null);

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
  }, [datosIniciales]);

  if (error !== null) {
    return (
      <main className="space-y-3 p-4">
        <h1 className="text-2xl font-bold">Cómo va el salón</h1>
        <p role="alert" className="rounded-md border border-destructive bg-destructive/15 p-3">
          {error}
        </p>
      </main>
    );
  }

  if (datos === null) {
    return (
      <main className="space-y-3 p-4">
        <h1 className="text-2xl font-bold">Cómo va el salón</h1>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </main>
    );
  }

  const { manana, seVan, noLlegaron, porProfesional, venta, producto, leQuedo, propina } = datos;

  return (
    <main className="space-y-3 p-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Cómo va el salón</h1>
          <p className={AL_PIE}>{comoFecha(datos.fecha)}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <a href="/estetica-salon/agenda-del-dia">Ir a la agenda</a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="/estetica-salon/liquidacion">Ir a liquidar</a>
          </Button>
        </div>
      </header>

      {/* ── 1 · MAÑANA · el estrella, a todo lo ancho ───────────────────── */}
      <section className={TARJETA} aria-labelledby="t-manana">
        <h2 id="t-manana" className={ROTULO}>
          Ocupación de mañana
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className={CIFRA_ENORME}>{manana.hayHorario ? entero(manana.ocupacionBp) : '—'}</p>
            <p className={AL_PIE}>
              {comoDiaCorto(manana.fecha)}
              {manana.hayHorario ? '' : ' · el salón cierra'}
            </p>
          </div>

          <ul className="space-y-2 md:col-span-2">
            {manana.profesionales.length === 0 ? (
              <li className={AL_PIE}>
                Mañana no hay nadie con horario, así que no hay nada que llenar. No es un cero: es
                que no se abre.
              </li>
            ) : (
              manana.profesionales.map((persona) => (
                <li key={persona.nombre}>
                  <div className={RENGLON}>
                    <span className="font-medium">{persona.nombre}</span>
                    <span className="tabular-nums">{entero(persona.ocupacionBp)}</span>
                  </div>
                  <Progress
                    value={Math.min(100, persona.ocupacionBp / 100)}
                    aria-label={`Ocupación de ${persona.nombre}`}
                  />
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className={ROTULO}>Huecos</h3>
            {manana.huecos.length === 0 ? (
              <p className={AL_PIE}>Mañana no queda hueco vendible. Es el día que se quiere.</p>
            ) : (
              <ul>
                {manana.huecos.map((hueco) => (
                  <li key={`${hueco.nombre}-${hueco.inicio}`} className={RENGLON}>
                    <span className="tabular-nums">{comoHora(hueco.inicio)}</span>
                    <span>{hueco.nombre}</span>
                    <span className="tabular-nums">{hueco.minutos} min</span>
                  </li>
                ))}
              </ul>
            )}
            <p className={AL_PIE}>
              Valor del tiempo libre · {pesos(manana.valorDelTiempoLibreCentavos)} · estimado al
              ritmo de cada quien
            </p>
          </div>

          <div>
            <h3 className={ROTULO}>Quién quería esas horas</h3>
            {manana.laQuerian.length === 0 ? (
              <p className={AL_PIE}>
                Nadie anotado en la lista de espera para mañana. El hueco se llena llamando.
              </p>
            ) : (
              <p className="text-sm">{manana.laQuerian.join(' · ')}</p>
            )}
            <p className={manana.sinConfirmar > 0 ? AVISO : AL_PIE}>
              Sin confirmar · {manana.sinConfirmar}
            </p>
            <Button asChild size="sm" variant="outline">
              <a href="/estetica-salon/clientas">Ver a quién hablarle</a>
            </Button>
          </div>
        </div>
      </section>

      {/* ── 2 y 3 · la cartera que se va, y la que no llegó ─────────────── */}
      <div className="grid gap-3 md:grid-cols-2">
        <section className={TARJETA} aria-labelledby="t-se-van">
          <h2 id="t-se-van" className={ROTULO}>
            Se están yendo
          </h2>
          <p className={CIFRA}>{seVan.clientas}</p>
          <p className={AL_PIE}>
            {voc.titulo('cliente', true)} que pasaron su ciclo · en riesgo{' '}
            {pesos(seVan.enRiesgoAlMesCentavos)} al mes
          </p>
          {seVan.nombres.length > 0 && (
            <ul className="mt-2">
              {seVan.nombres.map((quien) => (
                <li key={quien.nombre} className={RENGLON}>
                  <span>{quien.nombre}</span>
                  <span className="tabular-nums">
                    {quien.diasDesde} d · viene cada {quien.cadaDias}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={TARJETA} aria-labelledby="t-no-llegaron">
          <h2 id="t-no-llegaron" className={ROTULO}>
            No llegaron, últimos 30 días
          </h2>
          <p className={noLlegaron.proporcionBp > NO_SHOW_QUE_APRIETA_BP ? AVISO : CIFRA}>
            {porciento(noLlegaron.proporcionBp)}
          </p>
          <p className={AL_PIE}>
            {noLlegaron.citas} de {noLlegaron.deCitas} · cuesta {pesos(noLlegaron.costoCentavos)} en
            el mes
          </p>
          <p className={AL_PIE}>
            La referencia del giro es 15 % a 20 % sin nada puesto, y menos de 8 % con recordatorio,
            confirmación y anticipo.
          </p>
          {noLlegaron.reincidentes.length > 0 && (
            <p className="mt-2 text-sm">
              Reinciden ·{' '}
              {noLlegaron.reincidentes
                .map((quien) => `${quien.nombre} (${String(quien.veces)})`)
                .join(' · ')}
            </p>
          )}
        </section>
      </div>

      {/* ── 4 y 5 · la semana de cada quien, y el dinero de hoy ─────────── */}
      <div className="grid gap-3 md:grid-cols-2">
        <section className={TARJETA} aria-labelledby="t-semana">
          <h2 id="t-semana" className={ROTULO}>
            Ocupación de la semana
          </h2>
          {porProfesional.length === 0 ? (
            <p className={AL_PIE}>Todavía no hay horario cargado para medir la semana.</p>
          ) : (
            <ul className="space-y-2">
              {porProfesional.map((persona) => (
                <li key={persona.nombre}>
                  <div className={RENGLON}>
                    <span className="font-medium">{persona.nombre}</span>
                    <span className="tabular-nums">{entero(persona.ocupacionBp)}</span>
                  </div>
                  <Progress
                    value={Math.min(100, persona.ocupacionBp / 100)}
                    aria-label={`Ocupación de ${persona.nombre} en la semana`}
                  />
                </li>
              ))}
            </ul>
          )}
          <p className={AL_PIE}>
            Es el uso de la silla, no una calificación: a quien está bajo se le pasa trabajo o se le
            ajusta el horario.
          </p>
        </section>

        <section className={TARJETA} aria-labelledby="t-cobrado">
          <h2 id="t-cobrado" className={ROTULO}>
            Lo cobrado hoy
          </h2>
          <p className={CIFRA}>{pesos(venta.hoyCentavos)}</p>
          <p className={AL_PIE}>{comparacion(venta.hoyCentavos, venta.referenciaCentavos)}</p>
          {/* La mezcla sólo existe si hay algo cobrado. Con el día en cero, «0 % · 100 %»
              sería una proporción de nada que se lee como si todo hubiera sido anaquel. */}
          {Number(venta.hoyCentavos) > 0 ? (
            <p className="mt-2 text-sm">
              {voc.titulo('linea_orden')} {entero(venta.servicioBp)} · {voc.titulo('producto')}{' '}
              {entero(10_000 - venta.servicioBp)}
            </p>
          ) : (
            <p className={AL_PIE}>Todavía no se cobra nada hoy.</p>
          )}
        </section>
      </div>

      {/* ── 6 · a quién capacitar en recomendar ─────────────────────────── */}
      <section className={TARJETA} aria-labelledby="t-producto">
        <h2 id="t-producto" className={ROTULO}>
          {voc.titulo('producto')} por profesional
        </h2>
        {producto.length === 0 ? (
          <p className={AL_PIE}>
            Este mes todavía no hay nada cobrado con lo que medir la recomendación.
          </p>
        ) : (
          <ul>
            {producto.map((persona) => (
              <li key={persona.nombre} className={RENGLON}>
                <span className="font-medium">{persona.nombre}</span>
                <span
                  className={
                    persona.conProductoBp < PRODUCTO_QUE_APRIETA_BP
                      ? 'font-semibold tabular-nums text-destructive'
                      : 'tabular-nums'
                  }
                >
                  {entero(persona.conProductoBp)} del mes
                </span>
                <span className="tabular-nums">{pesos(persona.hoyCentavos)} hoy</span>
              </li>
            ))}
          </ul>
        )}
        <p className={AL_PIE}>
          Es el margen que no depende del horario, y sólo se vende si quien atiende lo recomienda
          con la cabeza mojada. Quien está al 6 % no está vendiendo: está cobrando.
        </p>
      </section>

      {/* ── 7 y 8 · lo que quedó, y lo que no es del salón ──────────────── */}
      <div className="grid gap-3 md:grid-cols-2">
        <section className={TARJETA} aria-labelledby="t-quedo">
          <h2 id="t-quedo" className={ROTULO}>
            Lo que le quedó al salón
          </h2>
          <dl>
            <div className={RENGLON}>
              <dt>Cobrado del mes</dt>
              <dd className="tabular-nums">{pesos(leQuedo.ventaCentavos)}</dd>
            </div>
            <div className={RENGLON}>
              <dt>− Comisión ({entero(leQuedo.comisionBp)})</dt>
              <dd className="tabular-nums">{pesos(leQuedo.comisionCentavos)}</dd>
            </div>
            <div className={RENGLON}>
              <dt>− Insumo de cabina</dt>
              <dd className="tabular-nums">{pesos(leQuedo.materialCentavos)}</dd>
            </div>
            <div className={RENGLON}>
              <dt>− Gastos</dt>
              <dd className="tabular-nums">{pesos(leQuedo.gastosCentavos)}</dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-2">
              <dt className="font-semibold">Le quedó</dt>
              <dd className={CIFRA_CHICA}>
                {pesos(leQuedo.quedoCentavos)} · {entero(leQuedo.quedoBp)}
              </dd>
            </div>
          </dl>
          {/* LA GRÁFICA DE ESTE TABLERO, y por qué va aquí y no en la ocupación.
              La ocupación de mañana ya se dibuja: cada profesional lleva su barra de
              relleno, que es exactamente la gráfica que ese número necesita. Lo que no
              se ve en ninguna parte es la PROPORCIÓN de esta resta —cuatro renglones
              de cifras dicen cuánto se fue, y ninguno dice si la comisión se llevó un
              tercio o dos—, y de esa proporción sale la decisión más cara del salón:
              si se contrata a alguien más o si se sube el precio. */}
          <GraficaDeBarras
            className="mt-(--espacio-3)"
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
            formato={(valor) => PESOS.format(valor / 100)}
            alto={150}
          />
          <p className={AL_PIE}>
            Con la comisión restada, siempre: sin ella este renglón diría 78 % donde hay 28 %, y
            sobre ese 78 % se contrata gente que no se puede pagar.
          </p>
        </section>

        <section className={TARJETA} aria-labelledby="t-propina">
          <h2 id="t-propina" className={ROTULO}>
            Propina por entregar
          </h2>
          <p className={CIFRA}>{pesos(propina.pendienteCentavos)}</p>
          <p className={propina.diasLaMasVieja > DIAS_DE_PROPINA_QUE_APRIETAN ? AVISO : AL_PIE}>
            {propina.diasLaMasVieja === 0
              ? 'Nada pendiente de entregar.'
              : `La más vieja lleva ${String(propina.diasLaMasVieja)} días en el cajón.`}
          </p>
          <p className={AL_PIE}>
            Es dinero que no es del salón y está en su caja. Casi siempre es desorden, no mala fe, y
            un renglón visible lo arregla.
          </p>
        </section>
      </div>
    </main>
  );
}
