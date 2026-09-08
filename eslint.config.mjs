import js from '@eslint/js';
import next from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Configuracion de lint del monorepo (F1.0-T09).
 *
 * Se eligio **ESLint con typescript-eslint** y no Biome, aunque Biome es mucho
 * mas rapido, por una razon concreta: este proyecto necesita reglas **con
 * informacion de tipos**, y Biome todavia no las tiene.
 *
 * La que decide es `no-floating-promises`. En un sistema donde el cobro, la
 * comanda y el stock son transacciones (R10), un `await` olvidado no falla:
 * sigue adelante y deja la transaccion a medias sin que nadie se entere. Es
 * exactamente el defecto P0-03 de las dos fuentes. Una regla que lo detecta al
 * escribirlo vale mas que unos segundos de lint.
 *
 * Aqui vive tambien `lint:capas`: las cinco prohibiciones de
 * `04-ARQUITECTURA §2`, que hacen fallar el build.
 */

/** Rutas que nunca se lintean. */
const IGNORADO = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/coverage/**',
  '**/.turbo/**',
  // historico/ es evidencia, no codigo (R30). No se compila ni se lintea.
  'historico/**',
];

/**
 * Las cinco prohibiciones de dependencia entre capas.
 *
 * "359 llamadas a datos desde componentes es lo que hizo imposible cambiar de
 * plataforma. La regla de dependencia es lo que impide que vuelva a pasar."
 */
const PROHIBICIONES = [
  {
    // 1 · La interfaz nunca toca la base ni los repositorios.
    archivos: ['apps/web/**/*.{ts,tsx}'],
    patrones: [
      {
        group: ['@morphiqpos/data', '@morphiqpos/data/*'],
        message:
          'apps/web no importa packages/data. El navegador habla con /api, y la API con ' +
          'los repositorios (04-ARQUITECTURA §4). Este import es como la tiendita acabo ' +
          'con 19 de 22 repositorios corriendo en el navegador.',
      },
    ],
  },
  {
    // 2 · El dominio no hace I/O.
    archivos: ['packages/domain/**/*.ts'],
    patrones: [
      {
        group: [
          'node:*',
          'fs',
          'path',
          'http',
          'https',
          'crypto',
          'child_process',
          'react',
          'react-dom',
          'next',
          'next/*',
          'pg',
          'kysely',
          '@morphiqpos/data',
          '@morphiqpos/data/*',
          '@morphiqpos/app',
          '@morphiqpos/app/*',
          '@morphiqpos/ui',
          '@morphiqpos/ui/*',
        ],
        message:
          'packages/domain son reglas puras: entra un objeto, sale un objeto. Cero I/O, ' +
          'cero React, cero SQL (04-ARQUITECTURA §2, prohibicion 2).',
      },
    ],
  },
  {
    // 3 · El sistema de diseno recibe datos por props.
    archivos: ['packages/ui/**/*.{ts,tsx}'],
    patrones: [
      {
        group: [
          '@morphiqpos/domain',
          '@morphiqpos/domain/*',
          '@morphiqpos/data',
          '@morphiqpos/data/*',
          '@morphiqpos/app',
          '@morphiqpos/app/*',
        ],
        message:
          'packages/ui no importa domain, data ni app: recibe datos por props ' +
          '(04-ARQUITECTURA §2, prohibicion 3).',
      },
    ],
  },
  {
    // 4 · Una capacidad no importa otra capacidad (R25).
    archivos: ['capabilities/**/*.{ts,tsx}'],
    patrones: [
      {
        group: ['@morphiqpos/capabilities-*'],
        message:
          'Una capacidad no importa otra capacidad. Colaboran por contratos y eventos ' +
          '(R25). Un import directo aqui es como se pierde la modularidad.',
      },
    ],
  },
];

