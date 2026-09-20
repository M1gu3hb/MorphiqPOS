import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { repoCaja, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

// El MISMO derivado que usa `registrarComision`. Dos copias del hash darían dos
// titulares para «Telcel» el día que una de las dos normalizara distinto, y el
// saldo del proveedor se partiría en dos sin que nadie lo viera.
import { uuidDeProveedor } from './pasivos.ts';

/**
 * F-255 · Entregar el dinero ajeno, que es la otra mitad de cobrarlo.
 *
 * ── Sin esto, el pasivo crece para siempre ───────────────────────────────
 * `registrarComision` anota lo que entra: los $500 del recibo de la luz son de
 * la CFE, no de la tienda. Pero ese dinero SALE —se deposita, lo recoge el
 * repartidor, se transfiere—, y si nadie lo registra el saldo de terceros sube
 * todos los días y a los tres meses dice que la tienda le debe $180,000 a
 * Telcel. Un número que todo el mundo sabe que está mal es un número que nadie
 * mira, y con él se apaga la función entera.
 *
 * ── Va al MISMO ledger, con signo contrario ──────────────────────────────
 * Y no a una tabla de «depósitos». Dos tablas que se restan para obtener un
 * saldo es exactamente cómo se le paga dos veces a alguien: basta con que una
 * consulta se olvide de una de las dos.
 *
 * ── No se puede depositar más de lo que se debe ──────────────────────────
 * Un depósito mayor que el pasivo deja el saldo en negativo, que en este ledger
 * significa que el proveedor le debe a la tienda — y nunca es verdad: es un
 * cero de más al teclear, o el depósito de otro proveedor puesto en éste.
 *
 * ── Y el dinero SALE del cajón ───────────────────────────────────────────
 * Con su movimiento de caja, como retiro. Sin esa fila, el arqueo de la noche
 * encuentra $4,000 de menos y nadie sabe por qué: es el descuadre que hace que
 * el cajero deje de confiar en el corte.
 */

const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaDepositarComision = z.object({
  /** El mismo nombre con que se registró el cobro: «Telcel», «CFE». */
  proveedorServicio: z.string().trim().min(2).max(60),
  montoCentavos: z.number().int().min(1).max(1_000_000_000),
  medio: z.enum(['efectivo', 'transferencia', 'deposito_bancario', 'recoleccion']),
  referencia: z.string().trim().max(60).nullable().default(null),
});

export interface ResultadoDeposito {
  readonly pasivoId: string;
  readonly montoCentavos: string;
  /** Lo que sigue debiéndose después de esto. Cero es la meta del día. */
  readonly saldoDelProveedorCentavos: string;
  /** `true` sólo cuando salió del cajón: lo demás ya estaba en el banco. */
  readonly tocoElCajon: boolean;
}

export const depositarComision = definirComando<
  Transaccion,
  typeof entradaDepositarComision,
  ResultadoDeposito
>({
  nombre: 'comision.depositar',
  entidad: 'pasivo_tercero',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaDepositarComision,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId, terminalId } = ctx.ambito;

    const titularId = uuidDeProveedor(entrada.proveedorServicio);

    const movimientos = await ctx.paso('leer_pasivo', () =>
      ctx.tx
        .selectFrom('pasivos_terceros')
        .select(['monto_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where('naturaleza', '=', 'servicio_terceros')
        .where('titular_tipo', '=', 'proveedor')
        .where('titular_id', '=', titularId)
        .execute(),
    );

    const saldoAntes = movimientos.reduce((suma, m) => suma + m.monto_centavos, 0n);
    const monto = BigInt(entrada.montoCentavos);
    if (monto > saldoAntes) {
      // El saldo en negativo diría que el proveedor le debe a la tienda, y eso
      // nunca es verdad: es un cero de más, o el depósito de otro proveedor
      // puesto en éste.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        `A «${entrada.proveedorServicio}» se le deben menos: no se puede depositar de más.`,
        { saldoCentavos: saldoAntes.toString() },
      );
    }

    // El efectivo SALE del cajón y necesita caja abierta; una transferencia ya
    // estaba en el banco y exigirla dejaría al dueño sin poder registrar un
    // depósito que hizo desde el teléfono un domingo.
    let sesionId: string | null = null;
    if (entrada.medio === 'efectivo' || entrada.medio === 'recoleccion') {
      if (terminalId === null) {
        throw new ErrorDominio(
          'VENTA_SIN_TERMINAL',
          'El efectivo sale del cajón: hace falta una terminal con su caja abierta.',
        );
      }
      const sesion = await ctx.paso('cargar_caja', () =>
        repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
      );
      if (sesion === null) {
        throw new ErrorDominio('CAJA_CERRADA', 'Abre la caja antes de sacar el efectivo.');
      }
      sesionId = sesion.id;
    }

    // NEGATIVO en el mismo ledger. Una tabla aparte de depósitos obligaría a
    // restar dos tablas para saber el saldo, y basta con que una consulta se
    // olvide de una para pagarle dos veces a alguien.
    const pasivo = await ctx.paso('anotar_entrega', () =>
      ctx.tx
        .insertInto('pasivos_terceros')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          naturaleza: 'servicio_terceros',
          titular_tipo: 'proveedor',
          titular_id: titularId,
          monto_centavos: -monto,
          referencia_tipo: 'entrega',
          sesion_caja_id: sesionId,
          motivo: `entrega a ${entrada.proveedorServicio}${
            entrada.referencia === null ? '' : ` · ${entrada.referencia}`
          }`,
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    if (sesionId !== null) {
      await ctx.paso('anotar_caja', () =>
        repoCaja.registrarMovimiento(ctx.tx, {
          organizacionId,
          sesionCajaId: sesionId,
          tipo: 'retiro',
          // Negativo: sale del cajón. Sin esta fila el arqueo de la noche
          // encuentra $4,000 de menos y nadie sabe por qué.
          montoCentavos: -monto,
          motivo: `entrega a ${entrada.proveedorServicio}`,
          empleadoId: empleoId,
          referenciaTipo: 'pasivo',
          referenciaId: pasivo.id,
        }),
      );
    }

    ctx.auditar({
      entidadId: pasivo.id,
      payload: {
        proveedor: entrada.proveedorServicio,
        montoCentavos: entrada.montoCentavos,
        medio: entrada.medio,
      },
    });
    return {
      pasivoId: pasivo.id,
      montoCentavos: entrada.montoCentavos.toString(),
      saldoDelProveedorCentavos: (saldoAntes - monto).toString(),
      tocoElCajon: sesionId !== null,
    };
  },
});
