'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Dialog, DialogContent, DialogTitle } from '@morphiqpos/ui/primitivas/dialog';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Sheet, SheetContent, SheetTitle } from '@morphiqpos/ui/primitivas/sheet';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';
import { useEffect, useRef, useState } from 'react';

import { consultarPuente, invocarComando, nuevaClave } from '~/cliente/api';

/**
 * PANTALLA · restaurante · mesa-activa
 *
 * La comanda. 80-200 veces al día por mesero. No es una pantalla nueva: es la
 * mesa, abierta.
 *
 * ── «Pedido actual» y «Agregar al pedido» son DOS bloques ────────────────
 * Es la decisión que manda aquí. Lo ya mandado a cocina no se puede confundir
 * con lo que está por mandarse: en una sola lista el mesero reenvía platillos
 * ya enviados —el error más caro del turno, porque sale comida que nadie pidió
 * y que nadie va a pagar—. Separarlos cuesta cuatro líneas de interfaz.
 *
 * ── «Listos para recoger» va arriba de todo ──────────────────────────────
 * Cuando el mesero abre la mesa 5 para agregar un postre, lo primero que tiene
 * que saber es que hay dos platos esperando en la ventana desde hace tres
 * minutos: es información que CADUCA, y el catálogo no. En teléfono no cabe
 * como bloque y viaja de insignia en el encabezado, como pide el documento.
 *
 * ── En tablet el pedido es una HOJA, no un panel lateral ─────────────────
 * La tablet es el layout principal, no el degradado del de PC: el mesero la
 * sostiene con la izquierda y opera con el pulgar derecho, y el borde inferior
 * derecho es lo único que alcanza sin recolocar la mano.
 *
 * ── El precio va en segundo plano ────────────────────────────────────────
 * Hace falta para poder sugerir, pero lo que se busca es el platillo; si el
 * precio compite con el nombre, cada búsqueda tarda un poco más.
 *
 * ── La clave de idempotencia sobrevive al reintento ──────────────────────
 * Se genera una por envío y sólo se renueva cuando el envío triunfa: dos toques
 * —o reintentar tras un error de red— no mandan dos comandas.
 *
 * ── Alcance recortado a propósito, para caber en un archivo ──────────────
 * Fuera: «Solicitar cuenta» (tiene su propia pantalla, Precuenta), la
 * reparación de mesa huérfana, el tiempo de servicio y la nota por línea. Y
 * «Listos para recoger» se pinta pero no se sondea: entra por `listosIniciales`
 * hasta que el puente sepa filtrar los items de cocina por orden.
 *
 * ── Lo que NO va aquí, aunque el sistema lo tenga ────────────────────────
 * Costos, márgenes, inventario en números, descuentos y reportes. Y no va el
 * cobro: el mesero no cobra. Esa separación es control interno.
 */

/** Un producto del catálogo. El puente entrega el dinero ya en pesos. */
export interface ProductoDeComanda {
  readonly id: string;
  readonly nombre: string;
  readonly precio_venta: number;
  readonly categoria_nombre: string | null;
  /** Hoy el puente no expone existencia: llega por props hasta que la exponga. */
  readonly agotado?: boolean;
}
/** Una línea YA enviada a cocina: vive en el bloque de arriba, el intocable. */
export interface LineaEnviada {
  readonly id: string;
  readonly producto_nombre: string;
  readonly cantidad: number;
  readonly total: number;
}
export interface MesaAbierta {
  readonly numero: number;
  readonly estado: string;
  readonly personas_actuales: number | null;
  readonly cliente_temporal: string | null;
  readonly notas_alergias: string | null;
  readonly celebracion_especial: boolean;
  readonly venta_activa_id: string | null;
}
interface LineaBorrador {
  readonly productoId: string;
  readonly nombre: string;
  readonly precio: number;
  readonly cantidad: number;
}
export interface MesaActivaProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly mesaInicial?: MesaAbierta;
  readonly productosIniciales?: readonly ProductoDeComanda[];
  readonly lineasIniciales?: readonly LineaEnviada[];
  /** Los nombres de lo que cocina ya dejó en la ventana. */
  readonly listosIniciales?: readonly string[];
}

const pesos = (monto: number): string =>
  monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const categoriaDe = (p: ProductoDeComanda): string => p.categoria_nombre ?? 'Sin categoría';
