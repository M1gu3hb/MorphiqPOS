/**
 * LO QUE DICE LA CARGA LARGA (DP-11.1): «Cargando tu caja», «Cargando las mesas». Sale de la
 * pantalla a la que se va, así que el mesero no lee «Cargando tu negocio» al entrar.
 */
const TEXTOS: Readonly<Record<string, string>> = {
  '/': 'Cargando tu negocio',
  '/mesero': 'Cargando las mesas',
  '/caja': 'Cargando tu caja',
  '/cocina': 'Cargando la cocina',
  '/ventas': 'Cargando las ventas',
  '/inventario': 'Cargando el inventario',
  '/compras': 'Cargando las compras',
  '/recetas': 'Cargando las recetas',
  '/productos': 'Cargando los platillos',
  '/registros': 'Cargando los registros',
  '/portal-qr': 'Cargando el portal QR',
  '/configuracion': 'Cargando la configuración',
  '/pos': 'Cargando la venta',
  '/restaurante/cierre-diario-y-arqueo': 'Cargando el cierre del día',
};

export function textoDeCarga(ruta: string): string {
  const camino = ruta.split('?')[0] ?? '';
  const sinDiagonal = camino.length > 1 ? camino.replace(/\/+$/, '') : camino;
  return TEXTOS[sinDiagonal] ?? 'Cargando';
}
