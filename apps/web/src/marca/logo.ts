/**
 * EL ÚNICO PUNTO DONDE VA EL LOGO OFICIAL DE MORPHIQ.
 *
 * ── Estado de hoy (21-10-2026) ────────────────────────────────────────────
 * El logo oficial que entregó Miguel (`LOGOS MORPHIQ/LOGO.png`, isotipo «MH» azul y negro) va
 * recortado a 256 px con su transparencia en `apps/web/public/marca/morphiq-logo.png`; el
 * wordmark completo, en `morphiq-wordmark.webp`/`.png`. PNG y no WebP para el isotipo: html2canvas
 * lo pinta igual en todos los navegadores al hacer el PDF de un ticket o un corte.
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
export const RUTA_DEL_LOGO_OFICIAL = '/marca/morphiq-logo.png' as string | null;

/** El logo por omisión como lo espera la configuración heredada: texto vacío si no hay. */
export const LOGO_POR_OMISION: string = RUTA_DEL_LOGO_OFICIAL ?? '';
