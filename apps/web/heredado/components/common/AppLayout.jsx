'use client';
import React, { useState } from 'react';
import { Outlet, useNavigate } from '@/enrutado';
import { usePOSAuth } from '@/lib/POSAuthContext';
import Sidebar from './Sidebar';
import BrandedBackground from './BrandedBackground';
import BrandColorsApplier from './BrandColorsApplier';
import NotificationsWatcher from './NotificationsWatcher';
import SolicitudesQRWatcher from './SolicitudesQRWatcher';
import PedidoListoWatcher from './PedidoListoWatcher';
import MobileAdminRadialMenu from './MobileAdminRadialMenu';
import { useRouteCleanup } from '@/lib/useRouteCleanup';

/**
 * `marco="modelo"` (bloque D de la 2.4): las pantallas de los cinco modelos no tenían
 * NINGÚN menú —su layout decía que «al acoplar se decide» y nunca se decidió—, así que la
 * cajera en Caja no tenía cómo llegar a Cobrar sin teclear la dirección. Entran con el
 * mismo menú por rol y plantilla, pero sin quitarles su marco: la barra empieza colapsada
 * a íconos, el contenido va sin relleno (cada modelo tiene su propia composición a sangre)
 * y en tableta y teléfono se deja el hueco de la hamburguesa para que no tape nada.
 */
export default function AppLayout({ marco = 'interno' }) {
  const deModelo = marco === 'modelo';
  const [collapsed, setCollapsed] = useState(deModelo);
  const { posUser, isLoading } = usePOSAuth();
  const navigate = useNavigate();
  // Libera body locks (overflow/pointer-events) si quedó algún portal pegado al cambiar de ruta.
  useRouteCleanup();

  React.useEffect(() => {
    if (!isLoading && !posUser) {
      navigate('/login-pos');
    }
  }, [posUser, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-borde border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!posUser) return null;

  return (
    <div className="flex relative" style={{ minHeight: '100dvh' }}>
      <BrandColorsApplier />
      <BrandedBackground />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main
        className={`flex-1 transition-all duration-300 ${collapsed ? 'lg:ml-16' : 'lg:ml-60'} relative z-10`}
        style={{ minHeight: '100dvh' }}
      >
        <div
          className={deModelo ? 'pt-14 lg:pt-0' : 'p-4 md:p-6 lg:p-8 pt-14 lg:pt-6'}
          style={{ minHeight: '100dvh' }}
        >
          <Outlet />
        </div>
      </main>
      <NotificationsWatcher />
      <SolicitudesQRWatcher />
      <PedidoListoWatcher />
      <MobileAdminRadialMenu />
    </div>
  );
}
