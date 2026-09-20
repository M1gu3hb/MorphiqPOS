import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { piezaParaElCorte, planearCorte, type PiezaAbierta } from './corte.ts';

/**
 * F-145 y F-150 · El corte de material y lo que queda.
 *
 * Se cortan 60 m de un rollo de 100 y salen 61.2 porque la segueta se lleva lo
 * suyo. Pasa ocho veces al día, y a fin de mes son decenas de metros que el
 * sistema cree que están y no están. Aquí el acto de vender consume material
 * adicional al vendido, y ésa es la diferencia con `abarrotes`.
 */

/** Todo en milímetros: un rollo de 100 m son 100,000. */
const ROLLO = { restanteBase: 100_000n, umbralRetazoBase: 2_000n };

function codigoDe(fn: () => unknown): string {
  try {
    fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('planearCorte', () => {
  it('DEL ROLLO SALEN LOS DOS: lo vendido y lo que se llevó la segueta', () => {
    // Descontar sólo lo vendido deja la merma dentro del inventario para
    // siempre, y la diferencia aparece completa y de golpe el día del conteo.
    const corte = planearCorte(ROLLO, { medidaSolicitadaBase: 60_000n, mermaBase: 400n });

    expect(corte.entregadoBase).toBe(60_000n);
    expect(corte.mermaBase).toBe(400n);
    expect(corte.consumidoBase).toBe(60_400n);
    expect(corte.sobranteBase).toBe(39_600n);
    expect(corte.destino).toBe('sigue_abierta');
  });

  it('EL SOBRANTE CHICO ES RETAZO, no existencia vendible', () => {
    // 2 m que no le sirven a nadie: existen, valen dinero a costo y no se venden
    // a precio de lista. Sin el concepto, inflan la existencia y producen un
    // faltante fantasma en el conteo.
    const corte = planearCorte(ROLLO, { medidaSolicitadaBase: 98_000n, mermaBase: 500n });

    expect(corte.sobranteBase).toBe(1_500n);
    expect(corte.destino).toBe('retazo');
  });

  it('EN EL UMBRAL EXACTO YA ES RETAZO', () => {
    // El umbral es «debajo de esto ya no se vende a precio de lista». Con `<`,
    // el metro justo del umbral se ofrecería a precio de lista y se quedaría en
    // el anaquel para siempre.
    const corte = planearCorte(ROLLO, { medidaSolicitadaBase: 98_000n, mermaBase: 0n });

    expect(corte.sobranteBase).toBe(2_000n);
    expect(corte.destino).toBe('retazo');
  });

  it('EL SOBRANTE CERO CIERRA LA PIEZA, no la deja como retazo de nada', () => {
    const corte = planearCorte(ROLLO, { medidaSolicitadaBase: 99_600n, mermaBase: 400n });

    expect(corte.sobranteBase).toBe(0n);
    expect(corte.destino).toBe('agotada');
  });

  it('LO QUE NO ALCANZA SE DICE ANTES DE CORTAR', () => {
    // El material cortado de menos ya no se vuelve a pegar: decirlo después es
    // un rollo arruinado en vez de una venta que no se hizo.
    expect(
      codigoDe(() => planearCorte(ROLLO, { medidaSolicitadaBase: 99_800n, mermaBase: 400n })),
    ).toBe('STOCK_INSUFICIENTE');
  });

  it('LA MERMA CUENTA PARA SABER SI ALCANZA', () => {
    // Exactamente 100,000 de solicitud cabe; con 1 mm de merma ya no. Ignorar
    // la merma al comprobar dejaría la pieza en negativo.
    expect(planearCorte(ROLLO, { medidaSolicitadaBase: 100_000n, mermaBase: 0n }).destino).toBe(
      'agotada',
    );
    expect(
      codigoDe(() => planearCorte(ROLLO, { medidaSolicitadaBase: 100_000n, mermaBase: 1n })),
    ).toBe('STOCK_INSUFICIENTE');
  });

  it('CORTAR NO PRODUCE MATERIAL', () => {
    // Una merma negativa es la forma corta de tapar un faltante desde el
    // mostrador.
    expect(
      codigoDe(() => planearCorte(ROLLO, { medidaSolicitadaBase: 60_000n, mermaBase: -400n })),
    ).toBe('INVENTARIO_INVALIDO');
  });

  it('un corte de cero no es un corte', () => {
    expect(codigoDe(() => planearCorte(ROLLO, { medidaSolicitadaBase: 0n, mermaBase: 0n }))).toBe(
      'CANTIDAD_INVALIDA',
    );
  });

  it('un umbral negativo no configura nada', () => {
    expect(
      codigoDe(() =>
        planearCorte(
          { restanteBase: 100_000n, umbralRetazoBase: -1n },
          { medidaSolicitadaBase: 1_000n, mermaBase: 0n },
        ),
      ),
    ).toBe('CONFIGURACION_INVALIDA');
  });

  it('la merma en cero es legítima: hay material que no se destruye al cortar', () => {
    const corte = planearCorte(ROLLO, { medidaSolicitadaBase: 60_000n, mermaBase: 0n });

    expect(corte.consumidoBase).toBe(60_000n);
  });
});

describe('piezaParaElCorte', () => {
  const pieza = (id: string, restanteBase: bigint, estado: PiezaAbierta['estado'] = 'abierta') => ({
    id,
    restanteBase,
    estado,
  });

  it('LA MÁS CHICA QUE ALCANCE: el objetivo es cerrar piezas, no abrirlas', () => {
    // Cortando siempre de la más grande, los retazos se acumulan y el rollo
    // entero acaba en cuatro pedazos invendibles.
    const elegida = piezaParaElCorte(
      [pieza('R-100', 90_000n), pieza('R-114', 37_000n), pieza('R-120', 60_000n)],
      30_000n,
    );

    expect(elegida?.id).toBe('R-114');
  });

  it('EL RETAZO SE OFRECE PRIMERO: es dinero dado por perdido', () => {
    // Si alcanza para lo que el cliente pide, sacarlo de ahí recupera lo que ya
    // estaba escrito como pérdida. Dejarlo para el final garantiza que no salga.
    // El retazo es MÁS GRANDE que la pieza abierta que también alcanza: aun
    // así se corta del retazo. Si la regla fuera sólo «la más chica», saldría
    // la abierta y el retazo seguiría ahí el año que viene.
    const elegida = piezaParaElCorte(
      [pieza('R-100', 2_000n), pieza('R-114', 4_000n, 'retazo')],
      1_500n,
    );

    expect(elegida?.id).toBe('R-114');
  });

  it('EL RETAZO QUE NO ALCANZA no se ofrece', () => {
    const elegida = piezaParaElCorte(
      [pieza('R-100', 5_000n), pieza('R-114', 1_000n, 'retazo')],
      1_500n,
    );

    expect(elegida?.id).toBe('R-100');
  });

  it('LA PIEZA CERRADA NO EXISTE para cortar', () => {
    expect(piezaParaElCorte([pieza('R-100', 90_000n, 'cerrada')], 1_000n)).toBeNull();
  });

  it('SIN PIEZA QUE ALCANCE devuelve nulo, y quien llama decide abrir una nueva', () => {
    expect(piezaParaElCorte([pieza('R-114', 1_000n)], 60_000n)).toBeNull();
  });

  it('EL EMPATE SE ROMPE ESTABLE: dos cortes simultáneos eligen la misma', () => {
    const elegida = piezaParaElCorte([pieza('R-200', 5_000n), pieza('R-100', 5_000n)], 1_000n);

    expect(elegida?.id).toBe('R-100');
  });

  it('la pieza justa alcanza', () => {
    expect(piezaParaElCorte([pieza('R-114', 1_000n)], 1_000n)?.id).toBe('R-114');
  });
});
