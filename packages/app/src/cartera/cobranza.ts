import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { repoCaja, type Transaccion } from '@morphiqpos/data';
import { antiguedadDeSaldos, avisosDeVencimiento, repartirPago } from '@morphiqpos/domain/venta';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

import { cargarCliente, documentosVivos } from './documento.ts';

/**
 * F-613, F-614, F-615, F-616 y F-617 · Cobrar, medir, avisar y cortar.
 *
 * ── Las cuatro que cierran la tercera puerta de pérdida ──────────────────
 * «Nadie sabe cuánto lleva vencido.» F-613 lo mide por tramos, F-614 y F-615
 * aplican el pago a lo más viejo, F-616 avisa tres días antes y F-617 corta
 * cuando ya no se puede seguir.
 *
 * ── El pago se aplica a lo MÁS VIEJO, y no es una preferencia ────────────
 * Es lo que hace que la antigüedad signifique algo. Si el pago fuera al
 * documento más nuevo —o al que el cajero eligiera— un cliente podría pagar
 * religiosamente todos los meses y conservar para siempre una factura de hace
 * dos años en el tramo de 90 días. La cartera diría que hay mora crónica donde
 * sólo hay una aplicación mal hecha.
 *
 * ── Y el pago entra al cajón SIN ser una venta nueva ─────────────────────
 * La venta se registró el día que se fió. Volver a contarla al cobrar duplicaría
 * el ingreso del mes: el error más caro de un sistema de crédito, y el más
 * fácil de cometer porque «entró dinero» se parece mucho a «vendí».
 */

const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
const ROLES_DE_MURO = ['gerente', 'administrador', 'dueno'] as const;

export const entradaRegistrarPago = z.object({
  clienteId: z.uuid(),
  montoCentavos: z.number().int().min(1).max(1_000_000_000),
  metodo: z.enum(['efectivo', 'tarjeta', 'transferencia', 'cheque']),
  referencia: z.string().trim().max(60).optional(),
});

export interface ResultadoPagoCredito {
  readonly pagoId: string;
  readonly aplicadoCentavos: string;
  readonly aCuentaCentavos: string;
  readonly documentosSaldados: number;
  readonly saldoDespuesCentavos: string;
  /**
   * F-212 · `true` cuando el pago entró pero TODAVÍA NO baja el saldo.
   *
   * Es el caso de la transferencia: el comprobante se ve en la pantalla del
   * cliente y el sistema no puede saber si es real. La pantalla tiene que
   * decirlo en el momento —«queda pendiente de confirmar»— o el mostradorista
   * le dice al cliente que ya está saldado y mañana no lo está.
   */
  readonly pendienteDeConfirmar: boolean;
}

export const entradaConfirmarTransferencia = z.object({
  pagoId: z.uuid(),
  /** La referencia que aparece en el estado de cuenta, no la que dijo el cliente. */
  referenciaBancaria: z.string().trim().max(60).nullable().default(null),
});

export const entradaPendientes = z.object({
  /** Desde cuántas horas atrás. El corte del día no mira la semana pasada. */
  horas: z.number().int().min(1).max(720).default(72),
});

export interface ResultadoConfirmacion {
  readonly pagoId: string;
  readonly aplicadoCentavos: string;
  readonly aCuentaCentavos: string;
  readonly documentosSaldados: number;
}

export interface TransferenciaPendiente {
  readonly pagoId: string;
  readonly clienteId: string;
  readonly montoCentavos: string;
  readonly referencia: string | null;
  readonly registradaEn: string;
  readonly horasEsperando: number;
}

export interface ResultadoPendientes {
  readonly pendientes: readonly TransferenciaPendiente[];
  readonly totalCentavos: string;
}

export const registrarPagoCredito = definirComando<
  Transaccion,
  typeof entradaRegistrarPago,
  ResultadoPagoCredito
