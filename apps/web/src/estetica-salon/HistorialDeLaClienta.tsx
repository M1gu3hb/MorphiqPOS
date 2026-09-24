'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@morphiqpos/ui/primitivas/collapsible';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';
import {
  Aviso,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { BookUser, CalendarPlus, Camera, ChevronDown, NotebookPen } from 'lucide-react';
import { useEffect, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDelPuente } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · estetica-salon · historial-de-la-clienta
 *
 * F-434. 15-30 veces al día: la profesional la abre ANTES de tocarla, con la
 * clienta sentada al lado y la tablet a la vista de la sala.
 *
 * ── La alergia va arriba del todo, y no en una pestaña ────────────────────
 * Si hay que hacer scroll para verla, alguien acaba en urgencias. Va antes del
 * nombre del servicio y antes de la fórmula, que son lo que se lee despacio. Y
 * no la porta sólo el color: lleva la palabra ALERGIA, la sustancia y un
 * `role="alert"` permanente, porque media sala trabaja bajo luz cálida donde el
 * rojo se apaga.
 *
 * ── «Toca volver» trae el botón de agendar pegado ─────────────────────────
 * La fecha es CALCULADA —última visita más la frecuencia propia de esta
 * clienta, F-951— y el momento de agendar la siguiente es mientras todavía está
 * en la silla. Es el consejo comercial número uno del giro, y separarlo dos
 * clics es exactamente cómo se pierde.
 *
 * ── En PC la columna derecha son FOTOS, no más texto ──────────────────────
 * Comparar el color de hace cinco semanas con el de hoy se hace mirando. En
 * tablet y teléfono no hay ancho para dos columnas: las fotos bajan a tiras
 * horizontales dentro de su visita y las anteriores viajan colapsadas, porque
 * nueve de cada diez consultas mueren en la última fórmula.
 *
 * ── Privacidad ────────────────────────────────────────────────────────────
 * No hay lista, ni buscador, ni «vistas recientes»: recibe UNA clienta y no
 * puede enseñar otra. El teléfono se vela porque la tablet la ve la sala
 * entera. Y aquí no van comisiones ni márgenes: la clienta lee la pantalla.
 *
 * ── Fuera de alcance, y por qué ───────────────────────────────────────────
 * Las fotos no se abren aquí (`archivos` no está declarada en el puente): las
 * fichas delegan en `onVerFoto` y el visor vive fuera. Las faltas (F-412)
 * tampoco se leen: `NoShow` sólo abre a dueña y recepción, y ésta es la
 * pantalla de la profesional.
 */

export type TipoDeFoto = 'antes' | 'despues';

export interface VisitaDelHistorial {
  readonly id: string;
  readonly fecha: string | null;
  readonly servicio: string | null;
  readonly profesional: string | null;
  readonly precioCentavos: number | null;
  /** Ya compuesta: se lee en voz alta mientras se pesa, así que va en una línea. */
  readonly formula: string | null;
  readonly nota: string | null;
  /** El puente recorta el TEXTO de una nota privada; la marca sí llega. */
  readonly notaPrivada: boolean;
  readonly fotos: readonly TipoDeFoto[];
}

export interface ClientaDelHistorial {
  readonly nombre: string | null;
  readonly telefono: string | null;
  readonly primeraVisita: string | null;
  readonly profesionalHabitual: string | null;
  readonly frecuenciaDias: number | null;
  readonly alergias: string | null;
  readonly banderaAlergia: boolean;
  readonly pruebaMechaFecha: string | null;
}

export interface HistorialDeLaClientaProps {
  readonly clienteId?: string;
  readonly clientaInicial?: ClientaDelHistorial;
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly visitasIniciales?: readonly VisitaDelHistorial[];
  readonly onAgendar?: (clienteId: string) => void;
  readonly onVerFoto?: (visitaId: string, tipo: TipoDeFoto) => void;
  readonly onHistorialEmpezado?: () => void;
}

const CORTO = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const LARGO = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' });
const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Lo que un `submit` de verdad trae. React 19 marca `FormEvent` como obsoleto
 * —«no existe realmente»— y esto es lo único que este manejador usa de él.
 */
interface EnvioDeFormulario {
  readonly preventDefault: () => void;
  readonly currentTarget: HTMLFormElement;
}

/**
 * Un campo de `FormData` puede ser un archivo, no sólo texto. `String(archivo)`
 * escribiría «[object File]» en el expediente de la clienta, y ahí se quedaría.
 */
function soloTexto(valor: FormDataEntryValue | null): string {
  return typeof valor === 'string' ? valor : '';
}

/** El rótulo de cada bloque: pequeño, en versalitas, y NUNCA lo que se lee primero. */
const ROTULO = 'text-xs font-semibold uppercase tracking-wide text-texto-sutil';
/** Una columna en tablet y teléfono; en PC la derecha es la galería (§4.3.5). */
const DOS_COLUMNAS =
  'grid gap-(--espacio-4) xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start';
/** El marco de la pantalla: el mismo en los cuatro estados, para que nada salte. */
const MARCO = 'mx-auto flex w-full flex-col gap-(--espacio-4) p-(--espacio-4)';

export function enFecha(iso: string | null, largo = false): string {
  const tiempo = iso === null ? Number.NaN : Date.parse(iso);
  if (!Number.isFinite(tiempo)) return 'sin fecha';
  return (largo ? LARGO : CORTO).format(tiempo);
}

/** El día calculado, no capturado: última visita + la frecuencia de ESTA clienta. */
export function tocaVolver(ultima: string | null, frecuenciaDias: number | null): string | null {
  const tiempo = ultima === null ? Number.NaN : Date.parse(ultima);
  if (!Number.isFinite(tiempo) || frecuenciaDias === null) return null;
  return new Date(tiempo + frecuenciaDias * UN_DIA_MS).toISOString();
}

/** La tablet la ve la sala entera: el número completo no tiene por qué estar ahí. */
export function telefonoVelado(telefono: string | null): string {
  const digitos = telefono === null ? '' : telefono.replace(/\D/g, '');
  if (digitos.length < 8) return telefono ?? 'sin teléfono';
  return `${digitos.slice(0, 2)} XXXX ${digitos.slice(-4)}`;
}

type Fila = Record<string, unknown>;

/** `cantidad_milesimas` va en milésimas por lo mismo que el dinero en centavos. */
interface ComponenteCrudo {
  readonly etiqueta?: string | null;
  readonly cantidad_milesimas?: number | null;
  readonly unidad?: string | null;
}

const texto = (valor: unknown): string | null =>
  typeof valor === 'string' && valor !== '' ? valor : null;
const numero = (valor: unknown): number | null => (typeof valor === 'number' ? valor : null);

function enFormula(fila: Fila | undefined): string | null {
  if (fila === undefined || !Array.isArray(fila['componentes'])) return null;
  const partes = (fila['componentes'] as readonly ComponenteCrudo[]).map(
    (c) => `${c.etiqueta ?? 'producto'} ${(c.cantidad_milesimas ?? 0) / 1000}${c.unidad ?? 'g'}`,
  );
  const minutos = numero(fila['procesado_min']);
  if (minutos !== null) partes.push(`${minutos} min`);
  return partes.length === 0 ? null : partes.join(' · ');
}

/**
 * Cuatro lecturas del puente en paralelo, y ninguna ruta nueva: `Cliente` y
 * `ExpedienteBelleza` dicen quién es y qué no puede usar, `Cita` trae sus servicios
 * con la fecha y el precio, y `FormulaAplicada` lo que se le mezcló. El precio vive
 * en la cita y la fórmula en su tabla: ninguna de las dos basta sola.
 *
 * ── Por qué las visitas se leen por la CITA y no por su servicio ───────────
 * Porque `cita_servicios` no tiene `cliente_id` —el cliente vive en la cita, que es
 * donde corresponde— y el filtro del puente sólo sabe de COLUMNAS. Esto pedía
 * `CitaServicio` filtrado por `cliente_id` y el puente contestaba 400 «no es un
 * campo de CitaServicio»: el `.catch` lo volvía una lista vacía y el expediente
 * salía SIN NINGUNA VISITA, con todo el historial en la base. La cita sí se filtra
 * por clienta, y sus servicios vienen como hijos: una consulta, no sesenta.
 */
async function leerExpediente(
  clienteId: string,
  signal: AbortSignal,
): Promise<{ clienta: ClientaDelHistorial; visitas: readonly VisitaDelHistorial[] }> {
  const filtro = { cliente_id: clienteId };
  const [clientes, expedientes, citas, formulas] = await Promise.all([
    consultarPuente<Fila>('Cliente', { filtro: { id: clienteId }, signal }),
    // El expediente se filtra por `id`, que en esa entidad ES el de la clienta:
    // hay UN expediente por clienta y la tabla no tiene clave propia.
    consultarPuente<Fila>('ExpedienteBelleza', { filtro: { id: clienteId }, signal }),
    consultarPuente<Fila>('Cita', { filtro, orden: '-agendada_para', limite: 60, signal }),
    consultarPuente<Fila>('FormulaAplicada', { filtro, limite: 60, signal }),
  ]);

  // Los servicios de todas sus citas, en una sola lista. Cada uno trae ya su
  // fecha, su nombre y su profesional: son derivados de `CitaServicio`, y los
  // hijos pasan por la misma traducción que cualquier lectura.
  const servicios = citas.flatMap((cita) =>
    Array.isArray(cita['servicios']) ? (cita['servicios'] as readonly Fila[]) : [],
  );
  const porCita = new Map(formulas.map((f) => [String(f['cita_servicio_id']), f]));
  const cliente: Fila = clientes[0] ?? {};
  const ficha: Fila = expedientes[0] ?? {};
  const visitas = servicios
    .map((s): VisitaDelHistorial => {
      const formula = porCita.get(String(s['id']));
      return {
        id: String(s['id']),
        fecha: texto(s['fecha']),
        servicio: texto(s['servicio_nombre']),
        profesional: texto(s['profesional_nombre']),
        // El puente sirve `precio_centavos` en PESOS (`conversion: 'dinero'`): sin
        // pasarlo a centavos, un retoque de $950.00 se pintaba «$9.50».
        precioCentavos: centavosDelPuente(numero(s['precio_centavos'])),
        formula: enFormula(formula),
        nota: texto(formula?.['nota']),
        notaPrivada: formula?.['nota_privada'] === true,
        fotos: [], // `archivos` no está en el puente: hoy no hay fotos que listar.
      };
    })
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
  return {
    clienta: {
      nombre: texto(cliente['nombre']),
      telefono: texto(cliente['telefono']),
      primeraVisita: texto(cliente['primera_visita']),
      profesionalHabitual: texto(ficha['profesional_habitual_nombre']),
      frecuenciaDias: numero(ficha['frecuencia_dias']),
      alergias: texto(ficha['alergias']),
      banderaAlergia: ficha['bandera_alergia'] === true,
      pruebaMechaFecha: texto(ficha['prueba_mecha_fecha']),
    },
    visitas,
  };
}

export function HistorialDeLaClienta({
  clienteId,
  clientaInicial,
  visitasIniciales,
  onAgendar,
  onVerFoto,
  onHistorialEmpezado,
}: HistorialDeLaClientaProps) {
  const voc = useVocabulario();
  const [clienta, setClienta] = useState<ClientaDelHistorial | null>(clientaInicial ?? null);
  const [visitas, setVisitas] = useState<readonly VisitaDelHistorial[] | null>(
    visitasIniciales ?? null,
  );
  /**
   * Dos fallos distintos, y cada uno se pinta distinto: si NO SE LEYÓ el
   * expediente, la pantalla no tiene nada que enseñar (`ErrorDePantalla`); si se
   * leyó y falló después —una relectura o el comando de abrirlo—, lo que ya
   * estaba se queda y el aviso dice qué pasó y qué no.
   */
  const [falloDeLectura, setFalloDeLectura] = useState<string | null>(null);
  const [falloDeComando, setFalloDeComando] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [intento, setIntento] = useState(0);
  /**
   * El reloj NO se lee durante el render: da un valor en el servidor y otro en
   * el navegador, y de él cuelga «lo gastado en doce meses». Entra por el
   * efecto; hasta que entra, la ventana es vacía y el total sale en cero, que
   * es lo honesto mientras no se sabe qué hora es.
   */
  const [reloj, setReloj] = useState(0);
  useEffect(() => {
    const primero = setTimeout(() => {
      setReloj(Date.now());
    });
    return () => {
      clearTimeout(primero);
    };
  }, []);

  useEffect(() => {
    if (visitasIniciales !== undefined || clienteId === undefined) return;
    const control = new AbortController();
    leerExpediente(clienteId, control.signal)
      .then((leido) => {
        setClienta(leido.clienta);
        setVisitas(leido.visitas);
        setFalloDeLectura(null);
      })
      // La pantalla NUNCA se vacía por un fallo de red: lo que ya estaba se
      // queda, y el aviso dice qué pasó y ofrece volver a intentarlo.
      .catch((fallo: unknown) => {
        // Abortada es la lectura que se reemplazó o se desmontó: eso no es un
        // fallo, y pintarlo sería enseñar un error que nadie provocó.
        if (control.signal.aborted) return;
        setFalloDeLectura(
          fallo instanceof Error ? fallo.message : 'No se pudo leer el expediente.',
        );
      });
    return () => {
      control.abort();
    };
  }, [clienteId, visitasIniciales, intento]);

  // El estado se limpia EN EL CLIC, no en el efecto: lo que ya se leyó se queda.
  function reintentar(): void {
    setFalloDeLectura(null);
    setIntento((n) => n + 1);
  }

  // El VACÍO QUE ENSEÑA: el historial es de UNA clienta.
  //
  // `page.tsx` lo monta sin ninguna —se llega desde la lista de clientas o desde la
  // cita— y sin esto la pantalla se quedaba en su esqueleto para siempre.
  if ((clienteId === undefined || clienteId === '') && clientaInicial === undefined) {
    return (
      <main className="mx-auto w-full max-w-2xl p-(--espacio-4)">
        <h1 className="sr-only">Historial de {voc.enFrase('cliente')}</h1>
        <Vacio
          icono={<BookUser />}
          titulo={`Aquí se abre el expediente de ${voc.enFraseCon('un', 'cliente')}`}
          explicacion="Sus visitas, sus fórmulas, sus fotos y cuándo le toca volver. Se abre desde la lista: toca su nombre y su historia aparece aquí."
          accion={
            <Button asChild size="lg">
              <a href="/estetica-salon/clientas">Ver {voc.plural('cliente')}</a>
            </Button>
          }
        />
      </main>
    );
  }

  if (visitas === null) {
    // No se leyó nada: no hay última fórmula ni alergias que enseñar, y eso se
    // dice con todas sus letras en vez de dejar un esqueleto que nunca termina.
    if (falloDeLectura !== null) {
      return (
        <div className="mx-auto w-full max-w-lg p-(--espacio-6)">
          <ErrorDePantalla
            titulo={`No se pudo leer el historial de ${voc.enFrase('cliente')}`}
            queHacer="Sin él no se ven sus alergias ni su última fórmula. Revisa la conexión y vuelve a intentarlo."
            detalle={falloDeLectura}
            reintentar={
              <Button type="button" onClick={reintentar}>
                Reintentar
              </Button>
            }
          />
        </div>
      );
    }
    // La FORMA del expediente, no una rueda: nombre, la franja de «toca volver»,
    // la última visita y, en PC, la galería. Al llegar los datos nada salta.
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando el historial"
        className={`${MARCO} max-w-6xl`}
      >
        <div className="flex flex-col gap-(--espacio-2)">
          <Esqueleto className="h-(--altura-control) w-2/3 max-w-sm" />
          <Esqueleto className="h-4 w-1/2 max-w-xs" />
        </div>
        <Esqueleto className="h-[calc(var(--altura-control)*1.6)] w-full rounded-lg" />
        <div className={DOS_COLUMNAS}>
          <div className="flex flex-col gap-(--espacio-4)">
            <Esqueleto className="h-56 w-full rounded-lg" />
            <Esqueleto className="h-(--altura-control) w-full rounded-lg" />
          </div>
          <Esqueleto className="hidden h-72 w-full rounded-lg xl:block" />
        </div>
      </div>
    );
  }

  const nombre = clienta?.nombre ?? voc.conDeterminante('este', 'cliente');
  const habitual = clienta?.profesionalHabitual ?? null;
  const ultima = visitas[0] ?? null;
  const anteriores = visitas.slice(1);
  const vuelta = tocaVolver(ultima?.fecha ?? null, clienta?.frecuenciaDias ?? null);
  const hace12Meses = reloj - 365 * UN_DIA_MS;
  const gastado = visitas
    .filter((v) => (v.fecha === null ? false : Date.parse(v.fecha) >= hace12Meses))
    .reduce((suma, v) => suma + (v.precioCentavos ?? 0), 0);
  const galeria = visitas.flatMap((v) => v.fotos.map((tipo) => ({ visita: v, tipo })));

  const alEmpezar = (evento: EnvioDeFormulario) => {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    /**
     * EL EXPEDIENTE SE ABRE CON `expediente.abrir`, que existe desde la 132.
     *
     * Esto publicaba en `/api/clientes/empezar-historial` «por convención», y esa
     * ruta no existe: Next la resolvía a `clientes/[id]` con
     * `clienteId = "empezar-historial"`, la respuesta no era `{ok, datos}` y la
     * pantalla enseñaba «El servidor respondió algo inesperado». Era el ÚNICO botón
     * del estado vacío, así que ninguna clienta nueva podía empezar su historia.
     */
    if (clienteId === undefined || clienteId === '') {
      setFalloDeComando(
        `Este historial no sabe de quién es: ábrelo desde la lista de ${voc.plural('cliente')}.`,
      );
      return;
    }
    setFalloDeComando(null);
    setEnviando(true);
    invocarComando('/api/expediente/abrir', {
      clienteId,
      comoLlego: soloTexto(datos.get('comoLlego')),
      queBusca: soloTexto(datos.get('queBusca')),
      alergias: soloTexto(datos.get('alergias')),
    })
      .then(() => {
        onHistorialEmpezado?.();
        setIntento((n) => n + 1);
      })
      .catch((fallo: unknown) => {
        setFalloDeComando(
          fallo instanceof Error ? fallo.message : 'No se pudo guardar el expediente.',
        );
      })
      .finally(() => {
        setEnviando(false);
      });
  };

  const cabecera = (
    <header className="flex flex-col gap-(--espacio-1)">
      <div className="flex flex-wrap items-baseline justify-between gap-x-(--espacio-4) gap-y-(--espacio-1)">
        {/* Identifica, no manda: en la jerarquía del expediente los datos van al
            final (§4.3.5), así que el nombre no le gana en tamaño ni a la alergia
            ni a la fórmula. */}
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{nombre}</h1>
        {/* Velado: la tablet la ve la sala entera. */}
        <p className="text-sm tabular-nums text-texto-sutil">
          {telefonoVelado(clienta?.telefono ?? null)}
        </p>
      </div>
      <p className="text-sm text-texto-sutil">
        {habitual === null ? 'Sin profesional habitual' : `Viene con ${habitual}`}
        {clienta?.frecuenciaDias == null
          ? ''
          : ` · cada ${Math.round(clienta.frecuenciaDias / 7)} semanas`}
        {clienta?.primeraVisita == null ? '' : ` · desde ${enFecha(clienta.primeraVisita, true)}`}
      </p>
    </header>
  );

  // Arriba de todo y con palabra propia: el color nunca la porta solo. Es el
  // `Aviso` de peligro —`role="alert"` permanente— con la sustancia en grande,
  // porque es lo que se busca con la clienta ya sentada.
  const alergia =
    clienta !== null && (clienta.banderaAlergia || clienta.alergias !== null) ? (
      <Aviso tono="peligro" titulo="Alergia" className="border-2 border-peligro bg-peligro/10">
        <p className="text-xl font-bold text-texto md:text-2xl">
          {clienta.alergias ?? 'Sin detallar'}
        </p>
        {clienta.pruebaMechaFecha !== null && (
          <p className="mt-(--espacio-1) text-sm text-texto">
            Prueba de mecha:{' '}
            <span className="tabular-nums">{enFecha(clienta.pruebaMechaFecha, true)}</span>
          </p>
        )}
      </Aviso>
    ) : null;

  const avisoDeLectura =
    falloDeLectura === null ? null : (
      <Aviso
        tono="peligro"
        titulo="No se pudo volver a leer el historial."
        accion={
          <Button type="button" size="sm" variant="outline" onClick={reintentar}>
            Reintentar
          </Button>
        }
      >
        Lo que ves es lo último que se leyó. {falloDeLectura}
      </Aviso>
    );

  if (visitas.length === 0) {
    return (
      <div className={`${MARCO} max-w-2xl`}>
        {cabecera}
        {alergia}
        {avisoDeLectura}
        {/* El vacío ENSEÑA: los tres datos que sí sirven dentro de cinco semanas. */}
        <Superficie relleno={0}>
          {/* El título del vacío es un ENCABEZADO y da nombre al formulario: quien
              navega por encabezados encuentra la única acción de esta pantalla. */}
          <form onSubmit={alEmpezar} aria-labelledby="historial-primera-vez">
            <Vacio
              icono={<NotebookPen />}
              nivelDeTitulo={2}
              idDelTitulo="historial-primera-vez"
              titulo={`${nombre} viene por primera vez.`}
              explicacion={`Tres respuestas ahora valen más que media hora de memoria en la próxima ${voc.singular('orden')}.`}
              className="px-(--espacio-4) py-(--espacio-8) sm:px-(--espacio-8)"
            >
              <div className="grid w-full max-w-md gap-(--espacio-3) text-left">
                <Campo id="comoLlego" etiqueta="Cómo llegó" pista="Recomendación, Instagram…" />
                <Campo
                  id="queBusca"
                  etiqueta="Qué busca"
                  pista="Cubrir canas, aclarar medio tono…"
                />
                <div className="grid gap-(--espacio-2)">
                  <Label htmlFor="alergias">Alergias conocidas</Label>
                  <Textarea id="alergias" name="alergias" rows={2} placeholder="PPD, amoniaco…" />
                </div>
                {falloDeComando !== null && (
                  <Aviso tono="peligro" titulo={falloDeComando}>
                    Su historial no se empezó: lo que escribiste sigue aquí.
                  </Aviso>
                )}
                {/* Al pie de la columna y a lo ancho: es el tercio de abajo, donde llega el
                    pulgar con la tablet en la mano. */}
                <Button type="submit" size="lg" cargando={enviando} className="mt-(--espacio-2)">
                  Empezar su historial
                </Button>
              </div>
            </Vacio>
          </form>
        </Superficie>
      </div>
    );
  }

  const columnasAnteriores: readonly ColumnaDeTabla<VisitaDelHistorial>[] = [
    {
      clave: 'fecha',
      titulo: 'Fecha',
      orden: (v) => v.fecha ?? '',
      celda: (v) => <span className="font-medium tabular-nums">{enFecha(v.fecha)}</span>,
    },
    {
      clave: 'servicio',
      titulo: voc.titulo('linea_orden'),
      celda: (v) => (
        <span className="flex flex-col">
          <span>{v.servicio ?? 'Servicio sin nombre'}</span>
          {/* En el teléfono —el más usado— la columna de quién atendió no cabe, y el
              dato no se pierde: baja debajo del servicio. Desde `sm` va en su columna. */}
          <span className="text-xs text-texto-sutil sm:hidden">{v.profesional ?? 'sin dato'}</span>
        </span>
      ),
    },
    {
      clave: 'profesional',
      titulo: voc.titulo('responsable'),
      desde: 'sm',
      celda: (v) => <span className="text-texto-sutil">{v.profesional ?? 'sin dato'}</span>,
    },
    {
      // «Misma fórmula» se ve comparando renglones: por eso va en columna, y sólo
      // donde hay ancho para leerla entera.
      clave: 'formula',
      titulo: 'Fórmula',
      desde: 'lg',
      celda: (v) => (
        <span className="font-mono text-xs tabular-nums text-texto-sutil">
          {v.formula ?? 'Sin fórmula'}
        </span>
      ),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (v) => <Dinero centavos={v.precioCentavos ?? 0} tamano="sm" />,
    },
  ];

  return (
    <div className={`${MARCO} max-w-6xl`}>
      {cabecera}
      {alergia}
      {avisoDeLectura}

      {vuelta !== null && (
        <Superficie
          como="section"
          nivel={0}
          relleno={3}
          aria-label="Toca volver"
          className="flex flex-wrap items-center gap-(--espacio-3) border-primario/40 bg-primario/10"
        >
          <p className="text-lg font-semibold">
            Toca volver: <span className="tabular-nums">{enFecha(vuelta, true)}</span>
          </p>
          {/* Pegado a la fecha: se agenda mientras todavía está en la silla. */}
          <Button
            type="button"
            size="lg"
            className="ml-auto"
            onClick={() => {
              onAgendar?.(clienteId ?? '');
            }}
          >
            <CalendarPlus aria-hidden="true" />
            Agendar
          </Button>
        </Superficie>
      )}

      <div className={DOS_COLUMNAS}>
        <div className="flex flex-col gap-(--espacio-4)">
          {ultima !== null && (
            <Superficie
              como="section"
              nivel={2}
              aria-labelledby="historial-ultima-visita"
              className="flex flex-col gap-(--espacio-3) border-primario/50"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-(--espacio-4) gap-y-(--espacio-1)">
                <div className="flex flex-col gap-(--espacio-1)">
                  <h2 id="historial-ultima-visita" className={ROTULO}>
                    Última visita
                  </h2>
                  <p className="text-lg font-semibold">
                    <span className="tabular-nums">{enFecha(ultima.fecha, true)}</span>
                    {' · '}
                    {ultima.profesional ?? 'sin profesional'}
                  </p>
                  <p className="text-base text-texto-sutil">
                    {ultima.servicio ?? 'Servicio sin nombre'}
                  </p>
                </div>
                <Dinero centavos={ultima.precioCentavos ?? 0} tamano="base" />
              </div>

              {/* La acción principal de la pantalla: VER LA ÚLTIMA FÓRMULA. Se lee en
                  voz alta mientras se pesa, así que es lo más grande después de la
                  alergia, en una línea y con cifras que no bailan. */}
              <div className="flex flex-col gap-(--espacio-1)">
                <p className={ROTULO}>Fórmula</p>
                {ultima.formula === null ? (
                  <p className="text-base text-texto-sutil">
                    Sin fórmula capturada en esta visita.
                  </p>
                ) : (
                  <Superficie
                    como="p"
                    nivel={0}
                    radio="md"
                    relleno={3}
                    conBorde={false}
                    className="bg-fondo-sutil font-mono text-lg font-semibold tabular-nums md:text-xl xl:text-2xl"
                  >
                    {ultima.formula}
                  </Superficie>
                )}
              </div>

              {/* En tablet y teléfono las fotos van en tira, dentro de su visita. */}
              {ultima.fotos.length > 0 && (
                <ul
                  aria-label="Fotos de la última visita"
                  className="flex gap-(--espacio-2) overflow-x-auto pb-(--espacio-1)"
                >
                  {ultima.fotos.map((tipo) => (
                    <li key={tipo}>
                      <Foto visita={ultima} tipo={tipo} onVerFoto={onVerFoto} />
                    </li>
                  ))}
                </ul>
              )}

              {ultima.nota !== null && (
                <blockquote className="flex flex-wrap items-baseline gap-(--espacio-2) text-sm italic text-texto-sutil">
                  «{ultima.nota}»
                  {ultima.notaPrivada && (
                    <Badge variant="outline" className="not-italic">
                      Privada
                    </Badge>
                  )}
                </blockquote>
              )}
            </Superficie>
          )}

          {/* Colapsadas: nueve de cada diez consultas mueren en la última fórmula. */}
          <Superficie como="section" relleno={0} aria-label="Visitas anteriores">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="group min-h-(--area-tactil-minima) w-full justify-between px-(--espacio-4)"
                >
                  <span>
                    Antes · {anteriores.length} {anteriores.length === 1 ? 'visita' : 'visitas'}
                  </span>
                  <ChevronDown aria-hidden="true" className="group-data-[state=open]:rotate-180" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-(--espacio-3) pb-(--espacio-3)">
                <Tabla
                  etiqueta="Visitas anteriores"
                  columnas={columnasAnteriores}
                  filas={anteriores}
                  claveDe={(v) => v.id}
                  alto="max-h-[50vh]"
                  vacio={
                    <Vacio
                      titulo="No hay visitas antes de la última."
                      className="py-(--espacio-4)"
                    />
                  }
                />
              </CollapsibleContent>
            </Collapsible>
          </Superficie>

          <p className="flex items-baseline gap-(--espacio-2) text-sm text-texto-sutil">
            Gastado en 12 meses: <Dinero centavos={gastado} tamano="sm" />
          </p>
        </div>

        {/* En PC la derecha son fotos: comparar color se hace mirando. Se queda
            pegada mientras la izquierda corre, para comparar sin perderla. */}
        <Superficie
          como="aside"
          nivel={0}
          aria-label="Galería de fotos"
          className="hidden xl:sticky xl:top-(--espacio-4) xl:flex xl:flex-col xl:gap-(--espacio-3)"
        >
          <h2 className={ROTULO}>Fotos</h2>
          {galeria.length === 0 ? (
            <Vacio
              icono={<Camera />}
              titulo="Todavía no hay fotos."
              explicacion="Se suben al cerrar el servicio, y sólo si ella lo autorizó."
              className="px-(--espacio-2) py-(--espacio-6)"
            />
          ) : (
            <ul className="flex flex-wrap gap-(--espacio-2)">
              {galeria.map(({ visita, tipo }) => (
                <li key={`${visita.id}-${tipo}`}>
                  <Foto visita={visita} tipo={tipo} onVerFoto={onVerFoto} />
                </li>
              ))}
            </ul>
          )}
        </Superficie>
      </div>
    </div>
  );
}

