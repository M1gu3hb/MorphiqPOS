'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Isla,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Check, ChevronDown, Clock, Coffee, Plus, ShoppingBag, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · cafeteria · menu-publico-y-pedido-anticipado
 *
 * F-922 + F-330 · El menú que ve el cliente en su teléfono, y el pedido que
 * deja puesto antes de llegar.
 *
 * ── Una pantalla de teléfono, y sólo de teléfono ────────────────────────
 * Nadie escanea un QR desde una PC: se diseña a 375 px y no se deriva a nada
 * (`04-INTERFAZ.md`, «Menú público y pedido anticipado»). Una sola columna, cada
 * producto una tesela que se toca entera, y la hora en botones del ancho de un
 * pulgar. La jerarquía es la del documento: 1 el menú · 2 la hora · 3 el carrito.
 *
 * ── Por qué el resumen del pedido está SIEMPRE abajo ────────────────────
 * El menú son 35 a 55 productos y el pedido queda al final. La isla de abajo lleva
 * a él sin recorrer el menú entero, y está desde que el menú se pinta —aunque diga
 * cero—: si apareciera con el primer producto, saltaría debajo del dedo que está
 * tocando la tesela de más abajo, y el segundo toque caería en ella.
 *
 * ── Se APARTA sin pago y se cobra al recoger (C.14 de la 2.4) ──────────
 * Cobrar en línea mete una pasarela, una comisión y una obligación de devolución,
 * y esa decisión es de Miguel (§10). Mientras, el pedido se APARTA de verdad: el
 * menú y el apartado van por rutas PÚBLICAS del negocio de la dirección
 * (`/api/publico/negocio/<slug>/…`), sin sesión —la clienta no tiene ninguna—, y del
 * otro lado nace una orden confirmada con su hora que la barra ve, prepara y cobra
 * al recoger. Antes esta pantalla leía el puente con sesión (desde un teléfono no
 * leía nada) y sólo REDACTABA el pedido para copiarlo.
 *
 * ── Por qué la hora se elige en TRAMOS y no en reloj ────────────────────
 * «A las 8:37» es una promesa que la barra no puede cumplir. Tramos de quince
 * minutos son lo que la barra sí puede sostener, y lo que el cliente entiende
 * como «para las ocho y media».
 *
 * ── Por qué lo agotado se ve pero no se puede pedir ─────────────────────
 * Esconderlo hace que el cliente crea que el menú cambió y pregunte en la
 * barra, que es exactamente la conversación que esta pantalla vino a evitar.
 * Se ve, en gris, y dice «hoy no hay».
 *
 * ── Por qué el nombre es obligatorio y el teléfono no ───────────────────
 * El nombre es lo que se canta en la barra: sin él el pedido no se puede
 * entregar. El teléfono sólo sirve para avisar, y pedirlo como requisito espanta
 * a la mitad de la gente que pediría.
 *
 * ── Por qué el error no enseña el detalle técnico ───────────────────────
 * Quien lo lee es un cliente en la fila, no quien puede arreglarlo. Se le dice qué
 * hacer —volver a intentar, o pedir en la barra— y nada más.
 *
 * ── Lo que espera al §10 ─────────────────────────────────────────────────
 * El pago en línea (pasarela) y el aviso por mensaje cuando está listo (proveedor de
 * WhatsApp) son los puntos 5 del §10: están en EXCEPCIONES con su motivo. Aquí se
 * aparta y se paga en la barra.
 */

/** Quince minutos: lo que la barra puede sostener de verdad. */
const MINUTOS_POR_TRAMO = 15;
/** Cuántos tramos se ofrecen. Dos horas basta: nadie pide para la tarde. */
const TRAMOS_OFRECIDOS = 8;
/**
 * Lo mínimo de anticipación, el MISMO número que exige el servidor
 * (`portal/anticipado.ts`): ofrecer un tramo que el servidor rechaza es un botón que
 * falla con la clienta en la fila.
 */
const ANTICIPACION_MINIMA_MS = 10 * 60_000;

/** Las teselas del esqueleto: la forma del menú mientras llega. */
const TESELAS_DE_ESPERA = 6;

