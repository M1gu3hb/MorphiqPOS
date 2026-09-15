import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, EMPLEO, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { ajustarPresencia, repartirBote } from './bote.ts';

/**
 * F-248 · El bote del turno, repartido por horas.
 *
 * Es el dolor 2 de `restaurante` en su versión de mostrador: el reparto se hace
 * a ojo, en efectivo, y en cuanto entra un tercero los fines de semana empieza
 * el resentimiento. «Yo estuve toda la tarde» contra «yo abrí» no se resuelve
 * discutiendo.
 */

const SESION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTRO = '55555555-5555-4555-8555-555555555558';
const ABIERTA = new Date('2026-09-15T07:00:00.000Z');
const CERRADA = new Date('2026-09-15T15:00:00.000Z');
const AHORA = new Date('2026-09-15T15:10:00.000Z');

function presencia(empleadoId: string, minutos: number | null, cambios: Fila = {}): Fila {
  return {
    id: `p-${empleadoId}`,
    organizacion_id: ORG,
    sesion_caja_id: SESION,
    empleado_id: empleadoId,
    entro_en: ABIERTA,
    salio_en: minutos === null ? null : new Date(ABIERTA.getTime() + minutos * 60_000),
    minutos,
    origen: 'pin',
    ajustada_por: null,
    motivo_ajuste: null,
    ...cambios,
  };
}

