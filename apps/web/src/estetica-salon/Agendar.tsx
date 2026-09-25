'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import {
  Aviso,
  Cifra,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Vacio,
} from '@morphiqpos/ui/sistema';
import {
  CalendarClock,
  CalendarSearch,
  Check,
  Scissors,
  Search,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';

import {
  HUECOS_QUE_CABEN,
  conOtraPersona as primerosConOtraPersona,
  consumoDeLaReceta,
  diaIso,
  huecosParaOfrecer,
  minutosDelServicio,
  type Hueco,
  type HuecoDelServidor,
  type LineaDeReceta,
  type ServicioConTiempos,
} from './agendar-huecos.ts';
import type { AsignacionGuardada } from './quien-da-el-servicio.ts';
import { useVocabulario } from '~/cliente/vocabulario';

import {
  conExpedienteYFaltas,
  type ExpedienteDeClienta,
  type FaltaDeClienta,
} from './ficha-de-clienta.ts';

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
 * PC (≥1280, `xl`): panel de 420 px pegado a la derecha, con la agenda del día
 * detrás —la pinta la ruta que lo monta—, para agendar sin perder el día de
 * vista; su cuerpo se desplaza dentro y el botón no se mueve. Tablet (768–1279,
 * el dispositivo principal: la recepción): diálogo a pantalla completa, los
 * cuatro pasos en scroll en una columna legible y el botón fijo abajo. Teléfono:
 * UN PASO POR PANTALLA con migas arriba, que es como Paty la usa en su casa a
 * las 21:10.
 *
 * ── Lo que se elige es una TESELA, y lo grande es la HORA ─────────────────
 * Clienta, servicio, profesional y hueco son cosas que se tocan con el dedo en
 * una tableta de mostrador: cada una es una `Superficie` interactiva, y la
 * elegida lleva además su palomita —el anillo solo no se lee de reojo—. En los
 * huecos manda la hora, en cifras grandes: es lo que se copia al WhatsApp. El
 * día se escribe una vez por grupo, como en la conversación («mañana a las 11
 * o a las 4»).
 *
 * ── Lo que NO va aquí ───────────────────────────────────────────────────
 * Precio editable —se ajusta al cobrar—, notas largas, datos fiscales y nada
 * del expediente.
 *
 * ── Cómo se agenda, pieza por pieza (C.10 de la 2.4) ───────────────────
 * 1. Los huecos son del SERVIDOR (`agenda.huecos`, F-404): las ventanas del
 *    horario de cada persona menos sus tramos activos reales, los bloqueos y el
 *    procesado que la libera. Aquí se restaba una rejilla con bloques de 60 min
 *    «por omisión», y se ofrecían horas que el agendado rechazaba.
 * 2. La duración es la de sus tres tramos (F-415), al factor de QUIEN lo da
 *    (`servicios.asignaciones`), y sólo se ofrece a quien lo da: sin esa fila la
 *    agenda no deja agendar (`agenda-huecos.ts`).
 * 3. Si el material de cabina no alcanza para el servicio, se avisa al elegirlo
 *    (F-107, `cabina.alcanza` con la receta del servicio).
 * 4. Atajos de PC: ESC cierra, Enter agenda la hora elegida, ← → la semana.
 * 5. Al agendar se vuelve a la agenda; si venía de la lista de espera, la espera
 *    queda atada a su cita. Antes no pasaba nada: un segundo toque la duplicaba.
 */

/** La rejilla del día del salón. Fuera de aquí no hay nada que ofrecer. */
/** Dos semanas: la primera es la respuesta y la segunda es el plan B. */
/** Dos por día, separadas: mañana y tarde son opciones; 11:00 y 11:15 no. */
const DIA_MS = 86_400_000;

export interface ClientaDeAgenda {
  readonly id: string;
  readonly nombre: string | null;
  readonly telefono: string | null;
  /** Del expediente de belleza y de `no_shows`, juntados al leer (`ficha-de-clienta.ts`). */
  readonly alergias?: boolean | null;
  readonly faltas_6m?: number | null;
}

export interface ServicioDeAgenda extends ServicioConTiempos {
  readonly id: string;
  readonly nombre: string | null;
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
  return visible ? 'flex flex-col gap-(--espacio-3)' : 'hidden flex-col gap-(--espacio-3) md:flex';
}

/** El tinte de la tesela elegida, además del anillo de `activa` y su palomita. */
function tinteDe(elegida: boolean): string {
  return elegida ? 'bg-primario/10' : '';
}

/** La columna de lectura en tablet: a 1024 px, una fila de lado a lado no se lee. */
const COLUMNA = 'md:mx-auto md:w-full md:max-w-2xl xl:max-w-none';

/** La palomita de lo elegido: el color no puede ser lo único que lo diga. */
function Palomita({ elegida }: { readonly elegida: boolean }) {
  return elegida ? <Check aria-hidden="true" className="size-5 shrink-0 text-primario" /> : null;
}

/**
 * El encabezado de un paso: su número —o la palomita cuando ya se eligió— y su
 * pregunta. El número va también en texto para el lector de pantalla.
 */
function EncabezadoDePaso({
  id,
  numero,
  pregunta,
  hecho,
}: {
  readonly id: string;
  readonly numero: number;
  readonly pregunta: string;
  readonly hecho: boolean;
}) {
  return (
    <h2
      id={id}
      className="flex items-center gap-(--espacio-2) text-sm font-semibold text-texto-sutil"
    >
      <span
        aria-hidden="true"
        className={`flex size-5 shrink-0 items-center justify-center rounded-full font-numeros text-xs ${
          hecho ? 'bg-primario text-primario-texto' : 'bg-fondo-sutil text-texto'
        }`}
      >
        {hecho ? <Check className="size-3" /> : numero}
      </span>
      <span className="sr-only">{numero} · </span>
      {pregunta}
    </h2>
  );
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
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada intento de lectura es un número: el botón de reintentar lo sube y el
  // efecto lee otra vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const enrutador = useRouter();
  /** Quién da el servicio elegido; nulo mientras no se lee (entonces, todas). */
  const [asignaciones, setAsignaciones] = useState<readonly AsignacionGuardada[] | null>(null);
  /** Las ventanas libres del servidor, de todas las que lo pueden dar. */
  const [huecosLeidos, setHuecosLeidos] = useState<readonly HuecoDelServidor[]>([]);
  const [falloDeHuecos, setFalloDeHuecos] = useState<string | null>(null);
  /** Los materiales de cabina que no alcanzan para el servicio elegido. */
  const [faltaEnCabina, setFaltaEnCabina] = useState<readonly string[]>([]);
  /** Si se llegó desde la lista de espera: la espera que esta cita cumple. */
  const [esperaId, setEsperaId] = useState<string | null>(null);

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
      consultarPuente<ExpedienteDeClienta>('ExpedienteBelleza', { limite: 300, signal: senal }),
      consultarPuente<FaltaDeClienta>('NoShow', { limite: 500, signal: senal }),
    ])
      .then(
        ([filasClientas, filasServicios, filasEquipo, filasCitas, filasDeCita, fichas, faltas]) => {
          // La alergia y las faltas viven en el expediente y en `no_shows`, no en el
          // cliente: sin juntarlas, los dos avisos de abajo no salían nunca (C.9 de la 2.4).
          setClientas(conExpedienteYFaltas(filasClientas, fichas, faltas, new Date()));
          setServicios(filasServicios);
          setEquipo(filasEquipo.filter((fila) => fila.activo !== false));
          setCitas(filasCitas);
          setDeCita(filasDeCita);
        },
      )
      .catch((fallo: unknown) => {
        // Sin clientas, servicios ni equipo no hay nada que ofrecer: la lectura
        // es de todo o nada (`Promise.all`), así que no queda nada en pantalla con
        // qué agendar. Se dice qué pasó y se deja reintentar — nunca el vacío de
        // «da de alta tus servicios», que sería mentir sobre un salón que sí los
        // tiene.
        if (senal.aborted) return;
        setFalloDeCarga(mensajeDe(fallo));
      });
    return () => {
      control.abort();
    };
  }, [serviciosIniciales, intento]);

  function volverALeer(): void {
    setFalloDeCarga(null);
    setServicios(null);
    setIntento((previo) => previo + 1);
  }

  // ESC cierra; Enter agenda la hora elegida; ← → mueven la semana. Enter y las flechas
  // no se roban dentro de un campo: ahí son del texto.
  const alTeclear = useEffectEvent((evento: KeyboardEvent) => {
    if (evento.key === 'Escape') {
      if (onCancelar === undefined) window.history.back();
      else onCancelar();
      return;
    }
    const enCampo =
      evento.target instanceof HTMLInputElement || evento.target instanceof HTMLTextAreaElement;
    if (enCampo || enviando) return;
    if (evento.key === 'Enter' && elegido !== null && servicioId !== null) {
      evento.preventDefault();
      void confirmar();
    } else if (evento.key === 'ArrowRight' || evento.key === 'ArrowLeft') {
      evento.preventDefault();
      moverSemana(evento.key === 'ArrowRight' ? 1 : -1);
    }
  });
  useEffect(() => {
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, []);

  // Desde la lista de espera se llega con la clienta y la espera en la dirección.
  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);
    const arranque = setTimeout(() => {
      const clienta = parametros.get('clienta');
      if (clienta !== null && clienta !== '') setClientaId(clienta);
      const espera = parametros.get('espera');
      if (espera !== null && espera !== '') setEsperaId(espera);
    });
    return () => {
      clearTimeout(arranque);
    };
  }, []);

  // Quién da el servicio elegido, con su factor (`servicios.asignaciones`).
  useEffect(() => {
    if (servicioId === null || serviciosIniciales !== undefined) return;
    let vigente = true;
    invocarComando<{ readonly asignaciones: readonly AsignacionGuardada[] }>(
      '/api/servicios/asignaciones',
      { servicioId },
    )
      .then((salida) => {
        if (vigente) setAsignaciones(salida.asignaciones);
      })
      .catch(() => {
        if (vigente) setAsignaciones(null);
      });
    return () => {
      vigente = false;
    };
  }, [servicioId, serviciosIniciales]);

  // ¿Alcanza el material de cabina para este servicio? (F-107)
  useEffect(() => {
    if (servicioId === null || serviciosIniciales !== undefined) return;
    let vigente = true;
    consultarPuente<LineaDeReceta>('RecetaEscandallo', {
      filtro: { producto_id: servicioId },
      limite: 60,
    })
      .then((lineas) => {
        const consumo = consumoDeLaReceta(lineas);
        if (consumo.length === 0) return { insumos: [] };
        return invocarComando<{
          readonly insumos: readonly { readonly nombre: string | null; readonly falta: boolean }[];
        }>('/api/inventario/cabina/alcanza', { consumoEsperado: consumo });
      })
      .then((salida) => {
        if (vigente)
          setFaltaEnCabina(
            salida.insumos.filter((i) => i.falta).map((i) => i.nombre ?? 'un material'),
          );
      })
      .catch(() => {
        if (vigente) setFaltaEnCabina([]);
      });
    return () => {
      vigente = false;
    };
  }, [servicioId, serviciosIniciales]);

  const clientaElegida = clientas.find((fila) => fila.id === clientaId) ?? null;
  const servicioElegido = servicios?.find((fila) => fila.id === servicioId) ?? null;
  // Quién da el servicio elegido, con su factor. Sin asignaciones leídas, todas.
  const quienesLoDan = useMemo(
    () => (asignaciones === null ? null : new Set(asignaciones.map((a) => a.profesionalId))),
    [asignaciones],
  );
  const factorDe = (id: string | null): number =>
    asignaciones?.find((a) => a.profesionalId === id)?.factorDuracionBp ?? 10_000;
  const minutos =
    servicioElegido === null ? null : minutosDelServicio(servicioElegido, factorDe(profesionalId));
  const equipoDelServicio =
    quienesLoDan === null ? equipo : equipo.filter((fila) => quienesLoDan.has(fila.id));

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

  // LOS HUECOS, del servidor: dos semanas desde el día que se mira.
  useEffect(() => {
    if (minutos === null || serviciosIniciales !== undefined) return;
    let vigente = true;
    const hasta = new Date(desde.getTime() + 14 * DIA_MS);
    invocarComando<{ readonly huecos: readonly HuecoDelServidor[] }>('/api/agenda/huecos', {
      desde: diaIso(desde),
      hasta: diaIso(hasta),
      minutos,
      profesionalId: null,
    })
      .then((salida) => {
        if (!vigente) return;
        setFalloDeHuecos(null);
        setHuecosLeidos(salida.huecos.filter((h) => new Date(h.inicio).getTime() >= Date.now()));
      })
      .catch((fallo: unknown) => {
        if (vigente) setFalloDeHuecos(mensajeDe(fallo));
      });
    return () => {
      vigente = false;
    };
  }, [minutos, desde, serviciosIniciales]);

  /** La semana siguiente o la anterior, nunca antes de hoy. */
  function moverSemana(direccion: 1 | -1): void {
    const otra = new Date(desde.getTime() + direccion * 7 * DIA_MS);
    setDesdeTexto(otra < ahora ? '' : diaIso(otra));
    setElegido(null);
  }

  const huecos = useMemo(
    () =>
      huecosParaOfrecer(
        huecosLeidos.filter((h) => h.profesionalId === profesionalId),
        HUECOS_QUE_CABEN,
      ),
    [huecosLeidos, profesionalId],
  );

  /** Lo que salva la venta cuando la de siempre está llena. No se empuja. */
  const conOtraPersona = useMemo(
    () => primerosConOtraPersona(huecosLeidos, profesionalId, quienesLoDan),
    [huecosLeidos, profesionalId, quienesLoDan],
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
      // Si venía de la lista de espera, la espera se ata a su cita: ya no espera.
      if (esperaId !== null) {
        await invocarComando(`/api/lista-espera/${esperaId}/agendar`, { citaId: cita.citaId });
      }
      if (onAgendada === undefined) enrutador.push('/estetica-salon/agenda-del-dia');
      else onAgendada(cita.citaId);
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

  if (falloDeCarga !== null) {
    return (
      <main className="mx-auto max-w-lg p-(--espacio-6)">
        <ErrorDePantalla
          titulo="No se pudo leer lo necesario para agendar"
          queHacer={`Sin ${voc.plural('cliente')}, servicios y equipo no hay huecos que ofrecer. Revisa la conexión y vuelve a intentarlo: no se agendó nada.`}
          detalle={falloDeCarga}
          reintentar={
            <Button type="button" onClick={volverALeer}>
              Volver a intentar
            </Button>
          }
        />
      </main>
    );
  }

  if (servicios === null) {
    return (
      <main className="xl:flex xl:justify-end">
        {/* La forma del panel y de sus cuatro pasos, no una rueda: la estructura
            de la conversación no cambia y dibujarla ya es correcto. */}
        <div
          role="status"
          aria-busy="true"
          aria-label={`Cargando ${voc.plural('cliente')}, servicios y equipo`}
          className="flex min-h-dvh w-full flex-col xl:w-[420px] xl:border-l xl:border-borde"
        >
          <div className="border-b border-borde p-(--espacio-4)">
            <Esqueleto className="h-5 w-32" />
          </div>
          <div
            className={`flex flex-col gap-(--espacio-8) p-(--espacio-4) md:p-(--espacio-6) xl:p-(--espacio-4) ${COLUMNA}`}
          >
            {PASOS.map((titulo) => (
              <div key={titulo} className="flex flex-col gap-(--espacio-3)">
                <Esqueleto className="h-4 w-24" />
                <Esqueleto className="h-20 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // El vacío que ENSEÑA: un salón recién dado de alta no tiene nada que elegir,
  // y lo que le falta no es esta pantalla sino su equipo y su carta.
  if (servicios.length === 0 || equipo.length === 0) {
    const sinEquipo = equipo.length === 0;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-(--espacio-4)">
        <Vacio
          icono={sinEquipo ? <UsersRound /> : <Scissors />}
          titulo="Antes de agendar hay que decir qué se ofrece."
          explicacion={
            sinEquipo
              ? 'Da de alta a tu equipo: cada cita cuelga de una persona y de su horario.'
              : 'Da de alta tus servicios con su duración: de ahí salen los huecos que caben.'
          }
          accion={
            <Button asChild>
              <a href="/configuracion">
                {sinEquipo ? 'Dar de alta a mi equipo' : 'Crear mi primer servicio'}
              </a>
            </Button>
          }
        />
      </main>
    );
  }

  const listo = {
    quien: clientaId !== null || nombreNuevo.trim() !== '',
    que: servicioId !== null,
    conQuien: profesionalId !== null,
    cuando: elegido !== null,
  };
  // F-425 · la de siempre se marca en su tesela, no sólo se preselecciona: si
  // recepción cambió de persona, se ve de un vistazo con quién venía.
  const deSiempre = clientaId === null ? null : profesionalDeSiempre(clientaId, citas, deCita);
  const diasDeHuecos = huecos.map((hueco) => etiquetaDeDia(hueco.inicio, ahora));
  const esElegido = (hueco: Hueco): boolean => elegido?.inicio.getTime() === hueco.inicio.getTime();
  const faltas = clientaElegida?.faltas_6m ?? 0;
  const cancelar = (): void => {
    if (onCancelar === undefined) window.history.back();
    else onCancelar();
  };

  return (
    <main className="xl:flex xl:justify-end">
      {/* Una hoja: a pantalla completa en tablet y teléfono, y en PC un panel de
          420 px que flota sobre la agenda (nivel 3) con su cuerpo desplazable. */}
      <Superficie
        como="section"
        nivel={0}
        radio="sm"
        relleno={0}
        conBorde={false}
        aria-label={`Agendar ${voc.enFraseCon('un', 'orden')}`}
        className="flex min-h-dvh w-full flex-col rounded-none xl:sticky xl:top-0 xl:h-dvh xl:w-[420px] xl:border-l xl:border-borde xl:shadow-3"
      >
        <Superficie
          como="header"
          nivel={0}
          radio="sm"
          relleno={4}
          conBorde={false}
          className="sticky top-0 z-10 flex flex-wrap items-center gap-(--espacio-2) rounded-none border-b border-borde"
        >
          <h1 className="flex-1 text-xl font-bold">Agendar</h1>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-keyshortcuts="Escape"
            onClick={cancelar}
          >
            Cancelar
          </Button>
          {/* Migas: sólo en teléfono, donde se ve un paso por pantalla. */}
          <nav
            aria-label={`Pasos de ${voc.enFrase('orden')}`}
            className="flex w-full gap-1 md:hidden"
          >
            {PASOS.map((titulo, i) => (
              <Button
                key={titulo}
                type="button"
                size="sm"
                variant={i === paso ? 'default' : 'secondary'}
                aria-current={i === paso ? 'step' : undefined}
                onClick={() => {
                  setPaso(i);
                }}
                className="flex-1 px-1 text-xs"
              >
                {i + 1} {titulo}
              </Button>
            ))}
          </nav>
        </Superficie>

        <div
          className={`flex flex-1 flex-col gap-(--espacio-8) p-(--espacio-4) md:p-(--espacio-6) xl:min-h-0 xl:overflow-y-auto xl:p-(--espacio-4) ${COLUMNA}`}
        >
          <section className={clasePaso(paso === 0)} aria-labelledby="paso-quien">
            <EncabezadoDePaso id="paso-quien" numero={1} pregunta="¿Quién?" hecho={listo.quien} />
            {/* El foco empieza aquí: el nombre es lo primero que dice el mensaje. */}
            <div className="relative">
              <Label htmlFor="buscar-clienta" className="sr-only">
                Buscar {voc.singular('cliente')} por nombre o teléfono
              </Label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-5 -translate-y-1/2 text-texto-sutil"
              />
              <Input
                id="buscar-clienta"
                autoFocus
                value={busqueda}
                placeholder="Nombre o teléfono"
                className="pl-(--espacio-10)"
                onChange={(evento) => {
                  setBusqueda(evento.target.value);
                }}
              />
            </div>
            <ul className="flex flex-col gap-(--espacio-2)">
              {coincidencias.map((fila) => (
                <li key={fila.id}>
                  <Superficie
                    como="button"
                    type="button"
                    interactiva
                    activa={fila.id === clientaId}
                    radio="md"
                    relleno={3}
                    aria-pressed={fila.id === clientaId}
                    onClick={() => {
                      setClientaId(fila.id);
                      setNombreNuevo('');
                      // F-425 se resuelve aquí, en el manejador: proponer a la
                      // de siempre ya elegida es el toque que más se repite.
                      setProfesionalId(profesionalDeSiempre(fila.id, citas, deCita));
                      setPaso(1);
                    }}
                    className={`flex w-full items-center gap-(--espacio-3) ${tinteDe(fila.id === clientaId)}`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{fila.nombre ?? 'Sin nombre'}</span>
                      <span className="font-numeros text-sm text-texto-sutil tabular-nums">
                        {fila.telefono ?? ''}
                      </span>
                    </span>
                    <Palomita elegida={fila.id === clientaId} />
                  </Superficie>
                </li>
              ))}
            </ul>
            {/* El alta en línea son DOS campos. Pedir más aquí es perder la cita. */}
            <div className="grid grid-cols-2 gap-(--espacio-2) pt-(--espacio-1)">
              <div className="flex flex-col gap-(--espacio-1)">
                <Label htmlFor="nueva-nombre" className="text-xs">
                  <UserPlus aria-hidden="true" className="size-4 text-texto-sutil" />
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
              <div className="flex flex-col gap-(--espacio-1)">
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
            <EncabezadoDePaso id="paso-que" numero={2} pregunta="¿Qué?" hecho={listo.que} />
            <ul className="grid grid-cols-2 gap-(--espacio-2) md:grid-cols-3 xl:grid-cols-2">
              {servicios.map((fila) => (
                <li key={fila.id}>
                  <Superficie
                    como="button"
                    type="button"
                    interactiva
                    activa={fila.id === servicioId}
                    radio="md"
                    relleno={3}
                    aria-pressed={fila.id === servicioId}
                    onClick={() => {
                      setServicioId(fila.id);
                      setElegido(null);
                      setPaso(2);
                    }}
                    className={`flex h-full min-h-20 w-full flex-col justify-between gap-(--espacio-2) ${tinteDe(fila.id === servicioId)}`}
                  >
                    <span className="flex items-start justify-between gap-(--espacio-2)">
                      <span className="leading-snug font-medium">{fila.nombre ?? 'Servicio'}</span>
                      <Palomita elegida={fila.id === servicioId} />
                    </span>
                    {/* La duración decide qué huecos caben: por eso va en la tesela. */}
                    <Cifra
                      valor={minutosDelServicio(fila)}
                      unidad="min"
                      tamano="sm"
                      className="text-texto-sutil"
                    />
                  </Superficie>
                </li>
              ))}
            </ul>
            {faltaEnCabina.length === 0 ? null : (
              <Aviso tono="atencion" titulo="El material de cabina no alcanza para este servicio.">
                Falta {faltaEnCabina.join(', ')}. Se puede agendar; ábrelo del anaquel antes de la
                cita.
              </Aviso>
            )}
          </section>

          <section className={clasePaso(paso === 2)} aria-labelledby="paso-con-quien">
            <EncabezadoDePaso
              id="paso-con-quien"
              numero={3}
              pregunta="¿Con quién?"
              hecho={listo.conQuien}
            />
            {quienesLoDan !== null && quienesLoDan.size === 0 ? (
              <Aviso tono="atencion" titulo="Nadie da este servicio todavía.">
                Márcalo en el catálogo de servicios, en «Quién lo da»: sin eso la agenda no lo deja
                agendar.
              </Aviso>
            ) : null}
            <ul className="grid grid-cols-2 gap-(--espacio-2) md:grid-cols-3 xl:grid-cols-2">
              {equipoDelServicio.map((fila) => (
                <li key={fila.id}>
                  <Superficie
                    como="button"
                    type="button"
                    interactiva
                    activa={fila.id === profesionalId}
                    radio="md"
                    relleno={3}
                    aria-pressed={fila.id === profesionalId}
                    onClick={() => {
                      setProfesionalId(fila.id);
                      setElegido(null);
                      setPaso(3);
                    }}
                    className={`flex h-full w-full items-center gap-(--espacio-2) ${tinteDe(fila.id === profesionalId)}`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">
                        {fila.nombre_corto ?? fila.nombre_completo ?? 'Sin nombre'}
                      </span>
                      {fila.id === deSiempre ? (
                        <span className="text-xs text-texto-sutil">de siempre</span>
                      ) : null}
                    </span>
                    <Palomita elegida={fila.id === profesionalId} />
                  </Superficie>
                </li>
              ))}
            </ul>
          </section>

          <section className={clasePaso(paso === 3)} aria-labelledby="paso-cuando">
            <EncabezadoDePaso
              id="paso-cuando"
              numero={4}
              pregunta="¿Cuándo?"
              hecho={listo.cuando}
            />
            {profesionalId === null && (
              <Vacio
                icono={<CalendarClock />}
                titulo="Elige con quién y aquí aparecen los huecos que caben."
                className="px-0 py-(--espacio-6)"
              />
            )}
            {falloDeHuecos === null ? null : (
              <Aviso tono="atencion" titulo="No se pudieron leer los huecos.">
                {falloDeHuecos} Vuelve a elegir el servicio para intentarlo otra vez.
              </Aviso>
            )}
            {/* Nunca un «sin resultados» a secas: es una venta que se está perdiendo.
                Se dice con palabras, abajo van los de la siguiente semana y la lista
                de espera queda a un toque (F-409). */}
            {sinLugarEstaSemana && (
              <Aviso
                tono="atencion"
                titulo={`No hay lugar esta semana con ${nombreDe(profesionalId)}.`}
              >
                Abajo están los de la siguiente.
                <span className="mt-(--espacio-2) block">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void apuntarEnEspera();
                    }}
                  >
                    Apuntar en lista de espera
                  </Button>
                </span>
              </Aviso>
            )}
            <ul className="flex flex-col gap-(--espacio-2)">
              {huecos.map((hueco, indice) => {
                // El día se escribe una vez por grupo; en los demás queda para el
                // lector de pantalla, que no ve la columna.
                const primeroDelDia =
                  indice === 0 || diasDeHuecos[indice - 1] !== diasDeHuecos[indice];
                return (
                  <li
                    key={`${hueco.profesionalId}-${hueco.inicio.toISOString()}`}
                    className={primeroDelDia && indice > 0 ? 'pt-(--espacio-2)' : undefined}
                  >
                    <Superficie
                      como="button"
                      type="button"
                      interactiva
                      activa={esElegido(hueco)}
                      radio="md"
                      relleno={3}
                      aria-pressed={esElegido(hueco)}
                      onClick={() => {
                        setElegido(hueco);
                      }}
                      className={`grid w-full grid-cols-[5rem_auto_minmax(0,1fr)_auto] items-center gap-x-(--espacio-3) ${tinteDe(esElegido(hueco))}`}
                    >
                      <span className="text-xs font-semibold tracking-wide text-texto-sutil">
                        <span className={primeroDelDia ? undefined : 'sr-only'}>
                          {diasDeHuecos[indice]}
                        </span>
                      </span>
                      <span className="font-numeros text-2xl font-semibold tabular-nums">
                        {laHora(hueco.inicio)}
                      </span>
                      <span className="truncate text-sm">{nombreDe(hueco.profesionalId)}</span>
                      <Palomita elegida={esElegido(hueco)} />
                    </Superficie>
                  </li>
                );
              })}
            </ul>

            <Separator className="my-(--espacio-1)" />
            <div className="flex flex-wrap items-center gap-(--espacio-2)">
              <Label htmlFor="otra-fecha" className="text-sm">
                <CalendarSearch aria-hidden="true" className="size-4 text-texto-sutil" />
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

            {/* Abajo y en secundario: recupera la cita, pero no se empuja. */}
            {conOtraPersona.length > 0 && (
              <div className="flex flex-col gap-(--espacio-2)">
                <p className="text-sm text-texto-sutil">¿Le sirve con otra persona?</p>
                <div className="flex flex-wrap gap-(--espacio-2)">
                  {conOtraPersona.map((hueco) => (
                    <Button
                      key={`${hueco.profesionalId}-${hueco.inicio.toISOString()}`}
                      type="button"
                      size="sm"
                      variant="secondary"
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
          </section>
        </div>

        {/* Fijo abajo: en tablet y teléfono es lo único que siempre se alcanza, y
            por eso aquí van también los avisos —donde está la mano—. */}
        <Superficie
          como="footer"
          nivel={0}
          radio="sm"
          relleno={4}
          conBorde={false}
          className="sticky bottom-0 z-10 rounded-none border-t border-borde"
        >
          <div className={`flex flex-col gap-(--espacio-3) ${COLUMNA}`}>
            {error !== null && <Aviso tono="peligro" titulo={error} />}
            {aviso !== null && <Aviso tono="exito" titulo={aviso} />}
            {/* Lo que aparece AL CONFIRMAR y no antes. */}
            {clientaElegida?.alergias === true && (
              <Aviso
                tono="peligro"
                titulo={`${voc.conDeterminante('este', 'cliente')} tiene alergias declaradas.`}
              >
                Revísalas antes de aplicar.
              </Aviso>
            )}
            {faltas >= 2 && (
              <Aviso tono="atencion" titulo={`Ha faltado ${faltas} veces en 6 meses.`}>
                ¿Pedir anticipo?
              </Aviso>
            )}
            {/* La hora en grande: es lo que se contesta por WhatsApp. */}
            {elegido !== null && (
              <p className="flex flex-wrap items-baseline gap-x-(--espacio-2)">
                <span className="text-xs font-semibold tracking-wide text-texto-sutil">
                  {etiquetaDeDia(elegido.inicio, ahora)}
                </span>
                <span className="font-numeros text-2xl font-bold tabular-nums">
                  {laHora(elegido.inicio)}
                </span>
                <span className="text-sm">
                  {servicioElegido?.nombre ?? 'Servicio'} con {nombreDe(elegido.profesionalId)}
                </span>
              </p>
            )}
            <Button
              type="button"
              size="lg"
              className="w-full text-base"
              cargando={enviando}
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
                variant="outline"
                className="w-full md:hidden"
                onClick={() => {
                  setPaso(paso + 1);
                }}
              >
                Siguiente · {PASOS[paso + 1] ?? ''}
              </Button>
            )}
          </div>
        </Superficie>
      </Superficie>
    </main>
  );
}
