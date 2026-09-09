'use client';
/**
 * Helper único para impresión.
 * Evita que el navegador imprima cabeceras/URL extras y separa los modos
 * de papel (térmico 80mm vs carta) usando el atributo data-print-mode
 * en <html>. El CSS en index.css se encarga del resto.
 */
export function printDocument({ mode = 'letter', title = 'Documento' } = {}) {
  const html = document.documentElement;
  const prevMode = html.getAttribute('data-print-mode');
  const prevTitle = document.title;

  html.setAttribute('data-print-mode', mode);
  document.title = title;

  const cleanup = () => {
    if (prevMode) html.setAttribute('data-print-mode', prevMode);
    else html.removeAttribute('data-print-mode');
    document.title = prevTitle;
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
