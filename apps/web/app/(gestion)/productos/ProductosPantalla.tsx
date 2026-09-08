'use client';

import { Boxes, PackagePlus, Search, SlidersHorizontal } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
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

import { ejecutarApi, obtenerApi } from '../../../src/cliente/api';
import { ProductoFormulario } from './ProductoFormulario';
import { ProductoTarjeta } from './ProductoTarjeta';
import {
  coincideBusqueda,
  pesosSinSimboloDesdeCentavos,
  productoDesdeApi,
  type ProductoDesdeApi,
  type ProductoVista,
} from './presentacion';

interface PaginaProductosApi {
  readonly productos: readonly ProductoDesdeApi[];
}
interface CategoriaApi {
  readonly id: string;
  readonly nombre: string;
}

export function ProductosPantalla() {
  const [productos, setProductos] = useState<ProductoVista[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const busquedaDiferida = useDeferredValue(busqueda);
  const [categoria, setCategoria] = useState('todas');
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [edicion, setEdicion] = useState<ProductoVista | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;
    void cargarProductos(busquedaDiferida).then((pagina) => {
      if (!vigente) return;
      if (pagina instanceof Error) toast.error(pagina.message);
      else setProductos(pagina.productos.map(productoDesdeApi));
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, [busquedaDiferida]);

  const categorias = useMemo(
    () => [...new Set(productos.map((p) => p.categoria))].sort(),
    [productos],
  );
  const visibles = useMemo(
    () =>
      productos.filter((producto) => {
        const coincideCategoria = categoria === 'todas' || producto.categoria === categoria;
        return (
          coincideCategoria &&
          coincideBusqueda(
            `${producto.nombre} ${producto.sku} ${producto.codigoBarras}`,
            busquedaDiferida,
          )
        );
      }),
    [busquedaDiferida, categoria, productos],
  );

  async function guardar(producto: ProductoVista): Promise<void> {
    try {
      if (edicion === null) await crear(producto);
      else await editar(producto);
      const pagina = await cargarProductos('');
      if (pagina instanceof Error) throw pagina;
      setProductos(pagina.productos.map(productoDesdeApi));
      setDialogoAbierto(false);
      toast.success(edicion === null ? 'Producto agregado al catálogo' : 'Producto actualizado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el producto');
    }
  }

  async function resolverCategoriaId(nombre: string): Promise<string | undefined> {
    const respuesta = await obtenerApi<{ categorias: readonly CategoriaApi[] }>(
      '/api/catalogo/categorias',
    );
    return respuesta.categorias.find(
      (item) => item.nombre.toLocaleLowerCase('es-MX') === nombre.toLocaleLowerCase('es-MX'),
    )?.id;
  }

  async function crear(producto: ProductoVista): Promise<void> {
    if (producto.tipoVenta === 'variable_medida' || producto.tipoVenta === 'porcion_contenedor') {
      throw new Error('Crea primero el insumo y su receta para este tipo de venta.');
    }
    const categoriaId = await resolverCategoriaId(producto.categoria);
    await ejecutarApi('/api/catalogo/productos/crear', {
      nombre: producto.nombre,
      ...(producto.descripcion === '' ? {} : { descripcion: producto.descripcion }),
      ...(producto.imagenUrl === '' ? {} : { imagenUrl: producto.imagenUrl }),
      ...(categoriaId === undefined ? {} : { categoriaId }),
      ...(producto.marca === '' ? {} : { marca: producto.marca }),
      ...(producto.sku === '' ? {} : { sku: producto.sku }),
      ...(producto.codigoBarras === '' ? {} : { codigoBarras: producto.codigoBarras }),
      precioVenta: pesosSinSimboloDesdeCentavos(producto.precioVentaCentavos),
      costoUnitario: pesosSinSimboloDesdeCentavos(producto.costoUnitarioCentavos),
      ...(producto.precioMayoreoCentavos === ''
        ? {}
        : {
            precioMayoreo: pesosSinSimboloDesdeCentavos(producto.precioMayoreoCentavos),
            cantidadMinimaMayoreo: producto.cantidadMinimaMayoreo,
          }),
      tipoVenta: producto.tipoVenta,
      unidadVenta: 'pieza',
      estrategiaConsumo: producto.tipoVenta === 'servicio' ? 'ninguno' : 'sku',
      permiteVentaSinStock: false,
      stockMinimo: '0',
      visibleEnPos: producto.visibleEnPos,
    });
  }

  async function editar(producto: ProductoVista): Promise<void> {
    const categoriaId = await resolverCategoriaId(producto.categoria);
    await ejecutarApi('/api/catalogo/productos/actualizar', {
      productoId: producto.id,
      nombre: producto.nombre,
      descripcion: producto.descripcion || null,
      imagenUrl: producto.imagenUrl || null,
      categoriaId: categoriaId ?? null,
      marca: producto.marca || null,
      visibleEnPos: producto.visibleEnPos,
      permiteVentaSinStock: producto.permiteVentaSinStock ?? false,
      stockMinimo: producto.stockMinimo ?? '0',
    });
    await ejecutarApi('/api/catalogo/productos/precio', {
      productoId: producto.id,
      precioVenta: pesosSinSimboloDesdeCentavos(producto.precioVentaCentavos),
      costoUnitario: pesosSinSimboloDesdeCentavos(producto.costoUnitarioCentavos),
      precioMayoreo:
        producto.precioMayoreoCentavos === ''
          ? null
          : pesosSinSimboloDesdeCentavos(producto.precioMayoreoCentavos),
      cantidadMinimaMayoreo: producto.cantidadMinimaMayoreo || null,
    });
    await ejecutarApi('/api/catalogo/productos/codigo', {
      productoId: producto.id,
      codigoBarras: producto.codigoBarras || null,
      sku: producto.sku || null,
    });
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
            Precios, presentaciones y códigos persistidos en el catálogo del negocio.
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => {
            setEdicion(null);
            setDialogoAbierto(true);
          }}
        >
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
            onChange={(e) => {
              setCargando(true);
              setBusqueda(e.target.value);
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
      {cargando ? (
        <Estado mensaje="Consultando el catálogo…" />
      ) : visibles.length === 0 ? (
        <Estado mensaje="No encontramos productos. Ajusta la búsqueda o da de alta el primero." />
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
                setEdicion(producto);
                setDialogoAbierto(true);
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
              El servidor valida importes, permisos, paquete y organización al guardar.
            </DialogDescription>
          </DialogHeader>
          <ProductoFormulario
            key={edicion?.id ?? 'alta'}
            producto={edicion}
            alCancelar={() => {
              setDialogoAbierto(false);
            }}
            alGuardar={(producto) => {
              void guardar(producto);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function cargarProductos(busqueda: string): Promise<PaginaProductosApi | Error> {
  try {
    const parametros = new URLSearchParams({ limite: '50' });
    if (busqueda.trim() !== '') parametros.set('busqueda', busqueda.trim());
    return await obtenerApi<PaginaProductosApi>(`/api/catalogo/productos?${parametros}`);
  } catch (error) {
    return error instanceof Error ? error : new Error('No se pudo leer el catálogo');
  }
}

function Estado({ mensaje }: { readonly mensaje: string }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-xl border border-dashed bg-superficie p-8 text-center text-sm text-texto-sutil">
      {mensaje}
    </div>
  );
}
