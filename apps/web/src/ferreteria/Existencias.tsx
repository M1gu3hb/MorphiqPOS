'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import {
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  ListaDeTarjetas,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
  type TonoDeFila,
} from '@morphiqpos/ui/sistema';
import {
  ArrowUp,
  Ban,
  Check,
  CircleCheck,
  FilterX,
  MapPin,
  PackageSearch,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { ErrorApi, consultarPuente } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · existencias
 *
 * Cuatro a diez veces al día, y nunca para HACER algo: para CONTESTAR algo. No
 * tiene acción principal, y por eso los cuatro números están arriba y son a la
 * vez los cuatro filtros. Un contador que no filtra obliga a leer la cifra y
 * después buscar a mano las filas que la forman: aquí el número ES la lista.
 *
 * ── Por qué el dinero dormido va primero ─────────────────────────────────
 * En `abarrotes` lo primero es «qué pido». Aquí el dolor 2 es el capital
 * parado en material que nadie pide desde hace medio año, y ese indicador no
 * existe en el otro modelo. Va en primer lugar por decisión, no por acomodo, y
 * la fila dormida lleva el mismo tono que su contador: el ojo une el número de
 * arriba con las filas de abajo sin leer.
 *
 * ── «Vendido 90 d» y no 14, y «Días inv.» en la tabla ────────────────────
 * Porque la compra es quincenal y la rotación de tres a cinco vueltas al año:
 * catorce días de historia sobre algo que se vende cada dos meses dicen cero,
 * y cero no distingue lo muerto de lo lento. Los días de inventario son la
 * traducción de «tengo mucho» a «tengo dinero parado seis meses»; la flecha
 * marca lo que pasa del umbral de su línea y «sin venta» lo que nunca se
 * vendió, que son dos cosas distintas y no se pintan con el mismo signo. Las
 * dos columnas se ordenan: ordenar por días es la lista de qué rematar.
 *
 * ── Por qué en teléfono sólo queda el dormido ────────────────────────────
 * Quien abre el teléfono es el dueño camino al mayorista, y sólo necesita qué
 * NO volver a comprar, ordenado por dinero: una tarjeta por clave, con el
 * dinero a la derecha. Seis columnas en 390 px no son una tabla, y por eso ahí
 * tampoco van el buscador ni las listas, que no filtran esa lista. Por lo mismo,
 * ahí los cuatro contadores INFORMAN y no son botones: uno que dijera «filtrando»
 * sin cambiar la lista de debajo mentiría. En tablet sí hay tabla, pero pierde
 * «Vendido 90 d» y «Proveedor»: es el aparato de quien surte en bodega, y le basta
 * cuánto hay y en qué gaveta.
 *
 * ── El dinero no es para todos, y lo que no cabe ─────────────────────────
 * Con `verDinero` apagado —mostradorista y almacén no ven costos— el primer
 * contador cuenta claves en vez de pesos, y la pregunta se sigue contestando.
 * Quedan FUERA, cada uno en su pantalla: el kardex (ficha del material), los
 * movimientos del día (Entradas) y el remate del retazo (Corte). La entidad
 * `ExistenciaMaterial` y sus columnas derivadas las escriben migraciones de la
 * Fase 2 que NO están aplicadas: contra la base de hoy la lectura vuelve vacía
 * y cae en el estado que enseña.
 */

const MILES = new Intl.NumberFormat('es-MX');

/** Pasados estos días, un rollo abierto deja de ser retazo vendible y es basura. */
const DIAS_RETAZO_VIEJO = 45;

/** Centinela de «sin filtrar»: Radix no admite una opción con `value` vacío. */
const TODAS = '·todas·';

/** Lo que nunca se vendió se ordena como lo más viejo: es lo primero que se remata. */
const NUNCA_VENDIDO = Number.MAX_SAFE_INTEGER;

/** Por debajo de `md`: el teléfono, donde la lista es sólo la del dormido. */
const TELEFONO = '(max-width: 767px)';

/**
 * Los decimales que la cantidad TRAE, hasta tres. La existencia y lo vendido son
 * `numeric(14,4)`: el cable va en metros y el clavo en kilos, y con dos decimales
 * «1.375 kg» se leería «1.38 kg», más de lo que hay. Tres son los gramos.
 */
function decimalesDe(valor: number): number {
  const [, fraccion = ''] = String(valor).split('.');
  return Math.min(fraccion.length, 3);
}

/**
 * Se decide en JS y no con `hidden md:*`, que obligaría a pintar cada contador dos
 * veces —uno que informa y otro que filtra— con el mismo texto repetido en el DOM.
 * Es el mismo gancho de `cafeteria/Barra.tsx`.
 */
function useEsTelefono(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const medio = window.matchMedia(TELEFONO);
      medio.addEventListener('change', avisar);
      return () => {
        medio.removeEventListener('change', avisar);
      };
    },
    () => window.matchMedia(TELEFONO).matches,
    () => false,
  );
}

