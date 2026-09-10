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
  MAXIMO_LINEAS_DE_COMPRA,
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
 * `reconocerNotasHeredadas` NO se exporta.
 *
 * Estaba exportada «para el puente», describiendo una mitad de lectura que no
 * existe: nadie fuera de esta carpeta la importa, y el mapa del puente ya expone
 * `recurrente` y `plantilla_id` como columnas de verdad. Un export muerto que
 * promete trabajo hecho es peor que ningún export. La mitad que sí hace falta
 * —reconocer el prefijo al ESCRIBIR un gasto de una pantalla sin portar— la usa
 * `gastos.ts` aquí dentro. Si el puente llega a necesitarla al leer, se exporta
 * entonces, con quien la importe.
 */
