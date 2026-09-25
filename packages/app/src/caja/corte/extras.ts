import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

import { TOPE_DE_FILAS, hastaDe, type Ventana } from './consultas.ts';

/**
 * LO PROPIO DE CADA GIRO en su corte (C.6 de la 2.4), según su `02-DINERO-Y-CAJA.md` §9.3.
 *
 * El restaurante reparte propina por mesero; la cafetería cuenta su bote, sus canales, su
 * merma de barra y sus sellos; la tienda y la ferretería miran su cartera y lo que salió sin
 * cobrarse; la estética liquida a cada profesional y mira la agenda de mañana. Cada consulta
 * va acotada a la organización y a la sesión, o a la ventana de la sesión cuando la fila no
 * guarda la sesión.
 */

// ── Restaurante ─────────────────────────────────────────────────────────────

export interface PropinaDeMesero {
  readonly mesero: string | null;
  readonly propinaCentavos: string;
  readonly cuentas: number;
}

export async function propinasPorMesero(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly PropinaDeMesero[]> {
  const { rows } = await sql<PropinaDeMesero>`
    select ev.nombre                          as "mesero",
           sum(p.propina_centavos)::text      as "propinaCentavos",
           count(distinct o.id)::int          as "cuentas"
      from pagos p
      join ordenes o on o.id = p.orden_id and o.organizacion_id = p.organizacion_id
      left join empleados_visibles ev on ev.id = o.empleado_atiende_id
     where p.organizacion_id = ${organizacionId}
       and p.sesion_caja_id = ${sesionCajaId}
       and p.estado = 'confirmado'
       and p.propina_centavos > 0
     group by ev.nombre
     order by sum(p.propina_centavos) desc
  `.execute(tx);
  return rows;
}

// ── Cafetería ───────────────────────────────────────────────────────────────

export interface VentaPorCanal {
  readonly canal: string;
  readonly pedidos: number;
  readonly unidades: string;
  readonly importeCentavos: string;
}

export async function ventasPorCanal(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly VentaPorCanal[]> {
  const { rows } = await sql<VentaPorCanal>`
    select o.canal                                   as "canal",
           count(*)::int                             as "pedidos",
           coalesce(sum((select sum(l.cantidad::numeric) from orden_lineas l
                          where l.orden_id = o.id and l.anulada_en is null)), 0)::text as "unidades",
           sum(o.total_centavos)::text               as "importeCentavos"
      from ordenes o
     where o.organizacion_id = ${organizacionId}
       and o.sesion_caja_id = ${sesionCajaId}
       and o.estado in ('pagada', 'parcialmente_reembolsada')
     group by o.canal
     order by sum(o.total_centavos) desc
  `.execute(tx);
  return rows;
}

export interface ParteDelReparto {
  readonly persona: string | null;
  readonly minutos: number | null;
  readonly montoCentavos: string;
}

/** El reparto del bote de ESTA sesión, con los minutos presentes de cada quien. */
export async function repartoDelBote(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly ParteDelReparto[]> {
  const { rows } = await sql<ParteDelReparto>`
    select ev.nombre                               as "persona",
           (select sum(pt.minutos)::int from presencias_turno pt
             where pt.organizacion_id = lp.organizacion_id
               and pt.sesion_caja_id = lp.sesion_caja_id
               and pt.empleado_id = b.empleado_id) as "minutos",
           b.monto_centavos::text                  as "montoCentavos"
      from liquidaciones_propina lp
      join liquidacion_propina_beneficiarios b on b.liquidacion_id = lp.id
      left join empleados_visibles ev on ev.id = b.empleado_id
     where lp.organizacion_id = ${organizacionId}
       and lp.sesion_caja_id = ${sesionCajaId}
     order by b.monto_centavos desc
  `.execute(tx);
  return rows;
}

export interface MermaDeBarra {
  readonly motivo: string | null;
  readonly insumo: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly costoCentavos: string;
}

export async function mermaDeBarra(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly MermaDeBarra[]> {
  const { rows } = await sql<MermaDeBarra>`
    select coalesce(m.etiqueta, m.motivo)                                   as "motivo",
           m.insumo_nombre                                                 as "insumo",
           rtrim(to_char(m.cantidad::numeric, 'FM999999990.###'), '.')     as "cantidad",
           m.unidad                                                        as "unidad",
           m.costo_centavos::text                                          as "costoCentavos"
      from merma_barra_turno m
     where m.organizacion_id = ${organizacionId}
       and m.sesion_caja_id = ${sesionCajaId}
     order by m.costo_centavos desc
  `.execute(tx);
  return rows;
}

export interface ConsumoDeLaCasa {
  readonly tipo: string;
  readonly producto: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly costoCentavos: string;
  readonly autorizo: string | null;
  readonly motivo: string;
}

/** Consumo del personal y cortesías: tienen explicación, y por eso van aparte de la merma. */
export async function consumoDeLaCasa(
  tx: Transaccion,
  organizacionId: string,
  sesion: Ventana,
): Promise<readonly ConsumoDeLaCasa[]> {
  const { rows } = await sql<ConsumoDeLaCasa>`
    select c.tipo                                                         as "tipo",
           c.producto_nombre                                              as "producto",
           rtrim(to_char(c.cantidad::numeric, 'FM999999990.###'), '.')    as "cantidad",
           c.unidad                                                       as "unidad",
           c.costo_centavos::text                                         as "costoCentavos",
           ev.nombre                                                      as "autorizo",
           c.motivo                                                       as "motivo"
      from consumos_internos c
      left join empleados_visibles ev on ev.id = c.empleado_id
     where c.organizacion_id = ${organizacionId}
       and c.sucursal_id = ${sesion.sucursalId}
       and c.created_at between ${sesion.abiertaEn} and ${hastaDe(sesion)}
     order by c.created_at
     limit ${TOPE_DE_FILAS}
  `.execute(tx);
  return rows;
}

export interface SellosDelTurno {
  readonly otorgados: number;
  readonly canjes: number;
  readonly costoCanjesCentavos: string;
  readonly sellosVivos: string;
  readonly clientesConSaldo: number;
  readonly costoPremioCentavos: string;
}

export async function sellosDelTurno(
  tx: Transaccion,
  organizacionId: string,
  sesion: Ventana,
): Promise<SellosDelTurno> {
  const { rows } = await sql<SellosDelTurno>`
    select coalesce((select sum(m.sellos) from lealtad_movimientos m
                      where m.organizacion_id = ${organizacionId}
                        and m.tipo = 'otorga'
                        and m.created_at between ${sesion.abiertaEn} and ${hastaDe(sesion)}), 0)::int
                                                                     as "otorgados",
           coalesce((select count(*) from lealtad_movimientos m
                      where m.organizacion_id = ${organizacionId}
                        and m.tipo = 'canje'
                        and m.created_at between ${sesion.abiertaEn} and ${hastaDe(sesion)}), 0)::int
                                                                     as "canjes",
           coalesce((select sum(m.costo_centavos) from lealtad_movimientos m
                      where m.organizacion_id = ${organizacionId}
                        and m.tipo = 'canje'
                        and m.created_at between ${sesion.abiertaEn} and ${hastaDe(sesion)}), 0)::text
                                                                     as "costoCanjesCentavos",
           coalesce(lp.sellos_vivos, 0)::text                        as "sellosVivos",
           coalesce(lp.clientes_con_saldo, 0)::int                   as "clientesConSaldo",
           coalesce(lp.costo_premio_centavos, 0)::text               as "costoPremioCentavos"
      from (select 1) uno
      left join lealtad_pasivo lp on lp.organizacion_id = ${organizacionId}
  `.execute(tx);
  return (
    rows[0] ?? {
      otorgados: 0,
      canjes: 0,
      costoCanjesCentavos: '0',
      sellosVivos: '0',
      clientesConSaldo: 0,
      costoPremioCentavos: '0',
    }
  );
}

export interface NoRecogido {
  readonly nombre: string;
  readonly horaPrometida: Date;
  readonly totalCentavos: string;
  /** El insumo que se perdió: lo que le pone precio a tres llamados sin respuesta. */
  readonly costoCentavos: string;
}

export async function noRecogidos(
  tx: Transaccion,
  organizacionId: string,
  sesion: Ventana,
): Promise<readonly NoRecogido[]> {
  const { rows } = await sql<NoRecogido>`
    select pa.nombre                     as "nombre",
           pa.hora_prometida             as "horaPrometida",
           o.total_centavos::text        as "totalCentavos",
           o.costo_total_centavos::text  as "costoCentavos"
      from pedidos_anticipados pa
      join ordenes o on o.id = pa.orden_id and o.organizacion_id = pa.organizacion_id
     where pa.organizacion_id = ${organizacionId}
       and pa.sucursal_id = ${sesion.sucursalId}
       and pa.estado = 'no_recogido'
       and pa.hora_prometida between ${sesion.abiertaEn} and ${hastaDe(sesion)}
     order by pa.hora_prometida
  `.execute(tx);
  return rows;
}

export interface ModificadorUsado {
  readonly producto: string;
  readonly opcion: string;
  readonly veces: number;
}

/**
 * Los modificadores de lo vendido: «Latte · 84, de ellos 31 con leche de avena» dice cuánta
 * avena pedir y por qué subió el costo de esa línea.
 */
export async function modificadoresUsados(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly ModificadorUsado[]> {
  const { rows } = await sql<ModificadorUsado>`
    select l.producto_nombre      as "producto",
           m.opcion_nombre        as "opcion",
           count(*)::int          as "veces"
      from orden_linea_modificadores m
      join orden_lineas l on l.id = m.orden_linea_id
      join ordenes o on o.id = l.orden_id and o.organizacion_id = l.organizacion_id
     where l.organizacion_id = ${organizacionId}
       and o.sesion_caja_id = ${sesionCajaId}
       and o.estado in ('pagada', 'parcialmente_reembolsada')
       and l.anulada_en is null
     group by l.producto_nombre, m.opcion_nombre
     order by count(*) desc
     limit ${TOPE_DE_FILAS}
  `.execute(tx);
  return rows;
}

export interface ConsumoDelCanal {
  readonly canal: string;
  readonly insumo: string;
  readonly cantidad: string;
  readonly unidad: string;
}

/** Lo consumido por canal: de aquí sale el empaque de «para llevar» y de la plataforma. */
export async function consumoPorCanal(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly ConsumoDelCanal[]> {
  const { rows } = await sql<ConsumoDelCanal>`
    select o.canal                                                          as "canal",
           i.nombre                                                         as "insumo",
           rtrim(to_char(sum(-m.cantidad::numeric), 'FM999999990.###'), '.') as "cantidad",
           max(m.unidad)                                                    as "unidad"
      from movimientos_stock m
      join ordenes o on o.id = m.referencia_id and o.organizacion_id = m.organizacion_id
      join insumos i on i.id = m.insumo_id and i.organizacion_id = m.organizacion_id
     where m.organizacion_id = ${organizacionId}
       and m.tipo = 'salida_venta'
       and m.referencia_tipo = 'orden'
       and o.sesion_caja_id = ${sesionCajaId}
     group by o.canal, i.id, i.nombre
     limit ${TOPE_DE_FILAS}
  `.execute(tx);
  return rows;
}