const CONTADORES = [
  { clave: 'dormido', titulo: 'Dormido', tecla: 'd', pregunta: '¿Qué remato y qué no compro?' },
  { clave: 'bajo', titulo: 'Bajo mínimo', tecla: 'm', pregunta: '¿Qué pido?' },
  { clave: 'abiertos', titulo: 'Abiertos', tecla: 'a', pregunta: '¿Qué retazo remato ya?' },
  { clave: 'negativo', titulo: 'Negativo', tecla: 'n', pregunta: '¿Qué entrada no capturé?' },
] as const;

const LISTAS = [
  { clave: 'linea', etiqueta: 'Línea', vacio: 'todas' },
  { clave: 'gaveta', etiqueta: 'Gaveta', vacio: 'todas' },
  { clave: 'proveedor', etiqueta: 'Prov.', vacio: 'todos' },
] as const;

type ClaveContador = (typeof CONTADORES)[number]['clave'];
type ClaveLista = (typeof LISTAS)[number]['clave'];

const SIN_LISTAS: Readonly<Record<ClaveLista, string>> = {
  linea: TODAS,
  gaveta: TODAS,
  proveedor: TODAS,
};

export interface FilaDeExistencias {
  readonly id: string;
  readonly nombre: string;
  readonly linea: string;
  readonly proveedor: string;
  /** La gaveta. Sin ella el dato encuentra el material y no lo surte. */
  readonly gaveta: string;
  readonly unidad: string;
  /** Puede ser negativa: eso es justamente el cuarto contador. */
  readonly existencia: number;
  /** Rollos o tramos abiertos. Cero en lo que no es material continuo. */
  readonly piezasAbiertas: number;
  readonly diasAbiertaMasVieja: number | null;
  readonly vendido90: number;
  /** `null` = nunca se vendió, que no es lo mismo que «muchos días». */
  readonly diasInventario: number | null;
  /** El umbral es por línea: el cemento y la pulidora no se miden igual. */
  readonly umbralDiasLinea: number;
  /** `null` = clave sin mínimo marcado. Sólo rotan unas 200 de 6,000. */
  readonly minimo: number | null;
  readonly dineroParadoCentavos: number;
}

export interface ExistenciasProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly FilaDeExistencias[];
  /** Apagado para mostradorista y almacén, que no ven costos ni márgenes. */
  readonly verDinero?: boolean;
}

/**
 * La cifra grande de un contador. Pesos cuando se ven costos, claves cuando no:
 * se entrega sin formatear para que la pinten `Dinero` y `Cifra`, que son los que
 * alinean las cifras y ponen el símbolo un escalón por debajo.
 */
export type CifraDeContador =
  | { readonly tipo: 'dinero'; readonly centavos: number }
  | { readonly tipo: 'cuenta'; readonly valor: number; readonly unidad?: string };

export interface TarjetaContador {
  readonly clave: ClaveContador;
  readonly titulo: string;
  readonly tecla: string;
  readonly pregunta: string;
  readonly cifra: CifraDeContador;
  readonly nota: string;
  /** Hay algo que revisar HOY. La cifra va en el color de peligro y la nota lo dice. */
  readonly urgente: boolean;
}

/**
 * El dinero parado de una fila, en centavos. Por `centavosDe`: la unidad la dice el
 * mapa, no el nombre. Ausente suma cero, como sumaba antes.
 */
function dineroParadoDe(f: FilaDeExistencias): number {
  return centavosDe('ExistenciaMaterial', 'dineroParadoCentavos', f.dineroParadoCentavos) ?? 0;
}

export function estaDormido(f: FilaDeExistencias): boolean {
  return f.existencia > 0 && (f.diasInventario === null || f.diasInventario > f.umbralDiasLinea);
}

const PRUEBAS: Record<ClaveContador, (f: FilaDeExistencias) => boolean> = {
  dormido: estaDormido,
  bajo: (f) => f.minimo !== null && f.existencia <= f.minimo,
  abiertos: (f) => f.piezasAbiertas > 0,
  negativo: (f) => f.existencia < 0,
};

