import { Barcode, EyeOff, ImageIcon, PencilLine, Tag } from 'lucide-react';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';

import { etiquetaTipoVenta, pesosDesdeCentavos, type ProductoVista } from './presentacion';

export function ProductoTarjeta({
  producto,
  alEditar,
}: {
  readonly producto: ProductoVista;
  readonly alEditar: () => void;
}) {
  return (
    <article className="group overflow-hidden rounded-xl border bg-superficie shadow-1 transition hover:-translate-y-0.5 hover:shadow-2">
      <div className="relative grid aspect-[16/8] place-items-center bg-fondo-sutil text-texto-tenue">
        {producto.imagenUrl === '' ? (
          <ImageIcon aria-hidden="true" className="size-[var(--altura-control)]" />
        ) : (
          <div
            role="img"
            aria-label={`Imagen de ${producto.nombre}`}
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url("${producto.imagenUrl}")` }}
          />
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge variant="secondary">{producto.categoria}</Badge>
          {!producto.visibleEnPos && (
            <Badge variant="outline">
              <EyeOff aria-hidden="true" /> Oculto
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 p-5">
        <div className="grid gap-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="line-clamp-2 font-semibold leading-snug">{producto.nombre}</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar ${producto.nombre}`}
              onClick={alEditar}
            >
              <PencilLine aria-hidden="true" />
            </Button>
          </div>
          <p className="line-clamp-2 min-h-[var(--altura-control)] text-sm text-texto-sutil">
            {producto.descripcion}
          </p>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="numeros text-2xl font-bold tracking-tight">
              {pesosDesdeCentavos(producto.precioVentaCentavos)}
            </p>
            {producto.precioMayoreoCentavos !== '' && (
              <p className="numeros text-xs text-texto-sutil">
                {pesosDesdeCentavos(producto.precioMayoreoCentavos)} desde{' '}
                {producto.cantidadMinimaMayoreo}
              </p>
            )}
          </div>
          <Badge variant="outline">{etiquetaTipoVenta(producto.tipoVenta)}</Badge>
        </div>

        <dl className="grid gap-2 border-t pt-4 text-xs text-texto-sutil">
          <div className="flex items-center gap-2">
            <Tag aria-hidden="true" className="size-3.5" />
            <dt className="sr-only">SKU</dt>
            <dd>{producto.sku || 'Sin SKU'}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Barcode aria-hidden="true" className="size-3.5" />
            <dt className="sr-only">Código de barras</dt>
            <dd className="numeros">{producto.codigoBarras || 'Sin código de barras'}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
