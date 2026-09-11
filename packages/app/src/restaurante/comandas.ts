import 'server-only';

import type { Transaccion } from '@morphiqpos/data';

import type { GrupoDeComanda } from './estaciones.ts';
import type { LineaPreparada } from './lineas.ts';
import type { OrdenDeMesa } from './datos.ts';

/**
 * La comanda y sus items: lo que ve la cocina.
 *
 * Se escriben en dos sentencias —una por tabla— y no en un bucle por comanda:
 * un pedido de doce platos serían veinticuatro viajes dentro de la transacción.
 * Los ids vienen ya generados desde `pedido.ts`, que es lo que permite que el
 * item apunte a su línea de venta sin volver a leer nada.
 */

export interface ComandaConGrupo {
  readonly id: string;
  readonly grupo: GrupoDeComanda<LineaPreparada>;
}

interface DatosDeComandas {
  readonly organizacionId: string;
  readonly orden: OrdenDeMesa;
  readonly notas: string | null;
  readonly comandas: readonly ComandaConGrupo[];
}

export async function insertarComandas(tx: Transaccion, datos: DatosDeComandas): Promise<void> {
  const { orden } = datos;
  await tx
    .insertInto('comandas')
    .values(
      datos.comandas.map(({ id, grupo }) => ({
        id,
        organizacion_id: datos.organizacionId,
        orden_id: orden.id,
        mesa_id: orden.mesaId,
        estacion_preparacion_id: grupo.estacion.id,
        // `area` se conserva por compatibilidad declarada: `Cocina` filtra por
        // ella cuando las estaciones están apagadas (`PedidoPreparacion.jsonc:24`).
        area: grupo.area,
        estado: 'nuevo',
        notas: datos.notas,
        // INSTANTÁNEAS: la cocina las pinta y la estación se puede desactivar.
        estacion_nombre: grupo.estacion.nombre,
        estacion_color: grupo.estacion.color,
        // El canal lo dice la orden, no el cuerpo de la petición: aceptarlo
        // dejaría que quien llama se declarara otro origen del que es.
        origen: origenDe(orden.estrategiaCaptura),
        // Instantáneas de la mesa tomadas al abrirla. La cocina tiene que ver
        // la alergia sin consultar otra tabla.
        notas_alergias: orden.notasAlergias,
        celebracion_especial: orden.celebracionEspecial,
        tipo_celebracion: orden.tipoCelebracion,
      })),
    )
    .execute();
}

export async function insertarItems(
  tx: Transaccion,
  organizacionId: string,
  comandas: readonly ComandaConGrupo[],
): Promise<void> {
  const items = comandas.flatMap(({ id, grupo }) =>
    grupo.lineas.map((linea, visual) => {
      const { producto, valorada } = linea;
      const esVariable = producto.tipoVenta === 'variable_medida';
      const esPorcion = producto.tipoVenta === 'porcion_contenedor';
      return {
        organizacion_id: organizacionId,
        comanda_id: id,
        // EL VÍNCULO QUE HOY NO EXISTE (F1-04 §10.3). Con él, el estado del
        // item y el de la línea se mantienen coherentes en una transacción.
        orden_linea_id: linea.id,
        producto_id: producto.id,
        producto_nombre: producto.nombre,
        cantidad: valorada.cantidad,
        notas: linea.notas,
        // `pendiente`, no `nuevo`: se normaliza la incoherencia heredada entre
        // `Mesero.jsx:595` y `POS.jsx:403` (F1-04 §7.5).
        estado: 'pendiente',
        tipo_venta: producto.tipoVenta,
        unidad_variable: esVariable ? valorada.unidad : null,
        cantidad_variable: esVariable ? valorada.cantidad : null,
        nombre_porcion: esPorcion ? producto.nombrePorcion : null,
        cantidad_porciones: esPorcion ? valorada.cantidad : null,
        orden_visual: visual,
      };
    }),
  );

  if (items.length === 0) return;
  await tx.insertInto('comanda_items').values(items).execute();
}

/** `estrategia_captura` → `comandas.origen` (F1-04 §6.5 y §10.2). */
function origenDe(estrategiaCaptura: string): string {
  if (estrategiaCaptura === 'qr') return 'portal_qr';
  if (estrategiaCaptura === 'mesa') return 'mesero';
  return 'pos';
}
