import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { aDiezmilesimas, deDiezmilesimas } from '@morphiqpos/domain/dinero';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * `catalogo.crear_presentacion` y `resolverPresentacion` — F-111 y F-112.
 *
 * ── El hueco que D-01 señala por su nombre ────────────────────────────────
 * La plantilla `esencial` no tiene inventario: se vende y el stock no baja. El
 * dueño no puede saber qué le falta ni qué le robaron, que son los dos dolores
 * más caros de una tiendita.
 *
 * ── El precio de una presentación NO es factor × precio ───────────────────
 * Un six casi nunca cuesta seis veces la pieza, y ése es justo el motivo por el
 * que el tendero vende six. Cuando la presentación declara su precio, manda ése;
 * cuando no, se deriva del factor y queda dicho que es una derivación.
 *
 * ── Y el precio lo pone el SERVIDOR, siempre ──────────────────────────────
 * El mostrador manda qué presentación se vendió, nunca cuánto cuesta. Un
 * endpoint que aceptara el importe de la línea dejaría que el navegador
 * decidiera el precio del six.
 */

const CANTIDAD = /^\d{1,10}(\.\d{1,4})?$/;

export const entradaCrearPresentacion = z.object({
  productoId: z.uuid(),
  nombre: z.string().trim().min(1).max(40),
  /** Cuántas unidades base contiene. Texto: el cigarro suelto es `0.05`. */
  factor: z.string().regex(CANTIDAD, 'El factor va con hasta cuatro decimales.'),
  codigoBarras: z.string().trim().min(4).max(64).optional(),
  sku: z.string().trim().min(1).max(40).optional(),
  /** Nulo = se deriva del factor. Con valor, manda éste. */
  precioVentaCentavos: z.number().int().min(0).max(100_000_000).optional(),
  esVentaDefault: z.boolean().default(false),
  esCompraDefault: z.boolean().default(false),
});

export interface ResultadoPresentacion {
  readonly presentacionId: string;
  readonly productoId: string;
  readonly factor: string;
  readonly precioVentaCentavos: string;
  readonly precioDerivado: boolean;
}

/** El catálogo lo toca quien responde por los precios, no quien cobra. */
const ROLES = ['gerente', 'administrador', 'dueno', 'almacen'] as const;

export const crearPresentacion = definirComando<
  Transaccion,
  typeof entradaCrearPresentacion,
  ResultadoPresentacion
