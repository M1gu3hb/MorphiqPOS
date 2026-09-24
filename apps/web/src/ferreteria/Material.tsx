'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  Cifra,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Check, Scissors, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · material
 *
 * El material continuo: los rollos abiertos, lo que queda y el corte.
 *
 * ── Por qué se recomienda LA MÁS CHICA QUE ALCANZA ──────────────────────
 * Cortar del rollo grande deja tres retazos del mismo cable, y el trabajo de una
 * ferretería es acabarse los abiertos, no abrir otro. Ofrecer «el primero de la
 * lista» es exactamente cómo se acumulan pedazos que después se rematan a
 * pérdida.
 *
 * ── Por qué la pieza abierta NO es el inventario ────────────────────────
 * El inventario sigue siendo el movimiento de stock en unidad base. Esto dice
 * cómo está repartido lo que ya está contado, y por eso abrir una pieza no mueve
 * existencia: moverla la descontaría dos veces, al abrir y al cortar.
 *
 * ── Por qué el folio se rotula a mano ───────────────────────────────────
 * «R-114» va con plumón en la cinta. Nadie copia un uuid a un rollo de cable, y
 * un identificador que no se puede escribir en el material físico es un
 * identificador que no se usa.
 *
 * ── Por qué la merma del corte tiene valor por omisión ──────────────────
 * Sin él se teclea cero, y el cero es mentira: cortar cable deja puntas. Un
 * inventario que no cuenta la merma del corte se desvía siempre en la misma
 * dirección hasta que el conteo anual lo descubre.
 *
 * ── Cómo se reparte (`04-INTERFAZ` §PANTALLA 3) ─────────────────────────
 * Primero se ve DE DÓNDE se corta y CUÁNTO QUEDA: la pregunta «¿de cuál corto?» y
 * la lista de rollos, con lo que queda en cada uno como la cifra que manda. En la PC
 * el corte vive a la derecha, fijo, porque es la acción principal; en el teléfono
 * —junto al rack, de pie— todo va en una columna con los campos grandes, y el corte
 * queda justo debajo de la lista. Abrir un rollo va AL FINAL y más callado: es lo
 * que se hace cuando ninguno de los abiertos alcanza, no antes.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben ver lo abierto, abrir una pieza, cortar y marcar retazo. Queda fuera el
 * remate del retazo en venta, que pasa en la pantalla de cobro.
 */

/**
 * TRES rutas, y antes eran dos mal repartidas.
 *
 * · PREGUNTAR qué piezas hay → `piezas-abiertas`, que es una lectura. Antes se
 *   preguntaba en `pieza-abierta` —el comando de ABRIR— y contestaba 400: la
 *   pantalla decía «No hay ninguna abierta» con los rollos abiertos en la base.
 * · ABRIR una pieza → `pieza-abierta`, que es eso.
 * · CORTAR → `/api/ferreteria/cortar`, que corta Y ABRE LA NOTA. `inventario.cortar`
 *   exige `ordenLineaId` porque anota el corte contra la línea que se cobra, y esta
 *   pantalla no tiene una: el corte del mostrador crea la nota, y su folio es el
 *   número que el cliente canta en la caja.
 */
const RUTA_PREGUNTAR_PIEZAS = '/api/inventario/piezas-abiertas';
const RUTA_ABRIR_PIEZA = '/api/inventario/pieza-abierta';
const RUTA_CORTAR = '/api/ferreteria/cortar';

/**
 * LA UNIDAD BASE de un material continuo: su unidad de venta en DIEZMILÉSIMAS —37.5 m
 * son 375 000—. Es la de `packages/app/src/ferreteria/corte.ts`, la de
 * `piezas_abiertas.medida_restante_base` y la que la vista `piezas_de_material`
 * divide entre 10 000. Aquí decía micrómetros: un rollo de 100 m se abría como uno de
 * 10 000, y uno de 12 m que ya estaba en la base se leía aquí de 0.12.
 */
const DIEZMILESIMAS = 10_000;

/** «30», «0,20», «12.5», «.5»: hasta cuatro decimales, que es lo que cabe en la base. */
const MEDIDA_TECLEADA = /^(\d{0,9})(?:[.,](\d{0,4}))?$/;

