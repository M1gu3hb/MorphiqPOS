'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import {
  agrupar,
  etiquetaDelta,
  mensajeDeFallo,
  pesos,
  porOmisionDe,
  totalCentavos,
  type GrupoDeOpciones,
  type OpcionDeBebida,
} from './opciones-de-bebida';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · cafeteria · opciones-de-la-bebida
 *
 * El diálogo que decide si el dato existe (F-027). 90-160 veces al día, y en el
 * pico de las 10:00 más del 60% de las líneas pasan por aquí.
 *
 * ── Por qué merece el centro de la pantalla ──────────────────────────────
 * Porque el crecimiento del ticket de una cafetería no viene de vender más
 * cafés: viene de dejar que el cliente construya el suyo. El modificador es la
 * palanca de ingreso del negocio, no un detalle. Y porque «avena» no es una
 * nota al margen: es otro insumo, con otro costo y otra receta.
 *
 * ── Los cuatro grupos a la vez, sin scroll y sin pasos ───────────────────
 * Un diálogo de cuatro pasos en la ráfaga es un diálogo que el barista cierra y
 * sustituye por un plumón sobre el vaso. Por eso el panel se COMPONE —no se
 * abre como modal— y se dimensiona para caber entero: un toque por grupo más el
 * de agregar, cinco máximo, tres típicos.
 *
 * ── La preseleccionada NO se escribe en el estado ────────────────────────
 * Se DERIVA de `por_omision`, y lo que el barista toca la pisa encima. Sembrar
 * el estado desde el efecto sería un `setState` en su cuerpo síncrono, y además
 * rompería el caso real: si la más vendida se agotó, la marca salta sola a la
 * siguiente disponible sin que nadie vuelva a tocar nada. Tres de cada cuatro
 * pedidos salen tocando sólo AGREGAR.
 *
 * ── El precio va DENTRO del botón de la opción ───────────────────────────
 * `Avena +22`. El barista tiene que poder decir el precio sin calcular, y el
 * cliente tiene derecho a saber que la avena cuesta antes de que se lo cobren.
 * Lo agotado se apaga solo, con la palabra «Agotado» debajo: prometer lo que no
 * hay es la misma escena del producto agotado del mesero en `restaurante`.
 *
 * ── La alergia está aquí y no en otro lado ───────────────────────────────
 * Porque es donde se pregunta, y porque los dos alérgenos de este giro —leche y
 * fruto seco— son justo los dos grupos de arriba. La marca no se puede colapsar
 * y viaja en rojo a la tarjeta de barra (F-316).
 *
 * ── Teléfono ─────────────────────────────────────────────────────────────
 * Los grupos se apilan y Extras se colapsa tras `+ Extras (n)`: es el único que
 * se usa en menos del 20% de los pedidos, y apilado empuja AGREGAR fuera del
 * pulgar. En tablet es idéntico a PC con el objetivo táctil crecido, que es lo
 * que pide el documento.
 *
 * ── Lo que NO va, y lo que hoy no se puede abrir ─────────────────────────
 * Ni costo del insumo, ni margen, ni gramaje: el barista no los ve nunca, y no
 * porque la pantalla no los pinte —el servidor no los manda, campo por campo.
 * El puente de hoy tampoco expone `Modificador`: sus columnas las escribe la
 * migración 084, que no está aplicada. Contra la base de hoy la lectura falla,
 * la banda lo dice y la pantalla se degrada a la bebida sencilla en vez de
 * vaciarse. Con `opcionesIniciales` se prueba entera sin red. Recortado para
 * caber en un archivo: la vista previa de la receta resuelta; «otra…» es aquí
 * un campo libre y no un catálogo de alérgenos.
 */

const CHIP = [
  'flex min-h-[var(--area-tactil-minima)] flex-col items-center justify-center gap-0.5',
  'rounded-md border-2 px-3 py-2 text-center transition-colors',
  'md:min-h-[calc(var(--area-tactil-minima)*1.2)]',
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
].join(' ');

const ROTULO = 'mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground';

/** Los dos alérgenos de este giro. Cualquier otro entra por el campo libre. */
const ALERGENOS = ['Frutos secos', 'Lácteos'] as const;

/** El documento no nombra la ruta: se usa la convención `/api/<dominio>/<verbo>`. */
const RUTA_AGREGAR = '/api/cafeteria/agregar-linea';

export interface OpcionesDeLaBebidaProps {
  readonly productoId?: string;
  readonly productoNombre?: string;
  readonly precioBaseCentavos?: number;
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly opcionesIniciales?: readonly OpcionDeBebida[];
  readonly onAgregada?: (lineaId: string | null) => void;
}

function claseChip(activa: boolean, agotado: boolean): string {
  if (agotado) return 'border-border bg-muted text-muted-foreground';
  if (activa) return 'border-primary bg-primary text-primary-foreground';
  return 'border-input bg-background hover:bg-accent hover:text-accent-foreground';
}

