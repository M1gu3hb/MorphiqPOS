import { detenerPostgres, prepararPostgres } from '@morphiqpos/testing/postgres';

/**
 * Levanta la base antes de la suite de integracion y la apaga al terminar.
 *
 * Si no hay base, esto LANZA. No se saltan las pruebas: una suite verde sin las
 * de integracion da una seguridad que no existe (13-PRUEBAS §2).
 */
export async function setup(): Promise<void> {
  const url = await prepararPostgres();
  process.env['DATABASE_URL'] = url;
  console.warn(`  base de pruebas lista en ${url.replace(/:[^:@]+@/, ':***@')}`);
}

export function teardown(): void {
  detenerPostgres();
}
