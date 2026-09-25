import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

/**
 * LO QUE TODO CORTE LLEVA, leído de la base en la transacción del documento (C.6 de la 2.4).
 *
 * Cada `02-DINERO-Y-CAJA.md` §9.3 pide su corte sección por sección, y las cinco comparten
 * un tronco: quién abrió y cerró, el arqueo con su fondo, de dónde salió el esperado, las
 * ventas por método con su propina, el detalle, los productos, los gastos, las
 * cancelaciones, el inventario bajo y lo que se consumió. Aquí va ese tronco; lo propio de
 * cada giro vive en `extras.ts`.
 *
 * Todas van ACOTADAS a la organización y a la sesión —o a su ventana de tiempo cuando la
 * fila no guarda la sesión—, con un tope de filas. Los importes salen como texto de
 * `bigint`: el navegador los recibe en centavos y ningún número pasa por coma flotante.
 */

/** Tope de filas de las tablas largas del documento: un día de restaurante lleno cabe. */
export const TOPE_DE_FILAS = 500;

/** La ventana de una sesión: desde que se abrió hasta que se cerró (o hasta ahora). */
export type Ventana = Pick<SesionDelCorte, 'sucursalId' | 'abiertaEn' | 'cerradaEn'>;
export const hastaDe = (sesion: Ventana): Date => sesion.cerradaEn ?? new Date();

export interface SesionDelCorte {
  readonly id: string;
  readonly sucursalId: string;
  readonly serie: string;
  readonly folio: string | null;
  readonly estado: string;
  readonly turno: string | null;
  readonly abiertaEn: Date;
  readonly cerradaEn: Date | null;
  readonly notasApertura: string | null;
  readonly notasCierre: string | null;
  readonly fondoInicialCentavos: string;
  readonly fondoEsperadoCentavos: string;
  readonly fondoMonedasCentavos: string;
  readonly fondoChicosCentavos: string;
  readonly fondoGrandesCentavos: string;
  readonly contadoCentavos: string | null;
  readonly retiradoCentavos: string | null;
  readonly esperadoCentavos: string | null;
  readonly diferenciaCentavos: string | null;
  readonly boteContadoCentavos: string | null;
  readonly saldoRecargasAperturaCentavos: string;
  readonly saldoRecargasCierreCentavos: string | null;
  readonly terminal: string | null;
  readonly sucursal: string;
  readonly sucursalDireccion: string | null;
  readonly sucursalTelefono: string | null;
  readonly abrio: string | null;
  readonly cerro: string | null;
}

