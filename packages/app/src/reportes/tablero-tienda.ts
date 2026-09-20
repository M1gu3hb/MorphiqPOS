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
} from './piezas.ts';

/**
 * EL TABLERO DE LA TIENDITA (F-056 · `abarrotes/04-INTERFAZ.md` §4.4).
 *
 * ── Por qué existe, y por qué no valía el que ya había ─────────────────────
 * El tablero que servía `/` es el del RESTAURANTE: se construyó para Restaurante MH
 * y sus nueve indicadores son los de una cena —ventas, costo, utilidad, ticket
 * promedio, métodos de pago, propinas—. Una tiendita mira otra cosa a otras horas, y
 * su carpeta lo dice con nombres y apellidos: **siete indicadores**, cada uno con la
 * decisión que dispara, y una lista explícita de lo que NO va aunque exista el dato.
 *
 * Dos de esas exclusiones son tarjetas que el tablero del restaurante SÍ enseña:
 *
 *   · **Ticket promedio**: «en un giro donde el ticket va de $20 a $80 por la
 *     naturaleza del surtido, el promedio se mueve por azar y no dispara nada».
 *   · **La dona de métodos de pago**: «densidad alta, decisión rápida, pantalla de
 *     390 px. Una lista ordenada contesta mejor y ocupa menos».
 *
 * Así que no es un tablero con dos tarjetas más: es OTRO tablero.
 *
 * ── Por qué un comando de lectura y no siete entidades del puente ──────────
 * Porque los siete son AGREGADOS —la venta del día contra la del mismo día de la
 * semana pasada, el margen del mes, la diferencia de conteo— y el puente expone
 * filas con columnas. Siete entidades nuevas serían siete vistas para una sola
 * pantalla, cada una con su ámbito y su recorte de campos que mantener. Un comando
 * de lectura tiene el ámbito del que ya pasó por `comando()` y una sola puerta.
 *
 * ── Y por qué se calcula en el DÍA DEL NEGOCIO ─────────────────────────────
 * Porque la tienda abre a las 7 y cierra a las 22:30: «aquí se calcula sobre el día
 * natural, porque el día es el día» —y no sobre la caja abierta, como el
 * restaurante, cuya cena del viernes termina a la 1:20 del sábado—. La zona la pone
 * el negocio y la convierte Postgres. Ver `dia.ts`.
 */

const DIRECCION = ['dueno', 'administrador', 'gerente'] as const;

export const entradaTableroDeTienda = z.object({});

/** Un cliente al que se le fía, de los más viejos. */
export interface DeudorViejo {
  readonly cliente: string;
  readonly saldoCentavos: string;
  readonly dias: number;
}

/** Lo que se vence esta semana, con su valor a costo. */
export interface PorVencer {
  readonly producto: string;
  readonly dias: number;
  readonly valorCentavos: string;
}

export interface TableroDeTienda {
  /** La fecha del negocio con la que se calculó todo, `YYYY-MM-DD`. */
  readonly fecha: string;
  /** 1 · La venta de hoy, con la del MISMO DÍA de la semana pasada. */
  readonly venta: {
    readonly hoyCentavos: string;
    readonly referenciaCentavos: string;
    readonly tickets: number;
  };
  /** 2 · El margen de hoy y el del mes, en pesos y en puntos base. */
  readonly margen: {
    readonly hoyCentavos: string;
    readonly hoyBp: number;
    readonly mesCentavos: string;
    readonly mesBp: number;
  };
  /** 3 · Qué pedir, por proveedor, con el de mañana primero. */
  readonly porPedir: readonly PorPedirDeProveedor[];
  /**
   * 4 · La diferencia de conteo del mes.
   *
   * `hayConteos` en `false` es el dato: «si el conteo cíclico no se está haciendo,
   * este indicador dice eso en vez de mentir con un cero».
   */
  readonly conteo: {
    readonly hayConteos: boolean;
    readonly tomas: number;
    readonly diferenciaCentavos: string;
    readonly sobreVentaBp: number;
  };
  /** 5 · El fiado: total, vencido, otorgado hoy y los tres más viejos. */
  readonly fiado: {
    readonly totalCentavos: string;
    readonly vencidoCentavos: string;
    readonly otorgadoHoyCentavos: string;
    readonly masViejos: readonly DeudorViejo[];
  };
  /** 6 · Lo que se vence esta semana, a costo. */
  readonly porVencer: readonly PorVencer[];
  /** 7 · La caja: si está abierta, quién y cuánto lleva; y el último cierre. */
  readonly caja: {
    readonly abierta: boolean;
    readonly quien: string | null;
    readonly efectivoEsperadoCentavos: string;
    readonly diferenciaUltimoCierreCentavos: string | null;
  };
}

