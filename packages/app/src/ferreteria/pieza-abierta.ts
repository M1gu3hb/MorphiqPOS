import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { repoVentaCatalogo } from '@morphiqpos/data';

import { definirComando } from '../definicion.ts';

/**
 * F-145 · El rollo abierto: declararlo, listarlo y rematarlo.
 *
 * ── Lo que esto NO es ────────────────────────────────────────────────────
 * No es el inventario. El inventario sigue siendo `movimientos_stock` en unidad
 * base, sin excepción. La pieza abierta es una DESCOMPOSICIÓN informativa: dice
 * cómo está repartido lo que ya está contado. Por eso la suma de restantes es
 * menor o igual a la existencia y no está obligada a ser igual —los rollos
 * cerrados son el resto—, y por eso abrir una pieza no mueve stock.
 *
 * ── Y por qué no se obliga a cuadrar ─────────────────────────────────────
 * Por la misma razón por la que las caducidades de abarrotes tampoco cuadran:
 * obligarlo convertiría cada venta en una asignación de pieza, y eso es
 * trazabilidad completa. Lo que sí es un error real es que lo abierto SUPERE la
 * existencia, y eso se señala.
 *
 * ── El folio es corto y legible porque se escribe a mano ─────────────────
 * `R-114` va rotulado en la cinta con un plumón. Nadie copia un uuid a un rollo
 * de cable, y un identificador que no se puede escribir en el material físico
 * es un identificador que no se usa.
 *
 * ── El retazo es un estado, no un precio ─────────────────────────────────
 * Cuando lo que queda ya no sirve para el uso normal, se remata. El precio de
 * remate vive en la pieza y no en el producto: ponerlo en el catálogo haría que
 * el rollo entero se vendiera barato.
 */

const MOSTRADOR = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaAbrirPieza = z.object({
  productoId: z.uuid(),
  /**
   * EL ALMACÉN, OPCIONAL: lo resuelve la sesión del servidor (R16).
   *
   * Era obligatorio, y la pantalla de material NO lo manda —con razón: «el almacén
   * sale de la sesión», lo dice su propio comentario—. Resultado: **abrir una pieza
   * contestaba 400 siempre**, y con ella la pantalla del material continuo entero.
   * Es el mismo arreglo que ya llevaba `entradaAbrirProducto` del salón, y por la
   * misma razón: una pantalla que no puede saber un id no debe tener que mandarlo.
   */
  almacenId: z.uuid().optional(),
  /** Lo que trae la pieza, en unidad base. Micrómetros o miligramos, enteros. */
  medidaBase: z.string().regex(/^\d{1,18}$/, 'La medida va en unidad base, entera.'),
  folio: z.string().trim().min(1).max(20),
  ubicacionId: z.uuid().nullable().default(null),
});

export const entradaPiezasDeProducto = z.object({
  productoId: z.uuid(),
  /** Cuánto hace falta. Devuelve LA MÁS CHICA QUE ALCANCE, no la primera. */
  necesitaBase: z
    .string()
    .regex(/^\d{1,18}$/)
    .nullable()
    .default(null),
});

export const entradaMarcarRetazo = z.object({
  piezaId: z.uuid(),
  precioRemateCentavos: z.number().int().min(0).max(100_000_000),
});

export interface ResultadoPieza {
  readonly piezaId: string;
  readonly folio: string;
  readonly medidaRestanteBase: string;
  readonly estado: string;
}

export interface PiezaViva {
  readonly piezaId: string;
  readonly folio: string;
  readonly medidaRestanteBase: string;
  readonly estado: string;
  readonly precioRemateCentavos: string | null;
  readonly diasAbierta: number;
  /** `true` cuando esta pieza sola alcanza para lo que se pidió. */
  readonly alcanza: boolean;
}

export interface ResultadoPiezas {
  readonly piezas: readonly PiezaViva[];
  /** La que hay que cortar: la más chica que alcanza. `null` si ninguna. */
  readonly recomendada: string | null;
  readonly totalAbiertoBase: string;
}

const MS_POR_DIA = 86_400_000;

