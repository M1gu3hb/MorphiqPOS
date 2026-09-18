import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { piezaParaElCorte, planearCorte, type PiezaAbierta } from '@morphiqpos/domain/inventario';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * `inventario.cortar_material` — F-145 y F-150.
 *
 * ── Los dos movimientos, en la misma transacción ─────────────────────────
 * La venta de 60 m y la merma de 40 cm se escriben JUNTAS o no se escriben. Si
 * la merma se pudiera registrar por separado, no se registraría nunca: son 40
 * cm y hay fila. Es lo mismo que hace `abarrotes` metiendo el canje de Bimbo en
 * la nota de compra: *lo que se captura aparte, no se captura*.
 *
 * ── Lo que este comando NO hace ──────────────────────────────────────────
 * No cobra. El precio de la partida lo pone `venta.cobrar` con el precio por
 * metro del catálogo; aquí sólo se decide qué sale del almacén. Meter el
 * importe aquí sería el segundo sitio donde se calcula un precio.
 *
 * ── Por qué la merma viene de la entrada y no del catálogo ───────────────
 * El catálogo propone —`merma_corte_default_base`— y la pantalla lo pinta, pero
 * quien corta sabe si esta vez se fue más. Fijarla desde el servidor haría que
 * la cifra fuera siempre la misma y dejaría de significar nada; en el corte
 * diario, lo que importa es justamente que se DESVÍE del patrón.
 */

const ROLES = ['cajero', 'almacen', 'gerente', 'administrador', 'dueno'] as const;

export const entradaCortarMaterial = z.object({
  ordenLineaId: z.uuid(),
  productoId: z.uuid(),
  almacenId: z.uuid(),
  /** Lo que se lleva el cliente, en unidad base (milímetros). */
  medidaSolicitadaBase: z.number().int().min(1).max(1_000_000_000),
  /** Lo que destruye el corte. Cero es legítimo: hay material que no se pierde. */
  mermaBase: z.number().int().min(0).max(10_000_000),
  /** Con valor, se corta de esa pieza; sin él, el servidor elige. */
  piezaAbiertaId: z.uuid().optional(),
  /**
   * Cuánto trae el rollo CERRADO que se va a abrir, cuando ninguna pieza
   * abierta alcanza.
   *
   * Lo declara quien corta porque el sistema no lo sabe: un rollo de cable
   * viene de 100 m y uno de manguera de 50, y el mismo producto puede llegar en
   * presentaciones distintas según el proveedor. Suponer una longitud fija haría
   * que la pieza que queda mintiera desde el primer corte.
   */
  medidaPiezaNuevaBase: z.number().int().min(1).max(1_000_000_000).optional(),
  /** Folio de la pieza que queda, si el corte abre una. `R-114`. */
  folioResultante: z.string().trim().min(1).max(20).optional(),
});

export interface ResultadoCorte {
  readonly corteId: string;
  readonly piezaOrigenId: string | null;
  readonly entregadoBase: string;
  readonly mermaBase: string;
  readonly consumidoBase: string;
  /**
   * Lo que de verdad se le pidió al almacén.
   *
   * Sale del mismo sitio que la resta y no del plan, a propósito: es lo único
   * que ata el número calculado con el número descontado. Sin él, cambiar
   * `consumido` por `entregado` en la llamada dejaría la merma dentro del
   * inventario sin que ninguna prueba lo viera, porque la resta se hace con SQL
   * crudo y la base falsa no la mira.
   */
  readonly descontadoBase: string;
  readonly sobranteBase: string;
  readonly destino: 'sigue_abierta' | 'retazo' | 'agotada';
  readonly piezaResultanteId: string | null;
}

export const cortarMaterial = definirComando<
  Transaccion,
  typeof entradaCortarMaterial,
  ResultadoCorte
