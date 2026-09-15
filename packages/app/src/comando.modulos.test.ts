import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { crearComando, definirComando } from './comando.ts';
import { ambitoDeCajero, crearFabrica, type TxFalsa } from './pruebas/dobles.ts';

/**
 * F-016 · La perilla de módulo, en el envoltorio.
 *
 * ── Por qué esta prueba existe ─────────────────────────────────────────────
 * Porque una perilla que sólo apaga un botón de la navegación no apaga nada: el
 * botón se salta con la consola del navegador y la ruta sigue ahí. La única
 * perilla que vale es la que vive en el SERVIDOR, antes de tocar la base, y
 * ésta es la prueba de que vive ahí.
 *
 * ── El orden importa tanto como la comprobación ────────────────────────────
 * Rol, paquete, MÓDULO, y sólo entonces la forma de la entrada. Si la entrada
 * se validara antes, un negocio con el módulo apagado podría sondear el esquema
 * del comando campo por campo a base de entradas inválidas — que es la misma
 * razón por la que el rol va primero.
 */

const CLAVE = 'clave-de-idempotencia-0001';

function comandoConPerilla() {
  const corridas: string[] = [];
  const definicion = definirComando({
    nombre: 'inventario.guardar_receta',
    entidad: 'receta',
    escribe: true,
    roles: ['cajero', 'gerente', 'dueno'],
    paquetes: ['esencial', 'operativo', 'restaurante_pro'],
    modulo: 'recetas',
    entrada: z.object({ productoId: z.uuid() }),
    async ejecutar(ctx, entrada) {
      corridas.push(entrada.productoId);
      ctx.auditar({ entidadId: entrada.productoId, payload: {} });
      return { ok: true };
    },
  });
  return { definicion, corridas };
}

const ENTRADA = { productoId: '66666666-6666-4666-8666-666666666666' };

describe('comando() · la perilla de módulo (F-016)', () => {
  it('ejecuta cuando el módulo está encendido', async () => {
    const fabrica = crearFabrica('operativo');
    fabrica.ponerModulos(['recetas', 'inventario']);
    const { definicion, corridas } = comandoConPerilla();
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero({ rol: 'dueno' }),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(true);
    expect(corridas).toHaveLength(1);
  });

  it('devuelve PAQUETE_NO_INCLUYE y NO ejecuta el cuerpo cuando está apagado', async () => {
    const fabrica = crearFabrica('operativo');
    fabrica.ponerModulos(['inventario']);
    const { definicion, corridas } = comandoConPerilla();
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero({ rol: 'dueno' }),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('PAQUETE_NO_INCLUYE');
    expect(corridas).toHaveLength(0);
  });

  it('falla CERRADO si no se pudo leer el perfil de la organización', async () => {
    const fabrica = crearFabrica('operativo');
    fabrica.ponerModulos(null);
    const { definicion, corridas } = comandoConPerilla();
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero({ rol: 'dueno' }),
      idempotencyKey: CLAVE,
    });

    // Una organización de la que no sabemos nada no es una con todo encendido.
    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('PAQUETE_NO_INCLUYE');
    expect(corridas).toHaveLength(0);
  });

  it('un comando SIN módulo no consulta perillas, y corre aunque no haya ninguna', async () => {
    const fabrica = crearFabrica('operativo');
    fabrica.ponerModulos([]);
    const corridas: string[] = [];
    const definicion = definirComando({
      nombre: 'venta.cobrar',
      entidad: 'orden',
      escribe: true,
      roles: ['cajero', 'dueno'],
      paquetes: ['esencial', 'operativo', 'restaurante_pro'],
      entrada: z.object({ ordenId: z.uuid() }),
      async ejecutar(ctx, entrada) {
        corridas.push(entrada.ordenId);
        ctx.auditar({ entidadId: entrada.ordenId, payload: {} });
        return { ok: true };
      },
    });
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: { ordenId: '66666666-6666-4666-8666-666666666666' },
      ambito: ambitoDeCajero({ rol: 'cajero' }),
      idempotencyKey: CLAVE,
    });

    // Cobrar no se puede apagar. Si colgara de una perilla, apagarla dejaría al
    // negocio sin poder vender, que no es una opción que nadie quiera ofrecer.
    expect(salida.ok).toBe(true);
    expect(corridas).toHaveLength(1);
  });

  it('el módulo se comprueba ANTES que la forma de la entrada', async () => {
    const fabrica = crearFabrica('operativo');
    fabrica.ponerModulos(['inventario']);
    const { definicion } = comandoConPerilla();
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: { productoId: 'esto-no-es-un-uuid' },
      ambito: ambitoDeCajero({ rol: 'dueno' }),
      idempotencyKey: CLAVE,
    });

    // Si respondiera ENTRADA_INVALIDA, un negocio con el módulo apagado podría
    // deducir el esquema del comando campo por campo.
    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('PAQUETE_NO_INCLUYE');
  });

  it('el módulo se comprueba DESPUÉS del paquete: un paquete ajeno no llega a mirar perillas', async () => {
    const fabrica = crearFabrica(null);
    fabrica.ponerModulos(['recetas']);
    const { definicion, corridas } = comandoConPerilla();
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero({ rol: 'dueno' }),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('PAQUETE_NO_INCLUYE');
    expect(corridas).toHaveLength(0);
  });
});
