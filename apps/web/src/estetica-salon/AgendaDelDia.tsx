'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, TriangleAlert, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type Ref } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

// La colocación de los bloques vive aparte: es aritmética pura y así se puede
// afirmar sin navegador. Ver `agenda-geometria.ts`.
import { APERTURA, aMinutos, CIERRE, posicionDe, PX } from './agenda-geometria';

/** El vocabulario, como lo devuelve el gancho: los ayudantes de abajo lo reciben. */
type Vocabulario = ReturnType<typeof useVocabulario>;

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
 * ── La rejilla es su propio marco de scroll ──────────────────────────────
 * «El encabezado con los nombres no se va nunca» y, con cinco columnas o más,
 * la columna de las horas tampoco. Las dos cosas son `sticky`, y `sticky` se
 * pega al contenedor que hace scroll: por eso la rejilla es una `Superficie` con
 * alto propio y su scroll dentro, no una tira que empuja la página. Con la
 * página como contenedor, los nombres se iban con la primera hora.
 *
 * ── Lo que NO va aquí ────────────────────────────────────────────────────
 * Totales, márgenes, gráficas, dinero acumulado. Esta pantalla es del tiempo.
 * Lo único monetario permitido es el VALOR DEL HUECO, porque es exactamente lo
 * que dispara la acción de llenarlo.
 *
 * ── Alcance recortado, dicho aquí y no escondido ─────────────────────────
 * Quedan FUERA: la lista de espera (tiene su propia entrada del puente), los
 * atajos de teclado, la franja de sin conexión con su cola de «llegó/no llegó»,
 * el cajón de pendientes de la tablet, y el recorte de `ver_agenda_ajena` —que
 * el puente ya resuelve al filtrar las filas, así que aquí llega como una
 * columna sola sin código de por medio.
 */

/**
 * Cómo se ve cada uno de los nueve estados del bloque.
 *
 * El color nunca viaja solo: cada estado da además su PALABRA, y los dos que no
 * ocupan a la persona —el procesado y el tiempo apartado— su rayado. Las citas se
 * levantan un nivel y el tiempo sin cita —el hueco, el procesado, lo apartado—
 * queda al ras: así se distingue de lejos lo que ya tiene nombre de lo que
 * todavía se puede vender.
 */
interface AspectoDeEstado {
  readonly nombre: string;
  /** Fondo y borde del bloque. */
  readonly tinte: string;
  /** El color de la palabra del estado. */
  readonly palabra: string;
  readonly nivel: 0 | 1;
  /** El color del rayado, o `null` si el tramo es sólido. */
  readonly rayado: string | null;
}

const ESTADOS = {
  agendada: {
    nombre: 'Agendada',
    tinte: 'border-borde-fuerte bg-fondo-sutil',
    palabra: 'text-texto-sutil',
    nivel: 1,
    rayado: null,
  },
  sin_confirmar: {
    nombre: 'Sin confirmar',
    tinte: 'border-advertencia bg-advertencia/25',
    palabra: 'text-texto',
    nivel: 1,
    rayado: null,
  },
  en_curso: {
    nombre: 'En curso',
    tinte: 'border-primario bg-primario/20',
    palabra: 'text-texto',
    nivel: 1,
    rayado: null,
  },
  // «Cabe una cita» lleva el sustantivo del giro y por eso se resuelve al pintar:
  // en una barbería cabe un CORTE y en un spa una SESIÓN. Ver `nombreDelEstado`.
  procesado: {
    nombre: 'Cabe una cita',
    tinte: 'border-dashed border-primario/60 bg-primario/5',
    palabra: 'text-primario',
    nivel: 0,
    rayado: 'text-primario',
  },
  cobrada: {
    nombre: 'Cobrada',
    tinte: 'border-exito/60 bg-exito/20',
    palabra: 'text-texto-sutil',
    nivel: 1,
    rayado: null,
  },
  // El que hay que ver: el servicio se dio y el dinero no entró. Borde doble y la
  // palabra en mayúsculas, para que se lea antes de que la clienta salga.
  sin_cobrar: {
    nombre: 'SIN COBRAR',
    tinte: 'border-2 border-exito bg-superficie',
    palabra: 'text-exito',
    nivel: 1,
    rayado: null,
  },
  no_llego: {
    nombre: 'No llegó',
    tinte: 'border-peligro bg-peligro/15',
    palabra: 'text-peligro',
    nivel: 1,
    rayado: null,
  },
  apartado: {
    nombre: 'Apartado',
    tinte: 'border-dashed border-borde bg-fondo-sutil text-texto-sutil',
    palabra: 'text-texto-sutil',
    nivel: 0,
    rayado: 'text-texto-sutil',
  },
  hueco: {
    nombre: 'Hueco',
    tinte: 'border-dashed border-primario/60 bg-fondo',
    palabra: 'text-primario',
    nivel: 0,
    rayado: null,
  },
} as const satisfies Readonly<Record<string, AspectoDeEstado>>;

type ClaveEstado = keyof typeof ESTADOS;

