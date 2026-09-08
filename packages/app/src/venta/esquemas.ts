import { z } from 'zod';

/**
 * Las entradas de los comandos de venta.
 *
 * **Ninguna acepta un importe.** Es P0-07 y la regla que Miguel puso primero en
 * la lista: «El endpoint no acepta importes del cliente.» Se reciben producto,
 * cantidad y unidad; el precio lo pone el catálogo y el total lo deriva el
 * dominio.
 *
 * Lo único que se parece a dinero y sí entra es `recibidoCentavos` en el cobro
 * —cuánto billete puso el cliente en el mostrador—, y ni siquiera decide el
 * total: sólo sirve para calcular el cambio, y el servidor comprueba que alcance.
 */

/** Cantidad como cadena decimal: `numeric(14,4)` en la base, nunca un float. */
const cantidadDecimal = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,4})?$/, 'La cantidad debe ser un decimal de hasta cuatro cifras.')
  .refine((v) => Number.parseFloat(v) > 0, 'La cantidad debe ser mayor que cero.');

const centavosNoNegativos = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const entradaCrearOrden = z.object({});

export const entradaAgregarLinea = z.object({
  ordenId: z.uuid(),
  productoId: z.uuid(),
  cantidad: cantidadDecimal,
  /** Para productos por medida o por porción. El catálogo decide si aplica. */
  unidad: z.string().min(1).max(10).optional(),
});

export const entradaQuitarLinea = z.object({
  ordenId: z.uuid(),
  lineaId: z.uuid(),
});

export const entradaCambiarCantidad = z.object({
  ordenId: z.uuid(),
  lineaId: z.uuid(),
  cantidad: cantidadDecimal,
});

export const entradaCotizarOrden = z.object({
  ordenId: z.uuid(),
});

/** Un renglón de pago. Un pago mixto son varios (corrige P1-11). */
export const entradaPago = z.object({
  metodo: z.enum(['efectivo', 'tarjeta', 'transferencia']),
  montoCentavos: centavosNoNegativos,
  /** Sólo en efectivo: cuánto puso el cliente. Sirve para el cambio. */
  recibidoCentavos: centavosNoNegativos.optional(),
  referencia: z.string().max(60).optional(),
});

export const entradaCobrarOrden = z.object({
  ordenId: z.uuid(),
  pagos: z.array(entradaPago).min(1).max(5),
  /**
   * Lo que la pantalla creía que era el total, en centavos.
   *
   * NO se usa para cobrar. El servidor recalcula y, si no coincide, rechaza con
   * el total correcto en vez de cobrar el suyo en silencio: el cajero ya le dijo
   * un número al cliente, y cobrar otro distinto sin avisar es peor que fallar.
   */
  totalEsperadoCentavos: centavosNoNegativos.optional(),
});

export const entradaAbrirCaja = z.object({
  fondoInicialCentavos: centavosNoNegativos,
});

export const entradaMovimientoCaja = z.object({
  tipo: z.enum(['gasto', 'retiro', 'deposito', 'ajuste']),
  montoCentavos: z.number().int().max(Number.MAX_SAFE_INTEGER),
  motivo: z.string().min(3).max(200),
});

export const entradaCerrarCaja = z.object({
  efectivoContadoCentavos: centavosNoNegativos,
  notas: z.string().max(500).optional(),
});

/** La cotización acepta la orden explícita o, sin ella, el borrador vivo. */
export const entradaEstadoVenta = z.object({
  ordenId: z.uuid().optional(),
});

export const entradaBuscarCatalogo = z.object({
  busqueda: z.string().max(60).optional(),
  limite: z.number().int().min(1).max(100).default(40),
});

export const entradaTicket = z.object({
  ordenId: z.uuid(),
});
