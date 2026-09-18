'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { RadioGroup, RadioGroupItem } from '@morphiqpos/ui/primitivas/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';
import type { Vocabulario } from '@morphiqpos/domain/vocabulario';

/**
 * PANTALLA · estetica-salon · cobrar
 *
 * Convertir una cita terminada en dinero, con su comisión y su propina bien
 * puestas. 15–30 veces al día, desde recepción o desde la propia profesional.
 *
 * ── Por qué el TOTAL es lo más grande de la aplicación ───────────────────
 * Porque es el único número que se dice EN VOZ ALTA con la clienta enfrente, y
 * decir uno distinto del que se cobra es la forma más cara de equivocarse aquí.
 * Todo lo demás —subtotal, IVA, conceptos— existe para explicarlo, no para
 * competir con él.
 *
 * ── Lo que este cobro tiene y ningún otro del proyecto ───────────────────
 * Cada línea trae SU profesional y la propina trae DESTINATARIO. Sin el
 * profesional en la línea, una cita con dos personas le paga la comisión entera
 * a una (F-443); sin destinatario, la propina acaba en un bote que nadie sabe
 * repartir. Por eso los dos viajan en la pantalla principal y no en un paso
 * posterior: en `restaurante` la propina se pregunta y se desglosa, aquí es un
 * toque.
 *
 * ── Por qué el anticipo aparece RESTADO y no como opción ─────────────────
 * Es el descuadre 4 de `02-DINERO-Y-CAJA §10`: un anticipo que hay que ir a
 * buscar se cobra dos veces. Aparece en su renglón, ya aplicado.
 *
 * ── Por qué TRANSFERENCIA pregunta a qué cuenta ──────────────────────────
 * Porque el dinero que cae en la cuenta personal de la profesional pasa igual:
 * la única diferencia es si el negocio lo sabe. Preguntarlo sin juicio convierte
 * una fuga en un flujo declarado, y se descuenta de su liquidación.
 *
 * ── Por qué un fallo NO vacía la pantalla ────────────────────────────────
 * Perder un cobro de $1,130 con la clienta enfrente es inaceptable. El error es
 * una banda con `role="alert"`; la cita, el método y la propina siguen donde
 * estaban y COBRAR se puede volver a tocar. La clave de idempotencia la pone
 * `invocarComando`, así que reintentar no cobra dos veces.
 *
 * ── Lo que NO va aquí ────────────────────────────────────────────────────
 * La fórmula, las fotos, el historial clínico y la agenda. Aquí se cobra.
 *
 * ── Alcance recortado para caber en un archivo, dicho y no escondido ─────
 * 1. La PROPINA se captura, se muestra y se dice en el botón, pero no se
 *    persiste: `propinas/pasivo` pide un `empleoBeneficiarioId` y el puente no
 *    expone el empleo de `Profesional`. Al cobrar se avisa de que se entrega en
 *    mano. El día que el puente lo exponga, sale de aquí una segunda escritura.
 * 2. El ANTICIPO se pinta cuando el dato llega, pero bloquea el cobro: el
 *    comando exige que los pagos sumen el total congelado y todavía no sabe
 *    descontarlo (`anticipos_cita`, migración 138, no está en el puente).
 *    Cobrar de más callando es peor que no cobrar.
 * 3. El DESCUENTO con su aviso de comisión, el historial de pagos de la clienta
 *    (columna derecha de PC) y los atajos F2…F12 quedan fuera de este archivo.
 * 4. El IVA se muestra con la tasa general: la configuración por producto aún no
 *    viaja por el puente y se prefiere el renglón a la cifra inventada.
 */

/** Los tres métodos que acepta `venta.cobrar_cita`. Ni uno más. */
const METODOS = [
  { clave: 'efectivo', etiqueta: 'Efectivo' },
  { clave: 'tarjeta', etiqueta: 'Tarjeta' },
  { clave: 'transferencia', etiqueta: 'Transferencia' },
] as const;

type Metodo = (typeof METODOS)[number]['clave'];

