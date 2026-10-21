'use client';
import React, { useState, useMemo } from 'react';
import { api } from '@/api/cliente';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@/enrutado';
import { formatCurrency, formatPercent, getMarginLevel } from '@/utils/financialUtils';
import { MARGIN_CONFIG } from '@/lib/constants';
import { ErrorDePantalla } from '@morphiqpos/ui/sistema';
import { economiaDelProducto } from '~/inventario/costo-del-platillo';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tag,
  Search,
  FileText,
  Printer,
  BookOpen,
  Plus,
  Pencil,
  ListChecks,
} from 'lucide-react';
import { useConfig } from '@/lib/ConfigContext';
import { canAccessModule } from '@/lib/packageConfig';
import ProductoDesglose from '@/components/productos/ProductoDesglose';
import ProductoSimpleDialog from '@/components/productos/ProductoSimpleDialog';
import ModificadoresDialog from '@/components/productos/ModificadoresDialog';
import FichaResumenVariable from '@/components/productos/FichaResumenVariable';
import ImagenDePlatillo from '@/components/productos/ImagenDePlatillo';
import EsqueletoDeProductos, { REJILLA_DE_TARJETAS } from '@/components/productos/EsqueletoDeProductos';
import { esProductoVariable, TIPO_VENTA } from '@/utils/tipoVentaUtils';
import { useIsDark } from '@/lib/ThemeContext';
import { MARGIN_DARK_BG } from '@/lib/darkPalettes';
import { printDocument } from '@/lib/print';

