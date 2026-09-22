'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Superficie, Vacio } from '@morphiqpos/ui/sistema';
import { PackageSearch } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@morphiqpos/ui/primitivas/table';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ErrorApi, consultarPuente } from '~/cliente/api';
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
 * existe en el otro modelo. Va en primer lugar por decisión, no por acomodo.
 *
 * ── «Vendido 90 d» y no 14, y «Días de inventario» en la tabla ───────────
 * Porque la compra es quincenal y la rotación de tres a cinco vueltas al año:
 * catorce días de historia sobre algo que se vende cada dos meses dicen cero,
 * y cero no distingue lo muerto de lo lento. Los días de inventario son la
 * traducción de «tengo mucho» a «tengo dinero parado seis meses»; el `▲` marca
 * lo que pasa del umbral de su línea y `▲ sin venta` lo que nunca se vendió,
 * que son dos cosas distintas y no se pueden pintar con el mismo signo.
 *
 * ── Por qué en teléfono sólo queda el dormido ────────────────────────────
 * Quien abre el teléfono es el dueño camino al mayorista, y sólo necesita qué
 * NO volver a comprar, ordenado por dinero. Seis columnas en 390 px no son una
 * tabla. En tablet sí hay tabla, pero pierde «Vendido 90 d» y «Proveedor»: es
 * el aparato de quien surte en bodega, y le basta cuánto hay y dónde está.
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

const MXN = { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 } as const;
const PESOS = new Intl.NumberFormat('es-MX', MXN);
const MILES = new Intl.NumberFormat('es-MX');

/** Pasados estos días, un rollo abierto deja de ser retazo vendible y es basura. */
const DIAS_RETAZO_VIEJO = 45;

/** Centinela de «sin filtrar»: Radix no admite una opción con `value` vacío. */
const TODAS = '·todas·';

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

