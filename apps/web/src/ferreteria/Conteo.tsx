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
  VIAJE,
  Vacio,
  conTransicion,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { ArrowLeft, ClipboardList, Scale } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · conteo
 *
 * Contar seis mil tornillos sin contarlos: la báscula, y lo que eso significa.
 *
 * ── Por qué el resultado NUNCA se presenta como exacto ──────────────────
 * Nadie cuenta seis mil tornillos: se pesa la caja y se divide. Ese número es
 * una ESTIMACIÓN, y presentarlo como conteo lo mete al kardex como si alguien
 * hubiera contado pieza por pieza. A partir de ahí nadie puede distinguir un
 * faltante real de la tolerancia de la balanza, que es exactamente el dato que
 * el conteo existía para dar.
 *
 * ── Por qué se enseña el RANGO y no sólo el número ──────────────────────
 * «Unas 6,000, entre 5,550 y 6,520» permite decidir; «6,000» obliga a creerse
 * una precisión que la báscula no tiene. Cuando el rango es tan ancho que no
 * sirve para decidir, la pantalla lo dice y no lo esconde: el número grande
 * desaparece y lo grande pasa a ser el rango.
 *
 * ── Por qué la tara es un campo y no una suposición ─────────────────────
 * La cubeta pesa. Pesar el material con el recipiente y no restarlo suma dos
 * kilos de plástico al conteo de tornillería, y esos dos kilos son cuatrocientas
 * piezas que no existen. Por eso el neto se ve EN VIVO debajo de los dos campos
 * (`04-INTERFAZ` §PANTALLA 9: bruto, tara, neto): lo que se va a dividir se lee
 * antes de mandarlo.
 *
 * ── Por qué sin calibrar no se puede contar ─────────────────────────────
 * Sin el peso de una pieza, dividir es inventarse el número. El mensaje dice
 * qué falta: «no se puede» manda a alguien a buscar por qué.
 *
 * ── Por qué manda el TELÉFONO ───────────────────────────────────────────
 * Se cuenta de pie frente al rack, con las manos sucias de grasa y polvo de
 * cemento (`04-INTERFAZ` §PANTALLA 9). En el teléfono la lista y la clave elegida
 * no caben a la vez: se ve una o la otra, y cada objetivo mide 56 px, no 44. En la
 * PC del mostrador caben las dos, lado a lado.
 *
 * ── La fila se convierte en panel ───────────────────────────────────────
 * Al tocar una clave su fila VIAJA hasta el panel (`VIAJE.fila`), y «Volver a la
 * lista» la devuelve a su sitio. No es adorno: en el teléfono la lista desaparece
 * al elegir, y sin el viaje quien cuenta no sabe si tocó la clave que quería o la
 * de al lado. Dura cero en `movimiento: nula` o con la preferencia del sistema.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben calibrar, contar por peso y capturar a mano lo que no se pesa. Queda
 * fuera el cierre de la toma con su ajuste, que es del tronco. Y el encabezado no
 * dice todavía POR QUÉ toca esta zona —su valor sin contar y los días desde el
 * último conteo—: la lectura no los trae, y no se inventan.
 */

const RUTA_CALIBRAR = '/api/catalogo/calibrar-peso';
const RUTA_CONTAR = '/api/inventario/conteo/peso';

const PESO_CON_FORMA = /^\d{1,7}(?:[.,]\d{1,3})?$/;

/** Gramos a miligramos: todo el peso vive en la unidad entera. */
const MG_POR_GRAMO = 1_000;

// 3.5rem es el objetivo táctil de 56 px de `04-INTERFAZ` §PANTALLA 9, y va LITERAL
// a propósito: la mano con grasa es la misma en cualquier densidad.
const TACTIL = 'min-h-[3.5rem]';
const MARCO =
  'mx-auto flex w-full max-w-5xl flex-col gap-(--espacio-4) p-(--espacio-4) md:p-(--espacio-6)';
const REJILLA =
  'grid gap-(--espacio-4) md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:items-start lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]';
// El `md:` repetido no es un descuido: `Input` baja el texto a `md:text-sm`, y sin
// su propio `md:` lo que marca la báscula se encogía justo en la PC.
const CAMPO = `${TACTIL} h-[calc(var(--altura-control)*1.4)] text-right font-numeros text-2xl font-semibold tabular-nums md:text-2xl`;
const PRINCIPAL = `${TACTIL} w-full text-base font-semibold`;

