import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import { obtenerDb, type Transaccion } from '@morphiqpos/data';

/**
 * `ConfiguracionNegocio` — la entidad que no es una tabla con columnas.
 *
 * Su frontend la trata como un registro plano de ~33 campos. El backend guarda
 * el nombre del negocio en `organizaciones` y el resto en `configuracion` como
 * un documento JSON con versión. Traducirla campo por columna no aplica, así
 * que vive aquí y no en `mapa.ts`.
 *
 * ── La restricción que corrige D-15 ────────────────────────────────────────
 * Su código hace `ConfiguracionNegocio.list()[0]` y da por hecho que hay una.
 * En la base hay un único registro por organización, impuesto por restricción,
 * así que `list()` devuelve exactamente uno y ese `[0]` siempre acierta.
 *
 * ── La lista blanca que cierra D-14 ────────────────────────────────────────
 * `PortalCliente.jsx` hace un `list()` COMPLETO y lo expone a cualquiera que
 * escanee un código QR: hoy eso entrega `presentacion_password` en texto
 * plano, todos los identificadores de Google, `paquete_modo` y
 * `mostrar_costos_a_caja`. Por el camino público sólo salen los campos de
 * `PUBLICOS`, y esa lista es corta a propósito.
 */

export const CONFIG_POR_OMISION = {
  nombre_negocio: 'MH Astral Systems',
  nombre_sistema: 'MH Astral POS',
  platform_brand: 'MH Astral Systems',
  logo_url: '',
  logo_ticket_url: '',
  logo_pdf_url: '',
  background_logo_url: '',
  background_image_url: '',
  background_fit: 'cover',
  background_opacity: 0.12,
  color_primario: '#1e40af',
  color_secundario: '#0f172a',
  color_acento: '#38bdf8',
  moneda: 'MXN',
  simbolo_moneda: '$',
  iva_porcentaje: 0,
  usa_mesas: true,
  usa_cocina: true,
  usa_barra: true,
  permitir_venta_sin_stock: false,
  mostrar_costos_a_caja: false,
  mostrar_logo_ticket: true,
  mensaje_ticket: '¡Gracias por tu visita!',
  ticket_footer: '',
  pdf_footer: '',
  footer_text: '',
  descargar_pdf_corte_auto: true,
  formato_export_default: 'csv',
  colorear_importes_monetarios: true,
  paquete_modo: 'restaurante_pro',
  modo_presentacion_activo: false,
} as const;

/**
 * Lo ÚNICO que puede ver quien escanea un QR sin haber entrado.
 *
 * Nombre, logo y colores para que el menú se vea del negocio; moneda e IVA
 * para que los precios cuadren; y los interruptores que cambian lo que el
 * comensal puede pedir. Nada más.
 *
 * Fuera, explícitamente: `presentacion_password`, cualquier identificador de
 * integración, `mostrar_costos_a_caja` y `paquete_modo`.
 */
export const PUBLICOS = [
  'nombre_negocio',
  'nombre_sistema',
  'logo_url',
  'background_image_url',
  'background_logo_url',
  'background_fit',
  'background_opacity',
  'color_primario',
  'color_secundario',
  'color_acento',
  'moneda',
  'simbolo_moneda',
  'iva_porcentaje',
  'mensaje_ticket',
  'usa_mesas',
] as const;

/**
 * Campos que NO salen nunca por ningún camino, ni siquiera con sesión.
 *
 * `presentacion_password` se compara en el servidor contra un hash (E10-3). Que
 * hoy viaje en texto plano al navegador es el defecto D-19.
 */
const NUNCA_SALEN = new Set(['presentacion_password', 'presentacion_password_hash']);

/**
 * Campos que NO se escriben por el camino genérico, aunque salgan al leer.
 *
 * `paquete_modo` decide qué funciones existen y qué se cobra. Ya no vive en
 * este documento: se deriva de `organizaciones.paquete`, la misma columna que
 * usa el gate. Su comando exige dueño; el camino genérico nunca la escribe.
 *
 * `presentacion_ultimo_acceso` lo pone el servidor al desbloquear: aceptarlo
 * del cliente permitiría falsificar el registro de quién entró.
 */