/** Un producto del menú que se puede apartar, como lo sirve la ruta pública. */
export interface ProductoPublico {
  readonly id: string;
  readonly nombre: string;
  readonly familia: string;
  /** Centavos, en cadena: como toda cifra de dinero que sale del servidor. */
  readonly precioCentavos: string;
  /** `false` es «hoy no hay»: se ve en gris y no se puede pedir. */
  readonly disponible: boolean;
}

/** Lo que contesta el servidor al apartar. */
export interface PedidoApartado {
  readonly pedidoId: string;
  readonly nombre: string;
  readonly horaPrometida: string;
  readonly totalCentavos: string;
}

export interface LineaDelCarrito {
  readonly productoId: string;
  readonly nombre: string;
  readonly precioCentavos: number;
  readonly cantidad: number;
}

export interface MenuPublicoProps {
  /** El slug del negocio: el de la dirección, `/n/<slug>/pedir`. */
  readonly negocio: string;
  readonly productosIniciales?: readonly ProductoPublico[];
  readonly ahora?: number;
}

/** El precio del catálogo, que el servidor manda en centavos y en cadena. */
function precioEnCentavos(producto: ProductoPublico): number {
  return Number(producto.precioCentavos);
}

/**
 * «08:30», del tramo en ISO, EN LA HORA DE QUIEN LO VE.
 *
 * Era `tramo.slice(11, 16)`, y el ISO está en UTC: a las 8:10 de Monterrey la
 * clienta veía «14:15» en los botones y en el pedido que enseña en la barra.
 */
function horaDelTramo(tramo: string): string {
  const fecha = new Date(tramo);
  const horas = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  return `${horas}:${minutos}`;
}

/**
 * Los tramos de quince minutos a partir del siguiente.
 *
 * Se redondea HACIA ARRIBA: ofrecer el tramo que ya empezó es prometer algo que
 * la barra no puede preparar.
 */
export function tramosDesde(ahora: number, cuantos = TRAMOS_OFRECIDOS): readonly string[] {
  if (ahora === 0) return [];
  const ms = MINUTOS_POR_TRAMO * 60_000;
  const primero = Math.ceil((ahora + ANTICIPACION_MINIMA_MS) / ms) * ms;
  const tramos: string[] = [];
  for (let i = 0; i < cuantos; i += 1) {
    tramos.push(new Date(primero + i * ms).toISOString());
  }
  return tramos;
}

export function totalDelCarrito(lineas: readonly LineaDelCarrito[]): number {
  return lineas.reduce((suma, linea) => suma + linea.precioCentavos * linea.cantidad, 0);
}

/** El título de la pantalla, el mismo en los cuatro estados: el cliente sabe dónde está. */
function Encabezado({ barra }: { readonly barra: string }) {
  return (
    <header className="flex flex-col gap-(--espacio-1)">
      <h1 className="text-3xl leading-tight font-semibold">Pide antes de llegar</h1>
      <p className="text-sm text-texto-sutil">Se aparta y se paga al recogerlo en {barra}.</p>
    </header>
  );
}

/**
 * Una familia del menú: su nombre y sus productos, cada uno una tesela que se toca
 * entera. En el teléfono el dedo no apunta a un botón de 32 px al final del renglón:
 * apunta al producto.
 */
