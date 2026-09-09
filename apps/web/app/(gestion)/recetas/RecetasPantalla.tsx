'use client';

import { CookingPot, RefreshCcw } from 'lucide-react';
import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Card, CardContent, CardHeader, CardTitle } from '@morphiqpos/ui/primitivas/card';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';

import { ejecutarApi, obtenerApi } from '../../../src/cliente/api';
import { pesosDesdeCentavos } from '../productos/presentacion';

interface Producto {
  readonly id: string;
  readonly nombre: string;
  readonly precioCentavos: string;
  readonly costoCentavos: string;
  readonly utilidadCentavos: string;
  readonly margenBp: string;
}
interface Insumo {
  readonly id: string;
  readonly nombre: string;
  readonly unidad: string;
  readonly costoUnitarioCentavos: string;
}
interface Renglon {
  readonly productoId: string;
  readonly insumoId: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly mermaBp: number;
}
interface RecetasApi {
  readonly productos: readonly Producto[];
  readonly insumos: readonly Insumo[];
  readonly recetas: readonly Renglon[];
}
const VACIO: RecetasApi = { productos: [], insumos: [], recetas: [] };

export function RecetasPantalla() {
  const [datos, setDatos] = useState<RecetasApi>(VACIO);
  const [productoId, setProductoId] = useState('');
  async function cargar() {
    const nuevos = await obtenerApi<RecetasApi>('/api/inventario/recetas');
    setDatos(nuevos);
    setProductoId((actual) => (actual === '' ? (nuevos.productos[0]?.id ?? '') : actual));
  }
  useEffect(() => {
    void obtenerApi<RecetasApi>('/api/inventario/recetas')
      .then((nuevos) => {
        setDatos(nuevos);
        setProductoId(nuevos.productos[0]?.id ?? '');
      })
      .catch(mostrarError);
  }, []);
  const actuales = useMemo(
    () =>
      new Map(datos.recetas.filter((r) => r.productoId === productoId).map((r) => [r.insumoId, r])),
    [datos.recetas, productoId],
  );

  async function guardar(evento: SyntheticEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    const ingredientes = datos.insumos.flatMap((insumo) => {
      const cantidad = campo(form, `cantidad-${insumo.id}`);
      if (cantidad === '' || cantidad === '0') return [];
      return [
        {
          insumoId: insumo.id,
          cantidad,
          unidad: insumo.unidad,
          mermaBp: Number(campo(form, `merma-${insumo.id}`) || '0'),
        },
      ];
    });
    await ejecutarApi('/api/inventario/recetas', { productoId, ingredientes });
    await cargar();
    toast.success('Receta guardada y rentabilidad recalculada');
  }

  async function cambiarCosto(evento: SyntheticEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    const salida = await ejecutarApi<{ productosRecalculados: number }>(
      '/api/inventario/insumos/costo',
      { insumoId: campo(form, 'insumoId'), costoUnitario: campo(form, 'costo') },
    );
    await cargar();
    toast.success(`${salida.productosRecalculados} productos recalculados`);
  }

  return (
    <div className="mx-auto grid w-full max-w-[92rem] gap-8 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <header className="grid gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-primario">
          <CookingPot className="size-4" /> Producción
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Recetas y costos
        </h1>
        <p className="text-texto-sutil">
          El costo del producto se suma desde sus insumos; utilidad y margen cambian
          automáticamente.
        </p>
      </header>
      <section className="grid items-start gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <Card>
          <CardHeader>
            <CardTitle>Ingredientes por producto</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-5"
              onSubmit={(e) => {
                void guardar(e).catch(mostrarError);
              }}
            >
              <Campo id="productoId" etiqueta="Producto">
                <select
                  id="productoId"
                  value={productoId}
                  onChange={(e) => {
                    setProductoId(e.target.value);
                  }}
                  className="h-[var(--altura-control)] rounded-md border bg-superficie px-3"
                >
                  {datos.productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <div className="grid gap-3">
                {datos.insumos.map((insumo) => {
                  const renglon = actuales.get(insumo.id);
                  return (
                    <div
                      key={`${productoId}-${insumo.id}`}
                      className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_9rem_7rem]"
                    >
                      <div>
                        <p className="font-medium">{insumo.nombre}</p>
                        <p className="text-xs text-texto-sutil">
                          {pesosDesdeCentavos(insumo.costoUnitarioCentavos)} / {insumo.unidad}
                        </p>
                      </div>
                      <Campo id={`cantidad-${insumo.id}`} etiqueta={`Cantidad (${insumo.unidad})`}>
                        <Input
                          id={`cantidad-${insumo.id}`}
                          name={`cantidad-${insumo.id}`}
                          inputMode="decimal"
                          defaultValue={renglon?.cantidad ?? '0'}
                        />
                      </Campo>
                      <Campo id={`merma-${insumo.id}`} etiqueta="Merma bp">
                        <Input
                          id={`merma-${insumo.id}`}
                          name={`merma-${insumo.id}`}
                          inputMode="numeric"
                          defaultValue={renglon?.mermaBp ?? 0}
                        />
                      </Campo>
                    </div>
                  );
                })}
              </div>
              <Button type="submit" disabled={productoId === ''}>
                Guardar receta
              </Button>
            </form>
          </CardContent>
        </Card>
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCcw /> Actualizar costo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  void cambiarCosto(e).catch(mostrarError);
                }}
              >
                <Campo id="costo-insumo" etiqueta="Insumo">
                  <select
                    id="costo-insumo"
                    name="insumoId"
                    className="h-[var(--altura-control)] rounded-md border bg-superficie px-3"
                  >
                    {datos.insumos.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nombre}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo id="nuevo-costo" etiqueta="Costo por unidad">
                  <Input id="nuevo-costo" name="costo" required inputMode="decimal" />
                </Campo>
                <Button type="submit">Actualizar y recalcular</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Rentabilidad actual</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {datos.productos.map((p) => (
                <div key={p.id} className="rounded-lg border p-3">
                  <p className="font-medium">{p.nombre}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-texto-sutil">
                    <span>
                      Costo
                      <br />
                      <strong className="text-texto">{pesosDesdeCentavos(p.costoCentavos)}</strong>
                    </span>
                    <span>
                      Utilidad
                      <br />
                      <strong className="text-texto">
                        {pesosDesdeCentavos(p.utilidadCentavos)}
                      </strong>
                    </span>
                    <span>
                      Margen
                      <br />
                      <strong className="text-texto">{formatearMargen(p.margenBp)}</strong>
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function Campo({
  id,
  etiqueta,
  children,
}: {
  readonly id: string;
  readonly etiqueta: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
    </div>
  );
}
function campo(datos: FormData, nombre: string): string {
  const valor = datos.get(nombre);
  return typeof valor === 'string' ? valor.trim() : '';
}
function formatearMargen(bp: string): string {
  const valor = BigInt(bp);
  return `${valor / 100n}.${((valor < 0n ? -valor : valor) % 100n).toString().padStart(2, '0')}%`;
}
function mostrarError(error: unknown): void {
  toast.error(error instanceof Error ? error.message : 'No se pudo completar la operación');
}
