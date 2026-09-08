import 'server-only';

/**
 * @morphiqpos/data — el UNICO lugar del monorepo que conoce SQL.
 *
 * En F1.0 esta vacio a proposito. Existe por dos razones:
 *
 *   1. `import 'server-only'` en la raiz del paquete hace que el build FALLE si
 *      alguien lo importa desde un componente de cliente. En la tiendita, 19 de
 *      22 repositorios corrian en el navegador; aqui ninguno puede.
 *   2. Es lo que hace ejecutable la meta-prueba de F1.0-T09: un import de este
 *      paquete desde `apps/web` tiene que hacer fallar el lint.
 *
 * El contenido real —pool de conexiones, `withTransaction`, repositorios y
 * migraciones— llega en F1.1, sobre Kysely (ADR 0001).
 */
export const PAQUETE = '@morphiqpos/data';