export interface ClaveContable {
  readonly id: string;
  readonly nombre: string;
  /** `conversion: 'entero'` en el puente: NÚMERO de miligramos. */
  readonly peso_por_pieza_mg: number | null;
  /** `conversion: 'decimal'`: NÚMERO de por ciento. */
  readonly tolerancia_peso_pct: number;
}

export interface Estimacion {
  readonly piezasEstimadas: number;
  readonly minimo: number;
  readonly maximo: number;
  readonly confiable: boolean;
}

export interface ConteoProps {
  readonly tomaId: string;
  readonly clavesIniciales?: readonly ClaveContable[];
}

/** Lo que salió mal y lo que NO pasó por eso: sin lo segundo, quien pesa no sabe si repetir. */
interface Problema {
  readonly tono: 'atencion' | 'peligro';
  readonly que: string;
  readonly queNo: string;
  /** El `id` del campo que lo provocó, para marcarlo y apuntarle al aviso. */
  readonly campo?: string;
}

/** El aviso del problema: el campo que lo provocó le apunta con `aria-describedby`. */
const ID_DEL_PROBLEMA = 'conteo-problema';

/** Quién lleva el nombre de viaje: la fila antes del cambio, el panel después. */
interface Viaje {
  readonly id: string;
  readonly en: 'fila' | 'panel';
}

export function aMiligramos(gramos: string): number | null {
  const limpio = gramos.trim().replace(',', '.');
  if (limpio === '' || !PESO_CON_FORMA.test(limpio)) return null;
  return Math.round(Number(limpio) * MG_POR_GRAMO);
}

/**
 * La tara vacía es CERO —no se usó cubeta—; la mal escrita no es cero, es un error.
 * Mandarla como cero dividía el bruto en silencio justo cuando lo mandado ya no era
 * lo tecleado.
 */
function taraEnMiligramos(gramos: string): number | null {
  return gramos.trim() === '' ? 0 : aMiligramos(gramos);
}

/** El rango, dicho como se dice en el mostrador. */
export function leerEstimacion(estimacion: Estimacion): string {
  if (estimacion.confiable) {
    return `Unas ${String(estimacion.piezasEstimadas)} piezas`;
  }
  return `Entre ${String(estimacion.minimo)} y ${String(estimacion.maximo)}: la báscula no da para más`;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo. Vuelve a intentarlo.';
}

/** Los decimales que un peso de verdad trae: 24,740 g y no 24,740.000 g. */
function decimalesDeGramos(mg: number): number {
  if (mg % MG_POR_GRAMO === 0) return 0;
  if (mg % 100 === 0) return 1;
  if (mg % 10 === 0) return 2;
  return 3;
}

/** Los decimales con que se tecleó la tolerancia: 8 % se lee 8 %, y 2.5 % no se redondea. */
function decimalesDe(valor: number): number {
  return Math.min(3, (String(valor).split('.')[1] ?? '').length);
}

/** La lista de claves. Cada columna se gana su lugar en un teléfono de pie frente al rack. */
function columnasDeClaves(titulo: string): readonly ColumnaDeTabla<ClaveContable>[] {
  return [
    {
      clave: 'material',
      titulo,
      orden: (c) => c.nombre,
      // La fila ES el objetivo que se toca: 56 px en teléfono y tableta, como los
      // botones del panel. Y el nombre sin peso propio, para que la elegida se lea en
      // seminegritas —la marca de `Tabla` que no es color— y no se quede igual.
      celda: (c) => <span className={`${TACTIL} flex items-center xl:min-h-0`}>{c.nombre}</span>,
    },
    {
      clave: 'bascula',
      titulo: 'Báscula',
      // La palabra, no sólo el color: «sin calibrar» es lo que hay que hacer primero.
      celda: (c) =>
        c.peso_por_pieza_mg === null ? (
          <span className="font-semibold">sin calibrar</span>
        ) : (
          <span className="inline-flex items-center gap-(--espacio-1) text-texto-sutil">
            <Scale aria-hidden="true" className="size-4 shrink-0" />
            se pesa
          </span>
        ),
    },
    {
      clave: 'pieza',
      titulo: 'Una pieza',
      numerica: true,
      desde: 'lg',
      orden: (c) => c.peso_por_pieza_mg ?? -1,
      celda: (c) =>
        c.peso_por_pieza_mg === null ? (
          '—'
        ) : (
          <Cifra valor={c.peso_por_pieza_mg} unidad="mg" tamano="sm" />
        ),
    },
  ];
}