interface CampoProps {
  readonly id?: string;
  readonly etiqueta?: string;
  readonly pista?: string;
}

function Campo({ id = 'campo', etiqueta = '', pista = '' }: CampoProps) {
  return (
    <div className="grid gap-(--espacio-2)">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input id={id} name={id} placeholder={pista} />
    </div>
  );
}

export interface FotoProps {
  readonly visita?: VisitaDelHistorial;
  readonly tipo?: TipoDeFoto;
  readonly onVerFoto?: ((visitaId: string, tipo: TipoDeFoto) => void) | undefined;
}

/** Ficha, no miniatura: el visor vive fuera y ésta sólo dice cuál pedirle. */
function Foto({ visita, tipo = 'antes', onVerFoto }: FotoProps) {
  return (
    <Superficie
      como="button"
      type="button"
      interactiva
      nivel={0}
      radio="md"
      relleno={0}
      className="flex aspect-square w-24 shrink-0 flex-col items-center justify-center gap-(--espacio-1) bg-fondo-sutil text-xs text-texto-sutil"
      onClick={() => {
        onVerFoto?.(visita?.id ?? '', tipo);
      }}
    >
      <Camera aria-hidden="true" className="size-5 shrink-0" />
      <span>{tipo === 'antes' ? 'Antes' : 'Después'}</span>
      <span className="tabular-nums">{enFecha(visita?.fecha ?? null)}</span>
    </Superficie>
  );
}
