import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import { obtenerDb } from '@morphiqpos/data';

import { leerConfiguracion } from '../puente/configuracion.ts';
import { buscadorDeProduccion, resolverAmbitoPortal, type AmbitoPortal } from './ambito.ts';
import { banderasDe } from './banderas.ts';
import { permitirPortal } from './limite.ts';
import { cuentaPublica, type CuentaPublica, type MesaPublica } from './cuenta-publica.ts';
import { esUnoDe, ORDEN_ACTIVA, ORDEN_ADMITE_PEDIDO } from './estados.ts';
import {
  categoriaDeMenu,
  negocioPublico,
  productoDeMenu,
  seccionDeMenu,
  type CategoriaDeMenu,
  type NegocioPublico,
  type ProductoDeMenu,
  type SeccionDeMenu,
} from './lista-blanca.ts';
import { exigirPortalAbierto, leerContextoDelNegocio, puedeOrdenarDesdeQR } from './negocio.ts';

/**
 * `GET /api/publico/qr/:token` — el payload COMBINADO y FILTRADO (E7-1).
 *
 * Hoy el portal hace cinco consultas desde el navegador: la configuración
 * entera dos veces (`PortalCliente.jsx:65` y `qrPedidoFlow.js:255`), la mesa,
 * los productos, las categorías, las secciones y la venta activa. Todas
 * anónimas y sin proyección. Aquí es UNA petición, resuelta en el servidor, y
 * cada campo que sale está escrito a mano en `lista-blanca.ts`.
 *
 * Es la mitad que cierra D-14. La otra mitad es que el resto de entidades ni
 * siquiera son consultables sin sesión: el puente exige cookie.
 */

export interface PayloadPortal {
  readonly negocio: NegocioPublico;
  readonly mesa: MesaPublica;
  readonly productos: readonly ProductoDeMenu[];
  readonly categorias: readonly CategoriaDeMenu[];
  readonly secciones: readonly SeccionDeMenu[];
  /** La venta viva de ESTA mesa, sólo para la precuenta. `null` si no hay. */
  readonly cuenta: CuentaPublica | null;
  /** El último aviso de ESTA mesa, para que el comensal sepa si ya lo vieron. */
  readonly solicitud: SolicitudPublica | null;
}

/**
 * El aviso del comensal, con lo justo para pintar su tarjeta.
 *
 * ── Por qué se publica ─────────────────────────────────────────────────────
 * `PortalCliente.jsx` enseña «Tu mesero ya vio la solicitud» y para eso sondeaba
 * `SolicitudQR.get` cada 4 s desde el navegador: una lectura que en el portal
 * NO tiene sesión y por tanto siempre fallaba en silencio. Y su condición de
 * cierre miraba sólo `atendida` y `resuelta`, así que si el administrador la
 * CANCELABA el comensal se quedaba esperando para siempre.
 *
 * Aquí el estado llega ya resuelto por el servidor, en la misma petición que el
 * resto del portal, y `cerrada` cubre los tres finales. Ni id de empleado, ni
 * nombre, ni notas: el comensal no tiene por qué saber quién le atiende.
 */
export interface SolicitudPublica {
  readonly id: string;
  readonly tipo: string;
  readonly estado: string;
  /** `true` cuando ya no hay nada que esperar: resuelta o cancelada. */
  readonly cerrada: boolean;
}

/** Topes de `F1-04` §36.6. Nada de `list(10000)` ni siquiera aquí. */
const TOPE_CATALOGO = 1000;
const TOPE_SECCIONES = 200;
const TOPE_LINEAS = 500;

