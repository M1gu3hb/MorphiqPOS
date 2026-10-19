#!/usr/bin/env node
/**
 * verify:pendientes · LO QUE SE DEJÓ A MEDIAS, contado (C.10 de la etapa 2.4).
 *
 * Treinta y nueve pantallas llevaban en su cabecera «Alcance recortado, dicho y no
 * escondido»: una lista honesta de lo que les faltaba. Honesta y SIN DUEÑO, porque ninguna
 * puerta la contaba. Una fase se daba por cerrada con esas listas intactas.
 *
 * Esta puerta falla con cualquiera de cuatro señales de trabajo pendiente en el código que
 * se entrega:
 *   1 · «Alcance recortado» en `apps/web` o en `packages`. Lo recortado se construye, o —si
 *       depende de algo que no es de este equipo (§10)— va a EXCEPCIONES-COBERTURA.md con su
 *       motivo, y la cabecera dice lo que HAY.
 *   2 · `Promise.resolve([])` en código de producción: una consulta sustituida por una lista
 *       vacía es una pantalla que siempre dice «no hay nada». Las pruebas y sus dobles
 *       (`*.test.*`, carpetas `pruebas/`) no cuentan, ni los comentarios.
 *   3 · Un importe fijado en cero con una marca de provisional al lado —«por ahora», «todavía
 *       no», «cuando llegue»—: un cero que miente en un corte o en un tablero.
 *   4 · Una fila de EXCEPCIONES-COBERTURA.md sin motivo: la excepción es la forma honesta de
 *       no hacer algo, y sin motivo es sólo un permiso.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const CARPETAS = [
  join(RAIZ, 'apps', 'web', 'src'),
  join(RAIZ, 'apps', 'web', 'app'),
  join(RAIZ, 'packages'),
];
const EXCEPCIONES = join(RAIZ, 'docs', 'fase-2', 'EXCEPCIONES-COBERTURA.md');

const RECORTADO = /Alcance recortado/i;
const LISTA_VACIA = /Promise\.resolve\(\s*\[\s*\]\s*\)/;
const CERO_DE_IMPORTE =
  /\b[A-Za-z]*(?:[Cc]entavos|[Ii]mporte|[Tt]otal|[Mm]onto)[A-Za-z]*\s*[:=]\s*0n?\b/;
const PROVISIONAL =
  /por ahora|todav[ií]a no|a[uú]n no|cuando llegue|el d[ií]a que|provisional|pendiente de/i;
const MOTIVO_MINIMO = 30;

function archivos(carpeta) {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      if (['node_modules', '.next', 'dist', 'pruebas', 'heredado'].includes(entrada.name))
        return [];
      return archivos(ruta);
    }
    if (!/\.(tsx?|mjs|jsx?)$/.test(entrada.name)) return [];
    // Las pruebas y sus dobles: `*.test.*`, `*.contrato.*` y los `pruebas.ts` que sirven un
    // catálogo falso a las pruebas de su carpeta.
    if (/\.test\.|\.contrato\.|^pruebas\.tsx?$/.test(entrada.name)) return [];
    return [ruta];
  });
}

/** El código sin comentarios de bloque ni de línea: una regla no se cumple en prosa. */
function sinComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const hallazgos = [];

for (const carpeta of CARPETAS) {
  for (const ruta of archivos(carpeta)) {
    const texto = readFileSync(ruta, 'utf8');
    const codigo = sinComentarios(texto);
    const lineas = texto.split('\n');
    const lineasDeCodigo = codigo.split('\n');
    const donde = relative(RAIZ, ruta).split('\\').join('/');
    lineas.forEach((linea, i) => {
      if (RECORTADO.test(linea)) {
        hallazgos.push(
          `${donde}:${String(i + 1)} · «Alcance recortado»: constrúyelo, o llévalo a EXCEPCIONES con su motivo`,
        );
      }
    });
    lineasDeCodigo.forEach((linea, i) => {
      if (LISTA_VACIA.test(linea)) {
        hallazgos.push(`${donde}:${String(i + 1)} · Promise.resolve([]) donde va una consulta`);
      }
      if (CERO_DE_IMPORTE.test(linea)) {
        const alrededor = lineas.slice(Math.max(0, i - 2), i + 1).join('\n');
        if (PROVISIONAL.test(alrededor)) {
          hallazgos.push(
            `${donde}:${String(i + 1)} · importe fijado en cero con marca de provisional`,
          );
        }
      }
    });
  }
}

// 4 · Las filas de EXCEPCIONES, cada una con su motivo. Desde «## FUNCIONES»: lo de arriba
// es la leyenda del archivo, no excepciones.
const excepciones = readFileSync(EXCEPCIONES, 'utf8');
const desde = excepciones.indexOf('\n## FUNCIONES');
excepciones
  .slice(desde === -1 ? 0 : desde)
  .split('\n')
  .forEach((linea) => {
    if (!linea.startsWith('|') || /^\|\s*-/.test(linea) || /^\|\s*Clave\s*\|/.test(linea)) return;
    const celdas = linea
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c !== '');
    const motivo = celdas.at(-1) ?? '';
    if (
      celdas.length < 2 ||
      motivo.length < MOTIVO_MINIMO ||
      /^(pendiente|por definir|tbd|—|-)$/i.test(motivo)
    ) {
      hallazgos.push(
        `docs/fase-2/EXCEPCIONES-COBERTURA.md · excepción sin motivo: ${linea.slice(0, 100)}`,
      );
    }
  });

if (hallazgos.length > 0) {
  process.stdout.write(
    `✗ Quedan ${String(hallazgos.length)} pendiente(s) sin dueño:\n  ${hallazgos.join('\n  ')}\n`,
  );
  process.exit(1);
}
process.stdout.write(
  '✓ Pendientes: cero «Alcance recortado», cero listas vacías en lugar de consultas, cero importes provisionales en cero, y toda excepción con su motivo.\n',
);
