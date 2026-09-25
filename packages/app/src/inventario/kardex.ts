import 'server-only';

import { PAQUETES_TODOS } from '@morphiqpos/contracts';
import { ErrorDominio } from '@morphiqpos/contracts';
import { repoVentaCatalogo, type Transaccion } from '@morphiqpos/data';
import {
  resumirKardex,
  type RenglonKardex,
  type ResumenKardex,
} from '@morphiqpos/domain/inventario';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-103 · El kardex de un artículo: por qué cambió su saldo.
 *
 * ── Lo que estaba mal ──────────────────────────────────────────────────────
 * La migración 060 creaba la vista y el índice, y **no había repo, ni comando,
 * ni ruta, ni entidad de puente**. SQL escrito que nadie podía ejecutar desde
 * el producto: el kardex existía en el disco y no en el sistema.
 *
 * ── Por qué es un comando de LECTURA y no una entidad del puente ───────────
 * Porque el puente lee tablas con filtros, y esto necesita un rango de fechas,
 * un tope de renglones y un resumen calculado encima. Meterlo en el puente
 * obligaría a que la pantalla pidiera los renglones y sumara ella — que es
 * exactamente cómo dos pantallas acaban sumando distinto.
 *
 * ── El tope de renglones no es decoración ──────────────────────────────────
 * Una ferretería con dos años de movimientos tiene cientos de miles. Sin tope,
 * abrir la ficha de un tornillo baja el servidor. Con tope, el resumen dice
 * cuántos quedaron fuera y la pantalla puede ofrecer «ver más».
 */

const ROLES = ['gerente', 'administrador', 'dueno', 'almacen'] as const;

const TOPE_MAXIMO = 500;

export const entradaKardex = z.object({
  insumoId: z.uuid(),
  /**
   * Sin él, el almacén principal de la sucursal de la sesión (C.10 de la 2.4): la ficha de
   * un producto de la tienda no tiene por qué saber en qué almacén vive su anaquel.
   */
  almacenId: z.uuid().optional(),
  /** Inclusive. Sin él, el kardex arranca en el primer movimiento que exista. */
  desde: z.iso.datetime().optional(),
  /** Inclusive. */
  hasta: z.iso.datetime().optional(),
  limite: z.number().int().min(1).max(TOPE_MAXIMO).default(100),
  /**
   * Los ÚLTIMOS `limite` en vez de los primeros (C.10 de la 2.4): la ficha viene a buscar lo
   * reciente. Los renglones salen igual en orden cronológico —el saldo corrido sólo se lee
   * así— y `hayMas` dice entonces que hay historia MÁS VIEJA.
   */
  recientes: z.boolean().optional(),
});

export interface RenglonDeSalida {
  readonly movimientoId: string;
  readonly cuando: string;
  readonly tipo: string;
  readonly motivo: string | null;
  readonly cantidad: string;
  readonly saldo: string;
  readonly importeCentavos: string;
  readonly referenciaTipo: string | null;
  readonly referenciaId: string | null;
}

export interface ResultadoKardex {
  readonly renglones: readonly RenglonDeSalida[];
  readonly resumen: {
    readonly renglones: number;
    readonly entradas: string;
    readonly salidas: string;
    readonly saldoFinal: string;
    readonly valorFinalCentavos: string;
    readonly conMotivo: number;
  };
  /** `true` si se alcanzó el tope: hay más historia de la que se devolvió. */
  readonly hayMas: boolean;
}

export const kardexDeInsumo = definirComando<Transaccion, typeof entradaKardex, ResultadoKardex>({
  nombre: 'inventario.kardex',
  entidad: 'movimiento_stock',
  // Sólo lee. Sin transacción obligatoria, sin clave de idempotencia y sin
  // fila de auditoría: auditar cada consulta de una ficha llenaría la tabla de
  // auditoría de ruido y escondería lo que sí importa.
  escribe: false,
  roles: [...ROLES],
  paquetes: PAQUETES_TODOS,
  modulo: 'movimientos_inventario',
  entrada: entradaKardex,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId } = ctx.ambito;

    const almacenId =
      entrada.almacenId ??
      (sucursalId === null
        ? null
        : await ctx.paso('resolver_almacen', () =>
            repoVentaCatalogo.almacenPrincipal(ctx.tx, organizacionId, sucursalId),
          ));
    if (almacenId === null) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Esta sesión no tiene almacén: di de cuál es el kardex.',
      );
    }

    const filas = await ctx.paso('leer_kardex', () => {
      let consulta = ctx.tx
        .selectFrom('kardex')
        .select([
          'movimiento_id',
          'created_at',
          'tipo',
          'motivo',
          'cantidad',
          'saldo',
          'importe_centavos',
          'referencia_tipo',
          'referencia_id',
        ])
        .where('organizacion_id', '=', organizacionId)
        .where('insumo_id', '=', entrada.insumoId)
        .where('almacen_id', '=', almacenId);

      if (entrada.desde !== undefined) {
        consulta = consulta.where('created_at', '>=', new Date(entrada.desde));
      }
      if (entrada.hasta !== undefined) {
        consulta = consulta.where('created_at', '<=', new Date(entrada.hasta));
      }

      // Ascendente: el saldo corrido sólo significa algo en orden cronológico.
      // Se pide UNO MÁS que el límite para saber si hay más historia sin tener
      // que contar la tabla entera, que en una ferretería es media consulta.
      const sentido = entrada.recientes === true ? 'desc' : 'asc';
      return consulta
        .orderBy('created_at', sentido)
        .orderBy('movimiento_id', sentido)
        .limit(entrada.limite + 1)
        .execute();
    });

    const hayMas = filas.length > entrada.limite;
    const recortadas = hayMas ? filas.slice(0, entrada.limite) : filas;
    // Siempre cronológico hacia fuera: el resumen y el saldo corrido se leen así.
    const visibles = entrada.recientes === true ? [...recortadas].reverse() : recortadas;

    const paraDominio: RenglonKardex[] = visibles.map((f) => ({
      movimientoId: f.movimiento_id,
      tipo: f.tipo,
      motivo: f.motivo,
      cantidad: f.cantidad,
      saldo: f.saldo,
      importeCentavos: f.importe_centavos,
      cuando: f.created_at,
    }));

    const resumen: ResumenKardex = resumirKardex(paraDominio);

    return {
      renglones: visibles.map((f) => ({
        movimientoId: f.movimiento_id,
        cuando: f.created_at.toISOString(),
        tipo: f.tipo,
        motivo: f.motivo,
        cantidad: f.cantidad,
        saldo: f.saldo,
        importeCentavos: f.importe_centavos.toString(),
        referenciaTipo: f.referencia_tipo,
        referenciaId: f.referencia_id,
      })),
      resumen: {
        renglones: resumen.renglones,
        entradas: resumen.entradas,
        salidas: resumen.salidas,
        saldoFinal: resumen.saldoFinal,
        valorFinalCentavos: resumen.valorFinalCentavos.toString(),
        conMotivo: resumen.conMotivo,
      },
      hayMas,
    };
  },
});
