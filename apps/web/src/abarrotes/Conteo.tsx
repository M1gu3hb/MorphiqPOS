'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Progreso,
  Superficie,
  Tabla,
  TablaAdaptable,
  Vacio,
  type ColumnaDeTabla,
  type TonoDeFila,
} from '@morphiqpos/ui/sistema';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  ClipboardCheck,
  RotateCcw,
  ScanBarcode,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';

import {
  MotivoDeLaDiferencia,
  useMotivosDeMerma,
  type MotivoDeMerma,
} from './conteo/MotivoDeLaDiferencia.tsx';

/**
 * PANTALLA · abarrotes · conteo
 *
 * El conteo cíclico (F-149): contar una zona de anaquel en veinte minutos, a
 * ciegas. Una vez al día, el encargado, de pie, con el teléfono.
 *
 * ── Por qué ésta es la ÚNICA pantalla del modelo hecha para el teléfono ──
 * Porque se cuenta FRENTE AL ANAQUEL, con una mano en el producto. Una PC en el
 * mostrador y un anaquel a cuatro metros producen el peor flujo posible:
 * contar, caminar, teclear de memoria, equivocarse. Es la excepción a la regla
 * del modelo y la justifica dónde ocurre el trabajo, no el gusto.
 *
 * ── Por qué el esperado NO se pinta mientras se cuenta ───────────────────
 * Misma regla del arqueo (§5 de `04-SISTEMA-DE-DISENO.md`) y misma razón: si se
 * muestra, todo el mundo teclea ese número y el conteo deja de existir. El
 * `esperado` llega en la fila y sólo se usa DESPUÉS, en el resumen. Es la
 * condición que esta pantalla no puede romper nunca.
 *
 * ── Por qué dos campos y no uno ──────────────────────────────────────────
 * Porque así se cuenta un anaquel: nueve cajas y cuatro sueltas. Pedir 220 es
 * pedirle al encargado la multiplicación de cabeza, junto a la reja, con frío.
 * La equivalencia se calcula en vivo y se enseña debajo para que él confirme lo
 * que ya sabe, no para que la resuelva.
 *
 * ── Por qué los objetivos táctiles son de 56 px y no de 44 ───────────────
 * Se cuenta de pie, con una mano ocupada y a veces con las manos frías del
 * congelador. Los 44 px del mínimo se pensaron para un pulgar tranquilo.
 *
 * ── Por qué el porcentaje nunca va solo ──────────────────────────────────
 * Un «−1.9 %» a secas no le dice nada a Don Chuy. «−1.9 %, y el promedio del
 * retail mexicano es 1.5–2.5 %» le dice si tiene un problema, y ésa es la única
 * razón por la que se le enseña el número.
 *
 * ── Por qué el motivo por omisión NUNCA es «robo» ────────────────────────
 * El sistema no lo sabe. Acusar sin prueba es la forma más rápida de abrir un
 * conflicto injusto en una tienda donde trabaja la familia.
 *
 * ── Cómo se pinta ────────────────────────────────────────────────────────
 * Mientras se cuenta hay UNA superficie levantada: el producto en curso, con sus
 * dos campos grandes y el botón de seguir debajo, donde cae el pulgar. La zona va
 * arriba, chica, porque ya se sabe; el avance y «Terminar zona» van abajo. En el
 * resumen el recuento es una tabla de tres renglones y la diferencia neta va
 * aparte y grande, con su contexto pegado: es lo único que el dueño se lleva. Lo
 * que no cuadró son tarjetas en el teléfono y tabla desde la tableta, con el
 * esperado a la vista porque el conteo ya terminó.
 *
 * ── Cada diferencia con su motivo (C.10 de la 2.4) ───────────────────────
 * Lo que no cuadró elige SU motivo —caducado, roto, faltante— de los del tronco y
 * del giro (`conteo/MotivoDeLaDiferencia`); lo que no se elige se cierra con el de
 * omisión. Y cada renglón abre el kardex de su producto, en la ficha: de dónde
 * salió el esperado.
 */

/**
 * Nunca «robo»: el sistema no lo sabe y acusar sin prueba rompe una tienda.
 *
 * Es LA CLAVE de `motivos_merma` y no su etiqueta. Aquí decía «diferencia de
 * conteo», una frase, y `movimientos_stock.motivo` apunta a esa tabla desde la
 * migración 062: la base habría contestado `23503` y el cierre de la zona
 * abortaría la transacción entera después de veinte minutos de recorrido.
 */
