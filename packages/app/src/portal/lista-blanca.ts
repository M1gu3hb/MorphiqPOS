import type { BanderasPortal } from './banderas.ts';
import { aCentavos, aPesos } from './conversion.ts';

/**
 * LA LISTA BLANCA DEL PORTAL PÚBLICO — cierre de D-14 (`F1-04` §13.4 y §36.3).
 *
 * Hoy `PortalCliente.jsx:65` hace `ConfiguracionNegocio.list()` sin proyección
 * y el cliente es anónimo: cualquiera que escanee un código se lleva
 * `presentacion_password` en claro, los identificadores de Google Drive y
 * Sheets, `last_sync_error` con sus trazas, `paquete_modo`,
 * `mostrar_costos_a_caja` y la dirección y el teléfono del negocio. **Son 54
 * campos de más**, no los cuatro que reporta `F1-01`.
 *
 * ── La regla, escrita para no tener que decidir cada vez ───────────────────
 * La respuesta pública se construye **ELIGIENDO** los campos, no quitando los
 * prohibidos. Una lista de exclusión se queda obsoleta en cuanto alguien añade
 * una columna al esquema; una de inclusión, no. Por eso aquí no hay ningún
 * `delete`, ningún `...resto` y ningún objeto que llegue entero desde la base:
 * cada campo que sale está escrito a mano en una de estas funciones.
 *
 * ── Y por qué no basta con filtrar aquí ───────────────────────────────────
 * Las consultas de `consulta.ts` seleccionan exactamente estas columnas. Filtrar
 * después es la segunda mitad; la primera es no traerlas nunca. Un `select *`
 * seguido de un filtro deja el dato sensible viajando entre la base y el
 * proceso, y a un `console.log` de distancia de un registro de servidor.
 */

// ── Negocio ────────────────────────────────────────────────────────────────

/**
 * Lo que el comensal ve del negocio.
 *
 * Tres campos de identidad —los únicos de `PUBLICOS` que `§36.3` autoriza para
 * el portal— y el resto son interruptores ya resueltos en el servidor.
 *
 * `paquete_modo` NO está, a propósito: revela el plan comercial contratado.
 * `PortalCliente.jsx:262` lo usa sólo para decidir si se permiten pedidos, así
 * que lo sustituye `puede_ordenar`, calculado aquí (§36.3, primera anotación).
 *
 * `estaciones_preparacion_activas` tampoco: es operación interna y se resuelve
 * DENTRO del comando de pedido (§36.3, segunda anotación).
 */
export interface NegocioPublico {
  readonly nombre_negocio: string;
  readonly logo_url: string;
  readonly background_logo_url: string;
  readonly portal_qr_activo: true;
  readonly portal_qr_modo_menu: string;
  readonly portal_qr_cuenta_modo: string;
  readonly portal_qr_mostrar_precios: boolean;
  readonly portal_qr_mostrar_sin_imagen: boolean;
  readonly portal_qr_permitir_ordenar: boolean;
  readonly portal_qr_permitir_cuenta: boolean;
  readonly portal_qr_permitir_ayuda: boolean;
  readonly portal_qr_permitir_pedidos_cliente: boolean;
  readonly portal_qr_permitir_propina_cliente: boolean;
  readonly portal_qr_mostrar_precuenta: boolean;
  readonly portal_qr_mensaje_bienvenida: string;
  readonly propinas_activas: boolean;
  /** CSV, que es lo que `getPorcentajesSugeridos` sabe leer. Ya validado. */
  readonly propina_porcentajes_sugeridos: string;
  readonly asignacion_mesas_activa: boolean;
  /** Derivado. Sustituye a `paquete_modo` sin decir qué plan se contrató. */
  readonly puede_ordenar: boolean;
}

