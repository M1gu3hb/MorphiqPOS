import 'server-only';

import { PAQUETES_DEL_TABLERO } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';
import {
  fechaDelNegocio,
  huecosDelDia,
  limitesDelDia,
  MINIMO_VENDIBLE_MIN,
  ocupacionEntre,
  porVolverDeLaCartera,
  sumarDias,
} from '../salon/consultas.ts';
import { diaDelNegocio, type LimitesDelDia } from './dia.ts';
import { centavosDe, leerVentaDelDia, puntosBase, type VentaDelDia } from './piezas.ts';

/**
 * EL TABLERO DE LA ESTÉTICA (F-056 · `estetica-salon/04-INTERFAZ.md` §4.4).
 *
 * ── Por qué éste no es la pantalla de inicio, y los otros cuatro sí ───────
 * Porque su carpeta le dedica una sección entera a defenderlo: «a las 9:45 de la
 * mañana, casi todos los indicadores de un dashboard son adornos». Lo único que a
 * esa hora todavía cambia el resultado de hoy es a quién llamar para llenar el
 * hueco de las once, y eso está en la AGENDA. La agenda se abre cuarenta a ochenta
 * veces al día; este tablero, dos. Así que la raíz de una estética lleva a su
 * agenda y este tablero vive dentro de Reportes.
 *
 * ── Y por qué MIRA HACIA ADELANTE ─────────────────────────────────────────
 * Su indicador estrella es la ocupación de MAÑANA: el único número del tablero
 * sobre el que todavía se puede actuar. Por eso no es un número solo —trae los
 * huecos con hora, de la lista de espera quién los quería, y cuántas citas siguen
 * sin confirmar—: «un indicador que sólo dijera 68 % sería un adorno».
 *
 * Los ocho, en su orden:
 *
 * 1 · Ocupación de mañana · con sus huecos, su valor y la lista de espera.
 * 2 · Se están yendo · quién pasó su ciclo, y cuánto vale esa cartera al mes.
 * 3 · No llegaron, 30 días · con su REFERENCIA del giro y quién reincide.
 * 4 · Ocupación por profesional, 7 días · ocupación, nunca ranking de venta.
 * 5 · Venta contra el mismo día de la semana pasada · con servicio vs. producto.
 * 6 · Producto por profesional · a quién capacitar en recomendar.
 * 7 · Lo que le quedó al salón, mes corrido · CON LA COMISIÓN RESTADA.
 * 8 · Propina pendiente de entregar · dinero que no es del salón.
 *
 * ── Los que están PROHIBIDOS aquí, y su §4.4.3 los nombra ─────────────────
 * El ranking de profesionales por venta —«suena útil y es tóxico»: con carteras y
 * esquemas distintos compara peras con manzanas—, el ticket promedio del salón
 * —mezcla un corte de $250 con un balayage de $3,200—, el total histórico de
 * ventas y la gráfica de venta por hora. Lo que sí va es la OCUPACIÓN, que mide el
 * uso del recurso y no a la persona.
 */

const DIRECCION = ['dueno', 'administrador', 'gerente'] as const;

/** Holgura del ciclo: un día de retraso no es «se está yendo» (F-951). */
const HOLGURA_DEL_CICLO_DIAS = 7;

/** Cuántas clientas en riesgo se nombran. La llamada del martes son diez, no cien. */
const CLIENTAS_QUE_SE_NOMBRAN = 4;

/** La ventana del no-show. Treinta días, como su §4.4.2. */
const VENTANA_NO_SHOW_DIAS = 30;

/** Los siete días del reporte de ocupación por profesional. */
const DIAS_DE_OCUPACION = 7;

const MS_POR_DIA = 86_400_000;

export const entradaTableroDeEstetica = z.object({});

export interface OcupacionDeAlguien {
  readonly nombre: string;
  readonly ocupacionBp: number;
  readonly citas: number;
}

export interface HuecoDeManana {
  readonly nombre: string;
  /** En ISO. La pantalla la pinta en la zona del navegador, que es la del salón. */
  readonly inicio: string;
  readonly minutos: number;
}

