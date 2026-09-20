'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · estetica-salon · agendar
 *
 * Convertir un mensaje de WhatsApp en un bloque de tiempo. 15–40 veces al día,
 * recepción y dueña. La acción es CONFIRMAR LA CITA y nada más.
 *
 * ── Por qué el orden es 1 clienta · 2 servicio · 3 profesional · 4 hora ──
 * Porque ése es el orden de la conversación real —«hola, soy Sandra», «quiero
 * tinte», «¿está Karla?», «¿qué día me das?»— y no el de la base de datos.
 * Capturar en otro orden obliga a leer el chat de abajo arriba en cada campo.
 *
 * ── Por qué SEIS HUECOS y no un calendario ──────────────────────────────
 * La pregunta de la clienta es «¿cuándo me puedes dar?», no «¿está libre el
 * jueves a las 4?». Un calendario obliga a adivinar y a reintentar; seis
 * opciones ya filtradas cierran la conversación en un mensaje. Por eso se
 * reparten entre días —dos por día como mucho, separadas de verdad— en vez de
 * ofrecer seis cuartos de hora seguidos, que son una sola opción disfrazada.
 *
 * ── «¿Le sirve con otra persona?» va abajo y en secundario ──────────────
 * Es la línea que recupera la venta cuando Karla está llena hasta el viernes.
 * Pero NO se empuja: si la clienta viene con Karla, viene con Karla.
 *
 * ── Y nunca un «sin resultados» a secas ─────────────────────────────────
 * Un salón sin hueco esta semana no es una búsqueda vacía: es una venta que se
 * está perdiendo. Se dice con palabras, se ofrece la semana siguiente y se deja
 * la lista de espera a un toque (F-409).
 *
 * ── Los tres layouts son tres, no uno encogido ──────────────────────────
 * PC: panel de 420 px pegado a la derecha, con la agenda del día detrás —la
 * pinta la ruta que lo monta—, para agendar sin perder el día de vista. Tablet:
 * los cuatro pasos en scroll con el botón fijo abajo. Teléfono: UN PASO POR
 * PANTALLA con migas arriba, que es como Paty la usa en su casa a las 21:10.
 *
 * ── Lo que NO va aquí ───────────────────────────────────────────────────
 * Precio editable —se ajusta al cobrar—, notas largas, datos fiscales y nada
 * del expediente.
 *
 * ── Alcance recortado, dicho y no escondido ─────────────────────────────
 * 1. Los huecos se calculan aquí sobre la rejilla del horario menos las citas
 *    ya agendadas. El cálculo fino de F-404 vive en `domain/agenda/huecos.ts` y
 *    necesita el `tstzrange` de la 132, que el puente no sabe leer: mientras
 *    tanto cada cita ocupa un bloque por omisión. Se cambia una función.
 * 2. La duración sale de `tiempo_preparacion_estimado`; la secuencia de tres
 *    tramos (F-415) vive en `servicios`, tabla que el puente aún no expone.
 * 3. El aviso de material de cabina (F-107) no está: necesita la existencia de
 *    cabina, que tampoco viaja todavía.
 * 4. De los atajos de PC va `ESC`; `Enter` y las flechas quedan fuera.
 */

/** La rejilla del día del salón. Fuera de aquí no hay nada que ofrecer. */
const APERTURA_MIN = 9 * 60;
const CIERRE_MIN = 19 * 60;
const PASO_MIN = 15;
/** Dos semanas: la primera es la respuesta y la segunda es el plan B. */
const DIAS_HORIZONTE = 14;
const HUECOS_QUE_CABEN = 6;
/** Dos por día, separadas: mañana y tarde son opciones; 11:00 y 11:15 no. */
const MAX_POR_DIA = 2;
const SEPARACION_MIN = 150;
const DURACION_POR_OMISION_MIN = 60;
const DIA_MS = 86_400_000;

export interface ClientaDeAgenda {
  readonly id: string;
  readonly nombre: string | null;
  readonly telefono: string | null;
  /** Llegan el día que el puente exponga el expediente; hoy vienen vacíos. */
  readonly alergias?: boolean | null;
  readonly faltas_6m?: number | null;
}

export interface ServicioDeAgenda {
  readonly id: string;
  readonly nombre: string | null;
  readonly tiempo_preparacion_estimado?: number | null;
}

