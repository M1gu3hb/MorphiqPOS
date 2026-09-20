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
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';
import { useEffect, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
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

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
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

const ALERGIA = 'mb-4 rounded-lg border-2 border-destructive bg-destructive/15 p-3 shadow-2';
const BANDA = 'mb-3 rounded-md border border-destructive bg-destructive/10 p-2 text-sm';
const TARJETA = 'rounded-lg border border-border bg-card p-4 text-card-foreground';
const ROTULO = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const DOS_COLUMNAS = 'grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start';
const FOTO =
  'flex aspect-square w-24 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md ' +
  'border border-border bg-muted text-xs text-muted-foreground transition-colors ' +
  'hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring';

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
        precioCentavos: numero(s['precio_centavos']),
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
  const [error, setError] = useState<string | null>(null);
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
        setError(null);
      })
      // La pantalla NUNCA se vacía por un fallo de red: lo que ya estaba se
      // queda, y la banda dice qué pasó y ofrece volver a intentarlo.
      .catch((fallo: unknown) => {
        setError(fallo instanceof Error ? fallo.message : 'No se pudo leer el expediente.');
      });
    return () => {
      control.abort();
    };
  }, [clienteId, visitasIniciales, intento]);

  const banda =
    error === null ? null : (
      <p role="alert" className={BANDA}>
        {error}{' '}
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => {
            setError(null);
            setIntento((n) => n + 1);
          }}
        >
          Reintentar
        </Button>
      </p>
    );

  // Cargando y fallo-sin-datos comparten marco: el esqueleto tiene la forma del
  // expediente, así que nada salta cuando llega, y la banda cabe encima.
  // El VACÍO QUE ENSEÑA: el historial es de UNA clienta.
  //
  // `page.tsx` lo monta sin ninguna —se llega desde la lista de clientas o desde la
  // cita— y sin esto la pantalla se quedaba en su esqueleto para siempre.
  if ((clienteId === undefined || clienteId === '') && clientaInicial === undefined) {
    return (
      <main className="mx-auto max-w-prose space-y-3 p-8 text-center">
        <h1 className="text-xl font-semibold">
          Aquí se abre el expediente de {voc.enFraseCon('un', 'cliente')}
        </h1>
        <p className="text-sm text-muted-foreground">
          Sus visitas, sus fórmulas, sus fotos y cuándo le toca volver. Se abre desde la lista: toca
          su nombre y su historia aparece aquí.
        </p>
        <Button asChild>
          <a href="/estetica-salon/clientas">Ver {voc.plural('cliente')}</a>
        </Button>
      </main>
    );
  }

  if (visitas === null) {
    return (
      <div className="mx-auto w-full max-w-6xl p-4">
        {banda}
        <Skeleton className="mb-4 h-20 w-full rounded-lg" />
        <Skeleton className="mb-4 h-24 w-full rounded-lg" />
        <div className={DOS_COLUMNAS}>
          <Skeleton className="h-52 w-full rounded-lg" />
          <Skeleton className="hidden h-52 w-full rounded-lg xl:block" />
        </div>
      </div>
    );
  }

  const nombre = clienta?.nombre ?? voc.conDeterminante('este', 'cliente');
  const habitual = clienta?.profesionalHabitual ?? null;
  const ultima = visitas[0] ?? null;
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
      setError('Este historial no sabe de quién es: ábrelo desde la lista de clientas.');
      return;
    }
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
        setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar el expediente.');
      });
  };

  const cabecera = (
    <header className="mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{nombre}</h1>
        <p className="text-sm tabular-nums text-muted-foreground">
          {telefonoVelado(clienta?.telefono ?? null)}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {habitual === null ? 'Sin profesional habitual' : `Viene con ${habitual}`}
        {clienta?.frecuenciaDias == null
          ? ''
          : ` · cada ${Math.round(clienta.frecuenciaDias / 7)} semanas`}
        {clienta?.primeraVisita == null ? '' : ` · desde ${enFecha(clienta.primeraVisita, true)}`}
      </p>
    </header>
  );

  // Arriba de todo y con palabra propia: el color nunca la porta solo.
  const alergia =
    clienta !== null && (clienta.banderaAlergia || clienta.alergias !== null) ? (
      <section role="alert" className={ALERGIA}>
        <p className="font-bold uppercase tracking-wide">
          <span aria-hidden>⚠ </span>Alergia · {clienta.alergias ?? 'sin detallar'}
        </p>
        {clienta.pruebaMechaFecha !== null && (
          <p className="mt-1 text-sm">Prueba de mecha: {enFecha(clienta.pruebaMechaFecha, true)}</p>
        )}
      </section>
    ) : null;

  if (visitas.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4">
        {banda}
        {cabecera}
        {alergia}
        {/* El vacío ENSEÑA: los tres datos que sí sirven dentro de cinco semanas. */}
        <form onSubmit={alEmpezar} className={TARJETA}>
          <h2 className="text-lg font-semibold">{nombre} viene por primera vez.</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Tres respuestas ahora valen más que media hora de memoria en la próxima{' '}
            {voc.singular('orden')}.
          </p>
          <div className="grid gap-3">
            <Campo id="comoLlego" etiqueta="Cómo llegó" pista="Recomendación, Instagram…" />
            <Campo id="queBusca" etiqueta="Qué busca" pista="Cubrir canas, aclarar medio tono…" />
            <div className="grid gap-1.5">
              <Label htmlFor="alergias">Alergias conocidas</Label>
              <Textarea id="alergias" name="alergias" rows={2} placeholder="PPD, amoniaco…" />
            </div>
          </div>
          <Button type="submit" className="mt-4 w-full sm:w-auto">
            Empezar su historial
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      {banda}
      {cabecera}
      {alergia}

      {vuelta !== null && (
        <section className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 p-3">
          <p className="text-base font-semibold">
            Toca volver: <span className="tabular-nums">{enFecha(vuelta, true)}</span>
          </p>
          {/* Pegado a la fecha: se agenda mientras todavía está en la silla. */}
          <Button
            type="button"
            className="ml-auto"
            onClick={() => {
              onAgendar?.(clienteId ?? '');
            }}
          >
            Agendar
          </Button>
        </section>
      )}

      <div className={DOS_COLUMNAS}>
        <div>
          {ultima !== null && (
            <section className={`${TARJETA} mb-4 border-primary/50 shadow-2`}>
              <h2 className={ROTULO}>Última visita</h2>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
                <span className="tabular-nums">{enFecha(ultima.fecha, true)}</span>
                <span>· {ultima.profesional ?? 'sin profesional'}</span>
                <span className="ml-auto tabular-nums">
                  {PESOS.format((ultima.precioCentavos ?? 0) / 100)}
                </span>
              </p>
              <p className="mt-1 text-base">{ultima.servicio ?? 'Servicio sin nombre'}</p>
              {/* La acción principal de la pantalla: VER LA ÚLTIMA FÓRMULA. */}
              <p className="mt-2 rounded-md bg-muted p-2 font-mono text-sm tabular-nums">
                {ultima.formula ?? 'Sin fórmula capturada en esta visita.'}
              </p>
              {ultima.fotos.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {ultima.fotos.map((tipo) => (
                    <Foto key={tipo} visita={ultima} tipo={tipo} onVerFoto={onVerFoto} />
                  ))}
                </div>
              )}
              {ultima.nota !== null && (
                <p className="mt-3 border-l-2 border-border pl-3 text-sm italic text-muted-foreground">
                  «{ultima.nota}»
                  {ultima.notaPrivada && (
                    <Badge variant="outline" className="ml-2 not-italic">
                      Privada
                    </Badge>
                  )}
                </p>
              )}
            </section>
          )}

          {/* Colapsadas: nueve de cada diez consultas mueren en la última fórmula. */}
          <Collapsible className={TARJETA}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" className="w-full justify-between">
                <span>Antes · {visitas.length - 1} visitas</span>
                <span aria-hidden>▾</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 divide-y divide-border">
                {visitas.slice(1).map((v) => (
                  <li key={v.id} className="flex flex-wrap items-baseline gap-x-2 py-2 text-sm">
                    <span className="w-20 shrink-0 font-medium tabular-nums">
                      {enFecha(v.fecha)}
                    </span>
                    <span className="text-muted-foreground">{v.profesional ?? 'sin dato'}</span>
                    <span className="basis-full text-muted-foreground sm:basis-auto">
                      {v.servicio ?? 'Servicio sin nombre'}
                    </span>
                    <span className="ml-auto tabular-nums">
                      {PESOS.format((v.precioCentavos ?? 0) / 100)}
                    </span>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>

          <p className="mt-4 text-sm text-muted-foreground">
            Gastado en 12 meses: <span className="tabular-nums">{PESOS.format(gastado / 100)}</span>
          </p>
        </div>

        {/* En PC la derecha son fotos: comparar color se hace mirando. */}
        <aside aria-label="Galería de fotos" className="hidden xl:block">
          <h2 className={`mb-2 ${ROTULO}`}>Fotos</h2>
          {galeria.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay fotos. Se suben al cerrar el servicio, y sólo si ella lo autorizó.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {galeria.map(({ visita, tipo }) => (
                <Foto
                  key={`${visita.id}-${tipo}`}
                  visita={visita}
                  tipo={tipo}
                  onVerFoto={onVerFoto}
                />
              ))}
            </div>
          )}
        </aside>
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
    <div className="grid gap-1.5">
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
    <button
      type="button"
      className={FOTO}
      onClick={() => {
        onVerFoto?.(visita?.id ?? '', tipo);
      }}
    >
      <span aria-hidden className="text-xl">
        📷
      </span>
      <span>{tipo === 'antes' ? 'Antes' : 'Después'}</span>
      <span className="tabular-nums">{enFecha(visita?.fecha ?? null)}</span>
    </button>
  );
}