>({
  nombre: 'inventario.cortar_material',
  entidad: 'corte_material',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaCortarMaterial,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const producto = await ctx.paso('cargar_producto', () =>
      ctx.tx
        .selectFrom('productos')
        .select([
          'id',
          'unidad_venta as unidad',
          'es_continuo as esContinuo',
          'umbral_retazo_base as umbralRetazo',
        ])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .executeTakeFirst(),
    );
    if (producto === undefined) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto no está en este catálogo.');
    }
    if (!producto.esContinuo) {
      // Cortar un martillo no es una operación. Sin esta guarda, un tecleo en la
      // pantalla equivocada descontaría de un producto por pieza una cantidad
      // en milímetros.
      throw new ErrorDominio('CATALOGO_INVALIDO', 'Ese producto no se corta: se vende por pieza.', {
        productoId: entrada.productoId,
      });
    }

    const abiertas = await ctx.paso('cargar_piezas', () =>
      ctx.tx
        .selectFrom('piezas_abiertas')
        .select(['id', 'medida_restante_base as restante', 'estado'])
        .where('organizacion_id', '=', organizacionId)
        .where('producto_id', '=', entrada.productoId)
        .where('almacen_id', '=', entrada.almacenId)
        .where('estado', '<>', 'cerrada')
        .execute(),
    );

    const candidatas: PiezaAbierta[] = abiertas.map((p) => ({
      id: p.id,
      restanteBase: p.restante,
      estado: p.estado as PiezaAbierta['estado'],
    }));

    const necesario = BigInt(entrada.medidaSolicitadaBase) + BigInt(entrada.mermaBase);
    const origen =
      entrada.piezaAbiertaId === undefined
        ? piezaParaElCorte(candidatas, necesario)
        : (candidatas.find((p) => p.id === entrada.piezaAbiertaId) ?? null);

    if (entrada.piezaAbiertaId !== undefined && origen === null) {
      throw new ErrorDominio(
        'PUENTE_NO_ENCONTRADO',
        'Esa pieza abierta no existe o ya está cerrada.',
        { piezaAbiertaId: entrada.piezaAbiertaId },
      );
    }

    // Sin pieza abierta que alcance, se corta de un rollo CERRADO y el corte
    // abre uno. `piezas_abiertas` no es el inventario, así que esto no cambia la
    // existencia — sólo dice que a partir de ahora hay una pieza con identidad.
    if (origen === null && entrada.medidaPiezaNuevaBase === undefined) {
      // Sin saber cuánto trae el rollo que se abre, el sobrante no se puede
      // calcular, y una pieza abierta con el restante inventado miente desde el
      // primer corte.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Ninguna pieza abierta alcanza: di cuánto trae el rollo que vas a abrir.',
        { necesario: necesario.toString() },
      );
    }

    const disponible = origen?.restanteBase ?? BigInt(entrada.medidaPiezaNuevaBase ?? 0);
    const plan = planearCorte(
      { restanteBase: disponible, umbralRetazoBase: producto.umbralRetazo },
      {
        medidaSolicitadaBase: BigInt(entrada.medidaSolicitadaBase),
        mermaBase: BigInt(entrada.mermaBase),
      },
    );

    // ── Lo que sale del almacén ───────────────────────────────────────────
    // Entregado y merma son DOS movimientos con motivos distintos, no uno
    // sumado: el corte diario acumula el patrón de merma por producto, y con un
    // solo movimiento esa sección del corte no se puede construir.
    const descontado = await descontar(
      ctx,
      entrada.almacenId,
      entrada.productoId,
      plan.consumidoBase,
    );

    const venta = await ctx.paso('anotar_venta', () =>
      ctx.tx
        .insertInto('movimientos_stock')
        .values({
          organizacion_id: organizacionId,
          almacen_id: entrada.almacenId,
          insumo_id: entrada.productoId,
          tipo: 'salida_venta',
          cantidad: `-${plan.entregadoBase.toString()}`,
          unidad: producto.unidad,
          referencia_tipo: 'corte',
          referencia_id: entrada.ordenLineaId,
          empleado_id: empleoId,
          motivo: 'corte de material',
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    const merma =
      plan.mermaBase === 0n
        ? null
        : await ctx.paso('anotar_merma', () =>
            ctx.tx
              .insertInto('movimientos_stock')
              .values({
                organizacion_id: organizacionId,
                almacen_id: entrada.almacenId,
                insumo_id: entrada.productoId,
                tipo: 'merma',
                cantidad: `-${plan.mermaBase.toString()}`,
                unidad: producto.unidad,
                referencia_tipo: 'corte',
                referencia_id: entrada.ordenLineaId,
                empleado_id: empleoId,
                motivo: 'corte',
              })
              .returning('id')
              .executeTakeFirstOrThrow(),
          );

    const resultante = await actualizarPiezas(ctx, entrada, plan, origen, producto.umbralRetazo);

    const corte = await ctx.paso('anotar_corte', () =>
      ctx.tx
        .insertInto('cortes_material')
        .values({
          organizacion_id: organizacionId,
          orden_linea_id: entrada.ordenLineaId,
          producto_id: entrada.productoId,
          pieza_abierta_id: origen?.id ?? null,
          medida_entregada_base: plan.entregadoBase,
          merma_base: plan.mermaBase,
          movimiento_venta_id: venta.id,
          movimiento_merma_id: merma?.id ?? null,
          pieza_resultante_id: resultante,
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: corte.id,
      payload: {
        ordenLineaId: entrada.ordenLineaId,
        productoId: entrada.productoId,
        entregadoBase: plan.entregadoBase.toString(),
        mermaBase: plan.mermaBase.toString(),
        destino: plan.destino,
      },
    });

    return {
      corteId: corte.id,
      piezaOrigenId: origen?.id ?? null,
      entregadoBase: plan.entregadoBase.toString(),
      mermaBase: plan.mermaBase.toString(),
      consumidoBase: plan.consumidoBase.toString(),
      descontadoBase: descontado.toString(),
      sobranteBase: plan.sobranteBase.toString(),
      destino: plan.destino,
      piezaResultanteId: resultante,
    };
  },
});

/**
 * Deja la pieza como quedó: con menos material, como retazo, o cerrada.
 *
 * Cuando el corte salió de un rollo cerrado —no había pieza abierta que
 * alcanzara— y sobra material, se ABRE una con su folio. Es el acto que el
 * mostradorista ya hace con una cinta; el sistema sólo le da memoria.
 */
async function actualizarPiezas(
  ctx: ContextoComando<Transaccion>,
  entrada: {
    readonly productoId: string;
    readonly almacenId: string;
    readonly folioResultante?: string | undefined;
  },
  plan: { readonly sobranteBase: bigint; readonly destino: string },
  origen: PiezaAbierta | null,
  umbralRetazo: bigint,
): Promise<string | null> {
  if (origen !== null) {
    if (plan.destino === 'agotada') {
      await ctx.paso('cerrar_pieza', () =>
        ctx.tx
          .updateTable('piezas_abiertas')
          .set({ estado: 'cerrada', medida_restante_base: 0n, cerrada_en: ctx.ahora })
          .where('id', '=', origen.id)
          .execute(),
      );
      return null;
    }

    await ctx.paso('actualizar_pieza', () =>
      ctx.tx
        .updateTable('piezas_abiertas')
        .set({
          medida_restante_base: plan.sobranteBase,
          // Una pieza que cruza el umbral pasa a retazo SOLA. Esperar a que
          // alguien la marque es esperar a que nadie la marque, y entonces el
          // sobrante se sigue ofreciendo a precio de lista.
          estado: plan.destino === 'retazo' ? 'retazo' : 'abierta',
        })
        .where('id', '=', origen.id)
        .execute(),
    );
    return origen.id;
  }

  // Salió de un rollo cerrado.
  if (plan.sobranteBase === 0n) return null;
  if (entrada.folioResultante === undefined) {
    // Sin folio no se abre: una pieza sin etiqueta es una pieza que nadie va a
    // encontrar en el anaquel, y entonces la tabla miente sobre lo que hay.
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'El corte deja material: hace falta el folio para etiquetar la pieza.',
    );
  }

  const nueva = await ctx.paso('abrir_pieza', () =>
    ctx.tx
      .insertInto('piezas_abiertas')
      .values({
        organizacion_id: ctx.ambito.organizacionId,
        producto_id: entrada.productoId,
        almacen_id: entrada.almacenId,
        folio: entrada.folioResultante ?? '',
        medida_restante_base: plan.sobranteBase,
        estado: plan.sobranteBase <= umbralRetazo ? 'retazo' : 'abierta',
        abierta_en: ctx.ahora,
      })
      .returning('id')
      .executeTakeFirstOrThrow(),
  );
  return nueva.id;
}