const MOTIVO_POR_OMISION = 'ajuste_conteo';

/** Lo que se le enseña a una persona. La clave es para la base, no para leerla. */
const MOTIVO_EN_PALABRAS = 'Diferencia de conteo físico';

// Las clases largas viven arriba para que cada elemento quepa en una línea.
//
// 3.5rem es el objetivo táctil de 56 px de §4.6 del documento, y va LITERAL a
// propósito: no depende de la perilla de densidad. Con guantes, en comoda o en
// normal, la mano que cuenta frente al congelador es la misma.
const TACTIL = 'min-h-[3.5rem]';
const MARCO = 'mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-(--espacio-4) p-(--espacio-4)';
const ALTO_DE_CAMPO = `${TACTIL} h-[calc(var(--altura-control)*1.5)]`;
// El `md:` repetido no es un descuido: `Input` baja el texto a `md:text-sm`, y sin
// su propio `md:` el número del anaquel se encogía justo en la tableta.
const CAMPO = `${ALTO_DE_CAMPO} text-center font-numeros text-3xl font-bold tabular-nums md:text-3xl`;
const PRINCIPAL = `${TACTIL} w-full text-lg font-semibold`;

export interface ProductoDeConteo {
  readonly id: string;
  readonly nombre: string;
  readonly zona: string;
  /** Para convertir cajas a piezas en vivo. */
  readonly piezasPorCaja: number;
  /** A CIEGAS: no se pinta hasta el resumen. Ver el docblock. */
  readonly esperado: number;
  /**
   * `null` cuando quien cuenta no ve costos.
   *
   * El puente restringe este campo a quien ve costos de insumo, y el cajero
   * cuenta igual —en una tiendita es quien está y quien conoce el anaquel—, así
   * que llega sin él. El resumen entonces enseña las PIEZAS y calla el importe,
   * en vez de multiplicar por cero y decir que no falta nada.
   */
  readonly costoCentavos: number | null;
  readonly codigo: string | null;
  /** De qué producto es el insumo: con él se abre su kardex. */
  readonly producto_id?: string | null;
}

export interface ConteoProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly ProductoDeConteo[];
  readonly zonaInicial?: string;
  readonly diasSinContar?: number;
}

export interface ResumenDeZona {
  readonly cuadraron: number;
  readonly faltaron: number;
  readonly sobraron: number;
  readonly faltanteCentavos: number;
  readonly sobranteCentavos: number;
  readonly netoCentavos: number;
  readonly porcentaje: number;
  /** `false` si algún producto contado llegó sin costo: el importe no se enseña. */
  readonly importeVisible: boolean;
  readonly desviados: readonly ProductoDeConteo[];
}

/** Sólo enteros positivos: aquí no hay media pieza ni media caja. */
function enteroDe(texto: string): number {
  const valor = Number.parseInt(texto, 10);
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

/** Cajas y piezas es como se CUENTA un anaquel; piezas es como se GUARDA. */
export function equivalenciaEnPiezas(cajas: string, piezas: string, porCaja: number): number {
  return enteroDe(cajas) * Math.max(1, porCaja) + enteroDe(piezas);
}

/**
 * El corte de la zona. Sólo entran los productos ya contados: una zona a medias
 * daría un porcentaje falso, y ese porcentaje es lo único que el dueño se lleva.
 */
export function resumirConteo(
  filas: readonly ProductoDeConteo[],
  conteos: Readonly<Record<string, number>>,
): ResumenDeZona {
  let cuadraron = 0;
  let faltaron = 0;
  let sobraron = 0;
  let faltanteCentavos = 0;
  let sobranteCentavos = 0;
  let valorEsperado = 0;
  let importeVisible = true;
  const desviados: ProductoDeConteo[] = [];

  for (const fila of filas) {
    const contado = conteos[fila.id];
    if (contado === undefined) continue;
    // Un costo ausente no es un costo de cero: quien cuenta no lo ve. Se apunta y
    // el importe se calla; contar 0 haría que un faltante de mil pesos se
    // enseñara como «$0.00 · 0.0 %», que es peor que no enseñar nada. Por
    // `centavosDe`, que sabe en qué unidad llega el campo y conserva el `null`.
    const costo = centavosDe('ConteoDeZona', 'costoCentavos', fila.costoCentavos);
    if (costo === null) importeVisible = false;
    valorEsperado += fila.esperado * (costo ?? 0);
    const diferencia = contado - fila.esperado;
    if (diferencia === 0) {
      cuadraron += 1;
      continue;
    }
    desviados.push(fila);
    if (diferencia < 0) faltanteCentavos += -diferencia * (costo ?? 0);
    else sobranteCentavos += diferencia * (costo ?? 0);
    if (diferencia < 0) faltaron += 1;
    else sobraron += 1;
  }

  const neto = sobranteCentavos - faltanteCentavos;
  return {
    cuadraron,
    faltaron,
    sobraron,
    faltanteCentavos,
    sobranteCentavos,
    netoCentavos: neto,
    porcentaje: valorEsperado === 0 ? 0 : (Math.abs(neto) / valorEsperado) * 100,
    importeVisible,
    desviados,
  };
}

/** El límite de intentos no es un código del contrato: es el 429 del transporte. */
function mensajeDeFallo(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === 429) return 'Demasiados intentos seguidos. Espera unos segundos.';
    if (fallo.error.codigo === 'SIN_PERMISO') return 'Tu usuario no puede ajustar el inventario.';
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo leer la zona de hoy.';
}

