import {
  BookOpen,
  ChefHat,
  FileText,
  Landmark,
  LayoutDashboard,
  Package,
  QrCode,
  Receipt,
  Scissors,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Tag,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

import type { ElementoNav } from '../../lib/permissions.ts';

/**
 * El mapa de iconos y el orden del menú de su barra lateral.
 *
 * Sale de `Sidebar.jsx` a un archivo aparte por el límite de 300 líneas. Es
 * su tabla, con sus mismos iconos y sus mismas tres listas de orden.
 */

export const ICON_MAP: Readonly<Record<string, LucideIcon>> = {
  LayoutDashboard,
  ShoppingCart,
  UtensilsCrossed,
  ChefHat,
  Receipt,
  Scissors,
  Package,
  ShoppingBag,
  BookOpen,
  Tag,
  Settings,
  Landmark,
  FileText,
  QrCode,
};

// Orden recomendado por paquete (solo para ADMINISTRADOR).
// Para otros roles se respeta el orden natural devuelto por permissions.
const ORDER_ESENCIAL = [
  '/',
  '/caja',
  '/ventas',
  '/productos',
  '/registros',
  '/portal-qr',
  '/configuracion',
];
const ORDER_OPERATIVO = [
  '/',
  '/caja',
  '/ventas',
  '/productos',
  '/inventario',
  '/compras',
  '/recetas',
  '/registros',
  '/portal-qr',
  '/configuracion',
];
const ORDER_PRO = [
  '/',
  '/mesero',
  '/cocina',
  '/caja',
  '/ventas',
  '/productos',
  '/inventario',
  '/compras',
  '/recetas',
  '/registros',
  '/portal-qr',
  '/configuracion',
];

export function sortByPackage(
  items: readonly ElementoNav[],
  paquete: string | undefined,
  role: string | null | undefined,
): readonly ElementoNav[] {
  if (role !== 'administrador') return items;
  const order =
    paquete === 'esencial' ? ORDER_ESENCIAL : paquete === 'operativo' ? ORDER_OPERATIVO : ORDER_PRO;
  const idx = (path: string): number => {
    const i = order.indexOf(path);
    return i === -1 ? 999 : i;
  };
  return [...items].sort((a, b) => idx(a.path) - idx(b.path));
}
