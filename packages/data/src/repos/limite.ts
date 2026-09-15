import 'server-only';

import { sql } from 'kysely';

import { obtenerDb } from '../cliente.ts';
import { registrar } from '../observabilidad.ts';

/**
 * Contador de intentos por origen (F1.1-C-13).
 *
 * Una sola sentencia, no un `select` y luego un `update`: entre las dos habría
 * una ventana en la que veinte peticiones simultáneas leen «0 intentos» y todas
 * pasan. El `insert … on conflict do update` es atómico, y ahí es donde vive la
 * garantía.
 *
 * La ventana es deslizante por reinicio, no por deslizamiento real: al cruzarse
 * el plazo, el contador vuelve a empezar. Es menos preciso que un algoritmo de
 * ventana móvil y es lo correcto aquí — un atacante que espera el reinicio ha
 * gastado el minuto que se le quería costar, que es todo el objetivo.
 */

export interface ResultadoLimite {
  readonly intentos: number;
  /** Segundos que faltan para que la ventana se reinicie. */
  readonly esperaSegundos: number;
}

const FRECUENCIA_LIMPIEZA = 512;
const RETENCION_BASE_SEGUNDOS = 24 * 60 * 60;

export function debeLimpiarVencidos(valorAleatorio: number): boolean {
  return valorAleatorio >= 0 && valorAleatorio < 1 / FRECUENCIA_LIMPIEZA;
}

async function limpiarSiCorresponde(): Promise<void> {
  if (debeLimpiarVencidos(Math.random())) {
    try {
      // Se conservan cuatro días. Todas las ventanas actuales duran una hora
      // o menos, sin riesgo de borrar un contador que todavía está vigente.
      await limpiarVencidos(RETENCION_BASE_SEGUNDOS);
    } catch {
      // La conservación nunca invalida el intento que ya se contó.
      registrar({
        nivel: 'alerta',
        modulo: 'limite_tasa_purga',
        correlationId: 'sin_correlacion',
        organizacionId: null,
        mensaje: 'No se pudo ejecutar la purga de cuotas vencidas.',
      });
    }
  }
}

/**
 * Cuenta un intento y devuelve cuántos van en la ventana.
 *
 * @param clave       HMAC de `ip:acción`. Nunca la IP en claro.
 * @param ventanaSegundos  Cuánto dura la ventana.
 */
export async function contarIntento(
  clave: string,
  ventanaSegundos: number,
): Promise<ResultadoLimite> {
  const intervalo = sql<string>`make_interval(secs => ${ventanaSegundos})`;

  const fila = await sql<{ intentos: number; espera: number }>`
    insert into limite_tasa (clave, ventana_en, intentos)
    values (${clave}, now(), 1)
    on conflict (clave) do update set
      intentos = case
        when limite_tasa.ventana_en < now() - ${intervalo} then 1
        else limite_tasa.intentos + 1
      end,
      ventana_en = case
        when limite_tasa.ventana_en < now() - ${intervalo} then now()
        else limite_tasa.ventana_en
      end
    returning
      intentos,
      greatest(
        0,
        ceil(extract(epoch from (ventana_en + ${intervalo}) - now()))
      )::int as espera
  `.execute(obtenerDb());

  await limpiarSiCorresponde();

  const primera = fila.rows[0];
  // Un `returning` de un upsert siempre trae una fila. Si no la trae, algo
  // cambió bajo los pies y NO se deja pasar la petición: se cuenta como
  // agotado. Fallar cerrado, que es la regla de `morphiq-prs §07`.
  if (primera === undefined) {
    return { intentos: Number.MAX_SAFE_INTEGER, esperaSegundos: ventanaSegundos };
  }
  return { intentos: primera.intentos, esperaSegundos: primera.espera };
}

/**
 * Borra las ventanas ya vencidas.
 *
 * No corre sola: la llama el propio limitador de vez en cuando. Un `cron` para
 * esto sería una pieza más que mantener, y la tabla sólo crece con orígenes
 * distintos que han fallado — no con tráfico normal.
 */
export async function limpiarVencidos(ventanaSegundos: number): Promise<number> {
  const resultado = await obtenerDb()
    .deleteFrom('limite_tasa')
    .where('ventana_en', '<', sql<Date>`now() - make_interval(secs => ${ventanaSegundos} * 4)`)
    .executeTakeFirst();
  return Number(resultado.numDeletedRows);
}