export const tableroDeTienda = definirComando<
  Transaccion,
  typeof entradaTableroDeTienda,
  TableroDeTienda
>({
  nombre: 'reportes.tablero_tienda',
  entidad: 'organizacion',
  escribe: false,
  roles: [...DIRECCION],
  paquetes: PAQUETES_DEL_TABLERO.tienda,
  entrada: entradaTableroDeTienda,
  async ejecutar(ctx) {
    const { organizacionId } = ctx.ambito;
    const dia = await ctx.paso('dia_del_negocio', () =>
      diaDelNegocio(ctx.tx, organizacionId, ctx.ahora),
    );

    const [venta, margenHoy, margenMes, porPedir, conteo, fiado, porVencer, caja] =
      await Promise.all([
        leerVentaDelDia(ctx.tx, organizacionId, dia),
        leerMargen(ctx.tx, organizacionId, dia.desde, dia.hasta),
        leerMargen(ctx.tx, organizacionId, dia.inicioDelMes, dia.hasta),
        leerPorPedir(ctx.tx, organizacionId, dia.diaDeLaSemanaDeManana),
        leerConteo(ctx.tx, organizacionId, dia),
        leerFiado(ctx.tx, organizacionId, dia),
        leerPorVencer(ctx.tx, organizacionId),
        leerCaja(ctx.tx, organizacionId),
      ]);

    return {
      fecha: dia.fecha,
      venta,
      margen: {
        hoyCentavos: margenHoy.margen.toString(),
        hoyBp: puntosBase(margenHoy.margen, margenHoy.venta),
        mesCentavos: margenMes.margen.toString(),
        mesBp: puntosBase(margenMes.margen, margenMes.venta),
      },
      porPedir,
      conteo: {
        ...conteo,
        // Sobre la venta del MES, que es el periodo del conteo: la referencia del
        // giro —1.5 a 2.5 %— está dicha sobre la venta, no sobre el inventario.
        sobreVentaBp: puntosBase(
          conteo.diferenciaCentavos.startsWith('-')
            ? -BigInt(conteo.diferenciaCentavos)
            : BigInt(conteo.diferenciaCentavos),
          margenMes.venta,
        ),
      },
      fiado,
      porVencer,
      caja,
    };
  },
});

