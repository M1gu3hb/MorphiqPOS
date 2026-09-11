import { PantallaVenta } from '@/venta/PantallaVenta';

/**
 * `/venta` — la pantalla que usa el cajero todo el día (F1.1-A-10).
 *
 * Es un componente de cliente entero, y a propósito: el estado de la venta
 * cambia con cada tecla y no hay nada que prerenderizar. Los datos llegan por
 * las rutas de comando, que resuelven la sesión del lado del servidor.
 */
export default function PaginaVenta() {
  return <PantallaVenta />;
}
