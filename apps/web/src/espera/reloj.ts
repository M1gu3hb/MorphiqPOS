/**
 * LA HORA DEL MODO ESPERA (DP-11.2). Puro.
 *
 * Va en la zona del NEGOCIO (`America/Mexico_City` en Don Poncho), no en la del aparato: una
 * tableta mal configurada no puede decirle a la caja otra hora. Hora de 12, como se dice en el
 * local, y la fecha en palabras.
 */
export function horaYFecha(
  fecha: Date,
  zona: string,
): { readonly hora: string; readonly meridiano: string; readonly fecha: string } {
  const partes = new Intl.DateTimeFormat('es-MX', {
    timeZone: zona,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(fecha);
  const parte = (tipo: Intl.DateTimeFormatPartTypes): string =>
    partes.find((p) => p.type === tipo)?.value ?? '';
  const enPalabras = new Intl.DateTimeFormat('es-MX', {
    timeZone: zona,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(fecha);
  return {
    hora: `${parte('hour')}:${parte('minute')}`,
    meridiano: parte('dayPeriod').replace(/\s+/g, ' '),
    fecha: enPalabras,
  };
}

/**
 * CONTRA EL QUEMADO: la hora y el logo se desplazan muy despacio, en una curva cerrada (Lissajous)
 * que recorre su margen en unos cuarenta minutos y nunca brinca. `ms` es el tiempo dormido.
 */
export function desplazamientoContraQuemado(
  ms: number,
  margen: number,
): { readonly x: number; readonly y: number } {
  const t = ms / 60_000;
  return {
    x: Math.round(margen * Math.sin((2 * Math.PI * t) / 41) * 10) / 10,
    y: Math.round(margen * Math.sin((2 * Math.PI * t) / 29 + Math.PI / 3) * 10) / 10,
  };
}