export interface ClientaQueSeVa {
  readonly nombre: string;
  readonly diasDesde: number;
  readonly cadaDias: number;
}

export interface Reincidente {
  readonly nombre: string;
  readonly veces: number;
}

export interface ProductoDeAlguien {
  readonly nombre: string;
  /** Qué parte de sus citas del mes llevaron producto. */
  readonly conProductoBp: number;
  readonly hoyCentavos: string;
}

export interface TableroDeEstetica {
  readonly fecha: string;
  /** 1 · MAÑANA. El estrella, y el único sobre el que se puede actuar. */
  readonly manana: {
    readonly fecha: string;
    /**
     * `false` cuando mañana NADIE tiene horario: el salón cierra.
     *
     * Sin esta bandera, un domingo con el salón cerrado y un domingo con la agenda
     * vacía se leen igual —«0 %»— y son cosas opuestas: una no se puede arreglar y
     * la otra es la llamada de hoy. Cero entre cero no es cero por ciento.
     */
    readonly hayHorario: boolean;
    readonly ocupacionBp: number;
    readonly profesionales: readonly OcupacionDeAlguien[];
    readonly huecos: readonly HuecoDeManana[];
    readonly valorDelTiempoLibreCentavos: string;
    /** De la lista de espera, quién quería una franja de mañana. */
    readonly laQuerian: readonly string[];
    readonly sinConfirmar: number;
  };
  /** 2 · Se están yendo, con el valor de la cartera en riesgo AL MES. */
  readonly seVan: {
    readonly clientas: number;
    readonly nombres: readonly ClientaQueSeVa[];
    readonly enRiesgoAlMesCentavos: string;
  };
  /** 3 · No llegaron, 30 días, con su referencia del giro. */
  readonly noLlegaron: {
    readonly citas: number;
    readonly deCitas: number;
    readonly proporcionBp: number;
    readonly costoCentavos: string;
    readonly reincidentes: readonly Reincidente[];
  };
  /** 4 · La ocupación de los últimos siete días, por profesional. */
  readonly porProfesional: readonly OcupacionDeAlguien[];
  /** 5 · La venta de hoy contra el mismo día de la semana pasada. */
  readonly venta: VentaDelDia & { readonly servicioBp: number };
  /** 6 · Producto por profesional: a quién capacitar. */
  readonly producto: readonly ProductoDeAlguien[];
  /** 7 · Lo que le quedó al salón, mes corrido, con la comisión restada. */
  readonly leQuedo: {
    readonly ventaCentavos: string;
    readonly comisionCentavos: string;
    readonly materialCentavos: string;
    readonly gastosCentavos: string;
    readonly quedoCentavos: string;
    readonly quedoBp: number;
    readonly comisionBp: number;
  };
  /** 8 · La propina que el salón debe. No es suya. */
  readonly propina: {
    readonly pendienteCentavos: string;
    readonly diasLaMasVieja: number;
  };
}

export const tableroDeEstetica = definirComando<
  Transaccion,
  typeof entradaTableroDeEstetica,
  TableroDeEstetica