/** Los que ocupan a la PERSONA. El procesado no: ése es el punto de la pantalla. */
const OCUPAN: ReadonlySet<string> = new Set(['agendada', 'sin_confirmar', 'en_curso', 'cobrada']);

const DIA = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });

// La jornada dibujada. Mientras el horario del salón no viva en configuración,
// `APERTURA` y `CIERRE` son el marco: fuera de ellas no hay rejilla que pintar.
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

/** El envoltorio de la pantalla en sus cuatro estados. */
const MARCO = 'flex flex-col gap-(--espacio-3) p-(--espacio-3)';
/**
 * El ancho de una columna de profesional, idéntico en el encabezado y en el cuerpo:
 * son dos filas paralelas y sólo cuadran si miden lo mismo. Crecen hasta llenar el
 * ancho y nunca bajan de lo que un nombre y una hora necesitan.
 */
const ANCHO = 'min-w-44 flex-1 xl:min-w-52';
/**
 * El alto de la rejilla: tres cuartos de la ventana. Deja arriba el encabezado del
 * día y abajo la barra de agendar, y sigue siendo el mismo en el esqueleto para que
 * nada salte al llegar los datos.
 */
const ALTO_DEL_MARCO = 'max-h-[75dvh]';

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

/**
 * Se leyó la agenda y se cayó una fuente de al lado. `sinAlergias` sube el tono:
 * sin el expediente, el triángulo rojo no aparece y nada en la rejilla lo dice.
 */
