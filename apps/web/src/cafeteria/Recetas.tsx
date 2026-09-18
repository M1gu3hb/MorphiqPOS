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
  readonly precio_venta_centavos: number;
}

export interface LineaDeReceta {
  readonly id: string;
  readonly insumo_id: string;
  readonly insumo: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly costo_unitario_centavos: number;
  readonly aplica_canal: string;
}

export interface InsumoDisponible {
  readonly id: string;
  readonly nombre: string;
  readonly unidad_base: string;
  readonly costo_unitario_centavos: number;
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
    if (linea.aplica_canal !== 'ambos' && linea.aplica_canal !== canal) continue;
    const cantidad = Number(linea.cantidad.replace(',', '.'));
    if (!Number.isFinite(cantidad)) continue;
    total += Math.round(cantidad * linea.costo_unitario_centavos);
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
                Se vende a {pesos(elegido.precio_venta_centavos)}
              </p>
            </div>

            {lineas === null && <Skeleton className="h-32 w-full" />}

            {lineas !== null && (
              <>
                <ul className="divide-y">
                  {lineas.map((linea) => (
                    <li key={linea.id} className="flex items-center gap-3 py-2">
                      <span className="flex-1">{linea.insumo}</span>
                      <span className="tabular-nums">
                        {linea.cantidad} {linea.unidad}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {CANALES.find((c) => c.clave === linea.aplica_canal)?.etiqueta ??
                          linea.aplica_canal}
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
