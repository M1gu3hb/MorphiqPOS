import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

import { TOPE_DE_FILAS, hastaDe, type Ventana } from './consultas.ts';

/**
 * LO PROPIO DEL CORTE DEL SALÓN (C.6 de la 2.4): la liquidación por profesional —comisión
 * y propina, que no se suman—, la agenda del día y la de mañana, el producto de cabina,
 * las cortesías y lo rehecho, los anticipos y los paquetes. Según su §9.3.
 */

// ── Estética ────────────────────────────────────────────────────────────────

export interface LiquidacionDeProfesional {
  readonly profesional: string;
  readonly servicios: number;
  readonly baseCentavos: string;
  readonly comisionCentavos: string;
  readonly propinaRecibidaCentavos: string;
  /** De lo recibido, lo que entró por terminal: el resto fue efectivo, a la mano o a caja. */
  readonly propinaTerminalCentavos: string;
  readonly propinaEntregadaCentavos: string;
  readonly propinaPendienteCentavos: string;
}

/**
 * La liquidación del día por profesional: comisión SIN IVA sobre su base, y propina aparte
 * —recibida, entregada y lo que el salón todavía le debe, de todos los días—. Son dos
 * números distintos y el documento no los suma (D-17).
 */
export async function liquidacionPorProfesional(
  tx: Transaccion,
  organizacionId: string,
  sesion: Ventana,
): Promise<readonly LiquidacionDeProfesional[]> {
  const hasta = hastaDe(sesion);
  const { rows } = await sql<LiquidacionDeProfesional>`
    select pr.nombre_corto                                                        as "profesional",
           coalesce(cc.servicios, 0)::int                                         as "servicios",
           coalesce(cc.base, 0)::text                                             as "baseCentavos",
           coalesce(cc.comision, 0)::text                                         as "comisionCentavos",
           coalesce(mp.recibida, 0)::text                                         as "propinaRecibidaCentavos",
           coalesce(mp.terminal, 0)::text                                         as "propinaTerminalCentavos",
           coalesce(mp.entregada, 0)::text                                        as "propinaEntregadaCentavos",
           coalesce(pend.saldo, 0)::text                                          as "propinaPendienteCentavos"
      from profesionales pr
      left join lateral (
        select count(*) as servicios, sum(c.base_centavos) as base, sum(c.monto_centavos) as comision
          from comisiones_causadas c
         where c.organizacion_id = pr.organizacion_id and c.profesional_id = pr.id
           and c.causada_en between ${sesion.abiertaEn} and ${hasta}
      ) cc on true
      left join lateral (
        select sum(m.monto_centavos) filter (where m.tipo = 'recibida')  as recibida,
               sum(m.monto_centavos) filter (
                 where m.tipo = 'recibida' and m.medio <> 'efectivo')     as terminal,
               sum(m.monto_centavos) filter (where m.tipo = 'entregada') as entregada
          from movimientos_propina m
         where m.organizacion_id = pr.organizacion_id and m.profesional_id = pr.id
           and m.created_at between ${sesion.abiertaEn} and ${hasta}
      ) mp on true
      left join lateral (
        select sum(case when m.tipo = 'entregada' then -m.monto_centavos else m.monto_centavos end) as saldo
          from movimientos_propina m
         where m.organizacion_id = pr.organizacion_id and m.profesional_id = pr.id
      ) pend on true
     where pr.organizacion_id = ${organizacionId}
       and (cc.servicios > 0 or mp.recibida > 0 or mp.entregada > 0 or pend.saldo <> 0)
     order by coalesce(cc.comision, 0) desc
  `.execute(tx);
  return rows;
}

export interface CitasDelDia {
  readonly estado: string;
  readonly citas: number;
}

/** La agenda de un día: cuántas citas en cada estado. El día es el de `desde`. */
export async function agendaDelDia(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  desde: Date,
  hasta: Date,
): Promise<readonly CitasDelDia[]> {
  const { rows } = await sql<CitasDelDia>`
    select c.estado as "estado", count(*)::int as "citas"
      from citas c
     where c.organizacion_id = ${organizacionId}
       and (c.sucursal_id = ${sucursalId} or c.sucursal_id is null)
       and c.agendada_para >= ${desde}
       and c.agendada_para < ${hasta}
     group by c.estado
     order by count(*) desc
  `.execute(tx);
  return rows;
}

export interface CitaDeManana {
  readonly hora: Date;
  readonly clienta: string | null;
  readonly servicios: string | null;
  readonly profesional: string | null;
}

