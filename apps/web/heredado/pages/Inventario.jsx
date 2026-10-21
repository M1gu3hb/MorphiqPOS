'use client';
import React, { useState, useMemo } from 'react';
import { api } from '@/api/cliente';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@/utils/financialUtils';
import { getStockStatus, calculateInventoryValue } from '@/utils/inventoryUtils';
import { StockStatusBadge } from '@/components/common/StatusBadge';
import { Esqueleto, ErrorDePantalla } from '@morphiqpos/ui/sistema';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import EsqueletoDeInventario, {
  FILA_DE_INVENTARIO,
} from '@/components/inventario/EsqueletoDeInventario';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Link } from '@/enrutado';
import { puedeAjustarStock } from '~/inventario/ajuste-de-stock';
import { Search, Package, Trash2, PackagePlus, ShoppingBag, Sliders, Beaker } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { usePOSAuth } from '@/lib/POSAuthContext';
import RegistrarInventarioInicialDialog from '@/components/inventario/RegistrarInventarioInicialDialog';
import AjustarStockDialog from '@/components/inventario/AjustarStockDialog';
import IngredienteContenedorDialog from '@/components/inventario/IngredienteContenedorDialog';

/**
 * Formatea un valor de stock para mostrar en lista:
 *   - g  → "1500 g (1.5 kg)" cuando el valor es grande
 *   - ml → "2000 ml (2 l)"  cuando el valor es grande
 *   - pieza → "12 piezas"
 * Si el número es chico (< 1000), solo unidad base sin paréntesis para no ensuciar.
 */
function formatStockEnUnidad(valor, unidadBase) {
  const v = Number(valor) || 0;
  const fixed = v.toLocaleString();
  if (unidadBase === 'g' && v >= 1000) {
    const kg = parseFloat((v / 1000).toFixed(3));
    return (
      <>
        {fixed} <span className="text-xs font-normal text-muted-foreground">g</span>{' '}
        <span className="text-xs font-normal text-muted-foreground">({kg} kg)</span>
      </>
    );
  }
  if (unidadBase === 'ml' && v >= 1000) {
    const l = parseFloat((v / 1000).toFixed(3));
    return (
      <>
        {fixed} <span className="text-xs font-normal text-muted-foreground">ml</span>{' '}
        <span className="text-xs font-normal text-muted-foreground">({l} l)</span>
      </>
    );
  }
  return (
    <>
      {fixed} <span className="text-xs font-normal text-muted-foreground">{unidadBase}</span>
    </>
  );
}

/** Misma idea para el subtítulo Min/Crit, en una sola línea compacta. */
function formatUmbral(valor, unidadBase) {
  const v = Number(valor) || 0;
  if (v <= 0) return `0 ${unidadBase}`;
  if (unidadBase === 'g' && v >= 1000) {
    const kg = parseFloat((v / 1000).toFixed(3));
    return `${v.toLocaleString()} g (${kg} kg)`;
  }
  if (unidadBase === 'ml' && v >= 1000) {
    const l = parseFloat((v / 1000).toFixed(3));
    return `${v.toLocaleString()} ml (${l} l)`;
  }
  return `${v.toLocaleString()} ${unidadBase}`;
}

