import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import { repoCaja, repoFolios, type Transaccion } from '@morphiqpos/data';
import {
  calcularComision,
  type ComisionCausada,
  type LineaComisionable,
  type ReglaComision,
} from '@morphiqpos/domain/agenda';
import { evaluarDescuento, type ReglaImpuesto } from '@morphiqpos/domain/venta';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';
import { Rechazo } from '../fallos.ts';
import { MAXIMO_PROPINA_CENTAVOS } from '../propinas/esquemas.ts';
import { registrarPagoConPropina } from '../propinas/cobro.ts';
import { impuestoDe } from '../venta/cotizar.ts';
import { topeDe } from '../venta/descuento.ts';
import {
  CAMINOS_DE_PROPINA,
  baseDeLinea,
  cuentaDeCita,
  propinasPorCamino,
  type BaseDeLinea,
  type CuentaDeCita,
  type PropinaPedida,
} from './cuenta-de-cita.ts';

/**
 * `venta.cobrar_cita` — la transacción más grande del modelo.
 *
 * ── Lo que pasa en un solo BEGIN ─────────────────────────────────────────
 * Orden y líneas con el profesional en CADA una → comisiones causadas con la
 * regla VIGENTE AL MOMENTO → pagos y cajón → anticipo aplicado → propinas a nombre
 * de quien las recibió → estado de la cita. **Si algo falla, no queda nada.**
 * Media transacción aquí es una orden sin comisión —y la estilista lo descubre el
 * domingo— o una comisión sin orden, que nadie puede explicar.
 *
 * ── Los importes los calcula el SERVIDOR ─────────────────────────────────
 * La entrada trae qué cita se cobra, no cuánto cuesta. Los precios ya están
 * congelados en `cita_servicios` desde que se agendó, que es el trato con la
 * clienta; aceptarlos del navegador dejaría que el mostrador decidiera el
 * precio del tinte. Del navegador viene el PORCENTAJE de descuento —que se
 * comprueba contra el tope del puesto— y el reparto entre métodos, que tiene que
 * sumar lo que queda por cobrar.
 *
 * ── Por qué la comisión se causa AL COBRAR y no al cerrar el servicio ────
 * Porque la base de la comisión es lo COBRADO —o la lista, o la mitad, según la
 * regla— y eso no existe hasta que hay un cobro. Causarla al cerrar obligaría a
 * recalcularla después, y recalcular una comisión ya causada es exactamente lo
 * que el ledger de F-443 viene a impedir.
 *
 * ── Y por qué la regla se lee con su VERSIÓN ────────────────────────────
 * Lo ya causado no se recalcula jamás. Si el mes que viene sube el porcentaje,
 * lo de hoy se queda como está y la fila dice con qué versión se calculó.
 *
 * ── C.3 de la etapa 2.4: lo que la pantalla capturaba y aquí no existía ──
 * La propina se pedía y se tiraba; una cita con anticipo no se podía cobrar; no
 * había descuento; la orden guardaba el IVA en cero y la comisión se calculaba
 * sobre el precio CON IVA. Todo contra `02-DINERO-Y-CAJA` del salón, cuyas
 * secciones se citan donde se aplican.
 */

const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

const IMPORTE = z.number().int().min(1).max(100_000_000);

/** El porcentaje de descuento en puntos base: 10 % es 1000. */
const DESCUENTO_BP = z.number().int().min(0).max(10_000);

export const entradaCobrarCita = z.object({
  citaId: z.uuid(),
  /**
   * Cómo se pagó. El importe NO viene de aquí: viene de los precios congelados.
   * Lo que sí viene es el reparto entre métodos —un pago mixto son varias filas—,
   * que el servidor comprueba que sume lo que queda por cobrar. Vacío sólo cuando
   * el anticipo cubre la cita entera.
   */
  pagos: z
    .array(
      z.object({
        metodo: z.enum(['efectivo', 'tarjeta', 'transferencia']),
        montoCentavos: IMPORTE,
        /**
         * Sólo en transferencia: a la cuenta de QUÉ profesional cayó, si no fue a la
         * del salón. Es el descuadre 1 del documento: preguntarlo sin juicio convierte
         * una fuga en un flujo declarado, y se le descuenta de su liquidación.
         */
        aCuentaDe: z.uuid().optional(),
        /** Sólo en transferencia: «pendiente de confirmar en el banco». */
        porConfirmar: z.boolean().optional(),
      }),
    )
    .max(4),
  descuentoBp: DESCUENTO_BP.optional(),
  /**
   * Las propinas, cada una con su destinataria y su camino (§4.2). Hasta cuatro:
   * la principal y la de apoyo —«la clienta le da $50 a quien la lavó»— caben de
   * sobra, y el reparto es el que dijo la clienta, no uno que calcule el sistema.
   */
  propinas: z
    .array(
      z.object({
        profesionalId: z.uuid(),
        montoCentavos: z.number().int().min(1).max(MAXIMO_PROPINA_CENTAVOS),
        camino: z.enum(CAMINOS_DE_PROPINA),
      }),
    )
    .max(4)
    .optional(),
});

export const entradaCotizarCita = z.object({
  citaId: z.uuid(),
  descuentoBp: DESCUENTO_BP.optional(),
});

