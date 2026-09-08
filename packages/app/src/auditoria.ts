import type { Ambito } from '@morphiqpos/contracts';

import type { RepositorioComandos } from './repositorio.ts';
import { payloadDeAuditoria } from './saneado.ts';

/**
 * La fila de auditoría que escribe el envoltorio.
 *
 * La regla que se olvida es la de DÓNDE:
 *
 *   · El rastro de un ÉXITO va **dentro** de la transacción del comando. Si el
 *     cobro se revierte, su rastro se revierte con él; una auditoría que dice
 *     que se cobró algo que no se cobró es peor que no tenerla.
 *
 *   · El rastro de un RECHAZO va **fuera**, en su propia transacción. Tiene que
 *     sobrevivir precisamente a la reversión que lo causó: si fuera dentro, un
 *     intento denegado no dejaría huella, que es justo lo que hay que poder
 *     revisar después.
 */

export interface Rechazo {
  readonly resultado: 'denegado' | 'conflicto' | 'error';
}

/**
 * Lo minimo que la auditoria necesita de la definicion del comando.
 *
 * Se pide asi, y no la `DefinicionComando` entera, porque arrastrar sus dos
 * genericos —el esquema de entrada y el tipo de salida— hasta aqui obligaria a
 * repetirlos en cada firma para leer dos cadenas.
 */
export interface Identificacion {
  readonly nombre: string;
  readonly entidad: string;
}

export interface DatosAuditoria {
  readonly definicion: Identificacion;
  readonly ambito: Ambito;
  readonly correlationId: string;
  readonly entidadId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Escribe una fila. `tx` nulo significa transacción autónoma.
 *
 * Un fallo escribiendo la auditoría de un RECHAZO no puede tumbar la respuesta:
 * el cliente ya recibió su 403 y el problema es de observabilidad, no suyo. Se
 * traga a propósito y queda dicho aquí — no es un `catch` vacío de los que R12
 * prohíbe, es una decisión con su razón escrita.
 *
 * Un fallo escribiendo la auditoría de un ÉXITO sí revienta la transacción, y
 * debe: la auditoría es uno de los efectos que P0-03 exige atómicos.
 */
export async function auditar<TX>(
  repositorio: RepositorioComandos<TX>,
  tx: TX | null,
  datos: DatosAuditoria,
): Promise<void> {
  const { definicion, ambito, correlationId, entidadId } = datos;

  const fila = {
    organizacionId: ambito.organizacionId,
    identidadId: ambito.identidadId,
    terminalId: ambito.terminalId,
    accion: definicion.nombre,
    entidad: definicion.entidad,
    entidadId,
    correlationId,
    payload: payloadDeAuditoria({
      v: 1,
      comando: definicion.nombre,
      rol: ambito.rol,
      empleoId: ambito.empleoId,
      sucursalId: ambito.sucursalId,
      ...datos.payload,
    }),
  };

  if (tx !== null) {
    await repositorio.escribirAuditoria(tx, fila);
    return;
  }

  try {
    await repositorio.escribirAuditoria(null, fila);
  } catch (error) {
    // Ver el comentario de arriba: el rechazo ya está decidido y respondido.
    // Se registra por consola de servidor para no perderlo del todo.
    console.error(
      `[auditoria] no se pudo registrar el rechazo de ${definicion.nombre} ` +
        `(correlationId ${correlationId}):`,
      error,
    );
  }
}