>({
  nombre: 'credito.registrar_pago',
  entidad: 'pago_credito',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaRegistrarPago,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId, terminalId } = ctx.ambito;

    await cargarCliente(ctx, entrada.clienteId);
    const vivos = await documentosVivos(ctx, entrada.clienteId);
    if (vivos.length === 0) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Ese cliente no debe nada: un pago sin deuda es un anticipo, y va por otro camino.',
      );
    }

    // F-212 · La transferencia entra, pero NO baja el saldo. El comprobante se
    // ve en la pantalla del cliente y el sistema no puede saber si es real: lo
    // único que puede hacer es no creérselo hasta que alguien mire el banco.
    // Aplicarla de inmediato es cómo un comprobante falso de $12,000 sale por
    // la puerta convertido en material.
    const pendiente = entrada.metodo === 'transferencia';

    // `repartirPago` es la función que E6 escribió para F-614 en ferretería, y
    // sirve TAL CUAL para el fiado de una tiendita: es la comprobación campo por
    // campo que el encargo pide antes de reutilizar. `fecha` es el VENCIMIENTO y
    // no la emisión, porque lo que se paga primero es lo que venció primero.
    const reparto = repartirPago(
      BigInt(entrada.montoCentavos),
      vivos.map((d) => ({ id: d.id, saldoCentavos: d.saldoCentavos, fecha: d.venceEn })),
    );

    // El efectivo entra al cajón; lo demás llega al banco. Sólo lo primero
    // necesita sesión de caja, y exigirla para una transferencia dejaría al
    // cobrador sin poder registrar un depósito que ya está en la cuenta.
    let sesionId: string | null = null;
    if (entrada.metodo === 'efectivo') {
      if (terminalId === null) {
        throw new ErrorDominio(
          'VENTA_SIN_TERMINAL',
          'El efectivo entra al cajón: hace falta una terminal con su caja abierta.',
        );
      }
      const sesion = await ctx.paso('cargar_caja', () =>
        repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
      );
      if (sesion === null) {
        throw new ErrorDominio('CAJA_CERRADA', 'Abre la caja antes de cobrar en efectivo.');
      }
      sesionId = sesion.id;
    }

    const pago = await ctx.paso('anotar_pago', () =>
      ctx.tx
        .insertInto('pagos_credito')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          cliente_id: entrada.clienteId,
          monto_centavos: BigInt(entrada.montoCentavos),
          metodo: entrada.metodo,
          referencia: entrada.referencia ?? null,
          sesion_caja_id: sesionId,
          // A cuenta sólo cuando de verdad se aplicó: reservar el sobrante de
          // un pago que todavía nadie confirmó daría un saldo a favor sobre
          // dinero que puede no existir.
          a_cuenta_centavos: pendiente ? 0n : reparto.sobranteCentavos,
          empleado_id: empleoId,
          confirmado: !pendiente,
          confirmado_en: pendiente ? null : ctx.ahora,
          confirmado_por: pendiente ? null : empleoId,
          recibido_en: ctx.ahora,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    if (pendiente) {
      ctx.auditar({
        entidadId: pago.id,
        payload: { clienteId: entrada.clienteId, montoCentavos: entrada.montoCentavos, pendiente },
      });
      const saldoVivo = vivos.reduce((a, d) => a + d.saldoCentavos, 0n);
      return {
        pagoId: pago.id,
        aplicadoCentavos: '0',
        aCuentaCentavos: '0',
        documentosSaldados: 0,
        // El saldo NO baja. Devolver aquí el saldo ya restado sería mentirle a
        // la pantalla, que es donde el mostradorista lo lee en voz alta.
        saldoDespuesCentavos: saldoVivo.toString(),
        pendienteDeConfirmar: true,
      };
    }

    // La MISMA aplicación que usa la confirmación de una transferencia. Dos
    // copias es cómo una de las dos se queda sin la guarda optimista.
    const saldados = await aplicarReparto(ctx, pago.id, vivos, reparto.aplicaciones);

    if (sesionId !== null) {
      await ctx.paso('anotar_caja', () =>
        repoCaja.registrarMovimiento(ctx.tx, {
          organizacionId,
          sesionCajaId: sesionId,
          tipo: 'deposito',
          montoCentavos: BigInt(entrada.montoCentavos),
          motivo: 'pago de crédito',
          empleadoId: empleoId,
          // NO es `orden`: la venta se registró el día que se fió. Contarla otra
          // vez aquí duplicaría el ingreso del mes.
          referenciaTipo: 'pago_credito',
          referenciaId: pago.id,
        }),
      );
    }

    const aplicado = BigInt(entrada.montoCentavos) - reparto.sobranteCentavos;
    const saldoAntes = vivos.reduce((a, d) => a + d.saldoCentavos, 0n);

    ctx.auditar({
      entidadId: pago.id,
      payload: {
        clienteId: entrada.clienteId,
        montoCentavos: entrada.montoCentavos,
        documentos: reparto.aplicaciones.length,
        aCuentaCentavos: reparto.sobranteCentavos.toString(),
      },
    });

    return {
      pagoId: pago.id,
      aplicadoCentavos: aplicado.toString(),
      aCuentaCentavos: reparto.sobranteCentavos.toString(),
      documentosSaldados: saldados,
      saldoDespuesCentavos: (saldoAntes - aplicado).toString(),
      pendienteDeConfirmar: false,
    };
  },
});

