import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { capturarFormula } from './formula.ts';

/**
 * F-154 · La fórmula que de verdad se mezcló.
 *
 * ── Qué defienden estas pruebas ──────────────────────────────────────────
 * Que el SOBRANTE se guarde. Es el 10–20 % del tinte que hoy se tira sin apunte, y
 * guardar sólo lo usado esconde justo el número que dice cuánto se desperdicia.
 *
 * Que se cuelgue del SERVICIO EN CURSO y no de cualquiera: una cita de tinte y
 * corte tiene dos, y una fórmula atribuida al corte hace mentir al reporte de
 * consumo por servicio.
 *
 * Y que una cita SIN FICHA lo diga en vez de escribir una fórmula que nadie va a
 * volver a encontrar: el expediente es de la clienta.
 */

const AHORA = new Date('2026-09-19T18:30:00.000Z');
const CITA = 'c1111111-1111-4111-8111-111111111111';
const CLIENTA = 'c2222222-2222-4222-8222-222222222222';
const TINTE = 'c3333333-3333-4333-8333-333333333333';
const CORTE = 'c4444444-4444-4444-8444-444444444444';
const PROFESIONAL = 'c5555555-5555-4555-8555-555555555555';

function servicio(id: string, estado: string, cambios: Fila = {}): Fila {
  return {
    id,
    organizacion_id: ORG,
    cita_id: CITA,
    servicio_id: `s-${id}`,
    profesional_id: PROFESIONAL,
    estado,
    ...cambios,
  };
}

function baseDe(clienteId: string | null = CLIENTA, servicios = [servicio(TINTE, 'en_curso')]) {
  return crearBaseFalsa(
    {
      citas: [{ id: CITA, organizacion_id: ORG, cliente_id: clienteId, estado: 'en_curso' }],
      cita_servicios: servicios,
      formulas_aplicadas: [],
    },
    {
      predeterminados: {
        formulas_aplicadas: { minutos_procesado: null, resultado: null },
      },
    },
  );
}

const mezcla = (cambios: Record<string, unknown> = {}) => ({
  citaId: CITA,
  mezclado: 60,
  usado: 45,
  componentes: [{ nombre: 'Tono 7.1', cantidad: 30, unidad: 'g' }],
  minutos: 35,
  resultado: null,
  ...cambios,
});

describe('F-154 · la fórmula aplicada', () => {
  it('EL SOBRANTE SE GUARDA: mezclado menos usado', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await capturarFormula.ejecutar(ctx, mezcla());

    expect(salida.sobrante).toBe(15);
    const guardada = String(base.campo('formulas_aplicadas', 'formula'));
    expect(guardada).toContain('"sobrante":15');
    expect(guardada).toContain('Tono 7.1');
    expect(base.campo('formulas_aplicadas', 'minutos_procesado')).toBe(35);
    expect(base.campo('formulas_aplicadas', 'cliente_id')).toBe(CLIENTA);
  });

  it('SE CUELGA DEL SERVICIO EN CURSO, no del que ya se cerró', async () => {
    // La fórmula es del tinte, que es el que está abierto cuando se mezcla.
    const base = baseDe(CLIENTA, [
      servicio(CORTE, 'cerrado'),
      servicio(TINTE, 'en_curso', { servicio_id: 's-tinte' }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await capturarFormula.ejecutar(ctx, mezcla());

    expect(base.campo('formulas_aplicadas', 'cita_servicio_id')).toBe(TINTE);
    expect(base.campo('formulas_aplicadas', 'servicio_id')).toBe('s-tinte');
  });

  it('SIN FICHA no se guarda, y se dice por qué', async () => {
    const base = baseDe(null);
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const fallo = await capturarFormula.ejecutar(ctx, mezcla()).catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('CONFIGURACION_INVALIDA');
    expect(base.filas('formulas_aplicadas')).toEqual([]);
  });

  it('UNA CITA DE OTRO NEGOCIO no existe', async () => {
    const base = crearBaseFalsa({ citas: [], cita_servicios: [], formulas_aplicadas: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const fallo = await capturarFormula.ejecutar(ctx, mezcla()).catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('PUENTE_NO_ENCONTRADO');
  });
});
