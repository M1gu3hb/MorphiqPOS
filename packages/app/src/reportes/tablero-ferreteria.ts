import 'server-only';

import { PAQUETES_DEL_TABLERO } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { diaDelNegocio, type LimitesDelDia } from './dia.ts';
import {
  centavosDe,
  leerMargen,
  leerPorPedir,
  leerVentaDelDia,
  puntosBase,
  type PorPedirDeProveedor,
  type VentaDelDia,
} from './piezas.ts';

/**
 * EL TABLERO DE LA FERRETERÍA (F-056 · `ferreteria/04-INTERFAZ.md` §4.4).
 *
 * ── Por qué éste es distinto del de la tiendita ───────────────────────────
 * Porque se diseña primero para PC —Beto lo mira en la máquina del mostrador, no en
 * el teléfono— y porque su orden es otro: **lo primero es la cartera**, no la venta.
 * La carpeta lo dice sin rodeos: «es la pérdida que no admite vuelta atrás». Una
 * tiendita fía cien pesos al vecino; una ferretería fía ciento veinte mil a una obra
 * que puede no volver.
 *
 * Los ocho, en su orden:
 *
 * 1 · Lo que me deben · total, vencido y los tres más viejos CON SU OBRA.
 * 2 · Dinero dormido · pesos a costo, % del inventario y las tres líneas peores.
 * 3 · Salió hoy y no se cobró · importe, % de la venta y las remisiones SIN FIRMA.
 * 4 · Venta y margen de hoy, contra el mismo día de la semana pasada.
 * 5 · Qué pedir · sólo las claves que se mueven, agrupadas por proveedor.
 * 6 · Mostrador · venta, ticket y LÍNEAS POR VENTA de cada persona.
 * 7 · Lo que debo esta semana · lo que vence, con su día.
 * 8 · Pendientes que se enfrían · garantías, rentas, rollos y cotizaciones.
 *
 * ── El que está prohibido en `abarrotes` y es obligatorio aquí ────────────
 * El sexto. En una tiendita, medir por cajero empuja a vender caro a quien no debe;
 * en una ferretería, **líneas por venta** es lo que mide la asesoría: quien despacha
 * lo que le piden hace una línea, y quien resuelve el problema hace cuatro.
 */

const DIRECCION = ['dueno', 'administrador', 'gerente'] as const;

export const entradaTableroDeFerreteria = z.object({});

export interface DeudorDeObra {
  readonly cliente: string;
  readonly obra: string | null;
  readonly saldoCentavos: string;
  readonly dias: number;
}

export interface LineaDormida {
  readonly linea: string;
  readonly dineroCentavos: string;
  readonly claves: number;
}

export interface PersonaDelMostrador {
  readonly persona: string;
  readonly ventaCentavos: string;
  readonly tickets: number;
  /** Con dos decimales en puntos base: 3.40 líneas por venta llega como 340. */
  readonly lineasPorVentaBp: number;
}

export interface PorPagar {
  readonly proveedor: string;
  readonly dia: string;
  readonly saldoCentavos: string;
}

export interface TableroDeFerreteria {
  readonly fecha: string;
  /** 1 · La cartera, que es lo primero de este giro. */
  readonly cartera: {
    readonly totalCentavos: string;
    readonly vencidoCentavos: string;
    readonly masViejos: readonly DeudorDeObra[];
  };
  /** 2 · El dinero dormido, a costo, con las líneas peores. */
  readonly dormido: {
    readonly dineroCentavos: string;
    readonly delInventarioBp: number;
    readonly peores: readonly LineaDormida[];
  };
  /** 3 · Lo que salió hoy y todavía no es dinero. */
  readonly aCredito: {
    readonly importeCentavos: string;
    readonly sobreVentaBp: number;
    readonly remisionesSinFirma: number;
  };
  /** 4 · La venta y el margen de hoy. */
  readonly venta: VentaDelDia;
  readonly margen: { readonly hoyCentavos: string; readonly hoyBp: number };
  /** 5 · Qué pedir, sólo lo que se mueve. */
  readonly porPedir: readonly PorPedirDeProveedor[];
  /** 6 · El mostrador, por persona. */
  readonly mostrador: readonly PersonaDelMostrador[];
  /** 7 · Lo que debo esta semana. */
  readonly porPagar: {
    readonly totalCentavos: string;
    readonly documentos: readonly PorPagar[];
  };
  /** 8 · El cajón de lo que se enfría. */
  readonly pendientes: {
    readonly garantias: number;
    readonly rentasVencidas: number;
    readonly rollosViejos: number;
    readonly cotizacionesPorVencer: number;
  };
}

