'use client';
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from '@/enrutado';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { getNavForRole } from '@/lib/permissions';
import { isRouteAllowed } from '@/lib/packageConfig';
import { ROLE_LABELS } from '@/lib/constants';
import {
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
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  FileText,
  Sparkles,
  QrCode,
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const ICON_MAP = {
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

function sortByPackage(items, paquete, role) {
  if (role !== 'administrador') return items;
  const order =
    paquete === 'esencial' ? ORDER_ESENCIAL : paquete === 'operativo' ? ORDER_OPERATIVO : ORDER_PRO;
  const idx = (path) => {
    const i = order.indexOf(path);
    return i === -1 ? 999 : i;
  };
  return [...items].sort((a, b) => idx(a.path) - idx(b.path));
}

export default function Sidebar({ collapsed, onToggle }) {
  const { posUser, logout } = usePOSAuth();
  const { config, paquete_modo } = useConfig();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Cerrar al cambiar de ruta
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Bloquear scroll del body cuando el drawer está abierto
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileOpen]);

  // Filtra primero por rol y luego por paquete activo, y aplica orden
  const baseItems = getNavForRole(posUser?.rol)
    .filter((item) => isRouteAllowed(item.path, paquete_modo))
    // Garantía: nunca incluir la ruta /mesas (vista vieja)
    .filter((item) => item.path !== '/mesas');
  const navItems = sortByPackage(baseItems, paquete_modo, posUser?.rol);

  const closeMobile = () => setMobileOpen(false);

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-sidebar-border">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center shrink-0 ring-2 ring-white/10">
          {config.logo_url ? (
            <img
              src={config.logo_url}
              alt={config.nombre_negocio}
              className="w-full h-full object-contain p-1"
            />
          ) : (
            <Sparkles className="w-5 h-5 text-blue-300" />
          )}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-heading font-bold truncate tracking-wide">
              {config.nombre_negocio}
            </p>
            <p className="text-[10px] text-sidebar-foreground/50 truncate">
              {config.platform_brand || 'MH Astral Systems'}
            </p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto text-sidebar-foreground/50 hover:text-sidebar-foreground hidden lg:block"
          aria-label={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto space-y-0.5 px-2">
        {navItems.map((item) => {
          const Icon = ICON_MAP[item.icon] || Tag;
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={closeMobile}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${active ? 'text-white font-semibold' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}
              style={
                active
                  ? {
                      // Skeuomorphism premium: gradiente diagonal del primario al
                      // acento (con fallback al sidebar-primary actual para no
                      // cambiar nada con la paleta por defecto), borde superior
                      // luminoso, sombra interior profunda y resplandor exterior.
                      background:
                        'linear-gradient(135deg, var(--brand-primary, hsl(var(--sidebar-primary))) 0%, var(--brand-accent, hsl(var(--sidebar-primary))) 100%)',
                      boxShadow: [
                        // Highlight superior (luz que cae): efecto de relieve
                        'inset 0 1px 0 rgba(255,255,255,0.25)',
                        // Sombra interior inferior: da profundidad de botón hundido sutil
                        'inset 0 -2px 4px rgba(0,0,0,0.20)',
                        // Sombra exterior premium con tinte del acento
                        '0 2px 6px rgba(0,0,0,0.35)',
                        '0 0 12px var(--brand-accent-glow, rgba(59,130,246,0.25))',
                      ].join(', '),
                      border: '1px solid rgba(255,255,255,0.10)',
                    }
                  : undefined
              }
            >
              {/* Rayita lateral secundaria — refuerzo visual del item activo
                  sin ser el efecto principal. Solo aparece cuando es active. */}
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
                  style={{
                    background: 'rgba(255,255,255,0.55)',
                    boxShadow: '0 0 6px rgba(255,255,255,0.4)',
                  }}
                />
              )}
              <Icon
                className="w-5 h-5 shrink-0"
                style={
                  active
                    ? {
                        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))',
                      }
                    : undefined
                }
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Theme toggle — visible en todas las páginas internas */}
      <div className="px-2 pb-1">
        {collapsed ? (
          <div className="flex justify-center pb-1">
            <ThemeToggle
              variant="icon"
              className="bg-transparent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent"
            />
          </div>
        ) : (
          <ThemeToggle variant="sidebar" />
        )}
      </div>

      {/* User footer */}
      {posUser && (
        <div className="border-t border-sidebar-border p-3">
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 bg-sidebar-accent rounded-full flex items-center justify-center text-xs font-bold shrink-0">
              {posUser.nombre?.charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{posUser.nombre}</p>
                <p className="text-[10px] text-sidebar-foreground/50">{ROLE_LABELS[posUser.rol]}</p>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={logout}
                className="text-sidebar-foreground/50 hover:text-red-400 transition-colors p-1"
                aria-label="Salir"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Hamburguesa móvil/tablet (oculto en lg+) */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-[70] w-11 h-11 bg-sidebar rounded-xl flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform"
        aria-label="Abrir menú"
        style={{ touchAction: 'manipulation' }}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Drawer móvil/tablet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeMobile}
            aria-label="Cerrar menú"
          />
          {/* Panel */}
          <div className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] shadow-2xl bg-sidebar">
            {/* Botón cerrar grande, accesible */}
            <button
              type="button"
              onClick={closeMobile}
              className="absolute top-2 right-2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white z-10 active:scale-95 transition-transform"
              aria-label="Cerrar menú"
              style={{ touchAction: 'manipulation' }}
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Sidebar escritorio */}
      <div
        className={`hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-30 transition-all duration-300 shadow-xl ${collapsed ? 'w-16' : 'w-60'}`}
      >
        <SidebarContent />
      </div>
    </>
  );
}
