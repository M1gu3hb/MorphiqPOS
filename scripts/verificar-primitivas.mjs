#!/usr/bin/env node
/**
 * La puerta del sistema de diseno (F1.0-T07, criterio de aceptacion).
 *
 * `05-SISTEMA-DE-DISENO §2`, regla dura:
 *
 *   "Ningun componente contiene un color, un tamano, un radio o una sombra
 *    literal. Todo sale de un token. Un `className="bg-blue-600"` en un
 *    componente hace fallar la revision."
 *
 * Esto la convierte en algo automatico. Se instala en F1.0 aunque hoy haya
 * pocas primitivas: existe para que nadie meta un literal al portar los ~90
 * componentes del restaurante en F1.2 y F1.4.
 *
 * Se ejecuta con: pnpm verify:primitivas
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));

/** Carpetas donde la regla aplica. Crece con el monorepo. */
const VIGILADAS = [
  join(RAIZ, 'packages', 'ui', 'src'),
  join(RAIZ, 'apps', 'web', 'app'),
  join(RAIZ, 'apps', 'web', 'src'),
];

/** Paleta de Tailwind. Ninguna de estas familias es un token del sistema. */
const FAMILIAS = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber',
  'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue',
  'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

/** Utilidades que aceptan color. */
const PREFIJOS = [
  'bg', 'text', 'border', 'ring', 'fill', 'stroke', 'from', 'via', 'to',
  'shadow', 'outline', 'decoration', 'accent', 'caret', 'divide', 'placeholder',
];

const REGLAS = [
  {
    nombre: 'color de la paleta de Tailwind',
    patron: new RegExp(
      `\\b(?:${PREFIJOS.join('|')})-(?:${FAMILIAS.join('|')})-(?:50|\\d{3})\\b`,
      'g',
    ),
    porque: 'Usa un token: bg-fondo, text-texto-sutil, border-borde…',
  },
  {
    nombre: 'color literal en hexadecimal',
    patron: /#[0-9a-fA-F]{3,8}\b/g,
    porque: 'Los colores viven en los archivos de estilo, no en los componentes',
  },
  {
    nombre: 'color literal en rgb() o hsl() directo',
    // Se permite `hsl(var(--token))`, que es como se compone un token.
    patron: /\b(?:rgba?|hsla?)\(\s*(?!var\()[^)]*\d/g,
    porque: 'Compon el token: hsl(var(--primario))',
  },
  {
    nombre: 'blanco o negro absolutos',
    patron: /\b(?:bg|text|border|ring|fill)-(?:white|black)\b/g,
    porque: 'Usa --fondo / --texto: en modo oscuro el blanco absoluto deslumbra',
  },
  {
    nombre: 'altura de control literal',
    patron: /\b(?:h|min-h|size)-(?:6|7|8|9|10|11|12|14|16)\b/g,
    porque:
      'Puentea la perilla de densidad: con h-9 fijo, cambiar a compacta no encoge ' +
      'nada. Usa h-[var(--altura-control)] o un calc sobre ella',
  },
  {
    nombre: 'sombra de la escala de Tailwind',
    patron: /\bshadow-(?:xs|sm|md|lg|xl|2xl)\b/g,
    porque: 'Puentea la perilla de elevacion. Usa shadow-1 … shadow-4',
  },
  {
    nombre: 'variante dark: en vez de oscuro:',
    // Sin espacio despues de los dos puntos: `dark: 'oscuro'` es una clave de
    // objeto —la configuracion de next-themes— y no una variante de Tailwind.
    patron: /(?:^|[\s"'`:[])dark:(?=[a-z[])/g,
    porque: 'La clase de modo oscuro del sistema es "oscuro"',
  },
];

/** Archivos que la regla no mira, con su razon. */
const EXENTOS = new Map([
  ['globals.css', 'Es donde se define el puente de tokens; ahi los colores SI viven'],
  ['icono.svg', 'Es el logotipo, no un componente'],
]);

const EXTENSIONES = new Set(['.tsx', '.ts', '.jsx', '.js']);

function recorrer(dir, encontrados) {
  if (!existsSync(dir)) return;

  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === 'node_modules' || entrada.name === '.next') continue;

    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      recorrer(ruta, encontrados);
      continue;
    }

    if (EXENTOS.has(entrada.name)) continue;

    const punto = entrada.name.lastIndexOf('.');
    if (punto === -1 || !EXTENSIONES.has(entrada.name.slice(punto))) continue;
    // Las pruebas y el contrato SI nombran colores: es su trabajo.
    if (entrada.name.includes('.test.') || ruta.includes(join('tokens', 'contrato'))) continue;

    const contenido = readFileSync(ruta, 'utf8');
    for (const regla of REGLAS) {
      const coincidencias = contenido.match(regla.patron);
      if (!coincidencias) continue;
      encontrados.push({
        archivo: relative(RAIZ, ruta),
        regla: regla.nombre,
        porque: regla.porque,
        ejemplos: [...new Set(coincidencias)].slice(0, 4),
      });
    }
  }
}

const hallazgos = [];
for (const carpeta of VIGILADAS) recorrer(carpeta, hallazgos);

if (hallazgos.length > 0) {
  console.error('\n✗ Hay valores literales donde deberia haber tokens:\n');
  for (const hallazgo of hallazgos) {
    console.error(`  ${hallazgo.archivo}`);
    console.error(`    ${hallazgo.regla}: ${hallazgo.ejemplos.join(', ')}`);
    console.error(`    ${hallazgo.porque}\n`);
  }
  console.error(`${hallazgos.length} hallazgo(s).`);
  process.exit(1);
}

console.log('✓ Cero literales de color, altura, sombra o variante en componentes.');
