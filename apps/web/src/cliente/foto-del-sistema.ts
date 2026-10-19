/**
 * ¿ES UNA FOTO DEL SISTEMA? (auditoría de la 2.4)
 *
 * Una galería que abre `href={foto.url}` con un toque abre lo que haya guardado: hasta
 * la 2.4 los comandos aceptaban cualquier URL, así que puede haber filas viejas con
 * `javascript:` o una página ajena. El servidor ya sólo acepta archivos del negocio;
 * esto es la segunda mitad, en la pantalla: sólo se pinta —y se enlaza— lo que es http(s)
 * y vive bajo `/api/archivos/`.
 */
export function esFotoDelSistema(url: string, base: string): boolean {
  let leida: URL;
  try {
    leida = new URL(url, base);
  } catch {
    return false;
  }
  return (
    (leida.protocol === 'https:' || leida.protocol === 'http:') &&
    leida.pathname.startsWith('/api/archivos/')
  );
}
