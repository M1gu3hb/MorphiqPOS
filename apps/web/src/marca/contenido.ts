import { RUTA_DEL_LOGO_OFICIAL } from './logo';
import { MARCA_DE_PLATAFORMA, marcaVisibleDePlataforma } from './nombre-visible';

/**
 * QUÉ DICE Y CÓMO SE VE LA MARCA · la parte de `MarcaMorphiq` que no es JSX.
 *
 * Vive aparte para poder probarse: las pruebas de `apps/web` corren sin transformar JSX, y la
 * decisión de «¿logo o palabra?» y las clases de cada variante son justo lo que se rompe en
 * silencio —un ticket con un color propio, un logo que sustituye la marca de un negocio—.
 */

export type VarianteDeMarca = 'acceso' | 'ticket' | 'documento' | 'portal';

/** Lo que la marca pinta: el logo oficial (un archivo) o, mientras no haya, la palabra. */
export type ContenidoDeLaMarca =
  | { readonly tipo: 'logo'; readonly src: string; readonly alt: string }
  | { readonly tipo: 'texto'; readonly texto: string };

/**
 * El logo oficial sólo sustituye a la palabra de la propia plataforma: un negocio que firmó
 * con su marca no va a ver aparecer la de Morphiq encima. `rutaDelLogo` es un parámetro para
 * poder probar el caso «ya hay logo» sin tocar la constante del repositorio.
 */
export function contenidoDeLaMarca(
  nombre: string | null | undefined,
  rutaDelLogo: string | null = RUTA_DEL_LOGO_OFICIAL,
): ContenidoDeLaMarca {
  const texto = marcaVisibleDePlataforma(nombre);
  if (rutaDelLogo !== null && texto === MARCA_DE_PLATAFORMA) {
    return { tipo: 'logo', src: rutaDelLogo, alt: MARCA_DE_PLATAFORMA };
  }
  return { tipo: 'texto', texto };
}

/**
 * Cómo se pinta cada variante. Todo en tokens: ni un tamaño ni un color literal
 * (`verify:primitivas`).
 *
 * El color: `acceso` lleva el suyo, fijo en el texto-sobre-primario, porque esa pantalla es
 * oscura en los ocho estilos y los dos modos. Las demás HEREDAN el del documento: un ticket
 * imprime en negro y un PDF en el color de su hoja.
 */
export const ESTILO_DE_LA_VARIANTE: Readonly<Record<VarianteDeMarca, string>> = {
  acceso:
    'mt-(--espacio-6) flex items-center justify-center gap-(--espacio-3) text-primario-texto/50',
  ticket: 'inline-block text-xs font-semibold tracking-wide opacity-70',
  documento: 'inline-block text-xs font-semibold tracking-widest uppercase opacity-70',
  portal:
    'mx-auto flex items-center justify-center gap-(--espacio-2) py-(--espacio-6) text-xs text-texto-tenue',
};

/** La palabra, con la tipografía de encabezado del sistema. */
export const ESTILO_DE_LA_PALABRA = 'font-heading font-extrabold tracking-widest uppercase';
