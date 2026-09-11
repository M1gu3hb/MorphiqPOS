/**
 * El motor de los arneses de contratos y mutación.
 *
 * Cuatro fases, siempre en este orden:
 *
 *   0 · La base pasa: todos los contratos y toda la suite.
 *   1 · Cada destructiva de contrato hace fallar SU contrato por nombre.
 *   2 · Cada destructiva de pruebas hace fallar la suite.
 *   3 · Cada inocua deja todo en verde.
 *
 * Se extrajo de `verificar-venta.mjs` cuando nació el segundo arnés. La lógica
 * es idéntica; lo que cambia son los contratos y las mutaciones, que viven en
 * archivos propios de cada dominio.
 *
 * Entre fase y fase se restaura el archivo y se comprueba que el árbol de
 * trabajo queda como estaba: un arnés que deja el repositorio sucio es peor que
 * no tenerlo, porque el siguiente `commit` se lleva la mutación.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

mkdirSync('coverage', { recursive: true });

function probarCon(pruebas, informe) {
  const resultado = spawnSync(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      ...pruebas,
      '--reporter=json',
      `--outputFile=${informe}`,
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );
  if (resultado.error) throw resultado.error;
  const datos = JSON.parse(readFileSync(informe, 'utf8'));
  const fallos = datos.testResults
    .flatMap((suite) => suite.assertionResults)
    .filter((prueba) => prueba.status === 'failed')
    .map((prueba) => prueba.fullName);
  return { estado: resultado.status, fallos };
}

/** Evalúa todos los contratos y devuelve los nombres de los que fallan. */
function evaluar(contratos) {
  const rotos = [];
  for (const contrato of contratos) {
    let pasa;
    try {
      pasa = contrato.comprobar();
    } catch {
      // Un contrato que revienta al recortar cuenta como roto: el archivo ya no
      // tiene la forma que decía vigilar.
      pasa = false;
    }
    if (!pasa) rotos.push(contrato.nombre);
  }
  return rotos;
}

/** Aplica una mutación y garantiza la restauración pase lo que pase. */
function conMutacion(mutacion, accion) {
  const original = readFileSync(mutacion.ruta, 'utf8');
  if (!original.includes(mutacion.antes)) {
    throw new Error(`No se encontró el texto a mutar (${mutacion.nombre}): ${mutacion.ruta}`);
  }
  // `antes` sustituye la PRIMERA aparición; `tambien` sustituye TODAS. La
  // diferencia importa cuando el archivo declara dos comandos parecidos: mutar
  // sólo uno deja el otro apuntando a algo que ya no existe, el módulo no carga
  // y la señal se degrada de «la prueba lo caza» a «el compilador lo caza».
  let mutado = original.replace(mutacion.antes, mutacion.despues);
  for (const [antes, despues] of mutacion.tambien ?? []) {
    mutado = mutado.split(antes).join(despues);
  }
  let resultado;
  try {
    writeFileSync(mutacion.ruta, mutado);
    resultado = accion();
  } finally {
    // Restaurar SIEMPRE, incluso si `accion()` lanzó. La comprobación de que
    // quedó restaurado va fuera del `finally`: lanzar desde ahí se tragaría el
    // error original, que es justo el que explica qué pasó.
    writeFileSync(mutacion.ruta, original);
  }
  if (readFileSync(mutacion.ruta, 'utf8') !== original) {
    throw new Error(`No se pudo restaurar ${mutacion.ruta}. REVISA EL ÁRBOL A MANO.`);
  }
  return resultado;
}

function arbol(rutas) {
  const git = spawnSync('git', ['status', '--porcelain', '--', ...rutas], { encoding: 'utf8' });
  // Sin git (un tarball, un contenedor de CI sin .git) no se puede comprobar, y
  // decir que está limpio sin mirarlo sería exactamente la clase de afirmación
  // falsa que este arnés existe para evitar.
  return git.status === 0 ? git.stdout.trim() : null;
}

function fallar(mensaje) {
  console.error(`✗ ${mensaje}`);
  process.exitCode = 1;
  throw new Error(mensaje);
}

/**
 * Corre el arnés completo.
 *
 * @param {{ nombre: string, contratos: unknown[], contraContratos: unknown[],
 *           contraPruebas: unknown[], inocuas: unknown[], pruebas: string[],
 *           informe: string }} config
 */
