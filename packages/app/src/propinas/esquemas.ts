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

/**
 * Tope absoluto de una propina, por renglón de pago: cien mil pesos.
 *
 * ── El defecto que cierra ──────────────────────────────────────────────────
 * `propinaCentavos` era el único importe del cobro sin cota: `montoCentavos`
 * queda atado porque `repartirPagos` exige que los montos sumen EXACTAMENTE el
 * total (`venta/pagos.ts`), pero la propina no se contrasta con nada. Con
 * `.max(Number.MAX_SAFE_INTEGER)` un cajero podía cobrar la venta correcta y
 * colar `propinaCentavos: 9007199254740991`: el cobro se confirma, entra una
 * fila de `pagos` con esa cifra y —por el movimiento `tipo='propina'` de
 * `venta/cobrar.ts`— un `movimientos_caja` que hace que `arqueoDeSesion` pida
 * noventa billones de pesos en el cajón. El corte de ese turno queda inservible
 * y la cifra se arrastra a `liquidaciones_propina.total_centavos`.
 *
 * Cien mil pesos no es una cifra bonita: es lo bastante alta para que ninguna
 * propina real la roce y lo bastante baja para que, si alguien se equivoca de
 * dos ceros, el error quepa en un arqueo y se pueda corregir el mismo día.
 */
export const MAXIMO_PROPINA_CENTAVOS = 10_000_000;

/**
 * Cuántas veces el renglón de venta puede caber en su propina, y su piso.
 *
 * El tope absoluto solo no basta: en una cuenta de $80 una propina de $99 999
 * sigue siendo absurda y sigue pasando. Pero la propina SÍ puede superar a la
 * cuenta —dejar $50 sobre un café de $20 es normal—, así que la cota es
 * relativa y generosa: diez veces el renglón, con un piso de mil pesos para que
 * una cuenta pequeña no impida una propina grande de verdad.
 */
export const FACTOR_PROPINA_SOBRE_VENTA = 10;
export const PISO_PROPINA_CENTAVOS = 100_000;

const centavosNoNegativos = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Un renglón de pago que además lleva su propina, exacta para ese método. */
export const entradaPagoConPropina = entradaPago
  .extend({
    propinaCentavos: centavosNoNegativos.max(MAXIMO_PROPINA_CENTAVOS).optional(),
  })
  .superRefine((pago, ctx) => {
    const propina = pago.propinaCentavos ?? 0;
    const tope = Math.max(pago.montoCentavos * FACTOR_PROPINA_SOBRE_VENTA, PISO_PROPINA_CENTAVOS);
    if (propina <= tope) return;
    ctx.addIssue({
      code: 'custom',
      path: ['propinaCentavos'],
      message:
        `La propina de este pago es desproporcionada respecto a lo que se cobra por ` +
        `${pago.metodo}. Revisa el importe antes de cobrar.`,
    });
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
 *
 * ── Por qué `.min(1)` ──────────────────────────────────────────────────────
 * Sin él, `[]` validaba y el comando lo colapsaba en «sin filtro de ids», o sea
 * liquidaba el periodo ENTERO. La administradora que desmarca todas las casillas
 * para revisar antes de liquidar, o un cliente viejo que manda `ordenIds: []`,
 * marcaba las tres mil órdenes del mes con un total que nadie aprobó y que no
 * hay comando para revertir. Una lista vacía es una petición vacía: se rechaza
 * con ENTRADA_INVALIDA. «Todo el periodo» se pide omitiendo el campo, que es una
 * decisión explícita y distinta.
 */
export const entradaLiquidarPropinas = z.object({
  rangoTipo: z.enum(RANGOS_DE_LIQUIDACION),
  desde: z.string().min(4).max(40),
  hasta: z.string().min(4).max(40),
  /** Nulo o ausente = liquidación global de varios meseros (F1-04 §30). */
  meseroId: identificador.nullish(),
  ordenIds: z.array(identificador).min(1).max(500).optional(),
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
