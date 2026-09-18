import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import { repoCaja, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-260 · La propina de tarjeta es una DEUDA del negocio, no dinero suyo.
 *
 * ── Por qué faltaba, y por qué importa tanto ───────────────────────────────
 * El ledger de pasivos de terceros (migración 063) admite cuatro naturalezas y
 * el código sólo escribía TRES: fiado, servicios de terceros y envases.
 * `propina_por_entregar` estaba en el `check` y no la escribía nadie. La cuarta
 * vista del mismo objeto, que es la que más dinero mueve en un salón.
 *
 * ── El problema real, en pesos ─────────────────────────────────────────────
 * La clienta deja $200 de propina con tarjeta. Ese dinero **entra a la cuenta
 * del salón** y es de la estilista. Hoy o se queda en ventas —y el salón cree
 * que vendió $200 más de lo que vendió— o se saca del cajón sin registro —y el
 * arqueo no cuadra—. Las dos opciones son malas, y son las dos que existen.
 *
 * ── Por qué NO toca ventas, utilidad ni margen, nunca ──────────────────────
 * Es la regla de dinero número tres del encargo, escrita con estas palabras:
 * *«Las propinas NO entran en ventas, utilidad, costo ni margen. Nunca.»* Aquí
 * eso se cumple por construcción: la propina se anota en `pasivos_terceros`,
 * que ningún reporte de venta lee.
 *
 * ── Y por qué la salida es un movimiento de caja y no un gasto ─────────────
 * Entregar la propina baja el cajón. Registrarlo como gasto lo metería en el
 * estado de resultados del salón, que es exactamente lo contrario de lo que es:
 * el salón no gastó ese dinero, sólo lo custodiaba.
 */

const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

const IMPORTE = z.number().int().min(1).max(100_000_000);

export const entradaAnotarPropinaPorEntregar = z.object({
  /** A quién se le debe. Es un `empleos.id`: la propina tiene dueño. */
  empleoBeneficiarioId: z.uuid(),
  montoCentavos: IMPORTE,
  /** El cobro del que salió. Sin él, el corte no puede explicar el renglón. */
  ordenId: z.uuid().optional(),
  /**
   * El método con el que se pagó.
   *
   * Sólo se anota como pasivo lo que NO entró en efectivo: el efectivo ya está
   * en el cajón y se entrega esa misma noche. Lo de tarjeta llega al banco tres
   * días después y ésa es la deuda.
   */
  metodo: z.enum(['tarjeta', 'transferencia']),
});

export interface ResultadoPropinaPasivo {
  readonly pasivoId: string;
  readonly montoCentavos: string;
  readonly saldoDelBeneficiarioCentavos: string;
}

export const anotarPropinaPorEntregar = definirComando<
  Transaccion,
  typeof entradaAnotarPropinaPorEntregar,
  ResultadoPropinaPasivo
>({
  nombre: 'propinas.anotar_pasivo',
  entidad: 'pasivo_tercero',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAnotarPropinaPorEntregar,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId, sucursalId } = ctx.ambito;

    await comprobarEmpleo(ctx, entrada.empleoBeneficiarioId);

    const pasivo = await ctx.paso('anotar_pasivo', () =>
      ctx.tx
        .insertInto('pasivos_terceros')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          naturaleza: 'propina_por_entregar',
          titular_tipo: 'empleo',
          titular_id: entrada.empleoBeneficiarioId,
          // POSITIVO: el negocio contrae la deuda. Entra dinero ajeno.
          monto_centavos: BigInt(entrada.montoCentavos),
          referencia_tipo: entrada.ordenId === undefined ? 'propina' : 'orden',
          referencia_id: entrada.ordenId ?? null,
          motivo: `propina ${entrada.metodo}`,
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    const saldo = await saldoDelBeneficiario(ctx, entrada.empleoBeneficiarioId);

    ctx.auditar({
      entidadId: pasivo.id,
      payload: {
        beneficiario: entrada.empleoBeneficiarioId,
        metodo: entrada.metodo,
        montoCentavos: entrada.montoCentavos,
      },
    });

    return {
      pasivoId: pasivo.id,
      montoCentavos: entrada.montoCentavos.toString(),
      saldoDelBeneficiarioCentavos: saldo.toString(),
    };
  },
});

export const entradaEntregarPropina = z.object({
  empleoBeneficiarioId: z.uuid(),
  montoCentavos: IMPORTE,
  nota: z.string().trim().max(200).optional(),
});

