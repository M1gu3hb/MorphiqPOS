'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { api, nuevaClave } from '@/api/cliente';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { formatCurrency, formatPercent, generateFolio } from '@/utils/financialUtils';
import { hasPermission } from '@/lib/permissions';
import { toast } from 'sonner';
import {
  Landmark,
  Search,
  DollarSign,
  CreditCard,
  Banknote,
  Smartphone,
  Receipt,
  TrendingUp,
  CheckCircle2,
  Layers,
  Scissors,
  Printer,
  FileText,
  ShoppingCart,
  Trash2,
  DoorOpen,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { Link } from '@/enrutado';
import PreCuentaTicket from '@/components/tickets/PreCuentaTicket';
import PropinaDialog from '@/components/propinas/PropinaDialog';
import CorteViewerDialog from '@/components/cortes/CorteViewerDialog';
import CorteAutoDownloader from '@/components/cortes/CorteAutoDownloader';
import { printDocument } from '@/lib/print';
import CorteHistorialList from '@/components/cortes/CorteHistorialList';
import ResumenDelDia from '@/components/caja/ResumenDelDia';
import { desgloseMetodosPagoExacto } from '@/utils/tipsUtils';
import SafeBoundary from '@/components/common/SafeBoundary';
import AbrirCajaDialog from '@/components/caja/AbrirCajaDialog';
import CorteTurnoDialog from '@/components/caja/CorteTurnoDialog';
import CierreDiarioDialog from '@/components/caja/CierreDiarioDialog';
import MesasPendientesCierreDialog from '@/components/caja/MesasPendientesCierreDialog';
import { obtenerMesasPendientesCierre } from '@/utils/mesasPendientesCierre';
import { useCajaAbierta } from '@/lib/useCajaAbierta';
import { tipsEnabled, getPorcentajesSugeridos } from '@/utils/tipsUtils';
import { sumarSubtotalDetalles } from '@/utils/ventaTotales';
import { TIPO_VENTA } from '@/utils/tipoVentaUtils';
// El cobro entero es una transacción del servidor (`venta.cobrar`), así que el
// costeo por línea variable y la validación de stock del navegador ya no se
// usan aquí: los hace el comando, sobre las líneas que está congelando.
import { aCentavos, aPesos } from '@/components/caja/dinero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import NumericInput from '@/components/common/NumericInput';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { safeFormatDate } from '@/lib/safeFormat';
import StatCard from '@/components/common/StatCard';

const METODOS = [
  {
    key: 'efectivo',
    label: 'Efectivo',
    Icon: Banknote,
    color: 'border-green-400 bg-green-50 text-green-700',
  },
  {
    key: 'tarjeta',
    label: 'Tarjeta',
    Icon: CreditCard,
    color: 'border-blue-400 bg-blue-50 text-blue-700',
  },
  {
    key: 'transferencia',
    label: 'Transferencia',
    Icon: Smartphone,
    color: 'border-purple-400 bg-purple-50 text-purple-700',
  },
  {
    key: 'mixto',
    label: 'Mixto',
    Icon: Layers,
    color: 'border-orange-400 bg-orange-50 text-orange-700',
  },
];

/**
 * Los valores que `venta.cobrar` acepta como metadato de la propina.
 *
 * Son los seis del `check propina_tipo` y los cinco del `check propina_origen`.
 * Se filtra contra estas listas antes de mandar: una venta vieja con un valor
 * fuera del `check` haría fallar el cobro ENTERO con ENTRADA_INVALIDA, y lo que
 * está en juego es el cobro, no la etiqueta de cómo se decidió la propina.
 */
const TIPOS_DE_PROPINA = [
  'sin_propina',
  'porcentaje',
  'monto_manual',
  'pendiente',
  'pendiente_cliente',
  'decidir_en_caja',
];
const ORIGENES_DE_PROPINA = ['mesero', 'caja', 'tradicional', 'portal_qr', 'pendiente_portal_qr'];

/**
 * La propina que el comensal YA decidió, en pesos.
 *
 * `ordenes` no tiene columna con el importe de la propina, y es a propósito: es
 * lo que impide que `total` se pueda inflar con una (F1-04 §6.1). Así que el
 * puente no puede traer `propina_monto` y llega `undefined`. Lo que sí persiste
 * es el PORCENTAJE que el comensal eligió en el portal QR o que el mesero
 * registró al pedir la cuenta (`ordenes.propina_puntos_base`).
 *
 * El importe se deriva de ese porcentaje AL COBRAR, que es cuando se conoce el
 * total definitivo. Sin esta derivación la propina del mesero se perdía entera
 * y en silencio: la caja enseñaba «sin propina» sobre una cuenta que el cliente
 * había dejado al 15 %, y el pago viajaba con propina cero.
 *
 * Se redondea en CENTAVOS y una sola vez: `total * 0.15` en coma flotante deja
 * medios centavos, y el renglón de pago sólo acepta enteros.
 */
function propinaDerivada(venta) {
  const yaElegida = Number(venta?.propina_monto);
  if (Number.isFinite(yaElegida) && yaElegida > 0) return yaElegida;
  // `monto_manual` entra con `porcentaje`, y hasta ahora no entraba: quedaba
  // fuera del `if` y la función devolvía CERO, así que una propina que el
  // comensal escribió a mano en el portal QR no se cobraba nunca. El servidor
  // guarda los dos —el importe exacto en la solicitud y su equivalente en
  // puntos base en la orden—, y esto reconstruye el segundo.
  //
  // El importe reconstruido puede diferir en UN CENTAVO del que tecleó el
  // comensal, porque los puntos base son enteros y se recortan al 100 %. Por
  // eso `monto_manual` fuerza el diálogo de propina más abajo: el cajero VE la
  // cifra y la confirma antes de cobrar, en vez de que el sistema decida solo.
  if (venta?.propina_tipo !== 'porcentaje' && venta?.propina_tipo !== 'monto_manual') return 0;
  const porcentaje = Number(venta?.propina_porcentaje) || 0;
  if (porcentaje <= 0) return 0;
  return aPesos(Math.round((aCentavos(venta?.total) * porcentaje) / 100));
}

export default function Caja() {
  const { posUser } = usePOSAuth();
  const { config, paquete_modo } = useConfig();
  const queryClient = useQueryClient();
  const verCostos = hasPermission(posUser?.rol, 'ver_costos');
  // En Esencial y Operativo no hay flujo de mesero/cocina ⇒ no hay cobros pendientes
  const isCajaDirecta = paquete_modo === 'esencial' || paquete_modo === 'operativo';
  const [showTicketFinal, setShowTicketFinal] = useState(false);
  const [ticketFinalData, setTicketFinalData] = useState(null);
  const [codigoBusqueda, setCodigoBusqueda] = useState('');
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [detallesSeleccionados, setDetallesSeleccionados] = useState([]);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [montoEfectivo, setMontoEfectivo] = useState('');
  const [montoTarjeta, setMontoTarjeta] = useState('');
  const [montoTransferencia, setMontoTransferencia] = useState('');
  // Propinas EXACTAS por método (solo en pago mixto con propina > 0).
  const [propinaEfectivo, setPropinaEfectivo] = useState('');
  const [propinaTarjeta, setPropinaTarjeta] = useState('');
  const [propinaTransferencia, setPropinaTransferencia] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [procesandoMsg, setProcesandoMsg] = useState('');
  const [showCierreExito, setShowCierreExito] = useState(false);
  const [corteCerrado, setCorteCerrado] = useState(null);
  const [verPDFCorte, setVerPDFCorte] = useState(null);
  const [autoDownloadCorte, setAutoDownloadCorte] = useState(null);

  // === Estados de los 3 modales nuevos ===
  const [showAbrirCaja, setShowAbrirCaja] = useState(false);
  const [showCorteTurno, setShowCorteTurno] = useState(false);
  const [showCierreDiario, setShowCierreDiario] = useState(false);
  const [accionLoading, setAccionLoading] = useState(false);
  // 6A: bloqueo de cierre si hay mesas abiertas
  const [mesasPendientes, setMesasPendientes] = useState(null); // array | null
  const [verificandoMesas, setVerificandoMesas] = useState(false);
  // === Propina pendiente al abrir una cuenta sin propina capturada ===
  const [showPropinaCaja, setShowPropinaCaja] = useState(false);

  // Caja abierta global (fuente única de verdad)
  const { cajaAbierta, hayCaja, fondoEsperado } = useCajaAbierta();

  // Clave de idempotencia del cobro: se genera al ABRIR el diálogo de cobro y
  // se reusa mientras siga abierto (F1-02 §8, trampa T5). Es lo que impide que
  // un doble clic en «Cobrar» —o un reintento de red— cobre dos veces y
  // descuente el inventario dos veces. Al cerrar el diálogo se descarta, para
  // que el siguiente cobro no herede la clave del anterior.
  const [claveCobro, setClaveCobro] = useState(null);
  const ventaEnCobroId = ventaSeleccionada?.id || null;
  useEffect(() => {
    setClaveCobro(ventaEnCobroId === null ? null : nuevaClave());
  }, [ventaEnCobroId]);

  // BLOQUE 0: refetch cada 2s para que QR/Mesero → Caja sea casi en vivo.
  // Sin esto, una cuenta solicitada podía tardar hasta 6s en aparecer en Caja.
  const { data: ventasPendientes = [] } = useQuery({
    queryKey: ['ventas_pendientes_caja'],
    queryFn: () => api.entidades.Venta.filter({ estado: 'cuenta_solicitada' }),
    initialData: [],
    refetchInterval: 2000,
    staleTime: 1000,
  });

  const { data: ventasHoy = [] } = useQuery({
    queryKey: ['ventas_pagadas_caja'],
    queryFn: () => api.entidades.Venta.filter({ estado: 'pagada' }),
    initialData: [],
  });

  const { data: gastos = [] } = useQuery({
    queryKey: ['gastos_hoy'],
    queryFn: () => api.entidades.GastoOperativo.list('-created_date', 100),
    initialData: [],
  });

  const { data: cortes = [] } = useQuery({
    queryKey: ['cortes'],
    queryFn: () => api.entidades.CorteCaja.list('-created_date', 20),
    initialData: [],
  });

  // corteAbierto = alias del cierre_diario abierto (single source of truth)
  const corteAbierto = cajaAbierta;
  const today = new Date().toISOString().slice(0, 10);

  // El resumen operativo se basa en la caja abierta actual.
  // Incluye ventas con corte_caja_id == cajaAbierta.id O ventas pagadas DESPUÉS
  // de fecha_apertura sin corte_caja_id (fallback para ventas en tránsito).
  // Si NO hay caja abierta, todos los KPIs operativos quedan en 0.
  const resumen = useMemo(() => {
    const safeVentas = Array.isArray(ventasHoy) ? ventasHoy : [];
    const safeGastos = Array.isArray(gastos) ? gastos : [];
    if (!cajaAbierta) {
      return {
        numVentas: 0,
        totalEfectivo: 0,
        totalTarjeta: 0,
        totalTransferencia: 0,
        totalGeneral: 0,
        costoTotal: 0,
        utilidadBruta: 0,
        totalGastos: 0,
        ticketPromedio: 0,
      };
    }
    const aperturaIso =
      cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio || cajaAbierta.created_date;
    const apertura = aperturaIso ? new Date(aperturaIso).getTime() : 0;
    const ventas = safeVentas.filter((v) => {
      if (!v) return false;
      if (v.corte_caja_id && v.corte_caja_id === cajaAbierta.id) return true;
      // Fallback: pagadas después de la apertura, sin corte asociado
      if (!v.corte_caja_id && v.fecha_cierre) {
        const t = new Date(v.fecha_cierre).getTime();
        return Number.isFinite(t) && t >= apertura;
      }
      return false;
    });
    const gastosCaja = safeGastos.filter((g) => {
      if (!g) return false;
      const tCreated = g.created_date ? new Date(g.created_date).getTime() : 0;
      return tCreated >= apertura;
    });
    // Propinas: sumadas aparte. NO entran a totalGeneral / utilidad / costos.
    const totalPropinas = ventas.reduce((s, v) => s + (Number(v?.propina_monto) || 0), 0);
    // Desglose por mesero (solo se usa en Restaurante Pro)
    const propinasPorMesero = {};
    ventas.forEach((v) => {
      const monto = Number(v?.propina_monto) || 0;
      if (monto <= 0) return;
      const key = v?.usuario_mesero_id || '__sin_mesero__';
      if (!propinasPorMesero[key]) {
        propinasPorMesero[key] = {
          mesero_id: v?.usuario_mesero_id || null,
          mesero_nombre: v?.usuario_mesero_nombre || 'Caja / venta directa',
          total: 0,
        };
      }
      propinasPorMesero[key].total += monto;
    });

    // === Desglose EXACTO por método de pago (sin reparto proporcional) ===
    // Usa propina_efectivo/tarjeta/transferencia cuando existen.
    // Para ventas antiguas aplica fallback seguro (ver desgloseMetodosPagoExacto).
    const metodosPagoExacto = desgloseMetodosPagoExacto(ventas);
    // Adaptador para componentes ya escritos: estructura idéntica.
    const metodosPagoConPropinas = metodosPagoExacto;

    return {
      numVentas: ventas.length,
      totalEfectivo: metodosPagoExacto.efectivo.ventas,
      totalTarjeta: metodosPagoExacto.tarjeta.ventas,
      totalTransferencia: metodosPagoExacto.transferencia.ventas,
      totalGeneral: ventas.reduce((s, v) => s + (v.total || 0), 0),
      costoTotal: ventas.reduce((s, v) => s + (v.costo_total_snapshot || 0), 0),
      utilidadBruta: ventas.reduce((s, v) => s + (v.utilidad_bruta_snapshot || 0), 0),
      totalGastos: gastosCaja.reduce((s, g) => s + (g.monto || 0), 0),
      ticketPromedio:
        ventas.length > 0 ? ventas.reduce((s, v) => s + (v.total || 0), 0) / ventas.length : 0,
      totalPropinas,
      propinasPorMesero: Object.values(propinasPorMesero),
      metodosPagoConPropinas,
    };
  }, [ventasHoy, gastos, cajaAbierta]);

  const margenProm =
    resumen.totalGeneral > 0 ? (resumen.utilidadBruta / resumen.totalGeneral) * 100 : 0;

  // === FIX 6B-B: Búsqueda histórica completa por folio/código ===
  // Caso real: cliente regresa horas/días después diciendo "me cobraron mal".
  // El cajero teclea el folio/código del ticket y debe encontrar la venta
  // aunque sea de ayer, antier o de una caja cerrada.
  //
  // Estrategia:
  //  1. Normalizar (trim + UPPERCASE) la query.
  //  2. Buscar primero en pendientes (más rápido) si aplica.
  //  3. Buscar en TODO el historial (`Venta.list` con límite grande).
  //  4. Si encuentra y está pagada → mostrar ticket en modo consulta (no cobrar
  //     dos veces — `handleCobrar` ya rechaza ventas sin total válido).
  //  5. Si encuentra pendiente → flujo de cobro normal.
  //  6. Si no encuentra → mensaje claro.
  const buscarVenta = async () => {
    const codigo = String(codigoBusqueda || '')
      .trim()
      .toUpperCase();
    if (!codigo) return;

    const norm = (s) =>
      String(s || '')
        .trim()
        .toUpperCase();
    let candidatas = [];
    try {
      const lista = [];
      // En Pro priorizamos las pendientes para no chocar con búsqueda activa,
      // pero igualmente cargamos historial completo para soportar "venta vieja".
      // Sin `.catch(() => [])`: era una lectura que DECIDE. Si fallaba, la lista
      // de candidatas quedaba coja y el cajero leía «No se encontró una venta
      // con ese folio» sobre una venta que existe (F1-06 §4.1, `:281` y `:288`).
      // Ahora el fallo sube al `catch` de abajo, que lo dice.
      if (!isCajaDirecta) {
        const pend = await api.entidades.Venta.filter({ estado: 'cuenta_solicitada' });
        lista.push(...(Array.isArray(pend) ? pend : []));
      }
      // Historial extenso. Si el negocio tiene más de 5000 ventas, el cliente
      // puede reportar al cajero el ticket exacto; el límite cubre meses normales.
      const hist = await api.entidades.Venta.list('-created_date', 5000);
      lista.push(...(Array.isArray(hist) ? hist : []));
      // Deduplicar
      const seen = new Set();
      candidatas = lista.filter((v) => {
        if (!v?.id || seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      });
    } catch (err) {
      toast.error(err?.message || 'No se pudo cargar el historial. Intenta de nuevo.');
      return;
    }

    const found = candidatas.find(
      (v) =>
        norm(v?.codigo_caja) === codigo ||
        norm(v?.folio) === codigo ||
        norm(v?.folio).includes(codigo) ||
        norm(v?.notas).includes(codigo),
    );

    if (!found) {
      toast.error('No se encontró una venta con ese folio.');
      return;
    }

    try {
      // Idem `:317`: con `.catch(() => [])` la cuenta se abría SIN líneas y el
      // cajero veía un ticket en $0.00 de una venta que sí tiene productos.
      const detalles = await api.entidades.DetalleVenta.filter({ venta_id: found.id });
      // Ventas pagadas/canceladas → modo consulta (ticket histórico).
      // Caja no debe permitir cobrar dos veces (handleCobrar valida total > 0).
      if (found.estado === 'pagada' || found.estado === 'cancelada') {
        setTicketFinalData({ venta: found, detalles: Array.isArray(detalles) ? detalles : [] });
        setShowTicketFinal(true);
        if (found.estado === 'cancelada') {
          toast.info('Esta venta está cancelada (solo consulta).');
        }
      } else {
        // Pendientes (cuenta_solicitada, abierta, etc.) → flujo de cobro.
        setVentaSeleccionada({ ...found, propina_monto: propinaDerivada(found) });
        setDetallesSeleccionados(Array.isArray(detalles) ? detalles : []);
      }
    } catch (err) {
      toast.error(err?.message || 'Se encontró la venta pero no se pudieron cargar los productos.');
    }
  };

  const abrirVenta = async (venta) => {
    const detalles = await api.entidades.DetalleVenta.filter({ venta_id: venta.id });
    const detallesArr = Array.isArray(detalles) ? detalles : [];

    // HOTFIX 6A — Rescate de totales en CERO al abrir cobro.
    // Si la venta llega con total <= 0 pero los detalles tienen subtotal real,
    // pedimos el total al servidor antes de mostrar el modal. Así el cajero ve
    // el total correcto y puede cobrar normalmente.
    //
    // Antes esto SUMABA las líneas en el navegador y escribía el resultado en
    // `Venta` (subtotal, total, costo, utilidad y margen). Dos cosas mal: la
    // escritura ya no existe —los totales de una orden los pone el servidor— y
    // el número era el del navegador, sin impuestos ni descuentos. `venta.estado`
    // devuelve la cotización recalculada sobre las líneas persistidas, que es la
    // misma que `venta.cobrar` usará para cobrar; usar otra sería enseñar en
    // pantalla un total distinto del que se va a cobrar.
    let ventaFinal = venta;
    const ventaTotal = Number(venta?.total) || 0;
    const subtotalReal = sumarSubtotalDetalles(detallesArr);
    if (subtotalReal > 0 && ventaTotal <= 0) {
      try {
        const estado = await api.comandos.ejecutar('/api/venta/estado', { ordenId: venta.id });
        const totalServidor = aPesos(estado?.cotizacion?.totalCentavos);
        if (totalServidor > 0) {
          ventaFinal = {
            ...venta,
            subtotal: aPesos(estado?.cotizacion?.subtotalCentavos),
            total: totalServidor,
          };
          toast.info('Totales recalculados desde los productos.');
        }
      } catch (err) {
        // No bloqueamos — el cajero verá $0 y el botón "Borrar ticket en cero"
        // como ya estaba antes. Pero el motivo se dice, no se traga.
        toast.error(err?.message || 'No se pudieron recalcular los totales de la cuenta.');
      }
    }

    // La propina del porcentaje se deriva del total ya resuelto, no del que la
    // venta traía: si el total se acaba de recalcular, un 15 % sobre el viejo
    // sería una propina que no corresponde a lo que se va a cobrar.
    setVentaSeleccionada({ ...ventaFinal, propina_monto: propinaDerivada(ventaFinal) });
    setDetallesSeleccionados(detallesArr);
    setMontoEfectivo('');
    setMontoTarjeta('');
    setMontoTransferencia('');
    setPropinaEfectivo('');
    setPropinaTarjeta('');
    setPropinaTransferencia('');
    // Solo abrir modal de propina si propinas están activas Y la venta lo requiere.
    // Tipos que requieren elección explícita en caja:
    //   - 'pendiente': mesero la dejó pendiente.
    //   - 'pendiente_cliente': cliente nunca entró al QR a elegir.
    //   - 'decidir_en_caja': cliente eligió explícitamente decidirla en caja.
    if (tipsEnabled(config)) {
      const tipo = venta?.propina_tipo;
      if (tipo === 'pendiente' || tipo === 'pendiente_cliente' || tipo === 'decidir_en_caja') {
        setShowPropinaCaja(true);
      }
      // Si no tiene tipo (ventas antiguas) NO forzamos modal; quedan en 0 propina.
    }
  };

  // Total a cobrar = venta real + propina (la venta real `total` NUNCA se modifica).
  const totalACobrarVenta = useMemo(() => {
    const t = Number(ventaSeleccionada?.total) || 0;
    const p = Number(ventaSeleccionada?.propina_monto) || 0;
    return t + p;
  }, [ventaSeleccionada]);

  const calcularCambio = () => {
    const recibido = parseFloat(montoEfectivo) || 0;
    return Math.max(0, recibido - totalACobrarVenta);
  };

  // Guarda la propina elegida en caja sobre la venta actual.
  //
  // Ya NO viaja al servidor por su cuenta. La propina va DENTRO del cobro, en
  // cada pago y con su método (`venta.cobrar`, regla 3 de `F1-01` §3): mandarla
  // antes en un `Venta.update` suelto abría la ventana en la que la propina
  // quedaba escrita y el cobro fallaba, y `ordenes` ni siquiera tiene columna de
  // importe de propina — precisamente para que `total` no se pueda inflar con
  // una (F1-04 §6.1). Aquí sólo se recuerda lo que el cajero eligió.
  const aplicarPropinaCaja = (propinaData) => {
    if (!ventaSeleccionada?.id) {
      setShowPropinaCaja(false);
      return;
    }
    const payload = {
      propina_monto: Number(propinaData?.propina_monto) || 0,
      propina_porcentaje: Number(propinaData?.propina_porcentaje) || 0,
      propina_tipo: propinaData?.propina_tipo || 'sin_propina',
      propina_origen: 'caja',
    };
    setVentaSeleccionada((prev) => (prev ? { ...prev, ...payload } : prev));
    setShowPropinaCaja(false);
  };

  // Eliminar/cancelar tickets en CERO ($0.00) — para limpiar caja sin afectar ventas reales.
  const handleEliminarTicketCero = async (venta) => {
    if (!venta) return;
    const total = venta.total || 0;
    if (total > 0) {
      toast.error('Solo se pueden eliminar tickets con total $0.00');
      return;
    }
    if (
      !confirm(
        `¿Seguro que quieres borrar este ticket en cero (${venta.folio})?\nEsta acción no se puede deshacer.`,
      )
    )
      return;
    try {
      // Cancelar la venta y liberar la mesa eran DOS escrituras sueltas, y la
      // de la mesa iba con `.catch(() => {})` (F1-06 §4.1, `:462`): el ticket se
      // cancelaba y la mesa se quedaba ocupada apuntando a una venta que ya no
      // existe. Mesa huérfana, y el cierre del día bloqueado por ella.
      //
      // Con mesa va `restaurante.liberar_mesa`, que en UNA transacción cancela
      // la orden vacía y deja la mesa libre —es la transición «ticket en cero →
      // libre» de F1-04 §8.2— y que además REHÚSA si la cuenta tiene consumo,
      // que es justo lo que este botón nunca debe borrar. Sin mesa (venta
      // directa de mostrador) no hay mesa que liberar: se cancela la orden.
      if (venta.mesa_id) {
        await api.comandos.ejecutar('/api/restaurante/liberar-mesa', { mesaId: venta.mesa_id });
      } else {
        await api.comandos.ejecutar('/api/restaurante/cancelar-orden', {
          ordenId: venta.id,
          motivo: 'Ticket en $0.00 eliminado desde Caja',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['ventas_pendientes_caja'] });
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      setVentaSeleccionada(null);
      setDetallesSeleccionados([]);
      toast.success('Ticket en cero eliminado');
    } catch (err) {
      // El dominio ya lo dice en español: «La mesa 4 tiene una cuenta sin
      // cobrar…». Se enseña tal cual en vez de un «No se pudo» que no explica
      // nada y hace que el cajero lo intente otra vez.
      toast.error(err?.message || 'No se pudo eliminar el ticket');
    }
  };

  const handleCobrar = async () => {
    if (!ventaSeleccionada?.id) {
      toast.error('No hay venta seleccionada');
      return;
    }
    if (procesando) return;
    if (!hayCaja) {
      toast.error('No hay caja abierta. Abre caja para cobrar.');
      return;
    }
    const total = ventaSeleccionada.total || 0;
    if (!total || total <= 0) {
      toast.error('La venta no tiene total válido');
      return;
    }
    if (!metodoPago) {
      toast.error('Selecciona un método de pago');
      return;
    }
    // Si la venta quedó marcada "decidir en caja" y aún no se eligió propina, forzar el modal.
    // Solo si propinas están activas; si están desactivadas, ignoramos el pendiente.
    // Se aplica a: 'pendiente' (mesero), 'pendiente_cliente' (QR sin elección),
    // 'decidir_en_caja' (cliente delegó explícitamente en caja) y 'monto_manual'.
    //
    // `monto_manual` se añadió porque el importe que se reconstruye de los
    // puntos base puede diferir en un centavo del que el comensal escribió: el
    // cajero lo ve prellenado y lo confirma, que es exactamente lo que este
    // diálogo existe para hacer. Antes ese caso ni forzaba el diálogo ni se
    // derivaba, así que la propina del portal se perdía entera.
    const tiposQueForzanModal = [
      'pendiente',
      'pendiente_cliente',
      'decidir_en_caja',
      'monto_manual',
    ];
    if (tiposQueForzanModal.includes(ventaSeleccionada.propina_tipo) && tipsEnabled(config)) {
      setShowPropinaCaja(true);
      toast.error('Define la propina antes de cobrar (o "Sin propina").');
      return;
    }
    setProcesando(true);
    setProcesandoMsg('Procesando cobro…');

    // El cliente paga venta + propina. La venta real (`total`) NO se infla.
    const propinaMonto = Number(ventaSeleccionada.propina_monto) || 0;
    const totalACobrar = total + propinaMonto;

    let mEfec = parseFloat(montoEfectivo) || 0;
    let mTar = parseFloat(montoTarjeta) || 0;
    let mTrans = parseFloat(montoTransferencia) || 0;

    if (metodoPago === 'efectivo') {
      mEfec = totalACobrar;
      mTar = 0;
      mTrans = 0;
    }
    if (metodoPago === 'tarjeta') {
      mTar = totalACobrar;
      mEfec = 0;
      mTrans = 0;
    }
    if (metodoPago === 'transferencia') {
      mTrans = totalACobrar;
      mEfec = 0;
      mTar = 0;
    }

    // === Propinas EXACTAS por método (no proporcional) ===
    // Regla:
    //  - 1 solo método: 100% de la propina a ese método.
    //  - Mixto: el cajero debe haber ingresado el desglose; validamos que sume.
    let propEf = 0,
      propTa = 0,
      propTr = 0;
    if (propinaMonto > 0) {
      if (metodoPago === 'efectivo') {
        propEf = propinaMonto;
      } else if (metodoPago === 'tarjeta') {
        propTa = propinaMonto;
      } else if (metodoPago === 'transferencia') {
        propTr = propinaMonto;
      } else if (metodoPago === 'mixto') {
        propEf = parseFloat(propinaEfectivo) || 0;
        propTa = parseFloat(propinaTarjeta) || 0;
        propTr = parseFloat(propinaTransferencia) || 0;
        const sumaProp = propEf + propTa + propTr;
        if (Math.abs(sumaProp - propinaMonto) > 0.01) {
          toast.error(
            `La suma de propinas por método (${formatCurrency(sumaProp)}) debe coincidir con la propina total (${formatCurrency(propinaMonto)}).`,
          );
          setProcesando(false);
          setProcesandoMsg('');
          return;
        }
      }
    }

    // === El cuerpo del cobro ================================================
    // Un renglón de pago por método, cada uno con SU propina, exacta (regla 3
    // de `F1-01` §3): si el comensal dejó 50 en efectivo y 30 en tarjeta, son
    // 50 y 30, nunca un reparto proporcional. `montoCentavos` es la VENTA; la
    // propina viaja en su propio campo y NO cuenta para cubrir el total, que es
    // la regla 1 — `Venta.total` es la venta SIN propina.
    const pagos = [];
    const agregarPago = (metodo, ventaPesos, propinaPesos, recibidoPesos) => {
      const montoCentavos = aCentavos(ventaPesos);
      if (montoCentavos <= 0) return;
      const pago = { metodo, montoCentavos };
      const propinaCentavos = aCentavos(propinaPesos);
      if (propinaCentavos > 0) pago.propinaCentavos = propinaCentavos;
      // El «Recibido» sólo se manda si de verdad cubre venta + propina: es de
      // donde el servidor saca el cambio, y si no alcanza rechaza el cobro. El
      // campo vacío significa importe exacto, igual que hasta hoy.
      if (metodo === 'efectivo' && recibidoPesos !== undefined) {
        const recibidoCentavos = aCentavos(recibidoPesos);
        if (recibidoCentavos >= montoCentavos + propinaCentavos) {
          pago.recibidoCentavos = recibidoCentavos;
        }
      }
      pagos.push(pago);
    };

    if (metodoPago === 'mixto') {
      agregarPago('efectivo', parseFloat(montoEfectivo) || 0, propEf);
      agregarPago('tarjeta', parseFloat(montoTarjeta) || 0, propTa);
      agregarPago('transferencia', parseFloat(montoTransferencia) || 0, propTr);
    } else {
      agregarPago(
        metodoPago,
        total,
        propinaMonto,
        metodoPago === 'efectivo' ? parseFloat(montoEfectivo) || 0 : undefined,
      );
    }

    // Sólo puede pasar en mixto, con los tres campos vacíos. Se dice aquí en vez
    // de mandar un cobro sin pagos y que vuelva un ENTRADA_INVALIDA de esquema.
    if (pagos.length === 0) {
      toast.error('Escribe cuánto se pagó con cada método.');
      setProcesando(false);
      setProcesandoMsg('');
      return;
    }

    const cuerpoCobro = {
      ordenId: ventaSeleccionada.id,
      pagos,
      // Lo que ESTA pantalla creía que costaba. No cobra: el servidor recalcula
      // y, si no coincide, rechaza con el total correcto en vez de cobrar otro
      // número en silencio. El cajero ya le dijo una cifra al cliente.
      totalEsperadoCentavos: aCentavos(total),
    };
    // Metadatos de cómo se decidió la propina. No son importes —en `ordenes` no
    // cabe ninguno de propina, y por eso `total` no se puede inflar con una— y
    // se filtran contra la lista válida para que un valor viejo no tumbe el
    // cobro entero con ENTRADA_INVALIDA.
    const puntosBase = Math.round((Number(ventaSeleccionada.propina_porcentaje) || 0) * 100);
    if (puntosBase > 0 && puntosBase <= 10000) cuerpoCobro.propinaPuntosBase = puntosBase;
    if (TIPOS_DE_PROPINA.includes(ventaSeleccionada.propina_tipo)) {
      cuerpoCobro.propinaTipo = ventaSeleccionada.propina_tipo;
    }
    if (ORIGENES_DE_PROPINA.includes(ventaSeleccionada.propina_origen)) {
      cuerpoCobro.propinaOrigen = ventaSeleccionada.propina_origen;
    }

    // 🟡 HOTFIX bandera amarilla #2: bandera declarada FUERA del try para que
    // el catch final pueda leerla y diferenciar errores pre/post-cobro.
    // (Las `let` declaradas dentro de un try NO son visibles desde el catch.)
    let ventaQuedoPagada = false;
    let cambio = 0;

    try {
      setProcesandoMsg('Guardando venta…');
      // ── D-07, y es el motivo de este archivo ────────────────────────────
      // Aquí había dos pasos y medio: se marcaba la venta `pagada` y DESPUÉS se
      // lanzaban en paralelo el descuento de stock, el movimiento de inventario
      // y los descuentos de venta, los tres con `.catch(() => {})` y bajo un
      // `catch` exterior que sólo hacía `console.warn`. Si el lote fallaba no
      // fallaba nada visible: quedaba una venta pagada de $1 180 con el stock
      // intacto y el ledger vacío, y se descubría a media noche del viernes.
      //
      // `venta.cobrar` hace TODO eso en UNA transacción —totales, folio, pagos,
      // propina por método, movimiento de caja, stock y ledger— y o confirma
      // todo o no persiste nada. Por eso también desaparece la validación de
      // stock del navegador: el servidor la hace con la guarda en el `WHERE` de
      // las existencias, dentro de la misma transacción que descuenta, y una
      // comprobación previa sobre una lectura anterior no puede ser exacta.
      //
      // Y desaparece el costeo del cliente: costo, utilidad y margen los calcula
      // el servidor sobre las líneas que está congelando.
      //
      // `claveCobro` se generó al ABRIR el diálogo y se reusa mientras siga
      // abierto: es lo que impide que un doble clic en «Cobrar» cobre dos veces.
      const cobro = await api.comandos.ejecutar(
        '/api/venta/cobrar',
        cuerpoCobro,
        claveCobro || undefined,
      );
      ventaQuedoPagada = true;
      // El cambio que se le da al cliente es el del servidor, no el de la resta
      // del navegador: allí es donde se sabe qué se cobró de verdad.
      cambio = aPesos(cobro?.cambioCentavos);

      if (ventaSeleccionada.mesa_id) {
        // La mesa se libera con su comando, no con un `Mesa.update` suelto y
        // silencioso (`:923`): «se cobró la mesa y sigue marcada como ocupada»
        // es exactamente lo que bloquea el cierre del día. La venta YA está
        // cobrada, así que un fallo aquí no puede tirar el cobro — pero sí se
        // dice, porque la mesa se queda ocupada y alguien tiene que liberarla.
        try {
          await api.comandos.ejecutar('/api/restaurante/liberar-mesa', {
            mesaId: ventaSeleccionada.mesa_id,
          });
        } catch (errMesa) {
          toast.warning(errMesa?.message || 'La venta se cobró, pero la mesa sigue ocupada.', {
            duration: 10000,
          });
        }
      }

      // BLOQUE 0 — OPTIMISTIC UPDATE:
      // Quitar la venta cobrada del listado de pendientes INMEDIATAMENTE,
      // sin esperar al próximo refetch. Si por algún motivo el cobro falla más
      // adelante, el siguiente refetch automático corregirá el estado.
      const ventaCobradaId = ventaSeleccionada.id;
      queryClient.setQueryData(['ventas_pendientes_caja'], (prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.filter((v) => v?.id !== ventaCobradaId);
      });

      // Invalidar TODO lo que se refleja en Caja, Ventas, Registros y Dashboard.
      queryClient.invalidateQueries({ queryKey: ['ventas_pendientes_caja'] });
      queryClient.invalidateQueries({ queryKey: ['ventas_pagadas_caja'] });
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      queryClient.invalidateQueries({ queryKey: ['ventas_hoy'] });
      queryClient.invalidateQueries({ queryKey: ['ventas_all'] }); // ← FIX: query de pages/Ventas.jsx
      queryClient.invalidateQueries({ queryKey: ['registros_ventas'] });
      queryClient.invalidateQueries({ queryKey: ['propinas_dashboard_ventas'] });
      queryClient.invalidateQueries({ queryKey: ['cortes_caja_estado'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_data'] });
      // El stock y el ledger los movió la misma transacción del cobro: las tres
      // vistas de inventario se refrescan igual que antes lo hacía el bloque
      // que descontaba a mano.
      queryClient.invalidateQueries({ queryKey: ['ingredientes_all'] });
      queryClient.invalidateQueries({ queryKey: ['descuentos_hoy'] });
      queryClient.invalidateQueries({ queryKey: ['movimientos_inv'] });
      // Refetch activo de pendientes para que el badge en el header baje al instante.
      queryClient
        .refetchQueries({ queryKey: ['ventas_pendientes_caja'], type: 'active' })
        .catch(() => {});

      setProcesandoMsg('Generando ticket…');
      // Construir SNAPSHOT defensivo de los datos del ticket ANTES de limpiar nada.
      // Si algo de aquí falla, atrapamos el error y la venta NO se rompe — solo
      // perdemos el ticket en pantalla (la venta ya quedó cobrada en BD).
      try {
        const ventaPagada = {
          ...(ventaSeleccionada || {}),
          estado: 'pagada',
          // El folio lo pone el servidor con un consecutivo atómico AL COBRAR:
          // `ordenes.folio` es nulo hasta entonces (`orden_pagada_con_folio`),
          // así que sin esto el ticket salía sin número. Se enseña el folio a
          // secas —sin la serie— porque es lo que la misma venta enseña luego en
          // Ventas y en Registros, y es el número que el cliente va a citar.
          folio: cobro?.folio ? String(cobro.folio) : ventaSeleccionada?.folio,
          metodo_pago: metodoPago,
          monto_efectivo: mEfec,
          monto_tarjeta: mTar,
          monto_transferencia: mTrans,
          cambio,
        };
        const detallesSnap = Array.isArray(detallesSeleccionados) ? [...detallesSeleccionados] : [];
        setTicketFinalData({ venta: ventaPagada, detalles: detallesSnap });
        setShowTicketFinal(true);
      } catch (errTicket) {
        toast.error(
          errTicket?.message ||
            'Venta cobrada, pero no se pudo mostrar el ticket. Búscalo en historial.',
        );
      }

      // Limpieza de estados del cobro (independiente del ticket)
      setVentaSeleccionada(null);
      setDetallesSeleccionados([]);
      setMetodoPago('efectivo');
      setMontoEfectivo('');
      setMontoTarjeta('');
      setMontoTransferencia('');
      setPropinaEfectivo('');
      setPropinaTarjeta('');
      setPropinaTransferencia('');
      toast.success(`¡Venta cobrada! Cambio: ${formatCurrency(cambio)}`);
    } catch (err) {
      // 🟡 HOTFIX bandera amarilla #2: mensaje correcto según el momento del fallo.
      // - Si venta NO quedó pagada → el motivo TAL CUAL lo dice el dominio, que
      //   ya viene en español: «No hay inventario suficiente para completar la
      //   venta», «Abre la caja antes de cobrar», «Esa venta ya se cobró». Un
      //   «no se pudo, intenta de nuevo» hace que el cajero lo intente otra vez
      //   sin arreglar lo que falla.
      // - Si venta SÍ quedó pagada → confirmar cobro y avisar que el problema
      //   fue posterior. La venta YA está en Ventas/Registros.
      if (ventaQuedoPagada) {
        toast.warning(
          'Venta cobrada correctamente. Hubo un problema con el ticket. ' +
            'Búscala en Ventas o Registros — no la cobres de nuevo.',
          { duration: 10000 },
        );
      } else {
        toast.error(err?.message || 'No se pudo cobrar la venta. Intenta de nuevo.');
      }
    } finally {
      setProcesando(false);
      setProcesandoMsg('');
    }
  };

  const invalidarCajaQueries = () => {
    // Refresca TODOS los lugares donde se ven cortes o resúmenes derivados de ellos.
    // Al cerrar caja, el dashboard y registros deben actualizarse inmediatamente.
    queryClient.invalidateQueries({ queryKey: ['cortes'] });
    queryClient.invalidateQueries({ queryKey: ['cortes_caja_estado'] });
    queryClient.invalidateQueries({ queryKey: ['cortes_historial'] });
    queryClient.invalidateQueries({ queryKey: ['registros_cortes'] });
    queryClient.invalidateQueries({ queryKey: ['ventas_hoy'] });
    queryClient.invalidateQueries({ queryKey: ['ventas_pagadas_caja'] });
    queryClient.invalidateQueries({ queryKey: ['ventas_pendientes_caja'] });
    queryClient.invalidateQueries({ queryKey: ['gastos_hoy'] });
    queryClient.invalidateQueries({ queryKey: ['ingredientes_all'] });
    queryClient.invalidateQueries({ queryKey: ['descuentos_hoy'] });
    queryClient.invalidateQueries({ queryKey: ['propinas_dashboard_ventas'] });
    queryClient.invalidateQueries({ queryKey: ['registros_ventas'] });
    // Refetch inmediato de las queries activas más importantes:
    queryClient.refetchQueries({ queryKey: ['cortes'] }).catch(() => {});
    queryClient.refetchQueries({ queryKey: ['ventas_hoy'] }).catch(() => {});
  };

  // 1) ABRIR CAJA — crea CorteCaja tipo cierre_diario, estado abierto.
  const handleAbrirCaja = async (form) => {
    if (accionLoading) return;
    if (!posUser?.id) {
      toast.error('No hay usuario POS activo');
      return;
    }
    setAccionLoading(true);
    try {
      // La comprobación «¿ya hay otra caja abierta?» que había aquí era una
      // lectura del navegador entre dos cajeros: los dos leían «no hay» y los
      // dos abrían. Ahora la impone el índice único parcial
      // `sesiones_caja_una_abierta_por_terminal`, y `caja.abrir` traduce esa
      // colisión a «Esta terminal ya tiene una caja abierta» — una frase que ya
      // viene en español y se enseña tal cual.
      //
      // Del formulario sólo viaja el efectivo contado: el fondo esperado y la
      // diferencia los deriva el servidor, y el folio lo pone el consecutivo
      // atómico, no `generateFolio` en el navegador.
      await api.comandos.ejecutar('/api/caja/abrir', {
        fondoInicialCentavos: aCentavos(form.efectivo_inicial_contado),
      });
      invalidarCajaQueries();
      setShowAbrirCaja(false);
      toast.success('Caja abierta. Ya puedes cobrar.');
    } catch (err) {
      toast.error(err?.message || 'No se pudo abrir la caja');
    } finally {
      setAccionLoading(false);
    }
  };

  // 2) CORTE DE TURNO — registro independiente, NO cierra la caja.
  //
  // Aquí había un `api.entidades.CorteCaja.create({ folio: generateFolio('CT'),
  // usuario_cajero_id: posUser?.id, total_general: resumen.totalGeneral, … })`
  // con tres defectos en una llamada: el folio lo inventaba el navegador —dos
  // terminales cortando a la vez producían el mismo—, la atribución viajaba en
  // el cuerpo, y los cuatro totales los sumaba la pantalla sobre lo que tuviera
  // cargado. Y encima `CorteCaja` mapea `sesiones_caja`, no `cortes_turno`, así
  // que el puente la rechazaba y el botón FALLABA SIEMPRE.
  //
  // `caja.corte_turno` lo hace entero en el servidor: folio de la serie `CT`,
  // el firmante de la sesión, y el arqueo derivado dentro de la transacción,
  // con el rango arrancando donde acabó el corte anterior —sin eso, el segundo
  // corte del día vuelve a contar las ventas del primero—. Lo único que el
  // cajero aporta sigue siendo lo que CONTÓ.
  const handleCorteTurno = async (form) => {
    if (accionLoading) return;
    if (!cajaAbierta?.id) {
      toast.error('No hay caja abierta');
      return;
    }
    setAccionLoading(true);
    try {
      await api.comandos.ejecutar('/api/caja/corte-turno', {
        efectivoContadoCentavos: aCentavos(form.efectivo_contado),
        notas: form.notas || null,
      });
      invalidarCajaQueries();
      setShowCorteTurno(false);
      toast.success('Corte de turno registrado');
    } catch (err) {
      toast.error(err?.message || 'No se pudo registrar el corte de turno');
    } finally {
      setAccionLoading(false);
    }
  };

  // 6A: Verificar mesas pendientes ANTES de abrir el dialog de cierre.
  // Si todas están libres, abre el dialog. Si hay alguna ocupada, muestra el
  // dialog de bloqueo con la lista.
  const intentarAbrirCierreDiario = async () => {
    if (verificandoMesas) return;
    if (!hayCaja) {
      toast.error('No hay caja abierta.');
      return;
    }
    setVerificandoMesas(true);
    try {
      const pendientes = await obtenerMesasPendientesCierre();
      if (Array.isArray(pendientes) && pendientes.length > 0) {
        setMesasPendientes(pendientes);
        return;
      }
      // Sin mesas pendientes → permitir cierre
      setShowCierreDiario(true);
    } catch (e) {
      // Antes esto abría el diálogo igual, «mejor permitir que el cajero cierre
      // que dejarlo varado». Pero cerrar el día sin saber si hay mesas abiertas
      // no es permitir: es cerrar a ciegas, y lo que queda mal en la base no lo
      // arregla nadie al día siguiente. Si no se pudo comprobar, no se cierra.
      toast.error(
        e?.message || 'No se pudo comprobar si quedan mesas abiertas. Reintenta antes de cerrar.',
      );
    } finally {
      setVerificandoMesas(false);
    }
  };

  // 3) CIERRE DIARIO — cierra la caja, genera PDF, reinicia dashboard operativo.
  const handleCierreDiario = async (form) => {
    if (accionLoading) return;
    if (!cajaAbierta?.id) {
      toast.error('No hay caja abierta para cerrar');
      return;
    }
    setAccionLoading(true);
    try {
      // 6A: segunda verificación anti-race. Si alguien abrió una mesa
      // mientras el dialog estaba abierto, bloqueamos aquí también.
      //
      // El `.catch(() => [])` que había aquí anulaba este guardia entero: si la
      // lectura fallaba devolvía «no hay pendientes» y el día se cerraba igual.
      // Ahora el fallo sube al `catch` de abajo, que avisa y NO cierra.
      const pendientesFinales = await obtenerMesasPendientesCierre();
      if (Array.isArray(pendientesFinales) && pendientesFinales.length > 0) {
        setMesasPendientes(pendientesFinales);
        setShowCierreDiario(false);
        setAccionLoading(false);
        return;
      }
      const fechaCierreIso = new Date().toISOString();
      const corteId = cajaAbierta.id;

      // El cierre entero es UNA transacción del servidor. Antes eran tres pasos
      // sueltos: el `CorteCaja.update` con veinte totales calculados en el
      // navegador, el lote de `Venta.update({corte_caja_id})` con
      // `.catch(() => {})` —ventas pagadas que se quedaban sin corte y no salían
      // ni en el PDF ni cuadraban con el efectivo (F1-06 §4.1, `:1211`)— y la
      // cola de sincronización.
      //
      // `caja.cerrar` deriva el arqueo DENTRO de su propia transacción, así que
      // una venta cobrada mientras el diálogo estaba abierto entra en el corte
      // en vez de quedarse fuera. Y por eso no se le manda ningún total: lo
      // único que el servidor no puede saber es cuánto dinero hay físicamente
      // en el cajón, y eso es lo que viaja.
      const arqueo = await api.comandos.ejecutar('/api/caja/cerrar', {
        efectivoContadoCentavos: aCentavos(form.efectivo_contado),
        ...(form.notas ? { notas: form.notas } : {}),
      });

      // Lo que se enseña y se imprime. El esperado, la diferencia y el número de
      // ventas son los del SERVIDOR —los del navegador se calculaban sobre una
      // lista que llevaba minutos en pantalla—; el resto del desglose sigue
      // siendo el mismo resumen que el cajero acaba de ver en el diálogo.
      const data = {
        tipo_corte: 'cierre_diario',
        estado: 'cerrado',
        fecha_inicio:
          cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio || cajaAbierta.created_date,
        fecha_cierre: fechaCierreIso,
        usuario_cajero_id: posUser?.id,
        usuario_cajero_nombre: posUser?.nombre,
        total_efectivo: resumen.totalEfectivo,
        total_tarjeta: resumen.totalTarjeta,
        total_transferencia: resumen.totalTransferencia,
        total_general: resumen.totalGeneral,
        total_propinas: resumen.totalPropinas || 0,
        propinas_por_mesero: JSON.stringify(resumen.propinasPorMesero || []),
        costo_total_estimado: resumen.costoTotal,
        utilidad_bruta_total: resumen.utilidadBruta,
        margen_promedio: margenProm,
        numero_ventas: arqueo?.numeroVentas ?? resumen.numVentas,
        ticket_promedio: resumen.ticketPromedio,
        total_gastos: resumen.totalGastos,
        efectivo_esperado: aPesos(arqueo?.efectivoEsperadoCentavos),
        efectivo_contado: aPesos(arqueo?.efectivoContadoCentavos),
        diferencia_efectivo: aPesos(arqueo?.diferenciaCentavos),
        dinero_dejado_en_caja: form.dinero_dejado_en_caja,
        utilidad_neta_estimada: form.utilidad_neta_estimada,
        notas: form.notas,
      };

      // Cola de sincronización (no bloqueante)
      try {
        const nowIso = new Date().toISOString();
        await Promise.all([
          api.entidades.IntegrationSyncLog.create({
            record_type: 'cash_cut',
            record_id: corteId,
            destination: 'google_sheets',
            status: 'pending_external_sync',
            attempts: 0,
            last_attempt_at: nowIso,
          }),
          api.entidades.IntegrationSyncLog.create({
            record_type: 'cash_cut_pdf',
            record_id: corteId,
            destination: 'google_drive',
            status: 'pending_external_sync',
            attempts: 0,
            last_attempt_at: nowIso,
          }),
        ]);
        queryClient.invalidateQueries({ queryKey: ['integration_sync_logs_pending'] });
      } catch (err) {
        // La caja YA está cerrada: esto es una cola externa, y no encolar un
        // envío a Sheets no invalida el corte. Pero se dice, en vez de tragarlo.
        toast.warning(err?.message || 'La caja se cerró; la cola de sincronización no se encoló.');
      }

      invalidarCajaQueries();
      queryClient.invalidateQueries({ queryKey: ['ventas_pagadas_caja'] });
      queryClient.invalidateQueries({ queryKey: ['ventas_hoy'] });

      const corteFinal = { ...data, id: corteId, folio: cajaAbierta.folio };
      setCorteCerrado(corteFinal);
      setShowCierreDiario(false);

      // Auto-descarga PDF si la config lo permite
      const autoPDF = config?.descargar_pdf_corte_auto !== false;
      if (autoPDF) setAutoDownloadCorte(corteFinal);

      setShowCierreExito(true);
      toast.success('¡Caja cerrada correctamente!');
    } catch (err) {
      // «No hay una caja abierta», «Esa caja ya se había cerrado», «Cierra la
      // caja desde la terminal»: el dominio ya lo dice en español y con el
      // motivo. Un «intenta de nuevo» genérico haría reintentar un cierre que
      // no va a funcionar hasta que se arregle lo que falla.
      toast.error(err?.message || 'No se pudo cerrar la caja. Intenta de nuevo.');
    } finally {
      setAccionLoading(false);
    }
  };

  return (
    <div className="space-y-4 px-1 sm:px-0 max-w-full overflow-x-hidden">
      {/* Header — responsive: stack en móvil, botones en grid 3-col */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, hsl(4,72%,46%) 0%, hsl(4,72%,34%) 100%)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            <Landmark className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-heading font-bold">Caja</h1>
            <p className="text-xs text-muted-foreground truncate">
              {hayCaja
                ? isCajaDirecta
                  ? 'Punto de venta directo'
                  : `${ventasPendientes.length} cobros pendientes`
                : 'Caja cerrada'}
            </p>
          </div>
        </div>

        {/* === 3 BOTONES PRINCIPALES — grid en móvil para que se vean enteros === */}
        <div className="grid grid-cols-3 sm:flex gap-2 w-full sm:w-auto">
          <Button
            size="sm"
            onClick={() => setShowAbrirCaja(true)}
            disabled={hayCaja}
            variant={hayCaja ? 'outline' : 'default'}
            title={hayCaja ? 'Ya hay una caja abierta' : 'Abrir caja para comenzar operación'}
            className="px-2"
          >
            <DoorOpen className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Abrir caja</span>
            <span className="sm:hidden text-[10px]">Abrir</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCorteTurno(true)}
            disabled={!hayCaja}
            title={!hayCaja ? 'Necesitas una caja abierta' : 'Corte parcial de turno'}
            className="px-2"
          >
            <Scissors className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Corte de turno</span>
            <span className="sm:hidden text-[10px]">Turno</span>
          </Button>
          <Button
            size="sm"
            onClick={intentarAbrirCierreDiario}
            disabled={!hayCaja || verificandoMesas}
            title={!hayCaja ? 'Necesitas una caja abierta' : 'Cierre final del día'}
            className="px-2"
            style={
              hayCaja
                ? { background: 'linear-gradient(135deg, hsl(0,72%,46%) 0%, hsl(0,72%,36%) 100%)' }
                : undefined
            }
          >
            <Lock className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">
              {verificandoMesas ? 'Verificando…' : 'Cierre diario'}
            </span>
            <span className="sm:hidden text-[10px]">{verificandoMesas ? '…' : 'Cierre'}</span>
          </Button>
        </div>
      </div>

      {/* Aviso si NO hay caja abierta */}
      {!hayCaja && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border-2 border-amber-200 text-sm text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
          <div className="flex-1">
            <p className="font-bold">No hay caja abierta</p>
            <p className="text-xs opacity-90">
              Abre caja para comenzar operación. No se puede cobrar ni generar tickets finales sin
              caja abierta.
            </p>
          </div>
          <Button size="sm" onClick={() => setShowAbrirCaja(true)} className="shrink-0">
            <DoorOpen className="w-4 h-4 mr-1" /> Abrir caja
          </Button>
        </div>
      )}

      {/* Acción principal en Esencial/Operativo: NUEVA VENTA */}
      {isCajaDirecta && hayCaja && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Link to="/pos" className="block">
            <button
              className="w-full p-5 rounded-2xl border-2 border-primary bg-primary text-primary-foreground text-left transition-all hover:brightness-110 active:scale-[0.99]"
              style={{
                boxShadow: '0 2px 0 rgba(255,255,255,0.2) inset, 0 6px 18px rgba(0,0,0,0.15)',
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <ShoppingCart className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-heading font-black text-xl leading-tight">Nueva venta</p>
                  <p className="text-xs opacity-90">Selecciona productos y cobra al instante</p>
                </div>
              </div>
            </button>
          </Link>
          <button
            onClick={intentarAbrirCierreDiario}
            disabled={verificandoMesas}
            className="w-full p-5 rounded-2xl border-2 border-border bg-card text-left transition-all hover:bg-muted active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              boxShadow: '0 2px 0 rgba(255,255,255,0.9) inset, 0 6px 18px rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                <Lock className="w-6 h-6 text-foreground" />
              </div>
              <div>
                <p className="font-heading font-black text-xl leading-tight">
                  {verificandoMesas ? 'Verificando…' : 'Cierre diario'}
                </p>
                <p className="text-xs text-muted-foreground">Finaliza el día y genera PDF</p>
              </div>
            </div>
          </button>
        </div>
      )}

      {hayCaja && cajaAbierta && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 flex items-center gap-2 flex-wrap">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>
            Caja abierta desde{' '}
            {safeFormatDate(cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio, 'd MMM, HH:mm')}{' '}
            · {cajaAbierta.folio}
            {cajaAbierta.usuario_apertura_nombre && ` · por ${cajaAbierta.usuario_apertura_nombre}`}
          </span>
        </div>
      )}

      <Tabs defaultValue={isCajaDirecta ? 'buscar' : 'cobros'}>
        {/* Tabs scrollable horizontalmente en móvil */}
        <TabsList className="mb-4 flex w-full overflow-x-auto justify-start no-scrollbar">
          {!isCajaDirecta && (
            <TabsTrigger value="cobros" className="shrink-0">
              Pendientes ({ventasPendientes.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="buscar" className="shrink-0">
            Buscar
          </TabsTrigger>
          <TabsTrigger value="resumen" className="shrink-0">
            Resumen
          </TabsTrigger>
          <TabsTrigger value="historial" className="shrink-0">
            Historial
          </TabsTrigger>
        </TabsList>

        {/* COBROS PENDIENTES (solo Restaurante Pro) */}
        {!isCajaDirecta && (
          <TabsContent value="cobros">
            {ventasPendientes.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-300" />
                <p className="font-medium">Sin cobros pendientes</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ventasPendientes.map((v) => {
                  const esCero = !v.total || v.total <= 0;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => (esCero ? handleEliminarTicketCero(v) : abrirVenta(v))}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all active:scale-[0.98] ${esCero ? 'border-red-200 bg-red-50 hover:bg-red-100' : 'border-purple-200 bg-purple-50 hover:bg-purple-100'}`}
                      style={{
                        boxShadow:
                          '0 2px 0 rgba(255,255,255,0.8) inset, 0 3px 8px rgba(0,0,0,0.08)',
                        touchAction: 'manipulation',
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-heading font-bold text-base">
                            Mesa {v.mesa_numero || '—'}
                          </p>
                          <p className="text-xs text-muted-foreground">{v.folio}</p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${esCero ? 'bg-red-200 text-red-800' : 'bg-purple-200 text-purple-800'}`}
                        >
                          {esCero ? 'En cero' : 'Cuenta'}
                        </span>
                      </div>
                      <p
                        className={`text-2xl font-heading font-black ${config?.colorear_importes_monetarios !== false ? 'text-primary' : 'text-foreground'}`}
                      >
                        {formatCurrency(v.total)}
                      </p>
                      {/* Badges QR — diferencian estado de la propina del comensal */}
                      {(v.propina_origen === 'portal_qr' ||
                        v.propina_origen === 'pendiente_portal_qr') && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {v.propina_origen === 'pendiente_portal_qr' ||
                          v.propina_tipo === 'pendiente_cliente' ? (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              QR: esperando propina
                            </span>
                          ) : v.propina_tipo === 'decidir_en_caja' ? (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              QR: decidir en caja
                            </span>
                          ) : v.propina_tipo === 'sin_propina' ? (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              QR: sin propina
                            </span>
                          ) : v.propina_tipo === 'porcentaje' &&
                            Number(v.propina_porcentaje) > 0 ? (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                              QR: propina {v.propina_porcentaje}% (
                              {formatCurrency(Number(v.propina_monto) || 0)})
                            </span>
                          ) : (Number(v.propina_monto) || 0) > 0 ? (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                              QR: propina {formatCurrency(Number(v.propina_monto) || 0)}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              QR: cuenta solicitada
                            </span>
                          )}
                        </div>
                      )}
                      {v.codigo_caja && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Código: <span className="font-mono font-bold">{v.codigo_caja}</span>
                        </p>
                      )}
                      {v.personas > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          {v.personas} personas{v.cliente_nombre ? ` · ${v.cliente_nombre}` : ''}
                        </p>
                      )}
                      <p
                        className={`mt-2 text-xs font-semibold ${esCero ? 'text-red-700' : 'text-primary'}`}
                      >
                        {esCero ? '🗑 Borrar ticket en cero →' : 'Toca para cobrar →'}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </TabsContent>
        )}

        {/* BUSCAR */}
        <TabsContent value="buscar">
          <div className="max-w-sm mx-auto space-y-4">
            <div
              className="p-5 rounded-xl border bg-white space-y-3"
              style={{
                boxShadow: '0 2px 0 rgba(255,255,255,0.9) inset, 0 4px 12px rgba(0,0,0,0.06)',
              }}
            >
              <p className="font-heading font-semibold">Buscar por código o folio</p>
              <div className="flex gap-2">
                <Input
                  value={codigoBusqueda}
                  onChange={(e) => setCodigoBusqueda(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && buscarVenta()}
                  placeholder="Ej: M03-5821"
                  className="font-mono text-lg h-12 tracking-wider"
                />
                <Button onClick={buscarVenta} className="h-12 px-4">
                  <Search className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* RESUMEN — usa componente unificado con propinas + total cobrado */}
        <TabsContent value="resumen">
          <ResumenDelDia
            resumen={resumen}
            margenProm={margenProm}
            verCostos={verCostos}
            ventasHoy={ventasHoy}
            cajaAbierta={cajaAbierta}
            ventasPendientes={ventasPendientes}
            colorearImportes={config?.colorear_importes_monetarios !== false}
          />
        </TabsContent>

        {/* HISTORIAL */}
        <TabsContent value="historial">
          <CorteHistorialList limit={100} />
        </TabsContent>
      </Tabs>

      {/* COBRO DIALOG */}
      <Dialog open={!!ventaSeleccionada} onOpenChange={() => setVentaSeleccionada(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              Cobrar — Mesa {ventaSeleccionada?.mesa_numero || ventaSeleccionada?.folio}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Aviso si la cuenta involucra el Portal QR del comensal */}
            {(ventaSeleccionada?.propina_origen === 'portal_qr' ||
              ventaSeleccionada?.propina_origen === 'pendiente_portal_qr') &&
              (() => {
                const origen = ventaSeleccionada?.propina_origen;
                const tipo = ventaSeleccionada?.propina_tipo;
                const monto = Number(ventaSeleccionada?.propina_monto) || 0;
                let titulo = 'Cuenta solicitada desde QR';
                let mensaje = '';
                let palette = 'bg-blue-50 border-blue-200 text-blue-900';
                if (origen === 'pendiente_portal_qr' || tipo === 'pendiente_cliente') {
                  titulo = 'QR: esperando propina del comensal';
                  mensaje =
                    'El cliente aún no eligió propina en el QR. Puedes esperar o cobrar definiendo tú la propina.';
                  palette = 'bg-amber-50 border-amber-200 text-amber-900';
                } else if (tipo === 'decidir_en_caja') {
                  titulo = 'El cliente decidió en caja';
                  mensaje =
                    'Define la propina aquí (porcentaje, monto o sin propina) antes de cobrar.';
                  palette = 'bg-blue-50 border-blue-200 text-blue-900';
                } else if (tipo === 'sin_propina') {
                  mensaje = 'El cliente eligió no dejar propina.';
                } else if (monto > 0) {
                  mensaje = `Propina sugerida por el cliente: ${formatCurrency(monto)}. Puedes ajustarla o quitarla si lo pide.`;
                }
                return (
                  <div
                    className={`rounded-xl p-2.5 border text-xs flex items-start gap-2 ${palette}`}
                  >
                    <Smartphone className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold">{titulo}</p>
                      {mensaje && <p>{mensaje}</p>}
                    </div>
                  </div>
                );
              })()}
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {detallesSeleccionados.map((d, i) => {
                // 6B / 1.G: líneas variables → "Barbacoa · 500 g"; precio_fijo → "Hamburguesa ×2"
                const tipoSnap = d?.tipo_venta_snapshot;
                const esVariable =
                  tipoSnap === TIPO_VENTA.VARIABLE_MEDIDA ||
                  tipoSnap === TIPO_VENTA.PORCION_CONTENEDOR;
                return (
                  <div key={i} className="flex justify-between text-sm py-1 border-b border-dashed">
                    <span>
                      {d?.producto_nombre}
                      {esVariable ? (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-bold">
                          {tipoSnap === TIPO_VENTA.VARIABLE_MEDIDA
                            ? `${Number(d?.cantidad_variable_snapshot) || 0} ${d?.unidad_variable_snapshot || ''}`
                            : `${Number(d?.cantidad_porciones_snapshot) || 0} ${d?.nombre_porcion_snapshot || ''}`}
                        </span>
                      ) : (
                        <span> ×{d?.cantidad}</span>
                      )}
                    </span>
                    <span className="font-medium">{formatCurrency(d?.subtotal)}</span>
                  </div>
                );
              })}
            </div>
            {/* Subtotal + Propina + Total a cobrar */}
            <div className="border-t pt-2 space-y-1">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCurrency(ventaSeleccionada?.total || 0)}</span>
              </div>
              {(Number(ventaSeleccionada?.propina_monto) || 0) > 0 && (
                <div className="flex justify-between text-sm text-rose-600">
                  <span>
                    Propina{' '}
                    {ventaSeleccionada?.propina_porcentaje > 0
                      ? `(${ventaSeleccionada.propina_porcentaje}%)`
                      : ''}
                  </span>
                  <span>+ {formatCurrency(Number(ventaSeleccionada?.propina_monto) || 0)}</span>
                </div>
              )}
              {(ventaSeleccionada?.propina_tipo === 'pendiente' ||
                ventaSeleccionada?.propina_tipo === 'pendiente_cliente' ||
                ventaSeleccionada?.propina_tipo === 'decidir_en_caja') && (
                <button
                  type="button"
                  onClick={() => setShowPropinaCaja(true)}
                  className="w-full text-left text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5"
                >
                  {ventaSeleccionada?.propina_tipo === 'decidir_en_caja'
                    ? 'Cliente eligió decidir en caja — toca para definir propina'
                    : ventaSeleccionada?.propina_tipo === 'pendiente_cliente'
                      ? 'Cliente no eligió propina en QR — toca para definirla'
                      : 'Propina pendiente — toca para definirla'}
                </button>
              )}
              <div className="flex justify-between font-black text-lg border-t pt-2">
                <span>TOTAL A COBRAR</span>
                <span
                  className={
                    config?.colorear_importes_monetarios !== false
                      ? 'text-primary'
                      : 'text-foreground'
                  }
                >
                  {formatCurrency(totalACobrarVenta)}
                </span>
              </div>
            </div>
            {(!ventaSeleccionada?.total || ventaSeleccionada.total <= 0) && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                Este ticket está en $0.00. No se puede cobrar. Puedes eliminarlo para limpiar la
                caja.
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Método de pago</Label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {METODOS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMetodoPago(m.key)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${metodoPago === m.key ? m.color + ' shadow-md' : 'border-border bg-white text-muted-foreground hover:bg-muted'}`}
                  >
                    <m.Icon className="w-4 h-4 shrink-0" />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            {metodoPago === 'efectivo' && (
              <div>
                <Label className="text-xs">Recibido</Label>
                <NumericInput
                  value={montoEfectivo}
                  onChange={(e) => setMontoEfectivo(e.target.value)}
                  placeholder="0.00"
                  className="text-xl font-bold h-12 mt-1"
                />
                {montoEfectivo && (
                  <p
                    className={`text-sm font-bold mt-1 ${calcularCambio() >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                  >
                    Cambio: {formatCurrency(calcularCambio())}
                  </p>
                )}
              </div>
            )}
            {metodoPago === 'mixto' && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Efectivo</Label>
                    <NumericInput
                      value={montoEfectivo}
                      onChange={(e) => setMontoEfectivo(e.target.value)}
                      placeholder="0"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Tarjeta</Label>
                    <NumericInput
                      value={montoTarjeta}
                      onChange={(e) => setMontoTarjeta(e.target.value)}
                      placeholder="0"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Transfer.</Label>
                    <NumericInput
                      value={montoTransferencia}
                      onChange={(e) => setMontoTransferencia(e.target.value)}
                      placeholder="0"
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* ¿Cómo se pagó la propina? — exacta, no proporcional */}
                {(Number(ventaSeleccionada?.propina_monto) || 0) > 0 && (
                  <div className="p-3 rounded-xl bg-rose-50 border-2 border-rose-200">
                    <p className="text-xs font-bold text-rose-700 mb-2">
                      ¿Cómo se pagó la propina?{' '}
                      <span className="font-mono">
                        {formatCurrency(Number(ventaSeleccionada?.propina_monto) || 0)}
                      </span>
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px]">Efectivo</Label>
                        <NumericInput
                          value={propinaEfectivo}
                          onChange={(e) => setPropinaEfectivo(e.target.value)}
                          placeholder="0"
                          className="mt-1 h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Tarjeta</Label>
                        <NumericInput
                          value={propinaTarjeta}
                          onChange={(e) => setPropinaTarjeta(e.target.value)}
                          placeholder="0"
                          className="mt-1 h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Transfer.</Label>
                        <NumericInput
                          value={propinaTransferencia}
                          onChange={(e) => setPropinaTransferencia(e.target.value)}
                          placeholder="0"
                          className="mt-1 h-9"
                        />
                      </div>
                    </div>
                    {(() => {
                      const sP =
                        (parseFloat(propinaEfectivo) || 0) +
                        (parseFloat(propinaTarjeta) || 0) +
                        (parseFloat(propinaTransferencia) || 0);
                      const pT = Number(ventaSeleccionada?.propina_monto) || 0;
                      const cuadra = Math.abs(sP - pT) < 0.01;
                      return (
                        <p
                          className={`mt-2 text-[11px] font-semibold ${cuadra ? 'text-emerald-700' : 'text-rose-700'}`}
                        >
                          {cuadra
                            ? `✓ Cuadra: ${formatCurrency(sP)} de propina distribuida.`
                            : `La suma (${formatCurrency(sP)}) debe ser igual a la propina total (${formatCurrency(pT)}).`}
                        </p>
                      );
                    })()}
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVentaSeleccionada(null)}>
              Cancelar
            </Button>
            {!ventaSeleccionada?.total || ventaSeleccionada.total <= 0 ? (
              <Button
                variant="destructive"
                onClick={() => handleEliminarTicketCero(ventaSeleccionada)}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Borrar ticket en cero
              </Button>
            ) : (
              <Button
                onClick={handleCobrar}
                disabled={procesando}
                className="min-w-[140px]"
                style={{
                  background: 'linear-gradient(135deg, hsl(4,72%,46%) 0%, hsl(4,72%,36%) 100%)',
                }}
              >
                {procesando ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin shrink-0" />
                    {procesandoMsg || 'Procesando…'}
                  </span>
                ) : (
                  `Cobrar ${formatCurrency(totalACobrarVenta)}`
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TICKET FINAL DIALOG — envuelto en SafeBoundary para que un fallo de
          render NO produzca pantalla blanca: solo muestra fallback compacto. */}
      <Dialog open={showTicketFinal} onOpenChange={setShowTicketFinal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Venta cobrada</DialogTitle>
          </DialogHeader>
          <SafeBoundary
            label="TicketFinal"
            fallbackTitle="No se pudo mostrar el ticket."
            fallbackMessage="La venta se cobró correctamente. Puedes verla en el historial."
            onReset={() => setShowTicketFinal(false)}
          >
            <div className="bg-muted/30 rounded-lg p-3 max-h-[60vh] overflow-y-auto">
              {ticketFinalData?.venta ? (
                <PreCuentaTicket
                  venta={ticketFinalData.venta}
                  detalles={Array.isArray(ticketFinalData.detalles) ? ticketFinalData.detalles : []}
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
            <Button variant="outline" onClick={() => setShowTicketFinal(false)}>
              Cerrar
            </Button>
            <Button
              onClick={() => {
                try {
                  printDocument({
                    mode: 'thermal',
                    title: `Ticket-${ticketFinalData?.venta?.folio || ''}`,
                  });
                } catch (err) {
                  console.error('[Caja] imprimir ticket:', err);
                  toast.error('No se pudo iniciar la impresión');
                }
              }}
            >
              <Printer className="w-4 h-4 mr-1" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === MODAL DE PROPINA EN CAJA === */}
      <PropinaDialog
        open={showPropinaCaja}
        onOpenChange={setShowPropinaCaja}
        subtotal={Number(ventaSeleccionada?.total) || 0}
        loading={procesando}
        origen="caja"
        porcentajesSugeridos={getPorcentajesSugeridos(config)}
        onConfirm={aplicarPropinaCaja}
      />

      {/* === 3 MODALES NUEVOS === */}
      <AbrirCajaDialog
        open={showAbrirCaja}
        onOpenChange={setShowAbrirCaja}
        posUser={posUser}
        fondoEsperado={fondoEsperado}
        loading={accionLoading}
        onConfirm={handleAbrirCaja}
      />
      <CorteTurnoDialog
        open={showCorteTurno}
        onOpenChange={setShowCorteTurno}
        posUser={posUser}
        resumen={resumen}
        loading={accionLoading}
        onConfirm={handleCorteTurno}
      />
      <CierreDiarioDialog
        open={showCierreDiario}
        onOpenChange={setShowCierreDiario}
        posUser={posUser}
        cajaAbierta={cajaAbierta}
        resumen={resumen}
        loading={accionLoading}
        onConfirm={handleCierreDiario}
        colorearImportes={config?.colorear_importes_monetarios !== false}
      />

      {/* CIERRE EXITO DIALOG */}
      <Dialog open={showCierreExito} onOpenChange={setShowCierreExito}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              Caja cerrada correctamente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
              <p className="text-xs text-muted-foreground">Folio del corte</p>
              <p className="font-mono font-bold text-lg">{corteCerrado?.folio}</p>
              <p className="text-xs text-muted-foreground mt-2">Total cerrado</p>
              <p
                className={`font-heading font-black text-2xl ${config?.colorear_importes_monetarios !== false ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'}`}
              >
                {formatCurrency(corteCerrado?.total_general || resumen.totalGeneral)}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Button
                onClick={() => {
                  setVerPDFCorte(corteCerrado);
                  setShowCierreExito(false);
                }}
                className="gap-2"
              >
                <FileText className="w-4 h-4" /> Ver PDF de corte
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setVerPDFCorte(corteCerrado);
                  setShowCierreExito(false);
                }}
                className="gap-2"
              >
                <Printer className="w-4 h-4" /> Imprimir / descargar
              </Button>
              <Button variant="ghost" onClick={() => setShowCierreExito(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 6A: bloqueo cuando hay mesas abiertas */}
      <MesasPendientesCierreDialog
        open={Array.isArray(mesasPendientes) && mesasPendientes.length > 0}
        mesas={mesasPendientes || []}
        onClose={() => setMesasPendientes(null)}
      />

      {/* PDF VIEWER (al cerrar caja o desde historial) */}
      <CorteViewerDialog
        corte={verPDFCorte}
        open={!!verPDFCorte}
        onClose={() => setVerPDFCorte(null)}
      />

      {/* Auto-descarga del PDF al finalizar corte (sin abrir imprimir) */}
      {autoDownloadCorte && (
        <CorteAutoDownloader corte={autoDownloadCorte} onDone={() => setAutoDownloadCorte(null)} />
      )}
    </div>
  );
}
