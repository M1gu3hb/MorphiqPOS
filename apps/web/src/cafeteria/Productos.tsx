'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · cafeteria · productos
 *
 * El catálogo de la barra: qué se vende, a cuánto y en qué canal.
 *
 * ── Por qué el precio de plataforma va AQUÍ y no en la plataforma ───────
 * Porque hoy se vende al precio de barra y la comisión se come el 29 % del
 * margen sin que nadie lo vea. Tener el precio por canal en la ficha convierte
 * una pérdida invisible en una decisión: se ve el margen de cada canal al lado
 * del otro, y quien decide puede decidir.
 *
 * ── Por qué la comisión se resta del PRECIO y no del margen ─────────────
 * La plataforma cobra sobre lo que el cliente paga, no sobre lo que el negocio
 * gana. Calcularla sobre el margen da un número más bonito y equivocado, y es
 * el error que hace que el dueño crea que le va bien en la aplicación.
 *
 * ── Por qué el disponible es una perilla y no una existencia ────────────
 * «Hoy no hay» es una decisión de la barra a las once de la mañana: se acabó la
 * leche de avena. Atarlo a la existencia obligaría a que el inventario de la
 * barra estuviera al día al minuto, que no lo está nunca.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben el catálogo, el precio por canal con su margen y la perilla de
 * disponible. Quedan fuera las recetas, que son su propia pantalla, y el alta
 * de producto, que vive en el catálogo del tronco.
 */

const RUTA_PRECIO = '/api/catalogo/productos/precio';
const RUTA_ACTUALIZAR = '/api/catalogo/productos/actualizar';

const IMPORTE_CON_FORMA = /^\d{1,7}(?:[.,]\d{1,2})?$/;
const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Lo que cobran las plataformas de reparto, en puntos base. */
const CANALES = [
  { clave: 'barra', etiqueta: 'Barra', comisionBp: 0 },
  { clave: 'plataforma', etiqueta: 'Plataforma', comisionBp: 2_800 },
] as const;

type Canal = (typeof CANALES)[number]['clave'];

export interface ProductoDeBarra {
  readonly id: string;
  readonly nombre: string;
  readonly familia: string;
  readonly precio_venta_centavos: number;
  readonly costo_unitario_centavos: number;
  readonly disponible: boolean;
}

export interface ProductosProps {
  readonly productosIniciales?: readonly ProductoDeBarra[];
}

export interface MargenDeCanal {
  readonly netoCentavos: number;
  readonly margenCentavos: number;
  readonly margenBp: number;
}

function pesos(centavos: number): string {
  return PESOS.format(centavos / 100);
}

function aCentavos(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '' || !IMPORTE_CON_FORMA.test(limpio)) return null;
  const [enteros = '0', decimales = ''] = limpio.split('.');
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
}

/**
 * Lo que de verdad queda por canal.
 *
 * La comisión se resta del PRECIO y no del margen: la plataforma cobra sobre lo
 * que el cliente paga. Restarla del margen da un número más bonito y equivocado,
 * y es el que hace creer que en la aplicación va bien.
 */
export function margenDelCanal(
  precioCentavos: number,
  costoCentavos: number,
  comisionBp: number,
): MargenDeCanal {
  const comision = Math.round((precioCentavos * comisionBp) / 10_000);
  const neto = precioCentavos - comision;
  const margen = neto - costoCentavos;
  return {
    netoCentavos: neto,
    margenCentavos: margen,
    margenBp: neto <= 0 ? 0 : Math.round((margen * 10_000) / neto),
  };
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo guardar. Vuelve a intentarlo.';
}

