import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';

import type { EstadoDelCarrito } from './carrito.ts';
import type { ContextoPortal } from './definicion-publica.ts';
import { cargarProductosDelMenu, valorarParaPedido, type ProductoDelMenu } from './productos.ts';

/**
 * LO QUE YA NO SE PUEDE PEDIR DEL CARRITO COMPARTIDO (PAR-1).
 *
 * Una línea entra al carrito cuando el producto se podía pedir. Entre eso y «Enviar» el negocio
 * puede ocultarlo, desactivarlo o cambiarle la unidad o la cantidad mínima. Antes, esa línea hacía
 * que `pedirEnLaMesa` lanzara y el envío se trababa para TODA la mesa, con una sola salida: que el
 * teléfono que la agregó la quitara. Aquí se aparta: el pedido sale sin ella y se dice.
 */

export interface LineaPendiente {
  readonly id: string;
  readonly producto_id: string;
  readonly cantidad: string;
  readonly notas: string;
}

export interface LoQueSePide {
  readonly quedan: readonly LineaPendiente[];
  readonly fuera: readonly LineaPendiente[];
  /** Los nombres de lo que se quitó, sin repetir y en el orden del carrito. */
  readonly nombres: readonly string[];
  /** El menú ya leído: el envío lo reutiliza en vez de leerlo otra vez (y de verlo cambiar). */
  readonly menu: ReadonlyMap<string, ProductoDelMenu>;
}

/**
 * ¿Se puede pedir esa cantidad de ese producto desde el teléfono? Las reglas de cantidad son las
 * mismas del envío (`valorarLinea`). Sólo un `ErrorDominio` dice «no»: cualquier otro error es un
 * fallo y se propaga.
 */
export function sePuedePedir(producto: ProductoDelMenu | undefined, cantidad: string): boolean {
  if (producto === undefined) return false;
  try {
    valorarParaPedido(producto.paraVender, cantidad);
    return true;
  } catch (error: unknown) {
    if (error instanceof ErrorDominio) return false;
    throw error;
  }
}

export async function apartarLoQueYaNoSePide(
  ctx: ContextoPortal,
  lineas: readonly LineaPendiente[],
  estado: EstadoDelCarrito,
): Promise<LoQueSePide> {
  const menu = await ctx.paso('menu_del_carrito', () =>
    cargarProductosDelMenu(
      ctx.tx,
      ctx.ambito.organizacionId,
      lineas.map((l) => l.producto_id),
    ),
  );
  const quedan = lineas.filter((l) => sePuedePedir(menu.get(l.producto_id), l.cantidad));
  const fuera = lineas.filter((l) => !quedan.includes(l));
  // El nombre sale del estado del carrito, que lo lee aunque el producto ya esté oculto.
  const nombreDe = new Map(estado.lineas.map((l) => [l.id, l.nombre]));
  const nombres = [...new Set(fuera.map((l) => nombreDe.get(l.id) ?? 'Un platillo'))];
  return { quedan, fuera, nombres, menu };
}
