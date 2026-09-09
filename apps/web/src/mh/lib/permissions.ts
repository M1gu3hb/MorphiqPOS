/**
 * Portado de `historico/restaurante/src/lib/permissions.js`.
 *
 * Su mapa de permisos y su menú, con sus rutas y sus etiquetas. Sin cambios
 * salvo los tipos.
 *
 * ── Esto NO es autorización ────────────────────────────────────────────────
 * Decide qué se DIBUJA, no qué se PUEDE. La autorización de verdad vive en el
 * servidor, dentro del envoltorio `comando()`, que comprueba el rol de la
 * sesión en cada escritura. Ocultar un botón no es autorización; esta tabla
 * sólo evita enseñarle a un cajero un menú que no le sirve.
 */

import { ROLES, type Rol } from './constants.ts';

export type Permiso =
  | 'ver_dashboard'
  | 'ver_pos'
  | 'ver_mesero'
  | 'ver_mesas'
  | 'ver_cocina'
  | 'ver_inventario'
  | 'ver_compras'
  | 'ver_recetas'
  | 'editar_recetas'
  | 'ver_productos'
  | 'ver_ventas'
  | 'ver_caja'
  | 'ver_corte'
  | 'ver_configuracion'
  | 'ver_registros'
  | 'ver_portal_qr'
  | 'ver_costos'
  | 'hacer_descuentos'
  | 'cancelar_ventas'
  | 'limpiar_ventas'
  | 'eliminar_mesas';

// Feature -> roles that can access
export const PERMISSIONS: Readonly<Record<Permiso, readonly Rol[]>> = {
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

export function hasPermission(role: string | null | undefined, permission: Permiso): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

export interface ElementoNav {
  readonly label: string;
  readonly path: string;
  readonly icon: string;
  readonly permission: Permiso;
}

export const NAV_ITEMS: readonly ElementoNav[] = [
  { label: 'Dashboard', path: '/', icon: 'LayoutDashboard', permission: 'ver_dashboard' },
  { label: 'Mesero', path: '/mesero', icon: 'UtensilsCrossed', permission: 'ver_mesero' },
  { label: 'Cocina', path: '/cocina', icon: 'ChefHat', permission: 'ver_cocina' },
  { label: 'Caja', path: '/caja', icon: 'Landmark', permission: 'ver_caja' },
  { label: 'Ventas', path: '/ventas', icon: 'Receipt', permission: 'ver_ventas' },
  { label: 'Recetas', path: '/recetas', icon: 'BookOpen', permission: 'ver_recetas' },
  { label: 'Productos', path: '/productos', icon: 'Tag', permission: 'ver_productos' },
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

export function getNavForRole(role: string | null | undefined): readonly ElementoNav[] {
  return NAV_ITEMS.filter((item) => hasPermission(role, item.permission));
}