/**
 * F-212 · Confirmar la transferencia, que es cuando de verdad baja el saldo.
 *
 * ── Por qué es un comando aparte y no una casilla ────────────────────────
 * Porque lo hace otra persona, en otro momento y mirando otra pantalla: el
 * dueño abre el banco el lunes por la mañana y va marcando. Meterlo en el cobro
 * pondría la decisión en manos de quien tiene al cliente enfrente, que es
 * exactamente quien no puede tomarla.
 *
 * ── Y por qué la aplicación pasa AQUÍ ────────────────────────────────────
 * Si el pago se hubiera aplicado al registrarse, confirmar sería un adorno: el
 * saldo ya habría bajado y el comprobante falso ya habría salido por la puerta
 * convertido en material. Lo que se confirma es lo que todavía no ha hecho
 * efecto.
 */
export const confirmarTransferencia = definirComando<
  Transaccion,
  typeof entradaConfirmarTransferencia,
  ResultadoConfirmacion
>({
  nombre: 'credito.confirmar_transferencia',
  entidad: 'pago_credito',
  escribe: true,
  roles: [...ROLES_DE_MURO],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaConfirmarTransferencia,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const pago = await ctx.paso('leer_pago', () =>
      ctx.tx
        .selectFrom('pagos_credito')
        .select(['id', 'cliente_id', 'monto_centavos', 'metodo', 'confirmado'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.pagoId)
        .executeTakeFirst(),
    );
    if (pago === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese pago no existe en este negocio.');
    }
    if (pago.metodo !== 'transferencia') {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Sólo las transferencias se confirman: lo demás ya entró al cajón.',
      );
    }
    // Confirmar dos veces aplicaría el pago dos veces y le regalaría el doble al
    // cliente. La guarda va aquí y no sólo en la pantalla: dos pestañas abiertas
    // son dos peticiones.
    if (pago.confirmado === true) {
      throw new ErrorDominio('CONFIGURACION_CONFLICTO', 'Esa transferencia ya estaba confirmada.');
    }

    const vivos = await documentosVivos(ctx, pago.cliente_id);
    const reparto = repartirPago(
      pago.monto_centavos,
      vivos.map((d) => ({ id: d.id, saldoCentavos: d.saldoCentavos, fecha: d.venceEn })),
    );

    const saldados = await aplicarReparto(ctx, pago.id, vivos, reparto.aplicaciones);

    await ctx.paso('confirmar', () =>
      ctx.tx
        .updateTable('pagos_credito')
        .set({
          confirmado: true,
          confirmado_en: ctx.ahora,
          confirmado_por: empleoId,
          a_cuenta_centavos: reparto.sobranteCentavos,
          referencia: entrada.referenciaBancaria ?? undefined,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.pagoId)
        .execute(),
    );

    ctx.auditar({
      entidadId: pago.id,
      payload: { clienteId: pago.cliente_id, documentos: reparto.aplicaciones.length },
    });
    return {
      pagoId: pago.id,
      aplicadoCentavos: (pago.monto_centavos - reparto.sobranteCentavos).toString(),
      aCuentaCentavos: reparto.sobranteCentavos.toString(),
      documentosSaldados: saldados,
    };
  },
});