>({
  nombre: 'reportes.tablero_estetica',
  entidad: 'organizacion',
  escribe: false,
  roles: [...DIRECCION],
  paquetes: PAQUETES_DEL_TABLERO.estetica,
  entrada: entradaTableroDeEstetica,
  async ejecutar(ctx) {
    const { organizacionId } = ctx.ambito;
    const dia = await ctx.paso('dia_del_negocio', () =>
      diaDelNegocio(ctx.tx, organizacionId, ctx.ahora),
    );
    // La fecha del negocio se pregunta otra vez —y no se toma de `dia.fecha`—
    // porque la agenda tiene su propia lectura de la zona y las dos tienen que
    // decir lo mismo: si discreparan, «mañana» sería otro día para el tablero que
    // para la rejilla, y el indicador estrella hablaría de un día que la agenda no
    // enseña. Preguntar dos veces cuesta una consulta y hace imposible ese sesgo.
    const hoy = await fechaDelNegocio(ctx, ctx.ahora);
    const manana = sumarDias(hoy, 1);

    const [
      ocupacionDeManana,
      huecos,
      sinConfirmar,
      laQuerian,
      seVan,
      noLlegaron,
      porProfesional,
      venta,
      servicioDeHoy,
      producto,
      leQuedo,
      propina,
    ] = await Promise.all([
      ocupacionEntre(ctx, manana, sumarDias(manana, 1)),
      huecosDelDia(ctx, manana, MINIMO_VENDIBLE_MIN),
      leerSinConfirmar(ctx, manana),
      leerLaQuerian(ctx, manana),
      leerSeVan(ctx, dia),
      leerNoLlegaron(ctx.tx, organizacionId, dia),
      ocupacionEntre(ctx, sumarDias(hoy, -(DIAS_DE_OCUPACION - 1)), manana),
      leerVentaDelDia(ctx.tx, organizacionId, dia),
      leerServicioDeHoy(ctx.tx, organizacionId, dia),
      leerProductoPorProfesional(ctx.tx, organizacionId, dia),
      leerLoQueQuedo(ctx.tx, organizacionId, dia),
      leerPropinaPendiente(ctx.tx, organizacionId, ctx.ahora),
    ]);

    const minutosOcupados = ocupacionDeManana.profesionales.reduce(
      (suma, p) => suma + p.minutosOcupados,
      0,
    );
    const minutosDisponibles = ocupacionDeManana.profesionales.reduce(
      (suma, p) => suma + p.minutosDisponibles,
      0,
    );

    return {
      fecha: dia.fecha,
      manana: {
        fecha: manana,
        hayHorario: minutosDisponibles > 0,
        ocupacionBp:
          minutosDisponibles === 0
            ? 0
            : Math.round((minutosOcupados * 10_000) / minutosDisponibles),
        profesionales: comoOcupacion(ocupacionDeManana.profesionales),
        // Los tres primeros por hora, que son los que caben en la tarjeta. El
        // VALOR es de TODOS los huecos: el tiempo libre que no se enseña también
        // se está perdiendo, y recortarlo a tres subvaloraría la pérdida.
        huecos: huecos.slice(0, 3).map((hueco) => ({
          nombre: hueco.nombreCorto,
          inicio: hueco.inicio,
          minutos: hueco.minutos,
        })),
        valorDelTiempoLibreCentavos: huecos
          .reduce((suma, hueco) => suma + BigInt(hueco.valorEstimadoCentavos), 0n)
          .toString(),
        laQuerian,
        sinConfirmar,
      },
      seVan,
      noLlegaron,
      porProfesional: comoOcupacion(porProfesional.profesionales),
      venta: {
        ...venta,
        servicioBp: puntosBase(servicioDeHoy, BigInt(venta.hoyCentavos)),
      },
      producto,
      leQuedo,
      propina,
    };
  },
});

/**
 * Lo que el tablero enseña de una ocupación: sin la venta de cada persona.
 *
 * ── Y sin quien no tenía horario en esos días ─────────────────────────────
 * El reporte trae a TODAS las profesionales activas, con cero minutos disponibles las
 * que no trabajan ese día. Enseñarlas dice «Dany 0 %» un domingo en que Dany no iba a
 * venir, y ese renglón manda a tener una conversación que no hay que tener. Cero entre
 * cero no es cero por ciento: es una pregunta sin denominador.
 */
function comoOcupacion(
  profesionales: readonly {
    readonly nombreCorto: string;
    readonly ocupacionBp: number;
    readonly citas: number;
    readonly minutosDisponibles: number;
  }[],
): readonly OcupacionDeAlguien[] {
  return (
    profesionales
      .filter((p) => p.minutosDisponibles > 0)
      .map((p) => ({ nombre: p.nombreCorto, ocupacionBp: p.ocupacionBp, citas: p.citas }))
      // De mayor a menor ocupación. Y sin `vendidoCentavos`, que el reporte sí
      // trae: un ranking por venta es lo que su §4.4.3 prohíbe con nombre y
      // apellido —«suena útil y es tóxico»—, así que no se sirve.
      .sort((a, b) => b.ocupacionBp - a.ocupacionBp)
  );
}

