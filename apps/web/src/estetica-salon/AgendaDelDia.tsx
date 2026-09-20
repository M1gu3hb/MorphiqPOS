'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';

// La colocación de los bloques vive aparte: es aritmética pura y así se puede
// afirmar sin navegador. Ver `agenda-geometria.ts`.
import { APERTURA, aMinutos, CIERRE, posicionDe, PX } from './agenda-geometria';

/**
 * PANTALLA · estetica-salon · agenda-del-dia
 *
 * La pantalla de inicio del salón: 40–80 aperturas al día, de todo el equipo.
 * La acción principal es INICIAR LA CITA QUE SIGUE, y por eso el bloque entero
 * es el botón: no hay un menú que abrir antes.
 *
 * ── Por qué la agenda es el inicio y no un dashboard ─────────────────────
 * El salón no vende productos: vende tiempo, y el tiempo caduca en el instante
 * en que pasa. Un dashboard cuenta lo que ya ocurrió; la agenda enseña lo que
 * todavía se puede cambiar. A las 9:45 nadie pregunta cuánto se vendió ayer.
 *
 * ── El rayado del procesado: la decisión más importante del modelo ───────
 * Mientras un tinte procesa, la ESTACIÓN sigue ocupada pero la ESTILISTA está
 * libre. Si ese tramo se dibuja sólido como el resto, nadie intenta meter una
 * walk-in ahí — y ahí vive entre el 25 % y el 40 % de la capacidad real del
 * salón. El rayado con su leyenda «cabe una cita» convierte un dato de sistema
 * en una decisión comercial. Se pinta con `currentColor`: cero color literal.
 *
 * ── Tres anchos, tres layouts, no uno encogido ───────────────────────────
 * Cuatro columnas en 390 px son ilegibles y no se intentan: el TELÉFONO es una
 * lista cronológica del salón entero, que es como la mira Paty en su casa a las
 * 21:10. La TABLET es la rejilla con las columnas fijas y la línea del ahora.
 * El panel derecho sólo aparece en PC, porque quien está en PC es quien PUEDE
 * actuar sobre esa lista: llamar a la que no confirmó, ofrecer el hueco.
 *
 * ── Lo que NO va aquí ────────────────────────────────────────────────────
 * Totales, márgenes, gráficas, dinero acumulado. Esta pantalla es del tiempo.
 * Lo único monetario permitido es el VALOR DEL HUECO, porque es exactamente lo
 * que dispara la acción de llenarlo.
 *
 * ── Alcance recortado, dicho aquí y no escondido ─────────────────────────
 * Quedan FUERA: la lista de espera (tiene su propia entrada del puente), los
 * atajos de teclado, la franja de sin conexión con su cola de «llegó/no llegó»,
 * y el recorte de `ver_agenda_ajena` —que el puente ya resuelve al filtrar las
 * filas, así que aquí llega como una columna sola sin código de por medio.
 */

/** Los nueve estados del bloque. El color nunca viaja solo: cada uno da su palabra. */
const ESTADOS = {
  agendada: { nombre: 'Agendada', clase: 'bg-muted text-muted-foreground border-border' },
  sin_confirmar: { nombre: 'Sin confirmar', clase: 'bg-warning/30 border-warning' },
  en_curso: { nombre: 'En curso', clase: 'bg-primary/25 border-primary' },
  procesado: { nombre: 'Cabe una cita', clase: 'bg-primary/10 border-dashed border-primary/40' },
  cobrada: { nombre: 'Cobrada', clase: 'bg-success/30 border-success' },
  sin_cobrar: { nombre: 'SIN COBRAR', clase: 'bg-card text-card-foreground border-success' },
  no_llego: { nombre: 'No llegó', clase: 'bg-destructive/25 border-destructive' },
  apartado: { nombre: 'Apartado', clase: 'bg-muted/60 text-muted-foreground border-dashed' },
  hueco: { nombre: 'Hueco', clase: 'bg-background border-dashed border-primary/40' },
} as const;

type ClaveEstado = keyof typeof ESTADOS;

/** Los que ocupan a la PERSONA. El procesado no: ése es el punto de la pantalla. */
const OCUPAN: ReadonlySet<string> = new Set(['agendada', 'sin_confirmar', 'en_curso', 'cobrada']);

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DIA = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });

