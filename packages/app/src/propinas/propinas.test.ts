import { esErrorDominio, type Ambito } from '@morphiqpos/contracts';
import { aplicarPorcentaje, centavos, desdeTexto } from '@morphiqpos/domain/dinero';
import { describe, expect, it } from 'vitest';

import { ejecutorDeProduccion } from '../pruebas/dobles.ts';
import { repartirPagos } from '../venta/pagos.ts';
import { propinasPendientes } from './consultas.ts';
import { desglosarPagos, efectivoDelCajon, etiquetaDeMesero, SIN_MESERO } from './desglose.ts';
import {
  entradaCobrarOrdenConPropina,
  entradaLiquidarPropinas,
  entradaPropinasPendientes,
} from './esquemas.ts';
import { folioVisible, liquidarPropinas } from './liquidar.ts';
import { resolverRango } from './rango.ts';
import { explicarReclamo } from './reclamo.ts';

/**
 * Las cuatro reglas de propina de `F1-01` §3, escritas como pruebas.
 *
 *   1. `Venta.total` es la venta SIN propina. Nunca se infla.
 *   2. La propina no entra en ventas, utilidad, costos ni margen.
 *   3. El desglose por método de pago es EXACTO, nunca proporcional.
 *   4. El efectivo esperado SÍ incluye la propina en efectivo.
 *
 * Todo sin base de datos: lo que se prueba aquí es la aritmética y las puertas,
 * que es donde se decide si el dinero cuadra.
 */