export interface CampoDeConteoProps {
  readonly id?: string;
  readonly etiqueta?: string;
  readonly valor?: string;
  readonly alCambiar?: (valor: string) => void;
}

/** Los dos campos son el mismo control: uno cuenta cajas y el otro sueltas. */
export function CampoDeConteo({ id, etiqueta, valor, alCambiar }: CampoDeConteoProps) {
  // El número arriba y la palabra debajo, como se dice en el anaquel: «nueve
  // cajas». La etiqueta sigue atada al campo por `htmlFor`, que es lo que lee un
  // lector de pantalla, y no por el orden.
  return (
    <div className="flex flex-1 flex-col gap-(--espacio-1)">
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={valor ?? ''}
        className={CAMPO}
        onChange={(evento) => {
          alCambiar?.(evento.target.value);
        }}
      />
      <Label htmlFor={id} className="justify-center text-texto-sutil">
        {etiqueta}
      </Label>
    </div>
  );
}

/** Un renglón del recuento: cuántos productos cayeron de qué lado, y cuánto pesan. */
interface RenglonDeRecuento {
  readonly clave: string;
  readonly icono: ReactNode;
  readonly palabra: string;
  readonly productos: number;
  /** Con su signo: el faltante en negativo. `null` donde no hay importe que decir. */
  readonly centavos: number | null;
  /** El fondo del renglón, sólo cuando hay algo de ese lado. Nunca va solo. */
  readonly tono: TonoDeFila | undefined;
}

/** Flecha Y palabra en cada renglón: el color nunca carga solo. */
function renglonesDe(resumen: ResumenDeZona): readonly RenglonDeRecuento[] {
  const tonoFaltaron: TonoDeFila | undefined = resumen.faltaron > 0 ? 'peligro' : undefined;
  const tonoSobraron: TonoDeFila | undefined = resumen.sobraron > 0 ? 'exito' : undefined;
  return [
    {
      clave: 'cuadraron',
      icono: <Check className="size-4 text-exito" />,
      palabra: 'Cuadraron',
      productos: resumen.cuadraron,
      centavos: null,
      tono: undefined,
    },
    {
      clave: 'faltaron',
      icono: <ChevronDown className="size-4 text-peligro" />,
      palabra: 'Faltaron',
      productos: resumen.faltaron,
      centavos: -resumen.faltanteCentavos,
      tono: tonoFaltaron,
    },
    {
      clave: 'sobraron',
      icono: <ChevronUp className="size-4 text-exito" />,
      palabra: 'Sobraron',
      productos: resumen.sobraron,
      centavos: resumen.sobranteCentavos,
      tono: tonoSobraron,
    },
  ];
}

function columnasDeRecuento(
  nombreDeProductos: string,
  importeVisible: boolean,
): readonly ColumnaDeTabla<RenglonDeRecuento>[] {
  const base: readonly ColumnaDeTabla<RenglonDeRecuento>[] = [
    {
      clave: 'resultado',
      titulo: 'Resultado',
      celda: (r) => (
        <span className="inline-flex items-center gap-(--espacio-2) font-medium">
          <span aria-hidden="true">{r.icono}</span>
          {r.palabra}
        </span>
      ),
    },
    {
      clave: 'productos',
      titulo: nombreDeProductos,
      numerica: true,
      celda: (r) => <Cifra valor={r.productos} tamano="sm" />,
    },
  ];
  if (!importeVisible) return base;
  return [
    ...base,
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (r) =>
        r.centavos === null ? (
          <span className="text-texto-sutil">—</span>
        ) : (
          <Dinero centavos={r.centavos} conSigno tamano="sm" />
        ),
    },
  ];
}