// La jornada dibujada. Mientras el horario del salón no viva en configuración,
// estas dos constantes son el marco: fuera de ellas no hay rejilla que pintar.
/** Dos píxeles por minuto: una hora mide 120 px, que es donde el texto aún cabe. */
/** Un tramo de limpieza dura 10 minutos y aun así tiene que poder leerse. */
const ALTO = (CIERRE - APERTURA) * PX;
const HORAS = Array.from({ length: (CIERRE - APERTURA) / 60 + 1 }, (_, i) => APERTURA + i * 60);
const MS_DIA = 86_400_000;
/**
 * El hueco más corto que se ofrece, en minutos.
 *
 * Media hora: por debajo de eso no cabe ningún servicio del catálogo típico, y
 * pintar los cinco minutos entre dos citas como «hueco» convierte la agenda en
 * una alfombra de huecos que nadie puede vender. Es el mismo mínimo que usa el
 * reporte de huecos del servidor.
 */
const MINIMO_HUECO_MIN = 30;
const HTTP_DEMASIADOS = 429;

/** El rayado del procesado y del tiempo apartado, con `currentColor`. */
/**
 * El rayado del bloqueo. Se apoya en `currentColor` —el color que ya trae el
 * elemento— y en `transparent`, así que no introduce ni un tono propio: la
 * textura viene de la geometría, no de la paleta.
 */
const RAYADO = {
  backgroundImage: 'repeating-linear-gradient(45deg,currentColor 0 3px,transparent 3px 9px)',
};
const BLOQUE =
  'relative flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-md border p-2 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50';
const COLUMNA = 'relative w-44 shrink-0 rounded-md border border-border xl:w-52';
const BANDA =
  'mb-3 flex flex-wrap items-center gap-2 rounded-md border border-destructive bg-destructive/10 p-2 text-sm';
const VACIO =
  'flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-8 text-center';

export interface BloqueDeAgenda {
  /** El del SERVICIO de la cita: una cita con dos servicios son dos bloques. */
  readonly id: string;
  /**
   * El de la CITA, que es otra cosa y hace falta.
   *
   * `agenda.iniciar_cita` recibe la cita, no su servicio, y tocar un bloque es lo
   * que la empieza. Con un solo `id` la pantalla mandaba el del servicio a una
   * ruta que espera el de la cita: «esa cita no existe». Nulo en los huecos, que
   * no son de nadie todavía.
   */
  readonly citaId: string | null;
  readonly profesional: string;
  /** La estación rentada no vende para el salón: su columna va en otro tono. */
  readonly renta: boolean;
  readonly inicio: string;
  readonly fin: string;
  readonly estado: string;
  readonly clienta: string | null;
  readonly servicio: string | null;
  /** Sólo en los huecos. Es lo ÚNICO monetario que esta pantalla enseña. */
  readonly valorCentavos: number | null;
  readonly alergia: boolean;
}

/** Lo que `agenda.dia` devuelve de cada servicio de cita. */
interface CitaDelComando {
  readonly citaServicioId: string;
  readonly citaId: string;
  readonly clienteId: string | null;
  readonly servicioId: string;
  /** El del SERVICIO. El de la CITA viene aparte: significan cosas distintas. */
  readonly estado: string;
  readonly estadoCita: string;
  readonly inicio: string;
  readonly fin: string;
  /** Los tramos en los que la profesional está encima. Lo de en medio es procesado. */
  readonly activos: readonly { readonly inicio: string; readonly fin: string }[];
}

interface ColumnaDelComando {
  readonly profesionalId: string;
  readonly nombreCorto: string;
  /** `empleado_comision` o `independiente_renta`. La renta se pinta aparte. */
  readonly tipoRelacion: string;
  readonly citas: readonly CitaDelComando[];
}

interface RespuestaDelDia {
  readonly fecha: string;
  readonly columnas: readonly ColumnaDelComando[];
}

interface HuecoDelComando {
  readonly profesionalId: string;
  readonly nombreCorto: string;
  readonly inicio: string;
  readonly fin: string;
  readonly minutos: number;
  readonly valorEstimadoCentavos: string;
}

interface RespuestaDeHuecos {
  readonly huecos: readonly HuecoDelComando[];
}

/** Una fila del puente de la que sólo se necesitan el id y el nombre. */
interface FilaConNombre {
  readonly id?: string;
  readonly nombre?: string;
}

/** El expediente, para la bandera de alergia. Su `id` ES el de la clienta. */
interface FilaDeExpediente {
  readonly id?: string;
  readonly alergias?: string;
}

export interface ColumnaDeAgenda {
  readonly nombre: string;
  readonly renta: boolean;
  readonly bloques: readonly BloqueDeAgenda[];
}

export interface AgendaDelDiaProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly bloquesIniciales?: readonly BloqueDeAgenda[];
  /** Falso dibuja el vacío del salón NUEVO, que tiene que enseñar otra cosa. */
  readonly hayEquipo?: boolean;
  readonly onAgendar?: () => void;
}

