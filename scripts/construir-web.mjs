#!/usr/bin/env node
/**
 * `next build`, SIEMPRE en producción.
 *
 * ── Por qué existe este envoltorio de seis líneas ──────────────────────────
 * Porque `pnpm verify` entero fallaba en el build, y el fallo no decía nada de lo
 * que pasaba:
 *
 *     Error occurred prerendering page "/_global-error"
 *     TypeError: Cannot read properties of null (reading 'useContext')
 *
 * La causa es el `.env` LOCAL: trae `NODE_ENV=development` —que es lo correcto para
 * el servidor de desarrollo— y `pnpm verify` se corre con el `.env` cargado, porque
 * las comprobaciones de base y de certificado necesitan sus credenciales. `next
 * build` respeta el `NODE_ENV` que ya viene puesto, así que construía un bundle de
 * producción resolviendo React por la condición de desarrollo, y el prerender del
 * error global —el único que React renderiza fuera de todo proveedor— reventaba.
 *
 * Con el `.env` sin cargar el build pasa, y así pasa en el CI. Es decir: la puerta
 * más caras del repositorio se caía según de qué shell la corrieras, y el mensaje
 * mandaba a buscar un `useContext` que estaba bien.
 *
 * Un build de producción no puede depender de eso. Aquí se fija `NODE_ENV` y se deja
 * dicho por qué, que es más honesto que una línea en un documento pidiendo que nadie
 * se olvide de exportar la variable.
 */

import { spawnSync } from 'node:child_process';

const resultado = spawnSync('next', ['build'], {
  stdio: 'inherit',
  // `shell: true` porque en Windows `next` es un `.cmd` de `node_modules/.bin`, y
  // ese directorio ya está en el PATH cuando el guion lo lanza pnpm.
  shell: true,
  env: { ...process.env, NODE_ENV: 'production' },
});

process.exit(resultado.status ?? 1);
