import { conTransaccion } from '@morphiqpos/data';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { consultar } from './consultar.ts';

const ORG = '91000000-0000-4000-8000-000000000001';
const SUCURSAL = '91000000-0000-4000-8000-000000000002';
const PERSONA = '91000000-0000-4000-8000-000000000003';
const EMPLEO = '91000000-0000-4000-8000-000000000004';
const ORDEN = '91000000-0000-4000-8000-000000000005';

beforeAll(async () => {
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('organizaciones')
      .values({
        id: ORG,
        nombre: 'Restaurante de prueba',
        slug: 'propinas-puente',
        paquete: 'restaurante_pro',
        giro: 'restaurante',
      })
      .execute();
    await tx
      .insertInto('sucursales')
      .values({ id: SUCURSAL, organizacion_id: ORG, nombre: 'Centro' })
      .execute();
    await tx
      .insertInto('personas')
      .values({ id: PERSONA, organizacion_id: ORG, nombre: 'Elena Mesera' })
      .execute();
    await tx
      .insertInto('empleos')
      .values({
        id: EMPLEO,
        persona_id: PERSONA,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        rol: 'mesero',
      })
      .execute();
    await tx
      .insertInto('ordenes')
      .values({
        id: ORDEN,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        folio: 1n,
        estado: 'pagada',
        empleado_atiende_id: EMPLEO,
        subtotal_centavos: 43_900n,
        total_centavos: 43_900n,
        costo_total_centavos: 0n,
        utilidad_centavos: 43_900n,
        margen_bp: 10_000,
        propina_puntos_base: 1_000,
        propina_tipo: 'porcentaje',
        cerrada_en: new Date(),
      })
      .execute();
    await tx
      .insertInto('pagos')
      .values([
        {
          orden_id: ORDEN,
          organizacion_id: ORG,
          metodo: 'efectivo',
          monto_centavos: 28_000n,
          propina_centavos: 2_000n,
          recibido_centavos: 30_000n,
          cambio_centavos: 0n,
        },
        {
          orden_id: ORDEN,
          organizacion_id: ORG,
          metodo: 'tarjeta',
          monto_centavos: 15_900n,
          propina_centavos: 2_390n,
          cambio_centavos: 0n,
        },
      ])
      .execute();
  });
});

afterAll(async () => {
  await conTransaccion(async (tx) => {
    await tx.deleteFrom('pagos').where('organizacion_id', '=', ORG).execute();
    await tx.deleteFrom('ordenes').where('organizacion_id', '=', ORG).execute();
    await tx.deleteFrom('empleos').where('organizacion_id', '=', ORG).execute();
    await tx.deleteFrom('personas').where('organizacion_id', '=', ORG).execute();
    await tx.deleteFrom('sucursales').where('organizacion_id', '=', ORG).execute();
    await tx.deleteFrom('organizaciones').where('id', '=', ORG).execute();
  });
});

describe('Venta · propinas derivadas contra Postgres', () => {
  it('devuelve total, desglose exacto por método y mesero desde los pagos confirmados', async () => {
    const [venta] = await consultar(
      { organizacionId: ORG, rol: 'dueno' },
      { entidad: 'Venta', operacion: 'get', id: ORDEN },
    );

    expect(venta).toMatchObject({
      id: ORDEN,
      propina_monto: 43.9,
      propina_efectivo: 20,
      propina_tarjeta: 23.9,
      propina_transferencia: 0,
      total_cobrado_con_propina: 482.9,
      metodo_pago: 'mixto',
      monto_efectivo: 300,
      monto_tarjeta: 182.9,
      monto_transferencia: 0,
      cambio: 0,
      propina_liquidada: false,
      usuario_mesero_nombre: 'Elena Mesera',
    });
  });
});