function valorDe(f: FilaDeExistencias, clave: ClaveLista): string {
  if (clave === 'linea') return f.linea;
  if (clave === 'gaveta') return f.gaveta;
  return f.proveedor;
}

/** Sólo los valores que de verdad tienen filas. Una opción vacía es una trampa. */
function opcionesDe(filas: readonly FilaDeExistencias[], clave: ClaveLista): readonly string[] {
  return [...new Set(filas.map((f) => valorDe(f, clave)))]
    .filter((v) => v !== '')
    .sort((a, b) => a.localeCompare(b, 'es-MX'));
}

/** Los cuatro números, listos para pintar. Cada cifra dispara una decisión distinta. */
export function resumir(
  filas: readonly FilaDeExistencias[],
  verDinero = true,
): readonly TarjetaContador[] {
  const dormidas = filas.filter(estaDormido);
  const abiertas = filas.filter(PRUEBAS.abiertos);
  const viejas = abiertas.filter((f) => (f.diasAbiertaMasVieja ?? 0) > DIAS_RETAZO_VIEJO).length;
  const dinero = dormidas.reduce((s, f) => s + dineroParadoDe(f), 0);
  const todo = filas.reduce((s, f) => s + dineroParadoDe(f), 0);
  const parte = todo <= 0 ? 0 : Math.round((dinero / todo) * 100);
  const claves = `${MILES.format(dormidas.length)} claves`;
  const negativas = filas.filter(PRUEBAS.negativo).length;
  // «de las 200 que rotan» es deliberado: deja claro que el mínimo sólo aplica
  // a las claves marcadas, y evita la pregunta de por qué no salen las 6,000.
  const rotan = filas.filter((f) => f.minimo !== null).length;
  const textos: Record<ClaveContador, readonly [CifraDeContador, string]> = {
    dormido: verDinero
      ? [
          { tipo: 'dinero', centavos: dinero },
          `${claves} · ${MILES.format(parte)} % del inventario`,
        ]
      : [
          { tipo: 'cuenta', valor: dormidas.length, unidad: 'claves' },
          'sin venta dentro del ciclo de su línea',
        ],
    bajo: [
      { tipo: 'cuenta', valor: filas.filter(PRUEBAS.bajo).length },
      `de las ${MILES.format(rotan)} que rotan`,
    ],
    abiertos: [
      { tipo: 'cuenta', valor: abiertas.length },
      `${MILES.format(viejas)} con más de ${MILES.format(DIAS_RETAZO_VIEJO)} días`,
    ],
    negativo: [
      { tipo: 'cuenta', valor: negativas },
      negativas === 0 ? 'nada que revisar' : 'revisar hoy',
    ],
  };
  return CONTADORES.map((c) => ({
    ...c,
    cifra: textos[c.clave][0],
    nota: textos[c.clave][1],
    urgente: c.clave === 'negativo' && negativas > 0,
  }));
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    // El límite de intentos no es un código de la API: es el 429, y vive aquí.
    if (fallo.estado === 429) return 'Demasiadas consultas seguidas. Espera unos segundos.';
    if (fallo.error.codigo === 'NO_AUTENTICADO') return 'La sesión caducó. Vuelve a entrar.';
    if (fallo.error.codigo === 'SIN_PERMISO') return 'Tu rol no alcanza a ver el inventario.';
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo leer el inventario.';
}

/** El mensaje de la red no siempre trae punto, y va seguido de otra frase. */
function conPunto(frase: string): string {
  return /[.!?]$/.test(frase.trim()) ? frase.trim() : `${frase.trim()}.`;
}

/**
 * El tono de la fila repite el de su contador: negativo en peligro, dormido en
 * advertencia. Nunca va solo: «Hay» dice «negativo» y «Días inv.» lleva su flecha
 * o su «sin venta».
 */
function tonoDe(f: FilaDeExistencias): TonoDeFila | undefined {
  if (f.existencia < 0) return 'peligro';
  if (estaDormido(f)) return 'advertencia';
  return undefined;
}

/**
 * El tinte del contador es el mismo que el de sus filas en `Tabla` (`tonoDeFila`):
 * así el ojo une el número de arriba con las filas de abajo. Sólo cuando hay
 * filas que lo lleven; un contador en cero no se tiñe.
 */
function tinteDe(t: TarjetaContador, hayDormidas: boolean): string {
  if (t.urgente) return 'bg-peligro/5';
  if (t.clave === 'dormido' && hayDormidas) return 'bg-advertencia/10';
  return '';
}

