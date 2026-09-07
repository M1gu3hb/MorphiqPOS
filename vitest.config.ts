import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Configuracion raiz de las pruebas.
 *
 * Las pruebas unitarias no tocan nada: sin base de datos, sin red, sin reloj
 * falso salvo que la prueba lo pida. Es lo que las hace correr en milisegundos
 * y lo que permite tener muchas (13-PRUEBAS §2).
 *
 * El andamiaje de integracion contra Postgres real y el ayudante de inyeccion
 * de fallos llegan en F1.0-T10.
 */
export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'capabilities/*/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', 'historico/**'],
    environment: 'node',
    // Una prueba que tarda mas de 5 s en una capa sin I/O esta mal escrita.
    testTimeout: 5_000,
  },
  resolve: {
    alias: {
      // El alias de apps/web, para que sus pruebas resuelvan igual que Next.
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
    },
  },
});
