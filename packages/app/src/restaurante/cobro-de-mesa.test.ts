import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { cobrarOrden } from '../venta/cobrar.ts';
import { contextoFalso, crearBaseFalsa, type TablasFalsas } from './pruebas/base-falsa.ts';
import {
  ambitoDe,
  CUENTA,
  linea,
  ordenDeMesa,
  PREDETERMINADOS,
  sesionCajaAbierta,
} from './pruebas/sala.ts';

/**
 * BLOQUEANTE 1, primera mitad: la cuenta de una mesa se puede COBRAR.
 *
 * `restaurante.enviar_pedido` deja la orden en 'confirmada' y
 * `restaurante.solicitar_cuenta` en 'cuenta_solicitada'. Mientras `cobrarOrden`
 * exigía 'borrador', el cajero recibía «esa venta ya se cobró» sobre una cuenta
 * que nadie había cobrado; y como tampoco se podía editar ni liberar la mesa,
 * la mesa quedaba fuera de servicio.
 *
 * Esta prueba vive en el módulo de restaurante y no en el de venta porque es
 * SU caso el que se rompía: en mostrador el carrito nunca sale de 'borrador'.
 */

// El folio se toma con SQL crudo (`UPDATE folios … RETURNING`). Ésta es la
// respuesta de la primera venta de la sucursal.
const PRIMER_FOLIO = [{ siguiente: 1n }];

function caja(estadoOrden: string): TablasFalsas {
  return {
    ordenes: [ordenDeMesa(estadoOrden)],
    orden_lineas: [linea()],
    sesiones_caja: [sesionCajaAbierta()],
    // Sin almacén no hay consumo que planear: enviar a cocina no descuenta y
    // el descuento de stock tiene sus propias pruebas en el carril B.
    almacenes: [],
    configuracion: [],
  };
}

const baseDe = (estadoOrden: string) =>
  crearBaseFalsa(caja(estadoOrden), {
    predeterminados: PREDETERMINADOS,
    filasCrudas: PRIMER_FOLIO,
  });

const UN_PAGO = [{ metodo: 'efectivo' as const, montoCentavos: 10_000, recibidoCentavos: 10_000 }];

describe('cobrar una cuenta de mesa · los estados vivos, no sólo borrador', () => {
  for (const estado of ['confirmada', 'en_preparacion', 'lista', 'cuenta_solicitada']) {
    it(`cobra una orden en «${estado}»`, async () => {
      const base = baseDe(estado);
      const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

      const salida = await cobrarOrden.ejecutar(ctx, { ordenId: CUENTA, pagos: UN_PAGO });

      expect(salida.folio).toBe('1');
      expect(base.campo('ordenes', 'estado')).toBe('pagada');
      expect(base.campo('ordenes', 'folio')).toBe(1n);
      expect(base.campo('ordenes', 'total_centavos')).toBe(10_000n);
    });
  }

  it('la propina no infla el total ni la utilidad, y el cajón la registra aparte', async () => {
    // Regla 1 y regla 4 de `F1-01` §3, sobre el camino que antes ni siquiera
    // se podía recorrer: cobrar una cuenta que ya pasó por cocina.
    const base = baseDe('cuenta_solicitada');
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await cobrarOrden.ejecutar(ctx, {
      ordenId: CUENTA,
      pagos: [{ metodo: 'efectivo', montoCentavos: 10_000, propinaCentavos: 1_500 }],
      propinaPuntosBase: 1_500,
      propinaTipo: 'porcentaje',
    });

    expect(salida.totalCentavos).toBe('10000');
    expect(salida.propinaCentavos).toBe('1500');
    expect(base.campo('ordenes', 'total_centavos')).toBe(10_000n);

    expect(base.campo('pagos', 'monto_centavos')).toBe(10_000n);
    expect(base.campo('pagos', 'propina_centavos')).toBe(1_500n);

    // El cajón: la venta y la propina como movimientos SEPARADOS (regla 4).
    expect(base.campo('movimientos_caja', 'tipo', 0)).toBe('venta');
    expect(base.campo('movimientos_caja', 'monto_centavos', 0)).toBe(10_000n);
    expect(base.campo('movimientos_caja', 'tipo', 1)).toBe('propina');
    expect(base.campo('movimientos_caja', 'monto_centavos', 1)).toBe(1_500n);
  });

  it('lo ya cerrado sigue cerrado: pagada y cancelada se rechazan', async () => {
    // La guarda se abrió a los estados vivos, NO a todos. Sin esta prueba,
    // ampliar la lista de más pasaría inadvertido y se cobraría dos veces.
    for (const estado of ['pagada', 'cancelada', 'reembolsada']) {
      const base = baseDe(estado);
      const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

      const codigo = await cobrarOrden
        .ejecutar(ctx, { ordenId: CUENTA, pagos: UN_PAGO })
        .then(() => 'NO_LANZO')
        .catch((error: unknown) => (esErrorDominio(error) ? error.codigo : String(error)));

      expect(codigo, `«${estado}» tenía que rechazarse`).toBe('ORDEN_NO_EDITABLE');
      expect(base.filas('pagos')).toHaveLength(0);
    }
  });

  it('el `where` del cierre también admite los estados vivos', async () => {
    // La lista vive en el repositorio junto al `update` que la impone. Si
    // alguien la partiera en dos, la guarda dejaría pasar el cobro y
    // `marcarPagada` actualizaría cero filas: el cobro fallaría a mitad, con el
    // stock ya descontado y el folio ya tomado.
    const base = baseDe('confirmada');
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    await expect(
      cobrarOrden.ejecutar(ctx, { ordenId: CUENTA, pagos: UN_PAGO }),
    ).resolves.toBeDefined();
  });
});