export interface ComisionDeLinea {
  readonly profesionalId: string;
  readonly citaServicioId: string;
  readonly baseCentavos: string;
  readonly tasaBp: number;
  readonly montoCentavos: string;
}

export interface ResultadoCobroCita {
  readonly citaId: string;
  readonly ordenId: string;
  readonly folio: string;
  readonly totalCentavos: string;
  readonly descuentoCentavos: string;
  readonly impuestosCentavos: string;
  readonly anticipoCentavos: string;
  readonly propinaCentavos: string;
  readonly comisiones: readonly ComisionDeLinea[];
}

/** Lo que la comisión de UNA persona hace con el descuento: la frase del §3. */
export interface ImpactoEnComision {
  readonly profesionalId: string;
  readonly sinDescuentoCentavos: string;
  readonly conDescuentoCentavos: string;
}

export interface CotizacionDeCita {
  readonly citaId: string;
  readonly listaCentavos: string;
  readonly descuentoCentavos: string;
  readonly impuestosCentavos: string;
  readonly totalCentavos: string;
  readonly anticipoCentavos: string;
  readonly porCobrarCentavos: string;
  /** `null` cuando el descuento cabe en el tope de quien cobra. */
  readonly descuentoPasaDelTope: {
    readonly topeCentavos: string;
    readonly topeBp: number;
  } | null;
  readonly comisiones: readonly ImpactoEnComision[];
  /** Si hay caja abierta en ESTA terminal. Sin ella no se cobra: es el muro. */
  readonly cajaAbierta: boolean;
}

interface ServicioACobrar {
  readonly id: string;
  readonly servicioId: string;
  readonly profesionalId: string;
  readonly precio: bigint;
  readonly nombre: string | null;
}

interface CuentaLeida {
  readonly cita: { readonly clienteId: string | null; readonly esRehacer: boolean };
  readonly servicios: readonly ServicioACobrar[];
  readonly impuesto: ReglaImpuesto;
  readonly anticipoId: string | null;
  readonly cuenta: CuentaDeCita;
}

/**
 * Lee la cita, sus servicios, la regla de IVA y el anticipo vivo, y saca la cuenta.
 *
 * La comparten el cobro y la cotización: si la pantalla y el cobro calcularan en
 * dos sitios, la estilista vería un número y cobraría otro. `bloquear` sólo en el
 * cobro: el anticipo se lee `for update` porque se va a aplicar en esta misma
 * transacción, y dos cobros a la vez no pueden descontar el mismo.
 */
async function leerCuenta(
  ctx: ContextoComando<Transaccion>,
  citaId: string,
  descuentoBp: number,
  bloquear: boolean,
): Promise<CuentaLeida> {
  const { organizacionId } = ctx.ambito;

  const cita = await ctx.paso('cargar_cita', () =>
    ctx.tx
      .selectFrom('citas')
      .select(['id', 'folio', 'estado', 'cliente_id as clienteId', 'es_rehacer as esRehacer'])
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', citaId)
      .executeTakeFirst(),
  );
  if (cita === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa cita no existe en este negocio.');
  }
  if (cita.estado === 'cobrada') {
    throw new ErrorDominio('ORDEN_NO_EDITABLE', 'Esa cita ya se cobró.');
  }
  if (cita.estado === 'no_llego' || cita.estado === 'cancelada') {
    // Cobrar lo que no se dio. Sin esta guarda, un tecleo convierte un
    // no-show en una venta con su comisión, y el reporte del día miente hacia
    // arriba justo en la cifra que se usa para decidir contrataciones.
    throw new ErrorDominio('ORDEN_NO_EDITABLE', 'Esa cita no se atendió: no hay nada que cobrar.', {
      estado: cita.estado,
    });
  }

  const servicios = await ctx.paso('cargar_servicios', () =>
    ctx.tx
      .selectFrom('cita_servicios as cs')
      .leftJoin('productos as p', 'p.id', 'cs.servicio_id')
      .select([
        'cs.id as id',
        'cs.servicio_id as servicioId',
        'cs.profesional_id as profesionalId',
        'cs.precio_centavos as precio',
        'cs.estado as estado',
        'p.nombre as nombre',
      ])
      .where('cs.organizacion_id', '=', organizacionId)
      .where('cs.cita_id', '=', citaId)
      .where('cs.estado', '<>', 'cancelado')
      .execute(),
  );
  if (servicios.length === 0) {
    throw new ErrorDominio('ORDEN_VACIA', 'Esa cita no tiene servicios que cobrar.');
  }

  // La regla del NEGOCIO, dentro de la misma transacción que cobra: un salón en la
  // franja fronteriza cobra el 8 %, y la tasa fija del 16 % se lo inventaba.
  const impuesto = await ctx.paso('leer_impuesto', () => impuestoDe(ctx.tx, organizacionId));

  const anticipo = await ctx.paso('leer_anticipo', () => {
    const consulta = ctx.tx
      .selectFrom('anticipos_cita')
      .select(['id', 'monto_centavos as monto'])
      .where('organizacion_id', '=', organizacionId)
      .where('cita_id', '=', citaId)
      .where('estado', '=', 'vivo');
    return (bloquear ? consulta.forUpdate() : consulta).executeTakeFirst();
  });

  const cuenta = cuentaDeCita(
    servicios.map((s) => s.precio),
    descuentoBp,
    anticipo?.monto ?? 0n,
    impuesto,
  );

  return {
    cita: { clienteId: cita.clienteId, esRehacer: cita.esRehacer },
    servicios,
    impuesto,
    anticipoId: anticipo?.id ?? null,
    cuenta,
  };
}

