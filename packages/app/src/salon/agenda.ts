import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import { repoFolios, type Transaccion } from '@morphiqpos/data';
import { elProfesionalPuede, planearCita, type Rango } from '@morphiqpos/domain/agenda';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-400, F-402 y F-415 · Agendar, que en un salón es vender.
 *
 * ── La agenda es tres cosas a la vez ─────────────────────────────────────
 * Es la pantalla de inicio, la unidad de trabajo y el inventario del negocio.
 * Un salón no vende productos: vende TIEMPO DE PERSONA, y ese inventario se
 * agota todos los días a las siete de la tarde sin posibilidad de recuperarlo.
 *
 * ── Lo que este comando NO hace: crear la orden ──────────────────────────
 * Una cita que no se cobró —no llegó, se canceló, fue cortesía— **no genera
 * orden**. Crearla al agendar metería el importe de todo lo agendado en el
 * reporte del día, y el salón cerraría el mes creyendo que vendió un 18 % más
 * de lo que cobró.
 *
 * ── El precio se CONGELA al agendar ──────────────────────────────────────
 * Si el salón sube el tinte entre que se agenda y que se cobra, la clienta paga
 * lo que se le dijo. Ése es el trato, y el sistema no lo puede romper solo. Y
 * el precio lo pone el SERVIDOR: la entrada trae qué servicio, nunca cuánto.
 *
 * ── Por qué se comprueba el choque aquí Y en la base ─────────────────────
 * La comprobación de aquí existe para poder decir «Karla ya tiene a alguien a
 * esa hora» con palabras. La de la base —la exclusión GiST de la 132— existe
 * porque dos peticiones simultáneas pasan las dos por aquí y sólo una puede
 * pasar por Postgres. Ninguna de las dos sobra.
 */

const ROLES = ['cajero', 'mesero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaAgendarCita = z.object({
  /** NULL sólo en walk-in sin datos: todo lo demás cuelga de la clienta. */
  clienteId: z.uuid().optional(),
  origen: z
    .enum(['mostrador', 'telefono', 'whatsapp', 'en_linea', 'walk_in', 'recurrente'])
    .default('mostrador'),
  inicio: z.iso.datetime(),
  servicios: z
    .array(z.object({ servicioId: z.uuid(), profesionalId: z.uuid() }))
    .min(1)
    .max(8),
  notas: z.string().trim().max(500).optional(),
});

export interface ServicioAgendado {
  readonly citaServicioId: string;
  readonly servicioId: string;
  readonly profesionalId: string;
  readonly precioCentavos: string;
  readonly inicio: string;
  readonly fin: string;
  readonly minutosActivos: number;
  /** Los minutos de procesado que quedan libres para intercalar otra clienta. */
  readonly minutosIntercalables: number;
}

export interface ResultadoAgenda {
  readonly citaId: string;
  readonly folio: string;
  readonly servicios: readonly ServicioAgendado[];
  readonly totalEstimadoCentavos: string;
}

