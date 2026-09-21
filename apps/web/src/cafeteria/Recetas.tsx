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
 * PANTALLA · cafeteria · recetas
 *
 * Qué lleva cada bebida, en gramos y mililitros, y cuánto cuesta de verdad.
 *
 * ── Por qué el empaque va en la receta y por CANAL ──────────────────────
 * El vaso para llevar, la tapa y la manga cuestan entre $3 y $5, y sólo se
 * gastan cuando el pedido sale por la puerta. Cargarlos siempre infla el costo
 * del que se toma en mesa; no cargarlos nunca es regalar cinco pesos por bebida
 * para llevar. Es una línea de receta condicionada al canal, y es lo que arregla
 * el margen de TODAS las bebidas.
 *
 * ── Por qué el tipo de leche SUSTITUYE en vez de sumar ──────────────────
 * Entera, deslactosada y avena son tres insumos con tres costos y el cliente
 * elige uno. Modelarlo como suma haría que un latte de avena descontara también
 * la entera: el inventario de avena nunca bajaría y el de entera bajaría de más
 * — los dos errores a la vez, y ninguno visible.
 *
 * ── Por qué el costo se enseña en la misma pantalla ─────────────────────
 * Una receta sin su costo es una lista de ingredientes. Con el costo al lado, la
 * decisión de subir el precio o cambiar de proveedor se puede tomar aquí, que es
 * donde se tiene toda la información.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben ver, editar y costear la receta, con sus líneas por canal. Queda fuera
 * el escandallo de producción por lotes, que es de otro arquetipo.
 */

const RUTA_GUARDAR = '/api/inventario/recetas';
const RUTA_ELIMINAR = '/api/inventario/recetas/eliminar';

const CANTIDAD_CON_FORMA = /^\d{1,6}(?:[.,]\d{1,4})?$/;
const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** El empaque sólo se gasta cuando el pedido sale por la puerta. */
const CANALES = [
  { clave: 'ambos', etiqueta: 'Siempre' },
  { clave: 'aqui', etiqueta: 'Sólo aquí' },
  { clave: 'llevar', etiqueta: 'Sólo para llevar' },
] as const;

export interface ProductoConReceta {
  readonly id: string;
  readonly nombre: string;
  readonly familia: string;
  /**
   * EN PESOS, como lo sirve el puente.
   *
   * Aquí decía `precio_venta_centavos`, que la entidad NO sirve: lo expone como
   * `precio_venta`, ya convertido por `dinero`. Llegaba `undefined` y la pantalla
   * enseñaba `$NaN`.
   */
  readonly precio_venta: number | null;
}

/**
 * UNA LÍNEA DE RECETA, con los nombres que el puente SIRVE.
 *
 * `RecetaEscandallo` sirve `ingrediente_id`, `ingrediente_nombre`, `cantidad_usada`
 * y `costo_unitario_base_snapshot` —el costo CONGELADO al guardar la receta, que es
 * el que explica el margen de ese día—. Los cuatro llegaban `undefined`: el
 * escandallo enseñaba el nombre vacío y el costo de la receta salía `NaN`.
 *
 * `aplica_canal` no se sirve y no es un olvido: NO EXISTE la columna. El canal de
 * una línea de receta —«esto sólo va en el de 16 oz»— está declarado en la pantalla
 * y no en la base; hasta que exista, se trata como «ambos», que es lo que hoy hace
 * el cálculo del consumo al cobrar.
 */
export interface LineaDeReceta {
  readonly id: string;
  readonly ingrediente_id: string;
  readonly ingrediente_nombre: string | null;
  /**
   * La cantidad es un NÚMERO: el puente la sirve con `conversion: 'decimal'`.
   *
   * Declarada `string`, el costo de la receta hacía
   * `Number(linea.cantidad_usada.replace(',', '.'))` sobre un número y la pantalla
   * moría con `TypeError: …replace is not a function` en cuanto la receta tenía una
   * línea. Ni 500 ni `{ok:false}`: el servidor ni se enteraba.
   */
  readonly cantidad_usada: number;
  readonly unidad: string;
  /** El costo CONGELADO al guardar, en pesos. */
  readonly costo_unitario_base_snapshot: number | null;
  /** No se sirve: la columna no existe. Ver la cabecera. */
  readonly aplica_canal?: string;
}