// ── Las celdas ─────────────────────────────────────────────────────────────

function CeldaHay({
  fila,
  abierta,
  alAlternar,
}: {
  readonly fila: FilaDeExistencias;
  readonly abierta: boolean;
  readonly alAlternar: () => void;
}) {
  const hay = (
    <Cifra
      valor={fila.existencia}
      decimales={decimalesDe(fila.existencia)}
      unidad={fila.unidad}
      tamano="sm"
    />
  );
  return (
    <span className="inline-flex flex-col items-end gap-(--espacio-1)">
      <span className="inline-flex items-center gap-(--espacio-2)">
        {/* Negativo es un dato que NO es verdad: falta capturar una entrada. Se dice. */}
        {fila.existencia < 0 ? (
          <span className="inline-flex items-center gap-1 font-semibold text-peligro">
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
            {hay}
            <span>negativo</span>
          </span>
        ) : (
          hay
        )}
        {/* Material continuo con rollos o tramos abiertos: el detalle, a un toque. La
            tabla se ve desde la tableta de quien surte en bodega, y es la única forma
            de ver el rollo abierto: mide el área táctil de la densidad, no menos. */}
        {fila.piezasAbiertas > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={abierta}
            aria-label={`Piezas abiertas de ${fila.nombre}`}
            onClick={alAlternar}
            className="min-h-(--area-tactil-minima) min-w-(--area-tactil-minima) font-numeros tabular-nums"
          >
            {fila.piezasAbiertas === 1 ? '+ab' : `+${MILES.format(fila.piezasAbiertas)}ct`}
          </Button>
        )}
      </span>
      {abierta && (
        <span className="text-xs text-texto-sutil">
          {MILES.format(fila.piezasAbiertas)} abiertas · la más vieja lleva{' '}
          {MILES.format(fila.diasAbiertaMasVieja ?? 0)} días
        </span>
      )}
    </span>
  );
}

function CeldaDias({ fila }: { readonly fila: FilaDeExistencias }) {
  if (fila.diasInventario === null) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold">
        <Ban aria-hidden="true" className="size-4 shrink-0" />
        sin venta
      </span>
    );
  }
  if (fila.diasInventario > fila.umbralDiasLinea) {
    return (
      <span
        className="inline-flex items-center gap-1 font-semibold"
        title={`Su línea rota en ${MILES.format(fila.umbralDiasLinea)} días`}
      >
        <ArrowUp aria-hidden="true" className="size-4 shrink-0" />
        <Cifra valor={fila.diasInventario} tamano="sm" />
        <span className="sr-only">, pasa del ciclo de su línea</span>
      </span>
    );
  }
  return <Cifra valor={fila.diasInventario} tamano="sm" />;
}

/** En negritas siempre: para quien surte en bodega es el dato que se está usando. */
function CeldaGaveta({ fila }: { readonly fila: FilaDeExistencias }) {
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      <MapPin aria-hidden="true" className="size-4 shrink-0 text-texto-sutil" />
      {fila.gaveta === '' ? (
        <span className="font-normal text-texto-sutil">sin capturar</span>
      ) : (
        fila.gaveta
      )}
    </span>
  );
}

// ── Las columnas ───────────────────────────────────────────────────────────

/** PC y tablet. Cada columna se gana su lugar (`04-INTERFAZ` · pantalla 7). */
function columnasDeLaTabla(
  tituloDeMaterial: string,
  abierta: string | null,
  alternar: (id: string) => void,
): readonly ColumnaDeTabla<FilaDeExistencias>[] {
  return [
    {
      clave: 'material',
      titulo: tituloDeMaterial,
      orden: (f) => f.nombre,
      celda: (f) => <span className="font-medium">{f.nombre}</span>,
    },
    {
      clave: 'hay',
      titulo: 'Hay',
      numerica: true,
      orden: (f) => f.existencia,
      celda: (f) => (
        <CeldaHay
          fila={f}
          abierta={abierta === f.id}
          alAlternar={() => {
            alternar(f.id);
          }}
        />
      ),
    },
    {
      clave: 'vendido',
      titulo: 'Vendido 90 d',
      numerica: true,
      desde: 'lg',
      orden: (f) => f.vendido90,
      celda: (f) => <Cifra valor={f.vendido90} decimales={decimalesDe(f.vendido90)} tamano="sm" />,
    },
    {
      clave: 'dias',
      titulo: 'Días inv.',
      numerica: true,
      orden: (f) => f.diasInventario ?? NUNCA_VENDIDO,
      celda: (f) => <CeldaDias fila={f} />,
    },
    {
      clave: 'donde',
      titulo: 'Dónde',
      orden: (f) => f.gaveta,
      celda: (f) => <CeldaGaveta fila={f} />,
    },
    {
      clave: 'proveedor',
      titulo: 'Proveedor',
      desde: 'lg',
      orden: (f) => f.proveedor,
      // «Sin proveedor» es la falta de un dato, no un proveedor: va en el tono sutil.
      celda: (f) =>
        f.proveedor === '' ? <span className="text-texto-sutil">—</span> : f.proveedor,
    },
  ];
}