export function Productos({ productosIniciales }: ProductosProps) {
  const voc = useVocabulario();
  const [productos, setProductos] = useState<readonly ProductoDeBarra[] | null>(
    productosIniciales ?? null,
  );
  const [elegido, setElegido] = useState<ProductoDeBarra | null>(null);
  const [canal, setCanal] = useState<Canal>('barra');
  const [precio, setPrecio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (productosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      consultarPuente<ProductoDeBarra>('ProductoTerminado', {
        limite: 200,
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

  function elegir(producto: ProductoDeBarra): void {
    setElegido(producto);
    setPrecio((producto.precio_venta_centavos / 100).toFixed(2));
    setError(null);
  }

  function guardarPrecio(): void {
    if (elegido === null) return;
    const centavos = aCentavos(precio);
    if (centavos === null) {
      setError('Revisa el precio: sólo pesos y centavos.');
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando(RUTA_PRECIO, { productoId: elegido.id, precioVentaCentavos: centavos })
      .then(() => {
        const actualizado = { ...elegido, precio_venta_centavos: centavos };
        setElegido(actualizado);
        setProductos((productos ?? []).map((p) => (p.id === elegido.id ? actualizado : p)));
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function cambiarDisponible(producto: ProductoDeBarra): void {
    const siguiente = { ...producto, disponible: !producto.disponible };
    setProductos((productos ?? []).map((p) => (p.id === producto.id ? siguiente : p)));
    if (elegido?.id === producto.id) setElegido(siguiente);
    invocarComando(RUTA_ACTUALIZAR, {
      productoId: producto.id,
      disponible: siguiente.disponible,
    }).catch((fallo: unknown) => {
      // Se devuelve la perilla a su sitio: dejarla movida haría creer que el
      // menú público cambió cuando no cambió.
      setProductos((productos ?? []).map((p) => (p.id === producto.id ? producto : p)));
      setError(mensajeDe(fallo));
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

  return (
    <main className="mx-auto grid max-w-5xl gap-6 p-6 md:grid-cols-[1fr_22rem]">
      <section>
        <h1 className="mb-3 text-2xl font-semibold">{voc.titulo('producto', true)}</h1>
        {error !== null && (
          <p role="alert" className="text-destructive mb-2 text-sm">
            {error}
          </p>
        )}
        <ul className="divide-y">
          {productos.map((producto) => (
            <li key={producto.id} className="flex items-center gap-3 py-2">
              <button
                type="button"
                className="flex-1 text-left"
                onClick={() => {
                  elegir(producto);
                }}
              >
                <span className={producto.disponible ? '' : 'text-muted-foreground'}>
                  {producto.nombre}
                </span>
                <span className="text-muted-foreground ml-2 text-xs capitalize">
                  {producto.familia}
                </span>
              </button>
              <span className="tabular-nums">{pesos(producto.precio_venta_centavos)}</span>
              <Button
                size="sm"
                variant={producto.disponible ? 'outline' : 'default'}
                onClick={() => {
                  cambiarDisponible(producto);
                }}
              >
                {producto.disponible ? 'Hay' : 'Hoy no hay'}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <aside className="space-y-4">
        {elegido === null && (
          <p className="text-muted-foreground">
            Elige {voc.enFraseCon('un', 'producto')} para ver su margen.
          </p>
        )}
        {elegido !== null && (
          <div className="space-y-4 rounded-lg border p-4">
            <h2 className="font-medium">{elegido.nombre}</h2>

            <div className="flex gap-2">
              {CANALES.map((opcion) => (
                <Button
                  key={opcion.clave}
                  type="button"
                  variant={canal === opcion.clave ? 'default' : 'outline'}
                  onClick={() => {
                    setCanal(opcion.clave);
                  }}
                >
                  {opcion.etiqueta}
                </Button>
              ))}
            </div>

            <div>
              <Label htmlFor="precio">Precio</Label>
              <div className="flex gap-2">
                <Input
                  id="precio"
                  inputMode="decimal"
                  className="h-[calc(var(--altura-control)*1.4)] text-right text-lg"
                  value={precio}
                  onChange={(evento) => {
                    setPrecio(evento.target.value);
                  }}
                />
                <Button
                  className="h-[calc(var(--altura-control)*1.4)]"
                  disabled={ocupado}
                  onClick={guardarPrecio}
                >
                  Guardar
                </Button>
              </div>
            </div>

            <Separator />

            {CANALES.map((opcion) => {
              const resultado = margenDelCanal(
                elegido.precio_venta_centavos,
                elegido.costo_unitario_centavos,
                opcion.comisionBp,
              );
              return (
                <div key={opcion.clave}>
                  <p className="font-medium">{opcion.etiqueta}</p>
                  <p className="text-muted-foreground text-sm">
                    Entra {pesos(resultado.netoCentavos)} · cuesta{' '}
                    {pesos(elegido.costo_unitario_centavos)}
                  </p>
                  <p className="tabular-nums">
                    Deja {pesos(resultado.margenCentavos)} ({(resultado.margenBp / 100).toFixed(1)}{' '}
                    %)
                  </p>
                </div>
              );
            })}

            <p className="text-muted-foreground text-sm">
              La comisión se calcula sobre el precio, no sobre el margen: es lo que de verdad cobra
              la plataforma.
            </p>
          </div>
        )}
      </aside>
    </main>
  );
}