/**
 * Cuántas citas de mañana siguen sin confirmar.
 *
 * `agendada` y no `confirmada`: el recordatorio se manda a quien no ha contestado,
 * y mandárselo a quien ya confirmó es cómo el salón se vuelve ruido.
 */
async function leerSinConfirmar(ctx: ContextoComando<Transaccion>, fecha: string): Promise<number> {
  const { desde, hasta } = await limitesDelDia(ctx, fecha);
  const filas = await ctx.paso('sin_confirmar', () =>
    sql<{ cuantas: string }>`
      select count(*) as cuantas
        from citas c
       where c.organizacion_id = ${ctx.ambito.organizacionId}
         and c.agendada_para >= ${desde}
         and c.agendada_para < ${hasta}
         and c.estado = 'agendada'
    `.execute(ctx.tx),
  );
  return Number(filas.rows[0]?.cuantas ?? 0);
}

/**
 * De la lista de espera, quién quería una franja de MAÑANA.
 *
 * Es la mitad que convierte el hueco en una llamada: «11:00 libre» no es una
 * acción, y «Lucía quería el miércoles por la mañana» sí. La ventana de la espera
 * es un rango —nadie dice «el sábado a las 11:00»— así que se cruza por solape
 * con el día, que es lo que la tabla permite preguntar sin inventar una hora.
 */
async function leerLaQuerian(
  ctx: ContextoComando<Transaccion>,
  fecha: string,
): Promise<readonly string[]> {
  const { desde, hasta } = await limitesDelDia(ctx, fecha);
  const filas = await ctx.paso('lista_de_espera', () =>
    sql<{ nombre: string | null }>`
      select cl.nombre as nombre
        from lista_espera_citas e
        left join clientes cl on cl.id = e.cliente_id
       where e.organizacion_id = ${ctx.ambito.organizacionId}
         and e.estado in ('esperando', 'avisada')
         and (e.ventana && tstzrange(${desde}, ${hasta}, '[)') or e.flexible_de_dia)
       order by e.prioridad desc, e.created_at asc
       limit 4
    `.execute(ctx.tx),
  );
  return filas.rows.map((fila) => fila.nombre ?? 'Sin nombre');
}

/**
 * Quién se está yendo, y CUÁNTO VALE ESA CARTERA AL MES.
 *
 * El número de clientas solo no mueve a nadie; los pesos sí. El valor se estima
 * con lo que cada una GASTA POR VISITA —su propio promedio, no el del salón— y su
 * propia frecuencia: recuperar una clienta de color de $950 cada cinco semanas son
 * $9,900 al año, y ése es el argumento de la llamada.
 */
async function leerSeVan(
  ctx: ContextoComando<Transaccion>,
  dia: LimitesDelDia,
): Promise<TableroDeEstetica['seVan']> {
  const clientas = await porVolverDeLaCartera(ctx, {
    holguraDias: HOLGURA_DEL_CICLO_DIAS,
    limite: 100,
  });
  if (clientas.length === 0) {
    return { clientas: 0, nombres: [], enRiesgoAlMesCentavos: '0' };
  }

  const filas = await ctx.paso('gasto_por_clienta', () =>
    sql<{ cliente_id: string; promedio: string }>`
      select c.cliente_id                                       as cliente_id,
             coalesce(avg(o.total_centavos), 0)::bigint          as promedio
        from citas c
        join ordenes o on o.id = c.orden_id
       where c.organizacion_id = ${ctx.ambito.organizacionId}
         and c.estado = 'cobrada'
         and c.cliente_id = any(${clientas.map((x) => x.clienteId)}::uuid[])
         and o.estado = 'pagada'
         and o.created_at >= ${new Date(dia.hasta.getTime() - 365 * MS_POR_DIA)}
       group by c.cliente_id
    `.execute(ctx.tx),
  );
  const promedioPorClienta = new Map(filas.rows.map((f) => [f.cliente_id, centavosDe(f.promedio)]));

  let enRiesgo = 0n;
  for (const clienta of clientas) {
    const promedio = promedioPorClienta.get(clienta.clienteId) ?? 0n;
    if (promedio === 0n || clienta.frecuenciaDias <= 0) continue;
    // Al mes, que es la unidad en la que se decide si vale la pena la llamada.
    enRiesgo += (promedio * 30n) / BigInt(clienta.frecuenciaDias);
  }

  return {
    clientas: clientas.length,
    nombres: clientas.slice(0, CLIENTAS_QUE_SE_NOMBRAN).map((clienta) => ({
      nombre: clienta.nombre,
      diasDesde: clienta.diasDesde,
      cadaDias: clienta.frecuenciaDias,
    })),
    enRiesgoAlMesCentavos: enRiesgo.toString(),
  };
}

