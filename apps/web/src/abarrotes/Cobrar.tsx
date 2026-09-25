'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  CampoDeDinero,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Check, Circle, Minus, PackagePlus, ScanBarcode, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';
import { AvisoSinConexion, useEnLinea } from '~/cliente/en-linea';

/**
 * PANTALLA · abarrotes · cobrar
 *
 * El 90% del uso del sistema: 50 a 400 veces al día, siempre con fila detrás.
 *
 * ── Por qué el TOTAL es lo más grande de toda la aplicación ──────────────
 * Porque **el cliente también lo lee, desde el otro lado del mostrador**, y
 * porque decirlo en voz alta mientras se escanea es lo que hace avanzar la
 * fila. Es más grande que en `restaurante`, y eso es deliberado.
 *
 * ── Por qué no hay botón de «agregar» ────────────────────────────────────
 * Escanear es el estado por omisión, no una acción. La captura vive en la
 * ventana y no en un input, así que el foco **no se puede perder**: si el
 * cajero hizo clic en cualquier otro lado, el siguiente escaneo entra igual.
 * Lector y humano se separan sólo por el RITMO —ocho o más caracteres a menos
 * de 35 ms terminados en Enter—; lo demás se queda en el campo de búsqueda.
 * Sin *cooldown*: seis refrescos iguales son seis lecturas y `× 6` en UNA
 * línea, porque seis renglones de «Coca 600» esconden el error en vez de
 * mostrarlo.
 *
 * ── Por qué la lista es una TABLA densa y no tarjetas ────────────────────
 * Es un ticket que se verifica de reojo: cantidad, nombre, precio e importe,
 * cada uno en su columna y con cifras tabulares, para que un `× 6` equivocado
 * salte a la vista. Con 1,800 claves no hay rejilla de productos: ocuparía el
 * sitio que necesita la lista. La línea recién escaneada se marca un segundo
 * como fila activa, y la barra de abajo dice su nombre: el color no va solo.
 *
 * ── Por qué el cobro EXPANDE el bloque y no abre un modal ────────────────
 * Un modal oscurece el fondo, roba el foco y obliga a dos viajes visuales.
 * Doscientas veces al día eso son minutos. Expandiendo, la lista sigue a la
 * vista —el cliente sigue verificando— y volver a la venta es instantáneo.
 *
 * ── Lo que NO va aquí ────────────────────────────────────────────────────
 * Reportes, gráficas, catálogo, historial, alertas de inventario y avisos.
 * **Nada que no sea cobrar.** El único informativo permitido es la barra de
 * una línea de abajo, y sólo porque confirma que el escaneo funcionó.
 *
 * ── Alcance recortado para caber en un archivo, dicho y no escondido ─────
 * 1. El **beep** —el canal sonoro de los tres— necesita un módulo de audio
 *    compartido. Quedan los otros dos: el resaltado de un segundo y la barra
 *    de estado. Ninguno de los dos depende sólo del color.
 * 2. Las teclas F1…F8 NO están: «los ocho de siempre» son los ocho más
 *    vendidos, y ese cálculo es del servidor. Poner los ocho primeros del
 *    catálogo enseñaría una memoria muscular falsa, que es peor que no tener
 *    la fila.
 * 3. El alta rápida (PANTALLA 2), el peso embebido (F-148), la presentación
 *    (F-147), el cliente de fiado (F4), el abono (F7) y suspender (F6) son
 *    suyos. Aquí el código desconocido se queda en una banda, no en un `toast`
 *    que se va solo.
 * 4. Sin conexión (F-988) no hay cola, por decisión (A-27): sin red la pantalla lo
 *    DICE —«Sin internet. No se puede cobrar»— y CONFIRMAR no se deja pulsar.
 * 5. `existencia` la expondrá el puente; hoy llega vacía y el punto no sale.
 * 6. F9, F10 y F11 van impresas junto a su desvío, pero el teclado todavía no
 *    las escucha: hoy esos tres se tocan. F12, F2, Supr, + / − y Esc sí.
 */