export async function leerSesion(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<SesionDelCorte | null> {
  const { rows } = await sql<SesionDelCorte>`
    select s.id                                   as "id",
           s.sucursal_id                          as "sucursalId",
           s.serie                                as "serie",
           s.folio::text                          as "folio",
           s.estado                               as "estado",
           s.turno                                as "turno",
           s.abierta_en                           as "abiertaEn",
           s.cerrada_en                           as "cerradaEn",
           s.notas_apertura                       as "notasApertura",
           s.notas_cierre                         as "notasCierre",
           s.fondo_inicial_centavos::text         as "fondoInicialCentavos",
           s.fondo_esperado_centavos::text        as "fondoEsperadoCentavos",
           s.fondo_monedas_centavos::text         as "fondoMonedasCentavos",
           s.fondo_chicos_centavos::text          as "fondoChicosCentavos",
           s.fondo_grandes_centavos::text         as "fondoGrandesCentavos",
           s.efectivo_contado_centavos::text      as "contadoCentavos",
           s.efectivo_retirado_centavos::text     as "retiradoCentavos",
           s.efectivo_esperado_centavos::text     as "esperadoCentavos",
           s.diferencia_centavos::text            as "diferenciaCentavos",
           s.bote_contado_centavos::text          as "boteContadoCentavos",
           s.saldo_recargas_apertura_centavos::text as "saldoRecargasAperturaCentavos",
           s.saldo_recargas_cierre_centavos::text as "saldoRecargasCierreCentavos",
           t.nombre                               as "terminal",
           su.nombre                              as "sucursal",
           su.direccion                           as "sucursalDireccion",
           su.telefono                            as "sucursalTelefono",
           ea.nombre                              as "abrio",
           ec.nombre                              as "cerro"
      from sesiones_caja s
      join sucursales su on su.id = s.sucursal_id and su.organizacion_id = s.organizacion_id
      left join terminales t on t.id = s.terminal_id and t.organizacion_id = s.organizacion_id
      left join empleados_visibles ea on ea.id = s.empleado_abre_id
      left join empleados_visibles ec on ec.id = s.empleado_cierra_id
     where s.organizacion_id = ${organizacionId}
       and s.id = ${sesionCajaId}
  `.execute(tx);
  return rows[0] ?? null;
}

export interface NegocioCrudo {
  readonly nombre: string;
  readonly giro: string;
  readonly paquete: string;
  readonly valores: unknown;
}

export async function leerNegocio(tx: Transaccion, organizacionId: string): Promise<NegocioCrudo> {
  const { rows } = await sql<NegocioCrudo>`
    select o.nombre as "nombre", o.giro as "giro", o.paquete as "paquete", c.valores as "valores"
      from organizaciones o
      left join configuracion c on c.organizacion_id = o.id
     where o.id = ${organizacionId}
  `.execute(tx);
  const fila = rows[0];
  if (fila === undefined) throw new Error('La organización del corte no existe.');
  return fila;
}

export interface MovimientoAgrupado {
  readonly tipo: string;
  readonly montoCentavos: string;
  readonly cuantos: number;
}

/** «De dónde salió el efectivo esperado»: los movimientos del cajón, por tipo. */
export async function movimientosPorTipo(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly MovimientoAgrupado[]> {
  const { rows } = await sql<MovimientoAgrupado>`
    select m.tipo                           as "tipo",
           sum(m.monto_centavos)::text      as "montoCentavos",
           count(*)::int                    as "cuantos"
      from movimientos_caja m
     where m.organizacion_id = ${organizacionId}
       and m.sesion_caja_id = ${sesionCajaId}
     group by m.tipo
     order by min(m.created_at)
  `.execute(tx);
  return rows;
}

export interface PiezasContadas {
  readonly denominacionCentavos: string;
  readonly piezas: number;
}

export async function conteoDelCierre(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly PiezasContadas[]> {
  const { rows } = await sql<PiezasContadas>`
    select d.denominacion_centavos::text as "denominacionCentavos", d.piezas as "piezas"
      from conteos_denominacion d
     where d.organizacion_id = ${organizacionId}
       and d.sesion_caja_id = ${sesionCajaId}
       and d.momento = 'cierre'
     order by d.denominacion_centavos desc
  `.execute(tx);
  return rows;
}

export interface VentasPorMetodo {
  readonly metodo: string;
  readonly ventasCentavos: string;
  readonly propinasCentavos: string;
  readonly pagos: number;
}

/** Ventas, propina y total por método: la tabla que concilia el voucher con lo declarado. */
export async function ventasPorMetodo(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly VentasPorMetodo[]> {
  const { rows } = await sql<VentasPorMetodo>`
    select p.metodo                          as "metodo",
           sum(p.monto_centavos)::text       as "ventasCentavos",
           sum(p.propina_centavos)::text     as "propinasCentavos",
           count(*)::int                     as "pagos"
      from pagos p
     where p.organizacion_id = ${organizacionId}
       and p.sesion_caja_id = ${sesionCajaId}
       and p.estado = 'confirmado'
     group by p.metodo
     order by sum(p.monto_centavos) desc
  `.execute(tx);
  return rows;
}

export interface ResumenDeVentas {
  readonly tickets: number;
  readonly totalCentavos: string;
  readonly descuentoCentavos: string;
  readonly impuestosCentavos: string;
  readonly costoCentavos: string;
}

/** Lo COBRADO en la sesión. Una orden cancelada o dividida no es venta. */
export const ESTADOS_VENDIDOS = ['pagada', 'parcialmente_reembolsada'] as const;

export async function resumenDeVentas(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<ResumenDeVentas> {
  const { rows } = await sql<ResumenDeVentas>`
    select count(*)::int                                  as "tickets",
           coalesce(sum(o.total_centavos), 0)::text       as "totalCentavos",
           coalesce(sum(o.descuento_centavos), 0)::text   as "descuentoCentavos",
           coalesce(sum(o.impuestos_centavos), 0)::text   as "impuestosCentavos",
           coalesce(sum(o.costo_total_centavos), 0)::text as "costoCentavos"
      from ordenes o
     where o.organizacion_id = ${organizacionId}
       and o.sesion_caja_id = ${sesionCajaId}
       and o.estado in ('pagada', 'parcialmente_reembolsada')
  `.execute(tx);
  return (
    rows[0] ?? {
      tickets: 0,
      totalCentavos: '0',
      descuentoCentavos: '0',
      impuestosCentavos: '0',
      costoCentavos: '0',
    }
  );
}

export interface VentaDelDetalle {
  readonly folio: string | null;
  readonly cobradaEn: Date | null;
  readonly mesa: string | null;
  readonly nombrePedido: string | null;
  readonly cliente: string | null;
  readonly canal: string;
  readonly productos: string | null;
  readonly totalCentavos: string;
  readonly pago: string | null;
  readonly atendio: string | null;
}

/**
 * El detalle de ventas. La referencia que se RECUERDA —la mesa, el nombre del pedido, la
 * clienta— va con el folio, y los productos con su cantidad real («0.5 kg × Arrachera»).
 */
export async function detalleDeVentas(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly VentaDelDetalle[]> {
  const { rows } = await sql<VentaDelDetalle>`
    select o.serie || '-' || o.folio::text                   as "folio",
           coalesce(o.cobrada_en, o.cerrada_en, o.updated_at) as "cobradaEn",
           case when m.id is null then null
                else coalesce(m.nombre, 'Mesa ' || m.numero::text) end as "mesa",
           o.nombre_pedido                                    as "nombrePedido",
           coalesce(c.nombre, o.cliente_nombre)               as "cliente",
           o.canal                                            as "canal",
           (select string_agg(
                     rtrim(to_char(l.cantidad::numeric, 'FM999999990.###'), '.') || ' ' || l.unidad
                       || ' × ' || l.producto_nombre, ', ' order by l.orden_visual)
              from orden_lineas l
             where l.orden_id = o.id and l.organizacion_id = o.organizacion_id
               and l.anulada_en is null)                      as "productos",
           o.total_centavos::text                             as "totalCentavos",
           (select string_agg(distinct p.metodo, ' + ')
              from pagos p
             where p.orden_id = o.id and p.organizacion_id = o.organizacion_id
               and p.estado = 'confirmado')                   as "pago",
           ev.nombre                                          as "atendio"
      from ordenes o
      left join mesas m on m.id = o.mesa_id and m.organizacion_id = o.organizacion_id
      left join clientes c on c.id = o.cliente_id and c.organizacion_id = o.organizacion_id
      left join empleados_visibles ev
             on ev.id = coalesce(o.mostradorista_id, o.empleado_atiende_id, o.empleado_cobra_id)
     where o.organizacion_id = ${organizacionId}
       and o.sesion_caja_id = ${sesionCajaId}
       and o.estado in ('pagada', 'parcialmente_reembolsada')
     order by coalesce(o.cobrada_en, o.cerrada_en, o.updated_at)
     limit ${TOPE_DE_FILAS}
  `.execute(tx);
  return rows;
}

export interface ProductoVendido {
  readonly nombre: string;
  readonly categoria: string | null;
  readonly lineas: number;
  readonly cantidad: string;
  readonly unidad: string;
  readonly totalCentavos: string;
  readonly costoCentavos: string;
  /** Es un SERVICIO del salón (tiene fila en `servicios`), no producto de anaquel. */
  readonly esServicio: boolean;
  /** `bebida`, `alimento`, `grano` u `otro`: lo que la cafetería cuenta como bebidas. */
  readonly familia: string | null;
  /** La línea de la ferretería, que es como se lee su margen. */
  readonly linea: string | null;
  /** El margen objetivo de sus productos, en puntos base, promediado. */
  readonly margenObjetivoBp: number | null;
  /** Quién lo vendió: la profesional de la línea, en el salón. */
  readonly vendio: string | null;
}

/** Productos vendidos: líneas y CANTIDAD REAL son dos columnas (40 líneas ≠ 12 kg). */
export async function productosVendidos(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly ProductoVendido[]> {
  const { rows } = await sql<ProductoVendido>`
    select l.producto_nombre                                   as "nombre",
           max(cat.nombre)                                     as "categoria",
           count(*)::int                                       as "lineas",
           rtrim(to_char(sum(l.cantidad::numeric), 'FM999999990.###'), '.') as "cantidad",
           max(l.unidad)                                       as "unidad",
           sum(l.total_centavos)::text                         as "totalCentavos",
           sum(l.total_centavos - l.utilidad_centavos)::text   as "costoCentavos",
           bool_or(sv.producto_id is not null)                 as "esServicio",
           max(pr.familia)                                     as "familia",
           max(li.nombre)                                      as "linea",
           round(avg(pr.margen_bp))::int                       as "margenObjetivoBp",
           string_agg(distinct pf.nombre_corto, ', ')          as "vendio"
      from orden_lineas l
      join ordenes o on o.id = l.orden_id and o.organizacion_id = l.organizacion_id
      left join productos pr on pr.id = l.producto_id and pr.organizacion_id = l.organizacion_id
      left join servicios sv on sv.producto_id = l.producto_id and sv.organizacion_id = l.organizacion_id
      left join lineas li on li.id = pr.linea_id and li.organizacion_id = l.organizacion_id
      left join profesionales pf on pf.id = l.profesional_id and pf.organizacion_id = l.organizacion_id
      left join categorias cat on cat.id = pr.categoria_id and cat.organizacion_id = l.organizacion_id
     where l.organizacion_id = ${organizacionId}
       and o.sesion_caja_id = ${sesionCajaId}
       and o.estado in ('pagada', 'parcialmente_reembolsada')
       and l.anulada_en is null
     group by l.producto_nombre, l.producto_id
     order by sum(l.utilidad_centavos) desc, sum(l.total_centavos) desc
     limit ${TOPE_DE_FILAS}
  `.execute(tx);
  return rows;
}

export interface VentasDePersona {
  readonly nombre: string | null;
  readonly ventas: number;
  readonly importeCentavos: string;
  readonly lineas: number;
  readonly descuentoCentavos: string;
}

/** Quién vendió: mostradorista, mesero o quien cobró, en ese orden. */
export async function ventasPorPersona(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly VentasDePersona[]> {
  const { rows } = await sql<VentasDePersona>`
    select ev.nombre                                  as "nombre",
           count(*)::int                              as "ventas",
           sum(o.total_centavos)::text                as "importeCentavos",
           coalesce(sum((select count(*) from orden_lineas l
                          where l.orden_id = o.id and l.anulada_en is null)), 0)::int as "lineas",
           sum(o.descuento_centavos)::text            as "descuentoCentavos"
      from ordenes o
      left join empleados_visibles ev
             on ev.id = coalesce(o.mostradorista_id, o.empleado_atiende_id, o.empleado_cobra_id)
     where o.organizacion_id = ${organizacionId}
       and o.sesion_caja_id = ${sesionCajaId}
       and o.estado in ('pagada', 'parcialmente_reembolsada')
     group by ev.nombre
     order by sum(o.total_centavos) desc
  `.execute(tx);
  return rows;
}

export interface GastoDelCorte {
  readonly categoria: string;
  readonly descripcion: string;
  readonly metodo: string;
  readonly montoCentavos: string;
}

export async function gastosDelCorte(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly GastoDelCorte[]> {
  const { rows } = await sql<GastoDelCorte>`
    select g.categoria                 as "categoria",
           g.descripcion               as "descripcion",
           g.metodo_pago               as "metodo",
           g.monto_centavos::text      as "montoCentavos"
      from gastos g
     where g.organizacion_id = ${organizacionId}
       and g.sesion_caja_id = ${sesionCajaId}
     order by g.created_at
     limit ${TOPE_DE_FILAS}
  `.execute(tx);
  return rows;
}

export interface Cancelacion {
  readonly tipo: 'orden' | 'linea';
  readonly folio: string | null;
  readonly hora: Date | null;
  readonly usuario: string | null;
  readonly motivo: string | null;
  readonly producto: string | null;
  readonly montoCentavos: string;
}

/**
 * Las cancelaciones de la ventana de la sesión, SIEMPRE con usuario: una orden cancelada
 * entera y un platillo anulado de una cuenta viva. Una cancelada que nunca se cobró no
 * tiene sesión, así que se busca por su hora y su sucursal.
 */
export async function cancelacionesDelCorte(
  tx: Transaccion,
  organizacionId: string,
  sesion: Pick<SesionDelCorte, 'sucursalId' | 'abiertaEn' | 'cerradaEn'>,
): Promise<readonly Cancelacion[]> {
  const hasta = sesion.cerradaEn ?? new Date();
  const { rows } = await sql<Cancelacion>`
    select 'orden'                            as "tipo",
           o.serie || '-' || coalesce(o.folio::text, '—') as "folio",
           o.cancelada_en                     as "hora",
           ev.nombre                          as "usuario",
           o.motivo_cancelacion               as "motivo",
           null::text                         as "producto",
           o.total_centavos::text             as "montoCentavos"
      from ordenes o
      left join empleados_visibles ev on ev.id = o.cancelada_por
     where o.organizacion_id = ${organizacionId}
       and o.sucursal_id = ${sesion.sucursalId}
       and o.estado = 'cancelada'
       and o.cancelada_en between ${sesion.abiertaEn} and ${hasta}
    union all
    select 'linea',
           o.serie || '-' || coalesce(o.folio::text, '—'),
           l.anulada_en,
           ev.nombre,
           l.motivo_anulacion,
           l.producto_nombre,
           l.total_centavos::text
      from orden_lineas l
      join ordenes o on o.id = l.orden_id and o.organizacion_id = l.organizacion_id
      left join empleados_visibles ev on ev.id = l.empleado_anula_id
     where l.organizacion_id = ${organizacionId}
       and o.sucursal_id = ${sesion.sucursalId}
       and o.estado <> 'cancelada'
       and l.anulada_en between ${sesion.abiertaEn} and ${hasta}
     order by 3
     limit ${TOPE_DE_FILAS}
  `.execute(tx);
  return rows;
}

export interface DescuentoDeUsuario {
  readonly usuario: string | null;
  readonly ventas: number;
  readonly montoCentavos: string;
}

export async function descuentosPorUsuario(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly DescuentoDeUsuario[]> {
  const { rows } = await sql<DescuentoDeUsuario>`
    select ev.nombre                       as "usuario",
           count(*)::int                   as "ventas",
           sum(o.descuento_centavos)::text as "montoCentavos"
      from ordenes o
      left join empleados_visibles ev on ev.id = o.empleado_cobra_id
     where o.organizacion_id = ${organizacionId}
       and o.sesion_caja_id = ${sesionCajaId}
       and o.estado in ('pagada', 'parcialmente_reembolsada')
       and o.descuento_centavos > 0
     group by ev.nombre
     order by sum(o.descuento_centavos) desc
  `.execute(tx);
  return rows;
}

export interface Alerta {
  readonly nombre: string;
  readonly existencia: string;
  readonly minimo: string;
  readonly critico: string;
  readonly unidad: string;
  readonly proveedor: string | null;
  /** 1 = lunes … 7 = domingo. Vacío: el proveedor no tiene ruta, se le llama. */
  readonly diaVisita: readonly number[] | null;
  /** Lo vendido en los últimos 14 días, en unidad base. */
  readonly ventaDeCatorceDias: string;
  /** Lo vendido en 90 días: el ritmo de la ferretería, que no se mide por semana. */
  readonly ventaDeNoventaDias: string;
  /** El costo de UNA unidad base: con él se dice cuánto dinero ya duerme en el anaquel. */
  readonly costoUnitarioCentavos: string | null;
  /**
   * El consumo de UN día como hoy: el promedio de los últimos siete días de la misma semana
   * (el martes no consume como el sábado). Es lo que dice cuántos días alcanza.
   */
  readonly consumoDelMismoDia: string;
  readonly unidadCompra: string | null;
  readonly factorCompra: string | null;
}

/**
 * Lo que hay que comprar: bajo su mínimo, con el crítico al frente, y con lo que cada giro
 * necesita para decidir —el proveedor y su visita, la venta de catorce días, cuánto alcanza—.
 */
export async function alertasDeInventario(
  tx: Transaccion,
  organizacionId: string,
  ahora: Date,
): Promise<readonly Alerta[]> {
  const { rows } = await sql<Alerta>`
    with saldo as (
      select e.insumo_id, sum(e.cantidad::numeric) as cantidad
        from existencias e
       where e.organizacion_id = ${organizacionId}
       group by e.insumo_id
    ),
    venta as (
      select m.insumo_id,
             sum(abs(m.cantidad::numeric)) filter (
               where m.created_at >= ${ahora}::timestamptz - interval '14 days') as catorce,
             sum(abs(m.cantidad::numeric)) as noventa
        from movimientos_stock m
       where m.organizacion_id = ${organizacionId}
         and m.tipo = 'salida_venta'
         and m.created_at >= ${ahora}::timestamptz - interval '90 days'
       group by m.insumo_id
    ),
    mismo_dia as (
      select m.insumo_id, sum(abs(m.cantidad::numeric)) / 7.0 as diario
        from movimientos_stock m
        join organizaciones o on o.id = m.organizacion_id
       where m.organizacion_id = ${organizacionId}
         and m.tipo = 'salida_venta'
         and m.created_at >= ${ahora}::timestamptz - interval '49 days'
         and extract(isodow from m.created_at at time zone o.zona_horaria)
             = extract(isodow from ${ahora}::timestamptz at time zone o.zona_horaria)
       group by m.insumo_id
    )
    select i.nombre                                                             as "nombre",
           rtrim(to_char(coalesce(s.cantidad, 0), 'FM999999990.###'), '.')      as "existencia",
           rtrim(to_char(i.stock_minimo::numeric, 'FM999999990.###'), '.')      as "minimo",
           rtrim(to_char(i.stock_critico::numeric, 'FM999999990.###'), '.')     as "critico",
           i.unidad_base                                                        as "unidad",
           p.nombre                                                             as "proveedor",
           p.dia_visita                                                         as "diaVisita",
           rtrim(to_char(coalesce(v.catorce, 0), 'FM999999990.###'), '.')       as "ventaDeCatorceDias",
           rtrim(to_char(coalesce(v.noventa, 0), 'FM999999990.###'), '.')       as "ventaDeNoventaDias",
           i.costo_unitario_centavos::text                                      as "costoUnitarioCentavos",
           rtrim(to_char(coalesce(d.diario, 0), 'FM999999990.###'), '.')        as "consumoDelMismoDia",
           i.unidad_compra_default                                              as "unidadCompra",
           i.cantidad_por_compra_default::text                                  as "factorCompra"
      from insumos i
      left join saldo s on s.insumo_id = i.id
      left join venta v on v.insumo_id = i.id
      left join mismo_dia d on d.insumo_id = i.id
      left join proveedores p on p.id = i.proveedor_id and p.organizacion_id = i.organizacion_id
     where i.organizacion_id = ${organizacionId}
       and i.activo
       and i.stock_minimo::numeric > 0
       and coalesce(s.cantidad, 0) <= i.stock_minimo::numeric
     order by p.nombre nulls last,
              coalesce(s.cantidad, 0) / nullif(i.stock_minimo::numeric, 0),
              i.nombre
     limit 60
  `.execute(tx);
  return rows;
}

export interface InsumoConsumido {
  readonly nombre: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly costoUnitarioCentavos: string;
  readonly costoCentavos: string;
  readonly tipoInsumo: string;
}

/**
 * Lo que DEBIÓ salir del almacén por lo que se cobró: las salidas por venta de las órdenes
 * de la sesión. Contra el conteo físico, la diferencia es el robo hormiga y la porción
 * descontrolada. Es consumo teórico, y el documento lo rotula así.
 */
export async function insumosConsumidos(
  tx: Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly InsumoConsumido[]> {
  const { rows } = await sql<InsumoConsumido>`
    select i.nombre                                                             as "nombre",
           rtrim(to_char(sum(-m.cantidad::numeric), 'FM999999990.###'), '.')          as "cantidad",
           max(m.unidad)                                                        as "unidad",
           round(sum(-m.cantidad::numeric * m.costo_unitario_centavos)
                 / nullif(sum(-m.cantidad::numeric), 0))::bigint::text         as "costoUnitarioCentavos",
           round(sum(-m.cantidad::numeric * m.costo_unitario_centavos))::bigint::text as "costoCentavos",
           max(i.tipo_insumo)                                                   as "tipoInsumo"
      from movimientos_stock m
      join ordenes o on o.id = m.referencia_id and o.organizacion_id = m.organizacion_id
      join insumos i on i.id = m.insumo_id and i.organizacion_id = m.organizacion_id
     where m.organizacion_id = ${organizacionId}
       and m.tipo = 'salida_venta'
       and m.referencia_tipo = 'orden'
       and o.sesion_caja_id = ${sesionCajaId}
     group by i.id, i.nombre
     order by sum(-m.cantidad::numeric * m.costo_unitario_centavos) desc
     limit ${TOPE_DE_FILAS}
  `.execute(tx);
  return rows;
}

export interface SalidaSinVenta {
  readonly tipo: string;
  readonly motivo: string | null;
  readonly nombre: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly costoCentavos: string;
  readonly quien: string | null;
}

/** Merma y consumo de la casa en la ventana de la sesión: el dinero que salió sin venta. */
export async function salidasSinVenta(
  tx: Transaccion,
  organizacionId: string,
  sesion: Pick<SesionDelCorte, 'abiertaEn' | 'cerradaEn'>,
): Promise<readonly SalidaSinVenta[]> {
  const hasta = sesion.cerradaEn ?? new Date();
  const { rows } = await sql<SalidaSinVenta>`
    select m.tipo                                                            as "tipo",
           m.motivo                                                          as "motivo",
           i.nombre                                                          as "nombre",
           rtrim(to_char(sum(-m.cantidad::numeric), 'FM999999990.###'), '.')       as "cantidad",
           max(m.unidad)                                                     as "unidad",
           round(sum(-m.cantidad::numeric * m.costo_unitario_centavos))::bigint::text as "costoCentavos",
           max(ev.nombre)                                                    as "quien"
      from movimientos_stock m
      join insumos i on i.id = m.insumo_id and i.organizacion_id = m.organizacion_id
      left join empleados_visibles ev on ev.id = m.empleado_id
     where m.organizacion_id = ${organizacionId}
       and m.tipo in ('merma', 'salida_consumo_interno')
       and m.created_at between ${sesion.abiertaEn} and ${hasta}
     group by m.tipo, m.motivo, i.id, i.nombre
     order by m.tipo, sum(-m.cantidad::numeric * m.costo_unitario_centavos) desc
     limit ${TOPE_DE_FILAS}
  `.execute(tx);
  return rows;
}
