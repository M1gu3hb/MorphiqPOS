import { describe, expect, it } from 'vitest';

import {
  ajustarStock,
  crearAlmacen,
  crearInsumo,
  entradaAjustarStock,
  entradaInventarioInicial,
  inventarioInicial,
} from './inventario';
import { actualizarCostoInsumo, guardarReceta } from './recetas';
import { resetearDemo } from '../demostracion/resetear';

describe('B-11 · comandos de insumos y almacenes', () => {
  it('declara los cinco paquetes y nombres de comando estables', () => {
    expect(crearAlmacen.nombre).toBe('inventario.crear_almacen');
    expect(crearInsumo.paquetes).toHaveLength(5);
    expect(inventarioInicial.paquetes).toHaveLength(5);
    expect(ajustarStock.paquetes).toHaveLength(5);
  });

  it('exige inventario inicial positivo y ajuste distinto de cero', () => {
    expect(
      entradaInventarioInicial.safeParse({
        almacenId: crypto.randomUUID(),
        insumoId: crypto.randomUUID(),
        cantidad: '0',
      }).success,
    ).toBe(false);
    expect(
      entradaAjustarStock.safeParse({
        almacenId: crypto.randomUUID(),
        insumoId: crypto.randomUUID(),
        cantidad: '0',
        motivo: 'Conteo',
      }).success,
    ).toBe(false);
    expect(
      entradaAjustarStock.safeParse({
        almacenId: crypto.randomUUID(),
        insumoId: crypto.randomUUID(),
        cantidad: '-2.5',
        motivo: 'Conteo físico',
      }).success,
    ).toBe(true);
  });
});

describe('B-10 · reinicio de demostración', () => {
  it('exige confirmación literal y está disponible para cada paquete', () => {
    expect(resetearDemo.paquetes).toHaveLength(5);
    expect(resetearDemo.entrada.safeParse({ confirmacion: 'sí' }).success).toBe(false);
    expect(resetearDemo.entrada.safeParse({ confirmacion: 'RESETEAR' }).success).toBe(true);
  });
});

describe('B-12 · recetas por paquete', () => {
  it('limita recetas y cambios de costo a cafetería/restaurante', () => {
    expect(guardarReceta.paquetes).toEqual(['cafeteria', 'restaurante']);
    expect(actualizarCostoInsumo.paquetes).toEqual(['cafeteria', 'restaurante']);
  });

  it('valida cantidades exactas, unidad y merma en cada ingrediente', () => {
    const entrada = guardarReceta.entrada.safeParse({
      productoId: crypto.randomUUID(),
      ingredientes: [{ insumoId: crypto.randomUUID(), cantidad: '18', unidad: 'g', mermaBp: 250 }],
    });
    expect(entrada.success).toBe(true);
    expect(
      guardarReceta.entrada.safeParse({ productoId: crypto.randomUUID(), ingredientes: [] })
        .success,
    ).toBe(false);
  });
});
