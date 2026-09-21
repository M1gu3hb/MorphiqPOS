import { PaginaDelSistema } from '~/sistema/PaginaDelSistema';

/**
 * La página viva del sistema de diseño.
 *
 * Va FUERA de `(interno)` y de `(modelos)` a propósito: no es una pantalla de un
 * negocio —no lee datos de nadie ni necesita sesión— y ninguno de los dos marcos le
 * sirve. Es donde se ve el lenguaje entero con el estilo y las cuatro perillas
 * cambiando en vivo, que es lo que Miguel enseña delante de un prospecto.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`, donde
 * el verificador de primitivas sí vigila los literales.
 */
export default function Pagina() {
  return <PaginaDelSistema />;
}
