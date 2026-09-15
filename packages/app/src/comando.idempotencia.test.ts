import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { crearComando, definirComando } from './comando.ts';
import { ambitoDeCajero, crearFabrica, type TxFalsa } from './pruebas/dobles.ts';

/**
 * Idempotencia (R10, prueba SALE-03 del corte).
 *
 * La propiedad que importa no es «no duplicar»: es **no duplicar y tampoco
 * quemar la clave cuando el comando falló**. Un reintento tras un fallo tiene
 * que volver a ejecutar de verdad; si devolviera un éxito guardado, el cajero
 * creería haber cobrado sin haber cobrado.
 */

const CLAVE = 'clave-de-idempotencia-0001';
const ENTRADA = { ordenId: '66666666-6666-4666-8666-666666666666' };

function comandoContador(fallar = false) {
  let veces = 0;
  const definicion = definirComando({
    nombre: 'venta.cobrar',
    entidad: 'orden',
    escribe: true,
    roles: ['cajero'],
    paquetes: ['esencial'],
    entrada: z.object({ ordenId: z.uuid() }),
    async ejecutar(ctx, entrada) {
      veces += 1;
      ctx.auditar({ entidadId: entrada.ordenId, payload: {} });
      if (fallar) throw new Error('falla del paso de stock');
      return { folio: veces };
    },
  });
  return { definicion, veces: () => veces };
}

describe('comando() · clave de idempotencia obligatoria', () => {
  it('un comando que escribe sin clave se rechaza', async () => {
    const fabrica = crearFabrica('esencial');
    const { definicion, veces } = comandoContador();
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero(),
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('IDEMPOTENCIA_REQUERIDA');
    expect(veces()).toBe(0);
  });

  it('un comando que sólo lee no la exige', async () => {
    const fabrica = crearFabrica('esencial');
    const definicion = definirComando({
      nombre: 'venta.consultar',
      entidad: 'orden',
      escribe: false,
      roles: ['cajero'],
      paquetes: ['esencial'],
      entrada: z.object({ ordenId: z.uuid() }),
      async ejecutar() {
        return { total: 0 };
      },
    });
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, { entrada: ENTRADA, ambito: ambitoDeCajero() });
    expect(salida.ok).toBe(true);
  });
});

describe('comando() · reintento con la misma clave', () => {
  it('SALE-03: tres veces la misma clave produce UN solo resultado', async () => {
    const fabrica = crearFabrica('esencial');
    const { definicion, veces } = comandoContador();
    const ejecutar = crearComando<TxFalsa>(fabrica);
    const peticion = { entrada: ENTRADA, ambito: ambitoDeCajero(), idempotencyKey: CLAVE };

    const a = await ejecutar(definicion, peticion);
    const b = await ejecutar(definicion, peticion);
    const c = await ejecutar(definicion, peticion);

    expect(veces()).toBe(1);
    for (const salida of [a, b, c]) {
      expect(salida.ok).toBe(true);
      if (!salida.ok) return;
      expect(salida.datos).toEqual({ folio: 1 });
    }
    expect(a.ok && a.reintento).toBe(false);
    expect(b.ok && b.reintento).toBe(true);
    expect(c.ok && c.reintento).toBe(true);
  });

  it('el reintento NO escribe una segunda fila de auditoría', async () => {
    // Tres reintentos que auditaran parecerían tres cobros en el histórico.
    const fabrica = crearFabrica('esencial');
    const { definicion } = comandoContador();
    const ejecutar = crearComando<TxFalsa>(fabrica);
    const peticion = { entrada: ENTRADA, ambito: ambitoDeCajero(), idempotencyKey: CLAVE };

    await ejecutar(definicion, peticion);
    await ejecutar(definicion, peticion);

    expect(fabrica.auditoriaConfirmada()).toHaveLength(1);
  });

  it('la misma clave con OTRA entrada es un conflicto, no un reintento', async () => {
    const fabrica = crearFabrica('esencial');
    const { definicion, veces } = comandoContador();
    const ejecutar = crearComando<TxFalsa>(fabrica);
    const ambito = ambitoDeCajero();

    await ejecutar(definicion, { entrada: ENTRADA, ambito, idempotencyKey: CLAVE });
    const segunda = await ejecutar(definicion, {
      entrada: { ordenId: '77777777-7777-4777-8777-777777777777' },
      ambito,
      idempotencyKey: CLAVE,
    });

    expect(segunda.ok).toBe(false);
    if (segunda.ok) return;
    expect(segunda.error.codigo).toBe('IDEMPOTENCIA_CONFLICTO');
    // Y sobre todo: NO devolvió el resultado de la otra operación.
    expect(veces()).toBe(1);
  });

  it('la clave de una organización no colisiona con la de otra', async () => {
    const fabrica = crearFabrica('esencial');
    const { definicion, veces } = comandoContador();
    const ejecutar = crearComando<TxFalsa>(fabrica);

    await ejecutar(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });
    await ejecutar(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero({ organizacionId: '99999999-9999-4999-8999-999999999999' }),
      idempotencyKey: CLAVE,
    });

    expect(veces()).toBe(2);
  });
});

describe('comando() · la clave se libera si el comando falla', () => {
  it('un fallo NO quema la clave: el reintento vuelve a ejecutar', async () => {
    // Es la mitad de la idempotencia que se olvida, y la peligrosa. Si el cobro
    // se revierte y la clave quedara ocupada, el reintento devolvería un éxito
    // guardado sin haber cobrado nada.
    const fabrica = crearFabrica('esencial');
    let debeFallar = true;
    let veces = 0;

    const definicion = definirComando({
      nombre: 'venta.cobrar',
      entidad: 'orden',
      escribe: true,
      roles: ['cajero'],
      paquetes: ['esencial'],
      entrada: z.object({ ordenId: z.uuid() }),
      async ejecutar(ctx, entrada) {
        veces += 1;
        ctx.auditar({ entidadId: entrada.ordenId, payload: {} });
        if (debeFallar) throw new Error('se cayó el paso de stock');
        return { folio: 7 };
      },
    });

    const ejecutar = crearComando<TxFalsa>(fabrica);
    const peticion = { entrada: ENTRADA, ambito: ambitoDeCajero(), idempotencyKey: CLAVE };

    const primera = await ejecutar(definicion, peticion);
    expect(primera.ok).toBe(false);

    debeFallar = false;
    const segunda = await ejecutar(definicion, peticion);

    expect(segunda.ok).toBe(true);
    if (!segunda.ok) return;
    expect(segunda.datos).toEqual({ folio: 7 });
    expect(segunda.reintento).toBe(false);
    expect(veces).toBe(2);
  });
});
