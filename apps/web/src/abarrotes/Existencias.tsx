'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import {
  Cifra,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
  type TonoDeFila,
} from '@morphiqpos/ui/sistema';
import {
  ArrowDown,
  Boxes,
  CalendarClock,
  CircleCheck,
  CircleX,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { consultarPuente } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · abarrotes · existencias
 *
 * Contesta tres preguntas y ninguna más: qué hay, qué falta y qué se me va a
 * echar a perder. 3 a 8 veces al día, encargado y dueño. No tiene acción
 * principal: la acción es MIRAR, y los filtros son el instrumento.
 *
 * ── Por qué los tres contadores son BOTONES ──────────────────────────────
 * Cada número dispara una decisión distinta —bajo mínimo es *qué pido*, por
 * vencer es *qué remato*, negativo es *qué entrada no capturé*— y un contador
 * que sólo informa obliga a buscar a mano las 63 filas que acaba de contar.
 * Por eso cada uno es además su filtro, con los atajos `m`, `v`, `n` y `/`, y
 * son lo más grande de la pantalla: es lo primero que se lee.
 *
 * ── Por qué «Hay» enseña las dos lentes ──────────────────────────────────
 * `238 pz (9 cj + 4)`: el tendero cuenta cajas y el sistema cuenta piezas. Sin
 * la conversión a la vista el número no se cree y se recuenta el anaquel, que
 * es justo el trabajo que esta pantalla evita. Y «Vendido 14d» en vez de «este
 * mes» porque el ciclo de compra del giro es semanal: un mes llega tarde.
 *
 * ── Ninguna marca viaja en el color ──────────────────────────────────────
 * Cada marca es la MISMA insignia en el contador y en la fila —icono y fondo—,
 * así que el ojo une el «En negativo» de arriba con la fila de abajo sin leer.
 * El negativo lleva su razón al pasar el cursor —«probablemente falta capturar
 * una entrada», que es lo que suele ser y no un robo (`03-INVENTARIO.md` §9,
 * error 2)— y la dice también al lector de pantalla. La fila lleva además su
 * tono, que nunca va solo.
 *
 * ── Tres dispositivos, tres formas, no una encogida ──────────────────────
 * PC: tabla densa, ordenable por columna —ordenar por proveedor suple el
 * desplegable que no está—. Tablet (md): pierde «Vendido 14d» y «Proveedor»,
 * porque quien la trae repone anaquel y no decide la compra. Teléfono:
 * contadores apilados y debajo SÓLO lo que urge, una lista por proveedor, que
 * es el orden del recorrido al mayorista.
 *
 * ── Qué NO va aquí ───────────────────────────────────────────────────────
 * Costos ni márgenes; el kardex, que vive en la ficha del producto; y los
 * movimientos del día, que viven en Entradas.
 *
 * ── Lo que hoy no se abre, y lo que quedó fuera de alcance ───────────────
 * Lee `Ingrediente` por el puente, que ya trae nombre, mínimo y el
 * `stock_actual` proyectado del ledger; `vendido_14d`, `caduca_el` y
 * `piezas_por_caja` viven en columnas que las migraciones de la Fase 2
 * escriben y NO aplican: hoy llegan nulas y se muestra «—» sin romper nada.
 * Los desplegables de Zona y Proveedor quedan FUERA: `ZonaAnaquel` no está
 * unida a `Ingrediente` en el mapa del puente. Se suplen con la búsqueda, con
 * el orden por columna y con el agrupado del teléfono.
 */

/** Horizonte del contador de caducidad: siete días es lo que cabe rematar. */
const DIAS_DE_AVISO = 7;
const LIMITE_LECTURA = 400;
const MILISEGUNDOS_POR_DIA = 86_400_000;
const SIN_PROVEEDOR = 'Sin proveedor';
/** Lo que no tiene fecha va al final al ordenar por «Vence», no al principio. */
const SIN_FECHA = '9999-12-31';

const FORMATO_DIA = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' });

export interface FilaExistencia {
  readonly id: string;
  readonly nombre: string;
  readonly unidad_base: string | null;
  readonly stock_actual: number | null;
  readonly stock_minimo: number | null;
  /**
   * OPCIONAL, y no `number | null`: el puente OMITE la clave cuando no la sirve.
   *
   * `undefined !== null`, así que la guarda de abajo pasaba de largo y el anaquel
   * enseñaba «21 pieza (NaN cj + NaN)» en cada renglón de la tabla. El tipo
   * opcional es lo que obliga a escribir el `?? null` en el sitio que lo lee.
   */
  readonly piezas_por_caja?: number | null;
  /**
   * NO SE SIRVEN, y el docblock de arriba ya lo decía: «hoy llegan nulas».
   *
   * Opcionales y no `number | null`, porque el puente OMITE la clave: `undefined`
   * pasaba de largo toda guarda escrita como `=== null`. Lo vendido en catorce días
   * es un agregado del ledger y la fecha de caducidad vive en `caducidades`, una
   * fila por lote: ninguna de las dos es una columna del insumo, así que ninguna
   * puede salir de esta entidad. La columna enseña «—», que es la verdad.
   */
  readonly vendido_14d?: number | null;
  readonly caduca_el?: string | null;
  readonly proveedor_nombre: string | null;
}

/** Las cuatro lentes. `todo` es la que no filtra nada. */
export type Lente = 'todo' | 'minimo' | 'vence' | 'negativo';

type Marca = Exclude<Lente, 'todo'>;

/**
 * La insignia de cada marca: su icono, su fondo y la frase que la explica. Es la
 * misma en el contador y en la fila, y la frase va al pasar el cursor y al lector.
 */
const MARCAS: Readonly<
  Record<Marca, { readonly Icono: LucideIcon; readonly fondo: string; readonly razon: string }>
> = {
  minimo: {
    Icono: ArrowDown,
    fondo: 'bg-advertencia text-advertencia-texto',
    razon: 'Por debajo del mínimo',
  },
  vence: {
    Icono: CalendarClock,
    fondo: 'bg-acento-suave text-acento-suave-texto',
    razon: 'Se vence esta semana',
  },
  negativo: {
    Icono: CircleX,
    fondo: 'bg-peligro text-peligro-texto',
    razon: 'Probablemente falta capturar una entrada',
  },
};

/** Clave, título, el pie que dice para qué sirve el número y su tecla. */
const CONTADORES = [
  { clave: 'minimo', titulo: 'Bajo mínimo', pie: 'qué pido', tecla: 'm' },
  {
    clave: 'vence',
    titulo: 'Se vence',
    pie: `en ${String(DIAS_DE_AVISO)} días · qué remato`,
    tecla: 'v',
  },
  { clave: 'negativo', titulo: 'En negativo', pie: 'revisar hoy · qué entrada falta', tecla: 'n' },
] as const;

export interface ExistenciasProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly FilaExistencia[];
  /** Hoy inyectable, para comprobar la caducidad sin viajar en el tiempo. */
  readonly ahora?: number;
}

