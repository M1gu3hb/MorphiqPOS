import type { ImagenLogo } from '@morphiqpos/domain/qr';

/**
 * EL LOGO DEL NEGOCIO PARA EL CENTRO DEL QR (DP-9.8).
 *
 * El logo vive en el mismo sitio (`/marca/…` o una subida propia), así que se pide por su ruta al
 * origen de la pestaña —la política de contenido sólo deja hablar con el propio sitio— y se
 * incrusta como `data:` en el SVG: el QR exportado no depende de nada externo. Un SVG va como
 * imagen, nunca como marcado: dentro de una imagen no corre nada.
 */

const TIPOS = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
const CON_TRANSPARENCIA = new Set(['image/png', 'image/webp', 'image/gif', 'image/svg+xml']);

function comoDatos(blob: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      if (typeof lector.result === 'string') resolver(lector.result);
      else rechazar(new Error('No se pudo leer el logo.'));
    };
    lector.onerror = () => {
      rechazar(new Error('No se pudo leer el logo.'));
    };
    lector.readAsDataURL(blob);
  });
}

function medidas(datos: string): Promise<{ ancho: number; alto: number }> {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image();
    imagen.onload = () => {
      // Un SVG sin medidas propias da 0: se toma cuadrado, que es lo que pide la ventana.
      resolver({ ancho: imagen.naturalWidth || 1, alto: imagen.naturalHeight || 1 });
    };
    imagen.onerror = () => {
      rechazar(new Error('El logo no es una imagen que se pueda usar.'));
    };
    imagen.src = datos;
  });
}

/** El logo listo para el motor, o `null` si el negocio no tiene. Lanza si no se pudo cargar. */
export async function cargarLogoDelNegocio(
  url: string | null | undefined,
): Promise<ImagenLogo | null> {
  if (url === null || url === undefined || url.trim() === '') return null;
  const ruta = new URL(url, window.location.origin);
  const respuesta = await fetch(`${ruta.pathname}${ruta.search}`, { credentials: 'same-origin' });
  if (!respuesta.ok) throw new Error('No se pudo traer el logo del negocio.');
  const blob = await respuesta.blob();
  const tipo = blob.type.split(';')[0] ?? '';
  if (!TIPOS.includes(tipo)) throw new Error('El logo tiene que ser PNG, JPG, WebP, GIF o SVG.');
  const datos = await comoDatos(new Blob([blob], { type: tipo }));
  const { ancho, alto } = await medidas(datos);
  return { ancho, alto, datos, transparente: CON_TRANSPARENCIA.has(tipo) };
}