export async function payloadDelPortal(
  organizacionId: string,
  token: string,
  pimienta: string,
): Promise<PayloadPortal> {
  const permiso = await permitirPortal('consulta', token, pimienta, { organizacionId });
  if (!permiso.ok) {
    throw new ErrorDominio(
      'QR_DEMASIADAS_PETICIONES',
      'Demasiadas peticiones desde este código. Espera un momento.',
      { esperaSegundos: permiso.esperaSegundos },
    );
  }

  const ambito = await resolverAmbitoPortal(
    buscadorDeProduccion(organizacionId),
    organizacionId,
    token,
  );

  const negocio = await leerContextoDelNegocio(undefined, ambito.organizacionId);
  if (negocio === null) {
    // La organización existe (la mesa apunta a ella) pero está dada de baja.
    // Se responde como token inválido: al comensal le da igual el motivo.
    throw new ErrorDominio('QR_TOKEN_INVALIDO', 'Este código QR ya no es válido.');
  }

  const banderas = banderasDe(negocio.valores);
  exigirPortalAbierto(banderas);

  const puedeOrdenar = puedeOrdenarDesdeQR(negocio.paquete, banderas);
  const publica = await leerConfiguracion(ambito.organizacionId, { publica: true });

  const usaCatalogo = banderas.modoMenu === 'productos_pos' || banderas.modoMenu === 'mixto';
  const usaSecciones = banderas.modoMenu === 'menu_subido' || banderas.modoMenu === 'mixto';

  // Las dos banderas de presentación DECIDEN aquí, en el servidor, y no sólo
  // viajan: con los precios apagados no salen precios, y con la precuenta
  // apagada no salen ni totales ni líneas (hallazgo 7).
  const [productos, categorias, secciones, cuenta, solicitud] = await Promise.all([
    usaCatalogo
      ? productosVisibles(ambito.organizacionId, banderas.mostrarPrecios)
      : Promise.resolve([]),
    usaCatalogo ? categoriasVisibles(ambito.organizacionId) : Promise.resolve([]),
    usaSecciones ? seccionesVisibles(ambito.organizacionId) : Promise.resolve([]),
    cuentaDeLaMesa(ambito, banderas.mostrarPrecuenta),
    solicitudDeLaMesa(ambito),
  ]);

  return {
    negocio: negocioPublico(publica, banderas, puedeOrdenar),
    mesa: mesaPublica(ambito, cuenta, puedeOrdenar),
    productos,
    categorias,
    secciones,
    cuenta,
    solicitud,
  };
}

/** Los estados en los que el aviso ya no espera a nadie. */
const SOLICITUD_CERRADA = ['resuelta', 'cancelada'];

/**
 * El último aviso de ESTA mesa. Nunca una lista, nunca el de otra mesa.
 *
 * Se acota al mismo ámbito que la cuenta —organización y mesa del token— y se
 * devuelve sólo el más reciente: al comensal le importa el suyo, y publicar el
 * historial de la mesa sería contar lo que pidieron los de antes.
 */
