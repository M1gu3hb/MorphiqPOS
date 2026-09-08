import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { crearComando, definirComando } from './comando.ts';
import { ambitoDeCajero, crearFabrica, type TxFalsa } from './pruebas/dobles.ts';

/**
 * Auditoría de acciones sensibles.
 *
 * Dos propiedades, y la segunda es la que se olvida: la auditoría del ÉXITO va
 * dentro de la transacción (si el cobro se revierte, su rastro se revierte con
 * él), y la del RECHAZO va fuera (si fuera dentro, la reversión la borraría y
 * un intento denegado no dejaría huella).
 */

const CLAVE = 'clave-de-idempotencia-0001';
const ENTRADA = { ordenId: '66666666-6666-4666-8666-666666666666' };

const BASE = {
  nombre: 'venta.cobrar',
  entidad: 'orden',
  escribe: true,
  roles: ['cajero'],
  paquetes: ['tienda'],
  entrada: z.object({ ordenId: z.uuid() }),
} as const;

describe('comando() · auditoría del éxito', () => {
  it('escribe una fila con la acción, la entidad y el ámbito', async () => {
    const fabrica = crearFabrica('tienda');
    const definicion = definirComando({
      ...BASE,
      async ejecutar(ctx, entrada) {
        ctx.auditar({ entidadId: entrada.ordenId, payload: { folio: 1043 } });
        return { folio: 1043 };
      },
    });

    await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    const filas = fabrica.auditoriaConfirmada();
    expect(filas).toHaveLength(1);
    const fila = filas[0];
    expect(fila?.accion).toBe('venta.cobrar');
    expect(fila?.entidad).toBe('orden');
    expect(fila?.entidadId).toBe(ENTRADA.ordenId);
    expect(fila?.organizacionId).toBe(ambitoDeCajero().organizacionId);
    expect(fila?.identidadId).toBe(ambitoDeCajero().identidadId);
    expect(fila?.terminalId).toBe(ambitoDeCajero().terminalId);
    expect(fila?.payload['resultado']).toBe('ok');
    expect(fila?.payload['rol']).toBe('cajero');
  });

  it('una sola fila por ejecución, aunque el comando toque varias tablas', async () => {
    const fabrica = crearFabrica('tienda');
    const definicion = definirComando({
      ...BASE,
      async ejecutar(ctx, entrada) {
        ctx.auditar({ entidadId: entrada.ordenId, payload: { efectos: { pagos: 2 } } });
        return { folio: 1 };
      },
    });

    await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(fabrica.auditoriaConfirmada()).toHaveLength(1);
  });

  it('un comando que declara escribir y NO audita es un error del programa', async () => {
    // Declarar sensible algo que no deja rastro convierte la auditoría en un
    // adorno. Vale más romper en desarrollo que tener un histórico incompleto.
    const fabrica = crearFabrica('tienda');
    const definicion = definirComando({
      ...BASE,
      async ejecutar() {
        return { folio: 1 };
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
    expect(fabrica.base.transacciones.every((t) => !t.confirmada)).toBe(true);
  });
});

describe('comando() · auditoría del rechazo', () => {
  it('un permiso denegado deja rastro, fuera de la transacción revertida', async () => {
    const fabrica = crearFabrica('tienda');
    const definicion = definirComando({
      ...BASE,
      roles: ['dueno'],
      async ejecutar() {
        return { folio: 1 };
      },
    });

    await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero({ rol: 'cajero' }),
      idempotencyKey: CLAVE,
    });

    const filas = fabrica.auditoriaConfirmada();
    expect(filas).toHaveLength(1);
    expect(filas[0]?.payload['resultado']).toBe('denegado');
    expect(filas[0]?.payload['codigo']).toBe('SIN_PERMISO');
  });

  it('un paquete no incluido también deja rastro', async () => {
    const fabrica = crearFabrica('tienda');
    const definicion = definirComando({
      ...BASE,
      paquetes: ['restaurante'],
      async ejecutar() {
        return { folio: 1 };
      },
    });

    await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: ENTRADA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    const filas = fabrica.auditoriaConfirmada();
    expect(filas).toHaveLength(1);
    expect(filas[0]?.payload['codigo']).toBe('PAQUETE_NO_INCLUYE');
  });

  it('una entrada inválida NO se audita: es ruido de teclado', async () => {
    const fabrica = crearFabrica('tienda');
    const definicion = definirComando({
      ...BASE,
      async ejecutar() {
        return { folio: 1 };
      },
    });

    await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: { ordenId: 'x' },
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(fabrica.auditoriaConfirmada()).toHaveLength(0);
  });
});

describe('comando() · saneado del payload (R31)', () => {
  it('redacta pin, hash, token y contraseña a cualquier profundidad', async () => {
    const fabrica = crearFabrica('tienda');
    const definicion = definirComando({
      nombre: 'identidad.enrolar',
      entidad: 'identidad',
      escribe: true,
      roles: ['cajero'],
      paquetes: ['tienda'],
      entrada: z.object({
        pin: z.string(),
        anidado: z.object({ device_token: z.string(), nombre: z.string() }),
      }),
      async ejecutar(ctx) {
        ctx.auditar({
          entidadId: null,
          payload: { pin_hash: '$argon2id$muy$secreto', visible: 'esto sí se guarda' },
        });
        return { hecho: true };
      },
    });

    await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: {
        pin: '4821',
        anidado: { device_token: 'tok_secretisimo', nombre: 'Caja 1' },
      },
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    const texto = JSON.stringify(fabrica.auditoriaConfirmada());
    expect(texto).not.toContain('4821');
    expect(texto).not.toContain('tok_secretisimo');
    expect(texto).not.toContain('muy$secreto');
    // Lo que no es secreto se conserva: si no, la auditoría no sirve para nada.
    expect(texto).toContain('Caja 1');
    expect(texto).toContain('esto sí se guarda');
  });
});
