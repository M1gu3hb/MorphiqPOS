import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import { repoCaja, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * `comision.liquidar_profesional` — F-427 y F-259.
 *
 * ── El domingo con la calculadora se acaba aquí ──────────────────────────
 * La liquidación no CALCULA nada: suma el ledger de `comisiones_causadas`, que
 * ya trae cada comisión con su regla, su versión y su motivo. Recalcular al
 * liquidar sería la tercera oportunidad de que el número saliera distinto, y
 * con eso vuelve el pleito que F-443 vino a cerrar.
 *
 * ── La salida más grande del día, con su renglón ─────────────────────────
 * Cuando el salón paga, sale del cajón más dinero que en ninguna otra operación
 * de la semana. Sin el movimiento de caja, el corte diría que se gastaron
 * $18,400 sin poder decir de quién ni de qué periodo. Los dos se escriben en la
 * MISMA transacción: uno no existe sin el otro.
 *
 * ── Comisión y propina NO se suman ───────────────────────────────────────
 * La propina no es del salón: es de quien la recibió, y el salón sólo la
 * guardó. Van en dos columnas y en dos renglones del comprobante. Sumarlas haría
 * que el gasto de nómina del negocio incluyera dinero que nunca fue suyo.
 *
 * ── Y las comisiones quedan MARCADAS, no borradas ────────────────────────
 * `liquidacion_id` es lo único que el trigger de la 133 deja tocar: lo causado
 * sigue ahí, con su regla y su versión, y se puede volver a leer dentro de un
 * año. Borrarlas dejaría una liquidación sin forma de explicarse.
 */

const ROLES = ['dueno', 'administrador'] as const;

export const entradaLiquidar = z.object({
  profesionalId: z.uuid(),
  periodoDesde: z.iso.date(),
  periodoHasta: z.iso.date(),
  /** Lo que ya cobró en mano durante el periodo, y que no se le vuelve a dar. */
  cobradoPorEllaCentavos: z.number().int().min(0).max(100_000_000).default(0),
  anticiposCentavos: z.number().int().min(0).max(100_000_000).default(0),
  /**
   * La propina que se le entrega en este sobre. Sin ella, TODA la que el salón le debe
   * (`movimientos_propina`): la de la terminal y la del cajón. Con ella, no más de eso.
   */
  propinaCentavos: z.number().int().min(0).max(100_000_000).optional(),
  rentaCentavos: z.number().int().min(0).max(100_000_000).default(0),
});

export const entradaVistaPrevia = z.object({
  profesionalId: z.uuid(),
  periodoDesde: z.iso.date(),
  periodoHasta: z.iso.date(),
});

/** Lo que se le va a pagar, ANTES de pagarlo: el comprobante sin sello. */
export interface VistaPreviaDeLiquidacion {
  readonly profesionalId: string;
  readonly nombreCompleto: string;
  readonly comisionCentavos: string;
  readonly propinaCentavos: string;
  readonly totalCentavos: string;
  /** Si esta terminal tiene la caja abierta: sin ella no se paga. */
  readonly cajaAbierta: boolean;
}

export interface ResultadoLiquidacion {
  readonly liquidacionId: string;
  readonly comisionCentavos: string;
  readonly propinaCentavos: string;
  readonly rentaCentavos: string;
  readonly totalCentavos: string;
  readonly comisionesMarcadas: number;
  readonly movimientoCajaId: string;
}

export const liquidarProfesional = definirComando<
  Transaccion,
  typeof entradaLiquidar,
  ResultadoLiquidacion
>({
  nombre: 'comision.liquidar_profesional',
  entidad: 'liquidacion',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_TODOS,
  entrada: entradaLiquidar,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, terminalId, empleoId } = ctx.ambito;

    if (entrada.periodoHasta < entrada.periodoDesde) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Un periodo que termina antes de empezar no tiene comisiones que sumar.',
      );
    }

    const { profesional, pendientes, comision, saldoDePropina } = await loQueSeLeDebe(
      ctx,
      entrada.profesionalId,
    );

    const sesion = await cajaDelTurno(ctx, terminalId);

    // ── La propina que se le debe va en el MISMO sobre (§4.4) ─────────────
    // Sin cantidad, toda la que el salón le guarda. Entregar más de lo que se le
    // debe es sacar del cajón dinero del negocio creyendo que es ajeno: la misma
    // guarda que `propina.entregar_directa`.
    const propina =
      entrada.propinaCentavos === undefined ? saldoDePropina : BigInt(entrada.propinaCentavos);
    if (propina > saldoDePropina) {
      throw new ErrorDominio(
        'EFECTIVO_INSUFICIENTE',
        `Sólo se le deben ${saldoDePropina.toString()} centavos de propina.`,
        { saldoCentavos: saldoDePropina.toString() },
      );
    }
    const renta = BigInt(entrada.rentaCentavos);
    const yaCobrado = BigInt(entrada.cobradoPorEllaCentavos);
    const anticipos = BigInt(entrada.anticiposCentavos);

    const total = comision + propina - renta - yaCobrado - anticipos;
    if (total < 0n) {
      // Un total negativo es una liquidación en la que la persona LE DEBE al
      // salón. Existe —pasa con anticipos grandes— pero no se paga con una
      // salida de caja: se arrastra al periodo siguiente, y eso es otra
      // función. Decirlo es mejor que sacar dinero del cajón al revés.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Con la renta y los anticipos, esa liquidación sale en contra: se arrastra, no se paga.',
        { totalCentavos: total.toString() },
      );
    }

    const liquidacion = await ctx.paso('crear_liquidacion', () =>
      ctx.tx
        .insertInto('liquidaciones')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          profesional_id: entrada.profesionalId,
          periodo_desde: entrada.periodoDesde,
          periodo_hasta: entrada.periodoHasta,
          // Dos columnas, nunca sumadas: la regla 5 del corte vive aquí y no
          // sólo en la plantilla del PDF.
          comision_centavos: comision,
          propina_centavos: propina,
          renta_centavos: renta,
          cobrado_por_ella_centavos: yaCobrado,
          anticipos_centavos: anticipos,
          total_centavos: total,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    // El movimiento de caja, en la MISMA transacción. `liquidacion` y no
    // `gasto`: el corte tiene que poder decir de quién y de qué periodo salió
    // el dinero, y «gasto: nómina» no lo dice.
    const movimiento = await ctx.paso('anotar_caja', () =>
      repoCaja.registrarMovimiento(ctx.tx, {
        organizacionId,
        sesionCajaId: sesion,
        tipo: 'liquidacion',
        // Negativo: sale del cajón.
        montoCentavos: -total,
        motivo: `liquidación de ${profesional.nombre}`,
        empleadoId: empleoId,
        referenciaTipo: 'liquidacion',
        referenciaId: liquidacion.id,
      }),
    );

    await ctx.paso('sellar_liquidacion', () =>
      ctx.tx
        .updateTable('liquidaciones')
        // `pagada_en` y `movimiento_caja_id` juntos: la 135 lo exige. Una
        // liquidación pagada sin movimiento es dinero que salió del cajón y no
        // está en ningún corte.
        .set({ pagada_en: ctx.ahora, pagada_por: empleoId, movimiento_caja_id: movimiento.id })
        .where('id', '=', liquidacion.id)
        .execute(),
    );

    // ── Y la propina pagada sale de SU ledger, en la misma transacción ─────
    // Sin esta fila el salón la seguía debiendo después de entregarla: el corte
    // decía «pendiente» y la siguiente liquidación la pagaba otra vez. Va negativa
    // y con su sello (139), atada a esta liquidación y a su salida de caja.
    if (propina > 0n) {
      await ctx.paso('entregar_propina', () =>
        ctx.tx
          .insertInto('movimientos_propina')
          .values({
            organizacion_id: organizacionId,
            sucursal_id: sucursalId,
            profesional_id: entrada.profesionalId,
            tipo: 'entregada',
            monto_centavos: -propina,
            medio: 'efectivo',
            liquidacion_id: liquidacion.id,
            movimiento_caja_id: movimiento.id,
            entregada_en: ctx.ahora,
            entregada_por: empleoId,
            nota: 'en su liquidación',
            created_at: ctx.ahora,
          })
          .execute(),
      );
    }

    // Marcadas, no borradas: lo causado sigue ahí con su regla y su versión.
    let marcadas = 0;
    for (const pendiente of pendientes) {
      await ctx.paso('marcar_comision', () =>
        ctx.tx
          .updateTable('comisiones_causadas')
          .set({ liquidacion_id: liquidacion.id })
          .where('id', '=', pendiente.id)
          // Compare-and-set: si otra liquidación se la llevó entre la lectura y
          // esto, no se le paga dos veces.
          .where('liquidacion_id', 'is', null)
          .execute(),
      );
      marcadas += 1;
    }

    ctx.auditar({
      entidadId: liquidacion.id,
      payload: {
        profesionalId: entrada.profesionalId,
        periodoDesde: entrada.periodoDesde,
        periodoHasta: entrada.periodoHasta,
        comisionCentavos: comision.toString(),
        propinaCentavos: propina.toString(),
        totalCentavos: total.toString(),
        comisionesMarcadas: marcadas,
      },
    });

    return {
      liquidacionId: liquidacion.id,
      comisionCentavos: comision.toString(),
      propinaCentavos: propina.toString(),
      rentaCentavos: renta.toString(),
      totalCentavos: total.toString(),
      comisionesMarcadas: marcadas,
      movimientoCajaId: movimiento.id,
    };
  },
});

