import { z } from 'zod';

/**
 * Las entradas de los comandos de compras y gastos.
 *
 * **Ninguna acepta el total.** El total de una compra es `Σ costo_total` de sus
 * líneas y lo suma el servidor; hoy lo manda la pantalla
 * (`RegistrarCompraDialog.jsx:229`) y por eso una compra puede quedar con el
 * total de cinco líneas y sólo tres guardadas (D-12).
 *
 * Lo que sí entra es el costo de cada línea y el monto del gasto: eso no lo
 * puede saber el servidor, está impreso en la factura. Entran **como texto**,
 * nunca como `number`: `Math.round(1234.995 * 100)` devuelve 123499 y se come
 * un centavo por línea.
 */

/** Importe en pesos. Hasta cuatro decimales; `desdeTexto` redondea a centavos. */
const importe = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,4})?$/, 'El importe se escribe con dígitos y hasta cuatro decimales.');

const importePositivo = importe.refine(esPositivo, 'El importe debe ser mayor que cero.');

/** Cantidad como `numeric(14,4)`: cadena decimal, nunca un flotante. */
const cantidadPositiva = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,4})?$/, 'La cantidad se escribe con hasta cuatro decimales.')
  .refine(esPositivo, 'La cantidad debe ser mayor que cero.');

const unidadDeCompra = z.string().trim().min(1).max(30);
const metodoPago = z.enum(['efectivo', 'tarjeta', 'transferencia']);
const categoriaGasto = z.enum([
  'limpieza',
  'transporte',
  'reparacion',
  'servicios',
  'pago_extraordinario',
  'marketing',
  'otro',
]);
const nota = z.string().trim().max(500);

/**
 * Una línea de compra.
 *
 * `equivalencia` es obligatoria: cuántas unidades base trae UNA unidad de
 * compra (F1-04 §23.1). Hoy se usa para calcular y no se guarda, así que «3
 * cajas» queda sin decir en ningún lado que una caja traía 12 kg, y seis meses
 * después la compra no se puede auditar.
 *
 * `insumoId` o `nuevo`, nunca los dos: el diálogo permite capturar un insumo
 * que no existe todavía, y resolverlo en el servidor es lo que sustituye al
 * anti-duplicado que hoy compara contra la lista completa descargada al
 * navegador (`utils/ingredienteMatcher.js:20`).
 */
export const lineaDeCompra = z
  .object({
    insumoId: z.uuid().optional(),
    nuevo: z
      .object({
        nombre: z.string().trim().min(2).max(160),
        unidadBase: z.enum(['g', 'ml', 'pieza', 'kg', 'l', 'm']),
        stockMinimo: cantidadPositiva.optional(),
        stockCritico: cantidadPositiva.optional(),
      })
      .optional(),
    cantidadCapturada: cantidadPositiva,
    unidadCapturada: unidadDeCompra,
    equivalencia: cantidadPositiva,
    costoTotal: importe,
    caducaEl: z.iso.date().optional(),
    notas: nota.optional(),
  })
  .refine(
    (linea) => (linea.insumoId === undefined) !== (linea.nuevo === undefined),
    'Cada línea apunta a un insumo que ya existe o declara uno nuevo, nunca a las dos cosas.',
  );

export type LineaDeCompra = z.infer<typeof lineaDeCompra>;

/** Datos de la cabecera que comparten `registrar` y `usar_plantilla`. */
const cabeceraDeCompra = {
  proveedorId: z.uuid().optional(),
  /** Sólo cuando la compra no apunta a un proveedor del catálogo. */
  proveedorNombre: z.string().trim().min(1).max(160).optional(),
  fecha: z.iso.date().optional(),
  metodoPago: metodoPago.optional(),
  facturaFolio: z.string().trim().max(60).optional(),
  notas: nota.optional(),
};

export const entradaRegistrarCompra = z.object({
  ...cabeceraDeCompra,
  /** Si la compra sale de una plantilla, sus contadores suben en esta misma transacción. */
  plantillaCompraId: z.uuid().optional(),
  lineas: z.array(lineaDeCompra).min(1).max(60),
});

export const entradaUsarPlantillaCompra = z.object({
  ...cabeceraDeCompra,
  plantillaId: z.uuid(),
});

/** Una línea de plantilla: sugerencia para precargar el formulario, no un asiento. */
export const lineaDePlantillaCompra = z.object({
  insumoId: z.uuid(),
  cantidad: cantidadPositiva,
  unidadCompra: unidadDeCompra,
  equivalencia: cantidadPositiva,
  costoTotal: importe,
});

export const entradaGuardarPlantillaCompra = z.object({
  /** Presente = edición. Ausente = alta. */
  plantillaId: z.uuid().optional(),
  nombre: z.string().trim().min(2).max(120),
  proveedorNombre: z.string().trim().max(160).optional(),
  notas: nota.optional(),
  activa: z.boolean().optional(),
  lineas: z.array(lineaDePlantillaCompra).min(1).max(60),
});

/**
 * Un gasto operativo.
 *
 * `esRecurrente` y `plantillaGastoId` son columnas, no texto dentro de las
 * notas. Hoy viajan como los prefijos «[RECURRENTE/FIJO MENSUAL]»
 * (`RegistrarGastoDialog.jsx:51-53`) y «[Desde plantilla: X]»
 * (`PlantillasGastoSection.jsx:97-106`), y se pierden en cuanto alguien edita
 * la nota (F1-04 §25.1).
 */
export const entradaRegistrarGasto = z.object({
  fecha: z.iso.date().optional(),
  categoria: categoriaGasto,
  descripcion: z.string().trim().min(2).max(200),
  monto: importePositivo,
  metodoPago,
  esRecurrente: z.boolean().optional(),
  plantillaGastoId: z.uuid().optional(),
  notas: nota.optional(),
});

export const entradaGuardarPlantillaGasto = z.object({
  plantillaId: z.uuid().optional(),
  nombre: z.string().trim().min(2).max(120),
  categoria: categoriaGasto,
  montoSugerido: importePositivo,
  metodoPago,
  periodicidad: z.enum(['mensual', 'semanal', 'quincenal', 'anual', 'unico']),
  diaPagoSugerido: z.number().int().min(1).max(31).optional(),
  notas: nota.optional(),
  activa: z.boolean().optional(),
});

/** Un decimal de cuatro cifras es positivo si sus dígitos, sin punto, no son cero. */
function esPositivo(texto: string): boolean {
  return BigInt(texto.replace('.', '')) > 0n;
}