/**
 * 'HH:MM' LOCAL de un instante.
 *
 * La rejilla mide minutos desde medianoche, así que el bloque viaja en hora local
 * y no en ISO. Con `toISOString().slice(11,16)` la cita de las 10:00 en México
 * se pintaría a las 16:00, seis horas más abajo de donde está.
 */
export function horaLocal(iso: string): string {
  const cuando = new Date(iso);
  if (Number.isNaN(cuando.getTime())) return '00:00';
  return `${String(cuando.getHours()).padStart(2, '0')}:${String(cuando.getMinutes()).padStart(2, '0')}`;
}

/** El día siguiente de una fecha 'YYYY-MM-DD'. El rango de huecos es medio abierto. */
export function diaSiguiente(fecha: string): string {
  const cuando = new Date(`${fecha}T12:00:00Z`);
  cuando.setUTCDate(cuando.getUTCDate() + 1);
  return cuando.toISOString().slice(0, 10);
}

/**
 * EL ESTADO VISUAL de un bloque, a partir de los dos estados reales.
 *
 * ── Por qué `agendada` se pinta «sin confirmar» ───────────────────────────
 * Porque en la base son dos estados distintos y en un salón significan cosas
 * distintas: `agendada` es «alguien apuntó la cita» y `confirmada` es «la clienta
 * dijo que sí viene». La segunda es la que se pinta tranquila; la primera lleva
 * el aviso, porque es la que hay que confirmar antes de que se convierta en un
 * hueco de hora y media.
 *
 * ── Y por qué `terminada` se pinta SIN COBRAR ─────────────────────────────
 * Porque es exactamente eso: el servicio está cerrado y el dinero no ha entrado.
 * Es el bloque que la recepcionista tiene que mirar antes de que la clienta salga
 * por la puerta.
 */
export function estadoVisual(cita: CitaDelComando, ahoraMs: number | null): ClaveEstado | null {
  const estadoDeLaCita = cita.estadoCita;
  if (estadoDeLaCita === 'cancelada') return null;
  if (estadoDeLaCita === 'no_llego') return 'no_llego';
  if (estadoDeLaCita === 'cobrada' || cita.estado === 'cobrado') return 'cobrada';
  if (estadoDeLaCita === 'terminada' || cita.estado === 'cerrado') return 'sin_cobrar';
  if (estadoDeLaCita === 'en_curso') {
    // EL PROCESADO, que es la decisión más importante de esta pantalla: si el
    // reloj cae FUERA de los tramos activos, la profesional está libre y ahí
    // cabe otra cita. Sin esto la agenda se ve llena a las once con hueco para
    // un corte, que es el dinero que este modelo viene a recuperar.
    const dentro =
      ahoraMs !== null &&
      cita.activos.some(
        (a) => new Date(a.inicio).getTime() <= ahoraMs && ahoraMs < new Date(a.fin).getTime(),
      );
    const empezado = ahoraMs !== null && new Date(cita.inicio).getTime() <= ahoraMs;
    return empezado && !dentro && cita.activos.length > 1 ? 'procesado' : 'en_curso';
  }
  return estadoDeLaCita === 'confirmada' ? 'agendada' : 'sin_confirmar';
}

/** Un mapa id → nombre de lo que el puente devolvió, o vacío si se cayó. */
function nombres(
  resultado: PromiseSettledResult<readonly FilaConNombre[]>,
): ReadonlyMap<string, string> {
  if (resultado.status !== 'fulfilled') return new Map();
  return new Map(
    resultado.value
      .filter((f) => (f.id ?? '') !== '' && (f.nombre ?? '') !== '')
      .map((f) => [f.id ?? '', f.nombre ?? '']),
  );
}

/**
 * Si el expediente declara una alergia DE VERDAD.
 *
 * El campo es obligatorio «aunque sea ninguna conocida», así que el texto vacío y
 * el «ninguna» significan lo mismo: no hay bandera. Tratar cualquier texto como
 * alergia pondría el triángulo en todas las citas y entonces no avisa de nada.
 */
function tieneAlergia(texto: string | undefined): boolean {
  const limpio = (texto ?? '').trim().toLowerCase();
  if (limpio === '') return false;
  return !['ninguna', 'ninguna conocida', 'no', 'no tiene', 'sin alergias', '-'].includes(limpio);
}

export function esEstado(valor: string): valor is ClaveEstado {
  return valor in ESTADOS;
}

