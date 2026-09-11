'use client';
import React, { useMemo, useState, useEffect } from 'react';
import { useParams } from '@/enrutado';
import { nuevaClave } from '@/api/cliente';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@/utils/financialUtils';
import { Bell, Sparkles, CheckCircle2, AlertTriangle, Receipt } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import AtencionFAB from '@/components/portalqr/AtencionFAB';
import ProductoPlaceholder from '@/components/portalqr/ProductoPlaceholder';
import PedirCuentaQR from '@/components/portalqr/PedirCuentaQR';
import AbrirMesaQRDialog from '@/components/portalqr/AbrirMesaQRDialog';
import ProductoQRDialog from '@/components/portalqr/ProductoQRDialog';
import CarritoQR from '@/components/portalqr/CarritoQR';
import ValoracionEmoji from '@/components/portalqr/ValoracionEmoji';
import {
  abrirMesaDesdeQR,
  crearSolicitudQR,
  enviarPedidoQR,
  leerPortalPublico,
} from '@/utils/qrPedidoFlow';
import { getTiposSolicitudHabilitados, TIPO_SOLICITUD_VERBO } from '@/utils/qrUtils';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import ThemeToggle from '@/components/common/ThemeToggle';

/**
 * Vista pública del comensal (sin sidebar, sin POS).
 * Ruta: /qr/:token
 */
export default function PortalClienteWithBoundary() {
  return (
    <ErrorBoundary
      fallbackTitle="No se pudo cargar el menú."
      fallbackMessage="Por favor, llama a un mesero para que te ayude."
    >
      <PortalCliente />
    </ErrorBoundary>
  );
}

