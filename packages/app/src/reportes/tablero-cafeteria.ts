import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { diaDelNegocio, type LimitesDelDia } from './dia.ts';
import { centavosDe, puntosBase } from './piezas.ts';

/**
 * EL TABLERO DE LA CAFETERÍA (F-056 · `cafeteria/04-INTERFAZ.md` §4.4).
 *
 * ── La hora a la que se mira, que es lo que lo diseña ─────────────────────
 * «A las ocho de la mañana **nadie** mira el dashboard»: es la hora de más trabajo
 * del día. Se mira **a las 10:30, cuando baja la ráfaga, y a las 20:40, al cerrar**.
 * Diseñarlo para esos dos momentos es diseñarlo bien; diseñarlo «para todo el día»
 * es diseñarlo para nadie.
 *
 * ── Y sobre el TURNO, no sobre el día ─────────────────────────────────────
 * Como el restaurante y al revés que la tiendita: el dinero que importa aquí es el
 * del turno abierto, porque es el que se va a cortar. Sin turno abierto todo está en
 * cero **a propósito**, y la pantalla lo dice con un aviso en vez de enseñar ceros
 * que parecen un mal día.
 *
 * Lo único que NO va por turno es la ráfaga: es una franja del día —07:00 a 10:30—
 * y se compara con la del mismo día de la semana pasada, que es la única comparación
 * con volumen suficiente para que la diferencia signifique algo.
 */

const DIRECCION = ['dueno', 'administrador', 'gerente'] as const;

/** La ráfaga: de las 7:00 a las 10:30, en la zona del negocio. */
const RAFAGA_DESDE = 7;
const RAFAGA_HASTA = 10.5;

export const entradaTableroDeCafeteria = z.object({});

export interface BebidaDelDia {
  readonly producto: string;
  readonly unidades: number;
  readonly utilidadCentavos: string;
}

export interface MermaPorMotivo {
  readonly motivo: string;
  readonly veces: number;
  readonly costoCentavos: string;
}

export interface TableroDeCafeteria {
  readonly fecha: string;
  /** Sin turno abierto, todo lo del turno está en cero a propósito. */
  readonly turnoAbierto: boolean;
  /** 1 · La ráfaga de la mañana contra la del mismo día de la semana pasada. */
  readonly rafaga: {
    readonly hoyCentavos: string;
    readonly referenciaCentavos: string;
    readonly bebidas: number;
  };
  /** 2 · Bebidas por hora en el pico: decide si mañana hace falta un tercero. */
  readonly pico: { readonly bebidasPorHora: number; readonly hora: string | null };
  /** 3 · Del cobro a la entrega, en segundos: decide si hay que mover la barra. */
  readonly entrega: { readonly segundos: number | null; readonly comandas: number };
  /** 4 · Lo que se acaba primero, en DÍAS y no en litros. */
  readonly seAcaba: {
    readonly insumo: string | null;
    readonly dias: number | null;
    readonly existencia: string;
    readonly unidad: string | null;
  };
  /** 5 y 6 · El cajón: lo que hay, y con cuánto se puede dar cambio. */
  readonly cajon: {
    readonly efectivoCentavos: string;
    readonly cambioCentavos: string;
  };
  /** 7 · Lo que cuesta una bebida en promedio, con su insumo y su empaque. */
  readonly costoPorBebida: { readonly centavos: string; readonly bebidas: number };
  /** 8 · La tarjeta del turno. */
  readonly tarjeta: { readonly centavos: string; readonly deLaVentaBp: number };
  /** 9 · ¿Ganamos esta mañana? Verde o roja, sin medias tintas. */
  readonly utilidad: { readonly centavos: string; readonly margenBp: number };
  /** 10 · La mezcla del día: aquí, para llevar, plataforma. */
  readonly mezcla: readonly { readonly canal: string; readonly centavos: string }[];
  /** 11 · Las bebidas del día por UTILIDAD, no por unidades. */
  readonly porUtilidad: readonly BebidaDelDia[];
  /** 12 · La frescura del grano abierto, en días desde el tueste. */
  readonly grano: { readonly dias: number | null; readonly optimos: number | null };
  /** 13 · La merma de barra del turno, por motivo. */
  readonly merma: readonly MermaPorMotivo[];
  /** 14 · Los sellos: lo otorgado hoy, lo vivo y lo que costaría canjearlo. */
  readonly sellos: {
    readonly otorgadosHoy: number;
    readonly vivos: number;
    readonly costoSiSeCanjeanCentavos: string;
  };
}

