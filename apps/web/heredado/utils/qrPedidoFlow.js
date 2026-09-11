'use client';
// =====================================================
// utils/qrPedidoFlow.js — El portal del comensal contra los comandos PÚBLICOS.
// =====================================================
// Quien usa estas funciones NO tiene sesión: entró escaneando un código. Su
// única credencial es el token de la mesa, y por eso todo vive bajo
// `/api/publico/qr/:token/`, nunca en el puente (que exige cookie).
//
// Reglas críticas, las mismas de siempre:
//  - NO descuenta inventario (eso ocurre solo al cobrar en Caja).
//  - NO cobra ni mueve dinero.
//  - NO manda precios. Ni uno.
//
// ── Lo que este archivo dejó de hacer, y por qué ──────────────────────────
// D-17 · `enviarPedidoQR` tomaba `item.precio_venta` del carrito del NAVEGADOR
//   y lo escribía en `DetalleVenta` con su costo, su utilidad y su margen.
//   Quien supiera abrir las herramientas del navegador se ponía la comida a un
//   peso. Ahora se manda QUÉ y CUÁNTO; el importe sale del catálogo dentro de
//   la transacción del comando (`portal/pedido.ts`), con la misma `valorarLinea`
//   que usa la venta de mostrador.
//
// El re-totalizado del cliente · La relectura de `DetalleVenta` para sumar el
//   total podía fallar y ESCRIBÍA `total: 0` sobre una cuenta de $1 240 con sus
//   cuatro líneas intactas. El comando devuelve `totalCentavos` calculado sobre
//   las líneas ya persistidas, en la misma transacción: no hay relectura que
//   pueda fallar.
//
// El anti-carrera de apertura · Se creaba la venta, se volvía a consultar y, si
//   aparecían dos, se cancelaba la perdedora con `motivo_cancelacion`. Eso es
//   limpiar después en vez de impedir antes. Ahora lo impide el índice único
//   parcial `ordenes_una_activa_por_mesa`: el segundo teléfono recibe
//   «MESA_YA_ABIERTA» y su transacción revierte entera.
//
// La validación producto a producto · `validarCarritoQR` pedía cada producto en
//   un bucle con un `await` por vuelta (N+1) y un `.catch(() => null)` que
//   convertía un fallo de red en «este producto ya no está disponible». El
//   comando carga los productos del menú en UNA consulta y comprueba
//   `visible_en_menu_digital` en el servidor, que es donde no se puede falsear.
// =====================================================

import { api } from '@/api/cliente';

/** La escala de `numeric(14,4)` y el tope de `cantidadPedida` del esquema. */
const MAXIMO_CANTIDAD = 999;

/**
 * Las cinco rutas públicas, en un solo sitio.
 *
 * El token va codificado porque llega de la URL: `resolverAmbitoPortal` lo
 * valida contra `/^[A-Za-z0-9_-]{6,120}$/`, pero componer una ruta con texto
 * sin codificar es la clase de descuido que no se detecta hasta que alguien
 * pega un código raro en la barra de direcciones.
 */
function rutaPublica(token, sufijo) {
  return `/api/publico/qr/${encodeURIComponent(token || '')}${sufijo}`;
}

/**
 * La lectura combinada — cierre de D-14.
 *
 * Antes el portal hacía cinco consultas anónimas por el puente, una de ellas
 * `ConfiguracionNegocio.list()` COMPLETA: eso entregaba `presentacion_password`
 * en texto plano y los identificadores de Google a cualquiera que escaneara un
 * código. Este endpoint devuelve sólo la lista blanca escrita a mano en
 * `portal/lista-blanca.ts`, y de paso resuelve negocio, mesa, menú, secciones y
 * cuenta en UNA petición.
 *
 * Devuelve `{negocio, mesa, productos, categorias, secciones, cuenta}`.
 */
export async function leerPortalPublico(token) {
  if (!token) throw new Error('Este enlace no es válido.');

  const respuesta = await fetch(rutaPublica(token, ''), {
    method: 'GET',
    headers: { 'x-morphiqpos-request': '1' },
    cache: 'no-store',
    credentials: 'same-origin',
  });

  // El `catch` de un `json()` que ya viene mal no traga nada: alimenta el
  // `throw` explícito de tres líneas más abajo. Es el mismo caso que
  // `api/cliente.ts:95`, y por eso se queda.
  const cuerpo = await respuesta.json().catch(() => null);
  if (!cuerpo || cuerpo.ok !== true) {
    throw errorDelPortal(cuerpo);
  }
  return cuerpo.datos;
}

/**
 * Traduce el sobre de error del portal a una excepción con mensaje en español.
 *
 * El mensaje ya viene escrito para el comensal desde el dominio («Este código QR
 * ya no es válido», «El menú digital de este negocio no está disponible ahora
 * mismo»). `codigo` lleva la REGLA —`QR_TOKEN_INVALIDO`, `QR_PORTAL_CERRADO`—
 * para que la pantalla elija qué cara poner, no para reescribir el texto.
 */