/**
 * ¿Cabe el descuento en el tope del puesto de quien cobra? (F-205, §3)
 *
 * Devuelve el tope que se pasó, o `null`. Los topes son los de `topes_descuento`
 * —los mismos de la venta de mostrador—, y sin fila el tope es CERO: una
 * organización sin topes configurados no es una sin límite.
 */
async function topePasado(
  ctx: ContextoComando<Transaccion>,
  cuenta: CuentaDeCita,
): Promise<{ readonly topeCentavos: bigint; readonly topeBp: number } | null> {
  if (cuenta.descuentoCentavos === 0n) return null;
  const tope = await topeDe(ctx, ctx.ambito.rol);
  const veredicto = evaluarDescuento({
    baseCentavos: cuenta.listaCentavos,
    descuentoCentavos: cuenta.descuentoCentavos,
    tope,
  });
  return veredicto.veredicto === 'libre'
    ? null
    : { topeCentavos: veredicto.topeCentavos, topeBp: veredicto.topeBp };
}

/**
 * Cómo queda escrita la transferencia en `pagos.referencia`, o `null` en otro método.
 *
 * `cuenta-salon` o `cuenta-profesional:<id>`, más `por-confirmar` si todavía no se
 * ve en el banco. Texto y no columnas nuevas porque `pagos` ya tiene su referencia
 * libre y esto es lo que el corte y la liquidación necesitan leer de ella.
 */
export function referenciaDeTransferencia(pago: {
  readonly metodo: string;
  readonly aCuentaDe?: string | undefined;
  readonly porConfirmar?: boolean | undefined;
}): string | null {
  if (pago.metodo !== 'transferencia') return null;
  const cuenta =
    pago.aCuentaDe === undefined ? 'cuenta-salon' : `cuenta-profesional:${pago.aCuentaDe}`;
  return pago.porConfirmar === true ? `${cuenta} por-confirmar` : cuenta;
}

/**
 * Que cada persona que el cobro nombra —la destinataria de una propina, la dueña de
 * la cuenta que recibió una transferencia— sea del salón, antes de escribir nada.
 */