>({
  nombre: 'catalogo.crear_presentacion',
  entidad: 'producto_presentacion',
  escribe: true,
  roles: [...ROLES],
  // Las presentaciones son de catálogo: existen en los cinco paquetes, aunque
  // sólo el retail las use a diario. Una cafetería que compra leche en caja de
  // doce las necesita igual.
  paquetes: PAQUETES_TODOS,
  entrada: entradaCrearPresentacion,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const producto = await ctx.paso('cargar_producto', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'precio_venta_centavos as precioBase'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .executeTakeFirst(),
    );
    if (producto === undefined) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto no está en este catálogo.');
    }

    const factor = aDiezmilesimas(entrada.factor);
    if (factor <= 0n) {
      throw new ErrorDominio(
        'CATALOGO_INVALIDO',
        'Una presentación contiene una cantidad positiva de unidades base.',
        { factor: entrada.factor },
      );
    }

    const codigoBarras = entrada.codigoBarras;
    if (codigoBarras !== undefined) {
      const chocado = await ctx.paso('mirar_codigo', () =>
        ctx.tx
          .selectFrom('producto_presentaciones')
          .select(['id', 'producto_id as productoId'])
          .where('organizacion_id', '=', organizacionId)
          .where('codigo_barras', '=', codigoBarras)
          .where('activa', '=', true)
          .executeTakeFirst(),
      );
      if (chocado !== undefined) {
        // Es el error que más se va a intentar —pegar el código del six en la
        // pieza— y el que más caro sale: el escáner descontaría seis veces
        // menos de lo que salió del anaquel.
        throw new ErrorDominio(
          'CATALOGO_INVALIDO',
          'Ese código de barras ya apunta a otra presentación.',
          { presentacionId: chocado.id },
        );
      }
    }

    // Si ésta se preselecciona, la anterior deja de hacerlo. El índice único
    // parcial de la 090 lo exige, y llegar a él como un 23505 le diría al
    // encargado «error de base de datos» en vez de «ya había una».
    if (entrada.esVentaDefault) {
      await ctx.paso('soltar_venta_default', () =>
        ctx.tx
          .updateTable('producto_presentaciones')
          .set({ es_venta_default: false })
          .where('organizacion_id', '=', organizacionId)
          .where('producto_id', '=', entrada.productoId)
          .where('es_venta_default', '=', true)
          .execute(),
      );
    }
    if (entrada.esCompraDefault) {
      await ctx.paso('soltar_compra_default', () =>
        ctx.tx
          .updateTable('producto_presentaciones')
          .set({ es_compra_default: false })
          .where('organizacion_id', '=', organizacionId)
          .where('producto_id', '=', entrada.productoId)
          .where('es_compra_default', '=', true)
          .execute(),
      );
    }

    const fila = await ctx.paso('crear', () =>
      ctx.tx
        .insertInto('producto_presentaciones')
        .values({
          organizacion_id: organizacionId,
          producto_id: entrada.productoId,
          nombre: entrada.nombre,
          factor: deDiezmilesimas(factor),
          codigo_barras: entrada.codigoBarras ?? null,
          sku: entrada.sku ?? null,
          precio_venta_centavos:
            entrada.precioVentaCentavos === undefined ? null : BigInt(entrada.precioVentaCentavos),
          // La BASE no se crea por aquí: la siembra el backfill de la 090 con
          // factor 1. Crear una segunda base chocaría con su índice único, y
          // aceptar el campo invitaría a intentarlo.
          es_base: false,
          es_venta_default: entrada.esVentaDefault,
          es_compra_default: entrada.esCompraDefault,
          activa: true,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    if (entrada.esVentaDefault) {
      await ctx.paso('apuntar_producto', () =>
        ctx.tx
          .updateTable('productos')
          .set({ presentacion_venta_id: fila.id })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', entrada.productoId)
          .execute(),
      );
    }

    const precio = precioDePresentacion(
      { factor: deDiezmilesimas(factor), precioPropio: entrada.precioVentaCentavos ?? null },
      producto.precioBase,
    );

    ctx.auditar({
      entidadId: fila.id,
      payload: {
        productoId: entrada.productoId,
        nombre: entrada.nombre,
        factor: deDiezmilesimas(factor),
        precioVentaCentavos: precio.centavos.toString(),
        precioDerivado: precio.derivado,
      },
    });

    return {
      presentacionId: fila.id,
      productoId: entrada.productoId,
      factor: deDiezmilesimas(factor),
      precioVentaCentavos: precio.centavos.toString(),
      precioDerivado: precio.derivado,
    };
  },
});

export interface PresentacionParaPrecio {
  readonly factor: string;
  /** El precio propio de la presentación, o `null` si se deriva. */
  readonly precioPropio: number | bigint | null;
}

/**
 * El precio de vender UNA unidad de esta presentación.
 *
 * ── Propio primero, derivado después ──────────────────────────────────────
 * Un six casi nunca cuesta seis veces la pieza: el descuento por volumen es la
 * razón por la que el tendero lo vende. Cuando la presentación declara precio,
 * manda ése. Cuando no, se deriva multiplicando el factor por el precio base —y
 * el resultado viene marcado como derivado, para que la pantalla lo pueda decir.
 *
 * El redondeo es al centavo, hacia arriba en el medio, igual que el resto del
 * dinero del sistema: `0.05 × 1750` de un cigarro suelto da 87.5 y se cobra 88.
 */
export function precioDePresentacion(
  presentacion: PresentacionParaPrecio,
  precioBaseCentavos: bigint,
): { readonly centavos: bigint; readonly derivado: boolean } {
  if (presentacion.precioPropio !== null) {
    return { centavos: BigInt(presentacion.precioPropio), derivado: false };
  }

  const factor = aDiezmilesimas(presentacion.factor);
  const producto = precioBaseCentavos * factor;
  // Medio centavo hacia arriba, con enteros: `(x*2 + escala) / (escala*2)`.
  const redondeado = (producto * 2n + 10_000n) / 20_000n;
  return { centavos: redondeado, derivado: true };
}
