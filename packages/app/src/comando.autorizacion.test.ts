import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Transaccion } from '@morphiqpos/data';

import { crearModificadorProducto } from './catalogo/modificadores.ts';
import { crearComando, definirComando } from './comando.ts';
import type { RepositorioComandos } from './repositorio.ts';
import { ambitoDeCajero, crearFabrica, type TxFalsa } from './pruebas/dobles.ts';

/**
 * Autorización y validación del envoltorio.
 *
 * Las tres comprobaciones que corren ANTES de abrir la transacción —rol,
 * paquete y forma de la entrada— y, sobre todo, el orden entre ellas.
 */

const CLAVE = 'clave-de-idempotencia-0001';

/** Un comando de juguete que registra si su cuerpo llegó a correr. */
function comandoDeJuguete(opciones: {
  roles?: readonly ('cajero' | 'gerente' | 'dueno')[];
  paquetes?: readonly ('esencial' | 'restaurante_pro')[];
}) {
  const corridas: string[] = [];
  const definicion = definirComando({
    nombre: 'venta.cobrar',
    entidad: 'orden',
    escribe: true,
    roles: opciones.roles ?? ['cajero', 'gerente', 'dueno'],
    paquetes: opciones.paquetes ?? ['esencial', 'restaurante_pro'],
    entrada: z.object({ ordenId: z.uuid(), propinaCentavos: z.number().int().nonnegative() }),
    async ejecutar(ctx, entrada) {
      corridas.push(entrada.ordenId);
      ctx.auditar({ entidadId: entrada.ordenId, payload: { folio: 1 } });
      return { folio: 1 };
    },
  });
  return { definicion, corridas };
}

const ENTRADA_BUENA = {
  ordenId: '66666666-6666-4666-8666-666666666666',
  propinaCentavos: 0,
};

describe('comando() · validación de la entrada', () => {
  it('rechaza una entrada que no cumple el esquema y NO ejecuta el cuerpo', async () => {
    const fabrica = crearFabrica('esencial');
    const { definicion, corridas } = comandoDeJuguete({});
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: { ordenId: 'no-es-un-uuid', propinaCentavos: -5 },
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('ENTRADA_INVALIDA');
    expect(corridas).toHaveLength(0);
    // Lo que importa no es cuántas transacciones se abrieron —leer el paquete
    // exige una— sino que ninguna dejó nada escrito.
    expect(fabrica.base.confirmadas).toHaveLength(0);
  });

  it('nombra el campo que falló SIN devolver el valor recibido', async () => {
    const fabrica = crearFabrica('esencial');
    const { definicion } = comandoDeJuguete({});
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: { ordenId: 'CORREO-SECRETO@ejemplo.com', propinaCentavos: 0 },
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    const problemas = salida.error.problemas ?? [];
    expect(problemas.map((p) => p.ruta)).toContain('ordenId');
    // El valor que mandó el cliente puede ser un dato personal. Nunca vuelve.
    expect(JSON.stringify(salida)).not.toContain('CORREO-SECRETO');
  });

  it('rechaza propiedades que el esquema no declara', async () => {
    const fabrica = crearFabrica('esencial');
    const { definicion } = comandoDeJuguete({});
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      // `totalCentavos` es justo lo que P0-07 prohíbe aceptar del cliente.
      entrada: { ...ENTRADA_BUENA, totalCentavos: 1 },
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('ENTRADA_INVALIDA');
  });
});

describe('comando() · permiso por rol (R11)', () => {
  it('deniega a un rol fuera de la lista, sin tocar nada', async () => {
    const fabrica = crearFabrica('esencial');
    const { definicion, corridas } = comandoDeJuguete({ roles: ['gerente', 'dueno'] });
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: ENTRADA_BUENA,
      ambito: ambitoDeCajero({ rol: 'cajero' }),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('SIN_PERMISO');
    expect(corridas).toHaveLength(0);
    expect(fabrica.base.confirmadas.filter((e) => e.tabla === 'comandos_ejecutados')).toHaveLength(
      0,
    );
  });

  it('permite al rol que sí está en la lista', async () => {
    const fabrica = crearFabrica('esencial');
    const { definicion, corridas } = comandoDeJuguete({ roles: ['cajero'] });
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: ENTRADA_BUENA,
      ambito: ambitoDeCajero({ rol: 'cajero' }),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(true);
    expect(corridas).toHaveLength(1);
  });
});

describe('comando() · paquete de la organización (A-42, prueba PAQ-01)', () => {
  it('un comando real de modificadores devuelve 403 fuera de cafetería/restaurante', async () => {
    const fabrica = crearFabrica('esencial');
    const ejecutar = crearComando<Transaccion>({
      repositorio: fabrica.repositorio as unknown as RepositorioComandos<Transaccion>,
      conTransaccion: fabrica.conTransaccion as unknown as <T>(
        fn: (tx: Transaccion) => Promise<T>,
      ) => Promise<T>,
    });

    const salida = await ejecutar(crearModificadorProducto, {
      entrada: {},
      ambito: ambitoDeCajero({ rol: 'dueno' }),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('PAQUETE_NO_INCLUYE');
  });

  it('devuelve PAQUETE_NO_INCLUYE antes de ejecutar el caso de uso', async () => {
    const fabrica = crearFabrica('esencial');
    const { definicion, corridas } = comandoDeJuguete({ paquetes: ['restaurante_pro'] });
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: ENTRADA_BUENA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('PAQUETE_NO_INCLUYE');
    expect(corridas).toHaveLength(0);
  });

  it('el paquete se lee de la organización, no de la entrada', async () => {
    const fabrica = crearFabrica('restaurante_pro');
    const { definicion, corridas } = comandoDeJuguete({ paquetes: ['restaurante_pro'] });
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: ENTRADA_BUENA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(true);
    expect(corridas).toHaveLength(1);
  });

  it('una organización sin paquete legible se trata como no incluida, no como permitida', async () => {
    const fabrica = crearFabrica('esencial');
    fabrica.ponerPaquete(null);
    const { definicion, corridas } = comandoDeJuguete({});
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: ENTRADA_BUENA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('PAQUETE_NO_INCLUYE');
    expect(corridas).toHaveLength(0);
  });
});

describe('comando() · orden de las comprobaciones', () => {
  it('el permiso se comprueba ANTES que la forma de la entrada', async () => {
    // Si el 400 llegara primero, un rol sin permiso podría sondear el esquema de
    // un comando administrativo campo por campo, a base de entradas inválidas.
    const fabrica = crearFabrica('esencial');
    const { definicion } = comandoDeJuguete({ roles: ['dueno'] });
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: { basura: true },
      ambito: ambitoDeCajero({ rol: 'cajero' }),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('SIN_PERMISO');
  });

  it('el paquete se comprueba ANTES que la forma de la entrada', async () => {
    const fabrica = crearFabrica('esencial');
    const { definicion } = comandoDeJuguete({ paquetes: ['restaurante_pro'] });
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: { basura: true },
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('PAQUETE_NO_INCLUYE');
  });
});
