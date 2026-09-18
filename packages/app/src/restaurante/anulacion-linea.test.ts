import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { anularLineaComando } from './anulacion-linea.ts';
import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from './pruebas/base-falsa.ts';
import {
  ambitoDe,
  comanda,
  comandaItem,
  CUENTA,
  LINEA,
  linea,
  MESA_5,
  ordenDeMesa,
  PREDETERMINADOS,
} from './pruebas/sala.ts';

/**
 * F-324 · Anular una línea ya comandada.
 *
 * Lo que vigilan estas pruebas es lo que pasa ALREDEDOR de la aritmética, que
 * tiene sus propias pruebas en el dominio: que la cuenta baje de total, que
 * cocina deje de preparar lo anulado, que quede motivo y responsable, y que una
 * línea anulada no se pueda volver a anular.
 */

const OTRA_LINEA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccd';

function salon(cambiosDeOrden: Fila = {}, lineas?: readonly Fila[]): TablasFalsas {
  return {
    ordenes: [
      ordenDeMesa('confirmada', {
        total_centavos: 40_000n,
        subtotal_centavos: 40_000n,
        ...cambiosDeOrden,
      }),
    ],
    orden_lineas: lineas ?? [
      // Tres hamburguesas de $100 y un refresco de $100.
      linea({
        cantidad: '3.0000',
        subtotal_centavos: 30_000n,
        total_centavos: 30_000n,
        anulada_en: null,
      }),
      linea({ id: OTRA_LINEA, cantidad: '1.0000', orden_visual: 2, anulada_en: null }),
    ],
    comandas: [comanda('nuevo')],
    comanda_items: [comandaItem('pendiente', { cantidad: '3.0000' })],
    movimientos_cuenta: [],
    configuracion: [],
  };
}

const baseDe = (cambios: Fila = {}, lineas?: readonly Fila[]) =>
  crearBaseFalsa(salon(cambios, lineas), { predeterminados: PREDETERMINADOS });

const ENTERA = { ordenId: CUENTA, lineaId: LINEA, motivo: 'error_cocina' as const };

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-324 · anular la línea entera', () => {
  it('la línea queda sellada con motivo y responsable', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    await anularLineaComando.ejecutar(ctx, ENTERA);

    const anulada = base.filas('orden_lineas').find((l) => l['id'] === LINEA);
    expect(anulada?.['anulada_en']).not.toBeNull();
    expect(anulada?.['motivo_anulacion']).toBe('error_cocina');
    expect(anulada?.['empleado_anula_id']).toBe('55555555-5555-4555-8555-555555555555');
  });

  it('LA CUENTA BAJA DE TOTAL — si no, el cliente paga lo que se le anuló', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await anularLineaComando.ejecutar(ctx, ENTERA);

    // $400 menos las tres hamburguesas de $300 = $100.
    expect(salida.totalCentavos).toBe('10000');
    expect(base.campo('ordenes', 'total_centavos')).toBe(10_000n);
    expect(salida.importeAnuladoCentavos).toBe('30000');
  });

  it('COCINA DEJA DE PREPARARLO', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await anularLineaComando.ejecutar(ctx, ENTERA);

    expect(salida.itemsCancelados).toBe(1);
    expect(base.campo('comanda_items', 'estado')).toBe('cancelado');
  });

  it('lo que YA SE ENTREGÓ no se toca: ese plato existió y salió', async () => {
    const base = crearBaseFalsa(
      { ...salon(), comanda_items: [comandaItem('entregado', { cantidad: '3.0000' })] },
      { predeterminados: PREDETERMINADOS },
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'));

    const salida = await anularLineaComando.ejecutar(ctx, ENTERA);

    expect(salida.itemsCancelados).toBe(0);
    expect(base.campo('comanda_items', 'estado')).toBe('entregado');
  });

  it('deja bitácora con el motivo, que la 070 exige para este tipo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    await anularLineaComando.ejecutar(ctx, { ...ENTERA, nota: 'se cayó al piso' });

    const movimientos = base.filas('movimientos_cuenta');
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]?.['tipo']).toBe('anulacion_linea');
    expect(movimientos[0]?.['motivo']).toBe('error_cocina · se cayó al piso');
    expect(movimientos[0]?.['mesa_origen_id']).toBe(MESA_5);
  });

  it('audita qué se anuló y cuánto costó', async () => {
    const base = baseDe();
    const { ctx, auditorias } = contextoFalso(base.tx, ambitoDe('cajero'));

    await anularLineaComando.ejecutar(ctx, ENTERA);

    expect(auditorias[0]?.payload['motivo']).toBe('error_cocina');
    expect(auditorias[0]?.payload['importeAnuladoCentavos']).toBe('30000');
    expect(auditorias[0]?.payload['entera']).toBe(true);
  });
});

