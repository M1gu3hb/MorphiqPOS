'use client';
import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from '@/enrutado';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { hasPermission } from '@/lib/permissions';
import { inicioDeLaSesion, rutaPermitidaParaElPuesto } from '@/lib/packageConfig';
import Sidebar from './Sidebar';
import BrandedBackground from './BrandedBackground';
import BrandColorsApplier from './BrandColorsApplier';
import NotificationsWatcher from './NotificationsWatcher';
import SolicitudesQRWatcher from './SolicitudesQRWatcher';
import PedidoListoWatcher from './PedidoListoWatcher';
import MobileAdminRadialMenu from './MobileAdminRadialMenu';
import { useRouteCleanup } from '@/lib/useRouteCleanup';
import { MorfiCargando } from '~/morfi/MorfiCargando';
import { textoDeCarga } from '~/morfi/textos-de-carga';

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
  // Plegada en las pantallas de modelo, como dice arriba. La fusión c1ada17 la dejó abierta
  // (`useState(false)`): con 240 px de barra, la nota de entrada de la tienda no cabía en la
  // tableta y su «Agregar canje» quedaba debajo de otros elementos.
  const [collapsed, setCollapsed] = useState(deModelo);
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
   * que abre al entrar con el PIN. Miraba sólo las rutas del menú, y `/pos` y las vistas del
   * restaurante se abrían desde cualquier puesto: la regla es ahora
   * `rutaPermitidaParaElPuesto`, con la misma tabla que pinta el menú (cierre del 21-10).
   */
  const { pathname } = useLocation();
  // Mientras la configuración carga, `paquete_modo` es el de omisión (`tienda`): decidir el
  // inicio con él mandaba a la mesera a la pantalla de mesas de la tienda. Se espera.
  const { paquete_modo, isLoading: cargandoConfig } = useConfig();
  // Una vista del restaurante se decide con el menú de SU plantilla: mientras carga, se espera.
  const esperandoPlantilla = cargandoConfig && pathname.startsWith('/restaurante/');
  const rutaAjena =
    !!posUser &&
    !esperandoPlantilla &&
    !rutaPermitidaParaElPuesto(pathname, posUser.rol, paquete_modo, hasPermission);
  React.useEffect(() => {
    if (!rutaAjena || cargandoConfig) return;
    navigate(inicioDeLaSesion(posUser.rol, paquete_modo, hasPermission), { replace: true });
  }, [rutaAjena, cargandoConfig, posUser, paquete_modo, navigate]);

  // DP-11.1: la carga larga del sistema (tarjeta que dice qué carga, con Morfi si el negocio
  // lo tiene encendido); nada se ve antes de 600 ms. Antes era un círculo girando suelto.
  if (isLoading || esperandoPlantilla) {
    return <MorfiCargando titulo={textoDeCarga(pathname)} />;
  }

  if (!posUser) return null;
  if (rutaAjena) return null;

  return (
    <div className="flex relative" style={{ minHeight: '100dvh' }}>
      <BrandColorsApplier />
      <BrandedBackground />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main
        // `min-w-0` (DP-11.1): un hijo de flex mide por omisión lo que su contenido más ancho, y en el
        // teléfono una fila que no se encoge estiraba la página a lo ancho (Configuración: 543 de 412).
        className={`min-w-0 flex-1 transition-all duration-300 ${collapsed ? 'lg:ml-16' : 'lg:ml-60'} relative z-10`}
        style={{ minHeight: '100dvh' }}
      >
        <div
          className={deModelo ? 'pt-14 lg:pt-0' : 'p-4 md:p-6 lg:p-8 pt-14 md:pt-14 lg:pt-6'}
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