export const tableroDeCafeteria = definirComando<
  Transaccion,
  typeof entradaTableroDeCafeteria,
  TableroDeCafeteria
>({
  nombre: 'reportes.tablero_cafeteria',
  entidad: 'organizacion',
  escribe: false,
  roles: [...DIRECCION],
  paquetes: ['cafeteria'],
  entrada: entradaTableroDeCafeteria,
  async ejecutar(ctx) {
    const { organizacionId } = ctx.ambito;
    const dia = await ctx.paso('dia_del_negocio', () =>
      diaDelNegocio(ctx.tx, organizacionId, ctx.ahora),
    );
    const turno = await ctx.paso('turno_abierto', () => leerTurno(ctx.tx, organizacionId));

    const [rafaga, pico, entrega, seAcaba, delTurno, mezcla, porUtilidad, grano, merma, sellos] =
      await Promise.all([
        leerRafaga(ctx.tx, organizacionId, dia),
        leerPico(ctx.tx, organizacionId, dia),
        leerEntrega(ctx.tx, organizacionId, dia),
        leerSeAcaba(ctx.tx, organizacionId),
        leerDelTurno(ctx.tx, turno),
        leerMezcla(ctx.tx, organizacionId, dia),
        leerPorUtilidad(ctx.tx, organizacionId, dia),
        leerGrano(ctx.tx, organizacionId),
        leerMerma(ctx.tx, organizacionId, turno),
        leerSellos(ctx.tx, organizacionId, dia),
      ]);

    return {
      fecha: dia.fecha,
      turnoAbierto: turno !== null,
      rafaga,
      pico,
      entrega,
      seAcaba,
      cajon: delTurno.cajon,
      costoPorBebida: delTurno.costoPorBebida,
      tarjeta: delTurno.tarjeta,
      utilidad: delTurno.utilidad,
      mezcla,
      porUtilidad,
      grano,
      merma,
      sellos,
    };
  },
});

async function leerTurno(tx: Transaccion, organizacionId: string): Promise<string | null> {
  const filas = await sql<{ id: string }>`
    select s.id
      from sesiones_caja s
     where s.organizacion_id = ${organizacionId}
       and s.estado = 'abierta'
     order by s.abierta_en desc
     limit 1
  `.execute(tx);
  return filas.rows[0]?.id ?? null;
}

/**
 * LA RÁFAGA, de 07:00 a 10:30, contra la del mismo día de la semana pasada.
 *
 * Es la única franja del día que se puede comparar con sentido, porque es la única
 * con volumen suficiente para que la diferencia signifique algo. Y contra el mismo
 * día de la SEMANA: un martes no es un lunes.
 */