export interface TarjetaContador {
  readonly clave: ClaveContador;
  readonly titulo: string;
  readonly tecla: string;
  readonly pregunta: string;
  readonly cifra: string;
  readonly nota: string;
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

const cantidadDe = (f: FilaDeExistencias): string => `${MILES.format(f.existencia)} ${f.unidad}`;

/** Los cuatro números ya redactados. Cada cifra dispara una decisión distinta. */
export function resumir(
  filas: readonly FilaDeExistencias[],
  verDinero = true,
): readonly TarjetaContador[] {
  const dormidas = filas.filter(estaDormido);
  const abiertas = filas.filter(PRUEBAS.abiertos);
  const viejas = abiertas.filter((f) => (f.diasAbiertaMasVieja ?? 0) > DIAS_RETAZO_VIEJO).length;
  const dinero = dormidas.reduce((s, f) => s + f.dineroParadoCentavos, 0);
  const todo = filas.reduce((s, f) => s + f.dineroParadoCentavos, 0);
  const parte = todo <= 0 ? 0 : Math.round((dinero / todo) * 100);
  const claves = `${MILES.format(dormidas.length)} claves`;
  const negativas = filas.filter(PRUEBAS.negativo).length;
  // «de las 200 que rotan» es deliberado: deja claro que el mínimo sólo aplica
  // a las claves marcadas, y evita la pregunta de por qué no salen las 6,000.
  const rotan = filas.filter((f) => f.minimo !== null).length;
  const textos: Record<ClaveContador, readonly [string, string]> = {
    dormido: verDinero
      ? [PESOS.format(dinero / 100), `${claves} · ${MILES.format(parte)} % del inventario`]
      : [claves, 'sin venta dentro del ciclo de su línea'],
    bajo: [
      MILES.format(filas.filter(PRUEBAS.bajo).length),
      `de las ${MILES.format(rotan)} que rotan`,
    ],
    abiertos: [MILES.format(abiertas.length), `${MILES.format(viejas)} con más de 45 días`],
    negativo: [MILES.format(negativas), negativas === 0 ? 'nada que revisar' : 'revisar hoy'],
  };
  return CONTADORES.map((c) => ({ ...c, cifra: textos[c.clave][0], nota: textos[c.clave][1] }));
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

export function Existencias({ filasIniciales, verDinero = true }: ExistenciasProps) {
  const voc = useVocabulario();
  const [filas, setFilas] = useState<readonly FilaDeExistencias[] | null>(filasIniciales ?? null);
  const [contador, setContador] = useState<ClaveContador | null>(null);
  const [consulta, setConsulta] = useState('');
  const [listas, setListas] = useState<Record<ClaveLista, string>>({
    linea: TODAS,
    gaveta: TODAS,
    proveedor: TODAS,
  });
  const [detalle, setDetalle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const buscador = useRef<HTMLInputElement>(null);

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
        // La pantalla NO se vacía por un error de red: se avisa y se deja ver el
        // último dato conocido, que para decidir una compra sigue sirviendo.
        if (!sigueMontada()) return;
        setFilas((actuales) => actuales ?? []);
        setError(mensajeDe(fallo));
      });
    return () => {
      control.abort();
    };
  }, [filasIniciales]);

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
    () =>
      (filas ?? [])
        .filter(estaDormido)
        .sort((a, b) => b.dineroParadoCentavos - a.dineroParadoCentavos),
    [filas],
  );

  if (filas === null) {
    // Esqueletos con la forma de lo que viene, no un giro: así nada salta de
    // sitio al llegar los datos y el ojo ya sabe dónde va a mirar.
    return (
      <div className="p-(--espacio-4) md:p-(--espacio-6)">
        <h1 className="mb-(--espacio-4) text-2xl font-bold">Existencias</h1>
        <div className="mb-(--espacio-4) grid grid-cols-1 gap-(--espacio-3) sm:grid-cols-2 xl:grid-cols-4">
          {CONTADORES.map((c) => (
            <Skeleton key={c.clave} className="h-24 w-full rounded-lg" />
          ))}
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="mb-2 h-5 w-full rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-(--espacio-4) md:p-(--espacio-6)">
      <header className="mb-(--espacio-4)">
        <h1 className="text-2xl font-bold">Existencias</h1>
        <p className="text-sm text-texto-sutil">
          Qué hay, qué está dormido y qué está abierto. Atajos: «/» busca ·{' '}
          {CONTADORES.map((c) => c.tecla).join(' · ')} filtran.
        </p>
      </header>

      {error !== null && (
        <p role="alert" className="mb-(--espacio-3) rounded-md border border-peligro p-2 text-sm">
          {error} · Se muestra el último dato conocido.
        </p>
      )}

      {/* Los cuatro números SON los cuatro filtros. Apilados en teléfono. */}
      <ul className="mb-(--espacio-4) grid grid-cols-1 gap-(--espacio-3) sm:grid-cols-2 xl:grid-cols-4">
        {tarjetas.map((t) => {
          const activo = contador === t.clave;
          return (
            <li key={t.clave}>
              <button
                type="button"
                aria-pressed={activo}
                onClick={() => {
                  setContador(activo ? null : t.clave);
                }}
                className={`w-full rounded-lg border-2 p-(--espacio-3) text-left transition-colors ${
                  activo
                    ? 'border-primario bg-primario/15 text-texto'
                    : 'border-borde bg-superficie text-texto hover:bg-acento-suave'
                }`}
              >
                <span className="block text-xs font-medium uppercase text-texto-sutil">
                  {t.titulo}
                </span>
                <span className="block text-2xl font-bold leading-tight">{t.cifra}</span>
                <span className="block text-xs text-texto-sutil">{t.nota}</span>
                {/* El recuadro marcado no puede ser la única señal de «filtrado». */}
                <span className="sr-only">
                  {t.pregunta} Atajo: {t.tecla}. {activo ? 'Filtro activo.' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

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
          <div className="mb-(--espacio-3) flex flex-wrap items-center gap-2">
            <Input
              ref={buscador}
              value={consulta}
              onChange={(evento) => {
                setConsulta(evento.target.value);
              }}
              aria-label={`Buscar ${voc.singular('producto')} o gaveta`}
              placeholder={`Buscar ${voc.singular('producto')} o gaveta`}
              className="w-full sm:w-72"
            />
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
          </div>

          {/* PC y tablet: tabla. En tablet caen «Vendido 90 d» y «Proveedor». */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{voc.titulo('producto')}</TableHead>
                  <TableHead className="text-right">Hay</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Vendido 90 d</TableHead>
                  <TableHead className="text-right">Días inv.</TableHead>
                  <TableHead>Dónde</TableHead>
                  <TableHead className="hidden lg:table-cell">Proveedor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.nombre}</TableCell>
                    <TableCell className="text-right">
                      {f.existencia < 0 ? (
                        <Badge variant="destructive">{cantidadDe(f)} · negativo</Badge>
                      ) : (
                        cantidadDe(f)
                      )}
                      {f.piezasAbiertas > 0 && (
                        <button
                          type="button"
                          aria-expanded={detalle === f.id}
                          aria-label={`Piezas abiertas de ${f.nombre}`}
                          onClick={() => {
                            setDetalle(detalle === f.id ? null : f.id);
                          }}
                          className="ml-1 rounded border border-borde px-1 text-xs hover:bg-acento-suave"
                        >
                          {f.piezasAbiertas === 1 ? '+ab' : `+${MILES.format(f.piezasAbiertas)}ct`}
                        </button>
                      )}
                      {detalle === f.id && (
                        <span className="block text-xs text-texto-sutil">
                          {MILES.format(f.piezasAbiertas)} abiertas · la más vieja lleva{' '}
                          {MILES.format(f.diasAbiertaMasVieja ?? 0)} días
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right lg:table-cell">
                      {MILES.format(f.vendido90)}
                    </TableCell>
                    <TableCell className="text-right">
                      {f.diasInventario === null ? (
                        <Badge variant="destructive">▲ sin venta</Badge>
                      ) : f.diasInventario > f.umbralDiasLinea ? (
                        <Badge variant="destructive">▲ {MILES.format(f.diasInventario)} días</Badge>
                      ) : (
                        `${MILES.format(f.diasInventario)} días`
                      )}
                    </TableCell>
                    <TableCell>{f.gaveta}</TableCell>
                    <TableCell className="hidden lg:table-cell">{f.proveedor}</TableCell>
                  </TableRow>
                ))}
                {visibles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-texto-sutil">
                      Ninguna clave cumple estos filtros. Quita uno y vuelve a mirar.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Teléfono: sólo el dormido, ordenado por dinero. Es lo que se mira
              camino al mayorista, y lo único que cabe honestamente en 390 px. */}
          <section
            className="md:hidden"
            aria-label={`${voc.titulo('producto')} dormid${voc.terminacion('producto')}, ordenad${voc.terminacion('producto')} por dinero`}
          >
            <h2 className="mb-2 text-sm font-semibold">
              Dormido · lo que no hay que volver a pedir
            </h2>
            {dormidas.length === 0 ? (
              <p className="text-sm text-texto-sutil">
                Nada dormido: todo lo que hay se mueve dentro del ciclo de su línea.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {dormidas.map((f) => (
                  <li
                    key={f.id}
                    className="rounded-lg border border-borde bg-superficie p-(--espacio-3)"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-texto">{f.nombre}</span>
                      {verDinero && (
                        <span className="shrink-0 font-bold">
                          {PESOS.format(f.dineroParadoCentavos / 100)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-texto-sutil">
                      {cantidadDe(f)} ·{' '}
                      {f.diasInventario === null
                        ? 'sin venta nunca'
                        : `${MILES.format(f.diasInventario)} días de inventario`}{' '}
                      · {f.gaveta}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
