import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Pruebas de integracion contra Postgres REAL (F1.0-T10).
 *
 * Separadas de las unitarias a proposito: `pnpm test:unit` tiene que seguir
 * corriendo en menos de un segundo, sin base y sin Docker, o deja de correrse.
 * Estas tardan y necesitan una base; se corren aparte y en CI.
 *
 * `13-PRUEBAS §2` prohibe mockear la base aqui, y prohibe `sleep` para esperar:
 * las pruebas de concurrencia deben ejecutarse realmente en paralelo.
 */
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.integracion.test.ts', 'capabilities/*/**/*.integracion.test.ts'],
    exclude: ['**/node_modules/**', 'historico/**'],
    environment: 'node',
    globalSetup: ['./pruebas/postgres.setup.ts'],
    // Contra una base real, un segundo no alcanza. Pero 30 s tampoco es normal:
    // si una prueba se acerca, es que esta esperando algo que deberia observar.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Las pruebas de concurrencia comparten la misma base y se pisarian entre
    // archivos. Cada archivo corre solo; dentro, la concurrencia es explicita.
    fileParallelism: false,
  },
  resolve: {
    // `server-only` lanza al importarse fuera de un componente de servidor: es
    // su trabajo, y es lo que impide que packages/data acabe en el navegador.
    // Bajo esta condición resuelve a un módulo vacío, que es como lo ve Next en
    // el servidor. Sin ella, cualquier prueba que toque la capa de datos revienta
    // en el import — y la reacción sería quitar el guardián.
    conditions: ['react-server'],
    alias: {
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
    },
  },
  // Vite externaliza las dependencias CommonJS en modo SSR y resuelve sus
  // exports por SU propia lista de condiciones, no por la de `resolve`.
  ssr: {
    resolve: { conditions: ['react-server'] },
  },
});