/** Los tres toques de propina del documento, en puntos porcentuales. */
const PROPINAS = [12, 15, 18];

/** Tasa general en puntos base. Ver el punto 4 del alcance. */
const IVA_BP = 1600;

export interface CitaPorCobrar {
  readonly id: string;
  readonly folio: string | null;
  readonly cliente_id: string | null;
  readonly estado: string | null;
  readonly agendada_para: string | null;
  /** Pesos ya recibidos. Hoy nunca llega: ver el punto 2 del alcance. */
  readonly anticipo?: number | null;
}

export interface ServicioDeCita {
  readonly id: string;
  readonly cita_id: string | null;
  readonly servicio_id: string | null;
  readonly profesional_id: string | null;
  /** El puente convierte `dinero` a PESOS, aunque la columna se llame centavos. */
  readonly precio_centavos: number | null;
  readonly estado: string | null;
}

export interface PersonaDelSalon {
  readonly id: string;
  readonly nombre: string | null;
}

export interface CobrarProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly citasIniciales?: readonly CitaPorCobrar[];
  readonly serviciosIniciales?: readonly ServicioDeCita[];
  readonly profesionalesIniciales?: readonly PersonaDelSalon[];
  readonly clientesIniciales?: readonly PersonaDelSalon[];
  readonly catalogoInicial?: readonly PersonaDelSalon[];
  readonly onCobrado?: (citaId: string) => void;
}

/** Pesos a centavos contando dígitos: `58.995 * 100` pierde medio centavo. */
export function aCentavos(pesos: number | null | undefined): number {
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

/** Las líneas vivas de una cita. Lo cancelado no se cobra ni se enseña. */
export function lineasDe(
  servicios: readonly ServicioDeCita[],
  citaId: string | null,
): readonly ServicioDeCita[] {
  if (citaId === null) return [];
  return servicios.filter((fila) => fila.cita_id === citaId && fila.estado !== 'cancelado');
}

export function totalDe(lineas: readonly ServicioDeCita[]): number {
  return lineas.reduce((suma, linea) => suma + aCentavos(linea.precio_centavos), 0);
}

/** El IVA que ya viene DENTRO del precio: se explica, no se suma. */
export function ivaIncluidoDe(total: number): number {
  return total - Math.round((total * 10_000) / (10_000 + IVA_BP));
}

/**
 * Qué pasó, en palabras de mostrador.
 *
 * El límite de intentos NO es un código de la API: es el 429, y por eso se lee
 * de `estado` y no de `codigo`. Confundirlos deja al mostrador reintentando
 * contra una puerta que sólo pide esperar.
 */
export function mensajeDeFallo(fallo: unknown, voc: Vocabulario): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === 429)
      return 'Demasiados intentos seguidos. Espera y vuelve a tocar COBRAR.';
    if (fallo.error.codigo === 'SIN_PERMISO') {
      return 'Tu usuario no puede cobrar. Que lo haga quien tenga la caja, desde aquí mismo.';
    }
    return fallo.error.mensaje;
  }
  return (
    `No se pudo cobrar y no se cobró nada. ${voc.conArticulo('orden')} sigue ` +
    `abiert${voc.terminacion('orden')}: vuelve a tocar COBRAR.`
  );
}

