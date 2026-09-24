'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';
import {
  Aviso,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Vacio,
} from '@morphiqpos/ui/sistema';
import { Check, CupSoda, Minus, Plus, TriangleAlert, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import {
  agrupar,
  mensajeDeFallo,
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
 * ── Los cuatro grupos a la vez, sin pasos ────────────────────────────────
 * Un diálogo de cuatro pasos en la ráfaga es un diálogo que el barista cierra y
 * sustituye por un plumón sobre el vaso. Por eso el panel se COMPONE —no se
 * abre como modal— y se dimensiona para caber entero: un toque por grupo más el
 * de agregar, cinco máximo, tres típicos. Si una pantalla baja no alcanza, lo
 * que se desplaza es el cuerpo: la cabecera y AGREGAR no se van nunca.
 *
 * ── La preseleccionada NO se escribe en el estado ────────────────────────
 * Se DERIVA de `por_omision`, y lo que el barista toca la pisa encima. Sembrar
 * el estado desde el efecto sería un `setState` en su cuerpo síncrono, y además
 * rompería el caso real: si la más vendida se agotó, la marca salta sola a la
 * siguiente disponible sin que nadie vuelva a tocar nada. Tres de cada cuatro
 * pedidos salen tocando sólo AGREGAR.
 *
 * ── El precio va DENTRO de la tesela de la opción ────────────────────────
 * `Avena +$22.00`, con `<Dinero>`. El barista tiene que poder decir el precio sin
 * calcular, y el cliente tiene derecho a saber que la avena cuesta antes de que
 * se lo cobren. El signo va escrito y no en color: sobre la tesela elegida el
 * rojo de un negativo no se leería. Lo agotado se apaga solo —plano, sin
 * elevación—, con la palabra «Agotado» debajo: prometer lo que no hay es la
 * misma escena del producto agotado del mesero en `restaurante`.
 *
 * ── La alergia está aquí y no en otro lado ───────────────────────────────
 * Porque es donde se pregunta, y porque los dos alérgenos de este giro —leche y
 * fruto seco— son justo los dos grupos de arriba. La marca no se puede colapsar
 * y viaja en rojo a la tarjeta de barra (F-316).
 *
 * ── Teléfono ─────────────────────────────────────────────────────────────
 * Los grupos se apilan y Extras se colapsa tras `Extras (n)`: es el único que
 * se usa en menos del 20% de los pedidos, y apilado empuja AGREGAR fuera del
 * pulgar. En tablet es idéntico a PC con el objetivo táctil crecido, que es lo
 * que pide el documento.
 *
 * ── Lo que NO va, y lo que hoy no se puede abrir ─────────────────────────
 * Ni costo del insumo, ni margen, ni gramaje: el barista no los ve nunca, y no
 * porque la pantalla no los pinte —el servidor no los manda, campo por campo.
 * Si la lectura de `Modificador` falla, la pantalla NO se vacía: dice qué no
 * pudo leer, ofrece volver a leerlo y se degrada a la bebida sencilla con
 * AGREGAR vivo. Con `opcionesIniciales` se prueba entera sin red. Recortado para
 * caber en un archivo: la vista previa de la receta resuelta; «otra…» es aquí
 * un campo libre y no un catálogo de alérgenos.
 */

const ROTULO = 'mb-(--espacio-2) text-xs font-bold tracking-wide text-texto-sutil uppercase';

/** La tesela de una opción: el objetivo táctil del sistema, crecido en tableta. */
const TESELA = [
  'flex min-h-(--area-tactil-minima) w-full flex-col items-center justify-center',
  'gap-(--espacio-1) px-(--espacio-3) py-(--espacio-2) text-center',
  'md:min-h-[calc(var(--area-tactil-minima)*1.2)]',
].join(' ');

const REJILLA = 'grid grid-cols-2 gap-(--espacio-2) sm:grid-cols-3 lg:grid-cols-4';

/** El alto de AGREGAR: lo más pesado del panel, y el esqueleto reserva el mismo. */
const ALTO_AGREGAR = 'h-[calc(var(--altura-control)*1.5)]';

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

/**
 * El tinte de la tesela. La palomita acompaña al color: el color nunca va solo.
 *
 * La agotada ya se apaga con el gris; la opacidad de `disabled` que trae la tesela
 * interactiva se anula, porque encima del gris la dejaba a 1,9:1, ilegible con vapor.
 */
function tinteDeOpcion(activa: boolean, agotado: boolean): string {
  if (agotado) return 'bg-fondo-sutil text-texto-sutil disabled:opacity-100';
  if (activa) return 'border-primario bg-primario text-primario-texto';
  return 'border-borde-fuerte';
}

/**
 * El panel: cabecera, cuerpo que se desplaza y pie con AGREGAR. En teléfono ocupa
 * la pantalla entera; de tableta arriba flota al centro, a nivel 3.
 */
function Marco({
  nombre,
  precioCentavos,
  pie,
  children,
}: {
  readonly nombre: string;
  readonly precioCentavos: number;
  readonly pie: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="flex min-h-dvh justify-center bg-fondo md:items-center md:p-(--espacio-6)">
      <Superficie
        como="section"
        nivel={3}
        relleno={0}
        aria-labelledby="titulo-bebida"
        className="flex h-dvh w-full max-w-2xl flex-col rounded-none border-0 md:h-auto md:max-h-[calc(100dvh-var(--espacio-12))] md:rounded-lg md:border"
      >
        <header className="flex items-center justify-between gap-(--espacio-3) border-b border-borde p-(--espacio-4)">
          <h1 id="titulo-bebida" className="text-2xl font-bold uppercase">
            {nombre}
          </h1>
          <div className="flex items-center gap-(--espacio-3)">
            <Dinero centavos={precioCentavos} tamano="lg" />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Cerrar sin agregar"
              onClick={() => {
                window.history.back();
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-(--espacio-4)">{children}</div>
        <footer className="flex flex-col gap-(--espacio-2) border-t border-borde p-(--espacio-4)">
          {pie}
        </footer>
      </Superficie>
    </div>
  );
}

/**
 * Cargando: la forma de los cuatro grupos, no una rueda. El ojo ya sabe dónde va
 * a mirar y nada salta de sitio cuando llegan los datos.
 */
function EsqueletoDeGrupos(): ReactElement {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando las opciones"
      className="flex flex-col gap-(--espacio-4)"
    >
      {Array.from({ length: 4 }, (_, grupo) => (
        <div key={grupo} className="flex flex-col gap-(--espacio-2)">
          <Esqueleto className="h-4 w-24" />
          <div className={REJILLA}>
            {Array.from({ length: 3 }, (_, opcion) => (
              <Esqueleto
                key={opcion}
                className="min-h-(--area-tactil-minima) md:min-h-[calc(var(--area-tactil-minima)*1.2)]"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** `+$22.00` · `−$8.00`: el signo lo dice el texto, no el color. */
function Diferencia({ centavos }: { readonly centavos: number }): ReactElement {
  return (
    <span className="text-xs">
      {centavos > 0 ? '+' : '−'}
      <Dinero centavos={Math.abs(centavos)} tamano="xs" />
    </span>
  );
}

function SelectorDeGrupo({
  grupo,
  estaActiva,
  alElegir,
  plegado,
  alPlegar,
}: {
  readonly grupo: GrupoDeOpciones;
  readonly estaActiva: (grupo: GrupoDeOpciones, opcion: OpcionDeBebida) => boolean;
  readonly alElegir: (grupo: GrupoDeOpciones, opcion: OpcionDeBebida) => void;
  /** Sólo Extras se pliega, y sólo en teléfono. `null` en los demás grupos. */
  readonly plegado: boolean | null;
  readonly alPlegar: () => void;
}): ReactElement {
  const plegable = plegado !== null;
  return (
    <fieldset className="min-w-0">
      <legend className={ROTULO}>
        {grupo.nombre}
        {grupo.varias ? ' · varios' : ''}
      </legend>
      {plegable && (
        <Button
          type="button"
          variant="outline"
          aria-expanded={!plegado}
          aria-controls="grupo-extras"
          onClick={alPlegar}
          className="mb-(--espacio-2) w-full md:hidden"
        >
          {plegado ? <Plus aria-hidden="true" /> : <Minus aria-hidden="true" />}
          {plegado ? `Extras (${String(grupo.opciones.length)})` : 'Ocultar extras'}
        </Button>
      )}
      <ul
        id={plegable ? 'grupo-extras' : undefined}
        className={plegado === true ? `${REJILLA} hidden md:grid` : REJILLA}
      >
        {grupo.opciones.map((opcion) => {
          const activa = estaActiva(grupo, opcion) && !opcion.agotado;
          const delta = opcion.delta_precio_centavos ?? 0;
          return (
            <li key={opcion.id}>
              <Superficie
                como="button"
                type="button"
                interactiva
                activa={activa}
                nivel={opcion.agotado ? 0 : 1}
                radio="md"
                relleno={0}
                disabled={opcion.agotado}
                aria-pressed={activa}
                onClick={() => {
                  alElegir(grupo, opcion);
                }}
                className={`${TESELA} ${tinteDeOpcion(activa, opcion.agotado)}`}
              >
                <span className="inline-flex items-center gap-(--espacio-1) text-sm font-semibold">
                  {activa ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                  {opcion.nombre}
                </span>
                {delta === 0 ? null : <Diferencia centavos={delta} />}
                {/* La palabra, a todo contraste: es lo que dice por qué no responde. */}
                {opcion.agotado ? (
                  <span className="text-xs font-medium text-texto">Agotado</span>
                ) : null}
              </Superficie>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

function Alergias({
  marcadas,
  alAlternar,
  otra,
  alCambiarOtra,
}: {
  readonly marcadas: readonly string[];
  readonly alAlternar: (alergeno: string) => void;
  readonly otra: string;
  readonly alCambiarOtra: (texto: string) => void;
}): ReactElement {
  return (
    <fieldset className="min-w-0">
      <legend className={`${ROTULO} inline-flex items-center gap-(--espacio-1)`}>
        <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
        Alergia
      </legend>
      <div className="flex flex-wrap items-center gap-(--espacio-2)">
        {ALERGENOS.map((alergeno) => {
          const marcado = marcadas.includes(alergeno);
          return (
            <Superficie
              key={alergeno}
              como="button"
              type="button"
              interactiva
              radio="md"
              relleno={0}
              aria-pressed={marcado}
              onClick={() => {
                alAlternar(alergeno);
              }}
              className={`inline-flex min-h-(--area-tactil-minima) items-center gap-(--espacio-1) px-(--espacio-3) text-sm font-semibold ${marcado ? 'border-peligro bg-peligro/15' : 'border-borde-fuerte'}`}
            >
              {marcado ? (
                <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-peligro" />
              ) : null}
              {alergeno}
            </Superficie>
          );
        })}
        <Input
          value={otra}
          aria-label="Otra alergia"
          placeholder="otra…"
          onChange={(evento) => {
            alCambiarOtra(evento.target.value);
          }}
          className="w-36"
        />
      </div>
    </fieldset>
  );
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
  const [falloDeLectura, setFalloDeLectura] = useState<string | null>(null);
  const [elegidas, setElegidas] = useState<Readonly<Record<string, string>>>({});
  const [sueltas, setSueltas] = useState<Readonly<Record<string, boolean>>>({});
  const [alergias, setAlergias] = useState<readonly string[]>([]);
  const [otraAlergia, setOtraAlergia] = useState('');
  const [nota, setNota] = useState('');
  const [extrasAbiertos, setExtrasAbiertos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada intento de lectura es un número: «Volver a intentar» lo sube y el
  // efecto lee otra vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);

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
        setFalloDeLectura(mensajeDeFallo(fallo));
      });

    return () => {
      control.abort();
    };
  }, [opcionesIniciales, productoId, intento]);

  function volverALeer(): void {
    setFalloDeLectura(null);
    setOpciones(null);
    setIntento((previo) => previo + 1);
  }

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
      if (productoId === undefined) return;
      const datos = await invocarComando<{ readonly lineaId?: string }>(RUTA_AGREGAR, {
        productoId,
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
    return (
      <Marco
        nombre={productoNombre}
        precioCentavos={precioBaseCentavos}
        pie={<Esqueleto className={`${ALTO_AGREGAR} w-full`} />}
      >
        <EsqueletoDeGrupos />
      </Marco>
    );
  }

  const pie = (
    <>
      {marcasDeAlergia.length > 0 && (
        // No se colapsa nunca: viaja en rojo a la tarjeta de barra (F-316).
        <Superficie
          como="p"
          nivel={0}
          radio="md"
          relleno={0}
          className="flex items-center gap-(--espacio-2) border-peligro bg-peligro/15 px-(--espacio-3) py-(--espacio-2) text-sm font-semibold"
        >
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-peligro" />
          <span>Alergia: {marcasDeAlergia.join(' · ')}</span>
        </Superficie>
      )}
      {error !== null && (
        <Aviso tono="peligro" titulo={error}>
          {`${voc.conArticulo('linea_orden')} no se agregó: lo elegido sigue aquí.`}
        </Aviso>
      )}
      {/*
        SIN BEBIDA NO SE AGREGA NADA, y antes se intentaba.

        `cafeteria.agregar_linea` pide `productoId: z.uuid()`, y esta pantalla
        mandaba `productoId ?? null` cuando se abría desde el menú —que es el
        Único sitio desde donde se llega—. Resultado: **400 en cada toque de
        AGREGAR**, con las opciones ya elegidas y el mensaje genérico de un fallo
        de validación. La ruta acepta la bebida en `?producto=`; sin ella, lo
        honesto es apagar el botón y decir qué falta.
      */}
      {productoId === undefined && (
        <p role="status" className="text-sm text-texto-sutil">
          Elige primero {voc.enFrase('producto')} en{' '}
          <a className="font-medium text-texto underline" href="/cafeteria/cobrar">
            Cobrar
          </a>
          : estas opciones se agregan a una bebida, y todavía no hay ninguna.
        </p>
      )}
      <Button
        type="button"
        size="lg"
        disabled={enviando || productoId === undefined}
        onClick={() => {
          void agregar();
        }}
        className={`${ALTO_AGREGAR} w-full justify-between text-lg font-bold`}
      >
        <span>{enviando ? 'AGREGANDO…' : 'AGREGAR'}</span>
        <Dinero centavos={totalCentavos(precioBaseCentavos, activas)} tamano="lg" />
      </Button>
    </>
  );

  // El vacío ENSEÑA: dice qué falta declarar y lleva a declararlo.
  if (grupos.length === 0 && falloDeLectura === null) {
    return (
      <Marco nombre={productoNombre} precioCentavos={precioBaseCentavos} pie={pie}>
        <Vacio
          icono={<CupSoda />}
          titulo={`${voc.conDeterminante('este', 'linea_orden')} se agrega tal cual.`}
          explicacion="Todavía no declara grupos de opciones. La leche, el tamaño, la temperatura y los extras se declaran una sola vez en Configuración › Opciones de bebida, cada uno con su diferencia de precio, y desde entonces aparecen aquí solos."
          accion={
            <Button asChild variant="secondary">
              <a href="/configuracion">Declarar los grupos de opciones</a>
            </Button>
          }
        />
      </Marco>
    );
  }

  return (
    <Marco nombre={productoNombre} precioCentavos={precioBaseCentavos} pie={pie}>
      <div className="flex flex-col gap-(--espacio-4)">
        {falloDeLectura !== null && (
          <ErrorDePantalla
            titulo="No se pudieron leer las opciones"
            queHacer={`Se puede agregar ${voc.enFrase('linea_orden')} sencill${voc.terminacion('linea_orden')}, sin opciones, o volver a leerlas.`}
            detalle={falloDeLectura}
            reintentar={
              <Button type="button" variant="outline" onClick={volverALeer}>
                Volver a intentar
              </Button>
            }
          />
        )}

        {grupos.map((grupo) => (
          <SelectorDeGrupo
            key={grupo.nombre}
            grupo={grupo}
            estaActiva={estaActiva}
            alElegir={elegir}
            plegado={grupo.nombre === 'Extras' ? !extrasAbiertos : null}
            alPlegar={() => {
              setExtrasAbiertos((abierto) => !abierto);
            }}
          />
        ))}

        <Alergias
          marcadas={alergias}
          alAlternar={alternarAlergia}
          otra={otraAlergia}
          alCambiarOtra={setOtraAlergia}
        />

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
    </Marco>
  );
}
