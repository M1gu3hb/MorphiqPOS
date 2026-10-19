import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { cerrarDb, obtenerDb } from '../cliente.ts';
import { contarIntento, devolverIntento } from './limite.ts';

/**
 * El contador de la entrada contra Postgres: se cuenta antes de verificar y la entrada
 * correcta devuelve su intento. Lo que se comprueba aquí es la SQL —que devolver baja
 * uno, nunca de cero, y sólo en su cubo—; la ruta que decide cuándo devolver tiene su
 * prueba en `apps/web/src/servidor/auth-entrar-cuota.test.ts`.
 */

const CUBO = 'prueba-de-integracion-devolver-a';
const OTRO = 'prueba-de-integracion-devolver-b';
const VENTANA = 300;

beforeEach(async () => {
  await obtenerDb().deleteFrom('limite_tasa').where('clave', 'in', [CUBO, OTRO]).execute();
});

afterAll(async () => {
  await obtenerDb().deleteFrom('limite_tasa').where('clave', 'in', [CUBO, OTRO]).execute();
  await cerrarDb();
});

describe('devolverIntento contra Postgres', () => {
  it('veinte entradas correctas seguidas no gastan la cuota', async () => {
    for (let i = 0; i < 20; i += 1) {
      const { intentos } = await contarIntento(CUBO, VENTANA);
      expect(intentos).toBe(1);
      await devolverIntento(CUBO);
    }
    const tras = await contarIntento(CUBO, VENTANA);
    expect(tras.intentos).toBe(1);
  });

  it('las que fallan se acumulan; devolver baja una y sólo en su cubo', async () => {
    await contarIntento(CUBO, VENTANA);
    await contarIntento(CUBO, VENTANA);
    await contarIntento(OTRO, VENTANA);

    await devolverIntento(CUBO);

    expect((await contarIntento(CUBO, VENTANA)).intentos).toBe(2);
    expect((await contarIntento(OTRO, VENTANA)).intentos).toBe(2);
  });

  it('nunca baja de cero, ni crea un cubo que no existía', async () => {
    await devolverIntento(CUBO);
    const filas = await obtenerDb()
      .selectFrom('limite_tasa')
      .select('intentos')
      .where('clave', '=', CUBO)
      .execute();
    expect(filas).toEqual([]);

    await contarIntento(CUBO, VENTANA);
    await devolverIntento(CUBO);
    await devolverIntento(CUBO);
    expect((await contarIntento(CUBO, VENTANA)).intentos).toBe(1);
  });

  it('en paralelo, cada petición en vuelo ocupa su lugar: veinte y una no pasan todas', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 21 }, () => contarIntento(CUBO, VENTANA)),
    );
    const vistos = resultados.map((r) => r.intentos).sort((a, b) => a - b);
    expect(vistos).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
  });
});
