import { describe, expect, it } from 'vitest';

import { esFalloDeConexion, leyendoConReintento } from './reintento-de-conexion.ts';

/**
 * El reintento de lectura, y sus dos límites.
 *
 * Existe por los `ECONNRESET` que el pooler en modo transacción deja en la
 * primera consulta de una conexión recién abierta. Lo que esta prueba defiende no
 * es que reintente —eso es la parte fácil— sino **lo que NO reintenta**: un error
 * de la consulta se propaga tal cual, porque taparlo con un reintento esconde el
 * defecto detrás de una latencia. Y reintenta UNA vez, no tres.
 */
describe('reconocer un fallo de conexión', () => {
  it('reconoce ECONNRESET por su código', () => {
    expect(
      esFalloDeConexion(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })),
    ).toBe(true);
  });

  it('reconoce los que `pg` emite sin código, por su texto', () => {
    expect(esFalloDeConexion(new Error('Connection terminated unexpectedly'))).toBe(true);
    expect(esFalloDeConexion(new Error('Client has encountered a connection error'))).toBe(true);
  });

  it('NO confunde un error de la consulta con uno de la conexión', () => {
    // 23503 es una clave foránea y 42501 un permiso. Los dos son de la consulta,
    // y repetirlos da exactamente el mismo error con el doble de latencia.
    expect(esFalloDeConexion(Object.assign(new Error('foreign key'), { code: '23503' }))).toBe(
      false,
    );
    expect(esFalloDeConexion(Object.assign(new Error('permiso'), { code: '42501' }))).toBe(false);
    expect(esFalloDeConexion(new Error('la entidad no existe en el puente'))).toBe(false);
    expect(esFalloDeConexion(null)).toBe(false);
    expect(esFalloDeConexion('ECONNRESET')).toBe(false);
  });
});

describe('leyendoConReintento', () => {
  it('no reintenta lo que salió bien', async () => {
    let veces = 0;
    const filas = await leyendoConReintento(() => {
      veces += 1;
      return Promise.resolve(['una fila']);
    });
    expect(filas).toEqual(['una fila']);
    expect(veces).toBe(1);
  });

  it('reintenta UNA vez cuando se cayó la conexión, y devuelve el segundo', async () => {
    let veces = 0;
    const filas = await leyendoConReintento(() => {
      veces += 1;
      if (veces === 1) {
        return Promise.reject(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));
      }
      return Promise.resolve(['la segunda sí']);
    });
    expect(filas).toEqual(['la segunda sí']);
    expect(veces).toBe(2);
  });

  it('UNA, no dos: si el segundo también se cae, el error sale', async () => {
    let veces = 0;
    await expect(
      leyendoConReintento(() => {
        veces += 1;
        return Promise.reject(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));
      }),
    ).rejects.toThrow('socket hang up');
    expect(
      veces,
      'Tres intentos con espera convierten un 500 rápido en un 500 lento, y un cajero ' +
        'no puede esperar (R12).',
    ).toBe(2);
  });

  it('un error de la CONSULTA no se reintenta: sale a la primera', async () => {
    let veces = 0;
    await expect(
      leyendoConReintento(() => {
        veces += 1;
        return Promise.reject(
          Object.assign(new Error('viola una clave foránea'), { code: '23503' }),
        );
      }),
    ).rejects.toThrow('viola una clave foránea');
    expect(veces).toBe(1);
  });
});
