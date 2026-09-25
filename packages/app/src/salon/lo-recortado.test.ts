import { describe, expect, it } from 'vitest';

import { transaccionGrabadora } from '../pruebas/grabadora.ts';
import { contextoFalso } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, EMPLEO, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { existenciasDelSalon } from './cabina-existencias.ts';
import { fotosDeClienta } from './expediente-fotos.ts';
import { anotarCita } from './notas.ts';
import { asignarRegla, guardarRegla, pendientesPorProfesional } from './reglas-comision.ts';

/**
 * C.10 de la 2.4 · Lo que las pantallas del salón decían que faltaba, en el servidor:
 * las fotos del expediente, la nota de la cita, la existencia por lugar, la regla de
 * comisión y el pendiente por persona. Sobre el SQL COMPILADO: cada lectura lleva su
 * negocio, cada escritura su guarda.
 */
const AHORA = new Date('2026-09-25T15:00:00.000Z');
const CLIENTA = 'cc000000-0000-4000-8000-000000000001';
const CITA = 'dd000000-0000-4000-8000-000000000001';
const KARLA = 'aa000000-0000-4000-8000-000000000001';
const REGLA = 'ee000000-0000-4000-8000-000000000001';
const NUEVA = 'ee000000-0000-4000-8000-000000000002';

describe('expediente.fotos', () => {
  it('las de ESA clienta, la más reciente primero, con su servicio y su consentimiento', async () => {
    const { tx, conexion } = transaccionGrabadora([
      [
        {
          id: 'f2',
          archivo_url: 'https://pos/api/archivos/b',
          momento: 'despues',
          tomada_en: new Date('2026-09-20T12:00:00.000Z'),
          cita_servicio_id: 'cs1',
          consentimiento_id: 'k1',
        },
        {
          id: 'f1',
          archivo_url: 'https://pos/api/archivos/a',
          momento: 'antes',
          tomada_en: new Date('2026-09-20T11:00:00.000Z'),
          cita_servicio_id: null,
          consentimiento_id: null,
        },
      ],
      [{ id: 'cs1', servicio_id: 'tinte' }],
      [{ id: 'tinte', nombre: 'Tinte completo' }],
    ]);
    const { ctx } = contextoFalso(tx, ambitoDe('mesero'), AHORA);
    const { fotos } = await fotosDeClienta.ejecutar(ctx, { clienteId: CLIENTA });

    expect(fotos).toEqual([
      expect.objectContaining({
        fotoId: 'f2',
        momento: 'despues',
        servicioNombre: 'Tinte completo',
        conConsentimiento: true,
      }),
      expect.objectContaining({
        fotoId: 'f1',
        momento: 'antes',
        servicioNombre: null,
        conConsentimiento: false,
      }),
    ]);
    const [lectura] = conexion.consultas;
    expect(lectura?.sql).toMatch(/"organizacion_id" = \$1 and "cliente_id" = \$2/);
    expect(lectura?.sql).toMatch(/order by "tomada_en" desc limit \$3/);
  });
});

describe('agenda.anotar', () => {
  it('la recepción anota cualquier cita de ESTE negocio', async () => {
    const { tx, conexion } = transaccionGrabadora([[{ id: CITA }]]);
    const { ctx } = contextoFalso(tx, ambitoDe('cajero'), AHORA);
    await anotarCita.ejecutar(ctx, { citaId: CITA, notas: 'Prefiere el agua tibia' });
    const [actualiza] = conexion.consultas;
    expect(actualiza?.sql).toMatch(/update "citas" set "notas" = \$1/);
    expect(actualiza?.parameters[0]).toBe('Prefiere el agua tibia');
    expect(actualiza?.sql).toMatch(/"organizacion_id" = \$\d+ and "id" = \$\d+/);
  });

  it('la estilista sólo anota una cita donde da un servicio', async () => {
    const { tx, conexion } = transaccionGrabadora([[{ id: KARLA }], []]);
    const { ctx } = contextoFalso(tx, ambitoDe('mesero'), AHORA);
    await expect(anotarCita.ejecutar(ctx, { citaId: CITA, notas: 'algo' })).rejects.toMatchObject({
      codigo: 'PUENTE_SIN_PERMISO',
    });
    expect(conexion.consultas.some((c) => /update "citas"/.test(c.sql))).toBe(false);
    expect(conexion.consultas[0]?.parameters).toContain(EMPLEO);
  });

  it('una cita de otro negocio no existe', async () => {
    const { tx } = transaccionGrabadora([[]]);
    const { ctx } = contextoFalso(tx, ambitoDe('cajero'), AHORA);
    await expect(anotarCita.ejecutar(ctx, { citaId: CITA, notas: '' })).rejects.toMatchObject({
      codigo: 'PUENTE_NO_ENCONTRADO',
    });
  });
});

