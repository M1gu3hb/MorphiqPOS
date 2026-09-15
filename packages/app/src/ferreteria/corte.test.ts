import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { cortarMaterial } from './corte.ts';

/**
 * F-145 y F-150 · El corte de material, con sus dos movimientos.
 *
 * Se cortan 60 m y salen 60.4 porque la segueta se lleva lo suyo. Si la merma
 * se pudiera registrar por separado, no se registraría nunca —son 40 cm y hay
 * fila—, y a fin de mes son decenas de metros que el sistema cree que están.
 */

const CABLE = 'p1111111-1111-4111-8111-111111111111';
const MARTILLO = 'p2222222-2222-4222-8222-222222222222';
const ALMACEN = 'a1111111-1111-4111-8111-111111111111';
const LINEA = 'l1111111-1111-4111-8111-111111111111';
const ROLLO = 'r1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-15T19:00:00.000Z');

const pieza = (id: string, restante: bigint, estado = 'abierta') => ({
  id,
  organizacion_id: ORG,
  producto_id: CABLE,
  almacen_id: ALMACEN,
  folio: `R-${id.slice(0, 3)}`,
  medida_restante_base: restante,
  estado,
});

function ferreteria(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    productos: [
      {
        id: CABLE,
        organizacion_id: ORG,
        nombre: 'Cable THW cal. 12',
        unidad_venta: 'metro',
        es_continuo: true,
        umbral_retazo_base: 2_000n,
      },
      {
        id: MARTILLO,
        organizacion_id: ORG,
        nombre: 'Martillo de uña',
        unidad_venta: 'pieza',
        es_continuo: false,
        umbral_retazo_base: 0n,
      },
    ],
    // 100 m de cable, en milímetros.
    piezas_abiertas: [pieza(ROLLO, 100_000n)],
    existencias: [
      { organizacion_id: ORG, almacen_id: ALMACEN, insumo_id: CABLE, cantidad: '437000' },
    ],
    movimientos_stock: [],
    cortes_material: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}, crudas?: readonly Record<string, unknown>[]) =>
  crearBaseFalsa(ferreteria(extra), {
    filasCrudas: crudas ?? [{ cantidad: '376600' }],
    predeterminados: {
      movimientos_stock: {
        costo_unitario_centavos: 0n,
        referencia_tipo: null,
        referencia_id: null,
        empleado_id: null,
        motivo: null,
        idempotency_key: null,
        sesion_caja_id: null,
      },
      cortes_material: {
        pieza_abierta_id: null,
        movimiento_merma_id: null,
        pieza_resultante_id: null,
        empleado_id: null,
      },
      piezas_abiertas: {
        estado: 'abierta',
        precio_remate_centavos: null,
        ubicacion_id: null,
        cerrada_en: null,
        movimiento_cierre_id: null,
      },
    },
  });