function Encabezado({ children }: { readonly children?: ReactNode }): ReactElement {
  return (
    <header className="flex flex-col gap-(--espacio-1)">
      <h1 className="text-2xl font-semibold">Conteo</h1>
      {children === undefined ? null : <p className="text-sm text-texto-sutil">{children}</p>}
    </header>
  );
}

function CampoDePeso({
  id,
  etiqueta,
  valor,
  modo,
  ayuda,
  invalido = false,
  alCambiar,
}: {
  readonly id: string;
  readonly etiqueta: string;
  readonly valor: string;
  readonly modo: 'decimal' | 'numeric';
  readonly ayuda?: string;
  /** El problema del panel es de ESTE campo: se marca y le apunta al aviso. */
  readonly invalido?: boolean;
  readonly alCambiar: (valor: string) => void;
}): ReactElement {
  const descripcion = [
    ayuda === undefined ? null : `${id}-ayuda`,
    invalido ? ID_DEL_PROBLEMA : null,
  ].filter((parte) => parte !== null);
  return (
    <div className="flex flex-col gap-(--espacio-1)">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input
        id={id}
        inputMode={modo}
        autoComplete="off"
        className={CAMPO}
        value={valor}
        aria-invalid={invalido ? true : undefined}
        aria-describedby={descripcion.length === 0 ? undefined : descripcion.join(' ')}
        onChange={(evento) => {
          alCambiar(evento.target.value);
        }}
      />
      {ayuda === undefined ? null : (
        <p id={`${id}-ayuda`} className="text-xs text-texto-sutil">
          {ayuda}
        </p>
      )}
    </div>
  );
}

/**
 * LO MÁS GRANDE DE LA PANTALLA, y sólo cuando se lo gana. Si el rango es angosto,
 * el número va en `total`; si no, el número desaparece y lo grande es el rango.
 *
 * No es región viva: se pinta DENTRO de la del panel, que ya existía antes de que
 * llegara. Una región que se monta con su texto casi ningún lector la anuncia.
 */
function Resultado({ estimacion }: { readonly estimacion: Estimacion }): ReactElement {
  return (
    <section
      aria-labelledby="conteo-estimacion"
      className="mx-(--espacio-4) mb-(--espacio-4) flex flex-col gap-(--espacio-2) border-t border-borde pt-(--espacio-4)"
    >
      <h3
        id="conteo-estimacion"
        className="text-xs font-medium tracking-wide text-texto-sutil uppercase"
      >
        Estimación por peso
      </h3>
      {estimacion.confiable ? (
        <p className="text-2xl font-semibold">
          Unas <Cifra valor={estimacion.piezasEstimadas} unidad="piezas" tamano="total" />
        </p>
      ) : (
        <p className="text-2xl font-semibold">
          Entre <Cifra valor={estimacion.minimo} tamano="lg" className="text-3xl font-bold" /> y{' '}
          <Cifra valor={estimacion.maximo} tamano="lg" className="text-3xl font-bold" />
          <span className="block text-base font-normal text-texto-sutil">
            la báscula no da para más
          </span>
        </p>
      )}
      <p className="text-sm text-texto-sutil">
        {estimacion.confiable ? (
          <>
            Entre <Cifra valor={estimacion.minimo} tamano="sm" /> y{' '}
            <Cifra valor={estimacion.maximo} tamano="sm" />.{' '}
          </>
        ) : null}
        Es una estimación por peso, no un conteo pieza por pieza, y así queda anotada.
      </p>
      {estimacion.confiable ? null : (
        // Sin rol propio: se anuncia con el resto del resultado, no como otra región.
        <Aviso
          tono="atencion"
          anuncio="ninguno"
          titulo="El rango es demasiado ancho para decidir con él."
        >
          Si importa, hay que contarlo.
        </Aviso>
      )}
    </section>
  );
}

