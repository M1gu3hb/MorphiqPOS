import POSLogin from '@/mh/pages/POSLogin';

/**
 * Su pantalla de acceso, en la ruta que ella misma usaba: `/login-pos`.
 *
 * `force-dynamic` porque la lista de empleados y la sesión salen del servidor
 * en cada visita: una versión prerenderizada enseñaría la plantilla de ayer.
 */
export const dynamic = 'force-dynamic';

export default function PaginaLoginPos() {
  return <POSLogin />;
}