export function OpcionesDeLaBebida({
  productoId,
  productoNombre = 'Bebida',
  precioBaseCentavos = 0,
  opcionesIniciales,
  onAgregada,
}: OpcionesDeLaBebidaProps) {
  const voc = useVocabulario();
  const [opciones, setOpciones] = useState<readonly OpcionDeBebida[] | null>(
    opcionesIniciales ?? null,
  );
  const [elegidas, setElegidas] = useState<Readonly<Record<string, string>>>({});
  const [sueltas, setSueltas] = useState<Readonly<Record<string, boolean>>>({});
  const [alergias, setAlergias] = useState<readonly string[]>([]);
  const [otraAlergia, setOtraAlergia] = useState('');
  const [nota, setNota] = useState('');
  const [extrasAbiertos, setExtrasAbiertos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opcionesIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const consulta =
      productoId === undefined
        ? { limite: 60, signal: control.signal }
        : { filtro: { producto_id: productoId }, limite: 60, signal: control.signal };

    consultarPuente<OpcionDeBebida>('Modificador', consulta)
      .then((filas) => {
        if (sigueMontada()) setOpciones(filas);
      })
      .catch((fallo: unknown) => {
        // La pantalla NO se vacía por un fallo de lectura: se degrada a la
        // bebida sencilla y deja AGREGAR vivo. Un vaso sin opciones se sirve.
        if (!sigueMontada()) return;
        setOpciones([]);
        setError(mensajeDeFallo(fallo));
      });

    return () => {
      control.abort();
    };
  }, [opcionesIniciales, productoId]);

  const grupos = useMemo(() => (opciones === null ? [] : agrupar(opciones)), [opciones]);

  const seleccion = useMemo(() => {
    const mapa = new Map<string, string | null>();
    for (const grupo of grupos) {
      mapa.set(grupo.nombre, elegidas[grupo.nombre] ?? porOmisionDe(grupo));
    }
    return mapa;
  }, [grupos, elegidas]);

  const estaActiva = useCallback(
    (grupo: GrupoDeOpciones, opcion: OpcionDeBebida): boolean =>
      grupo.varias
        ? (sueltas[opcion.id] ?? opcion.por_omision)
        : seleccion.get(grupo.nombre) === opcion.id,
    [seleccion, sueltas],
  );

  const activas = useMemo(
    () => grupos.flatMap((g) => g.opciones.filter((o) => !o.agotado && estaActiva(g, o))),
    [grupos, estaActiva],
  );

  const marcasDeAlergia = useMemo(
    () => (otraAlergia.trim() === '' ? alergias : [...alergias, otraAlergia.trim()]),
    [alergias, otraAlergia],
  );

  const elegir = (grupo: GrupoDeOpciones, opcion: OpcionDeBebida): void => {
    if (grupo.varias) {
      setSueltas((previas) => ({
        ...previas,
        [opcion.id]: !(previas[opcion.id] ?? opcion.por_omision),
      }));
      return;
    }
    setElegidas((previas) => ({ ...previas, [grupo.nombre]: opcion.id }));
  };

  const alternarAlergia = (alergeno: string): void => {
    setAlergias((previas) =>
      previas.includes(alergeno) ? previas.filter((a) => a !== alergeno) : [...previas, alergeno],
    );
  };

  const agregar = async (): Promise<void> => {
    setEnviando(true);
    setError(null);
    try {
      const datos = await invocarComando<{ readonly lineaId?: string }>(RUTA_AGREGAR, {
        productoId: productoId ?? null,
        opciones: activas.map((o) => o.id),
        alergias: marcasDeAlergia,
        nota: nota.trim(),
      });
      if (onAgregada === undefined) window.history.back();
      else onAgregada(datos.lineaId ?? null);
    } catch (fallo: unknown) {
      setError(mensajeDeFallo(fallo));
    } finally {
      setEnviando(false);
    }
  };

  if (opciones === null) {
    // Esqueletos con la forma de los grupos, no un spinner: el ojo ya sabe
    // dónde va a mirar y nada salta de sitio cuando llegan los datos.
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4">
        <Skeleton className="h-20 w-full rounded-lg" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-5 w-24 rounded-md" />
            <Skeleton className="h-20 w-full rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh justify-center bg-background md:items-center md:p-6">
      <section
        aria-labelledby="titulo-bebida"
        className="flex w-full max-w-2xl flex-col bg-card text-card-foreground md:rounded-xl md:border md:border-border md:shadow-3"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border p-4">
          <h1 id="titulo-bebida" className="text-2xl font-bold uppercase">
            {productoNombre}
          </h1>
          <div className="flex items-center gap-3">
            <p className="text-xl font-semibold tabular-nums">{pesos(precioBaseCentavos)}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Cerrar sin agregar"
              onClick={() => {
                window.history.back();
              }}
            >
              ✕
            </Button>
          </div>
        </header>

        {error !== null && (
          <p
            role="alert"
            className="mx-4 mt-4 rounded-md border border-destructive bg-destructive/15 p-2 text-sm"
          >
            ⚠️ {error} Se puede agregar la bebida sencilla.
          </p>
        )}

        {grupos.length === 0 && error === null ? (
          // El vacío ENSEÑA: dice qué falta declarar y lleva a declararlo.
          <div className="flex flex-col items-start gap-3 p-4">
            <p className="text-lg font-semibold">
              {voc.conDeterminante('este', 'linea_orden')} se agrega tal cual.
            </p>
            <p className="text-sm text-muted-foreground">
              Todavía no declara grupos de opciones. La leche, el tamaño, la temperatura y los
              extras se declaran una sola vez en Configuración › Opciones de bebida, cada uno con su
              diferencia de precio, y desde entonces aparecen aquí solos.
            </p>
            <Button asChild variant="secondary">
              <a href="/configuracion">Declarar los grupos de opciones</a>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5 p-4">
            {grupos.map((grupo) => {
              const esExtras = grupo.nombre === 'Extras';
              return (
                <fieldset key={grupo.nombre} className="min-w-0">
                  <legend className={ROTULO}>
                    {grupo.nombre}
                    {grupo.varias ? ' · varios' : ''}
                  </legend>
                  {esExtras && (
                    <button
                      type="button"
                      aria-expanded={extrasAbiertos}
                      aria-controls="grupo-extras"
                      onClick={() => {
                        setExtrasAbiertos((abierto) => !abierto);
                      }}
                      className="mb-2 w-full rounded-md border border-input px-3 py-2 text-sm font-semibold md:hidden"
                    >
                      {extrasAbiertos ? '− Ocultar extras' : `+ Extras (${grupo.opciones.length})`}
                    </button>
                  )}
                  <div
                    id={esExtras ? 'grupo-extras' : undefined}
                    className={[
                      'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4',
                      esExtras && !extrasAbiertos ? 'hidden md:grid' : '',
                    ].join(' ')}
                  >
                    {grupo.opciones.map((opcion) => {
                      const activa = estaActiva(grupo, opcion) && !opcion.agotado;
                      const delta = etiquetaDelta(opcion.delta_precio_centavos ?? 0);
                      return (
                        <button
                          key={opcion.id}
                          type="button"
                          disabled={opcion.agotado}
                          aria-pressed={activa}
                          onClick={() => {
                            elegir(grupo, opcion);
                          }}
                          className={`${CHIP} ${claseChip(activa, opcion.agotado)}`}
                        >
                          {/* La palomita acompaña al color: el color nunca va solo. */}
                          <span className="text-sm font-semibold">
                            {activa ? '✓ ' : ''}
                            {opcion.nombre}
                          </span>
                          {delta !== null && <span className="text-xs tabular-nums">{delta}</span>}
                          {opcion.agotado && <span className="text-xs font-medium">Agotado</span>}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}

            <fieldset className="min-w-0">
              <legend className={ROTULO}>⚠️ Alergia</legend>
              <div className="flex flex-wrap items-center gap-2">
                {ALERGENOS.map((alergeno) => {
                  const marcado = alergias.includes(alergeno);
                  return (
                    <button
                      key={alergeno}
                      type="button"
                      aria-pressed={marcado}
                      onClick={() => {
                        alternarAlergia(alergeno);
                      }}
                      className={[
                        'rounded-md border-2 px-3 py-2 text-sm font-semibold',
                        marcado
                          ? 'border-destructive bg-destructive/25 text-foreground'
                          : 'border-input bg-background hover:bg-accent hover:text-accent-foreground',
                      ].join(' ')}
                    >
                      {marcado ? '⚠️ ' : ''}
                      {alergeno}
                    </button>
                  );
                })}
                <Input
                  value={otraAlergia}
                  aria-label="Otra alergia"
                  placeholder="otra…"
                  onChange={(evento) => {
                    setOtraAlergia(evento.target.value);
                  }}
                  className="w-36"
                />
              </div>
            </fieldset>

            <div className="min-w-0">
              <Label htmlFor="nota-barra" className={ROTULO}>
                Nota para {voc.enFrase('preparacion')}
              </Label>
              <Textarea
                id="nota-barra"
                rows={2}
                value={nota}
                placeholder="Sin espuma, vaso aparte…"
                onChange={(evento) => {
                  setNota(evento.target.value);
                }}
              />
            </div>
          </div>
        )}

        <footer className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-border bg-card p-4 md:mt-0 md:rounded-b-xl">
          {marcasDeAlergia.length > 0 && (
            // No se colapsa nunca: viaja en rojo a la tarjeta de barra (F-316).
            <p className="rounded-md border border-destructive bg-destructive/15 px-2 py-1 text-sm font-semibold">
              ⚠️ Alergia: {marcasDeAlergia.join(' · ')}
            </p>
          )}
          <Button
            type="button"
            size="lg"
            disabled={enviando}
            onClick={() => {
              void agregar();
            }}
            className="h-[calc(var(--altura-control)*1.5)] w-full justify-between text-base font-bold"
          >
            <span>{enviando ? 'AGREGANDO…' : 'AGREGAR'}</span>
            <span className="tabular-nums">
              {pesos(totalCentavos(precioBaseCentavos, activas))}
            </span>
          </Button>
        </footer>
      </section>
    </div>
  );
}