export const agendarCita = definirComando<Transaccion, typeof entradaAgendarCita, ResultadoAgenda>({
  nombre: 'agenda.agendar_cita',
  entidad: 'cita',
  escribe: true,
  roles: [...ROLES],
  // La agenda es del paquete de salón, que no existe hasta la 066. Mientras
  // tanto se declara en todos, igual que hizo `cafeteria`: declarar un paquete
  // que no existe apagaría el comando justo para quien lo necesita.
  paquetes: PAQUETES_TODOS,
  entrada: entradaAgendarCita,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId } = ctx.ambito;
    if (sucursalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'La cita lleva folio por sucursal: hace falta saber en cuál se agenda.',
      );
    }

    if (entrada.clienteId !== undefined) {
      const cliente = await ctx.paso('cargar_cliente', () =>
        ctx.tx
          .selectFrom('clientes')
          .select(['id'])
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', entrada.clienteId ?? '')
          .executeTakeFirst(),
      );
      if (cliente === undefined) {
        throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa clienta no existe en este negocio.');
      }
    }

    const inicio = new Date(entrada.inicio);
    const planeados: PlanDeServicio[] = [];
    // Los servicios de una misma cita se encadenan: el corte empieza cuando
    // termina el tinte. Agendarlos todos a la misma hora es lo que hace que la
    // clienta llegue y encuentre a las dos personas ocupadas.
    let reloj = inicio;

    for (const pedido of entrada.servicios) {
      const plan = await planearUno(ctx, pedido, reloj);
      planeados.push(plan);
      reloj = plan.cita.rangoOcupacion.fin;
    }

    await comprobarChoques(ctx, planeados);

    const { serie, folio } = await ctx.paso('tomar_folio', () =>
      repoFolios.tomarFolio(ctx.tx, organizacionId, sucursalId, 'CITA'),
    );
    const folioTexto = `${serie}-${folio.toString()}`;

    const cita = await ctx.paso('crear_cita', () =>
      ctx.tx
        .insertInto('citas')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          folio: folioTexto,
          cliente_id: entrada.clienteId ?? null,
          origen: entrada.origen,
          estado: 'agendada',
          agendada_para: inicio,
          notas: entrada.notas ?? null,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    const servicios: ServicioAgendado[] = [];
    for (const plan of planeados) {
      const fila = await ctx.paso('crear_cita_servicio', () =>
        ctx.tx
          .insertInto('cita_servicios')
          .values({
            organizacion_id: organizacionId,
            cita_id: cita.id,
            servicio_id: plan.servicioId,
            profesional_id: plan.profesionalId,
            // El precio lo pone el SERVIDOR y se congela aquí.
            precio_centavos: plan.precioCentavos,
            rango_activo: comoMultirango(plan.cita.rangosActivos),
            rango_ocupacion: comoRango(plan.cita.rangoOcupacion),
            estado: 'pendiente',
            created_at: ctx.ahora,
          })
          .returning('id')
          .executeTakeFirstOrThrow(),
      );

      servicios.push({
        citaServicioId: fila.id,
        servicioId: plan.servicioId,
        profesionalId: plan.profesionalId,
        precioCentavos: plan.precioCentavos.toString(),
        inicio: plan.cita.rangoOcupacion.inicio.toISOString(),
        fin: plan.cita.rangoOcupacion.fin.toISOString(),
        minutosActivos: plan.cita.minutosActivos,
        minutosIntercalables: plan.cita.minutosIntercalables,
      });
    }

    const total = planeados.reduce((a, p) => a + p.precioCentavos, 0n);

    ctx.auditar({
      entidadId: cita.id,
      payload: {
        folio: folioTexto,
        clienteId: entrada.clienteId ?? null,
        servicios: servicios.length,
        totalEstimadoCentavos: total.toString(),
      },
    });

    return {
      citaId: cita.id,
      folio: folioTexto,
      servicios,
      totalEstimadoCentavos: total.toString(),
    };
  },
});

interface PlanDeServicio {
  readonly servicioId: string;
  readonly profesionalId: string;
  readonly precioCentavos: bigint;
  readonly cita: ReturnType<typeof planearCita>;
}

/**
 * El plan de UN servicio: su precio y sus cuatro tramos.
 *
 * El precio de la persona manda sobre el del catálogo —un director cobra más
 * por el mismo corte— y el factor de duración también: Karla hace el mismo
 * tinte en 80 minutos y Dany en 110. Con el mismo número, la agenda de una
 * queda con huecos y la de la otra se recorre todos los días.
 */
async function planearUno(
  ctx: ContextoComando<Transaccion>,
  pedido: { readonly servicioId: string; readonly profesionalId: string },
  desde: Date,
): Promise<PlanDeServicio> {
  const { organizacionId } = ctx.ambito;

  const servicio = await ctx.paso('cargar_servicio', () =>
    ctx.tx
      .selectFrom('servicios')
      .select([
        'producto_id as id',
        'duracion_activa_1_min as activa1',
        'duracion_pasiva_min as pasiva',
        'duracion_activa_2_min as activa2',
        'duracion_cierre_min as cierre',
      ])
      .where('organizacion_id', '=', organizacionId)
      .where('producto_id', '=', pedido.servicioId)
      .executeTakeFirst(),
  );
  if (servicio === undefined) {
    throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese servicio no está en este catálogo.');
  }

  const profesional = await ctx.paso('cargar_profesional', () =>
    ctx.tx
      .selectFrom('profesionales')
      .select(['id', 'activo'])
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', pedido.profesionalId)
      .executeTakeFirst(),
  );
  if (profesional === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa persona no atiende en este negocio.');
  }
  if (!profesional.activo) {
    // Agendar con quien ya no trabaja aquí llena la agenda de citas que nadie
    // va a dar, y la clienta se entera al llegar.
    throw new ErrorDominio('CONFIGURACION_INVALIDA', 'Esa persona ya no está activa.');
  }

  const asignado = await ctx.paso('cargar_asignacion', () =>
    ctx.tx
      .selectFrom('servicios_profesional')
      .select(['precio_centavos as precio', 'factor_duracion_bp as factor'])
      .where('organizacion_id', '=', organizacionId)
      .where('servicio_id', '=', pedido.servicioId)
      .where('profesional_id', '=', pedido.profesionalId)
      .executeTakeFirst(),
  );
  if (asignado === undefined) {
    // Quien no da ese servicio no lo da. Agendarle un tinte a quien sólo corta
    // es cómo la clienta llega a las diez y se va sin servicio.
    throw new ErrorDominio('CONFIGURACION_INVALIDA', 'Esa persona no da ese servicio.', {
      servicioId: pedido.servicioId,
      profesionalId: pedido.profesionalId,
    });
  }

  const producto = await ctx.paso('cargar_precio_catalogo', () =>
    ctx.tx
      .selectFrom('productos')
      .select(['id', 'precio_venta_centavos as precio'])
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', pedido.servicioId)
      .executeTakeFirst(),
  );

  return {
    servicioId: pedido.servicioId,
    profesionalId: pedido.profesionalId,
    // El de la persona manda; si no tiene, el del catálogo.
    precioCentavos: asignado.precio ?? producto?.precio ?? 0n,
    cita: planearCita(
      {
        activa1Min: servicio.activa1,
        pasivaMin: servicio.pasiva,
        activa2Min: servicio.activa2,
        cierreMin: servicio.cierre,
      },
      desde,
      asignado.factor,
    ),
  };
}

