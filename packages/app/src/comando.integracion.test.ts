import { conTransaccion, obtenerDb, type Transaccion } from '@morphiqpos/data';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { definirComando } from './comando.ts';
import { comando } from './produccion.ts';

/**
 * `comando()` contra Postgres de verdad.
 *
 * Las pruebas unitarias verifican que el envoltorio PIDE la reversión. Ésta
 * verifica que Postgres la cumple, que es la otra mitad y la que no se puede
 * simular: el índice único que serializa dos reclamaciones de la misma clave, y
 * el hecho de que revertir libere esa clave, son comportamientos del motor.
 *
 * Corre con `pnpm test:integracion`, que exige `DATABASE_URL`. No entra en la
 * puerta unitaria: sin base, fallaría siempre, y la reacción natural sería
 * saltársela. `scripts/verificar-pruebas.mjs` comprueba las dos cosas — que no
 * se cuele aquí y que sí corra allá.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const PERSONA = '22222222-2222-4222-8222-222222222222';
const IDENTIDAD = '33333333-3333-4333-8333-333333333333';
const EMPLEO = '44444444-4444-4444-8444-444444444444';

const ambito = {
  organizacionId: ORG,
  sucursalId: null,
  terminalId: null,
  identidadId: IDENTIDAD,
  empleoId: EMPLEO,
  rol: 'cajero',
} as const;

/** Un comando que escribe una fila real, para poder comprobar que se revierte. */
function comandoQueEscribe(fallar: boolean) {
  return definirComando<Transaccion, z.ZodObject<{ nombre: z.ZodString }>, { creado: string }>({
    nombre: 'catalogo.marcar',
    entidad: 'categoria',
    escribe: true,
    roles: ['cajero'],
    paquetes: ['esencial'],
    entrada: z.object({ nombre: z.string().min(1) }),
    async ejecutar(ctx, entrada) {
      const fila = await ctx.paso('escribir_categoria', () =>
        ctx.tx
          .insertInto('categorias')
          .values({ organizacion_id: ctx.ambito.organizacionId, nombre: entrada.nombre })
          .returning('id')
          .executeTakeFirstOrThrow(),
      );
      ctx.auditar({ entidadId: fila.id, payload: { nombre: entrada.nombre } });
      if (fallar) throw new Error('se cayó después de escribir');
      return { creado: fila.id };
    },
  });
}

async function contarCategorias(nombre: string): Promise<number> {
  const fila = await obtenerDb()
    .selectFrom('categorias')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('organizacion_id', '=', ORG)
    .where('nombre', '=', nombre)
    .executeTakeFirstOrThrow();
  return Number(fila.n);
}

beforeAll(async () => {
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('organizaciones')
      .values({
        id: ORG,
        nombre: 'Abarrotes de Prueba',
        slug: 'abarrotes-prueba',
        paquete: 'esencial',
      })
      .execute();
    await tx
      .insertInto('personas')
      .values({ id: PERSONA, organizacion_id: ORG, nombre: 'Rosa' })
      .execute();
    await tx.insertInto('identidades').values({ id: IDENTIDAD, persona_id: PERSONA }).execute();
    await tx
      .insertInto('empleos')
      .values({ id: EMPLEO, persona_id: PERSONA, organizacion_id: ORG, rol: 'cajero' })
      .execute();
  });
});

afterAll(async () => {
  // El borrado en cascada de `organizaciones` se lleva todo lo demás.
  await conTransaccion((tx) => tx.deleteFrom('organizaciones').where('id', '=', ORG).execute());
});

