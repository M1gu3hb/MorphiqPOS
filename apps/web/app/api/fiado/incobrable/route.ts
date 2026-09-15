import { fijarMuroDeCredito } from '@morphiqpos/app/cartera';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-617 · Marcar la cuenta como incobrable, que aquí es el muro.
 *
 * Es la misma decisión que `/api/credito/limite` con otro nombre: la pantalla de
 * la tiendita lo llama «ya no le fío» y la de la ferretería «bloqueo por mora».
 * Un comando, dos rutas, porque las dos pantallas existen y las dos palabras
 * también.
 */
export const POST = manejadorDeComando(fijarMuroDeCredito);

export const runtime = 'nodejs';
