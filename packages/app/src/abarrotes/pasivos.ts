import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { repoCaja, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { aplicarPagoDeCredito, type ResultadoPagoCredito } from '../cartera/cobranza.ts';
import { anotarOperacionDeComision } from './comisionista.ts';
import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * El dinero que pasa por el cajón y NO es del negocio — F-254, F-255 y F-256.
 *
 * ── Lo que la reconciliación de E0 descubrió ──────────────────────────────
 * Cuatro funciones que cinco carpetas propusieron por separado son cuatro
 * PANTALLAS sobre un mismo objeto. El ledger lo construyó E2 (migración 063);
 * esto es la capa que lo usa, y es la prueba de que valía la pena: los tres
 * comandos de aquí son el mismo movimiento con distinta naturaleza.
 *
 * ── La regla de dinero, que es la misma para los tres ─────────────────────
 * **Nada de esto es venta.** No suma a ventas, no suma a utilidad, no suma a
 * margen y no entra al costo. Hoy, en `abarrotes`, las recargas o se registran
 * como venta —y destruyen el margen reportado, porque la mitad de lo que pasa
 * por el cajón no es suyo— o no se registran —y el cajón sobra cada noche—.
 * Las dos opciones son malas y hoy sólo existen esas dos.
 *
 * ── Lo que SÍ es ingreso, y va por su lado ────────────────────────────────
 * La COMISIÓN. De los $200 de una recarga, $200 son del proveedor y los $6 de
 * comisión son del negocio. Se separan en el mismo comando porque separarlos
 * después es lo que nadie hace.
 */

const IMPORTE = z.number().int().min(1).max(100_000_000);

export const entradaRegistrarComision = z.object({
  tipo: z.enum(['recarga', 'pago_servicio', 'paqueteria', 'retiro_efectivo']),
  proveedorServicio: z.string().trim().min(2).max(60),
  /** Teléfono, número de recibo, guía. Es lo que el cliente reclama si falla. */
  referencia: z.string().trim().min(3).max(60),
  /** Lo que el cliente entrega. ENTRA al cajón y NO es venta. */
  montoRecibidoCentavos: IMPORTE,
  /** Lo que el negocio se queda. ESTO sí es ingreso. */
  comisionNegocioCentavos: z.number().int().min(0).max(10_000_000),
});

export const entradaAbonoFiado = z.object({
  clienteId: z.uuid(),
  montoCentavos: IMPORTE,
  metodo: z.enum(['efectivo', 'tarjeta', 'transferencia']),
  nota: z.string().trim().min(1).max(200).optional(),
});

export const entradaDepositoEnvase = z.object({
  /** Positivo cobra el depósito; el comando de devolución lo salda. */
  montoCentavos: IMPORTE,
  cantidad: z.number().int().min(1).max(500),
  productoId: z.uuid().optional(),
  devolucion: z.boolean().default(false),
});

export interface ResultadoPasivo {
  readonly pasivoId: string;
  readonly naturaleza: string;
  readonly montoCentavos: string;
  readonly saldoCentavos: string;
}

export interface ResultadoComision {
  readonly pasivoId: string;
  readonly montoRecibidoCentavos: string;
  readonly comisionNegocioCentavos: string;
  readonly saldoDelProveedorCentavos: string;
  /**
   * Lo que queda del saldo prepagado con ESE proveedor, después de esta operación.
   *
   * Es el número que el tendero mira a las nueve de la noche —«¿me queda saldo de
   * Telcel para la noche?»— y hasta hoy no lo devolvía nadie, porque nadie escribía
   * en `saldos_comisionista`: la tabla existía desde la 095 sin un solo consumidor.
   */
  readonly saldoDelComisionistaCentavos: string;
}

const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const registrarComision = definirComando<
  Transaccion,
  typeof entradaRegistrarComision,
  ResultadoComision
>({
  nombre: 'comision.registrar',
  entidad: 'pasivo_tercero',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaRegistrarComision,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    if (entrada.comisionNegocioCentavos >= entrada.montoRecibidoCentavos) {
      // Una comisión que se come el importe entero es un tecleo: significaría
      // que el cliente pagó $200 y el proveedor no recibe nada.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'La comisión no puede ser igual o mayor que lo que el cliente entregó.',
        { recibido: entrada.montoRecibidoCentavos, comision: entrada.comisionNegocioCentavos },
      );
    }

    const caja = await cajaDelTurno(ctx);

    // Lo que se le debe al proveedor es lo recibido MENOS la comisión: el
    // negocio se queda su parte en el mismo acto, y guardarla como deuda para
    // descontarla después es lo que hace que nunca se descuente.
    const aTerceros = BigInt(entrada.montoRecibidoCentavos - entrada.comisionNegocioCentavos);

    const pasivo = await ctx.paso('anotar_pasivo', () =>
      ctx.tx
        .insertInto('pasivos_terceros')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: caja.sucursalId,
          naturaleza: 'servicio_terceros',
          titular_tipo: 'proveedor',
          // El proveedor de servicio no está en `proveedores`: es Telcel, es
          // CFE. Se identifica por nombre y por eso el titular se guarda como
          // un uuid derivado estable en vez de un texto suelto — el ledger
          // exige id, y un id inventado por fila haría que cada recarga fuera
          // de un proveedor distinto.
          titular_id: uuidDeProveedor(entrada.proveedorServicio),
          monto_centavos: aTerceros,
          referencia_tipo: entrada.tipo,
          sesion_caja_id: caja.sesionId,
          motivo: `${entrada.proveedorServicio} · ${entrada.referencia}`,
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    // El movimiento de caja GEMELO. Entró dinero al cajón: sin esta fila el
    // arqueo no puede explicar de dónde salió, que es el descuadre número uno
    // de este giro.
    await ctx.paso('anotar_caja', () =>
      repoCaja.registrarMovimiento(ctx.tx, {
        organizacionId,
        sesionCajaId: caja.sesionId,
        tipo: 'deposito',
        montoCentavos: BigInt(entrada.montoRecibidoCentavos),
        motivo: `${entrada.tipo}: ${entrada.proveedorServicio} ${entrada.referencia}`,
        empleadoId: empleoId,
        referenciaTipo: 'pasivo',
        referenciaId: pasivo.id,
      }),
    );

    // ── Y LA OPERACIÓN, en las tablas que la 095 dejó escritas y sin usar ──
    //
    // `comisionistas`, `operaciones_comision` y `saldos_comisionista` existen desde
    // la migración 095 y **nadie las leía ni las escribía**: ni un comando, ni una
    // pantalla, ni un reporte. Por eso `abarrotes/Servicios` tenía
    // `Promise.resolve([])` donde debería ir su consulta y el panel «Saldo de
    // recargas» no se llenaba nunca.
    //
    // El pasivo de arriba sigue siendo el ledger —lo que se le debe al
    // proveedor—; esto es la OPERACIÓN, con sus importes separados y con el saldo
    // que la pantalla mira a las nueve de la noche.
    const operacion = await anotarOperacionDeComision(ctx, {
      pasivoId: pasivo.id,
      sucursalId: caja.sucursalId,
      sesionCajaId: caja.sesionId,
      tipo: entrada.tipo,
      proveedorServicio: entrada.proveedorServicio,
      referencia: entrada.referencia,
      montoRecibidoCentavos: entrada.montoRecibidoCentavos,
      comisionNegocioCentavos: entrada.comisionNegocioCentavos,
    });

    const saldo = await saldoDe(
      ctx,
      'servicio_terceros',
      'proveedor',
      uuidDeProveedor(entrada.proveedorServicio),
    );

    ctx.auditar({
      entidadId: pasivo.id,
      payload: {
        tipo: entrada.tipo,
        proveedor: entrada.proveedorServicio,
        referencia: entrada.referencia,
        // Los dos importes, separados. Es el registro que hoy no existe.
        recibidoCentavos: entrada.montoRecibidoCentavos,
        comisionCentavos: entrada.comisionNegocioCentavos,
      },
    });

    return {
      pasivoId: pasivo.id,
      montoRecibidoCentavos: entrada.montoRecibidoCentavos.toString(),
      comisionNegocioCentavos: entrada.comisionNegocioCentavos.toString(),
      saldoDelProveedorCentavos: saldo.toString(),
      saldoDelComisionistaCentavos: operacion.saldoCentavos.toString(),
    };
  },
});

