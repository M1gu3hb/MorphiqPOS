#!/usr/bin/env node
/**
 * LA UNIDAD DE CADA CAMPO DE DINERO DEL PUENTE, sacada del mapa (bloque C.2 de la 2.4).
 *
 * El puente ya DECLARA la unidad de cada campo: `conversion: 'dinero'` lo entrega en PESOS
 * (`haciaEl` divide entre 100) y `'entero'` en centavos. Pero más de 30 campos se LLAMAN
 * `_centavos` y entregan pesos, y cada pantalla decidía por el nombre. Así una cita de
 * $350.00 se pintaba $3.50 (`CitaEnCurso`, C.1).
 *
 * `mapa.ts` es `server-only`: el navegador no lo puede importar, y no debe —lleva las
 * columnas y los roles de lectura—. Este guion saca de él SÓLO lo que el navegador necesita
 * para convertir: por entidad, qué campos son dinero y en qué unidad llegan. Lo escribe en
 * `apps/web/src/cliente/unidades-del-puente.ts`, que lee `centavosDe`.
 *
 * Es dinero todo campo con `conversion: 'dinero'`, más los `'entero'` cuyo nombre dice
 * `centavos` (ésos ya llegan en centavos). Campos, derivados y calculados.
 *
 *   node --conditions=react-server scripts/generar-unidades-del-puente.mjs
 *   node --conditions=react-server scripts/generar-unidades-del-puente.mjs --verificar
 */
import { readFileSync, writeFileSync } from 'node:fs';

const DESTINO = 'apps/web/src/cliente/unidades-del-puente.ts';
const { MAPA } = await import('../packages/app/src/puente/mapa.ts');

function unidadDe(nombre, conversion) {
  if (conversion === 'dinero') return 'pesos';
  if (conversion === 'entero' && /centavos/.test(nombre)) return 'centavos';
  return null;
}

const tabla = {};
for (const entidad of Object.keys(MAPA).sort()) {
  const definicion = MAPA[entidad];
  const campos = {};
  for (const grupo of ['campos', 'derivados', 'calculados']) {
    for (const [nombre, campo] of Object.entries(definicion[grupo] ?? {})) {
      const unidad = unidadDe(nombre, campo.conversion);
      if (unidad !== null) campos[nombre] = unidad;
    }
  }
  if (Object.keys(campos).length > 0) {
    tabla[entidad] = Object.fromEntries(
      Object.entries(campos).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
}

const cuerpo = `/**
 * GENERADO por \`scripts/generar-unidades-del-puente.mjs\` desde \`packages/app/src/puente/mapa.ts\`.
 * No se edita a mano: \`pnpm verify:unidades\` se pone en rojo si se desfasa del mapa.
 *
 * Por entidad del puente, sus campos de DINERO y la unidad en que llegan al navegador:
 * \`'pesos'\` (\`conversion: 'dinero'\`, aunque el nombre diga \`_centavos\`) o \`'centavos'\`.
 * Lo lee \`centavosDe\` (\`dinero-del-puente.ts\`); una pantalla no decide por el nombre.
 */
export const UNIDADES_DEL_PUENTE = ${JSON.stringify(tabla, null, 2)} as const;

export type EntidadConDinero = keyof typeof UNIDADES_DEL_PUENTE;
export type CampoDeDinero<E extends EntidadConDinero> = keyof (typeof UNIDADES_DEL_PUENTE)[E] &
  string;
`;

const prettier = await import('prettier');
const opciones = (await prettier.resolveConfig(DESTINO)) ?? {};
const formateado = await prettier.format(cuerpo, { ...opciones, filepath: DESTINO });

if (process.argv.includes('--verificar')) {
  let actual = '';
  try {
    actual = readFileSync(DESTINO, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    // no existe: desfasado
  }
  if (actual !== formateado) {
    console.error(
      `✗ ${DESTINO} está desfasado del mapa del puente.\n  Corre \`node --conditions=react-server scripts/generar-unidades-del-puente.mjs\`.`,
    );
    process.exit(1);
  }
  const total = Object.values(tabla).reduce((n, c) => n + Object.keys(c).length, 0);
  console.log(`✓ La tabla de unidades coincide con el mapa: ${String(total)} campos de dinero.`);
} else {
  writeFileSync(DESTINO, formateado);
  const total = Object.values(tabla).reduce((n, c) => n + Object.keys(c).length, 0);
  console.log(
    `✓ ${DESTINO}: ${String(Object.keys(tabla).length)} entidades, ${String(total)} campos de dinero.`,
  );
}
