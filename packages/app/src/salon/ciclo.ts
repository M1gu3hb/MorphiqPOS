import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-412, F-407 y F-434 · Lo que le pasa a una cita que no acaba en cobro.
 *
 * ── El dolor 1 en pesos ──────────────────────────────────────────────────
 * Entre el 15 % y el 20 % de las citas no llegan. En un salón de $180,000 al
 * mes son unos $32,000 mensuales de capacidad perdida, y la capacidad de un
 * salón no se recupera: el martes a las once ya pasó.
 *
 * ── Por qué el no-show se MARCA y no se deduce ───────────────────────────
 * Porque a los quince minutos alguien tiene que decidir, y esa decisión tiene
 * consecuencias: se retiene el anticipo, se libera el hueco y la clienta entra
 * al historial. Deducirlo del reloj convertiría un atasco de tráfico en un
 * antecedente, y la primera vez que le pase a una clienta buena el salón apaga
 * la función.
 *
 * ── Y por qué queda firmado ──────────────────────────────────────────────
 * `no_llego_marcado_por` es obligatorio en la base. Un no-show sin autor es una
 * acusación sin firma, y de eso depende si se le retiene el dinero a alguien.
 *
 * ── Por qué cerrar el servicio NO es cobrar ──────────────────────────────
 * Cerrar es «ya terminé»: dispara el consumo del producto de cabina. Cobrar es
 * otra cosa y pasa en el mostrador, a veces media hora después. Juntarlos haría
 * que el inventario de cabina se descontara cuando la clienta paga, y no cuando
 * el tinte se mezcló.
 */

const RECEPCION = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
const PROFESIONAL = ['mesero', ...RECEPCION] as const;

export const entradaMarcarNoLlego = z.object({
  citaId: z.uuid(),
  /** `true` retiene el anticipo; `false` lo devuelve. Lo decide quien marca. */
  retieneAnticipo: z.boolean().default(true),
});

export const entradaCancelarCita = z.object({
  citaId: z.uuid(),
  motivo: z.string().trim().min(3).max(200),
});

export const entradaIniciarCita = z.object({ citaId: z.uuid() });

export const entradaCerrarServicio = z.object({
  citaServicioId: z.uuid(),
  almacenId: z.uuid(),
  /** Lo que se declara haber MEZCLADO. Un tinte no se aplica en gramos exactos. */
  consumos: z
    .array(
      z.object({
        productoId: z.uuid(),
        cantidadBase: z.string().regex(/^\d{1,10}(\.\d{1,4})?$/, 'Cantidad con cuatro decimales.'),
      }),
    )
    .max(20)
    .default([]),
  /** La fórmula aplicada, para que la clienta pueda volver por «la misma». */
  formula: z.record(z.string().max(40), z.string().max(200)).default({}),
});

export interface ResultadoCita {
  readonly citaId: string;
  readonly estado: string;
}

export interface ResultadoCierre {
  readonly citaServicioId: string;
  readonly consumos: number;
}

export const marcarNoLlego = definirComando<
  Transaccion,
  typeof entradaMarcarNoLlego,
  ResultadoCita
>({
  nombre: 'agenda.marcar_no_llego',
  entidad: 'cita',
  escribe: true,
  roles: [...RECEPCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaMarcarNoLlego,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;
    const cita = await cargarCita(ctx, entrada.citaId);

    // `estado`, `marcado_en` y `marcado_por` en la MISMA escritura: la 132 lo
    // exige (`cita_no_llego_con_sello`) y separarlos dejaría un no-show sin
    // firma, que es una acusación que nadie sostiene.
    const tocadas = await ctx.paso('marcar', () =>
      ctx.tx
        .updateTable('citas')
        .set({
          estado: 'no_llego',
          no_llego_marcado_en: ctx.ahora,
          no_llego_marcado_por: empleoId,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.citaId)
        .where('estado', 'in', ['agendada', 'confirmada'])
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      // Éste es el ÚNICO cerrojo, y cubre las dos cosas: la cita que ya se
      // atendió —marcarla como no-show le mete un antecedente falso y, con
      // anticipo, se lo retiene dos veces— y la que ya estaba marcada. Había
      // arriba una comprobación temprana sobre `cita.estado` y se quitó: no
      // ponía roja ninguna prueba porque este `where` ya la hacía.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa cita ya no estaba esperando: o se atendió, o ya estaba marcada.',
      );
    }

    // El hueco se libera: los servicios quedan cancelados y la exclusión de la
    // base deja de contarlos. Sin esto, la agenda sigue mostrando ocupado un
    // hueco que se puede vender ahora mismo — que es justo lo que F-409 viene a
    // aprovechar.
    await liberarServicios(ctx, entrada.citaId);

    ctx.auditar({
      entidadId: entrada.citaId,
      payload: { folio: cita.folio, retieneAnticipo: entrada.retieneAnticipo },
    });

    return { citaId: entrada.citaId, estado: 'no_llego' };
  },
});