/**
 * F-254 · EL ABONO DE FIADO, SOBRE LA CARTERA (C.10 de la 2.4).
 *
 * ── El defecto ─────────────────────────────────────────────────────────────
 * Esto anotaba el abono en `pasivos_terceros`, un libro que NADIE lee: la pantalla del fiado
 * lee `CarteraFiado`, que suma `documentos_credito`, y el corte cuenta la cobranza en
 * `pagos_credito`. La ficha bajaba el saldo en la pantalla y, al recargar, la deuda volvía
 * entera; el abono no salía como cobranza en el corte. El cliente pagaba y seguía debiendo.
 *
 * Ahora es el MISMO pago de la cartera que usa la ferretería (`aplicarPagoDeCredito`): se
 * aplica a lo más viejo, el efectivo entra al cajón como depósito —no como venta: la venta
 * se contó el día que se fió— y la transferencia queda por confirmar hasta que alguien mire
 * el banco. El nombre del comando se queda: es el que declara el `05-DATOS-Y-BACKEND`.
 */
export const registrarAbonoFiado = definirComando<
  Transaccion,
  typeof entradaAbonoFiado,
  ResultadoPagoCredito
>({
  nombre: 'fiado.registrar_abono',
  entidad: 'pago_credito',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaAbonoFiado,
  async ejecutar(ctx, entrada) {
    const pago = await aplicarPagoDeCredito(ctx, {
      clienteId: entrada.clienteId,
      montoCentavos: entrada.montoCentavos,
      metodo: entrada.metodo,
      ...(entrada.nota === undefined ? {} : { referencia: entrada.nota.slice(0, 60) }),
    });
    ctx.auditar({
      entidadId: pago.pagoId,
      payload: {
        clienteId: entrada.clienteId,
        montoCentavos: entrada.montoCentavos,
        metodo: entrada.metodo,
        saldoDespuesCentavos: pago.saldoDespuesCentavos,
        pendiente: pago.pendienteDeConfirmar,
      },
    });
    return pago;
  },
});

