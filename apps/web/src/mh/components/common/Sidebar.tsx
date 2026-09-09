'use client';

import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useConfig } from '../../lib/ConfigContext.tsx';
import { isRouteAllowed } from '../../lib/packageConfig.ts';
import { getNavForRole } from '../../lib/permissions.ts';
import { usePOSAuth } from '../../lib/POSAuthContext.tsx';
import SidebarContenido from './SidebarContenido.tsx';
import { sortByPackage } from './sidebarOrden.ts';

/**
 * Portado de `historico/restaurante/src/components/common/Sidebar.jsx`.
 *
 * Cambios: `useLocation()` → `usePathname()`, `<Link to>` → `<Link href>` de
 * Next, y el panel movido a `SidebarContenido.tsx`. El resto es suyo: el
 * hamburguesa flotante, el cajón de 72 con su backdrop, el ancho de 16/60 en
 * escritorio y la transición de 300 ms.
 */

interface Props {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: Props) {
  const { posUser, logout } = usePOSAuth();
  const { config, paquete_modo } = useConfig();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Cerrar al cambiar de ruta.
  // El lint avisa de un `setState` dentro de un efecto, y aquí es lo correcto:
  // se sincroniza con un sistema EXTERNO —el enrutador—, no con estado propio.
  // Cerrar sólo en el `onClick` del enlace dejaría el cajón abierto cuando la
  // navegación viene del botón «atrás» del navegador.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  // Bloquear scroll del body cuando el drawer está abierto
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return undefined;
  }, [mobileOpen]);

  // Filtra primero por rol y luego por paquete activo, y aplica orden
  const baseItems = getNavForRole(posUser?.rol)
    .filter((item) => isRouteAllowed(item.path, paquete_modo))
    // Garantía: nunca incluir la ruta /mesas (vista vieja)
    .filter((item) => item.path !== '/mesas');
  const navItems = sortByPackage(baseItems, paquete_modo, posUser?.rol);

  const closeMobile = (): void => {
    setMobileOpen(false);
  };

  const contenido = (
    <SidebarContenido
      collapsed={collapsed}
      onToggle={onToggle}
      navItems={navItems}
      pathname={pathname}
      config={config}
      posUser={posUser}
      onLogout={logout}
      onNavigate={closeMobile}
    />
  );

  return (
    <>
      {/* Hamburguesa móvil/tablet (oculto en lg+) */}
      <button
        type="button"
        onClick={() => {
          setMobileOpen(true);
        }}
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
          <button
            type="button"
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
            {contenido}
          </div>
        </div>
      )}

      {/* Sidebar escritorio */}
      <div
        className={`hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-30 transition-all duration-300 shadow-xl ${collapsed ? 'w-16' : 'w-60'}`}
      >
        {contenido}
      </div>
    </>
  );
}