export interface InsumoDisponible {
  readonly id: string;
  readonly nombre: string;
  readonly unidad_base: string;
  /** EN PESOS: la entidad `Ingrediente` sirve `costo_por_unidad_base`. */
  readonly costo_por_unidad_base: number | null;
}

export interface RecetasProps {
  readonly productosIniciales?: readonly ProductoConReceta[];
  readonly insumosIniciales?: readonly InsumoDisponible[];
}

function pesos(centavos: number): string {
  return PESOS.format(centavos / 100);
}

/**
 * El costo de la receta EN UN CANAL.
 *
 * Se pide el canal porque el empaque sólo entra cuando el pedido sale por la
 * puerta: un costo único mezclaría las dos y ninguno de los dos números serviría
 * para decidir el precio.
 */
export function costoEnCanal(lineas: readonly LineaDeReceta[], canal: 'aqui' | 'llevar'): number {
  let total = 0;
  for (const linea of lineas) {
    // Sin canal declarado, la línea entra en los dos: es lo que hace el consumo
    // al cobrar, y suponer lo contrario descontaría de menos.
    const aplica = linea.aplica_canal ?? 'ambos';
    if (aplica !== 'ambos' && aplica !== canal) continue;
    const cantidad = linea.cantidad_usada;
    if (!Number.isFinite(cantidad)) continue;
    total += Math.round(cantidad * Math.round((linea.costo_unitario_base_snapshot ?? 0) * 100));
  }
  return total;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo guardar la receta. Vuelve a intentarlo.';
}