async function exigirProfesionales(
  ctx: ContextoComando<Transaccion>,
  nombradas: readonly string[],
): Promise<void> {
  const ids = [...new Set(nombradas)];
  if (ids.length === 0) return;
  const encontradas = await ctx.paso('cargar_destinatarias', () =>
    ctx.tx
      .selectFrom('profesionales')
      .select(['id'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', 'in', ids)
      .execute(),
  );
  if (encontradas.length !== ids.length) {
    throw new ErrorDominio(
      'PUENTE_NO_ENCONTRADO',
      'El cobro nombra a alguien que no atiende en este salón: revisa la propina y la cuenta de la transferencia.',
    );
  }
}

export const cotizarCita = definirComando<Transaccion, typeof entradaCotizarCita, CotizacionDeCita>(
  {
    nombre: 'venta.cotizar_cita',
    entidad: 'cita',
    escribe: false,
    roles: [...ROLES],
    paquetes: PAQUETES_TODOS,
    entrada: entradaCotizarCita,
    async ejecutar(ctx, entrada) {
      const { cita, servicios, impuesto, cuenta } = await leerCuenta(
        ctx,
        entrada.citaId,
        entrada.descuentoBp ?? 0,
        false,
      );
      const pasado = await topePasado(ctx, cuenta);
      const { organizacionId, terminalId } = ctx.ambito;
      const sesion =
        terminalId === null
          ? null
          : await ctx.paso('cargar_caja', () =>
              repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
            );

      // La comisión de cada persona, sin y con el descuento: es la frase que el §3
      // pone ANTES de aplicar. Con el mismo cálculo que el cobro, sin escribir nada.
      const porPersona = new Map<string, { sin: bigint; con: bigint }>();
      for (const [indice, servicio] of servicios.entries()) {
        const datos = {
          citaServicioId: servicio.id,
          profesionalId: servicio.profesionalId,
          servicioId: servicio.servicioId,
          esRehacer: cita.esRehacer,
        };
        const sin = await calcularComisionDeLinea(ctx, {
          ...datos,
          base: baseDeLinea(servicio.precio, 0n, impuesto),
        });
        const con = await calcularComisionDeLinea(ctx, {
          ...datos,
          base: baseDeLinea(servicio.precio, cuenta.descuentoPorLinea[indice] ?? 0n, impuesto),
        });
        const previa = porPersona.get(servicio.profesionalId) ?? { sin: 0n, con: 0n };
        porPersona.set(servicio.profesionalId, {
          sin: previa.sin + (sin?.calculada.montoCentavos ?? 0n),
          con: previa.con + (con?.calculada.montoCentavos ?? 0n),
        });
      }

      return {
        citaId: entrada.citaId,
        listaCentavos: cuenta.listaCentavos.toString(),
        descuentoCentavos: cuenta.descuentoCentavos.toString(),
        impuestosCentavos: cuenta.impuestosCentavos.toString(),
        totalCentavos: cuenta.totalCentavos.toString(),
        anticipoCentavos: cuenta.anticipoCentavos.toString(),
        porCobrarCentavos: cuenta.porCobrarCentavos.toString(),
        descuentoPasaDelTope:
          pasado === null
            ? null
            : { topeCentavos: pasado.topeCentavos.toString(), topeBp: pasado.topeBp },
        comisiones: [...porPersona].map(([profesionalId, { sin, con }]) => ({
          profesionalId,
          sinDescuentoCentavos: sin.toString(),
          conDescuentoCentavos: con.toString(),
        })),
        cajaAbierta: sesion !== null,
      };
    },
  },
);

export const cobrarCita = definirComando<Transaccion, typeof entradaCobrarCita, ResultadoCobroCita>(
  {
    nombre: 'venta.cobrar_cita',
    entidad: 'cita',
    escribe: true,
    roles: [...ROLES],
    paquetes: PAQUETES_TODOS,
    entrada: entradaCobrarCita,
    async ejecutar(ctx, entrada) {
      const { organizacionId, sucursalId, terminalId, empleoId } = ctx.ambito;
      if (sucursalId === null) {
        throw new ErrorDominio(
          'VENTA_SIN_TERMINAL',
          'El ticket lleva folio por sucursal: hace falta saber desde cuál se cobra.',
        );
      }

      const { cita, servicios, impuesto, anticipoId, cuenta } = await leerCuenta(
        ctx,
        entrada.citaId,
        entrada.descuentoBp ?? 0,
        true,
      );

      /**
       * EL DESCUENTO, CONTRA EL TOPE DEL PUESTO (F-205, §3).
       *
       * Por encima del tope no hay un campo «autorizado por»: quien autoriza ENTRA
       * con su PIN —por la entrada de siempre, con su límite de intentos— y cobra
       * desde su sesión. Un PIN ajeno tecleado dentro de este comando sería una
       * segunda puerta de PIN sin ese límite, y un campo con el nombre de otro es
       * justo lo que R16 prohíbe (`venta/descuento.ts` lo dice igual).
       */
      const pasado = await topePasado(ctx, cuenta);
      if (pasado !== null) {
        throw new Rechazo('SIN_PERMISO', 'denegado', {
          codigo: 'SIN_PERMISO',
          mensaje:
            'Ese descuento pasa de tu tope. Lo aplica quien lo autoriza: que entre con su PIN y cobre desde su sesión.',
          datos: { topeCentavos: pasado.topeCentavos.toString(), topeBp: pasado.topeBp },
        });
      }

      const pagado = entrada.pagos.reduce((a, p) => a + BigInt(p.montoCentavos), 0n);
      if (pagado !== cuenta.porCobrarCentavos) {
        throw new ErrorDominio(
          'PAGO_NO_CUADRA',
          cuenta.anticipoCentavos > 0n
            ? 'Lo que suman los pagos no es lo que queda por cobrar después del anticipo.'
            : 'Lo que suman los pagos no es lo que cuesta la cita.',
          {
            total: cuenta.totalCentavos.toString(),
            anticipo: cuenta.anticipoCentavos.toString(),
            pagado: pagado.toString(),
          },
        );
      }

      // Las propinas se comprueban ANTES de escribir nada: una propina que no tiene
      // por dónde entrar, o que es de alguien que no está, no deja media venta.
      const propinas = entrada.propinas ?? [];
      const porCamino = propinasPorCamino(propinas, entrada.pagos, cuenta.totalCentavos);
      await exigirProfesionales(ctx, [
        ...propinas.map((p) => p.profesionalId),
        ...entrada.pagos.flatMap((p) =>
          p.metodo === 'transferencia' && p.aCuentaDe !== undefined ? [p.aCuentaDe] : [],
        ),
      ]);

      /**
       * LA CAJA, ANTES DEL FOLIO.
       *
       * Cobrar una cita escribía la orden, sus líneas, las comisiones y cerraba
       * la cita — y **no escribía el pago ni el movimiento de caja**: el corte
       * contaba cero ventas y el arqueo sobraba justo lo cobrado. Se hace igual
       * que en `venta.cobrar`, con los mismos ayudantes, y por eso exige lo mismo:
       * caja abierta en ESTA terminal.
       */
      if (terminalId === null) {
        throw new ErrorDominio(
          'VENTA_SIN_TERMINAL',
          'Para cobrar hace falta una terminal dada de alta en una sucursal.',
        );
      }
      const sesion = await ctx.paso('cargar_caja', () =>
        repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
      );
      if (sesion === null) {
        throw new ErrorDominio('CAJA_CERRADA', 'Abre la caja antes de cobrar.');
      }

      const { serie, folio } = await ctx.paso('tomar_folio', () =>
        repoFolios.tomarFolio(ctx.tx, organizacionId, sucursalId),
      );
      const folioTexto = `${serie}-${folio.toString()}`;

      const orden = await ctx.paso('crear_orden', () =>
        ctx.tx
          .insertInto('ordenes')
          .values({
            organizacion_id: organizacionId,
            sucursal_id: sucursalId,
            serie,
            folio,
            // `pagada`, NO `cobrada`: la cita se llama «cobrada» en su tabla y la
            // ORDEN usa el vocabulario de la venta, el mismo de los cinco modelos.
            // `cobrada` revienta con 23514 contra el `check` de la 003.
            estado: 'pagada',
            subtotal_centavos: cuenta.listaCentavos,
            descuento_centavos: cuenta.descuentoCentavos,
            // El IVA que va DENTRO del total, extraído una vez (§2.1). Aquí no se
            // escribía y la orden decía cero: el corte no tenía IVA que declarar.
            impuestos_centavos: cuenta.impuestosCentavos,
            // La cita COMPLETA: el anticipo baja lo que se cobra hoy, no la venta,
            // que se reconoce entera el día del servicio (§6.1).
            total_centavos: cuenta.totalCentavos,
            cliente_id: cita.clienteId,
            empleado_cobra_id: empleoId,
            cerrada_en: ctx.ahora,
            created_at: ctx.ahora,
          })
          .returning('id')
          .executeTakeFirstOrThrow(),
      );

      const comisiones: ComisionDeLinea[] = [];
      for (const [indice, servicio] of servicios.entries()) {
        const descuentoDeLinea = cuenta.descuentoPorLinea[indice] ?? 0n;
        const linea = await ctx.paso('crear_linea', () =>
          ctx.tx
            .insertInto('orden_lineas')
            .values({
              organizacion_id: organizacionId,
              orden_id: orden.id,
              producto_id: servicio.servicioId,
              // Instantánea: el ticket de hace un año tiene que poder pintarse
              // aunque el servicio se haya renombrado o archivado.
              producto_nombre: servicio.nombre ?? 'Servicio',
              cantidad: '1',
              precio_unitario_centavos: servicio.precio,
              subtotal_centavos: servicio.precio,
              // Su parte del descuento, al centavo: la comisión se calcula por
              // línea y cada línea puede ser de otra persona.
              descuento_centavos: descuentoDeLinea,
              total_centavos: servicio.precio - descuentoDeLinea,
              // El profesional va en CADA línea: sin él, una cita con dos personas
              // no se puede repartir y la comisión se le paga entera a una.
              profesional_id: servicio.profesionalId,
              cita_servicio_id: servicio.id,
              created_at: ctx.ahora,
            })
            .returning('id')
            .executeTakeFirstOrThrow(),
        );

        await ctx.paso('ligar_servicio', () =>
          ctx.tx
            .updateTable('cita_servicios')
            .set({ orden_linea_id: linea.id })
            .where('id', '=', servicio.id)
            .execute(),
        );

        const causada = await causarComision(ctx, {
          ordenLineaId: linea.id,
          citaServicioId: servicio.id,
          profesionalId: servicio.profesionalId,
          servicioId: servicio.servicioId,
          base: baseDeLinea(servicio.precio, descuentoDeLinea, impuesto),
          esRehacer: cita.esRehacer,
        });
        if (causada !== null) comisiones.push(causada);
      }

      /**
       * EL PAGO, CON SU MÉTODO, Y EL CAJÓN.
       *
       * Una fila de `pagos` por método —un pago mixto son varias— y UN movimiento
       * de caja por el efectivo de la venta, que es lo único que mueve el cajón: la
       * tarjeta y la transferencia entran en el banco, y sumarlas al arqueo haría
       * «faltar» todo lo que se cobró con tarjeta.
       *
       * La propina va en la fila de SU método y nunca dentro del monto (regla 1 de
       * `propinas/cobro.ts`): la de terminal, en el cargo de la tarjeta; la del
       * cajón, en el efectivo, que entonces recibió venta más propina.
       */
      let efectivo = 0n;
      let terminalPuesta = false;
      let cajonPuesto = false;
      for (const pago of entrada.pagos) {
        const monto = BigInt(pago.montoCentavos);
        let propina = 0n;
        if (pago.metodo === 'tarjeta' && !terminalPuesta) {
          propina = porCamino.terminal;
          terminalPuesta = true;
        }
        if (pago.metodo === 'efectivo' && !cajonPuesto) {
          propina = porCamino.cajon;
          cajonPuesto = true;
        }
        await ctx.paso('registrar_pago', () =>
          registrarPagoConPropina(ctx.tx, {
            organizacionId,
            ordenId: orden.id,
            sesionCajaId: sesion.id,
            metodo: pago.metodo,
            montoCentavos: monto,
            propinaCentavos: propina,
            recibidoCentavos: pago.metodo === 'efectivo' ? monto + propina : null,
            cambioCentavos: 0n,
            referencia: referenciaDeTransferencia(pago),
            idempotencyKey: null,
          }),
        );
        if (pago.metodo === 'efectivo') efectivo += monto;
      }

      if (efectivo > 0n) {
        await ctx.paso('mover_caja', () =>
          repoCaja.registrarMovimiento(ctx.tx, {
            organizacionId,
            sesionCajaId: sesion.id,
            tipo: 'venta',
            montoCentavos: efectivo,
            referenciaTipo: 'orden',
            referenciaId: orden.id,
            empleadoId: empleoId,
            motivo: null,
          }),
        );
      }

      // La propina del cajón SÍ entra al arqueo (§4.2) —está en el cajón— y en su
      // propio movimiento: mezclada con la venta, el corte no podría separar lo
      // que es del salón de lo que se le debe a la estilista.
      const movimientoDePropina =
        porCamino.cajon > 0n
          ? await ctx.paso('mover_caja_propina', () =>
              repoCaja.registrarMovimiento(ctx.tx, {
                organizacionId,
                sesionCajaId: sesion.id,
                tipo: 'propina',
                montoCentavos: porCamino.cajon,
                referenciaTipo: 'orden',
                referenciaId: orden.id,
                empleadoId: empleoId,
                motivo: null,
              }),
            )
          : null;

      await anotarPropinas(ctx, {
        propinas,
        ordenId: orden.id,
        servicios,
        movimientoCajaId: movimientoDePropina?.id ?? null,
      });

      if (anticipoId !== null) {
        // Estado, orden y fecha en la MISMA escritura: la 138 exige las dos
        // últimas, y separarlas dejaría un pasivo que desaparece sin destino. El
        // `estado = 'vivo'` del WHERE es el cerrojo: aplicado dos veces, el mismo
        // anticipo se descontaría de dos cobros.
        const aplicado = await ctx.paso('aplicar_anticipo', () =>
          ctx.tx
            .updateTable('anticipos_cita')
            .set({
              estado: 'aplicado',
              orden_id: orden.id,
              resuelto_en: ctx.ahora,
              motivo_resolucion: 'aplicado al cobro del servicio',
            })
            .where('organizacion_id', '=', organizacionId)
            .where('id', '=', anticipoId)
            .where('estado', '=', 'vivo')
            .executeTakeFirst(),
        );
        if (Number(aplicado.numUpdatedRows) !== 1) {
          throw new ErrorDominio(
            'CONFIGURACION_CONFLICTO',
            'El anticipo de esa cita cambió mientras se cobraba: vuelve a intentarlo.',
          );
        }
      }

      await ctx.paso('cerrar_cita', () =>
        ctx.tx
          .updateTable('citas')
          // `estado` y `orden_id` en la MISMA escritura: la 132 lo exige
          // (`cita_cobrada_con_orden`). Una cita cobrada sin orden es una venta
          // sin ticket.
          .set({ estado: 'cobrada', orden_id: orden.id, fin_real: ctx.ahora })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', entrada.citaId)
          .execute(),
      );

      const propinaTotal = porCamino.mano + porCamino.cajon + porCamino.terminal;
      ctx.auditar({
        entidadId: entrada.citaId,
        payload: {
          ordenId: orden.id,
          folio: folioTexto,
          totalCentavos: cuenta.totalCentavos.toString(),
          // El descuento queda en la bitácora con quién lo aplicó (el ámbito) y
          // con cuánto: es lo que F-205 pide que se pueda contar después.
          descuentoCentavos: cuenta.descuentoCentavos.toString(),
          descuentoBp: entrada.descuentoBp ?? 0,
          anticipoCentavos: cuenta.anticipoCentavos.toString(),
          propinaCentavos: propinaTotal.toString(),
          comisiones: comisiones.length,
        },
      });

      return {
        citaId: entrada.citaId,
        ordenId: orden.id,
        folio: folioTexto,
        totalCentavos: cuenta.totalCentavos.toString(),
        descuentoCentavos: cuenta.descuentoCentavos.toString(),
        impuestosCentavos: cuenta.impuestosCentavos.toString(),
        anticipoCentavos: cuenta.anticipoCentavos.toString(),
        propinaCentavos: propinaTotal.toString(),
        comisiones,
      };
    },
  },
);

interface PropinasDelCobro {
  readonly propinas: readonly PropinaPedida[];
  readonly ordenId: string;
  readonly servicios: readonly ServicioACobrar[];
  readonly movimientoCajaId: string | null;
}

/**
 * La propina, A NOMBRE de quien la recibió (F-243, V4), en `movimientos_propina`.
 *
 * Aquí la pantalla decía «se entrega en mano: todavía no queda anotada». Cada
 * camino deja su rastro (§4.2):
 * - TERMINAL: recibida con medio `tarjeta`. El salón la cobró y se la debe.
 * - CAJÓN: recibida con medio `efectivo`, atada al movimiento de caja que la metió.
 * - MANO: recibida Y entregada en el mismo acto. Queda en su cuenta —la estilista
 *   sabe lo que ganó y el corte lo cuenta— y el saldo no le debe nada, porque el
 *   dinero nunca pasó por el salón.
 * Nunca toca `ordenes`, `pagos.monto_centavos` ni la base del IVA (§2.2).
 */
async function anotarPropinas(
  ctx: ContextoComando<Transaccion>,
  datos: PropinasDelCobro,
): Promise<void> {
  const { organizacionId, sucursalId, empleoId } = ctx.ambito;
  for (const propina of datos.propinas) {
    const monto = BigInt(propina.montoCentavos);
    const medio = propina.camino === 'terminal' ? 'tarjeta' : 'efectivo';
    // El servicio que ella hizo en esta cita, si hizo alguno. La de apoyo —quien
    // lavó— no tiene línea, y está bien: se anota sólo con la orden.
    const citaServicioId =
      datos.servicios.find((s) => s.profesionalId === propina.profesionalId)?.id ?? null;
    await ctx.paso('anotar_propina', () =>
      ctx.tx
        .insertInto('movimientos_propina')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          profesional_id: propina.profesionalId,
          orden_id: datos.ordenId,
          cita_servicio_id: citaServicioId,
          tipo: 'recibida',
          monto_centavos: monto,
          medio,
          movimiento_caja_id: propina.camino === 'cajon' ? datos.movimientoCajaId : null,
          nota: propina.camino === 'mano' ? 'a la mano' : null,
          created_at: ctx.ahora,
        })
        .execute(),
    );
    if (propina.camino !== 'mano') continue;
    await ctx.paso('entregar_propina_en_mano', () =>
      ctx.tx
        .insertInto('movimientos_propina')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          profesional_id: propina.profesionalId,
          orden_id: datos.ordenId,
          cita_servicio_id: citaServicioId,
          tipo: 'entregada',
          // NEGATIVO y con su sello: la 139 exige las dos cosas.
          monto_centavos: -monto,
          medio,
          entregada_en: ctx.ahora,
          entregada_por: empleoId,
          nota: 'a la mano, al cobrar',
          created_at: ctx.ahora,
        })
        .execute(),
    );
  }
}