/** Un lector escribe cada carácter en menos de esto; una mano, jamás. */
const MS_ENTRE_TECLAS = 35;
/** Ocho dígitos es el EAN-8 más corto: debajo hay alguien tecleando. */
const LARGO_MINIMO_CODIGO = 8;
/** Lo que dura el resaltado de la línea recién escaneada. */
const MS_DESTACADO = 1000;
/** El IVA ya venía DENTRO del precio: 16 de cada 116 pesos cobrados. */
const IVA_NUMERADOR = 16;
const IVA_DENOMINADOR = 116;
/** Los billetes con los que se paga más de la mitad de los tickets. */
const DENOMINACIONES = [15_000, 20_000, 50_000] as const;
/** Los desvíos del camino por omisión, con su tecla impresa al lado. */
const DESVIOS = [
  { clave: 'tarjeta', etiqueta: 'Tarjeta', tecla: 'F9' },
  { clave: 'transferencia', etiqueta: 'Transferencia', tecla: 'F10' },
  { clave: 'fiado', etiqueta: 'Fiado', tecla: 'F11' },
] as const;

type Metodo = 'efectivo' | (typeof DESVIOS)[number]['clave'];

/** El nombre del método elegido, para que el bloque expandido diga en qué se está cobrando. */
function etiquetaDeMetodo(metodo: Metodo): string {
  return DESVIOS.find((desvio) => desvio.clave === metodo)?.etiqueta ?? 'Efectivo';
}

export interface ProductoDeMostrador {
  readonly id: string;
  readonly nombre: string | null;
  readonly precio_venta: number | null;
  readonly codigo_barras: string | null;
  readonly existencia?: number | null;
}

/** Lo que `caja.estado` contesta, y lo único que esta pantalla necesita de él. */
interface EstadoDeLaCaja {
  readonly abierta: boolean;
  readonly sesionCajaId: string | null;
}

export interface CajaDelDia {
  readonly id: string;
  readonly estado: string | null;
  readonly usuario_apertura_nombre: string | null;
}

export interface LineaDeVenta {
  readonly productoId: string;
  readonly nombre: string;
  readonly precioCentavos: number;
  readonly cantidad: number;
  readonly sinExistencia: boolean;
}

export interface CobrarProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly productosIniciales?: readonly ProductoDeMostrador[];
  readonly cajaInicial?: CajaDelDia | null;
  readonly onCobrado?: (ventaId: string) => void;
}

/**
 * El precio del catálogo, en centavos. `precio_venta` llega del puente en PESOS; la unidad
 * la decide `centavosDe` por la conversión del campo, contando dígitos. Sin precio cuenta
 * como cero, como antes: la línea se agrega y el total no miente sobre lo que sí cobra.
 */
function precioEnCentavos(producto: ProductoDeMostrador): number {
  return centavosDe('ProductoTerminado', 'precio_venta', producto.precio_venta) ?? 0;
}

/** El IVA que ya venía en el precio. Nunca se suma: se desglosa. */
export function ivaIncluido(total: number): number {
  return Math.round((total * IVA_NUMERADOR) / IVA_DENOMINADOR);
}

export function totalDe(lineas: readonly LineaDeVenta[]): number {
  return lineas.reduce((suma, linea) => suma + linea.precioCentavos * linea.cantidad, 0);
}

/** Suma o resta. Al llegar a cero la línea desaparece: un «0 ×» no es nada. */
export function conCantidad(
  lineas: readonly LineaDeVenta[],
  productoId: string,
  paso: number,
): readonly LineaDeVenta[] {
  return lineas
    .map((l) => (l.productoId === productoId ? { ...l, cantidad: l.cantidad + paso } : l))
    .filter((l) => l.cantidad > 0);
}

