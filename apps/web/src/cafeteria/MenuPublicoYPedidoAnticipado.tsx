'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { consultarPuente } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · cafeteria · menu-publico-y-pedido-anticipado
 *
 * F-922 + F-330 · El menú que ve el cliente en su teléfono, y el pedido que
 * deja puesto antes de llegar.
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

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

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

function pesos(centavos: number): string {
  return PESOS.format(centavos / 100);
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

export function MenuPublicoYPedidoAnticipado({ productosIniciales, ahora }: MenuPublicoProps) {
  const voc = useVocabulario();
  const [productos, setProductos] = useState<readonly ProductoPublico[] | null>(
    productosIniciales ?? null,
  );
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
          if (sigueMontada()) setProductos([]);
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [productosIniciales]);

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
        precioCentavos: Math.round((producto.precio_venta ?? 0) * 100),
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
    const texto = [
      `Pedido de ${nombre.trim()}`,
      `Para las ${tramo.slice(11, 16)}`,
      '',
      lineas,
      '',
      `Total aproximado ${PESOS.format(totalDelCarrito(carrito) / 100)}`,
    ].join(CHR_SALTO);
    setPedidoEnTexto(texto);
    // Sin permiso de portapapeles queda el texto a la vista, que es suficiente.
    void navigator.clipboard.writeText(texto).catch(() => {
      /* el texto ya está en pantalla */
    });
  }

  if (productos === null) {
    return (
      <div className="space-y-(--espacio-4) p-(--espacio-6)">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (pedidoEnTexto !== null) {
    return (
      <main className="mx-auto max-w-lg space-y-(--espacio-4) p-(--espacio-6)">
        <h1 className="text-2xl font-semibold">{voc.titulo('orden')} listo para pedirlo</h1>
        <p className="text-texto-sutil text-sm">
          Se copió solo. Enséñalo o léelo en {voc.enFrase('preparacion')}: se paga al recogerlo.
        </p>
        <pre className="whitespace-pre-wrap rounded border border-borde bg-superficie p-(--espacio-3) text-sm">
          {pedidoEnTexto}
        </pre>
        <Button
          variant="outline"
          onClick={() => {
            setPedidoEnTexto(null);
          }}
        >
          Cambiar el pedido
        </Button>
      </main>
    );
  }

  const familias = [...new Set(productos.map((p) => p.familia))];
  const total = totalDelCarrito(carrito);
  const tramos = tramosDesde(reloj);

  return (
    <main className="mx-auto max-w-2xl space-y-(--espacio-6) p-(--espacio-4)">
      <header>
        <h1 className="text-2xl font-semibold">Pide antes de llegar</h1>
        <p className="text-texto-sutil text-sm">
          Se aparta y se paga en {voc.enFrase('preparacion')}. Sin fila.
        </p>
      </header>

      {error !== null && (
        <p role="alert" className="text-peligro text-sm">
          {error}
        </p>
      )}

      {familias.map((familia) => (
        <section key={familia}>
          <h2 className="mb-2 font-medium capitalize">{familia}</h2>
          <ul className="divide-y">
            {productos
              .filter((p) => p.familia === familia)
              .map((producto) => (
                <li key={producto.id} className="flex items-center justify-between py-2">
                  <span className={producto.visible_en_pos ? '' : 'text-texto-sutil'}>
                    {producto.nombre}
                    {/* Lo agotado se VE: esconderlo hace que el cliente crea que
                        el menú cambió y pregunte en la barra. */}
                    {!producto.visible_en_pos && <span className="ml-2 text-sm">hoy no hay</span>}
                  </span>
                  <span className="flex items-center gap-(--espacio-3)">
                    <span className="tabular-nums">
                      {pesos(Math.round((producto.precio_venta ?? 0) * 100))}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!producto.visible_en_pos}
                      onClick={() => {
                        agregar(producto);
                      }}
                    >
                      Agregar
                    </Button>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ))}

      <Separator />

      <section className="space-y-(--espacio-3)">
        <h2 className="font-medium">Tu {voc.singular('unidad_servicio')}</h2>
        {carrito.length === 0 && (
          <p className="text-texto-sutil text-sm">Todavía no has puesto nada.</p>
        )}
        <ul className="divide-y">
          {carrito.map((linea) => (
            <li key={linea.productoId} className="flex items-center justify-between py-2">
              <span>
                {linea.cantidad} × {linea.nombre}
              </span>
              <span className="flex items-center gap-(--espacio-3)">
                <span className="tabular-nums">{pesos(linea.precioCentavos * linea.cantidad)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    quitar(linea.productoId);
                  }}
                >
                  Quitar
                </Button>
              </span>
            </li>
          ))}
        </ul>
        {carrito.length > 0 && (
          <p className="text-right text-lg font-semibold tabular-nums">{pesos(total)}</p>
        )}
      </section>

      <section className="space-y-(--espacio-3)">
        <h2 className="font-medium">¿Para qué hora?</h2>
        <div className="flex flex-wrap gap-2">
          {tramos.map((opcion) => (
            <Button
              key={opcion}
              type="button"
              aria-pressed={tramo === opcion}
              variant={tramo === opcion ? 'default' : 'outline'}
              className="h-[calc(var(--altura-control)*1.2)]"
              onClick={() => {
                setTramo(opcion);
              }}
            >
              {opcion.slice(11, 16)}
            </Button>
          ))}
        </div>

        <div>
          <Label htmlFor="nombre">Tu nombre</Label>
          <Input
            id="nombre"
            className="h-[calc(var(--altura-control)*1.4)] text-lg"
            value={nombre}
            onChange={(evento) => {
              setNombre(evento.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="tel">Teléfono (opcional)</Label>
          <Input
            id="tel"
            inputMode="numeric"
            className="h-[calc(var(--altura-control)*1.4)]"
            value={telefono}
            onChange={(evento) => {
              setTelefono(evento.target.value);
            }}
          />
        </div>

        <Button className="h-[calc(var(--altura-control)*1.4)] w-full text-base" onClick={apartar}>
          Apartar
        </Button>
      </section>
    </main>
  );
}