/**
 * Baja la existencia por lo consumido, sin dejarla negativa.
 *
 * ── Por qué se comprueba aquí ADEMÁS de en el plan ───────────────────────
 * El plan compara contra la PIEZA; esto compara contra la EXISTENCIA. Son
 * números distintos: puede haber un rollo abierto de 40 m registrado y cero de
 * existencia porque el conteo ya la corrigió. Cortar entonces dejaría el
 * almacén en negativo y la pieza diciendo que sí había.
 */
async function descontar(
  ctx: ContextoComando<Transaccion>,
  almacenId: string,
  insumoId: string,
  consumido: bigint,
): Promise<bigint> {
  const resultado = await ctx.paso('descontar_existencia', () =>
    sql<{ cantidad: string }>`
      update existencias
         set cantidad = cantidad - ${consumido.toString()}, actualizado_en = now()
       where organizacion_id = ${ctx.ambito.organizacionId}
         and almacen_id = ${almacenId}
         and insumo_id = ${insumoId}
         and cantidad >= ${consumido.toString()}
      returning cantidad
    `.execute(ctx.tx),
  );

  if (resultado.rows.length !== 1) {
    throw new ErrorDominio(
      'STOCK_INSUFICIENTE',
      'No hay material suficiente para ese corte y su merma.',
      { insumoId, consumido: consumido.toString() },
    );
  }

  return consumido;
}