export interface ResultadoEntrega {
  readonly pasivoId: string;
  readonly entregadoCentavos: string;
  readonly saldoDelBeneficiarioCentavos: string;
}

/**
 * Entrega la propina y salda la deuda.
 *
 * ── Por qué NO se puede entregar más de lo que se debe ─────────────────────
 * Porque un saldo negativo en este ledger significaría que la estilista le debe
 * dinero al salón, que no es una situación que exista: si se le pagó de más, eso
 * es un anticipo de sueldo y vive en otro sitio. Dejarlo pasar convertiría el
 * ledger de propinas en la caja chica informal del salón.
 */
export const entregarPropina = definirComando<
  Transaccion,
  typeof entradaEntregarPropina,
  ResultadoEntrega
>({
  nombre: 'propinas.entregar',
  entidad: 'pasivo_tercero',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_TODOS,
  entrada: entradaEntregarPropina,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId, sucursalId, terminalId } = ctx.ambito;

    const saldo = await saldoDelBeneficiario(ctx, entrada.empleoBeneficiarioId);
    if (saldo < BigInt(entrada.montoCentavos)) {
      throw new ErrorDominio(
        'LIQUIDACION_INVALIDA',
        'No se le debe tanto: entregar de más convertiría la propina en un préstamo.',
        { saldoCentavos: saldo.toString(), pedido: entrada.montoCentavos },
      );
    }

    if (terminalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Esto sale del cajón: hace falta una terminal con su caja abierta.',
      );
    }
    const sesion = await ctx.paso('cargar_caja', () =>
      repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
    );
    if (sesion === null) {
      throw new ErrorDominio('CAJA_CERRADA', 'Abre la caja antes de entregar la propina.');
    }

    const pasivo = await ctx.paso('saldar_pasivo', () =>
      ctx.tx
        .insertInto('pasivos_terceros')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          naturaleza: 'propina_por_entregar',
          titular_tipo: 'empleo',
          titular_id: entrada.empleoBeneficiarioId,
          // NEGATIVO: se salda. El ledger es inmutable, así que una entrega es
          // una contrapartida y jamás un `update` de la fila que la creó.
          monto_centavos: -BigInt(entrada.montoCentavos),
          referencia_tipo: 'entrega_propina',
          sesion_caja_id: sesion.id,
          motivo: entrada.nota ?? 'entrega de propina',
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    await ctx.paso('anotar_caja', () =>
      repoCaja.registrarMovimiento(ctx.tx, {
        organizacionId,
        sesionCajaId: sesion.id,
        tipo: 'retiro',
        montoCentavos: BigInt(entrada.montoCentavos),
        motivo: 'entrega de propina',
        empleadoId: empleoId,
        referenciaTipo: 'pasivo',
        referenciaId: pasivo.id,
      }),
    );

    ctx.auditar({
      entidadId: pasivo.id,
      payload: {
        beneficiario: entrada.empleoBeneficiarioId,
        entregadoCentavos: entrada.montoCentavos,
      },
    });

    return {
      pasivoId: pasivo.id,
      entregadoCentavos: entrada.montoCentavos.toString(),
      saldoDelBeneficiarioCentavos: (saldo - BigInt(entrada.montoCentavos)).toString(),
    };
  },
});

/** El beneficiario tiene que ser un empleo de ESTA organización (R16). */
async function comprobarEmpleo(ctx: ContextoComando<Transaccion>, empleoId: string): Promise<void> {
  const fila = await ctx.paso('cargar_empleo', () =>
    ctx.tx
      .selectFrom('empleos')
      .select(['id'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', '=', empleoId)
      .executeTakeFirst(),
  );
  if (fila === undefined) {
    throw new ErrorDominio(
      'ACCESO_NO_ENCONTRADO',
      'Ese empleado no existe en este negocio: la propina no tendría a quién ir.',
    );
  }
}

/** El saldo vivo, derivado del ledger. Nunca de una columna. */
async function saldoDelBeneficiario(
  ctx: ContextoComando<Transaccion>,
  empleoId: string,
): Promise<bigint> {
  const filas = await ctx.paso('sumar_saldo', () =>
    ctx.tx
      .selectFrom('pasivos_terceros')
      .select(['monto_centavos as monto'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('naturaleza', '=', 'propina_por_entregar')
      .where('titular_tipo', '=', 'empleo')
      .where('titular_id', '=', empleoId)
      .execute(),
  );
  return filas.reduce((a, f) => a + f.monto, 0n);
}
