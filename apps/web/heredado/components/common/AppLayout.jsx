'use client';
import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from '@/enrutado';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { NAV_ITEMS, hasPermission } from '@/lib/permissions';
import { inicioDeLaSesion } from '@/lib/packageConfig';
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
  const [collapsed, setCollapsed] = useState(false);
  const { posUser, isLoading } = usePOSAuth();
  const navigate = useNavigate();
  // Libera body locks (overflow/pointer-events) si quedó algún portal pegado al cambiar de ruta.
  useRouteCleanup();

  React.useEffect(() => {
    if (!isLoading && !posUser) {
      navigate('/login-pos', { replace: true });
    }
  }, [posUser, isLoading, navigate]);

  /**
   * LA PANTALLA DE OTRO PUESTO NO SE PINTA (restaurante, 20-10-2026).
   *
   * El menú sólo enseña lo de cada rol, pero la ruta se podía teclear —o llegar por un
   * `<Navigate to="/">` como el de Recetas—: la cajera en `/` veía el tablero de la dueña
   * con sus lecturas en 403 y cifras en cero, y la mesera en `/caja` la pantalla de cobro.
   * El servidor ya negaba los datos y las escrituras; esto la lleva a SU inicio, el mismo
   * que abre al entrar con el PIN. Sólo mira las rutas del menú que piden un permiso: las
   * demás (la venta de mostrador, la presentación) siguen como estaban.
   */
  const { pathname } = useLocation();
  // Mientras la configuración carga, `paquete_modo` es el de omisión (`tienda`): decidir el
  // inicio con él mandaba a la mesera a la pantalla de mesas de la tienda. Se espera.
  const { paquete_modo, isLoading: cargandoConfig } = useConfig();
  const rutaAjena =
    !!posUser &&
    NAV_ITEMS.some(
      (item) =>
        item.path === pathname && item.permission && !hasPermission(posUser.rol, item.permission),
    );
  React.useEffect(() => {
    if (!rutaAjena || cargandoConfig) return;
    navigate(inicioDeLaSesion(posUser.rol, paquete_modo, hasPermission), { replace: true });
  }, [rutaAjena, cargandoConfig, posUser, paquete_modo, navigate]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-borde border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!posUser) return null;
  if (rutaAjena) return null;

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