export const tableroDeFerreteria = definirComando<
  Transaccion,
  typeof entradaTableroDeFerreteria,
  TableroDeFerreteria
>({
  nombre: 'reportes.tablero_ferreteria',
  entidad: 'organizacion',
  escribe: false,
  roles: [...DIRECCION],
  paquetes: PAQUETES_DEL_TABLERO.ferreteria,
  entrada: entradaTableroDeFerreteria,
  async ejecutar(ctx) {
    const { organizacionId } = ctx.ambito;
    const dia = await ctx.paso('dia_del_negocio', () =>
      diaDelNegocio(ctx.tx, organizacionId, ctx.ahora),
    );

    const [
      cartera,
      dormido,
      aCredito,
      venta,
      margenHoy,
      porPedir,
      mostrador,
      porPagar,
      pendientes,
    ] = await Promise.all([
      leerCartera(ctx.tx, organizacionId, dia),
      leerDormido(ctx.tx, organizacionId),
      leerACredito(ctx.tx, organizacionId, dia),
      leerVentaDelDia(ctx.tx, organizacionId, dia),
      leerMargen(ctx.tx, organizacionId, dia.desde, dia.hasta),
      leerPorPedir(ctx.tx, organizacionId, dia.diaDeLaSemanaDeManana, { soloConRotacion: true }),
      leerMostrador(ctx.tx, organizacionId, dia),
      leerPorPagar(ctx.tx, organizacionId, dia),
      leerPendientes(ctx.tx, organizacionId, dia),
    ]);

    return {
      fecha: dia.fecha,
      cartera,
      dormido,
      aCredito: {
        ...aCredito,
        sobreVentaBp: puntosBase(BigInt(aCredito.importeCentavos), BigInt(venta.hoyCentavos)),
      },
      venta,
      margen: {
        hoyCentavos: margenHoy.margen.toString(),
        hoyBp: puntosBase(margenHoy.margen, margenHoy.venta),
      },
      porPedir,
      mostrador,
      porPagar,
      pendientes,
    };
  },
});

/**
 * La cartera, de la vista que ya la calcula (`cartera_por_obra`, migración 175).
 *
 * Por OBRA y no por cliente: el contratista tiene tres obras y paga una, y el
 * desglose es lo que hace posible la llamada —«de Las Torres me debes $12,100»—.
 */
