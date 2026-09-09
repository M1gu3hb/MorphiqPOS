import { describe, expect, it } from 'vitest';

import { ErrorDeEntorno, validarEntorno } from './index.ts';

/**
 * El criterio de aceptacion de F1.0-T12, dicho tal cual:
 *
 *   "Borrar una variable de .env produce un error claro al arrancar, no un
 *    fallo silencioso a las tres pantallas."
 *
 * Estas pruebas comprueban las dos mitades: que falla, y que el mensaje sirve
 * para arreglarlo sin ir a leer el codigo.
 */

const VALIDO = {
  DATABASE_URL: 'postgres://morphiqpos:clave@localhost:5433/morphiqpos',
  STORAGE_ENDPOINT: 'http://localhost:9000',
  STORAGE_BUCKET: 'morphiqpos',
  STORAGE_ACCESS_KEY: 'morphiqpos',
  STORAGE_SECRET_KEY: 'morphiqpos_local',
  SESSION_SECRET: 'M0rphiq-secreto-de-sesion-largo-y-aleatorio-01',
  PIN_PEPPER: 'M0rphiq-pimienta-de-pines-larga-y-aleatoria-02',
  APP_URL: 'http://localhost:3000',
  NODE_ENV: 'development',
};

describe('validacion del entorno', () => {
  it('acepta una configuracion completa', () => {
    const entorno = validarEntorno(VALIDO);
    expect(entorno.DATABASE_URL).toBe(VALIDO.DATABASE_URL);
    expect(entorno.NODE_ENV).toBe('development');
    expect(entorno.TZ).toBe('America/Mexico_City');
  });

  // Una por una: cada variable obligatoria debe hacer fallar el arranque.
  // Escrito como bucle a proposito — una lista a mano se olvida en la variable
  // numero doce, que es justo cuando duele.
  const OBLIGATORIAS = [
    'DATABASE_URL',
    'STORAGE_ENDPOINT',
    'STORAGE_BUCKET',
    'STORAGE_ACCESS_KEY',
    'STORAGE_SECRET_KEY',
    'SESSION_SECRET',
    'PIN_PEPPER',
    'APP_URL',
  ] as const;

  /** Copia el entorno valido quitando las variables indicadas. */
  const sin = (...quitar: readonly string[]): Record<string, string | undefined> =>
    Object.fromEntries(Object.entries(VALIDO).filter(([clave]) => !quitar.includes(clave)));

  it.each(OBLIGATORIAS)('sin %s, el proceso no arranca', (variable) => {
    expect(() => validarEntorno(sin(variable))).toThrow(ErrorDeEntorno);
  });

  it('el mensaje nombra la variable que falta y como arreglarlo', () => {
    try {
      validarEntorno(sin('PIN_PEPPER'));
      expect.unreachable('deberia haber lanzado');
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorDeEntorno);
      const mensaje = (error as ErrorDeEntorno).message;
      expect(mensaje).toContain('PIN_PEPPER');
      expect(mensaje).toContain('.env.example');
    }
  });

  it('rechaza los valores de ejemplo: copiar .env.example no basta', () => {
    expect(() =>
      validarEntorno({ ...VALIDO, SESSION_SECRET: 'cambia-esto-por-32-bytes-aleatorios' }),
    ).toThrow(ErrorDeEntorno);
  });

  it('rechaza un secreto demasiado corto para servir de algo', () => {
    expect(() => validarEntorno({ ...VALIDO, PIN_PEPPER: 'corto' })).toThrow(ErrorDeEntorno);
  });

  it('rechaza una base de datos que no es Postgres', () => {
    expect(() =>
      validarEntorno({ ...VALIDO, DATABASE_URL: 'mysql://localhost:3306/morphiqpos' }),
    ).toThrow(ErrorDeEntorno);
  });

  it('rechaza una URL sin esquema', () => {
    expect(() => validarEntorno({ ...VALIDO, APP_URL: 'localhost:3000' })).toThrow(ErrorDeEntorno);
  });

  it('rechaza un NODE_ENV inventado', () => {
    expect(() => validarEntorno({ ...VALIDO, NODE_ENV: 'produccion' })).toThrow(ErrorDeEntorno);
  });

  it('reporta TODOS los problemas de una vez, no el primero', () => {
    const roto = { ...sin('DATABASE_URL', 'APP_URL'), PIN_PEPPER: 'corto' };

    try {
      validarEntorno(roto);
      expect.unreachable('deberia haber lanzado');
    } catch (error) {
      // Arreglar de uno en uno, reiniciando cada vez, es como se pierde media
      // hora en algo que se resuelve leyendo una lista.
      expect((error as ErrorDeEntorno).problemas.length).toBeGreaterThanOrEqual(3);
    }
  });
});
