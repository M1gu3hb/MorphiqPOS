'use client';
/**
 * Helper único para impresión.
 * Evita que el navegador imprima cabeceras/URL extras y separa los modos
 * de papel (térmico 80mm vs carta) usando el atributo data-print-mode
 * en <html>. El CSS en index.css se encarga del resto.
 *
 * ── El tamaño de página, que antes no funcionaba ──────────────────────────
 * `index.css` intentaba fijarlo con
 * `html[data-print-mode='thermal'] @page { size: 80mm auto }`. Eso es CSS
 * inválido: `@page` es un contexto de página y no admite selector, así que el
 * navegador lo descartaba y el ticket térmico salía en tamaño carta.
 *
 * La única forma de cambiar `@page` según el modo es inyectar la regla a nivel
 * raíz justo antes de imprimir y quitarla después. Es lo que se hace aquí.
 */

/** El `@page` de cada modo. Es lo que el CSS no podía expresar. */
const PAGINA = {
  thermal: '@page { size: 80mm auto; margin: 4mm; }',
  letter: '@page { size: A4; margin: 12mm; }',
};

export function printDocument({ mode = 'letter', title = 'Documento' } = {}) {
  const html = document.documentElement;
  const prevMode = html.getAttribute('data-print-mode');
  const prevTitle = document.title;

  html.setAttribute('data-print-mode', mode);
  document.title = title;

  const hoja = document.createElement('style');
  hoja.setAttribute('data-pagina-de-impresion', mode);
  hoja.textContent = PAGINA[mode] ?? PAGINA.letter;
  document.head.appendChild(hoja);

  const cleanup = () => {
    if (prevMode) html.setAttribute('data-print-mode', prevMode);
    else html.removeAttribute('data-print-mode');
    document.title = prevTitle;
    hoja.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  // Pequeño delay para asegurar que los estilos aplicaron
  setTimeout(() => {
    window.print();
    // Fallback por si afterprint no dispara
    setTimeout(cleanup, 1500);
  }, 80);
}