export const cancelarCita = definirComando<Transaccion, typeof entradaCancelarCita, ResultadoCita>({
  nombre: 'agenda.cancelar_cita',
  entidad: 'cita',
  escribe: true,
  roles: [...RECEPCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaCancelarCita,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const cita = await cargarCita(ctx, entrada.citaId);

    if (cita.estado === 'cobrada') {
      // Una cita cobrada no se cancela: se cancela la VENTA, que es otra cosa y
      // deja contrapartidas de comisión. Cancelarla aquí dejaría la orden viva
      // y la cita muerta.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa cita ya se cobró: lo que se cancela es la venta.',
      );
    }

    // `estado` y `motivo` juntos: la 132 lo exige. Una cancelación sin motivo no
    // sirve para nada, y el motivo es lo único que distingue «la clienta se
    // enfermó» de «no había quien la atendiera».
    const tocadas = await ctx.paso('cancelar', () =>
      ctx.tx
        .updateTable('citas')
        .set({ estado: 'cancelada', motivo_cancelacion: entrada.motivo })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.citaId)
        .where('estado', 'in', ['agendada', 'confirmada', 'en_curso'])
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      throw new ErrorDominio('CONFIGURACION_CONFLICTO', 'Esa cita ya no se puede cancelar.');
    }

    await liberarServicios(ctx, entrada.citaId);

    ctx.auditar({
      entidadId: entrada.citaId,
      payload: { folio: cita.folio, motivo: entrada.motivo },
    });

    return { citaId: entrada.citaId, estado: 'cancelada' };
  },
});

export const iniciarCita = definirComando<Transaccion, typeof entradaIniciarCita, ResultadoCita>({
  nombre: 'agenda.iniciar_cita',
  entidad: 'cita',
  escribe: true,
  roles: [...PROFESIONAL],
  paquetes: PAQUETES_TODOS,
  entrada: entradaIniciarCita,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    await cargarCita(ctx, entrada.citaId);

    // `llego_en` e `inicio_real` son DOS relojes distintos y los dos importan:
    // el primero mide cuánto esperó la clienta —que es el reclamo número uno de
    // un salón— y el segundo, cuánto duró de verdad el servicio, que es lo que
    // corrige las duraciones del catálogo.
    const tocadas = await ctx.paso('iniciar', () =>
      ctx.tx
        .updateTable('citas')
        .set({ estado: 'en_curso', inicio_real: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.citaId)
        .where('estado', 'in', ['agendada', 'confirmada'])
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      throw new ErrorDominio('CONFIGURACION_CONFLICTO', 'Esa cita ya no estaba por empezar.');
    }

    ctx.auditar({ entidadId: entrada.citaId, payload: { inicioReal: ctx.ahora.toISOString() } });

    return { citaId: entrada.citaId, estado: 'en_curso' };
  },
});

export const cerrarServicio = definirComando<
  Transaccion,
  typeof entradaCerrarServicio,
  ResultadoCierre