/** El mismo código INCREMENTA su línea; nunca apila un renglón nuevo. */
export function conProducto(
  lineas: readonly LineaDeVenta[],
  producto: ProductoDeMostrador,
): readonly LineaDeVenta[] {
  if (lineas.some((l) => l.productoId === producto.id)) return conCantidad(lineas, producto.id, 1);
  return [
    ...lineas,
    {
      productoId: producto.id,
      nombre: producto.nombre ?? 'Producto',
      precioCentavos: precioEnCentavos(producto),
      cantidad: 1,
      // Existencia 0 NO bloquea: se agrega y se marca. Bloquear aquí es perder
      // una venta real por un dato de inventario que casi nunca está al día.
      sinExistencia: typeof producto.existencia === 'number' && producto.existencia <= 0,
    },
  ];
}

/**
 * La tecla, impresa junto a su acción: en ráfaga se usa por su tecla, no por su
 * posición. Fuera del nombre del botón —el nombre es la acción— y fuera del
 * teléfono, que no tiene teclas de función.
 *
 * Con el color del botón a opacidad plena: es información de uso, no adorno, y el
 * blanco al 60 % sobre el primario o el verde de CONFIRMAR quedaba debajo del
 * 4.5:1 de `04-INTERFAZ` §4.6. Se distingue del nombre por su tamaño y su borde.
 */
function Tecla({ children }: { readonly children: string }) {
  return (
    <kbd
      aria-hidden="true"
      className="hidden rounded-sm border border-current px-(--espacio-1) font-numeros text-xs font-medium md:inline"
    >
      {children}
    </kbd>
  );
}

