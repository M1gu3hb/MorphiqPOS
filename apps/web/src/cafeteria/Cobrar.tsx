'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useMemo, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';

/**
 * PANTALLA · cafeteria · cobrar
 *
 * La pantalla insignia del modelo y la de inicio del barista. 150–220 veces al
 * día, siempre con alguien enfrente y casi siempre con fila detrás.
 *
 * ── Por qué una rejilla completa y no un buscador ────────────────────────
 * Porque el menú de una cafetería son 35 a 55 productos, no tres mil: caben
 * todos, con tarjetas grandes, y **reconocer es más rápido que teclear**. El
 * barista escucha «un latte grande con avena» y toca. El buscador es para el
 * producto raro, no para el flujo normal — y por eso aquí no está.
 *
 * ── El nombre y el canal van ARRIBA, no en el cobro ──────────────────────
 * Porque es lo primero que se dice en un mostrador mexicano —«¿a nombre de
 * quién?», «¿aquí o para llevar?»—, antes incluso de la bebida. Ponerlos al
 * final obliga a preguntar dos veces. Y no son cosméticos: el nombre decide
 * cómo se llama el pedido en la barra (F-329) y el canal decide qué empaque se
 * consume (F-331). Por eso **sin canal no se cobra**: no se sabría qué
 * descontar. Sin nombre sí: entra como «Sin nombre» y se grita un folio, que es
 * peor pero funciona.
 *
 * ── El total vive DENTRO del botón ───────────────────────────────────────
 * Es la diferencia más visible con el cobro de `restaurante`, y sale de que
 * aquí el que cobra es el que va a preparar: dice el total mirando al cliente,
 * con la mano ya sobre el botón. Un total arriba en grande obliga a un viaje de
 * ojos que se repite 180 veces al día. El cliente lo lee en su pantalla (F-249).
 *
 * ── Y el aviso de cambio es el único dato del encabezado ─────────────────
 * No es decorativo: quedarse sin morralla a media ráfaga cuesta media ráfaga.
 * La palabra lo dice, no sólo el color.
 *
 * ── Lo que NO va aquí ────────────────────────────────────────────────────
 * Reportes, dashboard, inventario en números, configuración e historial. Y no
 * va el corte: cerrar el turno es otra pantalla y otro momento.
 *
 * ── Alcance recortado para caber en un archivo, dicho y no escondido ─────
 * 1. El diálogo de opciones (leche, tamaño, temperatura, extras) es OTRA
 *    pantalla del documento: aquí la tarjeta agrega el producto base.
 * 2. El cobro sale con un solo pago en efectivo por el importe exacto. La
 *    elección de método y el desglose mixto viven en el diálogo de cobro.
 * 3. `F12`, `F2` y `F3` van impresos pero no enganchados —`F12` es del
 *    navegador—; sí funcionan `Esc` (limpiar) y `F4` (aquí / para llevar).
 * 4. «Agotado» llega en el campo `agotado`; el puente todavía no expone
 *    existencia de `ProductoTerminado`, así que hoy llega vacío y la tarjeta se
 *    toca. El día que llegue, la tarjeta se apaga sola.
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
  readonly agotado?: boolean | null;
}

export interface TurnoDeBarra {
  readonly id: string;
  readonly estado: string | null;
  readonly usuario_apertura_nombre: string | null;
  readonly fecha_apertura: string | null;
  readonly efectivo_inicial_contado: number | null;
}

export interface LineaDelPedido {
  readonly productoId: string;
  readonly nombre: string;
  readonly precioCentavos: number;
  readonly cantidad: number;
}

export interface CobrarProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly productosIniciales?: readonly ProductoDeBarra[];
  readonly turnoInicial?: TurnoDeBarra | null;
  readonly onCobrado?: (ordenId: string) => void;
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

/** Las categorías que de verdad tienen producto. Una pestaña vacía es una trampa. */
export function categoriasDe(productos: readonly ProductoDeBarra[]): readonly string[] {
  const vistas = new Set<string>();
  for (const producto of productos) vistas.add(producto.categoria_nombre ?? 'Otros');
  return [...vistas].sort((a, b) => a.localeCompare(b, 'es-MX'));
}