const MERMA_PROPUESTA = '0.10';

const TITULO = 'text-sm font-semibold tracking-wide text-texto-sutil uppercase';
const NOTA = 'text-xs text-texto-sutil';
/**
 * Los campos numéricos crecen en el teléfono: se teclean de pie, junto al rack, y
 * con una mano. En la PC vuelven a un tamaño de formulario.
 */
const CAMPO_NUMERICO =
  'h-[calc(var(--altura-control)*1.4)] text-right font-numeros text-2xl tabular-nums md:text-lg';

export interface PiezaViva {
  readonly piezaId: string;
  readonly folio: string;
  readonly medidaRestanteBase: string;
  readonly estado: string;
  readonly precioRemateCentavos: string | null;
  readonly diasAbierta: number;
  readonly alcanza: boolean;
}

export interface MaterialProps {
  readonly productoId: string;
  /**
   * YA NO SE USA, y se queda declarado para que nadie lo vuelva a pasar.
   *
   * El almacén es ámbito: lo resuelve el servidor. Cuando esta pantalla lo exigía,
   * `page.tsx` la montaba con la cadena vacía.
   */
  readonly almacenId?: never;
  readonly piezasIniciales?: readonly PiezaViva[];
}

/** Dónde pasó algo: el aviso va junto a lo que lo provocó, no arriba de todo. */
type Seccion = 'buscar' | 'cortar' | 'abrir';

interface Mensaje {
  readonly donde: Seccion;
  readonly texto: string;
}

/** Lo que salió bien. El folio va aparte porque se pinta grande. */
interface Hecho extends Mensaje {
  readonly detalle: string;
  readonly folio?: string;
}

/** Metros con dos decimales: es como se dice en el mostrador. */
export function enMetros(base: string): string {
  return (Number(base) / DIEZMILESIMAS).toFixed(2);
}

/** Lo tecleado, partido en enteros y decimales. `null` si no es una medida. */
function partesDe(texto: string): { readonly entero: string; readonly fraccion: string } | null {
  const forma = MEDIDA_TECLEADA.exec(texto.trim());
  if (forma === null) return null;
  const entero = forma[1] ?? '';
  const fraccion = forma[2] ?? '';
  if (entero === '' && fraccion === '') return null;
  return { entero: entero === '' ? '0' : entero, fraccion };
}

/**
 * Lo tecleado en la unidad base entera, por TEXTO y no con `Math.round(x * 10 000)`:
 * la coma flotante no entra en una medida. `null` si no es una medida positiva.
 */
export function aBase(metros: string): string | null {
  const partes = partesDe(metros);
  if (partes === null) return null;
  const base = `${partes.entero}${partes.fraccion.padEnd(4, '0')}`.replace(/^0+(?=\d)/, '');
  return base === '0' ? null : base;
}

/**
 * Lo tecleado en metros con punto —«0,20» es «0.20»—, que es lo que lee
 * `/api/ferreteria/cortar`: habla en metros como la persona que teclea y los pasa a
 * la base con `cantidad()`. `null` si no es una medida positiva.
 */
function aMetros(texto: string): string | null {
  const partes = partesDe(texto);
  if (partes === null || aBase(texto) === null) return null;
  return partes.fraccion === '' ? partes.entero : `${partes.entero}.${partes.fraccion}`;
}

/** La unidad base, como número de metros para `Cifra`. */
function metrosDe(base: string | number): number {
  return Number(base) / DIEZMILESIMAS;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo. Vuelve a intentarlo.';
}

/**
 * Por qué una fila se ve distinta, EN TEXTO: el tono de la fila nunca va solo.
 */
function EstadoDePieza({
  pieza,
  esLaRecomendada,
}: {
  readonly pieza: PiezaViva;
  readonly esLaRecomendada: boolean;
}): ReactElement | null {
  const esRetazo = pieza.estado === 'retazo';
  if (!esLaRecomendada && !esRetazo && pieza.alcanza) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-(--espacio-2) text-xs">
      {esLaRecomendada && (
        <span className="inline-flex items-center gap-(--espacio-1) font-semibold text-texto">
          <Check aria-hidden="true" className="size-4 shrink-0 text-exito" />
          corta de ésta
        </span>
      )}
      {esRetazo && <span className="text-texto-sutil">retazo</span>}
      {!pieza.alcanza && <span className="text-texto-sutil">no alcanza</span>}
    </span>
  );
}

