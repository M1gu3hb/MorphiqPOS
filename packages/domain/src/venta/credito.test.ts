import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { evaluarSalidaACredito, repartirPago, type SalidaACredito } from './credito.ts';

/**
 * F-610, F-638 y F-639 · Las tres puertas del crédito.
 *
 * Es el dolor 1 de una ferretería. La regla que gobierna las tres: **aviso, no
 * muro**. A veces el albañil nuevo sí viene de parte del inge, y lo que hace
 * falta es una llamada de treinta segundos ANTES de despachar.
 */

function salida(extra: Partial<SalidaACredito> = {}): SalidaACredito {
  return {
    importeCentavos: 600_000n,
    saldoClienteCentavos: 0n,
    limiteClienteCentavos: 5_000_000n,
    bloqueadoPorMora: false,
    obra: null,
    autorizado: { activo: true, topePorSalidaCentavos: null },
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

describe('evaluarSalidaACredito', () => {
  it('EL AUTORIZADO CON TODO EN ORDEN SALE LIBRE', () => {
    const evaluacion = evaluarSalidaACredito(salida());

    expect(evaluacion.veredicto).toBe('libre');
    expect(evaluacion.motivos).toEqual([]);
    expect(evaluacion.disponibleDespuesCentavos).toBe(4_400_000n);
  });

  it('PUERTA 1 · EL QUE NO ESTÁ EN LA LISTA AVISA, NO BLOQUEA', () => {
    // El cuarto albañil a veces sí viene de parte del inge. Lo que hace falta
    // es una llamada antes de despachar, no un sistema que diga que no.
    const evaluacion = evaluarSalidaACredito(salida({ autorizado: null }));

    expect(evaluacion.veredicto).toBe('aviso');
    expect(evaluacion.motivos).toEqual(['no_autorizado']);
  });

  it('EL AUTORIZADO DADO DE BAJA es lo mismo que no estar', () => {
    // Se da de baja, nunca se borra: las remisiones que firmó siguen siendo
    // auditables. Pero para despachar hoy, vale igual que no estar.
    const evaluacion = evaluarSalidaACredito(
      salida({ autorizado: { activo: false, topePorSalidaCentavos: null } }),
    );

    expect(evaluacion.motivos).toEqual(['no_autorizado']);
  });

  it('EL TOPE POR AUTORIZADO avisa cuando se pasa', () => {
    const evaluacion = evaluarSalidaACredito(
      salida({ autorizado: { activo: true, topePorSalidaCentavos: 500_000n } }),
    );

    expect(evaluacion.motivos).toEqual(['excede_tope_del_autorizado']);
  });

  it('EN EL TOPE EXACTO no se avisa: el tope es lo que SÍ puede llevarse', () => {
    const evaluacion = evaluarSalidaACredito(
      salida({ autorizado: { activo: true, topePorSalidaCentavos: 600_000n } }),
    );

    expect(evaluacion.motivos).toEqual([]);
  });

  it('PUERTA 3 · EL LÍMITE DEL CLIENTE se mira ANTES de despachar', () => {
    // A las 7:40 con prisa. Cuando el dueño lo revisa a las once, ya salió.
    const evaluacion = evaluarSalidaACredito(
      salida({ saldoClienteCentavos: 4_800_000n, limiteClienteCentavos: 5_000_000n }),
    );

    expect(evaluacion.motivos).toEqual(['excede_limite_del_cliente']);
    expect(evaluacion.veredicto).toBe('aviso');
  });

  it('UN LÍMITE EN CERO ES «NO DECLARADO», no cero pesos de crédito', () => {
    // Tratarlo como cero pondría en aviso a todo cliente nuevo desde su primera
    // compra, y el aviso dejaría de significar algo la primera semana.
    const evaluacion = evaluarSalidaACredito(salida({ limiteClienteCentavos: 0n }));

    expect(evaluacion.veredicto).toBe('libre');
  });

  it('PUERTA 2 · LA OBRA LLEVA SU PROPIO LÍMITE', () => {
    const evaluacion = evaluarSalidaACredito(
      salida({ obra: { saldoCentavos: 1_800_000n, limiteCentavos: 2_000_000n, cerrada: false } }),
    );

    expect(evaluacion.motivos).toEqual(['excede_limite_de_la_obra']);
  });

  it('LA OBRA CERRADA no recibe más material', () => {
    // Es cómo el saldo que ya se conversó y se cobró vuelve a moverse meses
    // después.
    const evaluacion = evaluarSalidaACredito(
      salida({ obra: { saldoCentavos: 0n, limiteCentavos: null, cerrada: true } }),
    );

    expect(evaluacion.motivos).toEqual(['obra_cerrada']);
  });

  it('LA MORA ES LO ÚNICO QUE EXIGE LLAVE', () => {
    // Es la única condición que el dueño ya decidió antes, en frío. Lo demás son
    // juicios de mostrador que se toman con una llamada.
    const evaluacion = evaluarSalidaACredito(salida({ bloqueadoPorMora: true }));

    expect(evaluacion.veredicto).toBe('requiere_llave');
  });

  it('SE DEVUELVEN TODOS LOS MOTIVOS, no el primero', () => {
    // «No está en la lista» y «además se pasa del límite» son dos llamadas
    // distintas. Con sólo el primero habría que despachar, chocar con el
    // segundo, y volver a llamar.
    const evaluacion = evaluarSalidaACredito(
      salida({
        autorizado: null,
        saldoClienteCentavos: 4_800_000n,
        obra: { saldoCentavos: 0n, limiteCentavos: null, cerrada: true },
      }),
    );

    expect(evaluacion.motivos).toEqual([
      'no_autorizado',
      'excede_limite_del_cliente',
      'obra_cerrada',
    ]);
  });

  it('una salida de cero no es una salida', () => {
    expect(codigoDe(() => evaluarSalidaACredito(salida({ importeCentavos: 0n })))).toBe(
      'CONFIGURACION_INVALIDA',
    );
  });
});

describe('repartirPago', () => {
  const viejo = { id: 'R-100', saldoCentavos: 200_000n, fecha: new Date('2026-06-01T00:00:00Z') };
  const medio = { id: 'R-200', saldoCentavos: 300_000n, fecha: new Date('2026-07-01T00:00:00Z') };
  const nuevo = { id: 'R-300', saldoCentavos: 400_000n, fecha: new Date('2026-08-01T00:00:00Z') };

  it('EL MÁS VIEJO PRIMERO: es lo que hace que la antigüedad signifique algo', () => {
    // Aplicando al más nuevo, el documento de hace noventa días seguiría ahí
    // para siempre y el reporte diría que el cliente está peor de lo que está.
    const reparto = repartirPago(350_000n, [nuevo, viejo, medio]);

    expect(reparto.aplicaciones).toEqual([
      { documentoId: 'R-100', montoCentavos: 200_000n },
      { documentoId: 'R-200', montoCentavos: 150_000n },
    ]);
    expect(reparto.sobranteCentavos).toBe(0n);
  });

  it('LO QUE SOBRA QUEDA A FAVOR, no se reparte', () => {
    // Repartirlo entre documentos ya saldados produciría saldos negativos, y el
    // estado de cuenta dejaría de sumarse.
    const reparto = repartirPago(1_000_000n, [viejo, medio]);

    expect(reparto.sobranteCentavos).toBe(500_000n);
    expect(reparto.aplicaciones).toHaveLength(2);
  });

  it('NINGÚN DOCUMENTO RECIBE MÁS DE SU SALDO', () => {
    const reparto = repartirPago(1_000_000n, [viejo]);

    expect(reparto.aplicaciones[0]?.montoCentavos).toBe(200_000n);
  });

  it('EL DOCUMENTO SALDADO no vuelve a aparecer', () => {
    const saldado = { id: 'R-050', saldoCentavos: 0n, fecha: new Date('2026-01-01T00:00:00Z') };
    const reparto = repartirPago(100_000n, [saldado, viejo]);

    expect(reparto.aplicaciones.map((a) => a.documentoId)).toEqual(['R-100']);
  });

  it('EL EMPATE DE FECHA SE ROMPE ESTABLE: dos repartos iguales', () => {
    const a = { id: 'R-B', saldoCentavos: 100_000n, fecha: viejo.fecha };
    const b = { id: 'R-A', saldoCentavos: 100_000n, fecha: viejo.fecha };

    expect(repartirPago(100_000n, [a, b]).aplicaciones[0]?.documentoId).toBe('R-A');
    expect(repartirPago(100_000n, [b, a]).aplicaciones[0]?.documentoId).toBe('R-A');
  });

  it('LA SUMA DE LO APLICADO MÁS EL SOBRANTE es el pago', () => {
    for (const monto of [50_000n, 350_000n, 900_000n, 1_500_000n]) {
      const reparto = repartirPago(monto, [viejo, medio, nuevo]);
      const aplicado = reparto.aplicaciones.reduce((a, x) => a + x.montoCentavos, 0n);
      expect(aplicado + reparto.sobranteCentavos).toBe(monto);
    }
  });

  it('un pago de cero no abona nada', () => {
    expect(codigoDe(() => repartirPago(0n, [viejo]))).toBe('CONFIGURACION_INVALIDA');
  });

  it('un pago sin documentos queda entero a favor', () => {
    const reparto = repartirPago(100_000n, []);

    expect(reparto.aplicaciones).toEqual([]);
    expect(reparto.sobranteCentavos).toBe(100_000n);
  });
});
