#!/usr/bin/env node
/**
 * LA MATRIZ DE PERMISOS, generada del registro de comandos (D.3 de la 2.4).
 *
 *   node --conditions=react-server scripts/generar-matriz-de-permisos.mjs             # la escribe
 *   node --conditions=react-server scripts/generar-matriz-de-permisos.mjs --verificar # ¿está al día?
 *
 * ── Por qué generada y no escrita a mano ─────────────────────────────────────
 * Una matriz a mano es una segunda lista de roles que se queda atrás el día que alguien
 * cambia un comando: la prueba seguiría verde comprobando permisos que ya no son los del
 * código. Aquí la matriz SALE del código: cada `route.ts` que sirve UN comando por la
 * tubería estándar —`manejadorDeComando(x)` o `manejadorDeComandoConParametro(x, …)`—
 * nombra su comando, y el comando declara sus `roles` y `paquetes` (`definirComando`).
 * `pruebas/e2e/matriz-de-permisos.spec.ts` la recorre contra el servidor: con cada rol de
 * cada demo, un cuerpo vacío tiene que dar 403 `SIN_PERMISO` donde el rol no está, y NUNCA
 * `SIN_PERMISO` donde sí está (le contesta zod: el cuerpo vacío no escribe nada).
 *
 * Las rutas que NO pasan por esa tubería —públicas, de sesión, las que validan su cuerpo
 * antes del comando o encadenan varios— quedan fuera con su razón en `excluidas`: un 400
 * de su propio parseo llegaría antes que el permiso y la prueba no diría nada de él.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import * as prettier from 'prettier';

import { rutasDeComando } from './lib/rutas-de-comando.mjs';

const SALIDA = join('pruebas', 'e2e', 'matriz-de-permisos.json');

async function generar() {
  const { incluidas, excluidas } = await rutasDeComando();
  return {
    incluidas: incluidas.map(({ ruta, comando }) => ({
      ruta,
      comando: comando.nombre,
      escribe: comando.escribe === true,
      roles: [...comando.roles].sort(),
      paquetes: [...comando.paquetes].sort(),
    })),
    excluidas,
  };
}

const matriz = await generar();
// Con el formato del repositorio: `format:check` revisa también este archivo, y un JSON
// con otro formato que el de Prettier haría pelear a las dos puertas.
const texto = await prettier.format(JSON.stringify(matriz), {
  ...((await prettier.resolveConfig(SALIDA)) ?? {}),
  filepath: SALIDA,
});

if (process.argv.includes('--verificar')) {
  let actual = '';
  try {
    actual = readFileSync(SALIDA, 'utf8');
  } catch {
    // Sin archivo: no está al día.
  }
  if (actual !== texto) {
    console.error(
      `✗ ${SALIDA} no está al día con los comandos. Regénéralo:\n` +
        '  node --conditions=react-server scripts/generar-matriz-de-permisos.mjs',
    );
    process.exit(1);
  }
  console.log(
    `✓ La matriz de permisos está al día: ${String(matriz.incluidas.length)} rutas de comando, ` +
      `${String(matriz.excluidas.length)} fuera con su razón.`,
  );
} else {
  writeFileSync(SALIDA, texto);
  console.log(
    `✓ ${SALIDA}: ${String(matriz.incluidas.length)} rutas de comando, ` +
      `${String(matriz.excluidas.length)} fuera con su razón.`,
  );
}
process.exit(0);