export const abrirPieza = definirComando<Transaccion, typeof entradaAbrirPieza, ResultadoPieza>({
  nombre: 'inventario.abrir_pieza',
  entidad: 'pieza_abierta',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAbrirPieza,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const producto = await ctx.paso('leer_producto', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre', 'es_continuo'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .executeTakeFirst(),
    );
    if (producto === undefined) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto no existe en este negocio.');
    }
    if (!producto.es_continuo) {
      // Abrir una pieza de algo que se vende entero es una fila que nadie va a
      // volver a mirar, y que ensucia la consulta de «qué hay abierto».
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        `«${producto.nombre}» no se vende por medida: no hay pieza que abrir.`,
      );
    }

    const medida = BigInt(entrada.medidaBase);
    if (medida <= 0n) {
      // Una pieza sin material no está abierta: está cerrada, y ése es otro
      // estado. La base también lo impide, pero un 23514 no dice cuál es.
      throw new ErrorDominio(
        'CANTIDAD_INVALIDA',
        'Una pieza sin material no está abierta: está cerrada.',
      );
    }

    /**
     * EL ALMACÉN sale de la sesión cuando la pantalla no lo dice (R16).
     *
     * Es el principal de la sucursal de quien abre la pieza. Sin sucursal no hay
     * almacén que elegir, y eso sí es un error con nombre.
     */
    const almacenId =
      entrada.almacenId ??
      (await ctx.paso('almacen_de_la_sesion', async () => {
        if (ctx.ambito.sucursalId === null) return null;
        return repoVentaCatalogo.almacenPrincipal(
          ctx.tx,
          ctx.ambito.organizacionId,
          ctx.ambito.sucursalId,
        );
      }));
    if (almacenId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Una pieza abierta vive en un almacén: hace falta saber en cuál.',
      );
    }

    const repetido = await ctx.paso('buscar_folio', () =>
      ctx.tx
        .selectFrom('piezas_abiertas')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('folio', '=', entrada.folio)
        .executeTakeFirst(),
    );
    if (repetido !== undefined) {
      // Dos rollos con el mismo rótulo es el corte que se descuenta del rollo
      // equivocado, y nadie lo nota hasta que uno de los dos se acaba antes.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        `Ya hay una pieza rotulada «${entrada.folio}».`,
      );
    }

    const pieza = await ctx.paso('abrir', () =>
      ctx.tx
        .insertInto('piezas_abiertas')
        .values({
          organizacion_id: organizacionId,
          producto_id: entrada.productoId,
          almacen_id: almacenId,
          folio: entrada.folio,
          medida_restante_base: medida,
          estado: 'abierta',
          ubicacion_id: entrada.ubicacionId,
          abierta_en: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    // NO se mueve stock. El rollo ya estaba contado: abrirlo sólo dice cómo
    // está repartido. Un movimiento aquí lo descontaría dos veces, una al
    // abrirlo y otra al cortarlo.
    ctx.auditar({
      entidadId: pieza.id,
      payload: { folio: entrada.folio, medidaBase: entrada.medidaBase },
    });
    return {
      piezaId: pieza.id,
      folio: entrada.folio,
      medidaRestanteBase: medida.toString(),
      estado: 'abierta',
    };
  },
});

export const piezasDeProducto = definirComando<
  Transaccion,
  typeof entradaPiezasDeProducto,
  ResultadoPiezas
>({
  nombre: 'inventario.piezas_abiertas',
  entidad: 'pieza_abierta',
  escribe: false,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaPiezasDeProducto,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const filas = await ctx.paso('leer_piezas', () =>
      ctx.tx
        .selectFrom('piezas_abiertas')
        .select([
          'id',
          'folio',
          'medida_restante_base',
          'estado',
          'precio_remate_centavos',
          'abierta_en',
        ])
        .where('organizacion_id', '=', organizacionId)
        .where('producto_id', '=', entrada.productoId)
        .where('estado', '!=', 'cerrada')
        .orderBy('medida_restante_base', 'asc')
        .execute(),
    );

    const necesita = entrada.necesitaBase === null ? null : BigInt(entrada.necesitaBase);
    let total = 0n;
    const piezas = filas.map((f) => {
      total += f.medida_restante_base;
      return {
        piezaId: f.id,
        folio: f.folio,
        medidaRestanteBase: f.medida_restante_base.toString(),
        estado: f.estado,
        precioRemateCentavos: f.precio_remate_centavos?.toString() ?? null,
        diasAbierta: Math.floor((ctx.ahora.getTime() - f.abierta_en.getTime()) / MS_POR_DIA),
        alcanza: necesita === null ? true : f.medida_restante_base >= necesita,
      };
    });

    // La MÁS CHICA que alcanza, y por eso la consulta va ordenada ascendente.
    // Cortar del rollo grande deja tres retazos del mismo cable: el trabajo de
    // una ferretería es acabarse los abiertos, no abrir otro.
    const recomendada = piezas.find((p) => p.alcanza)?.piezaId ?? null;

    return { piezas, recomendada, totalAbiertoBase: total.toString() };
  },
});

export const marcarRetazo = definirComando<Transaccion, typeof entradaMarcarRetazo, ResultadoPieza>(
  {
    nombre: 'inventario.marcar_retazo',
    entidad: 'pieza_abierta',
    escribe: true,
    roles: [...MOSTRADOR],
    paquetes: PAQUETES_TODOS,
    entrada: entradaMarcarRetazo,
    async ejecutar(ctx, entrada) {
      const { organizacionId } = ctx.ambito;

      const pieza = await ctx.paso('leer_pieza', () =>
        ctx.tx
          .selectFrom('piezas_abiertas')
          .select(['id', 'folio', 'estado', 'medida_restante_base'])
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', entrada.piezaId)
          .executeTakeFirst(),
      );
      if (pieza === undefined) {
        throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa pieza no existe en este negocio.');
      }
      if (pieza.estado !== 'abierta') {
        throw new ErrorDominio('CONFIGURACION_CONFLICTO', `Esa pieza ya está «${pieza.estado}».`);
      }

      // El estado se escribe LITERAL. El contrato de «estado ⇒ columna» necesita
      // ver el valor en el objeto para saber que existe código que lo produce, y
      // `precio_remate_centavos` sólo es válido con `estado = 'retazo'`.
      await ctx.paso('marcar', () =>
        ctx.tx
          .updateTable('piezas_abiertas')
          .set({ estado: 'retazo', precio_remate_centavos: BigInt(entrada.precioRemateCentavos) })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', entrada.piezaId)
          .execute(),
      );

      ctx.auditar({
        entidadId: entrada.piezaId,
        payload: { folio: pieza.folio, precioRemateCentavos: entrada.precioRemateCentavos },
      });
      return {
        piezaId: entrada.piezaId,
        folio: pieza.folio,
        medidaRestanteBase: pieza.medida_restante_base.toString(),
        estado: 'retazo',
      };
    },
  },
);