/**
 * `comision.vista_previa_liquidacion` — el comprobante ANTES de pagar (F-427).
 *
 * «Una vez pagado ya no se discute: se reclama.» La pantalla decía que el comprobante se
 * veía antes de pagar, y el botón que lo pedía YA pagaba: sacaba el dinero del cajón en el
 * mismo toque. Esto lee exactamente lo que `liquidar_profesional` va a sumar —el ledger de
 * comisiones sin liquidar y la propina que se le debe— y no escribe nada.
 */
export const vistaPreviaDeLiquidacion = definirComando<
  Transaccion,
  typeof entradaVistaPrevia,
  VistaPreviaDeLiquidacion
>({
  nombre: 'comision.vista_previa_liquidacion',
  entidad: 'liquidacion',
  escribe: false,
  roles: [...ROLES],
  paquetes: PAQUETES_TODOS,
  entrada: entradaVistaPrevia,
  async ejecutar(ctx, entrada) {
    if (entrada.periodoHasta < entrada.periodoDesde) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Un periodo que termina antes de empezar no tiene comisiones que sumar.',
      );
    }
    const { profesional, comision, saldoDePropina } = await loQueSeLeDebe(
      ctx,
      entrada.profesionalId,
    );
    const { terminalId, organizacionId } = ctx.ambito;
    const sesion =
      terminalId === null
        ? null
        : await ctx.paso('cargar_caja', () =>
            repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
          );
    return {
      profesionalId: profesional.id,
      nombreCompleto: profesional.nombre,
      comisionCentavos: comision.toString(),
      propinaCentavos: saldoDePropina.toString(),
      totalCentavos: (comision + saldoDePropina).toString(),
      cajaAbierta: sesion !== null,
    };
  },
});

