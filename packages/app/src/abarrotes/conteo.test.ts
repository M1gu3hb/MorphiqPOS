import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { abrirConteo, capturarConteo, cerrarConteo, zonasPendientesDeConteo } from './conteo.ts';

/**
 * F-149 · Conteo cíclico por zona.
 *
 * La toma completa de 1,800 SKU tarda un domingo entero y por eso se hace una
 * vez al año o nunca. Lo que se prueba aquí es lo que la convierte en veinte
 * minutos diarios: el alcance acotado, el factor que pone el servidor, el
 * ajuste que sale como movimiento con su motivo, y el sello que hace que mañana
 * toque la zona siguiente.
 */

const ALMACEN = 'a1111111-1111-4111-8111-111111111111';
const ZONA = 'z1111111-1111-4111-8111-111111111111';
const TOMA = 't1111111-1111-4111-8111-111111111111';
const INSUMO = 'i1111111-1111-4111-8111-111111111111';
const CAJA24 = 'p1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-15T17:00:00.000Z');
/**
 * LA CLAVE, no la etiqueta.
 *
 * `movimientos_stock.motivo` apunta a `motivos_merma.clave` desde la 062, y aquí
 * se usaba la ETIQUETA de la clave `ajuste_conteo`. Contra la base real eso es un
 * `23503` y el conteo no cierra; contra la base falsa pasaba, porque no tiene
 * foráneas. Con la clave, la prueba afirma lo que Postgres acepta.
 */
const MOTIVO = 'ajuste_conteo';

function tienda(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    zonas_anaquel: [
      {
        id: ZONA,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        nombre: 'Reja de refrescos',
        orden: 1,
        dias_entre_conteos: 7,
        ultimo_conteo_en: new Date('2026-09-01T17:00:00.000Z'),
        activa: true,
      },
    ],
    insumos: [{ id: INSUMO, organizacion_id: ORG, unidad_base: 'pieza' }],
    // El motivo se COMPRUEBA contra esta tabla antes de escribir un movimiento:
    // `movimientos_stock.motivo` tiene foránea a ella desde la 062, y un conteo
    // de cuatrocientos productos que se aborta en el renglón trescientos por un
    // motivo mal escrito es una hora de trabajo perdida.
    motivos_merma: [
      {
        clave: 'ajuste_conteo',
        etiqueta: 'Diferencia de conteo físico',
        giro: null,
        imputable: false,
        activo: true,
      },
    ],
    producto_presentaciones: [
      { id: CAJA24, organizacion_id: ORG, factor: '24.0000', activa: true },
    ],
    existencias: [
      { organizacion_id: ORG, almacen_id: ALMACEN, insumo_id: INSUMO, cantidad: '240.0000' },
    ],
    tomas_inventario: [],
    toma_conteos: [],
    movimientos_stock: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}, crudas?: readonly Record<string, unknown>[]) =>
  crearBaseFalsa(tienda(extra), {
    filasCrudas: crudas ?? [{ cantidad: '216.0000' }],
    predeterminados: {
      tomas_inventario: { zona_id: null, cerrada_en: null, empleado_id: null },
      toma_conteos: { capturas: '[]', movimiento_ajuste_id: null, empleado_id: null },
      movimientos_stock: {
        costo_unitario_centavos: 0n,
        referencia_tipo: null,
        referencia_id: null,
        empleado_id: null,
        motivo: null,
        idempotency_key: null,
        sesion_caja_id: null,
      },
    },
  });

