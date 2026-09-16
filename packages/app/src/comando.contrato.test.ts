import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { crearComando, definirComando } from './comando.ts';
import { ambitoDeCajero, crearFabrica, type TxFalsa } from './pruebas/dobles.ts';

/**
 * El contrato que hace real a R16.
 *
 * R16: «El ámbito viene de la sesión del servidor, jamás de un parámetro del
 * cliente.» Escribirlo en un documento no lo impide; lo impide que un comando
 * que declare `organizacion_id` en su entrada **no se pueda definir**.
 *
 * La comprobación vive en `definirComando`, no en una prueba que recorra un
 * registro. Un registro sólo contiene lo que alguien recordó registrar: si un
 * comando nuevo se olvida de registrarse, la prueba pasa y la regla no se
 * cumple. Fallar al definir no se puede olvidar — el módulo no carga.
 */

const CLAVES_DE_AMBITO = [
  'organizacion_id',
  'organizacionId',
  'sucursal_id',
  'sucursalId',
  'identidad_id',
  'identidadId',
  'empleo_id',
  'empleoId',
  'terminal_id',
  'terminalId',
  'rol',
];

describe('definirComando() · el cliente no elige su ámbito (R16)', () => {
  for (const clave of CLAVES_DE_AMBITO) {
    it(`rechaza un comando cuya entrada declara "${clave}"`, () => {
      expect(() =>
        definirComando({
          nombre: 'venta.cobrar',
          entidad: 'orden',
          escribe: true,
          roles: ['cajero'],
          paquetes: ['tienda'],
          entrada: z.object({ [clave]: z.string(), ordenId: z.uuid() }),
          async ejecutar() {
            return {};
          },
        }),
      ).toThrow(/ámbito/i);
    });
  }

  it('acepta una entrada que sólo trae datos del caso de uso', () => {
    expect(() =>
      definirComando({
        nombre: 'venta.cobrar',
        entidad: 'orden',
        escribe: true,
        roles: ['cajero'],
        paquetes: ['tienda'],
        entrada: z.object({ ordenId: z.uuid(), propinaCentavos: z.number().int() }),
        async ejecutar() {
          return {};
        },
      }),
    ).not.toThrow();
  });

  it('un nombre fuera de la forma dominio.verbo se rechaza', () => {
    // El nombre viaja a tres sitios —permiso, auditoría e idempotencia— y el
    // `check` de la migración 010 lo exige. Fallar aquí es fallar temprano.
    expect(() =>
      definirComando({
        nombre: 'cobrar',
        entidad: 'orden',
        escribe: true,
        roles: ['cajero'],
        paquetes: ['tienda'],
        entrada: z.object({}),
        async ejecutar() {
          return {};
        },
      }),
    ).toThrow(/dominio\.verbo/i);
  });

  it('un comando sin ningún rol permitido se rechaza', () => {
    // Una lista vacía es indistinguible de «se me olvidó» y niega a todo el
    // mundo en silencio, que es como se descubre en producción.
    expect(() =>
      definirComando({
        nombre: 'venta.cobrar',
        entidad: 'orden',
        escribe: true,
        roles: [],
        paquetes: ['tienda'],
        entrada: z.object({}),
        async ejecutar() {
          return {};
        },
      }),
    ).toThrow(/rol/i);
  });

  it('un comando sin ningún paquete se rechaza', () => {
    expect(() =>
      definirComando({
        nombre: 'venta.cobrar',
        entidad: 'orden',
        escribe: true,
        roles: ['cajero'],
        paquetes: [],
        entrada: z.object({}),
        async ejecutar() {
          return {};
        },
      }),
    ).toThrow(/paquete/i);
  });
});

describe('comando() · el ámbito de la sesión gana siempre', () => {
  it('el cuerpo recibe el ámbito del servidor, no lo que venga en la entrada', async () => {
    const fabrica = crearFabrica('tienda');
    let visto = '';

    const definicion = definirComando({
      nombre: 'venta.cobrar',
      entidad: 'orden',
      escribe: true,
      roles: ['cajero'],
      paquetes: ['tienda'],
      entrada: z.object({ ordenId: z.uuid() }),
      async ejecutar(ctx, entrada) {
        visto = ctx.ambito.organizacionId;
        ctx.auditar({ entidadId: entrada.ordenId, payload: {} });
        return { ok: true };
      },
    });

    const ambito = ambitoDeCajero();
    await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: { ordenId: '66666666-6666-4666-8666-666666666666' },
      ambito,
      idempotencyKey: 'clave-de-idempotencia-0001',
    });

    expect(visto).toBe(ambito.organizacionId);
  });
});
