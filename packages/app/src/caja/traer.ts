import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { repoCaja } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { violaIndice } from '../portal/errores-sql.ts';

/**
 * TRAER LA CAJA A ESTE DISPOSITIVO (restaurante, 21-10-2026).
 *
 * ── El hueco, como lo vivió el dueño ────────────────────────────────────────
 * La caja es de una TERMINAL, y la terminal es la cookie de un navegador. Abrió la caja
 * anoche en la computadora; hoy entra desde el teléfono, que es otra terminal: «Caja
 * cerrada» —no puede cobrar— y «Abrir caja» le contesta que ya hay una abierta en
 * «Caja 20», con la única salida de «haz el corte desde ESA terminal». Si esa cookie ya
 * no existe (otro navegador, otra pestaña privada, el caché borrado), la caja queda
 * abierta para siempre y la sucursal sin poder cobrar: desde fuera parece que la caja
 * «se cerró sola».
 *
 * ── Lo que hace ────────────────────────────────────────────────────────────
 * Mueve la sesión ABIERTA a la terminal desde la que se pide, dentro de una transacción
 * y con auditoría de dónde a dónde. El arqueo no cambia: es de la sesión (sus pagos y
 * sus movimientos), no de la terminal. Con ella viajan las ventas apartadas de la
 * terminal vieja, porque el corte las exige resueltas en la terminal que cierra.
 *
 * ── Quién puede ─────────────────────────────────────────────────────────────
 * Quien la abrió, a cualquiera de sus dispositivos; la gerencia, cualquiera. Otra cajera
 * no: el cajón de otra persona es su responsabilidad hasta su corte.
 */

const ROLES_DE_CAJA = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
const SUPERVISA: readonly string[] = ['gerente', 'administrador', 'dueno'];

export const entradaTraerCaja = z.object({ sesionCajaId: z.uuid() });

export interface ResultadoTraerCaja {
  readonly sesionCajaId: string;
  /** La terminal donde estaba. Igual a la de ahora si ya estaba aquí. */
  readonly deTerminalId: string;
}

/** ¿Puede esta persona traer una caja que abrió `abiertaPor`? */
export function puedeTraerLaCaja(rol: string, empleoId: string, abiertaPor: string): boolean {
  return SUPERVISA.includes(rol) || abiertaPor === empleoId;
}

/** La caja abierta de la sucursal en OTRA terminal, como la enseña la pantalla de caja. */
export interface CajaEnOtraTerminal {
  readonly sesionCajaId: string;
  readonly terminalNombre: string | null;
  readonly abiertaPor: string | null;
  readonly abiertaEn: string;
  readonly puedoTraerla: boolean;
}

/**
 * Lo que la pantalla necesita cuando ESTA terminal no tiene caja: si la sucursal tiene
 * una abierta en otra (la más antigua primero, que es la que nadie cortó) y si todavía
 * cabe abrir otra aquí. Sin esto la pantalla ofrecía «Abrir caja», que fallaba.
 */
export async function cajasDeLaSucursal(
  tx: Transaccion,
  ambito: { organizacionId: string; sucursalId: string; empleoId: string; rol: string },
): Promise<{ readonly enOtraTerminal: CajaEnOtraTerminal | null; readonly puedoAbrir: boolean }> {
  const { cupo, abiertas } = await repoCaja.cupoDeCajas(
    tx,
    ambito.organizacionId,
    ambito.sucursalId,
  );
  const ajenas = await tx
    .selectFrom('sesiones_caja')
    .leftJoin('terminales', 'terminales.id', 'sesiones_caja.terminal_id')
    .leftJoin('empleos', 'empleos.id', 'sesiones_caja.empleado_abre_id')
    .leftJoin('personas', 'personas.id', 'empleos.persona_id')
    .select([
      'sesiones_caja.id as id',
      'sesiones_caja.abierta_en as abiertaEn',
      'sesiones_caja.empleado_abre_id as abiertaPorId',
      'terminales.nombre as terminalNombre',
      'personas.nombre as abiertaPor',
    ])
    .where('sesiones_caja.organizacion_id', '=', ambito.organizacionId)
    .where('sesiones_caja.sucursal_id', '=', ambito.sucursalId)
    .where('sesiones_caja.estado', '=', 'abierta')
    .orderBy('sesiones_caja.abierta_en', 'asc')
    .limit(1)
    .execute();
  const ajena = ajenas[0];
  return {
    enOtraTerminal:
      ajena === undefined
        ? null
        : {
            sesionCajaId: ajena.id,
            terminalNombre: ajena.terminalNombre,
            abiertaPor: ajena.abiertaPor,
            abiertaEn: ajena.abiertaEn.toISOString(),
            puedoTraerla: puedeTraerLaCaja(ambito.rol, ambito.empleoId, ajena.abiertaPorId),
          },
    puedoAbrir: abiertas.length < cupo,
  };
}