function errorDelPortal(cuerpo) {
  const detalle = cuerpo?.error || null;
  const error = new Error(detalle?.mensaje || 'No pudimos cargar el menú.');
  error.codigo = detalle?.datos?.regla || detalle?.codigo || 'ERROR_INTERNO';
  return error;
}

/**
 * Abre la mesa desde el teléfono del comensal.
 *
 * `clave` es la clave de idempotencia del DIÁLOGO: se genera al abrirlo y se
 * reusa mientras siga abierto, así un doble toque en «Confirmar» no abre dos
 * mesas. Un fallo libera la clave dentro de la propia transacción, de modo que
 * un reintento legítimo vuelve a ejecutar.
 *
 * Devuelve `{ventaId, reutilizada}`. `reutilizada: true` NO es un error: la
 * mesa ya estaba abierta y el comensal quería justamente eso.
 */
export function abrirMesaDesdeQR({
  token,
  personas,
  cliente_nombre,
  notas,
  notas_alergias,
  celebracion_especial,
  tipo_celebracion,
  clave,
}) {
  const celebracion = !!celebracion_especial;
  return api.comandos.ejecutar(
    rutaPublica(token, '/mesa'),
    {
      personas: Math.max(1, parseInt(personas, 10) || 1),
      clienteNombre: (cliente_nombre || '').trim(),
      notas: (notas || '').trim(),
      // Información de seguridad: viaja primero y en instantánea.
      notasAlergias: (notas_alergias || '').trim(),
      celebracionEspecial: celebracion,
      tipoCelebracion: celebracion ? (tipo_celebracion || '').trim() : '',
    },
    clave,
  );
}

/**
 * La cantidad, como texto y con la escala que el esquema acepta.
 *
 * `cantidadPedida` es `/^\d{1,3}(?:\.\d{1,4})?$/`: hasta 999 unidades con
 * cuatro decimales. Un número JavaScript con cola binaria (0.1 + 0.2) escrito
 * tal cual rechazaría la petición entera, así que se fija la escala aquí y se
 * recortan los ceros de relleno.
 *
 * Lo que pasa el tope NO se recorta a 999: devuelve `null` y el pedido falla
 * con el nombre del producto. Acotarlo en silencio cambiaría lo que el comensal
 * pidió —y lo que va a pagar— sin que nadie se entere.
 */
function cantidadTexto(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0 || numero > MAXIMO_CANTIDAD) return null;
  const texto = numero.toFixed(4).replace(/\.?0+$/, '');
  return texto === '' ? null : texto;
}

/**
 * Una línea del carrito traducida a lo ÚNICO que el comando acepta.
 *
 * `itemDelCarrito` es `.strict()`: un `precio_venta` dentro del item no se
 * ignora, **rechaza la petición entera**. Por eso aquí se construye el objeto
 * campo por campo en vez de reenviar el item del carrito con un `...spread`.
 *
 * En los productos variables la cantidad real vive en `_variable` —la cantidad
 * lógica del carrito es 1— y es la que el servidor valora con la regla del tipo
 * de venta: por medida o por porción.
 */
function itemParaComando(item) {
  const variable = item?._variable || null;
  const cruda = variable
    ? variable.tipo_venta === 'porcion_contenedor'
      ? variable.cantidad_porciones
      : variable.cantidad_variable
    : item?.cantidad;

  const cantidad = cantidadTexto(cruda);
  if (!item?.id || cantidad === null) {
    throw new Error(`No pudimos preparar «${item?.nombre || 'un producto'}» de tu pedido.`);
  }

  return { productoId: item.id, cantidad, notas: notaConModificadores(item) };
}

/** El tope de `notaCorta` en el esquema del comando. */
const LARGO_MAXIMO_DE_NOTA = 300;

/**
 * La nota del comensal CON los modificadores que eligió.
 *
 * ── Por qué van dentro de la nota ─────────────────────────────────────────
 * `ProductoQRDialog` deja elegir «sin cebolla», «término medio», y los guarda
 * en `item._modificadores`; `CarritoQR` se los pinta de vuelta. Pero el esquema
 * del comando público sólo acepta `{productoId, cantidad, notas}` y es
 * `.strict()`, así que mandarlos como campo aparte RECHAZA el pedido entero.
 * Construir el objeto sin ellos, que es lo que había, los perdía en silencio:
 * el comensal veía «sin cebolla» en su carrito y a la cocina llegaba el plato
 * con cebolla.
 *
 * Se pliegan en la nota, y no es un apaño: `comanda_items.notas` es justamente
 * lo que el cocinero lee en su ficha, y estos modificadores NO afectan precio,
 * costo ni inventario —lo dice el propio `ProductoQRDialog.jsx:18`—. Los
 * modificadores CON precio son otra cosa y necesitan su columna; eso es E9-3 y
 * no está hecho.
 *
 * Si no cabe, se recorta con puntos suspensivos en vez de que el comando
 * rechace el pedido: perder el final de una nota larga es malo, no poder pedir
 * es peor.
 */