async function leerRafaga(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<TableroDeCafeteria['rafaga']> {
  const inicio = new Date(dia.desde.getTime() + RAFAGA_DESDE * 3_600_000);
  const fin = new Date(dia.desde.getTime() + RAFAGA_HASTA * 3_600_000);
  const inicioAntes = new Date(dia.haceUnaSemana.getTime() + RAFAGA_DESDE * 3_600_000);
  const finAntes = new Date(dia.haceUnaSemana.getTime() + RAFAGA_HASTA * 3_600_000);

  const filas = await sql<{ hoy: string; antes: string; bebidas: string }>`
    select coalesce(sum(case when o.created_at >= ${inicio} and o.created_at < ${fin}
                             then o.total_centavos end), 0)                      as hoy,
           coalesce(sum(case when o.created_at >= ${inicioAntes} and o.created_at < ${finAntes}
                             then o.total_centavos end), 0)                      as antes,
           coalesce(sum(case when o.created_at >= ${inicio} and o.created_at < ${fin}
                             then (select count(*) from orden_lineas l where l.orden_id = o.id)
                        end), 0)                                                 as bebidas
      from ordenes o
     where o.organizacion_id = ${organizacionId}
       and o.estado = 'pagada'
       and o.created_at >= ${inicioAntes}
       and o.created_at < ${fin}
  `.execute(tx);
  const fila = filas.rows[0];
  return {
    hoyCentavos: centavosDe(fila?.hoy).toString(),
    referenciaCentavos: centavosDe(fila?.antes).toString(),
    bebidas: Number(fila?.bebidas ?? 0),
  };
}

/**
 * La hora PICO del día y cuántas bebidas salieron en ella.
 *
 * Arriba de 45 por hora con dos personas, la fila se sale a la calle y se pierde
 * gente que ni siquiera entra. Ése es el número que decide si mañana hace falta un
 * tercero en la barra.
 */
async function leerPico(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<TableroDeCafeteria['pico']> {
  const filas = await sql<{ hora: string; bebidas: string }>`
    select to_char(date_trunc('hour', o.created_at at time zone z.zona), 'HH24:MI') as hora,
           count(l.id)                                                             as bebidas
      from ordenes o
      join orden_lineas l on l.orden_id = o.id
      cross join (select zona_horaria as zona from organizaciones where id = ${organizacionId}) z
     where o.organizacion_id = ${organizacionId}
       and o.estado = 'pagada'
       and o.created_at >= ${dia.desde}
       and o.created_at < ${dia.hasta}
     group by 1
     order by bebidas desc
     limit 1
  `.execute(tx);
  const fila = filas.rows[0];
  return {
    bebidasPorHora: Number(fila?.bebidas ?? 0),
    hora: fila?.hora ?? null,
  };
}

/**
 * Del COBRO a la ENTREGA, en segundos.
 *
 * Bajar de tres minutos a dos permite atender un 50 % más de gente con la misma
 * barra, y lo que se decide con este número es concreto: el orden de las jarras,
 * quién hace qué, si el segundo molino está mal puesto.
 */
async function leerEntrega(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<TableroDeCafeteria['entrega']> {
  const filas = await sql<{ segundos: string | null; comandas: string }>`
    select avg(extract(epoch from (c.entregada_en - c.cobrado_en)))  as segundos,
           count(*)                                                  as comandas
      from comandas c
     where c.organizacion_id = ${organizacionId}
       and c.entregada_en is not null
       and c.cobrado_en is not null
       and c.entregada_en >= ${dia.desde}
       and c.entregada_en < ${dia.hasta}
  `.execute(tx);
  const fila = filas.rows[0];
  return {
    segundos:
      fila?.segundos === null || fila?.segundos === undefined
        ? null
        : Math.round(Number(fila.segundos)),
    comandas: Number(fila?.comandas ?? 0),
  };
}

/**
 * LO QUE SE ACABA PRIMERO, en DÍAS y no en litros.
 *
 * «No son litros: son días, contra la próxima entrega del proveedor». En una
 * cafetería casi siempre es la leche, y por eso la carpeta la nombra; se calcula
 * sobre el insumo que se está yendo más rápido en vez de sobre un nombre tecleado,
 * porque una cafetería que sólo vende té no tiene leche y la tarjeta se quedaría
 * vacía para siempre.
 */
async function leerSeAcaba(
  tx: Transaccion,
  organizacionId: string,
): Promise<TableroDeCafeteria['seAcaba']> {
  const filas = await sql<{
    nombre: string;
    unidad: string;
    existencia: string;
    dias: string | null;
  }>`
    with consumo as (
      select m.insumo_id, sum(abs(m.cantidad::numeric)) / 14.0 as al_dia
        from movimientos_stock m
       where m.organizacion_id = ${organizacionId}
         and m.tipo in ('salida_venta', 'merma')
         and m.created_at >= now() - interval '14 days'
       group by m.insumo_id
      having sum(abs(m.cantidad::numeric)) > 0
    ),
    saldo as (
      select e.insumo_id, sum(e.cantidad::numeric) as cantidad
        from existencias e
       where e.organizacion_id = ${organizacionId}
       group by e.insumo_id
    )
    select i.nombre                                         as nombre,
           i.unidad_base                                    as unidad,
           coalesce(s.cantidad, 0)::text                    as existencia,
           floor(coalesce(s.cantidad, 0) / c.al_dia)::text  as dias
      from consumo c
      join insumos i on i.id = c.insumo_id
      left join saldo s on s.insumo_id = c.insumo_id
     where i.organizacion_id = ${organizacionId}
       and i.activo
     order by coalesce(s.cantidad, 0) / c.al_dia asc
     limit 1
  `.execute(tx);
  const fila = filas.rows[0];
  return {
    insumo: fila?.nombre ?? null,
    dias: fila?.dias === null || fila?.dias === undefined ? null : Number(fila.dias),
    existencia: fila?.existencia ?? '0',
    unidad: fila?.unidad ?? null,
  };
}

/**
 * Lo del TURNO: el cajón, el cambio, la tarjeta, el costo por bebida y la utilidad.
 *
 * Todo de la misma sesión y en una pasada: son cinco números de la misma caja, y
 * pedirlos por separado abriría la puerta a que dos de ellos salgan de turnos
 * distintos si alguien cierra mientras se pinta el tablero.
 */
async function leerDelTurno(
  tx: Transaccion,
  turno: string | null,
): Promise<{
  readonly cajon: TableroDeCafeteria['cajon'];
  readonly costoPorBebida: TableroDeCafeteria['costoPorBebida'];
  readonly tarjeta: TableroDeCafeteria['tarjeta'];
  readonly utilidad: TableroDeCafeteria['utilidad'];
}> {
  if (turno === null) {
    return {
      cajon: { efectivoCentavos: '0', cambioCentavos: '0' },
      costoPorBebida: { centavos: '0', bebidas: 0 },
      tarjeta: { centavos: '0', deLaVentaBp: 0 },
      utilidad: { centavos: '0', margenBp: 0 },
    };
  }

  const filas = await sql<{
    efectivo: string;
    cambio: string;
    venta: string;
    costo: string;
    bebidas: string;
    tarjeta: string;
    gastos: string;
  }>`
    select coalesce((select sum(m.monto_centavos) from movimientos_caja m
                      where m.sesion_caja_id = ${turno}), 0)                      as efectivo,
           coalesce((select s.fondo_monedas_centavos + s.fondo_chicos_centavos
                       from sesiones_caja s where s.id = ${turno}), 0)            as cambio,
           coalesce((select sum(o.total_centavos) from ordenes o
                      where o.sesion_caja_id = ${turno} and o.estado = 'pagada'), 0) as venta,
           coalesce((select sum(round(l.costo_unitario_centavos * l.cantidad::numeric))
                       from orden_lineas l
                       join ordenes o on o.id = l.orden_id
                      where o.sesion_caja_id = ${turno} and o.estado = 'pagada'), 0) as costo,
           coalesce((select count(*) from orden_lineas l
                       join ordenes o on o.id = l.orden_id
                      where o.sesion_caja_id = ${turno} and o.estado = 'pagada'), 0) as bebidas,
           coalesce((select sum(p.monto_centavos) from pagos p
                      where p.sesion_caja_id = ${turno}
                        and p.metodo = 'tarjeta'
                        and p.estado <> 'reembolsado'), 0)                        as tarjeta,
           coalesce((select sum(abs(m.monto_centavos)) from movimientos_caja m
                      where m.sesion_caja_id = ${turno}
                        and m.tipo in ('gasto', 'retiro')), 0)                    as gastos
  `.execute(tx);

  const fila = filas.rows[0];
  const venta = centavosDe(fila?.venta);
  const costo = centavosDe(fila?.costo);
  const bebidas = Number(fila?.bebidas ?? 0);
  const utilidad = venta - costo - centavosDe(fila?.gastos);

  return {
    cajon: {
      efectivoCentavos: centavosDe(fila?.efectivo).toString(),
      cambioCentavos: centavosDe(fila?.cambio).toString(),
    },
    costoPorBebida: {
      centavos: bebidas === 0 ? '0' : (costo / BigInt(bebidas)).toString(),
      bebidas,
    },
    tarjeta: {
      centavos: centavosDe(fila?.tarjeta).toString(),
      deLaVentaBp: puntosBase(centavosDe(fila?.tarjeta), venta),
    },
    utilidad: { centavos: utilidad.toString(), margenBp: puntosBase(utilidad, venta) },
  };
}

/**
 * LA MEZCLA DEL DÍA: aquí, para llevar, plataforma.
 *
 * Decide cuántos vasos pedir. Si el 70 % es para llevar, el empaque es el tercer
 * costo del negocio y no un consumible que se compra «cuando se acaba».
 */
async function leerMezcla(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<TableroDeCafeteria['mezcla']> {
  const filas = await sql<{ canal: string; total: string }>`
    select o.canal                            as canal,
           coalesce(sum(o.total_centavos), 0)  as total
      from ordenes o
     where o.organizacion_id = ${organizacionId}
       and o.estado = 'pagada'
       and o.created_at >= ${dia.desde}
       and o.created_at < ${dia.hasta}
     group by o.canal
     order by total desc
  `.execute(tx);
  return filas.rows.map((fila) => ({
    canal: fila.canal,
    centavos: centavosDe(fila.total).toString(),
  }));
}

/**
 * Las bebidas del día ordenadas por UTILIDAD, no por unidades.
 *
 * El latte vende más; el americano deja más. Un ranking por unidades hace empujar
 * exactamente lo que menos deja.
 */
async function leerPorUtilidad(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<readonly BebidaDelDia[]> {
  const filas = await sql<{ producto: string | null; unidades: string; utilidad: string }>`
    select coalesce(l.producto_nombre, 'sin nombre')                              as producto,
           coalesce(sum(l.cantidad::numeric), 0)                                  as unidades,
           coalesce(sum(l.total_centavos
                        - round(l.costo_unitario_centavos * l.cantidad::numeric)), 0) as utilidad
      from orden_lineas l
      join ordenes o on o.id = l.orden_id
     where o.organizacion_id = ${organizacionId}
       and o.estado = 'pagada'
       and o.created_at >= ${dia.desde}
       and o.created_at < ${dia.hasta}
     group by l.producto_nombre
     order by utilidad desc
     limit 5
  `.execute(tx);
  return filas.rows.map((fila) => ({
    producto: fila.producto ?? 'sin nombre',
    unidades: Math.round(Number(fila.unidades)),
    utilidadCentavos: centavosDe(fila.utilidad).toString(),
  }));
}

/**
 * La FRESCURA del grano abierto, en días desde el tueste.
 *
 * Arriba de los días óptimos que el insumo declara, el cliente lo nota antes que la
 * dueña: el lote pasa de espresso a filtrado y nadie tiene que probarlo para saberlo.
 */
async function leerGrano(
  tx: Transaccion,
  organizacionId: string,
): Promise<TableroDeCafeteria['grano']> {
  const filas = await sql<{ dias: string; optimos: number | null }>`
    select (current_date - g.fecha_tueste::date)::text as dias,
           i.dias_frescura_optima                      as optimos
      from lotes_grano g
      join insumos i on i.id = g.insumo_id
     where g.organizacion_id = ${organizacionId}
       and g.abierto_en is not null
       and g.agotado_en is null
     order by g.abierto_en asc
     limit 1
  `.execute(tx);
  const fila = filas.rows[0];
  return {
    dias: fila === undefined ? null : Number(fila.dias),
    optimos: fila?.optimos ?? null,
  };
}

/** La merma de barra del turno, por motivo: de la vista que ya la agrupa (F-156). */
async function leerMerma(
  tx: Transaccion,
  organizacionId: string,
  turno: string | null,
): Promise<readonly MermaPorMotivo[]> {
  if (turno === null) return [];
  const filas = await sql<{ motivo: string | null; veces: string; costo: string }>`
    select coalesce(m.etiqueta, m.motivo, 'sin motivo')  as motivo,
           count(*)                                      as veces,
           coalesce(sum(m.costo_centavos), 0)            as costo
      from merma_barra_turno m
     where m.organizacion_id = ${organizacionId}
       and m.sesion_caja_id = ${turno}
     group by 1
     order by costo desc
     limit 4
  `.execute(tx);
  return filas.rows.map((fila) => ({
    motivo: fila.motivo ?? 'sin motivo',
    veces: Number(fila.veces),
    costoCentavos: centavosDe(fila.costo).toString(),
  }));
}

/** Los sellos: lo otorgado hoy, lo vivo y lo que costaría que se canjeara. */
async function leerSellos(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<TableroDeCafeteria['sellos']> {
  const filas = await sql<{ hoy: string; vivos: string; costo: string }>`
    select coalesce((select sum(v.sellos) from lealtad_movimientos v
                      where v.organizacion_id = ${organizacionId}
                        and v.sellos > 0
                        and v.created_at >= ${dia.desde}
                        and v.created_at < ${dia.hasta}), 0)                as hoy,
           coalesce((select p.sellos_vivos from lealtad_pasivo p
                      where p.organizacion_id = ${organizacionId}), 0)      as vivos,
           coalesce((select p.costo_premio_centavos from lealtad_pasivo p
                      where p.organizacion_id = ${organizacionId}), 0)      as costo
  `.execute(tx);
  const fila = filas.rows[0];
  return {
    otorgadosHoy: Number(fila?.hoy ?? 0),
    vivos: Number(fila?.vivos ?? 0),
    costoSiSeCanjeanCentavos: centavosDe(fila?.costo).toString(),
  };
}
