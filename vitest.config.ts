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
 *
 * ── Dos proyectos, y por qué no uno ──────────────────────────────────────
 * `unidad` resuelve con la condición `react-server`, que es como Next ve la capa
 * de datos. Con esa condición `react` es la versión de servidor —sin hooks— y
 * `react-dom/server` es un módulo que LANZA al importarse, así que ahí no se puede
 * pintar un componente. `componentes` es el mismo `vitest run` sin esa condición:
 * pinta las piezas de `packages/ui` con `react-dom/server` y lee lo que sale. Sin
 * él, `<Dinero>` —que enseñó $42.00 por $42.90— no tenía ni una prueba.
 */
const ALIAS = {
  // El alias de apps/web, para que sus pruebas resuelvan igual que Next.
  '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
  '~': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unidad',
          include: [
            'packages/*/src/**/*.test.ts',
            'apps/*/src/**/*.test.ts',
            'capabilities/*/**/*.test.ts',
            // Los analizadores de las puertas: una puerta sin pruebas propias sólo se ha
            // visto fallar sobre el código real, y eso no dice si PUEDE aprobar.
            'scripts/**/*.test.ts',
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
            ...ALIAS,
            'server-only': fileURLToPath(
              new URL('./packages/app/node_modules/server-only/empty.js', import.meta.url),
            ),
          },
        },
        // Vite externaliza las dependencias CommonJS en modo SSR y resuelve sus
        // exports por SU propia lista de condiciones, no por la de `resolve`.
        ssr: {
          resolve: { conditions: ['react-server'] },
        },
      },
      {
        test: {
          name: 'componentes',
          include: ['packages/ui/src/**/*.test.tsx'],
          exclude: ['**/node_modules/**'],
          environment: 'node',
          testTimeout: 5_000,
        },
        resolve: { alias: ALIAS },
      },
    ],
  },
});
