'use client';
import React, { useState, useMemo } from 'react';
import { api } from '@/api/cliente';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { hasPermission } from '@/lib/permissions';
import { formatCurrency, generateFolio, calculateMargin } from '@/utils/financialUtils';
import ProductCard from '@/components/pos/ProductCard';
import CartPanel from '@/components/pos/CartPanel';
import PaymentModal from '@/components/pos/PaymentModal';
import PreCuentaTicket from '@/components/tickets/PreCuentaTicket';
import PropinaDialog from '@/components/propinas/PropinaDialog';
import SafeBoundary from '@/components/common/SafeBoundary';
import CantidadVariableDialog from '@/components/mesero/CantidadVariableDialog';
import BarcodeScanner from '@/components/barcode/BarcodeScanner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Search, ShoppingCart, AlertTriangle, DoorOpen, Printer, ScanLine } from 'lucide-react';
import { useCajaAbierta } from '@/lib/useCajaAbierta';
import { Link } from '@/enrutado';
import { printDocument } from '@/lib/print';
import { tipsEnabled, getPorcentajesSugeridos } from '@/utils/tipsUtils';
import {
  TIPO_VENTA,
  esProductoVariable,
  calcularCantidadBaseConsumo,
  calcularCostoVariable,
} from '@/utils/tipoVentaUtils';
import { validarStockParaCobro, mensajeFaltanteStock } from '@/utils/inventarioValidation';