export async function citasDeManana(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  desde: Date,
  hasta: Date,
): Promise<readonly CitaDeManana[]> {
  const { rows } = await sql<CitaDeManana>`
    select c.agendada_para                                    as "hora",
           cl.nombre                                          as "clienta",
           (select string_agg(coalesce(sp.nombre, 'Servicio'), ', ')
              from cita_servicios cs
              left join productos sp on sp.id = cs.servicio_id
             where cs.cita_id = c.id)                         as "servicios",
           (select string_agg(distinct pr.nombre_corto, ', ')
              from cita_servicios cs
              join profesionales pr on pr.id = cs.profesional_id
             where cs.cita_id = c.id)                         as "profesional"
      from citas c
      left join clientes cl on cl.id = c.cliente_id and cl.organizacion_id = c.organizacion_id
     where c.organizacion_id = ${organizacionId}
       and (c.sucursal_id = ${sucursalId} or c.sucursal_id is null)
       and c.estado in ('agendada', 'confirmada')
       and c.agendada_para >= ${desde}
       and c.agendada_para < ${hasta}
     order by c.agendada_para
     limit 60
  `.execute(tx);
  return rows;
}

export interface AnticiposDelDia {
  readonly cobradosCentavos: string;
  readonly aplicadosCentavos: string;
  readonly retenidosCentavos: string;
  readonly vivosCentavos: string;
  readonly vivos: number;
}

export async function anticiposDelDia(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
  sesion: Ventana,
): Promise<AnticiposDelDia> {
  const hasta = hastaDe(sesion);
  const { rows } = await sql<AnticiposDelDia>`
    select coalesce(sum(a.monto_centavos) filter (where a.sesion_caja_id = ${sesionCajaId}), 0)::text
                                                                           as "cobradosCentavos",
           coalesce(sum(a.monto_centavos) filter (
             where a.estado = 'aplicado' and a.resuelto_en between ${sesion.abiertaEn} and ${hasta}), 0)::text
                                                                           as "aplicadosCentavos",
           coalesce(sum(a.monto_centavos) filter (
             where a.estado = 'retenido' and a.resuelto_en between ${sesion.abiertaEn} and ${hasta}), 0)::text
                                                                           as "retenidosCentavos",
           coalesce(sum(a.monto_centavos) filter (where a.estado = 'vivo'), 0)::text as "vivosCentavos",
           count(*) filter (where a.estado = 'vivo')::int                  as "vivos"
      from anticipos_cita a
     where a.organizacion_id = ${organizacionId}
  `.execute(tx);
  return (
    rows[0] ?? {
      cobradosCentavos: '0',
      aplicadosCentavos: '0',
      retenidosCentavos: '0',
      vivosCentavos: '0',
      vivos: 0,
    }
  );
}

export interface ProductoDeCabina {
  readonly producto: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly costoCentavos: string;
}

/** El tinte y el producto de cabina que se fueron en servicios cerrados en el día. */
export async function productoDeCabina(
  tx: Transaccion,
  organizacionId: string,
  sesion: Ventana,
): Promise<readonly ProductoDeCabina[]> {
  const { rows } = await sql<ProductoDeCabina>`
    select i.nombre                                                             as "producto",
           rtrim(to_char(sum(-m.cantidad::numeric), 'FM999999990.###'), '.')     as "cantidad",
           max(m.unidad)                                                        as "unidad",
           round(sum(-m.cantidad::numeric * m.costo_unitario_centavos))::bigint::text as "costoCentavos"
      from movimientos_stock m
      join insumos i on i.id = m.insumo_id and i.organizacion_id = m.organizacion_id
     where m.organizacion_id = ${organizacionId}
       and m.tipo = 'consumo_servicio'
       and m.referencia_tipo = 'servicio'
       and m.created_at between ${sesion.abiertaEn} and ${hastaDe(sesion)}
     group by i.id, i.nombre
     order by sum(-m.cantidad::numeric * m.costo_unitario_centavos) desc
     limit ${TOPE_DE_FILAS}
  `.execute(tx);
  return rows;
}

/** Servicios cerrados en el día SIN fórmula capturada: la próxima vez nadie sabrá qué se usó. */
export async function serviciosSinFormula(
  tx: Transaccion,
  organizacionId: string,
  sesion: Ventana,
): Promise<number> {
  const { rows } = await sql<{ cuantos: number }>`
    select count(*)::int as "cuantos"
      from cita_servicios cs
     where cs.organizacion_id = ${organizacionId}
       and cs.estado = 'cerrado'
       and cs.cerrado_en between ${sesion.abiertaEn} and ${hastaDe(sesion)}
       and not exists (select 1 from formulas_aplicadas fa
                        where fa.organizacion_id = cs.organizacion_id
                          and fa.cita_servicio_id = cs.id)
  `.execute(tx);
  return rows[0]?.cuantos ?? 0;
}

