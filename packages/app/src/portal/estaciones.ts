import 'server-only';

import type { ContextoPortal } from './definicion-publica.ts';

/**
 * A qué estación va cada línea del pedido (`F1-04` §11.2).
 *
 * La cadena es **Producto → Categoría → Estación**, no Producto → Estación.
 * `preparacionEstacionUtils.js` la resuelve así y hay que preservarla: la
 * estación se configura por categoría, y las categorías llevan el nombre y el
 * color de su estación en instantánea.
 *
 * ── Las tres reglas del original, que se conservan ────────────────────────
 * 1. Si `estaciones_preparacion_activas` está apagado, se agrupa por
 *    `producto.area_preparacion` — el modo antiguo, y sigue siendo válido.
 * 2. Nunca lanza por no encontrar estación: cae a «Cocina general», y si
 *    tampoco existe, al área. Un pedido que no llega a la cocina porque falta
 *    una fila de configuración es una mesa esperando para siempre.
 * 3. Sólo se leen los snapshots ya guardados en `categorias`, nunca se consulta
 *    la estación en vivo.
 *
 * ── Y por qué esto vive aquí y no viaja en la respuesta pública ───────────
 * Hoy `qrPedidoFlow.js:255` descarga la configuración ENTERA por segunda vez
 * sólo para leer `estaciones_preparacion_activas`. `F1-04` §36.3 lo dice
 * explícito: se resuelve dentro del comando y desaparece de la respuesta
 * pública. Al comensal no le importa cómo está organizada la cocina.
 */

export interface ItemParaCocina {
  readonly ordenLineaId: string;
  readonly productoId: string;
  readonly productoNombre: string;
  readonly cantidad: string;
  readonly notas: string;
  readonly tipoVenta: string;
  readonly categoriaId: string | null;
  readonly areaPreparacion: string;
}

export interface DatosDeComanda {
  readonly ordenId: string;
  readonly notasAlergias: string | null;
  readonly celebracionEspecial: boolean;
  readonly tipoCelebracion: string | null;
  readonly notas: string;
}

interface Destino {
  readonly clave: string;
  readonly estacionId: string | null;
  readonly estacionNombre: string | null;
  readonly estacionColor: string | null;
  readonly area: 'cocina' | 'barra';
}

/** `comandas.area` sólo admite `cocina` o `barra`; el producto admite cuatro. */
function areaDeComanda(area: string): 'cocina' | 'barra' {
  return area === 'barra' ? 'barra' : 'cocina';
}

interface EstacionSnapshot {
  readonly id: string;
  readonly nombre: string;
  readonly color: string;
}

/**
 * Reparte los items en comandas y las escribe.
 *
 * Devuelve cuántas comandas se crearon. Todo ocurre en la transacción del
 * comando: si una línea falla, no queda media comanda en la pantalla de cocina
 * — que es el defecto D-05 llevado al flujo del QR.
 */
export async function enviarACocina(
  ctx: ContextoPortal,
  datos: DatosDeComanda,
  items: readonly ItemParaCocina[],
): Promise<number> {
  const destinos = await resolverDestinos(ctx, items);

  const grupos = new Map<string, { destino: Destino; items: ItemParaCocina[] }>();
  for (const item of items) {
    const destino = destinos.get(item.productoId) ?? porArea(item.areaPreparacion);
    const grupo = grupos.get(destino.clave);
    if (grupo === undefined) grupos.set(destino.clave, { destino, items: [item] });
    else grupo.items.push(item);
  }

  for (const { destino, items: delGrupo } of grupos.values()) {
    const comanda = await ctx.tx
      .insertInto('comandas')
      .values({
        organizacion_id: ctx.ambito.organizacionId,
        orden_id: datos.ordenId,
        mesa_id: ctx.ambito.mesaId,
        estacion_preparacion_id: destino.estacionId,
        estacion_nombre: destino.estacionNombre,
        estacion_color: destino.estacionColor,
        area: destino.area,
        estado: 'nuevo',
        origen: 'portal_qr',
        notas: datos.notas === '' ? null : datos.notas,
        // La alergia viaja en instantánea y en primer lugar: es información de
        // seguridad, no una nota más (F1-04 §36.4).
        notas_alergias: datos.notasAlergias,
        celebracion_especial: datos.celebracionEspecial,
        tipo_celebracion: datos.tipoCelebracion,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    let visual = 0;
    for (const item of delGrupo) {
      visual += 1;
      await ctx.tx
        .insertInto('comanda_items')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          comanda_id: comanda.id,
          orden_linea_id: item.ordenLineaId,
          producto_id: item.productoId,
          producto_nombre: item.productoNombre,
          cantidad: item.cantidad,
          notas: item.notas === '' ? null : item.notas,
          estado: 'pendiente',
          tipo_venta: item.tipoVenta,
          orden_visual: visual,
        })
        .execute();
    }
  }

  return grupos.size;
}

