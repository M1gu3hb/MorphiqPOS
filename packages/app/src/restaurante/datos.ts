import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

import type { EstacionCandidata } from './estaciones.ts';
import { ESTADOS_COMANDA_ACTIVOS, type EstadoComanda, type EstadoMesa } from './transiciones.ts';

/**
 * Las lecturas que comparten los cinco comandos de restaurante.
 *
 * Viven aquí y no en `packages/data` porque son consultas de un caso de uso
 * concreto, no un repositorio: piden exactamente las columnas que la comanda
 * necesita y ni una más (`morphiq-prs §12A` prohíbe `select *` en el camino
 * caliente). El módulo de inventario hace lo mismo con `ctx.tx`.
 */

/**
 * ¿Es este error el índice único que esperábamos que saltara?
 *
 * Sin esta traducción, `ordenes_una_activa_por_mesa` llega al mesero como un
 * 500 sin explicación. El índice hace bien su trabajo —impide antes en vez de
 * limpiar después, que es lo que hoy hace `qrPedidoFlow.js:122-134`— pero un
 * error de Postgres no es un mensaje para una persona.
 *
 * Se comprueba el NOMBRE del índice, no sólo el código 23505: cualquier otra
 * violación de unicidad en la misma transacción significa otra cosa y tiene que
 * seguir subiendo como error interno.
 */
export function esViolacionDeUnicidad(error: unknown, indices: readonly string[]): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if (!('code' in error) || error.code !== '23505') return false;
  if (!('constraint' in error)) return false;
  const nombre = error.constraint;
  return typeof nombre === 'string' && indices.includes(nombre);
}

export interface MesaOperable {
  readonly id: string;
  readonly numero: number;
  readonly estado: EstadoMesa;
  readonly sucursalId: string;
  readonly ordenActivaId: string | null;
  readonly empleadoAtiendeId: string | null;
}