async function leerCartera(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<TableroDeFerreteria['cartera']> {
  const totales = await sql<{ total: string; vencido: string }>`
    select coalesce(sum(d.saldo_centavos), 0)                                          as total,
           coalesce(sum(case when d.vence_en < ${dia.hasta} then d.saldo_centavos end), 0) as vencido
      from documentos_credito d
     where d.organizacion_id = ${organizacionId}
       and d.saldo_centavos > 0
  `.execute(tx);

  const viejos = await sql<{
    cliente: string | null;
    obra: string | null;
    saldo: string;
    dias: string;
  }>`
    select c.cliente_nombre as cliente,
           c.obra_nombre    as obra,
           c.saldo_centavos as saldo,
           c.dias_mas_viejo as dias
      from cartera_por_obra c
     where c.organizacion_id = ${organizacionId}
       and c.saldo_centavos > 0
     order by c.dias_mas_viejo desc nulls last
     limit 3
  `.execute(tx);

  const fila = totales.rows[0];
  return {
    totalCentavos: centavosDe(fila?.total).toString(),
    vencidoCentavos: centavosDe(fila?.vencido).toString(),
    masViejos: viejos.rows.map((v) => ({
      cliente: v.cliente ?? 'sin nombre',
      obra: v.obra,
      saldoCentavos: centavosDe(v.saldo).toString(),
      dias: Number(v.dias),
    })),
  };
}

/**
 * EL DINERO DORMIDO, de `existencias_de_material` (migración 175).
 *
 * En pesos a costo y no en número de claves: «1,840 claves no significa nada y
 * $214,800 sí». Dormido es lo que NO se ha vendido en noventa días —`dias_inventario`
 * nulo es justo eso: nunca se vendió—, y las peores se agrupan por LÍNEA, que es
 * como se decide qué se deja de comprar.
 */
async function leerDormido(
  tx: Transaccion,
  organizacionId: string,
): Promise<TableroDeFerreteria['dormido']> {
  const filas = await sql<{ dormido: string; total: string }>`
    select coalesce(sum(case when e.vendido90 = 0 then e.dinero_parado_centavos end), 0) as dormido,
           coalesce(sum(e.dinero_parado_centavos), 0)                                    as total
      from existencias_de_material e
     where e.organizacion_id = ${organizacionId}
  `.execute(tx);

  const peores = await sql<{ linea: string; dinero: string; claves: string }>`
    select e.linea                                            as linea,
           coalesce(sum(e.dinero_parado_centavos), 0)         as dinero,
           count(*)                                           as claves
      from existencias_de_material e
     where e.organizacion_id = ${organizacionId}
       and e.vendido90 = 0
       and e.dinero_parado_centavos > 0
     group by e.linea
     order by dinero desc
     limit 3
  `.execute(tx);

  const fila = filas.rows[0];
  return {
    dineroCentavos: centavosDe(fila?.dormido).toString(),
    delInventarioBp: puntosBase(centavosDe(fila?.dormido), centavosDe(fila?.total)),
    peores: peores.rows.map((p) => ({
      linea: p.linea,
      dineroCentavos: centavosDe(p.dinero).toString(),
      claves: Number(p.claves),
    })),
  };
}

/**
 * Lo que salió hoy y no se cobró, con las remisiones SIN FIRMA capturada.
 *
 * El contador de firmas es lo único de este tablero que exige hacer algo en las
 * próximas horas: una remisión sin firma es material entregado que el cliente puede
 * negar, y capturarla después de que se fue el chofer ya no se puede.
 */
async function leerACredito(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<{ readonly importeCentavos: string; readonly remisionesSinFirma: number }> {
  const filas = await sql<{ importe: string; sin_firma: string }>`
    select coalesce(sum(r.importe_centavos), 0)                                      as importe,
           count(case when r.firma_url is null then 1 end)                           as sin_firma
      from remisiones r
     where r.organizacion_id = ${organizacionId}
       and r.entregada_en >= ${dia.desde}
       and r.entregada_en < ${dia.hasta}
  `.execute(tx);
  const fila = filas.rows[0];
  return {
    importeCentavos: centavosDe(fila?.importe).toString(),
    remisionesSinFirma: Number(fila?.sin_firma ?? 0),
  };
}

/**
 * EL MOSTRADOR, por persona: venta, tickets y LÍNEAS POR VENTA.
 *
 * El tercero es el que mide la asesoría y es el que este giro exige: quien despacha
 * lo que le piden hace una línea por venta; quien resuelve el problema del cliente
 * —el tornillo, la broca y el taquete— hace cuatro. Es también el que dice si las
 * listas de trabajo y las equivalencias están sirviendo para algo.
 */
async function leerMostrador(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<readonly PersonaDelMostrador[]> {
  const filas = await sql<{
    persona: string | null;
    venta: string;
    tickets: string;
    lineas: string;
  }>`
    select coalesce(e.nombre, 'sin firma')                     as persona,
           coalesce(sum(o.total_centavos), 0)                  as venta,
           count(distinct o.id)                                as tickets,
           coalesce(sum((select count(*) from orden_lineas l where l.orden_id = o.id)), 0) as lineas
      from ordenes o
      left join empleados_visibles e on e.id = o.empleado_atiende_id
     where o.organizacion_id = ${organizacionId}
       and o.estado = 'pagada'
       and o.created_at >= ${dia.desde}
       and o.created_at < ${dia.hasta}
     group by e.nombre
     order by venta desc
     limit 5
  `.execute(tx);

  return filas.rows.map((fila) => {
    const tickets = Number(fila.tickets);
    const lineas = Number(fila.lineas);
    return {
      persona: fila.persona ?? 'sin firma',
      ventaCentavos: centavosDe(fila.venta).toString(),
      tickets,
      lineasPorVentaBp: tickets === 0 ? 0 : Math.round((lineas / tickets) * 100),
    };
  });
}

/** Lo que vence esta semana, con el día en que toca. */
async function leerPorPagar(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<TableroDeFerreteria['porPagar']> {
  const filas = await sql<{ proveedor: string | null; dia: string; saldo: string }>`
    select p.nombre                                            as proveedor,
           to_char(d.vence_en, 'YYYY-MM-DD')                   as dia,
           d.saldo_centavos                                    as saldo
      from documentos_por_pagar d
      left join proveedores p on p.id = d.proveedor_id
     where d.organizacion_id = ${organizacionId}
       and d.saldo_centavos > 0
       and d.vence_en < ${dia.hasta}::timestamptz + interval '7 days'
     order by d.vence_en asc
     limit 6
  `.execute(tx);

  const documentos = filas.rows.map((fila) => ({
    proveedor: fila.proveedor ?? 'sin proveedor',
    dia: fila.dia,
    saldoCentavos: centavosDe(fila.saldo).toString(),
  }));

  return {
    totalCentavos: documentos.reduce((suma, d) => suma + BigInt(d.saldoCentavos), 0n).toString(),
    documentos,
  };
}

/**
 * EL CAJÓN DE LO QUE SE ENFRÍA, y está declarado como cajón a propósito.
 *
 * Cuatro cosas chicas que individualmente no merecen tarjeta y que juntas son dinero
 * detenido: la garantía que el proveedor no ha contestado, la herramienta que no
 * volvió, el rollo abierto que lleva meses en el rack y la cotización que caduca sin
 * que nadie haya llamado.
 */
async function leerPendientes(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<TableroDeFerreteria['pendientes']> {
  const filas = await sql<{
    garantias: string;
    rentas: string;
    rollos: string;
    cotizaciones: string;
  }>`
    select (select count(*) from garantias_proveedor g
             where g.organizacion_id = ${organizacionId}
               and g.estado in ('recibida', 'enviada'))                       as garantias,
           (select count(*) from rentas_herramienta r
             where r.organizacion_id = ${organizacionId}
               and r.estado = 'fuera'
               and r.compromiso_retorno < ${dia.hasta})                       as rentas,
           (select count(*) from piezas_abiertas pz
             where pz.organizacion_id = ${organizacionId}
               and pz.estado = 'abierta'
               and pz.abierta_en < ${dia.hasta}::timestamptz - interval '60 days') as rollos,
           (select count(*) from cotizaciones c
             where c.organizacion_id = ${organizacionId}
               and c.vigente
               and c.estado not in ('aceptada', 'rechazada', 'vencida')
               and c.vence_el <= (${dia.hasta}::timestamptz + interval '3 days')::date) as cotizaciones
  `.execute(tx);

  const fila = filas.rows[0];
  return {
    garantias: Number(fila?.garantias ?? 0),
    rentasVencidas: Number(fila?.rentas ?? 0),
    rollosViejos: Number(fila?.rollos ?? 0),
    cotizacionesPorVencer: Number(fila?.cotizaciones ?? 0),
  };
}
