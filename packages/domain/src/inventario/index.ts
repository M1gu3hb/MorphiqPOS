export {
  calcularConsumo,
  type EstrategiaConsumo,
  type IngredienteReceta,
  type LineaParaConsumo,
  type MovimientoPlaneado,
  type UnidadInventario,
} from './consumo.ts';

export { lineasDelCanal } from './canal.ts';

export {
  planearAjustesDeConteo,
  sumarCapturas,
  zonasPorContar,
  type AjustePlaneado,
  type CapturaDeConteo,
  type DiferenciaContada,
  type ZonaParaRecorrido,
  type ZonaPendiente,
} from './conteo.ts';
