import { ajustarConteo } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-149 · El cierre de la zona contada, en un viaje.
 *
 * La pantalla del conteo publicaba aquí y **esto no existía**: veinte minutos de
 * recorrido con el teléfono en la mano acababan en el error genérico, y lo contado
 * se perdía al recargar.
 *
 * Un viaje y no treinta porque es la única pantalla del modelo hecha para el
 * teléfono —se cuenta de pie, frente al anaquel, a veces sin señal al fondo de la
 * bodega— y treinta peticiones son treinta ocasiones de perder el trabajo hecho.
 * La transacción escribe todo o nada.
 */
export const POST = manejadorDeComando(ajustarConteo);

export const runtime = 'nodejs';
