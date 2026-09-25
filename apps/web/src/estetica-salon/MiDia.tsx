'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Progress } from '@morphiqpos/ui/primitivas/progress';
import {
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import {
  CalendarPlus,
  ChevronRight,
  Scissors,
  TriangleAlert,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { consultarPuente } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';

import {
  componerElDia,
  esMismoDia,
  type CitaDeMiDia,
  type FilaCita,
  type FilaCitaServicio,
  type FilaCliente,
  type FilaComision,
  type FilaExpediente,
} from './mi-dia.ts';

export type { CitaDeMiDia } from './mi-dia.ts';

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
 * clienta hablando y un secador. Si comparte tamaño con el resto, se pierde. Por
 * eso es la única superficie levantada (nivel 2) y con el borde del primario: el
 * resto de la pantalla está a ras.
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
 * ── Teléfono primero; la tableta y la PC, con el desglose al lado ────────
 * En el teléfono va en el orden del documento: la que sigue, lo ganado, el resto
 * del día y la walk-in abajo, en el tercio que el pulgar alcanza. De tableta para
 * arriba lo ganado sube a la derecha, a la altura de la que sigue, y debajo va el
 * desglose servicio por servicio: es lo que abre para verificar un número antes
 * de que le paguen, y en el teléfono estorbaría.
 *
 * ── Quién es «yo»: lo dice el SERVIDOR (C.7 de la 2.4) ────────────────────
 * Esta pantalla preguntaba el nombre y enseñaba el día de quien se eligiera: cualquier
 * estilista podía leer la agenda y las comisiones de otra, y aquí mismo decía que el
 * recorte «lo tiene que hacer el servidor el día que la sesión sepa quién entró». Ya lo
 * hace: para la estilista, el puente sólo devuelve SU ficha de `Profesional`, SUS
 * servicios, SUS citas y SUS comisiones (`soloDeQuienEntra`). Así que la lista del
 * equipo le llega con UNA persona —ella— y la pantalla entra directo a su día, sin
 * preguntar. Quien dirige el salón sí recibe a todas, y elige a quién mirar.
 *
 * ── Lo que NO va aquí ────────────────────────────────────────────────────
 * La venta del salón, la comisión de nadie más, el corte y los gastos. Esta
 * pantalla es de UNA persona.
 *
 * ── De dónde sale cada dato ─────────────────────────────────────────────
 * El nombre del servicio y sus minutos de procesado vienen de `CitaServicio`
 * (derivados del producto y de `servicios`), y la bandera de alergia del
 * EXPEDIENTE, no de buscar «alergia» en las notas de la cita (C.9 de la 2.4).
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

/** El rótulo de cada bloque: pequeño, en versalitas, y el mismo en los cuatro. */
const RUBRO = 'text-xs font-semibold tracking-wide text-texto-sutil uppercase';

export interface LineaDeComision {
  readonly id: string;
  readonly concepto: string;
  /** En CENTAVOS, como `comisionCentavos`: ya convertido con `centavosDe`. */
  readonly centavos: number;
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

function aHora(iso: string): string {
  const f = new Date(iso);
  const hh = f.getHours().toString().padStart(2, '0');
  return `${hh}:${f.getMinutes().toString().padStart(2, '0')}`;
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

function nombreDe(persona: ProfesionalDeLaLista): string {
  return persona.nombre_corto ?? persona.nombre_completo ?? 'Sin nombre';
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
  // Cada intento de lectura es un número: «Volver a intentar» lo sube y el efecto
  // lee otra vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);

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
          if (!sigueMontada()) return;
          const activas = filas.filter((f) => f.activo !== false);
          // UNA sola: es la sesión de esa estilista, y el servidor ya recortó al resto.
          // No hay nada que preguntar.
          const sola = activas.length === 1 ? activas[0] : undefined;
          if (sola !== undefined) setYo(sola.id);
          else setEquipo(activas);
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
      consultarPuente<FilaExpediente>('ExpedienteBelleza', { limite: 300, signal: señal }),
    ])
      .then(([servicios, agenda, clientes, comisiones, expedientes]) => {
        if (!sigueMontada()) return;
        const hoy = new Date();
        setCitas(componerElDia(servicios, agenda, clientes, expedientes, hoy));
        const delDia = comisiones.filter(
          (c) => c.causada_en !== null && esMismoDia(c.causada_en, hoy),
        );
        // Se convierte UNA vez, renglón por renglón, y la comisión es la suma de esos
        // mismos centavos: el total y el desglose no pueden contar distinto.
        const detalle = delDia.map((c) => ({
          id: c.id,
          concepto: c.motivo ?? c.tipo ?? 'Servicio',
          centavos: centavosDe('ComisionCausada', 'monto_pesos', c.monto_pesos) ?? 0,
        }));
        setGanancia({
          comisionCentavos: detalle.reduce((suma, linea) => suma + linea.centavos, 0),
          propinaCentavos: null,
          detalle,
        });
      })
      .catch((fallo: unknown) => {
        if (sigueMontada()) setError(mensajeDe(fallo, 'No se pudo leer tu día.'));
      });
    return () => {
      control.abort();
    };
  }, [citasIniciales, yo, intento]);

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

  function reintentar(): void {
    setError(null);
    if (yo === null) setEquipo(null);
    else setCitas(null);
    setIntento((previo) => previo + 1);
  }

  // El nombre de quien mira, en cuanto se sabe: «KARLA · martes 14», como en el
  // documento. «Mi día» se queda arriba como rótulo, para que la pantalla diga
  // qué es aunque el nombre cambie.
  const quien = equipo?.find((persona) => persona.id === yo);
  const nombreVisible = nombreProfesional ?? (quien === undefined ? null : nombreDe(quien));

  const encabezado = (
    <header className="flex flex-wrap items-end justify-between gap-x-(--espacio-4) gap-y-(--espacio-1)">
      <div className="flex flex-col">
        {nombreVisible === null ? null : <p className={RUBRO}>Mi día</p>}
        <h1 className="text-2xl font-bold leading-tight">{nombreVisible ?? 'Mi día'}</h1>
      </div>
      <p className="text-sm text-texto-sutil first-letter:uppercase">
        {reloj === null
          ? 'Hoy'
          : reloj.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
    </header>
  );

  /**
   * La walk-in se agenda en AGENDAR (§4.3.2): ahí están el servicio y la hora,
   * que es lo que el comando pide y aquí no hay de dónde sacar. Es la acción
   * principal del día vacío y la secundaria de un día con citas: el mismo botón,
   * con el peso que le toca en cada uno.
   */
  const walkIn = (variante: 'default' | 'outline') => (
    <Button
      type="button"
      size="lg"
      variant={variante}
      className="min-h-20 w-full text-base"
      onClick={() => {
        router.push('/estetica-salon/agendar');
      }}
    >
      <UserPlus aria-hidden="true" />
      Tomar una walk-in
    </Button>
  );

  if (error !== null) {
    // No se leyó nada: sin su día no hay qué enseñar, y un día a medias —las
    // citas sin la comisión, o al revés— se leería como un día de verdad.
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-(--espacio-4) p-(--espacio-4)">
        {encabezado}
        <ErrorDePantalla
          titulo={yo === null ? 'No se pudo leer el equipo' : 'No se pudo leer tu día'}
          queHacer={
            yo === null
              ? 'Sin la lista no hay cómo entrar a tu día. Revisa la conexión y vuelve a intentarlo.'
              : `Sin él no se sabe qué ${voc.singular('orden')} sigue ni cuánto llevas. Revisa la conexión y vuelve a intentarlo.`
          }
          detalle={error}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </div>
    );
  }

  if (yo === null) {
    // Sin sesión que diga quién mira no se consulta nada. Ver el docblock.
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-(--espacio-4) p-(--espacio-4)">
        {encabezado}
        <section aria-labelledby="quien" className="flex flex-col gap-(--espacio-3)">
          <p id="quien" className="text-lg font-medium">
            ¿Quién eres? Tu día sólo lo ves tú.
          </p>
          {equipo === null ? (
            <div
              role="status"
              aria-busy="true"
              aria-label="Leyendo el equipo"
              className="grid gap-(--espacio-2) sm:grid-cols-2"
            >
              {Array.from({ length: 4 }, (_, indice) => (
                <Esqueleto key={indice} className="min-h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : equipo.length === 0 ? (
            <Superficie nivel={0} relleno={0} className="border-dashed">
              <Vacio
                icono={<UsersRound />}
                titulo="El equipo todavía está vacío."
                explicacion="En cuanto se dé de alta a quien atiende en el salón, aquí aparece su nombre para entrar a su día."
                className="py-(--espacio-8)"
              />
            </Superficie>
          ) : (
            // Una rejilla de nombres que se tocan: con el nudillo, con tinte en los
            // dedos. Cada nombre es una tesela de 80 px, no un renglón de lista.
            <ul className="grid gap-(--espacio-2) sm:grid-cols-2">
              {equipo.map((persona) => (
                <li key={persona.id}>
                  <Superficie
                    como="button"
                    type="button"
                    interactiva
                    relleno={3}
                    className="flex min-h-20 w-full items-center gap-(--espacio-3)"
                    onClick={() => {
                      setYo(persona.id);
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-(--altura-control) shrink-0 items-center justify-center rounded-full bg-acento-suave text-base font-bold text-acento-suave-texto"
                    >
                      {nombreDe(persona).charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 truncate text-lg font-semibold">
                      {nombreDe(persona)}
                    </span>
                  </Superficie>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  if (citas === null) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-(--espacio-4) p-(--espacio-4)">
        {encabezado}
        {/* La forma de lo que llega, no una rueda: la que sigue, lo ganado y el
            resto del día, cada uno en su sitio. Así nada salta al cargar. */}
        <div
          role="status"
          aria-busy="true"
          aria-label="Leyendo tu día"
          className="grid gap-(--espacio-4) md:grid-cols-[minmax(0,1fr)_20rem]"
        >
          <Esqueleto className="min-h-64 w-full rounded-lg" />
          <Esqueleto className="min-h-40 w-full rounded-lg md:min-h-64" />
          <div className="flex flex-col gap-(--espacio-2)">
            {Array.from({ length: 3 }, (_, indice) => (
              <Esqueleto key={indice} className="min-h-20 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const columnasDelDetalle: readonly ColumnaDeTabla<LineaDeComision>[] = [
    {
      clave: 'concepto',
      titulo: voc.titulo('linea_orden'),
      celda: (linea) => <span className="line-clamp-2">{linea.concepto}</span>,
    },
    {
      clave: 'comision',
      titulo: 'Comisión',
      numerica: true,
      celda: (linea) => <Dinero centavos={linea.centavos} tamano="sm" />,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-(--espacio-4) p-(--espacio-4)">
      {encabezado}

      {/* Teléfono: una columna en el orden del documento. Tableta y PC: lo ganado
          sube a la derecha, a la altura de la que sigue —los dos del mismo alto—, y
          el desglose va debajo, que es donde ella verifica. */}
      <div className="grid gap-(--espacio-4) md:grid-cols-[minmax(0,1fr)_20rem] md:items-start">
        <section
          aria-labelledby="ahora"
          className="flex flex-col gap-(--espacio-2) md:col-start-1 md:row-start-1 md:self-stretch"
        >
          <h2 id="ahora" className={RUBRO}>
            Ahora
          </h2>
          {actual === null ? (
            // El vacío ENSEÑA: dice qué se puede hacer con el día por delante. El
            // borde discontinuo se queda: dice «aquí CABE algo», que es el punto.
            <Superficie
              nivel={0}
              relleno={0}
              className="flex flex-1 items-center justify-center border-dashed"
            >
              <Vacio
                className="py-(--espacio-8)"
                icono={<CalendarPlus />}
                titulo={
                  citas.length === 0
                    ? `Hoy no tienes ${voc.plural('orden')}.`
                    : `No te queda ${voc.enFraseCon('ningun', 'orden')} por atender.`
                }
                explicacion={
                  citas.length === 0
                    ? `El día entero está libre: cabe ${voc.enFraseCon('un', 'linea_orden')} sin mover nada.`
                    : `El resto del día está libre: cabe ${voc.enFraseCon('un', 'linea_orden')} sin mover nada.`
                }
                accion={walkIn('default')}
              />
            </Superficie>
          ) : (
            <Superficie
              como="article"
              nivel={2}
              relleno={6}
              className="flex flex-1 flex-col gap-(--espacio-4) border-primario"
            >
              {actual.alergias && (
                // Arriba del todo: un error aquí no es un descuadre.
                <Badge variant="destructive" className="self-start text-sm">
                  <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
                  Revisa alergias en su ficha
                </Badge>
              )}
              <div className="flex flex-col gap-(--espacio-1)">
                <p className="text-3xl leading-tight font-bold">
                  {actual.clienteNombre ?? actual.folio ?? 'Sin nombre'}
                </p>
                <p className="flex flex-wrap items-baseline gap-x-(--espacio-2) text-base text-texto-sutil">
                  <span>{actual.servicio ?? 'Servicio'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-numeros font-semibold text-texto tabular-nums">
                    {aHora(actual.inicio)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <Dinero centavos={actual.precioCentavos} />
                </p>
              </div>
              {actual.minutosProcesado !== null && (
                <div className="flex flex-col gap-(--espacio-1)">
                  <Progress
                    value={Math.min(100, (actual.minutosProcesado / MINUTOS_PROCESADO_TOPE) * 100)}
                    aria-label="Avance del procesado"
                  />
                  {/* La barra nunca carga sola el dato: va el número en letra. */}
                  <p className="text-sm">
                    Procesado · <Cifra valor={actual.minutosProcesado} unidad="min" tamano="sm" />
                  </p>
                </div>
              )}
              <Button
                type="button"
                size="lg"
                className="mt-auto min-h-20 w-full text-lg"
                onClick={() => {
                  abrir(actual.id);
                }}
              >
                Ver fórmula
              </Button>
            </Superficie>
          )}
        </section>

        <section
          aria-labelledby="ganado"
          className="flex flex-col gap-(--espacio-2) md:col-start-2 md:row-start-1 md:self-stretch"
        >
          <h2 id="ganado" className={RUBRO}>
            Hoy llevas
          </h2>
          {/* Dos renglones, nunca uno, y sin total debajo: ese número no existe. */}
          <Superficie className="flex flex-1 flex-col justify-between gap-(--espacio-4)">
            <dl className="flex flex-col">
              <div className="flex items-baseline justify-between gap-(--espacio-2) pb-(--espacio-2)">
                <dt className="text-sm text-texto-sutil">Comisión</dt>
                <dd>
                  <Dinero
                    centavos={ganancia?.comisionCentavos ?? 0}
                    tamano="lg"
                    className="text-2xl font-bold"
                  />
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-(--espacio-2) border-t border-borde pt-(--espacio-2)">
                <dt className="text-sm text-texto-sutil">Propina</dt>
                <dd>
                  {propina === null ? (
                    <span className="text-sm text-texto-sutil">sin dato todavía</span>
                  ) : (
                    <Dinero centavos={propina} tamano="lg" className="text-2xl font-bold" />
                  )}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-texto-sutil">
              {voc.conNumero('orden', citas.length)} · {pendientes.length} por atender
            </p>
          </Superficie>
        </section>

        {actual !== null && (
          <section
            aria-labelledby="sigue"
            className="flex flex-col gap-(--espacio-2) md:col-start-1 md:row-start-2"
          >
            <h2 id="sigue" className={RUBRO}>
              Sigue
            </h2>
            {/* Cada cita es una tesela que se toca y abre su fórmula; entre dos, el
                hueco que cabe, a ras y con borde discontinuo: se ofrece, no se abre. */}
            <ul className="flex flex-col gap-(--espacio-2)">
              {resto.map((renglon) =>
                renglon.clase === 'cita' ? (
                  <li key={renglon.cita.citaServicioId}>
                    <Superficie
                      como="button"
                      type="button"
                      interactiva
                      relleno={3}
                      className="flex min-h-20 w-full items-center gap-(--espacio-3)"
                      onClick={() => {
                        abrir(renglon.cita.id);
                      }}
                    >
                      <span className="font-numeros text-lg font-bold tabular-nums">
                        {aHora(renglon.cita.inicio)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-base font-semibold">
                          {renglon.cita.clienteNombre ?? renglon.cita.folio ?? 'Sin nombre'}
                        </span>
                        <span className="truncate text-sm text-texto-sutil">
                          {renglon.cita.servicio ?? 'Servicio'}
                        </span>
                      </span>
                      {renglon.cita.alergias && (
                        <TriangleAlert
                          aria-label="Con alergias"
                          className="size-5 shrink-0 text-peligro"
                        />
                      )}
                      <ChevronRight
                        aria-hidden="true"
                        className="size-5 shrink-0 text-texto-sutil"
                      />
                    </Superficie>
                  </li>
                ) : (
                  <Superficie
                    key={`hueco-${renglon.desde}`}
                    como="li"
                    nivel={0}
                    relleno={3}
                    className="flex items-center gap-(--espacio-3) border-dashed border-primario/40 bg-primario/5"
                  >
                    <Scissors aria-hidden="true" className="size-5 shrink-0 text-primario" />
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold">
                        <span className="font-numeros tabular-nums">
                          {aHora(renglon.desde)}–{aHora(renglon.hasta)}
                        </span>{' '}
                        · libre
                      </span>
                      <span className="text-sm text-texto-sutil">
                        {renglon.minutos} min sin nadie. Cabe un corte.
                      </span>
                    </span>
                  </Superficie>
                ),
              )}
              {resto.length === 0 && (
                <Superficie
                  como="li"
                  nivel={0}
                  relleno={3}
                  className="border-dashed text-sm text-texto-sutil"
                >
                  Nada más después de ésta.
                </Superficie>
              )}
            </ul>
          </section>
        )}

        <div className="flex flex-col gap-(--espacio-4) md:col-start-2 md:row-start-2">
          {/* El desglose es el extra de tableta y PC: lo que abre para verificar un
              número antes de que le paguen. En el teléfono estorbaría. */}
          <section aria-labelledby="detalle" className="hidden flex-col gap-(--espacio-2) md:flex">
            <h2 id="detalle" className={RUBRO}>
              {voc.titulo('linea_orden')} por {voc.singular('linea_orden')}
            </h2>
            <Tabla
              etiqueta={`Comisión, ${voc.singular('linea_orden')} por ${voc.singular('linea_orden')}`}
              columnas={columnasDelDetalle}
              filas={ganancia?.detalle ?? []}
              claveDe={(linea) => linea.id}
              alto="max-h-[50vh]"
              vacio={
                <Superficie nivel={0} relleno={0} className="border-dashed">
                  <Vacio
                    titulo={`Todavía no se cierra ${voc.enFraseCon('ningun', 'linea_orden')}.`}
                    className="py-(--espacio-4)"
                  />
                </Superficie>
              }
            />
          </section>
          {actual !== null && walkIn('outline')}
        </div>
      </div>
    </div>
  );
}