export const moverDepositoEnvase = definirComando<
  Transaccion,
  typeof entradaDepositoEnvase,
  ResultadoPasivo
>({
  nombre: 'envase.mover_deposito',
  entidad: 'pasivo_tercero',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaDepositoEnvase,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;
    const caja = await cajaDelTurno(ctx);

    // El casco se le debe a QUIEN TRAIGA EL ENVASE: no se sabe quién es, y por
    // eso el ledger admite un titular sin id. Inventarle un cliente convertiría
    // una deuda al portador en una deuda nominal que nadie podría cobrar.
    const monto = entrada.devolucion
      ? -BigInt(entrada.montoCentavos)
      : BigInt(entrada.montoCentavos);

    const pasivo = await ctx.paso('anotar_pasivo', () =>
      ctx.tx
        .insertInto('pasivos_terceros')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: caja.sucursalId,
          naturaleza: 'envase_retornable',
          titular_tipo: 'portador',
          titular_id: null,
          monto_centavos: monto,
          referencia_tipo: entrada.devolucion ? 'devolucion_envase' : 'deposito_envase',
          referencia_id: entrada.productoId ?? null,
          sesion_caja_id: caja.sesionId,
          motivo: `${String(entrada.cantidad)} envase(s)`,
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    await ctx.paso('anotar_caja', () =>
      repoCaja.registrarMovimiento(ctx.tx, {
        organizacionId,
        sesionCajaId: caja.sesionId,
        // Devolver el casco SACA dinero del cajón. Registrarlo como depósito
        // dejaría el arqueo sobrando exactamente lo que se devolvió.
        tipo: entrada.devolucion ? 'retiro' : 'deposito',
        montoCentavos: BigInt(entrada.montoCentavos),
        motivo: entrada.devolucion ? 'devolución de envase' : 'depósito de envase',
        empleadoId: empleoId,
        referenciaTipo: 'pasivo',
        referenciaId: pasivo.id,
      }),
    );

    const saldo = await saldoDe(ctx, 'envase_retornable', 'portador', null);

    ctx.auditar({
      entidadId: pasivo.id,
      payload: {
        cantidad: entrada.cantidad,
        devolucion: entrada.devolucion,
        montoCentavos: entrada.montoCentavos,
      },
    });

    return {
      pasivoId: pasivo.id,
      naturaleza: 'envase_retornable',
      montoCentavos: monto.toString(),
      saldoCentavos: saldo.toString(),
    };
  },
});

