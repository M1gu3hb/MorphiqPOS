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
  dineroEnTexto,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Check, ChevronDown, Clock, Coffee, Plus, ShoppingBag, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { consultarPuente } from '~/cliente/api';
import { centavosDelPuente } from '~/cliente/dinero-del-puente';
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
 * ── Por qué el pedido anticipado NO se cobra aquí ───────────────────────
 * Porque cobrar en línea mete una pasarela, una comisión y una obligación de
 * devolución, y ninguna de las tres la decide esta pantalla. Se APARTA: el
 * cliente deja su pedido con su nombre y su hora, y paga en la barra. Eso
 * resuelve el 90 % del dolor —la fila de las ocho y media— sin abrir una puerta
 * que después no se puede cerrar.
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
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben el menú público, el carrito, el tramo y el apartado. Queda fuera el
 * pago en línea y el aviso por mensaje, que dependen de decisiones de Miguel.
 */

/** El salto de línea del pedido redactado. */
const CHR_SALTO = '\n';

/** Quince minutos: lo que la barra puede sostener de verdad. */
const MINUTOS_POR_TRAMO = 15;
/** Cuántos tramos se ofrecen. Dos horas basta: nadie pide para la tarde. */
const TRAMOS_OFRECIDOS = 8;

/** Las teselas del esqueleto: la forma del menú mientras llega. */
const TESELAS_DE_ESPERA = 6;

export interface ProductoPublico {
  readonly id: string;
  readonly nombre: string;
  /**
   * EN PESOS, como lo sirve el puente.
   *
   * Aquí decía `precio_venta_centavos`, que la entidad `ProductoTerminado` NO
   * sirve: lo expone como `precio_venta` ya convertido a pesos. Llegaba
   * `undefined` y el menú público enseñaba **`$NaN`** en cada bebida.
   */
  readonly precio_venta: number | null;
  readonly familia: string;
  /**
   * `visible_en_pos`, que es como se llama en el puente.
   *
   * La perilla de «hoy no hay» leía `disponible` y no llegaba nunca: todo el
   * catálogo salía agotado en el menú y en la pantalla de productos. No se declara
   * un segundo nombre en el mapa a propósito —dos nombres para la misma columna
   * dejarían a quien escribe eligiendo cuál gana—, así que la pantalla usa el suyo.
   */
  readonly visible_en_pos: boolean;
}

export interface LineaDelCarrito {
  readonly productoId: string;
  readonly nombre: string;
  readonly precioCentavos: number;
  readonly cantidad: number;
}

export interface MenuPublicoProps {
  readonly productosIniciales?: readonly ProductoPublico[];
  readonly ahora?: number;
}

