import type { Ambito, Rol } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { calcular } from '../puente/consultar.ts';
import { entradaAbrirCaja } from '../venta/esquemas.ts';
import { abrirCaja, cerrarCaja } from './sesion.ts';

/**
 * C.6 de la etapa 2.4 · EL FONDO QUE SE DEJA ES UN CAMPO, NO UNA FRASE EN `notas`.
 *
 * El cierre del restaurante mandaba «Dinero dejado en caja (fondo): $1,000.00» dentro de
 * `notas`: el día siguiente no tenía con qué comparar su apertura, el PDF no podía
 * enseñarlo y el puente lo leía de una columna que nadie escribía. Ahora el cierre guarda
 * lo RETIRADO (contado − dejado), la apertura siguiente lo espera, y el conteo por billete
 * se guarda denominación por denominación.
 */

const ORGANIZACION = '11111111-1111-4111-8111-111111111111';
const SUCURSAL = '22222222-2222-4222-8222-222222222222';
const TERMINAL = '33333333-3333-4333-8333-333333333333';
const SESION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EMPLEO = '55555555-5555-4555-8555-555555555555';
const AHORA = new Date('2026-03-01T23:30:00.000Z');

function ambito(rol: Rol = 'cajero'): Ambito {
  return {
    organizacionId: ORGANIZACION,
    sucursalId: SUCURSAL,
    terminalId: TERMINAL,
    identidadId: '44444444-4444-4444-8444-444444444444',
    empleoId: EMPLEO,
    rol,
  };
}

function sesion(extra: Fila = {}): Fila {
  return {
    id: SESION,
    organizacion_id: ORGANIZACION,
    sucursal_id: SUCURSAL,
    terminal_id: TERMINAL,
    estado: 'abierta',
    serie: 'CC',
    folio: null,
    abierta_en: new Date('2026-03-01T14:00:00.000Z'),
    cerrada_en: null,
    fondo_inicial_centavos: 100_000n,
    efectivo_contado_centavos: null,
    efectivo_retirado_centavos: null,
    ...extra,
  };
}

/** El arqueo y el folio van en SQL crudo: se declara su respuesta, esperado $4,000. */
function baseAbierta() {
  return crearBaseFalsa(
    { sesiones_caja: [sesion()], folios: [] },
    { filasCrudas: [{ siguiente: 3, suma: '400000', total: '300000', cuantas: '4' }] },
  );
}

