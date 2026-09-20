'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Progress } from '@morphiqpos/ui/primitivas/progress';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { consultarPuente } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · estetica-salon · mi-dia
 *
 * La pantalla de la profesional, en su teléfono, 20–40 veces al día.
 *
 * ── Por qué NO es la agenda con un filtro ────────────────────────────────
 * Porque la agenda contesta «¿qué hay en el salón?» y ésta contesta otras dos:
 * «¿qué sigue?» y «¿cuánto llevo ganado?». Karla no camina al mostrador entre
 * clienta y clienta, y de este número sale su dinero esta noche. Una agenda
 * filtrada le daría las dos respuestas repartidas en una rejilla de columnas
 * hecha para quien mira el salón desde fuera.
 *
 * ── La que sigue va grande y sola ────────────────────────────────────────
 * Es la acción principal —abrir la siguiente cita— y compite con un espejo, una
 * clienta hablando y un secador. Si comparte tamaño con el resto, se pierde.
 *
 * ── Comisión y propina en dos renglones, SIEMPRE ─────────────────────────
 * Es la regla del §4.4 de `02-DINERO-Y-CAJA.md` puesta en pantalla: sumadas,
 * Karla cree que el salón le pagó $1,580 por trabajar. Por eso tampoco hay un
 * «total» debajo: no existe un número que junte esas dos cosas.
 *
 * ── Y por qué la propina puede decir «sin dato» en vez de $0 ─────────────
 * Porque hoy no se puede leer: `BeneficiarioPropina` la ven sólo dueño y
 * administrador, y `ComisionCausada.tipo` no tiene 'propina' —son 'servicio',
 * 'producto', 'venta_paquete', 'ajuste' y 'contrapartida'—. Un $0 sería mentira
 * y fundirla con la comisión sería justo el error que la regla prohíbe, así que
 * el renglón se queda, vacío y dicho con palabras.
 *
 * ── «Cabe un corte» es la pantalla vendiendo sola ────────────────────────
 * El hueco no se captura: se calcula. Y se calcula con una duración NOMINAL,
 * porque el largo real vive en las columnas `tstzrange` de la migración 132 que
 * el puente no expone. El hueco es por tanto una sugerencia honesta, no un
 * dato: por eso se enseña con su rango y su medida, para que ella decida.
 *
 * ── Quién es «yo», y por qué hay un paso para decirlo ────────────────────
 * La sesión todavía no dice qué profesional mira. Sin `profesionalId` esta
 * pantalla no consulta nada y pregunta el nombre, porque enseñar el día de otra
 * persona es peor que no enseñar nada. Que conste: elegir el nombre aquí es
 * comodidad de pantalla, NO una barrera; el recorte por persona lo tiene que
 * hacer el servidor el día que la sesión sepa quién entró.
 *
 * ── Lo que NO va aquí ────────────────────────────────────────────────────
 * La venta del salón, la comisión de nadie más, el corte y los gastos. Esta
 * pantalla es de UNA persona.
 *
 * ── Alcance recortado, dicho y no escondido ──────────────────────────────
 * El nombre del servicio llega vacío: el puente no declara `Servicio`, así que
 * `CitaServicio` sólo trae su id. Llega por props, para las pruebas y para el
 * día que la entidad exista. Los minutos de procesado, igual.
 */

/** Los estados en que la cita ya no espera nada de ella. */
const CERRADAS: readonly string[] = [
  'terminada',
  'cobrada',
  'no_llego',
  'cancelada',
  'reprogramada',
];

/** Duración nominal de un servicio, sólo para medir huecos. Ver el docblock. */
const MINUTOS_NOMINALES = 45;

/** Por debajo de esto no es un hueco: es el respiro entre clienta y clienta. */
const MINUTOS_HUECO_MINIMO = 25;

/** Escala de la barra de procesado. Es presentación; el número va en palabras. */
const MINUTOS_PROCESADO_TOPE = 45;

export interface CitaDeMiDia {
  readonly id: string;
  readonly citaServicioId: string;
  readonly folio: string | null;
  readonly clienteNombre: string | null;
  readonly servicio: string | null;
  /** ISO. La hora se pinta sólo en el navegador: el servidor tiene otro huso. */
  readonly inicio: string;
  readonly estado: string;
  /** El puente entrega el dinero en PESOS aunque la columna sea `_centavos`. */
  readonly precioPesos: number;
  readonly alergias: boolean;
  readonly minutosProcesado: number | null;
}

