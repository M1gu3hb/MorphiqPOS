import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { asignarZona, guardarZona } from './zonas.ts';

/**
 * F-149 · Las zonas del anaquel (D-33 de la 2.4): sin ellas el conteo cíclico decía «Hoy no
 * toca ninguna zona» para siempre, y nada permitía crear una.
 */

const AHORA = new Date('2026-10-09T15:00:00.000Z');
const OTRA_ORG = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const ZONA = 'aa000000-0000-4000-8000-000000000001';
const LECHE = 'ab000000-0000-4000-8000-000000000001';
const PAN = 'ab000000-0000-4000-8000-000000000002';
const AJENO = 'ab000000-0000-4000-8000-000000000003';

function base(zonas: Record<string, unknown>[] = []) {
  return crearBaseFalsa({
    zonas_anaquel: zonas,
    insumos: [
      { id: LECHE, organizacion_id: ORG, nombre: 'Leche', zona_id: null },
      { id: PAN, organizacion_id: ORG, nombre: 'Bolillo', zona_id: null },
      { id: AJENO, organizacion_id: OTRA_ORG, nombre: 'Ajeno', zona_id: null },
    ],
  });
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('inventario.guardar_zona', () => {
  it('crea la zona en la sucursal de la sesión, con cada cuántos días toca', async () => {
    const b = base();
    const { ctx } = contextoFalso(b.tx, ambitoDe('almacen'), AHORA);

    const salida = await guardarZona.ejecutar(ctx, {
      nombre: 'Lácteos',
      diasEntreConteos: 7,
      orden: 2,
    });

    expect(b.filas('zonas_anaquel')).toHaveLength(1);
    expect(b.filas('zonas_anaquel')[0]).toMatchObject({
      id: salida.zonaId,
      organizacion_id: ORG,
      sucursal_id: SUCURSAL,
      nombre: 'Lácteos',
      dias_entre_conteos: 7,
      orden: 2,
    });
  });

  it('no repite un nombre, aunque cambien las mayúsculas', async () => {
    const b = base([{ id: ZONA, organizacion_id: ORG, sucursal_id: SUCURSAL, nombre: 'Lácteos' }]);
    const { ctx } = contextoFalso(b.tx, ambitoDe('almacen'), AHORA);

    expect(
      await codigoDe(() => guardarZona.ejecutar(ctx, { nombre: 'lácteos', diasEntreConteos: 7 })),
    ).toBe('CONFIGURACION_CONFLICTO');
    expect(b.filas('zonas_anaquel')).toHaveLength(1);
  });

  it('edita la suya, y la de otro negocio no existe', async () => {
    const b = base([
      {
        id: ZONA,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        nombre: 'Lácteos',
        dias_entre_conteos: 7,
      },
    ]);
    const { ctx } = contextoFalso(b.tx, ambitoDe('almacen'), AHORA);

    await guardarZona.ejecutar(ctx, { zonaId: ZONA, nombre: 'Lácteos', diasEntreConteos: 3 });
    expect(b.campo('zonas_anaquel', 'dias_entre_conteos')).toBe(3);

    const ajena = crearBaseFalsa({
      zonas_anaquel: [{ id: ZONA, organizacion_id: OTRA_ORG, nombre: 'Lácteos' }],
    });
    const { ctx: otro } = contextoFalso(ajena.tx, ambitoDe('almacen'), AHORA);
    expect(
      await codigoDe(() =>
        guardarZona.ejecutar(otro, { zonaId: ZONA, nombre: 'Otra', diasEntreConteos: 3 }),
      ),
    ).toBe('PUENTE_NO_ENCONTRADO');
  });

  it('la programa quien cuenta: almacén y encargados, no la caja ni la cocina', () => {
    expect(guardarZona.roles).toContain('almacen');
    expect(guardarZona.roles).not.toContain('cajero');
    expect(guardarZona.roles).not.toContain('cocina');
  });
});

describe('inventario.asignar_zona', () => {
  it('pone los productos en la zona, y con null los saca', async () => {
    const b = base([{ id: ZONA, organizacion_id: ORG, nombre: 'Lácteos', activa: true }]);
    const { ctx } = contextoFalso(b.tx, ambitoDe('almacen'), AHORA);

    const salida = await asignarZona.ejecutar(ctx, { zonaId: ZONA, insumoIds: [LECHE, PAN] });
    expect(salida.asignados).toBe(2);
    expect(b.filas('insumos').filter((i) => i['zona_id'] === ZONA)).toHaveLength(2);

    await asignarZona.ejecutar(ctx, { zonaId: null, insumoIds: [PAN] });
    expect(b.filas('insumos').find((i) => i['id'] === PAN)?.['zona_id']).toBe(null);
  });

  it('un producto de otro negocio no se mueve, ni los demás con él', async () => {
    const b = base([{ id: ZONA, organizacion_id: ORG, nombre: 'Lácteos', activa: true }]);
    const { ctx } = contextoFalso(b.tx, ambitoDe('almacen'), AHORA);

    expect(
      await codigoDe(() => asignarZona.ejecutar(ctx, { zonaId: ZONA, insumoIds: [LECHE, AJENO] })),
    ).toBe('PUENTE_NO_ENCONTRADO');
    expect(b.filas('insumos').find((i) => i['id'] === AJENO)?.['zona_id']).toBe(null);
  });

  it('una zona apagada no recibe productos', async () => {
    const b = base([{ id: ZONA, organizacion_id: ORG, nombre: 'Vieja', activa: false }]);
    const { ctx } = contextoFalso(b.tx, ambitoDe('almacen'), AHORA);

    expect(
      await codigoDe(() => asignarZona.ejecutar(ctx, { zonaId: ZONA, insumoIds: [LECHE] })),
    ).toBe('INVENTARIO_INVALIDO');
  });
});