export interface ProfesionalDeAgenda {
  readonly id: string;
  readonly nombre_corto: string | null;
  readonly nombre_completo: string | null;
  readonly activo?: boolean | null;
}

export interface CitaDeAgenda {
  readonly id: string;
  readonly cliente_id: string | null;
  readonly agendada_para: string | null;
  readonly estado: string | null;
}

export interface ServicioDeCita {
  readonly cita_id: string | null;
  readonly profesional_id: string | null;
}

export interface Hueco {
  readonly profesionalId: string;
  readonly inicio: Date;
}

export interface AgendarProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly clientasIniciales?: readonly ClientaDeAgenda[];
  readonly serviciosIniciales?: readonly ServicioDeAgenda[];
  readonly profesionalesIniciales?: readonly ProfesionalDeAgenda[];
  readonly citasIniciales?: readonly CitaDeAgenda[];
  readonly serviciosDeCitaIniciales?: readonly ServicioDeCita[];
  readonly onAgendada?: (citaId: string) => void;
  readonly onCancelar?: () => void;
}

/** La hora vive en `Cita` y la persona en `CitaServicio`: aquí se juntan. */
export function ocupacionDe(
  citas: readonly CitaDeAgenda[],
  servicios: readonly ServicioDeCita[],
): ReadonlyMap<string, readonly number[]> {
  const horaDe = new Map<string, number>();
  for (const cita of citas) {
    // Mismo filtro que el índice de la 132: cancelada y reprogramada no ocupan.
    if (cita.agendada_para === null) continue;
    if (cita.estado === 'cancelada' || cita.estado === 'reprogramada') continue;
    const ms = Date.parse(cita.agendada_para);
    if (Number.isFinite(ms)) horaDe.set(cita.id, ms);
  }
  const ocupada = new Map<string, readonly number[]>();
  for (const fila of servicios) {
    const ms = fila.cita_id === null ? undefined : horaDe.get(fila.cita_id);
    if (ms === undefined || fila.profesional_id === null) continue;
    ocupada.set(fila.profesional_id, [...(ocupada.get(fila.profesional_id) ?? []), ms]);
  }
  return ocupada;
}

/** F-425 · Con quién viene siempre. Proponerla ahorra el toque más repetido. */
export function profesionalDeSiempre(
  clientaId: string,
  citas: readonly CitaDeAgenda[],
  servicios: readonly ServicioDeCita[],
): string | null {
  const suyas = new Set(citas.filter((c) => c.cliente_id === clientaId).map((c) => c.id));
  for (const fila of servicios) {
    if (fila.cita_id !== null && suyas.has(fila.cita_id) && fila.profesional_id !== null) {
      return fila.profesional_id;
    }
  }
  return null;
}

/** Los próximos huecos que CABEN, repartidos entre días. */
export function huecosDe(
  desde: Date,
  minutos: number,
  profesionalId: string,
  ocupada: ReadonlyMap<string, readonly number[]>,
  cuantos: number,
): readonly Hueco[] {
  const encontrados: Hueco[] = [];
  const largoMs = minutos * 60_000;
  const bloques = ocupada.get(profesionalId) ?? [];
  for (let dia = 0; dia < DIAS_HORIZONTE && encontrados.length < cuantos; dia += 1) {
    let enEsteDia = 0;
    let libreDesde = 0;
    for (let min = APERTURA_MIN; min + minutos <= CIERRE_MIN; min += PASO_MIN) {
      if (enEsteDia >= MAX_POR_DIA || encontrados.length >= cuantos) break;
      const inicio = new Date(desde);
      inicio.setDate(inicio.getDate() + dia);
      inicio.setHours(0, min, 0, 0);
      const t = inicio.getTime();
      if (t < desde.getTime() || t < libreDesde) continue;
      const choca = bloques.some(
        (ms) => t < ms + DURACION_POR_OMISION_MIN * 60_000 && ms < t + largoMs,
      );
      if (choca) continue;
      encontrados.push({ profesionalId, inicio });
      enEsteDia += 1;
      libreDesde = t + SEPARACION_MIN * 60_000;
    }
  }
  return encontrados;
}

function aMedianoche(fecha: Date): number {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
}

