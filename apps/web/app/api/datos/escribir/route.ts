import { escribirDatos } from '@morphiqpos/app/puente-comandos';

import { ejecutarComandoHttp } from '~/servidor/http';

/**
 * El puente de ESCRITURA (E3-4).
 *
 * Sólo catálogo, y aun así pasa por el envoltorio `comando()`: rol comprobado
 * en el servidor, transacción, clave de idempotencia y auditoría. Las catorce
 * operaciones transaccionales tienen su comando dedicado y este camino las
 * rechaza por nombre.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(peticion: Request): Promise<Response> {
  return ejecutarComandoHttp(escribirDatos, peticion);
}
