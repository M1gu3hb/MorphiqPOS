'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Dialog, DialogContent, DialogTitle } from '@morphiqpos/ui/primitivas/dialog';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Sheet, SheetContent, SheetTitle } from '@morphiqpos/ui/primitivas/sheet';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import { consultarPuente, invocarComando, nuevaClave } from '~/cliente/api';
import { AnularLineaDialog } from './AnularLineaDialog';
import { DividirCuentaDialog } from './DividirCuentaDialog';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · restaurante · mesa-activa
 *
 * La comanda. 80-200 veces al día por mesero. No es una pantalla nueva: es la
 * mesa, abierta.
 *
 * ── «Pedido actual» y «Agregar al pedido» son DOS bloques ────────────────
 * La decisión que manda aquí. Lo ya mandado a cocina no se puede confundir con
 * lo que está por mandarse: en una sola lista el mesero reenvía platillos ya
 * enviados —el error más caro del turno, porque sale comida que nadie pidió y
 * que nadie va a pagar—. Por eso la línea del borrador se puede quitar y la
 * enviada no: lo enviado ya es de la cocina.
 *
 * ── «Listos para recoger» va arriba de todo ──────────────────────────────
 * Cuando el mesero abre la mesa para agregar un postre, lo primero que tiene
 * que saber es que hay dos platos esperando en la ventana desde hace tres
 * minutos: es información que CADUCA, y el catálogo no. En teléfono no cabe
 * como bloque y viaja de insignia en el encabezado, como pide el documento.
 *
 * ── En tablet el pedido es una HOJA, no un panel lateral ─────────────────
 * La tablet es el layout principal, no el degradado del de PC: el mesero la
 * sostiene con la izquierda y opera con el pulgar derecho, y el borde inferior
 * derecho es lo único que alcanza sin recolocar la mano. El precio, en cambio,
 * va en segundo plano, porque lo que se busca es el platillo.
 *
 * ── La clave de idempotencia sobrevive al reintento ──────────────────────
 * Se genera una por envío y sólo se renueva cuando el envío triunfa: dos toques
 * —o reintentar tras un error de red— no mandan dos comandas.
 *
 * ── Recortado para caber en un archivo, y queda dicho ────────────────────
 * Fuera: las pestañas de categoría (la búsqueda cubre el hallazgo con este
 * catálogo), la nota de la comanda, «Solicitar cuenta» —que tiene pantalla
 * propia, Precuenta—, la mesa huérfana y el tiempo de servicio. Y «Listos» se
 * pinta pero no se sondea: entra por props hasta que el puente sepa filtrar los
 * items de cocina por orden.
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
  /**
   * El identificador de la mesa, que hace falta para ABRIRLA.
   *
   * No estaba: esta pantalla sólo leía la mesa ya abierta y le bastaba con su
   * número. Para abrir una libre hay que decirle al comando CUÁL, y el `id` es
   * lo que el mapa pasa en la dirección y lo que el puente sirve.
   */
  readonly id: string;
  readonly numero: number;
  readonly estado: string;
  readonly personas_actuales: number | null;
  readonly notas_alergias: string | null;
  readonly venta_activa_id: string | null;
}
export interface MesaActivaProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly mesaInicial?: MesaAbierta;
  readonly productosIniciales?: readonly ProductoDeComanda[];
  readonly lineasIniciales?: readonly LineaEnviada[];
  /** Los nombres de lo que cocina ya dejó en la ventana. */
  readonly listosIniciales?: readonly string[];
}

const pesos = (n: number): string =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const volverAlMapa = (): void => {
  window.history.back();
};