/** Lo contado menos lo esperado, con flecha, signo y color: los tres dicen lo mismo. */
function Diferencia({ piezas }: { readonly piezas: number }) {
  const falta = piezas < 0;
  return (
    <span className={`whitespace-nowrap ${falta ? 'text-peligro' : 'text-exito'}`}>
      {falta ? (
        <ChevronDown aria-hidden="true" className="inline-block size-4 align-middle" />
      ) : (
        <ChevronUp aria-hidden="true" className="inline-block size-4 align-middle" />
      )}
      {falta ? '−' : '+'}
      <Cifra valor={Math.abs(piezas)} unidad="pz" tamano="sm" />
    </span>
  );
}

function columnasDeDesviados(
  nombreDeProducto: string,
  conteos: Readonly<Record<string, number>>,
  alRecontar: (id: string) => void,
  motivo: {
    readonly opciones: readonly MotivoDeMerma[];
    readonly elegidos: Readonly<Record<string, string>>;
    readonly alElegir: (insumoId: string, clave: string) => void;
  },
): readonly ColumnaDeTabla<ProductoDeConteo>[] {
  return [
    {
      clave: 'producto',
      titulo: nombreDeProducto,
      celda: (p) => (
        <span className="flex items-center justify-between gap-(--espacio-3)">
          <span className="font-medium">{p.nombre}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={`${TACTIL} xl:min-h-0`}
            onClick={() => {
              alRecontar(p.id);
            }}
          >
            <RotateCcw aria-hidden="true" />
            {/* A la vista, la pregunta corta; al lector, con el nombre de qué. */}
            ¿Recontar<span className="sr-only"> {p.nombre}</span>?
          </Button>
        </span>
      ),
    },
    {
      clave: 'esperado',
      titulo: 'Esperado',
      numerica: true,
      celda: (p) => <Cifra valor={p.esperado} unidad="pz" tamano="sm" />,
    },
    {
      clave: 'contado',
      titulo: 'Contaste',
      numerica: true,
      celda: (p) => <Cifra valor={conteos[p.id] ?? 0} unidad="pz" tamano="sm" />,
    },
    {
      clave: 'diferencia',
      titulo: 'Diferencia',
      numerica: true,
      orden: (p) => (conteos[p.id] ?? 0) - p.esperado,
      celda: (p) => <Diferencia piezas={(conteos[p.id] ?? 0) - p.esperado} />,
    },
    {
      clave: 'motivo',
      titulo: 'Motivo',
      celda: (p) => (
        <MotivoDeLaDiferencia
          nombre={p.nombre}
          productoId={p.producto_id}
          opciones={motivo.opciones}
          elegido={motivo.elegidos[p.id] ?? MOTIVO_POR_OMISION}
          onElegir={(clave) => {
            motivo.alElegir(p.id, clave);
          }}
        />
      ),
    },
  ];
}

/**
 * EL NETO CON SU SENTIDO ESCRITO: flecha, palabra y color, y el importe sin signo.
 *
 * Era `<Dinero centavos={neto} />` a secas: un sobrante salía «$18.00» sin signo, sin
 * color y sin palabra, y un faltante sólo se distinguía por el paréntesis contable,
 * que no todo el que cuenta un anaquel conoce. Como en `Diferencia`, el sentido no lo
 * carga una sola señal. En cero no hay sentido que decir: «$0.00» se lee solo.
 */
function SentidoDelNeto({ centavos }: { readonly centavos: number }) {
  const importe = <Dinero centavos={Math.abs(centavos)} tamano="lg" className="font-bold" />;
  if (centavos === 0) return importe;
  const falta = centavos < 0;
  return (
    <span
      className={`text-xl font-bold whitespace-nowrap ${falta ? 'text-peligro' : 'text-exito'}`}
    >
      {falta ? (
        <ChevronDown aria-hidden="true" className="inline-block size-5 align-middle" />
      ) : (
        <ChevronUp aria-hidden="true" className="inline-block size-5 align-middle" />
      )}
      {falta ? 'Falta' : 'Sobra'} {importe}
    </span>
  );
}