describe('cabina.existencias', () => {
  it('cada producto con lo del anaquel en piezas y lo de la cabina en su unidad', async () => {
    const { tx, conexion } = transaccionGrabadora([
      [
        { id: 'alm-venta', principal: true },
        { id: 'alm-cabina', principal: false },
      ],
      [
        { id: 'p-tinte', insumo_base_id: 'i-tinte', destino: 'ambos', unidad_cabina: 'g' },
        { id: 'p-shampoo', insumo_base_id: 'i-shampoo', destino: 'venta', unidad_cabina: null },
      ],
      [
        { almacen_id: 'alm-venta', insumo_id: 'i-tinte', cantidad: '4.0000' },
        { almacen_id: 'alm-cabina', insumo_id: 'i-tinte', cantidad: '130.0000' },
        { almacen_id: 'alm-venta', insumo_id: 'i-shampoo', cantidad: '12.0000' },
      ],
    ]);
    const { ctx } = contextoFalso(tx, ambitoDe('gerente'), AHORA);
    const { existencias } = await existenciasDelSalon.ejecutar(ctx, {});
    expect(existencias).toEqual([
      {
        productoId: 'p-tinte',
        insumoId: 'i-tinte',
        enAnaquel: '4.0000',
        enCabina: '130.0000',
        unidadCabina: 'g',
      },
      {
        productoId: 'p-shampoo',
        insumoId: 'i-shampoo',
        enAnaquel: '12.0000',
        enCabina: null,
        unidadCabina: null,
      },
    ]);
    const lectura = conexion.consultas[2];
    expect(lectura?.sql).toMatch(/"almacen_id" in \(\$\d+, \$\d+\)/);
    expect(lectura?.parameters.slice(0, 3)).toEqual([ORG, 'alm-venta', 'alm-cabina']);
    expect(conexion.consultas[0]?.parameters).toEqual([ORG, SUCURSAL, true]);
  });
});