function cadena(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

/**
 * Arma el bloque `negocio` eligiendo campo por campo.
 *
 * `publica` es lo que devuelve `leerConfiguracion(org, {publica:true})`, que ya
 * recortó a `PUBLICOS`. De ahí se toman TRES campos: los otros doce que esa
 * lista deja salir —colores, IVA, moneda, `usa_mesas`, `mensaje_ticket`— están
 * en la lista de «no salen al portal público» de `§36.3` y el portal no los
 * lee. Se anota en el informe; no se resuelve borrándolos de `PUBLICOS`, que es
 * un archivo de otro módulo.
 */
export function negocioPublico(
  publica: Readonly<Record<string, unknown>>,
  banderas: BanderasPortal,
  puedeOrdenar: boolean,
): NegocioPublico {
  return {
    nombre_negocio: cadena(publica['nombre_negocio']),
    logo_url: cadena(publica['logo_url']),
    background_logo_url: cadena(publica['background_logo_url']),
    portal_qr_activo: true,
    portal_qr_modo_menu: banderas.modoMenu,
    portal_qr_cuenta_modo: banderas.modoCuenta,
    portal_qr_mostrar_precios: banderas.mostrarPrecios,
    portal_qr_mostrar_sin_imagen: banderas.mostrarSinImagen,
    portal_qr_permitir_ordenar: banderas.permitirOrdenar,
    portal_qr_permitir_cuenta: banderas.permitirCuenta,
    portal_qr_permitir_ayuda: banderas.permitirAyuda,
    portal_qr_permitir_pedidos_cliente: banderas.permitirPedidosCliente,
    portal_qr_permitir_propina_cliente: banderas.permitirPropinaCliente,
    portal_qr_mostrar_precuenta: banderas.mostrarPrecuenta,
    portal_qr_mensaje_bienvenida: banderas.mensajeBienvenida,
    propinas_activas: banderas.propinasActivas,
    propina_porcentajes_sugeridos: banderas.porcentajesPropina.join(','),
    asignacion_mesas_activa: banderas.asignacionMesasActiva,
    puede_ordenar: puedeOrdenar,
  };
}

// ── Menú ───────────────────────────────────────────────────────────────────

/** La fila del catálogo, con SÓLO las columnas que la consulta selecciona. */
export interface FilaProductoMenu {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly imagen_url: string | null;
  readonly categoria_id: string | null;
  readonly categoria_nombre: string | null;
  readonly precio_venta_centavos: bigint;
  readonly tipo_venta: string;
  readonly unidad_venta: string;
  readonly unidad_variable: string | null;
  readonly precio_por_unidad_variable_centavos: bigint | null;
  readonly nombre_porcion: string | null;
  readonly precio_por_porcion_centavos: bigint | null;
  readonly presets_variable: unknown;
  readonly presets_porcion: unknown;
}

/**
 * Un producto tal y como lo ve el comensal.
 *
 * Salen nombre, descripción, imagen, precio y lo que define la presentación.
 * **Nunca** `costo_unitario_centavos`, `utilidad_unitaria_centavos`,
 * `margen_bp`, `estrategia_consumo`, `insumo_base_id` ni la receta: eso es la
 * regla 9 de `F1-01` §3 llevada al extremo que corresponde —si cocina no ve
 * costos ni gramajes, el comensal menos.
 */
export interface ProductoDeMenu {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly imagen_url: string;
  readonly categoria_id: string | null;
  readonly categoria_nombre: string;
  readonly precio_venta: number | null;
  /** El mismo importe, exacto y en centavos, para que el teléfono pueda sumar. */
  readonly precio_venta_centavos: string | null;
  readonly tipo_venta: string;
  readonly unidad_venta: string;
  readonly unidad_variable: string;
  readonly precio_por_unidad_variable: number | null;
  readonly precio_por_unidad_variable_centavos: string | null;
  readonly nombre_porcion: string;
  readonly precio_por_porcion: number | null;
  readonly precio_por_porcion_centavos: string | null;
  /**
   * Los atajos que el comensal toca en vez de teclear («1/2 kg», «un vaso»).
   *
   * Van en la lista blanca porque el mapa del puente ya los marca
   * `publico: true` (`mapa.ts:119-120`) EXACTAMENTE para este portal, y
   * `ProductoQRDialog.jsx:157` los pinta. Al pasar el portal a la lectura
   * pública se quedaron fuera y los botones desaparecieron sin que nada
   * fallara: el comensal tenía que teclear los gramos a mano.
   *
   * No llevan precio: son cantidades y etiquetas.
   */
  readonly presets_variable_qr: readonly unknown[];
  readonly presets_porcion_qr: readonly unknown[];
}

/**
 * Un producto del menú, con precios sólo si el negocio los enseña.
 *
 * `conPrecios` es `portal_qr_mostrar_precios` YA DECIDIDO en el servidor. Hasta
 * el hallazgo 7 del veredicto esa bandera se publicaba pero no gobernaba nada:
 * el dueño la apagaba en su panel y la respuesta seguía llevando los tres
 * precios, así que ocultarlos volvía a ser decisión del navegador — justo el
 * reparto de responsabilidades que este módulo viene a corregir. Ahora, con la
 * bandera apagada, el precio **no sale**; la bandera sigue viajando porque su
 * pantalla la necesita para maquetar (`PortalCliente.jsx:608`).
 */
export function productoDeMenu(fila: FilaProductoMenu, conPrecios: boolean): ProductoDeMenu {
  const importe = (centavos: bigint | null): bigint | null => (conPrecios ? centavos : null);

  return {
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion ?? '',
    imagen_url: fila.imagen_url ?? '',
    categoria_id: fila.categoria_id,
    categoria_nombre: fila.categoria_nombre ?? '',
    precio_venta: aPesos(importe(fila.precio_venta_centavos)),
    precio_venta_centavos: aCentavos(importe(fila.precio_venta_centavos)),
    tipo_venta: fila.tipo_venta,
    unidad_venta: fila.unidad_venta,
    unidad_variable: fila.unidad_variable ?? '',
    precio_por_unidad_variable: aPesos(importe(fila.precio_por_unidad_variable_centavos)),
    precio_por_unidad_variable_centavos: aCentavos(
      importe(fila.precio_por_unidad_variable_centavos),
    ),
    nombre_porcion: fila.nombre_porcion ?? '',
    precio_por_porcion: aPesos(importe(fila.precio_por_porcion_centavos)),
    precio_por_porcion_centavos: aCentavos(importe(fila.precio_por_porcion_centavos)),
    presets_variable_qr: comoLista(fila.presets_variable),
    presets_porcion_qr: comoLista(fila.presets_porcion),
  };
}

/**
 * La columna `jsonb` como lista, o vacía.
 *
 * Postgres la entrega ya parseada, pero un producto viejo puede tener `null` o
 * un objeto suelto. Lo que la pantalla espera es un arreglo
 * (`ProductoQRDialog.jsx:157` hace `Array.isArray(...) ? … : []`), y devolver
 * otra cosa la deja en blanco sin decir por qué.
 */
function comoLista(valor: unknown): readonly unknown[] {
  return Array.isArray(valor) ? valor : [];
}

export interface FilaCategoriaMenu {
  readonly id: string;
  readonly nombre: string;
  readonly color: string | null;
  readonly icono: string | null;
  readonly orden: number;
}

export interface CategoriaDeMenu {
  readonly id: string;
  readonly nombre: string;
  readonly color: string;
  readonly icono: string;
  readonly orden: number;
}

/**
 * Una categoría, sin su estación de preparación.
 *
 * `categorias.estacion_preparacion_id`, `estacion_nombre` y `estacion_color`
 * son ruteo interno de cocina: al comensal no le dicen nada y describen cómo
 * está organizada la cocina por dentro.
 */
export function categoriaDeMenu(fila: FilaCategoriaMenu): CategoriaDeMenu {
  return {
    id: fila.id,
    nombre: fila.nombre,
    color: fila.color ?? '',
    icono: fila.icono ?? '',
    orden: fila.orden,
  };
}

export interface FilaSeccionMenu {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly imagen_url: string | null;
  readonly orden: number;
}

export interface SeccionDeMenu {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly imagen_url: string;
  readonly orden: number;
}

export function seccionDeMenu(fila: FilaSeccionMenu): SeccionDeMenu {
  return {
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion ?? '',
    imagen_url: fila.imagen_url ?? '',
    orden: fila.orden,
  };
}
