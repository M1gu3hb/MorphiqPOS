import 'server-only';

import { ErrorDominio, PAQUETES_PREPARACION } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { aplicarPorcentaje, centavos } from '@morphiqpos/domain/dinero';
import type { TotalesOrden } from '@morphiqpos/domain/venta';

import { definirComando } from '../definicion.ts';
import { cotizar, type LineaCotizada } from '../venta/cotizar.ts';
import { mesaOperable, ordenDeMesa } from './datos.ts';
import { entradaSolicitarCuenta } from './esquemas.ts';

/**
 * `restaurante.solicitar_cuenta` — E6-8.
 *
 * Pasa la orden a `cuenta_solicitada`, la mesa al estado que le toca por la
 * tabla de F1-04 §8.2, y devuelve la precuenta **calculada en el servidor**
 * sobre las líneas persistidas.
 *
 * Hoy la precuenta la suma el navegador con `sumarSubtotalDetalles`, sobre un
 * arreglo que puede incluir los «detalles shadow» del defecto D-05, y
 * `ventaTotales.js` tiene un rescate para cuando esa suma da cero. Aquí el
 * total sale de `cotizar`, que es el mismo código que usa el cobro: la
 * precuenta y el ticket no pueden discrepar porque los calcula la misma
 * función.
 */

const ROLES_DE_SALA = ['mesero', 'cajero', 'gerente', 'administrador', 'dueno'] as const;

/** Una cuenta ya cobrada o cancelada no vuelve a pedirse (F1-04 §6.6). */
const ORDEN_CERRADA = ['pagada', 'cancelada'] as const;

/** Estados de mesa en los que pedir la cuenta no significa nada. */
const MESA_SIN_COMENSALES = ['libre', 'limpieza', 'pagada', 'cancelada'] as const;

export interface Precuenta {
  readonly ordenId: string;
  /** El código que el comensal lleva impreso a la caja (F1-04 §6.3). */
  readonly codigoCaja: string;
  readonly mesaNumero: number | null;
  readonly lineas: readonly LineaCotizada[];
  readonly subtotalCentavos: string;
  readonly descuentoCentavos: string;
  readonly impuestosCentavos: string;
  readonly totalCentavos: string;
  /**
   * Lo que la propina elegida SUMARÍA. No se guarda en `ordenes` ni entra en el
   * total: la propina se registra al cobrar, en `pagos`, y `Venta.total` es la
   * venta sin propina (regla 1 de `F1-01` §3).
   */
  readonly propinaSugeridaCentavos: string;
  readonly estadoMesa: string | null;
}

export const solicitarCuenta = definirComando<
  Transaccion,
  typeof entradaSolicitarCuenta,
  Precuenta
>({
  nombre: 'restaurante.solicitar_cuenta',
  entidad: 'orden',
  escribe: true,
  roles: [...ROLES_DE_SALA],
  paquetes: PAQUETES_PREPARACION,
  entrada: entradaSolicitarCuenta,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const orden = await ctx.paso('cargar_orden', () =>
      ordenDeMesa(ctx.tx, organizacionId, entrada.ordenId),
    );
    if ((ORDEN_CERRADA as readonly string[]).includes(orden.estado)) {
      throw new ErrorDominio('ORDEN_NO_EDITABLE', 'Esa cuenta ya se cerró en caja.', {
        estado: orden.estado,
      });
    }

    const { totales, cotizacion } = await ctx.paso('cotizar', () =>
      cotizar(ctx.tx, organizacionId, entrada.ordenId),
    );
    if (cotizacion.lineas.length === 0) {
      throw new ErrorDominio(
        'ORDEN_VACIA',
        'Esa mesa todavía no ha consumido nada; no hay cuenta que pedir.',
      );
    }

    const mesa =
      orden.mesaId === null ? null : await mesaOperable(ctx.tx, organizacionId, orden.mesaId);

    const codigoCaja = await ctx.paso('marcar_cuenta_solicitada', () =>
      marcarCuentaSolicitada(ctx.tx, {
        organizacionId,
        ordenId: entrada.ordenId,
        mesaNumero: mesa?.numero ?? 0,
        codigoPrevio: orden.codigoCaja,
        estrategiaCaptura: orden.estrategiaCaptura,
        totales,
        propinaPuntosBase: entrada.propinaPuntosBase,
        propinaTipo: entrada.propinaTipo,
      }),
    );

    const estadoMesa =
      mesa === null
        ? null
        : await ctx.paso('avanzar_mesa', () =>
            pedirCuentaEnMesa(ctx.tx, organizacionId, mesa.id, mesa.estado),
          );

    ctx.auditar({
      entidadId: entrada.ordenId,
      payload: {
        codigoCaja,
        totalCentavos: totales.totalCentavos.toString(),
        lineas: cotizacion.lineas.length,
        estadoMesa,
      },
    });

    return {
      ordenId: entrada.ordenId,
      codigoCaja,
      mesaNumero: mesa?.numero ?? null,
      lineas: cotizacion.lineas,
      subtotalCentavos: cotizacion.subtotalCentavos,
      descuentoCentavos: cotizacion.descuentoCentavos,
      impuestosCentavos: cotizacion.impuestosCentavos,
      totalCentavos: cotizacion.totalCentavos,
      propinaSugeridaCentavos: aplicarPorcentaje(
        centavos(totales.totalCentavos),
        entrada.propinaPuntosBase ?? 0,
      ).toString(),
      estadoMesa,
    };
  },
});