/** Teléfono: la tarjeta del dormido. El nombre y, a su derecha, el dinero parado. */
function columnasDelDormido(
  tituloDeMaterial: string,
  verDinero: boolean,
): readonly ColumnaDeTabla<FilaDeExistencias>[] {
  return [
    {
      clave: 'material',
      titulo: tituloDeMaterial,
      celda: (f) => (
        <span className="flex items-baseline justify-between gap-(--espacio-3)">
          <span>{f.nombre}</span>
          {verDinero ? (
            <Dinero centavos={dineroParadoDe(f)} className="shrink-0 font-bold" />
          ) : null}
        </span>
      ),
    },
    {
      clave: 'hay',
      titulo: 'Hay',
      numerica: true,
      celda: (f) => (
        <Cifra
          valor={f.existencia}
          decimales={decimalesDe(f.existencia)}
          unidad={f.unidad}
          tamano="sm"
        />
      ),
    },
    {
      clave: 'dias',
      titulo: 'Días inv.',
      numerica: true,
      celda: (f) => <CeldaDias fila={f} />,
    },
    { clave: 'donde', titulo: 'Dónde', celda: (f) => <CeldaGaveta fila={f} /> },
  ];
}

// ── Las piezas de la pantalla ──────────────────────────────────────────────

const LEMA = 'Qué hay, qué está dormido y qué está abierto';

function Tecla({ children }: { readonly children: ReactNode }) {
  return (
    <kbd className="rounded-sm border border-borde px-(--espacio-1) font-numeros text-xs text-texto-sutil">
      {children}
    </kbd>
  );
}

function Encabezado({ detalle }: { readonly detalle?: string | undefined }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-(--espacio-4) gap-y-(--espacio-1)">
      <div>
        <h1 className="text-2xl font-bold">Existencias</h1>
        <p className="text-sm text-texto-sutil">
          {LEMA}
          {detalle === undefined ? '.' : ` · ${detalle}`}
        </p>
      </div>
      {/* Sólo donde hay teclado: en el teléfono no hay a quién enseñárselos. */}
      <p className="hidden text-xs text-texto-sutil lg:block">
        Atajos: <Tecla>/</Tecla> busca ·{' '}
        {CONTADORES.map((c) => (
          <span key={c.clave}>
            <Tecla>{c.tecla}</Tecla>{' '}
          </span>
        ))}
        filtran
      </p>
    </header>
  );
}

/** La cifra grande: lo primero que se ve, y del mismo tamaño en los cuatro. */
function CifraGrande({ tarjeta }: { readonly tarjeta: TarjetaContador }) {
  const clase = `text-3xl font-bold leading-none ${tarjeta.urgente ? 'text-peligro' : ''}`;
  if (tarjeta.cifra.tipo === 'dinero') {
    return <Dinero centavos={tarjeta.cifra.centavos} tamano="lg" className={clase} />;
  }
  const { valor, unidad } = tarjeta.cifra;
  // Con `exactOptionalPropertyTypes`, una `unidad` ausente no se pasa como `undefined`.
  return unidad === undefined ? (
    <Cifra valor={valor} tamano="lg" className={clase} />
  ) : (
    <Cifra valor={valor} unidad={unidad} tamano="lg" className={clase} />
  );
}

/**
 * Lo de dentro de un contador. Igual en el teléfono, donde informa, y desde la
 * tableta, donde además filtra: sólo ahí lleva su tecla y dice «filtrando».
 */
