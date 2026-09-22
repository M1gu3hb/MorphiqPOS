'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@morphiqpos/ui/primitivas/dialog';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Vacio } from '@morphiqpos/ui/sistema';
import { Milk } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@morphiqpos/ui/primitivas/table';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

import {
  avisoDeConteoInvalido,
  cartonesDe,
  primeraLecheInvalida,
  seCuentaPorCartones,
  type ConteoTecleado,
} from './conteo-de-leche';

/**
 * PANTALLA · cafeteria · inventario
 *
 * Se abre 2–4 veces al día, y casi nunca para «consultar»: se abre porque
 * alguien está de pie frente al refrigerador con la puerta abierta.
 *
 * ── Por qué «días que alcanza» va ANTES de la existencia ─────────────────
 * `Leche entera · 1.5 días · 14 L` se resuelve de un golpe. `Leche entera ·
 * 14 L · mínimo 20 L` obliga a restar dos números para llegar a la única
 * pregunta que se estaba haciendo: ¿llego a la entrega? La columna que
 * `restaurante` no tiene es justo la que aquí manda, y por eso es la primera
 * después del nombre. El cálculo divide entre el consumo teórico del MISMO
 * día de la semana promediado sobre cuatro semanas —un martes no consume
 * como un sábado— y ese promedio lo sirve el servidor, no el navegador.
 *
 * ── Por qué familias y no abecedario ─────────────────────────────────────
 * Leche · Café · Empaque · Ingredientes · Alimentos son las familias por las
 * que se cuenta (`03-INVENTARIO.md` §6), y son las mismas por las que se
 * CAMINA el local. Nadie recorre una cafetería en orden alfabético. Dentro de
 * cada familia manda la urgencia, para que lo que no llega a la entrega no
 * quede en la posición que le tocó por casualidad.
 *
 * ── Por qué el conteo de leche es un botón grande y no una fila más ──────
 * Porque es otra tarea: noventa segundos, al cierre, con la jarra en la mano.
 * Y porque al terminar tiene que enseñar las tres cosas juntas —contado,
 * teórico y % de merma con semáforo— sin ir a ningún otro lado. Si el % de
 * merma viviera en un reporte, nadie lo vería nunca.
 *
 * ── Tres formatos, y no uno encogido ─────────────────────────────────────
 * PC: tabla densa por familia, que es como se revisa sentada. Tablet:
 * tarjetas de dos columnas, para leerse caminando con una mano. Teléfono:
 * una columna y el ajuste con `+` y `−` grandes, que es lo único que se hace
 * de pie. El formato se decide en JS: pintarlo dos veces con `hidden lg:*`
 * haría que el lector de pantalla leyera cada insumo dos veces.
 *
 * ── Lo que NO va aquí ────────────────────────────────────────────────────
 * El costo del insumo cuando el rol es barista sin permiso de costos. No lo
 * decide esta pantalla: el puente recorta `costo_por_unidad_base` campo por
 * campo, así que aquí ni se pide.
 *
 * ── Lo que hoy no se puede abrir, y qué queda fuera de alcance ───────────
 * `consumo_diario` y la entidad `LoteGrano` los declaran las migraciones de
 * la Fase 2 y el puente todavía no los expone: sin ellos los días leen «sin
 * dato» —la urgencia cae entonces a los umbrales de mínimo y crítico, que sí
 * existen— y la tarjeta del grano sólo aparece si llega por prop. Tampoco hay
 * `Almacen` en el puente: el almacén sale del último movimiento del ledger,
 * que en una cafetería es siempre el mismo, y sin él el ajuste se deshabilita
 * en vez de fallar al pulsar. Recortados para caber en un archivo: el
 * buscador por código de barras y el histórico por insumo.
 */

/** Rutas declaradas en `05-DATOS-Y-BACKEND.md` §6. Ninguna se inventa aquí. */
const RUTA_AJUSTAR = '/api/inventario/ajustar';
const RUTA_CONTAR_LECHE = '/api/cafeteria/contar-leche';