export function esNegativo(fila: FilaExistencia): boolean {
  return (fila.stock_actual ?? 0) < 0;
}

/** Bajo mínimo excluye el negativo a propósito: son dos problemas distintos. */
export function estaBajoMinimo(fila: FilaExistencia): boolean {
  const hay = fila.stock_actual ?? 0;
  const minimo = fila.stock_minimo ?? 0;
  return minimo > 0 && hay >= 0 && hay < minimo;
}

export function seVence(fila: FilaExistencia, ahora: number): boolean {
  // `?? null` y no `=== null`: el puente OMITE la clave que no sirve, así que lo
  // que llega es `undefined` y la guarda pasaba de largo.
  const dia = fila.caduca_el ?? null;
  if (dia === null) return false;
  const fecha = Date.parse(`${dia}T00:00:00`);
  if (Number.isNaN(fecha)) return false;
  return Math.ceil((fecha - ahora) / MILISEGUNDOS_POR_DIA) <= DIAS_DE_AVISO;
}

/** `9 cj + 4`: la lente del anaquel. A granel y en negativo la conversión no significa nada. */
function lenteDeCaja(fila: FilaExistencia): string | null {
  const hay = fila.stock_actual ?? 0;
  const porCaja = fila.piezas_por_caja ?? null;
  if (porCaja === null || porCaja <= 1 || hay <= 0 || !Number.isInteger(hay)) return null;
  const cajas = Math.floor(hay / porCaja);
  if (cajas === 0) return null;
  return `${String(cajas)} cj + ${String(hay - cajas * porCaja)}`;
}

