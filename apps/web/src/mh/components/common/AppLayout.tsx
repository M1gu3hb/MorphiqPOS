'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { usePOSAuth } from '../../lib/POSAuthContext.tsx';
import { useRouteCleanup } from '../../lib/useRouteCleanup.ts';
import BrandColorsApplier from './BrandColorsApplier.tsx';
import BrandedBackground from './BrandedBackground.tsx';
import Sidebar from './Sidebar.tsx';

/**
 * Portado de `historico/restaurante/src/components/common/AppLayout.jsx`.
 *
 * Adaptaciones, todas de enrutador y ninguna visual:
 *   · `<Outlet/>` de react-router → `children` de Next.
 *   · `useNavigate()` → `useRouter()`.
 *
 * ── Lo que todavía no está, y por qué ─────────────────────────────────────
 * Su layout monta además `NotificationsWatcher`, `SolicitudesQRWatcher`,
 * `PedidoListoWatcher` y `MobileAdminRadialMenu`. Los tres primeros escuchan
 * entidades que este backend aún no tiene —notificaciones, solicitudes del
 * portal QR y órdenes de mesa—, así que portarlos hoy sería portar cuatro
 * componentes que sondean rutas inexistentes. Vuelven cuando vuelvan sus
 * pantallas. Está dicho aquí y en el reporte, no dado por hecho.
 */

export default function AppLayout({ children }: { readonly children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { posUser, isLoading } = usePOSAuth();
  const router = useRouter();
  // Libera body locks (overflow/pointer-events) si quedó algún portal pegado al cambiar de ruta.
  useRouteCleanup();

  useEffect(() => {
    if (!isLoading && !posUser) {
      router.replace('/login-pos');
    }
  }, [posUser, isLoading, router]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!posUser) return null;

  return (
    <div className="flex relative" style={{ minHeight: '100dvh' }}>
      <BrandColorsApplier />
      <BrandedBackground />
      <Sidebar
        collapsed={collapsed}
        onToggle={() => {
          setCollapsed((c) => !c);
        }}
      />
      <main
        className={`flex-1 transition-all duration-300 ${collapsed ? 'lg:ml-16' : 'lg:ml-60'} relative z-10`}
        style={{ minHeight: '100dvh' }}
      >
        <div className="p-4 md:p-6 lg:p-8 pt-14 lg:pt-6" style={{ minHeight: '100dvh' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
