import { ErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { crearComando, definirComando } from './comando.ts';
import { ambitoDeCajero, crearFabrica, type TxFalsa } from './pruebas/dobles.ts';

/**
 * Transacción, inyección de fallos y traducción de errores.
 *
 * El criterio de aceptación de A-01 dice: «si el cuerpo lanza a mitad, no queda
 * nada persistido — se verifica con inyección de fallos». Aquí se verifica que
 * el ENVOLTORIO revierte; que Postgres cumpla la reversión lo prueba
 * `comando.integracion.test.ts` contra una base real.
 */

const CLAVE = 'clave-de-idempotencia-0001';
const ENTRADA = { ordenId: '66666666-6666-4666-8666-666666666666' };

const BASE = {
  nombre: 'venta.cobrar',
  entidad: 'orden',
  escribe: true,
  roles: ['cajero'],
  paquetes: ['esencial'],
  entrada: z.object({ ordenId: z.uuid() }),
} as const;

describe('comando() · todo o nada', () => {
  it('si el cuerpo lanza, nada queda confirmado', async () => {
    const fabrica = crearFabrica('esencial');
    const definicion = definirComando({
      ...BASE,
      async ejecutar(ctx, entrada) {
        ctx.auditar({ entidadId: entrada.ordenId, payload: { folio: 1 } });
        throw new Error('se cayó a la mitad');
      },
    });

    const salida = await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    // Ni la fila de idempotencia ni la auditoría del éxito sobreviven.
    expect(fabrica.base.confirmadas.filter((e) => e.tabla === 'comandos_ejecutados')).toHaveLength(
      0,
    );
    expect(fabrica.base.revertidas.length).toBeGreaterThan(0);
    expect(fabrica.base.transacciones.every((t) => !t.confirmada)).toBe(true);
  });

  it('un comando exitoso confirma la transacción', async () => {
    const fabrica = crearFabrica('esencial');
    const definicion = definirComando({
      ...BASE,
      async ejecutar(ctx, entrada) {
        ctx.auditar({ entidadId: entrada.ordenId, payload: {} });
        return { folio: 1 };
      },
    });

    const salida = await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(true);
    expect(fabrica.base.transacciones.filter((t) => t.confirmada)).toHaveLength(1);
    expect(fabrica.base.revertidas).toHaveLength(0);
  });
});

describe('comando() · inyección de fallo por nombre de paso', () => {
  it('interrumpe el paso indicado y revierte', async () => {
    const fabrica = crearFabrica('esencial');
    const alcanzados: string[] = [];

    const definicion = definirComando({
      ...BASE,
      async ejecutar(ctx, entrada) {
        await ctx.paso('cargar_orden', async () => {
          alcanzados.push('cargar_orden');
        });
        await ctx.paso('descontar_stock', async () => {
          alcanzados.push('descontar_stock');
        });
        ctx.auditar({ entidadId: entrada.ordenId, payload: {} });
        return { folio: 1 };
      },
    });

    const salida = await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
      interrumpirEn: 'descontar_stock',
    });

    expect(salida.ok).toBe(false);
    // El paso anterior sí corrió; el interrumpido no.
    expect(alcanzados).toEqual(['cargar_orden']);
    // Nada del comando sobrevive. La única fila confirmada es la auditoría del
    // rechazo, y tiene que estar: un fallo sin rastro no se puede investigar.
    expect(fabrica.base.confirmadas.filter((e) => e.tabla === 'comandos_ejecutados')).toHaveLength(
      0,
    );
    expect(fabrica.auditoriaConfirmada()).toHaveLength(1);
  });

  it('interrumpir un paso que no existe es un error, no un silencio', async () => {
    // Un nombre mal escrito haría que la prueba de inyección pasara sin
    // interrumpir nada, y afirmaría una atomicidad que nadie probó.
    const fabrica = crearFabrica('esencial');
    const definicion = definirComando({
      ...BASE,
      async ejecutar(ctx, entrada) {
        await ctx.paso('cargar_orden', async () => undefined);
        ctx.auditar({ entidadId: entrada.ordenId, payload: {} });
        return { folio: 1 };
      },
    });

    const salida = await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
      interrumpirEn: 'paso_que_no_existe',
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('ERROR_INTERNO');
  });
});

describe('comando() · traducción de errores', () => {
  it('un ErrorDominio del cuerpo llega como REGLA_DE_NEGOCIO con su código', async () => {
    const fabrica = crearFabrica('esencial');
    const definicion = definirComando({
      ...BASE,
      async ejecutar() {
        throw new ErrorDominio('DINERO_NO_ENTERO', 'el importe no es un entero de centavos');
      },
    });

    const salida = await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('REGLA_DE_NEGOCIO');
    expect(salida.error.datos?.['regla']).toBe('DINERO_NO_ENTERO');
  });

  it('un error inesperado NO filtra su mensaje al cliente', async () => {
    const fabrica = crearFabrica('esencial');
    const definicion = definirComando({
      ...BASE,
      async ejecutar() {
        throw new Error('relation "ordenes_secretas" does not exist at character 42');
      },
    });

    const salida = await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('ERROR_INTERNO');
    // El nombre de la tabla y el detalle de Postgres se quedan en el servidor.
    expect(JSON.stringify(salida)).not.toContain('ordenes_secretas');
    expect(JSON.stringify(salida)).not.toContain('character 42');
    // Pero el correlation id sí viaja: es con lo que se busca en la auditoría.
    expect(salida.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('comando() · correlation id', () => {
  it('respeta el que llega si es un uuid', async () => {
    const fabrica = crearFabrica('esencial');
    const definicion = definirComando({
      ...BASE,
      async ejecutar(ctx, entrada) {
        ctx.auditar({ entidadId: entrada.ordenId, payload: {} });
        return { folio: 1 };
      },
    });
    const dado = '88888888-8888-4888-8888-888888888888';

    const salida = await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
      correlationId: dado,
    });

    expect(salida.correlationId).toBe(dado);
  });

  it('genera uno si el que llega no es un uuid, en vez de propagar basura', async () => {
    const fabrica = crearFabrica('esencial');
    const definicion = definirComando({
      ...BASE,
      async ejecutar(ctx, entrada) {
        ctx.auditar({ entidadId: entrada.ordenId, payload: {} });
        return { folio: 1 };
      },
    });

    const salida = await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
      correlationId: '<script>alert(1)</script>',
    });

    expect(salida.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(salida.correlationId).not.toContain('script');
  });
});
