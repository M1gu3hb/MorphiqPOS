/**
 * IDS ÚNICOS PARA TENER VARIOS QR EN UNA PÁGINA.
 *
 * Un SVG en línea comparte el espacio de ids con toda la página: dos QR con degradado traen los
 * dos `id="qr-ink"`, y el segundo termina pintado con el degradado del primero. Esto les pone
 * un prefijo a todos los ids de un SVG y a las referencias `url(#...)` que apuntan a ellos.
 */

/** Un `id="..."` (no un `data-id="..."`) o un `url(#...)`. */
const ID_O_REFERENCIA = /(?<![\w-])id="([^"]+)"|url\(#([^)]+)\)/g;

/**
 * El mismo marcado con cada id (y cada `url(#id)` que lo use) convertido en `prefijo-id`. Sólo
 * se tocan las referencias a ids que el propio marcado define; una referencia suelta se deja
 * como está. Se hace en una sola pasada para que un id ya prefijado no vuelva a cambiar.
 *
 * @param prefijo único por SVG de la página; sólo letras, números, guiones y guiones bajos.
 */
export function prefijarIds(marcado: string, prefijo: string): string {
  if (!/^[A-Za-z][\w-]*$/.test(prefijo)) {
    throw new RangeError(
      `El prefijo «${prefijo}» no sirve para un id: empieza con letra y sigue con letras, números, - o _.`,
    );
  }
  const definidos = new Set(
    Array.from(marcado.matchAll(ID_O_REFERENCIA), (coincidencia) => coincidencia[1]).filter(
      (id): id is string => id !== undefined,
    ),
  );
  return marcado.replace(
    ID_O_REFERENCIA,
    (texto, id: string | undefined, referencia: string | undefined) => {
      if (id !== undefined) return `id="${prefijo}-${id}"`;
      if (referencia !== undefined && definidos.has(referencia))
        return `url(#${prefijo}-${referencia})`;
      return texto;
    },
  );
}
