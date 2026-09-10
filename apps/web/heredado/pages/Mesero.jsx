'use client';
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { api, nuevaClave } from '@/api/cliente';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
// `generateFolio` se fue con `Venta.create`: el folio lo pone `abrir_mesa`
// dentro de su transacción, y dos pestañas ya no pueden inventar el mismo.
import { formatCurrency } from '@/utils/financialUtils';
import { toast } from 'sonner';
import {
  UtensilsCrossed,
  Send,
  Receipt,
  ChefHat,
  Search,
  Users,
  Printer,
  Sparkles,
} from 'lucide-react';
// `ventaTotales` ya no se importa aquí: el subtotal, el costo y el margen los
// devuelve `enviar_pedido` calculados sobre las líneas que acaba de escribir,
// en la misma transacción. Sumar detalles en el navegador era la mitad del
// defecto D-05 y todo el «HOTFIX 6A — rescate de totales en CERO».
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { MESA_STATUS_CONFIG, ZONAS_MESA } from '@/lib/constants';
import MesaShape from '@/components/mesas/MesaShape';
import MesaGridMobile from '@/components/mesero/MesaGridMobile';
import MeseroCartFAB from '@/components/mesero/MeseroCartFAB';
import PreCuentaTicket from '@/components/tickets/PreCuentaTicket';
import PropinaDialog from '@/components/propinas/PropinaDialog';
import SoundUnlockButton from '@/components/common/SoundUnlockButton';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import MesaHuerfanaDialog from '@/components/mesero/MesaHuerfanaDialog';
import ProductoFichaExpandible from '@/components/mesero/ProductoFichaExpandible';
import SolicitudesQRPanel from '@/components/mesero/SolicitudesQRPanel';
import SolicitudesQRCardList from '@/components/mesero/SolicitudesQRCardList';
import AlertasMeseroDialog from '@/components/mesero/AlertasMeseroDialog';
import SeleccionModificadoresDialog from '@/components/mesero/SeleccionModificadoresDialog';
import ListosParaRecogerCard from '@/components/mesero/ListosParaRecogerCard';
import AbrirMesaDialog from '@/components/mesero/AbrirMesaDialog';
import CantidadVariableDialog from '@/components/mesero/CantidadVariableDialog';
import { TIPO_VENTA, formatearCantidadVariable } from '@/utils/tipoVentaUtils';
import PrecioProductoMesero, { VariableBadge } from '@/components/mesero/PrecioProductoMesero';
import { Bell, Volume2 } from 'lucide-react';
import { useCajaAbierta } from '@/lib/useCajaAbierta';
import { useIsDark } from '@/lib/ThemeContext';
import { FLOOR_BG } from '@/lib/darkPalettes';
import { printDocument } from '@/lib/print';
import { tipsEnabled, getPorcentajesSugeridos } from '@/utils/tipsUtils';
import {
  asignacionActiva,
  filtrarMesasParaUsuario,
  responsableTexto,
  responsableColor,
  // `colorParaUsuario` ya no se importa: el color de quien atiende lo DERIVA el
  // puente de `empleos.color` al leer la mesa. Mandarlo desde aquí creaba una
  // tercera copia del mismo dato que envejecía sola.
} from '@/lib/asignacionMesas';
import { ROLES } from '@/lib/constants';

const MAP_HEIGHT = 600;
// Hook simple para detectar móvil
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 768,
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
};
// `generarCodigoCaja` se fue: el código de caja lo genera `solicitar_cuenta` en
// el servidor con `crypto.getRandomValues`, y REUSA el anterior si la cuenta ya
// se pidió una vez. Generarlo aquí con `Math.random` daba un código nuevo en
// cada intento y dejaba al cajero buscando un número que ya no existía.

/**
 * Convierte una cantidad a la cadena decimal que aceptan los comandos.
 *
 * `orden_lineas.cantidad` es `numeric(14,4)`: viaja como texto porque un float
 * en JSON ya no es el número que se capturó. Devuelve `null` cuando la cantidad
 * no es positiva, para que la línea no llegue a salir.
 */
const cantidadParaComando = (valor) => {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  const texto = numero.toFixed(4);
  return texto.replace(/0+$/, '').replace(/\.$/, '');
};

export default function MeseroWithBoundary() {
  return (
    <ErrorBoundary
      fallbackTitle="Ocurrió un error al mostrar esta mesa."
      fallbackMessage="Volvamos al mapa para que puedas continuar."
    >
      <Mesero />
    </ErrorBoundary>
  );
}

