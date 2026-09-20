import { etiquetasDeProducto } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-058 · Aqui la etiqueta no es comodidad: es requisito de operacion.
 *
 * La mitad del catalogo no trae codigo de fabrica, y sin etiqueta impresa esa
 * mitad jamas se puede escanear -ni en la venta ni en el conteo-. Y son DOS
 * etiquetas: la de anaquel la lee el cliente a 30 cm; la de gaveta la lee el
 * empleado desde un metro, y lleva la UBICACION.
 *
 * Devuelve renglones, no un PDF: el papel lo compone el navegador, que es quien
 * sabe que hoja hay puesta.
 */
export const POST = manejadorDeComando(etiquetasDeProducto);

export const runtime = 'nodejs';