async function solicitudDeLaMesa(ambito: AmbitoPortal): Promise<SolicitudPublica | null> {
  const fila = await obtenerDb()
    .selectFrom('solicitudes_qr')
    .select(['id', 'tipo', 'estado'])
    .where('organizacion_id', '=', ambito.organizacionId)
    .where('mesa_id', '=', ambito.mesaId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (fila === undefined) return null;
  return { ...fila, cerrada: SOLICITUD_CERRADA.includes(fila.estado) };
}

/**
 * El estado de la mesa, con las decisiones ya tomadas en el servidor.
 *
 * `mesaYaAbierta` de `PortalCliente.jsx:271-275` mira TRES señales porque el
 * navegador no puede fiarse de ninguna: la venta que devolvió el sondeo, el
 * puntero de la mesa y su estado. Aquí las tres se leen en la misma consulta y
 * la respuesta es un booleano, así que el latch anti-parpadeo deja de hacer
 * falta —la causa que lo obligaba a existir ya no puede ocurrir.
 */
function mesaPublica(
  ambito: AmbitoPortal,
  cuenta: CuentaPublica | null,
  puedeOrdenar: boolean,
): MesaPublica {
  const tieneMesero = ambito.empleadoAsignadoId !== null;
  const abierta = cuenta !== null || ambito.ordenActivaId !== null || ambito.estadoMesa !== 'libre';

  return {
    id: ambito.mesaId,
    numero: ambito.mesaNumero,
    nombre: ambito.mesaNombre ?? '',
    estado: ambito.estadoMesa,
    tiene_mesero: tieneMesero,
    venta_activa_id: cuenta?.id ?? null,
    puede_abrir: puedeOrdenar && tieneMesero && !abierta,
    // `puedeOrdenar` ya contiene `portal_qr_permitir_pedidos_cliente`: repetirlo
    // aquí daría dos sitios donde decidir lo mismo, y con el tiempo dirían cosas
    // distintas.
    puede_pedir:
      puedeOrdenar && tieneMesero && cuenta !== null && esUnoDe(ORDEN_ADMITE_PEDIDO, cuenta.estado),
  };
}

async function productosVisibles(
  organizacionId: string,
  conPrecios: boolean,
): Promise<readonly ProductoDeMenu[]> {
  const filas = await obtenerDb()
    .selectFrom('productos as p')
    .leftJoin('categorias as c', 'c.id', 'p.categoria_id')
    .select([
      'p.id as id',
      'p.nombre as nombre',
      'p.descripcion as descripcion',
      'p.imagen_url as imagen_url',
      'p.categoria_id as categoria_id',
      'c.nombre as categoria_nombre',
      'p.precio_venta_centavos as precio_venta_centavos',
      'p.tipo_venta as tipo_venta',
      'p.unidad_venta as unidad_venta',
      'p.unidad_variable as unidad_variable',
      'p.precio_por_unidad_variable_centavos as precio_por_unidad_variable_centavos',
      'p.nombre_porcion as nombre_porcion',
      'p.precio_por_porcion_centavos as precio_por_porcion_centavos',
      'p.presets_variable as presets_variable',
      'p.presets_porcion as presets_porcion',
    ])
    .where('p.organizacion_id', '=', organizacionId)
    .where('p.activo', '=', true)
    // El interruptor por producto. Un producto del POS que Miguel no quiso en
    // el menú digital no aparece aquí ni aunque esté activo.
    .where('p.visible_en_menu_digital', '=', true)
    .orderBy('p.nombre')
    .limit(TOPE_CATALOGO)
    .execute();

  return filas.map((fila) => productoDeMenu(fila, conPrecios));
}

async function categoriasVisibles(organizacionId: string): Promise<readonly CategoriaDeMenu[]> {
  const filas = await obtenerDb()
    .selectFrom('categorias')
    .select(['id', 'nombre', 'color', 'icono', 'orden'])
    .where('organizacion_id', '=', organizacionId)
    // `categorias` guarda las de producto y las de insumo en la misma tabla.
    .where('tipo', '=', 'producto')
    .where('activa', '=', true)
    .orderBy('orden')
    .limit(TOPE_CATALOGO)
    .execute();

  return filas.map(categoriaDeMenu);
}

async function seccionesVisibles(organizacionId: string): Promise<readonly SeccionDeMenu[]> {
  const filas = await obtenerDb()
    .selectFrom('menu_qr_secciones')
    .select(['id', 'nombre', 'descripcion', 'imagen_url', 'orden'])
    .where('organizacion_id', '=', organizacionId)
    .where('activa', '=', true)
    .orderBy('orden')
    .limit(TOPE_SECCIONES)
    .execute();

  return filas.map(seccionDeMenu);
}

/**
 * La venta viva de ESTA mesa. Nunca una lista, nunca la de otra mesa.
 *
 * `§36.2` nota 2: el ámbito público lee «únicamente la venta activa de su
 * propia mesa, resuelta por `token_mesa`, y sólo para la precuenta».
 */
export async function cuentaDeLaMesa(
  ambito: AmbitoPortal,
  conPrecuenta: boolean,
): Promise<CuentaPublica | null> {
  const db = obtenerDb();

  const orden = await db
    .selectFrom('ordenes')
    .select([
      'id',
      'estado',
      'serie',
      'folio',
      'personas',
      'subtotal_centavos',
      'descuento_centavos',
      'impuestos_centavos',
      'total_centavos',
      'propina_puntos_base',
      'propina_tipo',
      'propina_origen',
      'satisfaccion_score',
    ])
    .where('organizacion_id', '=', ambito.organizacionId)
    .where('mesa_id', '=', ambito.mesaId)
    .where('estado', 'in', ORDEN_ACTIVA)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (orden === undefined) return null;

  // Con la precuenta apagada las líneas ni se traen. Filtrar después sería la
  // segunda mitad; la primera es no leerlas nunca — la misma regla que encabeza
  // `lista-blanca.ts`.
  if (!conPrecuenta) return cuentaPublica(orden, [], false);

  const lineas = await db
    .selectFrom('orden_lineas')
    .select([
      'id',
      'producto_nombre',
      'cantidad',
      'unidad',
      'precio_unitario_centavos',
      'total_centavos',
      'notas',
      'estado_preparacion',
    ])
    .where('organizacion_id', '=', ambito.organizacionId)
    .where('orden_id', '=', orden.id)
    .orderBy('orden_visual')
    .limit(TOPE_LINEAS)
    .execute();

  return cuentaPublica(orden, lineas, conPrecuenta);
}
