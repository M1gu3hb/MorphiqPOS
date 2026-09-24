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
import {
  Aviso,
  Cifra,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  ListaDeTarjetas,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
  type TamanoDeDinero,
  type TonoDeFila,
} from '@morphiqpos/ui/sistema';
import {
  CircleCheck,
  Coffee,
  Milk,
  Minus,
  OctagonAlert,
  Plus,
  Search,
  TriangleAlert,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

import {
  TOPE_DE_CARTONES,
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
 * PC: una `Tabla` densa por familia, que es como se revisa sentada, con la fila
 * teñida por urgencia y la palabra en la celda. Tablet: `ListaDeTarjetas` en dos
 * columnas, para leerse caminando con una mano. Teléfono: una columna, con los
 * días grandes y el ajuste con `+` y `−` grandes, que es lo único que se hace de
 * pie. El formato se decide en JS y se pinta UNO: pintarlo dos veces con
 * `hidden lg:*` haría que el lector de pantalla leyera cada insumo dos veces.
 *
 * ── Los tres estados ─────────────────────────────────────────────────────
 * Si no se leyó nada, `ErrorDePantalla` con su reintento: no hay último conteo
 * que enseñar. Si lo que falla es un AJUSTE, la lista se queda y un `Aviso` dice
 * que no se guardó. Si falla el CONTEO, el aviso va dentro del diálogo, que es
 * donde está quien cuenta: detrás del diálogo nadie lo veía.
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
 * en vez de fallar al pulsar —y un aviso dice por qué—. Recortados para caber
 * en un archivo: el buscador por código de barras y el histórico por insumo.
 */

/** Rutas declaradas en `05-DATOS-Y-BACKEND.md` §6. Ninguna se inventa aquí. */
const RUTA_AJUSTAR = '/api/inventario/ajustar';
const RUTA_CONTAR_LECHE = '/api/cafeteria/contar-leche';

const CONSULTA_PC = '(min-width: 1024px)';
/** Lo que separa «me aguanta» de «no llega»: el hueco hasta la próxima entrega. */
const DIAS_HASTA_ENTREGA = 2;
const DIAS_GRANO_AMBAR = 25;
const DIAS_GRANO_ROJO = 30;
/** El semáforo de merma: verde bajo 8 %, ámbar de 8 a 12, rojo arriba de 12. */
const MERMA_AMBAR = 8;
const MERMA_ROJA = 12;

const PAGINA = 'flex min-h-dvh flex-col gap-(--espacio-4) bg-fondo p-(--espacio-4) text-texto';
const CHIP = 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold';
/** El campo de cartones y el desplegable del abierto: se tocan con la jarra en la otra mano. */
const ALTO_DE_CONTEO = 'h-[calc(var(--altura-control)*1.25)]';

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

/**
 * Una leche del conteo, como la contesta `cafeteria.contar_leche`
 * (`packages/app/src/cafeteria/leche.ts`, `DiferenciaDeLeche`). Se copia aquí porque
 * ese módulo es `server-only`.
 *
 * Esta pantalla leía `{ contado, teorico, mermaPorcentaje }`, que el comando no
 * sirve: el resultado decía siempre «—», «—» y «sin dato», y el semáforo de merma
 * —lo único que el conteo existe para enseñar— no se encendía nunca.
 *
 * Los mililitros viajan como TEXTO —`numeric` con cuatro decimales— y el desvío en
 * puntos base sobre lo esperado: negativo es lo que falta, y ESO es la merma de barra.
 */
interface DiferenciaDeLeche {
  readonly insumoId: string;
  readonly nombre: string;
  readonly contadoMl: string;
  readonly esperadoMl: string;
  readonly diferenciaMl: string;
  readonly desvioBp: number;
}

/** `ResultadoConteoLeche`: cada leche, lo que falta sumando todas y cuántas se salen. */
interface ResultadoConteo {
  readonly diferencias: readonly DiferenciaDeLeche[];
  readonly faltanteTotalMl: string;
  /** Las que se desvían más de lo normal en barra (8 %), hacia arriba o hacia abajo. */
  readonly fueraDeRango: number;
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
  if (porcentaje > MERMA_ROJA) return { palabra: 'merma alta', clase: 'bg-peligro/25' };
  if (porcentaje >= MERMA_AMBAR)
    return { palabra: 'merma en el límite', clase: 'bg-advertencia/30' };
  return { palabra: 'merma normal', clase: 'bg-exito/25' };
}

/** Los mililitros del conteo, que llegan como texto. Lo que no es un número dice «—». */
function mlDe(texto: string): number | null {
  const valor = Number(texto);
  return texto.trim() === '' || !Number.isFinite(valor) ? null : valor;
}

/** Lo que una leche del conteo dice: su merma, la palabra del tramo y el tono. */
interface LecturaDeLeche {
  /** Lo que falta sobre el teórico, en %. `null` sin teórico: no hay contra qué medir. */
  readonly merma: number | null;
  readonly palabra: string;
  readonly clase: string;
  readonly tono: TonoDeFila | undefined;
}

function lecturaDeLeche(diferencia: DiferenciaDeLeche): LecturaDeLeche {
  const esperado = mlDe(diferencia.esperadoMl);
  // Sin teórico el comando contesta un desvío de 0: pintarlo en verde sería un
  // «merma normal» que nadie midió.
  if (esperado === null || esperado <= 0) {
    return {
      merma: null,
      palabra: 'sin teórico',
      clase: 'bg-fondo-sutil text-texto-sutil',
      tono: undefined,
    };
  }
  const merma = Math.max(0, -diferencia.desvioBp) / 100;
  // Lo que SOBRA no es merma, pero pasado el 8 % el comando lo cuenta fuera de rango
  // igual que un faltante: un verde ahí contradiría el total de abajo.
  if (diferencia.desvioBp > MERMA_AMBAR * 100) {
    return {
      merma,
      palabra: 'sobra fuera de rango',
      clase: 'bg-advertencia/30',
      tono: 'advertencia',
    };
  }
  const semaforo = semaforoDeMerma(merma);
  if (merma > MERMA_ROJA) return { merma, ...semaforo, tono: 'peligro' };
  if (merma >= MERMA_AMBAR) return { merma, ...semaforo, tono: 'advertencia' };
  return { merma, ...semaforo, tono: undefined };
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
 * Sólo para TEXTO corrido (la insignia de una alerta); una cifra que se pinta
 * sola es `<Cifra>`.
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
  /** No se pudo LEER: no hay lista que enseñar. */
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  /** Falló un AJUSTE: la lista se queda, y esto dice que no se guardó. */
  const [error, setError] = useState<string | null>(null);
  /** Falló el CONTEO: se dice dentro del diálogo, que es donde está quien cuenta. */
  const [falloDelConteo, setFalloDelConteo] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
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
          // Aquí todavía no hay lista: lo que falla es la PRIMERA lectura. Una vez
          // leída, un ajuste fallido nunca la vacía —un conteo de hace diez minutos
          // sigue diciendo si hay que salir por leche—.
          if (sigueMontada()) setFalloDeCarga(mensajeDeFallo(fallo));
        });
    }
    return () => {
      clearTimeout(reloj);
      control.abort();
    };
  }, [filasIniciales, intento]);

  /** El estado se limpia EN EL CLIC, no en el efecto. */
  function reintentar(): void {
    setFalloDeCarga(null);
    setInsumos(null);
    setIntento((previo) => previo + 1);
  }

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
        setFalloDelConteo('Elige primero el almacén: un conteo sin almacén no cuadra contra nada.');
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
        setFalloDelConteo(avisoDeConteoInvalido(invalida));
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
      setFalloDelConteo(null);
      setError(null);
    } catch (fallo: unknown) {
      setFalloDelConteo(mensajeDeFallo(fallo));
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

  if (falloDeCarga !== null) {
    return (
      <div className={PAGINA}>
        <h1 className="text-2xl font-bold">Inventario</h1>
        <ErrorDePantalla
          className="max-w-lg"
          titulo="No se pudo leer el inventario"
          queHacer="Sin la lista no se sabe qué no llega a la próxima entrega ni se puede contar la leche. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDeCarga}
          reintentar={
            <Button type="button" onClick={reintentar}>
              Volver a intentar
            </Button>
          }
        />
      </div>
    );
  }

  if (insumos === null) {
    return (
      <div className={PAGINA}>
        <header className="flex flex-wrap items-center justify-between gap-(--espacio-3)">
          <h1 className="text-2xl font-bold">Inventario</h1>
          <Esqueleto className="h-(--altura-control) w-40" />
        </header>
        {/* La forma de lo que viene —las alertas arriba, la lista debajo—, no una
            rueda: al llegar los datos nada salta de sitio. */}
        <Esqueleto className="h-20 w-full rounded-lg" />
        <EsqueletoDeLista filas={8} />
      </div>
    );
  }

  const sinAlmacen = almacen === null;
  const pintarAjuste: PintarAjuste = (insumo, grande) => (
    <Ajuste
      insumo={insumo}
      grande={grande}
      sinAlmacen={sinAlmacen}
      ocupado={ocupado === insumo.id}
      onAjustar={ajustar}
    />
  );

  return (
    <div className={PAGINA}>
      <header className="flex flex-wrap items-center justify-between gap-(--espacio-3)">
        <h1 className="text-2xl font-bold">Inventario</h1>
        {/* La tarea del cierre tiene botón propio y grande: no es una fila más. */}
        <Button
          type="button"
          size="lg"
          className="w-full sm:w-auto"
          disabled={leches.length === 0}
          onClick={() => {
            setResultado(null);
            setFalloDelConteo(null);
            setContando(true);
          }}
        >
          <Milk aria-hidden="true" /> Contar leche
        </Button>
      </header>

      {/* El aviso NO vacía la pantalla: debajo sigue el último inventario leído. */}
      {error !== null && (
        <Aviso tono="peligro" titulo={error}>
          El ajuste no se guardó. Se muestra el último inventario conocido.
        </Aviso>
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
          {sinAlmacen && (
            <Aviso tono="atencion" titulo="Todavía no hay almacén">
              Sale del último movimiento del inventario. Sin él ni el ajuste ni el conteo de leche
              cuadran contra nada, y los botones de + y − quedan apagados.
            </Aviso>
          )}

          {/* PRIMERO lo que no llega a la entrega; al lado, el grano abierto. */}
          {(alertas.length > 0 || diasGrano !== null) && (
            <div className="flex flex-col gap-(--espacio-3) lg:flex-row lg:items-start">
              {alertas.length > 0 && <Alertas alertas={alertas} />}
              {diasGrano !== null && <TarjetaDeGrano dias={diasGrano} />}
            </div>
          )}

          <Buscador valor={busqueda} alCambiar={setBusqueda} />

          <ListaPorFamilia grupos={grupos} esPC={esPC} pintarAjuste={pintarAjuste} />
        </>
      )}

      <ConteoDeLeche
        abierto={contando}
        leches={leches}
        conteos={conteos}
        resultado={resultado}
        fallo={falloDelConteo}
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

/** Tercero en la jerarquía: se busca cuando ya se sabe qué, no para enterarse. */
function Buscador({
  valor,
  alCambiar,
}: {
  readonly valor: string;
  readonly alCambiar: (valor: string) => void;
}) {
  return (
    <div className="flex flex-col gap-(--espacio-1) sm:max-w-sm">
      <Label htmlFor="buscar-insumo" className="text-sm text-texto-sutil">
        Buscar insumo
      </Label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-4 -translate-y-1/2 text-texto-sutil"
        />
        <Input
          id="buscar-insumo"
          type="search"
          value={valor}
          placeholder="leche entera, vaso 12 oz…"
          className="pl-(--espacio-10)"
          onChange={(evento) => {
            alCambiar(evento.target.value);
          }}
        />
      </div>
    </div>
  );
}

interface Grupo {
  readonly familia: Familia;
  readonly filas: readonly InsumoDeInventario[];
}

/**
 * Una sección por familia, en el orden en que se camina el local. En PC, `Tabla`
 * densa con la fila teñida; en tablet, tarjetas en dos columnas; en teléfono, una.
 */
function ListaPorFamilia({
  grupos,
  esPC,
  pintarAjuste,
}: {
  readonly grupos: readonly Grupo[];
  readonly esPC: boolean;
  readonly pintarAjuste: PintarAjuste;
}) {
  if (grupos.length === 0) {
    return (
      <Vacio icono={<Search />} titulo="Ningún insumo se llama así." className="py-(--espacio-8)" />
    );
  }
  const columnas = esPC ? columnasDeTabla(pintarAjuste) : columnasDeTarjeta(pintarAjuste);
  return (
    <>
      {grupos.map((grupo, indice) => (
        <section
          key={grupo.familia}
          aria-labelledby={`familia-${String(indice)}`}
          className="flex flex-col gap-(--espacio-2)"
        >
          <h2
            id={`familia-${String(indice)}`}
            className="flex items-baseline gap-(--espacio-2) text-sm font-bold tracking-wide uppercase"
          >
            {grupo.familia}
            <span className="font-normal text-texto-sutil">({grupo.filas.length})</span>
          </h2>
          {esPC ? (
            <Tabla
              etiqueta={`Insumos de la familia ${grupo.familia}`}
              columnas={columnas}
              filas={grupo.filas}
              claveDe={(insumo) => insumo.id}
              tonoDeFila={tonoDe}
            />
          ) : (
            <ListaDeTarjetas
              columnas={columnas}
              filas={grupo.filas}
              claveDe={(insumo) => insumo.id}
              principal="insumo"
              className="md:grid md:grid-cols-2"
            />
          )}
        </section>
      ))}
    </>
  );
}

function claseDeGrano(dias: number): string {
  if (dias >= DIAS_GRANO_ROJO) return 'bg-peligro/25';
  if (dias >= DIAS_GRANO_AMBAR) return 'bg-advertencia/30';
  return 'bg-fondo-sutil text-texto-sutil';
}

/** La fila se tiñe por urgencia; la celda de días dice con palabras por qué. */
function tonoDe(insumo: InsumoDeInventario): TonoDeFila | undefined {
  const { orden } = urgenciaDe(insumo);
  if (orden === 0) return 'peligro';
  if (orden === 1) return 'advertencia';
  return undefined;
}

/**
 * Lo que le queda, para la insignia de la alerta: los días si se saben, y si no la
 * existencia. «Leche entera · sin dato» no dice nada; «Leche entera · 14 L», sí.
 */
function loQueQueda(insumo: InsumoDeInventario): string {
  const dias = diasQueAlcanza(insumo);
  if (dias !== null) return `${String(dias)} días`;
  return `${formatear(insumo.stock_actual)} ${insumo.unidad_base ?? ''}`.trim();
}

/** Una existencia, un mínimo o un resultado: `<Cifra>` si hay dato, «—» si no. */
function Cantidad({
  valor,
  unidad,
  tamano = 'sm',
  conSigno = false,
  className,
}: {
  readonly valor: number | null;
  readonly unidad?: string | null;
  readonly tamano?: TamanoDeDinero;
  /** Una diferencia: «+250 ml» lo que sobra, «-250 ml» lo que falta. */
  readonly conSigno?: boolean;
  readonly className?: string;
}) {
  if (valor === null || !Number.isFinite(valor)) {
    return <span className="text-texto-tenue">—</span>;
  }
  const redondo = Math.round(valor * 10) / 10;
  return (
    <Cifra
      valor={redondo}
      decimales={Number.isInteger(redondo) ? 0 : 1}
      tamano={tamano}
      conSigno={conSigno}
      {...(unidad === undefined || unidad === null ? {} : { unidad })}
      {...(className === undefined ? {} : { className })}
    />
  );
}

/** Los días, que mandan, y la palabra del tramo, que dice por qué el color. */
function DiasDeLaFila({ insumo }: { readonly insumo: InsumoDeInventario }) {
  const dias = diasQueAlcanza(insumo);
  const urgencia = urgenciaDe(insumo);
  return (
    <span className="flex flex-wrap items-center gap-(--espacio-2)">
      {dias === null ? (
        <span className="text-texto-sutil">sin dato</span>
      ) : (
        <Cantidad valor={dias} unidad="días" className="font-semibold" />
      )}
      <span className={`${CHIP} ${urgencia.clase}`}>{urgencia.palabra}</span>
    </span>
  );
}

/** La cabeza de la tarjeta: nombre y tramo arriba; los días grandes y el ajuste debajo. */
function CabezaDeTarjeta({
  insumo,
  ajuste,
}: {
  readonly insumo: InsumoDeInventario;
  readonly ajuste: ReactNode;
}) {
  const dias = diasQueAlcanza(insumo);
  const urgencia = urgenciaDe(insumo);
  return (
    <span className="flex flex-col gap-(--espacio-2)">
      <span className="flex items-start justify-between gap-(--espacio-2)">
        <span className="font-semibold">{insumo.nombre}</span>
        <span className={`${CHIP} shrink-0 ${urgencia.clase}`}>{urgencia.palabra}</span>
      </span>
      <span className="flex items-end justify-between gap-(--espacio-3)">
        <span className="flex flex-col">
          <span className="text-xs font-normal text-texto-sutil">Días que alcanza</span>
          {dias === null ? (
            <span className="font-normal text-texto-sutil">sin dato</span>
          ) : (
            <Cantidad valor={dias} unidad="días" tamano="lg" className="font-bold" />
          )}
        </span>
        {ajuste}
      </span>
    </span>
  );
}

type PintarAjuste = (insumo: InsumoDeInventario, grande: boolean) => ReactNode;

/** PC: la tabla densa, una por familia. Días primero, existencia después. */
function columnasDeTabla(
  pintarAjuste: PintarAjuste,
): readonly ColumnaDeTabla<InsumoDeInventario>[] {
  return [
    {
      clave: 'insumo',
      titulo: 'Insumo',
      celda: (insumo) => <span className="font-medium">{insumo.nombre}</span>,
    },
    {
      clave: 'dias',
      titulo: 'Días que alcanza',
      celda: (insumo) => <DiasDeLaFila insumo={insumo} />,
    },
    {
      clave: 'existencia',
      titulo: 'Existencia',
      numerica: true,
      celda: (insumo) => <Cantidad valor={insumo.stock_actual} unidad={insumo.unidad_base} />,
    },
    {
      clave: 'minimo',
      titulo: 'Mínimo',
      numerica: true,
      celda: (insumo) => (
        <Cantidad
          valor={insumo.stock_minimo}
          unidad={insumo.unidad_base}
          className="text-texto-sutil"
        />
      ),
    },
    { clave: 'ajuste', titulo: 'Ajuste', celda: (insumo) => pintarAjuste(insumo, false) },
  ];
}

/**
 * Tablet y teléfono: la cabeza de la tarjeta lleva lo que se lee caminando —días,
 * tramo— y el ajuste grande; debajo, existencia y mínimo en pares.
 */
function columnasDeTarjeta(
  pintarAjuste: PintarAjuste,
): readonly ColumnaDeTabla<InsumoDeInventario>[] {
  return [
    {
      clave: 'insumo',
      titulo: 'Insumo',
      celda: (insumo) => <CabezaDeTarjeta insumo={insumo} ajuste={pintarAjuste(insumo, true)} />,
    },
    {
      clave: 'existencia',
      titulo: 'Existencia',
      numerica: true,
      celda: (insumo) => <Cantidad valor={insumo.stock_actual} unidad={insumo.unidad_base} />,
    },
    {
      clave: 'minimo',
      titulo: 'Mínimo',
      numerica: true,
      celda: (insumo) => <Cantidad valor={insumo.stock_minimo} unidad={insumo.unidad_base} />,
    },
  ];
}

/**
 * Lo que no llega a la próxima entrega, arriba de todo. Lo que no llega ni a mañana
 * va en rojo, y además con su icono y su frase para quien no distingue el rojo.
 */
function Alertas({ alertas }: { readonly alertas: readonly InsumoDeInventario[] }) {
  return (
    <Superficie
      como="section"
      relleno={3}
      aria-label="Lo que no llega a la próxima entrega"
      className="flex min-w-0 flex-col gap-(--espacio-2) border-advertencia/50 bg-advertencia/10 lg:flex-1"
    >
      <h2 className="flex items-center gap-(--espacio-2) text-sm font-bold uppercase">
        <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
        No llega a la próxima entrega
        <span className="font-normal text-texto-sutil">({alertas.length})</span>
      </h2>
      <ul className="flex flex-wrap gap-(--espacio-2)">
        {alertas.map((insumo) => {
          const urgente = urgenciaDe(insumo).orden === 0;
          return (
            <li key={insumo.id}>
              <Badge
                variant={urgente ? 'destructive' : 'outline'}
                className={urgente ? 'text-sm' : 'bg-superficie text-sm'}
              >
                {urgente && <OctagonAlert aria-hidden="true" />}
                {urgente && <span className="sr-only">No llega a mañana: </span>}
                {insumo.nombre} · {loQueQueda(insumo)}
              </Badge>
            </li>
          );
        })}
      </ul>
    </Superficie>
  );
}

/** F-157: el grano abierto, con los días desde el tueste y qué hacer con él. */
function TarjetaDeGrano({ dias }: { readonly dias: number }) {
  return (
    <Superficie
      como="section"
      relleno={3}
      aria-label="Lote de grano abierto"
      className="flex flex-col gap-(--espacio-2) lg:w-80 lg:shrink-0"
    >
      <p className="flex items-center gap-(--espacio-2) font-semibold">
        <Coffee aria-hidden="true" className="size-4 shrink-0" />
        Grano abierto
      </p>
      <p>
        <span className={`${CHIP} ${claseDeGrano(dias)}`}>
          <Cifra valor={dias} unidad="días" tamano="sm" /> desde el tueste
        </span>
      </p>
      <p className="text-sm text-texto-sutil">{consejoDeGrano(dias)}</p>
    </Superficie>
  );
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
  const unidad = insumo.unidad_base ?? 'unidad';
  return (
    <span className="flex shrink-0 items-center gap-(--espacio-2)">
      {[-1, 1].map((delta) => (
        <Button
          key={delta}
          type="button"
          variant="outline"
          size={grande ? 'icon-lg' : 'icon-sm'}
          className={grande ? 'size-[calc(var(--altura-control)*1.3)]' : ''}
          disabled={sinAlmacen || ocupado}
          aria-label={`${delta > 0 ? 'Sumar' : 'Restar'} 1 ${unidad} a ${insumo.nombre}`}
          onClick={() => {
            void onAjustar(insumo, delta);
          }}
        >
          {delta > 0 ? (
            <Plus
              aria-hidden="true"
              className={grande ? 'size-[calc(var(--altura-control)*0.55)]' : 'size-4'}
            />
          ) : (
            <Minus
              aria-hidden="true"
              className={grande ? 'size-[calc(var(--altura-control)*0.55)]' : 'size-4'}
            />
          )}
        </Button>
      ))}
    </span>
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
  readonly fallo: string | null;
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
  fallo,
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conteo de leche</DialogTitle>
          <DialogDescription>
            Cuenta lo que hay en el refrigerador. El teórico aparece al terminar.
          </DialogDescription>
        </DialogHeader>

        {resultado === null ? (
          <div className="flex flex-col gap-(--espacio-3)">
            <ul className="flex flex-col divide-y divide-borde">
              {leches.map((insumo, indice) => {
                const cerrados = conteos[insumo.id]?.cerrados ?? '';
                const invalido = cartonesDe(cerrados) === null;
                return (
                  <li
                    key={insumo.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-(--espacio-2) gap-y-1 py-(--espacio-3)"
                  >
                    {/*
                      DOS datos por leche, que son los que el comando cuenta: los cartones
                      CERRADOS —que se cuentan mirando— y cuánto queda del ABIERTO, en
                      cuartos. Antes había un solo campo en la unidad base y el conteo
                      contestaba 400 en cada confirmación.
                    */}
                    <div className="flex min-w-0 flex-col gap-1">
                      <Label htmlFor={`conteo-${insumo.id}`} className="font-semibold">
                        {insumo.nombre}
                      </Label>
                      <Input
                        id={`conteo-${insumo.id}`}
                        inputMode="numeric"
                        placeholder="Cartones cerrados"
                        autoFocus={indice === 0}
                        className={`${ALTO_DE_CONTEO} text-lg`}
                        /**
                         * SE MARCA MIENTRAS SE TECLEA, no al confirmar.
                         *
                         * `inputMode` es una pista para el teclado del teléfono, no
                         * una validación: aquí entra cualquier cosa. Sin esta marca,
                         * un `12.5` se veía igual que un `12` hasta que el comando
                         * contestaba 400 y la banda decía «entrada inválida» sin
                         * señalar el campo.
                         */
                        aria-invalid={invalido}
                        aria-describedby={invalido ? `ayuda-${insumo.id}` : undefined}
                        value={cerrados}
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
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`abierto-${insumo.id}`} className="text-xs text-texto-sutil">
                        Del abierto
                      </Label>
                      <select
                        id={`abierto-${insumo.id}`}
                        className={`${ALTO_DE_CONTEO} rounded-md border border-borde-fuerte bg-fondo px-(--espacio-2) text-base`}
                        value={String(conteos[insumo.id]?.cuartos ?? 0)}
                        onChange={(evento) => {
                          const cuartos = Number(evento.target.value) as 0 | 1 | 2 | 3 | 4;
                          onCambiar({
                            ...conteos,
                            [insumo.id]: { cerrados, cuartos },
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
                    {invalido && (
                      <p id={`ayuda-${insumo.id}`} className="col-span-2 text-xs text-peligro">
                        Cartones enteros, de 0 a {TOPE_DE_CARTONES}.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            {fallo !== null && (
              <Aviso tono="peligro" titulo={fallo}>
                El conteo no se guardó: corrige y vuelve a confirmar.
              </Aviso>
            )}
            <Button
              type="button"
              size="lg"
              cargando={ocupado}
              onClick={() => {
                void onConfirmar();
              }}
            >
              Confirmar conteo
            </Button>
          </div>
        ) : (
          <ResultadoDelConteo resultado={resultado} onCerrar={onCerrar} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * El semáforo lleva forma además de color: palomita, triángulo u octágono. Sin
 * teórico no hay semáforo, y tampoco icono.
 */
function IconoDeLectura({ lectura }: { readonly lectura: LecturaDeLeche }) {
  const clase = 'size-4 shrink-0';
  if (lectura.merma === null) return null;
  if (lectura.tono === 'peligro') return <OctagonAlert aria-hidden="true" className={clase} />;
  if (lectura.tono === 'advertencia') return <TriangleAlert aria-hidden="true" className={clase} />;
  return <CircleCheck aria-hidden="true" className={clase} />;
}

/** La cabeza de la tarjeta: la leche, y a su lado el semáforo con su palabra. */
function CabezaDelConteo({ diferencia }: { readonly diferencia: DiferenciaDeLeche }) {
  const lectura = lecturaDeLeche(diferencia);
  return (
    <span className="flex items-start justify-between gap-(--espacio-2)">
      <span className="font-semibold">{diferencia.nombre}</span>
      <span className={`${CHIP} shrink-0 ${lectura.clase}`}>
        <IconoDeLectura lectura={lectura} />
        {lectura.palabra}
      </span>
    </span>
  );
}

/**
 * Las tres cifras de CADA leche —contado, teórico y merma— y la diferencia que las
 * une. El comando mide cada leche contra su propio teórico: sumar la entera con la de
 * almendra en un solo porcentaje escondería justo la que se está perdiendo.
 */
const COLUMNAS_DEL_CONTEO: readonly ColumnaDeTabla<DiferenciaDeLeche>[] = [
  {
    clave: 'leche',
    titulo: 'Leche',
    celda: (diferencia) => <CabezaDelConteo diferencia={diferencia} />,
  },
  {
    clave: 'contado',
    titulo: 'Contado',
    numerica: true,
    celda: (diferencia) => <Cantidad valor={mlDe(diferencia.contadoMl)} unidad="ml" />,
  },
  {
    clave: 'teorico',
    titulo: 'Teórico',
    numerica: true,
    celda: (diferencia) => <Cantidad valor={mlDe(diferencia.esperadoMl)} unidad="ml" />,
  },
  {
    clave: 'diferencia',
    titulo: 'Diferencia',
    numerica: true,
    celda: (diferencia) => <Cantidad valor={mlDe(diferencia.diferenciaMl)} unidad="ml" conSigno />,
  },
  {
    clave: 'merma',
    titulo: 'Merma',
    numerica: true,
    celda: (diferencia) => (
      <Cantidad valor={lecturaDeLeche(diferencia).merma} unidad="%" className="font-bold" />
    ),
  },
];

/** Las tres cifras juntas, aquí y no en un reporte que nadie abre. */
function ResultadoDelConteo({
  resultado,
  onCerrar,
}: {
  readonly resultado: ResultadoConteo;
  readonly onCerrar: () => void;
}) {
  return (
    <div className="flex flex-col gap-(--espacio-4)">
      <ListaDeTarjetas
        columnas={COLUMNAS_DEL_CONTEO}
        filas={resultado.diferencias}
        claveDe={(diferencia) => diferencia.insumoId}
        principal="leche"
        tonoDeFila={(diferencia) => lecturaDeLeche(diferencia).tono}
        columnasDeTarjeta="adaptable"
      />
      {/* Lo que el comando suma: el faltante de todas y cuántas se salen del 8 %. */}
      <Superficie como="dl" nivel={0} relleno={3} className="grid grid-cols-2 gap-(--espacio-3)">
        <div className="flex flex-col gap-1">
          <dt className="text-xs tracking-wide text-texto-sutil uppercase">Falta en total</dt>
          <dd>
            <Cantidad
              valor={mlDe(resultado.faltanteTotalMl)}
              unidad="ml"
              tamano="lg"
              className="font-bold"
            />
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs tracking-wide text-texto-sutil uppercase">Fuera de rango</dt>
          <dd>
            <Cifra
              valor={resultado.fueraDeRango}
              unidad={`de ${String(resultado.diferencias.length)}`}
              tamano="lg"
              className="font-bold"
            />
          </dd>
        </div>
      </Superficie>
      <Button type="button" variant="secondary" onClick={onCerrar}>
        Cerrar
      </Button>
    </div>
  );
}