async function leerConteo(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<{
  readonly hayConteos: boolean;
  readonly tomas: number;
  readonly diferenciaCentavos: string;
}> {
  const filas = await sql<{ tomas: string; diferencia: string }>`
    select count(distinct t.id)                                                     as tomas,
           coalesce(sum(round(
             (c.contado::numeric - c.esperado::numeric) * i.costo_unitario_centavos
           )), 0)                                                                   as diferencia
      from tomas_inventario t
      join toma_conteos c on c.toma_id = t.id
      join insumos i on i.id = c.insumo_id
     where t.organizacion_id = ${organizacionId}
       and t.cerrada_en is not null
       and t.cerrada_en >= ${dia.inicioDelMes}
       and t.cerrada_en < ${dia.hasta}
  `.execute(tx);
  const fila = filas.rows[0];
  const tomas = Number(fila?.tomas ?? 0);
  return {
    hayConteos: tomas > 0,
    tomas,
    diferenciaCentavos: centavosDe(fila?.diferencia).toString(),
  };
}

async function leerFiado(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<TableroDeTienda['fiado']> {
  const totales = await sql<{ total: string; vencido: string; otorgado: string }>`
    select coalesce(sum(d.saldo_centavos), 0)                                      as total,
           coalesce(sum(case when d.vence_en < ${dia.hasta} then d.saldo_centavos end), 0) as vencido,
           coalesce(sum(case when d.emitido_en >= ${dia.desde} and d.emitido_en < ${dia.hasta}
                             then d.importe_centavos end), 0)                     as otorgado
      from documentos_credito d
     where d.organizacion_id = ${organizacionId}
       and (d.saldo_centavos > 0
            or (d.emitido_en >= ${dia.desde} and d.emitido_en < ${dia.hasta}))
  `.execute(tx);

  const viejos = await sql<{ cliente: string | null; saldo: string; dias: string }>`
    select c.nombre                                                as cliente,
           d.saldo_centavos                                        as saldo,
           greatest(0, (${dia.hasta}::timestamptz::date - d.emitido_en::date)) as dias
      from documentos_credito d
      left join clientes c on c.id = d.cliente_id
     where d.organizacion_id = ${organizacionId}
       and d.saldo_centavos > 0
     order by d.emitido_en asc
     limit 3
  `.execute(tx);

  const fila = totales.rows[0];
  return {
    totalCentavos: centavosDe(fila?.total).toString(),
    vencidoCentavos: centavosDe(fila?.vencido).toString(),
    otorgadoHoyCentavos: centavosDe(fila?.otorgado).toString(),
    masViejos: viejos.rows.map((v) => ({
      cliente: v.cliente ?? 'sin nombre',
      saldoCentavos: centavosDe(v.saldo).toString(),
      dias: Number(v.dias),
    })),
  };
}

/**
 * Lo que se vence esta semana, a COSTO.
 *
 * `cantidad - consumida` es lo que queda de esa entrada: la tabla no resta, porque
 * la diferencia entre las dos ES la merma de ese anaquel (F-106).
 */
async function leerPorVencer(
  tx: Transaccion,
  organizacionId: string,
): Promise<readonly PorVencer[]> {
  const filas = await sql<{ producto: string | null; dias: string; valor: string }>`
    with z as (
      select (now() at time zone o.zona_horaria)::date as hoy
        from organizaciones o
       where o.id = ${organizacionId}
    )
    select p.nombre                                                          as producto,
           (cd.caduca_el - z.hoy)                                            as dias,
           coalesce(round(
             (cd.cantidad::numeric - cd.consumida::numeric) * i.costo_unitario_centavos
           ), 0)                                                             as valor
      from caducidades cd
      cross join z
      join productos p on p.id = cd.producto_id
      left join insumos i
             on i.producto_id = cd.producto_id
            and i.organizacion_id = cd.organizacion_id
     where cd.organizacion_id = ${organizacionId}
       and cd.cantidad::numeric > cd.consumida::numeric
       and cd.caduca_el <= z.hoy + 7
     order by cd.caduca_el asc
     limit 6
  `.execute(tx);

  return filas.rows.map((fila) => ({
    producto: fila.producto ?? 'sin nombre',
    dias: Number(fila.dias),
    valorCentavos: centavosDe(fila.valor).toString(),
  }));
}

async function leerCaja(tx: Transaccion, organizacionId: string): Promise<TableroDeTienda['caja']> {
  const abierta = await sql<{ quien: string | null; esperado: string }>`
    select e.nombre                                                          as quien,
           coalesce((select sum(m.monto_centavos)
                       from movimientos_caja m
                      where m.sesion_caja_id = s.id), 0)                     as esperado
      from sesiones_caja s
      left join empleados_visibles e on e.id = s.empleado_abre_id
     where s.organizacion_id = ${organizacionId}
       and s.estado = 'abierta'
     order by s.abierta_en desc
     limit 1
  `.execute(tx);

  const ultimo = await sql<{ diferencia: string | null }>`
    select (s.efectivo_contado_centavos
            - coalesce((select sum(m.monto_centavos)
                          from movimientos_caja m
                         where m.sesion_caja_id = s.id), 0))                 as diferencia
      from sesiones_caja s
     where s.organizacion_id = ${organizacionId}
       and s.estado <> 'abierta'
       and s.efectivo_contado_centavos is not null
     order by s.cerrada_en desc nulls last
     limit 1
  `.execute(tx);

  const fila = abierta.rows[0];
  const cierre = ultimo.rows[0]?.diferencia;
  return {
    abierta: fila !== undefined,
    quien: fila?.quien ?? null,
    efectivoEsperadoCentavos: centavosDe(fila?.esperado).toString(),
    diferenciaUltimoCierreCentavos:
      cierre === null || cierre === undefined ? null : centavosDe(cierre).toString(),
  };
}