export default function Productos() {
  const { config, paquete_modo } = useConfig();
  const isDark = useIsDark();
  // Lo que parte esta pantalla en dos —catálogo propio contra catálogo generado
  // desde las recetas— es tener o no el módulo `recetas`, no el nombre del
  // paquete. Bajo D-01 lo traen las tres plantillas: *una tienda sin inventario
  // no es una tienda, es una calculadora*.
  const sinRecetas = !canAccessModule('recetas', paquete_modo);
  const showCostos = canAccessModule('costos_basicos', paquete_modo);
  const [search, setSearch] = useState('');
  const [showFicha, setShowFicha] = useState(false);
  const [fichaProducto, setFichaProducto] = useState(null);
  const [fichaLineas, setFichaLineas] = useState([]);
  const [showSimple, setShowSimple] = useState(false);
  const [editandoProducto, setEditandoProducto] = useState(null);
  const [modificadoresProducto, setModificadoresProducto] = useState(null);

  // No usar initialData:[] para que el render inicial muestre "Cargando" y no "vacío".
  const {
    data: recetas,
    isPending: recetasLoading,
    isError: recetasError,
    refetch: recargarRecetas,
  } = useQuery({
    queryKey: ['recetas_all'],
    queryFn: () => api.entidades.RecetaEscandallo.list('-created_date', 1000),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  const {
    data: productos,
    isPending: productosLoading,
    isError: productosError,
    refetch: recargarProductos,
  } = useQuery({
    queryKey: ['productos_all'],
    queryFn: () => api.entidades.ProductoTerminado.filter({ activo: true }),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  // 6B / Hotfix visual — Cargamos ingredientes para resolver el ingrediente
  // base de los productos variables (necesario para calcular costo/utilidad/
  // margen por unidad vendible / porción). No bloquea el render: si aún no
  // llega, FichaResumenVariable muestra "—" en costo y aviso amable.
  const { data: ingredientes } = useQuery({
    queryKey: ['ingredientes_all'],
    queryFn: () => api.entidades.Ingrediente.list('-created_date', 1000),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  const safeRecetas = Array.isArray(recetas) ? recetas : [];
  const safeProductos = Array.isArray(productos) ? productos : [];
  const safeIngredientes = Array.isArray(ingredientes) ? ingredientes : [];
  const ingredientesById = useMemo(() => {
    const m = new Map();
    safeIngredientes.forEach((i) => {
      if (i?.id) m.set(i.id, i);
    });
    return m;
  }, [safeIngredientes]);
  const cargandoInicial = (productosLoading && !productos) || (recetasLoading && !recetas);
  // Un fallo de lectura SIN datos no es «Sin productos»: es que no se pudo leer.
  const falloDeCarga = (productosError && !productos) || (recetasError && !recetas);
  const recargarTodo = () => {
    if (productosError) recargarProductos();
    if (recetasError) recargarRecetas();
  };

  // El costo de cada producto sale de SUS líneas y es «desconocido» —no cero— si no tiene
  // receta o si a algún insumo le falta el costo. Antes sumaba con `|| 0` y un producto sin
  // receta salía con COSTO $0.00 y MARGEN 100 %, que es la cifra más bonita y la más falsa.
  const enriched = useMemo(() => {
    const porProducto = new Map();
    for (const linea of safeRecetas) {
      if (linea.activo === false) continue;
      const grupo = porProducto.get(linea.producto_id) ?? [];
      grupo.push(linea);
      porProducto.set(linea.producto_id, grupo);
    }
    return safeProductos.map((p) => {
      const lines = porProducto.get(p.id) ?? [];
      return { ...p, recetaLines: lines, economia: economiaDelProducto(p, lines) };
    });
  }, [safeProductos, safeRecetas]);

  const filtered = enriched.filter(
    (p) => !search || p.nombre.toLowerCase().includes(search.toLowerCase()),
  );

  const verFicha = (p) => {
    setFichaProducto(p);
    setFichaLineas(p.recetaLines || []);
    setShowFicha(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos"
        description={
          sinRecetas ? 'Catálogo del negocio' : 'Catálogo generado a partir de las recetas'
        }
        actions={
          sinRecetas ? (
            <Button
              size="sm"
              className="gap-2"
              onClick={() => {
                setEditandoProducto(null);
                setShowSimple(true);
              }}
            >
              <Plus className="w-4 h-4" /> Agregar producto
            </Button>
          ) : (
            <Link to="/recetas">
              <Button variant="outline" size="sm" className="gap-2">
                <BookOpen className="w-4 h-4" /> Ir a Recetas
              </Button>
            </Link>
          )
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {cargandoInicial ? (
        <EsqueletoDeProductos />
      ) : falloDeCarga ? (
        <ErrorDePantalla
          titulo="No se pudieron cargar los productos"
          queHacer="Revisa tu conexión e inténtalo de nuevo. Tu catálogo sigue guardado."
          reintentar={
            <Button variant="outline" size="sm" onClick={recargarTodo}>
              Reintentar
            </Button>
          }
        />
      ) : safeProductos.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Sin productos"
          description={
            sinRecetas ? 'Agrega tu primer producto' : 'Crea productos desde la sección Recetas'
          }
          action={
            sinRecetas ? (
              <Button
                onClick={() => {
                  setEditandoProducto(null);
                  setShowSimple(true);
                }}
              >
                <Plus className="w-4 h-4 mr-1" /> Agregar producto
              </Button>
            ) : (
              <Link to="/recetas">
                <Button>Ir a Recetas</Button>
              </Link>
            )
          }
        />
      ) : filtered.length === 0 ? (
        // Hay catálogo, pero la búsqueda no encontró nada: eso no es «Sin productos».
        <EmptyState
          icon={Search}
          title="Sin resultados"
          description={`Ningún producto coincide con «${search}».`}
          action={
            <Button variant="outline" onClick={() => setSearch('')}>
              Limpiar búsqueda
            </Button>
          }
        />
      ) : (
        <div className={REJILLA_DE_TARJETAS}>
          {filtered.map((p) => {
            const eco = p.economia;
            const level = eco.margen === null ? null : getMarginLevel(eco.margen);
            const cfg = level === null ? null : MARGIN_CONFIG[level];
            // 6B / Hotfix visual — Detectar producto variable. Si lo es, NO mostramos
            // el grid genérico "Costo/Utilidad/Margen" (era engañoso porque calculaba
            // por receta fija). En su lugar mostramos FichaResumenVariable compact.
            const esVar = esProductoVariable(p);
            const ingBase = esVar ? ingredientesById.get(p.ingrediente_base_id) : null;
            // Color para importes monetarios (respeta toggle Identidad).
            const useMoneyColor = config?.colorear_importes_monetarios !== false;
            const priceColor = useMoneyColor ? 'text-primary' : 'text-foreground';
            // Datos del precio principal para variables.
            const varUnidad = esVar
              ? p.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA
                ? p.unidad_variable || 'g'
                : p.nombre_porcion || 'porción'
              : null;
            const varPrecio = esVar
              ? Number(
                  p.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA
                    ? p.precio_por_unidad_variable
                    : p.precio_por_porcion,
                ) || 0
              : 0;
            return (
              // `flex-col` + `h-full`: las tarjetas de una misma fila miden lo mismo y el pie,
              // con las acciones, queda siempre abajo (`mt-auto`), tenga lo que tenga encima.
              <Card
                key={p.id}
                data-tarjeta-de-producto
                className={`premium-sheen flex h-full flex-col overflow-hidden transition-all hover:shadow-lg ${sinRecetas ? '' : 'cursor-pointer'}`}
                onClick={() => {
                  if (!sinRecetas) verFicha(p);
                }}
                style={{
                  boxShadow: isDark
                    ? '0 1px 0 rgba(255,255,255,0.05) inset, 0 4px 12px rgba(0,0,0,0.4)'
                    : '0 1px 0 rgba(255,255,255,0.95) inset, 0 4px 12px rgba(0,0,0,0.06)',
                }}
              >
                <ImagenDePlatillo url={p.imagen_url} nombre={p.nombre} />
                <div className="flex flex-1 flex-col gap-2.5 p-4">
                  {/* Cabecera: nombre, categoría y una tercera línea que sólo llena el
                      producto variable. Se reserva SIEMPRE, para que la cabecera mida lo
                      mismo en todas las tarjetas y las cifras de abajo caigan a la misma
                      altura. */}
                  <div className="grid min-h-[3.75rem] grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-heading font-semibold" title={p.nombre}>
                        {p.nombre}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.categoria_nombre || 'Sin categoría'}
                      </p>
                      <div className="mt-0.5 flex h-5 items-center gap-1.5 overflow-hidden">
                        {esVar && (
                          <>
                            <Badge
                              variant="outline"
                              className="h-4 shrink-0 border-primary/30 bg-primary/10 px-1.5 py-0 text-[9px] text-primary"
                            >
                              {p.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA
                                ? 'Variable por medida'
                                : 'Por porción'}
                            </Badge>
                            <span className="truncate text-[10px] text-muted-foreground">
                              {p.ingrediente_base_nombre || ingBase?.nombre || '—'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Precio principal — variables muestran "$X / unidad", normales muestran precio plano.
                        Mismo lugar, misma jerarquía visual. Respeta colorear_importes_monetarios. */}
                    {esVar ? (
                      <div className="shrink-0 text-right">
                        <p
                          className={`font-heading text-lg font-black leading-tight tabular-nums ${priceColor}`}
                        >
                          {formatCurrency(varPrecio)}
                        </p>
                        <p className="text-[10px] leading-tight text-muted-foreground">
                          / {varUnidad}
                        </p>
                      </div>
                    ) : (
                      <p
                        className={`shrink-0 font-heading text-lg font-black tabular-nums ${priceColor}`}
                      >
                        {formatCurrency(p.precio_venta)}
                      </p>
                    )}
                  </div>

                  {showCostos && esVar && (
                    // Mismo grid 3-cols que productos normales (mismo tamaño visual).
                    <FichaResumenVariable
                      producto={p}
                      ingrediente={ingBase}
                      variant="card"
                      coloresMonetarios={useMoneyColor}
                    />
                  )}

                  {showCostos && !esVar && (
                    // En Productos los colores costo/utilidad/margen comunican estado del
                    // producto, no es un importe monetario neutro. Por eso aquí SIEMPRE se
                    // mantienen los colores semánticos aunque colorear_importes_monetarios=false.
                    // Costo desconocido (sin receta, o un insumo sin costo) NO es $0.00: la caja
                    // lo dice con palabras, y la utilidad y el margen quedan en «—».
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-3 gap-1 text-center">
                        <div className="flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center rounded-md bg-muted/50 px-1 py-1.5">
                          <p className="text-[9px] uppercase text-muted-foreground">Costo</p>
                          {eco.costo === null ? (
                            <p className="text-[10px] font-semibold leading-tight text-advertencia">
                              {eco.etiqueta}
                            </p>
                          ) : (
                            <p className="text-xs font-bold tabular-nums text-advertencia">
                              {formatCurrency(eco.costo)}
                            </p>
                          )}
                        </div>
                        <div className="flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center rounded-md bg-muted/50 px-1 py-1.5">
                          <p className="text-[9px] uppercase text-muted-foreground">Utilidad</p>
                          <p
                            className={`text-xs font-bold tabular-nums ${eco.utilidad === null ? 'text-muted-foreground' : 'text-exito'}`}
                          >
                            {eco.utilidad === null ? '—' : formatCurrency(eco.utilidad)}
                          </p>
                        </div>
                        <div
                          className={`flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center rounded-md px-1 py-1.5 ${cfg ? `${cfg.bg} ${MARGIN_DARK_BG[level] || ''}` : 'bg-muted/50'}`}
                        >
                          <p className="text-[9px] uppercase text-muted-foreground">Margen</p>
                          <p
                            className={`text-xs font-bold tabular-nums ${cfg ? cfg.color : 'text-muted-foreground'}`}
                          >
                            {eco.margen === null ? '—' : formatPercent(eco.margen)}
                          </p>
                        </div>
                      </div>
                      {/* «Agrega su receta» no tiene sentido en un plan sin el módulo de recetas. */}
                      {eco.pista && !sinRecetas && (
                        <p
                          className="line-clamp-2 text-[11px] leading-snug text-advertencia"
                          title={eco.pista}
                        >
                          {eco.pista}
                        </p>
                      )}
                    </div>
                  )}

                  {p.descripcion && sinRecetas && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{p.descripcion}</p>
                  )}

                  {/* El pie: siempre abajo y siempre en una línea. */}
                  <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
                    {!p.visible_en_pos ? (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        Oculto en POS
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-exito/30 bg-exito/10 text-[10px] text-exito"
                      >
                        En POS
                      </Badge>
                    )}
                    <div className="flex items-center gap-0.5">
                      {/* Botón "Opciones" / Modificadores — disponible en todos los paquetes
                          (Esencial, Operativo, Restaurante Pro). No afecta receta/costo. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        title="Opciones de preparación / modificadores"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModificadoresProducto(p);
                        }}
                      >
                        <ListChecks className="w-3 h-3" />
                        Opciones
                        {Array.isArray(p.modificadores) && p.modificadores.length > 0 && (
                          <span className="ml-0.5 rounded-full bg-primary/15 px-1 text-[9px] font-bold text-primary">
                            {p.modificadores.length}
                          </span>
                        )}
                      </Button>
                      {!sinRecetas && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            verFicha(p);
                          }}
                        >
                          <FileText className="w-3 h-3" /> Ficha
                        </Button>
                      )}
                      {sinRecetas && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditandoProducto(p);
                            setShowSimple(true);
                          }}
                        >
                          <Pencil className="w-3 h-3" /> Editar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* SIMPLE PRODUCT DIALOG (solo Esencial) */}
      <ProductoSimpleDialog
        open={showSimple}
        onClose={() => {
          setShowSimple(false);
          setEditandoProducto(null);
        }}
        producto={editandoProducto}
      />

      {/* MODIFICADORES / OPCIONES DE PREPARACIÓN — disponible en todos los paquetes */}
      <ModificadoresDialog
        open={!!modificadoresProducto}
        onClose={() => setModificadoresProducto(null)}
        producto={modificadoresProducto}
      />

      {/* FICHA DIALOG */}
      <Dialog open={showFicha} onOpenChange={setShowFicha}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Ficha del producto</DialogTitle>
          </DialogHeader>
          {/* `min-w-0`: en un diálogo de rejilla, sin él la columna crece hasta los 500 px de la
              ficha y el diálogo se sale del teléfono en vez de encogerla. */}
          <div className="bg-muted/30 rounded-lg p-2 min-w-0">
            <ProductoDesglose
              producto={fichaProducto}
              lineas={fichaLineas}
              config={config}
              ingredienteBase={
                fichaProducto?.ingrediente_base_id
                  ? ingredientesById.get(fichaProducto.ingrediente_base_id)
                  : null
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFicha(false)}>
              Cerrar
            </Button>
            <Button
              onClick={() => {
                try {
                  printDocument({
                    mode: 'letter',
                    title: `Ficha-${fichaProducto?.nombre || 'producto'}`,
                  });
                } catch (err) {
                  console.error('[Productos] imprimir ficha:', err);
                }
              }}
            >
              <Printer className="w-4 h-4 mr-1" /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