export interface CortesiaORehecho {
  readonly folio: string;
  readonly tipo: 'cortesia' | 'rehacer';
  readonly clienta: string | null;
  readonly profesional: string | null;
  readonly motivo: string | null;
  readonly minutos: number | null;
}

/** Cortesías y servicios rehechos: tienen motivo y ocupan un hueco que no se cobró. */
export async function cortesiasYRehechos(
  tx: Transaccion,
  organizacionId: string,
  sesion: Ventana,
): Promise<readonly CortesiaORehecho[]> {
  const { rows } = await sql<CortesiaORehecho>`
    select c.folio                                                   as "folio",
           case when c.es_rehacer then 'rehacer' else 'cortesia' end as "tipo",
           cl.nombre                                                 as "clienta",
           (select string_agg(distinct pr.nombre_corto, ', ')
              from cita_servicios cs
              join profesionales pr on pr.id = cs.profesional_id
             where cs.cita_id = c.id)                                as "profesional",
           c.notas                                                   as "motivo",
           case when c.inicio_real is not null and c.fin_real is not null
                then (extract(epoch from c.fin_real - c.inicio_real) / 60)::int end as "minutos"
      from citas c
      left join clientes cl on cl.id = c.cliente_id and cl.organizacion_id = c.organizacion_id
     where c.organizacion_id = ${organizacionId}
       and (c.es_cortesia or c.es_rehacer)
       and c.agendada_para between ${sesion.abiertaEn} and ${hastaDe(sesion)}
     order by c.agendada_para
     limit ${TOPE_DE_FILAS}
  `.execute(tx);
  return rows;
}

export interface ContrapartidaDeComision {
  readonly profesional: string;
  readonly montoCentavos: string;
  readonly motivo: string | null;
}

/** El efecto en comisión de lo que se canceló o se rehizo: la contrapartida de cada una. */
export async function contrapartidasDeComision(
  tx: Transaccion,
  organizacionId: string,
  sesion: Ventana,
): Promise<readonly ContrapartidaDeComision[]> {
  const { rows } = await sql<ContrapartidaDeComision>`
    select pr.nombre_corto              as "profesional",
           c.monto_centavos::text       as "montoCentavos",
           c.motivo                     as "motivo"
      from comisiones_causadas c
      join profesionales pr on pr.id = c.profesional_id and pr.organizacion_id = c.organizacion_id
     where c.organizacion_id = ${organizacionId}
       and c.contrapartida_de_id is not null
       and c.causada_en between ${sesion.abiertaEn} and ${hastaDe(sesion)}
     order by c.causada_en
     limit ${TOPE_DE_FILAS}
  `.execute(tx);
  return rows;
}

export interface PaquetesDelDia {
  readonly vendidos: number;
  readonly vendidosCentavos: string;
  readonly sesionesConsumidas: number;
  readonly sesionesPendientes: number;
  readonly porVencer: number;
}

/** Los paquetes: vendidos hoy, sesiones consumidas hoy, lo pendiente y lo que vence pronto. */
export async function paquetesDelDia(
  tx: Transaccion,
  organizacionId: string,
  sesion: Ventana,
): Promise<PaquetesDelDia> {
  const hasta = hastaDe(sesion);
  const { rows } = await sql<PaquetesDelDia>`
    select coalesce((select count(*) from paquetes_vendidos p
                      where p.organizacion_id = ${organizacionId}
                        and p.vendido_en between ${sesion.abiertaEn} and ${hasta}), 0)::int
                                                                            as "vendidos",
           coalesce((select sum(p.precio_centavos) from paquetes_vendidos p
                      where p.organizacion_id = ${organizacionId}
                        and p.vendido_en between ${sesion.abiertaEn} and ${hasta}), 0)::text
                                                                            as "vendidosCentavos",
           coalesce((select count(*) from sesiones_paquete s
                      where s.organizacion_id = ${organizacionId}
                        and s.consumida_en between ${sesion.abiertaEn} and ${hasta}), 0)::int
                                                                            as "sesionesConsumidas",
           coalesce((select sum(p.sesiones_totales - p.sesiones_usadas) from paquetes_vendidos p
                      where p.organizacion_id = ${organizacionId}
                        and p.sesiones_usadas < p.sesiones_totales), 0)::int as "sesionesPendientes",
           coalesce((select count(*) from paquetes_vendidos p
                      where p.organizacion_id = ${organizacionId}
                        and p.sesiones_usadas < p.sesiones_totales
                        and p.vence_en is not null
                        and p.vence_en::date < (${hasta}::timestamptz + interval '30 days')::date), 0)::int
                                                                            as "porVencer"
  `.execute(tx);
  return (
    rows[0] ?? {
      vendidos: 0,
      vendidosCentavos: '0',
      sesionesConsumidas: 0,
      sesionesPendientes: 0,
      porVencer: 0,
    }
  );
}
