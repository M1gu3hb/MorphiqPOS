import { esErrorDominio, type Ambito, type Rol } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { describe, expect, it } from 'vitest';

import { crearComando, type RepositorioComandos } from '../comando.ts';
import { crearFabrica } from '../pruebas/dobles.ts';
import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { entradaAbrirCaja, entradaCerrarCaja, entradaMovimientoCaja } from '../venta/esquemas.ts';
import { corteDeTurno, entradaCorteTurno } from './turno.ts';

/**
 * `caja.corte_turno` — el arqueo de media jornada (E8-3).
 *
 * Sustituye al botón de `Caja.jsx:907`, que hacía
 * `api.entidades.CorteCaja.create({ folio: generateFolio('CT'), … })` y por
 * tanto fallaba SIEMPRE: `CorteCaja` mapea `sesiones_caja`, no `cortes_turno`,
 * y el puente rechaza esa entidad entera.
 *
 * Lo que estas pruebas vigilan, y por qué cada una:
 *   1. el camino feliz, y que la caja SIGA ABIERTA después;
 *   2. el rango: dos cortes seguidos NO cuentan las mismas ventas dos veces;
 *   3. que el folio y la atribución no vengan del cuerpo;
 *   4. sin caja abierta no hay corte, y se dice con un mensaje de persona.
 */

const ORGANIZACION = '11111111-1111-4111-8111-111111111111';
const SUCURSAL = '22222222-2222-4222-8222-222222222222';
const TERMINAL = '33333333-3333-4333-8333-333333333333';
const EMPLEO = '55555555-5555-4555-8555-555555555555';
const OTRO_EMPLEO = '66666666-6666-4666-8666-666666666666';
const SESION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLAVE = 'clave-de-corte-de-turno-0001';

const ABIERTA_EN = new Date('2026-03-01T14:00:00.000Z');
const PRIMER_CORTE = new Date('2026-03-01T18:00:00.000Z');
const AHORA = new Date('2026-03-01T22:00:00.000Z');

function ambitoDe(rol: Rol, terminalId: string | null = TERMINAL): Ambito {
  return {
    organizacionId: ORGANIZACION,
    sucursalId: SUCURSAL,
    terminalId,
    identidadId: '44444444-4444-4444-8444-444444444444',
    empleoId: EMPLEO,
    rol,
  };
}

function sesionAbierta(cambios: Fila = {}): Fila {
  return {
    id: SESION,
    organizacion_id: ORGANIZACION,
    sucursal_id: SUCURSAL,
    terminal_id: TERMINAL,
    estado: 'abierta',
    serie: 'CC',
    folio: null,
    abierta_en: ABIERTA_EN,
    cerrada_en: null,
    fondo_inicial_centavos: 50_000n,
    efectivo_contado_centavos: null,
    efectivo_retirado_centavos: null,
    ...cambios,
  };
}

/** El renglón de `folios` del que sale la numeración `CT`. */
function folio(siguiente: number, serie = 'CT'): Fila {
  return {
    id: `folio-${serie}`,
    organizacion_id: ORGANIZACION,
    sucursal_id: SUCURSAL,
    serie,
    siguiente,
  };
}

/**
 * `arqueoDeSesion` y `tomarFolio` van en SQL crudo, y la base falsa devuelve
 * `filasCrudas` para cualquiera. Se declara lo que Postgres respondería.
 */
function baseCon(datos: Record<string, readonly Fila[]>, crudas: readonly Fila[] = []) {
  return crearBaseFalsa(datos, { filasCrudas: crudas });
}

function ejecutorSobre(tx: Transaccion) {
  const fabrica = crearFabrica('restaurante');
  const ejecutar = crearComando<Transaccion>({
    repositorio: fabrica.repositorio as unknown as RepositorioComandos<Transaccion>,
    conTransaccion: <T>(fn: (t: Transaccion) => Promise<T>): Promise<T> =>
      fabrica.conTransaccion(() => fn(tx)),
    ahora: () => AHORA,
  });
  return { ejecutar, fabrica };
}

async function falla(promesa: Promise<unknown>): Promise<{ codigo: string; mensaje: string }> {
  try {
    await promesa;
    return { codigo: 'NO_LANZO', mensaje: '' };
  } catch (error) {
    return {
      codigo: esErrorDominio(error) ? error.codigo : `INESPERADO:${String(error)}`,
      mensaje: error instanceof Error ? error.message : String(error),
    };
  }
}