const SOLO_POR_COMANDO = new Set(['paquete_modo', 'presentacion_ultimo_acceso']);

const MAX_BYTES_CONFIGURACION = 64 * 1024;

/** Campos que las pantallas existentes administran en este documento. */
const CLAVES_EDITABLES = new Set([
  'nombre_negocio',
  'nombre_sistema',
  'platform_brand',
  'logo_url',
  'logo_ticket_url',
  'logo_pdf_url',
  'background_logo_url',
  'background_image_url',
  'background_fit',
  'background_opacity',
  'color_primario',
  'color_secundario',
  'color_acento',
  'moneda',
  'simbolo_moneda',
  'iva_porcentaje',
  'usa_mesas',
  'usa_cocina',
  'usa_barra',
  'permitir_venta_sin_stock',
  'mostrar_costos_a_caja',
  'mostrar_logo_ticket',
  'mensaje_ticket',
  'ticket_footer',
  'pdf_footer',
  'footer_text',
  'descargar_pdf_corte_auto',
  'formato_export_default',
  'colorear_importes_monetarios',
  'modo_presentacion_activo',
  'direccion',
  'telefono',
  'correo',
  'propinas_activas',
  'propina_porcentajes_sugeridos',
  'asignacion_mesas_activa',
  'silenciar_notificaciones_admin',
  'estaciones_preparacion_activas',
  'unidades_medida_lista',
  'portal_qr_activo',
  'portal_qr_modo_menu',
  'portal_qr_mostrar_precios',
  'portal_qr_mostrar_sin_imagen',
  'portal_qr_permitir_ordenar',
  'portal_qr_permitir_cuenta',
  'portal_qr_permitir_ayuda',
  'portal_qr_mostrar_precuenta',
  'portal_qr_permitir_propina_cliente',
  'portal_qr_permitir_pedidos_cliente',
  'portal_qr_cuenta_modo',
  'portal_qr_mensaje_bienvenida',
  'presentacion_ultimo_acceso',
]);

type Registro = Record<string, unknown>;

function esObjeto(v: unknown): v is Registro {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function serializarConfiguracion(valores: Registro): string {
  let serializada: string;
  try {
    serializada = JSON.stringify(valores);
  } catch {
    throw new ErrorDominio(
      'PUENTE_CAMPO_INVALIDO',
      'La configuración contiene un valor que no se puede guardar.',
    );
  }
  if (new TextEncoder().encode(serializada).byteLength > MAX_BYTES_CONFIGURACION) {
    throw new ErrorDominio(
      'PUENTE_CAMPO_INVALIDO',
      'La configuración supera el límite total de 64 KiB.',
    );
  }
  return serializada;
}

/**
 * Lee la configuración con la forma que espera su frontend.
 *
 * `publica` recorta a `PUBLICOS`; es lo que usa el endpoint del portal QR.
 */
export async function leerConfiguracion(
  organizacionId: string,
  opciones: { readonly publica?: boolean } = {},
): Promise<Registro> {
  const fila = await obtenerDb()
    .selectFrom('organizaciones as o')
    .leftJoin('configuracion as c', 'c.organizacion_id', 'o.id')
    .select([
      'o.nombre as nombreNegocio',
      'o.paquete as paquete',
      'c.id as configId',
      'c.valores',
      'c.updated_at',
    ])
    .where('o.id', '=', organizacionId)
    .executeTakeFirst();

  if (fila === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'La organización no existe.');
  }

  const guardados = esObjeto(fila.valores) ? fila.valores : {};
  const completa: Registro = {
    ...CONFIG_POR_OMISION,
    ...guardados,
    // La misma columna que consulta `comando()` es también la que se presenta
    // como paquete. Un valor histórico del JSON nunca la puede contradecir.
    paquete_modo: fila.paquete,
    // El nombre vive en `organizaciones`, no en el documento: es el mismo que
    // usa la facturación y no puede divergir.
    nombre_negocio: fila.nombreNegocio,
    // Su `Configuracion.jsx` depende de `updated_date` para volver a hidratar
    // los formularios; sin él los interruptores se quedan con el valor viejo.
    id: fila.configId ?? organizacionId,
    updated_date: (fila.updated_at ?? new Date()).toISOString(),
  };

  // Se construye una copia SIN los prohibidos en vez de borrarlos: un `delete`
  // sobre una clave calculada deja la puerta a que mañana alguien pase una
  // clave que no existe y no pase nada, en silencio.
  const visible: Registro = {};
  for (const [clave, valor] of Object.entries(completa)) {
    if (!NUNCA_SALEN.has(clave)) visible[clave] = valor;
  }

  if (opciones.publica !== true) return visible;

  const recortada: Registro = { id: visible['id'] };
  for (const campo of PUBLICOS) recortada[campo] = visible[campo];
  return recortada;
}