/**
 * No llegaron, últimos 30 días, CON SU COSTO y quién reincide.
 *
 * ── El denominador son las citas que TOCABAN ──────────────────────────────
 * Las cobradas más las que no llegaron. Una cancelada con aviso no es un no-show
 * —la franja se liberó y se pudo vender— y meterla en el denominador diluiría el
 * porcentaje justo en el salón que avisa mejor.
 *
 * La referencia del giro —15 %–20 % sin nada puesto, menos de 8 % con recordatorio,
 * confirmación y anticipo— la pinta la pantalla: un 4.5 % solo no le dice nada a
 * nadie, igual que la diferencia de conteo de `abarrotes` contra el 1.5 % de ANTAD.
 */
async function leerNoLlegaron(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<TableroDeEstetica['noLlegaron']> {
  const desde = new Date(dia.hasta.getTime() - VENTANA_NO_SHOW_DIAS * MS_POR_DIA);

  const conteos = await sql<{ no_llego: string; tocaban: string; costo: string }>`
    select count(*) filter (where c.estado = 'no_llego')                        as no_llego,
           count(*)                                                            as tocaban,
           coalesce(sum(case when c.estado = 'no_llego'
                             then coalesce(s.precio, 0) end), 0)               as costo
      from citas c
      left join (
        select cs.cita_id, sum(cs.precio_centavos) as precio
          from cita_servicios cs
         where cs.organizacion_id = ${organizacionId}
         group by cs.cita_id
      ) s on s.cita_id = c.id
     where c.organizacion_id = ${organizacionId}
       and c.agendada_para >= ${desde}
       and c.agendada_para < ${dia.hasta}
       and c.estado in ('cobrada', 'no_llego')
  `.execute(tx);

  const reincidentes = await sql<{ nombre: string | null; veces: string }>`
    select cl.nombre  as nombre,
           count(*)   as veces
      from citas c
      join clientes cl on cl.id = c.cliente_id
     where c.organizacion_id = ${organizacionId}
       and c.estado = 'no_llego'
       and c.agendada_para >= ${desde}
       and c.agendada_para < ${dia.hasta}
     group by cl.nombre
    having count(*) > 1
     order by count(*) desc
     limit 3
  `.execute(tx);

  const fila = conteos.rows[0];
  const noLlego = Number(fila?.no_llego ?? 0);
  const tocaban = Number(fila?.tocaban ?? 0);
  return {
    citas: noLlego,
    deCitas: tocaban,
    proporcionBp: tocaban === 0 ? 0 : Math.round((noLlego * 10_000) / tocaban),
    costoCentavos: centavosDe(fila?.costo).toString(),
    reincidentes: reincidentes.rows.map((r) => ({
      nombre: r.nombre ?? 'Sin nombre',
      veces: Number(r.veces),
    })),
  };
}

/**
 * Cuánto de la venta de hoy fue SERVICIO.
 *
 * La mezcla es la que explica el margen del salón: el servicio es horario y el
 * producto no. Se lee de `productos.tipo_venta`, que es donde el catálogo declara
 * cuál es cuál; una línea sin producto del catálogo cuenta como producto, que es lo
 * conservador para un indicador que sirve para empujar la recomendación.
 */
async function leerServicioDeHoy(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<bigint> {
  const filas = await sql<{ servicio: string }>`
    select coalesce(sum(l.total_centavos), 0) as servicio
      from orden_lineas l
      join ordenes o on o.id = l.orden_id
      join productos p on p.id = l.producto_id
     where o.organizacion_id = ${organizacionId}
       and o.estado = 'pagada'
       and l.anulada_en is null
       and p.tipo_venta = 'servicio'
       and o.created_at >= ${dia.desde}
       and o.created_at < ${dia.hasta}
  `.execute(tx);
  return centavosDe(filas.rows[0]?.servicio);
}

/**
 * Producto por profesional: qué parte de SUS citas llevó producto.
 *
 * ── Por qué la cita se le atribuye a UNA persona ──────────────────────────
 * Porque una cita con dos profesionales contada en las dos infla el denominador de
 * las dos y el indicador deja de poder compararse. Se atribuye a quien la RECIBIÓ
 * —el servicio que empezó primero—, que es quien tiene la conversación con la
 * cabeza mojada: «la única forma de que el producto se venda es que quien atiende
 * lo recomiende».
 *
 * El porcentaje es del MES —un día no alcanza para ver una costumbre— y el dinero
 * es de HOY, que es lo que su §4.4.2 pinta.
 */
async function leerProductoPorProfesional(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<readonly ProductoDeAlguien[]> {
  const filas = await sql<{
    nombre: string;
    citas: string;
    con_producto: string;
    hoy: string;
  }>`
    with mes as (
      select c.id as cita_id, c.orden_id
        from citas c
       where c.organizacion_id = ${organizacionId}
         and c.estado = 'cobrada'
         and c.agendada_para >= ${dia.inicioDelMes}
         and c.agendada_para < ${dia.hasta}
    ),
    atiende as (
      select distinct on (cs.cita_id) cs.cita_id, cs.profesional_id
        from cita_servicios cs
        join mes m on m.cita_id = cs.cita_id
       where cs.organizacion_id = ${organizacionId}
       order by cs.cita_id, lower(cs.rango_ocupacion)
    ),
    producto_de_la_orden as (
      select l.orden_id,
             sum(l.total_centavos)                                             as importe,
             sum(case when o.created_at >= ${dia.desde} then l.total_centavos
                      else 0 end)                                              as hoy
        from orden_lineas l
        join ordenes o on o.id = l.orden_id
        left join productos p on p.id = l.producto_id
       where o.organizacion_id = ${organizacionId}
         and o.estado = 'pagada'
         and l.anulada_en is null
         and coalesce(p.tipo_venta, 'precio_fijo') <> 'servicio'
         and o.created_at >= ${dia.inicioDelMes}
         and o.created_at < ${dia.hasta}
       group by l.orden_id
    )
    select pf.nombre_corto                                                     as nombre,
           count(*)                                                            as citas,
           count(pp.orden_id)                                                  as con_producto,
           coalesce(sum(pp.hoy), 0)                                            as hoy
      from atiende a
      join mes m on m.cita_id = a.cita_id
      join profesionales pf on pf.id = a.profesional_id
      left join producto_de_la_orden pp on pp.orden_id = m.orden_id
     group by pf.nombre_corto
     order by count(pp.orden_id)::numeric / greatest(count(*), 1) desc
     limit 12
  `.execute(tx);

  return filas.rows.map((fila) => ({
    nombre: fila.nombre,
    conProductoBp: puntosBase(BigInt(fila.con_producto), BigInt(fila.citas)),
    hoyCentavos: centavosDe(fila.hoy).toString(),
  }));
}

/**
 * LO QUE LE QUEDÓ AL SALÓN, mes corrido, CON LA COMISIÓN RESTADA.
 *
 * Es el único indicador del tablero que mira hacia atrás, y va en séptimo lugar a
 * propósito. La comisión se resta SIEMPRE: un margen bruto sin comisión diría 78 %
 * donde hay 28 %, y sobre ese 78 % se contrata gente que no se puede pagar.
 *
 * El material es el de cabina —`consumo_servicio`, el tinte que se mezcló— valuado
 * al costo con el que salió del almacén, no al de hoy.
 */
async function leerLoQueQuedo(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<TableroDeEstetica['leQuedo']> {
  const desdeElMes = `${dia.fecha.slice(0, 8)}01`;
  const filas = await sql<{
    venta: string;
    comision: string;
    material: string;
    gastos: string;
  }>`
    select (select coalesce(sum(o.total_centavos), 0)
              from ordenes o
             where o.organizacion_id = ${organizacionId}
               and o.estado = 'pagada'
               and o.created_at >= ${dia.inicioDelMes}
               and o.created_at < ${dia.hasta})                                as venta,
           (select coalesce(sum(cc.monto_centavos), 0)
              from comisiones_causadas cc
             where cc.organizacion_id = ${organizacionId}
               and cc.causada_en >= ${dia.inicioDelMes}
               and cc.causada_en < ${dia.hasta})                               as comision,
           (select coalesce(sum(round(abs(m.cantidad::numeric)
                                      * m.costo_unitario_centavos)), 0)
              from movimientos_stock m
             where m.organizacion_id = ${organizacionId}
               and m.tipo = 'consumo_servicio'
               and m.created_at >= ${dia.inicioDelMes}
               and m.created_at < ${dia.hasta})                                as material,
           (select coalesce(sum(g.monto_centavos), 0)
              from gastos g
             where g.organizacion_id = ${organizacionId}
               and g.fecha >= ${desdeElMes}::date
               and g.fecha <= ${dia.fecha}::date)                              as gastos
  `.execute(tx);

  const fila = filas.rows[0];
  const venta = centavosDe(fila?.venta);
  const comision = centavosDe(fila?.comision);
  const material = centavosDe(fila?.material);
  const gastos = centavosDe(fila?.gastos);
  const quedo = venta - comision - material - gastos;
  return {
    ventaCentavos: venta.toString(),
    comisionCentavos: comision.toString(),
    materialCentavos: material.toString(),
    gastosCentavos: gastos.toString(),
    quedoCentavos: quedo.toString(),
    quedoBp: puntosBase(quedo, venta),
    comisionBp: puntosBase(comision, venta),
  };
}

/**
 * La propina que el salón DEBE, y desde cuándo debe la más vieja.
 *
 * ── Por qué el saldo se suma y la más vieja se busca en orden ─────────────
 * El saldo de cada profesional es la suma firmada de sus movimientos —lo recibido
 * suma, lo entregado resta—, y sólo se suman los POSITIVOS: un saldo negativo es un
 * adelanto y restarlo aquí escondería lo que se le debe a otra.
 *
 * La más vieja se busca por orden de llegada: la propina que sigue pendiente no es
 * la primera que entró nunca, es la primera que lo entregado todavía no cubre. Sin
 * eso, un salón que paga cada semana enseñaría «la más vieja: 400 días» para
 * siempre, y el aviso dejaría de significar nada.
 */
async function leerPropinaPendiente(
  tx: Transaccion,
  organizacionId: string,
  ahora: Date,
): Promise<TableroDeEstetica['propina']> {
  const filas = await sql<{ pendiente: string; mas_vieja: Date | null }>`
    with saldos as (
      select p.profesional_id,
             sum(p.monto_centavos)                                              as saldo,
             coalesce(sum(-p.monto_centavos) filter (where p.monto_centavos < 0), 0)
                                                                                as entregado
        from movimientos_propina p
       where p.organizacion_id = ${organizacionId}
       group by p.profesional_id
    ),
    recibidas as (
      select p.profesional_id,
             p.created_at,
             sum(p.monto_centavos) over (partition by p.profesional_id
                                         order by p.created_at, p.id)           as acumulado
        from movimientos_propina p
       where p.organizacion_id = ${organizacionId}
         and p.monto_centavos > 0
    )
    select (select coalesce(sum(s.saldo), 0) from saldos s where s.saldo > 0)    as pendiente,
           (select min(r.created_at)
              from recibidas r
              join saldos s on s.profesional_id = r.profesional_id
             where s.saldo > 0
               and r.acumulado > s.entregado)                                   as mas_vieja
  `.execute(tx);

  const fila = filas.rows[0];
  const masVieja = fila?.mas_vieja ?? null;
  return {
    pendienteCentavos: centavosDe(fila?.pendiente).toString(),
    diasLaMasVieja:
      masVieja === null
        ? 0
        : Math.max(0, Math.floor((ahora.getTime() - new Date(masVieja).getTime()) / MS_POR_DIA)),
  };
}
