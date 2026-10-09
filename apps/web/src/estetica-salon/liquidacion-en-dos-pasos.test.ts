import { describe, expect, it } from 'vitest';

import {
  comprobanteDeLaVista,
  pagarLaLiquidacion,
  RUTA_LIQUIDAR,
  RUTA_VISTA_PREVIA,
  verAntesDePagar,
  type Invocar,
  type VistaPrevia,
} from './liquidacion-en-dos-pasos.ts';

/**
 * F-427 · El comprobante se VE antes de pagar, y se paga lo que se vio.
 *
 * El botón que decía «calcular» ya sacaba el dinero del cajón: la dueña veía el recibo de
 * algo que ya había pasado. Aquí se afirma qué ruta toca cada paso y con qué.
 */

const PERIODO = { desde: '2026-10-09', hasta: '2026-10-11' };

const VISTA: VistaPrevia = {
  profesionalId: 'karla',
  nombreCompleto: 'Karla Domínguez',
  comisionCentavos: '70689',
  propinaCentavos: '5400',
  totalCentavos: '76089',
  cajaAbierta: true,
};

function grabadora(respuestas: Readonly<Record<string, unknown>>) {
  const llamadas: { ruta: string; cuerpo: Readonly<Record<string, unknown>> }[] = [];
  const invocar: Invocar = <T>(ruta: string, cuerpo: Readonly<Record<string, unknown>>) => {
    llamadas.push({ ruta, cuerpo });
    return Promise.resolve(respuestas[ruta] as T);
  };
  return { llamadas, invocar };
}

describe('la liquidación en dos pasos', () => {
  it('VER no paga: sólo toca la vista previa', async () => {
    const { llamadas, invocar } = grabadora({ [RUTA_VISTA_PREVIA]: VISTA });

    const vista = await verAntesDePagar(invocar, 'karla', PERIODO);

    expect(vista).toEqual(VISTA);
    expect(llamadas).toEqual([
      {
        ruta: RUTA_VISTA_PREVIA,
        cuerpo: { profesionalId: 'karla', periodoDesde: '2026-10-09', periodoHasta: '2026-10-11' },
      },
    ]);
  });

  it('la vista previa es un comprobante SIN sello: comisión y propina en su renglón', () => {
    const comprobante = comprobanteDeLaVista(VISTA);

    expect(comprobante.pagadaEn).toBeNull();
    expect(comprobante.comisionCentavos).toBe('70689');
    expect(comprobante.propinaCentavos).toBe('5400');
    expect(comprobante.totalCentavos).toBe('76089');
  });

  it('PAGAR entrega exactamente la propina que se enseñó, y trae el comprobante sellado', async () => {
    const sellado = { ...comprobanteDeLaVista(VISTA), liquidacionId: 'L1', pagadaEn: 'ya' };
    const { llamadas, invocar } = grabadora({
      [RUTA_LIQUIDAR]: { liquidacionId: 'L1' },
      [`${RUTA_LIQUIDAR}/L1/comprobante`]: sellado,
    });

    const comprobante = await pagarLaLiquidacion(invocar, VISTA, PERIODO);

    expect(llamadas[0]).toEqual({
      ruta: RUTA_LIQUIDAR,
      cuerpo: {
        profesionalId: 'karla',
        periodoDesde: '2026-10-09',
        periodoHasta: '2026-10-11',
        propinaCentavos: 5_400,
      },
    });
    expect(llamadas[1]?.ruta).toBe(`${RUTA_LIQUIDAR}/L1/comprobante`);
    expect(comprobante.pagadaEn).toBe('ya');
  });
});
