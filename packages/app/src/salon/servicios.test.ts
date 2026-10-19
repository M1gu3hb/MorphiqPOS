import { describe, expect, it } from 'vitest';

import { transaccionGrabadora } from '../pruebas/grabadora.ts';
import { contextoFalso } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { asignacionesDeServicios, guardarServicio } from './servicios.ts';

/**
 * C.10 de la 2.4 · El servicio del salón se guarda con sus tiempos y con quién lo da.
 *
 * Sobre el SQL COMPILADO: el catálogo de servicios mandaba un cuerpo que ningún comando
 * aceptaba, las duraciones no se escribían en `servicios` y nadie escribía
 * `servicios_profesional`, sin la cual la agenda no deja agendar el servicio.
 */
const KARLA = 'aa000000-0000-4000-8000-000000000001';
const DANY = 'aa000000-0000-4000-8000-000000000002';
const SERVICIO = 'bb000000-0000-4000-8000-000000000001';

const TINTE = {
  nombre: 'Tinte completo',
  precioCentavos: 90_000,
  duracionActiva1Min: 30,
  duracionPasivaMin: 35,
  duracionActiva2Min: 40,
  duracionCierreMin: 10,
  pasivoIntercalable: true,
};

function correr(respuestas: readonly (readonly unknown[])[], entrada: unknown) {
  const { tx, conexion } = transaccionGrabadora(respuestas);
  const { ctx, auditorias } = contextoFalso(tx, ambitoDe('dueno'));
  const promesa = guardarServicio.ejecutar(ctx, guardarServicio.entrada.parse(entrada));
  return { promesa, conexion, auditorias };
}

describe('servicios.guardar', () => {
  it('ALTA: el producto como SERVICIO que no descuenta, y sus cuatro tiempos', async () => {
    const { promesa, conexion } = correr([[{ id: SERVICIO }]], TINTE);
    expect(await promesa).toEqual({ servicioId: SERVICIO, creado: true, profesionales: null });

    const [producto, tiempos] = conexion.consultas;
    expect(producto?.sql).toMatch(/insert into "productos"/);
    expect(producto?.parameters).toContain('servicio');
    expect(producto?.parameters).toContain('ninguno');
    expect(producto?.parameters).toContain(90_000n);

    expect(tiempos?.sql).toMatch(/insert into "servicios"/);
    expect(tiempos?.sql).toMatch(/on conflict \("producto_id"\) do update set/);
    expect(tiempos?.parameters.slice(0, 7)).toEqual([SERVICIO, ORG, 30, 35, 40, 10, true]);
  });

  it('EDICIÓN: sólo un servicio de ESTE negocio, y sin él no se toca nada más', async () => {
    const { promesa, conexion } = correr([[]], { ...TINTE, servicioId: SERVICIO });
    await expect(promesa).rejects.toMatchObject({ codigo: 'PRODUCTO_NO_ENCONTRADO' });
    const [corregir] = conexion.consultas;
    expect(corregir?.sql).toMatch(/update "productos"/);
    expect(corregir?.sql).toMatch(/"organizacion_id" = \$\d+/);
    expect(corregir?.sql).toMatch(/"tipo_venta" = \$\d+/);
    expect(conexion.consultas).toHaveLength(1);
  });

  it('QUIÉN LO DA: reemplaza la lista con su precio propio y su factor', async () => {
    const { promesa, conexion } = correr(
      [[{ id: SERVICIO }], [], [{ id: KARLA }, { id: DANY }], [], []],
      {
        ...TINTE,
        servicioId: SERVICIO,
        profesionales: [
          { profesionalId: KARLA, factorDuracionBp: 8_000 },
          { profesionalId: DANY, precioCentavos: 110_000, factorDuracionBp: 11_000 },
        ],
      },
    );
    expect((await promesa).profesionales).toBe(2);

    const sqls = conexion.consultas.map((c) => c.sql);
    const lectura = conexion.consultas[2];
    expect(lectura?.sql).toMatch(/from "profesionales"/);
    expect(lectura?.sql).toMatch(/"organizacion_id" = \$1/);
    expect(lectura?.sql).toMatch(/"activo" = \$2/);
    expect(sqls[3]).toMatch(/delete from "servicios_profesional"/);
    const inserta = conexion.consultas[4];
    expect(inserta?.sql).toMatch(/insert into "servicios_profesional"/);
    expect(inserta?.parameters).toEqual([
      SERVICIO,
      KARLA,
      ORG,
      null,
      8_000,
      SERVICIO,
      DANY,
      ORG,
      110_000n,
      11_000,
    ]);
  });

  it('una persona ajena o dada de baja no entra, y no se borra la lista de antes', async () => {
    const { promesa, conexion } = correr([[{ id: SERVICIO }], [], [{ id: KARLA }]], {
      ...TINTE,
      servicioId: SERVICIO,
      profesionales: [{ profesionalId: KARLA }, { profesionalId: DANY }],
    });
    await expect(promesa).rejects.toMatchObject({ codigo: 'CATALOGO_INVALIDO' });
    expect(conexion.consultas.some((c) => c.sql.includes('delete from'))).toBe(false);
  });

  it('sin la lista, no se toca quién lo da', async () => {
    const { promesa, conexion } = correr([[{ id: SERVICIO }], []], {
      ...TINTE,
      servicioId: SERVICIO,
    });
    await promesa;
    expect(conexion.consultas.some((c) => c.sql.includes('servicios_profesional'))).toBe(false);
  });

  it('un procesado sin terminado no pasa el esquema', () => {
    const intento = guardarServicio.entrada.safeParse({ ...TINTE, duracionActiva2Min: 0 });
    expect(intento.success).toBe(false);
  });

  it('una persona repetida tampoco', () => {
    const intento = guardarServicio.entrada.safeParse({
      ...TINTE,
      profesionales: [{ profesionalId: KARLA }, { profesionalId: KARLA }],
    });
    expect(intento.success).toBe(false);
  });
});

describe('servicios.asignaciones', () => {
  it('lee las de ESTE negocio, con el precio propio como texto de centavos', async () => {
    const { tx, conexion } = transaccionGrabadora([
      [
        {
          servicio_id: SERVICIO,
          profesional_id: DANY,
          precio_centavos: 110_000n,
          factor_duracion_bp: 11_000,
        },
      ],
    ]);
    const { ctx } = contextoFalso(tx, ambitoDe('cajero'));
    const salida = await asignacionesDeServicios.ejecutar(ctx, { servicioId: null });
    expect(salida.asignaciones).toEqual([
      {
        servicioId: SERVICIO,
        profesionalId: DANY,
        precioCentavos: '110000',
        factorDuracionBp: 11_000,
      },
    ]);
    expect(conexion.consultas[0]?.sql).toMatch(/"organizacion_id" = \$1/);
  });
});
