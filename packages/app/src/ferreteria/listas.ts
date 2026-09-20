import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { repoFolios } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-153 · La lista de trabajo: el papel del albañil.
 *
 * ── Qué es, y por qué no es una cotización ───────────────────────────────
 * Llega con un papel —«para la losa del 3er piso»— y veintitrés renglones
 * escritos a mano, la mitad sin medida. No quiere un precio: quiere que se lo
 * surtan. La cotización lleva vigencia, se manda y se aprueba; confundirlas
 * obliga a cotizar para poder surtir, y entonces nadie usa ninguna de las dos.
 *
 * ── Se guarda lo que PIDIERON, no sólo lo que se dio ─────────────────────
 * La mitad de los renglones son «cemento del gris» y «medio bulto de cal». La
 * traducción a claves la hace el mostradorista, y si el sistema guardara sólo
 * el resultado se perdería lo único que resuelve la discusión de la tarde: «yo
 * pedí varilla del 3, no del 4».
 *
 * ── Surtir a medias es el caso NORMAL ────────────────────────────────────
 * Siempre falta algo. Por eso hay un estado `parcial`: una lista que sólo
 * pudiera estar abierta o cerrada obliga a cerrarla con renglones sin surtir
 * —y entonces nadie sabe qué se quedó a deber— o a dejarla abierta para
 * siempre, que es lo mismo con más ruido.
 *
 * ── Cerrar SIEMPRE lleva fecha ───────────────────────────────────────────
 * La base lo exige (`lista_cerrada_con_fecha`) y la razón es la de siempre: una
 * lista cerrada sin fecha no se puede sacar de la bandeja del día, así que
 * vuelve a aparecer cada mañana hasta que alguien deja de mirar la bandeja.
 */

const MOSTRADOR = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
const CANTIDAD = /^\d{1,10}(\.\d{1,4})?$/;

export const entradaCapturarLista = z.object({
  titulo: z.string().trim().min(3).max(120),
  clienteId: z.uuid().nullable().default(null),
  obraId: z.uuid().nullable().default(null),
  nombreLibre: z.string().trim().max(120).nullable().default(null),
  telefonoLibre: z.string().trim().max(30).nullable().default(null),
  renglones: z
    .array(
      z.object({
        /** Lo que dijo, tal cual. Es lo único obligatorio de un renglón. */
        textoPedido: z.string().trim().min(1).max(200),
        productoId: z.uuid().nullable().default(null),
        cantidad: z
          .string()
          .regex(CANTIDAD, 'Cantidad con cuatro decimales.')
          .nullable()
          .default(null),
        unidad: z.string().trim().max(20).nullable().default(null),
      }),
    )
    .min(1)
    .max(200),
});

export const entradaCerrarLista = z.object({
  listaId: z.uuid(),
  /** `surtida` cuando se entregó todo; `cancelada` cuando el cliente no volvió. */
  resultado: z.enum(['surtida', 'cancelada']),
  motivo: z.string().trim().max(200).optional(),
});

export interface ResultadoLista {
  readonly listaId: string;
  /** El que el servidor le puso: es lo que el cliente dice al recogerla. */
  readonly folio: string;
  readonly renglones: number;
}

export interface ResultadoCierreLista {
  readonly listaId: string;
  readonly estado: string;
}

/** O ficha, o nombre a mano. La base lo exige y aquí se dice por qué. */
function exigirAlguien(clienteId: string | null, nombreLibre: string | null): void {
  if (clienteId === null && (nombreLibre === null || nombreLibre.length === 0)) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'La lista necesita un cliente o un nombre: sin ninguno no se le puede devolver a nadie.',
    );
  }
}

export const capturarListaTrabajo = definirComando<
  Transaccion,
  typeof entradaCapturarLista,
  ResultadoLista
