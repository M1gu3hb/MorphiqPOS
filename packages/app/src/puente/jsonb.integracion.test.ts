import { conTransaccion } from '@morphiqpos/data';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { escribir } from './escribir.ts';

/**
 * LOS ARREGLOS DEL PUENTE LLEGAN A SU COLUMNA `jsonb`, contra Postgres real (DP-5).
 *
 * Antes, `[0.25, 0.5, 1]` viajaba como arreglo nativo de Postgres y la base contestaba `22P02`:
 * los atajos de peso de la barbacoa y las líneas de una plantilla de compra no se guardaban.
 */
const ORG = '92000000-0000-4000-8000-000000000001';
const SUCURSAL = '92000000-0000-4000-8000-000000000002';
const BARBACOA = '92000000-0000-4000-8000-000000000003';
const AMBITO = { organizacionId: ORG, sucursalId: SUCURSAL, rol: 'dueno' };

beforeAll(async () => {
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('organizaciones')
      .values({
        id: ORG,
        nombre: 'Barbacoa de prueba',
        slug: 'jsonb-puente',
        paquete: 'restaurante',
        giro: 'restaurante',
      })
      .execute();
    await tx
      .insertInto('sucursales')
      .values({ id: SUCURSAL, organizacion_id: ORG, nombre: 'Centro' })
      .execute();
    await tx
      .insertInto('productos')
      .values({
        id: BARBACOA,
        organizacion_id: ORG,
        nombre: 'Barbacoa de horno',
        precio_venta_centavos: 79_500n,
        tipo_venta: 'variable_medida',
        unidad_venta: 'kg',
        unidad_variable: 'kg',
        precio_por_unidad_variable_centavos: 79_500n,
        estrategia_consumo: 'receta',
      })
      .execute();
  });
});

afterAll(async () => {
  await conTransaccion(async (tx) => {
    await tx.deleteFrom('plantillas_compra').where('organizacion_id', '=', ORG).execute();
    await tx.deleteFrom('productos').where('organizacion_id', '=', ORG).execute();
    await tx.deleteFrom('sucursales').where('organizacion_id', '=', ORG).execute();
    await tx.deleteFrom('organizaciones').where('id', '=', ORG).execute();
  });
});

describe('el puente escribe arreglos en columnas jsonb', () => {
  it('los atajos de peso de la barbacoa: ¼, ½ y 1 kg', async () => {
    const fila = await conTransaccion((tx) =>
      escribir(tx, AMBITO, {
        entidad: 'ProductoTerminado',
        operacion: 'update',
        id: BARBACOA,
        datos: { presets_variable_qr: [0.25, 0.5, 1] },
      }),
    );
    expect(fila['presets_variable_qr']).toEqual([0.25, 0.5, 1]);
  });

  it('las líneas de una plantilla de compra', async () => {
    const lineas = [{ insumo_nombre: 'Carnero', cantidad: 20, unidad: 'kg' }];
    const fila = await conTransaccion((tx) =>
      escribir(tx, AMBITO, {
        entidad: 'PlantillaCompra',
        operacion: 'create',
        datos: { nombre: 'Carnero del sábado', lineas },
      }),
    );
    expect(fila['lineas']).toEqual(lineas);
  });
});
