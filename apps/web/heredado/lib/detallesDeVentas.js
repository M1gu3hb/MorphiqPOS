import { api } from '@/api/cliente';

/** El techo de filas de una lectura del puente (`LIMITE_MAXIMO`). */
const TECHO_DEL_PUENTE = 1000;
/** Las ventas que quedan fuera del rango se piden de cuatro en cuatro, nunca todas a la vez. */
const LOTE = 4;

const instante = (fecha) => {
  const t = fecha ? new Date(fecha).getTime() : Number.NaN;
  return Number.isFinite(t) ? t : null;
};

async function porVenta(ids) {
  const detalles = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = await Promise.all(
      ids.slice(i, i + LOTE).map((id) => api.entidades.DetalleVenta.filter({ venta_id: id })),
    );
    for (const filas of lote) detalles.push(...(Array.isArray(filas) ? filas : []));
  }
  return detalles;
}

/**
 * LOS RENGLONES DE MUCHAS VENTAS EN UNA LECTURA (21-10-2026).
 *
 * El visor del corte pedía los renglones venta por venta y TODAS A LA VEZ: un día de 25
 * tickets eran 25 peticiones simultáneas por abrir un corte. Con el historial de la
 * presentación agotaron las conexiones de la base (EMAXCONN): el servidor se cayó, y el
 * corte salía en ceros o con un total distinto cada vez, según qué peticiones fallaran.
 *
 * Ahora es UNA lectura por la fecha de creación que cubre a esas ventas, filtrada aquí por
 * sus ids. Las ventas cuyos renglones no caen en el rango (una cuenta abierta mucho antes)
 * se piden aparte en lotes chicos; si la lectura toca el techo del puente, se piden todas
 * así, porque un corte con renglones a medias es peor que uno lento.
 */
export async function detallesDeVentas(ventas) {
  const lista = (Array.isArray(ventas) ? ventas : []).filter((v) => v?.id);
  if (lista.length === 0) return [];
  const ids = lista.map((v) => v.id);

  const instantes = lista
    .flatMap((v) => [v.fecha_apertura, v.created_date, v.fecha_cierre])
    .map(instante)
    .filter((t) => t !== null);
  if (instantes.length === 0) return porVenta(ids);

  const desde = new Date(Math.min(...instantes) - 60_000).toISOString();
  const hasta = new Date(Math.max(...instantes) + 60_000).toISOString();
  const enRango = await api.entidades.DetalleVenta.enRango(
    { campo: 'created_date', desde, hasta },
    {},
    'created_date',
    TECHO_DEL_PUENTE,
  );
  if (!Array.isArray(enRango) || enRango.length >= TECHO_DEL_PUENTE) return porVenta(ids);

  const buscadas = new Set(ids);
  const detalles = enRango.filter((d) => buscadas.has(d.venta_id));
  const conRenglones = new Set(detalles.map((d) => d.venta_id));
  const faltan = ids.filter((id) => !conRenglones.has(id));
  return faltan.length === 0 ? detalles : [...detalles, ...(await porVenta(faltan))];
}
