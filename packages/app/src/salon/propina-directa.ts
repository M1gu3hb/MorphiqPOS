import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-243 · La propina V4: directa a la profesional.
 *
 * ── Por qué el salón necesita una CUARTA variante ────────────────────────
 * El tronco ya sabe repartir un bote por puntos de puesto (V1), por mesero (V2)
 * y por horas presentes (V3). Ninguna sirve aquí: en un salón la propina es de
 * QUIEN HIZO EL SERVICIO, con nombre y apellido, y no se reparte con nadie.
 * Meterla al bote es quitarle a la estilista dinero que la clienta le dejó a
 * ella mirándola a los ojos, y eso se nota en la primera quincena.
 *
 * ── Es dinero AJENO desde que entra, y por eso no pasa por la venta ──────
 * La propina de tarjeta entra al cajón del salón y NO es del salón: es un
 * pasivo con la profesional hasta que se le entrega. Registrarla como ingreso
 * infla la venta, el IVA y —peor— la comisión que se calcula sobre esa venta:
 * el salón acabaría pagándole comisión a la estilista sobre su propia propina.
 *
 * ── El saldo es una SUMA sobre una tabla, y eso no es un detalle ─────────
 * Lo recibido suma y lo entregado resta, firmado, en `movimientos_propina`. La
 * alternativa —una tabla de recibidas y otra de entregadas— obliga a restar dos
 * consultas para saber el saldo, y dos consultas que se desincronizan es
 * exactamente cómo se le paga dos veces a alguien.
 */

const RECEPCION = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
const ENTREGA = ['gerente', 'administrador', 'dueno'] as const;

export const entradaRecibirPropina = z.object({
  profesionalId: z.uuid(),
  ordenId: z.uuid().nullable().default(null),
  citaServicioId: z.uuid().nullable().default(null),
  montoCentavos: z.number().int().min(1).max(100_000_000),
  medio: z.enum(['efectivo', 'tarjeta', 'transferencia']),
});

export const entradaEntregarPropina = z.object({
  profesionalId: z.uuid(),
  montoCentavos: z.number().int().min(1).max(100_000_000),
  medio: z.enum(['efectivo', 'tarjeta', 'transferencia']),
});

export interface ResultadoPropina {
  readonly profesionalId: string;
  /** El saldo DESPUÉS del movimiento. Es lo que la pantalla enseña. */
  readonly saldoCentavos: string;
}

async function saldoDe(
  tx: Transaccion,
  organizacionId: string,
  profesionalId: string,
): Promise<bigint> {
  const filas = await tx
    .selectFrom('movimientos_propina')
    .select(['monto_centavos'])
    .where('organizacion_id', '=', organizacionId)
    .where('profesional_id', '=', profesionalId)
    .execute();
  return filas.reduce((suma, f) => suma + f.monto_centavos, 0n);
}

export const recibirPropina = definirComando<
  Transaccion,
  typeof entradaRecibirPropina,
  ResultadoPropina
>({
  nombre: 'propina.recibir_directa',
  entidad: 'movimiento_propina',
  escribe: true,
  roles: [...RECEPCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaRecibirPropina,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId } = ctx.ambito;

    const profesional = await ctx.paso('leer_profesional', () =>
      ctx.tx
        .selectFrom('profesionales')
        .select(['id', 'activo'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.profesionalId)
        .executeTakeFirst(),
    );
    if (profesional === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa profesional no existe en este negocio.');
    }

    await ctx.paso('anotar_propina', () =>
      ctx.tx
        .insertInto('movimientos_propina')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          profesional_id: entrada.profesionalId,
          orden_id: entrada.ordenId,
          cita_servicio_id: entrada.citaServicioId,
          tipo: 'recibida',
          // POSITIVO. El `check` de la 139 lo exige y la razón es que el saldo
          // sea una suma: un «recibida» negativo restaría al entrar.
          monto_centavos: BigInt(entrada.montoCentavos),
          medio: entrada.medio,
          created_at: ctx.ahora,
        })
        .execute(),
    );

    const saldo = await ctx.paso('saldo', () =>
      saldoDe(ctx.tx, organizacionId, entrada.profesionalId),
    );
    ctx.auditar({
      entidadId: entrada.profesionalId,
      payload: { montoCentavos: entrada.montoCentavos, medio: entrada.medio },
    });
    return { profesionalId: entrada.profesionalId, saldoCentavos: saldo.toString() };
  },
});

export const entregarPropina = definirComando<
  Transaccion,
  typeof entradaEntregarPropina,
  ResultadoPropina
>({
  nombre: 'propina.entregar_directa',
  entidad: 'movimiento_propina',
  escribe: true,
  roles: [...ENTREGA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaEntregarPropina,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;

    const saldoPrevio = await ctx.paso('saldo_previo', () =>
      saldoDe(ctx.tx, organizacionId, entrada.profesionalId),
    );
    const monto = BigInt(entrada.montoCentavos);

    // Entregar más de lo que se le debe es sacar del cajón dinero del negocio
    // creyendo que es ajeno. El corte cuadraría igual esa noche y el faltante
    // aparecería al cerrar el mes, cuando ya nadie recuerda el movimiento.
    if (monto > saldoPrevio) {
      throw new ErrorDominio(
        'EFECTIVO_INSUFICIENTE',
        `Sólo se le deben ${saldoPrevio.toString()} centavos de propina.`,
      );
    }

    await ctx.paso('anotar_entrega', () =>
      ctx.tx
        .insertInto('movimientos_propina')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          profesional_id: entrada.profesionalId,
          tipo: 'entregada',
          // NEGATIVO, y con su sello. Las dos cosas las exige la 139: un
          // «entregada» positivo haría crecer el saldo cada vez que se paga.
          monto_centavos: -monto,
          medio: entrada.medio,
          // La sesión de caja NO va aquí: el efectivo que sale del cajón es un
          // movimiento de caja aparte, y es él quien se ata con
          // `movimiento_caja_id`. Guardar la sesión en los dos sitios daría dos
          // versiones de la misma salida.
          entregada_en: ctx.ahora,
          entregada_por: empleoId,
          created_at: ctx.ahora,
        })
        .execute(),
    );

    ctx.auditar({
      entidadId: entrada.profesionalId,
      payload: { entregadoCentavos: entrada.montoCentavos },
    });
    return {
      profesionalId: entrada.profesionalId,
      saldoCentavos: (saldoPrevio - monto).toString(),
    };
  },
});