const volverAlMapa = (): void => {
  window.history.back();
};

export function MesaActiva(props: MesaActivaProps) {
  const { mesaInicial, productosIniciales } = props;
  const [mesa, setMesa] = useState<MesaAbierta | null>(mesaInicial ?? null);
  const [productos, setProductos] = useState<readonly ProductoDeComanda[] | null>(
    productosIniciales ?? (mesaInicial === undefined ? null : []),
  );
  const [enviadas, setEnviadas] = useState<readonly LineaEnviada[]>(props.lineasIniciales ?? []);
  const [borrador, setBorrador] = useState<readonly LineaBorrador[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [falloEnvio, setFalloEnvio] = useState(false);
  const [hoja, setHoja] = useState(false);
  const claveEnvio = useRef(nuevaClave());
  const refBusqueda = useRef<HTMLInputElement>(null);
  const listos = props.listosIniciales ?? [];

  useEffect(() => {
    if (mesaInicial !== undefined) return;
    const id = new URLSearchParams(window.location.search).get('mesa');
    if (id === null) {
      setError('No se dijo qué mesa abrir.');
      setProductos([]);
      return;
    }
    let vivo = true;
    void (async () => {
      try {
        const [mesas, catalogo] = await Promise.all([
          consultarPuente<MesaAbierta & { venta_activa_id: string | null }>('Mesa', {
            filtro: { id },
            limite: 1,
          }),
          consultarPuente<ProductoDeComanda>('ProductoTerminado', { limite: 300 }),
        ]);
        if (!vivo) return;
        const abierta = mesas[0] ?? null;
        setMesa(abierta);
        setProductos(catalogo);
        const orden = abierta?.venta_activa_id ?? null;
        if (orden === null) return;
        const lineas = await consultarPuente<LineaEnviada>('DetalleVenta', {
          filtro: { venta_id: orden },
          limite: 120,
        });
        if (vivo) setEnviadas(lineas);
      } catch (fallo: unknown) {
        // La pantalla NUNCA se vacía por un error de red: el mesero prefiere un
        // dato de hace diez segundos a una pantalla en blanco.
        if (vivo) setError(fallo instanceof Error ? fallo.message : 'No se pudo leer la mesa.');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [mesaInicial]);

  useEffect(() => {
    // El foco sólo donde hay teclado físico: en la tablet abriría el teclado en
    // pantalla y taparía justo el catálogo que el mesero viene a tocar.
    if (window.matchMedia('(min-width: 1280px)').matches) refBusqueda.current?.focus();
  }, []);

  const catalogo = productos ?? [];
  const categorias = [...new Set(catalogo.map(categoriaDe))].sort((a, b) =>
    a.localeCompare(b, 'es-MX'),
  );
  const texto = busqueda.trim().toLocaleLowerCase('es-MX');
  const visibles = catalogo.filter(
    (p) =>
      (categoria === null || categoriaDe(p) === categoria) &&
      (texto === '' || p.nombre.toLocaleLowerCase('es-MX').includes(texto)),
  );
  const total =
    enviadas.reduce((s, l) => s + l.total, 0) +
    borrador.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const piezas = borrador.reduce((s, l) => s + l.cantidad, 0);

  /** Sumar es tocar el platillo; restar, el botón de su línea. Nada más muta. */
  function cambiar(productoId: string, nombre: string, precio: number, delta: number): void {
    setBorrador((actual) =>
      actual.some((l) => l.productoId === productoId)
        ? actual
            .map((l) => (l.productoId === productoId ? { ...l, cantidad: l.cantidad + delta } : l))
            .filter((l) => l.cantidad > 0)
        : [...actual, { productoId, nombre, precio, cantidad: delta }],
    );
  }

  async function enviarACocina(): Promise<void> {
    const orden = mesa?.venta_activa_id ?? null;
    if (orden === null || borrador.length === 0) return;
    setEnviando(true);
    setFalloEnvio(false);
    const clave = claveEnvio.current;
    try {
      const lineas = borrador.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad }));
      const notas = nota.trim();
      await invocarComando(
        '/api/restaurante/enviar-pedido',
        { ordenId: orden, lineas, ...(notas === '' ? {} : { notas }) },
        { idempotencyKey: clave },
      );
      // Lo enviado cruza al bloque de arriba con identificadores provisionales;
      // los definitivos llegan con la siguiente lectura de la mesa.
      setEnviadas([
        ...enviadas,
        ...borrador.map((l, i) => ({
          id: `${clave}-${i}`,
          producto_nombre: l.nombre,
          cantidad: l.cantidad,
          total: l.precio * l.cantidad,
        })),
      ]);
      setBorrador([]);
      setNota('');
      setHoja(false);
      claveEnvio.current = nuevaClave();
    } catch {
      // Nunca se traga: una comanda perdida en silencio es un plato que no sale.
      setFalloEnvio(true);
    } finally {
      setEnviando(false);
    }
  }

  const enviar = (): void => {
    void enviarACocina();
  };
  const agregarUno = (p: ProductoDeComanda) => () => {
    cambiar(p.id, p.nombre, p.precio_venta, 1);
  };
  const quitarUno = (l: LineaBorrador) => () => {
    cambiar(l.productoId, l.nombre, l.precio, -1);
  };
  const elegirCategoria = (c: string | null) => () => {
    setCategoria(c);
  };
  const abrirHoja = (): void => {
    setHoja(true);
  };

  if (productos === null) {
    // Esqueletos con la forma real del encabezado y del catálogo, no un
    // spinner: así la pantalla no salta cuando llegan los datos.
    return (
      <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-3 xl:grid-cols-4">
        <Skeleton className="col-span-full h-20 rounded-lg" />
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="min-h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const panel = (
    <div className="flex flex-col gap-3">
      {listos.length > 0 && (
        <section aria-label="Listos para recoger" className="rounded-lg border border-border p-2">
          <h2 className="text-xs font-bold uppercase">► Listos para recoger ({listos.length})</h2>
          <p className="text-sm">{listos.join(' · ')}</p>
        </section>
      )}
      <section aria-label="Pedido actual, ya enviado a cocina">
        <h2 className="text-xs font-bold uppercase text-muted-foreground">Pedido actual</h2>
        {enviadas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Mesa {mesa?.numero ?? ''} abierta para {mesa?.personas_actuales ?? 0} personas. Toca un
            platillo para empezar.
          </p>
        )}
        <ul className="mt-1 space-y-1 text-sm">
          {enviadas.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-2">
              <span className="truncate">
                {l.cantidad} × {l.producto_nombre}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{pesos(l.total)}</span>
            </li>
          ))}
        </ul>
      </section>
      <Separator />
      <section aria-label="Agregar al pedido, todavía sin enviar">
        <h2 className="text-xs font-bold uppercase text-primary">Agregar al pedido</h2>
        {borrador.length === 0 && (
          <p className="text-sm text-muted-foreground">Toca un platillo para agregarlo.</p>
        )}
        <ul className="mt-1 space-y-1 text-sm">
          {borrador.map((l) => (
            <li key={l.productoId} className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                aria-label={`Quitar uno de ${l.nombre}`}
                onClick={quitarUno(l)}
              >
                −
              </Button>
              <span className="w-5 text-center tabular-nums">{l.cantidad}</span>
              <span className="min-w-0 flex-1 truncate">{l.nombre}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {pesos(l.precio * l.cantidad)}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <Textarea
        rows={2}
        value={nota}
        aria-label="Nota para cocina"
        placeholder="Nota para cocina…"
        onChange={(evento) => {
          setNota(evento.target.value);
        }}
      />
      <Button
        size="lg"
        className="w-full text-base font-bold"
        disabled={borrador.length === 0 || enviando}
        onClick={enviar}
      >
        {enviando ? 'Enviando…' : 'ENVIAR A COCINA'}
      </Button>
      <p className="flex items-baseline justify-between border-t border-border pt-2 font-bold">
        <span className="text-sm">TOTAL</span>
        <span className="text-lg tabular-nums">{pesos(total)}</span>
      </p>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background pb-28 xl:pb-0">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-background p-3">
        <Button variant="ghost" size="sm" aria-label="Volver al mapa" onClick={volverAlMapa}>
          ←
        </Button>
        <h1 className="text-xl font-bold">Mesa {mesa?.numero ?? '—'}</h1>
        {/* El estado viaja en minúsculas y con guiones bajos; aquí se lee. */}
        <Badge variant="secondary">{(mesa?.estado ?? 'sin datos').replace(/_/g, ' ')}</Badge>
        <span className="text-sm text-muted-foreground">
          {mesa?.personas_actuales ?? 0} personas
        </span>
        <span className="max-w-40 truncate text-sm">{mesa?.cliente_temporal ?? ''}</span>
        {mesa?.celebracion_especial === true && <span aria-label="Celebración">🎉</span>}
        {/* Nunca sólo el icono: un error aquí no es un descuadre, es médico. */}
        {mesa !== null && mesa.notas_alergias !== null && (
          <Badge variant="destructive">⚠ Alergias: {mesa.notas_alergias}</Badge>
        )}
        {listos.length > 0 && (
          <Badge className="ml-auto xl:hidden">{listos.length} listos para recoger</Badge>
        )}
      </header>

      {error !== null && (
        <p role="alert" className="mx-3 mt-3 rounded-md border border-destructive p-2 text-sm">
          {error} · Se muestra el último dato conocido.
        </p>
      )}

      <div className="grid gap-4 p-3 xl:grid-cols-[1fr_22rem]">
        <section aria-label="Catálogo de platillos">
          <Input
            ref={refBusqueda}
            value={busqueda}
            aria-label="Buscar platillo"
            placeholder="Buscar platillo…  🔍"
            onChange={(evento) => {
              setBusqueda(evento.target.value);
            }}
          />
          <nav aria-label="Categorías" className="my-2 flex gap-1 overflow-x-auto pb-1">
            {[null, ...categorias].map((c) => (
              <Button
                key={c ?? 'todos'}
                size="sm"
                className="shrink-0"
                variant={categoria === c ? 'default' : 'ghost'}
                onClick={elegirCategoria(c)}
              >
                {c ?? 'Todos'}
              </Button>
            ))}
          </nav>
          {visibles.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">No hay platillos en esta categoría.</p>
              {/* El vacío enseña: lleva a donde se resuelve. */}
              <Button asChild variant="link">
                <a href="/productos">Ir a Productos</a>
              </Button>
            </div>
          ) : (
            /* Dos columnas en teléfono, tres en tablet —la zona de toque nunca
               baja de 96 px— y cuatro en PC, donde el panel ya ocupa su sitio. */
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
              {visibles.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={p.agotado === true}
                    onClick={agregarUno(p)}
                    className={`flex min-h-24 w-full flex-col justify-between rounded-lg border border-border p-2 text-left ${p.agotado === true ? 'bg-muted text-muted-foreground' : 'bg-card text-card-foreground hover:border-primary'}`}
                  >
                    <span className="line-clamp-2 text-sm font-semibold leading-tight">
                      {p.nombre}
                    </span>
                    {/* El precio, en segundo plano: lo que se busca es el platillo. */}
                    <span className="mt-1 text-xs tabular-nums text-muted-foreground">
                      {p.agotado === true ? 'Agotado' : pesos(p.precio_venta)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside aria-label="Pedido de la mesa" className="hidden xl:block">
          <div className="sticky top-20">{panel}</div>
        </aside>
      </div>

      {/* Tablet y teléfono: el pedido vive donde alcanza el pulgar derecho. */}
      <Button
        size="lg"
        aria-label={`Abrir el pedido: ${piezas} platillos, ${pesos(total)}`}
        className="fixed bottom-4 right-4 rounded-full px-5 text-base font-bold tabular-nums xl:hidden"
        onClick={abrirHoja}
      >
        {piezas} · {pesos(total)}
      </Button>
      <Sheet open={hoja} onOpenChange={setHoja}>
        <SheetContent side="bottom" className="max-h-[70dvh] overflow-y-auto p-4">
          <SheetTitle>Pedido de la mesa {mesa?.numero ?? ''}</SheetTitle>
          {panel}
        </SheetContent>
      </Sheet>
      <Dialog open={falloEnvio} onOpenChange={setFalloEnvio}>
        <DialogContent className="border-2 border-destructive">
          <DialogTitle>La comanda NO llegó a cocina</DialogTitle>
          <p role="alert" className="text-sm">
            Vuelve a intentar. El pedido sigue completo en la pantalla: no se perdió nada, y el
            reintento usa la misma clave, así que no puede duplicarse.
          </p>
          <Button disabled={enviando} onClick={enviar}>
            {enviando ? 'Enviando…' : 'Reintentar envío'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