/**
 * Nadie queda agendado dos veces a la misma hora.
 *
 * Se compara contra los rangos ACTIVOS: el procesado de la clienta anterior NO
 * ocupa al profesional, y ése es el hueco que hace que el salón atienda nueve
 * en vez de seis. Comparar contra la ocupación completa devolvería la agenda al
 * modelo de un solo número y tiraría F-415 entera.
 */
async function comprobarChoques(
  ctx: ContextoComando<Transaccion>,
  planeados: readonly PlanDeServicio[],
): Promise<void> {
  for (const plan of planeados) {
    const vivas = await ctx.paso('cargar_agenda', () =>
      ctx.tx
        .selectFrom('cita_servicios')
        .select(['id', 'rango_activo as activo'])
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('profesional_id', '=', plan.profesionalId)
        .where('estado', '<>', 'cancelado')
        .execute(),
    );

    const ocupados = vivas.flatMap((v) => desdeMultirango(v.activo));
    if (!elProfesionalPuede(plan.cita.rangosActivos, ocupados)) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa persona ya tiene a alguien a esa hora.',
        { profesionalId: plan.profesionalId },
      );
    }

    // Y contra los otros servicios de ESTA misma cita: dos servicios encadenados
    // con la misma persona no pueden solaparse entre ellos, y la base los ve
    // como dos inserciones que todavía no existen cuando se comprueba la otra.
    const hermanos = planeados
      .filter((otro) => otro !== plan && otro.profesionalId === plan.profesionalId)
      .flatMap((otro) => otro.cita.rangosActivos);
    if (!elProfesionalPuede(plan.cita.rangosActivos, hermanos)) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Dos servicios de esta misma cita le caen encima a la misma persona.',
        { profesionalId: plan.profesionalId },
      );
    }
  }
}

/** `[10:00,10:40)` — el literal de `tstzrange` que Postgres entiende. */
export function comoRango(rango: Rango): string {
  return `[${rango.inicio.toISOString()},${rango.fin.toISOString()})`;
}

/** `{[10:00,10:40),[11:25,11:50)}` — el literal de `tstzmultirange`. */
export function comoMultirango(rangos: readonly Rango[]): string {
  return `{${rangos.map(comoRango).join(',')}}`;
}

/**
 * De vuelta: el multirango de Postgres a rangos comparables.
 *
 * Se parte a mano y no con una librería porque el formato es estable y conocido,
 * y meter una dependencia para leer cuatro corchetes sería más código del que
 * ahorra.
 */
export function desdeMultirango(texto: string): readonly Rango[] {
  const cuerpo = texto.trim().replace(/^\{/, '').replace(/\}$/, '');
  if (cuerpo === '') return [];

  const rangos: Rango[] = [];
  for (const trozo of cuerpo.split(/\)\s*,\s*\[/)) {
    const rango = desdeRango(trozo);
    if (rango !== null) rangos.push(rango);
  }
  return rangos;
}

/**
 * Un `tstzrange` suelto. Un bloqueo de agenda es uno, no un multirango.
 *
 * Lo usa `desdeMultirango` para cada trozo: son el mismo formato y leerlo dos
 * veces de dos maneras es cómo acaban discrepando en el caso raro —el de las
 * comillas— que sólo aparece cuando Postgres decide ponerlas.
 */
export function desdeRango(texto: string): Rango | null {
  const limpio = texto.trim().replace(/^\[/, '').replace(/\)$/, '');
  const [desde = '', hasta = ''] = limpio.split(',').map((t) => t.trim().replace(/^"|"$/g, ''));
  if (desde === '' || hasta === '') return null;
  return { inicio: new Date(desde), fin: new Date(hasta) };
}