/** El precio del puente, que llega en pesos, a centavos enteros, sin coma flotante. */
function centavosDe(producto: ProductoPublico): number {
  return centavosDelPuente(producto.precio_venta) ?? 0;
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
  const primero = Math.ceil(ahora / ms) * ms;
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
      <p className="text-sm text-texto-sutil">Se aparta y se paga en {barra}. Sin fila.</p>
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
          const agotado = !producto.visible_en_pos;
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
                <Dinero centavos={centavosDe(producto)} />
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
 * Lo que se ve después de apartar: el pedido, para enseñarlo en la barra.
 *
 * El texto redactado se va al portapapeles; aquí se pinta lo MISMO con la jerarquía
 * de quien lo lee a medio metro, del otro lado de la barra: el nombre que se canta
 * y la hora, grandes; lo que lleva, en un recibo.
 */
function PedidoRedactado({
  titulo,
  nombreDelPedido,
  deQuien,
  hora,
  lineas,
  columnas,
  barra,
  alCambiar,
}: {
  readonly titulo: string;
  readonly nombreDelPedido: string;
  readonly deQuien: string;
  readonly hora: string;
  readonly lineas: readonly LineaDelCarrito[];
  readonly columnas: readonly ColumnaDeTabla<LineaDelCarrito>[];
  readonly barra: string;
  readonly alCambiar: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-(--espacio-6) px-(--espacio-4) py-(--espacio-6)">
      <header className="flex flex-col gap-(--espacio-1)">
        <h1 className="text-2xl font-semibold">{titulo}</h1>
        <p className="text-sm text-texto-sutil">
          Se copió solo. Enséñalo o léelo en {barra}: se paga al recogerlo.
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
          <span className="text-3xl font-bold break-words">{deQuien}</span>
        </div>
        <p className="flex items-center gap-(--espacio-2) text-xl font-semibold">
          <Clock aria-hidden="true" className="size-5 shrink-0 text-texto-sutil" />
          Para las <span className="font-numeros tabular-nums">{hora}</span>
        </p>
        <Tabla
          etiqueta={nombreDelPedido}
          columnas={columnas}
          filas={lineas}
          claveDe={(linea) => linea.productoId}
          alto="max-h-none"
          pie={{
            producto: 'Total aproximado',
            importe: <Dinero centavos={totalDelCarrito(lineas)} tamano="lg" />,
          }}
        />
      </Superficie>

      <Button variant="outline" size="lg" className="w-full" onClick={alCambiar}>
        Cambiar el pedido
      </Button>
    </main>
  );
}

export function MenuPublicoYPedidoAnticipado({ productosIniciales, ahora }: MenuPublicoProps) {
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
  const [pedidoEnTexto, setPedidoEnTexto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      consultarPuente<ProductoPublico>('ProductoTerminado', {
        limite: 120,
        signal: control.signal,
      })
        .then((filas) => {
          if (sigueMontada()) setProductos(filas);
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
  }, [productosIniciales, intento]);

  function reintentar(): void {
    setFalloDeCarga(false);
    setProductos(null);
    setIntento((previo) => previo + 1);
  }

  function agregar(producto: ProductoPublico): void {
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
        precioCentavos: centavosDe(producto),
        cantidad: 1,
      },
    ]);
  }

  function quitar(productoId: string): void {
    setCarrito(carrito.filter((l) => l.productoId !== productoId));
  }

  function apartar(): void {
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
    /**
     * ── LO QUE ESTE BOTÓN PROMETÍA Y EL SISTEMA NO PUEDE CUMPLIR ──────────
     * Publicaba en `cafeteria.programar_pedido` con `{nombrePedido, paraLas, lineas}`,
     * y ese comando pide `{ordenId, nombre, horaPrometida}` —ninguno de los tres— y
     * **exige que la orden esté PAGADA**: «el pedido anticipado se cobra antes: sin
     * cobro es una reserva y las reservas no llegan», lo dice su propio código. Por si
     * quedara duda, su ruta va por `manejadorDeComando`, que exige SESIÓN: el teléfono
     * de una clienta no tiene ninguna.
     *
     * Tres imposibilidades a la vez, y la cabecera de esta pantalla prometiendo lo
     * contrario —«se aparta y se paga en la barra»—. No se puede arreglar aquí: hace
     * falta decidir si se cobra en línea o si se aceptan reservas sin prenda, y eso
     * NO lo decide una pantalla. Queda dicho en el informe.
     *
     * Lo que sí se puede, y es lo que hace: el sistema REDACTA el pedido y la persona
     * lo lleva. Es la misma regla del fiado —el sistema redacta, la persona manda— y
     * resuelve la mitad del dolor: llegar con el pedido escrito en vez de pensarlo en
     * la fila.
     */
    const lineas = carrito
      .map((l) => {
        const suyo = productos?.find((p) => p.id === l.productoId);
        return `${String(l.cantidad)} × ${suyo?.nombre ?? 'producto'}`;
      })
      .join(CHR_SALTO);
    // El importe va como TEXTO porque este texto es lo que se copia al portapapeles.
    const texto = [
      `Pedido de ${nombre.trim()}`,
      `Para las ${horaDelTramo(tramo)}`,
      '',
      lineas,
      '',
      `Total aproximado ${dineroEnTexto(totalDelCarrito(carrito))}`,
    ].join(CHR_SALTO);
    setPedidoEnTexto(texto);
    // Sin permiso de portapapeles queda el pedido a la vista, que es suficiente.
    void navigator.clipboard.writeText(texto).catch(() => {
      /* el pedido ya está en pantalla */
    });
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

  if (pedidoEnTexto !== null) {
    return (
      <PedidoRedactado
        titulo={`${voc.titulo('unidad_servicio')} list${voc.terminacion('unidad_servicio')} para pedirlo`}
        nombreDelPedido={voc.titulo('unidad_servicio')}
        deQuien={nombre.trim()}
        hora={tramo === null ? '' : horaDelTramo(tramo)}
        lineas={carrito}
        columnas={recibo}
        barra={barra}
        alCambiar={() => {
          setPedidoEnTexto(null);
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
            onClick={apartar}
          >
            Apartar
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