const tomaAbierta = (extra: Record<string, unknown> = {}) => ({
  id: TOMA,
  organizacion_id: ORG,
  almacen_id: ALMACEN,
  estado: 'abierta',
  zona_id: ZONA,
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

describe('inventario.abrir_conteo', () => {
  it('UNA ZONA, NO LA TIENDA ENTERA', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const salida = await abrirConteo.ejecutar(ctx, {
      almacenId: ALMACEN,
      alcance: 'zona',
      zonaId: ZONA,
    });

    expect(salida.zonaId).toBe(ZONA);
    expect(base.campo('tomas_inventario', 'zona_id')).toBe(ZONA);
  });

  it('EL ALMACÉN LO PONE LA SESIÓN, no la pantalla (C.8 de la 2.4)', async () => {
    // Existencias no sabe en qué almacén está: el almacén es ámbito. Exigirlo en
    // la entrada es por lo que NADIE llamaba a este comando y la toma no se podía
    // abrir desde ninguna pantalla.
    const base = baseDe({
      almacenes: [
        {
          id: ALMACEN,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          activo: true,
          principal: true,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    await abrirConteo.ejecutar(ctx, { alcance: 'zona', zonaId: ZONA });

    expect(base.campo('tomas_inventario', 'almacen_id')).toBe(ALMACEN);
  });

  it('UN CONTEO POR ZONA SIN ZONA no es un alcance', async () => {
    // Aceptarlo dejaría tomas que dicen ser de una zona y cuentan toda la
    // tienda: el «conteo de veinte minutos» que en realidad es el domingo.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    expect(
      await codigoDe(() => abrirConteo.ejecutar(ctx, { almacenId: ALMACEN, alcance: 'zona' })),
    ).toBe('INVENTARIO_INVALIDO');
    expect(base.filas('tomas_inventario')).toEqual([]);
  });

  it('UNA TOMA COMPLETA NO LLEVA ZONA', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    expect(
      await codigoDe(() =>
        abrirConteo.ejecutar(ctx, { almacenId: ALMACEN, alcance: 'completo', zonaId: ZONA }),
      ),
    ).toBe('INVENTARIO_INVALIDO');
  });

  it('LA ZONA APAGADA NO SE CUENTA', async () => {
    // El congelador se desmontó: contarlo produce un faltante entero contra un
    // esperado que ya nadie mantiene.
    const base = baseDe({
      zonas_anaquel: [
        {
          id: ZONA,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          nombre: 'Congelador',
          activa: false,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    expect(
      await codigoDe(() =>
        abrirConteo.ejecutar(ctx, { almacenId: ALMACEN, alcance: 'zona', zonaId: ZONA }),
      ),
    ).toBe('INVENTARIO_INVALIDO');
  });

  it('DOS TOMAS ABIERTAS EN EL MISMO ALMACÉN, NO', async () => {
    // Producirían dos esperados distintos para el mismo insumo y la segunda que
    // cierre pisaría a la primera.
    const base = baseDe({ tomas_inventario: [tomaAbierta({ zona_id: null })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    expect(
      await codigoDe(() =>
        abrirConteo.ejecutar(ctx, { almacenId: ALMACEN, alcance: 'zona', zonaId: ZONA }),
      ),
    ).toBe('INVENTARIO_INVALIDO');
  });
});

describe('inventario.capturar_conteo', () => {
  it('EL FACTOR LO PONE EL SERVIDOR: nueve cajas son 216 piezas', async () => {
    const base = baseDe({ tomas_inventario: [tomaAbierta()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await capturarConteo.ejecutar(ctx, {
      tomaId: TOMA,
      insumoId: INSUMO,
      capturas: [{ presentacionId: CAJA24, cantidad: '9' }],
    });

    expect(salida.contado).toBe('216.0000');
    expect(base.campo('toma_conteos', 'unidad')).toBe('pieza');
  });

  it('EL CRUDO SE GUARDA TAL CUAL: «nueve cajas», no «216 piezas»', async () => {
    // Cuando alguien reclama «yo conté nueve cajas», tiene que poder verse.
    // Sin el crudo, la discusión acaba en su palabra contra la del sistema.
    const base = baseDe({ tomas_inventario: [tomaAbierta()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await capturarConteo.ejecutar(ctx, {
      tomaId: TOMA,
      insumoId: INSUMO,
      capturas: [{ presentacionId: CAJA24, cantidad: '9' }],
    });

    const crudo: unknown = JSON.parse(String(base.campo('toma_conteos', 'capturas')));
    expect(crudo).toEqual([{ presentacionId: CAJA24, cantidad: '9', factor: '24.0000' }]);
  });

  it('EL ESPERADO SE SELLA AL CONTAR, no al cerrar', async () => {
    // El conteo tarda veinte minutos y en ese rato se sigue vendiendo. Con el
    // esperado calculado al cerrar, todas esas ventas saldrían como faltante.
    const base = baseDe({ tomas_inventario: [tomaAbierta()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await capturarConteo.ejecutar(ctx, {
      tomaId: TOMA,
      insumoId: INSUMO,
      capturas: [{ presentacionId: CAJA24, cantidad: '9' }],
    });

    expect(salida.esperado).toBe('240.0000');
    expect(base.campo('toma_conteos', 'esperado')).toBe('240.0000');
  });

  it('UNA PRESENTACIÓN DE OTRO CATÁLOGO no da factor', async () => {
    const base = baseDe({ tomas_inventario: [tomaAbierta()], producto_presentaciones: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        capturarConteo.ejecutar(ctx, {
          tomaId: TOMA,
          insumoId: INSUMO,
          capturas: [{ presentacionId: CAJA24, cantidad: '9' }],
        }),
      ),
    ).toBe('PUENTE_NO_ENCONTRADO');
  });

  it('SOBRE UNA TOMA CERRADA no se captura', async () => {
    const base = baseDe({ tomas_inventario: [tomaAbierta({ estado: 'cerrada' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        capturarConteo.ejecutar(ctx, {
          tomaId: TOMA,
          insumoId: INSUMO,
          capturas: [{ presentacionId: null, cantidad: '9' }],
        }),
      ),
    ).toBe('INVENTARIO_INVALIDO');
  });
});

describe('inventario.cerrar_conteo', () => {
  const conteo = (contado: string, esperado = '240.0000') => ({
    id: 'c1',
    toma_id: TOMA,
    insumo_id: INSUMO,
    esperado,
    contado,
    unidad: 'pieza',
  });

  it('EL FALTANTE SALE COMO MOVIMIENTO, con su motivo y su referencia', async () => {
    // Si el conteo escribiera existencias, el saldo cambiaría sin renglón que
    // lo justifique, que es justo la pregunta que el dueño hace.
    const base = baseDe({
      tomas_inventario: [tomaAbierta()],
      toma_conteos: [conteo('216.0000')],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const salida = await cerrarConteo.ejecutar(ctx, {
      tomaId: TOMA,
      motivo: 'ajuste_conteo',
      nota: 'Conteo del martes',
    });

    expect(salida.faltantes).toBe(1);
    expect(base.campo('movimientos_stock', 'cantidad')).toBe('-24.0000');
    expect(base.campo('movimientos_stock', 'tipo')).toBe('ajuste');
    expect(base.campo('movimientos_stock', 'referencia_tipo')).toBe('conteo');
    // La CLAVE en `motivo` y la frase en `nota`: esa columna tiene foránea a
    // `motivos_merma` y «Conteo del martes» no es una clave.
    expect(base.campo('movimientos_stock', 'motivo')).toBe('ajuste_conteo');
    expect(base.campo('movimientos_stock', 'nota')).toBe('Conteo del martes');
  });

  it('LO QUE CUADRA NO DEJA RENGLÓN', async () => {
    const base = baseDe({
      tomas_inventario: [tomaAbierta()],
      toma_conteos: [conteo('240.0000')],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const salida = await cerrarConteo.ejecutar(ctx, { tomaId: TOMA, motivo: MOTIVO, nota: null });

    expect(salida.ajustados).toBe(0);
    expect(base.filas('movimientos_stock')).toEqual([]);
  });

  it('SE SELLA LA ZONA: mañana toca la siguiente', async () => {
    // Sin esto, `zonasPorContar` pediría la misma reja de refrescos cada día y
    // el recorrido nunca avanzaría. Es la diferencia entre una toma física y
    // una rutina.
    const base = baseDe({
      tomas_inventario: [tomaAbierta()],
      toma_conteos: [conteo('216.0000')],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    await cerrarConteo.ejecutar(ctx, { tomaId: TOMA, motivo: MOTIVO, nota: null });

    expect(base.campo('zonas_anaquel', 'ultimo_conteo_en')).toEqual(AHORA);
    expect(await zonasPendientesDeConteo(base.tx, ORG, SUCURSAL, AHORA)).toEqual([]);
  });

  it('SE SELLA LA ZONA QUE SE CONTÓ, no las demás', async () => {
    // Sellar de más apagaría el recorrido de un anaquel que nadie miró, y el
    // sistema diría que está contado.
    const otra = 'z2222222-2222-4222-8222-222222222222';
    const antes = new Date('2026-08-20T17:00:00.000Z');
    const base = baseDe({
      zonas_anaquel: [
        {
          id: ZONA,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          nombre: 'Reja de refrescos',
          dias_entre_conteos: 7,
          ultimo_conteo_en: antes,
          activa: true,
        },
        {
          id: otra,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          nombre: 'Aceites',
          dias_entre_conteos: 7,
          ultimo_conteo_en: antes,
          activa: true,
        },
      ],
      tomas_inventario: [tomaAbierta()],
      toma_conteos: [conteo('216.0000')],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    await cerrarConteo.ejecutar(ctx, { tomaId: TOMA, motivo: MOTIVO, nota: null });

    expect(base.campo('zonas_anaquel', 'ultimo_conteo_en', 0)).toEqual(AHORA);
    expect(base.campo('zonas_anaquel', 'ultimo_conteo_en', 1)).toEqual(antes);
  });

  it('LA TOMA COMPLETA NO SELLA NINGUNA ZONA', async () => {
    // Contar toda la tienda no es contar la reja de refrescos: dar por contadas
    // las zonas apagaría el recorrido durante un mes sin que nadie lo decida.
    const base = baseDe({
      tomas_inventario: [tomaAbierta({ zona_id: null })],
      toma_conteos: [conteo('216.0000')],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    await cerrarConteo.ejecutar(ctx, { tomaId: TOMA, motivo: MOTIVO, nota: null });

    expect(base.campo('zonas_anaquel', 'ultimo_conteo_en')).toEqual(
      new Date('2026-09-01T17:00:00.000Z'),
    );
  });

  it('EL AJUSTE QUEDA LIGADO A SU LÍNEA', async () => {
    const base = baseDe({
      tomas_inventario: [tomaAbierta()],
      toma_conteos: [conteo('216.0000')],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    await cerrarConteo.ejecutar(ctx, { tomaId: TOMA, motivo: MOTIVO, nota: null });

    expect(base.campo('toma_conteos', 'movimiento_ajuste_id')).toBe(
      base.campo('movimientos_stock', 'id'),
    );
  });

  it('UN RENGLÓN QUE DEJARÍA LA EXISTENCIA EN NEGATIVO se rechaza', async () => {
    // Desde que se contó salió más de lo contado: eso no es una diferencia, es
    // un renglón mal contado.
    const base = baseDe(
      { tomas_inventario: [tomaAbierta()], toma_conteos: [conteo('0.0000')] },
      [],
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    expect(
      await codigoDe(() =>
        cerrarConteo.ejecutar(ctx, { tomaId: TOMA, motivo: MOTIVO, nota: null }),
      ),
    ).toBe('STOCK_INSUFICIENTE');
  });

  it('CERRAR DOS VECES no duplica los ajustes', async () => {
    const base = baseDe({
      tomas_inventario: [tomaAbierta({ estado: 'cerrada' })],
      toma_conteos: [conteo('216.0000')],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    expect(
      await codigoDe(() =>
        cerrarConteo.ejecutar(ctx, { tomaId: TOMA, motivo: MOTIVO, nota: null }),
      ),
    ).toBe('INVENTARIO_INVALIDO');
    expect(base.filas('movimientos_stock')).toEqual([]);
  });
});

describe('zonasPendientesDeConteo', () => {
  it('LA ZONA ATRASADA APARECE, con sus días de retraso', async () => {
    const base = baseDe();

    const pendientes = await zonasPendientesDeConteo(base.tx, ORG, SUCURSAL, AHORA);

    expect(pendientes).toHaveLength(1);
    // Del 1 al 15 son catorce días, con frecuencia de siete: siete de retraso.
    expect(pendientes[0]?.diasDeRetraso).toBe(7);
  });

  it('LAS ZONAS DE OTRO NEGOCIO no se recorren', async () => {
    const base = baseDe();

    expect(await zonasPendientesDeConteo(base.tx, 'otra-org', SUCURSAL, AHORA)).toEqual([]);
  });
});
