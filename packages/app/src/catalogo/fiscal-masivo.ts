import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-012 · Poner el régimen fiscal a cuatrocientos productos de una vez.
 *
 * ── Por qué tiene que ser masivo ─────────────────────────────────────────
 * Una tiendita tiene entre 800 y 2,000 claves, y el IVA y el IEPS no son del
 * producto: son de la CATEGORÍA. Los refrescos llevan cuota por litro, las
 * frituras llevan 8 % ad valorem, la despensa va exenta. Ponerlo producto por
 * producto son tres tardes, así que no se pone: todo queda al 16 % por omisión,
 * el ticket declara mal, y el error no aparece en ninguna pantalla hasta la
 * declaración anual.
 *
 * ── Y por qué NO lo aplica a ciegas ──────────────────────────────────────
 * Devuelve primero QUÉ va a cambiar y en cuántos productos. Marcar cuatrocientas
 * claves como cerveza porque alguien eligió la categoría equivocada es un error
 * que se descubre en la declaración y que no se puede deshacer producto por
 * producto: para entonces ya se vendieron.
 *
 * ── La cuota por litro exige LITROS ──────────────────────────────────────
 * Una bebida saborizada sin `litros_por_unidad` no puede calcular su IEPS: son
 * $1.64 por litro, y sin saber cuántos litros trae el envase el impuesto sale
 * cero. Los productos a los que les falta se devuelven por nombre, no se
 * cuentan: «faltan 12» manda a alguien a buscar cuáles.
 */

const CATALOGO = ['gerente', 'administrador', 'dueno'] as const;

/** Las tres que conviven en el mismo anaquel. Cerrada: un 15 % nadie lo ve. */
const TASAS_IVA = [0, 800, 1600] as const;

export const entradaFiscalMasivo = z.object({
  /** A quiénes. Una categoría entera, o una lista explícita. */
  categoriaId: z.uuid().nullable().default(null),
  productoIds: z.array(z.uuid()).max(500).default([]),
  tasaIvaBp: z
    .union([z.literal(0), z.literal(800), z.literal(1600)])
    .nullable()
    .default(null),
  regimenIeps: z
    .enum(['exento', 'bebida_saborizada', 'alimento_alta_densidad', 'cerveza', 'tabaco'])
    .nullable()
    .default(null),
  /** Cuando NO se aplica: sólo dice qué pasaría. Es el valor por omisión. */
  aplicar: z.boolean().default(false),
});

export interface ProductoSinLitros {
  readonly productoId: string;
  readonly nombre: string;
}

export interface ResultadoFiscalMasivo {
  readonly alcanzados: number;
  readonly aplicado: boolean;
  readonly tasaIvaBp: number | null;
  readonly regimenIeps: string | null;
  /**
   * Los que NO se pueden marcar porque les falta `litros_por_unidad`.
   *
   * Se devuelven con nombre y no contados: «faltan 12» manda a alguien a buscar
   * cuáles entre ochocientas claves.
   */
  readonly sinLitros: readonly ProductoSinLitros[];
  /** Cuántos ya estaban así. Lo que no cambia no debería alarmar a nadie. */
  readonly yaEstaban: number;
}

export const asignarFiscalMasivo = definirComando<
  Transaccion,
  typeof entradaFiscalMasivo,
  ResultadoFiscalMasivo
>({
  nombre: 'catalogo.fiscal_masivo',
  entidad: 'producto',
  escribe: true,
  roles: [...CATALOGO],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaFiscalMasivo,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    if (entrada.tasaIvaBp === null && entrada.regimenIeps === null) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Hay que decir qué se pone: la tasa de IVA, el régimen de IEPS, o los dos.',
      );
    }
    if (entrada.categoriaId === null && entrada.productoIds.length === 0) {
      // Sin filtro alcanzaría al catálogo entero, que es exactamente el error
      // que este comando existe para no cometer.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Hay que decir a quiénes: una categoría o una lista de productos.',
      );
    }

    let consulta = ctx.tx
      .selectFrom('productos')
      .select(['id', 'nombre', 'tasa_iva_bp', 'regimen_ieps', 'litros_por_unidad'])
      .where('organizacion_id', '=', organizacionId)
      .where('activo', '=', true);
    if (entrada.categoriaId !== null) {
      consulta = consulta.where('categoria_id', '=', entrada.categoriaId);
    }
    if (entrada.productoIds.length > 0) {
      consulta = consulta.where('id', 'in', entrada.productoIds);
    }

    const productos = await ctx.paso('leer_productos', () => consulta.execute());
    if (productos.length === 0) {
      throw new ErrorDominio(
        'PRODUCTO_NO_ENCONTRADO',
        'Ese filtro no alcanza a ningún producto activo.',
      );
    }

    // La cuota por litro sin litros da un IEPS de cero. Los que no lo tienen se
    // apartan ANTES de tocar nada: marcarlos igual dejaría un impuesto que no
    // se puede calcular y que nadie va a notar hasta la declaración.
    const sinLitros: ProductoSinLitros[] =
      entrada.regimenIeps === 'bebida_saborizada'
        ? productos
            .filter((p) => p.litros_por_unidad === null || p.litros_por_unidad === undefined)
            .map((p) => ({ productoId: p.id, nombre: p.nombre }))
        : [];

    const excluidos = new Set(sinLitros.map((p) => p.productoId));
    const alcanzables = productos.filter((p) => !excluidos.has(p.id));

    const yaEstaban = alcanzables.filter(
      (p) =>
        (entrada.tasaIvaBp === null || p.tasa_iva_bp === entrada.tasaIvaBp) &&
        (entrada.regimenIeps === null || p.regimen_ieps === entrada.regimenIeps),
    ).length;

    // Sin `aplicar` esto NO escribe. Marcar cuatrocientas claves como cerveza
    // porque alguien eligió la categoría equivocada se descubre en la
    // declaración, y para entonces ya se vendieron.
    if (!entrada.aplicar) {
      return {
        alcanzados: alcanzables.length,
        aplicado: false,
        tasaIvaBp: entrada.tasaIvaBp,
        regimenIeps: entrada.regimenIeps,
        sinLitros,
        yaEstaban,
      };
    }

    if (entrada.tasaIvaBp !== null && !TASAS_IVA.includes(entrada.tasaIvaBp)) {
      throw new ErrorDominio('CONFIGURACION_INVALIDA', 'Esa tasa de IVA no existe.');
    }

    const cambios: Record<string, unknown> = { updated_at: ctx.ahora };
    if (entrada.tasaIvaBp !== null) cambios['tasa_iva_bp'] = entrada.tasaIvaBp;
    if (entrada.regimenIeps !== null) cambios['regimen_ieps'] = entrada.regimenIeps;

    if (alcanzables.length > 0) {
      await ctx.paso('aplicar', () =>
        ctx.tx
          .updateTable('productos')
          .set(cambios)
          .where('organizacion_id', '=', organizacionId)
          .where(
            'id',
            'in',
            alcanzables.map((p) => p.id),
          )
          .execute(),
      );
    }

    ctx.auditar({
      entidadId: entrada.categoriaId ?? organizacionId,
      payload: {
        alcanzados: alcanzables.length,
        tasaIvaBp: entrada.tasaIvaBp,
        regimenIeps: entrada.regimenIeps,
        sinLitros: sinLitros.length,
      },
    });
    return {
      alcanzados: alcanzables.length,
      aplicado: true,
      tasaIvaBp: entrada.tasaIvaBp,
      regimenIeps: entrada.regimenIeps,
      sinLitros,
      yaEstaban,
    };
  },
});