export function Recetas({ productosIniciales, insumosIniciales }: RecetasProps) {
  const voc = useVocabulario();
  const [productos, setProductos] = useState<readonly ProductoConReceta[] | null>(
    productosIniciales ?? null,
  );
  const [insumos, setInsumos] = useState<readonly InsumoDisponible[] | null>(
    insumosIniciales ?? null,
  );
  const [elegido, setElegido] = useState<ProductoConReceta | null>(null);
  const [lineas, setLineas] = useState<readonly LineaDeReceta[] | null>(null);
  const [nueva, setNueva] = useState({ insumoId: '', cantidad: '', canal: 'ambos' });
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (productosIniciales !== undefined && insumosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      if (productosIniciales === undefined) {
        consultarPuente<ProductoConReceta>('ProductoTerminado', {
          limite: 200,
          signal: control.signal,
        })
          .then((filas) => {
            if (sigueMontada()) setProductos(filas);
          })
          .catch(() => {
            if (sigueMontada()) setProductos([]);
          });
      }
      if (insumosIniciales === undefined) {
        consultarPuente<InsumoDisponible>('Ingrediente', { limite: 200, signal: control.signal })
          .then((filas) => {
            if (sigueMontada()) setInsumos(filas);
          })
          .catch(() => {
            if (sigueMontada()) setInsumos([]);
          });
      }
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [productosIniciales, insumosIniciales]);

  function elegir(producto: ProductoConReceta): void {
    setElegido(producto);
    setLineas(null);
    setError(null);
    consultarPuente<LineaDeReceta>('RecetaEscandallo', {
      filtro: { producto_id: producto.id },
      limite: 60,
    })
      .then((filas) => {
        setLineas(filas);
      })
      .catch(() => {
        setLineas([]);
      });
  }

  function agregar(): void {
    if (elegido === null) return;
    const insumo = (insumos ?? []).find((i) => i.id === nueva.insumoId);
    if (insumo === undefined) {
      setError('Elige un insumo.');
      return;
    }
    if (!CANTIDAD_CON_FORMA.test(nueva.cantidad)) {
      setError('La cantidad va con hasta cuatro decimales.');
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando<LineaDeReceta>(RUTA_GUARDAR, {
      productoId: elegido.id,
      insumoId: insumo.id,
      cantidad: nueva.cantidad.replace(',', '.'),
      aplicaCanal: nueva.canal,
    })
      .then((creada) => {
        setLineas([...(lineas ?? []), creada]);
        setNueva({ insumoId: '', cantidad: '', canal: 'ambos' });
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function eliminar(linea: LineaDeReceta): void {
    setOcupado(true);
    invocarComando(RUTA_ELIMINAR, { recetaId: linea.id })
      .then(() => {
        setLineas((lineas ?? []).filter((l) => l.id !== linea.id));
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  if (productos === null || insumos === null) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const aqui = lineas === null ? 0 : costoEnCanal(lineas, 'aqui');
  const llevar = lineas === null ? 0 : costoEnCanal(lineas, 'llevar');

  return (
    <main className="mx-auto grid max-w-5xl gap-6 p-6 md:grid-cols-[18rem_1fr]">
      <section>
        <h1 className="mb-3 text-2xl font-semibold">Recetas</h1>
        <ul className="divide-y">
          {productos.map((producto) => (
            <li key={producto.id}>
              <button
                type="button"
                className={`w-full py-2 text-left ${
                  elegido?.id === producto.id ? 'font-medium' : ''
                }`}
                onClick={() => {
                  elegir(producto);
                }}
              >
                {producto.nombre}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        {error !== null && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        {elegido === null && (
          <p className="text-muted-foreground">
            Elige {voc.enFraseCon('un', 'linea_orden')} para ver qué lleva.
          </p>
        )}

        {elegido !== null && (
          <>
            <div>
              <h2 className="text-xl font-medium">{elegido.nombre}</h2>
              <p className="text-muted-foreground text-sm">
                Se vende a {pesos(Math.round((elegido.precio_venta ?? 0) * 100))}
              </p>
            </div>

            {lineas === null && <Skeleton className="h-32 w-full" />}

            {lineas !== null && (
              <>
                <ul className="divide-y">
                  {lineas.map((linea) => (
                    <li key={linea.id} className="flex items-center gap-3 py-2">
                      <span className="flex-1">{linea.ingrediente_nombre}</span>
                      <span className="tabular-nums">
                        {String(linea.cantidad_usada)} {linea.unidad}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {CANALES.find((c) => c.clave === linea.aplica_canal)?.etiqueta ??
                          linea.aplica_canal ??
                          'ambos'}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ocupado}
                        onClick={() => {
                          eliminar(linea);
                        }}
                      >
                        Quitar
                      </Button>
                    </li>
                  ))}
                </ul>

                <Separator />

                <div className="flex gap-8">
                  <div>
                    <p className="text-muted-foreground text-sm">Aquí cuesta</p>
                    <p className="text-xl font-semibold tabular-nums">{pesos(aqui)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Para llevar cuesta</p>
                    <p className="text-xl font-semibold tabular-nums">{pesos(llevar)}</p>
                  </div>
                </div>
                <p className="text-muted-foreground text-sm">
                  La diferencia es el empaque. Cargarlo siempre infla el de mesa; no cargarlo nunca
                  regala cinco pesos por bebida.
                </p>

                <Separator />

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="insumo">Insumo</Label>
                    <select
                      id="insumo"
                      className="border-input h-[calc(var(--altura-control)*1.2)] w-full rounded-md border px-3"
                      value={nueva.insumoId}
                      onChange={(evento) => {
                        setNueva({ ...nueva, insumoId: evento.target.value });
                      }}
                    >
                      <option value="">Elige…</option>
                      {insumos.map((insumo) => (
                        <option key={insumo.id} value={insumo.id}>
                          {insumo.nombre} ({insumo.unidad_base})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="cantidad">Cantidad</Label>
                    <Input
                      id="cantidad"
                      inputMode="decimal"
                      className="h-[calc(var(--altura-control)*1.2)] text-right"
                      value={nueva.cantidad}
                      onChange={(evento) => {
                        setNueva({ ...nueva, cantidad: evento.target.value });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="canal">Cuándo</Label>
                    <select
                      id="canal"
                      className="border-input h-[calc(var(--altura-control)*1.2)] w-full rounded-md border px-3"
                      value={nueva.canal}
                      onChange={(evento) => {
                        setNueva({ ...nueva, canal: evento.target.value });
                      }}
                    >
                      {CANALES.map((canal) => (
                        <option key={canal.clave} value={canal.clave}>
                          {canal.etiqueta}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <Button variant="outline" disabled={ocupado} onClick={agregar}>
                  Agregar a la receta
                </Button>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