describe('caja.cerrar · el fondo que se deja', () => {
  it('guarda lo RETIRADO (contado − dejado) y devuelve lo dejado', async () => {
    const base = baseAbierta();
    const { ctx } = contextoFalso(base.tx, ambito(), AHORA);

    const salida = await cerrarCaja.ejecutar(ctx, {
      efectivoContadoCentavos: 400_000,
      fondoDejadoCentavos: 100_000,
    });

    expect(base.campo('sesiones_caja', 'efectivo_retirado_centavos')).toBe(300_000n);
    expect(salida.fondoDejadoCentavos).toBe('100000');
    // Y NO va en las notas: ése era el defecto.
    expect(base.campo('sesiones_caja', 'notas_cierre')).toBe(null);
  });

  it('sin decir cuánto se deja, la columna queda en NULL («no se dijo»), no en cero', async () => {
    const base = baseAbierta();
    const { ctx } = contextoFalso(base.tx, ambito(), AHORA);

    const salida = await cerrarCaja.ejecutar(ctx, { efectivoContadoCentavos: 400_000 });

    expect(base.campo('sesiones_caja', 'efectivo_retirado_centavos')).toBe(null);
    expect(salida.fondoDejadoCentavos).toBeUndefined();
  });

  it('no deja más de lo contado', async () => {
    const base = baseAbierta();
    const { ctx } = contextoFalso(base.tx, ambito(), AHORA);

    await expect(
      cerrarCaja.ejecutar(ctx, { efectivoContadoCentavos: 50_000, fondoDejadoCentavos: 60_000 }),
    ).rejects.toMatchObject({ codigo: 'CANTIDAD_INVALIDA' });
    expect(base.campo('sesiones_caja', 'estado')).toBe('abierta');
  });

  it('guarda el conteo por denominación, momento `cierre`', async () => {
    const base = baseAbierta();
    const { ctx } = contextoFalso(base.tx, ambito(), AHORA);

    await cerrarCaja.ejecutar(ctx, {
      efectivoContadoCentavos: 400_000,
      denominaciones: [
        { denominacionCentavos: 50_000, piezas: 6 },
        { denominacionCentavos: 20_000, piezas: 4 },
        { denominacionCentavos: 1_000, piezas: 20 },
      ],
    });

    const conteo = base.filas('conteos_denominacion');
    expect(conteo).toHaveLength(3);
    expect(conteo.every((f) => f['momento'] === 'cierre' && f['sesion_caja_id'] === SESION)).toBe(
      true,
    );
    expect(conteo.map((f) => f['piezas'])).toEqual([6, 4, 20]);
  });

  it('rechaza un conteo que no suma lo contado, sin cerrar la caja', async () => {
    const base = baseAbierta();
    const { ctx } = contextoFalso(base.tx, ambito(), AHORA);

    await expect(
      cerrarCaja.ejecutar(ctx, {
        efectivoContadoCentavos: 400_000,
        denominaciones: [{ denominacionCentavos: 50_000, piezas: 7 }],
      }),
    ).rejects.toMatchObject({ codigo: 'CANTIDAD_INVALIDA' });
    expect(base.campo('sesiones_caja', 'estado')).toBe('abierta');
    expect(base.filas('conteos_denominacion')).toHaveLength(0);
  });

  it('lo suelto, que no se cuenta por piezas, completa el conteo', async () => {
    const base = baseAbierta();
    const { ctx } = contextoFalso(base.tx, ambito(), AHORA);

    await cerrarCaja.ejecutar(ctx, {
      efectivoContadoCentavos: 400_350,
      denominaciones: [{ denominacionCentavos: 50_000, piezas: 8 }],
      sueltosCentavos: 350,
    });

    expect(base.campo('sesiones_caja', 'estado')).toBe('cerrada');
    expect(base.filas('conteos_denominacion')).toHaveLength(1);
  });

  it('rechaza la misma denominación dos veces', async () => {
    const base = baseAbierta();
    const { ctx } = contextoFalso(base.tx, ambito(), AHORA);

    await expect(
      cerrarCaja.ejecutar(ctx, {
        efectivoContadoCentavos: 400_000,
        denominaciones: [
          { denominacionCentavos: 20_000, piezas: 10 },
          { denominacionCentavos: 20_000, piezas: 10 },
        ],
      }),
    ).rejects.toMatchObject({ codigo: 'CANTIDAD_INVALIDA' });
  });
});

describe('caja.abrir · espera lo que dejó el último cierre de la terminal', () => {
  function baseConCierreAnterior(retirado: bigint | null) {
    return crearBaseFalsa({
      sesiones_caja: [
        sesion({
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          estado: 'cerrada',
          folio: 2n,
          cerrada_en: new Date('2026-02-28T23:00:00.000Z'),
          efectivo_contado_centavos: 480_000n,
          efectivo_retirado_centavos: retirado,
        }),
      ],
      movimientos_caja: [],
    });
  }

  it('el fondo esperado es contado − retirado del cierre anterior', async () => {
    const base = baseConCierreAnterior(380_000n);
    const { ctx } = contextoFalso(base.tx, ambito(), AHORA);

    await abrirCaja.ejecutar(ctx, entradaAbrirCaja.parse({ fondoInicialCentavos: 95_000 }));

    const abierta = base.filas('sesiones_caja').find((f) => f['estado'] === 'abierta');
    expect(abierta?.['fondo_esperado_centavos']).toBe(100_000n);
    expect(abierta?.['fondo_inicial_centavos']).toBe(95_000n);
  });

  it('si el cierre anterior no dijo cuánto dejaba, espera lo que se contó', async () => {
    const base = baseConCierreAnterior(null);
    const { ctx } = contextoFalso(base.tx, ambito(), AHORA);

    await abrirCaja.ejecutar(ctx, entradaAbrirCaja.parse({ fondoInicialCentavos: 95_000 }));

    const abierta = base.filas('sesiones_caja').find((f) => f['estado'] === 'abierta');
    expect(abierta?.['fondo_esperado_centavos']).toBe(95_000n);
  });
});

describe('el puente · `dinero_dejado_en_caja` es un cálculo, no la columna de lo retirado', () => {
  it('contado − retirado, en pesos', () => {
    expect(
      calcular('dineroDejadoEnCaja', { efectivo_contado: 480_000n, efectivo_retirado: 380_000n }),
    ).toBe(1_000);
  });

  it('nulo si falta cualquiera de los dos', () => {
    expect(
      calcular('dineroDejadoEnCaja', { efectivo_contado: 480_000n, efectivo_retirado: null }),
    ).toBe(null);
    expect(calcular('dineroDejadoEnCaja', { efectivo_contado: null, efectivo_retirado: 1n })).toBe(
      null,
    );
  });
});