/** «HOY», «MAÑANA» o «JUE 16»: la palabra antes que la fecha. */
export function etiquetaDeDia(fecha: Date, hoy: Date): string {
  const dias = Math.round((aMedianoche(fecha) - aMedianoche(hoy)) / DIA_MS);
  if (dias === 0) return 'HOY';
  if (dias === 1) return 'MAÑANA';
  return fecha.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' }).toUpperCase();
}

export function laHora(fecha: Date): string {
  return fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** El fallo con palabras de salón. Los códigos son los del contrato. */
export function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === 429) return 'Demasiados intentos seguidos. Espera unos segundos.';
    if (fallo.error.codigo === 'CONFLICTO_ESTADO') {
      return 'Ese hueco se acaba de ocupar. Elige otro: no se perdió nada.';
    }
    if (fallo.error.codigo === 'SIN_PERMISO') return 'Tu usuario no puede agendar citas.';
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo agendar. No se guardó nada.';
}

const PASOS = ['¿Quién?', '¿Qué?', '¿Con quién?', '¿Cuándo?'] as const;

/** En teléfono sólo se ve el paso activo; de tablet para arriba, los cuatro. */
function clasePaso(visible: boolean): string {
  return visible ? 'space-y-2' : 'hidden space-y-2 md:block';
}

/** Las tres clases de una tarjeta que se puede elegir. */
function claseElegible(elegida: boolean): string {
  return elegida
    ? 'border-primary bg-primary/15 font-semibold'
    : 'border-border hover:bg-accent hover:text-accent-foreground';
}

