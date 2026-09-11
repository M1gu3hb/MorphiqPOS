'use client';
import React, { useState, useMemo } from 'react';
import { api, nuevaClave } from '@/api/cliente';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { hasPermission } from '@/lib/permissions';
import { formatCurrency } from '@/utils/financialUtils';
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
import { TIPO_VENTA, esProductoVariable } from '@/utils/tipoVentaUtils';

/** Centavos del servidor (llegan como cadena) a los pesos que la interfaz pinta. */
const centavosAPesos = (valor) => (Number(valor) || 0) / 100;

/** Pesos de la interfaz a los centavos enteros que exige el comando. */
const aCentavos = (pesos) => Math.round((Number(pesos) || 0) * 100);

/**
 * Una cantidad para el comando: `numeric(14,4)`, nunca un float suelto.
 *
 * `String(0.1 + 0.2)` es «0.30000000000000004» y el esquema —cuatro decimales
 * como mucho— lo rechazaría. Cuatro decimales fijos es justo la escala de la
 * columna, así que ni se pierde precisión ni se inventa.
 */
const aCantidad = (valor) => (Number(valor) || 0).toFixed(4);

/**
 * El ticket del servidor con la forma que `PreCuentaTicket` ya pinta.
 *
 * Los importes son los CONGELADOS de la orden, no un recálculo: reimprimir con
 * el precio de hoy no reproduce el documento que se le dio al cliente. Y el
 * folio ya no se inventa en el navegador con `generateFolio` — lo asigna el
 * servidor con `UPDATE … RETURNING`, que es lo que impide dos ventas con el
 * mismo número.
 *
 * `impuestos` y `descuentos` no se pasan a propósito: el ticket de mostrador
 * nunca los ha enseñado —el precio de anaquel ya lleva el IVA— y añadir un
 * renglón cambiaría el documento de Miguel.
 */
function ventaDelTicket(ticket, cobro, folio, propina, cajero) {
  const pagos = Array.isArray(ticket?.pagos) ? ticket.pagos : [];
  const metodo = pagos[0]?.metodo || '';
  const propinaCentavos = Number(cobro?.propinaCentavos) || 0;
  // La propina se cobró con el mismo método que la venta, y este ticket siempre
  // ha enseñado en «Efectivo» lo que el cliente entregó, propina incluida.
  const cobradoPor = (m) =>
    centavosAPesos(
      pagos
        .filter((p) => p?.metodo === m)
        .reduce((s, p) => s + (Number(p?.montoCentavos) || 0), 0) +
        (m === metodo ? propinaCentavos : 0),
    );

  return {
    folio,
    fecha_cierre: ticket?.emitidoEn,
    estado: 'pagada',
    subtotal: centavosAPesos(ticket?.totalCentavos),
    total: centavosAPesos(ticket?.totalCentavos),
    metodo_pago: metodo,
    monto_efectivo: cobradoPor('efectivo'),
    monto_tarjeta: cobradoPor('tarjeta'),
    monto_transferencia: cobradoPor('transferencia'),
    cambio: centavosAPesos(cobro?.cambioCentavos),
    propina_monto: centavosAPesos(cobro?.propinaCentavos),
    propina_porcentaje: Number(propina?.propina_porcentaje) || 0,
    propina_tipo: propina?.propina_tipo || 'sin_propina',
    usuario_cajero_nombre: cajero?.nombre,
  };
}

/**
 * Las líneas del ticket, con los rótulos de una línea variable.
 *
 * `venta.ticket` devuelve los importes congelados pero no `tipo_venta`, y sin
 * él `formatearCantidadVariable` imprimiría «500×» donde hoy dice «500 g ×».
 * Se completan desde el carrito que se acaba de cobrar: las dos listas salen de
 * `orden_lineas` ordenadas por `orden_visual`, así que el índice casa.
 */
