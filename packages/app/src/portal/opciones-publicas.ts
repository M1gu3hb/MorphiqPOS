import 'server-only';

import { obtenerDb } from '@morphiqpos/data';

/**
 * LAS OPCIONES DE CADA PLATILLO, PARA EL MENÚ PÚBLICO (DP-5, portal QR).
 *
 * `ProductoQRDialog` pinta los grupos (`producto.modificadores`) y el carrito los pliega en la nota
 * del pedido (`qrPedidoFlow.notaConModificadores`), igual que en el mesero. Lo que faltaba era que
 * el menú público los mandara: desde el QR no se podía elegir el sabor del pulque.
 *
 * Salen el NOMBRE del grupo y de cada opción, si es obligatorio y si es de una o varias. Nada de
 * precio: en el restaurante una opción no cobra (DP-D12), y lo que no cobra no se publica como
 * si cobrara. Sólo los grupos y opciones activos.
 */

export interface OpcionPublica {
  readonly id: string;
  readonly nombre: string;
}

export interface GrupoPublico {
  readonly nombre: string;
  readonly obligatorio: boolean;
  readonly tipo: 'unica' | 'multiple';
  readonly opciones: readonly OpcionPublica[];
}

/** Una fila de la consulta: una opción, con su grupo y su producto. */
export interface FilaDeOpcion {
  readonly producto_id: string;
  readonly grupo_id: string;
  readonly grupo: string;
  readonly obligatorio: boolean;
  readonly tipo: string;
  readonly opcion_id: string;
  readonly opcion: string;
}

/** Un grupo mientras se arma: la fila que lo abrió y las opciones que van llegando. */
interface Grupo {
  readonly base: FilaDeOpcion;
  readonly opciones: OpcionPublica[];
}

/** Las filas planas, agrupadas por producto y por grupo, en el orden en que llegan. */
export function gruposPorProducto(
  filas: readonly FilaDeOpcion[],
): ReadonlyMap<string, readonly GrupoPublico[]> {
  const porProducto = new Map<string, Map<string, Grupo>>();
  for (const f of filas) {
    const grupos = porProducto.get(f.producto_id) ?? new Map<string, Grupo>();
    const grupo = grupos.get(f.grupo_id) ?? { base: f, opciones: [] };
    grupo.opciones.push({ id: f.opcion_id, nombre: f.opcion });
    grupos.set(f.grupo_id, grupo);
    porProducto.set(f.producto_id, grupos);
  }
  const salida = new Map<string, readonly GrupoPublico[]>();
  for (const [productoId, grupos] of porProducto) {
    salida.set(
      productoId,
      [...grupos.values()].map(({ base, opciones }) => ({
        nombre: base.grupo,
        obligatorio: base.obligatorio,
        tipo: base.tipo === 'multiple' ? 'multiple' : 'unica',
        opciones,
      })),
    );
  }
  return salida;
}

/** Las opciones activas de los productos del menú, en UNA consulta para todos. */
export async function opcionesDelMenu(
  organizacionId: string,
  productoIds: readonly string[],
): Promise<ReadonlyMap<string, readonly GrupoPublico[]>> {
  if (productoIds.length === 0) return new Map();
  const filas = await obtenerDb()
    .selectFrom('producto_modificadores as pm')
    .innerJoin('modificadores as m', 'm.id', 'pm.modificador_id')
    .innerJoin('modificador_opciones as mo', 'mo.modificador_id', 'm.id')
    .select([
      'pm.producto_id as producto_id',
      'm.id as grupo_id',
      'm.nombre as grupo',
      'm.obligatorio as obligatorio',
      'm.tipo as tipo',
      'mo.id as opcion_id',
      'mo.nombre as opcion',
    ])
    .where('pm.organizacion_id', '=', organizacionId)
    .where('m.organizacion_id', '=', organizacionId)
    .where('pm.producto_id', 'in', [...productoIds])
    .where('m.activo', '=', true)
    .where('mo.activa', '=', true)
    .orderBy('pm.producto_id')
    .orderBy('m.nombre')
    .orderBy('mo.orden')
    .execute();
  return gruposPorProducto(filas);
}