export const traerCaja = definirComando<Transaccion, typeof entradaTraerCaja, ResultadoTraerCaja>({
  nombre: 'caja.traer',
  entidad: 'sesion_caja',
  escribe: true,
  roles: [...ROLES_DE_CAJA],
  paquetes: PAQUETES_MOSTRADOR,
  sucursal: { sesionCajaId: 'sesiones_caja' },
  entrada: entradaTraerCaja,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, terminalId, empleoId, rol } = ctx.ambito;
    if (sucursalId === null || terminalId === null) {
      throw new ErrorDominio('VENTA_SIN_TERMINAL', 'Usa la caja desde una terminal dada de alta.');
    }

    // Bloqueada: un cobro o un corte en curso en la terminal vieja termina antes.
    const sesion = await ctx.paso('leer_sesion', () =>
      ctx.tx
        .selectFrom('sesiones_caja')
        .select(['id', 'estado', 'terminal_id', 'sucursal_id', 'empleado_abre_id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.sesionCajaId)
        .forUpdate()
        .executeTakeFirst(),
    );
    if (sesion?.sucursal_id !== sucursalId) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa caja no existe en esta sucursal.');
    }
    if (sesion.estado !== 'abierta') {
      throw new ErrorDominio('CAJA_CERRADA', 'Esa caja ya se cerró: abre una nueva aquí.');
    }
    if (sesion.terminal_id === terminalId) {
      // Ya estaba aquí (doble clic, otra pestaña): nada que mover, y aun así queda rastro.
      ctx.auditar({ entidadId: sesion.id, payload: { yaEstabaAqui: true } });
      return { sesionCajaId: sesion.id, deTerminalId: terminalId };
    }
    if (!puedeTraerLaCaja(rol, empleoId, sesion.empleado_abre_id)) {
      throw new ErrorDominio(
        'PUENTE_SIN_PERMISO',
        'Esa caja la abrió otra persona: que ella o la gerencia la traiga, o que haga su corte.',
      );
    }

    const mia = await ctx.paso('buscar_la_de_aqui', () =>
      repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
    );
    if (mia !== null) {
      throw new ErrorDominio('CAJA_YA_ABIERTA', 'Esta terminal ya tiene su propia caja abierta.', {
        sesionCajaId: mia.id,
      });
    }

    const deTerminalId = sesion.terminal_id;
    await ctx.paso('mover_sesion', async () => {
      try {
        await ctx.tx
          .updateTable('sesiones_caja')
          .set({ terminal_id: terminalId, updated_at: ctx.ahora })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', sesion.id)
          .where('estado', '=', 'abierta')
          .execute();
      } catch (error) {
        if (violaIndice(error, 'sesiones_caja_una_abierta_por_terminal')) {
          throw new ErrorDominio(
            'CAJA_YA_ABIERTA',
            'Esta terminal acaba de abrir su caja desde otra pestaña: usa esa.',
          );
        }
        throw error;
      }
    });
    await ctx.paso('mover_apartadas', () =>
      ctx.tx
        .updateTable('ordenes')
        .set({ terminal_id: terminalId })
        .where('organizacion_id', '=', organizacionId)
        .where('terminal_id', '=', deTerminalId)
        .where('estado', '=', 'suspendida')
        .execute(),
    );

    ctx.auditar({ entidadId: sesion.id, payload: { deTerminalId, aTerminalId: terminalId } });
    return { sesionCajaId: sesion.id, deTerminalId };
  },
});
