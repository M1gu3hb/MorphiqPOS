'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Tabla,
  VIAJE,
  Vacio,
  conTransicion,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Check, CupSoda, Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';

import { ApartadosDeHoy } from './ApartadosDeHoy';
import { OpcionesDeLaBebida } from './OpcionesDeLaBebida';
import type { EleccionDeBebida, OpcionDeBebida } from './opciones-de-bebida';
import {
  conBebida,
  conCantidad,
  lineasParaCobrar,
  totalDe,
  type BebidaParaElPedido,
  type LineaDelPedido,
} from './pedido-de-barra';

/**
 * PANTALLA · cafeteria · cobrar
 *
 * La pantalla insignia del modelo y la de inicio del barista. 150–220 veces al
 * día, siempre con alguien enfrente y casi siempre con fila detrás.
 *
 * ── Por qué una rejilla completa y no un buscador ────────────────────────
 * Porque el menú de una cafetería son 35 a 55 productos, no tres mil: caben
 * todos, con tarjetas grandes, y **reconocer es más rápido que teclear**. El
 * barista escucha «un latte grande con avena» y toca.
 *
 * ── El nombre y el canal van ARRIBA, no en el cobro ──────────────────────
 * Porque es lo primero que se dice en un mostrador mexicano —«¿a nombre de
 * quién?», «¿aquí o para llevar?»—. El nombre decide cómo se llama el pedido en
 * la barra (F-329) y el canal qué empaque se consume (F-331): **sin canal no se
 * cobra**. Sin nombre sí: entra como «Sin nombre» y se grita un folio.
 *
 * ── El total vive DENTRO del botón ───────────────────────────────────────
 * La diferencia más visible con el cobro de `restaurante`: aquí el que cobra es
 * el que va a preparar, y dice el total mirando al cliente con la mano ya sobre
 * el botón. Por eso el botón es lo más pesado de la pantalla y el pedido es una
 * tabla densa, no una lista de tarjetas: es un recibo, no un escaparate.
 *
 * ── El producto VIAJA al pedido ──────────────────────────────────────────
 * Al tocar una tesela, la tesela vuela al renglón del pedido (`conTransicion`,
 * `VIAJE.producto`). No es adorno: con fila detrás, el barista toca sin mirar el
 * pedido, y el movimiento le confirma con el rabillo del ojo qué entró y dónde.
 * Dura lo que la perilla de movimiento diga, y cero en `nula` o con la
 * preferencia del sistema. Sólo viaja la tesela; la página no se funde.
 *
 * ── Alcance, dicho y no escondido ────────────────────────────────────────
 * 1. Una bebida con opciones abre SUS opciones encima del cobro —la leche, el tamaño,
 *    la temperatura— y vuelve con lo elegido (C.10 de la 2.4). Antes eran otra
 *    pantalla que metía la bebida en un borrador que este cobro nunca leía: el latte
 *    de avena no se podía cobrar desde el mostrador.
 * 2. El cobro sale en efectivo por el importe exacto; el mixto vive en el
 *    diálogo de cobro.
 * 3. `F12`, `F2` y `F3` son del navegador; sí funcionan `Esc` y `F4`.
 * 4. «Agotado» sale de la `existencia` que el puente sirve para lo que se vende tal
 *    cual (C.9 de la 2.4); lo de receta no tiene contador y no se apaga por eso.
 */

const CANALES = [
  { clave: 'aqui', etiqueta: 'Aquí' },
  { clave: 'llevar', etiqueta: 'Para llevar' },
] as const;

type Canal = (typeof CANALES)[number]['clave'];

/** El cambio en caja, en centavos. Los dos umbrales del documento. */
const CAMBIO_POCO = 50_000;
const CAMBIO_URGENTE = 25_000;

export interface ProductoDeBarra {
  readonly id: string;
  readonly nombre: string | null;
  readonly precio_venta: number | null;
  readonly categoria_nombre: string | null;
  readonly visible_en_pos: boolean | null;
  /**
   * La existencia de su insumo base, del puente (C.9 de la 2.4). Un producto de receta
   * —un latte— no la tiene y llega nulo: no se marca agotado por no tener contador.
   */
  readonly existencia?: number | null;
}

/** Se acabó lo que se vende tal cual: su existencia llegó y ya no queda. */
export function estaAgotado(producto: Pick<ProductoDeBarra, 'existencia'>): boolean {
  return typeof producto.existencia === 'number' && producto.existencia <= 0;
}