function PortalCliente() {
  const { token } = useParams();
  const [tabSeccion, setTabSeccion] = useState('todas');
  const [enviado, setEnviado] = useState(null); // {tipo, time}
  // Qué aviso descartó el comensal con «OK». Se guarda el id y no un booleano:
  // con un booleano, tocar OK dejaba mudo también el SIGUIENTE aviso.
  const [avisoDescartadoId, setAvisoDescartadoId] = useState(null);
  const [enviandoTipo, setEnviandoTipo] = useState(null);
  // Vista "Pedir cuenta" con precuenta + propina (solo tipo='cuenta')
  const [showPedirCuenta, setShowPedirCuenta] = useState(false);

  // === PEDIDO QR (Prompt 6C) ===
  const [carrito, setCarrito] = useState([]); // items con _uid único
  const [notaGeneralCarrito, setNotaGeneralCarrito] = useState('');
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [showAbrirMesaQR, setShowAbrirMesaQR] = useState(false);
  const [abriendoMesa, setAbriendoMesa] = useState(false);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const [showValoracion, setShowValoracion] = useState(false);
  const [valoracionVentaId, setValoracionVentaId] = useState(null);

  // Claves de idempotencia por DIÁLOGO (F1-02 §8, trampa T5). Se generan al
  // abrir y se reusan mientras el diálogo siga abierto: un doble toque en
  // «Confirmar» con mala cobertura no abre dos mesas ni manda dos pedidos.
  const [claveAbrirMesa, setClaveAbrirMesa] = useState(null);
  const [claveEnviarPedido, setClaveEnviarPedido] = useState(() => nuevaClave());

  // Cliente de queries para refrescar el portal tras cada comando.
  const queryClient = useQueryClient();

  // === LA LECTURA PÚBLICA, ÚNICA — cierre de D-14 ===
  // Aquí había CINCO consultas anónimas por el puente, y una era
  // `ConfiguracionNegocio.list()` COMPLETA: entregaba `presentacion_password`
  // en texto plano y los identificadores de Google a cualquiera que escaneara
  // el código de una mesa. El endpoint público devuelve sólo la lista blanca y
  // resuelve negocio, mesa, menú, secciones y cuenta en una sola petición.
  //
  // El sondeo se queda en 4 s por lo mismo de antes: si el mesero abre la mesa
  // desde el salón, el teléfono tiene que verla abierta sin refrescar.
  const {
    data: portal,
    isLoading: cargandoPortal,
    isFetched: portalFetched,
    error: errorPortal,
  } = useQuery({
    queryKey: ['portal_publico', token],
    queryFn: () => leerPortalPublico(token),
    enabled: !!token,
    refetchInterval: 4000,
    staleTime: 2000,
  });

  const config = portal?.negocio || null;
  const mesa = portal?.mesa || null;
  const productos = useMemo(() => portal?.productos || [], [portal]);
  const categorias = useMemo(() => portal?.categorias || [], [portal]);
  const secciones = useMemo(() => portal?.secciones || [], [portal]);
  // La venta viva de ESTA mesa, resuelta por el token, CON sus líneas dentro.
  // Ya no se consulta una lista de ventas desde el navegador para quedarse con
  // la más reciente, ni se sondea `DetalleVenta` aparte —que era lo que dejaba
  // «Mi consumo» vacío unos segundos con el total ya pintado.
  const ventaActivaMesa = portal?.cuenta || null;
  // El aviso de ESTA mesa, con su estado ya decidido en el servidor. Antes se
  // sondeaba con `SolicitudQR.get` cada 4 s desde el navegador —una lectura sin
  // sesión, que siempre fallaba— y sólo se daba por cerrada si estaba `atendida`
  // o `resuelta`: si el administrador la CANCELABA, el comensal esperaba para
  // siempre. `cerrada` cubre los tres finales.
  const solicitudEnCurso = portal?.solicitud || null;
  const solicitudAtendida = solicitudEnCurso?.estado === 'atendida';

  // Hasta que NO termine el primer fetch no decidimos nada: antes parpadeaba
  // "Portal no disponible" mientras cargaban las cinco consultas.
  const cargando = cargandoPortal || (!!token && !portalFetched);

  const modoMenu = config?.portal_qr_modo_menu || 'productos_pos';
  // FLUJO PRINCIPAL: el mesero dispara la cuenta y el QR muestra propina en vivo.
  // 'mesero_dispara' (default): el cliente NO ve botón "Pedir cuenta" en el FAB.
  // 'cliente_solicita': el cliente sí puede pedir cuenta desde el QR.
  // 'ambos': cualquiera puede iniciar.
  const cuentaModo = config?.portal_qr_cuenta_modo || 'mesero_dispara';
  const clientePuedeIniciarCuenta = cuentaModo === 'cliente_solicita' || cuentaModo === 'ambos';

  // Lista de tipos visible en el FAB de atención del comensal.
  // BANDERA 3 corregida: aunque el modo sea 'mesero_dispara', mantenemos el
  // botón visible (si está activo en config) — pero al tocarlo NO abrirá la
  // pantalla de propina; solo creará un aviso al mesero. Esto le da al cliente
  // una vía clara de notificar "ya quiero la cuenta" sin saltarse al mesero.
  const tiposHabilitados = useMemo(() => {
    return getTiposSolicitudHabilitados(config) || [];
  }, [config]);

  // El menú llega ya filtrado por el servidor: `activo`,
  // `visible_en_menu_digital` y, cuando el negocio apaga los precios, SIN
  // precio. Y llega en la misma respuesta que la mesa, así que «productos
  // listos» es simplemente «el portal ya cargó»: el flash de «sin productos»
  // que obligaba a mirar `isFetched` de tres queries distintas ya no existe.
  const productosListos = portalFetched;

  const productosFiltrados = useMemo(() => {
    const arr = Array.isArray(productos) ? productos : [];
    if (tabSeccion === 'todas') return arr;
    if (tabSeccion.startsWith('cat-')) {
      const id = tabSeccion.slice(4);
      return arr.filter((p) => p?.categoria_id === id);
    }
    return arr;
  }, [productos, tabSeccion]);

  const seccionesUtiles = useMemo(
    () =>
      (Array.isArray(secciones) ? secciones : []).sort((a, b) => (a?.orden || 0) - (b?.orden || 0)),
    [secciones],
  );

  // Limpiar estado "enviado" tras 3 seg
  useEffect(() => {
    if (!enviado) return;
    const t = setTimeout(() => setEnviado(null), 3500);
    return () => clearTimeout(t);
  }, [enviado]);

  // Auto-abre PedirCuentaQR UNA SOLA VEZ por venta cuando el mesero disparó la
  // cuenta y delegó la propina al teléfono. Ya no hace falta sondear la venta
  // aparte: viene en la lectura pública, con su `propina_tipo` y su
  // `propina_origen`.
  const [autoOpenedVentaId, setAutoOpenedVentaId] = useState(null);
  useEffect(() => {
    if (!ventaActivaMesa?.id || showPedirCuenta) return;
    if (autoOpenedVentaId === ventaActivaMesa.id) return;
    const esperandoCliente =
      ventaActivaMesa.estado === 'cuenta_solicitada' &&
      (ventaActivaMesa.propina_tipo === 'pendiente_cliente' ||
        ventaActivaMesa.propina_origen === 'pendiente_portal_qr');
    if (!esperandoCliente) return;
    setAutoOpenedVentaId(ventaActivaMesa.id);
    setShowPedirCuenta(true);
  }, [ventaActivaMesa, autoOpenedVentaId, showPedirCuenta]);

  // Tarjeta persistente "Tu cuenta fue solicitada" — visible cuando el mesero
  // disparó la cuenta y el cliente todavía no ha elegido propina (o la cerró).
  // También muestra confirmación cuando el cliente ya eligió.
  const esperandoEleccionCliente =
    !!ventaActivaMesa &&
    ventaActivaMesa.estado === 'cuenta_solicitada' &&
    (ventaActivaMesa.propina_tipo === 'pendiente_cliente' ||
      ventaActivaMesa.propina_origen === 'pendiente_portal_qr');
  const yaEligioCliente =
    !!ventaActivaMesa &&
    ventaActivaMesa.estado === 'cuenta_solicitada' &&
    ventaActivaMesa.propina_origen === 'portal_qr';
  const cuentaDecideEnCaja = yaEligioCliente && ventaActivaMesa?.propina_tipo === 'decidir_en_caja';

  // === Flags para Pedido QR (Prompt 6C) ===
  // Las cuatro condiciones —paquete, asignación de mesas, portal activo y el
  // switch «permitir pedidos»— las resuelve el servidor y llegan como
  // `puede_ordenar`. `paquete_modo` ya no viaja: publicaba el plan comercial
  // contratado a cualquiera que escaneara.
  const pedidosQRActivos = config?.puede_ordenar === true;

  const tieneMeseroAsignado = mesa?.tiene_mesero === true;
  // "Mesa ya abierta" se miraba por TRES señales porque el navegador no podía
  // fiarse de ninguna: la venta del sondeo, el puntero de la mesa y su estado,
  // cada una de una consulta distinta y llegando en momentos distintos. Ahora
  // las tres se leen en la misma consulta del servidor y la respuesta es un
  // booleano, así que el latch anti-parpadeo deja de hacer falta.
  const mesaLibreParaAbrir = mesa?.puede_abrir === true;
  // Sólo `cuenta_solicitada` puede verse aquí: una venta pagada o cancelada no
  // es la venta activa de la mesa y el endpoint público ya no la devuelve.
  const cuentaYaSolicitada = ventaActivaMesa?.estado === 'cuenta_solicitada';
  const mesaPermitePedirAhora = mesa?.puede_pedir === true;

  // === HANDLERS PEDIDO QR ===
  const handleClickProducto = (producto) => {
    if (!pedidosQRActivos) return;
    // El «espera, aún no sé si la mesa está abierta» desaparece: la pantalla no
    // se pinta hasta que la lectura pública responde, y esa respuesta ya trae
    // decidido si se puede abrir o pedir.
    if (cuentaYaSolicitada) {
      toast.info('La cuenta ya fue solicitada. Llama al mesero si necesitas algo más.');
      return;
    }
    if (mesaLibreParaAbrir) {
      abrirDialogoMesa();
      return;
    }
    if (!mesaPermitePedirAhora) {
      if (!tieneMeseroAsignado) {
        toast.error('Esta mesa aún no tiene mesero asignado. Pide apoyo al personal.');
      } else {
        toast.info('No se pueden agregar productos en este momento.');
      }
      return;
    }
    setProductoSeleccionado(producto);
  };

  const handleAddToCart = ({ producto, cantidad, notas, modificadores, _variable }) => {
    if (!producto?.id) return;
    const _uid = `cart-${producto.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    // 6B / 1.E — Si llega snapshot _variable, el precio_venta efectivo es
    // el precio total de la línea (cantidad lógica = 1, igual que en Mesero).
    const precioEfectivo = _variable
      ? Number(_variable.precio_total_linea) || 0
      : Number(producto.precio_venta) || 0;
    setCarrito((prev) => [
      ...prev,
      {
        _uid,
        id: producto.id,
        nombre: producto.nombre || '',
        // Sólo para pintar el carrito. Lo que se cobra lo decide el catálogo
        // dentro del comando: `precio_venta` NO viaja al servidor (D-17).
        // El costo y el área de preparación tampoco están aquí — el costo es
        // del negocio y el ruteo a cocina lo resuelve `portal.enviar_pedido`.
        precio_venta: precioEfectivo,
        cantidad: Math.max(1, parseInt(cantidad, 10) || 1),
        notas: (notas || '').trim(),
        _modificadores: Array.isArray(modificadores) ? modificadores : [],
        _variable: _variable || null,
      },
    ]);
    setProductoSeleccionado(null);
  };

  const handleChangeCantidad = (uid, delta) => {
    setCarrito((prev) =>
      prev
        .map((i) =>
          i._uid === uid ? { ...i, cantidad: Math.max(0, (Number(i.cantidad) || 0) + delta) } : i,
        )
        .filter((i) => Number(i.cantidad) > 0),
    );
  };
  const handleEliminarItem = (uid) => {
    setCarrito((prev) => prev.filter((i) => i._uid !== uid));
  };

  const abrirDialogoMesa = () => {
    setClaveAbrirMesa(nuevaClave());
    setShowAbrirMesaQR(true);
  };

  const handleConfirmarAbrirMesa = async (datos) => {
    if (!mesa?.id) return;
    setAbriendoMesa(true);
    try {
      // El diálogo captura alergia y celebración: viajan al comando para que
      // queden en la mesa Y en la venta, que es lo que ven mesero y cocina.
      await abrirMesaDesdeQR({
        token,
        personas: datos?.personas,
        cliente_nombre: datos?.cliente_nombre,
        notas: datos?.notas,
        notas_alergias: datos?.notas_alergias,
        celebracion_especial: datos?.celebracion_especial,
        tipo_celebracion: datos?.tipo_celebracion,
        clave: claveAbrirMesa,
      });

      // Aquí había un parche optimista que reescribía la mesa en la caché con
      // lo que el navegador SUPONÍA que había quedado en la base. Sobraba y
      // mentía: la mesa y la venta se abren en una sola transacción, así que
      // basta con volver a leer. Si el comando no responde OK, no se pinta nada.
      queryClient.invalidateQueries({ queryKey: ['portal_publico', token] });

      setShowAbrirMesaQR(false);
      toast.success(`¡Mesa ${mesa.numero || ''} abierta! Ahora puedes agregar productos.`);
    } catch (err) {
      // El mensaje viene traducido por el dominio («Esta mesa acaba de
      // abrirse…», «Esta mesa todavía no tiene mesero asignado…»).
      toast.error(err?.message || 'No pudimos abrir la mesa. Intenta de nuevo.');
    } finally {
      setAbriendoMesa(false);
    }
  };

  const handleEnviarPedido = async () => {
    if (enviandoPedido) return;
    if (!Array.isArray(carrito) || carrito.length === 0) {
      toast.error('Tu pedido está vacío.');
      return;
    }
    if (!mesa?.id || !tieneMeseroAsignado) {
      toast.error('Esta mesa no está disponible para pedir.');
      return;
    }
    setEnviandoPedido(true);
    try {
      // La re-validación de la venta activa se fue con el comando: buscarla
      // aquí era leer, decidir y escribir en tres momentos distintos, y entre
      // ellos cabía el mesero cerrando la cuenta. `portal.enviar_pedido` la
      // resuelve dentro de su transacción y devuelve el motivo en español.
      await enviarPedidoQR({
        token,
        items: carrito,
        notaGeneral: notaGeneralCarrito,
        clave: claveEnviarPedido,
      });
      setCarrito([]);
      setNotaGeneralCarrito('');
      // Pedido enviado: el siguiente es OTRO pedido y necesita su propia clave.
      setClaveEnviarPedido(nuevaClave());
      queryClient.invalidateQueries({ queryKey: ['portal_publico', token] });
      toast.success('¡Pedido enviado a cocina!');
    } catch (err) {
      toast.error(err?.message || 'No pudimos enviar tu pedido. Intenta de nuevo.');
    } finally {
      setEnviandoPedido(false);
    }
  };

  // Estados de no-disponibilidad
  if (!token) {
    return <ScreenError titulo="QR inválido" texto="Este enlace no es válido." />;
  }
  // Loader mientras carga config/mesa — evita flash de "Portal no disponible".
  if (cargando) {
    return <ScreenLoading />;
  }
  // El servidor distingue UNA sola cosa: el portal apagado —que no filtra nada,
  // quien escanea ya está sentado en el local— del código que no vale. Mesa
  // inexistente, de otro negocio, dada de baja o con el QR apagado responden lo
  // mismo, y a propósito: distinguirlas dejaría enumerar mesas ajenas probando
  // tokens. Un fallo de red NO se pinta como «mesa no encontrada»: eso es
  // exactamente confundir «no hay datos» con «no pude leer». Y sólo se pinta
  // cuando NO hay nada que enseñar: un sondeo que falla con el menú ya cargado
  // no puede borrarle la carta al comensal de la mano.
  if (errorPortal && !portal) {
    if (errorPortal.codigo === 'QR_PORTAL_CERRADO') {
      return (
        <ScreenError
          titulo="Portal no disponible"
          texto="El menú digital está temporalmente desactivado. Llama a un mesero."
        />
      );
    }
    if (errorPortal.codigo === 'QR_TOKEN_INVALIDO') {
      return (
        <ScreenError titulo="Mesa no encontrada" texto="Llama a un mesero para que te ayude." />
      );
    }
    return (
      <ScreenError
        titulo="No se pudo cargar el menú."
        texto="Por favor, llama a un mesero para que te ayude."
      />
    );
  }
  if (!mesa) {
    return <ScreenError titulo="Mesa no encontrada" texto="Llama a un mesero para que te ayude." />;
  }

  const enviarSolicitud = async (tipo) => {
    if (!mesa?.id || !tipo || enviandoTipo) return;

    // Tipo "cuenta":
    // - cliente_solicita | ambos: el cliente abre directo PedirCuentaQR.
    // - mesero_dispara (default): el cliente NO debe saltarse al mesero.
    //   Solo creamos un aviso (SolicitudQR tipo:'cuenta') y le informamos
    //   que la pantalla de propina se activará cuando el mesero confirme.
    if (tipo === 'cuenta') {
      if (clientePuedeIniciarCuenta) {
        setShowPedirCuenta(true);
        return;
      }
      // Modo mesero_dispara: caer al flujo de aviso normal (no abrir propina).
      // Cuando el mesero confirme, la lectura pública traerá la venta con
      // `pendiente_portal_qr` y PedirCuentaQR se abrirá solo.
      // (continúa abajo con el flujo estándar de SolicitudQR)
    }

    setEnviandoTipo(tipo);
    try {
      // El anti-duplicado dejó de vivir aquí. Consultar «¿hay una pendiente?» y
      // luego crear son dos momentos, y entre ellos cabe otro teléfono de la
      // misma mesa haciendo lo mismo: dos avisos idénticos en la pantalla del
      // mesero. Ahora lo impide el índice único parcial
      // `solicitudes_qr_una_pendiente` y el comando responde «Ya avisamos al
      // mesero. Llegará en un momento.». El ruteo al mesero asignado también se
      // decide en el servidor: el navegador ya no elige a quién le llega.
      await crearSolicitudQR({ token, tipo });
      setEnviado({ tipo });
      // Mensaje específico si el cliente tocó "Pedir cuenta" en modo mesero_dispara.
      if (tipo === 'cuenta' && !clientePuedeIniciarCuenta) {
        toast.info('Avisamos al mesero. La cuenta se activará cuando el mesero la confirme.');
      }
    } catch (err) {
      toast.error(err?.message || 'No pudimos enviar tu solicitud. Intenta de nuevo.');
    } finally {
      setEnviandoTipo(null);
    }
  };

  const mostrarPrecios = config?.portal_qr_mostrar_precios !== false;
  const mostrarSinImagen = config?.portal_qr_mostrar_sin_imagen !== false;
  const usarProductos = modoMenu === 'productos_pos' || modoMenu === 'mixto';
  const usarSecciones = modoMenu === 'menu_subido' || modoMenu === 'mixto';

  // Logo del negocio para marca de agua + header.
  // La lista blanca del portal sólo publica dos de los cuatro logos:
  //   logo_url            → logo principal (sidebar, login, fallback general)
  //   background_logo_url → logo de marca de agua (configurado en IdentidadNegocio)
  // Los de ticket y PDF son de la operación interna y no salen al público, así
  // que el orden de preferencia se queda sin dos escalones que aquí nunca
  // llegaban a usarse.
  const getBrandLogo = (cfg) => cfg?.logo_url || cfg?.background_logo_url || '';
  const brandLogo = getBrandLogo(config);

  // Ocultar imagen rota si la URL deja de existir / falla CORS.
  const onLogoError = (e) => {
    try {
      e.currentTarget.style.display = 'none';
    } catch {}
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground pb-32 overflow-x-hidden">
      {/* MARCA DE AGUA — logo del negocio, visible en claro y oscuro.
          Usa la clase `brand-watermark` para que en modo oscuro el filtro
          definido en index.css realce el logo (brightness + grayscale). */}
      {brandLogo && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center"
        >
          <img
            src={brandLogo}
            alt=""
            onError={onLogoError}
            className="brand-watermark w-[75vw] max-w-[480px] select-none"
            style={{ opacity: 0.08, objectFit: 'contain' }}
            draggable={false}
          />
        </div>
      )}

      {/* Header con logo del negocio + toggle de tema */}
      <header className="sticky top-0 z-30 bg-card/85 backdrop-blur border-b shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          {brandLogo && (
            <img
              src={brandLogo}
              alt={config?.nombre_negocio || ''}
              onError={onLogoError}
              className="w-11 h-11 rounded-lg bg-white p-1 border shrink-0"
              style={{ objectFit: 'contain' }}
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-heading font-black text-base leading-tight truncate">
              {config?.nombre_negocio || 'Menú'}
            </p>
            <p className="text-xs text-muted-foreground">
              Mesa {mesa?.numero}
              {mesa?.nombre ? ` · ${mesa.nombre}` : ''}
            </p>
          </div>
          <ThemeToggle variant="icon" />
        </div>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {/* Bienvenida */}
        {config?.portal_qr_mensaje_bienvenida && (
          <div className="rounded-2xl p-4 border bg-card text-card-foreground shadow-sm flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-sm">{config.portal_qr_mensaje_bienvenida}</p>
          </div>
        )}

        {/* MODO PRODUCTOS POS */}
        {usarProductos && (
          <section>
            {/* Tabs de categorías */}
            <div className="flex gap-1.5 overflow-x-auto pb-2">
              <Pill active={tabSeccion === 'todas'} onClick={() => setTabSeccion('todas')}>
                Todo
              </Pill>
              {(categorias || []).map((c) => (
                <Pill
                  key={c.id}
                  active={tabSeccion === `cat-${c.id}`}
                  onClick={() => setTabSeccion(`cat-${c.id}`)}
                >
                  {c?.nombre || '—'}
                </Pill>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* HOTFIX 6A.2: si productos aún cargan, mostrar loader.
                  Antes salía "sin productos" durante el primer fetch. */}
              {!productosListos ? (
                <div className="col-span-full flex flex-col items-center gap-2 py-10">
                  <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
                  <p className="text-xs text-muted-foreground">Cargando menú…</p>
                </div>
              ) : (
                <>
                  {productosFiltrados
                    .filter((p) => mostrarSinImagen || p?.imagen_url)
                    .map((p) => (
                      <ProductoCardCliente
                        key={p.id}
                        producto={p}
                        mostrarPrecios={mostrarPrecios}
                        clickable={pedidosQRActivos && !cuentaYaSolicitada}
                        onClick={() => handleClickProducto(p)}
                      />
                    ))}
                  {productosFiltrados.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6 col-span-full">
                      Sin productos en esta categoría.
                    </p>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {/* MODO MENÚ SUBIDO */}
        {usarSecciones && seccionesUtiles.length > 0 && (
          <section className="space-y-3">
            {usarProductos && <h2 className="text-sm font-heading font-bold mt-4">Menús</h2>}
            {seccionesUtiles.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl border bg-card text-card-foreground overflow-hidden shadow-sm"
              >
                {s.imagen_url && (
                  <img src={s.imagen_url} alt={s.nombre} className="w-full h-auto object-cover" />
                )}
                <div className="p-3">
                  <p className="font-heading font-bold text-base">{s.nombre}</p>
                  {s.descripcion && (
                    <p className="text-xs text-muted-foreground">{s.descripcion}</p>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        {!usarProductos && !usarSecciones && (
          <p className="text-sm text-muted-foreground text-center py-12">
            Sin menú configurado todavía.
          </p>
        )}
      </main>

      {/* Botón flotante de atención.
          Reglas:
          - Asignación activa + mesa SIN mesero asignado: bloqueado (mensaje aviso).
          - Asignación apagada: el botón se oculta (no audio masivo).
          - Asignación activa + mesa con mesero: funciona normal.
      */}
      {(() => {
        const asign = config?.asignacion_mesas_activa === true;
        if (!asign) return null; // oculto si no hay asignación
        // `tiene_mesero` es un booleano: quién atiende la mesa es dato de la
        // operación y no sale al público. Lo que el portal necesita saber es si
        // hay alguien a quien avisar, no a quién le toca.
        return (
          <AtencionFAB
            tiposHabilitados={tiposHabilitados}
            onPedir={enviarSolicitud}
            disabled={!!enviandoTipo}
            bloqueado={!tieneMeseroAsignado}
            mensajeBloqueado="Esta mesa aún no tiene un mesero asignado. Por favor, acércate a un mesero del salón."
          />
        );
      })()}

      {/* Tarjeta persistente: cuando el mesero ya disparó la cuenta.
          Permite reabrir PedirCuentaQR si el cliente cerró la pantalla. */}
      {(esperandoEleccionCliente || yaEligioCliente) && !showPedirCuenta && (
        <div className="fixed bottom-24 inset-x-4 z-40 max-w-sm mx-auto">
          <button
            type="button"
            onClick={() => setShowPedirCuenta(true)}
            className={`w-full text-left rounded-2xl px-4 py-3 shadow-xl border-2 flex items-start gap-3 active:scale-[0.99] transition-transform ${
              esperandoEleccionCliente
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700'
            }`}
          >
            <Receipt
              className={`w-5 h-5 shrink-0 mt-0.5 ${
                esperandoEleccionCliente ? 'text-amber-600' : 'text-emerald-600'
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="font-heading font-bold text-sm">Tu cuenta fue solicitada</p>
              <p className="text-xs opacity-90 mt-0.5">
                {esperandoEleccionCliente
                  ? 'Toca para elegir propina o ver tu precuenta.'
                  : cuentaDecideEnCaja
                    ? 'Decidiste definir la propina en caja.'
                    : 'Selección enviada a caja.'}
              </p>
            </div>
            <span className="text-xs font-semibold underline shrink-0 self-center">
              {esperandoEleccionCliente ? 'Abrir' : 'Ver'}
            </span>
          </button>
        </div>
      )}

      {/* Confirmación: solicitud atendida por el mesero */}
      <AnimatePresence>
        {solicitudAtendida && avisoDescartadoId !== solicitudEnCurso?.id && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-28 inset-x-4 z-50 max-w-sm mx-auto"
          >
            <div className="rounded-xl bg-blue-600 text-white px-4 py-3 shadow-2xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-bold">Tu mesero ya vio la solicitud</p>
                <p className="text-xs opacity-90">Pasará a tu mesa en breve.</p>
              </div>
              <button
                onClick={() => setAvisoDescartadoId(solicitudEnCurso?.id || null)}
                className="text-white/80 hover:text-white text-xs underline"
              >
                OK
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal "Pedir cuenta" con precuenta + propina */}
      <AnimatePresence>
        {showPedirCuenta && mesa && (
          <PedirCuentaQR
            token={token}
            mesa={mesa}
            config={config}
            cuenta={ventaActivaMesa}
            onClose={() => {
              setShowPedirCuenta(false);
              // Tras cerrar (post-confirmación): si la venta tiene venta_id real
              // y el cliente eligió propina desde QR, abrir valoración.
              if (valoracionVentaId) {
                setTimeout(() => setShowValoracion(true), 250);
              }
            }}
            onConfirmed={() => {
              setEnviado({ tipo: 'cuenta' });
              // Capturar el venta_id real (no objeto stale) para la valoración.
              if (ventaActivaMesa?.id) {
                setValoracionVentaId(ventaActivaMesa.id);
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* === Pedido QR: modales + carrito + valoración (Prompt 6C) === */}
      <AnimatePresence>
        {showAbrirMesaQR && mesa && (
          <AbrirMesaQRDialog
            mesa={mesa}
            loading={abriendoMesa}
            onClose={() => {
              if (!abriendoMesa) setShowAbrirMesaQR(false);
            }}
            onConfirm={handleConfirmarAbrirMesa}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {productoSeleccionado && (
          <ProductoQRDialog
            producto={productoSeleccionado}
            open={!!productoSeleccionado}
            onClose={() => setProductoSeleccionado(null)}
            onConfirm={handleAddToCart}
            mostrarPrecios={mostrarPrecios}
          />
        )}
      </AnimatePresence>

      {pedidosQRActivos && !cuentaYaSolicitada && (
        <CarritoQR
          items={carrito}
          onChangeCantidad={handleChangeCantidad}
          onEliminar={handleEliminarItem}
          onEnviar={handleEnviarPedido}
          enviando={enviandoPedido}
          notaGeneral={notaGeneralCarrito}
          setNotaGeneral={setNotaGeneralCarrito}
        />
      )}

      <AnimatePresence>
        {showValoracion && valoracionVentaId && (
          <ValoracionEmoji
            token={token}
            ventaId={valoracionVentaId}
            mesa={mesa}
            yaValorada={ventaActivaMesa?.ya_valorada === true}
            onClose={() => setShowValoracion(false)}
          />
        )}
      </AnimatePresence>

      {/* Toast/banner de confirmación */}
      <AnimatePresence>
        {enviado && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-28 inset-x-4 z-50 max-w-sm mx-auto"
          >
            <div className="rounded-xl bg-emerald-600 text-white px-4 py-3 shadow-2xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-bold">Solicitud enviada</p>
                <p className="text-xs opacity-90">
                  Un mesero te atenderá en breve. ({TIPO_SOLICITUD_VERBO[enviado.tipo] || ''})
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Pill({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${active ? 'bg-foreground text-background' : 'bg-card border text-muted-foreground'}`}
    >
      {children}
    </button>
  );
}

function ProductoCardCliente({ producto, mostrarPrecios, clickable, onClick }) {
  // Badge "Personalizable" si tiene modificadores activos.
  const tienePersonalizar = (() => {
    const arr = Array.isArray(producto?.modificadores) ? producto.modificadores : [];
    return arr.some(
      (g) =>
        g?.activo !== false &&
        String(g?.nombre || '').trim() &&
        (Array.isArray(g.opciones) ? g.opciones : []).some(
          (o) => o?.activo !== false && String(o?.nombre || '').trim(),
        ),
    );
  })();
  const Comp = clickable ? 'button' : 'div';
  return (
    <Comp
      type={clickable ? 'button' : undefined}
      onClick={clickable ? onClick : undefined}
      className={`rounded-2xl bg-card text-card-foreground border overflow-hidden shadow-sm flex flex-col text-left w-full ${
        clickable ? 'active:scale-[0.98] transition-transform hover:shadow-md cursor-pointer' : ''
      }`}
    >
      {producto?.imagen_url ? (
        <img
          src={producto.imagen_url}
          alt={producto?.nombre || ''}
          className="w-full h-32 object-cover"
        />
      ) : (
        <ProductoPlaceholder producto={producto} />
      )}
      <div className="p-3 flex-1 flex flex-col">
        <p className="font-heading font-bold text-sm leading-tight">{producto?.nombre || '—'}</p>
        {producto?.descripcion && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{producto.descripcion}</p>
        )}
        <div className="mt-auto pt-2 flex items-center gap-2 flex-wrap">
          {mostrarPrecios && Number(producto?.precio_venta) > 0 && (
            <p className="font-heading font-black text-base text-emerald-700 dark:text-emerald-400">
              {formatCurrency(producto.precio_venta)}
            </p>
          )}
          {tienePersonalizar && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
              Personalizable
            </span>
          )}
        </div>
      </div>
    </Comp>
  );
}

function ScreenError({ titulo, texto }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="rounded-2xl bg-card text-card-foreground p-6 max-w-sm text-center shadow-lg border">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
        <p className="font-heading font-bold text-lg">{titulo}</p>
        <p className="text-sm text-muted-foreground mt-1">{texto}</p>
      </div>
    </div>
  );
}

function ScreenLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-border border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Cargando menú…</p>
      </div>
    </div>
  );
}