interface DatosDeCuenta {
  readonly organizacionId: string;
  readonly ordenId: string;
  readonly mesaNumero: number;
  /** El que ya se imprimió, si la cuenta se pidió antes. */
  readonly codigoPrevio: string | null;
  readonly estrategiaCaptura: string;
  readonly totales: TotalesOrden;
  readonly propinaPuntosBase: number | undefined;
  readonly propinaTipo: string | undefined;
}

async function marcarCuentaSolicitada(tx: Transaccion, datos: DatosDeCuenta): Promise<string> {
  // Si la cuenta ya se pidió una vez, el comensal tiene un papel en la mano con
  // ESE código. Regenerarlo dejaría al cajero buscando un número que ya no está.
  const codigo = datos.codigoPrevio ?? generarCodigoCaja(datos.mesaNumero);

  const fila = await tx
    .updateTable('ordenes')
    .set({
      estado: 'cuenta_solicitada',
      // Los totales se congelan con lo que el servidor acaba de calcular, para
      // que Caja lea el mismo número que se imprimió en la precuenta.
      subtotal_centavos: datos.totales.subtotalCentavos,
      descuento_centavos: datos.totales.descuentoCentavos,
      impuestos_centavos: datos.totales.impuestosCentavos,
      total_centavos: datos.totales.totalCentavos,
      costo_total_centavos: datos.totales.costoTotalCentavos,
      utilidad_centavos: datos.totales.utilidadCentavos,
      margen_bp: datos.totales.margenBp,
      // Se genera aquí y no se acepta del cliente: es lo que identifica la
      // cuenta en caja, y dejar que lo elija quien llama permitiría apuntar a
      // la cuenta de otra mesa.
      codigo_caja: codigo,
      ...(datos.propinaTipo === undefined
        ? {}
        : {
            propina_tipo: datos.propinaTipo,
            propina_puntos_base: datos.propinaPuntosBase ?? 0,
            propina_origen: origenDePropina(datos.estrategiaCaptura),
          }),
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.ordenId)
    .where('estado', 'not in', [...ORDEN_CERRADA])
    .returning('codigo_caja')
    .executeTakeFirst();

  if (fila?.codigo_caja == null) {
    throw new ErrorDominio(
      'ORDEN_NO_EDITABLE',
      'Esa cuenta cambió mientras se pedía. Revísala en caja antes de reintentar.',
    );
  }
  return fila.codigo_caja;
}

async function pedirCuentaEnMesa(
  tx: Transaccion,
  organizacionId: string,
  mesaId: string,
  estadoMesa: string,
): Promise<string | null> {
  // «cualquiera → cuenta_solicitada» (F1-04 §8.2), salvo los estados en los que
  // no hay nadie sentado: ahí pedir la cuenta no describe ningún hecho.
  if ((MESA_SIN_COMENSALES as readonly string[]).includes(estadoMesa)) return null;

  await tx
    .updateTable('mesas')
    .set({ estado: 'cuenta_solicitada' })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', mesaId)
    .execute();

  return 'cuenta_solicitada';
}

/**
 * `M05-4821`: el formato de `Mesero.jsx:59-60`, generado en el SERVIDOR.
 *
 * Los cuatro dígitos salen de `crypto.getRandomValues` y no de `Math.random`.
 * No es un identificador —lo es `ordenes.id`— sino un código corto que el
 * cajero teclea para encontrar la cuenta, y por eso conserva la forma que
 * Miguel ya imprime en la precuenta.
 */
function generarCodigoCaja(mesaNumero: number): string {
  const azar = crypto.getRandomValues(new Uint16Array(1))[0] ?? 0;
  const sufijo = 1000 + (azar % 9000);
  return `M${String(mesaNumero).padStart(2, '0')}-${sufijo}`;
}

/** `estrategia_captura` → `ordenes.propina_origen` (`check` de la migración 045). */
function origenDePropina(estrategiaCaptura: string): string {
  if (estrategiaCaptura === 'qr') return 'portal_qr';
  if (estrategiaCaptura === 'mesa') return 'mesero';
  return 'caja';
}