export interface TurnoDeBarra {
  readonly id: string;
  readonly estado: string | null;
  readonly usuario_apertura_nombre: string | null;
  readonly fecha_apertura: string | null;
  readonly efectivo_inicial_contado: number | null;
}

export interface CobrarProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly productosIniciales?: readonly ProductoDeBarra[];
  readonly turnoInicial?: TurnoDeBarra | null;
  readonly onCobrado?: (ordenId: string) => void;
}

/**
 * El precio de la tesela, en centavos. El puente lo sirve en pesos y `centavosDe` lo
 * convierte según la unidad del campo, contando dígitos. Sin precio cuenta cero: el
 * total viaja al cobro y el servidor lo rechaza si no coincide con el suyo.
 */
function precioDe(producto: ProductoDeBarra): number {
  return centavosDe('ProductoTerminado', 'precio_venta', producto.precio_venta) ?? 0;
}

/** Las categorías que de verdad tienen producto. Una pestaña vacía es una trampa. */
export function categoriasDe(productos: readonly ProductoDeBarra[]): readonly string[] {
  const vistas = new Set<string>();
  for (const producto of productos) vistas.add(producto.categoria_nombre ?? 'Otros');
  return [...vistas].sort((a, b) => a.localeCompare(b, 'es-MX'));
}

/** El aviso de cambio: su tono y su palabra. La palabra es la que manda. */
function avisoDeCambio(centavos: number): { readonly clase: string; readonly palabra: string } {
  if (centavos < CAMBIO_URGENTE)
    return { clase: 'bg-peligro/15 text-peligro', palabra: 'consíguelo ya' };
  if (centavos < CAMBIO_POCO) return { clase: 'bg-advertencia/25', palabra: 'va quedando poco' };
  return { clase: 'bg-fondo-sutil text-texto-sutil', palabra: 'alcanza' };
}

/** Qué impide cobrar, con palabras. Un botón apagado sin razón es un muro mudo. */
export function bloqueoDe(
  lineas: readonly LineaDelPedido[],
  canal: Canal | null,
  enLinea: boolean,
): string | null {
  if (!enLinea) return 'Sin internet. No se puede cobrar.';
  if (lineas.length === 0) return 'Toca una bebida para empezar.';
  if (canal === null) return 'Falta decir si es aquí o para llevar.';
  return null;
}

interface Carga {
  readonly productos: readonly ProductoDeBarra[];
  readonly turno: TurnoDeBarra | null;
  /** Las opciones de cada bebida, por producto: la que tiene, abre sus opciones al tocarla. */
  readonly opciones: ReadonlyMap<string, readonly OpcionDeBebida[]>;
}

/** Una opción de bebida del puente con su producto: `Modificador` sirve filas planas. */
interface OpcionConProducto extends OpcionDeBebida {
  readonly producto_id: string;
}

/** Las filas planas de `Modificador`, repartidas por bebida. */
export function opcionesPorProducto(
  filas: readonly OpcionConProducto[],
): ReadonlyMap<string, readonly OpcionDeBebida[]> {
  const mapa = new Map<string, OpcionDeBebida[]>();
  for (const fila of filas)
    mapa.set(fila.producto_id, [...(mapa.get(fila.producto_id) ?? []), fila]);
  return mapa;
}

/** La bebida como entra al pedido: el producto base y, si se eligió, lo elegido. */
function bebidaDe(producto: ProductoDeBarra, eleccion?: EleccionDeBebida): BebidaParaElPedido {
  return {
    productoId: producto.id,
    nombre: producto.nombre ?? 'Producto',
    precioBaseCentavos: precioDe(producto),
    ...(eleccion === undefined
      ? {}
      : { opciones: eleccion.opciones, alergias: eleccion.alergias, nota: eleccion.nota }),
  };
}

