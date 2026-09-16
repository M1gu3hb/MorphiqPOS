'use client';
import { ROLES } from './constants';

// Feature -> roles that can access
export const PERMISSIONS = {
  ver_dashboard: [ROLES.ADMIN],
  ver_pos: [ROLES.ADMIN, ROLES.CASHIER],
  ver_mesero: [ROLES.ADMIN, ROLES.WAITER],
  ver_mesas: [ROLES.ADMIN, ROLES.WAITER, ROLES.CASHIER],
  ver_cocina: [ROLES.ADMIN, ROLES.KITCHEN],
  ver_inventario: [ROLES.ADMIN],
  ver_compras: [ROLES.ADMIN],
  ver_recetas: [ROLES.ADMIN],
  editar_recetas: [ROLES.ADMIN],
  ver_productos: [ROLES.ADMIN],
  ver_ventas: [ROLES.ADMIN, ROLES.CASHIER],
  ver_caja: [ROLES.ADMIN, ROLES.CASHIER],
  ver_corte: [ROLES.ADMIN, ROLES.CASHIER],
  ver_configuracion: [ROLES.ADMIN],
  ver_registros: [ROLES.ADMIN],
  ver_portal_qr: [ROLES.ADMIN],
  ver_costos: [ROLES.ADMIN],
  hacer_descuentos: [ROLES.ADMIN],
  cancelar_ventas: [ROLES.ADMIN],
  limpiar_ventas: [ROLES.ADMIN],
  eliminar_mesas: [ROLES.ADMIN],
};

export function hasPermission(role, permission) {
  if (!role || !PERMISSIONS[permission]) return false;
  return PERMISSIONS[permission].includes(role);
}

/**
 * El menu. `entidad` es F-017: dice QUE sustantivo del vocabulario nombra esa
 * entrada, para que una ferreteria lea «Materiales» donde un restaurante lee
 * «Productos». Las entradas sin `entidad` no se traducen a proposito: «Caja»,
 * «Compras» y «Configuracion» se llaman igual en los cinco giros.
 *
 * La traduccion NO se hace aqui: este archivo es una constante y el vocabulario
 * depende de la organizacion. La hace `etiquetaDeNavegacion`, abajo.
 */
export const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: 'LayoutDashboard', permission: 'ver_dashboard' },
  {
    label: 'Mesero',
    path: '/mesero',
    icon: 'UtensilsCrossed',
    permission: 'ver_mesero',
    entidad: 'responsable',
  },
  {
    label: 'Cocina',
    path: '/cocina',
    icon: 'ChefHat',
    permission: 'ver_cocina',
    entidad: 'preparacion',
  },
  { label: 'Caja', path: '/caja', icon: 'Landmark', permission: 'ver_caja' },
  { label: 'Ventas', path: '/ventas', icon: 'Receipt', permission: 'ver_ventas' },
  { label: 'Recetas', path: '/recetas', icon: 'BookOpen', permission: 'ver_recetas' },
  {
    label: 'Productos',
    path: '/productos',
    icon: 'Tag',
    permission: 'ver_productos',
    entidad: 'producto',
  },
  { label: 'Inventario', path: '/inventario', icon: 'Package', permission: 'ver_inventario' },
  { label: 'Compras', path: '/compras', icon: 'ShoppingBag', permission: 'ver_compras' },
  { label: 'Registros', path: '/registros', icon: 'FileText', permission: 'ver_registros' },
  { label: 'Portal QR', path: '/portal-qr', icon: 'QrCode', permission: 'ver_portal_qr' },
  {
    label: 'Configuración',
    path: '/configuracion',
    icon: 'Settings',
    permission: 'ver_configuracion',
  },
];

export function getNavForRole(role) {
  return NAV_ITEMS.filter((item) => hasPermission(role, item.permission));
}

/**
 * F-017 · Como se llama esa entrada EN ESTE negocio.
 *
 * ── Por que en plural ──────────────────────────────────────────────────────
 * Una entrada de menu lleva a una lista, no a un elemento: «Materiales», no
 * «Material». El diccionario declara las dos formas justo para esto.
 *
 * ── Por que cae a la etiqueta de siempre ───────────────────────────────────
 * Si el giro APAGA esa entidad —una tienda no tiene preparacion— el plural sale
 * vacio, y un menu con un hueco en blanco es peor que uno que dice «Cocina».
 * El filtro por paquete ya quita las entradas que ese negocio no tiene; esto
 * solo cambia como se llaman las que si tiene.
 */
export function etiquetaDeNavegacion(item, vocabulario) {
  if (!item.entidad || !vocabulario) return item.label;
  const plural = vocabulario.plural(item.entidad);
  if (!plural) return item.label;
  return plural.charAt(0).toLocaleUpperCase('es-MX') + plural.slice(1);
}
