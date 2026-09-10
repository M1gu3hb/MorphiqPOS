import { z } from 'zod';

import { entradaCobrarOrden, entradaPago } from '../venta/esquemas.ts';
import { RANGOS_DE_LIQUIDACION } from './rango.ts';

/**
 * Las entradas de propinas.
 *
 * **Ninguna acepta un total.** Ni `total`, ni `total_liquidado`, ni el número de
 * ventas: el servidor los suma de `pagos.propina_centavos` dentro de la misma
 * transacción que marca las órdenes. Hoy `LiquidarPropinasDialog.jsx:103-104`
 * manda `total_liquidado` y `numero_ventas` calculados en el navegador sobre una
 * lista que puede llevar minutos abierta.
 *
 * Lo que sí entra es la propina POR MÉTODO en el cobro, y no es una excepción a
 * «el endpoint no acepta importes»: la propina no es un precio ni un total, es lo
 * que el comensal decidió dejar. El servidor no puede deducirla, igual que no
 * puede deducir cuánto billete puso en el mostrador (`recibidoCentavos`). Lo que
 * el servidor sí impone es que no toque la venta: `repartirPagos` sigue exigiendo
 * que los `montoCentavos` sumen EXACTAMENTE el total, propina aparte.
 */

const identificador = z.uuid();

/** Los seis valores del `check propina_tipo` de `045_restaurante.sql:33-35`. */
export const TIPOS_DE_PROPINA = [
  'sin_propina',
  'porcentaje',
  'monto_manual',
  'pendiente',
  'pendiente_cliente',
  'decidir_en_caja',
] as const;

/** Los cinco de `check propina_origen`, `045_restaurante.sql:36-37`. */
export const ORIGENES_DE_PROPINA = [
  'mesero',
  'caja',
  'tradicional',
  'portal_qr',
  'pendiente_portal_qr',
] as const;

/**
 * El porcentaje viaja en PUNTOS BASE enteros, como el resto del sistema.
 *
 * 15 % es 1500, no 0.15 ni 15. `ordenes.propina_puntos_base` tiene
 * `check between 0 and 10000`, y el puente traduce el 15 de su pantalla
 * (T-PORCENTAJE, F1-04 §0.2). Un porcentaje en punto flotante no existe exacto y
 * en una propina se nota: 0.16 es 0.16000000000000003.
 */
const puntosBase = z.number().int().min(0).max(10_000);

const centavosNoNegativos = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Un renglón de pago que además lleva su propina, exacta para ese método. */
export const entradaPagoConPropina = entradaPago.extend({
  propinaCentavos: centavosNoNegativos.optional(),
});

/**
 * El cobro, con la propina por método.
 *
 * Extiende la entrada de venta en vez de editarla: `venta/esquemas.ts` es de otro
 * módulo, y la propina es de éste. `totalEsperadoCentavos` sigue siendo la venta
 * SIN propina — si la pantalla mandara el total inflado, `exigirTotalVigente`
 * rechaza el cobro en vez de cobrar otro número en silencio.
 */
export const entradaCobrarOrdenConPropina = entradaCobrarOrden.extend({
  pagos: z.array(entradaPagoConPropina).min(1).max(5),
  propinaPuntosBase: puntosBase.optional(),
  propinaTipo: z.enum(TIPOS_DE_PROPINA).optional(),
  propinaOrigen: z.enum(ORIGENES_DE_PROPINA).optional(),
});

/**
 * Liquidar.
 *
 * `ordenIds` es opcional y es la lista que el diálogo enseñó. Cuando viene, se
 * liquidan exactamente esas y ninguna más: es lo que el administrador aprobó al
 * ver el total en pantalla. Cuando no viene, se liquida todo lo pendiente del
 * periodo. En los dos casos el importe lo suma el servidor.
 */
export const entradaLiquidarPropinas = z.object({
  rangoTipo: z.enum(RANGOS_DE_LIQUIDACION),
  desde: z.string().min(4).max(40),
  hasta: z.string().min(4).max(40),
  /** Nulo o ausente = liquidación global de varios meseros (F1-04 §30). */
  meseroId: identificador.nullish(),
  ordenIds: z.array(identificador).max(500).optional(),
  notas: z.string().trim().max(500).optional(),
});

/** Lo pendiente del periodo. Alimenta el diálogo y el panel de propinas. */
export const entradaPropinasPendientes = z.object({
  desde: z.string().min(4).max(40),
  hasta: z.string().min(4).max(40),
  meseroId: identificador.nullish(),
  /** Tope de ventas listadas. Los totales NO se topan: se agregan en la base. */
  limite: z.number().int().min(1).max(200).default(50),
});