export function Cobrar({
  citasIniciales,
  serviciosIniciales,
  profesionalesIniciales,
  clientesIniciales,
  catalogoInicial,
  onCobrado,
}: CobrarProps) {
  const voc = useVocabulario();
  const [citas, setCitas] = useState<readonly CitaPorCobrar[] | null>(citasIniciales ?? null);
  const [servicios, setServicios] = useState<readonly ServicioDeCita[]>(serviciosIniciales ?? []);
  const [personas, setPersonas] = useState<readonly PersonaDelSalon[]>([
    ...(profesionalesIniciales ?? []),
    ...(clientesIniciales ?? []),
    ...(catalogoInicial ?? []),
  ]);
  const [citaId, setCitaId] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [cuenta, setCuenta] = useState('salon');
  const [puntos, setPuntos] = useState<number | null>(null);
  const [otraPropina, setOtraPropina] = useState('');
  const [destinatario, setDestinatario] = useState('repartir');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (citasIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    const señal = { signal: control.signal };
    Promise.all([
      consultarPuente<CitaPorCobrar>('Cita', { filtro: { estado: 'terminada' }, limite: 40 }),
      // Todas las líneas de una vez: elegir cita con la clienta enfrente no
      // puede costar otro viaje al servidor.
      consultarPuente<ServicioDeCita>('CitaServicio', { limite: 300, ...señal }),
      consultarPuente<PersonaDelSalon>('Profesional', { limite: 60, ...señal }),
      consultarPuente<PersonaDelSalon>('ProductoTerminado', { limite: 400, ...señal }),
      // El nombre de la clienta es adorno comparado con el cobro, y su lectura
      // pide un rol más estrecho: si falta, se cobra igual.
      consultarPuente<PersonaDelSalon>('Cliente', { limite: 400, ...señal }).catch(
        (): readonly PersonaDelSalon[] => [],
      ),
    ])
      .then(([filas, lineas, profesionales, catalogo, clientes]) => {
        if (!sigueMontada()) return;
        setCitas(filas);
        setServicios(lineas);
        setPersonas([...profesionales, ...catalogo, ...clientes]);
      })
      .catch((fallo: unknown) => {
        if (!sigueMontada()) return;
        setCitas([]);
        setError(fallo instanceof Error ? fallo.message : 'No se pudo leer la agenda del día.');
      });
    return () => {
      control.abort();
    };
  }, [citasIniciales, recarga]);

  const nombres = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const persona of personas) mapa.set(persona.id, persona.nombre ?? 'Sin nombre');
    return mapa;
  }, [personas]);

  const cita = citas?.find((fila) => fila.id === citaId) ?? null;
  const lineas = lineasDe(servicios, citaId);
  const total = totalDe(lineas);
  const anticipo = aCentavos(cita?.anticipo);
  const propina =
    puntos === null ? aCentavos(Number(otraPropina)) : Math.round((total * puntos) / 100);
  const equipo = [...new Set(lineas.map((linea) => linea.profesional_id ?? ''))].filter(
    (id) => id !== '',
  );

  const bloqueo =
    total === 0
      ? 'Esa cita no tiene servicios cerrados que cobrar.'
      : anticipo > 0
        ? `${voc.conDeterminante('este', 'orden')} trae anticipo y el cobro todavía no sabe descontarlo. Ciérrala en caja.`
        : metodo === null
          ? 'Falta decir cómo paga.'
          : null;

  async function cobrar(citaActual: CitaPorCobrar, metodoActual: Metodo): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const salida = await invocarComando<{ readonly folio: string }>('/api/venta/cobrar-cita', {
        citaId: citaActual.id,
        // El importe lo manda el SERVIDOR desde los precios congelados al
        // agendar; aquí sólo viaja el reparto entre métodos, que él comprueba.
        pagos: [{ metodo: metodoActual, montoCentavos: total }],
      });
      setCitas((previas) => (previas ?? []).filter((fila) => fila.id !== citaActual.id));
      setAviso(
        propina > 0
          ? `Cobrado ${enPesos(total)} · folio ${salida.folio}. La propina de ${enPesos(propina)} se entrega en mano: todavía no queda anotada.`
          : `Cobrado ${enPesos(total)} · folio ${salida.folio}.`,
      );
      setCitaId(null);
      setMetodo(null);
      setPuntos(null);
      setOtraPropina('');
      onCobrado?.(citaActual.id);
    } catch (fallo) {
      setError(mensajeDeFallo(fallo, voc));
    } finally {
      setEnviando(false);
    }
  }

  const banda =
    error === null ? null : (
      <p
        role="alert"
        className="rounded-md border border-destructive bg-destructive/15 p-3 text-sm md:col-span-2"
      >
        {error}
      </p>
    );

  if (citas === null) {
    return (
      <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_22rem]">
        {/* El total con esqueleto y nada tocable: un botón vivo sobre un total
            que aún no existe es la forma de cobrar un número equivocado. */}
        <Skeleton className="h-20 w-full rounded-lg md:col-start-2" />
        <div className="space-y-2 md:col-start-1 md:row-start-1">
          {Array.from({ length: 4 }, (_, indice) => (
            <Skeleton key={indice} className="h-[var(--altura-control)] w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (cita === null) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <h1 className="text-2xl font-bold">
          Elige {voc.enFraseCon('un', 'orden')} terminad{voc.terminacion('orden')} para cobrar
        </h1>
        {aviso !== null && (
          <p role="status" className="rounded-md border border-border bg-success/20 p-3 text-sm">
            {aviso}
          </p>
        )}
        {banda}
        {citas.length === 0 ? (
          // El vacío ENSEÑA: dice por qué está vacío y qué hacer, no se disculpa.
          <div className="space-y-3 rounded-lg border border-border bg-card p-6">
            <p className="text-lg font-semibold">
              {voc.conDeterminante('ningun', 'orden')} está list{voc.terminacion('orden')} para
              cobrar.
            </p>
            <p className="text-muted-foreground">
              Una cita se cobra cuando el servicio está CERRADO, y no antes: cerrarlo es donde se
              captura la fórmula y donde se descuenta el material de cabina. Cierra el servicio en
              la agenda y vuelve aquí.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setRecarga((previa) => previa + 1);
              }}
            >
              Volver a mirar
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {citas.map((fila) => (
              <li key={fila.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent"
                  onClick={() => {
                    setCitaId(fila.id);
                    setAviso(null);
                    setDestinatario('repartir');
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {nombres.get(fila.cliente_id ?? '') ?? `Sin ${voc.singular('cliente')}`}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {fila.folio ?? 'Sin folio'} · {lineasDe(servicios, fila.id).length} conceptos
                    </span>
                  </span>
                  <span className="shrink-0 text-lg font-bold tabular-nums">
                    {enPesos(totalDe(lineasDe(servicios, fila.id)))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const listaDeLineas = (
    <ul className="space-y-2">
      {lineas.map((linea) => (
        <li key={linea.id} className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate">
              {nombres.get(linea.servicio_id ?? '') ?? 'Servicio'}
            </span>
            {/* El profesional en CADA línea: sin él la comisión se la lleva una sola. */}
            <Badge variant="secondary" className="mt-1">
              ▸ {nombres.get(linea.profesional_id ?? '') ?? 'Sin asignar'}
            </Badge>
          </span>
          <span className="shrink-0 tabular-nums">{enPesos(aCentavos(linea.precio_centavos))}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_28rem]">
      <header className="flex flex-wrap items-baseline gap-2 md:col-span-2">
        <h1 className="text-xl font-bold">
          {nombres.get(cita.cliente_id ?? '') ?? `Sin ${voc.singular('cliente')}`}
        </h1>
        <span className="text-sm text-muted-foreground">{cita.folio ?? 'Sin folio'}</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => {
            setCitaId(null);
          }}
        >
          Elegir {voc.enFraseCon('otro', 'orden')}
        </Button>
      </header>

      {banda}

      {/* El bloque del dinero va PRIMERO en el DOM: en teléfono es lo que se ve
          sin desplazar, y en tablet es la columna derecha del documento. */}
      <aside
        aria-label="Cobro"
        className="space-y-3 rounded-lg border border-border bg-card p-4 md:col-start-2 md:row-start-3"
      >
        <p className="text-sm font-medium uppercase text-muted-foreground">Total</p>
        <p className="text-4xl font-bold tabular-nums xl:text-5xl">{enPesos(total)}</p>
        {anticipo > 0 && (
          <p className="flex justify-between border-b border-border pb-2 text-sm tabular-nums">
            <span>− anticipo</span>
            <span>{enPesos(anticipo)}</span>
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          {METODOS.map((opcion) => (
            <Button
              key={opcion.clave}
              type="button"
              variant={metodo === opcion.clave ? 'default' : 'outline'}
              aria-pressed={metodo === opcion.clave}
              className="min-h-20"
              onClick={() => {
                setMetodo(opcion.clave);
              }}
            >
              {opcion.etiqueta}
              {/* El color nunca es el único que dice cuál está elegido. */}
              <span aria-hidden>{metodo === opcion.clave ? ' ✓' : ''}</span>
            </Button>
          ))}
        </div>

        {metodo === 'transferencia' && (
          <RadioGroup value={cuenta} onValueChange={setCuenta} aria-label="¿A qué cuenta?">
            <p className="text-sm font-medium">¿A qué cuenta?</p>
            <span className="flex items-center gap-2">
              <RadioGroupItem value="salon" id="cuenta-salon" />
              <Label htmlFor="cuenta-salon">Cuenta del salón</Label>
            </span>
            <span className="flex items-center gap-2">
              <RadioGroupItem value="profesional" id="cuenta-profesional" />
              <Label htmlFor="cuenta-profesional">
                Cuenta de {nombres.get(equipo[0] ?? '') ?? 'la profesional'} · se le descuenta de su
                liquidación
              </Label>
            </span>
          </RadioGroup>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium uppercase text-muted-foreground">Propina</p>
          <div className="flex flex-wrap gap-2">
            {PROPINAS.map((porcentaje) => (
              <Button
                key={porcentaje}
                type="button"
                size="sm"
                // Una entrada de `.map` no es literal aunque el arreglo lleve
                // `as const`: el literal se escribe aquí, con el suyo.
                variant={puntos === porcentaje ? ('default' as const) : ('outline' as const)}
                aria-pressed={puntos === porcentaje}
                onClick={() => {
                  setPuntos(porcentaje);
                  setOtraPropina('');
                }}
              >
                {porcentaje}%
              </Button>
            ))}
            <Input
              aria-label="Otra propina, en pesos"
              inputMode="decimal"
              placeholder="otro"
              className="w-24"
              value={otraPropina}
              onChange={(evento) => {
                setPuntos(null);
                setOtraPropina(evento.target.value);
              }}
            />
          </div>
          <Select value={destinatario} onValueChange={setDestinatario}>
            <SelectTrigger className="w-full" aria-label="Destinatario de la propina">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="repartir">
                {equipo.length > 1 ? 'Repartir en proporción' : 'Para quien atendió'}
              </SelectItem>
              {equipo.map((id) => (
                <SelectItem key={id} value={id}>
                  Para {nombres.get(id) ?? 'esta persona'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          size="lg"
          className="min-h-20 w-full justify-between text-lg"
          disabled={enviando || bloqueo !== null}
          onClick={() => {
            if (metodo !== null) void cobrar(cita, metodo);
          }}
        >
          <span>{enviando ? 'Cobrando…' : 'COBRAR'}</span>
          <span className="tabular-nums">{enPesos(total + propina)}</span>
        </Button>
        {bloqueo !== null && <p className="text-center text-sm">{bloqueo}</p>}
      </aside>

      <section
        aria-label={`Conceptos de ${voc.enFrase('orden')}`}
        className="rounded-lg border border-border bg-card md:col-start-1 md:row-start-3"
      >
        {/* `details` nativo: el teclado y el lector de pantalla ya saben abrirlo.
            En tablet y PC no hay nada que abrir — las líneas están a la vista. */}
        <details className="md:hidden">
          <summary className="cursor-pointer p-4 text-sm">({lineas.length} conceptos)</summary>
          <div className="px-4 pb-4">{listaDeLineas}</div>
        </details>
        <div className="hidden space-y-3 p-4 md:block">
          {listaDeLineas}
          <dl className="space-y-1 border-t border-border pt-3 text-sm tabular-nums">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{enPesos(total)}</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>IVA incluido</dt>
              <dd>{enPesos(ivaIncluidoDe(total))}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