interface DatosDeComision {
  readonly citaServicioId: string;
  readonly profesionalId: string;
  readonly servicioId: string;
  /** Lo cobrado y la lista de la línea, SIN IVA (`baseDeLinea`). */
  readonly base: BaseDeLinea;
  readonly esRehacer: boolean;
}

interface ComisionCalculada {
  readonly regla: { readonly id: string; readonly version: number };
  readonly calculada: ComisionCausada;
}

/**
 * Calcula la comisión de UNA línea con la regla vigente, sin escribir nada.
 *
 * ── Qué regla manda ──────────────────────────────────────────────────────
 * La del SERVICIO si la tiene —un tratamiento de keratina puede pagar distinto
 * que un corte— y si no, la del profesional. Sin esa prioridad, el salón que
 * quiere pagar más por un servicio caro tiene que crearle una regla a cada
 * persona, y se le olvida a la tercera.
 *
 * ── Y por qué devuelve `null` en vez de un cero ──────────────────────────
 * Una fila de cero en el ledger es un renglón que la estilista tiene que leer
 * para descubrir que no dice nada. `sin_comision` —la recepcionista, la
 * asistente— no deja rastro, y eso es lo correcto.
 */
async function calcularComisionDeLinea(
  ctx: ContextoComando<Transaccion>,
  datos: DatosDeComision,
): Promise<ComisionCalculada | null> {
  const { organizacionId } = ctx.ambito;

  const servicio = await ctx.paso('cargar_regla_servicio', () =>
    ctx.tx
      .selectFrom('servicios')
      .select(['producto_id as id', 'regla_comision_id as reglaId'])
      .where('organizacion_id', '=', organizacionId)
      .where('producto_id', '=', datos.servicioId)
      .executeTakeFirst(),
  );

  const profesional = await ctx.paso('cargar_regla_profesional', () =>
    ctx.tx
      .selectFrom('profesionales')
      .select(['id', 'regla_comision_id as reglaId', 'tipo_relacion as tipoRelacion'])
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', datos.profesionalId)
      .executeTakeFirst(),
  );
  if (profesional === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa persona no atiende en este negocio.');
  }

  // Quien RENTA la estación no lleva comisión: el trato es el mueble, no el
  // porcentaje. La 130 ya lo impide a nivel de fila; aquí se sale antes para no
  // ir a buscar una regla que por contrato es nula.
  if (profesional.tipoRelacion === 'independiente_renta') return null;

  // La del SERVICIO manda sobre la del profesional: un tratamiento caro puede
  // pagar distinto que un corte.
  const reglaId = servicio?.reglaId ?? profesional.reglaId;
  if (reglaId === null) return null;

  const regla = await ctx.paso('cargar_regla', () =>
    ctx.tx
      .selectFrom('reglas_comision')
      .select([
        'id',
        'version',
        'esquema',
        'tasa_servicio_bp as tasaServicio',
        'tasa_producto_bp as tasaProducto',
        'base',
        'sobre_iva as sobreIva',
        'material',
        'reparto',
        'rehacer_paga as rehacerPaga',
        'escalones',
      ])
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', reglaId)
      .executeTakeFirst(),
  );
  if (regla === undefined) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'La regla de comisión de esa persona no existe: nadie puede cobrar contra una regla que no está.',
      { reglaId },
    );
  }

  // Lo acumulado del periodo ANTES de esta línea. Sólo lo usa `escalonado`, y el
  // escalón premia el MES, no el ticket.
  const acumulado = await ctx.paso('sumar_acumulado', () =>
    ctx.tx
      .selectFrom('comisiones_causadas')
      .select((eb) => eb.fn.sum('base_centavos').as('base'))
      .where('organizacion_id', '=', organizacionId)
      .where('profesional_id', '=', datos.profesionalId)
      .where('liquidacion_id', 'is', null)
      .executeTakeFirst(),
  );

  /**
   * T-09 · EL MATERIAL DE CABINA, VALUADO DEL LEDGER.
   *
   * `reglas_comision.material` decide quién paga el tinte: `negocio`, `mitad` o
   * `profesional` (F-433). Con el material en cero, las tres reglas calculan LO
   * MISMO y la pantalla de comisiones enseña un número que nadie puede cuadrar
   * contra el bote de tinte.
   *
   * Sale del movimiento de `consumo_servicio` que `agenda.cerrar_servicio` escribió
   * al cerrar, con el costo del insumo EN ESE MOMENTO, no del catálogo de hoy.
   * `cantidad` es negativa —es una salida— así que se usa su valor absoluto.
   */
  const material = await ctx.paso('valuar_material', () =>
    sql<{ costo: string | null }>`
      select coalesce(sum(abs(cantidad) * costo_unitario_centavos), 0) as costo
        from movimientos_stock
       where organizacion_id = ${organizacionId}
         and tipo = 'consumo_servicio'
         and referencia_tipo = 'servicio'
         and referencia_id = ${datos.citaServicioId}
    `.execute(ctx.tx),
  );
  // Al centavo entero y hacia abajo: el costo de 12.4 centavos de tinte son 12,
  // y redondear hacia arriba le cobraría a la estilista medio centavo por bote.
  const materialCentavos = BigInt((material.rows[0]?.costo ?? '0').split('.')[0] ?? '0');

  const linea: LineaComisionable = {
    tipo: 'servicio',
    // SIN IVA, las dos (§7.2, pregunta 2). Aquí iba el precio al público entero y
    // `ivaCentavos: 0n`: la regla con `sobre_iva = false` comisionaba el IVA.
    cobradoSinIvaCentavos: datos.base.cobradoSinIvaCentavos,
    listaSinIvaCentavos: datos.base.listaSinIvaCentavos,
    ivaCentavos: datos.base.ivaCentavos,
    materialCentavos,
    esRehacer: datos.esRehacer,
    acumuladoPrevioCentavos: BigInt(String(acumulado?.base ?? '0').split('.')[0] ?? '0'),
  };

  return {
    regla: { id: regla.id, version: regla.version },
    calculada: calcularComision(comoRegla(regla), linea),
  };
}

