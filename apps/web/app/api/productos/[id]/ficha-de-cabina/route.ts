import { guardarFichaDeCabina } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * Guarda la FICHA DE CABINA de un producto (destino, rendimiento y unidad).
 *
 * El comando existe desde hoy porque no existía: la pantalla de Productos del
 * salón publicaba en `catalogo.actualizar_producto`, que no acepta esos tres
 * campos y exige seis que la pantalla no manda, así que cada guardado moría con
 * `ENTRADA_INVALIDA`.
 *
 * El identificador viaja EN LA RUTA y se mete en el cuerpo antes de validar,
 * igual que en `abrir`.
 */
export const POST = manejadorDeComandoConParametro(guardarFichaDeCabina, 'productoId');

export const runtime = 'nodejs';