/** `238 pz (9 cj + 4)`: la lente del sistema y la del anaquel, juntas. */
export function formatoHay(fila: FilaExistencia): string {
  const hay = fila.stock_actual ?? 0;
  const unidad = fila.unidad_base ?? 'pz';
  const cantidad = Number.isInteger(hay) ? String(hay) : hay.toFixed(1);
  const caja = lenteDeCaja(fila);
  return caja === null ? `${cantidad} ${unidad}` : `${cantidad} ${unidad} (${caja})`;
}

/** Los decimales que el dato trae de verdad: `14.3 kg` no es `14 kg`, ni `0.25` es `0.3`. */
function decimalesDe(valor: number): number {
  if (Number.isInteger(valor)) return 0;
  return Math.abs(valor * 10 - Math.round(valor * 10)) < 1e-9 ? 1 : 2;
}

function fechaCorta(caduca: string | null): string {
  if (caduca === null) return '—';
  const fecha = new Date(`${caduca}T00:00:00`);
  return Number.isNaN(fecha.getTime()) ? '—' : FORMATO_DIA.format(fecha);
}

function proveedorDe(fila: FilaExistencia): string {
  return fila.proveedor_nombre ?? SIN_PROVEEDOR;
}

/** La marca de la columna «Hay». La caducidad tiene su propia columna. */
function marcaDeHay(fila: FilaExistencia): Marca | null {
  if (esNegativo(fila)) return 'negativo';
  if (estaBajoMinimo(fila)) return 'minimo';
  return null;
}

/** El tono de la fila. Nunca va solo: la insignia de la celda dice por qué. */
function tonoDe(fila: FilaExistencia): TonoDeFila | undefined {
  if (esNegativo(fila)) return 'peligro';
  if (estaBajoMinimo(fila)) return 'advertencia';
  return undefined;
}