const corte = (extra: Record<string, unknown> = {}) => ({
  ordenLineaId: LINEA,
  productoId: CABLE,
  almacenId: ALMACEN,
  medidaSolicitadaBase: 60_000,
  mermaBase: 400,
  ...extra,
});

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('inventario.cortar_material', () => {
  it('DOS MOVIMIENTOS, EN LA MISMA TRANSACCIÓN', async () => {
    // La venta de 60 m y la merma de 40 cm van juntas o no van. Con un solo
    // movimiento sumado, la sección de merma de corte del corte diario no se
    // puede construir, y ése es el dato que dice si alguien corta mal o alguien
    // se está llevando material.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cortarMaterial.ejecutar(ctx, corte());

    const movimientos = base.filas('movimientos_stock');
    expect(movimientos).toHaveLength(2);
    expect(movimientos[0]?.['tipo']).toBe('salida_venta');
    expect(movimientos[0]?.['cantidad']).toBe('-60000');
    expect(movimientos[1]?.['tipo']).toBe('merma');
    expect(movimientos[1]?.['cantidad']).toBe('-400');
    expect(movimientos[1]?.['motivo']).toBe('corte');
    expect(salida.consumidoBase).toBe('60400');
    // Y lo que se le pidió al almacén es ESO, no sólo lo vendido. La resta se
    // hace con SQL crudo, que la base falsa no mira: el valor devuelto por la
    // propia resta es lo único que ata el cálculo con el descuento.
    expect(salida.descontadoBase).toBe('60400');
  });

  it('LA MERMA EN CERO NO DEJA MOVIMIENTO VACÍO', async () => {
    // Hay material que no se destruye al cortar. Un movimiento de cero es un
    // renglón en el kardex que no dice nada, y la base además lo rechaza.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cortarMaterial.ejecutar(ctx, corte({ mermaBase: 0 }));

    expect(base.filas('movimientos_stock')).toHaveLength(1);
    expect(base.campo('cortes_material', 'movimiento_merma_id')).toBeNull();
  });

  it('LA PIEZA QUEDA CON LO QUE LE SOBRA', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cortarMaterial.ejecutar(ctx, corte());

    expect(salida.sobranteBase).toBe('39600');
    expect(base.campo('piezas_abiertas', 'medida_restante_base')).toBe(39_600n);
    expect(base.campo('piezas_abiertas', 'estado')).toBe('abierta');
  });

  it('LA PIEZA QUE CRUZA EL UMBRAL PASA A RETAZO SOLA', async () => {
    // Esperar a que alguien la marque es esperar a que nadie la marque, y
    // entonces el sobrante se sigue ofreciendo a precio de lista y se queda en
    // el anaquel para siempre.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cortarMaterial.ejecutar(
      ctx,
      corte({ medidaSolicitadaBase: 98_500, mermaBase: 0 }),
    );

    expect(salida.destino).toBe('retazo');
    expect(base.campo('piezas_abiertas', 'estado')).toBe('retazo');
  });

  it('LA PIEZA QUE SE ACABA SE CIERRA', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cortarMaterial.ejecutar(
      ctx,
      corte({ medidaSolicitadaBase: 99_600, mermaBase: 400 }),
    );

    expect(salida.destino).toBe('agotada');
    expect(base.campo('piezas_abiertas', 'estado')).toBe('cerrada');
    expect(base.campo('piezas_abiertas', 'cerrada_en')).toEqual(AHORA);
    expect(salida.piezaResultanteId).toBeNull();
  });

  it('SIN PIEZA ABIERTA SE ABRE UNA, con su folio', async () => {
    // El mostradorista ya le pone una cinta con el sobrante escrito a mano; el
    // sistema sólo le da folio y memoria.
    const base = baseDe({ piezas_abiertas: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cortarMaterial.ejecutar(
      ctx,
      corte({ medidaPiezaNuevaBase: 100_000, folioResultante: 'R-200' }),
    );

    // Se abrió un rollo de 100 m: quedan 39.6 con identidad y con etiqueta.
    expect(salida.piezaResultanteId).not.toBeNull();
    expect(salida.sobranteBase).toBe('39600');
    expect(base.campo('piezas_abiertas', 'folio')).toBe('R-200');
    expect(base.campo('piezas_abiertas', 'medida_restante_base')).toBe(39_600n);
  });

  it('SIN FOLIO NO SE ABRE UNA PIEZA QUE NADIE VA A ENCONTRAR', async () => {
    // Una pieza sin etiqueta es una pieza que no se encuentra en el anaquel, y
    // entonces la tabla miente sobre lo que hay.
    const base = baseDe({ piezas_abiertas: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() => cortarMaterial.ejecutar(ctx, corte({ medidaPiezaNuevaBase: 100_000 }))),
    ).toBe('CONFIGURACION_INVALIDA');
  });

  it('SIN DECIR CUÁNTO TRAE EL ROLLO tampoco se abre', async () => {
    // El sistema no sabe si el rollo viene de 100 m o de 50: un restante
    // inventado miente desde el primer corte.
    const base = baseDe({ piezas_abiertas: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => cortarMaterial.ejecutar(ctx, corte()))).toBe(
      'CONFIGURACION_INVALIDA',
    );
  });

  it('SE CORTA DE LA MÁS CHICA QUE ALCANCE', async () => {
    // El objetivo es cerrar piezas, no abrirlas: cortando de la más grande, los
    // retazos se acumulan y el rollo acaba en cuatro pedazos invendibles.
    const chica = 'r2222222-2222-4222-8222-222222222222';
    const base = baseDe({ piezas_abiertas: [pieza(ROLLO, 100_000n), pieza(chica, 70_000n)] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cortarMaterial.ejecutar(ctx, corte());

    expect(salida.piezaOrigenId).toBe(chica);
  });

  it('CORTAR UN MARTILLO NO ES UNA OPERACIÓN', async () => {
    // Sin esta guarda, un tecleo en la pantalla equivocada descuenta de un
    // producto por pieza una cantidad en milímetros.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() => cortarMaterial.ejecutar(ctx, corte({ productoId: MARTILLO }))),
    ).toBe('CATALOGO_INVALIDO');
    expect(base.filas('movimientos_stock')).toEqual([]);
  });

  it('LO QUE NO ALCANZA EN LA PIEZA se dice antes de cortar', async () => {
    const base = baseDe({ piezas_abiertas: [pieza(ROLLO, 50_000n)] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() => cortarMaterial.ejecutar(ctx, corte({ piezaAbiertaId: ROLLO }))),
    ).toBe('STOCK_INSUFICIENTE');
    expect(base.filas('movimientos_stock')).toEqual([]);
  });

  it('LO QUE NO ALCANZA EN LA EXISTENCIA también', async () => {
    // El plan compara contra la PIEZA; esto compara contra la EXISTENCIA. Puede
    // haber un rollo registrado de 40 m y cero de existencia porque el conteo ya
    // la corrigió.
    const base = baseDe({}, []);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => cortarMaterial.ejecutar(ctx, corte()))).toBe('STOCK_INSUFICIENTE');
  });

  it('CORTAR NO PRODUCE MATERIAL: la merma negativa ni se acepta', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => cortarMaterial.ejecutar(ctx, corte({ mermaBase: -400 })))).toBe(
      'INVENTARIO_INVALIDO',
    );
  });

  it('EL CORTE QUEDA AMARRADO A SU PARTIDA', async () => {
    // Sin la partida, el corte es material que salió sin que nadie lo cobrara.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cortarMaterial.ejecutar(ctx, corte());

    expect(base.campo('cortes_material', 'orden_linea_id')).toBe(LINEA);
    expect(base.campo('movimientos_stock', 'referencia_id')).toBe(LINEA);
  });

  it('una pieza que no existe, pedida a mano', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        cortarMaterial.ejecutar(
          ctx,
          corte({ piezaAbiertaId: 'r9999999-9999-4999-8999-999999999999' }),
        ),
      ),
    ).toBe('PUENTE_NO_ENCONTRADO');
  });
});