function FamiliaDelMenu({
  familia,
  productos,
  enElPedido,
  alAgregar,
}: {
  readonly familia: string;
  readonly productos: readonly ProductoPublico[];
  readonly enElPedido: ReadonlyMap<string, number>;
  readonly alAgregar: (producto: ProductoPublico) => void;
}) {
  return (
    <section aria-label={familia} className="flex flex-col gap-(--espacio-2)">
      <h2 className="text-lg font-semibold capitalize">{familia}</h2>
      <ul className="flex flex-col gap-(--espacio-2)">
        {productos.map((producto) => {
          const agotado = !producto.disponible;
          const cuantos = enElPedido.get(producto.id) ?? 0;
          return (
            <li key={producto.id}>
              <Superficie
                como="button"
                type="button"
                interactiva
                relleno={3}
                disabled={agotado}
                onClick={() => {
                  alAgregar(producto);
                }}
                // El gris ya dice «apagado»: la opacidad de `disabled` encima lo
                // hundía a 1,9:1, ilegible al sol en la fila.
                className={`flex min-h-[calc(var(--altura-control)*1.6)] w-full items-center gap-(--espacio-3) ${agotado ? 'bg-fondo-sutil text-texto-sutil disabled:opacity-100' : ''}`}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-(--espacio-1)">
                  <span className="font-medium">
                    <span className="sr-only">Agregar </span>
                    {producto.nombre}
                  </span>
                  {/* Lo agotado se VE: esconderlo hace que el cliente crea que el
                      menú cambió y pregunte en la barra. La palabra, no sólo el gris,
                      y la palabra a todo contraste: es la señal que no es color. */}
                  {agotado ? (
                    <span className="text-sm font-medium text-texto">hoy no hay</span>
                  ) : null}
                  {/* El pedido queda al final del menú: esto confirma, sin bajar, que
                      el toque entró. */}
                  {cuantos > 0 ? (
                    <span className="flex items-center gap-(--espacio-1) text-xs font-medium text-primario">
                      <Check aria-hidden="true" className="size-4" />
                      <Cifra valor={cuantos} tamano="xs" /> en tu pedido
                    </span>
                  ) : null}
                </span>
                <Dinero centavos={precioEnCentavos(producto)} />
                {agotado ? null : (
                  <Plus aria-hidden="true" className="size-5 shrink-0 text-primario" />
                )}
              </Superficie>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Las dos columnas del recibo: qué y cuánto. El carrito le suma la de quitar. */
function columnasDelRecibo(tituloDelProducto: string): readonly ColumnaDeTabla<LineaDelCarrito>[] {
  return [
    {
      clave: 'producto',
      titulo: tituloDelProducto,
      celda: (linea) => (
        <span>
          <span className="font-numeros tabular-nums">{linea.cantidad} ×</span> {linea.nombre}
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
}

/**
 * Lo que se ve después de apartar: el pedido YA apartado, con el nombre que se canta y
 * la hora, grandes, y lo que lleva en un recibo con el total del SERVIDOR.
 */
function PedidoApartadoPieza({
  nombreDelPedido,
  apartado,
  lineas,
  columnas,
  barra,
  alPedirOtro,
}: {
  readonly nombreDelPedido: string;
  readonly apartado: PedidoApartado;
  readonly lineas: readonly LineaDelCarrito[];
  readonly columnas: readonly ColumnaDeTabla<LineaDelCarrito>[];
  readonly barra: string;
  readonly alPedirOtro: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-(--espacio-6) px-(--espacio-4) py-(--espacio-6)">
      <header className="flex flex-col gap-(--espacio-1)">
        <h1 className="text-2xl font-semibold">Apartado</h1>
        <p className="text-sm text-texto-sutil">
          Te lo preparamos para esa hora. Se paga al recogerlo en {barra}.
        </p>
      </header>

      <Superficie
        como="section"
        aria-label={nombreDelPedido}
        nivel={2}
        relleno={4}
        className="flex flex-col gap-(--espacio-4)"
      >
        <div className="flex flex-col">
          <span className="text-sm text-texto-sutil">{nombreDelPedido} de</span>
          <span className="text-3xl font-bold break-words">{apartado.nombre}</span>
        </div>
        <p className="flex items-center gap-(--espacio-2) text-xl font-semibold">
          <Clock aria-hidden="true" className="size-5 shrink-0 text-texto-sutil" />
          Para las{' '}
          <span className="font-numeros tabular-nums">{horaDelTramo(apartado.horaPrometida)}</span>
        </p>
        <Tabla
          etiqueta={nombreDelPedido}
          columnas={columnas}
          filas={lineas}
          claveDe={(linea) => linea.productoId}
          alto="max-h-none"
          pie={{
            producto: 'Total',
            importe: <Dinero centavos={Number(apartado.totalCentavos)} tamano="lg" />,
          }}
        />
      </Superficie>

      <Button variant="outline" size="lg" className="w-full" onClick={alPedirOtro}>
        Pedir otra cosa
      </Button>
    </main>
  );
}

/** Una clave nueva por intento de apartar: reintentar con la MISMA no aparta dos veces. */
function nuevaClave(): string {
  return crypto.randomUUID();
}

export function MenuPublicoYPedidoAnticipado({
  negocio,
  productosIniciales,
  ahora,
}: MenuPublicoProps) {
  const voc = useVocabulario();
  const [productos, setProductos] = useState<readonly ProductoPublico[] | null>(
    productosIniciales ?? null,
  );
  const [falloDeCarga, setFalloDeCarga] = useState(false);
  // Cada intento de lectura es un número: el botón de reintentar lo sube, y el
  // efecto lee otra vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [carrito, setCarrito] = useState<readonly LineaDelCarrito[]>([]);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [tramo, setTramo] = useState<string | null>(null);
  const [reloj, setReloj] = useState(ahora ?? 0);
  const [apartado, setApartado] = useState<PedidoApartado | null>(null);
  const [apartando, setApartando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * La clave de ESTE pedido. Se crea al primer toque de «Apartar» y se conserva
   * mientras el pedido no cambie: un reintento con mala cobertura manda la misma y el
   * servidor devuelve el mismo apartado, no dos.
   */
  const clave = useRef<string | null>(null);

  useEffect(() => {
    if (ahora !== undefined) return;
    // El reloj se siembra en un efecto: leerlo durante el render es un desajuste
    // de hidratación garantizado. Y en un `setTimeout`: escribir estado de
    // forma síncrona aquí encadena renders.
    const arranque = setTimeout(() => {
      setReloj(Date.now());
    });
    return () => {
      clearTimeout(arranque);
    };
  }, [ahora]);

  useEffect(() => {
    if (productosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      fetch(`/api/publico/negocio/${encodeURIComponent(negocio)}/menu`, {
        signal: control.signal,
        headers: { accept: 'application/json' },
      })
        .then(async (respuesta) => {
          const cuerpo = (await respuesta.json()) as {
            readonly ok: boolean;
            readonly datos?: { readonly productos: readonly ProductoPublico[] };
          };
          if (!sigueMontada()) return;
          if (!respuesta.ok || !cuerpo.ok || cuerpo.datos === undefined) {
            setFalloDeCarga(true);
            return;
          }
          setProductos(cuerpo.datos.productos);
        })
        .catch(() => {
          if (sigueMontada()) setFalloDeCarga(true);
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [negocio, productosIniciales, intento]);

  function reintentar(): void {
    setFalloDeCarga(false);
    setProductos(null);
    setIntento((previo) => previo + 1);
  }

  function agregar(producto: ProductoPublico): void {
    clave.current = null;
    const existente = carrito.find((l) => l.productoId === producto.id);
    if (existente !== undefined) {
      setCarrito(
        carrito.map((l) => (l.productoId === producto.id ? { ...l, cantidad: l.cantidad + 1 } : l)),
      );
      return;
    }
    setCarrito([
      ...carrito,
      {
        productoId: producto.id,
        nombre: producto.nombre,
        precioCentavos: precioEnCentavos(producto),
        cantidad: 1,
      },
    ]);
  }

  function quitar(productoId: string): void {
    clave.current = null;
    setCarrito(carrito.filter((l) => l.productoId !== productoId));
  }

  async function apartar(): Promise<void> {
    if (nombre.trim() === '') {
      // El nombre es lo que se canta en la barra: sin él el pedido no se puede
      // entregar.
      setError('Tu nombre, para poder llamarte.');
      return;
    }
    if (carrito.length === 0 || tramo === null) {
      setError('Elige qué quieres y para qué hora.');
      return;
    }
    clave.current ??= nuevaClave();
    setApartando(true);
    setError(null);
    try {
      const telefonoLimpio = telefono.trim();
      const respuesta = await fetch(`/api/publico/negocio/${encodeURIComponent(negocio)}/apartar`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-morphiqpos-request': '1',
          'idempotency-key': clave.current,
        },
        body: JSON.stringify({
          nombre: nombre.trim(),
          ...(telefonoLimpio === '' ? {} : { telefono: telefonoLimpio }),
          horaPrometida: tramo,
          items: carrito.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
        }),
      });
      const cuerpo = (await respuesta.json()) as {
        readonly ok: boolean;
        readonly datos?: PedidoApartado;
        readonly error?: { readonly mensaje?: string };
      };
      if (!respuesta.ok || !cuerpo.ok || cuerpo.datos === undefined) {
        // El mensaje del servidor está escrito para quien está en la fila; si no hay,
        // se dice qué hacer y nada técnico.
        setError(
          cuerpo.error?.mensaje ?? `No se pudo apartar. Vuelve a intentarlo o pide en la barra.`,
        );
        return;
      }
      setApartado(cuerpo.datos);
    } catch {
      setError('Sin conexión: no se apartó nada. Vuelve a intentarlo o pide en la barra.');
    } finally {
      setApartando(false);
    }
  }

  const barra = voc.enFrase('preparacion');
  const suPedido = `Tu ${voc.singular('unidad_servicio')}`;
  const recibo = columnasDelRecibo(voc.titulo('producto'));

  if (falloDeCarga) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-(--espacio-6) px-(--espacio-4) py-(--espacio-6)">
        <Encabezado barra={barra} />
        <ErrorDePantalla
          titulo="No se pudo abrir el menú"
          queHacer={`Revisa tu internet y vuelve a intentarlo. Si sigue sin abrir, pide directo en ${barra}.`}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </main>
    );
  }

  if (productos === null) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-(--espacio-6) px-(--espacio-4) py-(--espacio-6)">
        <Encabezado barra={barra} />
        {/* La forma del menú, no una rueda: al llegar los productos nada salta. */}
        <div
          role="status"
          aria-busy="true"
          aria-label="Cargando el menú"
          className="flex flex-col gap-(--espacio-2)"
        >
          <Esqueleto className="mb-(--espacio-1) h-[calc(var(--altura-control)*0.6)] w-28" />
          {Array.from({ length: TESELAS_DE_ESPERA }, (_, indice) => (
            <Esqueleto
              key={indice}
              className="h-[calc(var(--altura-control)*1.6)] w-full rounded-lg"
            />
          ))}
        </div>
      </main>
    );
  }

  if (apartado !== null) {
    return (
      <PedidoApartadoPieza
        nombreDelPedido={voc.titulo('unidad_servicio')}
        apartado={apartado}
        lineas={carrito}
        columnas={recibo}
        barra={barra}
        alPedirOtro={() => {
          clave.current = null;
          setApartado(null);
          setCarrito([]);
          setTramo(null);
        }}
      />
    );
  }

  if (productos.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-(--espacio-6) px-(--espacio-4) py-(--espacio-6)">
        <Encabezado barra={barra} />
        <Vacio
          icono={<Coffee />}
          titulo={`Todavía no hay ${voc.plural('producto')} en el menú`}
          explicacion={`Mientras tanto, pide directo en ${barra}: ahí te atienden.`}
        />
      </main>
    );
  }

  const familias = [...new Set(productos.map((p) => p.familia))];
  const total = totalDelCarrito(carrito);
  const piezas = carrito.reduce((suma, linea) => suma + linea.cantidad, 0);
  const enElPedido = new Map(carrito.map((linea) => [linea.productoId, linea.cantidad]));
  const tramos = tramosDesde(reloj);

  const columnas: readonly ColumnaDeTabla<LineaDelCarrito>[] = [
    ...recibo,
    {
      clave: 'quitar',
      titulo: 'Quitar',
      celda: (linea) => (
        <span className="flex justify-end">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Quitar ${linea.nombre}`}
            onClick={() => {
              quitar(linea.productoId);
            }}
          >
            <X />
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <main className="mx-auto flex w-full max-w-lg flex-col gap-(--espacio-8) px-(--espacio-4) pt-(--espacio-6) pb-[calc(var(--espacio-16)*2)]">
        <Encabezado barra={barra} />

        {/* 1 · EL MENÚ. Es lo primero y lo más largo: se lee en la fila. */}
        {familias.map((familia) => (
          <FamiliaDelMenu
            key={familia}
            familia={familia}
            productos={productos.filter((p) => p.familia === familia)}
            enElPedido={enElPedido}
            alAgregar={agregar}
          />
        ))}

        <Superficie
          como="section"
          id="tu-pedido"
          aria-labelledby="tu-pedido-titulo"
          relleno={4}
          className="flex scroll-mt-(--espacio-4) flex-col gap-(--espacio-6)"
        >
          {/* EL CARRITO, primero al llegar aquí: un recibo denso, con su total al pie. */}
          <div className="flex flex-col gap-(--espacio-3)">
            <h2 id="tu-pedido-titulo" className="text-lg font-semibold">
              {suPedido}
            </h2>
            <Tabla
              etiqueta={suPedido}
              columnas={columnas}
              filas={carrito}
              claveDe={(linea) => linea.productoId}
              alto="max-h-none"
              pie={{
                producto: 'Total aproximado',
                importe: <Dinero centavos={total} tamano="lg" />,
              }}
              vacio={
                <Vacio
                  icono={<ShoppingBag />}
                  titulo="Todavía no has puesto nada."
                  explicacion="Toca lo que quieras del menú y aparece aquí."
                  className="py-(--espacio-4)"
                />
              }
            />
          </div>

          {/* LA HORA, segunda en peso aunque vaya después del recibo. Es el único
              control que decide algo: botones del ancho de un pulgar, y el elegido
              lo dice con su marca, no sólo con el color. */}
          <div className="flex flex-col gap-(--espacio-3)">
            <h2 className="text-lg font-semibold">¿Para qué hora?</h2>
            {tramos.length === 0 ? (
              // El reloj se siembra después de pintar: la forma de los tramos,
              // mientras tanto, para que nada salte.
              <div aria-hidden="true" className="grid grid-cols-4 gap-(--espacio-2)">
                {Array.from({ length: TRAMOS_OFRECIDOS }, (_, indice) => (
                  <Esqueleto key={indice} className="h-[calc(var(--altura-control)*1.2)]" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-(--espacio-2)">
                {tramos.map((opcion) => (
                  <Button
                    key={opcion}
                    type="button"
                    aria-pressed={tramo === opcion}
                    variant={tramo === opcion ? 'default' : 'outline'}
                    className="h-[calc(var(--altura-control)*1.2)] px-(--espacio-1) font-numeros text-base tabular-nums"
                    onClick={() => {
                      setTramo(opcion);
                    }}
                  >
                    {tramo === opcion ? <Check aria-hidden="true" /> : null}
                    {horaDelTramo(opcion)}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-(--espacio-4)">
            <div className="flex flex-col gap-(--espacio-1)">
              <Label htmlFor="nombre">Tu nombre</Label>
              <Input
                id="nombre"
                autoComplete="given-name"
                className="h-[calc(var(--altura-control)*1.4)] text-lg"
                value={nombre}
                onChange={(evento) => {
                  setNombre(evento.target.value);
                }}
              />
            </div>
            <div className="flex flex-col gap-(--espacio-1)">
              <Label htmlFor="tel">Teléfono (opcional)</Label>
              <Input
                id="tel"
                inputMode="numeric"
                autoComplete="tel"
                className="h-[calc(var(--altura-control)*1.4)]"
                value={telefono}
                onChange={(evento) => {
                  setTelefono(evento.target.value);
                }}
              />
            </div>
          </div>

          {/* Junto al botón, no arriba de la pantalla: en el teléfono el aviso tiene
              que caer donde está el dedo que acaba de tocar «Apartar». */}
          {/* `alerta`: aparece ya lleno al tocar «Apartar», y un `status` que nace
              lleno casi nunca se lee. Es lo que impide apartar: tiene que oírse. */}
          {error === null ? null : <Aviso tono="atencion" anuncio="alerta" titulo={error} />}

          <Button
            size="lg"
            className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
            cargando={apartando}
            disabled={apartando}
            onClick={() => {
              void apartar();
            }}
          >
            {apartando ? 'Apartando…' : 'Apartar'}
          </Button>
        </Superficie>
      </main>

      <Isla>
        <a
          href="#tu-pedido"
          className="flex min-h-(--area-tactil-minima) items-center gap-(--espacio-3) px-(--espacio-2) text-sm font-medium"
        >
          <ShoppingBag aria-hidden="true" className="size-5 shrink-0" />
          <span>{suPedido}</span>
          <Cifra valor={piezas} tamano="sm" className="text-texto-sutil" />
          <Dinero centavos={total} tamano="sm" />
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-texto-sutil" />
        </a>
      </Isla>
    </>
  );
}