/** Las columnas de la lista de rollos. Lo que queda es la cifra que manda. */
function columnasDePiezas({
  recomendada,
  elegida,
  elegir,
}: {
  readonly recomendada: string | null;
  readonly elegida: string;
  readonly elegir: (piezaId: string) => void;
}): readonly ColumnaDeTabla<PiezaViva>[] {
  return [
    {
      clave: 'rotulo',
      titulo: 'Rótulo',
      orden: (p) => p.folio,
      celda: (p) => (
        <span className="flex flex-col gap-(--espacio-1)">
          {/* Como está escrito con plumón en la cinta: es lo que se busca en el rack. */}
          <span className="font-numeros text-base font-bold">{p.folio}</span>
          <EstadoDePieza pieza={p} esLaRecomendada={recomendada === p.piezaId} />
          {/* En el teléfono no cabe la columna «Abierta» y el dato va aquí: se corta
              junto al rack, y los días dicen qué rollo conviene acabarse. */}
          <span className="text-xs text-texto-sutil sm:hidden">
            <Cifra valor={p.diasAbierta} unidad="d" tamano="xs" /> abierta
          </span>
        </span>
      ),
    },
    {
      clave: 'queda',
      titulo: 'Queda',
      numerica: true,
      orden: (p) => Number(p.medidaRestanteBase),
      celda: (p) => (
        <Cifra
          valor={metrosDe(p.medidaRestanteBase)}
          decimales={2}
          unidad="m"
          className="font-semibold"
        />
      ),
    },
    {
      clave: 'abierta',
      titulo: 'Abierta',
      numerica: true,
      desde: 'sm',
      orden: (p) => p.diasAbierta,
      celda: (p) => <Cifra valor={p.diasAbierta} unidad="d" tamano="sm" />,
    },
    {
      clave: 'cortar',
      titulo: 'Cortar',
      celda: (p) => (
        <span className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant={recomendada === p.piezaId ? 'default' : 'outline'}
            aria-pressed={elegida === p.piezaId}
            onClick={() => {
              elegir(p.piezaId);
            }}
          >
            <Scissors aria-hidden="true" />
            Cortar
          </Button>
        </span>
      ),
    },
  ];
}

/** Lo que el vacío lee de `MaterialContinuo` para ofrecer cada material. */
interface MaterialQueSeCorta {
  readonly id: string;
  readonly nombre: string;
  readonly unidad: string;
}

/**
 * EL VACÍO, CON SALIDA: los materiales que se venden por medida, cada uno un enlace
 * a su ficha (`?producto=`). Decía «se llega desde el mostrador: toca su renglón», y
 * ningún renglón enlaza aquí: la entrada «Materiales» del menú era una pared.
 */
function ElegirMaterial(): ReactElement {
  const voc = useVocabulario();
  const [materiales, setMateriales] = useState<readonly MaterialQueSeCorta[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    consultarPuente<MaterialQueSeCorta>('MaterialContinuo', { limite: 60, signal: control.signal })
      .then((leidos) => {
        if (sigueMontada()) setMateriales(leidos);
      })
      .catch((error: unknown) => {
        if (sigueMontada()) setFallo(mensajeDe(error));
      });
    return () => {
      control.abort();
    };
  }, [vuelta]);

  function volverALeer(): void {
    setFallo(null);
    setVuelta((previa) => previa + 1);
  }

  let eleccion: ReactElement;
  if (fallo !== null) {
    eleccion = (
      <Aviso
        tono="peligro"
        titulo={`No se pudo leer qué ${voc.plural('producto')} se venden por medida.`}
        accion={
          <Button type="button" variant="outline" size="sm" onClick={volverALeer}>
            Volver a leer
          </Button>
        }
      >
        {fallo}
      </Aviso>
    );
  } else if (materiales === null) {
    eleccion = <EsqueletoDeLista filas={3} />;
  } else if (materiales.length === 0) {
    eleccion = (
      <p className="text-sm text-texto-sutil">
        {`${voc.conDeterminante('ningun', 'producto')} está marcado todavía como pieza continua.`}
      </p>
    );
  } else {
    eleccion = (
      <ul
        aria-label={`${voc.titulo('producto', true)} que se venden por medida`}
        className="flex flex-col gap-(--espacio-2) text-left"
      >
        {materiales.map((m) => (
          <li key={m.id}>
            <Superficie
              como="a"
              href={`/ferreteria/material?producto=${encodeURIComponent(m.id)}`}
              interactiva
              relleno={3}
              radio="md"
              className="flex min-h-(--area-tactil-minima) items-center justify-between gap-(--espacio-3)"
            >
              <span className="font-medium">{m.nombre}</span>
              <span className="text-sm text-texto-sutil">por {m.unidad}</span>
            </Superficie>
          </li>
        ))}
      </ul>
    );
  }

  // Con el sustantivo del giro: una ferretería lee «material» y una tiendita
  // «producto». Tecleado, el diccionario dejaría de mandar justo en el estado que
  // más se ve.
  return (
    <Vacio
      icono={<Scissors />}
      titulo={`Aquí se abre ${voc.enFraseCon('un', 'producto')} que se corta`}
      explicacion="Los rollos abiertos con su etiqueta, lo que queda en cada uno y de cuál conviene cortar. Elige de lo que se vende por medida:"
    >
      <div className="mt-(--espacio-2) self-stretch">{eleccion}</div>
    </Vacio>
  );
}