/**
 * LA DIFERENCIA NETA, que es lo que el dueño se lleva de la zona. El porcentaje va
 * grande y con su contexto pegado debajo: sin ese renglón el número no le dice nada.
 */
function Veredicto({
  resumen,
  nombreDeProductos,
}: {
  readonly resumen: ResumenDeZona;
  readonly nombreDeProductos: string;
}) {
  const netoEnProductos = resumen.sobraron - resumen.faltaron;
  return (
    <Superficie
      como="section"
      aria-label="Diferencia neta"
      relleno={4}
      className="flex flex-col gap-(--espacio-2)"
    >
      <p className="text-sm font-medium text-texto-sutil">Diferencia neta</p>
      {resumen.importeVisible ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-(--espacio-4) gap-y-(--espacio-1)">
            <SentidoDelNeto centavos={resumen.netoCentavos} />
            <Cifra
              valor={resumen.porcentaje}
              decimales={1}
              unidad="%"
              tamano="lg"
              className="text-3xl font-bold"
            />
          </p>
          <p className="text-sm text-texto-sutil">El promedio del retail mexicano es 1.5–2.5 %.</p>
        </>
      ) : (
        <>
          <p className="text-3xl font-bold">
            {netoEnProductos >= 0 ? '+' : '−'}
            <Cifra
              valor={Math.abs(netoEnProductos)}
              unidad={nombreDeProductos}
              tamano="lg"
              className="text-3xl font-bold"
            />
          </p>
          {/* Se dice por qué falta el peso, en vez de enseñar un cero. */}
          <p className="text-sm text-texto-sutil">
            El importe en pesos lo ve quien ve costos. El conteo se cierra igual.
          </p>
        </>
      )}
    </Superficie>
  );
}