function codigoDe(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO:${String(error)}`;
  }
  return 'NO_LANZO';
}

const AMBITO: Ambito = {
  organizacionId: '00000000-0000-4000-8000-000000000001',
  sucursalId: '00000000-0000-4000-8000-000000000002',
  terminalId: '00000000-0000-4000-8000-000000000003',
  identidadId: '00000000-0000-4000-8000-000000000004',
  empleoId: '00000000-0000-4000-8000-000000000005',
  rol: 'administrador',
};

const RANGO = { desde: '2026-09-09T00:00:00.000Z', hasta: '2026-09-09T23:59:59.999Z' };

// ─────────────────────────────────────────────── regla 3 · desglose exacto

describe('regla 3 · el desglose por método es exacto, nunca proporcional', () => {
  // 50 en efectivo y 30 en tarjeta sobre una venta de $10.00 pagada 700/300.
  // El reparto proporcional daría 56 y 24: seis centavos de diferencia en cada
  // método, y el cajón cerraría con seis centavos de más que nadie explica.
  const MIXTO = [
    { metodo: 'efectivo', montoCentavos: 700n, propinaCentavos: 50n },
    { metodo: 'tarjeta', montoCentavos: 300n, propinaCentavos: 30n },
  ];

  it('son 50 y 30, no 56 y 24', () => {
    const desglose = desglosarPagos(MIXTO);

    expect(desglose.efectivo.propinasCentavos).toBe(50n);
    expect(desglose.tarjeta.propinasCentavos).toBe(30n);

    // La otra mitad de la afirmación: el proporcional da OTRO número. Sin esto,
    // la prueba pasaría igual con un reparto que casualmente coincidiera.
    const total = desglose.propinasCentavos;
    const proporcionalEfectivo = (total * 700n) / 1000n;
    expect(proporcionalEfectivo).toBe(56n);
    expect(desglose.efectivo.propinasCentavos).not.toBe(proporcionalEfectivo);
  });

  it('la suma de las partes es el total, sin centavo perdido', () => {
    const desglose = desglosarPagos([
      { metodo: 'efectivo', montoCentavos: 3333n, propinaCentavos: 1n },
      { metodo: 'tarjeta', montoCentavos: 3333n, propinaCentavos: 33n },
      { metodo: 'transferencia', montoCentavos: 3334n, propinaCentavos: 67n },
    ]);

    expect(desglose.propinasCentavos).toBe(101n);
    expect(
      desglose.efectivo.propinasCentavos +
        desglose.tarjeta.propinasCentavos +
        desglose.transferencia.propinasCentavos,
    ).toBe(desglose.propinasCentavos);
  });

  it('un método que la pantalla no dibuja no se cuela en el efectivo', () => {
    // `pagos.metodo` admite `fiado`, `puntos` y `monedero`. Sumarlos al efectivo
    // «para que cuadre» es exactamente cómo se pierde la pista de ese dinero.
    const desglose = desglosarPagos([
      { metodo: 'fiado', montoCentavos: 500n, propinaCentavos: 40n },
    ]);

    expect(desglose.efectivo.propinasCentavos).toBe(0n);
    expect(desglose.otros.propinasCentavos).toBe(40n);
    expect(desglose.propinasCentavos).toBe(40n);
  });

  it('no pierde precisión con importes que un `number` ya no representa', () => {
    // 2^53 + 1. Con `number` este importe y el anterior son el mismo valor, y la
    // suma de propinas quedaría un centavo corta sin que nada avise (R15).
    const enorme = 9_007_199_254_740_993n;
    const desglose = desglosarPagos([
      { metodo: 'efectivo', montoCentavos: 1n, propinaCentavos: enorme },
    ]);

    expect(desglose.propinasCentavos).toBe(enorme);
    expect(Number(desglose.propinasCentavos)).not.toBe(enorme);
  });
});

// ────────────────────────────────────── reglas 1 y 2 · la propina no es venta

describe('reglas 1 y 2 · la propina no entra en la venta', () => {
  it('los pagos siguen teniendo que sumar EXACTAMENTE el total, propina aparte', () => {
    const pagos = repartirPagos(
      [
        {
          metodo: 'efectivo',
          montoCentavos: 15000,
          propinaCentavos: 2000,
          recibidoCentavos: 20000,
        },
      ],
      15000n,
    );

    expect(pagos[0]?.montoCentavos).toBe(15000n);
    expect(pagos[0]?.propinaCentavos).toBe(2000n);
    // El cambio sale de lo recibido menos la venta Y la propina: 20000 − 17000.
    expect(pagos[0]?.cambioCentavos).toBe(3000n);
  });

  it('una propina NO tapa un faltante de la venta', () => {
    // 14000 de venta más 1000 de propina son 15000 en el cajón, pero la venta
    // cuesta 15000. Si la propina contara, esto pasaría y el total quedaría
    // inflado por mil centavos que no son ingreso.
    expect(
      codigoDe(() =>
        repartirPagos(
          [{ metodo: 'efectivo', montoCentavos: 14000, propinaCentavos: 1000 }],
          15000n,
        ),
      ),
    ).toBe('PAGO_NO_CUADRA');
  });

  it('una propina generosa no hace que el pago «exceda» el total', () => {
    const pagos = repartirPagos(
      [{ metodo: 'tarjeta', montoCentavos: 15000, propinaCentavos: 5000 }],
      15000n,
    );

    expect(pagos).toHaveLength(1);
    expect(pagos[0]?.propinaCentavos).toBe(5000n);
  });

  it('el efectivo recibido tiene que dar para la venta y para la propina', () => {
    expect(
      codigoDe(() =>
        repartirPagos(
          [
            {
              metodo: 'efectivo',
              montoCentavos: 15000,
              propinaCentavos: 2000,
              recibidoCentavos: 16000,
            },
          ],
          15000n,
        ),
      ),
    ).toBe('EFECTIVO_INSUFICIENTE');
  });

  it('rechaza una propina negativa en vez de restarla de la venta', () => {
    expect(
      codigoDe(() =>
        repartirPagos(
          [{ metodo: 'efectivo', montoCentavos: 15000, propinaCentavos: -500 }],
          15000n,
        ),
      ),
    ).toBe('PAGO_NO_CUADRA');
  });

  it('las ventas del desglose nunca llevan propina dentro', () => {
    const desglose = desglosarPagos([
      { metodo: 'efectivo', montoCentavos: 700n, propinaCentavos: 50n },
      { metodo: 'tarjeta', montoCentavos: 300n, propinaCentavos: 30n },
    ]);

    // Utilidad, costo y margen se derivan de la venta: si `ventasCentavos`
    // llevara la propina dentro, los tres saldrían inflados por ella.
    expect(desglose.ventasCentavos).toBe(1000n);
    expect(desglose.efectivo.ventasCentavos).toBe(700n);
    // El único sitio donde venta y propina se suman es lo que entró físicamente.
    expect(desglose.efectivo.recibidoCentavos).toBe(750n);
  });
});

// ─────────────────────────────────── regla 4 · el cajón sí lleva la propina

describe('regla 4 · el efectivo esperado incluye la propina en efectivo', () => {
  it('suma la propina en efectivo, porque está en el cajón', () => {
    const desglose = desglosarPagos([
      { metodo: 'efectivo', montoCentavos: 700n, propinaCentavos: 50n },
    ]);

    expect(efectivoDelCajon(desglose)).toBe(750n);
    expect(efectivoDelCajon(desglose)).not.toBe(desglose.efectivo.ventasCentavos);
  });

  it('no suma la propina de tarjeta: esa no mueve el cajón', () => {
    const desglose = desglosarPagos([
      { metodo: 'efectivo', montoCentavos: 700n, propinaCentavos: 0n },
      { metodo: 'tarjeta', montoCentavos: 300n, propinaCentavos: 900n },
    ]);

    expect(efectivoDelCajon(desglose)).toBe(700n);
  });
});

// ──────────────────────────────── ningún esquema acepta un total del cliente

describe('ningún esquema de propina acepta un total', () => {
  const PROHIBIDAS = /total|importe|monto|centavos/i;

  it('la liquidación no declara ningún campo de dinero', () => {
    // Hoy `LiquidarPropinasDialog.jsx:103` manda `total_liquidado` calculado en
    // el navegador sobre una lista que puede llevar minutos abierta.
    expect(Object.keys(entradaLiquidarPropinas.shape).filter((c) => PROHIBIDAS.test(c))).toEqual(
      [],
    );
  });

  it('la consulta de pendientes tampoco', () => {
    expect(Object.keys(entradaPropinasPendientes.shape).filter((c) => PROHIBIDAS.test(c))).toEqual(
      [],
    );
  });

  it('un total colado en el cuerpo se descarta, no se usa', () => {
    const datos = entradaLiquidarPropinas.parse({
      rangoTipo: 'dia',
      ...RANGO,
      totalCentavos: 999_999,
      total_liquidado: 999_999,
    });

    expect('totalCentavos' in datos).toBe(false);
    expect('total_liquidado' in datos).toBe(false);
  });

  it('el cobro acepta propina POR MÉTODO, nunca un total de propina suelto', () => {
    // Un total de propina sin método obligaría a repartirlo, y repartir es
    // exactamente lo que la regla 3 prohíbe.
    expect(Object.keys(entradaCobrarOrdenConPropina.shape)).not.toContain('propinaCentavos');
    expect(Object.keys(entradaCobrarOrdenConPropina.shape)).toContain('pagos');
  });
});

// ───────────────────────────────── redondeo · lo que la aritmética ingenua rompe

describe('redondeo · el medio centavo aparece justo en las propinas', () => {
  it('el 5 % de $20.70 son 104 centavos, no 103', () => {
    // El caso real: 5 % es uno de los porcentajes sugeridos por omisión
    // (`getPorcentajesSugeridos`, `tipsUtils.js:18`), y sobre $20.70 la propina
    // exacta es 103.5 centavos. En punto flotante `20.70 * 0.05 * 100` vale
    // 103.49999999999999, así que la aritmética ingenua se come el medio centavo
    // y paga un centavo de menos al mesero, cada vez, sin que nada avise.
    expect(aplicarPorcentaje(centavos(2070n), 500)).toBe(104n);
    expect(Math.round(20.7 * 0.05 * 100)).toBe(103);
  });

  it('una propina tecleada como «1.005» son 101 centavos, no 100', () => {
    expect(desdeTexto('1.005')).toBe(101n);
    expect(Math.round(1.005 * 100)).toBe(100);
  });

  it('el 15 % de una cuenta de $33.33 no se pierde al sumarlo por método', () => {
    const propina = aplicarPorcentaje(centavos(3333n), 1500);
    expect(propina).toBe(500n);

    const desglose = desglosarPagos([
      { metodo: 'efectivo', montoCentavos: 3333n, propinaCentavos: propina },
    ]);
    expect(desglose.propinasCentavos).toBe(500n);
  });
});

// ─────────────────────────────────────────────────────────── rango y reclamo

describe('resolverRango', () => {
  it('devuelve los dos instantes de un periodo válido', () => {
    const rango = resolverRango(RANGO.desde, RANGO.hasta);
    expect(rango.inicio.toISOString()).toBe(RANGO.desde);
    expect(rango.fin.toISOString()).toBe(RANGO.hasta);
  });

  it('rechaza un periodo al revés en vez de liquidar cero en silencio', () => {
    expect(codigoDe(() => resolverRango(RANGO.hasta, RANGO.desde))).toBe('LIQUIDACION_INVALIDA');
  });

  it('rechaza un periodo que barrería el histórico entero', () => {
    expect(codigoDe(() => resolverRango('2020-01-01T00:00:00Z', '2026-01-01T00:00:00Z'))).toBe(
      'LIQUIDACION_INVALIDA',
    );
  });

  it('rechaza una fecha que no es una fecha', () => {
    expect(codigoDe(() => resolverRango('ayer', RANGO.hasta))).toBe('LIQUIDACION_INVALIDA');
  });
});

describe('explicarReclamo · una propina no se liquida dos veces', () => {
  it('si alguna ya estaba liquidada, aborta con PROPINA_YA_LIQUIDADA', () => {
    const error = explicarReclamo({
      solicitadas: ['a', 'b'],
      reclamadas: ['a'],
      yaLiquidadas: ['b'],
    });
    expect(error?.codigo).toBe('PROPINA_YA_LIQUIDADA');
  });

  it('si no se reclamó nada, el periodo no tenía propinas pendientes', () => {
    const error = explicarReclamo({ solicitadas: [], reclamadas: [], yaLiquidadas: [] });
    expect(error?.codigo).toBe('LIQUIDACION_INVALIDA');
  });

  it('si faltan ventas sin estar liquidadas, aborta entero y no liquida «casi todas»', () => {
    const error = explicarReclamo({
      solicitadas: ['a', 'b', 'c'],
      reclamadas: ['a', 'b'],
      yaLiquidadas: [],
    });
    expect(error?.codigo).toBe('LIQUIDACION_INVALIDA');
  });

  it('un reclamo completo no es un error', () => {
    expect(explicarReclamo({ solicitadas: ['a'], reclamadas: ['a'], yaLiquidadas: [] })).toBeNull();
  });

  it('sin lista explícita, basta con haber reclamado algo', () => {
    expect(explicarReclamo({ solicitadas: [], reclamadas: ['a'], yaLiquidadas: [] })).toBeNull();
  });
});

// ──────────────────────────────────── las puertas, con los comandos REALES

describe('las puertas del servidor', () => {
  const entrada = { rangoTipo: 'dia', ...RANGO };

  it('liquidar no existe en una tienda', async () => {
    const salida = await ejecutorDeProduccion('esencial')(liquidarPropinas, {
      entrada,
      ambito: AMBITO,
      idempotencyKey: 'clave-de-prueba-1',
    });
    expect(salida.ok ? 'ejecutó' : salida.error.codigo).toBe('PAQUETE_NO_INCLUYE');
  });

  it('un mesero no liquida sus propias propinas', async () => {
    const salida = await ejecutorDeProduccion('restaurante_pro')(liquidarPropinas, {
      entrada,
      ambito: { ...AMBITO, rol: 'mesero' },
      idempotencyKey: 'clave-de-prueba-2',
    });
    expect(salida.ok ? 'ejecutó' : salida.error.codigo).toBe('SIN_PERMISO');
  });

  it('cocina no ve propinas: nunca ve dinero (regla 9)', async () => {
    const salida = await ejecutorDeProduccion('restaurante_pro')(propinasPendientes, {
      entrada: { ...RANGO },
      ambito: { ...AMBITO, rol: 'cocina' },
    });
    expect(salida.ok ? 'ejecutó' : salida.error.codigo).toBe('SIN_PERMISO');
  });

  it('liquidar sin clave de idempotencia se rechaza', async () => {
    // Un doble clic en «Liquidar» son dos liquidaciones del mismo periodo.
    const salida = await ejecutorDeProduccion('restaurante_pro')(liquidarPropinas, {
      entrada,
      ambito: AMBITO,
    });
    expect(salida.ok ? 'ejecutó' : salida.error.codigo).toBe('IDEMPOTENCIA_REQUERIDA');
  });
});

// ──────────────────────────────────────────────────────────────── etiquetas

describe('etiquetas', () => {
  it('una venta sin mesero se etiqueta como venta directa', () => {
    expect(etiquetaDeMesero(null)).toBe(SIN_MESERO);
    expect(etiquetaDeMesero('   ')).toBe(SIN_MESERO);
    expect(etiquetaDeMesero('Juan')).toBe('Juan');
  });

  it('el folio de liquidación se dicta por teléfono', () => {
    // Sustituye a `LIQ-${format(new Date(), 'yyyyMMdd-HHmmss')}` de `:92`.
    expect(folioVisible('LIQ', 42n)).toBe('LIQ-000042');
  });
});