/**
 * Guarda una parte de la configuración.
 *
 * Mezcla parcial sobre el documento, como su `update(id, patch)`. El nombre del
 * negocio se escribe en `organizaciones`, no en el JSON.
 */
export async function guardarConfiguracionParcial(
  tx: Transaccion,
  organizacionId: string,
  parche: Readonly<Record<string, unknown>>,
  opciones: { readonly desdeComando?: boolean } = {},
): Promise<Registro> {
  for (const prohibido of NUNCA_SALEN) {
    if (prohibido in parche) {
      throw new ErrorDominio(
        'PUENTE_CAMPO_INVALIDO',
        `«${prohibido}» no se guarda por aquí: se compara en el servidor contra un hash.`,
      );
    }
  }
  if (opciones.desdeComando !== true) {
    for (const acotado of SOLO_POR_COMANDO) {
      if (acotado in parche) {
        throw new ErrorDominio(
          'PUENTE_CAMPO_INVALIDO',
          `«${acotado}» tiene su propio comando y exige un rol más estricto.`,
        );
      }
    }
  }
  for (const clave of Object.keys(parche)) {
    if (clave === 'id' || clave === 'updated_date') continue;
    if (!CLAVES_EDITABLES.has(clave)) {
      throw new ErrorDominio(
        'PUENTE_CAMPO_INVALIDO',
        `«${clave}» no es un campo editable de la configuración.`,
      );
    }
  }
  serializarConfiguracion({ ...parche });

  const nombreNuevo = parche['nombre_negocio'];
  let nombreNormalizado: string | null = null;
  if (nombreNuevo !== undefined) {
    if (typeof nombreNuevo !== 'string') {
      throw new ErrorDominio('PUENTE_CAMPO_INVALIDO', 'El nombre del negocio debe ser texto.');
    }
    const nombre = nombreNuevo.trim();
    if (nombre.length === 0 || nombre.length > 160) {
      throw new ErrorDominio(
        'PUENTE_CAMPO_INVALIDO',
        'El nombre del negocio debe tener entre 1 y 160 caracteres.',
      );
    }
    nombreNormalizado = nombre;
  }

  const actual = await tx
    .selectFrom('configuracion')
    .select(['id', 'valores', 'version'])
    .where('organizacion_id', '=', organizacionId)
    .executeTakeFirst();

  // `id` y `updated_date` los pone el servidor: si llegan en el parche, se
  // ignoran en vez de guardarse como campos del documento.
  const resto: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(parche)) {
    if (clave === 'nombre_negocio' || clave === 'id' || clave === 'updated_date') continue;
    resto[clave] = valor;
  }

  if (nombreNormalizado !== null) {
    await tx
      .updateTable('organizaciones')
      .set({ nombre: nombreNormalizado, updated_at: new Date() })
      .where('id', '=', organizacionId)
      .execute();
  }

  const valores = { ...(esObjeto(actual?.valores) ? actual.valores : {}), ...resto };
  const valoresSerializados = serializarConfiguracion(valores);

  if (actual === undefined) {
    await tx
      .insertInto('configuracion')
      .values({ organizacion_id: organizacionId, valores: valoresSerializados, version: 1 })
      .execute();
  } else {
    await tx
      .updateTable('configuracion')
      .set({
        valores: valoresSerializados,
        version: actual.version + 1,
        updated_at: new Date(),
      })
      .where('id', '=', actual.id)
      .execute();
  }

  return leerConfiguracion(organizacionId);
}
