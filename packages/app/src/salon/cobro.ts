import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import { repoCaja, repoFolios, type Transaccion } from '@morphiqpos/data';
import {
  calcularComision,
  type LineaComisionable,
  type ReglaComision,
} from '@morphiqpos/domain/agenda';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';
import { registrarPagoConPropina } from '../propinas/cobro.ts';

/**
 * `venta.cobrar_cita` — la transacción más grande del modelo.
 *
 * ── Lo que pasa en un solo BEGIN ─────────────────────────────────────────
 * Orden y líneas con el profesional en CADA una → comisiones causadas con la
 * regla VIGENTE AL MOMENTO → estado de la cita. **Si algo falla, no queda
 * nada.** Media transacción aquí es una orden sin comisión —y la estilista lo
 * descubre el domingo— o una comisión sin orden, que nadie puede explicar.
 *
 * ── Los importes los calcula el SERVIDOR ─────────────────────────────────
 * La entrada trae qué cita se cobra, no cuánto cuesta. Los precios ya están
 * congelados en `cita_servicios` desde que se agendó, que es el trato con la
 * clienta; aceptarlos del navegador dejaría que el mostrador decidiera el
 * precio del tinte.
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
 */

const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaCobrarCita = z.object({
  citaId: z.uuid(),
  /**
   * Cómo se pagó. El importe NO viene de aquí: viene de los precios congelados.
   * Lo que sí viene es el reparto entre métodos, que el servidor comprueba que
   * sume el total.
   */
  pagos: z
    .array(
      z.object({
        metodo: z.enum(['efectivo', 'tarjeta', 'transferencia']),
        montoCentavos: z.number().int().min(1).max(100_000_000),
      }),
    )
    .min(1)
    .max(4),
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
  readonly comisiones: readonly ComisionDeLinea[];
}

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

      const cita = await ctx.paso('cargar_cita', () =>
        ctx.tx
          .selectFrom('citas')
          .select(['id', 'folio', 'estado', 'cliente_id as clienteId', 'es_rehacer as esRehacer'])
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', entrada.citaId)
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
        throw new ErrorDominio(
          'ORDEN_NO_EDITABLE',
          'Esa cita no se atendió: no hay nada que cobrar.',
          { estado: cita.estado },
        );
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
          .where('cs.cita_id', '=', entrada.citaId)
          .where('cs.estado', '<>', 'cancelado')
          .execute(),
      );
      if (servicios.length === 0) {
        throw new ErrorDominio('ORDEN_VACIA', 'Esa cita no tiene servicios que cobrar.');
      }

      // El total sale de los precios CONGELADOS al agendar, no de la entrada.
      const total = servicios.reduce((a, s) => a + s.precio, 0n);
      const pagado = entrada.pagos.reduce((a, p) => a + BigInt(p.montoCentavos), 0n);
      if (pagado !== total) {
        throw new ErrorDominio(
          'PAGO_NO_CUADRA',
          'Lo que suman los pagos no es lo que cuesta la cita.',
          { total: total.toString(), pagado: pagado.toString() },
        );
      }

      /**
       * LA CAJA, ANTES DEL FOLIO. Esto faltaba entero.
       *
       * ── El defecto que esto arregla ─────────────────────────────────────
       * Cobrar una cita escribía la orden, sus líneas, las comisiones y cerraba
       * la cita — y **no escribía el pago ni el movimiento de caja**. El dinero
       * del salón entraba y el cajón no se enteraba: `pagos` se quedaba sin fila
       * —así que el corte contaba CERO ventas— y `movimientos_caja` sin el
       * efectivo, así que el arqueo del día salía corto por cada cita cobrada. La
       * estilista cobra 1 800 pesos en efectivo, el cajón los tiene, y el sistema
       * dice que sobran 1 800: el número con el que se acusa a alguien.
       *
       * Se hace igual que en `venta.cobrar`, con los mismos ayudantes, y por eso
       * exige lo mismo: caja abierta en ESTA terminal. Sin sesión, el efectivo no
       * tiene dónde registrarse y el arqueo nace incompleto.
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
            // `pagada`, NO `cobrada`. La cita se llama «cobrada» en su tabla
            // —es el estado del ciclo del salón— y la ORDEN usa el vocabulario
            // de la venta, que es el mismo de los cinco modelos. Escribir
            // `cobrada` aquí reventaba con 23514 contra el `check` de la 003, y
            // ninguna prueba lo veía porque la base falsa no lleva `check`.
            // Lo cazó `valores-de-check.contrato.test.ts`.
            estado: 'pagada',
            subtotal_centavos: total,
            total_centavos: total,
            cliente_id: cita.clienteId,
            empleado_cobra_id: empleoId,
            cerrada_en: ctx.ahora,
            created_at: ctx.ahora,
          })
          .returning('id')
          .executeTakeFirstOrThrow(),
      );

      const comisiones: ComisionDeLinea[] = [];
      for (const servicio of servicios) {
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
              total_centavos: servicio.precio,
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
          precioCentavos: servicio.precio,
          esRehacer: cita.esRehacer,
        });
        if (causada !== null) comisiones.push(causada);
      }

      /**
       * EL PAGO, CON SU MÉTODO, Y EL CAJÓN.
       *
       * Una fila de `pagos` por método —un pago mixto son varias— y UN movimiento
       * de caja por el efectivo, que es lo único que mueve el cajón: la tarjeta y
       * la transferencia entran en el banco, no en la caja, y sumarlas al arqueo
       * haría «faltar» todo lo que se cobró con tarjeta.
       *
       * La propina va en cero: el salón la entrega en mano y esta pantalla lo dice
       * con todas sus letras al cobrar. El día que se quiera anotar, hay columna.
       */
      let efectivo = 0n;
      for (const pago of entrada.pagos) {
        const monto = BigInt(pago.montoCentavos);
        await ctx.paso('registrar_pago', () =>
          registrarPagoConPropina(ctx.tx, {
            organizacionId,
            ordenId: orden.id,
            sesionCajaId: sesion.id,
            metodo: pago.metodo,
            montoCentavos: monto,
            propinaCentavos: 0n,
            recibidoCentavos: pago.metodo === 'efectivo' ? monto : null,
            cambioCentavos: 0n,
            referencia: null,
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

      ctx.auditar({
        entidadId: entrada.citaId,
        payload: {
          ordenId: orden.id,
          folio: folioTexto,
          totalCentavos: total.toString(),
          comisiones: comisiones.length,
        },
      });

      return {
        citaId: entrada.citaId,
        ordenId: orden.id,
        folio: folioTexto,
        totalCentavos: total.toString(),
        comisiones,
      };
    },
  },
);

interface DatosDeComision {
  readonly ordenLineaId: string;
  readonly citaServicioId: string;
  readonly profesionalId: string;
  readonly servicioId: string;
  readonly precioCentavos: bigint;
  readonly esRehacer: boolean;
}

/**
 * Causa la comisión de UNA línea con la regla vigente.
 *
 * ── Qué regla manda ──────────────────────────────────────────────────────
 * La del SERVICIO si la tiene —un tratamiento de keratina puede pagar distinto
 * que un corte— y si no, la del profesional. Sin esa prioridad, el salón que
 * quiere pagar más por un servicio caro tiene que crearle una regla a cada
 * persona, y se le olvida a la tercera.
 *
 * ── Y por qué devuelve `null` en vez de escribir un cero ─────────────────
 * Una fila de cero en el ledger es un renglón que la estilista tiene que leer
 * para descubrir que no dice nada. `sin_comision` —la recepcionista, la
 * asistente— no deja rastro, y eso es lo correcto.
 */
async function causarComision(
  ctx: ContextoComando<Transaccion>,
  datos: DatosDeComision,
): Promise<ComisionDeLinea | null> {
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

  const linea: LineaComisionable = {
    tipo: 'servicio',
    cobradoSinIvaCentavos: datos.precioCentavos,
    // Sin descuento, lo cobrado y la lista son lo mismo. El descuento por línea
    // entra con F-205 y entonces estos dos números se separan.
    listaSinIvaCentavos: datos.precioCentavos,
    ivaCentavos: 0n,
    // El material de cabina se descontó al CERRAR el servicio y su costo vive en
    // el ledger de stock. Traerlo aquí es la siguiente pasada; hoy se declara
    // cero y se dice, en vez de inventar un número.
    materialCentavos: 0n,
    esRehacer: datos.esRehacer,
    acumuladoPrevioCentavos: BigInt(String(acumulado?.base ?? '0').split('.')[0] ?? '0'),
  };

  const calculada = calcularComision(comoRegla(regla), linea);
  if (calculada.montoCentavos === 0n && calculada.materialACargoCentavos === 0n) return null;

  await ctx.paso('causar_comision', () =>
    ctx.tx
      .insertInto('comisiones_causadas')
      .values({
        organizacion_id: organizacionId,
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