function ContenidoDeContador({
  tarjeta,
  filtra,
  activo,
}: {
  readonly tarjeta: TarjetaContador;
  readonly filtra: boolean;
  readonly activo: boolean;
}) {
  return (
    <>
      <span className="flex items-center gap-(--espacio-2) text-xs font-semibold tracking-wide text-texto-sutil uppercase">
        {tarjeta.titulo}
        {/* La palabra, no sólo el anillo: el filtro activo se lee. */}
        {filtra && activo ? (
          <span className="ml-auto inline-flex items-center gap-1 text-texto normal-case">
            <Check aria-hidden="true" className="size-4" />
            filtrando
          </span>
        ) : null}
        {filtra && !activo ? (
          <kbd
            aria-hidden="true"
            className="ml-auto hidden rounded-sm border border-borde px-(--espacio-1) font-numeros font-medium normal-case lg:inline"
          >
            {tarjeta.tecla}
          </kbd>
        ) : null}
      </span>
      <span className="row-span-2 sm:row-span-1">
        <CifraGrande tarjeta={tarjeta} />
      </span>
      <span className="text-xs text-texto-sutil">{tarjeta.nota}</span>
      {filtra ? (
        <span className="sr-only">
          {tarjeta.pregunta} Atajo: {tarjeta.tecla}. {activo ? 'Filtro activo.' : ''}
        </span>
      ) : null}
    </>
  );
}

const MARCO = 'flex flex-col gap-(--espacio-4) p-(--espacio-4) md:p-(--espacio-6)';

