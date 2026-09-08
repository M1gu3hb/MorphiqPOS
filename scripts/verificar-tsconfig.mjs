#!/usr/bin/env node
/**
 * Verifica el contrato de TypeScript (F1.0-T03).
 *
 * R19 — lint y tipos en cero errores desde el primer commit.
 * "El POS de restaurante llegó a 1,592 diagnósticos de tipos por no aplicar esto."
 *
 * Comprueba que la severidad no se pueda relajar sin que esta prueba lo diga:
 * cada bandera obligatoria se verifica con su valor exacto, y cada bandera
 * prohibida se verifica por ausencia o por valor seguro.
 *
 * Se ejecuta con: pnpm verify:tsconfig
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const BASE = 'tsconfig.base.json';

/** Banderas que deben estar activas. Las 4 primeras las exige F1.0-T03 literalmente. */
const OBLIGATORIAS = {
  strict: true,
  noUncheckedIndexedAccess: true,
  noImplicitOverride: true,
  exactOptionalPropertyTypes: true,
  // Refuerzos coherentes con las reglas del proyecto:
  noFallthroughCasesInSwitch: true, // R14 · máquinas de estado explícitas
  noImplicitReturns: true,
  noPropertyAccessFromIndexSignature: true,
  useUnknownInCatchVariables: true, // R12 · el error se maneja, no se asume
  verbatimModuleSyntax: true,
  isolatedModules: true,
  skipLibCheck: true,
  forceConsistentCasingInFileNames: true, // Windows es case-insensitive: sin esto,
  // un import con mayúscula distinta pasa
  // aquí y rompe en CI (Linux)
};

/** Banderas prohibidas: si aparecen con estos valores, se relajó la puerta. */
const PROHIBIDAS = {
  allowJs: true,
  noImplicitAny: false,
  strictNullChecks: false,
  suppressImplicitAnyIndexErrors: true,
  ignoreDeprecations: '5.0',
};

const fallos = [];

/** Lee JSONC quitando comentarios de línea y comas colgantes. */
function leerJsonc(ruta) {
  const texto = readFileSync(ruta, 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(texto);
}

if (!existsSync(join(RAIZ, BASE))) {
  console.error(`✗ Falta ${BASE}`);
  process.exit(1);
}

const base = leerJsonc(join(RAIZ, BASE));
const opciones = base.compilerOptions ?? {};

for (const [bandera, esperado] of Object.entries(OBLIGATORIAS)) {
  if (opciones[bandera] !== esperado) {
    fallos.push(
      `${BASE}: "${bandera}" debe ser ${esperado}, es ${JSON.stringify(opciones[bandera])}`,
    );
  }
}

for (const [bandera, prohibido] of Object.entries(PROHIBIDAS)) {
  if (bandera in opciones && opciones[bandera] === prohibido) {
    fallos.push(
      `${BASE}: "${bandera}": ${JSON.stringify(prohibido)} relaja la puerta de tipos (R19)`,
    );
  }
}

// historico/ fuera del type-check
const excluidos = base.exclude ?? [];
if (!excluidos.some((patron) => String(patron).includes('historico'))) {
  fallos.push(`${BASE}: "exclude" debe contener historico/ (04-ARQUITECTURA §1)`);
}

// Invariante permanente: TODO workspace (carpeta con package.json) debe tener su
// tsconfig.json extendiendo el base, y ninguno puede relajar una bandera.
// Hoy no hay workspaces todavia; desde F1.0-T06 esta comprobacion muerde sola.
const CONTENEDORES = ['packages', 'apps', 'capabilities'];
let configsHijas = 0;

for (const contenedor of CONTENEDORES) {
  const rutaContenedor = join(RAIZ, contenedor);
  if (!existsSync(rutaContenedor)) continue;

  for (const entrada of readdirSync(rutaContenedor, { withFileTypes: true })) {
    if (!entrada.isDirectory()) continue;
    const dir = join(rutaContenedor, entrada.name);
    const rel = `${contenedor}/${entrada.name}`;

    // Solo exigimos tsconfig a los workspaces reales, no a las carpetas vacias.
    if (!existsSync(join(dir, 'package.json'))) continue;

    const rutaHija = join(dir, 'tsconfig.json');
    if (!existsSync(rutaHija)) {
      fallos.push(`${rel}: es un workspace y no tiene tsconfig.json`);
      continue;
    }

    configsHijas += 1;
    const hija = leerJsonc(rutaHija);

    if (!String(hija.extends ?? '').includes('tsconfig.base.json')) {
      fallos.push(`${rel}/tsconfig.json: debe extender tsconfig.base.json`);
    }

    const propias = hija.compilerOptions ?? {};
    for (const [bandera, esperado] of Object.entries(OBLIGATORIAS)) {
      if (bandera in propias && propias[bandera] !== esperado) {
        fallos.push(
          `${rel}/tsconfig.json: relaja "${bandera}" a ${JSON.stringify(propias[bandera])}`,
        );
      }
    }
    for (const bandera of Object.keys(PROHIBIDAS)) {
      if (bandera in propias && propias[bandera] === PROHIBIDAS[bandera]) {
        fallos.push(`${rel}/tsconfig.json: reintroduce "${bandera}"`);
      }
    }
  }
}

if (fallos.length > 0) {
  console.error('✗ El contrato de TypeScript no se cumple:\n');
  for (const fallo of fallos) console.error(`  · ${fallo}`);
  console.error(`\n${fallos.length} fallo(s).`);
  process.exit(1);
}

console.log(
  `✓ TypeScript estricto: ${Object.keys(OBLIGATORIAS).length} banderas obligatorias, ` +
    `${Object.keys(PROHIBIDAS).length} prohibidas, ${configsHijas} workspace(s) conformes.`,
);
