import 'server-only';

/**
 * Un reintento, y sólo para LECTURAS, cuando lo que se cayó fue la conexión.
 *
 * ── Lo que pasó ────────────────────────────────────────────────────────────
 * Con la `DATABASE_URL` en el pooler de Supabase en modo TRANSACCIÓN (puerto
 * 6543), una corrida de navegador dejaba diez `ECONNRESET` en
 * `/api/datos/consultar`: la pantalla cargaba y sus datos devolvían 500.
 * Supavisor recicla las conexiones de cliente por su cuenta, y cuando cierra una
 * que `pg` cree viva, la consulta muere en el socket.
 *
 * Bajar el tiempo de reposo del pool por debajo del suyo y encender `keepAlive`
 * llevó los diez a dos: los que quedan son el primer uso de una conexión recién
 * abierta, y ahí no hay ajuste que los evite — la conexión se abre y el pooler la
 * tira en el mismo instante.
 *
 * ── Por qué SÓLO lecturas, y esto no es negociable ─────────────────────────
 * Un `ECONNRESET` no dice si la sentencia llegó a ejecutarse. Reintentar una
 * ESCRITURA sobre esa duda es cobrar dos veces: la primera pudo confirmarse y la
 * respuesta perderse en el camino. Para eso está la clave de idempotencia, que es
 * la respuesta correcta a esta pregunta y la que el envoltorio `comando()` exige
 * en cada escritura.
 *
 * Una lectura no tiene ese problema: o trajo filas o no trajo nada, y volver a
 * preguntar da lo mismo.
 *
 * ── Y por qué UNO, y no tres con espera creciente ──────────────────────────
 * Porque lo que esto cubre es una conexión muerta, no una base caída. Con la
 * conexión mala descartada, el segundo intento toma otra y funciona. Si la base
 * de verdad no está, tres intentos con espera sólo convierten un 500 rápido en un
 * 500 lento — y un cajero no puede esperar (R12).
 */

/**
 * Los fallos que son de la CONEXIÓN y no de la consulta.
 *
 * `ECONNRESET` es el que se vio. Los otros tres son la misma familia y los emite
 * `pg` con su propio texto, sin código: una conexión que se terminó antes de
 * responder, una que se cerró mientras se pedía, y el socket caído.
 */
const DE_LA_CONEXION = [
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'Connection terminated unexpectedly',
  'Client has encountered a connection error',
  'terminating connection due to administrator command',
];

export function esFalloDeConexion(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const codigo = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const mensaje = error instanceof Error ? error.message : '';
  return DE_LA_CONEXION.some((forma) => codigo === forma || mensaje.includes(forma));
}

/**
 * Corre una LECTURA y, si lo que falló fue la conexión, la repite UNA vez.
 *
 * Cualquier otro error se propaga tal cual: un `check` violado, un permiso o una
 * consulta mal escrita no mejoran repitiéndose, y taparlos con un reintento
 * esconde el defecto detrás de una latencia.
 */
export async function leyendoConReintento<T>(lectura: () => Promise<T>): Promise<T> {
  try {
    return await lectura();
  } catch (error) {
    if (!esFalloDeConexion(error)) throw error;
    // El pool ya descartó la conexión mala al emitir el error; el segundo intento
    // toma otra. No se espera: esperar no resucita un socket cerrado.
    return await lectura();
  }
}