describe('F-324 · anular PARTE de una línea', () => {
  it('la línea viva se queda con lo que sigue cobrándose', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await anularLineaComando.ejecutar(ctx, { ...ENTERA, cantidad: '1.0000' });

    expect(salida.lineaVivaId).toBe(LINEA);
    const viva = base.filas('orden_lineas').find((l) => l['id'] === LINEA);
    expect(viva?.['cantidad']).toBe('2.0000');
    expect(viva?.['total_centavos']).toBe(20_000n);
    expect(viva?.['anulada_en']).toBeNull();
  });

  it('nace una fila hermana con la porción anulada y su sello', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await anularLineaComando.ejecutar(ctx, { ...ENTERA, cantidad: '1.0000' });

    const hermana = base.filas('orden_lineas').find((l) => l['id'] === salida.lineaAnuladaId);
    expect(salida.lineaAnuladaId).not.toBe(LINEA);
    expect(hermana?.['cantidad']).toBe('1.0000');
    expect(hermana?.['total_centavos']).toBe(10_000n);
    expect(hermana?.['motivo_anulacion']).toBe('error_cocina');
    // Instantáneas copiadas: el ticket de dentro de un año tiene que decir qué
    // se anuló aunque el producto se haya renombrado.
    expect(hermana?.['producto_nombre']).toBe('Enchiladas');
    expect(hermana?.['precio_unitario_centavos']).toBe(10_000n);
  });

  it('LA CUENTA BAJA SÓLO LO ANULADO, ni un centavo más', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await anularLineaComando.ejecutar(ctx, { ...ENTERA, cantidad: '1.0000' });

    // $400 − $100 = $300. La hermana anulada NO entra en la cotización.
    expect(salida.totalCentavos).toBe('30000');
  });

  it('cocina hace DOS en vez de tres, no cero', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await anularLineaComando.ejecutar(ctx, { ...ENTERA, cantidad: '1.0000' });

    expect(salida.itemsReducidos).toBe(1);
    expect(salida.itemsCancelados).toBe(0);
    expect(base.campo('comanda_items', 'cantidad')).toBe('2.0000');
    expect(base.campo('comanda_items', 'estado')).toBe('pendiente');
  });
});

describe('F-324 · lo que rechaza', () => {
  it('una línea ya anulada — el doble toque no borra dos veces', async () => {
    const base = baseDe({}, [
      linea({ anulada_en: new Date('2026-09-14T00:00:00.000Z'), motivo_anulacion: 'cortesia' }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    expect(await codigoDe(() => anularLineaComando.ejecutar(ctx, ENTERA))).toBe(
      'ORDEN_NO_EDITABLE',
    );
  });

  it('UNA CUENTA YA COBRADA — eso es una devolución, y tiene su propio camino', async () => {
    const base = baseDe({ estado: 'pagada' });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    expect(await codigoDe(() => anularLineaComando.ejecutar(ctx, ENTERA))).toBe(
      'ORDEN_NO_EDITABLE',
    );
  });

  it('una cuenta de otro negocio se ve como inexistente', async () => {
    const base = baseDe({ organizacion_id: '00000000-0000-4000-8000-000000000000' });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    expect(await codigoDe(() => anularLineaComando.ejecutar(ctx, ENTERA))).toBe(
      'ORDEN_NO_ENCONTRADA',
    );
  });

  it('anular más de lo que la línea tiene', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    expect(
      await codigoDe(() => anularLineaComando.ejecutar(ctx, { ...ENTERA, cantidad: '9.0000' })),
    ).toBe('CANTIDAD_INVALIDA');
  });

  it('NO ESCRIBE NADA cuando la cantidad no cabe', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    await codigoDe(() => anularLineaComando.ejecutar(ctx, { ...ENTERA, cantidad: '9.0000' }));

    expect(base.filas('orden_lineas')).toHaveLength(2);
    expect(base.filas('movimientos_cuenta')).toEqual([]);
    expect(base.campo('comanda_items', 'estado')).toBe('pendiente');
  });
});

describe('F-324 · quién anula, y qué puede mandar', () => {
  it('el mesero NO: anular es hacer desaparecer consumo del ticket', () => {
    expect(anularLineaComando.roles).not.toContain('mesero');
    expect(anularLineaComando.roles).toContain('cajero');
  });

  it('EL MOTIVO ES OBLIGATORIO y está cerrado: sin él no hay responsable', () => {
    expect(anularLineaComando.entrada.safeParse({ ordenId: CUENTA, lineaId: LINEA }).success).toBe(
      false,
    );
    expect(
      anularLineaComando.entrada.safeParse({
        ordenId: CUENTA,
        lineaId: LINEA,
        motivo: 'porque si',
      }).success,
    ).toBe(false);
  });

  it('el cliente no manda importes: la entrada sólo acepta cantidad', () => {
    const analisis = anularLineaComando.entrada.safeParse({
      ordenId: CUENTA,
      lineaId: LINEA,
      motivo: 'cortesia',
      cantidad: '1.0000',
      importeCentavos: 1,
    });
    expect(analisis.success).toBe(true);
    expect(analisis.success ? Object.keys(analisis.data).sort() : []).toEqual([
      'cantidad',
      'lineaId',
      'motivo',
      'ordenId',
    ]);
  });

  it('LA CANTIDAD ES TEXTO, no número: 0.1 + 0.2 no es 0.3', () => {
    const conNumero = anularLineaComando.entrada.safeParse({
      ordenId: CUENTA,
      lineaId: LINEA,
      motivo: 'cortesia',
      cantidad: 1,
    });
    expect(conNumero.success).toBe(false);
  });
});
