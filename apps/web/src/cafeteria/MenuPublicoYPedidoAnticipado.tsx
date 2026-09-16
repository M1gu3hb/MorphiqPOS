'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';

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

const RUTA_PROGRAMAR = '/api/portal/pedido-anticipado';

/** Quince minutos: lo que la barra puede sostener de verdad. */
const MINUTOS_POR_TRAMO = 15;
/** Cuántos tramos se ofrecen. Dos horas basta: nadie pide para la tarde. */
const TRAMOS_OFRECIDOS = 8;

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export interface ProductoPublico {
  readonly id: string;
  readonly nombre: string;
  readonly precio_venta_centavos: number;
  readonly familia: string;
  readonly disponible: boolean;
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

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo apartar el pedido. Vuelve a intentarlo.';
}

export function MenuPublicoYPedidoAnticipado({ productosIniciales, ahora }: MenuPublicoProps) {
  const [productos, setProductos] = useState<readonly ProductoPublico[] | null>(
    productosIniciales ?? null,
  );
  const [carrito, setCarrito] = useState<readonly LineaDelCarrito[]>([]);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [tramo, setTramo] = useState<string | null>(null);
  const [reloj, setReloj] = useState(ahora ?? 0);
  const [folio, setFolio] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

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
        precioCentavos: producto.precio_venta_centavos,
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
    setOcupado(true);
    setError(null);
    invocarComando<{ readonly folio: string }>(RUTA_PROGRAMAR, {
      nombrePedido: nombre.trim(),
      telefono: telefono.trim() === '' ? null : telefono.trim(),
      paraLas: tramo,
      lineas: carrito.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
    })
      .then((salida) => {
        setFolio(salida.folio);
        setCarrito([]);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  if (productos === null) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (folio !== null) {
    return (
      <main className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Ya está apartado</h1>
        <p className="text-4xl font-semibold tabular-nums">{folio}</p>
        <p className="text-muted-foreground">
          Se paga en la barra al recogerlo. Di tu nombre y ya está.
        </p>
      </main>
    );
  }

  const familias = [...new Set(productos.map((p) => p.familia))];
  const total = totalDelCarrito(carrito);
  const tramos = tramosDesde(reloj);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Pide antes de llegar</h1>
        <p className="text-muted-foreground text-sm">Se aparta y se paga en la barra. Sin fila.</p>
      </header>

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
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
                  <span className={producto.disponible ? '' : 'text-muted-foreground'}>
                    {producto.nombre}
                    {/* Lo agotado se VE: esconderlo hace que el cliente crea que
                        el menú cambió y pregunte en la barra. */}
                    {!producto.disponible && <span className="ml-2 text-sm">hoy no hay</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums">{pesos(producto.precio_venta_centavos)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!producto.disponible}
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

      <section className="space-y-3">
        <h2 className="font-medium">Tu pedido</h2>
        {carrito.length === 0 && (
          <p className="text-muted-foreground text-sm">Todavía no has puesto nada.</p>
        )}
        <ul className="divide-y">
          {carrito.map((linea) => (
            <li key={linea.productoId} className="flex items-center justify-between py-2">
              <span>
                {linea.cantidad} × {linea.nombre}
              </span>
              <span className="flex items-center gap-3">
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

      <section className="space-y-3">
        <h2 className="font-medium">¿Para qué hora?</h2>
        <div className="flex flex-wrap gap-2">
          {tramos.map((opcion) => (
            <Button
              key={opcion}
              type="button"
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

        <Button
          className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
          disabled={ocupado}
          onClick={apartar}
        >
          Apartar
        </Button>
      </section>
    </main>
  );
}