export function correrArnes(config) {
  const { contratos, contraContratos, contraPruebas, inocuas, pruebas, informe } = config;
  const probar = () => probarCon(pruebas, informe);
  const rutas = [...new Set([...contraContratos, ...contraPruebas, ...inocuas].map((m) => m.ruta))];

  // ── Fase 0 ────────────────────────────────────────────────────────────────
  const sucioAntes = arbol(rutas);
  const rotosBase = evaluar(contratos);
  if (rotosBase.length > 0) fallar(`Contratos rotos antes de mutar: ${rotosBase.join(', ')}`);

  const base = probar();
  if (base.estado !== 0) fallar(`La suite no pasa antes de mutar: ${base.fallos.join(' · ')}`);
  console.log(`✓ base: ${String(contratos.length)} contratos y la suite en verde.`);

  // ── Fase 1 · destructivas contra contratos ────────────────────────────────
  for (const mutacion of contraContratos) {
    const rotos = conMutacion(mutacion, () => evaluar(contratos));
    if (!rotos.includes(mutacion.contrato)) {
      fallar(
        `Mutación SOBREVIVIENTE: «${mutacion.nombre}» no hizo fallar a "${mutacion.contrato}". ` +
          `Rotos: ${rotos.length === 0 ? 'ninguno' : rotos.join(', ')}`,
      );
    }
    console.log(`✓ destructiva «${mutacion.nombre}» → cae ${mutacion.contrato}`);
  }

  // ── Fase 2 · destructivas contra pruebas ──────────────────────────────────
  for (const mutacion of contraPruebas) {
    const resultado = conMutacion(mutacion, probar);
    if (resultado.estado === 0) {
      fallar(`Mutación SOBREVIVIENTE: «${mutacion.nombre}» no rompió ninguna prueba.`);
    }
    // Una suite que ni siquiera CARGA también sale con estado distinto de cero,
    // pero sin aserciones fallidas. Eso no es una mutación bien validada: prueba
    // que el compilador la caza, no que la prueba la caza. Se exige el arreglo
    // en vez de aceptar la señal débil.
    if (resultado.fallos.length === 0) {
      fallar(
        `Mutación «${mutacion.nombre}»: la suite falló SIN aserciones rojas. ` +
          'Probablemente el módulo no carga (import roto). Haz que la mutación compile ' +
          '—con `tambien`— para que lo que la cace sea la prueba y no el compilador.',
      );
    }
    console.log(
      `✓ destructiva «${mutacion.nombre}» → ${String(resultado.fallos.length)} prueba(s) en rojo`,
    );
  }

  // ── Fase 3 · inocuas ──────────────────────────────────────────────────────
  for (const mutacion of inocuas) {
    const resultado = conMutacion(mutacion, () => ({ rotos: evaluar(contratos), suite: probar() }));
    if (resultado.rotos.length > 0) {
      fallar(
        `Inocua «${mutacion.nombre}» rompió contratos: ${resultado.rotos.join(', ')}. ` +
          'El contrato está atado a la forma del código y no a su propiedad.',
      );
    }
    if (resultado.suite.estado !== 0) {
      fallar(`Inocua «${mutacion.nombre}» rompió la suite: ${resultado.suite.fallos.join(' · ')}`);
    }
    console.log(`✓ inocua «${mutacion.nombre}» → todo sigue en verde`);
  }

  // ── Cierre ────────────────────────────────────────────────────────────────
  const rotosFinal = evaluar(contratos);
  if (rotosFinal.length > 0) fallar(`Contratos rotos tras restaurar: ${rotosFinal.join(', ')}`);
  if (probar().estado !== 0) fallar('La versión restaurada no pasa.');

  const sucioDespues = arbol(rutas);
  if (sucioAntes !== null && sucioDespues !== sucioAntes) {
    fallar(
      'El árbol de trabajo cambió durante el arnés. Revisa `git status` antes de commitear.\n' +
        `antes: ${JSON.stringify(sucioAntes)}\ndespués: ${JSON.stringify(sucioDespues)}`,
    );
  }

  console.log(
    `\n${String(contratos.length)} contratos · ${String(contraContratos.length)} destructivas de ` +
      `contrato · ${String(contraPruebas.length)} destructivas de prueba · ` +
      `${String(inocuas.length)} inocuas. Árbol restaurado.`,
  );
}

export { evaluar, conMutacion };
