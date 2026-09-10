import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import type { z } from 'zod';

import { esViolacionDeUnicidad } from './datos.ts';
import type { entradaAbrirMesa } from './esquemas.ts';

/**
 * Las escrituras de `abrir_mesa` y `liberar_mesa`.
 *
 * Viven aparte de los comandos para que en `mesas.ts` se lea la REGLA —que sólo
 * una mesa libre se abre, que una cuenta sin cobrar no se libera— sin que la
 * tape el SQL que la cumple.
 */

/** Los índices que la base puede hacer saltar al abrir una mesa (F1-04 §35.5). */
const INDICES_DE_MESA_OCUPADA = ['ordenes_una_activa_por_mesa', 'mesas_una_orden_activa'] as const;

/** Los estados de orden desde los que la cuenta ya no se debe (F1-04 §6.6). */
export const ORDEN_YA_CERRADA = ['pagada', 'cancelada'] as const;

interface DatosDeApertura {
  readonly organizacionId: string;
  readonly sucursalId: string;
  readonly terminalId: string | null;
  readonly empleoId: string;
  readonly mesaId: string;
  readonly entrada: z.infer<typeof entradaAbrirMesa>;
}

export async function crearOrdenDeMesa(tx: Transaccion, datos: DatosDeApertura): Promise<string> {
  const { entrada } = datos;
  try {
    const fila = await tx
      .insertInto('ordenes')
      .values({
        organizacion_id: datos.organizacionId,
        sucursal_id: datos.sucursalId,
        terminal_id: datos.terminalId,
        mesa_id: datos.mesaId,
        empleado_atiende_id: datos.empleoId,
        estado: 'borrador',
        // Los dos ejes de F1-04 §6.5: por dónde entró y cómo se entrega.
        estrategia_captura: 'mesa',
        estrategia_cumplimiento: 'preparacion',
        personas: entrada.personas,
        cliente_nombre: vacioANulo(entrada.clienteNombre),
        notas: vacioANulo(entrada.notas),
        notas_alergias: vacioANulo(entrada.notasAlergias),
        celebracion_especial: entrada.celebracionEspecial,
        tipo_celebracion: entrada.celebracionEspecial ? vacioANulo(entrada.tipoCelebracion) : null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return fila.id;
  } catch (error) {
    // Dos meseros abriendo la misma mesa a la vez: el segundo INSERT choca con
    // `ordenes_una_activa_por_mesa`. Traducirlo es lo que hace que al mesero le
    // llegue «esa mesa ya está abierta» y no un 500 sin explicación.
    if (esViolacionDeUnicidad(error, INDICES_DE_MESA_OCUPADA)) {
      throw new ErrorDominio(
        'MESA_YA_ABIERTA',
        'Esa mesa ya está abierta: alguien se te adelantó por un segundo. Ábrela desde su cuenta.',
      );
    }
    throw error;
  }
}

interface DatosDeAtadura {
  readonly organizacionId: string;
  readonly mesaId: string;
  readonly ordenId: string;
  readonly empleoId: string;
  readonly tomarLaAtencion: boolean;
  readonly entrada: z.infer<typeof entradaAbrirMesa>;
}

export async function atarMesaAOrden(tx: Transaccion, datos: DatosDeAtadura): Promise<void> {
  const { entrada } = datos;
  const resultado = await tx
    .updateTable('mesas')
    .set({
      estado: 'esperando_orden',
      orden_activa_id: datos.ordenId,
      personas_actuales: entrada.personas,
      cliente_temporal: vacioANulo(entrada.clienteNombre),
      notas_alergias: vacioANulo(entrada.notasAlergias),
      celebracion_especial: entrada.celebracionEspecial,
      tipo_celebracion: entrada.celebracionEspecial ? vacioANulo(entrada.tipoCelebracion) : null,
      ...(datos.tomarLaAtencion ? { empleado_atiende_id: datos.empleoId } : {}),
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.mesaId)
    // El `where` no es decoración: es lo que hace que dos aperturas concurrentes
    // no se pisen. La segunda actualiza cero filas y revierte su transacción.
    .where('estado', '=', 'libre')
    .where('orden_activa_id', 'is', null)
    .executeTakeFirst();

  if (Number(resultado.numUpdatedRows) !== 1) {
    throw new ErrorDominio(
      'MESA_YA_ABIERTA',
      'Esa mesa dejó de estar libre mientras se abría. Vuelve a intentarlo.',
    );
  }
}

/** ¿Consumió algo esta cuenta? Una fila basta: no hace falta contarlas todas. */
export async function tieneLineas(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
): Promise<boolean> {
  const fila = await tx
    .selectFrom('orden_lineas')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('orden_id', '=', ordenId)
    .limit(1)
    .executeTakeFirst();

  return fila !== undefined;
}

export interface DatosDeCancelacion {
  readonly organizacionId: string;
  readonly ordenId: string;
  /** Va a `motivo_cancelacion`: el `check` lo exige y el corte lo lee. */
  readonly motivo: string;
  readonly empleoId: string;
  readonly ahora: Date;
}

/**
 * Cierra la orden como `cancelada`. Devuelve cuántas filas cambió.
 *
 * Devuelve el número en vez de lanzar porque los dos que la usan fallan con
 * códigos distintos: liberar una mesa que cambió es `MESA_NO_LIBERABLE`, y
 * cancelar una cuenta que otro acaba de cobrar es `ORDEN_NO_EDITABLE`. Cero
 * filas significa siempre lo mismo —alguien la cerró primero— pero no significa
 * lo mismo para quien está mirando la pantalla.
 *
 * El `where estado not in ('pagada','cancelada')` es lo que hace que cancelar y
 * cobrar a la vez no se pisen: el segundo cambia cero filas y revierte.
 */
export async function cerrarOrdenCancelada(
  tx: Transaccion,
  datos: DatosDeCancelacion,
): Promise<number> {
  const resultado = await tx
    .updateTable('ordenes')
    .set({
      estado: 'cancelada',
      // Los `check` de la tabla exigen las columnas juntas:
      // `orden_cancelada_con_motivo` y `orden_cerrada_con_fecha`.
      motivo_cancelacion: datos.motivo,
      cancelada_en: datos.ahora,
      cancelada_por: datos.empleoId,
      cerrada_en: datos.ahora,
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.ordenId)
    .where('estado', 'not in', [...ORDEN_YA_CERRADA])
    .executeTakeFirst();

  return Number(resultado.numUpdatedRows);
}

export async function cancelarOrdenVacia(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
  empleoId: string,
  ahora: Date,
): Promise<void> {
  const filas = await cerrarOrdenCancelada(tx, {
    organizacionId,
    ordenId,
    motivo: 'Mesa liberada sin consumo',
    empleoId,
    ahora,
  });

  if (filas !== 1) {
    throw new ErrorDominio(
      'MESA_NO_LIBERABLE',
      'La cuenta de esa mesa cambió mientras se liberaba. Vuelve a intentarlo.',
    );
  }
}

export async function limpiarMesa(
  tx: Transaccion,
  organizacionId: string,
  mesaId: string,
): Promise<void> {
  await tx
    .updateTable('mesas')
    .set({
      estado: 'libre',
      orden_activa_id: null,
      personas_actuales: 0,
      cliente_temporal: null,
      // Datos del comensal anterior: se van con él (`Mesero.jsx:234-241`).
      notas_alergias: null,
      celebracion_especial: false,
      tipo_celebracion: null,
      // `empleado_asignado_id` NO se toca: la asignación de mesero es
      // configuración de la sala, no del comensal que acaba de irse.
      empleado_atiende_id: null,
    })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', mesaId)
    .execute();
}

/** El frontend manda cadenas vacías donde la base quiere `null` (F1-04 §0.1). */
function vacioANulo(valor: string | undefined): string | null {
  if (valor === undefined) return null;
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}