>({
  nombre: 'agenda.cerrar_servicio',
  entidad: 'cita_servicio',
  escribe: true,
  roles: [...PROFESIONAL],
  paquetes: PAQUETES_TODOS,
  entrada: entradaCerrarServicio,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const servicio = await ctx.paso('cargar_servicio', () =>
      ctx.tx
        .selectFrom('cita_servicios')
        .select(['id', 'cita_id as citaId', 'estado'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.citaServicioId)
        .executeTakeFirst(),
    );
    if (servicio === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese servicio no existe en este negocio.');
    }
    if (servicio.estado === 'cerrado') {
      // Idempotente POR `cita_servicio_id`, no por clave de petición: el
      // teléfono de la estilista pierde red a mitad y reintenta, y cerrar dos
      // veces descontaría el tinte dos veces.
      return { citaServicioId: entrada.citaServicioId, consumos: 0 };
    }
    if (servicio.estado === 'cancelado') {
      throw new ErrorDominio('CONFIGURACION_CONFLICTO', 'Ese servicio está cancelado.');
    }

    // El producto de cabina sale AQUÍ, al cerrar, y no al cobrar: el tinte se
    // mezcló cuando se mezcló. Si no alcanza, FALLA y dice cuánto falta, en vez
    // de descontar en silencio y dejar la cabina en negativo.
    let escritos = 0;
    for (const consumo of entrada.consumos) {
      await sacarDeCabina(ctx, entrada.almacenId, consumo, entrada.citaServicioId);
      escritos += 1;
    }

    // `estado` y `cerrado_en` juntos: la 132 lo exige
    // (`cita_servicio_cerrado_con_fecha`).
    await ctx.paso('cerrar', () =>
      ctx.tx
        .updateTable('cita_servicios')
        .set({ estado: 'cerrado', cerrado_en: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.citaServicioId)
        .execute(),
    );

    /**
     * Y SI ERA EL ÚLTIMO, LA CITA QUEDA TERMINADA.
     *
     * ── El defecto que esto arregla ───────────────────────────────────────
     * Cerrar un servicio cerraba el servicio y nada más: la CITA se quedaba
     * `en_curso` para siempre. Y `estetica-salon/Cobrar` lista las citas con
     * estado `terminada` —con razón: «una cita se cobra cuando el servicio está
     * CERRADO, y no antes»—, así que **ninguna cita llegaba nunca a la pantalla de
     * cobro**. Un salón que no puede cobrar.
     *
     * La transición va aquí y no en un comando aparte porque no es una decisión de
     * nadie: es la consecuencia de cerrar el último servicio. Un comando aparte
     * sería un paso que alguien tiene que acordarse de dar, y el día que se
     * olvidara la cita volvería a quedarse colgada.
     *
     * Se cuenta lo que queda VIVO —ni cerrado ni cancelado—: una cita con dos
     * servicios, uno cerrado y otro cancelado, está terminada; una con uno cerrado
     * y otro por hacer, no.
     */
    // Se piden las FILAS y no un `count`: basta saber si queda alguna, y así esto
    // no depende de la función de agregado —que el constructor falso de las
    // pruebas unitarias no implementa— para una respuesta de sí o no.
    const vivos = await ctx.paso('servicios_vivos', () =>
      ctx.tx
        .selectFrom('cita_servicios')
        .select('id')
        .where('organizacion_id', '=', organizacionId)
        .where('cita_id', '=', servicio.citaId)
        .where('estado', 'not in', ['cerrado', 'cancelado'])
        .limit(1)
        .execute(),
    );

    const terminada = vivos.length === 0;
    if (terminada) {
      await ctx.paso('terminar_cita', () =>
        ctx.tx
          .updateTable('citas')
          .set({ estado: 'terminada', fin_real: ctx.ahora })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', servicio.citaId)
          // Sólo desde los estados VIVOS: una cita ya cobrada o cancelada no
          // vuelve atrás porque alguien cierre un servicio suelto.
          .where('estado', 'in', ['agendada', 'confirmada', 'en_curso'])
          .execute(),
      );
    }

    ctx.auditar({
      entidadId: entrada.citaServicioId,
      payload: {
        citaId: servicio.citaId,
        consumos: escritos,
        formula: JSON.stringify(entrada.formula),
        citaTerminada: terminada,
      },
    });

    return { citaServicioId: entrada.citaServicioId, consumos: escritos };
  },
});

interface CitaCargada {
  readonly id: string;
  readonly folio: string;
  readonly estado: string;
}

async function cargarCita(ctx: ContextoComando<Transaccion>, citaId: string): Promise<CitaCargada> {
  const cita = await ctx.paso('cargar_cita', () =>
    ctx.tx
      .selectFrom('citas')
      .select(['id', 'folio', 'estado'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', '=', citaId)
      .executeTakeFirst(),
  );
  if (cita === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa cita no existe en este negocio.');
  }
  return cita;
}

/**
 * Los servicios de una cita muerta dejan de ocupar la agenda.
 *
 * La exclusión de la 132 sólo cuenta lo que NO está cancelado: sin esto, un
 * no-show seguiría mostrando ocupado un hueco que se puede vender ahora mismo,
 * que es justo lo que la lista de espera viene a aprovechar.
 */
async function liberarServicios(ctx: ContextoComando<Transaccion>, citaId: string): Promise<void> {
  await ctx.paso('liberar_servicios', () =>
    ctx.tx
      .updateTable('cita_servicios')
      .set({ estado: 'cancelado' })
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('cita_id', '=', citaId)
      .where('estado', '<>', 'cerrado')
      .execute(),
  );
}

/**
 * El producto de cabina sale del almacén de cabina.
 *
 * ── F-155 · El error de inventario número uno del giro ───────────────────
 * El shampoo del anaquel y el shampoo de cabina son el MISMO SKU y dos cosas
 * distintas: uno se vende y el otro se gasta. Si comparten existencia, el
 * anaquel «pierde» producto todos los días y nadie sabe por qué. Aquí el
 * almacén lo dice el comando, y el movimiento lleva su tipo propio.
 */
async function sacarDeCabina(
  ctx: ContextoComando<Transaccion>,
  almacenId: string,
  consumo: { readonly productoId: string; readonly cantidadBase: string },
  citaServicioId: string,
): Promise<void> {
  const insumo = await ctx.paso('cargar_insumo', () =>
    ctx.tx
      .selectFrom('insumos')
      .select(['id', 'unidad_base as unidadBase'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('producto_id', '=', consumo.productoId)
      .where('activo', '=', true)
      .executeTakeFirst(),
  );
  if (insumo === undefined) {
    throw new ErrorDominio(
      'PUENTE_NO_ENCONTRADO',
      'Ese producto no lleva existencia en este negocio.',
      { productoId: consumo.productoId },
    );
  }

  const resultado = await ctx.paso('descontar_cabina', () =>
    sql<{ cantidad: string }>`
      update existencias
         set cantidad = cantidad - ${consumo.cantidadBase}, actualizado_en = now()
       where organizacion_id = ${ctx.ambito.organizacionId}
         and almacen_id = ${almacenId}
         and insumo_id = ${insumo.id}
         and cantidad >= ${consumo.cantidadBase}
      returning cantidad
    `.execute(ctx.tx),
  );
  if (resultado.rows.length !== 1) {
    // Falla en vez de silenciar. Una cabina en negativo es un inventario que
    // deja de servir para pedir, y el salón se entera cuando no hay tinte.
    throw new ErrorDominio(
      'STOCK_INSUFICIENTE',
      'No hay producto de cabina suficiente para ese servicio.',
      { productoId: consumo.productoId },
    );
  }

  await ctx.paso('anotar_consumo', () =>
    ctx.tx
      .insertInto('movimientos_stock')
      .values({
        organizacion_id: ctx.ambito.organizacionId,
        almacen_id: almacenId,
        insumo_id: insumo.id,
        tipo: 'consumo_servicio',
        cantidad: `-${consumo.cantidadBase}`,
        unidad: insumo.unidadBase,
        referencia_tipo: 'servicio',
        referencia_id: citaServicioId,
        empleado_id: ctx.ambito.empleoId,
        motivo: 'consumo de cabina',
      })
      .execute(),
  );
}
