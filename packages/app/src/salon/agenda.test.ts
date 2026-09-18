import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { agendarCita, desdeMultirango } from './agenda.ts';

/**
 * F-400, F-402 y F-415 · Agendar, que en un salón es vender.
 *
 * Un salón no vende productos: vende tiempo de persona, y ese inventario se
 * agota todos los días a las siete de la tarde sin posibilidad de recuperarlo.
 */

const CLIENTA = 'c1111111-1111-4111-8111-111111111111';
const TINTE = 's1111111-1111-4111-8111-111111111111';
const CORTE = 's2222222-2222-4222-8222-222222222222';
const KARLA = 'z1111111-1111-4111-8111-111111111111';
const DANY = 'z2222222-2222-4222-8222-222222222222';
const AHORA = new Date('2026-09-15T09:00:00.000Z');
const A_LAS_10 = '2026-09-15T10:00:00.000Z';

const servicio = (id: string, extra: Record<string, unknown> = {}) => ({
  producto_id: id,
  organizacion_id: ORG,
  duracion_activa_1_min: 40,
  duracion_pasiva_min: 45,
  duracion_activa_2_min: 25,
  duracion_cierre_min: 10,
  ...extra,
});

const asignacion = (
  servicioId: string,
  profesionalId: string,
  extra: Record<string, unknown> = {},
) => ({
  servicio_id: servicioId,
  profesional_id: profesionalId,
  organizacion_id: ORG,
  precio_centavos: 100_000n,
  factor_duracion_bp: 10_000,
  ...extra,
});