describe('comando() contra Postgres · atomicidad', () => {
  it('SALE-02: si el cuerpo falla después de escribir, la fila NO queda', async () => {
    const salida = await comando(comandoQueEscribe(true), {
      entrada: { nombre: 'Categoria fantasma' },
      ambito,
      idempotencyKey: 'integracion-fallo-0001',
    });

    expect(salida.ok).toBe(false);
    // Postgres revirtió: la categoría que el cuerpo alcanzó a insertar no existe.
    expect(await contarCategorias('Categoria fantasma')).toBe(0);
  });

  it('la clave de un comando fallido queda LIBRE y el reintento sí escribe', async () => {
    await comando(comandoQueEscribe(true), {
      entrada: { nombre: 'Reintento real' },
      ambito,
      idempotencyKey: 'integracion-libera-0001',
    });

    const segunda = await comando(comandoQueEscribe(false), {
      entrada: { nombre: 'Reintento real' },
      ambito,
      idempotencyKey: 'integracion-libera-0001',
    });

    expect(segunda.ok).toBe(true);
    if (!segunda.ok) return;
    expect(segunda.reintento).toBe(false);
    expect(await contarCategorias('Reintento real')).toBe(1);
  });

  it('SALE-03: el mismo cobro reintentado tres veces escribe UNA sola vez', async () => {
    const peticion = {
      entrada: { nombre: 'Una sola vez' },
      ambito,
      idempotencyKey: 'integracion-idem-0001',
    };
    const definicion = comandoQueEscribe(false);

    const a = await comando(definicion, peticion);
    const b = await comando(definicion, peticion);
    const c = await comando(definicion, peticion);

    expect([a.ok, b.ok, c.ok]).toEqual([true, true, true]);
    expect(await contarCategorias('Una sola vez')).toBe(1);
    expect(a.ok && a.reintento).toBe(false);
    expect(b.ok && b.reintento).toBe(true);
    expect(c.ok && c.reintento).toBe(true);
  });

  it('FOLIO/CASH: dos ejecuciones EN PARALELO con la misma clave escriben una vez', async () => {
    // Concurrencia de verdad: dos promesas sin await entre ellas. La segunda se
    // bloquea en el índice único hasta que la primera confirma.
    const peticion = {
      entrada: { nombre: 'Concurrente' },
      ambito,
      idempotencyKey: 'integracion-concurrente-0001',
    };
    const definicion = comandoQueEscribe(false);

    const [a, b] = await Promise.all([
      comando(definicion, peticion),
      comando(definicion, peticion),
    ]);

    expect(await contarCategorias('Concurrente')).toBe(1);
    // Una ejecutó y la otra recibió respuesta guardada o conflicto; ninguna
    // duplicó, que es lo único que no se puede permitir.
    const exitos = [a, b].filter((r) => r.ok);
    expect(exitos.length).toBeGreaterThanOrEqual(1);
  });
});

describe('comando() contra Postgres · auditoría', () => {
  it('el rastro del éxito se confirma con el comando', async () => {
    const salida = await comando(comandoQueEscribe(false), {
      entrada: { nombre: 'Con rastro' },
      ambito,
      idempotencyKey: 'integracion-auditoria-0001',
    });
    expect(salida.ok).toBe(true);

    const fila = await obtenerDb()
      .selectFrom('auditoria')
      .select(['accion', 'entidad', 'correlation_id'])
      .where('organizacion_id', '=', ORG)
      .where('correlation_id', '=', salida.correlationId)
      .executeTakeFirst();

    expect(fila?.accion).toBe('catalogo.marcar');
    expect(fila?.entidad).toBe('categoria');
  });

  it('el rastro de un rechazo SOBREVIVE a la reversión que lo causó', async () => {
    const salida = await comando(comandoQueEscribe(false), {
      entrada: { nombre: 'Sin permiso' },
      ambito: { ...ambito, rol: 'cocina' },
      idempotencyKey: 'integracion-rechazo-0001',
    });

    expect(salida.ok).toBe(false);

    const fila = await obtenerDb()
      .selectFrom('auditoria')
      .select(['accion', 'payload'])
      .where('organizacion_id', '=', ORG)
      .where('correlation_id', '=', salida.correlationId)
      .executeTakeFirst();

    expect(fila).toBeDefined();
    expect(fila?.accion).toBe('catalogo.marcar');
  });
});