const CONSULTA_PC = '(min-width: 1024px)';
/** Lo que separa «me aguanta» de «no llega»: el hueco hasta la próxima entrega. */
const DIAS_HASTA_ENTREGA = 2;
const DIAS_GRANO_AMBAR = 25;
const DIAS_GRANO_ROJO = 30;

const TARJETA = 'rounded-lg border border-borde bg-superficie p-(--espacio-3) text-texto shadow-1';
const CHIP = 'rounded-md px-2 py-1 text-xs font-semibold';

/** Las cinco familias, en el orden en que se camina el local. */
const FAMILIAS = ['Leche', 'Café', 'Empaque', 'Ingredientes', 'Alimentos'] as const;
type Familia = (typeof FAMILIAS)[number];

/** Pistas sin acentos: el texto se normaliza antes de buscarlas. */
const PISTAS: readonly (readonly [Familia, readonly string[]])[] = [
  ['Leche', ['leche', 'lactea', 'crema']],
  ['Café', ['cafe', 'grano', 'espresso']],
  ['Empaque', ['vaso', 'tapa', 'manga', 'servilleta', 'popote', 'empaque', 'bolsa']],
  // `bagel` entra porque sin él «Bagel integral con queso crema» no cae en ninguna
  // pista de comida y acababa en Ingredientes. Un bagel se camina con el pan.
  ['Alimentos', ['pan', 'galleta', 'panader', 'sandwich', 'reposter', 'bagel', 'bollo']],
];

/** Los nombres son los del PUENTE, en snake_case. Aquí no se traduce nada. */
export interface InsumoDeInventario {
  readonly id: string;
  readonly nombre: string;
  readonly unidad_base: string | null;
  readonly categoria_nombre: string | null;
  readonly stock_actual: number | null;
  readonly stock_minimo: number | null;
  readonly stock_critico: number | null;
  /**
   * Consumo teórico del mismo día de la semana sobre cuatro semanas.
   *
   * OPCIONAL, y no `number | null`: el puente NO lo sirve todavía —`Ingrediente` no
   * lo declara, porque es un promedio de cuatro semanas y no una columna— y omite
   * la clave. `undefined !== null`, así que la guarda de `diasQueAlcanza` pasaba de
   * largo, dividía por `undefined` y la alacena enseñaba «NaN días» en cada
   * renglón. Con el tipo opcional, el `?? null` es obligatorio y la pantalla dice
   * «sin dato», que es la verdad: la urgencia se decide entonces por el mínimo y el
   * crítico, que sí llegan.
   */
  readonly consumo_diario?: number | null;
  readonly activo: boolean | null;
}

export interface LoteDeGrano {
  readonly id: string;
  readonly fecha_tueste: string | null;
}

export interface InventarioProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly InsumoDeInventario[];
  readonly loteGranoInicial?: LoteDeGrano;
  readonly almacenId?: string;
}

interface Urgencia {
  readonly orden: number;
  readonly palabra: string;
  readonly clase: string;
}

interface ResultadoConteo {
  readonly contado: number;
  readonly teorico: number;
  readonly mermaPorcentaje: number;
}