export default function POS() {
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [escanerAbierto, setEscanerAbierto] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [showPayment, setShowPayment] = useState(false);
  const [showCartMobile, setShowCartMobile] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [ticketFinal, setTicketFinal] = useState(null); // { venta, detalles }
  const [showTicket, setShowTicket] = useState(false);
  // 6B / 1.K — Modal de cantidad para productos variables.
  const [productoVariable, setProductoVariable] = useState(null);
  // === Propina (Esencial/Operativo: flujo tradicional) ===
  const [showPropina, setShowPropina] = useState(false);
  const [propina, setPropina] = useState({
    propina_monto: 0,
    propina_porcentaje: 0,
    propina_tipo: 'sin_propina',
    propina_origen: 'tradicional',
  });

  const { posUser } = usePOSAuth();
  const { config, canAccessModule } = useConfig();
  const queryClient = useQueryClient();
  const showCost = hasPermission(posUser?.rol, 'ver_costos');
  const { hayCaja, cajaAbierta } = useCajaAbierta();

  const { data: productos = [] } = useQuery({
    queryKey: ['productos_pos'],
    queryFn: () => api.entidades.ProductoTerminado.filter({ activo: true, visible_en_pos: true }),
    initialData: [],
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias_producto'],
    queryFn: () => api.entidades.CategoriaProducto.filter({ activo: true }),
    initialData: [],
  });

  const { data: recetas = [] } = useQuery({
    queryKey: ['recetas_all'],
    queryFn: () => api.entidades.RecetaEscandallo.filter({ activo: true }),
    initialData: [],
  });

  const { data: ingredientes = [] } = useQuery({
    queryKey: ['ingredientes_all'],
    queryFn: () => api.entidades.Ingrediente.filter({ activo: true }),
    initialData: [],
  });

  const filtered = useMemo(() => {
    return productos.filter((p) => {
      const matchSearch = !search || p.nombre.toLowerCase().includes(search.toLowerCase());
      const matchCat = activeCategory === 'all' || p.categoria_id === activeCategory;
      return matchSearch && matchCat;
    });
  }, [productos, search, activeCategory]);

  // 6B / 1.K — Total considerando líneas variables (subtotal_linea fijo) y precio_fijo.
  const total = useMemo(() => {
    return (Array.isArray(cart) ? cart : []).reduce((s, i) => {
      if (
        i?.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA ||
        i?.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR
      ) {
        return s + (Number(i?.subtotal_linea) || 0);
      }
      return s + (Number(i?.precio_venta) || 0) * (Number(i?.cantidad) || 0);
    }, 0);
  }, [cart]);

  const addToCart = (product) => {
    // 6B / 1.K — Si es variable, abrir modal de captura. NO se agrupa con
    // líneas anteriores (cada línea variable es independiente).
    if (esProductoVariable(product)) {
      setProductoVariable(product);
      return;
    }
    // ---- precio_fijo (flujo histórico, intacto) ----
    const idx = cart.findIndex((i) => i.producto_id === product.id && !i.tipo_venta);
    if (idx >= 0) {
      const updated = [...cart];
      updated[idx].cantidad += 1;
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          producto_id: product.id,
          nombre: product.nombre,
          precio_venta: product.precio_venta,
          costo: product.costo_calculado_actual || 0,
          area_preparacion: product.area_preparacion,
          cantidad: 1,
          notas: '',
        },
      ]);
    }
  };

  /**
   * Un código leído por la cámara o por el lector físico (E9-1, E9-2).
   *
   * La búsqueda es EXACTA sobre `codigo_barras` y se hace en la lista ya
   * cargada: los productos del POS caben en memoria y buscar aquí evita un
   * viaje de red por cada lectura, que con el lector físico son varias por
   * segundo.
   *
   * El flujo de «código no encontrado» es el suyo: se avisa con el código
   * delante, para que quien está en la caja pueda teclearlo o darlo de alta,
   * en vez de un «no encontrado» a secas que no dice cuál.
   */
  const handleCodigoEscaneado = (codigo) => {
    const limpio = String(codigo ?? '').trim();
    if (!limpio) return;
    const producto = (Array.isArray(productos) ? productos : []).find(
      (p) => String(p?.codigo_barras ?? '').trim() === limpio,
    );
    if (!producto) {
      toast.error(`Código ${limpio} no está en el catálogo`);
      return;
    }
    addToCart(producto);
    toast.success(`${producto.nombre} agregado`);
  };

  // 6B / 1.K — Recibe snapshot del CantidadVariableDialog y crea línea variable.
  const handleConfirmVariable = (snap) => {
    if (!productoVariable || !snap) {
      setProductoVariable(null);
      return;
    }
    const producto = productoVariable;
    // Costo unitario base: tomado del ingrediente_base si está en la lista cargada.
    const ing = (Array.isArray(ingredientes) ? ingredientes : []).find(
      (i) => i?.id === snap.ingrediente_base_id,
    );
    const costoUnitBase = Number(ing?.costo_por_unidad_base) || 0;
    const cantBase = calcularCantidadBaseConsumo({
      tipo_venta: snap.tipo_venta,
      cantidad_variable: snap.cantidad_variable,
      unidad_variable: snap.unidad_variable,
      cantidad_porciones: snap.cantidad_porciones,
      ml_por_porcion: snap.ml_por_porcion,
    });
    const { costo_linea } = calcularCostoVariable({
      precio_total_linea: snap.precio_total_linea,
      cantidad_base_consumo: cantBase,
      costo_por_unidad_base: costoUnitBase,
    });
    const item = {
      producto_id: producto.id,
      nombre: producto.nombre,
      precio_venta: snap.precio_total_linea, // se usa como precio_unitario_snapshot (cantidad=1)
      costo: costo_linea, // costo total de la línea (cantidad=1)
      area_preparacion: producto.area_preparacion,
      cantidad: 1, // cantidad lógica = 1 (la "cantidad real" es la variable)
      notas: '',
      // ----- snapshots variables -----
      tipo_venta: snap.tipo_venta,
      cantidad_variable: snap.cantidad_variable || 0,
      unidad_variable: snap.unidad_variable || '',
      cantidad_porciones: snap.cantidad_porciones || 0,
      nombre_porcion: snap.nombre_porcion || '',
      ml_por_porcion: snap.ml_por_porcion || 0,
      ingrediente_base_id: snap.ingrediente_base_id || '',
      ingrediente_base_nombre: snap.ingrediente_base_nombre || ing?.nombre || '',
      precio_por_unidad_snapshot: snap.precio_por_unidad_snapshot || 0,
      cantidad_base_consumo: cantBase,
      subtotal_linea: snap.precio_total_linea,
    };
    setCart((prev) => [...(Array.isArray(prev) ? prev : []), item]);
    setProductoVariable(null);
  };

  const updateQty = (idx, qty) => {
    // En líneas variables no permitimos +/- (la cantidad real es la "variable").
    const item = cart?.[idx];
    if (
      item &&
      (item.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA ||
        item.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR)
    ) {
      return;
    }
    if (qty <= 0) {
      removeItem(idx);
      return;
    }
    const updated = [...cart];
    updated[idx].cantidad = qty;
    setCart(updated);
  };

  const removeItem = (idx) => setCart(cart.filter((_, i) => i !== idx));

  const handleCheckout = async (paymentData) => {
    // Bloqueo: no permitir cobrar si la caja está cerrada.
    if (!hayCaja) {
      toast.error('No hay caja abierta. Abre caja para cobrar.');
      return;
    }
    if (processing) return; // evitar doble cobro
    if (!Array.isArray(cart) || cart.length === 0) {
      toast.error('El carrito está vacío.');
      return;
    }
    setProcessing(true);

    try {
      // 6B / 1.J — Validación unificada de stock (precio_fijo + variables).
      // Construimos "detalles simulados" desde el cart y reutilizamos el helper
      // que ya usa Caja. Esto evita dos sistemas de validación paralelos.
      const detallesParaValidar = (Array.isArray(cart) ? cart : []).map((it) => ({
        producto_id: it?.producto_id,
        producto_nombre: it?.nombre,
        cantidad: Number(it?.cantidad) || 0,
        tipo_venta_snapshot: it?.tipo_venta || null,
        cantidad_variable_snapshot: it?.cantidad_variable,
        unidad_variable_snapshot: it?.unidad_variable,
        cantidad_porciones_snapshot: it?.cantidad_porciones,
        ml_por_porcion_snapshot: it?.ml_por_porcion,
        ingrediente_base_id_snapshot: it?.ingrediente_base_id,
        cantidad_base_consumo: it?.cantidad_base_consumo,
      }));
      const val = validarStockParaCobro({
        detalles: detallesParaValidar,
        recetasAll: Array.isArray(recetas) ? recetas : [],
        ingredientesAll: Array.isArray(ingredientes) ? ingredientes : [],
      });
      if (!val.ok) {
        console.warn('[POS 1.J] Stock insuficiente:', val);
        if (!config?.permitir_venta_sin_stock) {
          toast.error(mensajeFaltanteStock(val));
          setProcessing(false);
          return;
        } else {
          toast.warning(
            mensajeFaltanteStock(val) + ' (Se cobrará igual: venta sin stock permitida).',
          );
        }
      }

      const folio = generateFolio('V');
      const costoTotal = cart.reduce(
        (s, i) => s + (Number(i?.costo) || 0) * (Number(i?.cantidad) || 0),
        0,
      );
      const utilidad = total - costoTotal;
      const margen = calculateMargin(total, costoTotal);

      // Asociar al corte abierto (cierre_diario) actual
      const corteAbiertoId = cajaAbierta?.id || null;

      // IMPORTANTE: `total` = venta real SIN propina (no infla utilidad/ventas).
      // La propina se guarda en propina_monto y se cobra aparte en paymentData.
      const venta = await api.entidades.Venta.create({
        folio,
        fecha_apertura: new Date().toISOString(),
        fecha_cierre: new Date().toISOString(),
        tipo_venta: 'mostrador',
        estado: 'pagada',
        subtotal: total,
        total,
        propina_monto: Number(propina?.propina_monto) || 0,
        propina_porcentaje: Number(propina?.propina_porcentaje) || 0,
        propina_tipo: propina?.propina_tipo || 'sin_propina',
        propina_origen: propina?.propina_origen || 'tradicional',
        costo_total_snapshot: costoTotal,
        utilidad_bruta_snapshot: utilidad,
        margen_snapshot: margen,
        usuario_cajero_id: posUser?.id,
        usuario_cajero_nombre: posUser?.nombre,
        corte_caja_id: corteAbiertoId,
        ...paymentData,
      });

      // Snapshot de detalles para el ticket (lo construimos en paralelo)
      const detallesParaTicket = [];

      // Create sale details
      for (const item of cart) {
        const esVariable =
          item?.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA ||
          item?.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR;

        // Subtotal real de la línea (variables ya traen subtotal_linea fijo).
        const subtotalLinea = esVariable
          ? Number(item?.subtotal_linea) || 0
          : (Number(item?.precio_venta) || 0) * (Number(item?.cantidad) || 0);
        const costoLinea = esVariable
          ? Number(item?.costo) || 0
          : (Number(item?.costo) || 0) * (Number(item?.cantidad) || 0);
        const utilidadLinea = subtotalLinea - costoLinea;
        const margenLinea = calculateMargin(subtotalLinea, costoLinea);

        // Payload base de DetalleVenta — precio_fijo y variable comparten estructura.
        const detallePayload = {
          venta_id: venta.id,
          producto_id: item.producto_id,
          producto_nombre: item.nombre,
          cantidad: item.cantidad,
          precio_unitario_snapshot: item.precio_venta, // en variables = precio_total_linea (cantidad=1)
          costo_unitario_snapshot: item.costo,
          subtotal: subtotalLinea,
          costo_total_linea_snapshot: costoLinea,
          utilidad_linea_snapshot: utilidadLinea,
          margen_linea_snapshot: margenLinea,
          notas_producto: item.notas,
          estado_preparacion: 'pendiente',
          area_preparacion_snapshot: item.area_preparacion,
        };
        // 6B / 1.K — Snapshots adicionales si la línea es variable.
        if (esVariable) {
          detallePayload.tipo_venta_snapshot = item.tipo_venta;
          detallePayload.unidad_variable_snapshot = item.unidad_variable || '';
          detallePayload.cantidad_variable_snapshot = Number(item.cantidad_variable) || 0;
          detallePayload.cantidad_porciones_snapshot = Number(item.cantidad_porciones) || 0;
          detallePayload.nombre_porcion_snapshot = item.nombre_porcion || '';
          detallePayload.ml_por_porcion_snapshot = Number(item.ml_por_porcion) || 0;
          detallePayload.ingrediente_base_id_snapshot = item.ingrediente_base_id || '';
          detallePayload.ingrediente_base_nombre_snapshot = item.ingrediente_base_nombre || '';
          detallePayload.precio_por_unidad_snapshot = Number(item.precio_por_unidad_snapshot) || 0;
          detallePayload.cantidad_base_consumo = Number(item.cantidad_base_consumo) || 0;
        }

        const detalle = await api.entidades.DetalleVenta.create(detallePayload);
        detallesParaTicket.push(detalle || { ...detallePayload });

        // ====== Discount inventory ======
        if (esVariable) {
          // 6B / 1.K — Descontar el ingrediente_base por cantidad_base_consumo.
          const ing = (Array.isArray(ingredientes) ? ingredientes : []).find(
            (i) => i?.id === item.ingrediente_base_id,
          );
          const cantBase = Number(item?.cantidad_base_consumo) || 0;
          if (ing && cantBase > 0) {
            const stockAnt = Number(ing.stock_actual) || 0;
            const stockNew = Math.max(0, stockAnt - cantBase);
            const costoUnit = Number(ing.costo_por_unidad_base) || 0;
            const costoTotalMov = Math.round(cantBase * costoUnit * 100) / 100;
            await api.entidades.Ingrediente.update(ing.id, { stock_actual: stockNew }).catch(
              () => {},
            );
            await api.entidades.MovimientoInventario.create({
              ingrediente_id: ing.id,
              ingrediente_nombre: ing.nombre,
              tipo_movimiento: 'salida_venta',
              cantidad: -cantBase,
              unidad_base: ing.unidad_base,
              stock_anterior: stockAnt,
              stock_nuevo: stockNew,
              costo_unitario_en_momento: costoUnit,
              costo_total_movimiento: costoTotalMov,
              referencia_tipo: 'venta',
              referencia_id: venta.id,
              motivo: `Venta ${folio}`,
              usuario_id: posUser?.id,
              usuario_nombre: posUser?.nombre,
              fecha: new Date().toISOString(),
            }).catch(() => {});
            await api.entidades.DescuentoInventarioVenta.create({
              venta_id: venta.id,
              detalle_venta_id: detalle?.id,
              producto_id: item.producto_id,
              ingrediente_id: ing.id,
              ingrediente_nombre: ing.nombre,
              cantidad_producto: item.cantidad,
              cantidad_ingrediente_por_producto: cantBase, // cantidad lógica=1
              cantidad_total_descontada: cantBase,
              unidad_base: ing.unidad_base,
              costo_unitario_snapshot: costoUnit,
              costo_total_descontado: costoTotalMov,
              fecha: new Date().toISOString(),
            }).catch(() => {});
          }
        } else {
          // ---- precio_fijo (LEGACY, intacto) ----
          const productRecipes = (Array.isArray(recetas) ? recetas : []).filter(
            (r) => r.producto_id === item.producto_id,
          );
          for (const recipe of productRecipes) {
            const ing = (Array.isArray(ingredientes) ? ingredientes : []).find(
              (i) => i.id === recipe.ingrediente_id,
            );
            if (!ing) continue;

            const mermaFactor = 1 + (recipe.merma_porcentaje || 0) / 100;
            const qtyPerProduct = (recipe.cantidad_convertida_unidad_base || 0) * mermaFactor;
            const totalDiscount = qtyPerProduct * item.cantidad;
            const newStock = Math.max(0, (ing.stock_actual || 0) - totalDiscount);

            await api.entidades.Ingrediente.update(ing.id, { stock_actual: newStock }).catch(
              () => {},
            );

            await api.entidades.MovimientoInventario.create({
              ingrediente_id: ing.id,
              ingrediente_nombre: ing.nombre,
              tipo_movimiento: 'salida_venta',
              cantidad: totalDiscount,
              unidad_base: ing.unidad_base,
              stock_anterior: ing.stock_actual,
              stock_nuevo: newStock,
              costo_unitario_en_momento: ing.costo_por_unidad_base,
              costo_total_movimiento: totalDiscount * (ing.costo_por_unidad_base || 0),
              referencia_tipo: 'venta',
              referencia_id: venta.id,
              usuario_id: posUser?.id,
              usuario_nombre: posUser?.nombre,
              fecha: new Date().toISOString(),
            }).catch(() => {});

            await api.entidades.DescuentoInventarioVenta.create({
              venta_id: venta.id,
              producto_id: item.producto_id,
              ingrediente_id: ing.id,
              ingrediente_nombre: ing.nombre,
              cantidad_producto: item.cantidad,
              cantidad_ingrediente_por_producto: qtyPerProduct,
              cantidad_total_descontada: totalDiscount,
              unidad_base: ing.unidad_base,
              costo_unitario_snapshot: ing.costo_por_unidad_base,
              costo_total_descontado: totalDiscount * (ing.costo_por_unidad_base || 0),
              fecha: new Date().toISOString(),
            }).catch(() => {});
          }
        }

        // Send to kitchen/bar if needed
        if (item.area_preparacion && item.area_preparacion !== 'ninguno') {
          const areas =
            item.area_preparacion === 'ambos' ? ['cocina', 'barra'] : [item.area_preparacion];
          // 6B / 1.K — Item de cocina con campos variables si aplica.
          const itemCocina = {
            producto_id: item.producto_id,
            producto_nombre: item.nombre,
            cantidad: item.cantidad,
            notas: item.notas,
            estado: 'nuevo',
          };
          if (esVariable) {
            itemCocina.tipo_venta = item.tipo_venta;
            itemCocina.unidad_variable = item.unidad_variable || '';
            itemCocina.cantidad_variable = Number(item.cantidad_variable) || 0;
            itemCocina.nombre_porcion = item.nombre_porcion || '';
            itemCocina.cantidad_porciones = Number(item.cantidad_porciones) || 0;
          }
          for (const area of areas) {
            await api.entidades.PedidoPreparacion.create({
              venta_id: venta.id,
              venta_folio: folio,
              area,
              estado: 'nuevo',
              fecha_creacion: new Date().toISOString(),
              items: [itemCocina],
            }).catch(() => {});
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['ingredientes_all'] });
      queryClient.invalidateQueries({ queryKey: ['ventas_hoy'] });

      // Mostrar ticket final (snapshot defensivo)
      try {
        setTicketFinal({
          venta: { ...venta, ...paymentData, total, subtotal: total, estado: 'pagada' },
          detalles: detallesParaTicket,
        });
        setShowTicket(true);
      } catch (errTicket) {
        console.error('[POS] No se pudo mostrar ticket:', errTicket);
        toast.error(
          'La venta se cobró, pero no se pudo mostrar el ticket. Puedes verlo en Ventas/Registros.',
        );
      }

      setCart([]);
      setShowPayment(false);
      // Reset propina para la próxima venta
      setPropina({
        propina_monto: 0,
        propina_porcentaje: 0,
        propina_tipo: 'sin_propina',
        propina_origen: 'tradicional',
      });
      toast.success(`Venta ${folio} cobrada: ${formatCurrency(total)}`);
    } catch (err) {
      console.error('[POS] Error al cobrar:', err);
      toast.error('No se pudo completar la venta. Intenta de nuevo.');
    } finally {
      setProcessing(false);
    }
  };

  const handlePrintTicket = () => {
    try {
      printDocument({ mode: 'thermal', title: `Ticket-${ticketFinal?.venta?.folio || ''}` });
    } catch (e) {
      console.error('[POS] Error al imprimir:', e);
      toast.error('No se pudo iniciar la impresión.');
    }
  };

  // Pantalla bloqueada si no hay caja abierta
  if (!hayCaja) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-amber-700" />
          </div>
          <h2 className="font-heading font-bold text-lg text-amber-900">Caja cerrada</h2>
          <p className="text-sm text-amber-800">
            No se puede iniciar una nueva venta porque la caja está cerrada. Abre caja para comenzar
            operación.
          </p>
          <Link to="/caja">
            <Button className="gap-2">
              <DoorOpen className="w-4 h-4" /> Ir a Caja para abrirla
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)] gap-4 -m-4 md:-m-6 lg:-m-8">
      {/* Products panel */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        {/* Search + categories */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar producto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-10"
              />
            </div>
            {/* El escáner es de MOSTRADOR: se escanea una botella, no una orden
                de tacos. `canAccessModule` lo apaga en Restaurante Pro, y la
                regla vive en `packageConfig.js`, no aquí. */}
            {canAccessModule('escaner_codigo_barras') && (
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => setEscanerAbierto(true)}
                title="Escanear código de barras"
              >
                <ScanLine className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button
              variant={activeCategory === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveCategory('all')}
              className="shrink-0"
            >
              Todos
            </Button>
            {categorias.map((c) => (
              <Button
                key={c.id}
                variant={activeCategory === c.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveCategory(c.id)}
                className="shrink-0"
              >
                {c.nombre}
              </Button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={addToCart} showCost={showCost} />
            ))}
          </div>
        </div>

        {/* Mobile cart button */}
        <div className="lg:hidden pt-3">
          <Button
            onClick={() => setShowCartMobile(true)}
            className="w-full h-12 text-base gap-2"
            disabled={cart.length === 0}
          >
            <ShoppingCart className="w-5 h-5" />
            Ver orden ({cart.length}) · {formatCurrency(total)}
          </Button>
        </div>
      </div>

      {/* Desktop cart */}
      <div className="hidden lg:flex w-80 xl:w-96 border-l border-border bg-card flex-col">
        <CartPanel
          items={cart}
          onUpdateQty={updateQty}
          onRemove={removeItem}
          total={total}
          onCheckout={() => {
            if (tipsEnabled(config)) setShowPropina(true);
            else setShowPayment(true);
          }}
          onClear={() => setCart([])}
        />
      </div>

      {/* Mobile cart drawer */}
      {showCartMobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCartMobile(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-card shadow-xl flex flex-col">
            <CartPanel
              items={cart}
              onUpdateQty={updateQty}
              onRemove={removeItem}
              total={total}
              onCheckout={() => {
                setShowCartMobile(false);
                if (tipsEnabled(config)) setShowPropina(true);
                else setShowPayment(true);
              }}
              onClear={() => setCart([])}
            />
          </div>
        </div>
      )}

      {/* 6B / 1.K — Modal para capturar cantidad de productos variables. */}
      <CantidadVariableDialog
        open={!!productoVariable}
        producto={productoVariable}
        onClose={() => setProductoVariable(null)}
        onConfirm={handleConfirmVariable}
      />

      {/* El escáner de la tiendita, tal cual: cámara ZXing, lector físico,
          dedupe de 1200 ms y su flujo de «código no encontrado». `continuous`
          porque en un mostrador se escanea una compra entera de corrido, no un
          artículo y a cerrar. */}
      {canAccessModule('escaner_codigo_barras') && (
        <BarcodeScanner
          open={escanerAbierto}
          onClose={() => setEscanerAbierto(false)}
          onDetected={handleCodigoEscaneado}
          continuous
          miniCart={cart}
          onViewCart={() => {
            setEscanerAbierto(false);
            setShowCartMobile(true);
          }}
          onFinish={() => setEscanerAbierto(false)}
        />
      )}

      {/* Antes del cobro, preguntar propina. Si propinas están desactivadas, este modal nunca abre. */}
      <PropinaDialog
        open={showPropina}
        onOpenChange={setShowPropina}
        subtotal={total}
        origen="tradicional"
        porcentajesSugeridos={getPorcentajesSugeridos(config)}
        onConfirm={(data) => {
          setPropina(data);
          setShowPropina(false);
          setShowPayment(true);
        }}
      />

      <PaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        total={total}
        propinaMonto={Number(propina?.propina_monto) || 0}
        onConfirm={handleCheckout}
        loading={processing}
      />

      {/* Ticket final tras cobrar — defensivo con SafeBoundary */}
      <Dialog
        open={showTicket}
        onOpenChange={(v) => {
          if (!v) {
            setShowTicket(false);
            setTicketFinal(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Venta cobrada</DialogTitle>
          </DialogHeader>
          <SafeBoundary
            label="POSTicketFinal"
            fallbackTitle="No se pudo mostrar el ticket."
            fallbackMessage="La venta se cobró correctamente. Puedes verla en Ventas/Registros."
            onReset={() => {
              setShowTicket(false);
              setTicketFinal(null);
            }}
          >
            <div className="bg-muted/30 rounded-lg p-3 max-h-[60vh] overflow-y-auto">
              {ticketFinal?.venta ? (
                <PreCuentaTicket
                  venta={ticketFinal.venta}
                  detalles={Array.isArray(ticketFinal.detalles) ? ticketFinal.detalles : []}
                  config={config}
                  esFinal
                />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Sin datos del ticket.
                </p>
              )}
            </div>
          </SafeBoundary>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowTicket(false);
                setTicketFinal(null);
              }}
            >
              Cerrar
            </Button>
            <Button onClick={handlePrintTicket}>
              <Printer className="w-4 h-4 mr-1" /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
