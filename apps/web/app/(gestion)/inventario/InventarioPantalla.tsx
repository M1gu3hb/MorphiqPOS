'use client';

import { Boxes, PackagePlus, RefreshCcw, Warehouse } from 'lucide-react';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Card, CardContent, CardHeader, CardTitle } from '@morphiqpos/ui/primitivas/card';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';

import { ejecutarApi, obtenerApi } from '../../../src/cliente/api';
import { pesosDesdeCentavos } from '../productos/presentacion';

interface Almacen {
  readonly id: string;
  readonly nombre: string;
  readonly principal: boolean;
}
interface Insumo {
  readonly id: string;
  readonly nombre: string;
  readonly unidad: string;
  readonly costoUnitarioCentavos: string;
  readonly stockMinimo: string;
  readonly cantidad: string;
  readonly almacenId: string | null;
  readonly almacenNombre: string | null;
}
interface InventarioApi {
  readonly almacenes: readonly Almacen[];
  readonly insumos: readonly Insumo[];
}
const VACIO: InventarioApi = { almacenes: [], insumos: [] };

export function InventarioPantalla() {
  const [datos, setDatos] = useState<InventarioApi>(VACIO);
  const [modo, setModo] = useState<'inicial' | 'ajuste'>('inicial');
  async function cargar() {
    setDatos(await obtenerApi<InventarioApi>('/api/inventario/resumen'));
  }
  useEffect(() => {
    void obtenerApi<InventarioApi>('/api/inventario/resumen').then(setDatos).catch(mostrarError);
  }, []);

  async function crearAlmacen(evento: SyntheticEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const form = new FormData(formulario);
    await ejecutarApi('/api/inventario/almacenes/crear', { nombre: campo(form, 'nombre') });
    formulario.reset();
    await cargar();
    toast.success('Almacén creado');
  }
  async function crearInsumo(evento: SyntheticEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const form = new FormData(formulario);
    await ejecutarApi('/api/inventario/insumos/crear', {
      nombre: campo(form, 'nombre'),
      unidad: campo(form, 'unidad'),
      costoUnitario: campo(form, 'costo'),
      stockMinimo: campo(form, 'minimo'),
    });
    formulario.reset();
    await cargar();
    toast.success('Insumo creado');
  }
  async function mover(evento: SyntheticEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const form = new FormData(formulario);
    const base = {
      almacenId: campo(form, 'almacenId'),
      insumoId: campo(form, 'insumoId'),
      cantidad: campo(form, 'cantidad'),
    };
    if (modo === 'inicial') await ejecutarApi('/api/inventario/inicial', base);
    else await ejecutarApi('/api/inventario/ajustar', { ...base, motivo: campo(form, 'motivo') });
    formulario.reset();
    await cargar();
    toast.success(modo === 'inicial' ? 'Inventario inicial registrado' : 'Ajuste registrado');
  }

  return (
    <div className="mx-auto grid w-full max-w-[92rem] gap-8 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <header className="grid gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-primario">
          <Boxes className="size-4" /> Existencias
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Insumos y almacenes
        </h1>
        <p className="text-texto-sutil">
          Cada entrada y ajuste deja un movimiento; los saldos nunca se sobrescriben.
        </p>
      </header>
      <section className="grid items-start gap-6 xl:grid-cols-3">
        <Formulario titulo="Nuevo almacén" icono={<Warehouse />} alEnviar={crearAlmacen}>
          <Campo id="almacen-nombre" etiqueta="Nombre">
            <Input id="almacen-nombre" name="nombre" required minLength={2} />
          </Campo>
          <Button type="submit">Crear almacén</Button>
        </Formulario>
        <Formulario titulo="Nuevo insumo" icono={<PackagePlus />} alEnviar={crearInsumo}>
          <Campo id="insumo-nombre" etiqueta="Nombre">
            <Input id="insumo-nombre" name="nombre" required />
          </Campo>
          <Campo id="unidad" etiqueta="Unidad">
            <select
              id="unidad"
              name="unidad"
              className="h-[var(--altura-control)] rounded-md border bg-superficie px-3"
            >
              <option value="pieza">Pieza</option>
              <option value="g">Gramo</option>
              <option value="kg">Kilogramo</option>
              <option value="ml">Mililitro</option>
              <option value="l">Litro</option>
              <option value="m">Metro</option>
            </select>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo id="costo" etiqueta="Costo">
              <Input id="costo" name="costo" inputMode="decimal" defaultValue="0.00" required />
            </Campo>
            <Campo id="minimo" etiqueta="Mínimo">
              <Input id="minimo" name="minimo" inputMode="decimal" defaultValue="0" required />
            </Campo>
          </div>
          <Button type="submit">Crear insumo</Button>
        </Formulario>
        <Formulario titulo="Movimiento de stock" icono={<RefreshCcw />} alEnviar={mover}>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={modo === 'inicial' ? 'default' : 'outline'}
              onClick={() => {
                setModo('inicial');
              }}
            >
              Inicial
            </Button>
            <Button
              type="button"
              variant={modo === 'ajuste' ? 'default' : 'outline'}
              onClick={() => {
                setModo('ajuste');
              }}
            >
              Ajuste
            </Button>
          </div>
          <Campo id="almacenId" etiqueta="Almacén">
            <select
              id="almacenId"
              name="almacenId"
              required
              className="h-[var(--altura-control)] rounded-md border bg-superficie px-3"
            >
              {datos.almacenes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="insumoId" etiqueta="Insumo">
            <select
              id="insumoId"
              name="insumoId"
              required
              className="h-[var(--altura-control)] rounded-md border bg-superficie px-3"
            >
              {datos.insumos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            id="cantidad"
            etiqueta={modo === 'inicial' ? 'Cantidad de entrada' : 'Diferencia (+ / −)'}
          >
            <Input id="cantidad" name="cantidad" required inputMode="decimal" />
          </Campo>
          {modo === 'ajuste' ? (
            <Campo id="motivo" etiqueta="Motivo">
              <Input id="motivo" name="motivo" required minLength={4} />
            </Campo>
          ) : null}
          <Button type="submit">Registrar movimiento</Button>
        </Formulario>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Existencias actuales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {datos.insumos.map((i) => (
            <div
              key={`${i.id}-${i.almacenId ?? 'sin'}`}
              className="grid gap-1 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6"
            >
              <div>
                <p className="font-medium">{i.nombre}</p>
                <p className="text-xs text-texto-sutil">
                  {i.almacenNombre ?? 'Sin inventariar'} · mín. {i.stockMinimo}
                </p>
              </div>
              <span className="numeros">
                {i.cantidad} {i.unidad}
              </span>
              <span className="text-sm text-texto-sutil">
                {pesosDesdeCentavos(i.costoUnitarioCentavos)} / {i.unidad}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Formulario({
  titulo,
  icono,
  alEnviar,
  children,
}: {
  readonly titulo: string;
  readonly icono: React.ReactNode;
  readonly alEnviar: (e: SyntheticEvent<HTMLFormElement>) => Promise<void>;
  readonly children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icono}
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            void alEnviar(e).catch(mostrarError);
          }}
        >
          {children}
        </form>
      </CardContent>
    </Card>
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
function mostrarError(error: unknown): void {
  toast.error(error instanceof Error ? error.message : 'No se pudo completar la operación');
}