interface CajaDelTurno {
  readonly sesionId: string;
  readonly sucursalId: string;
}

/**
 * El turno en el que cae este movimiento.
 *
 * Sin caja abierta no se registra: el dinero ajeno entra al cajón igual que el
 * propio, y un pasivo sin turno es un importe que el arqueo de esa noche no
 * puede explicar.
 */
async function cajaDelTurno(ctx: ContextoComando<Transaccion>): Promise<CajaDelTurno> {
  const { organizacionId, sucursalId, terminalId } = ctx.ambito;

  if (terminalId === null || sucursalId === null) {
    throw new ErrorDominio(
      'VENTA_SIN_TERMINAL',
      'Esto entra al cajón: hace falta una terminal con su sucursal.',
    );
  }

  const sesion = await ctx.paso('cargar_caja', () =>
    repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
  );
  if (sesion === null) {
    throw new ErrorDominio('CAJA_CERRADA', 'Abre la caja antes de registrar esto.');
  }

  return { sesionId: sesion.id, sucursalId };
}

/** El saldo vivo de un titular, derivado del ledger. Nunca de una columna. */
async function saldoDe(
  ctx: ContextoComando<Transaccion>,
  naturaleza: string,
  titularTipo: string,
  titularId: string | null,
): Promise<bigint> {
  let consulta = ctx.tx
    .selectFrom('pasivos_terceros')
    .select(['monto_centavos as monto'])
    .where('organizacion_id', '=', ctx.ambito.organizacionId)
    .where('naturaleza', '=', naturaleza)
    .where('titular_tipo', '=', titularTipo);

  consulta =
    titularId === null
      ? consulta.where('titular_id', 'is', null)
      : consulta.where('titular_id', '=', titularId);

  const filas = await ctx.paso('sumar_saldo', () => consulta.execute());
  return filas.reduce((a, f) => a + f.monto, 0n);
}

/**
 * Un uuid ESTABLE para un proveedor de servicio que no está en `proveedores`.
 *
 * Telcel y CFE no son proveedores de mercancía: no tienen ficha, no se les
 * compra y no se les paga una factura. Pero el ledger exige un titular con id, y
 * generar uno nuevo por movimiento haría que cada recarga fuera de un proveedor
 * distinto y que el saldo no se pudiera sumar. Se deriva del nombre, en
 * minúsculas y sin espacios, para que «Telcel» y «telcel » sean el mismo.
 */
export function uuidDeProveedor(nombre: string): string {
  const limpio = nombre.trim().toLowerCase().replace(/\s+/g, ' ');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < limpio.length; i += 1) {
    h1 = Math.imul(h1 ^ limpio.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + limpio.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  const hex = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(2);
  // Versión 4 y variante 8, para que sea un uuid válido aunque sea derivado.
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
