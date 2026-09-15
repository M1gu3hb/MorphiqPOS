import { PAQUETES_OPERATIVOS, ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { cantidad, cantidadATexto } from '@morphiqpos/domain/catalogo';
import { desdeTexto } from '@morphiqpos/domain/dinero';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando } from '../comando.ts';

const ROLES = ['dueno', 'administrador', 'gerente', 'almacen'] as const;
const id = z.uuid();
const unidad = z.enum(['pieza', 'kg', 'g', 'l', 'ml', 'm']);
const cantidadPositiva = z
  .string()
  .regex(/^\d{1,10}(?:\.\d{1,4})?$/)
  .refine(noEsCero);
const cantidadConSigno = z
  .string()
  .regex(/^-?\d{1,10}(?:\.\d{1,4})?$/)
  .refine(noEsCero);
const importe = z.string().regex(/^\d+(?:\.\d{1,2})?$/);

export const entradaCrearAlmacen = z.object({ nombre: z.string().trim().min(2).max(120) });
export const entradaCrearInsumo = z.object({
  nombre: z.string().trim().min(2).max(160),
  unidad,
  costoUnitario: importe,
  stockMinimo: z.string().regex(/^\d{1,10}(?:\.\d{1,4})?$/),
});
export const entradaInventarioInicial = z.object({
  almacenId: id,
  insumoId: id,
  cantidad: cantidadPositiva,
});
export const entradaAjustarStock = z.object({
  almacenId: id,
  insumoId: id,
  cantidad: cantidadConSigno,
  motivo: z.string().trim().min(4).max(300),
});

export const crearAlmacen = definirComando<
  Transaccion,
  typeof entradaCrearAlmacen,
  { readonly id: string }
>({
  nombre: 'inventario.crear_almacen',
  entidad: 'almacen',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaCrearAlmacen,
  async ejecutar(ctx, entrada) {
    const sucursalId = ctx.ambito.sucursalId;
    if (sucursalId === null)
      throw new ErrorDominio(
        'INVENTARIO_INVALIDO',
        'Selecciona una sucursal para crear el almacén.',
      );
    const principal = await ctx.tx
      .selectFrom('almacenes')
      .select('id')
      .where('sucursal_id', '=', sucursalId)
      .where('principal', '=', true)
      .executeTakeFirst();
    const fila = await ctx.paso('crear_almacen', () =>
      ctx.tx
        .insertInto('almacenes')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          sucursal_id: sucursalId,
          nombre: entrada.nombre,
          principal: principal === undefined,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );
    ctx.auditar({ entidadId: fila.id, payload: { nombre: entrada.nombre } });
    return { id: fila.id };
  },
});

export const crearInsumo = definirComando<
  Transaccion,
  typeof entradaCrearInsumo,
  { readonly id: string }
>({
  nombre: 'inventario.crear_insumo',
  entidad: 'insumo',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaCrearInsumo,
  async ejecutar(ctx, entrada) {
    const fila = await ctx.paso('crear_insumo', () =>
      ctx.tx
        .insertInto('insumos')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          nombre: entrada.nombre,
          unidad_base: entrada.unidad,
          costo_unitario_centavos: desdeTexto(entrada.costoUnitario),
          stock_minimo: cantidadATexto(cantidad(entrada.stockMinimo)),
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );
    ctx.auditar({
      entidadId: fila.id,
      payload: { nombre: entrada.nombre, unidad: entrada.unidad },
    });
    return { id: fila.id };
  },
});

export const inventarioInicial = definirComando<
  Transaccion,
  typeof entradaInventarioInicial,
  { readonly cantidad: string }