/**
 * 5 · Nada importa de `historico/`. Aplica a TODO archivo.
 *
 * Va aparte de las otras cuatro por una razon que costo encontrar: en la
 * configuracion plana de ESLint, dos bloques que tocan el mismo archivo y la
 * misma regla **no se suman: gana el ultimo**. Declararla como una quinta
 * entrada que aplicaba a todos los archivos desactivaba en silencio las cuatro
 * anteriores. Lo detecto la meta-prueba de F1.0-T09 — que es exactamente para
 * lo que sirve crear el fallo a proposito.
 *
 * Por eso se anade a los patrones de cada grupo, en vez de declararse suelta.
 */
const PROHIBICION_HISTORICO = {
  group: ['**/historico/**', '../historico/*', '../../historico/*', '../../../historico/*'],
  message: 'historico/ es evidencia, no plantilla (R30). Se lee al lado; no se importa.',
};

export default tseslint.config(
  { ignores: IGNORADO },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // --- R19: cero `any`, cero `@ts-ignore` -----------------------------
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true },
      ],

      // --- R10 y R12: la razon por la que se eligio ESLint ------------------
      // Un `await` olvidado en un comando transaccional no falla: sigue y deja
      // la transaccion a medias. Es el defecto P0-03 de las dos fuentes.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',

      // --- R12: ningun error critico se silencia ---------------------------
      'no-empty': ['error', { allowEmptyCatch: false }],
      '@typescript-eslint/only-throw-error': 'error',

      // --- 04-ARQUITECTURA §7: nada de console.log en produccion -----------
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // --- R15: el dinero nunca pasa por punto flotante ---------------------
      // parseFloat y Number() sobre un importe es como entra el error de
      // redondeo. Para dinero se usa desdeTexto de packages/domain.
      'no-restricted-globals': [
        'error',
        {
          name: 'parseFloat',
          message:
            'Para importes usa desdeTexto de @morphiqpos/domain/dinero: parseFloat ' +
            'reintroduce el punto flotante y con el los errores de redondeo (R15).',
        },
      ],

      // En espanol se interpola un numero en casi cada mensaje. Exigir
      // String(n) en todos ensucia mas de lo que protege.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: false, allowNullish: false },
      ],

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // --- Las cinco prohibiciones de capas ----------------------------------
  // La quinta se anade a cada grupo, no como bloque suelto: ver el comentario
  // de PROHIBICION_HISTORICO.
  {
    files: ['**/*.{ts,tsx,mjs}'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [PROHIBICION_HISTORICO] }],
    },
  },
  ...PROHIBICIONES.map((prohibicion) => ({
    files: prohibicion.archivos,
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [...prohibicion.patrones, PROHIBICION_HISTORICO] },
      ],
    },
  })),

  // --- React y Next, solo donde aplican ----------------------------------
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks, '@next/next': next },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,
    },
  },

  // --- Las primitivas son codigo adoptado de shadcn -----------------------
  {
    files: ['packages/ui/src/primitivas/**/*.tsx'],
    rules: {
      // Se adoptan con su forma original y se tokenizan con un codemod
      // (scripts/tokenizar-primitivas.mjs). Reescribirlas a mano rompe la
      // posibilidad de volver a generarlas.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      // shadcn usa || donde nosotros usariamos ??. Reescribirlo a mano rompe
      // la posibilidad de volver a generar la primitiva con la CLI.
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },

  // --- Scripts y configuracion: corren en Node ----------------------------
  // Sin reglas con informacion de tipos: estos archivos estan fuera de los
  // tsconfig de los paquetes a proposito (no forman parte del producto), y
  // meterlos solo para lintearlos ensuciaria el type-check de verdad.
  {
    files: ['scripts/**/*.mjs', '**/bin/*.mjs', '**/*.config.{mjs,js}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-console': 'off',
    },
  },

  // --- Pruebas -------------------------------------------------------------
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      // Una prueba SI puede afirmar cosas sobre valores no nulos.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },

  // Prettier al final: apaga todo lo que sea de formato.
  prettier,
);
