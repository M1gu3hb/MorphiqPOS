import 'server-only';

/**
 * Compras y gastos (F1-02 E4-5).
 *
 * Cinco comandos, todos transaccionales: `compras.registrar` corrige D-12 y
 * escribe cabecera, líneas, ledger, existencias y costo promedio ponderado en
 * una sola transacción; `compras.usar_plantilla` y `gastos.registrar` mueven
 * los contadores de la plantilla en la misma transacción que el asiento, que es
 * lo que hoy no pasa (F1-04 §27.2).
 */

export {
  registrarCompra,
  totalDeLineas,
  usarPlantillaCompra,
  type ResultadoCompra,
} from './compras.ts';
export { guardarPlantillaCompra, lineasDePlantilla, marcarPlantillaUsada } from './plantillas.ts';
export { guardarPlantillaGasto, registrarGasto, type ResultadoGasto } from './gastos.ts';

export {
  entradaGuardarPlantillaCompra,
  entradaGuardarPlantillaGasto,
  entradaRegistrarCompra,
  entradaRegistrarGasto,
  entradaUsarPlantillaCompra,
  lineaDeCompra,
  lineaDePlantillaCompra,
  type LineaDeCompra,
} from './esquemas.ts';

export {
  cantidadConSigno,
  convertirAUnidadBase,
  costoPorUnidad,
  costoPromedioPonderado,
  equivalenciaCanonica,
  equivalenciaDeLinea,
  type EntradaDePromedio,
} from './costeo.ts';

/**
 * Se exporta para el puente: al LEER un gasto viejo, el prefijo de las notas
 * tiene que volver a verse como `recurrente` y `plantilla_id` (F1-04 §25.1).
 * Esa mitad vive en `packages/app/src/puente`, que no es de este módulo.
 */
export { reconocerNotasHeredadas, type NotasDeGasto } from './notas.ts';
