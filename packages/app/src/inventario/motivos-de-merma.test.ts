import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { motivosDeMerma } from './motivos-de-merma.ts';

/**
 * Los motivos que un negocio puede elegir: los del tronco y los de SU giro. Una tienda no
 * ve «calibración del molino» (C.10 de la 2.4).
 */

const motivo = (clave: string, giro: string | null, activo = true) => ({
  clave,
  etiqueta: clave,
  giro,
  imputable: false,
  activo,
});

describe('inventario.motivos_de_merma', () => {
  it('el tronco y el giro del negocio; ni otro giro ni los apagados', async () => {
    const base = crearBaseFalsa({
      organizaciones: [{ id: ORG, giro: 'tienda' }],
      motivos_merma: [
        motivo('caducado', null),
        motivo('ajuste_conteo', null),
        motivo('redondeo_especie', 'tienda'),
        motivo('calibracion', 'cafeteria'),
        motivo('viejo', null, false),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await motivosDeMerma.ejecutar(ctx, {});

    expect(salida.motivos.map((m) => m.clave).toSorted()).toEqual([
      'ajuste_conteo',
      'caducado',
      'redondeo_especie',
    ]);
  });
});
