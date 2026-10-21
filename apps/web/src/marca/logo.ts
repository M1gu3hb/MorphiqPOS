/**
 * EL ÚNICO PUNTO DONDE VA EL LOGO OFICIAL DE MORPHIQ.
 *
 * ── Estado de hoy ─────────────────────────────────────────────────────────
 * En el repositorio NO hay un logo oficial de Morphiq: `apps/web/public/icono.svg` es un
 * monograma «M» de marcador para la pestaña del navegador, no una marca entregada. Por eso
 * este valor es `null` y `MarcaMorphiq` pinta la palabra «Morphiq» en texto. Dibujar aquí
 * un logo inventado y presentarlo como el oficial sería peor que no tenerlo.
 *
 * ── Cómo se pone el oficial (dos pasos, nada más) ─────────────────────────
 *   1 · Copiar el archivo a `apps/web/public/marca/morphiq-logo.svg` (o `.png`).
 *   2 · Cambiar `null` por `'/marca/morphiq-logo.svg'` en la constante de abajo.
 *
 * Con eso aparece solo, sin tocar ninguna pantalla:
 *   · en `MarcaMorphiq` (firma de la pantalla de acceso, de los tickets y PDFs y del portal);
 *   · como logo por omisión de un negocio que no subió el suyo (`MH_LOGO_URL` de
 *     `heredado/lib/ConfigContext.jsx` sale de aquí): sidebar, acceso, tickets y PDFs.
 *
 * Una ruta que empieza por `/` se sirve desde `apps/web/public`, que la CSP permite
 * (`img-src 'self'`). No va una URL de otro origen: la CSP la bloquearía.
 */
export const RUTA_DEL_LOGO_OFICIAL = null as string | null;

/** El logo por omisión como lo espera la configuración heredada: texto vacío si no hay. */
export const LOGO_POR_OMISION: string = RUTA_DEL_LOGO_OFICIAL ?? '';
