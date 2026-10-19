import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

import type { ContextoComando } from '../definicion.ts';

/**
 * EL CLIENTE, SU OBRA Y EL MATERIAL, comprobados ANTES de escribir.
 *
 * La nota de mostrador y la lista de trabajo guardaban el `clienteId`, la `obraId` y el
 * `productoId` de cada renglón tal como llegaban, y un id que no existe lo paraba la llave
 * foránea: un 500 «No fue posible completar la operación» por una ficha que se borró en otra
 * pestaña. Ahora contestan lo mismo que el crédito (`credito.ts`) y que el resto de la venta:
 * que ese cliente no es de este negocio, que esa obra no es de ese cliente o que ese material
 * no está en este catálogo. Un id de OTRO negocio responde igual que uno que no existe: decir
 * cuál es cuál permitiría sondear lo ajeno con identificadores.
 */
export async function exigirClienteYObra(
  ctx: ContextoComando<Transaccion>,
  clienteId: string | null,
  obraId: string | null,
): Promise<void> {
  const { organizacionId } = ctx.ambito;
  if (clienteId !== null) {
    const cliente = await ctx.paso('comprobar_cliente', () =>
      ctx.tx
        .selectFrom('clientes')
        .select('id')
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', clienteId)
        .executeTakeFirst(),
    );
    if (cliente === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese cliente no existe en este negocio.');
    }
  }
  if (obraId !== null) {
    const obra = await ctx.paso('comprobar_obra', () =>
      ctx.tx
        .selectFrom('obras')
        .select('cliente_id')
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', obraId)
        .executeTakeFirst(),
    );
    // Una obra de OTRO cliente no es un aviso: es un tecleo, y cargarla ahí metería el
    // material en la cuenta equivocada (la misma regla que el crédito).
    if (obra === undefined || (clienteId !== null && obra.cliente_id !== clienteId)) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa obra no es de ese cliente.', { obraId });
    }
  }
}

/** Que cada material nombrado esté en el catálogo de este negocio. */
export async function exigirMateriales(
  ctx: ContextoComando<Transaccion>,
  productoIds: readonly string[],
): Promise<void> {
  const distintos = [...new Set(productoIds)];
  if (distintos.length === 0) return;
  const hallados = await ctx.paso('comprobar_materiales', () =>
    ctx.tx
      .selectFrom('productos')
      .select('id')
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', 'in', distintos)
      .execute(),
  );
  if (hallados.length !== distintos.length) {
    throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese material no está en este catálogo.');
  }
}
