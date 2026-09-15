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
          a_cuenta_centavos: reparto.sobranteCentavos,
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    let saldados = 0;
    // El saldo que queda en cada documento se calcula aquí: `repartirPago`
    // devuelve cuánto se aplicó, y el saldo anterior lo sabe `vivos`.
    const saldoPrevio = new Map(vivos.map((d) => [d.id, d.saldoCentavos]));

    for (const aplicacion of reparto.aplicaciones) {
      const antes = saldoPrevio.get(aplicacion.documentoId) ?? 0n;
      const despues = antes - aplicacion.montoCentavos;
      // El saldo se decrementa con GUARDA en el mismo `update`: leer primero y
      // escribir después deja una ventana en la que otro cobro del mismo
      // cliente aplica sobre el saldo viejo y el documento queda en negativo.
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
            pago_id: pago.id,
            documento_id: aplicacion.documentoId,
            monto_centavos: aplicacion.montoCentavos,
          })
          .execute(),
      );

      if (despues === 0n) saldados += 1;
    }

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
    };
  },
});

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
