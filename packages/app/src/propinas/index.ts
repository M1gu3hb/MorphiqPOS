import 'server-only';

/** Propinas y liquidación (F1-02 E6-7). */

export {
  desglosarPagos,
  efectivoDelCajon,
  etiquetaDeMesero,
  servirDesglose,
  METODOS_DE_PROPINA,
  SIN_MESERO,
  type DesgloseExacto,
  type DesgloseServible,
  type MetodoDePropina,
  type PropinaDeMesero,
  type RenglonDePago,
  type TotalesDeMetodo,
} from './desglose.ts';

export {
  entradaCobrarOrdenConPropina,
  entradaLiquidarPropinas,
  entradaPagoConPropina,
  entradaPropinasPendientes,
  ORIGENES_DE_PROPINA,
  TIPOS_DE_PROPINA,
} from './esquemas.ts';

export {
  marcarPropinaDeOrden,
  registrarPagoConPropina,
  type MetadatosDePropina,
  type PagoConPropina,
} from './cobro.ts';

export {
  resolverRango,
  DIAS_MAXIMOS_DE_RANGO,
  RANGOS_DE_LIQUIDACION,
  type RangoDeLiquidacion,
  type RangoResuelto,
} from './rango.ts';

export { explicarReclamo, type Reclamo } from './reclamo.ts';

export {
  folioVisible,
  liquidarPropinas,
  SERIE_LIQUIDACION,
  type ResultadoLiquidacion,
} from './liquidar.ts';

export { propinasPendientes, type PropinasPendientes } from './consultas.ts';

export type { VentaConPropina } from './repositorio.ts';