function salon(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    clientes: [{ id: CLIENTA, organizacion_id: ORG, nombre: 'Sra. Paty' }],
    profesionales: [
      { id: KARLA, organizacion_id: ORG, nombre_corto: 'Karla', activo: true },
      { id: DANY, organizacion_id: ORG, nombre_corto: 'Dany', activo: true },
    ],
    servicios: [
      servicio(TINTE),
      servicio(CORTE, {
        duracion_activa_1_min: 30,
        duracion_pasiva_min: 0,
        duracion_activa_2_min: 0,
        duracion_cierre_min: 5,
      }),
    ],
    servicios_profesional: [
      asignacion(TINTE, KARLA),
      asignacion(CORTE, KARLA, { precio_centavos: 25_000n }),
      asignacion(CORTE, DANY, { precio_centavos: 20_000n }),
    ],
    productos: [
      { id: TINTE, organizacion_id: ORG, nombre: 'Tinte', precio_venta_centavos: 90_000n },
      { id: CORTE, organizacion_id: ORG, nombre: 'Corte', precio_venta_centavos: 22_000n },
    ],
    citas: [],
    cita_servicios: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(salon(extra), {
    filasCrudas: [{ siguiente: 42n }],
    predeterminados: {
      citas: {
        cliente_id: null,
        llego_en: null,
        inicio_real: null,
        fin_real: null,
        orden_id: null,
        cita_origen_id: null,
        es_rehacer: false,
        es_cortesia: false,
        motivo_cancelacion: null,
        no_llego_marcado_en: null,
        no_llego_marcado_por: null,
        notas: null,
      },
      cita_servicios: { cerrado_en: null, orden_linea_id: null },
    },
  });

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('agenda.agendar_cita', () => {
  it('EL RANGO ACTIVO SE PARTE, y el de ocupación no', () => {
    // Es la función entera: el profesional queda libre durante el procesado y
    // la estación no.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    return agendarCita
      .ejecutar(ctx, {
        origen: 'mostrador',
        clienteId: CLIENTA,
        inicio: A_LAS_10,
        servicios: [{ servicioId: TINTE, profesionalId: KARLA }],
      })
      .then(() => {
        const activo = String(base.campo('cita_servicios', 'rango_activo'));
        expect(desdeMultirango(activo)).toHaveLength(2);
        expect(String(base.campo('cita_servicios', 'rango_ocupacion'))).toContain('12:00');
      });
  });

  it('EL PRECIO LO PONE EL SERVIDOR, y el de la persona manda', async () => {
    // El mostrador manda QUÉ servicio, nunca cuánto cuesta. Y un director cobra
    // más por el mismo corte: ésa es la escalera de precios del salón.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agendarCita.ejecutar(ctx, {
      origen: 'mostrador',
      inicio: A_LAS_10,
      servicios: [{ servicioId: CORTE, profesionalId: KARLA }],
    });

    expect(salida.servicios[0]?.precioCentavos).toBe('25000');
    expect(base.campo('cita_servicios', 'precio_centavos')).toBe(25_000n);
  });

  it('SIN PRECIO PROPIO manda el del catálogo', async () => {
    const base = baseDe({
      servicios_profesional: [asignacion(CORTE, KARLA, { precio_centavos: null })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agendarCita.ejecutar(ctx, {
      origen: 'mostrador',
      inicio: A_LAS_10,
      servicios: [{ servicioId: CORTE, profesionalId: KARLA }],
    });

    expect(salida.servicios[0]?.precioCentavos).toBe('22000');
  });

  it('EL FACTOR DE LA PERSONA cambia la agenda', async () => {
    // Karla hace el mismo tinte en menos tiempo. Con el mismo número, su agenda
    // queda con huecos todos los días.
    const base = baseDe({
      servicios_profesional: [asignacion(TINTE, KARLA, { factor_duracion_bp: 7_500 })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agendarCita.ejecutar(ctx, {
      origen: 'mostrador',
      inicio: A_LAS_10,
      servicios: [{ servicioId: TINTE, profesionalId: KARLA }],
    });

    // 30 de aplicación + 45 de procesado + 19 de terminado = 49 activos.
    expect(salida.servicios[0]?.minutosActivos).toBe(49);
    expect(salida.servicios[0]?.minutosIntercalables).toBe(45);
  });

  it('DOS SERVICIOS SE ENCADENAN: el corte empieza cuando acaba el tinte', async () => {
    // Agendarlos a la misma hora es lo que hace que la clienta llegue y
    // encuentre a las dos personas ocupadas.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agendarCita.ejecutar(ctx, {
      origen: 'mostrador',
      inicio: A_LAS_10,
      servicios: [
        { servicioId: TINTE, profesionalId: KARLA },
        { servicioId: CORTE, profesionalId: DANY },
      ],
    });

    expect(salida.servicios[0]?.fin).toBe('2026-09-15T12:00:00.000Z');
    expect(salida.servicios[1]?.inicio).toBe('2026-09-15T12:00:00.000Z');
    expect(salida.totalEstimadoCentavos).toBe('120000');
  });

  it('NADIE QUEDA AGENDADO DOS VECES a la misma hora', async () => {
    const base = baseDe();
    const uno = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    await agendarCita.ejecutar(uno.ctx, {
      origen: 'mostrador',
      inicio: A_LAS_10,
      servicios: [{ servicioId: TINTE, profesionalId: KARLA }],
    });

    const dos = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    expect(
      await codigoDe(() =>
        agendarCita.ejecutar(dos.ctx, {
          origen: 'mostrador',
          inicio: '2026-09-15T10:20:00.000Z',
          servicios: [{ servicioId: CORTE, profesionalId: KARLA }],
        }),
      ),
    ).toBe('CONFIGURACION_CONFLICTO');
  });

  it('DENTRO DEL PROCESADO SÍ CABE OTRA, y ahí está el dinero', async () => {
    // Mientras la clienta del tinte procesa, Karla corta a otra. Es el 25-40 %
    // de capacidad que ningún competidor aprovecha.
    const base = baseDe();
    const uno = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    await agendarCita.ejecutar(uno.ctx, {
      origen: 'mostrador',
      inicio: A_LAS_10,
      servicios: [{ servicioId: TINTE, profesionalId: KARLA }],
    });

    const dos = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    const salida = await agendarCita.ejecutar(dos.ctx, {
      origen: 'mostrador',
      inicio: '2026-09-15T10:45:00.000Z',
      servicios: [{ servicioId: CORTE, profesionalId: KARLA }],
    });

    expect(salida.citaId).toBeTruthy();
    expect(base.filas('citas')).toHaveLength(2);
  });

  it('QUIEN NO DA ESE SERVICIO no lo da', async () => {
    // Agendarle un tinte a quien sólo corta es cómo la clienta llega a las diez
    // y se va sin servicio.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        agendarCita.ejecutar(ctx, {
          origen: 'mostrador',
          inicio: A_LAS_10,
          servicios: [{ servicioId: TINTE, profesionalId: DANY }],
        }),
      ),
    ).toBe('CONFIGURACION_INVALIDA');
  });

  it('QUIEN YA NO TRABAJA AQUÍ no recibe citas', async () => {
    const base = baseDe({
      profesionales: [{ id: KARLA, organizacion_id: ORG, nombre_corto: 'Karla', activo: false }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        agendarCita.ejecutar(ctx, {
          origen: 'mostrador',
          inicio: A_LAS_10,
          servicios: [{ servicioId: TINTE, profesionalId: KARLA }],
        }),
      ),
    ).toBe('CONFIGURACION_INVALIDA');
  });

  it('LA CITA NACE SIN ORDEN', async () => {
    // Crearla al agendar metería el importe de todo lo agendado en el reporte
    // del día, y el salón cerraría el mes creyendo que vendió un 18 % más.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await agendarCita.ejecutar(ctx, {
      origen: 'mostrador',
      inicio: A_LAS_10,
      servicios: [{ servicioId: CORTE, profesionalId: KARLA }],
    });

    expect(base.campo('citas', 'orden_id')).toBeNull();
    expect(base.campo('citas', 'estado')).toBe('agendada');
    expect(base.filas('ordenes')).toEqual([]);
  });

  it('LA CITA LLEVA SU PROPIA SERIE de folio', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agendarCita.ejecutar(ctx, {
      origen: 'mostrador',
      inicio: A_LAS_10,
      servicios: [{ servicioId: CORTE, profesionalId: KARLA }],
    });

    expect(salida.folio).toBe('CITA-42');
  });

  it('EL WALK-IN SIN DATOS se agenda igual', async () => {
    // La clienta que entra preguntando si hay lugar. Exigirle datos en la
    // puerta es cómo se pierde la venta más fácil del día.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agendarCita.ejecutar(ctx, {
      origen: 'walk_in',
      inicio: A_LAS_10,
      servicios: [{ servicioId: CORTE, profesionalId: KARLA }],
    });

    expect(salida.citaId).toBeTruthy();
    expect(base.campo('citas', 'cliente_id')).toBeNull();
    expect(base.campo('citas', 'origen')).toBe('walk_in');
  });

  it('una clienta de otro negocio', async () => {
    const base = baseDe({ clientes: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        agendarCita.ejecutar(ctx, {
          origen: 'mostrador',
          clienteId: CLIENTA,
          inicio: A_LAS_10,
          servicios: [{ servicioId: CORTE, profesionalId: KARLA }],
        }),
      ),
    ).toBe('PUENTE_NO_ENCONTRADO');
  });

  it('SIN SUCURSAL no hay folio que tomar', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, { ...ambitoDe('cajero'), sucursalId: null }, AHORA);

    expect(
      await codigoDe(() =>
        agendarCita.ejecutar(ctx, {
          origen: 'mostrador',
          inicio: A_LAS_10,
          servicios: [{ servicioId: CORTE, profesionalId: KARLA }],
        }),
      ),
    ).toBe('VENTA_SIN_TERMINAL');
    expect(SUCURSAL).toBeTruthy();
  });
});

describe('desdeMultirango', () => {
  it('lee lo que escribe', () => {
    const texto =
      '{[2026-09-15T10:00:00.000Z,2026-09-15T10:40:00.000Z),[2026-09-15T11:25:00.000Z,2026-09-15T11:50:00.000Z)}';
    const rangos = desdeMultirango(texto);

    expect(rangos).toHaveLength(2);
    expect(rangos[1]?.inicio.toISOString()).toBe('2026-09-15T11:25:00.000Z');
  });

  it('un multirango vacío no revienta', () => {
    expect(desdeMultirango('{}')).toEqual([]);
  });
});