export function Cobrar({ productosIniciales, turnoInicial, onCobrado }: CobrarProps) {
  const voc = useVocabulario();
  const [carga, setCarga] = useState<Carga | null>(
    productosIniciales === undefined
      ? null
      : { productos: productosIniciales, turno: turnoInicial ?? null, opciones: new Map() },
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [lineas, setLineas] = useState<readonly LineaDelPedido[]>([]);
  const [nombre, setNombre] = useState('');
  const [canal, setCanal] = useState<Canal | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enLinea, setEnLinea] = useState(true);
  const [viajando, setViajando] = useState<string | null>(null);
  /** La bebida cuyas opciones están abiertas encima del cobro. */
  const [eligiendo, setEligiendo] = useState<ProductoDeBarra | null>(null);
  // `Esc` cierra las opciones si están abiertas; si no, limpia el pedido. El escucha se
  // registra una vez, así que lee el estado por aquí.
  const hayOpcionesAbiertas = useRef(false);
  useEffect(() => {
    hayOpcionesAbiertas.current = eligiendo !== null;
  }, [eligiendo]);

  // Cada intento de lectura es un número: el botón de reintentar lo sube, y el
  // efecto lee otra vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (productosIniciales !== undefined) return;
    let vivo = true;
    Promise.all([
      consultarPuente<ProductoDeBarra>('ProductoTerminado', { limite: 300 }),
      consultarPuente<TurnoDeBarra>('CorteCaja', { limite: 1 }),
      // Las opciones AYUDAN a cobrar: si no llegan, la bebida se cobra sencilla, al
      // precio base, que es lo que el servidor cobra sin opciones.
      consultarPuente<OpcionConProducto>('Modificador', { limite: 2000 }).catch(
        (): readonly OpcionConProducto[] => [],
      ),
    ])
      .then(([filas, turnos, opciones]) => {
        if (!vivo) return;
        setCarga({
          productos: filas.filter((fila) => fila.visible_en_pos !== false),
          turno: turnos.find((fila) => fila.estado === 'abierto') ?? null,
          opciones: opcionesPorProducto(opciones),
        });
      })
      .catch((fallo: unknown) => {
        if (!vivo) return;
        setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer el menú.');
      });
    return () => {
      vivo = false;
    };
  }, [productosIniciales, intento]);

  function reintentar(): void {
    setFalloDeCarga(null);
    setCarga(null);
    setIntento((previo) => previo + 1);
  }

  useEffect(() => {
    // Arranca en `true` y se corrige aquí: `navigator` no existe en el servidor
    // y leerlo al pintar daría una hidratación distinta del primer render.
    const anotar = () => {
      setEnLinea(navigator.onLine);
    };
    anotar();
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        if (hayOpcionesAbiertas.current) {
          setEligiendo(null);
          return;
        }
        setLineas([]);
        setNombre('');
        setCanal(null);
      } else if (evento.key === 'F4') {
        evento.preventDefault();
        setCanal((previo) => (previo === 'llevar' ? 'aqui' : 'llevar'));
      }
    };
    window.addEventListener('online', anotar);
    window.addEventListener('offline', anotar);
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('online', anotar);
      window.removeEventListener('offline', anotar);
      window.removeEventListener('keydown', alTeclear);
    };
  }, []);

  const productos = carga?.productos;
  const categorias = useMemo(
    () => (productos === undefined ? [] : categoriasDe(productos)),
    [productos],
  );
  const visibles = useMemo(() => {
    if (productos === undefined) return [];
    if (categoria === null) return productos;
    return productos.filter((fila) => (fila.categoria_nombre ?? 'Otros') === categoria);
  }, [productos, categoria]);

  const total = totalDe(lineas);
  const piezas = lineas.reduce((suma, linea) => suma + linea.cantidad, 0);
  const bloqueo = bloqueoDe(lineas, canal, enLinea);

  /**
   * La tesela viaja al renglón. Antes del cambio la TESELA lleva el nombre; dentro
   * del cambio se lo quita y se lo pone la FILA del pedido, y `flushSync` hace que
   * el navegador fotografíe el estado nuevo ya pintado.
   */
  function agregar(producto: ProductoDeBarra, tesela: HTMLElement): void {
    // Con opciones, primero se eligen: la leche y el tamaño cambian el precio y la receta.
    if ((carga?.opciones.get(producto.id)?.length ?? 0) > 0) {
      setEligiendo(producto);
      return;
    }
    tesela.style.viewTransitionName = VIAJE.producto(producto.id);
    void conTransicion(() => {
      flushSync(() => {
        tesela.style.viewTransitionName = '';
        setViajando(producto.id);
        setLineas((previas) => conBebida(previas, bebidaDe(producto)));
      });
    }).finally(() => {
      tesela.style.viewTransitionName = '';
      setViajando(null);
    });
  }

  /** Lo elegido en las opciones entra al pedido como su propia línea. */
  function alElegir(eleccion: EleccionDeBebida): void {
    if (eligiendo === null) return;
    const producto = eligiendo;
    setLineas((previas) => conBebida(previas, bebidaDe(producto, eleccion)));
    setEligiendo(null);
  }

  /**
   * UN SOLO VIAJE, el del mostrador (`/api/venta/cobrar-mostrador`): el servidor crea el
   * borrador de la terminal, lo VACÍA, mete cada línea —la que lleva opciones, por
   * `cafeteria.agregar_bebida`— y cobra. El total viaja sólo para que el servidor RECHACE
   * si no coincide con el suyo; la clave de idempotencia la pone `invocarComando`.
   *
   * Antes eran N+2 viajes sin vaciar: un cobro que fallaba dejaba sus líneas en el
   * borrador, el siguiente las metía ENCIMA y el total ya no cuadraba nunca —el mismo
   * defecto que tenía la tienda (C.10 de la 2.4)—.
   */
  async function cobrar(): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const cobrada = await invocarComando<{ ventaId: string }>('/api/venta/cobrar-mostrador', {
        metodo: 'efectivo',
        totalEsperadoCentavos: total,
        recibidoCentavos: total,
        lineas: lineasParaCobrar(lineas),
        ...(canal === null ? {} : { canal }),
        ...(nombre.trim() === '' ? {} : { nombrePedido: nombre.trim() }),
      });
      // Se limpia sola y vuelve al vacío: abrir un diálogo de ticket son dos
      // toques por venta, 360 al día. El ticket lo decide la perilla.
      setLineas([]);
      setNombre('');
      setCanal(null);
      onCobrado?.(cobrada.ventaId);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo cobrar. No se cobró nada.');
    } finally {
      setEnviando(false);
    }
  }

  if (falloDeCarga !== null) {
    return (
      <div className="mx-auto max-w-lg p-(--espacio-6)">
        <ErrorDePantalla
          titulo="No se pudo leer el menú ni el turno"
          queHacer="Mientras no se lean no se puede cobrar: no se sabría qué se vende ni a qué turno pertenece la venta. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDeCarga}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </div>
    );
  }

  if (carga === null) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando el menú"
        className="grid gap-(--espacio-3) p-(--espacio-3) xl:grid-cols-[minmax(0,1fr)_24rem]"
      >
        {/* La forma de la rejilla y del pedido, no una rueda: al llegar los datos
            nada salta, y el ojo ya sabe dónde va a mirar. */}
        <div className="grid grid-cols-2 gap-(--espacio-2) md:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 15 }, (_, indice) => (
            <Esqueleto key={indice} className="min-h-24 w-full rounded-lg" />
          ))}
        </div>
        <Esqueleto className="h-40 w-full rounded-lg xl:h-80" />
      </div>
    );
  }

  const { turno } = carga;

  if (turno === null) {
    return (
      <div className="mx-auto max-w-md p-(--espacio-8)">
        {/* Un MURO, no un aviso: un cobro sin turno no pertenece a ningún corte y
            no habría a qué caja cuadrarlo al final del día. */}
        <Aviso
          tono="atencion"
          titulo="Turno cerrado"
          accion={
            <Button asChild>
              <a href="/cafeteria/turno">Abrir turno</a>
            </Button>
          }
        >
          Un cobro sin turno no pertenece a ningún corte: no habría a qué caja cuadrarlo al final
          del día.
        </Aviso>
      </div>
    );
  }

  if (carga.productos.length === 0) {
    return (
      <Vacio
        icono={<CupSoda />}
        titulo={`Todavía no hay ${voc.plural('linea_orden')} en ${voc.enFrase('preparacion')}`}
        explicacion="Esta pantalla es una rejilla de lo que se vende: en cuanto el menú tenga sus productos con precio, aparecen aquí y se cobran tocándolos."
        accion={
          <Button asChild>
            <a href="/cafeteria/productos">Cargar el menú</a>
          </Button>
        }
      />
    );
  }

  const cambio =
    centavosDe('CorteCaja', 'efectivo_inicial_contado', turno.efectivo_inicial_contado) ?? 0;
  const aviso = avisoDeCambio(cambio);
  const nombreVisible = nombre.trim() === '' ? 'Sin nombre' : nombre.trim();

  const columnas: readonly ColumnaDeTabla<LineaDelPedido>[] = [
    {
      clave: 'producto',
      titulo: voc.titulo('linea_orden'),
      celda: (linea) => (
        <span className="line-clamp-2">
          <span className="font-numeros tabular-nums">{linea.cantidad} ×</span> {linea.nombre}
        </span>
      ),
    },
    {
      clave: 'cantidad',
      titulo: 'Cant.',
      celda: (linea) => (
        <span className="flex justify-end gap-(--espacio-1)">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Quitar uno de ${linea.nombre}`}
            onClick={() => {
              setLineas(conCantidad(lineas, linea.clave, -1));
            }}
          >
            <Minus />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Agregar uno de ${linea.nombre}`}
            onClick={() => {
              setLineas(conCantidad(lineas, linea.clave, 1));
            }}
          >
            <Plus />
          </Button>
        </span>
      ),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (linea) => <Dinero centavos={linea.precioCentavos * linea.cantidad} tamano="sm" />,
    },
  ];

  const pedido = (
    <Tabla
      etiqueta={voc.titulo('unidad_servicio')}
      columnas={columnas}
      filas={lineas}
      claveDe={(linea) => linea.clave}
      viajeDeFila={(linea) =>
        viajando === linea.productoId ? VIAJE.producto(linea.productoId) : undefined
      }
      alto="max-h-40 xl:max-h-80"
      vacio={
        <Vacio
          titulo={`Toca ${voc.enFraseCon('un', 'linea_orden')} para empezar.`}
          className="py-(--espacio-4)"
        />
      }
    />
  );

  return (
    <div className="grid gap-(--espacio-3) p-(--espacio-3) pb-48 xl:grid-cols-[minmax(0,1fr)_24rem] xl:pb-(--espacio-3)">
      <header className="flex flex-wrap items-center justify-between gap-(--espacio-2) xl:col-span-2">
        <h1 className="text-xl font-bold">
          Cobrar
          <span className="ml-(--espacio-2) text-sm font-normal text-texto-sutil">
            Turno abierto · {turno.usuario_apertura_nombre ?? 'sin nombre'}
          </span>
        </h1>
        {/* El único dato del encabezado: quedarse sin morralla a media ráfaga
            cuesta media ráfaga. La palabra lo dice, no sólo el color. */}
        <p
          className={`rounded-md px-(--espacio-2) py-(--espacio-1) text-sm font-medium ${aviso.clase}`}
        >
          Cambio <Dinero centavos={cambio} tamano="sm" /> · {aviso.palabra}
        </p>
      </header>
      {/* C.14 · Los apartados del menú público: se preparan, se cobran al recoger y se
          entregan desde aquí, donde está quien cobra. */}
      <div className="xl:col-span-2">
        <ApartadosDeHoy />
      </div>

      {error === null ? null : (
        <Aviso tono="peligro" titulo={error} className="xl:col-span-2">
          El pedido no se cobró ni entró a la fila.
        </Aviso>
      )}
      {enLinea ? null : (
        <Aviso tono="atencion" titulo="Sin internet. No se puede cobrar." className="xl:col-span-2">
          Aquí no hay modo sin conexión.
        </Aviso>
      )}

      {/* Nombre y canal pegados arriba en teléfono y tablet, y en la cabecera del
          pedido en PC: en los dos casos son lo PRIMERO. */}
      <Superficie
        como="section"
        relleno={3}
        aria-label={`Nombre y canal del ${voc.singular('unidad_servicio')}`}
        className="sticky top-0 z-20 flex flex-col gap-(--espacio-2) xl:static xl:col-start-2 xl:row-start-2"
      >
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="cobrar-nombre">Nombre</Label>
          <Input
            id="cobrar-nombre"
            autoFocus
            value={nombre}
            placeholder="Mariana"
            onChange={(evento) => {
              setNombre(evento.target.value);
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-(--espacio-2)">
          {CANALES.map((opcion) => (
            <Button
              key={opcion.clave}
              type="button"
              aria-pressed={canal === opcion.clave}
              variant={canal === opcion.clave ? 'default' : 'outline'}
              className="min-h-20"
              onClick={() => {
                setCanal(opcion.clave);
              }}
            >
              {/* El color no puede ser el único que diga cuál está elegido. */}
              {canal === opcion.clave ? <Check aria-hidden /> : null}
              {opcion.etiqueta}
            </Button>
          ))}
        </div>
      </Superficie>

      <section
        aria-label={`${voc.titulo('linea_orden', true)} y alimentos`}
        className="flex flex-col gap-(--espacio-2) xl:col-start-1 xl:row-span-2 xl:row-start-2"
      >
        <nav
          aria-label="Categorías"
          className="flex gap-(--espacio-1) overflow-x-auto pb-(--espacio-1)"
        >
          {[null, ...categorias].map((nombreCategoria) => (
            <Button
              key={nombreCategoria ?? 'todo'}
              type="button"
              size="sm"
              aria-pressed={categoria === nombreCategoria}
              variant={categoria === nombreCategoria ? 'default' : 'ghost'}
              onClick={() => {
                setCategoria(nombreCategoria);
              }}
            >
              {nombreCategoria ?? 'Todo'}
            </Button>
          ))}
        </nav>

        {/* Dos columnas en teléfono, cuatro de tablet arriba. Nunca por debajo de
            96 px de lado: es lo que una mano mojada acierta sin mirar. */}
        <ul className="grid grid-cols-2 gap-(--espacio-2) md:grid-cols-4 xl:grid-cols-5">
          {visibles.map((producto) => {
            const agotado = estaAgotado(producto);
            return (
              <li key={producto.id}>
                <Superficie
                  como="button"
                  type="button"
                  interactiva
                  relleno={3}
                  disabled={agotado}
                  onClick={(evento) => {
                    agregar(producto, evento.currentTarget);
                  }}
                  className={`flex min-h-24 w-full flex-col items-center justify-center gap-(--espacio-1) text-center ${agotado ? 'bg-fondo-sutil text-texto-sutil' : ''}`}
                >
                  <span className="text-sm font-semibold">{producto.nombre ?? 'Producto'}</span>
                  <Dinero centavos={precioDe(producto)} tamano="sm" />
                  {/* La palabra, no sólo el gris: el gris solo no se lee. */}
                  {agotado ? <span className="text-xs font-medium">Agotado</span> : null}
                </Superficie>
              </li>
            );
          })}
        </ul>
      </section>

      {/* En tablet y teléfono el pedido es una barra fija en el borde inferior: la
          tablet está montada en un soporte sobre la barra, nadie la sostiene, y el
          borde entero es el objetivo más grande para una mano que llega desde abajo. */}
      <Superficie
        como="aside"
        nivel={3}
        radio="sm"
        relleno={3}
        aria-label={voc.titulo('unidad_servicio')}
        className="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-(--espacio-2) rounded-none xl:static xl:col-start-2 xl:row-start-3 xl:rounded-lg xl:shadow-1"
      >
        {lineas.length === 0 ? (
          pedido
        ) : (
          <>
            {/* `details` nativo: el teclado y el lector de pantalla ya saben
                abrirlo. En PC no hay nada que abrir. */}
            <details className="xl:hidden">
              <summary className="cursor-pointer py-(--espacio-1) text-sm">
                {nombreVisible} · {piezas} · <Dinero centavos={total} tamano="sm" />
              </summary>
              {pedido}
            </details>
            <div className="hidden xl:block">{pedido}</div>
          </>
        )}

        <Button
          size="lg"
          className="min-h-20 w-full justify-between text-lg"
          disabled={enviando || bloqueo !== null}
          onClick={() => {
            void cobrar();
          }}
        >
          <span>{enviando ? 'Cobrando…' : 'COBRAR'}</span>
          <Dinero centavos={total} tamano="lg" />
        </Button>
        {bloqueo !== null && lineas.length > 0 ? (
          <p className="text-center text-sm text-texto-sutil">{bloqueo}</p>
        ) : null}
      </Superficie>

      {/* LAS OPCIONES DE LA BEBIDA, encima del cobro: se eligen y se vuelve con ellas. */}
      {eligiendo === null ? null : (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-bebida"
          className="fixed inset-0 z-40 overflow-y-auto"
        >
          <OpcionesDeLaBebida
            productoId={eligiendo.id}
            productoNombre={eligiendo.nombre ?? 'Bebida'}
            precioBaseCentavos={precioDe(eligiendo)}
            opcionesIniciales={carga.opciones.get(eligiendo.id) ?? []}
            onElegidas={alElegir}
            onCerrar={() => {
              setEligiendo(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