/** La mesa, o `MESA_NO_ENCONTRADA`. Una mesa de otra organización se ve igual. */
export async function mesaOperable(
  tx: Transaccion,
  organizacionId: string,
  mesaId: string,
): Promise<MesaOperable> {
  const fila = await tx
    .selectFrom('mesas')
    .select([
      'id',
      'numero',
      'estado',
      'activa',
      'sucursal_id as sucursalId',
      'orden_activa_id as ordenActivaId',
      'empleado_atiende_id as empleadoAtiendeId',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', mesaId)
    .executeTakeFirst();

  if (fila?.activa !== true) {
    throw new ErrorDominio('MESA_NO_ENCONTRADA', 'Esa mesa no existe o está dada de baja.');
  }

  return {
    id: fila.id,
    numero: fila.numero,
    estado: fila.estado as EstadoMesa,
    sucursalId: fila.sucursalId,
    ordenActivaId: fila.ordenActivaId,
    empleadoAtiendeId: fila.empleadoAtiendeId,
  };
}

export interface OrdenDeMesa {
  readonly id: string;
  readonly estado: string;
  readonly sucursalId: string;
  readonly mesaId: string | null;
  readonly estrategiaCaptura: string;
  readonly codigoCaja: string | null;
  readonly notasAlergias: string | null;
  readonly celebracionEspecial: boolean;
  readonly tipoCelebracion: string | null;
}

/**
 * Los dos canales por los que nace una cuenta de MESA (F1-04 §6.5): `mesa`, que
 * abre el mesero (`mesas-escrituras.ts`), y `qr`, que abre el comensal desde su
 * teléfono (`portal/mesa.ts`). Las dos escriben `mesa_id`. Lo demás
 * —`mostrador`, `escaner`, `cita`, `tienda_en_linea`— es otro flujo.
 */
const ESTRATEGIAS_DE_SALA = ['mesa', 'qr'] as const;

export async function ordenDeMesa(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
): Promise<OrdenDeMesa> {
  const fila = await tx
    .selectFrom('ordenes')
    .select([
      'id',
      'estado',
      'sucursal_id as sucursalId',
      'mesa_id as mesaId',
      'estrategia_captura as estrategiaCaptura',
      'codigo_caja as codigoCaja',
      'notas_alergias as notasAlergias',
      'celebracion_especial as celebracionEspecial',
      'tipo_celebracion as tipoCelebracion',
    ])
    // El filtro por organización va SIEMPRE, aunque el id sea un uuid: sin él,
    // conocer un id ajeno basta para leer la cuenta de otro negocio (BOLA).
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', ordenId)
    .executeTakeFirst();

  if (fila === undefined) {
    throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa cuenta ya no existe.');
  }

  // ACOTAR AL FLUJO DE RESTAURANTE. Sin esta guarda el cargador devolvía
  // CUALQUIER orden de la organización, y bastaba teclear el id del carrito de
  // MOSTRADOR en /api/restaurante/solicitar-cuenta para sacarlo de 'borrador',
  // pisarle subtotal, total, costo, utilidad y margen, y estamparle un
  // `codigo_caja` «M00-####» de una mesa que no existe. Esa venta quedaba
  // después sin poder cobrarse, editarse ni cancelarse.
  //
  // Se comprueban los DOS ejes: `estrategia_captura` dice por dónde entró y
  // `mesa_id` a qué mesa pertenece. Se escriben aparte, así que exigir sólo uno
  // deja el otro sin cubrir.
  //
  // Mismo código que «no existe», a propósito: para un cargador que se llama
  // `ordenDeMesa`, una venta que no es de mesa NO existe. `contracts` no tiene
  // hoy un código para «orden de otro flujo» y ese paquete no se toca aquí
  // (queda en el informe); el mensaje sí dice dónde buscarla.
  if (
    fila.mesaId === null ||
    !(ESTRATEGIAS_DE_SALA as readonly string[]).includes(fila.estrategiaCaptura)
  ) {
    throw new ErrorDominio(
      'ORDEN_NO_ENCONTRADA',
      'Esa venta no es la cuenta de una mesa: se capturó por otro camino. Búscala en Caja.',
      { estrategiaCaptura: fila.estrategiaCaptura },
    );
  }

  return fila;
}

/**
 * La MISMA orden, pero sin exigir que sea de sala.
 *
 * `ordenDeMesa` rechaza mostrador a propósito y con razón: sin esa guarda,
 * teclear el id del carrito de mostrador en `/api/restaurante/solicitar-cuenta`
 * lo sacaba de borrador y le estampaba un código de caja de una mesa que no
 * existe. Esa protección se queda donde está.
 *
 * Pero mandar un plato a la cocina NO es una operación de sala: una hamburguesa
 * cobrada en la barra tiene que llegar a la plancha igual que una de la mesa 7.
 * Reutilizar `ordenDeMesa` aquí es lo que dejó al mostrador sin cocina, y
 * relajar `ordenDeMesa` habría reabierto el hueco del código de caja. Son dos
 * preguntas distintas y ahora tienen dos lectores distintos.
 *
 * Éste no decide nada: sólo entrega las instantáneas que la comanda copia
 * —alergias, celebración, canal de captura—. Quien decide si se puede comandar
 * es el comando que lo llama.
 */
export async function ordenParaComandar(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
): Promise<OrdenDeMesa> {
  const fila = await tx
    .selectFrom('ordenes')
    .select([
      'id',
      'estado',
      'sucursal_id as sucursalId',
      'mesa_id as mesaId',
      'estrategia_captura as estrategiaCaptura',
      'codigo_caja as codigoCaja',
      'notas_alergias as notasAlergias',
      'celebracion_especial as celebracionEspecial',
      'tipo_celebracion as tipoCelebracion',
    ])
    // El filtro por organización va SIEMPRE, aunque el id sea un uuid.
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', ordenId)
    .executeTakeFirst();

  if (fila === undefined) {
    throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa cuenta ya no existe.');
  }
  return fila;
}

/** Las estaciones que pueden recibir comandas. Apagada no recibe (regla 10). */
export async function estacionesActivas(
  tx: Transaccion,
  organizacionId: string,
): Promise<readonly EstacionCandidata[]> {
  const filas = await tx
    .selectFrom('estaciones_preparacion')
    .select(['id', 'nombre', 'color', 'es_general as esGeneral'])
    .where('organizacion_id', '=', organizacionId)
    .where('activa', '=', true)
    .orderBy('orden')
    .execute();

  return filas;
}

/**
 * Cuántas comandas de la orden siguen vivas, sin contar las que se acaban de
 * mover en esta misma transacción.
 *
 * Es lo que decide si la mesa avanza: si la barra terminó pero la cocina sigue,
 * la mesa no cambia de estado (`Cocina.jsx:249-259`).
 */
export async function quedanComandasActivas(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
  excluir: readonly string[],
): Promise<boolean> {
  let consulta = tx
    .selectFrom('comandas')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('orden_id', '=', ordenId)
    .where('estado', 'in', [...ESTADOS_COMANDA_ACTIVOS]);

  if (excluir.length > 0) consulta = consulta.where('id', 'not in', [...excluir]);

  return (await consulta.limit(1).executeTakeFirst()) !== undefined;
}

export interface ComandaViva {
  readonly id: string;
  readonly estado: EstadoComanda;
  readonly ordenId: string;
  readonly mesaId: string | null;
  readonly estacionNombre: string | null;
}

export async function comandaPorId(
  tx: Transaccion,
  organizacionId: string,
  comandaId: string,
): Promise<ComandaViva> {
  const fila = await tx
    .selectFrom('comandas')
    .select([
      'id',
      'estado',
      'orden_id as ordenId',
      'mesa_id as mesaId',
      'estacion_nombre as estacionNombre',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', comandaId)
    .executeTakeFirst();

  if (fila === undefined) {
    throw new ErrorDominio('COMANDA_NO_ENCONTRADA', 'Ese pedido ya no está en cocina.');
  }
  return { ...fila, estado: fila.estado as EstadoComanda };
}