export function Conteo({ tomaId, clavesIniciales }: ConteoProps) {
  const voc = useVocabulario();
  const [claves, setClaves] = useState<readonly ClaveContable[] | null>(clavesIniciales ?? null);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [elegida, setElegida] = useState<ClaveContable | null>(null);
  const [viaje, setViaje] = useState<Viaje | null>(null);
  const [muestra, setMuestra] = useState({ peso: '', piezas: '' });
  const [pesada, setPesada] = useState({ total: '', tara: '' });
  const [estimacion, setEstimacion] = useState<Estimacion | null>(null);
  const [error, setError] = useState<Problema | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const nombreDeLaElegida = useRef<HTMLHeadingElement>(null);
  const columnas = useMemo(() => columnasDeClaves(voc.titulo('producto')), [voc]);

  useEffect(() => {
    if (clavesIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      // Sin id no se consulta.
      //
      // Estas pantallas se abren SIN nada seleccionado -`page.tsx` las monta con
      // la cadena vacia- y consultar con ella manda un `where id = ''` a una
      // columna uuid: Postgres contesta 22P02 y la pantalla se lleva un 500 en
      // cada apertura. El estado de «elige algo» ya esta escrito debajo; lo que
      // faltaba era no pedir datos de lo que nadie eligio.
      if (tomaId === '') return;
      consultarPuente<ClaveContable>('ProductoTerminado', { limite: 200, signal: control.signal })
        .then((filas) => {
          if (sigueMontada()) setClaves(filas);
        })
        .catch((fallo: unknown) => {
          // Una lectura fallida NO es una zona vacía: callarla dejaba la lista en
          // blanco, y quien cuenta leía «no hay nada que contar».
          if (sigueMontada())
            setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer la lista.');
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [clavesIniciales, tomaId, intento]);

  /** El estado se limpia EN EL CLIC, no en el efecto. */
  function volverALeer(): void {
    setFalloDeCarga(null);
    setClaves(null);
    setIntento((previo) => previo + 1);
  }

  /**
   * LA FILA SE CONVIERTE EN PANEL. Antes del cambio la fila lleva el nombre de viaje;
   * dentro del cambio se lo pasa al panel, y `flushSync` hace que el navegador
   * fotografíe el estado nuevo ya pintado. En el teléfono el panel queda donde
   * estaba la lista, así que además se trae a la vista.
   *
   * Y en el teléfono la lista se ESCONDE, con la fila que tenía el foco: sin mover
   * el foco caía al `body`, y quien usa teclado o lector empezaba la pantalla de
   * cero. Pasa al nombre de la clave elegida. En la PC la lista sigue a la vista y
   * el foco se queda en su fila.
   */
  function elegir(id: string): void {
    const clave = claves?.find((c) => c.id === id);
    if (clave === undefined) return;
    flushSync(() => {
      setViaje({ id, en: 'fila' });
    });
    void conTransicion(() => {
      flushSync(() => {
        setViaje({ id, en: 'panel' });
        setElegida(clave);
        setEstimacion(null);
        setError(null);
        setAviso(null);
      });
      panel.current?.scrollIntoView({ block: 'nearest' });
      // Una caja con `display: none` no tiene rectángulos: así se sabe que se escondió.
      if (lista.current?.getClientRects().length === 0) {
        nombreDeLaElegida.current?.focus({ preventScroll: true });
      }
    }).finally(() => {
      setViaje(null);
    });
  }

  /**
   * Sólo en el teléfono: el panel vuelve a ser su fila, y el foco con él. El botón
   * que lo tenía se desmonta con el panel; la fila se busca ANTES, mientras aún es la
   * activa (`aria-current`), y es el mismo elemento después: la lista sólo estaba
   * escondida.
   */
  function volverALaLista(): void {
    if (elegida === null) return;
    const { id } = elegida;
    const fila = lista.current?.querySelector<HTMLElement>('tr[aria-current="true"]') ?? null;
    flushSync(() => {
      setViaje({ id, en: 'panel' });
    });
    void conTransicion(() => {
      flushSync(() => {
        setViaje({ id, en: 'fila' });
        setElegida(null);
      });
      fila?.focus();
    }).finally(() => {
      setViaje(null);
    });
  }

  function calibrar(): void {
    if (elegida === null) return;
    const peso = aMiligramos(muestra.peso);
    const piezas = Number(muestra.piezas);
    if (peso === null || !Number.isInteger(piezas) || piezas < 10) {
      setError({
        tono: 'atencion',
        que: 'La muestra va con su peso y al menos diez piezas contadas de verdad.',
        queNo: 'No se calibró nada.',
        campo: peso === null ? 'm-peso' : 'm-piezas',
      });
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando<{ readonly pesoPorPiezaMg: string; readonly variacionPct: string | null }>(
      RUTA_CALIBRAR,
      { productoId: elegida.id, pesoMuestraMg: peso, piezasMuestra: piezas, toleranciaPct: 8 },
    )
      .then((salida) => {
        // El comando contesta el peso en TEXTO —`bigint.toString()`— y el puente lo
        // sirve como número: la fila de la pantalla guarda lo segundo, que es lo que
        // se leerá la próxima vez.
        const actualizada = {
          ...elegida,
          peso_por_pieza_mg: Number(salida.pesoPorPiezaMg),
        };
        setElegida(actualizada);
        setClaves((claves ?? []).map((c) => (c.id === elegida.id ? actualizada : c)));
        // La variación se dice: recalibrar de 5 g a 50 g casi siempre es un cero
        // de más al teclear, y el conteo daría la décima parte durante meses.
        setAviso(
          salida.variacionPct === null
            ? 'Calibrado.'
            : `Calibrado. Cambió ${salida.variacionPct} % contra lo anterior.`,
        );
        setMuestra({ peso: '', piezas: '' });
      })
      .catch((fallo: unknown) => {
        setError({
          tono: 'peligro',
          que: mensajeDe(fallo),
          queNo: 'El peso por pieza sigue como estaba.',
        });
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function contar(): void {
    if (elegida === null) return;
    const total = aMiligramos(pesada.total);
    const tara = taraEnMiligramos(pesada.tara);
    if (total === null) {
      setError({
        tono: 'atencion',
        que: 'Pon lo que marcó la báscula.',
        queNo: 'No se anotó nada.',
        campo: 'p-total',
      });
      return;
    }
    if (tara === null) {
      setError({
        tono: 'atencion',
        que: 'Lo que pesa la cubeta va en gramos, con hasta tres decimales.',
        queNo: 'No se anotó nada.',
        campo: 'p-tara',
      });
      return;
    }
    setOcupado(true);
    setError(null);
    setEstimacion(null);
    invocarComando<Estimacion>(RUTA_CONTAR, {
      tomaId,
      productoId: elegida.id,
      pesoTotalMg: total,
      taraMg: tara,
    })
      .then((salida) => {
        setEstimacion(salida);
        setPesada({ total: '', tara: '' });
      })
      .catch((fallo: unknown) => {
        setError({
          tono: 'peligro',
          que: mensajeDe(fallo),
          queNo:
            'No quedó anotada ninguna estimación; lo que marcó la báscula sigue en los campos.',
        });
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  // El VACÍO QUE ENSEÑA. Ver el mismo caso en `abarrotes/Producto`: sin toma
  // abierta esta pantalla se quedaba en su esqueleto, en blanco, para siempre.
  if (tomaId === '' && clavesIniciales === undefined) {
    return (
      <main className={MARCO}>
        <Encabezado />
        <Vacio
          icono={<ClipboardList />}
          titulo="Aquí se cuenta una zona del almacén"
          explicacion="El conteo cíclico cuenta un anaquel al día en vez de cerrar la cortina un domingo entero. Aquí se captura lo contado de una toma abierta; abrirla desde Existencias todavía no está: mientras, Existencias enseña lo que hay."
          accion={
            <Button asChild className={TACTIL}>
              <a href="/ferreteria/existencias">Ir a Existencias</a>
            </Button>
          }
        />
      </main>
    );
  }

  // No leyó nada: qué pasó, qué NO pasó, y el botón para volver a leer. Sin el
  // `h1` «Conteo»: ése se pinta cuando la pantalla montó lo suyo, y en un fallo haría
  // pasar la pantalla por abierta.
  if (falloDeCarga !== null) {
    return (
      <main className={MARCO}>
        <ErrorDePantalla
          titulo={`No se pudieron leer ${voc.enFrase('producto', true)} para contar`}
          queHacer="Sin la lista no hay qué calibrar ni qué pesar, y todavía no se anotó nada. Revisa la señal y vuelve a leerla."
          detalle={falloDeCarga}
          reintentar={
            <Button type="button" className={TACTIL} onClick={volverALeer}>
              Volver a leer
            </Button>
          }
          className="max-w-xl"
        />
      </main>
    );
  }

  // La forma del encabezado, de la lista y del panel, nunca una rueda: al llegar la
  // lista nada salta. El encabezado también es forma y no texto, por lo mismo que en
  // el fallo: una pantalla que se queda cargando no ha montado lo suyo.
  if (claves === null) {
    return (
      <main className={MARCO}>
        <div className="flex flex-col gap-(--espacio-1)">
          <Esqueleto className="h-(--espacio-8) w-40" />
          <Esqueleto className="h-4 w-56" />
        </div>
        <div className={REJILLA}>
          <EsqueletoDeLista filas={8} />
          <div aria-hidden="true" className="hidden flex-col gap-(--espacio-3) md:flex">
            <Esqueleto className="h-(--espacio-6) w-2/3" />
            <Esqueleto className={`${TACTIL} w-full`} />
            <Esqueleto className={`${TACTIL} w-full`} />
            <Esqueleto className={`${TACTIL} w-full`} />
          </div>
        </div>
      </main>
    );
  }

  const calibrada = elegida !== null && elegida.peso_por_pieza_mg !== null;
  const sinCalibrar = claves.filter((c) => c.peso_por_pieza_mg === null).length;
  // El neto se ve en cuanto el bruto es un peso: con la tara vacía es el bruto, que es
  // lo que se va a dividir. Con la tara mal escrita es «—», y `contar` no la manda.
  const brutoMg = aMiligramos(pesada.total);
  const taraMg = taraEnMiligramos(pesada.tara);
  const netoMg = brutoMg === null || taraMg === null ? null : brutoMg - taraMg;

  return (
    <main className={MARCO}>
      <Encabezado>
        {voc.conNumero('producto', claves.length)}
        {sinCalibrar > 0 ? ` · ${String(sinCalibrar)} sin calibrar` : ''}
      </Encabezado>

      <div className={REJILLA}>
        {/* En el teléfono, la lista O la clave: no caben las dos de pie frente al rack. */}
        <div ref={lista} className={elegida === null ? 'min-w-0' : 'hidden min-w-0 md:block'}>
          <Tabla
            etiqueta={`${voc.titulo('producto', true)} para contar`}
            columnas={columnas}
            filas={claves}
            claveDe={(c) => c.id}
            {...(elegida === null ? {} : { activa: elegida.id })}
            alActivar={elegir}
            viajeDeFila={(c) =>
              viaje?.en === 'fila' && viaje.id === c.id ? VIAJE.fila(c.id) : undefined
            }
            alto="max-h-[70dvh]"
            vacio={
              <Superficie nivel={0} relleno={0}>
                <Vacio
                  icono={<Scale />}
                  titulo={`Todavía no hay ${voc.plural('producto')} que contar.`}
                  explicacion={`En cuanto el catálogo tenga ${voc.plural('producto')}, aquí se calibran y se pesan. Abrir la toma desde Existencias todavía no está.`}
                  accion={
                    <Button asChild variant="outline" className={TACTIL}>
                      <a href="/ferreteria/existencias">Ir a Existencias</a>
                    </Button>
                  }
                />
              </Superficie>
            }
          />
        </div>

        {elegida === null ? (
          claves.length === 0 ? null : (
            <Superficie
              como="section"
              nivel={0}
              relleno={0}
              aria-label="Cómo se cuenta"
              className="hidden md:block"
            >
              <Vacio
                icono={<Scale />}
                titulo="Elige una clave para contarla."
                explicacion="Las que dicen «sin calibrar» piden primero una muestra pesada y contada; las demás se pesan directo."
              />
            </Superficie>
          )
        ) : (
          <Superficie
            como="section"
            ref={panel}
            relleno={0}
            aria-labelledby="conteo-elegida"
            style={viaje?.en === 'panel' ? { viewTransitionName: VIAJE.fila(viaje.id) } : undefined}
            className="flex min-w-0 scroll-mt-(--espacio-4) flex-col"
          >
            <header className="flex flex-col gap-(--espacio-1) border-b border-borde p-(--espacio-4)">
              <Button
                type="button"
                variant="ghost"
                className={`${TACTIL} self-start md:hidden`}
                onClick={volverALaLista}
              >
                <ArrowLeft aria-hidden="true" />
                Volver a la lista
              </Button>
              <h2
                id="conteo-elegida"
                ref={nombreDeLaElegida}
                tabIndex={-1}
                className="text-xl font-semibold focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none"
              >
                {elegida.nombre}
              </h2>
              <p className="text-sm text-texto-sutil">
                {elegida.peso_por_pieza_mg === null ? (
                  'Sin calibrar: todavía no se sabe cuánto pesa una pieza.'
                ) : (
                  <>
                    Una pieza pesa{' '}
                    <Cifra valor={elegida.peso_por_pieza_mg} unidad="mg" tamano="sm" />, con ±
                    <Cifra
                      valor={elegida.tolerancia_peso_pct}
                      decimales={decimalesDe(elegida.tolerancia_peso_pct)}
                      unidad="%"
                      tamano="sm"
                    />{' '}
                    de tolerancia.
                  </>
                )}
              </p>
            </header>

            <div className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
              {/* ALERTA también la validación: aparece al tocar «Contar» o «Calibrar»
                  y tiene que oírse ya, no esperar su turno como un estado. */}
              {error !== null && (
                <Aviso id={ID_DEL_PROBLEMA} tono={error.tono} anuncio="alerta" titulo={error.que}>
                  {error.queNo}
                </Aviso>
              )}
              {aviso !== null && <Aviso tono="exito" titulo={aviso} />}

              {calibrada ? (
                <section aria-labelledby="conteo-pesar" className="flex flex-col gap-(--espacio-3)">
                  <h3 id="conteo-pesar" className="text-base font-semibold">
                    Pesar
                  </h3>
                  <div className="grid gap-(--espacio-3) sm:grid-cols-2">
                    <CampoDePeso
                      id="p-total"
                      etiqueta="Lo que marca la báscula (g)"
                      modo="decimal"
                      valor={pesada.total}
                      invalido={error?.campo === 'p-total'}
                      alCambiar={(total) => {
                        setPesada({ ...pesada, total });
                      }}
                    />
                    <CampoDePeso
                      id="p-tara"
                      etiqueta="La cubeta pesa (g)"
                      modo="decimal"
                      valor={pesada.tara}
                      ayuda="No restarla suma dos kilos de plástico al conteo."
                      invalido={error?.campo === 'p-tara'}
                      alCambiar={(tara) => {
                        setPesada({ ...pesada, tara });
                      }}
                    />
                  </div>
                  {brutoMg === null ? null : (
                    <p className="flex items-baseline justify-between border-t border-borde pt-(--espacio-2)">
                      <span className="text-sm text-texto-sutil">Neto</span>
                      <Cifra
                        valor={netoMg === null ? null : netoMg / MG_POR_GRAMO}
                        decimales={netoMg === null ? 'auto' : decimalesDeGramos(netoMg)}
                        unidad="g"
                        tamano="lg"
                      />
                    </p>
                  )}
                  <Button
                    type="button"
                    className={PRINCIPAL}
                    disabled={ocupado}
                    cargando={ocupado}
                    onClick={contar}
                  >
                    Contar
                  </Button>
                </section>
              ) : (
                <section
                  aria-labelledby="conteo-calibrar"
                  className="flex flex-col gap-(--espacio-3)"
                >
                  <h3 id="conteo-calibrar" className="text-base font-semibold">
                    Primero se calibra
                  </h3>
                  <p className="text-sm text-texto-sutil">
                    Se pesa una muestra y se cuentan sus piezas de verdad. Sin esto, dividir es
                    inventarse el número.
                  </p>
                  <div className="grid gap-(--espacio-3) sm:grid-cols-2">
                    <CampoDePeso
                      id="m-peso"
                      etiqueta="Peso de la muestra (g)"
                      modo="decimal"
                      valor={muestra.peso}
                      invalido={error?.campo === 'm-peso'}
                      alCambiar={(peso) => {
                        setMuestra({ ...muestra, peso });
                      }}
                    />
                    <CampoDePeso
                      id="m-piezas"
                      etiqueta="Piezas contadas"
                      modo="numeric"
                      valor={muestra.piezas}
                      invalido={error?.campo === 'm-piezas'}
                      alCambiar={(piezas) => {
                        setMuestra({ ...muestra, piezas });
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    className={PRINCIPAL}
                    disabled={ocupado}
                    cargando={ocupado}
                    onClick={calibrar}
                  >
                    Calibrar
                  </Button>
                </section>
              )}
            </div>

            {/* LA ESTIMACIÓN SE ANUNCIA: la región viva existe desde que se abre el panel
                y el resultado llega DENTRO. Va fuera del cuerpo para que, vacía, no sume
                un hueco más al pie del panel. */}
            <div aria-live="polite">
              {estimacion !== null && <Resultado estimacion={estimacion} />}
            </div>
          </Superficie>
        )}
      </div>
    </main>
  );
}