describe('comision.guardar_regla', () => {
  const REGLA_45 = {
    reglaId: REGLA,
    nombre: 'Estilistas',
    esquema: 'porcentaje_fijo',
    tasaServicioBp: 4_500,
    tasaProductoBp: 1_000,
    base: 'cobrado',
    sobreIva: false,
    material: 'salon',
    vigenteDesde: '2026-10-01',
  } as const;

  it('VERSIONA: la nueva empieza, la anterior se cierra el día antes y se reasigna', async () => {
    const { tx, conexion } = transaccionGrabadora([
      [{ id: REGLA, nombre: 'Estilistas', version: 2, vigente_desde: '2026-01-01' }],
      [{ id: NUEVA }],
      [],
      [],
      [],
    ]);
    const { ctx } = contextoFalso(tx, ambitoDe('dueno'), AHORA);
    const salida = await guardarRegla.ejecutar(ctx, guardarRegla.entrada.parse(REGLA_45));

    expect(salida.version).toBe(3);
    const [, inserta, cierra, profesionales, servicios] = conexion.consultas;
    expect(inserta?.sql).toMatch(/insert into "reglas_comision"/);
    expect(inserta?.parameters).toContain(3);
    expect(inserta?.parameters).toContain('2026-10-01');
    expect(cierra?.parameters).toEqual(['2026-09-30', ORG, REGLA]);
    expect(profesionales?.sql).toMatch(/update "profesionales" set "regla_comision_id" = \$1/);
    expect(profesionales?.parameters).toEqual([NUEVA, ORG, REGLA]);
    expect(servicios?.sql).toMatch(/update "servicios" set "regla_comision_id" = \$1/);
  });

  it('una versión que empieza antes que la que cambia no se acepta: lo causado no se recalcula', async () => {
    const { tx, conexion } = transaccionGrabadora([
      [{ id: REGLA, nombre: 'Estilistas', version: 2, vigente_desde: '2026-10-01' }],
    ]);
    const { ctx } = contextoFalso(tx, ambitoDe('dueno'), AHORA);
    await expect(
      guardarRegla.ejecutar(ctx, guardarRegla.entrada.parse(REGLA_45)),
    ).rejects.toMatchObject({ codigo: 'CONFIGURACION_CONFLICTO' });
    expect(conexion.consultas).toHaveLength(1);
  });

  it('una escalonada sin escalones no pasa el esquema', () => {
    const intento = guardarRegla.entrada.safeParse({ ...REGLA_45, esquema: 'escalonado' });
    expect(intento.success).toBe(false);
  });
});

describe('comision.asignar_regla', () => {
  it('una regla de otro negocio no se asigna, aunque la profesional sí sea de aquí', async () => {
    // La segunda respuesta es la profesional: si la guarda de la regla faltara, la
    // asignación pasaría con la regla ajena.
    const { tx, conexion } = transaccionGrabadora([[], [{ id: KARLA }]]);
    const { ctx } = contextoFalso(tx, ambitoDe('dueno'), AHORA);
    await expect(
      asignarRegla.ejecutar(ctx, { profesionalId: KARLA, reglaId: REGLA }),
    ).rejects.toMatchObject({ codigo: 'PUENTE_NO_ENCONTRADO' });
    expect(conexion.consultas.some((c) => /update "profesionales"/.test(c.sql))).toBe(false);
  });

  it('quitar la regla propia no pregunta por ninguna regla', async () => {
    const { tx, conexion } = transaccionGrabadora([[{ id: KARLA }]]);
    const { ctx } = contextoFalso(tx, ambitoDe('dueno'), AHORA);
    await asignarRegla.ejecutar(ctx, { profesionalId: KARLA, reglaId: null });
    expect(conexion.consultas[0]?.sql).toMatch(
      /update "profesionales" set "regla_comision_id" = \$1/,
    );
    expect(conexion.consultas[0]?.parameters[0]).toBeNull();
  });
});

describe('liquidaciones.pendientes', () => {
  it('suma por persona lo causado y lo liquidado, y resta el pendiente', async () => {
    const { tx, conexion } = transaccionGrabadora([
      [
        { profesional_id: KARLA, monto_centavos: 36_000n, liquidacion_id: null },
        { profesional_id: KARLA, monto_centavos: 20_000n, liquidacion_id: 'l1' },
        { profesional_id: 'dany', monto_centavos: 5_000n, liquidacion_id: null },
      ],
    ]);
    const { ctx } = contextoFalso(tx, ambitoDe('gerente'), AHORA);
    const { profesionales } = await pendientesPorProfesional.ejecutar(ctx, {
      desde: '2026-09-01',
      hasta: '2026-10-01',
    });
    expect(profesionales).toEqual([
      {
        profesionalId: KARLA,
        causadoCentavos: '56000',
        liquidadoCentavos: '20000',
        pendienteCentavos: '36000',
      },
      {
        profesionalId: 'dany',
        causadoCentavos: '5000',
        liquidadoCentavos: '0',
        pendienteCentavos: '5000',
      },
    ]);
    expect(conexion.consultas[0]?.sql).toMatch(/"organizacion_id" = \$1/);
  });
});
