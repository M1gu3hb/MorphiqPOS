'use client';

import { Boxes, PackagePlus, Search, SlidersHorizontal } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@morphiqpos/ui/primitivas/dialog';
import { Input } from '@morphiqpos/ui/primitivas/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';

import { ProductoFormulario } from './ProductoFormulario';
import { ProductoTarjeta } from './ProductoTarjeta';
import { coincideBusqueda, type ProductoVista } from './presentacion';

export function ProductosPantalla({ iniciales }: { readonly iniciales: readonly ProductoVista[] }) {
  const [productos, setProductos] = useState([...iniciales]);
  const [busqueda, setBusqueda] = useState('');
  const busquedaDiferida = useDeferredValue(busqueda);
  const [categoria, setCategoria] = useState('todas');
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [edicion, setEdicion] = useState<ProductoVista | null>(null);

  const categorias = useMemo(
    () => [...new Set(productos.map((producto) => producto.categoria))].sort(),
    [productos],
  );
  const visibles = useMemo(() => {
    const termino = busquedaDiferida.trim().toLocaleLowerCase('es-MX');
    return productos.filter((producto) => {
      const coincideCategoria = categoria === 'todas' || producto.categoria === categoria;
      const texto = `${producto.nombre} ${producto.sku} ${producto.codigoBarras}`.toLocaleLowerCase(
        'es-MX',
      );
      return coincideCategoria && coincideBusqueda(texto, termino);
    });
  }, [busquedaDiferida, categoria, productos]);

  function abrirAlta() {
    setEdicion(null);
    setDialogoAbierto(true);
  }

  function abrirEdicion(producto: ProductoVista) {
    setEdicion(producto);
    setDialogoAbierto(true);
  }

  function guardar(producto: ProductoVista) {
    setProductos((actuales) => {
      const existe = actuales.some(({ id }) => id === producto.id);
      return existe
        ? actuales.map((actual) => (actual.id === producto.id ? producto : actual))
        : [producto, ...actuales];
    });
    setDialogoAbierto(false);
    toast.success(edicion === null ? 'Producto agregado al catálogo' : 'Producto actualizado');
  }

  return (
    <div className="mx-auto grid w-full max-w-[92rem] gap-8 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-primario">
            <Boxes aria-hidden="true" className="size-4" /> Catálogo
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Productos</h1>
          <p className="max-w-2xl text-texto-sutil">
            Precios, presentaciones y códigos listos para vender desde cualquier terminal.
          </p>
        </div>
        <Button size="lg" onClick={abrirAlta}>
          <PackagePlus aria-hidden="true" /> Nuevo producto
        </Button>
      </header>

      <section
        aria-label="Filtros de productos"
        className="grid gap-3 rounded-xl border bg-superficie p-3 shadow-1 sm:grid-cols-[1fr_16rem_auto]"
      >
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-sutil"
          />
          <Input
            value={busqueda}
            onChange={(evento) => {
              setBusqueda(evento.target.value);
            }}
            className="pl-9"
            type="search"
            placeholder="Nombre, SKU o código de barras"
            aria-label="Buscar productos"
          />
        </div>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-full" aria-label="Filtrar por categoría">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorías</SelectItem>
            {categorias.map((nombre) => (
              <SelectItem key={nombre} value={nombre}>
                {nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" aria-label="Más filtros">
          <SlidersHorizontal aria-hidden="true" /> Filtros
        </Button>
      </section>

      <div
        className="flex items-center justify-between text-sm text-texto-sutil"
        aria-live="polite"
      >
        <p>
          <strong className="text-texto">{visibles.length}</strong>{' '}
          {visibles.length === 1 ? 'producto' : 'productos'}
        </p>
        <p>Ordenados por actualización</p>
      </div>

      {visibles.length === 0 ? (
        <div className="grid min-h-72 place-items-center rounded-xl border border-dashed bg-superficie p-8 text-center">
          <div className="grid max-w-sm gap-3">
            <Boxes
              aria-hidden="true"
              className="mx-auto size-[var(--altura-control)] text-texto-tenue"
            />
            <h2 className="text-lg font-semibold">No encontramos productos</h2>
            <p className="text-sm text-texto-sutil">
              Revisa la búsqueda o da de alta la primera presentación de esta categoría.
            </p>
            <Button className="mx-auto" onClick={abrirAlta}>
              Nuevo producto
            </Button>
          </div>
        </div>
      ) : (
        <section
          aria-label="Listado de productos"
          className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        >
          {visibles.map((producto) => (
            <ProductoTarjeta
              key={producto.id}
              producto={producto}
              alEditar={() => {
                abrirEdicion(producto);
              }}
            />
          ))}
        </section>
      )}

      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {edicion === null ? 'Nuevo producto' : `Editar ${edicion.nombre}`}
            </DialogTitle>
            <DialogDescription>
              El servidor vuelve a validar importes, permisos y organización al guardar.
            </DialogDescription>
          </DialogHeader>
          <ProductoFormulario
            key={edicion?.id ?? 'alta'}
            producto={edicion}
            alCancelar={() => {
              setDialogoAbierto(false);
            }}
            alGuardar={guardar}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