interface AvisoDeLectura {
  readonly titulo: string;
  readonly sinAlergias: boolean;
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

type ResumenDelDia = ReturnType<typeof resumenDe>;

/**
 * El fallo, en palabras del GIRO.
 *
 * Los mensajes de abajo llevan «cita», que es el sustantivo del salón: en una
 * barbería es un corte y en un taller una orden. Es la pantalla de INICIO de este
 * modelo —se abre de cuarenta a ochenta veces al día— así que es donde más se nota.
 * `respaldo` es lo que se dice cuando el fallo no trae palabras propias: no es lo
 * mismo no poder LEER la agenda que no poder INICIAR una cita.
 */
function mensajeDe(
  fallo: unknown,
  voc: Vocabulario,
  respaldo = 'No se pudo cargar la agenda.',
): string {
  if (!(fallo instanceof ErrorApi)) return respaldo;
  if (fallo.estado === HTTP_DEMASIADOS) return 'Demasiados intentos. Espera un momento.';
  if (fallo.error.codigo === 'CONFLICTO_ESTADO')
    return `${voc.conDeterminante('ese', 'orden')} ya no está para iniciar.`;
  if (fallo.error.codigo === 'SIN_PERMISO')
    return `Tu usuario no puede iniciar ${voc.plural('orden')}.`;
  return fallo.error.mensaje;
}

/** El nombre del estado, con el sustantivo del giro donde lo lleva. */
function nombreDelEstado(estado: { readonly nombre: string }, voc: Vocabulario): string {
  return estado.nombre === 'Cabe una cita'
    ? `Cabe ${voc.enFraseCon('un', 'orden')}`
    : estado.nombre;
}

/**
 * EL RAYADO del procesado y del tiempo apartado.
 *
 * Un patrón de SVG pintado con `currentColor`: no trae ni un tono propio —el color
 * lo pone la clase de quien lo usa— y la textura sale de la geometría, no de la
 * paleta. El `id` sale de `useId` porque el mismo bloque se pinta dos veces a la
 * vez —la lista del teléfono y la rejilla— y dos patrones con el mismo `id` se pisan.
 */
function Rayado({ className }: { readonly className: string }) {
  const id = useId();
  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 size-full opacity-25 ${className}`}
    >
      <defs>
        <pattern
          id={id}
          width="9"
          height="9"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="3" height="9" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

export interface BloqueProps {
  readonly bloque: BloqueDeAgenda;
  readonly ocupado?: boolean;
  /** En la lista del teléfono no hay columnas: el bloque dice de quién es. */
  readonly conProfesional?: boolean;
  readonly onTocar?: () => void;
}

/**
 * El bloque, idéntico en la rejilla y en la lista: una sola verdad visual.
 *
 * Es una `Superficie` que se toca, con la HORA primero y la clienta después: es el
 * orden en que la recepcionista lo lee, y el nombre accesible del botón sale en ese
 * mismo orden.
 */
export function Bloque({ bloque, ocupado = false, conProfesional = false, onTocar }: BloqueProps) {
  const voc = useVocabulario();
  const estado = esEstado(bloque.estado) ? ESTADOS[bloque.estado] : ESTADOS.agendada;
  const minutos = aMinutos(bloque.fin) - aMinutos(bloque.inicio);
  return (
    <Superficie
      como="button"
      type="button"
      interactiva
      nivel={estado.nivel}
      radio="md"
      relleno={0}
      disabled={ocupado}
      aria-busy={ocupado}
      onClick={onTocar}
      className={`relative flex h-full w-full flex-col gap-0.5 overflow-hidden px-(--espacio-2) py-(--espacio-1) ${estado.tinte}`}
    >
      {estado.rayado === null ? null : <Rayado className={estado.rayado} />}
      <span className="relative flex min-w-0 items-baseline gap-(--espacio-2)">
        <span className="font-numeros text-sm font-bold tabular-nums">{bloque.inicio}</span>
        {conProfesional ? (
          <span className="truncate text-sm font-semibold">
            {bloque.profesional}
            {bloque.renta ? ' · renta' : ''}
          </span>
        ) : null}
        <span
          className={`truncate text-xs font-semibold tracking-wide uppercase ${estado.palabra}`}
        >
          {nombreDelEstado(estado, voc)}
        </span>
        {/* Esquina propia: un error aquí no es un descuadre, es una quemadura. */}
        {bloque.alergia ? (
          <TriangleAlert
            aria-label="Alergia en el expediente"
            className="ml-auto size-4 shrink-0 self-center text-peligro"
          />
        ) : null}
      </span>
      {bloque.clienta === null ? null : (
        <span className="relative truncate text-sm font-medium">{bloque.clienta}</span>
      )}
      {bloque.servicio === null ? null : (
        <span className="relative truncate text-xs">{bloque.servicio}</span>
      )}
      {bloque.estado === 'hueco' ? (
        <span className="relative flex items-center gap-(--espacio-1) text-xs">
          <Cifra valor={minutos} unidad="min" tamano="xs" />
          {bloque.valorCentavos === null ? null : (
            <span className="text-texto-sutil">
              · ~<Dinero centavos={bloque.valorCentavos} tamano="xs" />
            </span>
          )}
          <span className="ml-auto inline-flex items-center font-semibold text-primario">
            Llenar
            <ChevronRight aria-hidden="true" className="size-3" />
          </span>
        </span>
      ) : null}
    </Superficie>
  );
}

/** Las tres cifras del encabezado. Mientras se lee, la forma del número; nunca un cero. */
function Resumen({ resumen }: { readonly resumen: ResumenDelDia | 'leyendo' }) {
  const voc = useVocabulario();
  const cifra = (valor: number, unidad?: string) =>
    resumen === 'leyendo' ? (
      <Esqueleto className="inline-block h-5 w-8 align-middle" />
    ) : (
      <Cifra
        valor={valor}
        tamano="lg"
        className="text-texto"
        {...(unidad === undefined ? {} : { unidad })}
      />
    );
  const cuantas = resumen === 'leyendo' ? 0 : resumen.citas;
  const ocupacion = resumen === 'leyendo' ? 0 : resumen.ocupacion;
  const huecos = resumen === 'leyendo' ? 0 : resumen.huecos.length;
  return (
    <ul
      aria-label="Resumen del día"
      className="flex flex-wrap items-baseline gap-x-(--espacio-4) gap-y-(--espacio-1) text-sm text-texto-sutil"
    >
      <li>
        {cifra(cuantas)} {voc.plural('orden')}
      </li>
      <li>{cifra(ocupacion, '%')} ocupado</li>
      <li>{cifra(huecos)} huecos</li>
    </ul>
  );
}

interface EncabezadoProps {
  readonly fecha: string;
  readonly dia: number;
  readonly mover: (n: number) => () => void;
  /** `null` cuando la agenda no se pudo leer: no hay cifras que dar. */
  readonly resumen: ResumenDelDia | 'leyendo' | null;
}

/**
 * El encabezado del día, en sus cuatro estados. Los dos botones de día viven aquí
 * y se pintan siempre —cargando, vacío, con citas y con error—: sin ellos, un día
 * que no se pudo leer sería un callejón.
 */
function Encabezado({ fecha, dia, mover, resumen }: EncabezadoProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-(--espacio-4) gap-y-(--espacio-2)">
      <div className="flex min-w-0 items-center gap-(--espacio-2)">
        <h1 className="truncate text-2xl font-bold first-letter:uppercase">{fecha}</h1>
        <Button size="icon" variant="outline" aria-label="Día anterior" onClick={mover(-1)}>
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button size="icon" variant="outline" aria-label="Día siguiente" onClick={mover(1)}>
          <ChevronRight aria-hidden="true" />
        </Button>
        {dia === 0 ? (
          <Badge variant="secondary">Hoy</Badge>
        ) : (
          <Button size="sm" variant="ghost" onClick={mover(-dia)}>
            Hoy
          </Button>
        )}
      </div>
      {resumen === null ? null : <Resumen resumen={resumen} />}
    </header>
  );
}

/** Dónde caen los bloques del esqueleto, en minutos desde la apertura: formas, no datos. */
const FORMAS_DEL_ESQUELETO = [
  {
    clave: 'a',
    bloques: [
      { desde: 30, dura: 90 },
      { desde: 180, dura: 60 },
    ],
  },
  {
    clave: 'b',
    bloques: [
      { desde: 0, dura: 60 },
      { desde: 90, dura: 120 },
    ],
  },
  {
    clave: 'c',
    bloques: [
      { desde: 60, dura: 45 },
      { desde: 150, dura: 90 },
    ],
  },
  { clave: 'd', bloques: [{ desde: 15, dura: 120 }] },
] as const;

/**
 * CARGANDO: la rejilla con sus columnas y sus horas ya dibujadas.
 *
 * La estructura del día no cambia: se dibuja de inmediato. Un spinner en el centro
 * no diría nada que la rejilla no diga mejor, y al llegar los datos nada salta.
 */
function EsqueletoDeLaAgenda() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando la agenda del día">
      <div className="flex flex-col gap-(--espacio-2) md:hidden">
        {Array.from({ length: 5 }, (_, indice) => (
          <Esqueleto key={indice} className="h-20 w-full" />
        ))}
      </div>
      <Superficie relleno={0} className="hidden h-[75dvh] overflow-hidden md:block">
        <div className="flex border-b border-borde">
          <span className="w-14 shrink-0" />
          {FORMAS_DEL_ESQUELETO.map((columna) => (
            <div
              key={columna.clave}
              className={`border-l border-borde px-(--espacio-3) py-(--espacio-2) ${ANCHO}`}
            >
              <Esqueleto className="h-5 w-20" />
            </div>
          ))}
        </div>
        <div className="relative flex" style={{ height: `${ALTO}px` }}>
          <ol aria-hidden="true" className="relative w-14 shrink-0">
            {HORAS.map((m) => (
              <li
                key={m}
                className="absolute right-(--espacio-2) font-numeros text-xs text-texto-sutil tabular-nums"
                style={{ top: `${(m - APERTURA) * PX + 2}px` }}
              >
                {aHora(m)}
              </li>
            ))}
          </ol>
          {FORMAS_DEL_ESQUELETO.map((columna) => (
            <div key={columna.clave} className={`relative border-l border-borde ${ANCHO}`}>
              {columna.bloques.map((forma) => (
                <div
                  key={forma.desde}
                  className="absolute inset-x-1"
                  style={{ top: `${forma.desde * PX}px`, height: `${forma.dura * PX}px` }}
                >
                  <Esqueleto className="size-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </Superficie>
    </div>
  );
}

/** Las líneas de cada hora y, punteadas, de cada media hora: la cuadrícula del papel. */
function LineasDeHora() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {HORAS.map((m) => (
        <span
          key={m}
          className="absolute inset-x-0 border-t border-borde"
          style={{ top: `${(m - APERTURA) * PX}px` }}
        />
      ))}
      {HORAS.slice(1).map((m) => (
        <span
          key={`media-${m}`}
          className="absolute inset-x-0 border-t border-dashed border-borde/50"
          style={{ top: `${(m - 30 - APERTURA) * PX}px` }}
        />
      ))}
    </div>
  );
}

/** La marca del ahora en la lista del teléfono: una raya entre dos bloques. */
function MarcaDelAhora({ hora }: { readonly hora: string }) {
  return (
    <span className="flex items-center gap-(--espacio-2) text-xs font-bold text-primario">
      <span aria-hidden="true" className="h-0.5 flex-1 bg-primario" />
      <span className="font-numeros tabular-nums">Ahora · {hora}</span>
      <span aria-hidden="true" className="h-0.5 flex-1 bg-primario" />
    </span>
  );
}

interface ListaDelDiaProps {
  readonly columnas: readonly ColumnaDeAgenda[];
  readonly enOrden: readonly BloqueDeAgenda[];
  readonly soloDe: string | null;
  readonly filtrar: (nombre: string | null) => () => void;
  readonly iAhora: number;
  readonly horaAhora: string | null;
  readonly ocupado: string | null;
  readonly alTocar: (b: BloqueDeAgenda) => () => void;
}

/** TELÉFONO · lista cronológica del salón entero, con su filtro rápido. */
function ListaDelDia({
  columnas,
  enOrden,
  soloDe,
  filtrar,
  iAhora,
  horaAhora,
  ocupado,
  alTocar,
}: ListaDelDiaProps) {
  return (
    <div className="flex flex-col gap-(--espacio-2) md:hidden">
      <nav
        aria-label="Filtrar por profesional"
        className="flex gap-(--espacio-1) overflow-x-auto pb-(--espacio-1)"
      >
        <Button
          size="sm"
          aria-pressed={soloDe === null}
          variant={soloDe === null ? 'default' : 'ghost'}
          onClick={filtrar(null)}
        >
          Todo
        </Button>
        {columnas.map((c) => (
          <Button
            key={c.nombre}
            size="sm"
            aria-pressed={soloDe === c.nombre}
            variant={soloDe === c.nombre ? 'default' : 'ghost'}
            onClick={filtrar(c.nombre)}
          >
            {c.nombre}
          </Button>
        ))}
      </nav>
      <ol className="flex flex-col gap-(--espacio-2)">
        {enOrden.map((b, i) => (
          <li key={b.id} className="flex flex-col gap-(--espacio-1)">
            {i === iAhora && horaAhora !== null ? <MarcaDelAhora hora={horaAhora} /> : null}
            <Bloque bloque={b} conProfesional ocupado={ocupado === b.id} onTocar={alTocar(b)} />
          </li>
        ))}
      </ol>
    </div>
  );
}

interface RejillaDelDiaProps {
  readonly columnas: readonly ColumnaDeAgenda[];
  /** La línea del ahora, sólo hoy y sólo dentro de la jornada dibujada. */
  readonly ahora: { readonly minutos: number; readonly hora: string } | null;
  readonly ocupado: string | null;
  readonly alTocar: (b: BloqueDeAgenda) => () => void;
  readonly refDelMarco: Ref<HTMLElement>;
}

/**
 * TABLET y PC · la rejilla. Encabezado y cuerpo son dos filas paralelas con los
 * mismos anchos: así las columnas cuadran sin un segundo marcado, los nombres se
 * quedan pegados arriba mientras las horas corren, y las horas se quedan pegadas a
 * la izquierda mientras las columnas se deslizan.
 */
function RejillaDelDia({ columnas, ahora, ocupado, alTocar, refDelMarco }: RejillaDelDiaProps) {
  return (
    <Superficie
      ref={refDelMarco}
      como="section"
      aria-label="Rejilla del día"
      relleno={0}
      className={`min-w-0 flex-1 overflow-auto ${ALTO_DEL_MARCO}`}
    >
      <div className="w-full min-w-max">
        <div className="sticky top-0 z-20 flex border-b border-borde bg-superficie">
          <span aria-hidden="true" className="sticky left-0 z-10 w-14 shrink-0 bg-superficie" />
          {columnas.map((c) => (
            <h2
              key={c.nombre}
              className={`flex items-center gap-(--espacio-2) border-l border-borde px-(--espacio-3) py-(--espacio-2) text-sm font-semibold ${ANCHO} ${c.renta ? 'bg-fondo-sutil' : ''}`}
            >
              <span className="min-w-0 truncate">{c.nombre}</span>
              {c.renta ? <Badge variant="outline">renta</Badge> : null}
            </h2>
          ))}
        </div>
        <div className="relative flex" style={{ height: `${ALTO}px` }}>
          <LineasDeHora />
          <ol aria-label="Horas" className="sticky left-0 z-10 w-14 shrink-0 bg-superficie">
            {HORAS.map((m) => (
              <li
                key={m}
                className="absolute right-(--espacio-2) font-numeros text-xs text-texto-sutil tabular-nums"
                style={{ top: `${(m - APERTURA) * PX + 2}px` }}
              >
                {aHora(m)}
              </li>
            ))}
          </ol>
          {columnas.map((c) => (
            <ol
              key={c.nombre}
              aria-label={c.nombre}
              className={`relative border-l border-borde ${ANCHO} ${c.renta ? 'bg-fondo-sutil/50' : ''}`}
            >
              {/* Sin `inset-x-1`: el ancho lo decide `posicionDe`, que parte la
                  columna cuando un hueco se cruza con una cita. */}
              {c.bloques.map((b) => (
                <li key={b.id} className="absolute pb-0.5" style={posicionDe(b, c.bloques)}>
                  <Bloque bloque={b} ocupado={ocupado === b.id} onTocar={alTocar(b)} />
                </li>
              ))}
            </ol>
          ))}
          {ahora === null ? null : (
            <div
              className="pointer-events-none absolute inset-x-0 z-10 flex -translate-y-1/2 items-center"
              style={{ top: `${(ahora.minutos - APERTURA) * PX}px` }}
            >
              {/* Pegada a la izquierda: con las columnas deslizadas, la hora del
                  ahora sigue a la vista junto a la de la rejilla. */}
              <Badge className="sticky left-0 font-numeros tabular-nums">
                Ahora · {ahora.hora}
              </Badge>
              <span aria-hidden="true" className="h-0.5 flex-1 bg-primario" />
            </div>
          )}
        </div>
      </div>
    </Superficie>
  );
}

/** Lo que no ha confirmado: a quién hay que llamar. */
function columnasSinConfirmar(voc: Vocabulario): readonly ColumnaDeTabla<BloqueDeAgenda>[] {
  return [
    {
      clave: 'hora',
      titulo: 'Hora',
      celda: (b) => <span className="font-numeros font-semibold tabular-nums">{b.inicio}</span>,
    },
    {
      clave: 'quien',
      titulo: voc.titulo('cliente'),
      celda: (b) => (
        <span className="flex flex-col">
          {/* Sin ficha no hay nombre: «sin registrar», no «el/la cliente» (§4.1.1). */}
          <span className="font-medium">{b.clienta ?? 'Sin registrar'}</span>
          <span className="text-xs text-texto-sutil">{b.profesional}</span>
        </span>
      ),
    },
  ];
}

/** Los huecos del día, con lo que valen: lo único monetario de la pantalla. */
const COLUMNAS_DE_HUECOS: readonly ColumnaDeTabla<BloqueDeAgenda>[] = [
  {
    clave: 'hueco',
    titulo: 'Hueco',
    celda: (b) => (
      <span className="flex flex-col">
        <span className="font-numeros font-semibold tabular-nums">{b.inicio}</span>
        <span className="text-xs text-texto-sutil">{b.profesional}</span>
      </span>
    ),
  },
  {
    clave: 'dura',
    titulo: 'Dura',
    numerica: true,
    celda: (b) => <Cifra valor={aMinutos(b.fin) - aMinutos(b.inicio)} unidad="min" tamano="sm" />,
  },
  {
    clave: 'valor',
    titulo: 'Valor',
    numerica: true,
    // Con tilde: es un estimado del servidor, no un precio.
    celda: (b) =>
      b.valorCentavos === null ? (
        '—'
      ) : (
        <span>
          ~<Dinero centavos={b.valorCentavos} tamano="sm" />
        </span>
      ),
  },
];

interface PanelDePendientesProps {
  readonly sinConfirmar: readonly BloqueDeAgenda[];
  readonly huecos: readonly BloqueDeAgenda[];
  readonly valor: number;
  readonly alTocar: (b: BloqueDeAgenda) => () => void;
}

/**
 * PC · el panel de quien puede actuar sobre esta lista. Dos tablas densas y no
 * dos listas a mano: la hora, quién y cuánto, alineados; y el hueco se toca igual
 * que en la rejilla, con el dedo o con Enter.
 */
function PanelDePendientes({ sinConfirmar, huecos, valor, alTocar }: PanelDePendientesProps) {
  const voc = useVocabulario();
  return (
    <Superficie
      como="aside"
      aria-label="Pendientes del día"
      relleno={4}
      className={`hidden w-80 shrink-0 flex-col gap-(--espacio-6) overflow-y-auto xl:flex ${ALTO_DEL_MARCO}`}
    >
      <section aria-label="Sin confirmar" className="flex flex-col gap-(--espacio-2)">
        <h2 className="flex items-baseline justify-between text-sm font-semibold">
          Sin confirmar
          <Cifra valor={sinConfirmar.length} tamano="sm" />
        </h2>
        <Tabla
          etiqueta={`${voc.titulo('orden', true)} sin confirmar`}
          columnas={columnasSinConfirmar(voc)}
          filas={sinConfirmar}
          claveDe={(b) => b.id}
          alto="max-h-[30dvh]"
          vacio={<Vacio titulo="Nadie pendiente de confirmar." className="py-(--espacio-3)" />}
        />
      </section>
      <section aria-label="Huecos" className="flex flex-col gap-(--espacio-2)">
        <h2 className="flex items-baseline justify-between text-sm font-semibold">
          Huecos
          <Cifra valor={huecos.length} tamano="sm" />
        </h2>
        <Tabla
          etiqueta="Huecos del día"
          columnas={COLUMNAS_DE_HUECOS}
          filas={huecos}
          claveDe={(b) => b.id}
          alActivar={(id) => {
            const hueco = huecos.find((h) => h.id === id);
            if (hueco !== undefined) alTocar(hueco)();
          }}
          alto="max-h-[30dvh]"
          pie={{
            hueco: 'Total',
            valor: (
              <span>
                ~<Dinero centavos={valor} tamano="sm" />
              </span>
            ),
          }}
          vacio={<Vacio titulo="Sin huecos: el día está lleno." className="py-(--espacio-3)" />}
        />
      </section>
    </Superficie>
  );
}

/**
 * Fijo abajo, a la altura del pulgar de quien sostiene la tablet.
 *
 * ── Y CENTRADO DE VERDAD, que es lo que lo dejaba INCLICABLE ─────────────
 * Tenía `md:mx-auto md:w-64` sobre el propio botón, y `mx-auto` no centra un
 * `inline-flex` —que es lo que renderiza este botón—: se quedaba pegado a la
 * IZQUIERDA, en la franja que la barra lateral del marco heredado ocupa. En el
 * TABLERO de una estética —su pantalla de inicio— la acción principal no recibía
 * el clic. Centrar con `flex justify-center` funciona en los dos marcos sin que el
 * componente tenga que saber en cuál está.
 */
function BarraDeAgendar({ alAgendar }: { readonly alAgendar: () => void }) {
  return (
    <Superficie
      nivel={3}
      radio="sm"
      relleno={0}
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center rounded-none border-x-0 border-b-0 p-(--espacio-2)"
    >
      <Button size="lg" className="w-full md:w-64" onClick={alAgendar}>
        <Plus aria-hidden="true" />
        Agendar
      </Button>
    </Superficie>
  );
}

export function AgendaDelDia({ bloquesIniciales, hayEquipo = true, onAgendar }: AgendaDelDiaProps) {
  const voc = useVocabulario();
  const enrutador = useRouter();
  const [bloques, setBloques] = useState<readonly BloqueDeAgenda[] | null>(
    bloquesIniciales ?? null,
  );
  const [ahoraMs, setAhoraMs] = useState<number | null>(null);
  const [dia, setDia] = useState(0);
  const [soloDe, setSoloDe] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  /** `agenda.dia` no se leyó: sin él no hay agenda que enseñar, sólo el error. */
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  /** Se leyó la agenda y se cayó una fuente de al lado: se dice cuál. */
  const [avisoDeLectura, setAvisoDeLectura] = useState<AvisoDeLectura | null>(null);
  /** Iniciar una cita falló: se dice qué NO pasó. */
  const [falloAlIniciar, setFalloAlIniciar] = useState<string | null>(null);
  const rejilla = useRef<HTMLElement>(null);
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

        // Sin `agenda.dia` no hay agenda: los huecos solos dibujarían un día libre
        // que no lo es. Eso es el error de la pantalla, no un aviso.
        setFalloDeCarga(dia.status === 'rejected' ? mensajeDe(dia.reason, voc) : null);

        // El aviso nombra la fuente que falló, porque «no se pudo cargar» sobre
        // una pantalla con citas dentro manda a buscar donde no está.
        const caidas = [
          huecos.status === 'rejected' ? `huecos: ${mensajeDe(huecos.reason, voc)}` : null,
          clientas.status === 'rejected' ? `los nombres de ${voc.enFrase('cliente', true)}` : null,
          servicios.status === 'rejected'
            ? `los nombres de ${voc.enFrase('linea_orden', true)}`
            : null,
          expedientes.status === 'rejected' ? 'las alergias del expediente' : null,
        ].filter((x): x is string => x !== null);
        setAvisoDeLectura(
          caidas.length === 0
            ? null
            : {
                titulo: `No se pudo leer ${caidas.join(' · ')}.`,
                sinAlergias: expedientes.status === 'rejected',
              },
        );
      })
      .catch(() => {
        // `allSettled` no rechaza: esto es para un fallo del propio `then`, que
        // dejaría la pantalla en su esqueleto para siempre.
        if (sigueMontada()) {
          setBloques([]);
          setFalloDeCarga('No se pudo armar la agenda.');
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
  // se reacomodara sola cada minuto sería insoportable. Se mueve la REJILLA, que es
  // su propio marco de scroll, y no la página: el encabezado del día se queda.
  useEffect(() => {
    const marco = rejilla.current;
    if (centrada.current || marco === null || ahoraMs === null || dia !== 0) return;
    const minutos = minutosDe(ahoraMs);
    if (minutos < APERTURA || minutos > CIERRE) return;
    centrada.current = true;
    marco.scrollTo({ top: Math.max(0, (minutos - APERTURA) * PX - marco.clientHeight / 2) });
  }, [ahoraMs, bloques, dia]);

  const minutosAhora = ahoraMs === null || dia !== 0 ? null : minutosDe(ahoraMs);
  const horaAhora = minutosAhora === null ? null : aHora(minutosAhora);
  const ahora =
    minutosAhora !== null &&
    horaAhora !== null &&
    minutosAhora >= APERTURA &&
    minutosAhora <= CIERRE
      ? { minutos: minutosAhora, hora: horaAhora }
      : null;
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
      setFalloAlIniciar(null);
      // Y se entra a la cita: es donde se captura la fórmula y se cierra el
      // servicio. Dejar a la recepcionista en la rejilla con la cita en curso era
      // dejar el resto del recorrido sin puerta.
      enrutador.push(enLaCita);
    } catch (fallo: unknown) {
      setFalloAlIniciar(mensajeDe(fallo, voc, `No se pudo iniciar ${voc.enFrase('orden')}.`));
    } finally {
      setOcupado(null);
    }
  };

  /** Otro día, o leer otra vez: los avisos del intento anterior ya no dicen nada. */
  const olvidarAvisos = () => {
    setFalloDeCarga(null);
    setAvisoDeLectura(null);
    setFalloAlIniciar(null);
    // Los bloques del día anterior bajo la fecha nueva serían mentira: mientras
    // llega el otro día se ve su esqueleto. Con `bloquesIniciales` no hay lectura
    // que los reponga, así que se quedan.
    if (bloquesIniciales === undefined) setBloques(null);
  };
  const mover = (n: number) => () => {
    olvidarAvisos();
    setDia((actual) => actual + n);
  };
  const filtrar = (n: string | null) => () => {
    setSoloDe(n);
  };
  const alTocar = (b: BloqueDeAgenda) => () => {
    void tocar(b);
  };
  const reintentar = () => {
    olvidarAvisos();
    setIntento((previo) => previo + 1);
  };

  const encabezado = (
    <Encabezado
      fecha={msDia === null ? 'Agenda' : DIA.format(msDia)}
      dia={dia}
      mover={mover}
      resumen={estadoDelResumen(falloDeCarga, bloques, resumen)}
    />
  );

  if (falloDeCarga !== null) {
    return (
      <div className={MARCO}>
        {encabezado}
        <ErrorDePantalla
          titulo="No se pudo cargar la agenda."
          queHacer={`Sin ella no se sabe quién sigue ni dónde cabe ${voc.enFraseCon('un', 'orden')}. Revisa la conexión y vuelve a intentarlo: lo que ya estaba agendado sigue guardado.`}
          detalle={falloDeCarga}
          reintentar={<Button onClick={reintentar}>Reintentar</Button>}
        />
      </div>
    );
  }

  if (bloques === null) {
    return (
      <div className={MARCO}>
        {encabezado}
        <EsqueletoDeLaAgenda />
      </div>
    );
  }

  const avisos = (
    <>
      {falloAlIniciar === null ? null : (
        <Aviso tono="peligro" titulo={falloAlIniciar}>
          {voc.conArticulo('orden')} sigue como estaba: no empezó ningún reloj.
        </Aviso>
      )}
      {avisoDeLectura === null ? null : (
        <Aviso
          tono={avisoDeLectura.sinAlergias ? 'peligro' : 'atencion'}
          titulo={avisoDeLectura.titulo}
          accion={
            <Button size="sm" variant="outline" onClick={reintentar}>
              Reintentar
            </Button>
          }
        >
          {avisoDeLectura.sinAlergias
            ? `Sin el expediente, el triángulo de alergia no aparece: revisa el historial de ${voc.enFraseCon('cada', 'cliente')} antes de empezar.`
            : 'Lo que sí se leyó está en la agenda.'}
        </Aviso>
      )}
    </>
  );

  if (bloques.length === 0) {
    return (
      <div className={MARCO}>
        {encabezado}
        {avisos}
        {/* El borde discontinuo se queda: es lo que dice «aquí CABE algo» en vez de
            «aquí no hay nada», y en una agenda esa diferencia es el negocio. */}
        <Superficie nivel={0} relleno={0} className="border-dashed">
          <Vacio
            icono={hayEquipo ? <CalendarPlus /> : <Users />}
            titulo={tituloDelVacio(hayEquipo, dia, voc)}
            explicacion={
              hayEquipo
                ? 'El día está entero, y eso es una oportunidad: el hueco de las 3 pm no se recupera mañana.'
                : 'Cada profesional es una columna de esta rejilla. Sin ninguno, la cita no tiene dónde caer.'
            }
            accion={
              <span className="flex flex-wrap items-center justify-center gap-(--espacio-2)">
                <Button size="lg" onClick={irAAgendar}>
                  {hayEquipo ? <Plus aria-hidden="true" /> : null}
                  {hayEquipo ? 'Agendar' : 'Dar de alta al equipo'}
                </Button>
                {hayEquipo && dia === 0 ? (
                  <Button variant="ghost" onClick={mover(1)}>
                    Abrir la agenda de mañana
                    <ChevronRight aria-hidden="true" />
                  </Button>
                ) : null}
              </span>
            }
          />
        </Superficie>
      </div>
    );
  }

  return (
    <div className={`${MARCO} pb-[calc(var(--espacio-12)*2)]`}>
      {encabezado}
      {avisos}
      <ListaDelDia
        columnas={columnas}
        enOrden={enOrden}
        soloDe={soloDe}
        filtrar={filtrar}
        iAhora={iAhora}
        horaAhora={horaAhora}
        ocupado={ocupado}
        alTocar={alTocar}
      />
      <div className="hidden items-start gap-(--espacio-3) md:flex">
        <RejillaDelDia
          columnas={columnas}
          ahora={ahora}
          ocupado={ocupado}
          alTocar={alTocar}
          refDelMarco={rejilla}
        />
        <PanelDePendientes
          sinConfirmar={sinConfirmar}
          huecos={resumen.huecos}
          valor={resumen.valor}
          alTocar={alTocar}
        />
      </div>
      <BarraDeAgendar alAgendar={irAAgendar} />
    </div>
  );
}

/** Qué enseña el encabezado: las cifras, su forma mientras se leen, o nada si no se leyó. */
function estadoDelResumen(
  falloDeCarga: string | null,
  bloques: readonly BloqueDeAgenda[] | null,
  resumen: ResumenDelDia,
): ResumenDelDia | 'leyendo' | null {
  if (falloDeCarga !== null) return null;
  if (bloques === null) return 'leyendo';
  return resumen;
}

/** El vacío dice HOY sólo cuando es hoy: el día de mañana vacío no es «hoy». */
function tituloDelVacio(hayEquipo: boolean, dia: number, voc: Vocabulario): string {
  if (!hayEquipo) return 'Primero da de alta a tu equipo.';
  return dia === 0
    ? `Hoy no hay ${voc.plural('orden')} todavía.`
    : `Ese día todavía no tiene ${voc.plural('orden')}.`;
}

const minutosDe = (ms: number) => new Date(ms).getHours() * 60 + new Date(ms).getMinutes();

function fechaLocal(ms: number): string {
  const d = new Date(ms);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${String(d.getDate()).padStart(2, '0')}`;
}
