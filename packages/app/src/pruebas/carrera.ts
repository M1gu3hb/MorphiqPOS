/**
 * Carreras DE VERDAD contra Postgres: las dos transacciones se cruzan siempre, no cuando
 * hay suerte (bloque D.9 de la 2.4).
 *
 * ── El problema de un `Promise.all` pelado ────────────────────────────────
 * Lanza los dos comandos a la vez, pero no garantiza que se CRUCEN: si el primero
 * confirma antes de que el segundo lea, el segundo ve la escritura, se rechaza por la
 * comprobación de toda la vida, y la prueba sale verde aunque el código no tenga ningún
 * candado. Es una prueba de concurrencia que sólo prueba concurrencia cuando el
 * planificador quiere, y una mutación que QUITA el candado puede salir verde por el
 * mismo azar —que es la peor forma de que una puerta mienta—.
 *
 * ── La barrera ────────────────────────────────────────────────────────────
 * Una transacción de la prueba toma antes un candado que las corredoras tienen que pasar
 * DESPUÉS de leer y ANTES de escribir: la fila de la orden, la de la existencia, la del
 * folio, la tabla de las sesiones. Las corredoras leen, llegan al candado y se forman.
 * Cuando `pg_stat_activity` enseña a todas esperando, la prueba confirma y las suelta
 * juntas: lo que pasa a partir de ahí es exactamente la carrera que el código tiene que
 * resolver, con las dos lecturas ya hechas.
 *
 * El candado se elige para que NO sea la guarda que se prueba. Si la barrera fuera el
 * mismo `for update` que protege el cobro, quitarlo en una mutación quitaría también la
 * barrera y la prueba volvería a depender del azar.
 *
 * ── Y no es un `sleep` ────────────────────────────────────────────────────
 * `13-PRUEBAS §2` prohíbe esperar a ciegas. Aquí no se espera un tiempo: se OBSERVA en
 * Postgres que las transacciones están formadas, y el intervalo sólo espacia las
 * preguntas. Si no se forman en el plazo, la prueba falla diciendo cuántas llegaron.
 */
import { conTransaccion, obtenerDb, type Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

/** Entre pregunta y pregunta a `pg_stat_activity`. No decide nada: sólo las espacia. */
const INTERVALO_MS = 10;
/** Si en esto no se formaron, algo las detuvo antes del candado: no van a llegar. */
const PLAZO_MS = 10_000;

/** Cuántas conexiones de ESTA base están esperando un candado ahora mismo. */
export async function formadasEnUnCandado(): Promise<number> {
  const { rows } = await sql<{ n: number }>`
    select count(*)::int as n
      from pg_stat_activity
     where datname = current_database()
       and wait_event_type = 'Lock'
  `.execute(obtenerDb());
  return rows[0]?.n ?? 0;
}

async function esperarFormadas(cuantas: number): Promise<void> {
  const limite = Date.now() + PLAZO_MS;
  let vistas = await formadasEnUnCandado();
  while (vistas < cuantas) {
    if (Date.now() > limite) {
      throw new Error(
        `La barrera esperaba ${cuantas} transacciones formadas en su candado y llegaron ${vistas}: ` +
          'algo las detuvo antes, o el candado no es el que tienen que pasar.',
      );
    }
    await new Promise((listo) => setTimeout(listo, INTERVALO_MS));
    vistas = await formadasEnUnCandado();
  }
}

/**
 * Corre las `corredoras` a la vez, con la barrera puesta por `candado`, y devuelve lo que
 * devolvió cada una en su orden.
 *
 * `candado` recibe la transacción de la prueba y toma ahí el bloqueo; se libera al
 * confirmarla, cuando todas están formadas. Las corredoras se lanzan DENTRO de esa
 * transacción —con el candado ya tomado— y cada una abre su propia conexión del pool,
 * así que de verdad son transacciones distintas en paralelo.
 */
export async function enCarrera<T>(
  candado: (tx: Transaccion) => Promise<unknown>,
  corredoras: readonly (() => Promise<T>)[],
): Promise<T[]> {
  // `allSettled` desde el primer instante: si una corredora se cae mientras la barrera
  // todavía mira, su rechazo ya tiene quien lo atienda y no sale como «sin manejar».
  let resultados: Promise<PromiseSettledResult<T>[]> = Promise.resolve([]);
  try {
    await conTransaccion(async (tx) => {
      await candado(tx);
      resultados = Promise.allSettled(corredoras.map((correr) => correr()));
      await esperarFormadas(corredoras.length);
    });
  } catch (error) {
    // La barrera falló y su transacción se revirtió: las corredoras ya van sueltas. Se
    // espera a que terminen para no dejar conexiones a medias en el pool.
    await resultados;
    throw error;
  }
  return (await resultados).map((resultado) => {
    if (resultado.status === 'fulfilled') return resultado.value;
    throw resultado.reason instanceof Error
      ? resultado.reason
      : new Error('Una corredora se cayó sin un Error.');
  });
}