const aHora = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const ordenar = (bs: readonly BloqueDeAgenda[]): readonly BloqueDeAgenda[] =>
  [...bs].sort((a, b) => aMinutos(a.inicio) - aMinutos(b.inicio));

/** Una columna por profesional, ordenadas por nombre y cada una por hora. */
export function porProfesional(bloques: readonly BloqueDeAgenda[]): readonly ColumnaDeAgenda[] {
  return [...new Set(bloques.map((b) => b.profesional))]
    .sort((a, b) => a.localeCompare(b, 'es-MX'))
    .map((nombre) => {
      const suyos = bloques.filter((b) => b.profesional === nombre);
      return { nombre, renta: suyos.some((b) => b.renta), bloques: ordenar(suyos) };
    });
}

/** Lo del encabezado. La ocupación mide a la PERSONA, no a la estación. */
export function resumenDe(bloques: readonly BloqueDeAgenda[]) {
  const huecos = bloques.filter((b) => b.estado === 'hueco');
  const jornada = new Set(bloques.map((b) => b.profesional)).size * (CIERRE - APERTURA);
  const activos = bloques.filter((b) => OCUPAN.has(b.estado));
  const ocupados = activos.reduce((s, b) => s + aMinutos(b.fin) - aMinutos(b.inicio), 0);
  return {
    citas: bloques.filter((b) => b.estado !== 'hueco' && b.estado !== 'apartado').length,
    ocupacion: jornada === 0 ? 0 : Math.round((ocupados / jornada) * 100),
    huecos,
    valor: huecos.reduce((s, b) => s + (b.valorCentavos ?? 0), 0),
  };
}

/** Dónde cae el bloque dentro de su columna, recortado a la jornada dibujada. */
function mensajeDe(fallo: unknown): string {
  if (!(fallo instanceof ErrorApi)) return 'No se pudo cargar la agenda.';
  if (fallo.estado === HTTP_DEMASIADOS) return 'Demasiados intentos. Espera un momento.';
  if (fallo.error.codigo === 'CONFLICTO_ESTADO') return 'Esa cita ya no está para iniciar.';
  if (fallo.error.codigo === 'SIN_PERMISO') return 'Tu usuario no puede iniciar citas.';
  return fallo.error.mensaje;
}

export interface BloqueProps {
  readonly bloque: BloqueDeAgenda;
  readonly ocupado?: boolean;
  readonly onTocar?: () => void;
}

/** El bloque, idéntico en la rejilla y en la lista: una sola verdad visual. */
export function Bloque({ bloque, ocupado = false, onTocar }: BloqueProps) {
  const estado = esEstado(bloque.estado) ? ESTADOS[bloque.estado] : ESTADOS.agendada;
  const rayado = bloque.estado === 'procesado' || bloque.estado === 'apartado';
  const minutos = aMinutos(bloque.fin) - aMinutos(bloque.inicio);
  const valor =
    bloque.valorCentavos === null ? '' : ` · ~${PESOS.format(bloque.valorCentavos / 100)}`;
  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={onTocar}
      className={`${BLOQUE} ${estado.clase}`}
    >
      {rayado && <span aria-hidden className="absolute inset-0 opacity-25" style={RAYADO} />}
      <span className="relative flex items-baseline gap-2">
        <span className="text-sm font-bold tabular-nums">{bloque.inicio}</span>
        <span className="truncate text-xs font-semibold uppercase">{estado.nombre}</span>
        {/* Esquina propia: un error aquí no es un descuadre, es una quemadura. */}
        {bloque.alergia && (
          <span className="ml-auto" aria-label="Alergia en el expediente">
            🔺
          </span>
        )}
      </span>
      {bloque.clienta !== null && (
        <span className="relative truncate text-sm">{bloque.clienta}</span>
      )}
      {bloque.servicio !== null && (
        <span className="relative truncate text-xs">{bloque.servicio}</span>
      )}
      {bloque.estado === 'hueco' && (
        <span className="relative text-xs font-semibold">
          {minutos} min{valor} · llenar ▸
        </span>
      )}
    </button>
  );
}

