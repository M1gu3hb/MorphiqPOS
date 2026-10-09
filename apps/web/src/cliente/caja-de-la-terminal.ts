import { consultarPuente, invocarComando } from '~/cliente/api';

/**
 * LA CAJA DE ESTA TERMINAL, no «la primera caja abierta del negocio» (bloque D de la 2.4).
 *
 * El cobro y el cierre de la cafetería, y el cierre diario del restaurante, leían `CorteCaja`
 * y se quedaban con la primera fila abierta. Con UNA caja daba lo mismo; con dos a la vez
 * —la segunda caja del fin de semana (F-235)— Diana abría «Cierre de turno» y la pantalla le
 * enseñaba el turno de Fernanda: su nombre, su fondo y la hoja de SU corte. El servidor
 * cerraba bien —`caja.cerrar` cierra la de la terminal—, pero lo que Diana veía y contaba
 * era de otra caja.
 *
 * Quién es la caja de esta terminal lo sabe el servidor (`caja.estado`, que lee la sesión
 * abierta de la terminal firmada). De ahí sale el id, y el puente se consulta POR ese id.
 */

/** La caja como la sirve el puente (`CorteCaja`): lo que leen el cobro y los dos cierres. */
export interface FilaDeCaja {
  readonly id: string;
  readonly estado: string | null;
  readonly usuario_apertura_nombre: string | null;
  readonly fecha_apertura: string | null;
  readonly efectivo_inicial_contado: number | null;
}

interface EstadoDeLaTerminal {
  readonly abierta: boolean;
  readonly sesionCajaId: string | null;
}

/** `null` si esta terminal no tiene caja abierta. Un fallo de lectura se propaga: no es «cerrada». */
export async function cajaDeEstaTerminal(signal?: AbortSignal): Promise<FilaDeCaja | null> {
  const conSenal = signal === undefined ? {} : { signal };
  const estado = await invocarComando<EstadoDeLaTerminal>('/api/caja/estado', {}, conSenal);
  if (!estado.abierta || estado.sesionCajaId === null) return null;
  const filas = await consultarPuente<FilaDeCaja>('CorteCaja', {
    filtro: { id: estado.sesionCajaId },
    limite: 1,
    ...conSenal,
  });
  return filas.find((fila) => fila.estado === 'abierto') ?? null;
}