export function Material({ productoId, piezasIniciales }: MaterialProps) {
  const voc = useVocabulario();
  const [piezas, setPiezas] = useState<readonly PiezaViva[] | null>(piezasIniciales ?? null);
  const [recomendada, setRecomendada] = useState<string | null>(null);
  const [necesita, setNecesita] = useState('');
  const [nueva, setNueva] = useState({ folio: '', metros: '' });
  const [corte, setCorte] = useState({ piezaId: '', metros: '', merma: MERMA_PROPUESTA });
  const [error, setError] = useState<Mensaje | null>(null);
  const [hecho, setHecho] = useState<Hecho | null>(null);
  const [ocupado, setOcupado] = useState<Seccion | null>(null);
  /** La lectura de las piezas falló. Sin piezas leídas es la pantalla; con ellas, un aviso. */
  const [falloDeLectura, setFalloDeLectura] = useState<string | null>(null);

  function consultar(necesitaBase: string | null): void {
    invocarComando<{ readonly piezas: readonly PiezaViva[]; readonly recomendada: string | null }>(
      RUTA_PREGUNTAR_PIEZAS,
      { productoId, necesitaBase },
    )
      .then((salida) => {
        setFalloDeLectura(null);
        setPiezas(salida.piezas);
        setRecomendada(salida.recomendada);
      })
      .catch((fallo: unknown) => {
        // NUNCA una lista vacía: «no hay ninguna abierta» con los rollos en el rack
        // es justo el defecto que esta pantalla ya tuvo.
        setFalloDeLectura(mensajeDe(fallo));
      });
  }

  useEffect(() => {
    if (piezasIniciales !== undefined) return;
    // Sin id no se consulta.
    //
    // Esta pantalla se abre SIN nada seleccionado —`page.tsx` la monta con la
    // cadena vacía— y consultar con ella manda un `where … = ''` a una columna
    // uuid: Postgres contesta 22P02 y la pantalla se lleva un 500 en cada
    // apertura. El estado de «elige algo» ya está escrito debajo.
    if (productoId === '') return;
    const arranque = setTimeout(() => {
      consultar(null);
    });
    return () => {
      clearTimeout(arranque);
    };
    // `consultar` cierra sobre `productoId`, que es lo único que la cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId, piezasIniciales]);

  /** Volver a leer: el estado se limpia EN EL CLIC, no en el efecto. */
  function volverALeer(): void {
    setFalloDeLectura(null);
    consultar(null);
  }

  function buscar(): void {
    const base = aBase(necesita);
    if (base === null) {
      setError({ donde: 'buscar', texto: 'Pon cuántos metros hacen falta.' });
      return;
    }
    setError(null);
    consultar(base);
  }

  function elegir(piezaId: string): void {
    setCorte((actual) => ({ ...actual, piezaId }));
    // En el teléfono el corte queda debajo de la lista: el foco lo trae a la vista
    // y deja el teclado listo para los metros.
    document.getElementById('corte-metros')?.focus();
  }

  function abrirPieza(): void {
    // Un doble toque llega antes que el re-pintado que deshabilita el botón.
    if (ocupado !== null) return;
    const base = aBase(nueva.metros);
    if (base === null) {
      setError({ donde: 'abrir', texto: 'Pon cuánto trae el rollo.' });
      return;
    }
    if (nueva.folio.trim() === '') {
      setError({ donde: 'abrir', texto: 'El rollo lleva rótulo: es como se vuelve a encontrar.' });
      return;
    }
    setOcupado('abrir');
    setError(null);
    setHecho(null);
    invocarComando(RUTA_ABRIR_PIEZA, {
      productoId,
      // El almacén NO se manda: sale de la sesión del servidor (R16). El esquema lo
      // exigía y por eso esto contestaba 400 en cada apertura; ahora es opcional y el
      // comando resuelve el principal de la sucursal.
      medidaBase: base,
      folio: nueva.folio.trim(),
      ubicacionId: null,
    })
      .then(() => {
        setNueva({ folio: '', metros: '' });
        setHecho({
          donde: 'abrir',
          texto: 'Pieza abierta.',
          detalle: 'No se movió existencia: el rollo ya estaba contado.',
        });
        consultar(null);
      })
      .catch((fallo: unknown) => {
        setError({ donde: 'abrir', texto: mensajeDe(fallo) });
      })
      .finally(() => {
        setOcupado(null);
      });
  }

  function cortar(): void {
    // Cortar es irreversible y abre una nota: un doble toque no puede hacer dos.
    if (ocupado !== null) return;
    // EN METROS, como se teclean, no en la unidad base: la ruta los pasa por
    // `cantidad()`. Mandaba la base y 30 m salían como «30000000» —treinta millones
    // de metros— en la partida de la nota y en el descuento del rollo.
    const entregada = aMetros(corte.metros);
    const merma = aMetros(corte.merma) ?? '0';
    if (corte.piezaId === '' || entregada === null) {
      setError({ donde: 'cortar', texto: 'Elige de qué pieza y cuántos metros.' });
      return;
    }
    setOcupado('cortar');
    setError(null);
    setHecho(null);
    invocarComando<{ readonly folio: string }>(RUTA_CORTAR, {
      materialId: productoId,
      piezaId: corte.piezaId,
      medida: entregada,
      desperdicio: merma,
    })
      .then((salida) => {
        setCorte({ piezaId: '', metros: '', merma: MERMA_PROPUESTA });
        // El folio se DICE: el corte abrió una nota y ese número es lo que el cliente
        // canta en la caja. «Cortado.» a secas dejaba al mostradorista sin nada que
        // decirle.
        setHecho({
          donde: 'cortar',
          texto: `Cortado. ${voc.titulo('orden')} ${salida.folio}: se cobra en caja.`,
          detalle: 'Es lo que el cliente dice al pagar.',
          folio: salida.folio,
        });
        consultar(null);
      })
      .catch((fallo: unknown) => {
        setError({ donde: 'cortar', texto: mensajeDe(fallo) });
      })
      .finally(() => {
        setOcupado(null);
      });
  }

  /** Lo que NO pasó cuando algo falla: es lo que el mostradorista necesita saber. */
  function avisoDeError(donde: Seccion): ReactElement | null {
    if (error?.donde !== donde) return null;
    const noPaso: Readonly<Record<Seccion, string | null>> = {
      buscar: null,
      cortar: `El rollo no se descontó y no se abrió ${voc.enFraseCon('ningun', 'orden')}.`,
      abrir: 'No se abrió ninguna pieza.',
    };
    return (
      <Aviso tono="peligro" titulo={error.texto}>
        {noPaso[donde]}
      </Aviso>
    );
  }

  function avisoDeHecho(donde: Seccion): ReactElement | null {
    if (hecho?.donde !== donde) return null;
    return (
      <Aviso tono="exito" titulo={hecho.texto}>
        {/* El número, grande: es lo único que el cliente se lleva del pasillo. */}
        {hecho.folio === undefined ? null : (
          <span className="block font-numeros text-3xl font-bold text-texto">{hecho.folio}</span>
        )}
        {hecho.detalle}
      </Aviso>
    );
  }

  // El VACÍO QUE ENSEÑA: esta pantalla es la ficha de UN material continuo.
  //
  // `page.tsx` la monta con el `?producto=` de la dirección, y la entrada del menú
  // llega sin él. El efecto, con razón, no consulta con un id vacío.
  if (productoId === '' && piezasIniciales === undefined) {
    return (
      <main className="mx-auto w-full max-w-prose p-(--espacio-3) md:p-(--espacio-8)">
        <h1 className="sr-only">{voc.titulo('producto')}</h1>
        <ElegirMaterial />
      </main>
    );
  }

  // NO LEYÓ NADA: sin la lista no se sabe de cuál rollo cortar, y fingir que no hay
  // ninguno abierto mandaría a abrir otro.
  if (piezas === null && falloDeLectura !== null) {
    return (
      <main className="mx-auto w-full max-w-3xl p-(--espacio-3) md:p-(--espacio-6)">
        <h1 className="sr-only">{voc.titulo('producto')}</h1>
        <ErrorDePantalla
          titulo="No se pudieron leer las piezas abiertas"
          queHacer="Sin la lista no se sabe de cuál rollo conviene cortar. Revisa la conexión y vuelve a leerla."
          detalle={falloDeLectura}
          reintentar={
            <Button type="button" onClick={volverALeer}>
              Volver a leer
            </Button>
          }
        />
      </main>
    );
  }

  // La forma de lo que viene: el título, la pregunta y la lista de rollos.
  if (piezas === null) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-(--espacio-4) p-(--espacio-3) md:p-(--espacio-6)">
        <h1 className="sr-only">{voc.titulo('producto')}</h1>
        <Esqueleto className="h-[calc(var(--altura-control)*0.9)] w-48" />
        <Esqueleto className="h-[calc(var(--altura-control)*1.4)] w-full max-w-md" />
        <EsqueletoDeLista filas={4} />
      </main>
    );
  }

  const piezaDelCorte = piezas.find((p) => p.piezaId === corte.piezaId);
  const laRecomendada = piezas.find((p) => p.piezaId === recomendada);
  const entregadaBase = aBase(corte.metros);
  // Lo que sale del rollo es lo entregado MÁS la merma, en la unidad base entera.
  const descuentoBase =
    entregadaBase === null ? null : Number(entregadaBase) + Number(aBase(corte.merma) ?? '0');
  const quedaBase =
    piezaDelCorte === undefined || descuentoBase === null
      ? null
      : Number(piezaDelCorte.medidaRestanteBase) - descuentoBase;
  const abiertosBase = piezas.reduce((suma, p) => suma + Number(p.medidaRestanteBase), 0);
  const columnas = columnasDePiezas({ recomendada, elegida: corte.piezaId, elegir });

  // EL ORDEN DEL DOCUMENTO ES EL DE LA LECTURA: la pregunta y la lista, el corte y,
  // al final, abrir un rollo. En la PC la rejilla pone el corte a la derecha y abrir
  // debajo de la lista; el teléfono no reordena nada, así que el Tab y el lector de
  // pantalla recorren lo mismo que se ve. La tercera fila es `1fr` para que el corte,
  // que abarca las dos, no estire la de la lista.
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-(--espacio-4) p-(--espacio-3) md:p-(--espacio-6) lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-x-(--espacio-6)">
      <header className="flex flex-col gap-(--espacio-1) lg:col-span-2">
        <h1 className="text-xl font-bold md:text-2xl">{voc.titulo('producto')}</h1>
        <p className="text-sm text-texto-sutil">
          Lo que hay abierto. El trabajo es acabarse los abiertos, no abrir otro.
        </p>
      </header>

      <div className="flex flex-col gap-(--espacio-4) lg:col-start-1 lg:row-start-2">
        {/* PRIMERO · la pregunta. Enter la hace, como en cualquier campo. */}
        <Superficie
          como="form"
          aria-label="¿De cuál corto?"
          relleno={4}
          radio="md"
          className="flex flex-col gap-(--espacio-3)"
          onSubmit={(evento) => {
            evento.preventDefault();
            buscar();
          }}
        >
          <div className="flex flex-wrap items-end gap-(--espacio-3)">
            <div className="flex flex-col gap-(--espacio-1)">
              <Label htmlFor="necesita">Hacen falta (m)</Label>
              <Input
                id="necesita"
                inputMode="decimal"
                className={`w-40 ${CAMPO_NUMERICO}`}
                value={necesita}
                onChange={(evento) => {
                  setNecesita(evento.target.value);
                }}
              />
            </div>
            <Button type="submit" className="h-[calc(var(--altura-control)*1.4)]">
              ¿De cuál corto?
            </Button>
          </div>
          {/* La respuesta, en una línea y en grande: el rótulo es lo que se busca
              en el rack. La lista lo marca también, con su porqué. */}
          {laRecomendada !== undefined && (
            <p className="flex flex-wrap items-baseline gap-x-(--espacio-2) text-base">
              <span>Corta de</span>
              <span className="font-numeros text-xl font-bold">{laRecomendada.folio}</span>
              <span className="text-texto-sutil">· quedan</span>
              <Cifra valor={metrosDe(laRecomendada.medidaRestanteBase)} decimales={2} unidad="m" />
            </p>
          )}
          {avisoDeError('buscar')}
        </Superficie>

        <section aria-labelledby="t-piezas" className="flex flex-col gap-(--espacio-2)">
          <h2 id="t-piezas" className={TITULO}>
            Piezas abiertas
          </h2>
          {/* Se leyó antes y la relectura falló: lo de la lista es de ANTES, y eso
              se dice en vez de vaciarla. */}
          {falloDeLectura !== null && (
            <Aviso
              tono="peligro"
              titulo="No se pudieron volver a leer las piezas."
              accion={
                <Button type="button" variant="outline" size="sm" onClick={volverALeer}>
                  Volver a leer
                </Button>
              }
            >
              Lo que queda en cada rollo puede ser de antes del último movimiento. {falloDeLectura}
            </Aviso>
          )}
          <Tabla
            etiqueta="Piezas abiertas"
            columnas={columnas}
            filas={piezas}
            claveDe={(p) => p.piezaId}
            activa={corte.piezaId}
            // El tono nunca va solo: la celda del rótulo dice por qué.
            tonoDeFila={(p) => {
              if (p.piezaId === recomendada) return 'exito';
              return p.alcanza ? undefined : 'tenue';
            }}
            vacio={
              <Superficie radio="md" relleno={0} nivel={0}>
                <Vacio
                  titulo="No hay ninguna abierta."
                  explicacion="Cuando se abra un rollo, aquí aparece con su rótulo y lo que le queda."
                  className="py-(--espacio-6)"
                />
              </Superficie>
            }
          />
        </section>
      </div>

      {/* LA ACCIÓN PRINCIPAL · a la derecha y fija en la PC, a lo alto de las dos
          filas; en el teléfono, justo debajo de la lista de la que se elige. */}
      <Superficie
        como="section"
        aria-labelledby="t-cortar"
        nivel={2}
        relleno={4}
        radio="md"
        className="flex flex-col gap-(--espacio-4) lg:sticky lg:top-(--espacio-3) lg:col-start-2 lg:row-span-2 lg:row-start-2"
      >
        <h2 id="t-cortar" className="flex items-center gap-(--espacio-2) text-lg font-semibold">
          <Scissors aria-hidden="true" className="size-5 shrink-0 text-texto-sutil" />
          Cortar
        </h2>
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="corte-pieza">Pieza</Label>
          <Input
            id="corte-pieza"
            className="h-[calc(var(--altura-control)*1.2)] font-numeros text-lg font-bold"
            placeholder="elígela arriba"
            readOnly
            value={piezaDelCorte?.folio ?? ''}
          />
        </div>
        <div className="grid grid-cols-2 gap-(--espacio-3)">
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="corte-metros">Metros</Label>
            <Input
              id="corte-metros"
              inputMode="decimal"
              className={CAMPO_NUMERICO}
              value={corte.metros}
              onChange={(evento) => {
                setCorte({ ...corte, metros: evento.target.value });
              }}
            />
          </div>
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="corte-merma">Merma (m)</Label>
            <Input
              id="corte-merma"
              inputMode="decimal"
              className={CAMPO_NUMERICO}
              value={corte.merma}
              onChange={(evento) => {
                setCorte({ ...corte, merma: evento.target.value });
              }}
            />
          </div>
          <p className={`col-span-2 ${NOTA}`}>
            La merma viene puesta: el cero es mentira, cortar cable deja puntas.
          </p>
        </div>

        {/* Lo que va a pasar con el rollo, ANTES de cortar: cuánto sale y cuánto
            queda para rotular. */}
        {descuentoBase !== null && (
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-(--espacio-3) gap-y-(--espacio-2) border-t border-borde pt-(--espacio-3)">
            <dt className="text-sm text-texto-sutil">Se descuenta del rollo</dt>
            <dd className="text-right">
              <Cifra valor={metrosDe(descuentoBase)} decimales={2} unidad="m" tamano="sm" />
            </dd>
            {piezaDelCorte !== undefined && quedaBase !== null && (
              <>
                <dt className="font-semibold">Queda en {piezaDelCorte.folio}</dt>
                <dd className="flex flex-wrap items-baseline justify-end gap-x-(--espacio-2) text-right">
                  <Cifra
                    valor={metrosDe(quedaBase)}
                    decimales={2}
                    unidad="m"
                    tamano="lg"
                    className={`font-bold ${quedaBase < 0 ? 'text-peligro' : ''}`}
                  />
                  {quedaBase < 0 && (
                    <span className="inline-flex items-center gap-(--espacio-1) text-sm font-medium">
                      <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-peligro" />
                      no alcanza
                    </span>
                  )}
                </dd>
              </>
            )}
          </dl>
        )}

        {avisoDeError('cortar')}
        {avisoDeHecho('cortar')}

        <Button
          type="button"
          size="lg"
          className="w-full text-base"
          disabled={ocupado !== null}
          cargando={ocupado === 'cortar'}
          onClick={cortar}
        >
          {ocupado === 'cortar' ? null : <Scissors aria-hidden="true" />}
          Registrar el corte
        </Button>
      </Superficie>

      {/* AL FINAL, y más callado, también en el documento: se abre otro cuando
          ninguno de los abiertos alcanza, no antes. En la PC, debajo de la lista. */}
      <Superficie
        como="section"
        aria-labelledby="t-abrir"
        nivel={0}
        relleno={4}
        radio="md"
        className="flex flex-col gap-(--espacio-3) lg:col-start-1 lg:row-start-3"
      >
        <h2 id="t-abrir" className={TITULO}>
          Abrir un rollo
        </h2>
        {/* UNA línea, antes de abrir: evita el retazo antes de crearlo. */}
        {abiertosBase > 0 && (
          <p className="flex items-start gap-(--espacio-2) text-sm font-medium">
            <TriangleAlert
              aria-hidden="true"
              className="mt-(--espacio-1) size-4 shrink-0 text-advertencia"
            />
            <span>
              Hay <Cifra valor={metrosDe(abiertosBase)} decimales={2} unidad="m" tamano="sm" />{' '}
              abiertos. Si abres uno nuevo, esos se quedan.
            </span>
          </p>
        )}
        <div className="grid gap-(--espacio-3) md:grid-cols-2">
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="nueva-folio">Rótulo</Label>
            <Input
              id="nueva-folio"
              className="h-[calc(var(--altura-control)*1.2)] font-numeros"
              placeholder="R-115"
              value={nueva.folio}
              onChange={(evento) => {
                setNueva({ ...nueva, folio: evento.target.value });
              }}
            />
            <p className={NOTA}>Corto, porque se escribe con plumón en la cinta.</p>
          </div>
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="nueva-metros">Trae (m)</Label>
            <Input
              id="nueva-metros"
              inputMode="decimal"
              className="h-[calc(var(--altura-control)*1.2)] text-right font-numeros tabular-nums"
              value={nueva.metros}
              onChange={(evento) => {
                setNueva({ ...nueva, metros: evento.target.value });
              }}
            />
          </div>
        </div>
        {avisoDeError('abrir')}
        {avisoDeHecho('abrir')}
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={ocupado !== null}
          cargando={ocupado === 'abrir'}
          onClick={abrirPieza}
        >
          Abrir
        </Button>
      </Superficie>
    </main>
  );
}
