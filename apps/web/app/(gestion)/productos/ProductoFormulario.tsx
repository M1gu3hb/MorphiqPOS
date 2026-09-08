'use client';

import { ImagePlus, PackagePlus } from 'lucide-react';
import { useState, type ReactNode, type SyntheticEvent } from 'react';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import { Switch } from '@morphiqpos/ui/primitivas/switch';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';

import { centavosDesdePesos, type ProductoVista, type TipoVentaVista } from './presentacion';

interface Props {
  readonly producto: ProductoVista | null;
  readonly alCancelar: () => void;
  readonly alGuardar: (producto: ProductoVista) => void;
}

const TIPOS: readonly { id: TipoVentaVista; nombre: string }[] = [
  { id: 'precio_fijo', nombre: 'Precio fijo' },
  { id: 'variable_medida', nombre: 'Peso o medida' },
  { id: 'porcion_contenedor', nombre: 'Porción de contenedor' },
  { id: 'servicio', nombre: 'Servicio' },
];

function pesosParaCampo(centavos: string): string {
  const valor = BigInt(centavos || '0');
  return `${valor / 100n}.${(valor % 100n).toString().padStart(2, '0')}`;
}

function texto(datos: FormData, campo: string): string {
  const valor = datos.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
}

export function ProductoFormulario({ producto, alCancelar, alGuardar }: Props) {
  const [tipoVenta, setTipoVenta] = useState<TipoVentaVista>(producto?.tipoVenta ?? 'precio_fijo');
  const [mayoreo, setMayoreo] = useState((producto?.precioMayoreoCentavos ?? '') !== '');
  const [visible, setVisible] = useState(producto?.visibleEnPos ?? true);

  function guardar(evento: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    alGuardar({
      id: producto?.id ?? crypto.randomUUID(),
      nombre: texto(datos, 'nombre'),
      descripcion: texto(datos, 'descripcion'),
      imagenUrl: texto(datos, 'imagenUrl'),
      categoria: texto(datos, 'categoria'),
      marca: texto(datos, 'marca'),
      sku: texto(datos, 'sku'),
      codigoBarras: texto(datos, 'codigoBarras'),
      precioVentaCentavos: centavosDesdePesos(texto(datos, 'precioVenta')),
      costoUnitarioCentavos: centavosDesdePesos(texto(datos, 'costoUnitario')),
      precioMayoreoCentavos: mayoreo ? centavosDesdePesos(texto(datos, 'precioMayoreo')) : '',
      cantidadMinimaMayoreo: mayoreo ? texto(datos, 'cantidadMinimaMayoreo') : '',
      tipoVenta,
      visibleEnPos: visible,
    });
  }

  return (
    <form className="grid gap-6" onSubmit={guardar}>
      <div className="grid gap-5 md:grid-cols-[1fr_15rem]">
        <div className="grid gap-4">
          <Campo id="nombre" etiqueta="Nombre del producto">
            <Input
              id="nombre"
              name="nombre"
              defaultValue={producto?.nombre}
              placeholder="Taladro percutor 1/2 pulgada"
              required
              maxLength={160}
              autoFocus
            />
          </Campo>
          <Campo id="descripcion" etiqueta="Descripción">
            <Textarea
              id="descripcion"
              name="descripcion"
              defaultValue={producto?.descripcion}
              placeholder="Características que ayudan a reconocerlo"
              maxLength={500}
            />
          </Campo>
        </div>

        <div className="grid content-start gap-3 rounded-lg border border-dashed bg-fondo-sutil p-4">
          <div className="grid min-h-24 place-items-center rounded-md bg-superficie text-texto-sutil">
            <ImagePlus aria-hidden="true" className="size-[calc(var(--altura-control)*0.8)]" />
          </div>
          <Campo id="imagenUrl" etiqueta="URL de imagen">
            <Input
              id="imagenUrl"
              name="imagenUrl"
              type="url"
              defaultValue={producto?.imagenUrl}
              placeholder="https://…"
            />
          </Campo>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Campo id="categoria" etiqueta="Categoría">
          <Input
            id="categoria"
            name="categoria"
            defaultValue={producto?.categoria}
            placeholder="Herramienta eléctrica"
            required
          />
        </Campo>
        <Campo id="marca" etiqueta="Marca">
          <Input id="marca" name="marca" defaultValue={producto?.marca} placeholder="Truper" />
        </Campo>
        <div className="grid gap-2">
          <Label htmlFor="tipoVenta">Tipo de venta</Label>
          <Select
            value={tipoVenta}
            onValueChange={(valor) => {
              setTipoVenta(valor as TipoVentaVista);
            }}
          >
            <SelectTrigger id="tipoVenta" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((tipo) => (
                <SelectItem key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Campo id="sku" etiqueta="SKU">
          <Input id="sku" name="sku" defaultValue={producto?.sku} placeholder="TAL-PER-012" />
        </Campo>
        <Campo id="codigoBarras" etiqueta="Código de barras">
          <Input
            id="codigoBarras"
            name="codigoBarras"
            inputMode="numeric"
            defaultValue={producto?.codigoBarras}
            placeholder="7501234567890"
          />
        </Campo>
      </div>

      <fieldset className="grid gap-4 rounded-lg border p-4">
        <legend className="px-2 text-sm font-semibold">Precios</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo id="precioVenta" etiqueta="Precio de venta">
            <Input
              id="precioVenta"
              name="precioVenta"
              inputMode="decimal"
              defaultValue={pesosParaCampo(producto?.precioVentaCentavos ?? '0')}
              required
            />
          </Campo>
          <Campo id="costoUnitario" etiqueta="Costo unitario">
            <Input
              id="costoUnitario"
              name="costoUnitario"
              inputMode="decimal"
              defaultValue={pesosParaCampo(producto?.costoUnitarioCentavos ?? '0')}
              required
            />
          </Campo>
          <div className="flex items-end gap-3 pb-2 sm:col-span-2">
            <Switch id="mayoreo" checked={mayoreo} onCheckedChange={setMayoreo} />
            <Label htmlFor="mayoreo">Maneja precio de mayoreo</Label>
          </div>
          {mayoreo && (
            <>
              <Campo id="precioMayoreo" etiqueta="Precio de mayoreo">
                <Input
                  id="precioMayoreo"
                  name="precioMayoreo"
                  inputMode="decimal"
                  defaultValue={pesosParaCampo(producto?.precioMayoreoCentavos ?? '0')}
                  required
                />
              </Campo>
              <Campo id="cantidadMinimaMayoreo" etiqueta="Desde cuántas unidades">
                <Input
                  id="cantidadMinimaMayoreo"
                  name="cantidadMinimaMayoreo"
                  inputMode="decimal"
                  defaultValue={producto?.cantidadMinimaMayoreo}
                  required
                />
              </Campo>
            </>
          )}
        </div>
      </fieldset>

      <div className="flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-3">
          <Switch id="visible" checked={visible} onCheckedChange={setVisible} />
          <Label htmlFor="visible">Visible en el punto de venta</Label>
        </div>
        <Button type="button" variant="outline" onClick={alCancelar}>
          Cancelar
        </Button>
        <Button type="submit">
          <PackagePlus aria-hidden="true" />
          {producto === null ? 'Dar de alta' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}

function Campo({ id, etiqueta, children }: { id: string; etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
    </div>
  );
}