export function MesaActiva(props: MesaActivaProps) {
  const voc = useVocabulario();
  const { mesaInicial, productosIniciales } = props;
  const [mesa, setMesa] = useState<MesaAbierta | null>(mesaInicial ?? null);
  const [productos, setProductos] = useState<readonly ProductoDeComanda[] | null>(
    productosIniciales ?? (mesaInicial === undefined ? null : []),
  );
  const [enviadas, setEnviadas] = useState<readonly LineaEnviada[]>(props.lineasIniciales ?? []);
  /** Producto → cantidad todavía sin enviar. Nunca se muta: se recrea. */
  const [borrador, setBorrador] = useState<Readonly<Record<string, number>>>({});
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [falloEnvio, setFalloEnvio] = useState(false);
  const [hoja, setHoja] = useState(false);
  /** Para cuántas personas se abre. Dos es la mesa más común de un comedor. */
  const [personasAlAbrir, setPersonasAlAbrir] = useState(2);
  const [abriendo, setAbriendo] = useState(false);
  /**
   * F-324 · La línea que se está anulando, o `null`. Es un identificador y no
   * un booleano: dos líneas distintas no pueden compartir el mismo diálogo, y
   * guardar «está abierto» acabaría anulando la línea equivocada.
   */
  const [anulando, setAnulando] = useState<LineaEnviada | null>(null);
  /** F-321 · Dividir la cuenta. Sólo se ofrece cuando hay algo que repartir. */
  const [dividiendo, setDividiendo] = useState(false);
  const claveEnvio = useRef(nuevaClave());
  const refBusqueda = useRef<HTMLInputElement>(null);
  const listos = props.listosIniciales ?? [];

  useEffect(() => {
    if (mesaInicial !== undefined) return;
    const id = new URLSearchParams(window.location.search).get('mesa');
    // El centinela es la señal de aborto y no un `let vivo`: además de decir si
    // la pantalla sigue montada, CANCELA las dos consultas en vuelo. Un mesero
    // que entra y sale de tres mesas seguidas dejaba antes tres lecturas vivas.
    const control = new AbortController();
    const señal = control.signal;
    /**
     * Se pregunta con una LLAMADA y no leyendo la propiedad dos veces: tras el
     * primer `if (señal.aborted)` el compilador da por hecho que sigue en
     * falso, y entre un `await` y el siguiente eso deja de ser cierto.
     */
    const sigueMontada = (): boolean => !control.signal.aborted;
    void (async () => {
      try {
        const [mesas, catalogo] = await Promise.all([
          consultarPuente<MesaAbierta>('Mesa', { filtro: { id }, limite: 1, signal: señal }),
          consultarPuente<ProductoDeComanda>('ProductoTerminado', { limite: 300, signal: señal }),
        ]);
        if (señal.aborted) return;
        setMesa(mesas[0] ?? null);
        setProductos(catalogo);
        const orden = mesas[0]?.venta_activa_id ?? null;
        if (orden === null) return;
        const filtro = { venta_id: orden };
        const lineas = await consultarPuente<LineaEnviada>('DetalleVenta', {
          filtro,
          limite: 120,
          signal: señal,
        });
        if (sigueMontada()) setEnviadas(lineas);
      } catch (fallo: unknown) {
        // La pantalla NUNCA se vacía por un error de red: el mesero prefiere un
        // dato de hace diez segundos a una pantalla en blanco. Y un aborto no
        // es un error: es esta misma pantalla, que ya no está.
        if (señal.aborted) return;
        setError(
          fallo instanceof Error
            ? fallo.message
            : `No se pudo leer ${voc.enFrase('unidad_servicio')}.`,
        );
      }
    })();
    return () => {
      control.abort();
    };
  }, [mesaInicial, voc]);

  useEffect(() => {
    // El foco sólo donde hay teclado físico: en la tablet abriría el teclado en
    // pantalla y taparía justo el catálogo que el mesero viene a tocar.
    if (window.matchMedia('(min-width: 1280px)').matches) refBusqueda.current?.focus();
  }, []);

  const catalogo = productos ?? [];
  const texto = busqueda.trim().toLocaleLowerCase('es-MX');
  const visibles = catalogo.filter((p) => p.nombre.toLocaleLowerCase('es-MX').includes(texto));
  const pendientes = catalogo.filter((p) => (borrador[p.id] ?? 0) > 0);
  const piezas = Object.values(borrador).reduce((s, n) => s + n, 0);
  const total =
    enviadas.reduce((s, l) => s + l.total, 0) +
    pendientes.reduce((s, p) => s + p.precio_venta * (borrador[p.id] ?? 0), 0);
  const alergias = mesa?.notas_alergias ?? null;
  const sinEnviar = piezas === 0 || enviando;

  /** Sumar es tocar el platillo; restar, el botón de su línea. */
  const tocar = (productoId: string, delta: number) => () => {
    setBorrador((actual) => {
      const siguiente = { ...actual, [productoId]: (actual[productoId] ?? 0) + delta };
      return Object.fromEntries(Object.entries(siguiente).filter(([, n]) => n > 0));
    });
  };

  /**
   * ABRIR LA MESA, cuando se llega a una que está libre.
   *
   * ── Por qué vive aquí y no en el mapa ──────────────────────────────────
   * Porque «¿cuántas personas?» es el PRIMER DATO DE LA COMANDA, no una
   * propiedad del plano: decide el reparto de la cuenta, el tiempo de servicio y
   * hasta el tamaño de la jarra. El mapa lleva a la mesa; la mesa se abre donde
   * se va a levantar el pedido, con el mesero ya mirando el catálogo.
   *
   * Y hace falta porque hasta hoy **no había ninguna forma de abrir una mesa
   * desde la interfaz**: `/api/restaurante/abrir-mesa` existía, el mapa no
   * pasaba su callback y esta pantalla daba por hecho que la mesa ya venía
   * abierta. El restaurante entero empezaba por una puerta que no existía.
   */
  async function abrirLaMesa(): Promise<void> {
    if (mesa?.venta_activa_id != null) return;
    if (mesa === null) return;
    setAbriendo(true);
    setError(null);
    try {
      await invocarComando('/api/restaurante/abrir-mesa', {
        mesaId: mesa.id,
        personas: personasAlAbrir,
      });
      // Se vuelve a leer la mesa en vez de suponer su nuevo estado: la apertura
      // escribe el estado, la cuenta y la hora, y el encabezado los enseña.
      const [frescas] = await Promise.all([
        consultarPuente<MesaAbierta>('Mesa', { filtro: { id: mesa.id }, limite: 1 }),
      ]);
      setMesa(frescas[0] ?? mesa);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo abrir la mesa.');
    } finally {
      setAbriendo(false);
    }
  }

  async function enviarACocina(): Promise<void> {
    const orden = mesa?.venta_activa_id ?? null;
    if (orden === null || pendientes.length === 0) return;
    setEnviando(true);
    setFalloEnvio(false);
    const clave = claveEnvio.current;
    const lineas = pendientes.map((p) => ({ productoId: p.id, cantidad: borrador[p.id] ?? 0 }));
    try {
      const entrada = { ordenId: orden, lineas };
      await invocarComando('/api/restaurante/enviar-pedido', entrada, { idempotencyKey: clave });
      // Lo enviado cruza al bloque de arriba con identificadores provisionales;
      // los definitivos llegan con la siguiente lectura de la mesa.
      const nuevas = pendientes.map((p, i) => ({
        id: `${clave}-${i}`,
        producto_nombre: p.nombre,
        cantidad: borrador[p.id] ?? 0,
        total: p.precio_venta * (borrador[p.id] ?? 0),
      }));
      setEnviadas([...enviadas, ...nuevas]);
      setBorrador({});
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
  const abrirHoja = (): void => {
    setHoja(true);
  };
  const buscar = (e: ChangeEvent<HTMLInputElement>): void => {
    setBusqueda(e.target.value);
  };

  /**
   * Tras anular o dividir, la pantalla NO adivina cómo quedó la cuenta: la
   * vuelve a leer. Restar la línea en el cliente parecería más rápido, pero una
   * división reparte líneas entre cuentas nuevas y el servidor es el único que
   * sabe cuáles se quedaron en la madre.
   */
  async function recargarLineas(): Promise<void> {
    const orden = mesa?.venta_activa_id ?? null;
    if (orden === null) return;
    try {
      const filtro = { venta_id: orden };
      setEnviadas(await consultarPuente<LineaEnviada>('DetalleVenta', { filtro, limite: 120 }));
    } catch (fallo: unknown) {
      setError(
        fallo instanceof Error ? fallo.message : `No se pudo releer ${voc.enFrase('orden')}.`,
      );
    }
  }

  const abrirAnular = (linea: LineaEnviada) => () => {
    setAnulando(linea);
  };
  const cerrarAnular = (): void => {
    setAnulando(null);
  };
  const abrirDividir = (): void => {
    setDividiendo(true);
  };
  const cerrarDividir = (): void => {
    setDividiendo(false);
  };
  const traslaAnulacion = (): void => {
    setAnulando(null);
    void recargarLineas();
  };
  const traslaDivision = (): void => {
    setDividiendo(false);
    void recargarLineas();
  };

  if (productos === null) {
    // Esqueletos con la forma real del encabezado y del catálogo, no un spinner.
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
        <section aria-label="Listos para recoger" className="rounded-lg border p-2">
          <h2 className="text-xs font-bold uppercase">► Listos para recoger ({listos.length})</h2>
          <p className="text-sm">{listos.join(' · ')}</p>
        </section>
      )}
      <section aria-label={`Pedido actual, ya enviado a ${voc.singular('preparacion')}`}>
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
              {/* Lo enviado no se edita: se ANULA, y con motivo. Un botón de
                  «−» aquí borraría del pedido un platillo que la cocina ya
                  tiene en la plancha. */}
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Anular ${l.producto_nombre}`}
                onClick={abrirAnular(l)}
              >
                Anular
              </Button>
            </li>
          ))}
        </ul>
        {enviadas.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="mt-2 w-full"
            onClick={abrirDividir}
            aria-label={`Dividir ${voc.enFrase('orden')} de ${voc.enFrase('unidad_servicio')}`}
          >
            Dividir {voc.singular('orden')}
          </Button>
        )}
      </section>
      <section aria-label="Agregar al pedido, sin enviar" className="border-t pt-3">
        <h2 className="text-xs font-bold uppercase text-primary">Agregar al pedido</h2>
        {pendientes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Toca {voc.enFraseCon('un', 'linea_orden')} para agregarlo.
          </p>
        )}
        <ul className="mt-1 space-y-1 text-sm">
          {pendientes.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={tocar(p.id, -1)}
                aria-label={`Quitar ${p.nombre}`}
              >
                −
              </Button>
              <span className="w-5 text-center tabular-nums">{borrador[p.id] ?? 0}</span>
              <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
              <span className="shrink-0 tabular-nums">
                {pesos(p.precio_venta * (borrador[p.id] ?? 0))}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <Button size="lg" className="w-full font-bold" disabled={sinEnviar} onClick={enviar}>
        {enviando ? 'Enviando…' : 'ENVIAR A COCINA'}
      </Button>
      <p className="flex items-baseline justify-between border-t pt-2 font-bold">
        <span className="text-sm">TOTAL</span>
        <span className="text-lg tabular-nums">{pesos(total)}</span>
      </p>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background pb-28 xl:pb-0">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background p-3">
        <Button variant="ghost" size="sm" aria-label="Volver al mapa" onClick={volverAlMapa}>
          ←
        </Button>
        <h1 className="text-xl font-bold">Mesa {mesa?.numero ?? '—'}</h1>
        {/* El estado viaja en minúsculas y con guiones bajos; aquí se lee. */}
        <Badge variant="secondary">{(mesa?.estado ?? 'sin datos').replace(/_/g, ' ')}</Badge>
        <span className="text-sm">{mesa?.personas_actuales ?? 0} personas</span>
        {/* Nunca sólo el icono: un error aquí no es un descuadre, es médico. */}
        {alergias !== null && <Badge variant="destructive">⚠ Alergias: {alergias}</Badge>}
        {listos.length > 0 && <Badge className="ml-auto xl:hidden">{listos.length} listos</Badge>}
      </header>
      {error !== null && (
        <p role="alert" className="mx-3 mt-3 rounded-md border border-destructive p-2 text-sm">
          {error} · Se muestra el último dato conocido.
        </p>
      )}
      {mesa !== null && mesa.venta_activa_id === null && (
        /* MESA LIBRE · lo único que se puede hacer aquí es abrirla, así que es lo
           único que se enseña: el catálogo con una mesa cerrada sería un pedido
           que no tiene dónde caer. */
        <section
          aria-label={`Abrir ${voc.enFrase('unidad_servicio')}`}
          className="mx-auto mt-6 max-w-md space-y-4 rounded-lg border border-border p-6 text-center"
        >
          <p className="text-xl font-semibold">
            {voc.titulo('unidad_servicio')} {mesa.numero} está libre
          </p>
          <p className="text-sm text-muted-foreground">
            ¿Para cuántas personas? Es el primer dato de {voc.enFrase('orden')}: de ahí salen el
            reparto y el tiempo de servicio.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="lg"
              aria-label="Una persona menos"
              disabled={personasAlAbrir <= 1}
              onClick={() => {
                setPersonasAlAbrir(Math.max(1, personasAlAbrir - 1));
              }}
            >
              −
            </Button>
            <span className="min-w-16 text-3xl font-bold tabular-nums">{personasAlAbrir}</span>
            <Button
              variant="outline"
              size="lg"
              aria-label="Una persona más"
              disabled={personasAlAbrir >= 20}
              onClick={() => {
                setPersonasAlAbrir(Math.min(20, personasAlAbrir + 1));
              }}
            >
              +
            </Button>
          </div>
          <Button
            size="lg"
            className="w-full"
            disabled={abriendo}
            onClick={() => {
              void abrirLaMesa();
            }}
          >
            {abriendo ? 'Abriendo…' : `Abrir ${voc.enFrase('unidad_servicio')}`}
          </Button>
        </section>
      )}

      <div
        className={`grid gap-4 p-3 xl:grid-cols-[1fr_22rem] ${
          mesa !== null && mesa.venta_activa_id === null ? 'hidden' : ''
        }`}
      >
        <section aria-label={`Catálogo de ${voc.plural('linea_orden')}`}>
          <Input
            ref={refBusqueda}
            value={busqueda}
            onChange={buscar}
            aria-label={`Buscar ${voc.singular('linea_orden')}`}
            placeholder={`Buscar ${voc.singular('linea_orden')}…  🔍`}
          />
          {visibles.length === 0 ? (
            /* El vacío enseña: dice qué falta y lleva a donde se resuelve. */
            <p className="mt-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No hay platillos que se llamen así. <a href="/productos">Ir a Productos</a>
            </p>
          ) : (
            /* Dos columnas en teléfono, tres en tablet —la zona de toque nunca
               baja de 96 px— y cuatro en PC, donde el panel ya ocupa su sitio. */
            <ul className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
              {visibles.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={p.agotado === true}
                    onClick={tocar(p.id, 1)}
                    className={`flex min-h-24 w-full flex-col justify-between rounded-lg border p-2 text-left ${p.agotado === true ? 'bg-muted text-muted-foreground' : 'bg-card text-card-foreground hover:border-primary'}`}
                  >
                    <span className="line-clamp-2 text-sm font-semibold leading-tight">
                      {p.nombre}
                    </span>
                    {/* El precio, en segundo plano: se busca el platillo. */}
                    <span className="mt-1 text-xs tabular-nums text-muted-foreground">
                      {p.agotado === true ? 'Agotado' : pesos(p.precio_venta)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside
          aria-label={`Pedido de ${voc.enFrase('unidad_servicio')}`}
          className="sticky top-20 hidden self-start xl:block"
        >
          {panel}
        </aside>
      </div>
      {/* Tablet y teléfono: el pedido vive donde alcanza el pulgar derecho. */}
      <Button
        size="lg"
        onClick={abrirHoja}
        aria-label={`Abrir el pedido: ${piezas} platillos, ${pesos(total)}`}
        className="fixed bottom-4 right-4 rounded-full px-5 font-bold tabular-nums xl:hidden"
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
          <DialogTitle>La comanda NO llegó a {voc.singular('preparacion')}</DialogTitle>
          <p role="alert" className="text-sm">
            Vuelve a intentar: el pedido sigue completo en la pantalla y el reintento usa la misma
            clave, así que no puede duplicarse.
          </p>
          <Button disabled={enviando} onClick={enviar}>
            {enviando ? 'Enviando…' : 'Reintentar envío'}
          </Button>
        </DialogContent>
      </Dialog>
      {anulando !== null && mesa?.venta_activa_id != null && (
        <AnularLineaDialog
          abierto
          ordenId={mesa.venta_activa_id}
          lineaId={anulando.id}
          nombreDelPlatillo={anulando.producto_nombre}
          /* «Ya se preparó» no es una suposición: es que cocina lo dejó en la
             ventana. De ahí sale el aviso de que el insumo ya se gastó. */
          yaSePreparo={listos.includes(anulando.producto_nombre)}
          onCerrar={cerrarAnular}
          onAnulada={traslaAnulacion}
        />
      )}
      {mesa?.venta_activa_id != null && (
        <DividirCuentaDialog
          abierto={dividiendo}
          ordenId={mesa.venta_activa_id}
          lineas={enviadas.map((l) => ({
            id: l.id,
            nombre: l.producto_nombre,
            cantidad: l.cantidad,
          }))}
          onCerrar={cerrarDividir}
          onDividida={traslaDivision}
        />
      )}
    </div>
  );
}