function sinAcentos(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function familiaDe(insumo: InsumoDeInventario): Familia {
  const texto = sinAcentos(`${insumo.categoria_nombre ?? ''} ${insumo.nombre}`);
  for (const [familia, pistas] of PISTAS) {
    if (!pistas.some((pista) => texto.includes(pista))) continue;
    /**
     * LA FAMILIA «LECHE» ES LÍQUIDA, Y LA PISTA `crema` NO LO SABÍA.
     *
     * «Bagel integral con queso crema» —`unidad_base` = `pieza`— caía en Leche por
     * esa pista, se pintaba entre las leches y el diálogo ofrecía contarlo POR
     * CARTONES. El comando lo rechazaba con `CONFIGURACION_INVALIDA`, que sale como
     * 400: el rastreador lo cazó tres veces y le pasa a un barista cada vez que abre
     * el conteo. Lo mismo hará cualquier «pan con crema» o «pastel de crema».
     *
     * No se quita la pista —«Crema para batir» sí es leche y sí se cuenta— sino que
     * la familia exige la unidad que la hace significar algo, que es la MISMA regla
     * que el comando aplica. Lo que no encaja sigue buscando familia abajo.
     */
    if (familia === 'Leche' && !seCuentaPorCartones(insumo.unidad_base)) continue;
    return familia;
  }
  return 'Ingredientes';
}

/** Existencia ÷ consumo teórico. Sin consumo no hay días, y se dice. */
export function diasQueAlcanza(insumo: InsumoDeInventario): number | null {
  const consumo = insumo.consumo_diario ?? null;
  const stock = insumo.stock_actual;
  if (consumo === null || stock === null || consumo <= 0) return null;
  return Math.round((stock / consumo) * 10) / 10;
}

/** El color nunca va solo: cada tramo trae su palabra. */
export function urgenciaDe(insumo: InsumoDeInventario): Urgencia {
  const dias = diasQueAlcanza(insumo);
  const stock = insumo.stock_actual ?? 0;
  const critico = insumo.stock_critico;
  const minimo = insumo.stock_minimo;
  if ((dias !== null && dias < 1) || (critico !== null && stock <= critico)) {
    return { orden: 0, palabra: 'no llega a mañana', clase: 'bg-peligro/25 text-texto' };
  }
  if ((dias !== null && dias < DIAS_HASTA_ENTREGA) || (minimo !== null && stock <= minimo)) {
    return { orden: 1, palabra: 'no llega a la entrega', clase: 'bg-advertencia/30 text-texto' };
  }
  return { orden: 2, palabra: 'alcanza', clase: 'bg-fondo-sutil text-texto-sutil' };
}

/** Verde bajo 8 %, ámbar de 8 a 12, rojo arriba de 12. */
export function semaforoDeMerma(porcentaje: number): Omit<Urgencia, 'orden'> {
  if (porcentaje > 12) return { palabra: 'merma alta', clase: 'bg-peligro/25' };
  if (porcentaje >= 8) return { palabra: 'merma en el límite', clase: 'bg-advertencia/30' };
  return { palabra: 'merma normal', clase: 'bg-exito/25' };
}

export function diasDesde(fecha: string | null, ahora: number): number | null {
  if (fecha === null || ahora === 0) return null;
  const dias = Math.floor((ahora - new Date(fecha).getTime()) / 86_400_000);
  return Number.isNaN(dias) ? null : dias;
}

/** La recomendación es de USO y no de tirar: el grano viejo sigue sirviendo. */
export function consejoDeGrano(dias: number): string {
  if (dias >= DIAS_GRANO_ROJO) return 'Ya no da espresso. Úsalo en filtrado o cámbialo.';
  if (dias >= DIAS_GRANO_AMBAR) return 'Sirve para filtrado; para espresso ya cayó.';
  return 'En su punto para espresso.';
}

/**
 * Redondeo propio y no `toLocaleString`: el formato del servidor y el del
 * navegador no tienen por qué coincidir, y ahí nace un fallo de hidratación.
 */
function formatear(valor: number | null): string {
  return valor === null ? '—' : String(Math.round(valor * 10) / 10);
}

/** El límite de intentos no es un código: es el 429, y vive en `estado`. */
function mensajeDeFallo(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === 429) return 'Demasiados intentos seguidos. Espera unos segundos.';
    if (fallo.error.codigo === 'SIN_PERMISO') return 'Tu rol no puede ajustar el inventario.';
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo leer el inventario.';
}

function useEsPC(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const medio = window.matchMedia(CONSULTA_PC);
      medio.addEventListener('change', avisar);
      return () => {
        medio.removeEventListener('change', avisar);
      };
    },
    () => window.matchMedia(CONSULTA_PC).matches,
    () => false,
  );
}