export function AgendaDelDia({ bloquesIniciales, hayEquipo = true, onAgendar }: AgendaDelDiaProps) {
  const enrutador = useRouter();
  const [bloques, setBloques] = useState<readonly BloqueDeAgenda[] | null>(
    bloquesIniciales ?? null,
  );
  const [ahoraMs, setAhoraMs] = useState<number | null>(null);
  const [dia, setDia] = useState(0);
  const [soloDe, setSoloDe] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const linea = useRef<HTMLDivElement>(null);
  const centrada = useRef(false);

  // El reloj arranca DESPUÉS del montaje, nunca en el cuerpo del efecto: si el
  // servidor pinta una hora y el navegador otra, la hidratación se rompe.
  useEffect(() => {
    const marcar = () => {
      setAhoraMs(Date.now());
    };
    const primera = setTimeout(marcar, 0);
    const cada = setInterval(marcar, 60_000);
    return () => {
      clearTimeout(primera);
      clearInterval(cada);
    };
  }, []);

  const msDia = ahoraMs === null ? null : ahoraMs + dia * MS_DIA;
  // La fecha se arma con las partes LOCALES y no con `toISOString`: a las 21:10
  // en México el día en UTC ya es el siguiente y la agenda se leería vacía.
  const fecha = msDia === null ? null : fechaLocal(msDia);

  useEffect(() => {
    if (bloquesIniciales !== undefined || fecha === null) return;
    const control = new AbortController();
    // Si sigue montada se pregunta con una FUNCIÓN y no con un centinela: un
    // `let vivo = true` el compilador lo da por siempre-verdadero.
    const sigueMontada = () => !control.signal.aborted;
    const opciones = { signal: control.signal };

    /**
     * LA AGENDA SALE DE SUS DOS COMANDOS, no de dos entidades del puente.
     *
     * ── El defecto que esto arregla ───────────────────────────────────────
     * Esta pantalla pedía `Cita` y `HuecoDisponible` esperando filas con forma de
     * BLOQUE —con su profesional, su hora de inicio y su hora de fin—. `Cita` no
     * la tiene: trae `agendada_para`, `cliente_id` y `folio`, y el rango del
     * servicio vive en un `tstzrange` que el puente no sabe leer.
     * `HuecoDisponible` no existía en absoluto. Resultado medido: la pantalla
     * principal de un salón decía «Hoy no hay citas todavía» con las citas
     * agendadas y en la base.
     *
     * Y los dos comandos que sirven exactamente esto EXISTÍAN desde la fase 2, con
     * su ruta: `agenda.dia` arma las columnas —una por profesional, con sus citas,
     * sus tramos activos, sus bloqueos y sus ventanas de horario— y `agenda.huecos`
     * calcula los huecos vendibles, incluidos los INTERCALADOS en el procesado de
     * otra cita, que es la capacidad que nadie más ve. Reimplementar eso en el
     * puente habría sido una segunda verdad sobre la misma agenda.
     *
     * Los NOMBRES se piden aparte porque los comandos devuelven identificadores:
     * la clienta y el servicio salen del puente, que es quien sabe de catálogo. Y
     * las ALERGIAS del expediente, porque un error ahí no es un descuadre.
     */
    Promise.allSettled([
      invocarComando<RespuestaDelDia>('/api/agenda/dia', { fecha }, opciones),
      invocarComando<RespuestaDeHuecos>(
        '/api/agenda/huecos',
        // El rango es medio abierto: `desde` incluido, `hasta` excluido.
        { desde: fecha, hasta: diaSiguiente(fecha), minutos: MINIMO_HUECO_MIN },
        opciones,
      ),
      consultarPuente<FilaConNombre>('Cliente', { limite: 400, signal: control.signal }),
      consultarPuente<FilaConNombre>('ProductoTerminado', { limite: 400, signal: control.signal }),
      consultarPuente<FilaDeExpediente>('ExpedienteBelleza', {
        limite: 400,
        signal: control.signal,
      }),
    ])
      .then(([dia, huecos, clientas, servicios, expedientes]) => {
        if (!sigueMontada()) return;

        const nombreDeClienta = nombres(clientas);
        const nombreDeServicio = nombres(servicios);
        const conAlergia =
          expedientes.status === 'fulfilled'
            ? new Set(
                expedientes.value
                  .filter((e) => tieneAlergia(e.alergias))
                  .map((e) => e.id ?? '')
                  .filter((id) => id !== ''),
              )
            : new Set<string>();

        const pintables: BloqueDeAgenda[] = [];
        if (dia.status === 'fulfilled') {
          for (const columna of dia.value.columnas) {
            for (const cita of columna.citas) {
              const estado = estadoVisual(cita, ahoraMs);
              // Una cita cancelada no se pinta: su hueco lo ofrece `agenda.huecos`,
              // que es quien sabe si de verdad quedó libre.
              if (estado === null) continue;
              pintables.push({
                id: cita.citaServicioId,
                citaId: cita.citaId,
                profesional: columna.nombreCorto,
                renta: columna.tipoRelacion === 'independiente_renta',
                inicio: horaLocal(cita.inicio),
                fin: horaLocal(cita.fin),
                estado,
                clienta: nombreDeClienta.get(cita.clienteId ?? '') ?? null,
                servicio: nombreDeServicio.get(cita.servicioId) ?? null,
                // El dinero de una cita no se pinta en la agenda: lo único
                // monetario de esta pantalla es lo que CUESTA un hueco.
                valorCentavos: null,
                alergia: cita.clienteId !== null && conAlergia.has(cita.clienteId),
              });
            }
          }
        }
        if (huecos.status === 'fulfilled') {
          for (const hueco of huecos.value.huecos) {
            pintables.push({
              // El hueco no es una fila de nada: su clave es su sitio, que es
              // único —una persona no tiene dos huecos que empiecen a la vez—.
              id: `hueco-${hueco.profesionalId}-${hueco.inicio}`,
              citaId: null,
              profesional: hueco.nombreCorto,
              renta: false,
              inicio: horaLocal(hueco.inicio),
              fin: horaLocal(hueco.fin),
              estado: 'hueco',
              clienta: null,
              servicio: null,
              valorCentavos: Number(hueco.valorEstimadoCentavos),
              alergia: false,
            });
          }
        }
        setBloques(pintables);

        // El aviso nombra la fuente que falló, porque «no se pudo cargar» sobre
        // una pantalla con citas dentro manda a buscar donde no está.
        const caidas = [
          dia.status === 'rejected' ? `citas: ${mensajeDe(dia.reason)}` : null,
          huecos.status === 'rejected' ? `huecos: ${mensajeDe(huecos.reason)}` : null,
          clientas.status === 'rejected' ? 'los nombres de las clientas' : null,
          servicios.status === 'rejected' ? 'los nombres de los servicios' : null,
          expedientes.status === 'rejected' ? 'las alergias del expediente' : null,
        ].filter((x): x is string => x !== null);
        setError(caidas.length === 0 ? null : `No se pudo leer ${caidas.join(' · ')}.`);
      })
      .catch(() => {
        // `allSettled` no rechaza: esto es para un fallo del propio `then`, que
        // dejaría la pantalla en su esqueleto para siempre.
        if (sigueMontada()) {
          setBloques([]);
          setError('No se pudo armar la agenda.');
        }
      });

    return () => {
      control.abort();
    };
    // `ahoraMs` NO va en las dependencias: cambia cada minuto y volvería a pedir
    // la agenda entera sesenta veces por hora. El reloj sólo decide el rayado del
    // procesado, y eso se recalcula al siguiente refresco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloquesIniciales, fecha, intento]);

  // La vista arranca centrada en la línea del ahora, y sólo la primera vez: que
  // se reacomodara sola cada minuto sería insoportable.
  useEffect(() => {
    if (centrada.current || linea.current === null) return;
    centrada.current = true;
    linea.current.scrollIntoView({ block: 'center' });
  }, [ahoraMs]);

  const minutosAhora = ahoraMs === null || dia !== 0 ? null : minutosDe(ahoraMs);
  const horaAhora = minutosAhora === null ? null : aHora(minutosAhora);
  const columnas = porProfesional(bloques ?? []);
  const resumen = resumenDe(bloques ?? []);
  const enOrden = ordenar(
    (bloques ?? []).filter((b) => soloDe === null || b.profesional === soloDe),
  );
  const iAhora =
    minutosAhora === null ? -1 : enOrden.findIndex((b) => aMinutos(b.inicio) >= minutosAhora);
  const sinConfirmar = (bloques ?? []).filter((b) => b.estado === 'sin_confirmar');

  const irAAgendar = () => {
    if (onAgendar !== undefined) onAgendar();
    else enrutador.push('/estetica-salon/agendar');
  };

  /**
   * TOCAR UN BLOQUE: lo que hace la recepcionista con el dedo.
   *
   * Tres cosas distintas según lo que haya debajo, y ninguna es un menú:
   *
   * - un HUECO lleva a agendar, que es para lo que sirve un hueco;
   * - una cita POR EMPEZAR se inicia y se entra a ella. Iniciar es lo que arranca
   *   los dos relojes —cuánto esperó la clienta y cuánto duró el servicio— y
   *   entrar es lo que permite cerrar el servicio después, que es lo único que
   *   deja la cita `terminada` y por tanto cobrable;
   * - una cita YA EMPEZADA se abre directo: iniciar dos veces contesta «esa cita
   *   ya no estaba por empezar», que es un error que no ayuda a nadie.
   *
   * ── El id que se manda ────────────────────────────────────────────────────
   * El de la CITA, no el del bloque. El bloque es un SERVICIO de la cita —una
   * cita con tinte y corte son dos bloques— y `agenda.iniciar_cita` recibe la
   * cita. Mandar el del servicio contestaba «esa cita no existe en este negocio».
   */
  const tocar = async (b: BloqueDeAgenda) => {
    if (b.estado === 'hueco' || b.estado === 'apartado' || b.citaId === null) {
      irAAgendar();
      return;
    }
    const citaId = b.citaId;
    const enLaCita = `/estetica-salon/cita-en-curso?cita=${encodeURIComponent(citaId)}`;

    // Ya empezada —o terminada, o cobrada—: se entra, no se vuelve a iniciar.
    if (b.estado !== 'agendada' && b.estado !== 'sin_confirmar') {
      enrutador.push(enLaCita);
      return;
    }

    setOcupado(b.id);
    try {
      await invocarComando<unknown>(`/api/citas/${citaId}/iniciar`, {});
      setError(null);
      // Y se entra a la cita: es donde se captura la fórmula y se cierra el
      // servicio. Dejar a la recepcionista en la rejilla con la cita en curso era
      // dejar el resto del recorrido sin puerta.
      enrutador.push(enLaCita);
    } catch (fallo: unknown) {
      setError(mensajeDe(fallo));
    } finally {
      setOcupado(null);
    }
  };

  const mover = (n: number) => () => {
    setDia(dia + n);
  };
  const filtrar = (n: string | null) => () => {
    setSoloDe(n);
  };
  const alTocar = (b: BloqueDeAgenda) => () => {
    void tocar(b);
  };
  const reintentar = () => {
    setError(null);
    setIntento(intento + 1);
  };

  const encabezado = (
    <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">{msDia === null ? 'Agenda' : DIA.format(msDia)}</h1>
        {dia === 0 ? <Badge variant="secondary">Hoy</Badge> : null}
        <Button size="icon-sm" variant="outline" aria-label="Día anterior" onClick={mover(-1)}>
          ‹
        </Button>
        <Button size="icon-sm" variant="outline" aria-label="Día siguiente" onClick={mover(1)}>
          ›
        </Button>
        {dia === 0 ? null : (
          <Button size="sm" variant="ghost" onClick={mover(-dia)}>
            Hoy
          </Button>
        )}
      </div>
      <p className="text-sm tabular-nums text-muted-foreground">
        {resumen.citas} citas · {resumen.ocupacion}% ocupado · {resumen.huecos.length} huecos
      </p>
    </header>
  );

  const banda =
    error === null ? null : (
      <p role="alert" className={BANDA}>
        {error} Se muestra la última versión conocida.
        <Button size="xs" variant="outline" onClick={reintentar}>
          Reintentar
        </Button>
      </p>
    );

  // La estructura del día no cambia: se dibuja de inmediato con sus columnas.
  // Un spinner en el centro no diría nada que la rejilla no diga mejor.
  if (bloques === null) {
    return (
      <div className="p-3">
        {encabezado}
        <div className="flex gap-2" style={{ height: '20rem' }}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="flex-1 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (bloques.length === 0) {
    return (
      <div className="p-3">
        {encabezado}
        {banda}
        <div className={VACIO}>
          <p className="text-lg font-semibold">
            {hayEquipo ? 'Hoy no hay citas todavía.' : 'Primero da de alta a tu equipo.'}
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            {hayEquipo
              ? 'El día está entero, y eso es una oportunidad: el hueco de las 3 pm no se recupera mañana.'
              : 'Cada profesional es una columna de esta rejilla. Sin ninguno, la cita no tiene dónde caer.'}
          </p>
          <Button size="lg" onClick={irAAgendar}>
            {hayEquipo ? 'Agendar' : 'Dar de alta al equipo'}
          </Button>
          {hayEquipo ? (
            <Button variant="ghost" onClick={mover(1)}>
              Abrir la agenda de mañana ›
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 pb-24">
      {encabezado}
      {banda}

      {/* TELÉFONO · lista cronológica del salón entero, con su filtro rápido. */}
      <nav
        aria-label="Filtrar por profesional"
        className="mb-2 flex gap-1 overflow-x-auto md:hidden"
      >
        <Button size="sm" variant={soloDe === null ? 'default' : 'ghost'} onClick={filtrar(null)}>
          Todo
        </Button>
        {columnas.map((c) => (
          <Button
            key={c.nombre}
            size="sm"
            variant={soloDe === c.nombre ? 'default' : 'ghost'}
            onClick={filtrar(c.nombre)}
          >
            {c.nombre}
          </Button>
        ))}
      </nav>
      <ol className="flex flex-col gap-2 md:hidden">
        {enOrden.map((b, i) => (
          <li key={b.id} className="flex flex-col gap-1">
            {i === iAhora && horaAhora !== null ? (
              <span className="flex items-center gap-2 text-xs font-bold text-primary">
                <span aria-hidden className="h-0.5 flex-1 bg-primary" /> Ahora · {horaAhora}
                <span aria-hidden className="h-0.5 flex-1 bg-primary" />
              </span>
            ) : null}
            <Badge variant="outline">
              {b.profesional}
              {b.renta ? ' · renta' : ''}
            </Badge>
            <Bloque bloque={b} ocupado={ocupado === b.id} onTocar={alTocar(b)} />
          </li>
        ))}
      </ol>

      {/* TABLET y PC · la rejilla. Encabezado y cuerpo son dos filas paralelas
          con los mismos anchos: así las columnas cuadran sin un segundo marcado
          y los nombres se quedan pegados arriba mientras las horas corren. */}
      <div className="hidden gap-3 md:flex">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="min-w-max">
            <div className="sticky top-0 z-20 flex gap-2 bg-background pb-1">
              <span className="w-10 shrink-0" />
              {columnas.map((c) => (
                <h2
                  key={c.nombre}
                  className="flex w-44 shrink-0 gap-1 truncate text-sm font-bold xl:w-52"
                >
                  {c.nombre}
                  {c.renta ? <Badge variant="outline">renta</Badge> : null}
                </h2>
              ))}
            </div>
            <div className="relative flex gap-2">
              <ol className="relative w-10 shrink-0" style={{ height: `${ALTO}px` }}>
                {HORAS.map((m) => (
                  <li
                    key={m}
                    className="absolute text-xs tabular-nums text-muted-foreground"
                    style={{ top: `${(m - APERTURA) * PX}px` }}
                  >
                    {aHora(m)}
                  </li>
                ))}
              </ol>
              {columnas.map((c) => (
                <ol
                  key={c.nombre}
                  className={`${COLUMNA} ${c.renta ? 'bg-muted/40' : 'bg-card'}`}
                  style={{ height: `${ALTO}px` }}
                >
                  {/* Sin `inset-x-1`: el ancho lo decide `posicionDe`, que parte la
                      columna cuando un hueco se cruza con una cita. */}
                  {c.bloques.map((b) => (
                    <li key={b.id} className="absolute" style={posicionDe(b, c.bloques)}>
                      <Bloque bloque={b} ocupado={ocupado === b.id} onTocar={alTocar(b)} />
                    </li>
                  ))}
                </ol>
              ))}
              {minutosAhora === null || horaAhora === null ? null : (
                <div
                  ref={linea}
                  className="pointer-events-none absolute inset-x-0 z-10 flex border-t-2 border-primary"
                  style={{ top: `${(minutosAhora - APERTURA) * PX}px` }}
                >
                  <Badge className="tabular-nums">Ahora · {horaAhora}</Badge>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PC · el panel de quien puede actuar sobre esta lista. */}
        <aside aria-label="Pendientes de hoy" className="hidden w-80 shrink-0 xl:block">
          <h2 className="mb-1 text-sm font-semibold">Sin confirmar ({sinConfirmar.length})</h2>
          <ul className="mb-3 flex flex-col gap-1">
            {sinConfirmar.map((b) => (
              <li key={b.id} className="truncate rounded-md border border-warning p-1 text-xs">
                {b.inicio} · {b.profesional} · {b.clienta ?? 'sin nombre'}
              </li>
            ))}
          </ul>
          <h2 className="mb-1 text-sm font-semibold">
            Huecos ({resumen.huecos.length}) · ~{PESOS.format(resumen.valor / 100)}
          </h2>
          <ul className="flex flex-col gap-1">
            {resumen.huecos.map((b) => (
              <li key={b.id}>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={alTocar(b)}
                >
                  {b.inicio} · {b.profesional} · {aMinutos(b.fin) - aMinutos(b.inicio)} min
                </Button>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {/* Fijo abajo, a la altura del pulgar de quien sostiene la tablet. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background p-2">
        <Button size="lg" className="w-full md:mx-auto md:w-64" onClick={irAAgendar}>
          + Agendar
        </Button>
      </div>
    </div>
  );
}

const minutosDe = (ms: number) => new Date(ms).getHours() * 60 + new Date(ms).getMinutes();

function fechaLocal(ms: number): string {
  const d = new Date(ms);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${String(d.getDate()).padStart(2, '0')}`;
}