export interface LineaDeComision {
  readonly id: string;
  readonly concepto: string;
  readonly pesos: number;
}

export interface GananciaDelDia {
  readonly comisionCentavos: number;
  /** `null` cuando no se puede leer. NUNCA se suma a la comisión. */
  readonly propinaCentavos: number | null;
  readonly detalle: readonly LineaDeComision[];
}

export interface ProfesionalDeLaLista {
  readonly id: string;
  readonly nombre_corto: string | null;
  readonly nombre_completo: string | null;
  readonly activo: boolean | null;
}

export interface MiDiaProps {
  /** Quién mira. Sin esto la pantalla no consulta nada de nadie. */
  readonly profesionalId?: string;
  readonly nombreProfesional?: string;
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly citasIniciales?: readonly CitaDeMiDia[];
  readonly gananciaInicial?: GananciaDelDia;
  readonly onAbrirCita?: (citaId: string) => void;
}

interface FilaCitaServicio {
  readonly id: string;
  readonly cita_id: string;
  readonly precio_centavos: number | null;
}

interface FilaCita {
  readonly id: string;
  readonly folio: string | null;
  readonly cliente_id: string | null;
  readonly estado: string | null;
  readonly agendada_para: string | null;
  readonly notas: string | null;
}

interface FilaCliente {
  readonly id: string;
  readonly nombre: string | null;
}

interface FilaComision {
  readonly id: string;
  readonly tipo: string | null;
  readonly monto_centavos: number | null;
  readonly causada_en: string | null;
  readonly motivo: string | null;
}

