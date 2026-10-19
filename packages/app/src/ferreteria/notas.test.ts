import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, EMPLEO, ORG } from '../restaurante/pruebas/sala.ts';
import { cancelarNota } from './notas.ts';

/**
 * `02-DINERO-Y-CAJA §8.5.1` · LA NOTA QUE NADIE VINO A PAGAR SE CANCELA (bloque D de la 2.4).
 *
 * «Una nota abierta es material comprometido que nadie cobró. O se cobra, o se cancela y el
 * material vuelve a estar disponible.» La caja no tenía con qué, y el cierre ya no deja
 * pasar una nota mandada y sin cobrar: sin esto, el cliente que se va sin pagar dejaba la
 * caja sin poder cerrarse.
 */

const NOTA = 'n1111111-1111-4111-8111-111111111111';
const ORDEN = 'o1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-10-08T23:10:00.000Z');

function baseDe(estadoDeLaNota: string, estadoDeLaOrden: string) {
  const nota: Fila = {
    id: NOTA,
    organizacion_id: ORG,
    orden_id: ORDEN,
    folio: 'N-12',
    estado: estadoDeLaNota,
    cerrada_en: null,
  };
  return crearBaseFalsa({
    notas_mostrador: [nota],
    ordenes: [
      {
        id: ORDEN,
        organizacion_id: ORG,
        estado: estadoDeLaOrden,
        motivo_cancelacion: null,
        cancelada_por: null,
        cancelada_en: null,
        cerrada_en: null,
      },
    ],
  });
}

async function codigoDe(promesa: Promise<unknown>): Promise<string> {
  return promesa
    .then(() => 'NO_LANZO')
    .catch((error: unknown) => (esErrorDominio(error) ? error.codigo : String(error)));
}

describe('nota_mostrador.cancelar', () => {
  it('la orden queda cancelada con quién, cuándo y por qué —y cerrada—, y la nota también', async () => {
    const base = baseDe('por_cobrar', 'confirmada');
    const { ctx, auditorias } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cancelarNota.ejecutar(ctx, {
      notaId: NOTA,
      motivo: 'el cliente se fue sin pagar',
    });

    expect(salida).toEqual({ notaId: NOTA, estado: 'cancelada' });
    expect(base.campo('ordenes', 'estado')).toBe('cancelada');
    expect(base.campo('ordenes', 'motivo_cancelacion')).toBe('el cliente se fue sin pagar');
    expect(base.campo('ordenes', 'cancelada_por')).toBe(EMPLEO);
    expect(base.campo('ordenes', 'cancelada_en')).toEqual(AHORA);
    // `orden_cerrada_con_fecha` (045): sin esto, Postgres rechaza la cancelación.
    expect(base.campo('ordenes', 'cerrada_en')).toEqual(AHORA);
    expect(base.campo('notas_mostrador', 'estado')).toBe('cancelada');
    expect(base.campo('notas_mostrador', 'cerrada_en')).toEqual(AHORA);
    expect(auditorias[0]?.payload).toEqual({
      ordenId: ORDEN,
      motivo: 'el cliente se fue sin pagar',
    });
  });

  it('lo que la caja ya cobró no se cancela: se devuelve, y no se toca nada', async () => {
    const base = baseDe('por_cobrar', 'pagada');
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(cancelarNota.ejecutar(ctx, { notaId: NOTA, motivo: 'se arrepintió' })),
    ).toBe('ORDEN_NO_EDITABLE');
    expect(base.campo('ordenes', 'estado')).toBe('pagada');
    expect(base.campo('notas_mostrador', 'estado')).toBe('por_cobrar');
  });

  it('una nota ya entregada o ya cancelada no se vuelve a cancelar', async () => {
    for (const estado of ['entregada', 'cancelada']) {
      const base = baseDe(estado, 'confirmada');
      const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
      expect(await codigoDe(cancelarNota.ejecutar(ctx, { notaId: NOTA, motivo: 'otra vez' }))).toBe(
        'CONFIGURACION_CONFLICTO',
      );
      expect(base.campo('ordenes', 'estado')).toBe('confirmada');
    }
  });

  it('una nota de otro negocio contesta como inexistente', async () => {
    const base = baseDe('por_cobrar', 'confirmada');
    const ajeno = { ...ambitoDe('cajero'), organizacionId: 'f9999999-9999-4999-8999-999999999999' };
    const { ctx } = contextoFalso(base.tx, ajeno, AHORA);

    expect(await codigoDe(cancelarNota.ejecutar(ctx, { notaId: NOTA, motivo: 'no es mía' }))).toBe(
      'PUENTE_NO_ENCONTRADO',
    );
    expect(base.campo('ordenes', 'estado')).toBe('confirmada');
  });

  it('sin motivo no se cancela', () => {
    expect(cancelarNota.entrada.safeParse({ notaId: NOTA, motivo: '  ' }).success).toBe(false);
  });
});