function Insignia({ marca }: { readonly marca: Marca }) {
  const { Icono, fondo } = MARCAS[marca];
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-sm ${fondo}`}
    >
      <Icono className="size-3.5" strokeWidth={2.5} />
    </span>
  );
}

/** `texto-sutil` y no `texto-tenue`: dentro de una tabla, el tenue no llega a 4.5:1. */
function Guion() {
  return <span className="text-texto-sutil">—</span>;
}

/** Un número que puede faltar: «—» dice que el dato no llegó, y un 0 diría otra cosa. */
function CifraOGuion({ valor }: { readonly valor: number | null }) {
  if (valor === null) return <Guion />;
  return <Cifra valor={valor} decimales={decimalesDe(valor)} tamano="sm" />;
}

function CeldaHay({ fila }: { readonly fila: FilaExistencia }) {
  const hay = fila.stock_actual ?? 0;
  const marca = marcaDeHay(fila);
  const caja = lenteDeCaja(fila);
  return (
    <span
      className="inline-flex items-center justify-end gap-(--espacio-2)"
      title={marca === null ? undefined : MARCAS[marca].razon}
    >
      {marca === null ? null : <Insignia marca={marca} />}
      <Cifra
        valor={hay}
        unidad={fila.unidad_base ?? 'pz'}
        decimales={decimalesDe(hay)}
        tamano="sm"
        className={marca === 'negativo' ? 'font-semibold text-peligro' : ''}
      />
      {caja === null ? null : <span className="text-xs text-texto-sutil">({caja})</span>}
      {marca === null ? null : <span className="sr-only">· {MARCAS[marca].razon}</span>}
    </span>
  );
}

function CeldaVence({ fila, ahora }: { readonly fila: FilaExistencia; readonly ahora: number }) {
  const caduca = fila.caduca_el ?? null;
  if (caduca === null) return <Guion />;
  if (!seVence(fila, ahora)) return <span className="text-texto-sutil">{fechaCorta(caduca)}</span>;
  return (
    <span
      className="inline-flex items-center gap-(--espacio-2) font-semibold"
      title={MARCAS.vence.razon}
    >
      <Insignia marca="vence" />
      {fechaCorta(caduca)}
      <span className="sr-only">· {MARCAS.vence.razon}</span>
    </span>
  );
}

/** Las columnas de la PC y la tableta. Cada una se gana su lugar (`04-INTERFAZ` §5). */
function columnasDeExistencias(
  tituloDeProducto: string,
  ahora: number,
): readonly ColumnaDeTabla<FilaExistencia>[] {
  return [
    {
      clave: 'producto',
      titulo: tituloDeProducto,
      orden: (f) => f.nombre,
      celda: (f) => <span className="font-medium">{f.nombre}</span>,
    },
    {
      clave: 'hay',
      titulo: 'Hay',
      numerica: true,
      orden: (f) => f.stock_actual ?? 0,
      celda: (f) => <CeldaHay fila={f} />,
    },
    {
      clave: 'minimo',
      titulo: 'Mín',
      numerica: true,
      orden: (f) => f.stock_minimo ?? 0,
      celda: (f) => <CifraOGuion valor={f.stock_minimo} />,
    },
    {
      clave: 'vendido',
      titulo: 'Vendido 14d',
      numerica: true,
      desde: 'lg',
      orden: (f) => f.vendido_14d ?? -1,
      celda: (f) => <CifraOGuion valor={f.vendido_14d ?? null} />,
    },
    {
      clave: 'vence',
      titulo: 'Vence',
      orden: (f) => f.caduca_el ?? SIN_FECHA,
      celda: (f) => <CeldaVence fila={f} ahora={ahora} />,
    },
    {
      clave: 'proveedor',
      titulo: 'Proveedor',
      desde: 'lg',
      orden: proveedorDe,
      // «Sin proveedor» es la falta de un dato, no un proveedor: va en el tono sutil.
      celda: (f) => (
        <span className={f.proveedor_nombre === null ? 'text-texto-sutil' : undefined}>
          {proveedorDe(f)}
        </span>
      ),
    },
  ];
}

/**
 * Las del teléfono: la lista del mayorista. Qué, cuánto hay y cuánto debería haber
 * —la diferencia es lo que se pide—; la caducidad, si aprieta, bajo el nombre.
 */
function columnasDelRecorrido(
  tituloDeProducto: string,
  ahora: number,
): readonly ColumnaDeTabla<FilaExistencia>[] {
  return [
    {
      clave: 'producto',
      titulo: tituloDeProducto,
      celda: (f) => (
        <span className="flex flex-col gap-(--espacio-1)">
          <span className="font-medium">{f.nombre}</span>
          {seVence(f, ahora) ? (
            <span className="text-xs">
              <CeldaVence fila={f} ahora={ahora} />
            </span>
          ) : null}
        </span>
      ),
    },
    { clave: 'hay', titulo: 'Hay', numerica: true, celda: (f) => <CeldaHay fila={f} /> },
    {
      clave: 'minimo',
      titulo: 'Mín',
      numerica: true,
      celda: (f) => <CifraOGuion valor={f.stock_minimo} />,
    },
  ];
}

function Encabezado({ detalle }: { readonly detalle?: string }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-(--espacio-4) gap-y-(--espacio-1)">
      <h1 className="text-2xl font-bold">Existencias</h1>
      {detalle === undefined ? null : <p className="text-sm text-texto-sutil">{detalle}</p>}
    </header>
  );
}

const LEMA = 'Qué hay, qué falta y qué se va a echar a perder';

export function Existencias({ filasIniciales, ahora }: ExistenciasProps) {
  const voc = useVocabulario();
  const [filas, setFilas] = useState<readonly FilaExistencia[] | null>(filasIniciales ?? null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [lente, setLente] = useState<Lente>('todo');
  const [busqueda, setBusqueda] = useState('');
  const campoBusqueda = useRef<HTMLInputElement>(null);
  /**
   * El reloj NO se lee durante el render: leerlo ahí da un valor distinto en el
   * servidor y en el navegador —que es un desajuste de hidratación por
   * renglón— y encima hace del componente una función impura. Entra por el
   * efecto, en el siguiente turno del bucle.
   */
  const [reloj, setReloj] = useState<number | null>(ahora ?? null);
  useEffect(() => {
    if (ahora !== undefined) return;
    const primero = setTimeout(() => {
      setReloj(Date.now());
    });
    return () => {
      clearTimeout(primero);
    };
  }, [ahora]);
  const hoy = reloj ?? 0;

  useEffect(() => {
    if (filasIniciales !== undefined) return;
    // Centinela por señal y no por bandera: un `let vivo` el compilador lo da
    // por siempre-verdadero, y además deja la lectura sin cancelar.
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    consultarPuente<FilaExistencia>('Ingrediente', {
      orden: 'nombre',
      limite: LIMITE_LECTURA,
      signal: control.signal,
    })
      .then((leidas) => {
        if (sigueMontada()) setFilas(leidas);
      })
      .catch((fallo: unknown) => {
        if (!sigueMontada()) return;
        setError(fallo instanceof Error ? fallo.message : 'No se pudieron leer las existencias.');
      });
    return () => {
      control.abort();
    };
  }, [filasIniciales, intento]);

  /** El estado se limpia EN EL CLIC, no en el efecto: el efecto sólo lee. */
  function reintentar(): void {
    setError(null);
    setFilas(null);
    setIntento((previo) => previo + 1);
  }

  // La misma tecla devuelve a «todo»: es lo que espera quien la pulsa dos veces
  // sin mirar la pantalla.
  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => {
      const destino = evento.target;
      if (destino instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(destino.tagName)) return;
      if (evento.key === '/') {
        evento.preventDefault();
        campoBusqueda.current?.focus();
        return;
      }
      const atajos: Record<string, Lente> = { n: 'negativo', m: 'minimo', v: 'vence' };
      const pedida = atajos[evento.key.toLowerCase()];
      if (pedida !== undefined) setLente((actual) => (actual === pedida ? 'todo' : pedida));
    };
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, []);

  const datos = useMemo(() => filas ?? [], [filas]);
  const resumen = useMemo(
    () => ({
      minimo: datos.filter(estaBajoMinimo),
      vence: datos.filter((fila) => seVence(fila, hoy)),
      negativo: datos.filter(esNegativo),
    }),
    [datos, hoy],
  );

  const visibles = useMemo(() => {
    const aguja = busqueda.trim().toLowerCase();
    const delFiltro = lente === 'todo' ? datos : resumen[lente];
    return aguja === ''
      ? delFiltro
      : delFiltro.filter((fila) => fila.nombre.toLowerCase().includes(aguja));
  }, [datos, resumen, busqueda, lente]);

  // En teléfono, sin lente elegida, sólo se enseña lo que urge: la lista entera
  // en 390 px es un catálogo, y quien mira va camino al mayorista.
  const porProveedor = useMemo(() => {
    const urgentes =
      lente === 'todo' ? visibles.filter((f) => esNegativo(f) || estaBajoMinimo(f)) : visibles;
    const grupos = new Map<string, FilaExistencia[]>();
    for (const fila of urgentes) {
      const lista = grupos.get(proveedorDe(fila)) ?? [];
      lista.push(fila);
      grupos.set(proveedorDe(fila), lista);
    }
    return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es-MX'));
  }, [visibles, lente]);

  const tituloDeProducto = voc.titulo('producto');
  const columnas = useMemo(
    () => columnasDeExistencias(tituloDeProducto, hoy),
    [tituloDeProducto, hoy],
  );
  const columnasDelTelefono = useMemo(
    () => columnasDelRecorrido(tituloDeProducto, hoy),
    [tituloDeProducto, hoy],
  );

  if (error !== null) {
    // No leyó nada: no hay «último dato conocido» que enseñar, y una lista vacía
    // aquí diría que el anaquel está vacío, que es mentira.
    return (
      <div className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
        <Encabezado detalle={LEMA} />
        <ErrorDePantalla
          titulo="No se pudieron leer las existencias"
          queHacer="Sin la lectura no se sabe qué hay ni qué falta. Revisa la conexión y vuelve a intentarlo: esta pantalla sólo lee, no se cambió nada del anaquel."
          detalle={error}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </div>
    );
  }

  if (filas === null) {
    // La forma final —tres contadores, el buscador y las filas de la tabla— para
    // que la pantalla no salte al llegar el dato y el ojo ya sepa dónde mirar.
    return (
      <div className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
        <Encabezado />
        <div className="grid gap-(--espacio-3) sm:grid-cols-3">
          {CONTADORES.map(({ clave }) => (
            <Esqueleto key={clave} className="h-28 w-full rounded-lg" />
          ))}
        </div>
        <Esqueleto className="h-(--altura-control) w-full" />
        <div
          role="status"
          aria-busy="true"
          aria-label="Leyendo las existencias"
          className="flex flex-col gap-(--espacio-3)"
        >
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-(--espacio-4)">
              <Esqueleto className="h-4 flex-1" />
              <Esqueleto className="h-4 w-24" />
              <Esqueleto className="h-4 w-12" />
              <Esqueleto className="hidden h-4 w-16 lg:block" />
              <Esqueleto className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (datos.length === 0) {
    return (
      <div className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
        <Encabezado detalle={`${LEMA} · ${voc.conNumero('producto', 0)}`} />
        <Superficie relleno={4} como="section">
          <Vacio
            icono={<Boxes />}
            titulo="Aquí va a vivir tu anaquel."
            explicacion="En cuanto captures tu primera entrada de mercancía, esta pantalla te dice qué está bajo mínimo, qué se vence esta semana y qué salió en negativo porque faltó capturar algo."
            accion={
              <Button asChild>
                <a href="/inventario">Capturar mi primera entrada</a>
              </Button>
            }
          />
        </Superficie>
      </div>
    );
  }

  const aguja = busqueda.trim();
  // «Sin proveedor» NO es un proveedor al que se le pida: contado como uno, la
  // tienda que aún no asigna ninguno leía «1 proveedor». Se cuentan aparte.
  const proveedoresQueFaltan = new Set(
    resumen.minimo.flatMap((fila) => {
      const nombre = fila.proveedor_nombre ?? null;
      return nombre === null ? [] : [nombre];
    }),
  ).size;
  const sinProveedorQueFaltan = resumen.minimo.filter(
    (fila) => (fila.proveedor_nombre ?? null) === null,
  ).length;

  /**
   * El pie de cada contador. El de mínimo dice a cuántos proveedores hay que pedir,
   * y cuántos renglones no tienen a quién pedírselos.
   */
  function pieDe(clave: Marca, pie: string): string {
    if (clave !== 'minimo') return pie;
    const proveedores = proveedoresQueFaltan === 1 ? 'proveedor' : 'proveedores';
    const partes = [
      proveedoresQueFaltan === 0 ? null : `${String(proveedoresQueFaltan)} ${proveedores}`,
      sinProveedorQueFaltan === 0 ? null : `${String(sinProveedorQueFaltan)} sin proveedor`,
      pie,
    ];
    return partes.filter((parte): parte is string => parte !== null).join(' · ');
  }

  /**
   * Por qué no hay filas: la búsqueda, el filtro, o —sólo en el teléfono, que
   * enseña únicamente lo que urge— que lo encontrado no urge.
   */
  function vacioDelFiltro(enTelefono: boolean) {
    if (visibles.length === 0 && aguja !== '') {
      return (
        <Vacio
          titulo={`${voc.conDeterminante('ningun', 'producto')} lleva «${aguja}» en el nombre.`}
          className="py-(--espacio-6)"
        />
      );
    }
    if (enTelefono && lente === 'todo') {
      return (
        <Vacio
          icono={<CircleCheck />}
          titulo="Nada urgente ahora mismo."
          explicacion="El anaquel está en orden."
          className="py-(--espacio-6)"
        />
      );
    }
    return <Vacio titulo="Nada cae en este filtro. Buena señal." className="py-(--espacio-6)" />;
  }

  return (
    <div className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
      <Encabezado detalle={`${LEMA} · ${voc.conNumero('producto', datos.length)}`} />

      {/* PRIMARIO · los tres números que disparan decisión. Apilados en el teléfono,
          con el número a la derecha; en fila desde la tableta, con el número grande. */}
      <ul aria-label="Filtros" className="grid gap-(--espacio-3) sm:grid-cols-3">
        {CONTADORES.map(({ clave, titulo, pie, tecla }) => {
          const activo = lente === clave;
          const cuenta = resumen[clave].length;
          return (
            <li key={clave}>
              <Superficie
                como="button"
                type="button"
                interactiva
                activa={activo}
                aria-pressed={activo}
                aria-keyshortcuts={tecla}
                relleno={4}
                className="grid h-full w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-(--espacio-3) gap-y-(--espacio-1) sm:grid-cols-1 sm:items-start"
                onClick={() => {
                  setLente(activo ? 'todo' : clave);
                }}
              >
                <span className="flex items-center gap-(--espacio-2) text-xs font-semibold tracking-wide uppercase">
                  <Insignia marca={clave} />
                  {titulo}
                  <kbd
                    aria-hidden="true"
                    className="ml-auto hidden rounded-sm border border-borde px-(--espacio-1) font-numeros text-xs font-medium text-texto-sutil normal-case lg:inline"
                  >
                    {tecla}
                  </kbd>
                </span>
                <Cifra
                  valor={cuenta}
                  tamano="total"
                  className={`row-span-2 leading-none sm:row-span-1 ${clave === 'negativo' && cuenta > 0 ? 'text-peligro' : ''}`}
                />
                {/* La palabra, no sólo el anillo: el filtro activo se lee. */}
                <span className="text-xs text-texto-sutil">
                  {activo ? 'filtrando · toca para quitar' : pieDe(clave, pie)}
                </span>
              </Superficie>
            </li>
          );
        })}
      </ul>

      <section
        aria-label={`${voc.titulo('producto', true)} en el anaquel`}
        className="flex flex-col gap-(--espacio-3)"
      >
        <div className="flex flex-wrap items-center gap-(--espacio-2)">
          <div className="relative min-w-48 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-4 -translate-y-1/2 text-texto-sutil"
            />
            <Input
              ref={campoBusqueda}
              type="search"
              value={busqueda}
              aria-label={`Buscar ${voc.singular('producto')}`}
              aria-keyshortcuts="/"
              placeholder={`Buscar ${voc.singular('producto')}…  (tecla /)`}
              className="pl-(--espacio-8)"
              onChange={(evento) => {
                setBusqueda(evento.target.value);
              }}
            />
          </div>
          {lente !== 'todo' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setLente('todo');
              }}
            >
              Ver todo
            </Button>
          )}
        </div>

        {/* TABLET Y PC. «Vendido 14d» y «Proveedor» sólo aparecen en lg. */}
        <div className="hidden md:block">
          <Tabla
            etiqueta="Existencias"
            columnas={columnas}
            filas={visibles}
            claveDe={(f) => f.id}
            tonoDeFila={tonoDe}
            alto="max-h-[70vh]"
            vacio={vacioDelFiltro(false)}
          />
        </div>

        {/* TELÉFONO. Otra pantalla, no la misma encogida: lo que urge, por proveedor. */}
        <div className="flex flex-col gap-(--espacio-4) md:hidden">
          {porProveedor.length === 0
            ? vacioDelFiltro(true)
            : porProveedor.map(([nombre, suyas]) => (
                <section key={nombre} className="flex flex-col gap-(--espacio-2)">
                  <h2 className="flex items-baseline justify-between text-sm font-semibold tracking-wide uppercase">
                    {nombre}
                    <span className="font-numeros text-texto-sutil tabular-nums">
                      <span className="sr-only">· </span>
                      {String(suyas.length)}
                    </span>
                  </h2>
                  <Tabla
                    etiqueta={`Lo que urge de ${nombre}`}
                    columnas={columnasDelTelefono}
                    filas={suyas}
                    claveDe={(f) => f.id}
                    tonoDeFila={tonoDe}
                    alto="max-h-none"
                  />
                </section>
              ))}
        </div>
      </section>
    </div>
  );
}