function turno(extra: Partial<TablasFalsas> = {}, sesion: Fila = {}): TablasFalsas {
  return {
    sesiones_caja: [
      {
        id: SESION,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        estado: 'cerrada',
        abierta_en: ABIERTA,
        cerrada_en: CERRADA,
        // $1,200 de bote.
        bote_contado_centavos: 120_000n,
        ...sesion,
      },
    ],
    // Ocho horas el que abrió, cuatro el de la tarde.
    presencias_turno: [presencia(EMPLEO, 480), presencia(OTRO, 240)],
    liquidaciones_propina: [],
    liquidacion_propina_beneficiarios: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}, sesion: Fila = {}) =>
  crearBaseFalsa(turno(extra, sesion), { filasCrudas: [{ siguiente: 1n }] });

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-248 · repartir el bote', () => {
  it('REPARTE POR HORAS, al centavo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await repartirBote.ejecutar(ctx, { sesionCajaId: SESION });

    // 480 y 240 minutos sobre $1,200: $800 y $400.
    const porEmpleo = new Map(salida.partes.map((p) => [p.empleoId, p.montoCentavos]));
    expect(porEmpleo.get(EMPLEO)).toBe('80000');
    expect(porEmpleo.get(OTRO)).toBe('40000');
    expect(salida.partes.reduce((a, p) => a + BigInt(p.montoCentavos), 0n)).toBe(120_000n);
  });

  it('EL DOCUMENTO DICE CÓMO SE REPARTIÓ', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await repartirBote.ejecutar(ctx, { sesionCajaId: SESION });

    expect(salida.repartoBase).toBe('horas');
    const liquidacion = base.filas('liquidaciones_propina')[0];
    expect(liquidacion?.['reparto_base']).toBe('horas');
    // Y la fórmula queda congelada con las presencias que la produjeron.
    const formula = JSON.parse(String(liquidacion?.['formula_snapshot'])) as {
      base: string;
      presencias: unknown[];
    };
    expect(formula.base).toBe('horas');
    expect(formula.presencias).toHaveLength(2);
  });

  it('DICE TAMBIÉN SI LAS HORAS SE TECLEARON', async () => {
    // Un reparto sobre horas corregidas a mano no es lo mismo que uno sobre
    // horas registradas, y quien cobra menos tiene derecho a saberlo.
    const base = baseDe({
      presencias_turno: [
        presencia(EMPLEO, 480, {
          origen: 'manual',
          ajustada_por: EMPLEO,
          motivo_ajuste: 'olvidó salir',
        }),
        presencia(OTRO, 240),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await repartirBote.ejecutar(ctx, { sesionCajaId: SESION });

    expect(salida.hayHorasTecleadas).toBe(true);
  });

  it('UN TURNO ABIERTO no se reparte: el bote todavía va a cambiar', async () => {
    const base = baseDe({}, { estado: 'abierta', cerrada_en: null });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect(await codigoDe(() => repartirBote.ejecutar(ctx, { sesionCajaId: SESION }))).toBe(
      'LIQUIDACION_INVALIDA',
    );
  });

  it('UN BOTE SIN CONTAR NO ES UN BOTE EN CERO', async () => {
    // Repartir cero cuando nadie contó sería firmar un documento que dice que
    // no hubo propina esa noche.
    const base = baseDe({}, { bote_contado_centavos: null });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect(await codigoDe(() => repartirBote.ejecutar(ctx, { sesionCajaId: SESION }))).toBe(
      'LIQUIDACION_INVALIDA',
    );
    expect(base.filas('liquidaciones_propina')).toEqual([]);
  });

  it('UN TURNO SE REPARTE UNA VEZ', async () => {
    const base = baseDe();
    const uno = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);
    await repartirBote.ejecutar(uno.ctx, { sesionCajaId: SESION });

    const dos = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);
    expect(await codigoDe(() => repartirBote.ejecutar(dos.ctx, { sesionCajaId: SESION }))).toBe(
      'PROPINA_YA_LIQUIDADA',
    );
    expect(base.filas('liquidaciones_propina')).toHaveLength(1);
  });

  it('sin presencias cerradas no hay proporción que repartir', async () => {
    const base = baseDe({ presencias_turno: [presencia(EMPLEO, null)] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect(await codigoDe(() => repartirBote.ejecutar(ctx, { sesionCajaId: SESION }))).toBe(
      'LIQUIDACION_INVALIDA',
    );
  });

  it('EL QUE COBRA EN EL TURNO NO FIRMA SU PROPIO REPARTO', () => {
    expect(repartirBote.roles).not.toContain('cajero');
    expect(repartirBote.roles).toContain('gerente');
  });
});

describe('F-248 · corregir una presencia', () => {
  it('queda marcada como MANUAL, con quién y por qué', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await ajustarPresencia.ejecutar(ctx, {
      presenciaId: `p-${OTRO}`,
      salioEn: '2026-09-15T15:00:00.000Z',
      motivo: 'olvidó cerrar sesión',
    });

    const fila = base.filas('presencias_turno').find((p) => p['id'] === `p-${OTRO}`);
    expect(fila?.['origen']).toBe('manual');
    expect(fila?.['motivo_ajuste']).toBe('olvidó cerrar sesión');
    expect(fila?.['ajustada_por']).toBe(EMPLEO);
  });

  it('UN REPARTO FIRMADO NO SE RECALCULA', async () => {
    // Corregir las horas después cambiaría la base de un documento que la gente
    // ya cobró, y el sistema pasaría de resolver el pleito a crearlo.
    const base = baseDe();
    const reparto = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);
    await repartirBote.ejecutar(reparto.ctx, { sesionCajaId: SESION });

    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);
    expect(
      await codigoDe(() =>
        ajustarPresencia.ejecutar(ctx, {
          presenciaId: `p-${OTRO}`,
          salioEn: '2026-09-15T18:00:00.000Z',
          motivo: 'me faltaron horas',
        }),
      ),
    ).toBe('PROPINA_YA_LIQUIDADA');
  });

  it('una salida anterior a la entrada daría minutos negativos', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect(
      await codigoDe(() =>
        ajustarPresencia.ejecutar(ctx, {
          presenciaId: `p-${OTRO}`,
          salioEn: '2026-09-15T06:00:00.000Z',
          motivo: 'error',
        }),
      ),
    ).toBe('LIQUIDACION_INVALIDA');
  });

  it('un ajuste que no cambia ninguna hora no es un ajuste', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect(
      await codigoDe(() =>
        ajustarPresencia.ejecutar(ctx, { presenciaId: `p-${OTRO}`, motivo: 'porque sí' }),
      ),
    ).toBe('LIQUIDACION_INVALIDA');
  });

  it('EL MOTIVO ES OBLIGATORIO: un ajuste sin rastro infla horas', () => {
    expect(
      ajustarPresencia.entrada.safeParse({
        presenciaId: '11111111-1111-4111-8111-111111111111',
        salioEn: '2026-09-15T15:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});
