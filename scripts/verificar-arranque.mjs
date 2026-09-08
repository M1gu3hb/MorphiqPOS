#!/usr/bin/env node
/**
 * Contratos de las correcciones de arranque (F1.1-T00).
 *
 * Cada uno de estos existe porque la auditoria de F1.0
 * (`docs/fase-1/15-AUDITORIA-F1.0-Y-REPLANTEAMIENTO.md`) encontro que la cosa
 * estaba mal. No son comprobaciones decorativas: son la prueba de que la
 * correccion sigue puesta.
 *
 * Regla que gobierna estos contratos: **se atan al USO, no al identificador.**
 * Buscar un nombre suelto sobre todo el archivo no prueba nada, porque el nombre
 * aparece en la definicion, en el comentario y en la llamada — borrar el que
 * importa deja vivos los demas y el contrato pasa igual.
 *
 * Se ejecuta con: pnpm verify:arranque
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));

const fallos = [];

/** Devuelve el archivo sin comentarios, para que un contrato no se encuentre a si mismo. */
function sinComentarios(texto) {
  return texto
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((linea) => linea.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

/** Recorta el cuerpo de una funcion contando llaves, no buscando el primer cierre. */
function cuerpoDeFuncion(codigo, firma) {
  const inicio = codigo.indexOf(firma);
  if (inicio === -1) return null;

  const abre = codigo.indexOf('{', inicio);
  if (abre === -1) return null;

  let profundidad = 0;
  for (let i = abre; i < codigo.length; i += 1) {
    if (codigo[i] === '{') profundidad += 1;
    else if (codigo[i] === '}') {
      profundidad -= 1;
      if (profundidad === 0) return codigo.slice(abre + 1, i);
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · La guarda de db:migrate tiene que disparar de verdad
//
// Estaba rota: comprobaba que existiera `packages/data/package.json`, y ese
// archivo ya existe desde F1.0 (con 17 lineas y ninguna migracion). La guarda
// no disparaba, y `pnpm db:migrate` moria con un error criptico de pnpm en vez
// del mensaje que explicaba que faltaba.
//
// El contrato se ata a la CONDICION, no al nombre de la funcion: la guarda debe
// comprobar que packages/data declare el script que se le va a delegar.
// ─────────────────────────────────────────────────────────────────────────────
{
  const ruta = join(RAIZ, 'scripts', 'db.mjs');
  const codigo = sinComentarios(readFileSync(ruta, 'utf8'));
  const cuerpo = cuerpoDeFuncion(codigo, 'function delegarEnData');

  if (cuerpo === null) {
    fallos.push('scripts/db.mjs: no se encontro la funcion delegarEnData');
  } else {
    // Lo que importa: que lea el package.json de packages/data y compruebe el
    // SCRIPT, no la mera existencia del archivo.
    const leePackageJson = /readFileSync\(/.test(cuerpo) && /package\.json/.test(cuerpo);
    const compruebaElScript = /scripts\b/.test(cuerpo) && /tarea\b/.test(cuerpo);
    const abortaConCodigo = /process\.exit\(\s*3\s*\)/.test(cuerpo);

    if (!leePackageJson) {
      fallos.push(
        'scripts/db.mjs · delegarEnData: no lee el package.json de packages/data. ' +
          'Comprobar solo que el archivo exista es lo que dejo la guarda muerta.',
      );
    }
    if (!compruebaElScript) {
      fallos.push(
        'scripts/db.mjs · delegarEnData: no comprueba que el script delegado exista. ' +
          'Sin eso, delega a un script inexistente y pnpm falla con un error criptico.',
      );
    }
    if (!abortaConCodigo) {
      fallos.push('scripts/db.mjs · delegarEnData: no aborta con codigo 3');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Kysely y pg instalados donde toca
//
// El ADR 0001 eligio Kysely sobre pg y quedo sin implementar durante todo F1.0:
// una decision escrita que el codigo no cumplia.
// ─────────────────────────────────────────────────────────────────────────────
{
  const ruta = join(RAIZ, 'packages', 'data', 'package.json');
  if (!existsSync(ruta)) {
    fallos.push('packages/data/package.json no existe');
  } else {
    const pkg = JSON.parse(readFileSync(ruta, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const necesaria of ['kysely', 'pg']) {
      if (!(necesaria in deps)) {
        fallos.push(
          `packages/data no declara "${necesaria}". El ADR 0001 lo eligio; ` +
            'una decision que el codigo no cumple no es una decision.',
        );
      }
    }

    if (!('server-only' in deps)) {
      fallos.push('packages/data no declara "server-only": nada impide importarlo del navegador');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · El compose alineado a Postgres 17
//
// Supabase corre 17.6 (A-44). Si el compose se queda en 16, la prueba de
// portabilidad valida contra un motor distinto al de produccion y deja de
// probar lo que dice probar.
// ─────────────────────────────────────────────────────────────────────────────
{
  const ruta = join(RAIZ, 'infra', 'docker', 'docker-compose.yml');
  const texto = readFileSync(ruta, 'utf8');
  const imagen = /image:\s*(postgres:[^\s]+)/.exec(texto)?.[1];

  if (imagen === undefined) {
    fallos.push('infra/docker/docker-compose.yml: no se encontro la imagen de Postgres');
  } else if (!/^postgres:17\./.test(imagen)) {
    fallos.push(
      `infra/docker/docker-compose.yml usa "${imagen}". Supabase corre Postgres 17 (A-44): ` +
        'probar la portabilidad contra otro motor no prueba la portabilidad.',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Cero carpetas vacias versionadas
//
// Una carpeta con solo un .gitkeep es andamiaje: aparenta estructura donde no
// hay nada. Vuelven cuando el corte que las llena las necesite.
// ─────────────────────────────────────────────────────────────────────────────
{
  const PROHIBIDAS = [
    ['apps/worker', 'F1.3 · jobs y reconciliadores'],
    ['capabilities', 'F1.5 · registry completo'],
    [
      'packages/app',
      'se difiere: los comandos viven en apps/web hasta que haya un segundo consumidor',
    ],
    ['packages/registry', 'F1.5 · registry con grafo'],
    ['infra/ci', 'el workflow vive en .github/workflows'],
  ];

  for (const [carpeta, cuando] of PROHIBIDAS) {
    if (existsSync(join(RAIZ, carpeta, '.gitkeep'))) {
      fallos.push(`${carpeta}/ sigue siendo una carpeta vacia versionada (${cuando})`);
    }
  }
}

if (fallos.length > 0) {
  console.error('\n✗ Correcciones de arranque incompletas:\n');
  for (const fallo of fallos) console.error(`  · ${fallo}`);
  console.error(`\n${fallos.length} fallo(s).`);
  process.exit(1);
}

console.log(
  '✓ Correcciones de arranque: guarda viva, Kysely instalado, Postgres 17, cero andamiaje.',
);
