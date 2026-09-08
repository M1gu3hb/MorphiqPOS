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
    exclude: [
      '**/node_modules/**',
      'historico/**',
      // Las de integracion viven aparte y necesitan Postgres: si se colaran
      // aqui, `pnpm test:unit` fallaria sin base y la reaccion seria
      // saltarselas. Corren con `pnpm test:integracion`.
      '**/*.integracion.test.ts',
    ],
    environment: 'node',
    // Una prueba que tarda mas de 5 s en una capa sin I/O esta mal escrita.
    testTimeout: 5_000,
  },
  resolve: {
    // `server-only` lanza al importarse fuera de un componente de servidor: es
    // su trabajo, y es lo que impide que packages/data acabe en el navegador.
    // Bajo esta condición resuelve a un módulo vacío, que es como lo ve Next en
    // el servidor. Sin ella, cualquier prueba que toque la capa de datos revienta
    // en el import — y la reacción sería quitar el guardián.
    conditions: ['react-server'],
    alias: {
      // El alias de apps/web, para que sus pruebas resuelvan igual que Next.
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
    },
  },
  // Vite externaliza las dependencias CommonJS en modo SSR y resuelve sus
  // exports por SU propia lista de condiciones, no por la de `resolve`.
  ssr: {
    resolve: { conditions: ['react-server'] },
  },
});