>({
  nombre: 'lista_trabajo.capturar',
  entidad: 'lista_trabajo',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaCapturarLista,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;
    exigirAlguien(entrada.clienteId, entrada.nombreLibre);

    /**
     * EL FOLIO LO PONE EL SERVIDOR, en su propia serie.
     *
     * La entrada lo PEDÍA —`folio: z.string().min(1)`— y ninguna pantalla lo podía
     * dar: el mostrador no tiene un consecutivo que ofrecer, y uno inventado en el
     * navegador choca contra `unique (organizacion_id, folio)` en cuanto dos
     * personas capturan a la vez. El resultado era que capturar una lista desde
     * `trabajos-de-mostrador` contestaba 400 SIEMPRE, con el formulario entero
     * escrito. Es el mismo criterio que la nota de mostrador y el crédito: el
     * consecutivo se toma DENTRO de la transacción, sin huecos y sin colisiones.
     *
     * Serie propia `LT`: compartir la de las ventas hace que el 480 sea a veces un
     * ticket y a veces una lista, y entonces nadie puede citarlo por teléfono.
     */
    if (sucursalId === null) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Captura la lista desde una sucursal: su folio es consecutivo por sucursal.',
      );
    }
    const tomado = await ctx.paso('tomar_folio', () =>
      repoFolios.tomarFolio(ctx.tx, organizacionId, sucursalId, 'LT'),
    );
    const folio = `${tomado.serie}-${tomado.folio.toString()}`;

    const lista = await ctx.paso('crear_lista', () =>
      ctx.tx
        .insertInto('listas_trabajo')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          folio,
          titulo: entrada.titulo,
          cliente_id: entrada.clienteId,
          obra_id: entrada.obraId,
          nombre_libre: entrada.nombreLibre,
          telefono_libre: entrada.telefonoLibre,
          estado: 'abierta',
          capturada_en: ctx.ahora,
          capturada_por: empleoId,
          created_at: ctx.ahora,
          updated_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    await ctx.paso('crear_renglones', () =>
      ctx.tx
        .insertInto('lineas_lista_trabajo')
        .values(
          entrada.renglones.map((r, indice) => ({
            organizacion_id: organizacionId,
            lista_id: lista.id,
            orden_visual: indice,
            texto_pedido: r.textoPedido,
            // La traducción va o completa o vacía: una cantidad sin producto es
            // un número sin unidad de medida, y la base lo rechaza.
            producto_id: r.productoId,
            cantidad: r.productoId === null ? null : r.cantidad,
            unidad: r.productoId === null ? null : r.unidad,
            created_at: ctx.ahora,
          })),
        )
        .execute(),
    );

    ctx.auditar({
      entidadId: lista.id,
      payload: { folio, renglones: entrada.renglones.length },
    });
    return { listaId: lista.id, folio, renglones: entrada.renglones.length };
  },
});

async function exigirListaViva(ctx: ContextoComando<Transaccion>, listaId: string): Promise<void> {
  const fila = await ctx.paso('leer_lista', () =>
    ctx.tx
      .selectFrom('listas_trabajo')
      .select(['id'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', '=', listaId)
      .executeTakeFirst(),
  );
  if (fila === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa lista no existe en este negocio.');
  }
}

export const cerrarListaTrabajo = definirComando<
  Transaccion,
  typeof entradaCerrarLista,
  ResultadoCierreLista
>({
  nombre: 'lista_trabajo.cerrar',
  entidad: 'lista_trabajo',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaCerrarLista,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    await exigirListaViva(ctx, entrada.listaId);

    // Cancelar sin motivo deja una lista muerta que nadie puede explicar tres
    // semanas después, cuando el albañil vuelve preguntando por su material.
    if (entrada.resultado === 'cancelada' && (entrada.motivo ?? '').length === 0) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Cancelar una lista lleva motivo: sin él, nadie puede explicarla después.',
      );
    }

    // Estado y fecha en la MISMA escritura: la migración 119 lo exige con
    // `lista_cerrada_con_fecha`. Una lista cerrada sin fecha no sale de la
    // bandeja del día, y vuelve a aparecer cada mañana.
    //
    // Las dos ramas están escritas con el estado LITERAL y no con
    // `estado: entrada.resultado`, que sería una línea menos. La razón es que
    // `estados-con-columna.contrato.test.ts` sólo puede leer objetos literales:
    // con la versión corta, el contrato no vería esta escritura y afirmaría en
    // su nombre que nadie cierra listas — que es justo la clase de mentira que
    // ese contrato existe para evitar.
    const cerrar = ctx.tx
      .updateTable('listas_trabajo')
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', entrada.listaId)
      .where('estado', 'in', ['abierta', 'parcial']);

    const tocadas = await ctx.paso('cerrar', () =>
      entrada.resultado === 'surtida'
        ? cerrar
            .set({
              estado: 'surtida',
              cerrada_en: ctx.ahora,
              nota: entrada.motivo ?? null,
              updated_at: ctx.ahora,
            })
            .executeTakeFirst()
        : cerrar
            .set({
              estado: 'cancelada',
              cerrada_en: ctx.ahora,
              nota: entrada.motivo ?? null,
              updated_at: ctx.ahora,
            })
            .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      throw new ErrorDominio('CONFIGURACION_CONFLICTO', 'Esa lista ya estaba cerrada o cancelada.');
    }

    ctx.auditar({ entidadId: entrada.listaId, payload: { resultado: entrada.resultado } });
    return { listaId: entrada.listaId, estado: entrada.resultado };
  },
});