>({
  nombre: 'inventario.inicial',
  entidad: 'existencia',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaInventarioInicial,
  async ejecutar(ctx, entrada) {
    const normalizada = cantidadATexto(cantidad(entrada.cantidad));
    const referencias = await verificarReferencias(
      ctx.tx,
      ctx.ambito.organizacionId,
      entrada.almacenId,
      entrada.insumoId,
    );
    const saldo = await ctx.paso('incrementar_existencia', () =>
      sql<{ cantidad: string }>`
      insert into existencias (organizacion_id, almacen_id, insumo_id, cantidad)
      values (${ctx.ambito.organizacionId}, ${entrada.almacenId}, ${entrada.insumoId}, ${normalizada})
      on conflict (almacen_id, insumo_id) do update
      set cantidad = existencias.cantidad + excluded.cantidad, actualizado_en = now()
      returning cantidad
    `.execute(ctx.tx),
    );
    await ctx.paso('registrar_movimiento', () =>
      ctx.tx
        .insertInto('movimientos_stock')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          almacen_id: entrada.almacenId,
          insumo_id: entrada.insumoId,
          tipo: 'inventario_inicial',
          cantidad: normalizada,
          unidad: referencias.unidad_base,
          costo_unitario_centavos: referencias.costo_unitario_centavos,
          referencia_tipo: 'manual',
          empleado_id: ctx.ambito.empleoId,
        })
        .execute(),
    );
    ctx.auditar({
      entidadId: entrada.insumoId,
      payload: { almacenId: entrada.almacenId, cantidad: normalizada },
    });
    return { cantidad: saldo.rows[0]?.cantidad ?? normalizada };
  },
});

export const ajustarStock = definirComando<
  Transaccion,
  typeof entradaAjustarStock,
  { readonly cantidad: string }
>({
  nombre: 'inventario.ajustar',
  entidad: 'existencia',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaAjustarStock,
  async ejecutar(ctx, entrada) {
    const referencias = await verificarReferencias(
      ctx.tx,
      ctx.ambito.organizacionId,
      entrada.almacenId,
      entrada.insumoId,
    );
    const delta = normalizarSigno(entrada.cantidad);
    await sql`insert into existencias (organizacion_id, almacen_id, insumo_id, cantidad) values (${ctx.ambito.organizacionId}, ${entrada.almacenId}, ${entrada.insumoId}, 0) on conflict (almacen_id, insumo_id) do nothing`.execute(
      ctx.tx,
    );
    const saldo = await ctx.paso('ajustar_existencia', () =>
      sql<{ cantidad: string }>`
      update existencias set cantidad = cantidad + ${delta}, actualizado_en = now()
      where organizacion_id = ${ctx.ambito.organizacionId} and almacen_id = ${entrada.almacenId}
        and insumo_id = ${entrada.insumoId} and cantidad + ${delta} >= 0 returning cantidad
    `.execute(ctx.tx),
    );
    const cantidadFinal = saldo.rows[0]?.cantidad;
    if (cantidadFinal === undefined)
      throw new ErrorDominio('STOCK_INSUFICIENTE', 'El ajuste dejaría una existencia negativa.');
    await ctx.paso('registrar_movimiento', () =>
      ctx.tx
        .insertInto('movimientos_stock')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          almacen_id: entrada.almacenId,
          insumo_id: entrada.insumoId,
          tipo: 'ajuste',
          cantidad: delta,
          unidad: referencias.unidad_base,
          costo_unitario_centavos: referencias.costo_unitario_centavos,
          referencia_tipo: 'manual',
          empleado_id: ctx.ambito.empleoId,
          motivo: entrada.motivo,
        })
        .execute(),
    );
    ctx.auditar({
      entidadId: entrada.insumoId,
      payload: { almacenId: entrada.almacenId, delta, motivo: entrada.motivo },
    });
    return { cantidad: cantidadFinal };
  },
});

async function verificarReferencias(
  tx: Transaccion,
  organizacionId: string,
  almacenId: string,
  insumoId: string,
) {
  const fila = await tx
    .selectFrom('insumos as i')
    .innerJoin('almacenes as a', 'a.organizacion_id', 'i.organizacion_id')
    .select(['i.unidad_base', 'i.costo_unitario_centavos'])
    .where('i.id', '=', insumoId)
    .where('a.id', '=', almacenId)
    .where('i.organizacion_id', '=', organizacionId)
    .where('i.activo', '=', true)
    .where('a.activo', '=', true)
    .executeTakeFirst();
  if (fila === undefined)
    throw new ErrorDominio('INVENTARIO_INVALIDO', 'El insumo o almacén no existe.');
  return fila;
}

function noEsCero(valor: string): boolean {
  return BigInt(valor.replace('.', '').replace('-', '')) !== 0n;
}
function normalizarSigno(valor: string): string {
  const negativo = valor.startsWith('-');
  const magnitud = cantidadATexto(cantidad(negativo ? valor.slice(1) : valor));
  return negativo ? `-${magnitud}` : magnitud;
}