export function Existencias({ filasIniciales, verDinero = true }: ExistenciasProps) {
  const voc = useVocabulario();
  const [filas, setFilas] = useState<readonly FilaDeExistencias[] | null>(filasIniciales ?? null);
  const [contador, setContador] = useState<ClaveContador | null>(null);
  const [consulta, setConsulta] = useState('');
  const [listas, setListas] = useState<Record<ClaveLista, string>>(SIN_LISTAS);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cada lectura es un número: el botón de reintentar lo sube y el efecto lee otra
  // vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const buscador = useRef<HTMLInputElement>(null);
  const esTelefono = useEsTelefono();

  useEffect(() => {
    if (filasIniciales !== undefined) return;
    // El centinela es el propio `signal`: una bandera booleana la da el
    // compilador por siempre-verdadera y la comprobación se vuelve código muerto.
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    consultarPuente<FilaDeExistencias>('ExistenciaMaterial', {
      limite: 6000,
      signal: control.signal,
    })
      .then((leidas) => {
        if (sigueMontada()) setFilas(leidas);
      })
      .catch((fallo: unknown) => {
        // La pantalla lee UNA vez: sólo vuelve a leer desde su error, así que un
        // fallo siempre es «no leyó nada» y se pinta como tal, no como un aviso
        // sobre un último dato que no hay.
        if (sigueMontada()) setError(mensajeDe(fallo));
      });
    return () => {
      control.abort();
    };
  }, [filasIniciales, intento]);

  /** Vuelve a leer desde el error: mientras, la forma de la pantalla y no una rueda. */
  function reintentar(): void {
    setError(null);
    setIntento((previo) => previo + 1);
  }

  function quitarFiltros(): void {
    setContador(null);
    setConsulta('');
    setListas(SIN_LISTAS);
  }

  useEffect(() => {
    function alTeclear(evento: KeyboardEvent): void {
      if (evento.target instanceof HTMLInputElement) return;
      if (evento.ctrlKey || evento.altKey || evento.metaKey) return;
      if (evento.key === '/') {
        evento.preventDefault();
        buscador.current?.focus();
        return;
      }
      const elegido = CONTADORES.find((c) => c.tecla === evento.key.toLowerCase());
      if (elegido === undefined) return;
      setContador((actual) => (actual === elegido.clave ? null : elegido.clave));
    }
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, []);

  const tarjetas = useMemo(() => resumir(filas ?? [], verDinero), [filas, verDinero]);
  const visibles = useMemo(() => {
    const texto = consulta.trim().toLowerCase();
    return (filas ?? [])
      .filter((f) => {
        if (contador !== null && !PRUEBAS[contador](f)) return false;
        const fuera = LISTAS.some(
          (l) => listas[l.clave] !== TODAS && valorDe(f, l.clave) !== listas[l.clave],
        );
        return !fuera && (texto === '' || `${f.nombre} ${f.gaveta}`.toLowerCase().includes(texto));
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-MX'));
  }, [filas, contador, consulta, listas]);
  const dormidas = useMemo(
    () => (filas ?? []).filter(estaDormido).sort((a, b) => dineroParadoDe(b) - dineroParadoDe(a)),
    [filas],
  );
  const tituloDeMaterial = voc.titulo('producto');
  const columnas = useMemo(
    () =>
      columnasDeLaTabla(tituloDeMaterial, detalle, (id) => {
        setDetalle((actual) => (actual === id ? null : id));
      }),
    [tituloDeMaterial, detalle],
  );
  const columnasDelTelefono = useMemo(
    () => columnasDelDormido(tituloDeMaterial, verDinero),
    [tituloDeMaterial, verDinero],
  );

  if (error !== null) {
    // No leyó nada: no hay último dato que enseñar, y una lista vacía aquí diría
    // que la bodega está vacía, que es mentira.
    return (
      <div className={MARCO}>
        <Encabezado />
        <ErrorDePantalla
          titulo="No se pudo leer el inventario"
          queHacer={`${conPunto(error)} Esta pantalla sólo lee: no se cambió nada del inventario. Vuelve a leerlo cuando se resuelva.`}
          reintentar={<Button onClick={reintentar}>Volver a leer</Button>}
        />
      </div>
    );
  }

  if (filas === null) {
    // La forma final —cuatro contadores, la barra de filtros y las filas de la
    // tabla— y no una rueda: al llegar el dato nada salta de sitio.
    return (
      <div className={MARCO}>
        <Encabezado />
        <div className="grid grid-cols-1 gap-(--espacio-2) sm:grid-cols-2 sm:gap-(--espacio-3) xl:grid-cols-4">
          {CONTADORES.map((c) => (
            <Esqueleto key={c.clave} className="h-20 w-full rounded-lg sm:h-28" />
          ))}
        </div>
        <Esqueleto className="hidden h-(--altura-control) w-full md:block" />
        <div
          role="status"
          aria-busy="true"
          aria-label="Leyendo las existencias"
          className="flex flex-col gap-(--espacio-3)"
        >
          {/* PC y tablet: renglones con las columnas de la tabla. */}
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="hidden items-center gap-(--espacio-4) md:flex">
              <Esqueleto className="h-4 flex-1" />
              <Esqueleto className="h-4 w-20" />
              <Esqueleto className="hidden h-4 w-16 lg:block" />
              <Esqueleto className="h-4 w-12" />
              <Esqueleto className="h-4 w-12" />
              <Esqueleto className="hidden h-4 w-24 lg:block" />
            </div>
          ))}
          {/* Teléfono: las tarjetas del dormido. */}
          {Array.from({ length: 4 }, (_, i) => (
            <Esqueleto
              key={`tarjeta-${String(i)}`}
              className="h-(--espacio-16) w-full rounded-lg md:hidden"
            />
          ))}
        </div>
      </div>
    );
  }

  const cuantas = `${MILES.format(filas.length)} ${
    filas.length === 1 ? voc.singular('producto') : voc.plural('producto')
  }`;
  const hayFiltros =
    contador !== null || consulta.trim() !== '' || LISTAS.some((l) => listas[l.clave] !== TODAS);

  return (
    <div className={MARCO}>
      <Encabezado detalle={filas.length === 0 ? undefined : cuantas} />

      {filas.length === 0 ? (
        // El vacío ENSEÑA: dice qué cuatro preguntas contesta esta pantalla y
        // por dónde entra el primer dato. No se disculpa por estar vacía.
        <Superficie relleno={4} como="section">
          <Vacio
            className="py-(--espacio-6)"
            icono={<PackageSearch />}
            titulo="Todavía no hay existencias que leer"
            explicacion="En cuanto entre la primera nota de proveedor, aquí se contestan cuatro preguntas sin abrir un solo reporte:"
            accion={
              <Button asChild>
                <a href="/ferreteria/entradas">Recibir la primera nota</a>
              </Button>
            }
          >
            <ul className="flex flex-col gap-1 text-left text-sm">
              {CONTADORES.map((c) => (
                <li key={c.clave}>
                  <span className="font-medium">{c.titulo}</span> · {c.pregunta}
                </li>
              ))}
            </ul>
          </Vacio>
        </Superficie>
      ) : (
        <>
          {/* PRIMARIO · los cuatro números. Desde la tableta SON los cuatro filtros de
              la tabla. En el teléfono, apilados con la cifra a la derecha, informan:
              debajo va sólo el dormido (`04-INTERFAZ` · pantalla 7) y un botón que
              dijera «filtrando» sin cambiar esa lista mentiría. */}
          <ul
            aria-label={esTelefono ? 'Contadores' : 'Filtros'}
            className="grid grid-cols-1 gap-(--espacio-2) sm:grid-cols-2 sm:gap-(--espacio-3) xl:grid-cols-4"
          >
            {tarjetas.map((t) => {
              const activo = contador === t.clave;
              const forma = `grid h-full w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-(--espacio-3) gap-y-(--espacio-1) sm:grid-cols-1 sm:items-start sm:p-(--espacio-4) ${tinteDe(t, dormidas.length > 0)}`;
              return (
                <li key={t.clave}>
                  {esTelefono ? (
                    <Superficie relleno={3} className={forma}>
                      <ContenidoDeContador tarjeta={t} filtra={false} activo={false} />
                    </Superficie>
                  ) : (
                    <Superficie
                      como="button"
                      type="button"
                      interactiva
                      activa={activo}
                      aria-pressed={activo}
                      aria-keyshortcuts={t.tecla}
                      title={t.pregunta}
                      relleno={3}
                      onClick={() => {
                        setContador(activo ? null : t.clave);
                      }}
                      className={forma}
                    >
                      <ContenidoDeContador tarjeta={t} filtra activo={activo} />
                    </Superficie>
                  )}
                </li>
              );
            })}
          </ul>

          {/* PC y tablet: la tabla, con sus filtros. En tablet caen «Vendido 90 d» y
              «Proveedor». En el teléfono no va: ahí la lista es otra. */}
          <section
            aria-label={`${voc.titulo('producto', true)} en existencia`}
            className="hidden flex-col gap-(--espacio-3) md:flex"
          >
            <div className="flex flex-wrap items-center gap-(--espacio-2)">
              <div className="relative w-full sm:w-72">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-4 -translate-y-1/2 text-texto-sutil"
                />
                <Input
                  ref={buscador}
                  type="search"
                  value={consulta}
                  onChange={(evento) => {
                    setConsulta(evento.target.value);
                  }}
                  aria-label={`Buscar ${voc.singular('producto')} o gaveta`}
                  aria-keyshortcuts="/"
                  placeholder={`Buscar ${voc.singular('producto')} o gaveta`}
                  className="pl-(--espacio-8)"
                />
              </div>
              {LISTAS.map((l) => (
                <Select
                  key={l.clave}
                  value={listas[l.clave]}
                  onValueChange={(valor) => {
                    setListas((actual) => ({ ...actual, [l.clave]: valor }));
                  }}
                >
                  <SelectTrigger aria-label={l.etiqueta} className="w-full sm:w-44">
                    <SelectValue placeholder={l.etiqueta} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODAS}>{`${l.etiqueta}: ${l.vacio}`}</SelectItem>
                    {opcionesDe(filas, l.clave).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
              {hayFiltros && (
                <Button type="button" variant="ghost" size="sm" onClick={quitarFiltros}>
                  <FilterX aria-hidden="true" />
                  Quitar filtros
                </Button>
              )}
              {/* El número ES la lista: cuántas claves quedan con estos filtros. */}
              <p aria-live="polite" className="ml-auto text-sm text-texto-sutil">
                <span className="font-numeros tabular-nums">{MILES.format(visibles.length)}</span>{' '}
                de <span className="font-numeros tabular-nums">{MILES.format(filas.length)}</span>{' '}
                claves
              </p>
            </div>

            <Tabla
              etiqueta="Existencias"
              columnas={columnas}
              filas={visibles}
              claveDe={(f) => f.id}
              tonoDeFila={tonoDe}
              alto="max-h-[65vh]"
              vacio={
                <Vacio
                  titulo="Ninguna clave cumple estos filtros."
                  explicacion="Quita uno y vuelve a mirar."
                  className="py-(--espacio-6)"
                />
              }
            />
          </section>

          {/* Teléfono: sólo el dormido, ordenado por dinero. Es lo que se mira
              camino al mayorista, y lo único que cabe honestamente en 390 px. */}
          <section
            className="flex flex-col gap-(--espacio-2) md:hidden"
            aria-label={`${voc.titulo('producto')} dormid${voc.terminacion('producto')}, ordenad${voc.terminacion('producto')} por dinero`}
          >
            <h2 className="text-sm font-semibold">Dormido · lo que no hay que volver a pedir</h2>
            <ListaDeTarjetas
              columnas={columnasDelTelefono}
              filas={dormidas}
              claveDe={(f) => f.id}
              principal="material"
              vacio={
                <Vacio
                  icono={<CircleCheck />}
                  titulo="Nada dormido."
                  explicacion="Todo lo que hay se mueve dentro del ciclo de su línea."
                  className="py-(--espacio-6)"
                />
              }
            />
          </section>
        </>
      )}
    </div>
  );
}
