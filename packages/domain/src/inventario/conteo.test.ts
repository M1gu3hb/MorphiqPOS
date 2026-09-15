import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  planearAjustesDeConteo,
  sumarCapturas,
  zonasPorContar,
  type ZonaParaRecorrido,
} from './conteo.ts';

/**
 * F-149 · La aritmética del conteo cíclico.
 *
 * Lo que se prueba aquí es lo que convierte la toma anual —que nadie hace— en
 * una rutina de veinte minutos: qué zona toca hoy, cuánto suma lo que tecleó la
 * persona, y qué ajuste sale de la diferencia.
 */

const AHORA = new Date('2026-09-15T17:00:00.000Z');

function zona(extra: Partial<ZonaParaRecorrido> = {}): ZonaParaRecorrido {
  return {
    id: 'z1',
    nombre: 'Reja de refrescos',
    orden: 1,
    diasEntreConteos: 7,
    ultimoConteoEn: new Date('2026-09-01T17:00:00.000Z'),
    activa: true,
    ...extra,
  };
}

function codigoDe(fn: () => unknown): string {
  try {
    fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('zonasPorContar', () => {
  it('LA QUE NUNCA SE CONTÓ VA PRIMERO, por encima de cualquier retraso', () => {
    // Una zona sin conteo no tiene una diferencia grande: tiene una
    // DESCONOCIDA. Ordenarla por retraso la mandaría al final para siempre.
    const lista = zonasPorContar(
      [
        zona({ id: 'vieja', nombre: 'Aceites', ultimoConteoEn: new Date('2026-01-01T00:00:00Z') }),
        zona({ id: 'nueva', nombre: 'Congelador', ultimoConteoEn: null }),
      ],
      AHORA,
    );

    expect(lista.map((z) => z.id)).toEqual(['nueva', 'vieja']);
    expect(lista[0]?.diasDeRetraso).toBeNull();
  });

  it('LA QUE TODAVÍA NO TOCA no aparece', () => {
    const lista = zonasPorContar(
      [zona({ ultimoConteoEn: new Date('2026-09-14T17:00:00.000Z'), diasEntreConteos: 7 })],
      AHORA,
    );

    expect(lista).toEqual([]);
  });

  it('EL DÍA EXACTO SÍ TOCA: retraso cero entra', () => {
    // Exigir retraso estricto empuja cada zona un día más en cada vuelta, y a
    // los tres meses el refresco se cuenta cada diez días sin que nadie lo
    // haya decidido.
    const lista = zonasPorContar(
      [zona({ ultimoConteoEn: new Date('2026-09-08T17:00:00.000Z'), diasEntreConteos: 7 })],
      AHORA,
    );

    expect(lista).toHaveLength(1);
    expect(lista[0]?.diasDeRetraso).toBe(0);
  });

  it('CADA ZONA CON SU PROPIA FRECUENCIA', () => {
    // Nueve días desde el último conteo: el refresco (7) toca, el seco (90) no.
    const desde = new Date('2026-09-06T17:00:00.000Z');
    const lista = zonasPorContar(
      [
        zona({ id: 'refresco', nombre: 'Refrescos', diasEntreConteos: 7, ultimoConteoEn: desde }),
        zona({ id: 'seco', nombre: 'Abarrote seco', diasEntreConteos: 90, ultimoConteoEn: desde }),
      ],
      AHORA,
    );

    expect(lista.map((z) => z.id)).toEqual(['refresco']);
  });

  it('LA ZONA APAGADA NO PIDE CONTEO', () => {
    // Se desmontó el congelador. Sin esto encabezaría la lista cada mañana,
    // acumulando un retraso que ya no significa nada.
    expect(zonasPorContar([zona({ activa: false, ultimoConteoEn: null })], AHORA)).toEqual([]);
  });

  it('las más atrasadas primero, y el empate se rompe estable', () => {
    const desde = new Date('2026-08-01T17:00:00.000Z');
    const lista = zonasPorContar(
      [
        zona({ id: 'b', nombre: 'Botanas', diasEntreConteos: 7, ultimoConteoEn: desde }),
        zona({ id: 'a', nombre: 'Aceites', diasEntreConteos: 7, ultimoConteoEn: desde }),
        zona({ id: 'c', nombre: 'Cigarros', diasEntreConteos: 30, ultimoConteoEn: desde }),
      ],
      AHORA,
    );

    // Aceites y Botanas empatan en retraso (38 − 7 = 31); Cigarros va detrás (14).
    expect(lista.map((z) => z.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('sumarCapturas', () => {
  it('NUEVE CAJAS Y TRES PIEZAS son 219', () => {
    expect(
      sumarCapturas([
        { presentacionId: 'caja', cantidad: '9', factor: '24' },
        { presentacionId: null, cantidad: '3', factor: '1' },
      ]),
    ).toBe('219.0000');
  });

  it('EL CIGARRO SUELTO NO PIERDE DECIMALES', () => {
    // `0.05 × 3` en coma flotante da 0.15000000000000002, y el conteo de
    // cigarros dejaría de cuadrar por décimas en cada línea.
    expect(sumarCapturas([{ presentacionId: 'suelto', cantidad: '3', factor: '0.05' }])).toBe(
      '0.1500',
    );
  });

  it('CONTAR CERO ES UNA RESPUESTA', () => {
    expect(sumarCapturas([{ presentacionId: null, cantidad: '0', factor: '1' }])).toBe('0.0000');
  });

  it('UNA LÍNEA SIN CAPTURAS NO ES UN CERO', () => {
    // Es una línea sin contar. Aceptar la lista vacía dejaría que un descuido
    // de la pantalla se leyera como anaquel vacío.
    expect(codigoDe(() => sumarCapturas([]))).toBe('INVENTARIO_INVALIDO');
  });

  it('no se cuenta en negativo', () => {
    expect(
      codigoDe(() => sumarCapturas([{ presentacionId: null, cantidad: '-2', factor: '1' }])),
    ).toBe('CANTIDAD_INVALIDA');
  });

  it('un factor cero no convierte nada', () => {
    expect(
      codigoDe(() => sumarCapturas([{ presentacionId: 'x', cantidad: '2', factor: '0' }])),
    ).toBe('CATALOGO_INVALIDO');
  });
});

describe('planearAjustesDeConteo', () => {
  it('EL FALTANTE SALE NEGATIVO y el sobrante positivo', () => {
    const ajustes = planearAjustesDeConteo([
      { insumoId: 'falta', esperado: '40.0000', contado: '36.0000', unidad: 'pieza' },
      { insumoId: 'sobra', esperado: '10.0000', contado: '12.0000', unidad: 'pieza' },
    ]);

    expect(ajustes).toEqual([
      { insumoId: 'falta', delta: '-4.0000', unidad: 'pieza', faltante: true },
      { insumoId: 'sobra', delta: '2.0000', unidad: 'pieza', faltante: false },
    ]);
  });

  it('EL FALTANTE CON DECIMALES sigue siendo un solo número', () => {
    // Medio kilo de jamón que falta. Sacar el signo antes de partir en enteros
    // y fracción es lo que evita `-4.-5000`: con bigint, `-45000n / 10000n` da
    // −4 y `-45000n % 10000n` da −5000, y los dos signos se escriben.
    const ajustes = planearAjustesDeConteo([
      { insumoId: 'jamon', esperado: '5.0000', contado: '0.5000', unidad: 'kg' },
    ]);

    expect(ajustes[0]?.delta).toBe('-4.5000');
  });

  it('LO QUE CUADRA NO PRODUCE MOVIMIENTO', () => {
    // Mil renglones de cero en el kardex son mil renglones donde después hay
    // que buscar por qué cambió un saldo.
    expect(
      planearAjustesDeConteo([
        { insumoId: 'i1', esperado: '40.0000', contado: '40.0000', unidad: 'pieza' },
      ]),
    ).toEqual([]);
  });

  it('EL SOBRANTE TAMBIÉN SE AJUSTA', () => {
    // Casi siempre es una entrada no capturada. Dejarlo mantendría al sistema
    // mintiendo hacia abajo, y volvería a aparecer en el siguiente conteo como
    // si fuera nuevo.
    const ajustes = planearAjustesDeConteo([
      { insumoId: 'i1', esperado: '0.0000', contado: '5.0000', unidad: 'kg' },
    ]);

    expect(ajustes[0]?.faltante).toBe(false);
    expect(ajustes[0]?.delta).toBe('5.0000');
  });
});
