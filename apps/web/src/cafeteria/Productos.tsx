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
// La perilla de «hoy no hay» escribe por el PUENTE y no por
// `catalogo.actualizar_producto`, que no acepta ese campo. Ver `cambiarDisponible`.
const RUTA_ESCRIBIR = '/api/datos/escribir';

const IMPORTE_CON_FORMA = /^\d{1,7}(?:[.,]\d{1,2})?$/;
const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Lo que cobran las plataformas de reparto, en puntos base. */
const CANALES = [
  { clave: 'barra', etiqueta: 'Barra', comisionBp: 0 },
  { clave: 'plataforma', etiqueta: 'Plataforma', comisionBp: 2_800 },
] as const;

type Canal = (typeof CANALES)[number]['clave'];

/**
 * El producto como lo sirve el PUENTE, y por qué los nombres son ésos.
 *
 * Aquí se leían `precio_venta_centavos` y `costo_unitario_centavos`, que **el
 * puente no sirve**: la entidad `ProductoTerminado` los expone como `precio_venta`
 * y `costo_unitario`, ya convertidos a PESOS por la conversión `dinero`. Los dos
 * campos llegaban `undefined`, la pantalla los dividía entre 100 y el catálogo
 * entero de una cafetería enseñaba **`$NaN`** en cada renglón. La suite la daba por
 * probada porque el HTML respondía 200.
 *
 * Se leen en pesos y se convierten a centavos en un solo sitio —`enCentavos`—
 * porque la aritmética del margen es entera: con pesos decimales, la comisión del
 * 29 % de una plataforma sale con tres decimales que nadie puede cobrar.
 */
export interface ProductoDeBarra {
  readonly id: string;
  readonly nombre: string;
  readonly familia: string;
  /** EN PESOS, como lo sirve el puente. */
  readonly precio_venta: number | null;
  /** EN PESOS: la entidad sirve `costo_calculado_actual`, el promedio ponderado. */
  readonly costo_calculado_actual: number | null;
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

/**
 * Pesos del puente a centavos, con el redondeo en el ÚLTIMO paso.
 *
 * `x * 100` en punto flotante da `1233.9999999999998` para 12.34, así que el
 * redondeo va sobre el producto y no antes. Es el mismo criterio que
 * `centavosDeTexto` en las pruebas y que `desdeTexto` en el dominio.
 */
export function enCentavos(pesos: number | null): number {
  return pesos === null ? 0 : Math.round(pesos * 100);
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
    setPrecio((producto.precio_venta ?? 0).toFixed(2));
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
    // `importe` es una cadena en PESOS, no un número de centavos: con
    // `precioVentaCentavos` el comando contestaba 400 en cada guardado.
    invocarComando(RUTA_PRECIO, {
      productoId: elegido.id,
      precioVenta: (centavos / 100).toFixed(2),
    })
      .then(() => {
        const actualizado = { ...elegido, precio_venta: centavos / 100 };
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
    const siguiente = { ...producto, visible_en_pos: !producto.visible_en_pos };
    setProductos((productos ?? []).map((p) => (p.id === producto.id ? siguiente : p)));
    if (elegido?.id === producto.id) setElegido(siguiente);
    /**
     * ── ESTA PERILLA NUNCA GUARDÓ NADA ──────────────────────────────
     * Publicaba en `catalogo.actualizar_producto` con `{productoId, disponible}` y
     * un comentario que decía «el comando sí se llama `disponible`». **No existe**:
     * `entradaActualizarProducto` pide `nombre`, `descripcion`, `categoriaId`,
     * `marca`, `imagenUrl`, `visibleEnPos`, `permiteVentaSinStock` y `stockMinimo`,
     * y ninguno de ellos es `disponible`. CADA toque contestaba **400**, y la
     * perilla volvía a su sitio con un mensaje genérico: el barista marcaba «hoy no
     * hay» y el menú público seguía ofreciendo la bebida. El rastreador lo contó
     * dieciséis veces, una por producto.
     *
     * Se escribe por el PUENTE, que es donde vive ese campo y lo que ya hace la
     * misma perilla del restaurante: una columna, una escritura, sin inventar un
     * comando para un booleano.
     */
    invocarComando(RUTA_ESCRIBIR, {
      entidad: 'ProductoTerminado',
      operacion: 'update',
      id: producto.id,
      datos: { visible_en_pos: siguiente.visible_en_pos },
    }).catch((fallo: unknown) => {
      // Se devuelve la perilla a su sitio: dejarla movida haría creer que el
      // menú público cambió cuando no cambió.
      setProductos((productos ?? []).map((p) => (p.id === producto.id ? producto : p)));
      setError(mensajeDe(fallo));
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

  return (
    <main className="mx-auto grid max-w-5xl gap-(--espacio-6) p-(--espacio-6) md:grid-cols-[1fr_22rem]">
      <section>
        <h1 className="mb-(--espacio-3) text-2xl font-semibold">{voc.titulo('producto', true)}</h1>
        {error !== null && (
          <p role="alert" className="text-peligro mb-2 text-sm">
            {error}
          </p>
        )}
        <ul className="divide-y">
          {productos.map((producto) => (
            <li key={producto.id} className="flex items-center gap-(--espacio-3) py-2">
              <button
                type="button"
                className="flex-1 text-left"
                onClick={() => {
                  elegir(producto);
                }}
              >
                <span className={producto.visible_en_pos ? '' : 'text-texto-sutil'}>
                  {producto.nombre}
                </span>
                <span className="text-texto-sutil ml-2 text-xs capitalize">{producto.familia}</span>
              </button>
              <span className="tabular-nums">{pesos(enCentavos(producto.precio_venta))}</span>
              <Button
                size="sm"
                variant={producto.visible_en_pos ? 'outline' : 'default'}
                onClick={() => {
                  cambiarDisponible(producto);
                }}
              >
                {producto.visible_en_pos ? 'Hay' : 'Hoy no hay'}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <aside className="space-y-(--espacio-4)">
        {elegido === null && (
          <p className="text-texto-sutil">
            Elige {voc.enFraseCon('un', 'producto')} para ver su margen.
          </p>
        )}
        {elegido !== null && (
          <div className="space-y-(--espacio-4) rounded-lg border p-(--espacio-4)">
            <h2 className="font-medium">{elegido.nombre}</h2>

            <div className="flex gap-2">
              {CANALES.map((opcion) => (
                <Button
                  key={opcion.clave}
                  type="button"
                  aria-pressed={canal === opcion.clave}
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
                enCentavos(elegido.precio_venta),
                enCentavos(elegido.costo_calculado_actual),
                opcion.comisionBp,
              );
              return (
                <div key={opcion.clave}>
                  <p className="font-medium">{opcion.etiqueta}</p>
                  <p className="text-texto-sutil text-sm">
                    Entra {pesos(resultado.netoCentavos)} · cuesta{' '}
                    {pesos(enCentavos(elegido.costo_calculado_actual))}
                  </p>
                  <p className="tabular-nums">
                    Deja {pesos(resultado.margenCentavos)} ({(resultado.margenBp / 100).toFixed(1)}{' '}
                    %)
                  </p>
                </div>
              );
            })}

            <p className="text-texto-sutil text-sm">
              La comisión se calcula sobre el precio, no sobre el margen: es lo que de verdad cobra
              la plataforma.
            </p>
          </div>
        )}
      </aside>
    </main>
  );
}