/**
 * Lo que el salón le debe a una persona: lo causado y NO liquidado, y su propina.
 *
 * La comparten el pago y su vista previa: si cada uno sumara por su lado, el comprobante
 * que se enseña y el dinero que sale del cajón podrían decir dos cosas distintas.
 */
async function loQueSeLeDebe(ctx: ContextoComando<Transaccion>, profesionalId: string) {
  const { organizacionId } = ctx.ambito;
  const profesional = await ctx.paso('cargar_profesional', () =>
    ctx.tx
      .selectFrom('profesionales')
      .select(['id', 'nombre_completo as nombre'])
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', profesionalId)
      .executeTakeFirst(),
  );
  if (profesional === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa persona no atiende en este negocio.');
  }

  // ── Lo causado y NO liquidado ─────────────────────────────────────────
  // Sólo lo que no tiene liquidación: sin ese filtro, liquidar dos veces el
  // mismo mes le pagaría dos veces a la misma persona, y el ledger seguiría
  // diciendo que todo está bien.
  const pendientes = await ctx.paso('leer_pendientes', () =>
    ctx.tx
      .selectFrom('comisiones_causadas')
      .select(['id', 'monto_centavos as monto'])
      .where('organizacion_id', '=', organizacionId)
      .where('profesional_id', '=', profesionalId)
      .where('liquidacion_id', 'is', null)
      .execute(),
  );

  // Se SUMA el ledger, no se recalcula. Las contrapartidas negativas entran
  // con su signo: es lo que hace que «− $50, ticket cancelado» aparezca en la
  // liquidación en vez de desaparecer del total sin explicación.
  const comision = pendientes.reduce((a, c) => a + c.monto, 0n);

  // La propina que el salón le guarda: el ledger FIRMADO (139) sumado. La de la
  // mano se recibió y se entregó en el mismo acto y suma cero.
  const propinas = await ctx.paso('leer_propina', () =>
    ctx.tx
      .selectFrom('movimientos_propina')
      .select(['monto_centavos as monto'])
      .where('organizacion_id', '=', organizacionId)
      .where('profesional_id', '=', profesionalId)
      .execute(),
  );
  const saldo = propinas.reduce((a, p) => a + p.monto, 0n);

  return {
    profesional,
    pendientes,
    comision,
    // Un saldo negativo sería un error de captura, no una deuda de ella: no se cobra aquí.
    saldoDePropina: saldo > 0n ? saldo : 0n,
  };
}

/**
 * El turno del que sale el dinero.
 *
 * Sin caja abierta no se liquida: la salida más grande del día tiene que caer
 * en un turno que alguien vaya a arquear esa noche. Pagarla fuera de turno deja
 * el cajón corto sin que ningún corte lo explique.
 */
async function cajaDelTurno(
  ctx: ContextoComando<Transaccion>,
  terminalId: string | null,
): Promise<string> {
  if (terminalId === null) {
    throw new ErrorDominio('VENTA_SIN_TERMINAL', 'Esto sale del cajón: hace falta una terminal.');
  }

  const sesion = await ctx.paso('cargar_caja', () =>
    repoCaja.sesionAbiertaDeTerminal(ctx.tx, ctx.ambito.organizacionId, terminalId),
  );
  if (sesion === null) {
    throw new ErrorDominio('CAJA_CERRADA', 'Abre la caja antes de liquidar.');
  }
  return sesion.id;
}
