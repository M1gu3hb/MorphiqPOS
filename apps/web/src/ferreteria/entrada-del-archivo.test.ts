import { describe, expect, it } from 'vitest';

import {
  compararContraPedido,
  importeDe,
  pesosDe,
  repartirLaNota,
  type RenglonImportado,
} from './entrada-del-archivo.ts';

const renglon = (cambios: Partial<RenglonImportado>): RenglonImportado => ({
  indice: 0,
  descripcion: 'TORNILLO 1/4 X 2',
  cantidad: '3',
  costoUnitarioCentavos: '10000',
  productoId: 'p-tornillo',
  productoNombre: 'Tornillo 1/4 x 2 galvanizado',
  insumoId: 'i-tornillo',
  unidadCompra: 'caja',
  equivalencia: '100.0000',
  porQue: 'codigo',
  dudoso: false,
  variacionCostoBp: 0,
  costoAnteriorCentavos: '100',
  costoNuevoCentavos: '100',
  precioVentaCentavos: '180',
  precioSugeridoCentavos: null,
  ...cambios,
});

describe('la nota importada, repartida', () => {
  it('lo que casó entra como partida, en su presentación y con el renglón completo', () => {
    const { partidas, porResolver, subidas } = repartirLaNota({ renglones: [renglon({})] }, [
      'TOR-14',
    ]);
    expect(partidas).toEqual([
      {
        clave: 'renglon-0',
        insumoId: 'i-tornillo',
        nombre: 'Tornillo 1/4 x 2 galvanizado',
        cantidad: '3',
        unidad: 'caja',
        equivalencia: '100.0000',
        costoTotal: '300.00',
        porNombre: false,
        delProveedor: null,
        claveProveedor: 'TOR-14',
      },
    ]);
    expect(porResolver).toEqual([]);
    expect(subidas).toEqual([]);
  });

  it('lo que casó POR NOMBRE lleva lo que decía la hoja, para revisarlo', () => {
    const { partidas } = repartirLaNota(
      { renglones: [renglon({ porQue: 'nombre', dudoso: true })] },
      [null],
    );
    expect(partidas[0]).toMatchObject({ porNombre: true, delProveedor: 'TORNILLO 1/4 X 2' });
  });

  it('lo que no casó queda por resolver, con la clave de la hoja', () => {
    const { partidas, porResolver } = repartirLaNota(
      {
        renglones: [
          renglon({ indice: 0, productoId: null, insumoId: null, porQue: 'ninguno' }),
          renglon({ indice: 1, productoId: null, insumoId: null, porQue: 'ninguno' }),
        ],
      },
      ['CODO-90', null],
    );
    expect(partidas).toEqual([]);
    expect(porResolver.map((l) => [l.id, l.codigoProveedor, l.cantidad])).toEqual([
      ['renglon-0', 'CODO-90', '3'],
      ['renglon-1', 'R2', '3'],
    ]);
  });

  it('una subida de costo trae el precio que conserva el margen, una vez por material', () => {
    const subio = renglon({
      variacionCostoBp: 20_000,
      costoNuevoCentavos: '300',
      precioSugeridoCentavos: '540',
    });
    const { subidas } = repartirLaNota({ renglones: [subio, { ...subio, indice: 1 }] }, [
      null,
      null,
    ]);
    expect(subidas).toEqual([
      {
        id: 'p-tornillo',
        material: 'Tornillo 1/4 x 2 galvanizado',
        costoAnteriorCentavos: 100,
        costoNuevoCentavos: 300,
        precioHoyCentavos: 180,
        precioSugeridoCentavos: 540,
      },
    ]);
  });

  it('el importe va al centavo, sin flotantes', () => {
    expect(importeDe(1_000, '12.5')).toBe(12_500);
    expect(importeDe(333, '1.0015')).toBe(333);
    expect(importeDe(250, '0.002')).toBe(1);
    expect(pesosDe(12_345)).toBe('123.45');
    expect(pesosDe(5)).toBe('0.05');
  });
});

describe('lo pedido contra lo que llegó', () => {
  const pedido = [
    { id: 'i-cable', material: 'Cable THW 12', sugerido: '4 rollos', presentaciones: 4 },
    { id: 'i-codo', material: 'Codo PVC 1/2', sugerido: '2 bolsas', presentaciones: 2 },
    { id: 'i-lija', material: 'Lija 120', sugerido: '1 paquete', presentaciones: 1 },
    { id: 'i-nada', material: 'Taquete', sugerido: '0 cajas', presentaciones: 0 },
  ];

  it('lo que no llegó va primero, y lo que llegó sin pedirse al final', () => {
    const llego = [
      { insumoId: 'i-cable', nombre: 'Cable THW 12', cantidad: '3' },
      { insumoId: 'i-lija', nombre: 'Lija 120', cantidad: '1' },
      { insumoId: 'i-broca', nombre: 'Broca 3/8', cantidad: '5' },
    ];
    expect(
      compararContraPedido(pedido, llego).map((r) => [
        r.material,
        r.estado,
        r.pedidoPresentaciones,
        r.llegoPresentaciones,
      ]),
    ).toEqual([
      ['Codo PVC 1/2', 'no_llego', 2, 0],
      ['Cable THW 12', 'falta', 4, 3],
      ['Lija 120', 'completo', 1, 1],
      ['Broca 3/8', 'no_se_pidio', 0, 5],
    ]);
  });

  it('dos renglones del mismo material se suman', () => {
    const llego = [
      { insumoId: 'i-codo', nombre: 'Codo PVC 1/2', cantidad: '1' },
      { insumoId: 'i-codo', nombre: 'Codo PVC 1/2', cantidad: '2' },
    ];
    const codo = compararContraPedido(pedido, llego).find((r) => r.insumoId === 'i-codo');
    expect(codo).toMatchObject({ llegoPresentaciones: 3, estado: 'sobra' });
  });
});