function Mesero() {
  const { posUser } = usePOSAuth();
  const { config } = useConfig();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const isDark = useIsDark();
  const floor = isDark ? FLOOR_BG.dark : FLOOR_BG.light;
  const { hayCaja: cajaAbiertaActiva, refetch: refetchCaja } = useCajaAbierta();

  const [zonaActiva, setZonaActiva] = useState('Interior');
  const [mesaActiva, setMesaActiva] = useState(null);
  const [ventaActiva, setVentaActiva] = useState(null);
  const [detallesVenta, setDetallesVenta] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');
  const [loading, setLoading] = useState(false);
  const [notaMesa, setNotaMesa] = useState('');

  // Open table modal (6A: ahora con alergias + celebración)
  const [showAbrirMesa, setShowAbrirMesa] = useState(false);
  const [mesaParaAbrir, setMesaParaAbrir] = useState(null);
  const [abriendoMesa, setAbriendoMesa] = useState(false);

  // Pre-cuenta print
  const [showPreCuenta, setShowPreCuenta] = useState(false);
  const [preCuentaData, setPreCuentaData] = useState(null);

  // Propina (RP — antes de pedir cuenta)
  const [showPropinaMesero, setShowPropinaMesero] = useState(false);

  // Reparación de mesa huérfana (estado != libre pero sin venta_activa_id)
  const [mesaHuerfana, setMesaHuerfana] = useState(null);
  const [liberandoHuerfana, setLiberandoHuerfana] = useState(false);

  // Solicitudes QR del Portal — panel modal
  const [showSolicitudesQR, setShowSolicitudesQR] = useState(false);
  // Configuración personal de alertas/voz del mesero
  const [showAlertasMesero, setShowAlertasMesero] = useState(false);
  // Modal de selección de modificadores al agregar producto
  const [productoParaPersonalizar, setProductoParaPersonalizar] = useState(null);
  // 6B / 1.D — Modal de cantidad/porción para productos variables
  const [productoVariable, setProductoVariable] = useState(null);
  const { data: solicitudesPendRaw = [] } = useQuery({
    queryKey: ['solicitudes_qr_mesero_count'],
    queryFn: () => api.entidades.SolicitudQR.filter({ estado: 'pendiente' }),
    initialData: [],
    refetchInterval: 6000,
    enabled: config?.portal_qr_activo === true,
  });
  // Cuenta filtrada según asignación
  const solicitudesActivas = useMemo(() => {
    const arr = Array.isArray(solicitudesPendRaw) ? solicitudesPendRaw : [];
    if (!posUser) return arr;
    if (posUser.rol === ROLES.ADMIN) return arr;
    if (posUser.rol !== ROLES.WAITER) return [];
    if (!asignacionActiva(config)) return arr;
    return arr.filter((s) => !s?.mesero_destino_id || s.mesero_destino_id === posUser.id);
  }, [solicitudesPendRaw, posUser, config]);

  // Refs para evitar doble cierre y cerrar el sheet hijo antes que el Dialog
  const cartFabRef = useRef(null);
  const isClosingRef = useRef(false);

  // Claves de idempotencia (F1-02 §8, trampa T5). Una por diálogo abierto y
  // reusada mientras siga abierto: el segundo toque en «Abrir mesa», «Enviar a
  // Cocina» o «Solicitar cuenta» describe el MISMO hecho, y con la misma clave
  // el servidor devuelve el primer resultado en vez de crear una segunda cuenta,
  // duplicar las líneas del pedido o emitir otro código de caja. Se limpian al
  // terminar bien para que el siguiente envío de la misma mesa sea uno nuevo.
  const claveAbrirRef = useRef(null);
  const claveEnvioRef = useRef(null);
  const claveCuentaRef = useRef(null);

  // Sin initialData:[] (evita "no hay mesas" antes del primer fetch).
  const { data: mesasRaw, isPending: mesasLoading } = useQuery({
    queryKey: ['mesas'],
    queryFn: () => api.entidades.Mesa.filter({ activo: true }),
    refetchInterval: 5000,
    placeholderData: (prev) => prev,
    staleTime: 3000,
  });
  const mesasRawSafe = Array.isArray(mesasRaw) ? mesasRaw : [];
  const cargandoMesas = mesasLoading && !mesasRaw;

  // Filtro por asignación: admin ve todas, mesero ve sus asignadas si está activo.
  const mesas = useMemo(
    () => filtrarMesasParaUsuario(mesasRawSafe, posUser, config),
    [mesasRawSafe, posUser, config],
  );
  const asignActiva = asignacionActiva(config);
  const sinMesasAsignadas =
    asignActiva && posUser?.rol === ROLES.WAITER && mesas.length === 0 && mesasRawSafe.length > 0;

  // Helper que MesaShape/MesaGridMobile usan para pintar la banda de color.
  const getResponsable = useCallback(
    (mesa) => {
      const nombre = responsableTexto(mesa, config);
      const color = responsableColor(mesa, config);
      if (!nombre && !color) return null;
      return { nombre, color };
    },
    [config],
  );

  // HOTFIX 6A.3: removemos initialData:[] para distinguir "todavía cargando"
  // de "ya cargó y está vacío". En móvil con red lenta, mostrar "Sin productos"
  // antes del primer fetch era el bug visible.
  const {
    data: productos,
    isFetched: productosFetched,
    isLoading: productosLoading,
  } = useQuery({
    queryKey: ['productos_pos'],
    queryFn: () => api.entidades.ProductoTerminado.filter({ activo: true, visible_en_pos: true }),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });
  const productosArr = Array.isArray(productos) ? productos : [];
  const cargandoProductos = !productosFetched && productosLoading;

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias'],
    // FIX: filtrar activo:true para que categorías eliminadas no sigan
    // apareciendo como pills en el listado de productos del mesero.
    queryFn: () => api.entidades.CategoriaProducto.filter({ activo: true }, 'orden'),
    initialData: [],
  });

  // F3: la lista de estaciones ya no se descarga aquí. El ruteo producto →
  // categoría → estación lo resuelve `enviar_pedido` con `resolverEstacion`
  // dentro de su transacción, y con la estación general como respaldo
  // obligatorio. Cuando ese ruteo vivía en el navegador, una lectura fallida
  // mandaba el pedido entero a la cocina genérica en vez de a la barra.

  const productosFiltrados = useMemo(() => {
    let list = productosArr;
    if (categoriaFiltro !== 'todas') list = list.filter((p) => p?.categoria_id === categoriaFiltro);
    if (busquedaProducto) {
      const q = busquedaProducto.toLowerCase();
      list = list.filter((p) => (p?.nombre || '').toLowerCase().includes(q));
    }
    return list;
  }, [productosArr, categoriaFiltro, busquedaProducto]);

  const totalCarrito = useMemo(
    () => carrito.reduce((s, i) => s + i.precio_venta * i.cantidad, 0),
    [carrito],
  );
  const totalActual = useMemo(
    () => detallesVenta.reduce((s, d) => s + (d.subtotal || 0), 0),
    [detallesVenta],
  );

  const mesasZona = (mesas || []).filter((m) => (m?.zona || 'Interior') === zonaActiva);
  const zonasConCount = ZONAS_MESA.map((z) => ({
    zona: z,
    count: (mesas || []).filter((m) => (m?.zona || 'Interior') === z).length,
  })).filter((z) => z.count > 0);

  // — Click on mesa
  const onMesaClick = async (mesa) => {
    if (!mesa || !mesa.id) {
      toast.error('Mesa inválida');
      return;
    }
    try {
      // Bloqueo defensivo: si la asignación está activa y la mesa no es mía y no soy admin,
      // no debería poder abrirla. (En la práctica ya no la verá, pero protegemos por si llega.)
      if (
        asignActiva &&
        posUser?.rol === ROLES.WAITER &&
        mesa.mesero_asignado_id &&
        mesa.mesero_asignado_id !== posUser.id
      ) {
        toast.error(`Esta mesa está asignada a ${mesa.mesero_asignado_nombre || 'otro mesero'}.`);
        return;
      }
      if (mesa.estado === 'libre') {
        claveAbrirRef.current = nuevaClave();
        setMesaParaAbrir(mesa);
        setShowAbrirMesa(true);
        return;
      }
      if (mesa.estado === 'limpieza') {
        if (!confirm('¿Marcar mesa como limpia y disponible?')) return;
        // `liberar_mesa` deja la mesa igual que estos diez campos sueltos, pero
        // en una transacción: `Mesa.estado` y `Mesa.venta_activa_id` ya no se
        // escriben desde el navegador, que es lo que permitía «mesa libre con
        // venta viva». Y si falla, falla — antes el `.catch(() => {})` de
        // Caja.jsx:462 dejaba la mesa ocupada apuntando a una venta cancelada.
        await api.comandos.ejecutar('/api/restaurante/liberar-mesa', { mesaId: mesa.id });
        queryClient.invalidateQueries({ queryKey: ['mesas'] });
        toast.success(`Mesa ${mesa.numero} lista`);
        return;
      }
      // Mesa huérfana: estado != libre pero sin venta_activa_id ⇒ ofrecer reparación
      if (!mesa.venta_activa_id) {
        setMesaHuerfana(mesa);
        return;
      }
      // Open existing sale
      setLoading(true);
      setCarrito([]);
      setBusquedaProducto('');
      setCategoriaFiltro('todas');
      setMesaActiva(mesa);
      if (mesa.venta_activa_id) {
        // Sin `.catch(() => null)` ni `.catch(() => [])`: el puente ya
        // distingue «no hay cuenta» de «no pude leerla», y esos dos rellenos
        // volvían a confundirlo — la mesa ocupada se abría como si no tuviera
        // cuenta y el mesero creía que no se había pedido nada (F1-06 §4.3).
        const venta = await api.entidades.Venta.get(mesa.venta_activa_id);
        const detalles = await api.entidades.DetalleVenta.filter({ venta_id: venta.id });
        setVentaActiva(venta);
        setDetallesVenta(Array.isArray(detalles) ? detalles : []);
      } else {
        setVentaActiva(null);
        setDetallesVenta([]);
      }
    } catch (err) {
      console.error('[Mesero] onMesaClick error:', err);
      toast.error(err?.message || 'No se pudo abrir la mesa');
      setVentaActiva(null);
      setDetallesVenta([]);
    } finally {
      setLoading(false);
    }
  };

  const confirmarAbrirMesa = async (formData) => {
    if (!mesaParaAbrir?.id) {
      toast.error('Mesa inválida');
      setShowAbrirMesa(false);
      return;
    }
    if (abriendoMesa) return;
    setAbriendoMesa(true);
    try {
      const personas = parseInt(formData?.personas) || 1;
      const cliente = (formData?.cliente_nombre || '').trim();
      const alergias = (formData?.notas_alergias || '').trim();
      const celebracion = formData?.celebracion_especial === true;
      const tipoCele = (formData?.tipo_celebracion || '').trim();
      // D-16, la mesa huérfana: la venta se creaba y el `Mesa.update` que la
      // ataba iba detrás con un `.catch(() => {})`. Si fallaba quedaba una
      // cuenta abierta que ninguna mesa referenciaba y un toast que decía
      // «Mesa N abierta». `abrir_mesa` escribe orden y mesa en UNA transacción:
      // o las dos, o ninguna. El folio, el mesero que atiende y el estado los
      // pone el servidor — de ahí que ya no se manden.
      if (claveAbrirRef.current === null) claveAbrirRef.current = nuevaClave();
      const r = await api.comandos.ejecutar(
        '/api/restaurante/abrir-mesa',
        {
          mesaId: mesaParaAbrir.id,
          personas,
          clienteNombre: cliente,
          notas: formData?.notas || '',
          notasAlergias: alergias,
          celebracionEspecial: celebracion,
          tipoCelebracion: celebracion ? tipoCele : '',
        },
        claveAbrirRef.current,
      );
      // La cuenta se relee por el puente para pintarla tal como quedó en la
      // base (folio incluido) en vez de fabricarla en memoria.
      const venta = await api.entidades.Venta.get(r.ordenId);
      claveAbrirRef.current = null;
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      setShowAbrirMesa(false);
      // Open the sale dialog directly
      setMesaActiva({
        ...mesaParaAbrir,
        estado: r.estadoMesa,
        venta_activa_id: r.ordenId,
        personas_actuales: personas,
        cliente_temporal: cliente,
        notas_alergias: alergias,
        celebracion_especial: celebracion,
        tipo_celebracion: celebracion ? tipoCele : '',
      });
      setVentaActiva(venta);
      setDetallesVenta([]);
      setMesaParaAbrir(null);
      toast.success(`Mesa ${r.mesaNumero} abierta`);
    } catch (err) {
      console.error('[Mesero] confirmarAbrirMesa error:', err);
      // El dominio ya traduce: «esa mesa ya está abierta» dice más que
      // «No se pudo abrir la mesa».
      toast.error(err?.message || 'No se pudo abrir la mesa. Intenta de nuevo.');
      setShowAbrirMesa(false);
    } finally {
      setAbriendoMesa(false);
    }
  };

  // Cierre seguro: solo limpia estados locales, no toca BD ni la mesa.
  // 1. Cierra el bottom sheet hijo PRIMERO (evita que AnimatePresence intente desmontar
  //    un nodo después de que Radix ya removió el portal padre → causa removeChild).
  // 2. Espera 2 frames a que terminen las animaciones de salida.
  // 3. Limpia el estado local.
  // Usa isClosingRef para evitar doble ejecución (X custom + onOpenChange + ESC).
  const cerrarDialog = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    try {
      // Cerrar primero el sheet del carrito si está abierto
      if (cartFabRef.current?.isOpen?.()) {
        cartFabRef.current.close();
      }
    } catch (e) {
      console.error('[Mesero] cerrar sheet hijo:', e);
    }
    // Esperar a que terminen animaciones de salida del sheet antes de
    // desmontar el Dialog padre. 2 rAF ≈ ~32ms es suficiente para Framer.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          setMesaActiva(null);
          setVentaActiva(null);
          setDetallesVenta([]);
          setCarrito([]);
          setNotaMesa('');
          setLoading(false);
        } catch (err) {
          console.error('[Mesero] cerrarDialog error:', err);
        } finally {
          // Reset del flag tras un pequeño margen para permitir reapertura
          setTimeout(() => {
            isClosingRef.current = false;
          }, 100);
        }
      });
    });
  }, []);

  // Detecta si el producto tiene modificadores activos con opciones activas.
  // Si los tiene, abrimos modal de personalización; si no, agregamos directo.
  const productoTieneModificadores = (producto) => {
    const arr = Array.isArray(producto?.modificadores) ? producto.modificadores : [];
    return arr.some(
      (g) =>
        g?.activo !== false &&
        String(g?.nombre || '').trim() &&
        (Array.isArray(g.opciones) ? g.opciones : []).some(
          (o) => o?.activo !== false && String(o?.nombre || '').trim(),
        ),
    );
  };

  const agregarAlCarrito = (producto) => {
    // 6B / 1.D — Si es producto variable, abrir modal de cantidad/porción.
    // El flujo de modificadores y precio_fijo queda intacto.
    if (
      producto?.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA ||
      producto?.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR
    ) {
      setProductoVariable(producto);
      return;
    }
    if (productoTieneModificadores(producto)) {
      // Abrir modal — la confirmación se procesa en confirmarPersonalizacion
      setProductoParaPersonalizar(producto);
      return;
    }
    setCarrito((prev) => {
      const existe = prev.find((i) => i.id === producto.id);
      if (existe)
        return prev.map((i) => (i.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      return [
        ...prev,
        {
          ...producto,
          cantidad: 1,
          notas: '',
          _notaUsuario: '',
          _exclusiones: [],
          _modificadores: [],
        },
      ];
    });
  };

  // 6B / 1.D — Confirma el modal de cantidad/porción y agrega línea nueva al carrito.
  // Cada línea variable es independiente (no agrupa) porque cada cantidad puede diferir.
  // El item lleva flag `_variable` con todos los snapshots; `precio_venta` y `cantidad`
  // se setean para que totalCarrito, ProductoFichaExpandible y enviarPedido funcionen
  // sin tocar su lógica (precio_venta * cantidad = precio_total_linea con cantidad=1).
  const confirmarCantidadVariable = (snapshot) => {
    const producto = productoVariable;
    if (!producto || !snapshot) {
      setProductoVariable(null);
      return;
    }
    const precioLinea = Number(snapshot?.precio_total_linea) || 0;
    setCarrito((prev) => [
      ...prev,
      {
        ...producto,
        // En carrito: cantidad lógica = 1 (la cantidad real está en _variable)
        cantidad: 1,
        // precio_venta efectivo = precio total ya calculado (incluye cantidad real)
        precio_venta: precioLinea,
        notas: '',
        _notaUsuario: '',
        _exclusiones: [],
        _modificadores: [],
        _variable: snapshot, // bandera con todos los snapshots para enviarPedido
      },
    ]);
    setProductoVariable(null);
  };

  // Confirma el modal de personalización: agrega línea NUEVA al carrito
  // (no agrupa con líneas iguales sin modificadores, porque cada combinación
  // de opciones puede ser distinta — más simple y correcto).
  const confirmarPersonalizacion = ({ modificadores, notas }) => {
    const producto = productoParaPersonalizar;
    if (!producto) return;
    // Texto plano para mostrar en carrito/cocina (sin JSON crudo).
    const textoMod = (Array.isArray(modificadores) ? modificadores : [])
      .filter((m) => m && Array.isArray(m.opciones) && m.opciones.length > 0)
      .map(
        (m) =>
          `${m.grupo_nombre}: ${m.opciones
            .map((o) => o.nombre)
            .filter(Boolean)
            .join(', ')}`,
      )
      .join(' · ');
    const notasFinales = [textoMod, (notas || '').trim()].filter(Boolean).join(' · ');
    setCarrito((prev) => [
      ...prev,
      {
        ...producto,
        cantidad: 1,
        notas: notasFinales,
        _notaUsuario: (notas || '').trim(),
        _exclusiones: [],
        _modificadores: Array.isArray(modificadores) ? modificadores : [],
      },
    ]);
    setProductoParaPersonalizar(null);
  };

  // Actualiza la nota final que viajará a cocina para un item del carrito.
  const actualizarNotasItem = (id, nuevasNotas) => {
    setCarrito((prev) =>
      prev.map((i) =>
        i?.id === id
          ? { ...i, notas: nuevasNotas || '', _notaUsuario: nuevasNotas || i._notaUsuario || '' }
          : i,
      ),
    );
  };
  const actualizarExclusionesItem = (id, exclusiones) => {
    setCarrito((prev) =>
      prev.map((i) =>
        i?.id === id ? { ...i, _exclusiones: Array.isArray(exclusiones) ? exclusiones : [] } : i,
      ),
    );
  };

  const cambiarCantidad = (id, delta) => {
    setCarrito((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, cantidad: i.cantidad + delta } : i))
        .filter((i) => i.cantidad > 0),
    );
  };

  const enviarPedido = async () => {
    if (!Array.isArray(carrito) || carrito.length === 0) {
      toast.error('El carrito está vacío');
      return;
    }
    const mesaRef = mesaActiva;
    const ventaRef = ventaActiva;
    if (!mesaRef?.id) {
      toast.error('No hay mesa activa');
      return;
    }
    if (!ventaRef?.id) {
      toast.error('No hay venta activa para esta mesa');
      return;
    }

    setLoading(true);
    try {
      // D-05, los «detalles shadow»: cada `DetalleVenta.create` iba con su
      // propio catch y, cuando uno fallaba, la línea que NO se pudo crear se
      // conservaba en memoria y se sumaba al total. La cuenta enseñaba
      // productos que no existían en la base y el toast decía «tardaron en
      // guardarse» — no tardaron: fallaron.
      //
      // `enviar_pedido` escribe líneas, comandas e items en UNA transacción: o
      // entran todas o no entra ninguna, así que no hay estado intermedio que
      // rescatar. Con ello se van también el `PedidoPreparacion.create` por
      // estación (lo agrupa el servidor), el `Venta.update` de totales (los
      // calcula sobre las líneas que acaba de escribir) y el `Mesa.update` a
      // `pedido_enviado` con `.catch(() => {})` que hacía mentir al mapa.
      //
      // NINGÚN precio viaja: el catálogo lo pone dentro de la transacción.
      const lineas = [];
      for (const item of carrito) {
        const variableSnap = item?._variable || null;
        // Para un producto variable la cantidad REAL es la del snapshot (peso o
        // porciones), no el 1 lógico con el que el carrito lo agrupa. Mandar 1
        // haría que el servidor cobrara una unidad en vez de los 350 g.
        const cantidadCruda =
          variableSnap?.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA
            ? variableSnap.cantidad_variable
            : variableSnap?.tipo_venta === TIPO_VENTA.PORCION_CONTENEDOR
              ? variableSnap.cantidad_porciones
              : item.cantidad;
        const cantidad = cantidadParaComando(cantidadCruda);
        if (cantidad === null) {
          toast.error(`La cantidad de ${item?.nombre || 'un producto'} no es válida.`);
          return;
        }
        const linea = {
          productoId: item.id,
          cantidad,
          // `notas` ya trae los modificadores en texto plano (los arma
          // `confirmarPersonalizacion`), que es lo que cocina lee.
          notas: item.notas || '',
        };
        if (
          variableSnap?.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA &&
          variableSnap.unidad_variable
        ) {
          linea.unidad = variableSnap.unidad_variable;
        }
        lineas.push(linea);
      }

      if (claveEnvioRef.current === null) claveEnvioRef.current = nuevaClave();
      await api.comandos.ejecutar(
        '/api/restaurante/enviar-pedido',
        { ordenId: ventaRef.id, lineas, notas: notaMesa || '' },
        claveEnvioRef.current,
      );
      // Clave consumida: el siguiente tiempo que mande esta misma mesa es otro
      // hecho y necesita su propia clave.
      claveEnvioRef.current = null;

      // Releemos cuenta y líneas por el puente. El total viene ya calculado por
      // el servidor y convertido a pesos por el mapa, así que la pantalla no
      // vuelve a sumar dinero.
      const [ventaFresca, detallesFrescos] = await Promise.all([
        api.entidades.Venta.get(ventaRef.id),
        api.entidades.DetalleVenta.filter({ venta_id: ventaRef.id }),
      ]);

      // F3.1 + BLOQUE 0: invalidar+refetch para que el pedido aparezca en vivo
      // en Cocina y en el watcher de "listos" del propio Mesero, sin polling.
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      queryClient.invalidateQueries({ queryKey: ['pedidos_cocina'] });
      queryClient.invalidateQueries({ queryKey: ['pedidos_listos_watcher'] });
      queryClient.refetchQueries({ queryKey: ['pedidos_cocina'], type: 'active' }).catch(() => {});
      toast.success('¡Pedido enviado a cocina!');
      setCarrito([]);
      setNotaMesa('');
      setVentaActiva(ventaFresca);
      setDetallesVenta(Array.isArray(detallesFrescos) ? detallesFrescos : []);
    } catch (err) {
      console.error('[Mesero] enviarPedido error:', err);
      // El mensaje llega traducido por el dominio («no hay inventario
      // suficiente», «esa cuenta ya se cerró»). Se muestra tal cual.
      toast.error(err?.message || 'No se pudo enviar el pedido. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // F3.2: callback tras entregar desde ListosParaRecogerCard.
  // El card llama al comando de entrega. Aquí solo reflejamos el estado que el
  // SERVIDOR dice que tiene ahora la mesa: `null` significa que no la tocó
  // (queda otra estación cocinando, o la cuenta ya está pedida), y en ese caso
  // no la pisamos con 'ocupada' como hacía la versión anterior.
  const handleAfterEntregar = useCallback((res) => {
    if (res?.mesaCambiada && res?.estadoMesa) {
      setMesaActiva((prev) => (prev ? { ...prev, estado: res.estadoMesa } : prev));
    }
  }, []);

  // pedirCuenta: PRIMERO mostramos modal de propina, después se confirma en finalizarCuenta.
  //
  // El «FIX BUG PC» que revalidaba el consumo contra la BD desaparece: la
  // validación vive dentro de `solicitar_cuenta`, que cotiza las líneas
  // persistidas antes de marcar nada. El estado local ya no decide si la mesa
  // consumió, y por eso tampoco puede equivocarse cuando va desincronizado.
  const pedirCuenta = async () => {
    const mesaRef = mesaActiva;
    const ventaRef = ventaActiva;

    if (!mesaRef?.id) {
      toast.error('No hay mesa activa');
      return;
    }
    if (!ventaRef?.id) {
      toast.error('No hay consumo activo para solicitar cuenta');
      return;
    }

    // FIX BUG: si la caja se acaba de abrir desde Caja mientras el mesero
    // sigue dentro del dialog, el snapshot local puede estar viejo (hasta 8s).
    // Forzamos un refetch puntual y revalidamos contra el resultado fresco.
    let cajaOk = cajaAbiertaActiva;
    if (!cajaOk && typeof refetchCaja === 'function') {
      try {
        const r = await refetchCaja();
        const cortesFresh = Array.isArray(r?.data) ? r.data : [];
        cajaOk = cortesFresh.some(
          (c) => c?.estado === 'abierto' && (c?.tipo_corte === 'cierre_diario' || !c?.tipo_corte),
        );
      } catch (e) {
        console.warn('[Mesero] refetchCaja:', e);
      }
    }
    if (!cajaOk) {
      toast.error('No se puede solicitar cuenta porque la caja está cerrada. Abre caja primero.');
      return;
    }

    // Anti-doble solicitud: si ya está en cuenta_solicitada (estado en mesa o venta),
    // no permitir generar otra. Releemos la venta fresca de BD para no fiarnos de caché.
    if (mesaRef.estado === 'cuenta_solicitada' || ventaRef.estado === 'cuenta_solicitada') {
      toast.info('La cuenta ya fue solicitada para esta mesa.');
      return;
    }
    // Las tres redes que había aquí se van con el comando:
    //
    //  1. La relectura de la venta con .catch(() => null) (anti-doble
    //     solicitud): solicitar_cuenta REUSA el código de caja anterior si la
    //     cuenta ya se pidió, así que un segundo toque no genera un código
    //     nuevo que deje al cajero buscando un número que ya no existe.
    //  2. La validación de consumo contra DetalleVenta + PedidoPreparacion con
    //     .catch(() => []): el comando lanza ORDEN_VACIA cuando la mesa no ha
    //     consumido nada. Cuando esa lectura fallaba, el [] decía «esta mesa
    //     aún no tiene productos enviados a cocina» con la mesa llena.
    //  3. El «HOTFIX 6A — Rescate de totales en CERO»: existía porque el total
    //     se calculaba releyendo los detalles y la relectura podía fallar.
    //     solicitar_cuenta congela los totales que cotizar calcula DENTRO de la
    //     misma transacción en la que marca la cuenta solicitada, así que ya no
    //     hay una cuenta en cero que rescatar ni un Venta.update que lo intente.

    // Una clave por intento de pedir la cuenta, compartida por los tres caminos
    // (sin propinas, delegada al QR y modal de propina): dos toques seguidos son
    // el mismo hecho y no deben emitir dos códigos de caja.
    claveCuentaRef.current = nuevaClave();

    // Si propinas están desactivadas, saltar el modal y solicitar cuenta directo.
    if (!tipsEnabled(config)) {
      finalizarPedirCuenta({
        propina_monto: 0,
        propina_porcentaje: 0,
        propina_tipo: 'sin_propina',
        propina_origen: 'mesero',
      });
      return;
    }

    // === FLUJO QR-DISPARADO (mesero_dispara | ambos) ===
    // Si la propina QR está activa Y el modo de cuenta delega al cliente,
    // el mesero NO elige propina aquí. Marcamos la venta como "esperando
    // selección del comensal" y el QR del cliente abrirá automáticamente
    // la pantalla de propina por polling.
    const modoCuenta = config?.portal_qr_cuenta_modo || 'mesero_dispara';
    const propinaQRActiva =
      config?.portal_qr_activo === true && config?.portal_qr_permitir_propina_cliente !== false;
    const delegaAlCliente =
      propinaQRActiva && (modoCuenta === 'mesero_dispara' || modoCuenta === 'ambos');

    if (delegaAlCliente) {
      finalizarPedirCuenta({
        propina_monto: 0,
        propina_porcentaje: 0,
        propina_tipo: 'pendiente_cliente',
        propina_origen: 'pendiente_portal_qr',
      });
      return;
    }

    // Flujo clásico: abrir modal de propina del mesero.
    setShowPropinaMesero(true);
  };

  // Finaliza el flujo de solicitar cuenta tras elegir propina (o "decidir en caja").
  const finalizarPedirCuenta = async (propinaData) => {
    const mesaRef = mesaActiva;
    const ventaRef = ventaActiva;

    setLoading(true);
    setShowPropinaMesero(false);
    try {
      // El `Venta.update` con el código y los totales y el `Mesa.update` con
      // `.catch(() => {})` detrás eran dos escrituras sueltas: la venta pasaba a
      // `cuenta_solicitada` y la mesa no, y Caja y el mapa discrepaban.
      // `solicitar_cuenta` mueve las dos en una transacción.
      //
      // La propina viaja en PUNTOS BASE enteros: 10 % es 1000. `0.1` no existe
      // exacto en punto flotante y los puntos base sí. Y el importe NO se manda:
      // el comando lo calcula sobre el total que acaba de cotizar.
      if (claveCuentaRef.current === null) claveCuentaRef.current = nuevaClave();
      const r = await api.comandos.ejecutar(
        '/api/restaurante/solicitar-cuenta',
        {
          ordenId: ventaRef.id,
          propinaPuntosBase: Math.round((Number(propinaData?.propina_porcentaje) || 0) * 100),
          propinaTipo: propinaData?.propina_tipo || 'sin_propina',
        },
        claveCuentaRef.current,
      );
      claveCuentaRef.current = null;

      // La cuenta y sus líneas se releen por el puente para que la precuenta
      // imprima lo que quedó en la base —totales incluidos— y no lo que este
      // navegador creía tener. Antes el ticket se armaba con `{...ventaRef,
      // ...payloadVenta}`, es decir, con números de memoria.
      const [ventaFresca, detallesFrescos] = await Promise.all([
        api.entidades.Venta.get(r.ordenId),
        api.entidades.DetalleVenta.filter({ venta_id: r.ordenId }),
      ]);

      // BLOQUE 0: que Caja vea la cuenta solicitada en ≤2s.
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      queryClient.invalidateQueries({ queryKey: ['ventas_pendientes_caja'] });
      queryClient
        .refetchQueries({ queryKey: ['ventas_pendientes_caja'], type: 'active' })
        .catch(() => {});

      const ventaActualizada = {
        ...ventaFresca,
        // `propina_monto` no es columna de `ordenes` —la propina vive en `pagos`
        // y se registra al cobrar—, así que el importe que enseña la precuenta
        // es el que devuelve el comando, en centavos.
        propina_monto: Number(r.propinaSugeridaCentavos) / 100,
      };
      const codigo = r.codigoCaja;
      setPreCuentaData({
        venta: ventaActualizada,
        detalles: Array.isArray(detallesFrescos) ? detallesFrescos : [],
        mesa: mesaRef,
        codigo,
      });
      cerrarDialog();
      setTimeout(() => setShowPreCuenta(true), 200);

      // Mensaje contextual: si delegamos al QR, el mesero debe saber que espera al cliente.
      if (propinaData?.propina_tipo === 'pendiente_cliente') {
        toast.success(
          `Cuenta solicitada · Cód: ${codigo}. Esperando propina desde el QR del comensal.`,
        );
      } else {
        toast.success(`Cuenta solicitada. Código: ${codigo}`);
      }
    } catch (err) {
      console.error('[Mesero] finalizarPedirCuenta error:', err);
      // «Esa mesa todavía no ha consumido nada», «esa cuenta ya se cerró en
      // caja»: el dominio ya lo dice en español y mejor que un genérico.
      toast.error(err?.message || 'No se pudo solicitar la cuenta. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const imprimirPreCuenta = () => {
    printDocument({ mode: 'thermal', title: `PreCuenta-${preCuentaData?.venta?.folio || ''}` });
  };

  // Liberar una mesa huérfana (sin venta_activa_id). NO borra ventas reales.
  const liberarMesaHuerfana = async () => {
    const mesaRef = mesaHuerfana;
    if (!mesaRef?.id) {
      setMesaHuerfana(null);
      return;
    }
    setLiberandoHuerfana(true);
    try {
      // Mismo comando que la mesa en limpieza. Y trae una garantía que estos
      // diez campos sueltos no daban: si la mesa SÍ tuviera una cuenta con
      // consumo, `liberar_mesa` se niega con MESA_NO_LIBERABLE en vez de
      // borrarla de la vista. La reparación deja de poder tapar una venta sin
      // cobrar.
      await api.comandos.ejecutar('/api/restaurante/liberar-mesa', { mesaId: mesaRef.id });
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      toast.success(`Mesa ${mesaRef.numero} liberada`);
      setMesaHuerfana(null);
    } catch (err) {
      console.error('[Mesero] liberarMesaHuerfana error:', err);
      toast.error(err?.message || 'No se pudo liberar la mesa. Intenta de nuevo.');
    } finally {
      setLiberandoHuerfana(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header — flex-wrap para que en móvil no se desborde la fila de botones
          (Solicitudes / Alertas / Audio). En desktop queda en una línea. */}
      <div className="flex items-start sm:items-center gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, hsl(4,72%,46%) 0%, hsl(4,72%,34%) 100%)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            <UtensilsCrossed className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-heading font-bold leading-tight">Mesero</h1>
            <p className="text-xs text-muted-foreground truncate">
              Toca una mesa para abrir o gestionar
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {config?.portal_qr_activo === true && (
            <Button
              type="button"
              size="sm"
              variant={(solicitudesActivas?.length || 0) > 0 ? 'default' : 'outline'}
              onClick={() => setShowSolicitudesQR(true)}
              className="gap-1.5 relative shrink-0"
            >
              <Bell className="w-4 h-4" />
              <span>Solicitudes</span>
              {(solicitudesActivas?.length || 0) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {solicitudesActivas.length}
                </span>
              )}
            </Button>
          )}
          {/* Configuración personal de voz/alertas — solo para meseros */}
          {posUser?.rol === ROLES.WAITER && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowAlertasMesero(true)}
              className="gap-1.5 shrink-0"
              title="Configurar mi voz y alertas"
            >
              <Volume2 className="w-4 h-4" />
              <span>Alertas</span>
            </Button>
          )}
          <SoundUnlockButton />
        </div>
      </div>

      {/* Zone tabs */}
      {zonasConCount.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {zonasConCount.map(({ zona, count }) => (
            <button
              key={zona}
              onClick={() => setZonaActiva(zona)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${zonaActiva === zona ? 'bg-primary text-white shadow-md' : 'bg-white border text-muted-foreground'}`}
            >
              {zona} <span className="opacity-60">({count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Aviso si mesero sin mesas asignadas */}
      {sinMesasAsignadas && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border-2 border-amber-200 text-sm text-amber-900 flex items-start gap-2">
          <UtensilsCrossed className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
          <div className="flex-1">
            <p className="font-bold">No tienes mesas asignadas</p>
            <p className="text-xs opacity-90">
              Pide al administrador que te asigne mesas desde Configuración → Mesas.
            </p>
          </div>
        </div>
      )}

      {/* MAP — Desktop usa posiciones libres; mobile usa grid.
          Fondo "madera" dark-aware (FLOOR_BG). */}
      {isMobile ? (
        <div
          className="rounded-2xl border-2 p-3"
          style={{
            background: floor.bg,
            borderColor: floor.border,
            boxShadow: isDark
              ? 'inset 0 2px 6px rgba(0,0,0,0.5)'
              : 'inset 0 2px 6px rgba(0,0,0,0.1)',
          }}
        >
          <MesaGridMobile
            mesas={mesasZona}
            onMesaClick={onMesaClick}
            getResponsable={getResponsable}
            loading={cargandoMesas}
          />
        </div>
      ) : (
        <div
          className="relative rounded-2xl overflow-hidden border-2"
          style={{
            height: MAP_HEIGHT,
            background: floor.bg,
            backgroundImage: floor.dotPattern,
            backgroundSize: '24px 24px',
            borderColor: floor.border,
            boxShadow: isDark
              ? 'inset 0 4px 14px rgba(0,0,0,0.6), inset 0 -2px 6px rgba(255,255,255,0.05)'
              : 'inset 0 4px 10px rgba(0,0,0,0.15), inset 0 -2px 6px rgba(255,255,255,0.5)',
          }}
        >
          {mesasZona.map((mesa) => {
            const resp = getResponsable(mesa);
            return (
              <MesaShape
                key={mesa.id}
                mesa={mesa}
                onClick={() => onMesaClick(mesa)}
                responsableColor={resp?.color || null}
                responsableNombre={resp?.nombre || ''}
              />
            );
          })}
          {mesasZona.length === 0 && !sinMesasAsignadas && !cargandoMesas && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/60">
              <div className="text-center">
                <UtensilsCrossed className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No hay mesas en {zonaActiva}.</p>
                <p className="text-xs">Configúralas en Configuración → Mapa de mesas.</p>
              </div>
            </div>
          )}
          {cargandoMesas && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/70">
              <div className="text-center">
                <div className="w-10 h-10 rounded-2xl bg-muted/60 mx-auto mb-2 flex items-center justify-center">
                  <UtensilsCrossed className="w-5 h-5 animate-pulse" />
                </div>
                <p className="text-sm">Cargando mapa de mesas…</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cards persistentes de solicitudes QR debajo del mapa */}
      <SolicitudesQRCardList />

      {/* Legend — chips dark-aware (fondo card sólido) */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        {Object.entries(MESA_STATUS_CONFIG)
          .filter(([k]) => !['pagada', 'cancelada'].includes(k))
          .map(([k, v]) => (
            <div
              key={k}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-card border text-card-foreground"
            >
              <div
                className="w-3 h-3 rounded-full border"
                style={{ background: v.fill, borderColor: v.stroke }}
              />
              <span className="text-muted-foreground">{v.label}</span>
            </div>
          ))}
      </div>

      {/* === ABRIR MESA DIALOG (6A) === */}
      <AbrirMesaDialog
        open={showAbrirMesa}
        onOpenChange={(v) => {
          if (!v && !abriendoMesa) {
            setShowAbrirMesa(false);
            setMesaParaAbrir(null);
          }
        }}
        mesa={mesaParaAbrir}
        loading={abriendoMesa}
        onConfirm={confirmarAbrirMesa}
      />

      {/* === MESA DIALOG === */}
      <Dialog
        open={!!mesaActiva}
        onOpenChange={(open) => {
          // Solo procesar cierres y solo si no estamos ya cerrando
          if (!open && !isClosingRef.current) cerrarDialog();
        }}
      >
        <DialogContent
          // Botón X nativo de Radix agrandado para móvil con clases Tailwind ":[&>button.absolute]:..."
          // Esto modifica el botón nativo SIN reemplazarlo (evita conflictos de DOM con el portal).
          // onOpenAutoFocus: evita que Radix enfoque automáticamente el primer input
          // (el buscador "Buscar producto"), lo que abría el teclado en móvil/tablet
          // al abrir una mesa. Ahora el teclado solo aparece si el usuario toca el input.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="sm:max-w-3xl w-screen h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-lg rounded-none flex flex-col p-0 gap-0 max-w-full
            [&>button.absolute]:w-11 [&>button.absolute]:h-11 [&>button.absolute]:rounded-full [&>button.absolute]:bg-muted [&>button.absolute]:opacity-100 [&>button.absolute]:flex [&>button.absolute]:items-center [&>button.absolute]:justify-center [&>button.absolute]:top-3 [&>button.absolute]:right-3 [&>button.absolute>svg]:w-5 [&>button.absolute>svg]:h-5"
        >
          <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <DialogTitle className="font-heading flex items-center gap-2 flex-wrap pr-14">
              <UtensilsCrossed className="w-5 h-5 text-primary" />
              Mesa {mesaActiva?.numero}
              <span
                className="text-xs font-normal px-2 py-0.5 rounded-full"
                style={{
                  background: MESA_STATUS_CONFIG[mesaActiva?.estado]?.fill,
                  color: MESA_STATUS_CONFIG[mesaActiva?.estado]?.text,
                }}
              >
                {MESA_STATUS_CONFIG[mesaActiva?.estado]?.label}
              </span>
              {ventaActiva?.personas > 0 && (
                <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {ventaActiva.personas}
                </span>
              )}
              {ventaActiva?.cliente_nombre && (
                <span className="text-xs font-normal text-muted-foreground">
                  · {ventaActiva.cliente_nombre}
                </span>
              )}
              {/* 6A: badge celebración — discreto, nunca tapa el bloque de listos */}
              {(mesaActiva?.celebracion_especial === true ||
                ventaActiva?.celebracion_especial === true) && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800/60 inline-flex items-center gap-1"
                  title={
                    mesaActiva?.tipo_celebracion || ventaActiva?.tipo_celebracion || 'Celebración'
                  }
                >
                  🎉{' '}
                  {mesaActiva?.tipo_celebracion || ventaActiva?.tipo_celebracion || 'Celebración'}
                </span>
              )}
              {/* 6A: badge alergia — texto compacto, sin banner gigante */}
              {(mesaActiva?.notas_alergias || ventaActiva?.notas_alergias) && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60 inline-flex items-center gap-1"
                  title={mesaActiva?.notas_alergias || ventaActiva?.notas_alergias}
                >
                  ⚠ Alergia
                </span>
              )}
            </DialogTitle>
            {/* 6A: línea pequeña con el detalle de alergia bajo el título.
                NO se renderiza encima del bloque "Listo para recoger". */}
            {(mesaActiva?.notas_alergias || ventaActiva?.notas_alergias) && (
              <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1 leading-snug">
                <span className="font-semibold">Alergia / indicaciones:</span>{' '}
                {mesaActiva?.notas_alergias || ventaActiva?.notas_alergias}
              </p>
            )}
          </DialogHeader>

          {/* F3.2: Card "Listo para recoger" — se auto-muestra solo cuando
              hay pedidos en estado 'listo' para la venta activa. Maneja
              estaciones (Postres, Alimentos, Barra...) y la entrega solo
              afecta pedidos listos, NUNCA los en preparación o nuevos.
              Mantiene compat con flujos sin estaciones (muestra "Cocina"). */}
          {/* F3.3: fallback robusto — si ventaActiva aún no se hidrata pero la
              mesa ya tiene venta_activa_id, usamos ese id para que la card
              aparezca igual sin esperar a que termine de cargar la venta. */}
          {(ventaActiva?.id || mesaActiva?.venta_activa_id) && (
            <ListosParaRecogerCard
              mesa={mesaActiva}
              ventaId={ventaActiva?.id || mesaActiva?.venta_activa_id}
              onAfterEntregar={handleAfterEntregar}
            />
          )}

          <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
            <div className="flex-1 flex flex-col overflow-hidden md:border-r">
              <div className="px-4 py-3 space-y-2 border-b bg-muted/30 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={busquedaProducto}
                    onChange={(e) => setBusquedaProducto(e.target.value)}
                    placeholder="Buscar producto..."
                    className="pl-9 h-9"
                  />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  <button
                    onClick={() => setCategoriaFiltro('todas')}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${categoriaFiltro === 'todas' ? 'bg-primary text-white' : 'bg-white border text-muted-foreground'}`}
                  >
                    Todas
                  </button>
                  {categorias.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCategoriaFiltro(c.id)}
                      className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${categoriaFiltro === c.id ? 'bg-primary text-white' : 'bg-white border text-muted-foreground'}`}
                    >
                      {c.nombre}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 pb-32 md:pb-3 grid grid-cols-2 gap-2 content-start">
                {/* HOTFIX 6A.3: loading explícito antes de mostrar "Sin productos".
                    Antes en móvil con red lenta salía "Sin productos" falso. */}
                {cargandoProductos ? (
                  <div className="col-span-2 flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                    <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
                    <p className="text-xs">Cargando productos…</p>
                  </div>
                ) : (
                  <>
                    {productosFiltrados.map((p) => {
                      const tieneOpc = productoTieneModificadores(p);
                      const colorize = config?.colorear_importes_monetarios !== false;
                      return (
                        <button
                          key={p.id}
                          onClick={() => agregarAlCarrito(p)}
                          className="p-3 rounded-xl border bg-white text-left hover:bg-muted/30 active:scale-95 transition-all relative"
                          style={{
                            boxShadow:
                              '0 1px 0 rgba(255,255,255,0.9) inset, 0 2px 4px rgba(0,0,0,0.06)',
                          }}
                        >
                          <p className="font-semibold text-sm leading-tight">{p?.nombre}</p>
                          <PrecioProductoMesero producto={p} colorize={colorize} />
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            <ChefHat className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground capitalize">
                              {p?.area_preparacion || 'cocina'}
                            </span>
                            <VariableBadge producto={p} />
                            {tieneOpc && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                                Opciones
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {productosFiltrados.length === 0 && productosArr.length > 0 && (
                      <p className="col-span-2 text-center text-sm text-muted-foreground py-8">
                        Sin resultados para tu búsqueda
                      </p>
                    )}
                    {productosArr.length === 0 && productosFetched && (
                      <p className="col-span-2 text-center text-sm text-muted-foreground py-8">
                        Sin productos disponibles
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="hidden md:flex w-full md:w-72 flex-col shrink-0">
              {(detallesVenta || []).length > 0 && (
                <div className="px-4 py-3 border-b bg-muted/20">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">PEDIDO ACTUAL</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {(detallesVenta || []).map((d, i) => (
                      <div key={d?.id || `det-d-${i}`} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          {d?.producto_nombre || '—'} ×{d?.cantidad || 0}
                        </span>
                        <span className="font-medium">{formatCurrency(d?.subtotal || 0)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs font-bold border-t pt-1 mt-1 text-right">
                    Total: {formatCurrency(totalActual || 0)}
                  </p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 py-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  {(detallesVenta || []).length > 0 ? 'AGREGAR AL PEDIDO' : 'NUEVO PEDIDO'}
                </p>
                {(carrito || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Selecciona productos
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(carrito || []).map((item, idx) => (
                      <ProductoFichaExpandible
                        key={item?.id || `cart-d-${idx}`}
                        item={item}
                        onCambiarCantidad={cambiarCantidad}
                        onUpdateNotas={actualizarNotasItem}
                        onUpdateExclusiones={actualizarExclusionesItem}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t space-y-2 shrink-0">
                {carrito.length > 0 && (
                  <>
                    <Input
                      value={notaMesa}
                      onChange={(e) => setNotaMesa(e.target.value)}
                      placeholder="Nota para cocina..."
                      className="text-xs h-8"
                    />
                    <div className="flex justify-between text-sm font-bold">
                      <span>Nuevo</span>
                      <span
                        className={
                          config?.colorear_importes_monetarios !== false
                            ? 'text-primary'
                            : 'text-foreground'
                        }
                      >
                        {formatCurrency(totalCarrito)}
                      </span>
                    </div>
                    <Button
                      onClick={enviarPedido}
                      disabled={loading}
                      className="w-full"
                      style={{
                        background:
                          'linear-gradient(135deg, hsl(4,72%,46%) 0%, hsl(4,72%,36%) 100%)',
                      }}
                    >
                      <Send className="w-4 h-4 mr-1" />
                      {loading ? 'Enviando...' : 'Enviar a Cocina'}
                    </Button>
                  </>
                )}
                {ventaActiva &&
                  carrito.length === 0 &&
                  mesaActiva?.estado !== 'cuenta_solicitada' && (
                    <Button
                      onClick={pedirCuenta}
                      disabled={loading}
                      variant="outline"
                      className="w-full"
                    >
                      <Receipt className="w-4 h-4 mr-1" />
                      Solicitar cuenta
                    </Button>
                  )}
              </div>
            </div>
          </div>

          {/* Carrito flotante móvil — solo dentro del dialog de mesa */}
          <MeseroCartFAB
            ref={cartFabRef}
            carrito={carrito}
            totalCarrito={totalCarrito}
            totalActual={totalActual}
            detallesVenta={detallesVenta}
            notaMesa={notaMesa}
            setNotaMesa={setNotaMesa}
            cambiarCantidad={cambiarCantidad}
            enviarPedido={enviarPedido}
            pedirCuenta={pedirCuenta}
            loading={loading}
            estadoMesa={mesaActiva?.estado}
            ventaActiva={ventaActiva}
            formatCurrency={formatCurrency}
            config={config}
            onUpdateNotas={actualizarNotasItem}
            onUpdateExclusiones={actualizarExclusionesItem}
          />
        </DialogContent>
      </Dialog>

      {/* === SOLICITUDES QR DIALOG === */}
      <Dialog open={showSolicitudesQR} onOpenChange={setShowSolicitudesQR}>
        <DialogContent className="sm:max-w-3xl w-[calc(100%-1rem)] max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" /> Solicitudes QR
            </DialogTitle>
          </DialogHeader>
          <SolicitudesQRPanel />
        </DialogContent>
      </Dialog>

      {/* === ALERTAS PERSONALES DEL MESERO === */}
      <AlertasMeseroDialog open={showAlertasMesero} onClose={() => setShowAlertasMesero(false)} />

      {/* === MODAL DE PERSONALIZACIÓN / MODIFICADORES === */}
      <SeleccionModificadoresDialog
        producto={productoParaPersonalizar}
        open={!!productoParaPersonalizar}
        onClose={() => setProductoParaPersonalizar(null)}
        onConfirm={confirmarPersonalizacion}
      />

      {/* 6B / 1.D — MODAL CANTIDAD / PORCIÓN para productos variables */}
      <CantidadVariableDialog
        open={!!productoVariable}
        producto={productoVariable}
        onClose={() => setProductoVariable(null)}
        onConfirm={confirmarCantidadVariable}
      />

      {/* === MESA HUÉRFANA — REPARACIÓN === */}
      <MesaHuerfanaDialog
        mesa={mesaHuerfana}
        open={!!mesaHuerfana}
        loading={liberandoHuerfana}
        onCancel={() => {
          if (!liberandoHuerfana) setMesaHuerfana(null);
        }}
        onConfirm={liberarMesaHuerfana}
      />

      {/* === MODAL DE PROPINA (antes de solicitar cuenta) === */}
      <PropinaDialog
        open={showPropinaMesero}
        onOpenChange={setShowPropinaMesero}
        subtotal={Number(ventaActiva?.total) || totalActual || 0}
        loading={loading}
        allowPendiente
        origen="mesero"
        porcentajesSugeridos={getPorcentajesSugeridos(config)}
        onConfirm={finalizarPedirCuenta}
      />

      {/* === PRE-CUENTA TICKET DIALOG === */}
      <Dialog open={showPreCuenta} onOpenChange={setShowPreCuenta}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Pre-cuenta lista</DialogTitle>
          </DialogHeader>
          <div className="bg-muted/30 rounded-lg p-3 max-h-[60vh] overflow-y-auto">
            {preCuentaData && (
              <PreCuentaTicket
                venta={preCuentaData.venta}
                detalles={preCuentaData.detalles}
                mesa={preCuentaData.mesa}
                config={config}
                codigo={preCuentaData.codigo}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreCuenta(false)}>
              Cerrar
            </Button>
            <Button onClick={imprimirPreCuenta}>
              <Printer className="w-4 h-4 mr-1" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