/** Pesos a centavos contando dígitos: `58.995 * 100` pierde medio centavo. */
function aCentavos(pesos: number | null | undefined): number {
  if (pesos === null || pesos === undefined || !Number.isFinite(pesos)) return 0;
  const [entero = '0', decimal = '00'] = Math.abs(pesos).toFixed(2).split('.');
  return (pesos < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

/** Centavos a pesos para una persona. Aritmética entera de punta a punta. */
export function enPesos(centavos: number): string {
  const bruto = Math.abs(centavos);
  const miles = Math.trunc(bruto / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${centavos < 0 ? '-' : ''}$${miles}.${(bruto % 100).toString().padStart(2, '0')}`;
}

function aHora(iso: string): string {
  const f = new Date(iso);
  const hh = f.getHours().toString().padStart(2, '0');
  return `${hh}:${f.getMinutes().toString().padStart(2, '0')}`;
}

export function esMismoDia(iso: string, referencia: Date): boolean {
  const f = new Date(iso);
  return (
    f.getFullYear() === referencia.getFullYear() &&
    f.getMonth() === referencia.getMonth() &&
    f.getDate() === referencia.getDate()
  );
}

/** Une lo que el puente devuelve en tres lecturas y lo ordena por hora. */
export function componerElDia(
  servicios: readonly FilaCitaServicio[],
  citas: readonly FilaCita[],
  clientes: readonly FilaCliente[],
  hoy: Date,
): readonly CitaDeMiDia[] {
  const porCita = new Map(citas.map((c) => [c.id, c]));
  const nombreDe = new Map(clientes.map((c) => [c.id, c.nombre]));
  const filas: CitaDeMiDia[] = [];
  for (const servicio of servicios) {
    const cita = porCita.get(servicio.cita_id);
    const cuando = cita?.agendada_para ?? null;
    if (cita === undefined || cuando === null || !esMismoDia(cuando, hoy)) continue;
    filas.push({
      id: cita.id,
      citaServicioId: servicio.id,
      folio: cita.folio,
      clienteNombre: cita.cliente_id === null ? null : (nombreDe.get(cita.cliente_id) ?? null),
      servicio: null,
      inicio: cuando,
      estado: cita.estado ?? 'agendada',
      precioPesos: servicio.precio_centavos ?? 0,
      // Hasta que la ficha exponga el campo, se busca en las notas. Un falso
      // positivo avisa de más, y en alergias ése es el error barato.
      alergias: (cita.notas ?? '').toLowerCase().includes('alergia'),
      minutosProcesado: null,
    });
  }
  return filas.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

export type Renglon =
  | { readonly clase: 'cita'; readonly cita: CitaDeMiDia }
  | {
      readonly clase: 'hueco';
      readonly desde: string;
      readonly hasta: string;
      readonly minutos: number;
    };

/** Intercala los huecos que caben entre una cita y la siguiente. */
export function conHuecos(citas: readonly CitaDeMiDia[]): readonly Renglon[] {
  const renglones: Renglon[] = [];
  citas.forEach((cita, indice) => {
    renglones.push({ clase: 'cita', cita });
    const siguiente = citas[indice + 1];
    if (siguiente === undefined) return;
    const fin = new Date(cita.inicio).getTime() + MINUTOS_NOMINALES * 60_000;
    const minutos = Math.round((new Date(siguiente.inicio).getTime() - fin) / 60_000);
    if (minutos < MINUTOS_HUECO_MINIMO) return;
    renglones.push({
      clase: 'hueco',
      desde: new Date(fin).toISOString(),
      hasta: siguiente.inicio,
      minutos,
    });
  });
  return renglones;
}

function mensajeDe(fallo: unknown, porOmision: string): string {
  return fallo instanceof Error ? fallo.message : porOmision;
}

export function MiDia({
  profesionalId,
  nombreProfesional,
  citasIniciales,
  gananciaInicial,
  onAbrirCita,
}: MiDiaProps) {
  const voc = useVocabulario();
  const router = useRouter();
  const [citas, setCitas] = useState<readonly CitaDeMiDia[] | null>(citasIniciales ?? null);
  const [ganancia, setGanancia] = useState<GananciaDelDia | null>(gananciaInicial ?? null);
  const [equipo, setEquipo] = useState<readonly ProfesionalDeLaLista[] | null>(null);
  const [yo, setYo] = useState<string | null>(profesionalId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [reloj, setReloj] = useState<Date | null>(null);

  // El reloj entra DESPUÉS del primer pintado a propósito: un `new Date()` en el
  // cuerpo daría una fecha de servidor distinta de la del navegador y la
  // hidratación no cuadraría. El latido mueve la barra de procesado sola.
  useEffect(() => {
    const marcar = () => {
      setReloj(new Date());
    };
    const primero = setTimeout(marcar, 0);
    const latido = setInterval(marcar, 60_000);
    return () => {
      clearTimeout(primero);
      clearInterval(latido);
    };
  }, []);

  useEffect(() => {
    if (citasIniciales !== undefined) return undefined;
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    if (yo === null) {
      consultarPuente<ProfesionalDeLaLista>('Profesional', { limite: 50, signal: control.signal })
        .then((filas) => {
          if (sigueMontada()) setEquipo(filas.filter((f) => f.activo !== false));
        })
        .catch((fallo: unknown) => {
          if (sigueMontada()) setError(mensajeDe(fallo, 'No se pudo leer el equipo.'));
        });
      return () => {
        control.abort();
      };
    }
    const mio = { profesional_id: yo };
    const señal = control.signal;
    Promise.all([
      consultarPuente<FilaCitaServicio>('CitaServicio', { filtro: mio, limite: 60, signal: señal }),
      consultarPuente<FilaCita>('Cita', { limite: 200, signal: señal }),
      consultarPuente<FilaCliente>('Cliente', { limite: 300, signal: señal }),
      consultarPuente<FilaComision>('ComisionCausada', { filtro: mio, limite: 60, signal: señal }),
    ])
      .then(([servicios, agenda, clientes, comisiones]) => {
        if (!sigueMontada()) return;
        const hoy = new Date();
        setCitas(componerElDia(servicios, agenda, clientes, hoy));
        const delDia = comisiones.filter(
          (c) => c.causada_en !== null && esMismoDia(c.causada_en, hoy),
        );
        setGanancia({
          comisionCentavos: delDia.reduce((suma, c) => suma + aCentavos(c.monto_centavos), 0),
          propinaCentavos: null,
          detalle: delDia.map((c) => ({
            id: c.id,
            concepto: c.motivo ?? c.tipo ?? 'Servicio',
            pesos: c.monto_centavos ?? 0,
          })),
        });
      })
      .catch((fallo: unknown) => {
        // La pantalla NUNCA se vacía por un fallo de red: prefiere el dato de
        // hace un minuto a dejarla sin saber qué sigue.
        if (sigueMontada()) setError(mensajeDe(fallo, 'No se pudo leer tu día.'));
      });
    return () => {
      control.abort();
    };
  }, [citasIniciales, yo]);

  const pendientes = useMemo(
    () => (citas ?? []).filter((c) => !CERRADAS.includes(c.estado)),
    [citas],
  );
  /**
   * `null` es «todavía no se sabe» y NO es cero. Pintar «$0.00» donde aún no
   * llega el dato le diría a la profesional que hoy no le dejaron propina, y
   * eso es lo único que no se puede decir por equivocación en esta pantalla.
   */
  const propina = ganancia?.propinaCentavos ?? null;
  const actual = pendientes.find((c) => c.estado === 'en_curso') ?? pendientes[0] ?? null;
  const resto = useMemo(
    () => conHuecos(pendientes.filter((c) => c.citaServicioId !== actual?.citaServicioId)),
    [pendientes, actual],
  );

  function abrir(citaId: string): void {
    if (onAbrirCita !== undefined) onAbrirCita(citaId);
    // La fórmula vive en CITA EN CURSO (§4.3.3); esta pantalla sólo lleva ahí.
    else router.push('/estetica-salon/cita-en-curso');
  }

  const banda =
    error === null ? null : (
      <p
        role="alert"
        className="mb-3 rounded-md border border-destructive bg-destructive/15 p-2 text-sm"
      >
        {error} · Se muestra lo último que se pudo leer.
      </p>
    );

  const encabezado = (
    <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h1 className="text-2xl font-bold">{nombreProfesional ?? 'Mi día'}</h1>
      <p className="text-sm text-muted-foreground">
        {reloj === null
          ? 'Hoy'
          : reloj.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
    </header>
  );

  const walkIn = (
    <Button
      type="button"
      className="min-h-20 w-full text-base"
      onClick={() => {
        // La walk-in se agenda en AGENDAR (§4.3.2): ahí están el servicio y la
        // hora, que es lo que el comando pide y aquí no hay de dónde sacar.
        router.push('/estetica-salon/agendar');
      }}
    >
      Tomar una walk-in
    </Button>
  );

  if (yo === null) {
    // Sin sesión que diga quién mira no se consulta nada. Ver el docblock.
    return (
      <div className="mx-auto w-full max-w-2xl p-4">
        {encabezado}
        {banda}
        <p className="mb-3 text-base">¿Quién eres? Tu día sólo lo ves tú.</p>
        {equipo === null ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {equipo.map((persona) => (
              <li key={persona.id}>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-20 w-full justify-start text-base"
                  onClick={() => {
                    setYo(persona.id);
                  }}
                >
                  {persona.nombre_corto ?? persona.nombre_completo ?? 'Sin nombre'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (citas === null) {
    return (
      <div className="mx-auto w-full max-w-6xl p-4">
        {encabezado}
        {banda}
        {/* Esqueletos con la forma de lo que llega, no un spinner: así nada
            salta al cargar y el ojo ya sabe dónde va a mirar. */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="min-h-40 w-full rounded-xl" />
          <Skeleton className="min-h-28 w-full rounded-xl" />
          <Skeleton className="min-h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      {encabezado}
      {banda}
      {/* Teléfono: una columna en el orden del documento. PC: el dinero y su
          desglose se van a la derecha, que es donde ella los verifica. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="ahora" className="xl:col-start-1 xl:row-start-1">
          <h2 id="ahora" className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Ahora
          </h2>
          {actual === null ? (
            // El vacío ENSEÑA: dice qué se puede hacer con el día por delante.
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <p className="mb-1 text-lg font-semibold">Hoy no tienes {voc.plural('orden')}.</p>
              <p className="mb-4 text-sm text-muted-foreground">
                El día entero está libre: cabe {voc.enFraseCon('un', 'linea_orden')} sin mover nada.
              </p>
              {walkIn}
            </div>
          ) : (
            <article className="rounded-xl border-2 border-primary bg-card p-4 shadow-2">
              {actual.alergias && (
                // Arriba del todo: un error aquí no es un descuadre.
                <Badge variant="destructive" className="mb-2">
                  ⚠️ Revisa alergias en su ficha
                </Badge>
              )}
              <p className="text-2xl font-bold leading-tight">
                {actual.clienteNombre ?? actual.folio ?? 'Sin nombre'}
              </p>
              <p className="mt-1 text-base text-muted-foreground">
                {actual.servicio ?? 'Servicio'} · {aHora(actual.inicio)} ·{' '}
                {enPesos(aCentavos(actual.precioPesos))}
              </p>
              {actual.minutosProcesado !== null && (
                <div className="mt-3">
                  <Progress
                    value={Math.min(100, (actual.minutosProcesado / MINUTOS_PROCESADO_TOPE) * 100)}
                    aria-label="Avance del procesado"
                  />
                  {/* La barra nunca carga sola el dato: va el número en letra. */}
                  <p className="mt-1 text-sm">Procesado · {actual.minutosProcesado} min</p>
                </div>
              )}
              <Button
                type="button"
                className="mt-4 min-h-20 w-full text-base"
                onClick={() => {
                  abrir(actual.id);
                }}
              >
                Ver fórmula
              </Button>
            </article>
          )}
        </section>

        <section aria-labelledby="ganado" className="xl:col-start-2 xl:row-start-1">
          <h2 id="ganado" className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Hoy llevas
          </h2>
          {/* Dos renglones, nunca uno, y sin total debajo: ese número no existe. */}
          <dl className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-sm">Comisión</dt>
              <dd className="text-2xl font-bold tabular-nums">
                {enPesos(ganancia?.comisionCentavos ?? 0)}
              </dd>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-border pt-2">
              <dt className="text-sm">Propina</dt>
              <dd className="text-2xl font-bold tabular-nums">
                {propina === null ? (
                  <span className="text-base font-normal text-muted-foreground">
                    sin dato todavía
                  </span>
                ) : (
                  enPesos(propina)
                )}
              </dd>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {citas.length} {citas.length === 1 ? 'cita' : 'citas'} · {pendientes.length} por
              atender
            </p>
          </dl>
        </section>

        <section aria-labelledby="sigue" className="xl:col-start-1 xl:row-start-2">
          <h2 id="sigue" className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Sigue
          </h2>
          <ul className="flex flex-col gap-2">
            {resto.map((renglon) =>
              renglon.clase === 'cita' ? (
                <li key={renglon.cita.citaServicioId}>
                  <button
                    type="button"
                    onClick={() => {
                      abrir(renglon.cita.id);
                    }}
                    className="flex min-h-20 w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="text-lg font-bold tabular-nums">
                      {aHora(renglon.cita.inicio)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {renglon.cita.servicio ?? 'Servicio'} ·{' '}
                      {renglon.cita.clienteNombre ?? renglon.cita.folio ?? 'Sin nombre'}
                    </span>
                    {renglon.cita.alergias && <span aria-label="Con alergias">⚠️</span>}
                  </button>
                </li>
              ) : (
                <li
                  key={`hueco-${renglon.desde}`}
                  className="rounded-lg border border-dashed border-primary/40 bg-primary/10 p-3"
                >
                  <p className="text-sm font-semibold">
                    {aHora(renglon.desde)}–{aHora(renglon.hasta)} · libre
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {renglon.minutos} min sin nadie. Cabe un corte.
                  </p>
                </li>
              ),
            )}
            {resto.length === 0 && (
              <li className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                Nada más después de ésta.
              </li>
            )}
          </ul>
        </section>

        {/* El desglose es el extra de tablet y PC: lo que abre para verificar un
            número antes de que le paguen. En el teléfono estorbaría. */}
        <section
          aria-labelledby="detalle"
          className="hidden md:block xl:col-start-2 xl:row-start-2"
        >
          <h2 id="detalle" className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            {voc.titulo('linea_orden')} por {voc.singular('linea_orden')}
          </h2>
          <ul className="rounded-xl border border-border bg-card p-3 text-sm">
            {(ganancia?.detalle ?? []).map((linea) => (
              <li key={linea.id} className="flex justify-between gap-2 py-1">
                <span className="min-w-0 truncate">{linea.concepto}</span>
                <span className="tabular-nums">{enPesos(aCentavos(linea.pesos))}</span>
              </li>
            ))}
            {(ganancia?.detalle ?? []).length === 0 && (
              <li className="py-1 text-muted-foreground">
                Todavía no se cierra {voc.enFraseCon('ningun', 'linea_orden')}.
              </li>
            )}
          </ul>
        </section>

        {actual !== null && <div className="xl:col-start-2 xl:row-start-3">{walkIn}</div>}
      </div>
    </div>
  );
}