describe('caja.corte_turno · la foto del turno, sin cerrar la caja', () => {
  it('registra el arqueo y la caja SIGUE ABIERTA', async () => {
    const base = baseCon(
      { sesiones_caja: [sesionAbierta()], cortes_turno: [], folios: [folio(4)] },
      [{ siguiente: 4 }],
    );
    const { ctx, pasos } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await corteDeTurno.ejecutar(ctx, {
      efectivoContadoCentavos: 128_000,
      notas: 'Entrega de turno de Rosa',
    });

    expect(salida.serie).toBe('CT');
    expect(salida.efectivoContadoCentavos).toBe('128000');

    // LO QUE DEFINE ESTE COMANDO: la caja no se cierra. Si se cerrara, el fondo,
    // los movimientos y el arqueo del día se irían con ella a media jornada.
    const sesion = base.filas('sesiones_caja')[0];
    expect(sesion?.['estado']).toBe('abierta');
    expect(sesion?.['cerrada_en']).toBe(null);
    expect(pasos).not.toContain('cerrar_sesion');

    // Y sí quedó escrito el arqueo parcial, en SU tabla.
    const corte = base.filas('cortes_turno')[0];
    expect(corte?.['sesion_caja_id']).toBe(SESION);
    expect(corte?.['efectivo_contado_centavos']).toBe(128_000n);
    expect(corte?.['notas']).toBe('Entrega de turno de Rosa');
  });

  it('el rango arranca en el corte ANTERIOR, no en la apertura', async () => {
    // Sin esto, el segundo corte del día vuelve a contar las ventas del primero
    // y el cajero de la tarde carga con el efectivo de la mañana.
    const base = baseCon(
      {
        sesiones_caja: [sesionAbierta()],
        cortes_turno: [
          {
            id: 'ct-1',
            organizacion_id: ORGANIZACION,
            sesion_caja_id: SESION,
            serie: 'CT',
            folio: 3n,
            rango_inicio: ABIERTA_EN,
            cortado_en: PRIMER_CORTE,
            empleado_id: OTRO_EMPLEO,
            efectivo_contado_centavos: 90_000n,
            notas: null,
          },
        ],
        folios: [folio(4)],
      },
      [{ siguiente: 4 }],
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await corteDeTurno.ejecutar(ctx, {
      efectivoContadoCentavos: 60_000,
      notas: null,
    });

    expect(salida.rangoInicio).toEqual(PRIMER_CORTE);
    const nuevo = base.filas('cortes_turno').find((f) => f['empleado_id'] === EMPLEO);
    expect(nuevo?.['rango_inicio']).toEqual(PRIMER_CORTE);
  });

  it('sin corte previo el rango arranca en la apertura de la caja', async () => {
    // El contraste: una implementación que devolviera siempre `abiertaEn`
    // también pasaría la prueba de arriba si se mirara sola.
    const base = baseCon(
      { sesiones_caja: [sesionAbierta()], cortes_turno: [], folios: [folio(1)] },
      [{ siguiente: 1 }],
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await corteDeTurno.ejecutar(ctx, {
      efectivoContadoCentavos: 1_000,
      notas: null,
    });

    expect(salida.rangoInicio).toEqual(ABIERTA_EN);
  });

  it('quién firma sale de la SESIÓN, y el cuerpo no lo puede decir', async () => {
    // `Caja.jsx:923` mandaba `usuario_cajero_id: posUser?.id` desde el
    // navegador: cualquiera firmaba el turno de otro desde la consola.
    const base = baseCon(
      { sesiones_caja: [sesionAbierta()], cortes_turno: [], folios: [folio(1)] },
      [{ siguiente: 1 }],
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await corteDeTurno.ejecutar(ctx, { efectivoContadoCentavos: 1_000, notas: null });

    expect(base.filas('cortes_turno')[0]?.['empleado_id']).toBe(EMPLEO);

    // Y el esquema NO declara ni la atribución ni el folio ni los totales.
    const claves = Object.keys(entradaCorteTurno.shape);
    expect(claves).toEqual(['efectivoContadoCentavos', 'notas']);
    for (const prohibida of ['folio', 'serie', 'usuario_cajero_id', 'empleadoId', 'totalGeneral']) {
      expect(claves).not.toContain(prohibida);
    }
  });

  it('sin caja abierta no hay corte, y se dice con palabras', async () => {
    const base = baseCon({ sesiones_caja: [], cortes_turno: [], folios: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await falla(
      corteDeTurno.ejecutar(ctx, { efectivoContadoCentavos: 1_000, notas: null }),
    );

    expect(fallo.codigo).toBe('CAJA_CERRADA');
    expect(fallo.mensaje).toMatch(/no hay una caja abierta/i);
    expect(base.filas('cortes_turno')).toHaveLength(0);
  });

  it('sin terminal tampoco: el corte se firma donde está el cajón', async () => {
    const base = baseCon({ sesiones_caja: [sesionAbierta()], cortes_turno: [], folios: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno', null), AHORA);

    const fallo = await falla(
      corteDeTurno.ejecutar(ctx, { efectivoContadoCentavos: 1_000, notas: null }),
    );

    expect(fallo.codigo).toBe('VENTA_SIN_TERMINAL');
    expect(base.filas('cortes_turno')).toHaveLength(0);
  });

  it('un mesero no corta turno, y se le rechaza ANTES de tocar la base', async () => {
    const base = baseCon({ sesiones_caja: [sesionAbierta()], cortes_turno: [], folios: [] });
    const { ejecutar, fabrica } = ejecutorSobre(base.tx);

    const salida = await ejecutar(corteDeTurno, {
      entrada: { efectivoContadoCentavos: 1_000, notas: null },
      ambito: ambitoDe('mesero'),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('SIN_PERMISO');
    expect(base.filas('cortes_turno')).toHaveLength(0);
    expect(fabrica.auditoriaConfirmada()[0]?.payload).toMatchObject({ resultado: 'denegado' });
  });

  it('IDEMPOTENCIA: dos toques con la misma clave dejan UN corte', async () => {
    const base = baseCon(
      { sesiones_caja: [sesionAbierta()], cortes_turno: [], folios: [folio(1)] },
      [{ siguiente: 1 }],
    );
    const { ejecutar } = ejecutorSobre(base.tx);
    const peticion = {
      entrada: { efectivoContadoCentavos: 128_000, notas: null },
      ambito: ambitoDe('cajero'),
      idempotencyKey: CLAVE,
    };

    const primera = await ejecutar(corteDeTurno, peticion);
    const segunda = await ejecutar(corteDeTurno, peticion);

    expect(primera.ok && segunda.ok).toBe(true);
    if (!primera.ok || !segunda.ok) return;
    expect(primera.reintento).toBe(false);
    expect(segunda.reintento).toBe(true);
    expect(segunda.datos).toEqual(primera.datos);
    // Y sobre todo: la base tiene UNO, no dos.
    expect(base.filas('cortes_turno')).toHaveLength(1);
  });

  it('el importe contado no puede ser negativo ni un texto', () => {
    expect(entradaCorteTurno.safeParse({ efectivoContadoCentavos: -1 }).success).toBe(false);
    expect(entradaCorteTurno.safeParse({ efectivoContadoCentavos: '128000' }).success).toBe(false);
    expect(entradaCorteTurno.safeParse({ efectivoContadoCentavos: 128_000.5 }).success).toBe(false);
    expect(entradaCorteTurno.safeParse({ efectivoContadoCentavos: 0 }).success).toBe(true);
  });
});

describe('los importes de caja tienen una cota de verdad', () => {
  /**
   * `Number.MAX_SAFE_INTEGER` centavos son NOVENTA MIL MILLONES de pesos: eso no
   * es una cota, es la ausencia de una. Un cero de más al teclear un retiro
   * entraba sin resistencia y el arqueo del día pasaba a ser una cifra que no
   * corresponde a nada — sin dar error, porque los importes son `bigint` en la
   * base y la suma no se desborda. Simplemente el número es falso.
   */
  const TOPE = 1_000_000_000;

  it('abrir, cerrar y cortar rechazan un importe absurdo', () => {
    for (const [nombre, esquema] of [
      ['caja.abrir', entradaAbrirCaja],
      ['caja.cerrar', entradaCerrarCaja],
      ['caja.corte_turno', entradaCorteTurno],
    ] as const) {
      const campo = nombre === 'caja.abrir' ? 'fondoInicialCentavos' : 'efectivoContadoCentavos';
      expect(esquema.safeParse({ [campo]: TOPE }).success, `${nombre} en el tope`).toBe(true);
      expect(esquema.safeParse({ [campo]: TOPE + 1 }).success, `${nombre} pasado`).toBe(false);
      expect(esquema.safeParse({ [campo]: -1 }).success, `${nombre} negativo`).toBe(false);
    }
  });

  it('un movimiento SÍ puede ser negativo, pero acotado en los dos sentidos', () => {
    // Un ajuste a la baja es legítimo; un ajuste de menos mil millones es el
    // mismo error de tecleo que uno de más mil millones.
    const movimiento = (montoCentavos: number) =>
      entradaMovimientoCaja.safeParse({ tipo: 'ajuste', montoCentavos, motivo: 'Cuadre' }).success;

    expect(movimiento(-50_000), 'ajuste a la baja normal').toBe(true);
    expect(movimiento(TOPE), 'en el tope').toBe(true);
    expect(movimiento(-TOPE), 'en el tope negativo').toBe(true);
    expect(movimiento(TOPE + 1), 'pasado').toBe(false);
    expect(movimiento(-TOPE - 1), 'pasado en negativo').toBe(false);
    expect(movimiento(Number.MAX_SAFE_INTEGER), 'el tope de antes').toBe(false);
  });
});