/**
 * F-212 · Lo que hay que revisar antes de cerrar.
 *
 * Va EN el corte y no en una pantalla aparte: una lista que hay que acordarse
 * de abrir es una lista que no se abre, y entonces la transferencia de $12,000
 * se queda sin confirmar hasta que el cliente vuelve por más material.
 */
export const transferenciasPendientes = definirComando<
  Transaccion,
  typeof entradaPendientes,
  ResultadoPendientes
>({
  nombre: 'credito.transferencias_pendientes',
  entidad: 'pago_credito',
  escribe: false,
  roles: [...ROLES],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaPendientes,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const desde = new Date(ctx.ahora.getTime() - entrada.horas * 3_600_000);

    const filas = await ctx.paso('leer_pendientes', () =>
      ctx.tx
        .selectFrom('pagos_credito')
        .select(['id', 'cliente_id', 'monto_centavos', 'referencia', 'created_at'])
        .where('organizacion_id', '=', organizacionId)
        .where('metodo', '=', 'transferencia')
        .where('confirmado', '=', false)
        .where('created_at', '>=', desde)
        .orderBy('created_at', 'asc')
        .execute(),
    );

    return {
      pendientes: filas.map((f) => ({
        pagoId: f.id,
        clienteId: f.cliente_id,
        montoCentavos: f.monto_centavos.toString(),
        referencia: f.referencia,
        registradaEn: f.created_at.toISOString(),
        // Las horas esperando van en la lista: una transferencia de hace veinte
        // minutos y una de hace tres días no se revisan con la misma prisa.
        horasEsperando: Math.floor((ctx.ahora.getTime() - f.created_at.getTime()) / 3_600_000),
      })),
      totalCentavos: filas.reduce((a, f) => a + f.monto_centavos, 0n).toString(),
    };
  },
});

interface DocumentoVivo {
  readonly id: string;
  readonly saldoCentavos: bigint;
}

/**
 * Bajar el saldo de los documentos y dejar constancia de qué cubrió qué.
 *
 * Está fuera de los dos comandos porque el cobro en efectivo y la confirmación
 * de una transferencia aplican EXACTAMENTE igual. Tener dos copias es cómo una
 * de las dos se queda sin la guarda optimista y un documento acaba en negativo.
 */
async function aplicarReparto(
  ctx: ContextoComando<Transaccion>,
  pagoId: string,
  vivos: readonly DocumentoVivo[],
  aplicaciones: readonly { readonly documentoId: string; readonly montoCentavos: bigint }[],
): Promise<number> {
  const { organizacionId } = ctx.ambito;
  const saldoPrevio = new Map(vivos.map((d) => [d.id, d.saldoCentavos]));
  let saldados = 0;

  for (const aplicacion of aplicaciones) {
    const antes = saldoPrevio.get(aplicacion.documentoId) ?? 0n;
    const despues = antes - aplicacion.montoCentavos;
    // La guarda va EN el mismo `update`: leer primero y escribir después deja
    // una ventana en la que otro cobro del mismo cliente aplica sobre el saldo
    // viejo y el documento queda en negativo.
    const tocadas = await ctx.paso('aplicar', () =>
      ctx.tx
        .updateTable('documentos_credito')
        .set({ saldo_centavos: despues })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', aplicacion.documentoId)
        .where('saldo_centavos', '=', antes)
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      throw new ErrorDominio(
        'TOTAL_DESACTUALIZADO',
        'Ese saldo cambió mientras se aplicaba el pago. Vuelve a intentarlo.',
        { documentoId: aplicacion.documentoId },
      );
    }

    await ctx.paso('anotar_aplicacion', () =>
      ctx.tx
        .insertInto('aplicaciones_pago')
        .values({
          pago_id: pagoId,
          documento_id: aplicacion.documentoId,
          monto_centavos: aplicacion.montoCentavos,
        })
        .execute(),
    );

    if (despues === 0n) saldados += 1;
  }

  return saldados;
}

export const entradaCartera = z.object({
  /** Cuántos días antes se avisa. Tres es el del giro: avisar es un servicio. */
  diasDeAviso: z.number().int().min(0).max(30).default(3),
});