/** Suma o resta uno. Al llegar a cero la línea desaparece: un «0 ×» no es nada. */
export function conCantidad(
  lineas: readonly LineaDelPedido[],
  productoId: string,
  paso: number,
): readonly LineaDelPedido[] {
  return lineas
    .map((linea) =>
      linea.productoId === productoId ? { ...linea, cantidad: linea.cantidad + paso } : linea,
    )
    .filter((linea) => linea.cantidad > 0);
}

export function conProducto(
  lineas: readonly LineaDelPedido[],
  producto: ProductoDeBarra,
): readonly LineaDelPedido[] {
  if (lineas.some((linea) => linea.productoId === producto.id)) {
    return conCantidad(lineas, producto.id, 1);
  }
  return [
    ...lineas,
    {
      productoId: producto.id,
      nombre: producto.nombre ?? 'Producto',
      precioCentavos: aCentavos(producto.precio_venta),
      cantidad: 1,
    },
  ];
}

export function totalDe(lineas: readonly LineaDelPedido[]): number {
  return lineas.reduce((suma, linea) => suma + linea.precioCentavos * linea.cantidad, 0);
}

/** El aviso de cambio: su clase y su palabra. La palabra es la que manda. */
function avisoDeCambio(centavos: number): { readonly clase: string; readonly palabra: string } {
  if (centavos < CAMBIO_URGENTE) return { clase: 'bg-destructive/20', palabra: 'consíguelo ya' };
  if (centavos < CAMBIO_POCO) return { clase: 'bg-warning/25', palabra: 'va quedando poco' };
  return { clase: 'bg-muted text-muted-foreground', palabra: 'alcanza' };
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

export function Cobrar({ productosIniciales, turnoInicial, onCobrado }: CobrarProps) {
  const [productos, setProductos] = useState<readonly ProductoDeBarra[] | null>(
    productosIniciales ?? null,
  );
  // `undefined` es «todavía no se sabe»; `null` es «no hay turno abierto», que
  // es un muro y no un aviso. Distinguirlos evita bloquear mientras carga.
  const [turno, setTurno] = useState<TurnoDeBarra | null | undefined>(
    productosIniciales === undefined ? turnoInicial : (turnoInicial ?? null),
  );
  const [lineas, setLineas] = useState<readonly LineaDelPedido[]>([]);
  const [nombre, setNombre] = useState('');
  const [canal, setCanal] = useState<Canal | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enLinea, setEnLinea] = useState(true);

  useEffect(() => {
    if (productosIniciales !== undefined) return;
    let vivo = true;
    Promise.all([
      consultarPuente<ProductoDeBarra>('ProductoTerminado', { limite: 300 }),
      consultarPuente<TurnoDeBarra>('CorteCaja', { limite: 1 }),
    ])
      .then(([filas, turnos]) => {
        if (!vivo) return;
        setProductos(filas.filter((fila) => fila.visible_en_pos !== false));
        setTurno(turnos.find((fila) => fila.estado === 'abierto') ?? null);
      })
      .catch((fallo: unknown) => {
        // La pantalla no se queda colgada en el esqueleto por un fallo de red:
        // se dice qué pasó y se deja lo poco que se puede hacer sin catálogo.
        if (!vivo) return;
        setProductos([]);
        setTurno(null);
        setError(fallo instanceof Error ? fallo.message : 'No se pudo leer el catálogo.');
      });
    return () => {
      vivo = false;
    };
  }, [productosIniciales]);

  useEffect(() => {
    // Arranca en `true` y se corrige aquí: `navigator` no existe en el servidor
    // y leerlo al pintar daría una hidratación distinta del primer render.
    const anotar = () => {
      setEnLinea(navigator.onLine);
    };
    anotar();
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
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

  const categorias = useMemo(
    () => (productos === null ? [] : categoriasDe(productos)),
    [productos],
  );
  const visibles = useMemo(() => {
    if (productos === null) return [];
    if (categoria === null) return productos;
    return productos.filter((fila) => (fila.categoria_nombre ?? 'Otros') === categoria);
  }, [productos, categoria]);

  const total = totalDe(lineas);
  const piezas = lineas.reduce((suma, linea) => suma + linea.cantidad, 0);
  const bloqueo = bloqueoDe(lineas, canal, enLinea);

  /**
   * La cadena documentada: se abre el borrador de la terminal, se le cuelgan
   * las líneas y se cobra. El total viaja sólo para que el servidor RECHACE si
   * no coincide con el suyo; cobrar un número distinto del que ya se dijo en
   * voz alta es peor que fallar. La clave de idempotencia la pone
   * `invocarComando`, así que un doble toque no cobra dos veces.
   */
  async function cobrar(): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const orden = await invocarComando<{ ordenId: string }>('/api/venta/crear-orden', {});
      for (const linea of lineas) {
        await invocarComando('/api/venta/agregar-linea', {
          ordenId: orden.ordenId,
          productoId: linea.productoId,
          cantidad: String(linea.cantidad),
        });
      }
      await invocarComando('/api/venta/cobrar', {
        ordenId: orden.ordenId,
        pagos: [{ metodo: 'efectivo', montoCentavos: total, recibidoCentavos: total }],
        totalEsperadoCentavos: total,
        canal,
        ...(nombre.trim() === '' ? {} : { nombrePedido: nombre.trim() }),
      });
      // Se limpia sola y vuelve al vacío: abrir un diálogo de ticket son dos
      // toques por venta, 360 al día. El ticket lo decide la perilla.
      setLineas([]);
      setNombre('');
      setCanal(null);
      onCobrado?.(orden.ordenId);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo cobrar. No se cobró nada.');
    } finally {
      setEnviando(false);
    }
  }

  const banda =
    error === null ? null : (
      <p
        role="alert"
        className="rounded-md border border-destructive bg-destructive/15 p-2 text-sm xl:col-span-2"
      >
        {error} · El pedido no se cobró ni entró a la fila.
      </p>
    );

  if (productos === null || turno === undefined) {
    return (
      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Esqueletos con la forma de las tarjetas, no un spinner: así nada
            salta al llegar los datos y el ojo ya sabe dónde va a mirar. */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 15 }, (_, indice) => (
            <Skeleton key={indice} className="min-h-24 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-40 w-full rounded-lg xl:h-80" />
      </div>
    );
  }

  if (turno === null) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-8 text-center">
        <div className="space-y-3 rounded-lg border border-warning/60 bg-warning/15 p-6">
          <p className="text-xl font-semibold">Turno cerrado</p>
          <p className="text-sm">
            Un cobro sin turno no pertenece a ningún corte: no habría a qué caja cuadrarlo al final
            del día. Por eso esto es un muro y no un aviso.
          </p>
          <Button asChild>
            <a href="/cafeteria/caja">Abrir turno</a>
          </Button>
        </div>
        {banda}
      </div>
    );
  }

  if (productos.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-8 text-center">
        <p className="text-xl font-semibold">Todavía no hay bebidas en la barra.</p>
        <p className="text-muted-foreground">
          Esta pantalla es una rejilla de lo que se vende: en cuanto el menú tenga sus 35 o 55
          productos con precio, aparecen aquí y se cobran tocándolos.
        </p>
        <Button asChild>
          <a href="/catalogo">Cargar el menú</a>
        </Button>
        {banda}
      </div>
    );
  }

  const cambio = aCentavos(turno.efectivo_inicial_contado);
  const aviso = avisoDeCambio(cambio);
  const resumen = `${nombre.trim() === '' ? 'Sin nombre' : nombre.trim()} · ${piezas} · ${enPesos(total)}`;

  const listaDelPedido = (
    <ul className="max-h-40 space-y-1 overflow-y-auto p-1 text-sm xl:max-h-80">
      {lineas.map((linea) => (
        <li key={linea.productoId} className="flex items-center justify-between gap-2">
          <span className="truncate">
            {linea.cantidad} × {linea.nombre}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <span className="tabular-nums">{enPesos(linea.precioCentavos * linea.cantidad)}</span>
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
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Agregar uno de ${linea.nombre}`}
              onClick={() => {
                setLineas(conCantidad(lineas, linea.productoId, 1));
              }}
            >
              +
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid gap-3 p-3 pb-48 xl:grid-cols-[minmax(0,1fr)_24rem] xl:pb-3">
      <header className="flex flex-wrap items-center justify-between gap-2 xl:col-span-2">
        <h1 className="text-xl font-bold">
          Cobrar
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            Turno abierto · {turno.usuario_apertura_nombre ?? 'sin nombre'}
          </span>
        </h1>
        <p className={`rounded-md px-2 py-1 text-sm font-medium ${aviso.clase}`}>
          Cambio {enPesos(cambio)} · {aviso.palabra}
        </p>
      </header>

      {banda}
      {!enLinea && (
        <p
          role="alert"
          className="rounded-md border border-warning/60 bg-warning/15 p-2 text-sm xl:col-span-2"
        >
          Sin internet. No se puede cobrar. Aquí no hay modo sin conexión.
        </p>
      )}

      {/* Nombre y canal pegados arriba en teléfono y tablet, y en la cabecera
          del pedido en PC: en los dos casos son lo PRIMERO, que es el orden en
          que la conversación del mostrador los produce. */}
      <section
        aria-label="Nombre y canal del pedido"
        className="sticky top-0 z-20 space-y-2 rounded-lg border border-border bg-card p-3 xl:static xl:col-start-2 xl:row-start-2"
      >
        <div className="space-y-1">
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
        <div className="grid grid-cols-2 gap-2">
          {CANALES.map((opcion) => (
            <Button
              key={opcion.clave}
              type="button"
              variant={canal === opcion.clave ? 'default' : 'outline'}
              aria-pressed={canal === opcion.clave}
              className="min-h-20"
              onClick={() => {
                setCanal(opcion.clave);
              }}
            >
              {opcion.etiqueta}
              {/* El color no puede ser el único que diga cuál está elegido. */}
              <span aria-hidden>{canal === opcion.clave ? ' ✓' : ''}</span>
            </Button>
          ))}
        </div>
      </section>

      <section
        aria-label="Bebidas y alimentos"
        className="space-y-2 xl:col-start-1 xl:row-span-2 xl:row-start-2"
      >
        <nav aria-label="Categorías" className="flex gap-1 overflow-x-auto pb-1">
          <Button
            type="button"
            size="sm"
            variant={categoria === null ? 'default' : 'ghost'}
            onClick={() => {
              setCategoria(null);
            }}
          >
            Todo
          </Button>
          {categorias.map((nombreCategoria) => (
            <Button
              key={nombreCategoria}
              type="button"
              size="sm"
              variant={categoria === nombreCategoria ? 'default' : 'ghost'}
              onClick={() => {
                setCategoria(nombreCategoria);
              }}
            >
              {nombreCategoria}
            </Button>
          ))}
        </nav>

        {/* Dos columnas en teléfono, cuatro de tablet arriba. Nunca por debajo
            de 96 px de lado: es lo que una mano mojada acierta sin mirar. */}
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-5">
          {visibles.map((producto) => {
            const agotado = producto.agotado === true;
            return (
              <li key={producto.id}>
                <button
                  type="button"
                  disabled={agotado}
                  onClick={() => {
                    setLineas(conProducto(lineas, producto));
                  }}
                  className={[
                    'flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-lg',
                    'border-2 border-border p-2 text-center transition-colors',
                    agotado ? 'bg-muted text-muted-foreground' : 'bg-card text-card-foreground',
                  ].join(' ')}
                >
                  <span className="text-sm font-semibold">{producto.nombre ?? 'Producto'}</span>
                  <span className="tabular-nums">{enPesos(aCentavos(producto.precio_venta))}</span>
                  {/* La palabra, no sólo el gris: el gris solo no se lee. */}
                  {agotado && <span className="text-xs font-medium">Agotado</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* En tablet y teléfono el pedido es una barra fija en el borde inferior,
          no un botón flotante: la tablet está montada en un soporte sobre la
          barra, nadie la sostiene, y el borde entero es el objetivo más grande
          para una mano que llega desde abajo. */}
      <aside
        aria-label="Pedido"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card p-3 xl:static xl:col-start-2 xl:row-start-3 xl:rounded-lg xl:border"
      >
        {lineas.length === 0 ? (
          <p className="pb-2 text-center text-sm text-muted-foreground">
            Toca una bebida para empezar.
          </p>
        ) : (
          <>
            {/* `details` nativo y no un acordeón: el teclado y el lector de
                pantalla ya saben abrirlo. En PC no hay nada que abrir. */}
            <details className="mb-2 rounded-md border border-border xl:hidden">
              <summary className="cursor-pointer p-2 text-sm">{resumen}</summary>
              {listaDelPedido}
            </details>
            <div className="mb-2 hidden xl:block">
              <p className="p-1 text-sm font-medium uppercase text-muted-foreground">Pedido</p>
              {listaDelPedido}
            </div>
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
          <span className="tabular-nums">{enPesos(total)}</span>
        </Button>
        {bloqueo !== null && <p className="pt-1 text-center text-sm">{bloqueo}</p>}
      </aside>
    </div>
  );
}
