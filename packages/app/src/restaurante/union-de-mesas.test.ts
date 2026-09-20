import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type TablasFalsas } from './pruebas/base-falsa.ts';
import {
  ambitoDe,
  CUENTA,
  linea,
  mesa,
  MESA_5,
  ordenDeMesa,
  PREDETERMINADOS,
  SUCURSAL,
} from './pruebas/sala.ts';
import { separarMesasComando, unirMesasComando } from './union-de-mesas.ts';

/**
 * F-302 · Llegan diez personas y se juntan las mesas 4 y 5.
 *
 * Lo que vigilan estas pruebas es lo que separa a esta función de un `update`
 * de dos columnas: que el consumo se MUEVA y no se copie —o el comensal paga
 * dos veces—, que la cuenta absorbida quede sellada, que la mesa miembro se
 * quede sin cuenta propia —o alguien comanda en la 5 mientras el grupo se cobra
 * en la 4—, y que el total del grupo sea la suma de los dos, al centavo.
 */

const MESA_6 = '66666666-6666-4666-8666-666666666668';
const CUENTA_6 = '77777777-7777-4777-8777-777777777778';
const LINEA_6 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccce';
const UNION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const AHORA = new Date('2026-09-14T21:00:00.000Z');

/** La mesa 5 con su cuenta de $100 y la mesa 6 con la suya de $150. */
function salon(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    ordenes: [
      ordenDeMesa('confirmada', { union_id: null, total_centavos: 10_000n }),
      ordenDeMesa('confirmada', {
        id: CUENTA_6,
        mesa_id: MESA_6,
        union_id: null,
        total_centavos: 15_000n,
      }),
    ],
    mesas: [
      mesa('ocupada', { personas_actuales: 4, ocupada_desde: AHORA }),
      mesa('ocupada', {
        id: MESA_6,
        numero: 6,
        orden_activa_id: CUENTA_6,
        personas_actuales: 6,
        ocupada_desde: AHORA,
      }),
    ],
    orden_lineas: [
      linea({ anulada_en: null }),
      linea({
        id: LINEA_6,
        orden_id: CUENTA_6,
        total_centavos: 15_000n,
        subtotal_centavos: 15_000n,
        anulada_en: null,
      }),
    ],
    uniones_mesa: [],
    union_mesa_miembros: [],
    eventos_mesa: [],
    movimientos_cuenta: [],
    configuracion: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(salon(extra), { predeterminados: PREDETERMINADOS });

const UNIR = { mesaPrincipalId: MESA_5, mesaIds: [MESA_6] };

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-302 · unir dos mesas con cuenta', () => {
  it('EL CONSUMO SE MUEVE, no se copia: nadie paga dos veces', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await unirMesasComando.ejecutar(ctx, UNIR);

    expect(salida.lineasMovidas).toBe(1);
    const lineas = base.filas('orden_lineas');
    expect(lineas.every((l) => l['orden_id'] === CUENTA)).toBe(true);
    // Y siguen siendo DOS líneas: moverlas no las duplica.
    expect(lineas).toHaveLength(2);
  });

  it('EL TOTAL DEL GRUPO ES LA SUMA, al centavo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await unirMesasComando.ejecutar(ctx, UNIR);

    expect(salida.totalCentavos).toBe('25000');
    const principal = base.filas('ordenes').find((o) => o['id'] === CUENTA);
    expect(principal?.['total_centavos']).toBe(25_000n);
  });

  it('LA CUENTA ABSORBIDA QUEDA SELLADA y en cero', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await unirMesasComando.ejecutar(ctx, UNIR);

    const absorbida = base.filas('ordenes').find((o) => o['id'] === CUENTA_6);
    expect(absorbida?.['estado']).toBe('absorbida');
    expect(absorbida?.['total_centavos']).toBe(0n);
    // Conserva su mesa: es el registro de dónde vino ese consumo.
    expect(absorbida?.['mesa_id']).toBe(MESA_6);
  });

  it('LA MESA MIEMBRO SE QUEDA SIN CUENTA PROPIA', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await unirMesasComando.ejecutar(ctx, UNIR);

    const seis = base.filas('mesas').find((m) => m['id'] === MESA_6);
    // Sin esto, alguien comanda en la 6 mientras el grupo se cobra en la 5.
    expect(seis?.['orden_activa_id']).toBeNull();
    expect(seis?.['estado']).toBe('ocupada');
  });

  it('la principal recibe a toda la gente: es la mesa de diez', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await unirMesasComando.ejecutar(ctx, UNIR);

    const cinco = base.filas('mesas').find((m) => m['id'] === MESA_5);
    expect(cinco?.['personas_actuales']).toBe(10);
  });

  it('queda el grupo, con su miembro y su bitácora', async () => {
    const base = baseDe();
    const { ctx, auditorias } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await unirMesasComando.ejecutar(ctx, UNIR);

    const uniones = base.filas('uniones_mesa');
    expect(uniones).toHaveLength(1);
    expect(uniones[0]?.['mesa_principal_id']).toBe(MESA_5);
    expect(uniones[0]?.['orden_id']).toBe(CUENTA);
    expect(uniones[0]?.['cerrada_en']).toBeNull();

    const miembros = base.filas('union_mesa_miembros');
    expect(miembros).toHaveLength(1);
    expect(miembros[0]?.['mesa_id']).toBe(MESA_6);
    expect(miembros[0]?.['orden_absorbida_id']).toBe(CUENTA_6);
    expect(miembros[0]?.['union_abierta']).toBe(true);

    expect(base.campo('movimientos_cuenta', 'tipo')).toBe('union');
    expect(auditorias[0]?.payload['cuentasAbsorbidas']).toBe(1);
    expect(salida.unionId).toBe(uniones[0]?.['id']);
  });

  it('una mesa LIBRE se une sin traer consumo — «pásate a ésta que está vacía»', async () => {
    const base = baseDe({
      ordenes: [ordenDeMesa('confirmada', { union_id: null, total_centavos: 10_000n })],
      mesas: [
        mesa('ocupada', { personas_actuales: 4, ocupada_desde: AHORA }),
        mesa('libre', {
          id: MESA_6,
          numero: 6,
          orden_activa_id: null,
          personas_actuales: 0,
          ocupada_desde: null,
        }),
      ],
      orden_lineas: [linea({ anulada_en: null })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await unirMesasComando.ejecutar(ctx, UNIR);

    expect(salida.cuentasAbsorbidas).toBe(0);
    expect(salida.lineasMovidas).toBe(0);
    expect(salida.totalCentavos).toBe('10000');
  });
});

describe('F-302 · lo que rechaza al unir', () => {
  it('la principal SIN cuenta abierta: unir mesas es juntar cuentas', async () => {
    const base = baseDe({
      mesas: [
        mesa('libre', { orden_activa_id: null, personas_actuales: 0 }),
        mesa('ocupada', { id: MESA_6, numero: 6, orden_activa_id: CUENTA_6 }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(await codigoDe(() => unirMesasComando.ejecutar(ctx, UNIR))).toBe('MESA_NO_ENCONTRADA');
  });

  it('una mesa que YA ESTÁ EN OTRO GRUPO', async () => {
    const base = baseDe({
      union_mesa_miembros: [{ union_id: UNION, mesa_id: MESA_6, union_abierta: true }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(await codigoDe(() => unirMesasComando.ejecutar(ctx, UNIR))).toBe('MESA_YA_ABIERTA');
  });

  it('LA PRINCIPAL ya encabeza otro grupo', async () => {
    const base = baseDe({
      uniones_mesa: [
        {
          id: UNION,
          organizacion_id: '11111111-1111-4111-8111-111111111111',
          sucursal_id: SUCURSAL,
          mesa_principal_id: MESA_5,
          orden_id: CUENTA,
          cerrada_en: null,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(await codigoDe(() => unirMesasComando.ejecutar(ctx, UNIR))).toBe('MESA_YA_ABIERTA');
  });

  it('unir la principal consigo misma', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(
      await codigoDe(() =>
        unirMesasComando.ejecutar(ctx, { mesaPrincipalId: MESA_5, mesaIds: [MESA_5] }),
      ),
    ).toBe('MESA_YA_ABIERTA');
  });

  it('la misma mesa repetida en el grupo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(
      await codigoDe(() =>
        unirMesasComando.ejecutar(ctx, { mesaPrincipalId: MESA_5, mesaIds: [MESA_6, MESA_6] }),
      ),
    ).toBe('MESA_YA_ABIERTA');
  });

  it('UNA MESA DE OTRA SUCURSAL', async () => {
    const base = baseDe({
      mesas: [
        mesa('ocupada', { personas_actuales: 4 }),
        mesa('ocupada', {
          id: MESA_6,
          numero: 6,
          orden_activa_id: CUENTA_6,
          sucursal_id: '99999999-9999-4999-8999-999999999999',
        }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(await codigoDe(() => unirMesasComando.ejecutar(ctx, UNIR))).toBe('MESA_NO_ENCONTRADA');
  });

  it('una cuenta que ya se cobró no se absorbe', async () => {
    const base = baseDe({
      ordenes: [
        ordenDeMesa('confirmada', { union_id: null, total_centavos: 10_000n }),
        ordenDeMesa('pagada', { id: CUENTA_6, mesa_id: MESA_6, union_id: null }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(await codigoDe(() => unirMesasComando.ejecutar(ctx, UNIR))).toBe('ORDEN_NO_EDITABLE');
  });

  it('NO ESCRIBE NADA cuando una mesa del grupo no se puede unir', async () => {
    const base = baseDe({
      union_mesa_miembros: [{ union_id: UNION, mesa_id: MESA_6, union_abierta: true }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await codigoDe(() => unirMesasComando.ejecutar(ctx, UNIR));

    expect(base.filas('uniones_mesa')).toEqual([]);
    expect(base.filas('movimientos_cuenta')).toEqual([]);
    expect(base.filas('orden_lineas').filter((l) => l['orden_id'] === CUENTA_6)).toHaveLength(1);
  });
});

describe('F-302 · separar el grupo', () => {
  function baseUnida() {
    const base = baseDe();
    return base;
  }

  it('devuelve las mesas miembro al servicio y cierra el grupo', async () => {
    const base = baseUnida();
    const unir = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);
    const { unionId } = await unirMesasComando.ejecutar(unir.ctx, UNIR);

    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);
    const salida = await separarMesasComando.ejecutar(ctx, { unionId });

    expect(salida.mesasLiberadas).toBe(1);
    const seis = base.filas('mesas').find((m) => m['id'] === MESA_6);
    expect(seis?.['estado']).toBe('libre');
    expect(seis?.['ocupada_desde']).toBeNull();

    const union = base.filas('uniones_mesa')[0];
    expect(union?.['cerrada_en']).toEqual(AHORA);
  });

  it('EL CONSUMO NO VUELVE A REPARTIRSE: eso es F-321, y es de caja', async () => {
    const base = baseUnida();
    const unir = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);
    const { unionId } = await unirMesasComando.ejecutar(unir.ctx, UNIR);

    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);
    await separarMesasComando.ejecutar(ctx, { unionId });

    const lineas = base.filas('orden_lineas');
    expect(lineas.every((l) => l['orden_id'] === CUENTA)).toBe(true);
    const principal = base.filas('ordenes').find((o) => o['id'] === CUENTA);
    expect(principal?.['total_centavos']).toBe(25_000n);
    // Y la cuenta vuelve a poder moverse de mesa.
    expect(principal?.['union_id']).toBeNull();
  });

  it('un grupo que no existe', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(await codigoDe(() => separarMesasComando.ejecutar(ctx, { unionId: UNION }))).toBe(
      'MESA_NO_ENCONTRADA',
    );
  });

  it('un grupo YA separado — el segundo toque no vuelve a liberar', async () => {
    const base = baseUnida();
    const unir = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);
    const { unionId } = await unirMesasComando.ejecutar(unir.ctx, UNIR);

    const uno = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);
    await separarMesasComando.ejecutar(uno.ctx, { unionId });

    const dos = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);
    expect(await codigoDe(() => separarMesasComando.ejecutar(dos.ctx, { unionId }))).toBe(
      'MESA_NO_LIBERABLE',
    );
  });
});

describe('F-302 · quién une', () => {
  it('EL MESERO SÍ: unir no hace desaparecer dinero, es sala', () => {
    expect(unirMesasComando.roles).toContain('mesero');
    expect(separarMesasComando.roles).toContain('mesero');
  });

  it('un grupo de más de seis mesas no es un grupo: es un salón privado', () => {
    const analisis = unirMesasComando.entrada.safeParse({
      mesaPrincipalId: MESA_5,
      mesaIds: Array.from({ length: 6 }, () => MESA_6),
    });
    expect(analisis.success).toBe(false);
  });

  it('unir con cero mesas no es unir', () => {
    expect(
      unirMesasComando.entrada.safeParse({ mesaPrincipalId: MESA_5, mesaIds: [] }).success,
    ).toBe(false);
  });
});