function porArea(area: string): Destino {
  const normalizada = areaDeComanda(area);
  return {
    clave: `area:${normalizada}`,
    estacionId: null,
    estacionNombre: null,
    estacionColor: null,
    area: normalizada,
  };
}

/**
 * Resuelve la estación de cada producto, una sola consulta por tabla.
 *
 * Nada de una consulta por línea: un pedido de veinte productos haría cuarenta
 * viajes a la base dentro de la transacción del comando.
 */
async function resolverDestinos(
  ctx: ContextoPortal,
  items: readonly ItemParaCocina[],
): Promise<Map<string, Destino>> {
  const destinos = new Map<string, Destino>();
  if (!ctx.banderas.estacionesActivas) return destinos;

  const categorias = [
    ...new Set(items.map((i) => i.categoriaId).filter((id): id is string => id !== null)),
  ];

  const filas =
    categorias.length === 0
      ? []
      : await ctx.tx
          .selectFrom('categorias')
          .select(['id', 'estacion_preparacion_id', 'estacion_nombre', 'estacion_color'])
          .where('organizacion_id', '=', ctx.ambito.organizacionId)
          .where('id', 'in', categorias)
          .execute();

  const porCategoria = new Map(filas.map((f) => [f.id, f]));
  const general = await estacionGeneral(ctx);

  for (const item of items) {
    const categoria = item.categoriaId === null ? undefined : porCategoria.get(item.categoriaId);
    const estacionId = categoria?.estacion_preparacion_id ?? null;

    if (estacionId !== null) {
      destinos.set(item.productoId, {
        clave: `estacion:${estacionId}`,
        estacionId,
        estacionNombre: categoria?.estacion_nombre ?? null,
        estacionColor: categoria?.estacion_color ?? null,
        area: areaDeComanda(item.areaPreparacion),
      });
      continue;
    }

    if (general !== null) {
      destinos.set(item.productoId, {
        clave: `estacion:${general.id}`,
        estacionId: general.id,
        estacionNombre: general.nombre,
        estacionColor: general.color,
        area: areaDeComanda(item.areaPreparacion),
      });
    }
    // Sin estación y sin general: se queda fuera del mapa y cae al área.
  }

  return destinos;
}

/**
 * «Cocina general», el respaldo obligatorio de la regla 10.
 *
 * El índice `estaciones_una_general` garantiza que haya como mucho una, así que
 * aquí no hace falta el «toma la primera en silencio» que hoy hacen los cuatro
 * consumidores de `preparacionEstacionUtils.js:49`.
 */
async function estacionGeneral(ctx: ContextoPortal): Promise<EstacionSnapshot | null> {
  const fila = await ctx.tx
    .selectFrom('estaciones_preparacion')
    .select(['id', 'nombre', 'color'])
    .where('organizacion_id', '=', ctx.ambito.organizacionId)
    .where('es_general', '=', true)
    .where('activa', '=', true)
    .executeTakeFirst();

  return fila ?? null;
}