function notaConModificadores(item) {
  const propia = (item?.notas || '').trim();
  const grupos = Array.isArray(item?._modificadores) ? item._modificadores : [];

  const elegidos = grupos
    .map((g) => {
      const opciones = (Array.isArray(g?.opciones) ? g.opciones : [])
        .map((o) => String(o?.nombre || '').trim())
        .filter(Boolean);
      if (opciones.length === 0) return null;
      const grupo = String(g?.grupo_nombre || '').trim();
      return grupo ? `${grupo}: ${opciones.join(', ')}` : opciones.join(', ');
    })
    .filter(Boolean)
    .join(' · ');

  const completa = [elegidos, propia].filter(Boolean).join(' — ');
  return completa.length <= LARGO_MAXIMO_DE_NOTA
    ? completa
    : `${completa.slice(0, LARGO_MAXIMO_DE_NOTA - 1)}…`;
}

/**
 * Envía el carrito a cocina.
 *
 * Devuelve `{ventaId, lineas, comandas, totalCentavos}`. El total es el del
 * servidor, cotizado sobre TODAS las líneas persistidas —la mesa pudo pedir dos
 * veces— con la misma función que usa el cobro.
 */
export function enviarPedidoQR({ token, items, notaGeneral, clave }) {
  const carrito = (Array.isArray(items) ? items : []).filter(
    (item) => item && Number(item.cantidad) > 0,
  );
  if (carrito.length === 0) throw new Error('El carrito está vacío');

  return api.comandos.ejecutar(
    rutaPublica(token, '/pedido'),
    { items: carrito.map(itemParaComando), notaGeneral: (notaGeneral || '').trim() },
    clave,
  );
}

/**
 * «Llama al mesero», sin la carrera que tenía el navegador.
 *
 * El anti-duplicado dejó de ser una consulta previa que envejece en el camino:
 * lo impone el índice único parcial `solicitudes_qr_una_pendiente`. Si ya
 * avisaste, el comando responde `QR_SOLICITUD_DUPLICADA` con su mensaje —«Ya
 * avisamos al mesero. Llegará en un momento.»— y eso ES la respuesta.
 */
export function crearSolicitudQR({ token, tipo, clave }) {
  return api.comandos.ejecutar(rutaPublica(token, '/solicitud'), { tipo }, clave);
}

/**
 * Pide la cuenta y elige la propina.
 *
 * Sólo viaja el TIPO de propina y, si es porcentaje, el porcentaje. Nunca un
 * importe: `PedirCuentaQR.jsx` escribía `subtotal_consumo`,
 * `propina_monto_sugerida` y `total_estimado` calculados en el navegador y los
 * guardaba tal cual. El subtotal sale ahora de `cotizar` y la propina de
 * `aplicarPorcentaje`, en centavos enteros.
 *
 * Devuelve `{ventaId, subtotalCentavos, propinaCentavos, propinaTipo, codigoCaja}`.
 */
export function pedirCuentaQR({ token, propinaTipo, propinaPorcentaje, propinaMonto, clave }) {
  const cuerpo = {
    propinaTipo,
    propinaPorcentaje: Math.max(0, Math.min(100, parseInt(propinaPorcentaje, 10) || 0)),
  };
  // El importe escrito a mano SÓLO viaja con `monto_manual`: el esquema del
  // comando rechaza la petición entera si llega con cualquier otro tipo, y eso
  // es a propósito —pedir una cosa y mandar otra no se ignora en silencio—.
  //
  // Se convierte a centavos con `Math.round` sobre el valor ya en pesos y no
  // sobre una cadena: aquí no hay `desdeTexto`, y el campo es un número que el
  // comensal teclea con dos decimales como mucho.
  if (propinaTipo === 'monto_manual') {
    const pesos = Number.parseFloat(propinaMonto);
    cuerpo.propinaSugeridaCentavos = Number.isFinite(pesos) && pesos > 0 ? Math.round(pesos * 100) : 0;
  }
  return api.comandos.ejecutar(rutaPublica(token, '/cuenta'), cuerpo, clave);
}

/**
 * Deja la valoración de la visita.
 *
 * El emoji NO viaja. `ValoracionEmoji.jsx` mandaba `satisfaccion_emoji` y
 * `satisfaccion_label` desde el navegador: dos campos de texto libre que
 * acababan en un reporte, así que cualquiera podía escribir lo que quisiera en
 * la carita de una venta. Ahora va el número del 1 al 5 y el emoji lo pone el
 * servidor.
 *
 * Devuelve `{ventaId, score, yaValorada}`. Insistir no es un error: si ya
 * estaba valorada se devuelve la que quedó escrita.
 */
export function valorarVisitaQR({ token, score, comentario, clave }) {
  return api.comandos.ejecutar(
    rutaPublica(token, '/valoracion'),
    { score: Number(score), comentario: (comentario || '').trim() },
    clave,
  );
}