export function Cobrar({ productosIniciales, cajaInicial, onCobrado }: CobrarProps) {
  const enLinea = useEnLinea();
  const voc = useVocabulario();
  const [productos, setProductos] = useState<readonly ProductoDeMostrador[] | null>(
    productosIniciales ?? null,
  );
  const [caja, setCaja] = useState<CajaDelDia | null | undefined>(
    productosIniciales === undefined ? cajaInicial : (cajaInicial ?? null),
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada intento de lectura es un número: reintentar lo sube y el efecto lee otra
  // vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [lineas, setLineas] = useState<readonly LineaDeVenta[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [destacada, setDestacada] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [sinCatalogar, setSinCatalogar] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [recibido, setRecibido] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  // La ráfaga del lector no es estado de la vista: repintar en cada tecla
  // costaría un render por carácter, trece por producto escaneado.
  const racha = useRef({ texto: '', ultima: 0 });

  useEffect(() => {
    if (productosIniciales !== undefined) return;
    // El centinela es la señal de aborto: dice si la pantalla sigue montada y
    // de paso cancela la lectura en vuelo.
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    /**
     * LA CAJA SE PREGUNTA A `/api/caja/estado`, NO AL PUENTE.
     *
     * ── El defecto que esto arregla ──────────────────────────────────────
     * Esto leía `CorteCaja` —`sesiones_caja`— y se quedaba con la primera fila
     * en estado «abierto» DE TODO EL NEGOCIO. Y una sesión de caja pertenece a
     * UNA terminal: `venta.cobrar` exige la de ESTA terminal
     * (`sesionAbiertaDeTerminal`), porque el arqueo del cajón que tienes
     * delante no se puede cuadrar con los movimientos del cajón de al lado.
     *
     * El resultado era el peor desacuerdo posible: la pantalla decía «caja
     * abierta» —había una, en otra terminal— dejaba armar la venta entera, y al
     * pulsar CONFIRMAR el servidor contestaba «Abre la caja antes de cobrar».
     * Con la caja de la otra caja abierta en la pantalla.
     *
     * `/api/caja/estado` es lo que usan las otras cuatro pantallas de caja del
     * sistema —`abarrotes/Caja`, `Cortes`, `cafeteria/Turno`, `restaurante/Caja`,
     * `estetica-salon/CajaYCorte`— y resuelve la terminal del ÁMBITO de la
     * sesión. Ésta era la única que preguntaba por otro camino.
     */
    Promise.all([
      consultarPuente<ProductoDeMostrador>('ProductoTerminado', {
        limite: 2000,
        signal: control.signal,
      }),
      invocarComando<EstadoDeLaCaja>('/api/caja/estado', {}, { signal: control.signal }),
    ])
      .then(([filas, estado]) => {
        if (!sigueMontada()) return;
        setProductos(filas);
        setCaja(
          estado.abierta
            ? {
                id: estado.sesionCajaId ?? '',
                estado: 'abierto',
                // El nombre de quien abrió no viaja en el estado y no hace falta
                // para cobrar: es el pie de página, y se prefiere «sin nombre» a
                // una consulta más en la pantalla que más se abre del día.
                usuario_apertura_nombre: null,
              }
            : null,
        );
      })
      .catch((fallo: unknown) => {
        if (!sigueMontada()) return;
        // NO LEYÓ: ni catálogo ni caja. Antes esto caía en el muro de «caja
        // cerrada» con el motivo escondido; ahora se dice qué pasó y se reintenta.
        setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer el catálogo.');
      });
    return () => {
      control.abort();
    };
  }, [productosIniciales, intento]);

  function reintentar(): void {
    setFalloDeCarga(null);
    setProductos(null);
    setCaja(undefined);
    setIntento((previo) => previo + 1);
  }

  useEffect(() => {
    if (destacada === null) return;
    const reloj = setTimeout(() => {
      setDestacada(null);
    }, MS_DESTACADO);
    return () => {
      clearTimeout(reloj);
    };
  }, [destacada]);

  const agregar = useCallback((producto: ProductoDeMostrador) => {
    setLineas((previas) => conProducto(previas, producto));
    setDestacada(producto.id);
    setUltimo(producto.nombre ?? 'Producto');
    setSinCatalogar(null);
    setBusqueda('');
  }, []);

  const porCodigo = useMemo(() => {
    const mapa = new Map<string, ProductoDeMostrador>();
    for (const fila of productos ?? []) if (fila.codigo_barras !== null) mapa.set(fila.codigo_barras, fila); // prettier-ignore
    return mapa;
  }, [productos]);

  /** Lo que F2 encuentra: el primero que coincide, para agregarlo con Enter. */
  const hallazgo = useMemo(() => {
    const aguja = busqueda.trim().toLocaleLowerCase('es-MX');
    if (aguja === '') return undefined;
    return (productos ?? []).find((f) =>
      (f.nombre ?? '').toLocaleLowerCase('es-MX').includes(aguja),
    );
  }, [productos, busqueda]);

  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => {
      const previo = racha.current;
      const enCampo =
        evento.target instanceof HTMLInputElement || evento.target instanceof HTMLTextAreaElement;

      if (evento.key === 'Enter') {
        racha.current = { texto: '', ultima: 0 };
        if (metodo !== null || previo.texto.length < LARGO_MINIMO_CODIGO) return;
        evento.preventDefault();
        const producto = porCodigo.get(previo.texto);
        if (producto === undefined) setSinCatalogar(previo.texto);
        else agregar(producto);
        return;
      }
      if (evento.key.length === 1) {
        // El ritmo se mide SIEMPRE, también con el foco dentro de un campo:
        // es lo único que distingue al lector de una mano.
        const seguida = evento.timeStamp - previo.ultima < MS_ENTRE_TECLAS;
        racha.current = {
          texto: seguida ? previo.texto + evento.key : evento.key,
          ultima: evento.timeStamp,
        };
        // Un código de barras no trae signos: esto nunca pisa un escaneo.
        if (!enCampo && (evento.key === '+' || evento.key === '-')) {
          setLineas((previas) => {
            const fin = previas.at(-1);
            const paso = evento.key === '+' ? 1 : -1;
            return fin === undefined ? previas : conCantidad(previas, fin.productoId, paso);
          });
        }
        return;
      }
      if (evento.key === 'Escape') {
        setMetodo(null);
        setLineas([]);
        setRecibido(null);
      } else if (evento.key === 'Delete' && !enCampo) {
        // Supr DESHACE la última línea: el error se corrige, no se previene.
        setLineas((previas) => previas.slice(0, -1));
      } else if (evento.key === 'F2') {
        evento.preventDefault();
        campo.current?.focus();
      } else if (evento.key === 'F12') {
        evento.preventDefault();
        setMetodo('efectivo');
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, [agregar, metodo, porCodigo]);

  const total = totalDe(lineas);
  const piezas = lineas.reduce((suma, linea) => suma + linea.cantidad, 0);
  // Un campo vacío o que no es un importe cuenta como cero: el cambio sale
  // negativo y CONFIRMAR se queda apagado hasta que lo recibido alcance.
  const recibidoCentavos = recibido ?? 0;
  const cambio = recibidoCentavos - total;
  const falta = cambio < 0;

  /**
   * Un solo viaje. El documento no nombra la ruta, así que sigue la convención
   * `/api/<dominio>/<verbo>`: encadenar abrir-orden, N líneas y cobrar serían
   * N+2 idas en plena ráfaga. El total viaja para que el servidor RECHACE si
   * no coincide con el suyo —cobrar un número distinto del que ya se dijo en
   * voz alta es peor que fallar— y la clave de idempotencia la pone
   * `invocarComando`, así que un doble Enter no cobra dos veces.
   */
  async function confirmar(): Promise<void> {
    // Sin red no se cobra (F-988): ni con el botón —deshabilitado— ni con Enter.
    if (!enLinea) return;
    setEnviando(true);
    setError(null);
    try {
      const venta = await invocarComando<{ ventaId: string }>('/api/venta/cobrar-mostrador', {
        metodo,
        totalEsperadoCentavos: total,
        recibidoCentavos: metodo === 'efectivo' ? recibidoCentavos : total,
        lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: String(l.cantidad) })),
      });
      setLineas([]);
      setRecibido(null);
      setMetodo(null);
      setUltimo(null);
      onCobrado?.(venta.ventaId);
    } catch (fallo) {
      // La venta NO se pierde nunca: la lista sigue ahí y sólo se dice qué pasó.
      setError(fallo instanceof Error ? fallo.message : 'No se pudo cobrar. No se cobró nada.');
    } finally {
      setEnviando(false);
    }
  }

  if (falloDeCarga !== null) {
    return (
      <div className="mx-auto max-w-lg p-(--espacio-6)">
        <ErrorDePantalla
          titulo="No se pudo leer el catálogo ni la caja"
          queHacer="Sin el catálogo no se reconoce ningún código, y sin la caja no se sabe a qué corte pertenece lo que se cobra. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDeCarga}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </div>
    );
  }

  if (productos === null || caja === undefined) {
    // Esqueletos con la forma de la venta, no un spinner: el total a la derecha,
    // el campo y los renglones del ticket a la izquierda. Así nada salta al llegar
    // el catálogo y el ojo ya sabe dónde va a mirar.
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Leyendo el catálogo y la caja"
        className="grid gap-(--espacio-3) p-(--espacio-3) md:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_26rem]"
      >
        <div className="flex flex-col gap-(--espacio-3) md:col-start-2 md:row-start-1">
          <Esqueleto className="h-40 w-full rounded-lg" />
          <Esqueleto className="hidden h-48 w-full rounded-lg xl:block" />
        </div>
        <div className="flex flex-col gap-(--espacio-2) md:col-start-1 md:row-start-1">
          <Esqueleto className="h-(--altura-control) w-full" />
          {Array.from({ length: 6 }, (_, indice) => (
            <div key={indice} className="flex items-center gap-(--espacio-3) py-(--espacio-1)">
              <Esqueleto className="h-4 w-8" />
              <Esqueleto className="h-4 flex-1" />
              <Esqueleto className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (caja === null) {
    // UN MURO, no un vacío. La acción va DEBAJO del motivo: a su lado, en un
    // teléfono, aplastaba el texto a una columna de tres palabras.
    return (
      <div className="mx-auto max-w-xl px-(--espacio-4) py-(--espacio-12)">
        <Aviso tono="atencion" titulo="La caja está cerrada">
          <p>
            {`${voc.conDeterminante('un', 'orden')} sin caja no pertenece a ningún corte: al terminar el día no habría contra qué cuadrarl${voc.terminacion('orden')}.`}
          </p>
          <Button asChild className="mt-(--espacio-3)">
            <a href="/caja">Ábrela para empezar a vender</a>
          </Button>
        </Aviso>
      </div>
    );
  }

  if (productos.length === 0) {
    return (
      <div className="mx-auto max-w-lg p-(--espacio-4)">
        <Vacio
          icono={<PackagePlus />}
          titulo="Todavía no hay nada que escanear."
          explicacion={`Esta pantalla vive del código de barras: en cuanto el catálogo tenga ${voc.plural('producto')} con su código y su precio, pasar el lector por uno lo pone en la lista y lo cobra.`}
          accion={
            <Button asChild>
              <a href="/productos">Cargar el catálogo</a>
            </Button>
          }
        />
      </div>
    );
  }

  const columnas: readonly ColumnaDeTabla<LineaDeVenta>[] = [
    {
      clave: 'cantidad',
      titulo: 'Cant.',
      numerica: true,
      // Nunca se pierde, en ningún ancho: es la que se verifica de reojo.
      celda: (linea) => <span className="font-bold">{linea.cantidad} ×</span>,
    },
    {
      clave: 'producto',
      titulo: voc.titulo('producto'),
      celda: (linea) => (
        <span className="line-clamp-2">
          {linea.nombre}
          {/* El color nunca es el único portador: va la palabra junto al punto. */}
          {linea.sinExistencia && (
            <span className="ml-(--espacio-2) inline-flex items-center gap-(--espacio-1) text-xs text-texto-sutil">
              <Circle aria-hidden="true" className="size-2 fill-advertencia text-advertencia" />
              sin existencia
            </span>
          )}
        </span>
      ),
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      // La tableta pierde el precio unitario si no cabe; el importe, nunca.
      desde: 'lg',
      celda: (linea) => (
        <Dinero centavos={linea.precioCentavos} tamano="sm" className="text-texto-sutil" />
      ),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (linea) => (
        <Dinero centavos={linea.precioCentavos * linea.cantidad} className="font-medium" />
      ),
    },
    {
      clave: 'quitar',
      titulo: 'Quitar',
      celda: (linea) => (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Quitar uno de ${linea.nombre}`}
          onClick={() => {
            setLineas(conCantidad(lineas, linea.productoId, -1));
          }}
        >
          <Minus />
        </Button>
      ),
    },
  ];

  const cobroEnReposo = (
    // En la tableta, COBRAR y sus desvíos en un renglón para no comerse la lista.
    <div className="flex flex-col gap-(--espacio-2) md:flex-row md:items-center xl:flex-col xl:items-stretch">
      <Button
        size="lg"
        className="min-h-20 w-full justify-between text-lg md:flex-1 xl:flex-none"
        disabled={lineas.length === 0}
        onClick={() => {
          setMetodo('efectivo');
        }}
      >
        <span>COBRAR</span>
        <Tecla>F12</Tecla>
      </Button>
      <div className="flex flex-wrap gap-(--espacio-1)">
        {DESVIOS.map((desvio) => (
          <Button
            key={desvio.clave}
            size="sm"
            variant="ghost"
            disabled={lineas.length === 0}
            onClick={() => {
              setMetodo(desvio.clave);
            }}
          >
            {desvio.etiqueta}
            <Tecla>{desvio.tecla}</Tecla>
          </Button>
        ))}
      </div>
    </div>
  );

  const cobroExpandido = (
    <>
      <h2 className="text-xs font-medium tracking-widest text-texto-sutil uppercase">
        {etiquetaDeMetodo(metodo ?? 'efectivo')}
      </h2>
      {metodo === 'efectivo' && (
        <div className="grid gap-(--espacio-3) md:grid-cols-2 md:items-center xl:grid-cols-1">
          <div className="flex flex-col gap-(--espacio-2)">
            <div className="flex flex-col gap-(--espacio-1)">
              <Label htmlFor="cobrar-recibido">Recibí</Label>
              <CampoDeDinero
                id="cobrar-recibido"
                tamano="grande"
                autoFocus
                centavos={recibido}
                alCambiar={setRecibido}
                onKeyDown={(evento) => {
                  if (evento.key === 'Enter' && cambio >= 0 && !enviando) void confirmar();
                }}
              />
            </div>
            {/* `$200` es la respuesta en más de la mitad de los tickets. */}
            <div className="grid grid-cols-4 gap-(--espacio-1)">
              {[total, ...DENOMINACIONES].map((monto, indice) => (
                <Button
                  key={indice === 0 ? 'exacto' : String(monto)}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRecibido(monto);
                  }}
                >
                  {indice === 0 ? 'Exacto' : <Dinero centavos={monto} tamano="sm" />}
                </Button>
              ))}
            </div>
          </div>
          {/* El cambio en grande porque es el número que se dice en voz alta y el
              que causa discusiones. Se lee a un metro. Mientras no alcanza, dice
              cuánto FALTA en vez de un cambio negativo en rojo. */}
          <div className="flex flex-col items-center gap-(--espacio-1) text-center">
            <p className="text-xs font-medium tracking-widest text-texto-sutil uppercase">
              {falta ? 'Falta' : 'Cambio'}
            </p>
            <Dinero
              centavos={falta ? -cambio : cambio}
              tamano="total"
              className={falta ? 'leading-none text-texto-sutil' : 'leading-none'}
            />
          </div>
        </div>
      )}
      <Button
        size="lg"
        variant="success"
        className="min-h-20 w-full justify-between text-lg"
        aria-busy={enviando}
        disabled={!enLinea || enviando || (metodo === 'efectivo' && falta)}
        onClick={() => {
          void confirmar();
        }}
      >
        <span>{enviando ? 'Cobrando…' : 'CONFIRMAR'}</span>
        <Tecla>Enter</Tecla>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        onClick={() => {
          setMetodo(null);
        }}
      >
        Esc para regresar
      </Button>
    </>
  );

  return (
    // FLEX en teléfono, rejilla de tablet para arriba: en una rejilla lo pegajoso
    // sólo se pega dentro de su celda, y el total no se quedaba arriba.
    <div className="flex flex-col gap-(--espacio-3) p-(--espacio-3) pb-56 md:grid md:grid-cols-[minmax(0,1fr)_18rem] md:grid-rows-[auto_1fr_auto] md:pb-48 xl:grid-cols-[minmax(0,1fr)_26rem] xl:pb-(--espacio-3)">
      <h1 className="sr-only">Cobrar</h1>
      {enLinea ? null : <AvisoSinConexion className="md:col-span-2" />}

      {/* PRIMARIO · el total. En teléfono se queda pegado arriba; de tablet para
          arriba es la cabeza de la columna derecha. En los dos casos es lo primero. */}
      <Superficie
        nivel={2}
        relleno={4}
        como="section"
        aria-label={`Total de ${voc.enFrase('orden')}`}
        className="sticky top-0 z-20 flex flex-col items-center gap-(--espacio-1) text-center md:static md:col-start-2 md:row-start-1 md:self-start md:shadow-1"
      >
        <p className="text-xs font-medium tracking-widest text-texto-sutil uppercase">Total</p>
        <Dinero centavos={total} tamano="total" className="leading-none" />
        {/* En teléfono desaparecen el desglose y el conteo: ahí no se vende. */}
        <p className="mt-(--espacio-2) hidden items-baseline justify-center gap-(--espacio-4) text-sm text-texto-sutil md:flex">
          <Cifra valor={piezas} unidad={piezas === 1 ? 'artículo' : 'artículos'} tamano="sm" />
          <span className="inline-flex items-baseline gap-(--espacio-1)">
            IVA incluido <Dinero centavos={ivaIncluido(total)} tamano="sm" />
          </span>
        </p>
      </Superficie>

      {/* SECUNDARIO · la lista, con el campo de búsqueda encima. */}
      <section
        aria-label={`${voc.titulo('orden')} en curso`}
        className="flex min-w-0 flex-col gap-(--espacio-2) md:col-start-1 md:row-span-2 md:row-start-1"
      >
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="cobrar-busqueda">Código o nombre · F2</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-4 -translate-y-1/2 text-texto-sutil"
            />
            <Input
              id="cobrar-busqueda"
              ref={campo}
              value={busqueda}
              placeholder={`${voc.conArticulo('producto')} sin código, o el que no leyó`}
              onChange={(evento) => {
                setBusqueda(evento.target.value);
              }}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter' && hallazgo !== undefined) agregar(hallazgo);
              }}
              className="pl-(--espacio-10)"
            />
          </div>
          {hallazgo !== undefined && (
            <p className="flex items-baseline justify-between gap-(--espacio-2) text-sm text-texto-sutil">
              <span>Enter agrega: {hallazgo.nombre}</span>
              <Dinero centavos={precioEnCentavos(hallazgo)} tamano="sm" />
            </p>
          )}
        </div>

        {sinCatalogar !== null && (
          <Aviso tono="atencion" titulo={`El código ${sinCatalogar} no está en el catálogo.`}>
            {`Búscalo por nombre con F2, o dalo de alta sin salir de ${voc.enFrase('orden')}.`}
          </Aviso>
        )}

        {/* Crece hacia abajo: nunca un scroll automático que mueva las de arriba. */}
        <Tabla
          etiqueta={`Artículos de ${voc.enFrase('orden')}`}
          columnas={columnas}
          filas={lineas}
          claveDe={(linea) => linea.productoId}
          // La recién escaneada es la fila activa durante un segundo.
          {...(destacada === null ? {} : { activa: destacada })}
          alto="max-h-[50vh] md:max-h-[60vh] xl:max-h-[68vh]"
          vacio={
            <Superficie
              nivel={0}
              relleno={0}
              className="flex min-h-64 items-center justify-center border-dashed"
            >
              {/* Esta pantalla ES el lector, y lo primero que se ve tiene que decirlo. */}
              <Vacio
                icono={<ScanBarcode />}
                titulo={`Escanea el primer ${voc.singular('producto')}`}
                explicacion="El lector ya está escuchando: no hay nada que tocar."
              />
            </Superficie>
          }
        />
      </section>

      {/* TERCIARIO · el cobro. En PC es la columna derecha; de tablet para abajo es
          la franja fija del borde inferior, a la altura del pulgar y sin nada que
          sostener. */}
      <Superficie
        como="aside"
        nivel={3}
        radio="sm"
        relleno={3}
        aria-label="Cobro"
        className="fixed inset-x-0 bottom-0 z-20 rounded-none xl:static xl:col-start-2 xl:row-start-2 xl:self-start xl:rounded-lg xl:shadow-1"
      >
        <div className="flex w-full flex-col gap-(--espacio-2) md:mx-auto md:max-w-3xl xl:max-w-none">
          {/* El error vive EN el bloque de cobro, donde se estaba mirando. */}
          {error !== null && (
            <Aviso tono="peligro" titulo={error}>
              {`${voc.conArticulo('orden')} sigue complet${voc.terminacion('orden')} en la lista: no se perdió nada.`}
            </Aviso>
          )}
          {metodo === null ? cobroEnReposo : cobroExpandido}
        </div>
      </Superficie>

      {/* CUATERNARIO · el único informativo permitido, y sólo porque confirma que
          el escaneo funcionó: el tercer canal, el que se mira de reojo. */}
      <footer
        role="status"
        className="hidden items-center justify-between gap-(--espacio-3) border-t border-borde pt-(--espacio-2) text-xs text-texto-sutil md:col-span-2 md:row-start-3 md:flex"
      >
        <span>Caja abierta · {caja.usuario_apertura_nombre ?? 'sin nombre'}</span>
        {ultimo === null ? (
          <span>Sin escaneos todavía</span>
        ) : (
          <span className="inline-flex items-center gap-(--espacio-1)">
            Últ: <span className="font-medium text-texto">{ultimo}</span>
            <Check aria-hidden="true" className="size-4 text-exito" />
          </span>
        )}
      </footer>
    </div>
  );
}
