'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

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
 * 4. Sin conexión (F-988) no se simula: la decisión de la cola sigue abierta.
 * 5. `existencia` la expondrá el puente; hoy llega vacía y el punto no sale.
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

export interface ProductoDeMostrador {
  readonly id: string;
  readonly nombre: string | null;
  readonly precio_venta: number | null;
  readonly codigo_barras: string | null;
  readonly existencia?: number | null;
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

/** Pesos a centavos contando dígitos: `58.995 * 100` pierde medio centavo. */
function aCentavos(pesos: number | null | undefined): number {
  if (pesos === null || pesos === undefined || !Number.isFinite(pesos)) return 0;
  const [entero = '0', decimal = '00'] = Math.abs(pesos).toFixed(2).split('.');
  return (pesos < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

/** Centavos a pesos para una persona. Aritmética entera de punta a punta. */
export function enPesos(centavos: number): string {
  const bruto = Math.abs(centavos);
  const miles = Math.trunc(bruto / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${centavos < 0 ? '-' : ''}$${miles}.${(bruto % 100).toString().padStart(2, '0')}`;
}

export function centavosDeTexto(texto: string): number {
  const limpio = texto.replace(/[^\d.]/g, '');
  return limpio === '' ? 0 : aCentavos(Number(limpio));
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
      precioCentavos: aCentavos(producto.precio_venta),
      cantidad: 1,
      // Existencia 0 NO bloquea: se agrega y se marca. Bloquear aquí es perder
      // una venta real por un dato de inventario que casi nunca está al día.
      sinExistencia: typeof producto.existencia === 'number' && producto.existencia <= 0,
    },
  ];
}

export function Cobrar({ productosIniciales, cajaInicial, onCobrado }: CobrarProps) {
  const voc = useVocabulario();
  const [productos, setProductos] = useState<readonly ProductoDeMostrador[] | null>(
    productosIniciales ?? null,
  );
  const [caja, setCaja] = useState<CajaDelDia | null | undefined>(
    productosIniciales === undefined ? cajaInicial : (cajaInicial ?? null),
  );
  const [lineas, setLineas] = useState<readonly LineaDeVenta[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [destacada, setDestacada] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [sinCatalogar, setSinCatalogar] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [recibido, setRecibido] = useState('');
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
    Promise.all([
      consultarPuente<ProductoDeMostrador>('ProductoTerminado', {
        limite: 2000,
        signal: control.signal,
      }),
      consultarPuente<CajaDelDia>('CorteCaja', { limite: 1, signal: control.signal }),
    ])
      .then(([filas, cajas]) => {
        if (!sigueMontada()) return;
        setProductos(filas);
        setCaja(cajas.find((fila) => fila.estado === 'abierto') ?? null);
      })
      .catch((fallo: unknown) => {
        if (!sigueMontada()) return;
        setProductos([]);
        setCaja(null);
        setError(fallo instanceof Error ? fallo.message : 'No se pudo leer el catálogo.');
      });
    return () => {
      control.abort();
    };
  }, [productosIniciales]);

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
        setRecibido('');
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
  const cambio = centavosDeTexto(recibido) - total;

  /**
   * Un solo viaje. El documento no nombra la ruta, así que sigue la convención
   * `/api/<dominio>/<verbo>`: encadenar abrir-orden, N líneas y cobrar serían
   * N+2 idas en plena ráfaga. El total viaja para que el servidor RECHACE si
   * no coincide con el suyo —cobrar un número distinto del que ya se dijo en
   * voz alta es peor que fallar— y la clave de idempotencia la pone
   * `invocarComando`, así que un doble Enter no cobra dos veces.
   */
  async function confirmar(): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const venta = await invocarComando<{ ventaId: string }>('/api/venta/cobrar-mostrador', {
        metodo,
        totalEsperadoCentavos: total,
        recibidoCentavos: metodo === 'efectivo' ? centavosDeTexto(recibido) : total,
        lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: String(l.cantidad) })),
      });
      setLineas([]);
      setRecibido('');
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

  if (productos === null || caja === undefined) {
    // Esqueletos con la forma de la venta, no un spinner: así nada salta al
    // llegar el catálogo y el ojo ya sabe dónde va a mirar.
    return (
      <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Skeleton className="min-h-40 w-full rounded-lg md:order-2" />
        <div className="space-y-2 md:order-1">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (caja === null) {
    return (
      <div className="mx-auto max-w-md space-y-3 rounded-lg border border-warning/60 bg-warning/15 p-6 text-center">
        <p className="text-xl font-semibold">La caja está cerrada</p>
        <p className="text-sm">
          Una venta sin caja no pertenece a ningún corte: al terminar el día no habría contra qué
          cuadrarla. Por eso esto es un muro y no un aviso.
        </p>
        <Button asChild>
          <a href="/caja">Ábrela para empezar a vender</a>
        </Button>
      </div>
    );
  }

  if (productos.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-8 text-center">
        <p className="text-xl font-semibold">Todavía no hay nada que escanear.</p>
        <p className="text-muted-foreground">
          Esta pantalla vive del código de barras: en cuanto el catálogo tenga productos con su
          código y su precio, pasar el lector por uno lo pone en la lista y lo cobra.
        </p>
        <Button asChild>
          <a href="/productos">Cargar el catálogo</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-3 pb-56 md:grid-cols-[minmax(0,1fr)_18rem] md:pb-48 xl:grid-cols-[minmax(0,1fr)_26rem] xl:pb-3">
      {/* En teléfono el total se queda pegado arriba; de tablet para arriba es
          la cabeza de la columna derecha. En los dos casos es lo primero. */}
      <section
        aria-label={`Total de ${voc.enFrase('orden')}`}
        className="sticky top-0 z-20 rounded-lg border border-border bg-card p-4 text-center md:static md:col-start-2 md:row-start-1"
      >
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Total</p>
        <p className="text-6xl font-bold leading-none tabular-nums md:text-7xl xl:text-8xl">
          {enPesos(total)}
        </p>
        {/* En teléfono desaparecen el desglose y el conteo: ahí no se vende. */}
        <p className="mt-2 hidden justify-center gap-4 text-sm text-muted-foreground md:flex">
          <span>{piezas} artículos</span>
          <span className="tabular-nums">IVA incluido {enPesos(ivaIncluido(total))}</span>
        </p>
      </section>

      <section
        aria-label={`${voc.titulo('orden')} en curso`}
        className="space-y-2 md:col-start-1 md:row-span-3"
      >
        <div className="space-y-1">
          <Label htmlFor="cobrar-busqueda">Código o nombre · F2</Label>
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
          />
          {hallazgo !== undefined && (
            <p className="text-sm text-muted-foreground">Enter agrega: {hallazgo.nombre}</p>
          )}
        </div>

        {error !== null && (
          <p role="alert" className="rounded-md border border-destructive bg-destructive/15 p-2">
            {error} · La venta sigue completa aquí: no se perdió nada.
          </p>
        )}
        {sinCatalogar !== null && (
          <p role="alert" className="rounded-md border border-warning/60 bg-warning/15 p-2">
            El código {sinCatalogar} no está en el catálogo. Búscalo por nombre con F2, o dalo de
            alta sin salir de la venta.
          </p>
        )}

        {/* La lista crece hacia abajo con la última visible: nunca un scroll
            automático que mueva de sitio las de arriba mientras se verifican. */}
        <ul className="min-h-32 divide-y divide-border rounded-lg border border-border">
          {lineas.length === 0 && (
            <li className="flex min-h-32 flex-col items-center justify-center gap-1 p-6 text-center">
              <span aria-hidden className="text-3xl tracking-widest">
                ▊▌▊▎▊
              </span>
              <p className="text-lg font-medium">Escanea el primer {voc.singular('producto')}</p>
              <p className="text-sm text-muted-foreground">
                El lector ya está escuchando: no hay nada que tocar.
              </p>
            </li>
          )}
          {lineas.map((linea) => (
            <li
              key={linea.productoId}
              className={`flex items-center gap-2 p-2 ${destacada === linea.productoId ? 'bg-primary/15' : ''}`}
            >
              <span className="w-12 shrink-0 text-right font-bold tabular-nums">
                {linea.cantidad} ×
              </span>
              <span className="flex-1 truncate">
                {linea.nombre}
                {/* El color nunca es el único portador: va la palabra. */}
                {linea.sinExistencia && (
                  <span className="ml-1 text-xs text-muted-foreground">● sin existencia</span>
                )}
              </span>
              {/* La tablet pierde el precio unitario si no cabe. Nunca pierde
                  la cantidad: es la que se verifica de reojo. */}
              <span className="hidden w-20 text-right tabular-nums text-muted-foreground xl:inline">
                {enPesos(linea.precioCentavos)}
              </span>
              <span className="w-24 shrink-0 text-right font-medium tabular-nums">
                {enPesos(linea.precioCentavos * linea.cantidad)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Quitar uno de ${linea.nombre}`}
                onClick={() => {
                  setLineas(conCantidad(lineas, linea.productoId, -1));
                }}
              >
                −
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {/* En PC es la columna derecha; de tablet para abajo es la franja fija
          del borde inferior, a la altura del pulgar y sin nada que sostener. */}
      <aside
        aria-label="Cobro"
        className="fixed inset-x-0 bottom-0 z-20 space-y-2 border-t border-border bg-card p-3 md:col-start-2 md:row-start-2 xl:static xl:rounded-lg xl:border"
      >
        {metodo === null ? (
          <>
            <Button
              size="lg"
              className="min-h-20 w-full justify-between text-lg"
              disabled={lineas.length === 0}
              onClick={() => {
                setMetodo('efectivo');
              }}
            >
              <span>COBRAR</span>
              <span aria-hidden>F12</span>
            </Button>
            <div className="flex flex-wrap gap-1">
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
                  {desvio.etiqueta} <span aria-hidden>{desvio.tecla}</span>
                </Button>
              ))}
            </div>
          </>
        ) : (
          <>
            {metodo === 'efectivo' && (
              <>
                <Label htmlFor="cobrar-recibido">Recibí</Label>
                <Input
                  id="cobrar-recibido"
                  autoFocus
                  inputMode="decimal"
                  value={recibido}
                  onChange={(evento) => {
                    setRecibido(evento.target.value);
                  }}
                  onKeyDown={(evento) => {
                    if (evento.key === 'Enter' && cambio >= 0 && !enviando) void confirmar();
                  }}
                />
                {/* El cambio en grande porque es el número que se dice en voz
                    alta y el que causa discusiones. Se lee a un metro. */}
                <p className="text-sm font-medium uppercase text-muted-foreground">Cambio</p>
                <p className="text-4xl font-bold tabular-nums xl:text-5xl">{enPesos(cambio)}</p>
                <div className="flex flex-wrap gap-1">
                  {[total, ...DENOMINACIONES].map((monto, indice) => (
                    <Button
                      key={indice}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRecibido((monto / 100).toFixed(2));
                      }}
                    >
                      {indice === 0 ? 'Exacto' : enPesos(monto)}
                    </Button>
                  ))}
                </div>
              </>
            )}
            <Button
              size="lg"
              className="min-h-20 w-full justify-between text-lg"
              disabled={enviando || (metodo === 'efectivo' && cambio < 0)}
              onClick={() => {
                void confirmar();
              }}
            >
              <span>{enviando ? 'Cobrando…' : 'CONFIRMAR'}</span>
              <span aria-hidden>Enter</span>
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
        )}
      </aside>

      {/* El único informativo permitido, y sólo porque confirma que el escaneo
          funcionó: el tercer canal, el que se mira de reojo. */}
      <footer
        role="status"
        className="hidden justify-between text-xs text-muted-foreground md:col-span-2 md:row-start-3 md:flex"
      >
        <span>Caja abierta · {caja.usuario_apertura_nombre ?? 'sin nombre'}</span>
        <span>{ultimo === null ? 'Sin escaneos todavía' : `Últ: ${ultimo} ✓`}</span>
      </footer>
    </div>
  );
}