/** Causa la comisión de una línea ya cobrada: la calcula y la escribe en el ledger. */
async function causarComision(
  ctx: ContextoComando<Transaccion>,
  datos: DatosDeComision & { readonly ordenLineaId: string },
): Promise<ComisionDeLinea | null> {
  const resultado = await calcularComisionDeLinea(ctx, datos);
  if (resultado === null) return null;
  const { regla, calculada } = resultado;
  if (calculada.montoCentavos === 0n && calculada.materialACargoCentavos === 0n) return null;

  await ctx.paso('causar_comision', () =>
    ctx.tx
      .insertInto('comisiones_causadas')
      .values({
        organizacion_id: ctx.ambito.organizacionId,
        orden_linea_id: datos.ordenLineaId,
        cita_servicio_id: datos.citaServicioId,
        profesional_id: datos.profesionalId,
        regla_id: regla.id,
        // QUÉ regla, en QUÉ versión. Sin la versión, una regla que cambió deja
        // el histórico sin forma de explicarse.
        regla_version: regla.version,
        tipo: 'servicio',
        base_centavos: calculada.baseCentavos,
        tasa_bp: calculada.tasaBp,
        monto_centavos: calculada.montoCentavos,
        material_descontado_centavos: calculada.materialDescontadoCentavos,
        causada_en: ctx.ahora,
      })
      .execute(),
  );

  return {
    profesionalId: datos.profesionalId,
    citaServicioId: datos.citaServicioId,
    baseCentavos: calculada.baseCentavos.toString(),
    tasaBp: calculada.tasaBp,
    montoCentavos: calculada.montoCentavos.toString(),
  };
}