function detallesDelTicket(ticket, carrito) {
  const lineas = Array.isArray(ticket?.lineas) ? ticket.lineas : [];
  return lineas.map((l, i) => {
    const item = carrito?.[i];
    return {
      producto_nombre: l?.nombre,
      cantidad: Number(l?.cantidad) || 0,
      precio_unitario_snapshot: centavosAPesos(l?.precioUnitarioCentavos),
      subtotal: centavosAPesos(l?.importeCentavos),
      ...(item?.tipo_venta
        ? {
            tipo_venta_snapshot: item.tipo_venta,
            cantidad_variable_snapshot: item.cantidad_variable,
            unidad_variable_snapshot: item.unidad_variable,
            cantidad_porciones_snapshot: item.cantidad_porciones,
            nombre_porcion_snapshot: item.nombre_porcion,
          }
        : {}),
    };
  });
}

export default function POS() {
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
  /**
   * La clave de idempotencia del cobro, viva mientras el diálogo esté abierto.
   *
   * Se genera al ABRIR «Cobrar» y se reusa en cada intento: así un doble clic
   * en «Confirmar cobro», o un reintento de red, cobran UNA vez (F1-02 §8,
   * trampa T5). Una clave nueva por llamada no serviría de nada.
   */
  const [claveCobro, setClaveCobro] = useState(null);

  const { posUser } = usePOSAuth();
  const { config, canAccessModule } = useConfig();
  const queryClient = useQueryClient();
  const showCost = hasPermission(posUser?.rol, 'ver_costos');
  const { hayCaja } = useCajaAbierta();

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

  /**
   * El carrito, que es la orden en BORRADOR de esta terminal (P1-10).
   *
   * Ya no vive en un `useState`. Cada línea se persiste al agregarse y el
   * índice parcial `ordenes_borrador_por_terminal` garantiza UN solo borrador
   * por terminal, así que cerrar la pestaña y volver recupera exactamente lo
   * que había en vez de obligar al cajero a rehacer la venta de memoria.
   *
   * Sin `ordenId` el comando devuelve el borrador vivo de la terminal, o `null`
   * si todavía no hay ninguno: la orden no se crea hasta el primer producto.
   */
  const { data: estadoVenta } = useQuery({
    queryKey: ['venta_borrador'],
    queryFn: () => api.comandos.ejecutar('/api/venta/estado', {}),
    placeholderData: (prev) => prev,
  });
  const cotizacion = estadoVenta?.cotizacion ?? null;
  const ordenId = cotizacion?.ordenId ?? null;

  const productosPorId = useMemo(() => {
    const m = new Map();
    (Array.isArray(productos) ? productos : []).forEach((p) => {
      if (p?.id) m.set(p.id, p);
    });
    return m;
  }, [productos]);

  /**
   * Las líneas del servidor con la forma que `CartPanel` ya pinta.
   *
   * El precio, el subtotal y la cantidad son los del servidor: `precio_venta`
   * del carrito del navegador ya no se escribe en ninguna línea. Del catálogo
   * sólo se toma lo que la línea no trae y es PRESENTACIÓN —si es variable y
   * cómo se llama su porción—, nunca un importe.
   */
  const cart = useMemo(() => {
    const lineas = Array.isArray(cotizacion?.lineas) ? cotizacion.lineas : [];
    return lineas.map((l) => {
      const producto = productosPorId.get(l.productoId);
      const tipo = producto?.tipo_venta;
      const esMedida = tipo === TIPO_VENTA.VARIABLE_MEDIDA;
      const esPorcion = tipo === TIPO_VENTA.PORCION_CONTENEDOR;
      const cantidad = Number(l.cantidad) || 0;
      return {
        linea_id: l.id,
        producto_id: l.productoId,
        nombre: l.productoNombre,
        precio_venta: centavosAPesos(l.precioUnitarioCentavos),
        cantidad,
        notas: '',
        ...(esMedida || esPorcion
          ? {
              tipo_venta: tipo,
              subtotal_linea: centavosAPesos(l.subtotalCentavos),
              cantidad_variable: esMedida ? cantidad : 0,
              unidad_variable: esMedida ? l.unidad : '',
              cantidad_porciones: esPorcion ? cantidad : 0,
              nombre_porcion: esPorcion ? producto?.nombre_porcion || 'porción' : '',
            }
          : {}),
      };
    });
  }, [cotizacion, productosPorId]);

  const refrescarCarrito = () => queryClient.invalidateQueries({ queryKey: ['venta_borrador'] });

  const filtered = useMemo(() => {
    return productos.filter((p) => {
      const matchSearch = !search || p.nombre.toLowerCase().includes(search.toLowerCase());
      const matchCat = activeCategory === 'all' || p.categoria_id === activeCategory;
      return matchSearch && matchCat;
    });
  }, [productos, search, activeCategory]);

  // El total lo derivó el servidor de las líneas persistidas, con la regla de
  // impuesto del negocio. Sumarlo otra vez aquí sería el segundo sitio donde se
  // calcula un total, y en cuanto los dos discrepen el cajero cobra un número
  // que la pantalla nunca enseñó.
  const total = centavosAPesos(cotizacion?.totalCentavos);

  /** Abre el borrador de la terminal si aún no existe, y devuelve su id. */
  const asegurarOrden = async () => {
    if (ordenId) return ordenId;
    const orden = await api.comandos.ejecutar('/api/venta/crear-orden', {});
    return orden.ordenId;
  };

  /**
   * Devuelve si el producto se aceptó: la línea entró, o se abrió el diálogo de
   * cantidad. El escáner lo necesita para no cantar «agregado» sobre una línea
   * que el servidor rechazó —antes de esto el carrito era local y no podía
   * rechazar nada, así que el aviso siempre era cierto.
   */
  const addToCart = async (product) => {
    // 6B / 1.K — Si es variable, abrir modal de captura. NO se agrupa con
    // líneas anteriores (cada línea variable es independiente).
    if (esProductoVariable(product)) {
      setProductoVariable(product);
      return true;
    }
    try {
      // ---- precio_fijo (flujo histórico, intacto) ----
      // Se sigue agrupando: repetir un producto sube la cantidad de SU línea en
      // vez de abrir otra, que es lo que el cajero ve hoy. Lo que cambia es
      // quién lo escribe y quién pone el precio.
      const existente = cart.find((i) => i.producto_id === product.id && !i.tipo_venta);
      if (existente) {
        await api.comandos.ejecutar('/api/venta/cambiar-cantidad', {
          ordenId,
          lineaId: existente.linea_id,
          cantidad: aCantidad(existente.cantidad + 1),
        });
      } else {
        await api.comandos.ejecutar('/api/venta/agregar-linea', {
          ordenId: await asegurarOrden(),
          productoId: product.id,
          cantidad: aCantidad(1),
        });
      }
      await refrescarCarrito();
      return true;
    } catch (e) {
      toast.error(e?.message || 'No se pudo agregar el producto.');
      return false;
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
  const handleCodigoEscaneado = async (codigo) => {
    const limpio = String(codigo ?? '').trim();
    if (!limpio) return;
    const producto = (Array.isArray(productos) ? productos : []).find(
      (p) => String(p?.codigo_barras ?? '').trim() === limpio,
    );
    if (!producto) {
      toast.error(`Código ${limpio} no está en el catálogo`);
      return;
    }
    // El aviso espera a que la línea esté escrita. Cantarlo antes dejaba al
    // cajero escaneando la compra entera con la certeza de que iba entrando.
    if (await addToCart(producto)) toast.success(`${producto.nombre} agregado`);
  };

  /**
   * 6B / 1.K — Recibe snapshot del CantidadVariableDialog y crea línea variable.
   *
   * Al comando sólo viajan CANTIDAD y UNIDAD. El precio de la línea, el costo y
   * el consumo del insumo base los pone el catálogo dentro de la transacción:
   * `precio_total_linea` del diálogo se quedaba escrito tal cual en la venta, y
   * el costo salía de `Ingrediente.costo_por_unidad_base` leído en el navegador
   * —un campo que el puente ya no deja ni escribir.
   *
   * `porcion` como unidad no es capricho: el dominio exige un número entero de
   * porciones y con la unidad por omisión (`ml`) rechazaría la línea.
   */
  const handleConfirmVariable = async (snap) => {
    const producto = productoVariable;
    setProductoVariable(null);
    if (!producto || !snap) return;

    const esPorcion = snap.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR;
    // Sin unidad, la decide el catálogo. Mandarla vacía es distinto: el esquema
    // pide al menos un carácter y rechazaría la línea entera.
    const unidad = esPorcion ? 'porcion' : snap.unidad_variable || '';
    try {
      await api.comandos.ejecutar('/api/venta/agregar-linea', {
        ordenId: await asegurarOrden(),
        productoId: producto.id,
        cantidad: aCantidad(esPorcion ? snap.cantidad_porciones : snap.cantidad_variable),
        ...(unidad ? { unidad } : {}),
      });
      await refrescarCarrito();
    } catch (e) {
      toast.error(e?.message || 'No se pudo agregar el producto.');
    }
  };

  const updateQty = async (idx, qty) => {
    // En líneas variables no permitimos +/- (la cantidad real es la "variable").
    const item = cart?.[idx];
    if (
      item &&
      (item.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA ||
        item.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR)
    ) {
      return;
    }
    if (!item) return;
    if (qty <= 0) {
      removeItem(idx);
      return;
    }
    try {
      // El subtotal NO se reescala: el comando revalora la línea contra el
      // catálogo, porque el mayoreo cambia el precio unitario al cruzar su
      // mínimo y multiplicar el subtotal viejo se saltaría ese salto.
      await api.comandos.ejecutar('/api/venta/cambiar-cantidad', {
        ordenId,
        lineaId: item.linea_id,
        cantidad: aCantidad(qty),
      });
      await refrescarCarrito();
    } catch (e) {
      toast.error(e?.message || 'No se pudo cambiar la cantidad.');
    }
  };

  const removeItem = async (idx) => {
    const item = cart?.[idx];
    if (!item) return;
    try {
      await api.comandos.ejecutar('/api/venta/quitar-linea', {
        ordenId,
        lineaId: item.linea_id,
      });
      await refrescarCarrito();
    } catch (e) {
      toast.error(e?.message || 'No se pudo quitar el producto.');
    }
  };

  /**
   * «Limpiar»: quita las líneas una a una.
   *
   * No hay comando de «vaciar orden» y no se inventa uno desde el navegador. Si
   * una línea no se puede quitar se para ahí y se dice por qué, en vez de dejar
   * la pantalla vacía con la orden a medias en la base.
   */
  const limpiarCarrito = async () => {
    try {
      for (const item of cart) {
        await api.comandos.ejecutar('/api/venta/quitar-linea', {
          ordenId,
          lineaId: item.linea_id,
        });
      }
    } catch (e) {
      toast.error(e?.message || 'No se pudo limpiar la orden.');
    }
    await refrescarCarrito();
  };

  /**
   * Abrir el diálogo de cobro, y con él la clave de idempotencia de ESTA venta.
   *
   * La clave se genera aquí, al abrir, no en cada llamada: es lo único que hace
   * que un doble clic en «Confirmar cobro» —o un reintento tras un timeout de
   * red que sí llegó al servidor— cobre una vez y no dos.
   */
  const abrirCobro = () => {
    setClaveCobro(nuevaClave());
    setShowPayment(true);
  };

  const cerrarCobro = () => {
    setShowPayment(false);
    setClaveCobro(null);
  };

  /**
   * El cobro (F1.1-A-09). UNA llamada, UNA transacción.
   *
   * `venta.cobrar` congela los totales sobre las líneas que está cerrando, toma
   * el folio, reparte los pagos con su propina, mueve la caja Y DESCUENTA EL
   * INVENTARIO contra el ledger inmutable. O confirma todo, o no persiste nada.
   *
   * ── Lo que desapareció de aquí, y por qué ─────────────────────────────────
   * · El descuento de stock a mano —`Ingrediente.update({stock_actual})` más
   *   `MovimientoInventario.create`, seis `.catch(() => {})` entre las dos
   *   ramas (F1-06 §4.2)—. El comando ya lo hace dentro de su transacción, así
   *   que dejarlo aquí descontaría DOS VECES lo mismo. Y `stock_actual` es un
   *   campo que el puente ya no deja escribir: el stock se mueve por el ledger.
   * · La validación de stock del navegador. La hace el servidor dentro de la
   *   transacción, producto a producto y con el `permite_venta_sin_stock` de
   *   cada uno; su mensaje —«No hay inventario suficiente para completar la
   *   venta.»— es el que se enseña. La del navegador leía `stock_actual` y con
   *   un `config.permitir_venta_sin_stock` global podía frenar una venta que el
   *   servidor sí permite.
   * · El folio inventado con `generateFolio`, y `costoTotal`, `utilidad` y
   *   `margen` calculados en el carrito. Los cuatro los devuelve el servidor.
   */
  const handleCheckout = async (paymentData) => {
    // Bloqueo: no permitir cobrar si la caja está cerrada.
    if (!hayCaja) {
      toast.error('No hay caja abierta. Abre caja para cobrar.');
      return;
    }
    if (processing) return; // evitar doble cobro
    if (!ordenId || cart.length === 0) {
      toast.error('El carrito está vacío.');
      return;
    }
    setProcessing(true);

    // El carrito de ANTES de cobrar: el ticket lo necesita para los rótulos de
    // las líneas variables, y después de cobrar el borrador ya no existe.
    const carritoCobrado = cart;

    try {
      // Los centavos del servidor, tal cual llegaron. No se reconstruyen desde
      // los pesos de la pantalla: `total` es sólo su representación para pintar.
      const totalCentavos = Number(cotizacion?.totalCentavos) || 0;
      const propinaCentavos = aCentavos(propina?.propina_monto);
      const esEfectivo = paymentData?.metodo_pago === 'efectivo';
      const recibidoCentavos = aCentavos(paymentData?.monto_recibido);

      const cobro = await api.comandos.ejecutar(
        '/api/venta/cobrar',
        {
          ordenId,
          // Lo que la pantalla enseñó. NO decide el cobro: si no coincide con
          // lo que el servidor recalcula, el comando lo RECHAZA con el total
          // correcto en vez de cobrar otro número en silencio, porque al
          // cliente ya se le dijo una cifra en voz alta.
          totalEsperadoCentavos: totalCentavos,
          pagos: [
            {
              metodo: paymentData.metodo_pago,
              // La VENTA, sin propina. La propina viaja aparte y jamás se suma
              // al total (regla 1 de F1-01 §3).
              montoCentavos: totalCentavos,
              ...(propinaCentavos > 0 ? { propinaCentavos } : {}),
              ...(esEfectivo && recibidoCentavos > 0 ? { recibidoCentavos } : {}),
            },
          ],
          propinaTipo: propina?.propina_tipo || 'sin_propina',
          propinaOrigen: propina?.propina_origen || 'tradicional',
          // En PUNTOS BASE enteros: 15 % es 1500. `0.15` no existe exacto en
          // punto flotante y en una propina se nota.
          propinaPuntosBase: Math.round((Number(propina?.propina_porcentaje) || 0) * 100),
        },
        claveCobro,
      );

      const ticket = await api.comandos.ejecutar('/api/venta/ticket', { ordenId: cobro.ordenId });
      const folio = ticket?.folio ? `${ticket.serie}-${ticket.folio}` : ticket?.serie || '';

      queryClient.invalidateQueries({ queryKey: ['venta_borrador'] });
      queryClient.invalidateQueries({ queryKey: ['ingredientes_all'] });
      queryClient.invalidateQueries({ queryKey: ['ventas_hoy'] });

      // Mostrar ticket final (snapshot defensivo)
      setTicketFinal({
        venta: ventaDelTicket(ticket, cobro, folio, propina, posUser),
        detalles: detallesDelTicket(ticket, carritoCobrado),
      });
      setShowTicket(true);

      cerrarCobro();
      // Reset propina para la próxima venta
      setPropina({
        propina_monto: 0,
        propina_porcentaje: 0,
        propina_tipo: 'sin_propina',
        propina_origen: 'tradicional',
      });
      toast.success(
        `Venta ${folio} cobrada: ${formatCurrency(centavosAPesos(ticket?.totalCentavos))}`,
      );
    } catch (err) {
      // El mensaje llega del dominio, en español y diciendo QUÉ pasó: «Abre la
      // caja antes de cobrar.», «No hay inventario suficiente para completar la
      // venta.», «El total cambió desde que se mostró en pantalla.». Antes esto
      // era un «No se pudo completar la venta» que no distinguía ninguno de los
      // tres, y el cajero volvía a intentarlo sin saber qué corregir.
      toast.error(err?.message || 'No se pudo completar la venta. Intenta de nuevo.');
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
            else abrirCobro();
          }}
          onClear={limpiarCarrito}
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
                else abrirCobro();
              }}
              onClear={limpiarCarrito}
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
          abrirCobro();
        }}
      />

      <PaymentModal
        open={showPayment}
        onClose={cerrarCobro}
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