export default function Inventario() {
  const queryClient = useQueryClient();
  const { posUser } = usePOSAuth();
  const isAdmin = posUser?.rol === 'administrador';
  // Ajustar lo puede tambien el almacen, como el servidor (D.1 de la 2.4): quien cuenta
  // el anaquel tiene que poder corregirlo.
  const puedeAjustar = puedeAjustarStock(posUser?.rol);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showInvInicial, setShowInvInicial] = useState(false);
  const [ajustarIng, setAjustarIng] = useState(null);
  // 6B / 1.C — Diálogo para marcar un ingrediente como contenedor.
  const [contenedorIng, setContenedorIng] = useState(null);

  // Sin initialData:[] para distinguir loading inicial de "vacío real".
  const {
    data: ingredientes,
    isPending: ingLoading,
    isError: ingError,
    refetch: recargarIngredientes,
  } = useQuery({
    queryKey: ['ingredientes_all'],
    queryFn: () => api.entidades.Ingrediente.filter({ activo: true }),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });
  const safeIngredientes = Array.isArray(ingredientes) ? ingredientes : [];
  const cargandoInv = ingLoading && !ingredientes;
  // Un fallo de lectura SIN datos no es «Aún no tienes inventario»: es que no se pudo leer.
  const falloDeCarga = ingError && !ingredientes;

  const { data: recetasAll = [] } = useQuery({
    queryKey: ['recetas_all'],
    queryFn: () => api.entidades.RecetaEscandallo.list('-created_date', 2000),
    initialData: [],
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias_ingrediente'],
    queryFn: () => api.entidades.CategoriaIngrediente.filter({ activo: true }),
    initialData: [],
  });

  // Descuentos de hoy → "Consumido hoy" por ingrediente
  const { data: descuentosHoy = [] } = useQuery({
    queryKey: ['descuentos_hoy'],
    queryFn: () => api.entidades.DescuentoInventarioVenta.list('-created_date', 1000),
    initialData: [],
    refetchInterval: 8000,
  });

  const consumoHoyMap = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const map = {};
    descuentosHoy.forEach((d) => {
      const f = (d.fecha || d.created_date || '').slice(0, 10);
      if (f !== today) return;
      map[d.ingrediente_id] = (map[d.ingrediente_id] || 0) + (d.cantidad_total_descontada || 0);
    });
    return map;
  }, [descuentosHoy]);

  const enriched = useMemo(() => {
    return safeIngredientes.map((i) => ({
      ...i,
      stockStatus: getStockStatus(i),
      valorInventario: calculateInventoryValue(i),
      // Resolvemos el nombre de categoría SOLO si realmente tiene una.
      // Antes mostrábamos "Sin categoría" en cada tarjeta — ruido visual sin valor.
      categoriaNombre: categorias.find((c) => c.id === i.categoria_id)?.nombre || '',
      consumidoHoy: consumoHoyMap[i.id] || 0,
    }));
  }, [safeIngredientes, categorias, consumoHoyMap]);

  const filtered = useMemo(() => {
    return enriched.filter((i) => {
      const matchSearch = !search || i.nombre.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === 'all' || i.stockStatus === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [enriched, search, filterStatus]);

  const totalValue = enriched.reduce((s, i) => s + i.valorInventario, 0);
  // Un insumo con existencias y SIN costo no vale cero: vale algo que no se sabe. El total
  // no lo incluye, y la tarjeta lo dice en lugar de presentarse como el valor completo.
  const sinCostoConExistencias = enriched.filter(
    (i) => !(Number(i.costo_por_unidad_base) > 0) && Number(i.stock_actual) > 0,
  ).length;
  const criticalCount = enriched.filter((i) =>
    ['critico', 'agotado'].includes(i.stockStatus),
  ).length;

  const ingredienteEnUso = (ing) =>
    recetasAll.some((r) => r.ingrediente_id === ing.id && r.activo !== false);

  const desactivarIngrediente = async (ing) => {
    await api.entidades.Ingrediente.update(ing.id, { activo: false });
    queryClient.invalidateQueries({ queryKey: ['ingredientes_all'] });
    toast.success(`${ing.nombre} desactivado`);
    setConfirmDelete(null);
  };

  const eliminarIngrediente = async (ing) => {
    // Verificar movimientos.
    //
    // El `.catch(() => [])` que había aquí convertía un fallo de lectura en
    // «no tiene historial», que es justo el permiso para borrar de verdad. Una
    // lectura caída bastaba para dejar cientos de movimientos, recetas y
    // descuentos apuntando a un ingrediente que ya no existe. Si no se puede
    // comprobar el historial, no se borra.
    let movs;
    try {
      movs = await api.entidades.MovimientoInventario.filter({ ingrediente_id: ing.id });
    } catch (e) {
      console.error('[Inventario] verificar historial del ingrediente:', e);
      toast.error('No se pudo comprobar el historial. Reintenta antes de eliminar.');
      return;
    }
    if (movs.length > 0) {
      toast.error(
        `No se puede eliminar: tiene ${movs.length} movimientos en historial. Mejor desactivar.`,
      );
      return;
    }
    await api.entidades.Ingrediente.delete(ing.id);
    queryClient.invalidateQueries({ queryKey: ['ingredientes_all'] });
    toast.success(`${ing.nombre} eliminado`);
    setConfirmDelete(null);
  };

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Inventario"
        description="Ingredientes e insumos"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowInvInicial(true)}
              className="gap-1.5"
              title="Cargar inventario que ya tenías antes de usar el POS"
            >
              <PackagePlus className="w-4 h-4" />
              <span className="hidden sm:inline">Registrar inventario existente</span>
              <span className="sm:hidden">Inv. inicial</span>
            </Button>
            <Link to="/compras">
              <Button size="sm" className="gap-1.5">
                <ShoppingBag className="w-4 h-4" />
                Registrar compra
              </Button>
            </Link>
          </div>
        }
      />

      {/* Mientras carga NO se pinta «0» ni «$0.00»: un cero provisional se lee como un
          inventario vacío. Cada cifra reserva su hueco con un esqueleto de su misma altura.
          Dos y una en teléfono (la tercera, a lo ancho); las tres en una fila desde la tableta. */}
      <div className="grid grid-cols-2 gap-4 @2xl:grid-cols-3">
        <Card className="premium-sheen p-4">
          <p className="text-xs text-muted-foreground">Total ingredientes</p>
          {cargandoInv ? (
            <Esqueleto className="mt-1 h-8 w-16" />
          ) : (
            <p className="text-2xl font-heading font-bold tabular-nums">
              {safeIngredientes.length}
            </p>
          )}
        </Card>
        <Card className="premium-sheen order-first col-span-2 p-4 @2xl:order-none @2xl:col-span-1">
          <p className="text-xs text-muted-foreground">Valor de inventario</p>
          {cargandoInv ? (
            <Esqueleto className="mt-1 h-8 w-28" />
          ) : (
            <>
              <p className="text-2xl font-heading font-bold tabular-nums">
                {formatCurrency(totalValue)}
              </p>
              {sinCostoConExistencias > 0 && (
                <p className="mt-0.5 text-[11px] leading-snug text-advertencia">
                  No incluye {sinCostoConExistencias}{' '}
                  {sinCostoConExistencias === 1 ? 'ingrediente' : 'ingredientes'} sin costo
                </p>
              )}
            </>
          )}
        </Card>
        <Card className="premium-sheen p-4">
          <p className="text-xs text-muted-foreground">Alertas críticas</p>
          {cargandoInv ? (
            <Esqueleto className="mt-1 h-8 w-12" />
          ) : (
            <p className="text-2xl font-heading font-bold tabular-nums text-destructive">
              {criticalCount}
            </p>
          )}
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar ingrediente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="suficiente">Suficiente</SelectItem>
            <SelectItem value="medio">Medio</SelectItem>
            <SelectItem value="bajo">Bajo</SelectItem>
            <SelectItem value="critico">Crítico</SelectItem>
            <SelectItem value="agotado">Agotado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {cargandoInv ? (
        <EsqueletoDeInventario />
      ) : falloDeCarga ? (
        <ErrorDePantalla
          titulo="No se pudo cargar el inventario"
          queHacer="Revisa tu conexión e inténtalo de nuevo. Tu inventario sigue guardado."
          reintentar={
            <Button variant="outline" size="sm" onClick={() => recargarIngredientes()}>
              Reintentar
            </Button>
          }
        />
      ) : safeIngredientes.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Aún no tienes inventario"
          description="Si tu restaurante ya tenía insumos antes de usar el sistema, registra el inventario existente. Si vas a comprar nuevo, registra una compra."
          action={
            <div className="flex gap-2 flex-wrap justify-center">
              <Button onClick={() => setShowInvInicial(true)} variant="default" className="gap-1.5">
                <PackagePlus className="w-4 h-4" /> Registrar inventario existente
              </Button>
              <Link to="/compras">
                <Button variant="outline" className="gap-1.5">
                  <ShoppingBag className="w-4 h-4" /> Registrar compra
                </Button>
              </Link>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        // Hay inventario, pero la búsqueda o el estado elegido no encontró nada: eso no es
        // «Aún no tienes inventario».
        <EmptyState
          icon={Search}
          title="Sin resultados"
          description="Ningún ingrediente coincide con la búsqueda o el estado elegido."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setFilterStatus('all');
              }}
            >
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((ing) => {
            const conCosto = Number(ing.costo_por_unidad_base) > 0;
            return (
              <Card key={ing.id} className="premium-sheen p-4 hover:shadow-sm transition-shadow">
                <div className={FILA_DE_INVENTARIO}>
                  <div className="col-span-2 min-w-0 @2xl:col-span-1">
                    <div className="mb-1 flex min-w-0 items-center gap-2">
                      <p className="min-w-0 truncate text-sm font-medium" title={ing.nombre}>
                        {ing.nombre}
                      </p>
                      <div className="shrink-0">
                        <StockStatusBadge status={ing.stockStatus} />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                      {/* Solo mostramos categoría si REALMENTE tiene una asignada.
                        Antes aparecía "Sin categoría" en cada tarjeta — ruido visual. */}
                      {ing.categoriaNombre && <span>{ing.categoriaNombre}</span>}
                      {/* Sin costo registrado NO es «$0.00»: el insumo cuesta, sólo que
                        nadie lo ha dicho, y su valor en el total no se conoce. */}
                      <span>
                        Costo:{' '}
                        {conCosto ? (
                          `${formatCurrency(ing.costo_por_unidad_base)}/${ing.unidad_base}`
                        ) : (
                          <span className="font-medium text-advertencia">Sin costo</span>
                        )}
                      </span>
                      <span>Valor: {conCosto ? formatCurrency(ing.valorInventario) : '—'}</span>
                    </div>
                  </div>
                  <div data-existencias className="min-w-0 @2xl:text-right">
                    <p className="text-lg font-heading font-bold tabular-nums">
                      {formatStockEnUnidad(ing.stock_actual, ing.unidad_base)}
                    </p>
                    {ing.consumidoHoy > 0 && (
                      <p className="text-base font-heading font-bold tabular-nums text-peligro">
                        −{Number(ing.consumidoHoy).toLocaleString()}{' '}
                        <span className="text-xs">{ing.unidad_base}</span>
                        <span className="ml-1 text-[10px] font-normal text-peligro">hoy</span>
                      </p>
                    )}
                    <p className="text-[10px] tabular-nums text-muted-foreground">
                      <span className="@2xl:block">
                        Min: {formatUmbral(ing.stock_minimo, ing.unidad_base)}
                      </span>
                      <span className="@2xl:hidden">{' · '}</span>
                      <span className="@2xl:block">
                        Crit: {formatUmbral(ing.stock_critico, ing.unidad_base)}
                      </span>
                    </p>
                  </div>
                  {(isAdmin || puedeAjustar) && (
                    <div className="flex items-center justify-end gap-0.5">
                      {puedeAjustar && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => setAjustarIng(ing)}
                          title="Ajustar stock (merma, conteo físico, corrección)"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span className="hidden @2xl:inline">Ajustar</span>
                        </Button>
                      )}
                      {isAdmin && (
                        <>
                          {/* 6B / 1.C — Marcar como contenedor (botellas/cilindros para venta por porción) */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => setContenedorIng(ing)}
                            title="Configurar como contenedor (botella, etc.) para venta por porción"
                          >
                            <Beaker
                              className={`w-3.5 h-3.5 ${ing.tipo_ingrediente === 'contenedor' ? 'text-exito' : ''}`}
                            />
                            <span className="hidden @2xl:inline">
                              {ing.tipo_ingrediente === 'contenedor' ? 'Contenedor' : 'Contenedor'}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirmDelete(ing)}
                            title="Eliminar / desactivar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: registrar inventario inicial / existente (sin crear compra) */}
      <RegistrarInventarioInicialDialog
        open={showInvInicial}
        onClose={() => setShowInvInicial(false)}
        ingredientes={safeIngredientes}
      />

      {/* Modal: ajustar stock (merma, conteo físico, corrección). No crea compra/gasto/venta. */}
      <AjustarStockDialog
        open={!!ajustarIng}
        onClose={() => setAjustarIng(null)}
        ingrediente={ajustarIng}
      />

      {/* 6B / 1.C — Modal: configurar ingrediente como contenedor (botella, etc.).
          Solo metadatos, NO toca stock/costo/movimientos. */}
      <IngredienteContenedorDialog
        open={!!contenedorIng}
        onClose={() => setContenedorIng(null)}
        ingrediente={contenedorIng}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar / desactivar ingrediente</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {confirmDelete && ingredienteEnUso(confirmDelete) && (
                <span className="block text-advertencia font-medium">
                  ⚠ "{confirmDelete?.nombre}" se usa en recetas activas. Si lo eliminas, esas
                  recetas pueden quedar incompletas.
                </span>
              )}
              <span className="block">
                Recomendamos <strong>desactivar</strong> para conservar el historial financiero.
              </span>
              <span className="block text-xs text-muted-foreground">
                Eliminar definitivamente solo es posible si el ingrediente no tiene movimientos.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => confirmDelete && desactivarIngrediente(confirmDelete)}
            >
              Desactivar
            </Button>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                confirmDelete && eliminarIngrediente(confirmDelete);
              }}
            >
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