interface FilaDeRegla {
  readonly esquema: string;
  readonly tasaServicio: number;
  readonly tasaProducto: number;
  readonly base: string;
  readonly sobreIva: boolean;
  readonly material: string;
  readonly reparto: string;
  readonly rehacerPaga: boolean;
  readonly escalones: unknown;
}

/** De la fila de Postgres al objeto que el dominio entiende. */
function comoRegla(fila: FilaDeRegla): ReglaComision {
  return {
    esquema: fila.esquema as ReglaComision['esquema'],
    tasaServicioBp: fila.tasaServicio,
    tasaProductoBp: fila.tasaProducto,
    base: fila.base as ReglaComision['base'],
    sobreIva: fila.sobreIva,
    material: fila.material as ReglaComision['material'],
    reparto: fila.reparto as ReglaComision['reparto'],
    rehacerPaga: fila.rehacerPaga,
    escalones: leerEscalones(fila.escalones),
  };
}

function leerEscalones(crudo: unknown): ReglaComision['escalones'] {
  if (crudo === null || crudo === undefined) return null;
  const lista: unknown = typeof crudo === 'string' ? JSON.parse(crudo) : crudo;
  if (!Array.isArray(lista)) return null;

  return lista.map((item) => {
    const escalon = item as { hastaCentavos?: string | number; tasaBp?: number };
    return {
      hastaCentavos: BigInt(escalon.hastaCentavos ?? 0),
      tasaBp: escalon.tasaBp ?? 0,
    };
  });
}
