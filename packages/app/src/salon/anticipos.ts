import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-414 · El anticipo de la cita: recibirlo y aplicarlo.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────
 * Entre el 15 % y el 20 % de las citas no llegan, y la capacidad de un salón no
 * se recupera: el martes a las once ya pasó. El anticipo es lo único que
 * convierte una intención en un compromiso, y el giro ya sabe cuánto —20 a
 * 30 % en servicio estándar, hasta 50 % en los caros o largos—.
 *
 * ── Es dinero AJENO hasta que el servicio ocurre ─────────────────────────
 * Entra al cajón el jueves por un servicio del sábado. Contarlo como venta del
 * jueves adelanta el ingreso, el IVA y —peor— la comisión de una profesional
 * que todavía no ha trabajado. Por eso vive en su tabla, se aplica el día que
 * el servicio se cobra, y hasta entonces el corte lo enseña aparte.
 *
 * ── Aplicar EXIGE la orden, y eso no es burocracia ───────────────────────
 * La base lo exige (`anticipo_aplicado_con_orden`) porque un anticipo aplicado
 * sin decir a qué cuenta es dinero que desaparece del pasivo sin aparecer en
 * ninguna venta. Al cuadrar el mes, la diferencia no se puede explicar: no hay
 * de dónde tirar del hilo.
 *
 * ── Lo que aquí NO se hace: retener ──────────────────────────────────────
 * Retener el anticipo de una no-show es una decisión de otra persona, en otro
 * momento, y con consecuencias distintas —le entra al historial de la clienta—.
 * Vive con el no-show (F-434) y no aquí: juntarlos haría que aplicar y
 * castigar compartieran camino, y son lo contrario.
 */

const RECEPCION = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaRecibirAnticipo = z.object({
  citaId: z.uuid(),
  montoCentavos: z.number().int().min(1).max(100_000_000),
  metodo: z.enum(['efectivo', 'tarjeta', 'transferencia']),
});

export const entradaAplicarAnticipo = z.object({
  anticipoId: z.uuid(),
  /** La cuenta que lo consume. Sin ella el pasivo desaparece sin destino. */
  ordenId: z.uuid(),
});

export interface ResultadoAnticipo {
  readonly anticipoId: string;
  readonly estado: string;
}

export const recibirAnticipo = definirComando<
  Transaccion,
  typeof entradaRecibirAnticipo,
  ResultadoAnticipo
>({
  nombre: 'anticipo.recibir',
  entidad: 'anticipo_cita',
  escribe: true,
  roles: [...RECEPCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaRecibirAnticipo,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const cita = await ctx.paso('leer_cita', () =>
      ctx.tx
        .selectFrom('citas')
        .select(['id', 'estado', 'cliente_id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.citaId)
        .executeTakeFirst(),
    );
    if (cita === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa cita no existe en este negocio.');
    }
    // Cobrar un anticipo por una cita que ya se atendió o se canceló es cobrar
    // por nada, y el que lo descubre es el cliente.
    if (!['agendada', 'confirmada'].includes(cita.estado)) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa cita ya no está esperando: no se le puede pedir anticipo.',
      );
    }

    // El `unique` parcial de la migración 138 es el que impide dos anticipos
    // vivos en la misma cita. Aquí no hay comprobación previa a propósito: una
    // lectura seguida de una escritura deja hueco para que dos capturas
    // simultáneas —la terminal que tarda y alguien que vuelve a cobrar— pasen
    // las dos. La base no lo deja.
    const anticipo = await ctx.paso('anotar_anticipo', () =>
      ctx.tx
        .insertInto('anticipos_cita')
        .values({
          organizacion_id: organizacionId,
          cita_id: entrada.citaId,
          cliente_id: cita.cliente_id,
          monto_centavos: BigInt(entrada.montoCentavos),
          metodo: entrada.metodo,
          estado: 'vivo',
          recibido_en: ctx.ahora,
          recibido_por: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: anticipo.id,
      payload: { citaId: entrada.citaId, montoCentavos: entrada.montoCentavos },
    });
    return { anticipoId: anticipo.id, estado: 'vivo' };
  },
});

async function exigirAnticipo(
  ctx: ContextoComando<Transaccion>,
  anticipoId: string,
): Promise<void> {
  const fila = await ctx.paso('leer_anticipo', () =>
    ctx.tx
      .selectFrom('anticipos_cita')
      .select(['id'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', '=', anticipoId)
      .executeTakeFirst(),
  );
  if (fila === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese anticipo no existe en este negocio.');
  }
}

export const aplicarAnticipo = definirComando<
  Transaccion,
  typeof entradaAplicarAnticipo,
  ResultadoAnticipo
>({
  nombre: 'anticipo.aplicar',
  entidad: 'anticipo_cita',
  escribe: true,
  roles: [...RECEPCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAplicarAnticipo,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    await exigirAnticipo(ctx, entrada.anticipoId);

    // Estado, orden y fecha de resolución en la MISMA escritura: la migración
    // 138 exige las dos últimas (`anticipo_aplicado_con_orden` y
    // `anticipo_resuelto_con_fecha`), y separarlas dejaría un pasivo que
    // desaparece sin destino ni fecha.
    const tocados = await ctx.paso('aplicar', () =>
      ctx.tx
        .updateTable('anticipos_cita')
        .set({
          estado: 'aplicado',
          orden_id: entrada.ordenId,
          resuelto_en: ctx.ahora,
          motivo_resolucion: 'aplicado al cobro del servicio',
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.anticipoId)
        .where('estado', '=', 'vivo')
        .executeTakeFirst(),
    );
    if (Number(tocados.numUpdatedRows) !== 1) {
      // Único cerrojo, y cubre las tres: el ya aplicado —aplicarlo dos veces
      // descuenta dos veces del mismo cobro—, el devuelto y el retenido.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Ese anticipo ya no estaba vivo: o se aplicó, o se devolvió, o se retuvo.',
      );
    }

    ctx.auditar({ entidadId: entrada.anticipoId, payload: { ordenId: entrada.ordenId } });
    return { anticipoId: entrada.anticipoId, estado: 'aplicado' };
  },
});