export function Inventario({ filasIniciales, loteGranoInicial, almacenId }: InventarioProps) {
  const voc = useVocabulario();
  const [insumos, setInsumos] = useState<readonly InsumoDeInventario[] | null>(
    filasIniciales ?? null,
  );
  const [almacen, setAlmacen] = useState<string | null>(almacenId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [ahora, setAhora] = useState(0);
  const [contando, setContando] = useState(false);
  /**
   * EL CONTEO DE LECHE, con la forma que el comando pide.
   *
   * `cafeteria.contar_leche` cuenta CARTONES CERRADOS y los CUARTOS del abierto
   * —«nadie dice 380 ml», lo dice su propio esquema— y esta pantalla mandaba un
   * solo número por leche, sin `almacenId`. Cada conteo contestaba **400**, y el
   * conteo de leche es lo que decide si hoy se compra o no.
   */
  const [conteos, setConteos] = useState<Readonly<Record<string, ConteoDeUnaLeche>>>({});
  const [resultado, setResultado] = useState<ResultadoConteo | null>(null);
  const esPC = useEsPC();

  useEffect(() => {
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    // El reloj no nace en el render: sembrarlo en el servidor sería un
    // desajuste de hidratación garantizado.
    const reloj = setTimeout(() => {
      setAhora(Date.now());
    });
    if (filasIniciales === undefined) {
      Promise.all([
        consultarPuente<InsumoDeInventario>('Ingrediente', { limite: 300, signal: control.signal }),
        consultarPuente<{ readonly almacen_id: string | null }>('MovimientoInventario', {
          limite: 1,
          signal: control.signal,
        }),
      ])
        .then(([filas, movimientos]) => {
          if (!sigueMontada()) return;
          setInsumos(filas);
          setAlmacen(movimientos[0]?.almacen_id ?? null);
        })
        .catch((fallo: unknown) => {
          // La pantalla NUNCA se vacía por un error de red: un conteo de hace
          // diez minutos sigue diciendo si hay que salir por leche.
          if (sigueMontada()) setError(mensajeDeFallo(fallo));
        });
    }
    return () => {
      clearTimeout(reloj);
      control.abort();
    };
  }, [filasIniciales]);

  const ajustar = useCallback(
    async (insumo: InsumoDeInventario, delta: number): Promise<void> => {
      if (almacen === null) return;
      setOcupado(insumo.id);
      try {
        /**
         * ── ESTE AJUSTE CONTESTABA 400 SIEMPRE ───────────────────────
         * Dos cosas, las dos en el contrato del comando:
         *
         *  · `cantidad` viaja como TEXTO. `numeric(14,4)` no cabe en un `number` sin
         *    perder el cuarto decimal, y ese decimal es la merma del mes. Aquí iba
         *    `-1` y `1` como números: `ENTRADA_INVALIDA` en cada toque.
         *  · `motivo` es una CLAVE de `motivos_merma` —`ajuste_conteo`, `muestra`,
         *    `caducado`…— y desde la 062 `movimientos_stock.motivo` apunta a esa
         *    tabla: una frase tecleada aborta el ajuste. Lo que el operador dice va
         *    en `nota`, que es para lo que existe.
         *
         * El rastreador lo contó veintiséis veces, dos por insumo.
         */
        await invocarComando(RUTA_AJUSTAR, {
          almacenId: almacen,
          insumoId: insumo.id,
          cantidad: String(delta),
          motivo: 'ajuste_conteo',
          // La palabra del GIRO, no «barra» tecleada: esto se lee después en
          // Registros, y en un negocio cuya preparación se llama de otro modo decía
          // barra igualmente.
          nota: `Ajuste en ${voc.singular('preparacion')}: ${delta > 0 ? 'entrada' : 'salida'}`,
        });
        // La fila se reescribe, no se muta: quien tuviera la lista anterior
        // sigue teniendo una lista coherente.
        setInsumos((previo) =>
          previo === null
            ? previo
            : previo.map((fila) =>
                fila.id === insumo.id
                  ? { ...fila, stock_actual: (fila.stock_actual ?? 0) + delta }
                  : fila,
              ),
        );
        setError(null);
      } catch (fallo: unknown) {
        setError(mensajeDeFallo(fallo));
      } finally {
        setOcupado(null);
      }
    },
    // `voc` entra porque la NOTA del ajuste lleva la palabra del giro.
    [almacen, voc],
  );

  const leches = useMemo(
    () =>
      (insumos ?? []).filter(
        (insumo) =>
          familiaDe(insumo) === 'Leche' &&
          // SEGUNDO CERROJO, a propósito: `familiaDe` ya no deja entrar en Leche nada
          // que no se mida en mililitros, así que hoy esta condición no quita ninguna
          // fila. Se queda porque lo que el diálogo ofrece contar POR CARTONES es lo
          // único que el comando acepta, y esa promesa no debería depender de cómo se
          // agrupe la tabla: el día que alguien añada una familia o cambie una pista,
          // el conteo sigue ofreciendo sólo lo contable.
          seCuentaPorCartones(insumo.unidad_base),
      ),
    [insumos],
  );

  const contarLeche = useCallback(async (): Promise<void> => {
    setOcupado('conteo');
    try {
      if (almacen === null) {
        setError('Elige primero el almacén: un conteo sin almacén no cuadra contra nada.');
        return;
      }
      /**
       * ── SE VALIDA AQUÍ, Y NO SE LE MANDA BASURA AL COMANDO ────────
       * El campo de cartones es texto libre, y esto mandaba `Number(texto)` tal
       * cual: una letra es `NaN`, `12.5` no es entero y `999` se pasa del tope de
       * 200. Las tres las rechaza el comando con un 400 `ENTRADA_INVALIDA`, y lo
       * único que el barista veía era la banda genérica, sin saber qué campo.
       *
       * El rastreador lo cazó en CI —`400 /api/cafeteria/contar-leche`— tecleando
       * datos de sonda en ese campo. La validación del comando SIGUE siendo la
       * frontera; esto es lo otro que hacía falta: fallar pronto y decir cuál.
       */
      const invalida = primeraLecheInvalida(leches, conteos);
      if (invalida !== null) {
        setError(avisoDeConteoInvalido(invalida));
        return;
      }
      const datos = await invocarComando<ResultadoConteo>(RUTA_CONTAR_LECHE, {
        almacenId: almacen,
        conteos: leches.map((insumo) => {
          const suyo = conteos[insumo.id];
          return {
            insumoId: insumo.id,
            cartonesCerrados: cartonesDe(suyo?.cerrados ?? '') ?? 0,
            cuartosDelAbierto: suyo?.cuartos ?? 0,
          };
        }),
      });
      setResultado(datos);
      setError(null);
    } catch (fallo: unknown) {
      setError(mensajeDeFallo(fallo));
    } finally {
      setOcupado(null);
    }
  }, [leches, conteos, almacen]);

  const visibles = useMemo(() => {
    const aguja = sinAcentos(busqueda.trim());
    const vivos = (insumos ?? []).filter((insumo) => insumo.activo !== false);
    const filtrados =
      aguja === '' ? vivos : vivos.filter((insumo) => sinAcentos(insumo.nombre).includes(aguja));
    return [...filtrados].sort((a, b) => {
      const diferencia = urgenciaDe(a).orden - urgenciaDe(b).orden;
      return diferencia === 0 ? a.nombre.localeCompare(b.nombre, 'es-MX') : diferencia;
    });
  }, [insumos, busqueda]);

  const grupos = useMemo(
    () =>
      FAMILIAS.map((familia) => ({
        familia,
        filas: visibles.filter((insumo) => familiaDe(insumo) === familia),
      })).filter((grupo) => grupo.filas.length > 0),
    [visibles],
  );

  const alertas = useMemo(() => visibles.filter((i) => urgenciaDe(i).orden < 2), [visibles]);
  const diasGrano = diasDesde(loteGranoInicial?.fecha_tueste ?? null, ahora);

  if (insumos === null) {
    return (
      <div className="min-h-dvh bg-fondo p-(--espacio-4) text-texto">
        <h1 className="mb-(--espacio-4) text-2xl font-bold">Inventario</h1>
        {/* Esqueletos con la forma de las tarjetas: la pantalla no salta. */}
        <div className="grid gap-(--espacio-3) md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col gap-(--espacio-4) bg-fondo p-(--espacio-4) text-texto">
      <header className="flex flex-wrap items-center justify-between gap-(--espacio-3)">
        <h1 className="text-2xl font-bold">Inventario</h1>
        {/* La tarea del cierre tiene botón propio y grande: no es una fila más. */}
        <Button
          type="button"
          size="lg"
          disabled={leches.length === 0}
          onClick={() => {
            setResultado(null);
            setContando(true);
          }}
        >
          <Milk aria-hidden="true" className="inline size-4 shrink-0" /> Contar leche
        </Button>
      </header>

      {/* La banda avisa y NO vacía la pantalla: debajo sigue el último conteo. */}
      {error !== null && (
        <p role="alert" className="rounded-md border border-peligro bg-peligro/15 p-2 text-sm">
          {error} · Se muestra el último inventario conocido.
        </p>
      )}

      {insumos.length === 0 ? (
        // El vacío ENSEÑA lo que esta pantalla va a hacer, y no se disculpa.
        <Vacio
          className="flex-1"
          icono={<Milk />}
          titulo="Aquí va a vivir lo que hay que reponer."
          explicacion="Leche, café, empaque, ingredientes y alimentos — agrupados como se camina el local y ordenados por lo que se acaba primero, con los días que alcanza delante de la existencia."
          accion={
            <Button asChild>
              <a href="/inventario">Dar de alta el primer insumo</a>
            </Button>
          }
        />
      ) : (
        <>
          {diasGrano !== null && (
            <section className={TARJETA} aria-label="Lote de grano abierto">
              <div className="flex flex-wrap items-baseline gap-x-(--espacio-3) gap-y-1">
                <span className="font-bold">☕ Grano abierto</span>
                <span className={`${CHIP} ${claseDeGrano(diasGrano)}`}>
                  {diasGrano} días desde el tueste
                </span>
                <span className="text-sm text-texto-sutil">{consejoDeGrano(diasGrano)}</span>
              </div>
            </section>
          )}

          {alertas.length > 0 && (
            <section
              className="rounded-lg border border-advertencia/40 bg-advertencia/15 p-(--espacio-3)"
              aria-label="Lo que no llega a la próxima entrega"
            >
              <h2 className="mb-2 text-sm font-bold uppercase">No llega a la próxima entrega</h2>
              <ul className="flex flex-wrap gap-2">
                {alertas.map((insumo) => (
                  <li key={insumo.id}>
                    <Badge
                      variant={
                        urgenciaDe(insumo).orden === 0
                          ? ('destructive' as const)
                          : ('secondary' as const)
                      }
                    >
                      {insumo.nombre} · {textoDeDias(insumo)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="max-w-sm">
            <Label htmlFor="buscar-insumo" className="text-sm text-texto-sutil">
              Buscar insumo
            </Label>
            <Input
              id="buscar-insumo"
              type="search"
              value={busqueda}
              placeholder="leche entera, vaso 12 oz…"
              onChange={(evento) => {
                setBusqueda(evento.target.value);
              }}
            />
          </div>

          {grupos.length === 0 ? (
            <p className="text-texto-sutil">Ningún insumo se llama así.</p>
          ) : (
            grupos.map((grupo, indice) => (
              <section key={grupo.familia} aria-labelledby={`familia-${indice}`}>
                <h2
                  id={`familia-${indice}`}
                  className="mb-2 text-sm font-bold tracking-wide uppercase"
                >
                  {grupo.familia} <span className="text-texto-sutil">({grupo.filas.length})</span>
                </h2>
                {esPC ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Insumo</TableHead>
                        <TableHead>Días que alcanza</TableHead>
                        <TableHead>Existencia</TableHead>
                        <TableHead>Mínimo</TableHead>
                        <TableHead>Ajuste</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grupo.filas.map((insumo) => (
                        <TableRow key={insumo.id}>
                          <TableCell className="font-medium">{insumo.nombre}</TableCell>
                          <TableCell>
                            <span className={`${CHIP} ${urgenciaDe(insumo).clase}`}>
                              {textoDeDias(insumo)} · {urgenciaDe(insumo).palabra}
                            </span>
                          </TableCell>
                          <TableCell className="tabular-nums">{textoDeStock(insumo)}</TableCell>
                          <TableCell className="tabular-nums text-texto-sutil">
                            {formatear(insumo.stock_minimo)}
                          </TableCell>
                          <TableCell>
                            <Ajuste
                              insumo={insumo}
                              grande={false}
                              sinAlmacen={almacen === null}
                              ocupado={ocupado === insumo.id}
                              onAjustar={ajustar}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <ul className="grid gap-(--espacio-3) md:grid-cols-2">
                    {grupo.filas.map((insumo) => (
                      <li key={insumo.id} className={TARJETA}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold">{insumo.nombre}</span>
                          <span className={`${CHIP} ${urgenciaDe(insumo).clase}`}>
                            {urgenciaDe(insumo).palabra}
                          </span>
                        </div>
                        <p className="mt-1 tabular-nums">
                          <span className="text-xl font-bold">{textoDeDias(insumo)}</span>
                          <span className="text-texto-sutil">
                            {' · '}
                            {textoDeStock(insumo)} · mínimo {formatear(insumo.stock_minimo)}
                          </span>
                        </p>
                        <div className="mt-2 flex justify-end">
                          <Ajuste
                            insumo={insumo}
                            grande
                            sinAlmacen={almacen === null}
                            ocupado={ocupado === insumo.id}
                            onAjustar={ajustar}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
        </>
      )}

      <ConteoDeLeche
        abierto={contando}
        leches={leches}
        conteos={conteos}
        resultado={resultado}
        ocupado={ocupado === 'conteo'}
        onCambiar={setConteos}
        onCerrar={() => {
          setContando(false);
        }}
        onConfirmar={contarLeche}
      />
    </div>
  );
}

function claseDeGrano(dias: number): string {
  if (dias >= DIAS_GRANO_ROJO) return 'bg-peligro/25';
  if (dias >= DIAS_GRANO_AMBAR) return 'bg-advertencia/30';
  return 'bg-fondo-sutil text-texto-sutil';
}

function textoDeDias(insumo: InsumoDeInventario): string {
  const dias = diasQueAlcanza(insumo);
  return dias === null ? 'sin dato' : `${dias} días`;
}

function textoDeStock(insumo: InsumoDeInventario): string {
  return `${formatear(insumo.stock_actual)} ${insumo.unidad_base ?? ''}`.trim();
}

interface AjusteProps {
  readonly insumo: InsumoDeInventario;
  readonly grande: boolean;
  readonly sinAlmacen: boolean;
  readonly ocupado: boolean;
  readonly onAjustar: (insumo: InsumoDeInventario, delta: number) => Promise<void>;
}

/**
 * En teléfono y tablet el `+` y el `−` son grandes: se tocan con una mano y la
 * jarra en la otra. En PC se encogen, porque ahí manda la tabla densa.
 */
function Ajuste({ insumo, grande, sinAlmacen, ocupado, onAjustar }: AjusteProps) {
  const tamano = grande ? ('icon-lg' as const) : ('icon-sm' as const);
  const unidad = insumo.unidad_base ?? 'unidad';
  return (
    <div className="flex items-center gap-2">
      {[-1, 1].map((delta) => (
        <Button
          key={delta}
          type="button"
          variant="outline"
          size={tamano}
          disabled={sinAlmacen || ocupado}
          aria-label={`${delta > 0 ? 'Sumar' : 'Restar'} 1 ${unidad} a ${insumo.nombre}`}
          onClick={() => {
            void onAjustar(insumo, delta);
          }}
        >
          <span aria-hidden className={grande ? 'text-2xl' : 'text-base'}>
            {delta > 0 ? '+' : '−'}
          </span>
        </Button>
      ))}
    </div>
  );
}

/**
 * Lo que se cuenta de una leche: cartones cerrados y cuartos del que está abierto.
 *
 * La forma vive en `conteo-de-leche.ts`, junto a lo que decide si es válida: dos
 * declaraciones de la misma cosa garantizan que una se queda atrás.
 */
export type ConteoDeUnaLeche = ConteoTecleado;

interface ConteoDeLecheProps {
  readonly abierto: boolean;
  readonly leches: readonly InsumoDeInventario[];
  readonly conteos: Readonly<Record<string, ConteoDeUnaLeche>>;
  readonly resultado: ResultadoConteo | null;
  readonly ocupado: boolean;
  readonly onCambiar: (conteos: Readonly<Record<string, ConteoDeUnaLeche>>) => void;
  readonly onCerrar: () => void;
  readonly onConfirmar: () => Promise<void>;
}

/**
 * Noventa segundos: los campos primero, vacíos y con el foco en el primero. El
 * teórico NO se enseña antes de teclear — si se enseñara se copiaría, y el
 * conteo dejaría de ser un control para volverse un trámite.
 */
function ConteoDeLeche({
  abierto,
  leches,
  conteos,
  resultado,
  ocupado,
  onCambiar,
  onCerrar,
  onConfirmar,
}: ConteoDeLecheProps) {
  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conteo de leche</DialogTitle>
          <DialogDescription>
            Cuenta lo que hay en el refrigerador. El teórico aparece al terminar.
          </DialogDescription>
        </DialogHeader>

        {resultado === null ? (
          <div className="flex flex-col gap-(--espacio-3)">
            {leches.map((insumo, indice) => (
              <div key={insumo.id}>
                <Label htmlFor={`conteo-${insumo.id}`}>{insumo.nombre}</Label>
                {/*
                  DOS datos por leche, que son los que el comando cuenta: los cartones
                  CERRADOS —que se cuentan mirando— y cuánto queda del ABIERTO, en
                  cuartos. Antes había un solo campo en la unidad base y el conteo
                  contestaba 400 en cada confirmación.
                */}
                <div className="flex items-end gap-2">
                  <div className="grow">
                    <Input
                      id={`conteo-${insumo.id}`}
                      inputMode="numeric"
                      placeholder="Cartones cerrados"
                      autoFocus={indice === 0}
                      /**
                       * SE MARCA MIENTRAS SE TECLEA, no al confirmar.
                       *
                       * `inputMode` es una pista para el teclado del teléfono, no
                       * una validación: aquí entra cualquier cosa. Sin esta marca,
                       * un `12.5` se veía igual que un `12` hasta que el comando
                       * contestaba 400 y la banda decía «entrada inválida» sin
                       * señalar el campo.
                       */
                      aria-invalid={cartonesDe(conteos[insumo.id]?.cerrados ?? '') === null}
                      value={conteos[insumo.id]?.cerrados ?? ''}
                      onChange={(evento) => {
                        onCambiar({
                          ...conteos,
                          [insumo.id]: {
                            cerrados: evento.target.value,
                            cuartos: conteos[insumo.id]?.cuartos ?? 0,
                          },
                        });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`abierto-${insumo.id}`} className="text-xs">
                      Del abierto
                    </Label>
                    <select
                      id={`abierto-${insumo.id}`}
                      className="h-(--altura-control) rounded-md border border-borde-fuerte bg-fondo px-2 text-base"
                      value={String(conteos[insumo.id]?.cuartos ?? 0)}
                      onChange={(evento) => {
                        const cuartos = Number(evento.target.value) as 0 | 1 | 2 | 3 | 4;
                        onCambiar({
                          ...conteos,
                          [insumo.id]: {
                            cerrados: conteos[insumo.id]?.cerrados ?? '',
                            cuartos,
                          },
                        });
                      }}
                    >
                      <option value="0">vacío</option>
                      <option value="1">¼</option>
                      <option value="2">½</option>
                      <option value="3">¾</option>
                      <option value="4">lleno</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              size="lg"
              disabled={ocupado}
              onClick={() => {
                void onConfirmar();
              }}
            >
              Confirmar conteo
            </Button>
          </div>
        ) : (
          // Las tres cifras juntas, aquí y no en un reporte que nadie abre.
          <div className="flex flex-col gap-2 tabular-nums">
            <p>Contado: {formatear(resultado.contado)}</p>
            <p>Teórico: {formatear(resultado.teorico)}</p>
            <p
              className={`${CHIP} w-fit text-sm ${semaforoDeMerma(resultado.mermaPorcentaje).clase}`}
            >
              Merma {formatear(resultado.mermaPorcentaje)} % ·{' '}
              {semaforoDeMerma(resultado.mermaPorcentaje).palabra}
            </p>
            <Button type="button" variant="secondary" onClick={onCerrar}>
              Cerrar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
