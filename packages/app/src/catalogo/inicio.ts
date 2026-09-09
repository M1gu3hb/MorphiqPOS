import 'server-only';

import { obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';

export interface AmbitoInicio {
  readonly organizacionId: string;
  readonly sucursalId: string | null;
  readonly terminalId: string | null;
}

export async function consultarInicioProduccion(ambito: AmbitoInicio) {
  const db = obtenerDb();
  const consultaVentaDia = db
    .selectFrom('ordenes as v')
    .innerJoin('organizaciones as o', 'o.id', 'v.organizacion_id')
    .select([
      sql<bigint>`coalesce(sum(v.total_centavos), 0)`.as('total'),
      sql<bigint>`count(*)`.as('operaciones'),
    ])
    .where('v.organizacion_id', '=', ambito.organizacionId)
    .where('v.estado', '=', 'pagada')
    .where(
      sql<boolean>`(v.created_at at time zone o.zona_horaria)::date = (now() at time zone o.zona_horaria)::date`,
    )
    .executeTakeFirstOrThrow();

  let consultaCaja = db
    .selectFrom('sesiones_caja')
    .select(['id', 'abierta_en', 'fondo_inicial_centavos'])
    .where('organizacion_id', '=', ambito.organizacionId)
    .where('estado', '=', 'abierta');
  if (ambito.terminalId !== null)
    consultaCaja = consultaCaja.where('terminal_id', '=', ambito.terminalId);
  else if (ambito.sucursalId !== null)
    consultaCaja = consultaCaja.where('sucursal_id', '=', ambito.sucursalId);

  const [ventaDia, caja, recientes, bajos] = await Promise.all([
    consultaVentaDia,
    consultaCaja.orderBy('abierta_en', 'desc').executeTakeFirst(),
    db
      .selectFrom('ordenes')
      .select(['id', 'folio', 'total_centavos', 'created_at'])
      .where('organizacion_id', '=', ambito.organizacionId)
      .where('estado', '=', 'pagada')
      .orderBy('created_at', 'desc')
      .limit(5)
      .execute(),
    db
      .selectFrom('existencias as e')
      .innerJoin('insumos as i', (union) =>
        union
          .onRef('i.id', '=', 'e.insumo_id')
          .onRef('i.organizacion_id', '=', 'e.organizacion_id'),
      )
      .innerJoin('almacenes as a', 'a.id', 'e.almacen_id')
      .select(['i.id', 'i.nombre', 'i.stock_minimo', 'e.cantidad', 'a.nombre as almacen'])
      .where('e.organizacion_id', '=', ambito.organizacionId)
      .whereRef('e.cantidad', '<=', 'i.stock_minimo')
      .orderBy('e.cantidad')
      .limit(8)
      .execute(),
  ]);

  return {
    ventaDiaCentavos: ventaDia.total.toString(),
    operacionesDia: Number(ventaDia.operaciones),
    caja:
      caja === undefined
        ? null
        : {
            id: caja.id,
            abiertaEn: caja.abierta_en.toISOString(),
            fondoInicialCentavos: caja.fondo_inicial_centavos.toString(),
          },
    ventasRecientes: recientes.map((venta) => ({
      id: venta.id,
      folio: venta.folio?.toString() ?? 'Pendiente',
      totalCentavos: venta.total_centavos.toString(),
      creadaEn: venta.created_at.toISOString(),
    })),
    productosBajoMinimo: bajos.map((item) => ({
      id: item.id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      minimo: item.stock_minimo,
      almacen: item.almacen,
    })),
  };
}
