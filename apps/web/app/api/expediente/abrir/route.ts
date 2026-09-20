import { abrirExpediente } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-434 · Abrir el expediente de una clienta que viene por primera vez.
 *
 * El comando existía desde la 132 y **no tenía ruta**: la pantalla del historial
 * publicaba en `/api/clientes/empezar-historial`, que no existe. Next la resolvía
 * a `clientes/[id]` con `clienteId = "empezar-historial"` —un uuid inventado— y la
 * respuesta no era `{ok, datos}`, así que el cliente pintaba «El servidor respondió
 * algo inesperado».
 *
 * Y no era un botón cualquiera: es el ÚNICO del estado vacío de esa pantalla, así
 * que **toda clienta nueva empieza ahí**. Sin esto, las tres respuestas que valen
 * más que media hora de memoria —cómo llegó, qué busca y sus alergias— no se podían
 * guardar por ninguna pantalla.
 */
export const POST = manejadorDeComando(abrirExpediente);

export const runtime = 'nodejs';