export interface ResultadoCartera {
  readonly porTramo: Readonly<Record<string, string>>;
  readonly totalCentavos: string;
  readonly vencidoCentavos: string;
  readonly diasDelMasViejo: number;
  readonly porVencer: readonly { readonly folio: string; readonly diasParaVencer: number }[];
}

/** F-613 y F-616 · La cartera entera por antigüedad, y a quién hay que avisar. */
export const carteraPorAntiguedad = definirComando<
  Transaccion,
  typeof entradaCartera,
  ResultadoCartera
>({
  nombre: 'credito.cartera',
  entidad: 'documento_credito',
  escribe: false,
  roles: [...ROLES_DE_MURO],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaCartera,
  async ejecutar(ctx, entrada) {
    const filas = await ctx.paso('leer_cartera', () =>
      ctx.tx
        .selectFrom('documentos_credito')
        .select(['id', 'folio', 'emitido_en', 'vence_en', 'importe_centavos', 'saldo_centavos'])
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('saldo_centavos', '>', 0n)
        .execute(),
    );

    const documentos = filas.map((f) => ({
      id: f.id,
      folio: f.folio,
      emitidoEn: f.emitido_en,
      venceEn: f.vence_en,
      importeCentavos: f.importe_centavos,
      saldoCentavos: f.saldo_centavos,
    }));

    const antiguedad = antiguedadDeSaldos(documentos, ctx.ahora);
    const avisos = avisosDeVencimiento(documentos, ctx.ahora, entrada.diasDeAviso);

    const porTramo: Record<string, string> = {};
    for (const [tramo, monto] of Object.entries(antiguedad.porTramo)) {
      porTramo[tramo] = monto.toString();
    }

    return {
      porTramo,
      totalCentavos: antiguedad.totalCentavos.toString(),
      vencidoCentavos: antiguedad.vencidoCentavos.toString(),
      diasDelMasViejo: antiguedad.diasDelMasViejo,
      porVencer: avisos.map((a) => ({ folio: a.folio, diasParaVencer: a.diasParaVencer })),
    };
  },
});

export const entradaMuro = z.object({
  clienteId: z.uuid(),
  bloquear: z.boolean(),
  motivo: z.string().trim().min(4).max(200),
});

export interface ResultadoMuro {
  readonly clienteId: string;
  readonly bloqueado: boolean;
}

/**
 * F-617 · Poner o quitar el muro por mora.
 *
 * ── SIEMPRE hay llave, y siempre es del dueño ────────────────────────────
 * Un bloqueo automático sin forma de levantarlo deja a un cliente bueno parado
 * en el mostrador por una factura que ya pagó y que nadie capturó. Lo pone una
 * persona, con motivo, y lo quita una persona, con motivo.
 */
export const fijarMuroDeCredito = definirComando<Transaccion, typeof entradaMuro, ResultadoMuro>({
  nombre: 'credito.fijar_muro',
  entidad: 'cliente',
  escribe: true,
  roles: [...ROLES_DE_MURO],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaMuro,
  async ejecutar(ctx, entrada) {
    await cargarCliente(ctx, entrada.clienteId);

    const tocadas = await ctx.paso('fijar_muro', () =>
      ctx.tx
        .updateTable('clientes')
        // `bloqueado_por_mora` y `motivo_bloqueo` en la MISMA escritura: el
        // `check` de la 161 lo exige, y un muro sin motivo no se puede levantar
        // delante del cliente.
        .set({
          bloqueado_por_mora: entrada.bloquear,
          bloqueado_en: entrada.bloquear ? ctx.ahora : null,
          bloqueado_por: entrada.bloquear ? ctx.ambito.empleoId : null,
          motivo_bloqueo: entrada.motivo,
        })
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('id', '=', entrada.clienteId)
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese cliente no existe en este negocio.');
    }

    ctx.auditar({
      entidadId: entrada.clienteId,
      payload: { bloqueado: entrada.bloquear, motivo: entrada.motivo },
    });

    return { clienteId: entrada.clienteId, bloqueado: entrada.bloquear };
  },
});

/** Se exporta para que la prueba pueda armar un contexto sin duplicar la carga. */
export type { ContextoComando };