export function Conteo({ filasIniciales, zonaInicial, diasSinContar }: ConteoProps) {
  const voc = useVocabulario();
  const [filas, setFilas] = useState<readonly ProductoDeConteo[] | null>(filasIniciales ?? null);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada lectura es un número: «Volver a leer» lo sube y el efecto lee otra vez.
  // El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [conteos, setConteos] = useState<Readonly<Record<string, number>>>({});
  const [idActual, setIdActual] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [cajas, setCajas] = useState('');
  const [piezas, setPiezas] = useState('');
  const [enResumen, setEnResumen] = useState(false);
  const [cerrada, setCerrada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** El motivo elegido para cada diferencia; lo que no está aquí va con el de omisión. */
  const [motivos, setMotivos] = useState<Readonly<Record<string, string>>>({});
  const opcionesDeMotivo = useMotivosDeMerma(enResumen);

  useEffect(() => {
    if (filasIniciales !== undefined) return;
    // Un centinela `let vivo` el compilador lo da por siempre-verdadero: la
    // pregunta se le hace a la señal, que además corta la petición de verdad.
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    consultarPuente<ProductoDeConteo>('ConteoDeZona', { limite: 400, signal: control.signal })
      .then((leidas) => {
        if (sigueMontada()) setFilas(leidas);
      })
      .catch((fallo: unknown) => {
        // Sin la lista de la zona no hay nada que contar: se dice qué pasó y se
        // ofrece volver a leer, en vez de fingir que hoy no toca ninguna zona.
        if (sigueMontada()) setFalloDeCarga(mensajeDeFallo(fallo));
      });
    return () => {
      control.abort();
    };
  }, [filasIniciales, intento]);

  useEffect(() => {
    // Los atajos `+` y `−` del layout de PC. `Enter` no vive aquí: lo resuelve
    // el envío del formulario, que es lo que el escáner manda al terminar.
    function alTeclear(evento: KeyboardEvent): void {
      if (evento.target instanceof HTMLInputElement) return;
      if (evento.key === '+') setPiezas((v) => String(enteroDe(v) + 1));
      else if (evento.key === '-') setPiezas((v) => String(Math.max(0, enteroDe(v) - 1)));
    }
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, []);

  const pendientes = useMemo(
    () => (filas ?? []).filter((fila) => conteos[fila.id] === undefined),
    [filas, conteos],
  );
  const actual = useMemo(
    () => (filas ?? []).find((fila) => fila.id === idActual) ?? pendientes[0] ?? null,
    [filas, idActual, pendientes],
  );
  const resumen = useMemo(() => resumirConteo(filas ?? [], conteos), [filas, conteos]);

  const zona = zonaInicial ?? filas?.[0]?.zona ?? 'Zona de hoy';
  const contados = Object.keys(conteos).length;
  const total = filas?.length ?? 0;

  function volverALeer(): void {
    setFalloDeCarga(null);
    setFilas(null);
    setIntento((previo) => previo + 1);
  }

  function elegir(producto: ProductoDeConteo | undefined): void {
    if (producto === undefined) return;
    setIdActual(producto.id);
    setBusqueda('');
    setCajas('');
    setPiezas('');
  }

  /** El escáner teclea el código y manda Enter: eso tiene que bastar. */
  function buscar(): void {
    const texto = busqueda.trim().toLowerCase();
    if (texto === '') return;
    elegir((filas ?? []).find((f) => f.codigo === texto || f.nombre.toLowerCase().includes(texto)));
  }

  function registrar(): void {
    if (actual === null) return;
    const piezasContadas = equivalenciaEnPiezas(cajas, piezas, actual.piezasPorCaja);
    setConteos((actuales) => ({ ...actuales, [actual.id]: piezasContadas }));
    setCajas('');
    setPiezas('');
    setIdActual(null);
  }

  function recontar(id: string): void {
    setConteos((previos) => Object.fromEntries(Object.entries(previos).filter(([k]) => k !== id)));
    setIdActual(id);
    setEnResumen(false);
  }

  async function cerrarZona(): Promise<void> {
    setGuardando(true);
    setError(null);
    try {
      // El documento no nombra la ruta: se usa /api/<dominio>/<verbo> por
      // convención. Va un renglón POR PRODUCTO con su motivo; no es un botón
      // mágico que cuadra el inventario sin dejar rastro de quién y por qué.
      //
      // Se mandan TODOS los contados y no sólo los desviados: el servidor sella
      // el esperado de cada renglón al anotarlo, así que un producto que cuadró
      // deja constancia de que se contó y cuadró. Mandar sólo los desviados haría
      // que un conteo de cuarenta productos con dos diferencias pareciera un
      // conteo de dos.
      //
      // `insumoId` y no `productoId`: lo que se cuenta es el insumo —es el que
      // tiene zona y el que `toma_conteos` lleva—, y `id` de la fila ya es el suyo.
      // `contado` como TEXTO: quien convierte cantidades es el servidor.
      await invocarComando('/api/inventario/ajustar-conteo', {
        zona,
        motivo: MOTIVO_POR_OMISION,
        nota: MOTIVO_EN_PALABRAS,
        movimientos: Object.entries(conteos).map(([id, contado]) => ({
          insumoId: id,
          contado: String(contado),
          // Sólo lo que se eligió distinto: lo demás, el de la zona.
          ...(motivos[id] === undefined || motivos[id] === MOTIVO_POR_OMISION
            ? {}
            : { motivo: motivos[id] }),
        })),
      });
      setCerrada(true);
    } catch (fallo: unknown) {
      setError(mensajeDeFallo(fallo));
    } finally {
      setGuardando(false);
    }
  }

  // No leyó nada: qué pasó, qué hacer, y el botón para hacerlo.
  if (falloDeCarga !== null) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center p-(--espacio-4)">
        <ErrorDePantalla
          titulo="No se pudo leer la zona de hoy"
          queHacer="Sin la lista de la zona no hay qué contar, y todavía no se ha contado nada. Revisa la señal y vuelve a leerla."
          detalle={falloDeCarga}
          reintentar={
            <Button type="button" className={PRINCIPAL} onClick={volverALeer}>
              Volver a leer
            </Button>
          }
        />
      </div>
    );
  }

  // Esqueletos con la forma de la zona, el buscador, los campos y el botón: la
  // pantalla no salta al llegar el dato y el pulgar ya sabe dónde va a caer.
  if (filas === null) {
    return (
      <div role="status" aria-busy="true" aria-label="Leyendo la zona de hoy" className={MARCO}>
        <div className="flex flex-col gap-(--espacio-2)">
          <Esqueleto className="h-(--espacio-6) w-2/3" />
          <Esqueleto className="h-4 w-1/3" />
        </div>
        <Esqueleto className={`${TACTIL} w-full`} />
        <Esqueleto className="h-(--espacio-8) w-1/2" />
        <div className="flex gap-(--espacio-3)">
          <Esqueleto className={`${ALTO_DE_CAMPO} flex-1`} />
          <Esqueleto className={`${ALTO_DE_CAMPO} flex-1`} />
        </div>
        <Esqueleto className={`${TACTIL} w-full`} />
      </div>
    );
  }

  // El vacío ENSEÑA qué es un conteo cíclico: es la primera vez que el encargado
  // lo lee, y de eso depende que mañana vuelva a abrir la pantalla.
  if (filas.length === 0) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-(--espacio-6)">
        <Vacio
          icono={<ClipboardCheck />}
          titulo="Hoy no toca ninguna zona."
          explicacion="El conteo cíclico parte el anaquel en zonas y cuenta una al día, en veinte minutos, en vez de cerrar la cortina un domingo entero. La que más se mueve vuelve a tocar antes."
          accion={
            <Button asChild className={PRINCIPAL}>
              <a href="/configuracion">Programar las zonas del anaquel</a>
            </Button>
          }
        />
      </div>
    );
  }

  const productos = voc.plural('producto');

  if (enResumen) {
    return (
      <div className={MARCO}>
        <header className="flex flex-col gap-(--espacio-1)">
          <h1 className="text-xl font-bold">
            {zona} · {total} {productos}
          </h1>
          <p className="text-sm text-texto-sutil">
            Contados {contados} de {total}
          </p>
        </header>

        {error !== null && (
          <Aviso tono="peligro" titulo={error}>
            No se ajustó ningún {voc.singular('producto')} y lo contado sigue aquí.
          </Aviso>
        )}

        <div className="flex flex-col gap-(--espacio-4) xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:items-start">
          <div className="flex flex-col gap-(--espacio-4)">
            <Tabla
              etiqueta="Recuento de la zona"
              columnas={columnasDeRecuento(voc.titulo('producto', true), resumen.importeVisible)}
              filas={renglonesDe(resumen)}
              claveDe={(r) => r.clave}
              tonoDeFila={(r) => r.tono}
              alto="max-h-none"
            />
            <Veredicto resumen={resumen} nombreDeProductos={productos} />
          </div>

          <div className="flex flex-col gap-(--espacio-4)">
            <section aria-labelledby="conteo-desviados" className="flex flex-col gap-(--espacio-2)">
              <h2 id="conteo-desviados" className="text-base font-semibold">
                Lo que no cuadró
              </h2>
              {/* En palabras y no la clave: la clave es para la base. */}
              {resumen.desviados.length > 0 && (
                <p className="text-sm text-texto-sutil">
                  Lo que no elijas se ajusta con el motivo «{MOTIVO_EN_PALABRAS}».
                </p>
              )}
              <TablaAdaptable
                etiqueta="Lo que no cuadró"
                principal="producto"
                desde="md"
                columnas={columnasDeDesviados(voc.titulo('producto'), conteos, recontar, {
                  opciones: opcionesDeMotivo,
                  elegidos: motivos,
                  alElegir: (insumoId, clave) => {
                    setMotivos((previos) => ({ ...previos, [insumoId]: clave }));
                  },
                })}
                filas={resumen.desviados}
                claveDe={(p) => p.id}
                alto="max-h-[50vh]"
                vacio={
                  <Vacio
                    icono={<Check />}
                    titulo="Todo lo contado cuadró."
                    explicacion={`Al cerrar la zona queda constancia de que cada ${voc.singular('producto')} se contó y cuadró.`}
                    className="py-(--espacio-6)"
                  />
                }
              />
            </section>

            {cerrada ? (
              <Aviso tono="exito" titulo="Zona cerrada.">
                Cada ajuste quedó como un movimiento con su motivo.
              </Aviso>
            ) : (
              <Button
                type="button"
                className={PRINCIPAL}
                cargando={guardando}
                onClick={() => {
                  void cerrarZona();
                }}
              >
                {guardando ? 'Ajustando…' : 'Ajustar todo y cerrar la zona'}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={MARCO}>
      <header className="flex flex-col gap-(--espacio-1)">
        <h1 className="text-xl font-bold">Zona: {zona}</h1>
        <p className="text-sm text-texto-sutil">
          {diasSinContar === undefined ? '' : `Hace ${diasSinContar} días · `}
          {total} prod.
        </p>
      </header>

      {error !== null && (
        <Aviso tono="peligro" titulo={error}>
          Se sigue contando con lo que ya hay.
        </Aviso>
      )}

      <div className="flex flex-col gap-(--espacio-4) xl:grid xl:grid-cols-[16rem_minmax(0,1fr)] xl:items-start">
        {/* En teléfono no hay lista: estorba, y el diagrama del documento no la
            tiene. De tablet arriba es una cinta; en PC, la columna izquierda
            del layout de dos columnas que el documento sí decide. */}
        <Superficie
          como="nav"
          aria-label={`${voc.titulo('producto', true)} de la zona`}
          relleno={3}
          className="hidden gap-(--espacio-2) overflow-x-auto md:flex xl:max-h-[70dvh] xl:flex-col xl:overflow-x-visible xl:overflow-y-auto"
        >
          {filas.map((fila) => {
            const contado = conteos[fila.id] !== undefined;
            const enCurso = fila.id === actual?.id;
            return (
              <Button
                key={fila.id}
                type="button"
                size="sm"
                variant={enCurso ? 'default' : contado ? 'secondary' : 'ghost'}
                aria-current={enCurso}
                className={`${TACTIL} justify-start whitespace-nowrap xl:min-h-0 xl:w-full`}
                onClick={() => {
                  elegir(fila);
                }}
              >
                {contado ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
                {fila.nombre}
              </Button>
            );
          })}
        </Superficie>

        <section className="flex flex-col gap-(--espacio-4)">
          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              buscar();
            }}
          >
            <Label htmlFor="buscador" className="sr-only">
              Escanea o busca {voc.enFraseCon('un', 'producto')}
            </Label>
            <div className="relative">
              <ScanBarcode
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-5 -translate-y-1/2 text-texto-sutil"
              />
              <Input
                id="buscador"
                value={busqueda}
                autoComplete="off"
                placeholder="escanea o busca"
                className={`${TACTIL} pl-(--espacio-10) text-lg md:text-lg`}
                onChange={(evento) => {
                  setBusqueda(evento.target.value);
                }}
              />
            </div>
          </form>

          {actual === null ? (
            <Vacio
              icono={<ClipboardCheck />}
              titulo={`Ya contaste los ${total} ${productos} de la zona.`}
              explicacion="Toca «Terminar zona» para ver qué cuadró y cerrarla con su ajuste."
              className="py-(--espacio-6)"
            />
          ) : (
            <Superficie
              como="form"
              nivel={2}
              relleno={4}
              aria-labelledby="conteo-en-curso"
              className="flex flex-col gap-(--espacio-4)"
              onSubmit={(evento) => {
                evento.preventDefault();
                registrar();
              }}
            >
              {/* Ni una palabra del esperado aquí: es la regla del arqueo. */}
              <div className="flex flex-col gap-(--espacio-1)">
                <h2 id="conteo-en-curso" className="text-2xl leading-tight font-bold">
                  {actual.nombre}
                </h2>
                {actual.codigo === null ? null : (
                  <p className="font-numeros text-xs text-texto-sutil tabular-nums">
                    {actual.codigo}
                  </p>
                )}
              </div>
              <div className="flex gap-(--espacio-3)">
                <CampoDeConteo id="cajas" etiqueta="cajas" valor={cajas} alCambiar={setCajas} />
                <CampoDeConteo id="piezas" etiqueta="piezas" valor={piezas} alCambiar={setPiezas} />
              </div>
              <div className="flex flex-col items-center gap-(--espacio-1)">
                <p aria-live="polite" className="text-2xl font-bold">
                  ={' '}
                  <Cifra
                    valor={equivalenciaEnPiezas(cajas, piezas, actual.piezasPorCaja)}
                    unidad="pz"
                    tamano="lg"
                    className="text-2xl font-bold"
                  />
                </p>
                {actual.piezasPorCaja > 1 && (
                  <p className="text-xs text-texto-sutil">
                    Caja de <Cifra valor={actual.piezasPorCaja} unidad="pz" tamano="xs" />
                  </p>
                )}
              </div>
              <Button type="submit" size="lg" className={`${PRINCIPAL} justify-between`}>
                SIGUIENTE
                <Check aria-hidden="true" />
              </Button>
            </Superficie>
          )}
        </section>
      </div>

      <footer className="mt-auto flex flex-col gap-(--espacio-3) pt-(--espacio-4)">
        <Progreso valor={(contados / total) * 100} etiqueta={`Contados ${contados} de ${total}`} />
        <Button
          type="button"
          variant="outline"
          className={PRINCIPAL}
          disabled={contados === 0}
          onClick={() => {
            setEnResumen(true);
          }}
        >
          Terminar zona
        </Button>
      </footer>
    </div>
  );
}