export function Agendar({
  clientasIniciales,
  serviciosIniciales,
  profesionalesIniciales,
  citasIniciales,
  serviciosDeCitaIniciales,
  onAgendada,
  onCancelar,
}: AgendarProps) {
  const voc = useVocabulario();
  const [clientas, setClientas] = useState<readonly ClientaDeAgenda[]>(clientasIniciales ?? []);
  const [servicios, setServicios] = useState<readonly ServicioDeAgenda[] | null>(
    serviciosIniciales ?? null,
  );
  const [equipo, setEquipo] = useState<readonly ProfesionalDeAgenda[]>(
    profesionalesIniciales ?? [],
  );
  const [citas, setCitas] = useState<readonly CitaDeAgenda[]>(citasIniciales ?? []);
  const [deCita, setDeCita] = useState<readonly ServicioDeCita[]>(serviciosDeCitaIniciales ?? []);

  const [paso, setPaso] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [clientaId, setClientaId] = useState<string | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [telefonoNuevo, setTelefonoNuevo] = useState('');
  const [servicioId, setServicioId] = useState<string | null>(null);
  const [profesionalId, setProfesionalId] = useState<string | null>(null);
  const [elegido, setElegido] = useState<Hueco | null>(null);
  const [desdeTexto, setDesdeTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Se fija al montar: recalcularlo en cada render movería los huecos bajo el dedo.
  const [ahora] = useState(() => new Date());

  useEffect(() => {
    if (serviciosIniciales !== undefined) return;
    // Centinela por AbortController y no por una bandera: la bandera el
    // compilador la da por siempre-verdadera y además no corta la petición.
    const control = new AbortController();
    const senal = control.signal;
    Promise.all([
      consultarPuente<ClientaDeAgenda>('Cliente', { limite: 300, signal: senal }),
      consultarPuente<ServicioDeAgenda>('ProductoTerminado', {
        filtro: { tipo_venta: 'servicio' },
        limite: 120,
        signal: senal,
      }),
      consultarPuente<ProfesionalDeAgenda>('Profesional', { limite: 40, signal: senal }),
      consultarPuente<CitaDeAgenda>('Cita', { limite: 400, signal: senal }),
      consultarPuente<ServicioDeCita>('CitaServicio', { limite: 600, signal: senal }),
    ])
      .then(([filasClientas, filasServicios, filasEquipo, filasCitas, filasDeCita]) => {
        setClientas(filasClientas);
        setServicios(filasServicios);
        setEquipo(filasEquipo.filter((fila) => fila.activo !== false));
        setCitas(filasCitas);
        setDeCita(filasDeCita);
      })
      .catch((fallo: unknown) => {
        // La pantalla NO se vacía por un fallo de red: se dice qué pasó y se
        // deja agendar con lo que ya está en pantalla.
        if (senal.aborted) return;
        setServicios([]);
        setError(mensajeDe(fallo));
      });
    return () => {
      control.abort();
    };
  }, [serviciosIniciales]);

  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return;
      if (onCancelar === undefined) window.history.back();
      else onCancelar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, [onCancelar]);

  const ocupada = useMemo(() => ocupacionDe(citas, deCita), [citas, deCita]);
  const clientaElegida = clientas.find((fila) => fila.id === clientaId) ?? null;
  const servicioElegido = servicios?.find((fila) => fila.id === servicioId) ?? null;
  const minutos = servicioElegido?.tiempo_preparacion_estimado ?? DURACION_POR_OMISION_MIN;

  const coincidencias = useMemo(() => {
    const aguja = busqueda.trim().toLocaleLowerCase('es-MX');
    if (aguja === '') return clientas.slice(0, 5);
    return clientas
      .filter((fila) => `${fila.nombre ?? ''} ${fila.telefono ?? ''}`.toLowerCase().includes(aguja))
      .slice(0, 5);
  }, [clientas, busqueda]);

  const desde = useMemo(() => {
    if (desdeTexto === '') return ahora;
    const pedida = new Date(`${desdeTexto}T00:00:00`);
    return Number.isNaN(pedida.getTime()) || pedida < ahora ? ahora : pedida;
  }, [desdeTexto, ahora]);

  const huecos = useMemo(
    () =>
      profesionalId === null
        ? []
        : huecosDe(desde, minutos, profesionalId, ocupada, HUECOS_QUE_CABEN),
    [desde, minutos, profesionalId, ocupada],
  );

  /** Lo que salva la venta cuando la de siempre está llena. No se empuja. */
  const conOtraPersona = useMemo(
    () =>
      equipo
        .filter((fila) => fila.id !== profesionalId)
        .map((fila) => huecosDe(desde, minutos, fila.id, ocupada, 1)[0])
        .filter((hueco): hueco is Hueco => hueco !== undefined)
        .slice(0, 2),
    [equipo, profesionalId, desde, minutos, ocupada],
  );

  const primero = huecos[0];
  const sinLugarEstaSemana =
    profesionalId !== null &&
    (primero === undefined || aMedianoche(primero.inicio) - aMedianoche(desde) >= 7 * DIA_MS);
  const nombreDe = (id: string): string =>
    equipo.find((fila) => fila.id === id)?.nombre_corto ?? 'el equipo';

  async function confirmar(): Promise<void> {
    if (servicioId === null || elegido === null) return;
    setEnviando(true);
    setError(null);
    try {
      let id = clientaId;
      if (id === null && nombreNuevo.trim() !== '') {
        /**
         * EL ALTA VA A `/api/clientes`, que es donde ya vivía.
         *
         * Aquí se publicaba en `/api/cliente/crear` —singular, con verbo— «por
         * convención», y esa ruta NO EXISTE: el botón devolvía la página de error
         * de Next, el cliente lo traducía a «el servidor respondió algo
         * inesperado» y el asistente se quedaba en el primer paso. Con la demo en
         * cero clientas, eso significaba que **no se podía agendar por la
         * pantalla**.
         *
         * La ruta de verdad es `POST /api/clientes` (`cliente.alta`, F-040), que
         * además devuelve la ficha que ya hay si el teléfono está repetido: en el
         * mostrador, «ese cliente ya existe» es un callejón sin salida porque hay
         * alguien esperando. Crear un alias habría sido tener dos puertas al mismo
         * alta.
         */
        const alta = await invocarComando<{ clienteId: string }>('/api/clientes', {
          nombre: nombreNuevo.trim(),
          telefono: telefonoNuevo.trim(),
        });
        id = alta.clienteId;
      }
      const cita = await invocarComando<{ citaId: string }>('/api/agenda/cita', {
        ...(id === null ? {} : { clienteId: id }),
        origen: 'whatsapp',
        inicio: elegido.inicio.toISOString(),
        servicios: [{ servicioId, profesionalId: elegido.profesionalId }],
      });
      onAgendada?.(cita.citaId);
    } catch (fallo) {
      setError(mensajeDe(fallo));
    } finally {
      setEnviando(false);
    }
  }

  /**
   * F-409 · Apuntar en lista de espera.
   *
   * ── Los dos defectos que esto arregla ─────────────────────────────────────
   * 1. Publicaba en `/api/agenda/lista-espera` «por convención» y la ruta de
   *    verdad es `/api/lista-espera` (`lista_espera_citas.anotar`), que existe
   *    desde la fase 2. El botón devolvía la página de error de Next.
   * 2. Mandaba tres campos opcionales y el comando pide **una VENTANA** y una
   *    clienta: `desde`, `hasta` y `clienteId` son obligatorios, y con razón —una
   *    fila de espera sin a quién avisar no sirve para nada, y sin ventana no se
   *    sabe qué hueco le vale—. Ni con la ruta correcta habría entrado nadie.
   *
   * La ventana es la semana que se está mirando: es exactamente lo que la clienta
   * acaba de decir que no encontró. `flexibleDeDia` va en verdadero porque quien
   * se apunta a una espera acepta el día que se libere.
   */
  async function apuntarEnEspera(): Promise<void> {
    setError(null);
    if (clientaId === null) {
      setError('Elige a la clienta: sin ficha no hay a quién avisarle cuando se libere algo.');
      return;
    }
    try {
      const hasta = new Date(desde.getTime() + 7 * DIA_MS);
      await invocarComando('/api/lista-espera', {
        clienteId: clientaId,
        ...(servicioId === null ? {} : { servicioId }),
        ...(profesionalId === null ? {} : { profesionalId }),
        desde: desde.toISOString(),
        hasta: hasta.toISOString(),
        flexibleDeDia: true,
      });
      setAviso('Apuntada en la lista de espera. Se avisa en cuanto se libere algo.');
    } catch (fallo) {
      setError(mensajeDe(fallo));
    }
  }

  if (servicios === null) {
    return (
      <div className="space-y-4 p-4 lg:ml-auto lg:w-[420px]">
        <Skeleton className="h-5 w-32" />
        {/* Esqueletos con la forma de los cuatro pasos: la estructura de la
            conversación no cambia y dibujarla ya es correcto. */}
        {PASOS.map((titulo) => (
          <div key={titulo} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  // El vacío que ENSEÑA: un salón recién dado de alta no tiene nada que elegir,
  // y lo que le falta no es esta pantalla sino su equipo y su carta.
  if (servicios.length === 0 || equipo.length === 0) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-8 text-center">
        <p className="text-lg font-semibold">Antes de agendar hay que decir qué se ofrece.</p>
        <p className="text-sm text-muted-foreground">
          {equipo.length === 0
            ? 'Da de alta a tu equipo: cada cita cuelga de una persona y de su horario.'
            : 'Da de alta tus servicios con su duración: de ahí salen los huecos que caben.'}
        </p>
        <Button asChild>
          <a href="/configuracion">
            {equipo.length === 0 ? 'Dar de alta a mi equipo' : 'Crear mi primer servicio'}
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="lg:flex lg:justify-end">
      <section
        aria-label={`Agendar ${voc.enFraseCon('un', 'orden')}`}
        className="flex min-h-dvh w-full flex-col bg-background lg:w-[420px] lg:border-l lg:border-border lg:shadow-3"
      >
        <header className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <h1 className="flex-1 text-xl font-bold">Agendar</h1>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (onCancelar === undefined) window.history.back();
              else onCancelar();
            }}
          >
            Cancelar
          </Button>
          {/* Migas: sólo en teléfono, donde se ve un paso por pantalla. */}
          <nav
            aria-label={`Pasos de ${voc.enFrase('orden')}`}
            className="flex w-full gap-1 md:hidden"
          >
            {PASOS.map((titulo, i) => (
              <button
                key={titulo}
                type="button"
                aria-current={i === paso ? 'step' : undefined}
                onClick={() => {
                  setPaso(i);
                }}
                className={`flex-1 rounded-md px-1 py-1 text-xs ${
                  i === paso
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {i + 1} {titulo}
              </button>
            ))}
          </nav>
        </header>

        {error !== null && (
          <p role="alert" className="border-b border-destructive/40 bg-destructive/15 p-3 text-sm">
            {error}
          </p>
        )}
        {aviso !== null && (
          <p role="status" className="border-b border-border bg-success/20 p-3 text-sm">
            {aviso}
          </p>
        )}

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <section className={clasePaso(paso === 0)} aria-labelledby="paso-quien">
            <h2 id="paso-quien" className="text-sm font-semibold text-muted-foreground">
              1 · ¿Quién?
            </h2>
            <Label htmlFor="buscar-clienta" className="sr-only">
              Buscar {voc.singular('cliente')} por nombre o teléfono
            </Label>
            <Input
              id="buscar-clienta"
              value={busqueda}
              placeholder="Nombre o teléfono"
              onChange={(evento) => {
                setBusqueda(evento.target.value);
              }}
            />
            <ul className="space-y-1">
              {coincidencias.map((fila) => (
                <li key={fila.id}>
                  <button
                    type="button"
                    aria-pressed={fila.id === clientaId}
                    onClick={() => {
                      setClientaId(fila.id);
                      setNombreNuevo('');
                      // F-425 se resuelve aquí, en el manejador: proponer a la
                      // de siempre ya elegida es el toque que más se repite.
                      setProfesionalId(profesionalDeSiempre(fila.id, citas, deCita));
                      setPaso(1);
                    }}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${claseElegible(
                      fila.id === clientaId,
                    )}`}
                  >
                    {fila.nombre ?? 'Sin nombre'}
                    <span className="ml-2 text-muted-foreground">{fila.telefono ?? ''}</span>
                  </button>
                </li>
              ))}
            </ul>
            {/* El alta en línea son DOS campos. Pedir más aquí es perder la cita. */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <Label htmlFor="nueva-nombre" className="text-xs">
                  ¿No está? Nombre
                </Label>
                <Input
                  id="nueva-nombre"
                  value={nombreNuevo}
                  onChange={(evento) => {
                    setNombreNuevo(evento.target.value);
                    setClientaId(null);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="nueva-telefono" className="text-xs">
                  Teléfono
                </Label>
                <Input
                  id="nueva-telefono"
                  type="tel"
                  value={telefonoNuevo}
                  onChange={(evento) => {
                    setTelefonoNuevo(evento.target.value);
                  }}
                />
              </div>
            </div>
          </section>

          <section className={clasePaso(paso === 1)} aria-labelledby="paso-que">
            <h2 id="paso-que" className="text-sm font-semibold text-muted-foreground">
              2 · ¿Qué?
            </h2>
            <ul className="grid grid-cols-2 gap-2">
              {servicios.map((fila) => (
                <li key={fila.id}>
                  <button
                    type="button"
                    aria-pressed={fila.id === servicioId}
                    onClick={() => {
                      setServicioId(fila.id);
                      setElegido(null);
                      setPaso(2);
                    }}
                    className={`flex min-h-20 w-full flex-col justify-center rounded-lg border p-2 text-sm ${claseElegible(
                      fila.id === servicioId,
                    )}`}
                  >
                    <span>{fila.nombre ?? 'Servicio'}</span>
                    <span className="text-xs text-muted-foreground">
                      {fila.tiempo_preparacion_estimado ?? DURACION_POR_OMISION_MIN} min
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className={clasePaso(paso === 2)} aria-labelledby="paso-con-quien">
            <h2 id="paso-con-quien" className="text-sm font-semibold text-muted-foreground">
              3 · ¿Con quién?
            </h2>
            <ul className="flex flex-wrap gap-2">
              {equipo.map((fila) => (
                <li key={fila.id}>
                  <Button
                    type="button"
                    size="sm"
                    aria-pressed={fila.id === profesionalId}
                    variant={
                      fila.id === profesionalId ? ('default' as const) : ('outline' as const)
                    }
                    onClick={() => {
                      setProfesionalId(fila.id);
                      setElegido(null);
                      setPaso(3);
                    }}
                  >
                    {fila.nombre_corto ?? fila.nombre_completo ?? 'Sin nombre'}
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <section className={clasePaso(paso === 3)} aria-labelledby="paso-cuando">
            <h2 id="paso-cuando" className="text-sm font-semibold text-muted-foreground">
              4 · ¿Cuándo?
            </h2>
            {profesionalId === null && (
              <p className="text-sm text-muted-foreground">
                Elige con quién y aquí aparecen los huecos que caben.
              </p>
            )}
            {sinLugarEstaSemana && (
              <p
                role="status"
                className="rounded-md border border-warning/40 bg-warning/20 p-2 text-sm"
              >
                No hay lugar esta semana con {nombreDe(profesionalId)}. Abajo están los de la
                siguiente.
              </p>
            )}
            <ul className="space-y-1">
              {huecos.map((hueco) => (
                <li key={`${hueco.profesionalId}-${hueco.inicio.toISOString()}`}>
                  <button
                    type="button"
                    aria-pressed={elegido?.inicio.getTime() === hueco.inicio.getTime()}
                    onClick={() => {
                      setElegido(hueco);
                    }}
                    className={`flex w-full items-baseline gap-3 rounded-md border px-3 py-2 text-left ${claseElegible(
                      elegido?.inicio.getTime() === hueco.inicio.getTime(),
                    )}`}
                  >
                    <span className="w-20 text-xs tracking-wide text-muted-foreground">
                      {etiquetaDeDia(hueco.inicio, ahora)}
                    </span>
                    <span className="text-lg font-semibold">{laHora(hueco.inicio)}</span>
                    <span className="text-sm">{nombreDe(hueco.profesionalId)}</span>
                  </button>
                </li>
              ))}
            </ul>

            <Separator className="my-3" />
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="otra-fecha" className="text-sm">
                ¿Otra fecha?
              </Label>
              <Input
                id="otra-fecha"
                type="date"
                className="w-auto"
                value={desdeTexto}
                onChange={(evento) => {
                  setDesdeTexto(evento.target.value);
                  setElegido(null);
                }}
              />
            </div>

            {conOtraPersona.length > 0 && (
              <div className="space-y-1 pt-2">
                <p className="text-sm text-muted-foreground">¿Le sirve con otra persona?</p>
                <div className="flex flex-wrap gap-2">
                  {conOtraPersona.map((hueco) => (
                    <Button
                      key={`${hueco.profesionalId}-${hueco.inicio.toISOString()}`}
                      type="button"
                      size="sm"
                      variant={'secondary' as const}
                      onClick={() => {
                        setElegido(hueco);
                      }}
                    >
                      {etiquetaDeDia(hueco.inicio, ahora)} {laHora(hueco.inicio)} con{' '}
                      {nombreDe(hueco.profesionalId)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {sinLugarEstaSemana && (
              <Button
                type="button"
                variant={'outline' as const}
                className="mt-2"
                onClick={() => {
                  void apuntarEnEspera();
                }}
              >
                Apuntar en lista de espera
              </Button>
            )}
          </section>
        </div>

        {/* Fijo abajo: en tablet y teléfono es lo único que siempre se alcanza. */}
        <footer className="sticky bottom-0 space-y-2 border-t border-border bg-card p-4">
          {/* Lo que aparece AL CONFIRMAR y no antes. */}
          {clientaElegida?.alergias === true && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/15 p-2 text-sm"
            >
              ⚠️ Esta clienta tiene alergias declaradas. Revísalas antes de aplicar.
            </p>
          )}
          {(clientaElegida?.faltas_6m ?? 0) >= 2 && (
            <p className="rounded-md border border-warning/40 bg-warning/20 p-2 text-sm">
              Ha faltado {clientaElegida?.faltas_6m ?? 0} veces en 6 meses. ¿Pedir anticipo?
            </p>
          )}
          {elegido !== null && (
            <p className="text-sm">
              <Badge variant={'secondary' as const} className="mr-2">
                {etiquetaDeDia(elegido.inicio, ahora)} {laHora(elegido.inicio)}
              </Badge>
              {servicioElegido?.nombre ?? 'Servicio'} con {nombreDe(elegido.profesionalId)}
            </p>
          )}
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={enviando || elegido === null || servicioId === null}
            onClick={() => {
              void confirmar();
            }}
          >
            {enviando ? 'Agendando…' : 'Confirmar la cita'}
          </Button>
          {/* En teléfono se avanza paso a paso; de tablet para arriba sobra. */}
          {paso < PASOS.length - 1 && (
            <Button
              type="button"
              variant={'outline' as const}
              className="w-full md:hidden"
              onClick={() => {
                setPaso(paso + 1);
              }}
            >
              Siguiente · {PASOS[paso + 1] ?? ''}
            </Button>
          )}
        </footer>
      </section>
    </div>
  );
}
