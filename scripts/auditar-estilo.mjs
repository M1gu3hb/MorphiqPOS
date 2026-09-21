#!/usr/bin/env node
/**
 * AUDITA UN ESTILO contra el contrato, y dice EXACTAMENTE qué par no llega.
 *
 *   pnpm ui:auditar morphiq
 *   pnpm ui:auditar            # los tres, o los que haya
 *
 * ── Por qué existe además de la suite ──────────────────────────────────────
 * `packages/ui/src/tokens/sistema.test.ts` ya audita el contraste de cada estilo en
 * los dos modos, y es la puerta: si un par no llega, CI se pone rojo. Pero su salida
 * es la de un `expect` —«esperaba >= 4.5, recibió 3.42»— una prueba por par, y para
 * AJUSTAR una paleta hace falta lo contrario: los fallos de un estilo juntos, con su
 * medida, en una pantalla.
 *
 * Esto es esa herramienta. Usa EL MISMO código que la suite —el mismo lector de CSS,
 * la misma fórmula de contraste, la misma distancia perceptual— así que lo que aquí
 * pasa, allí pasa. No es una segunda verdad: es la misma, ordenada para trabajar.
 *
 * Se escribió afinando el estilo `morphiq`, donde seis pares de la paleta de Miguel
 * no llegaban a AA. Con la suite sola habría sido un par por corrida.
 */
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const CARPETA = join(RAIZ, 'packages', 'ui', 'src', 'estilos');

const { contrasteLegible, distanciaPerceptual, leerHsl } = await import(
  pathToFileURL(join(RAIZ, 'packages', 'ui', 'src', 'tokens', 'color.ts')).href
);
const { DISTANCIA_MINIMA_ENTRE_GRAFICOS, ESTILOS_CONSTRUIDOS, MODOS, PARES_DE_CONTRASTE } =
  await import(pathToFileURL(join(RAIZ, 'packages', 'ui', 'src', 'tokens', 'contrato.ts')).href);
const { leerArchivo, resolverTokens } = await import(
  pathToFileURL(join(RAIZ, 'packages', 'ui', 'src', 'tokens', 'leerCss.ts')).href
);

const pedidos = process.argv.slice(2);
const estilos = pedidos.length > 0 ? pedidos : [...ESTILOS_CONSTRUIDOS];

const base = leerArchivo(join(CARPETA, 'base.css'));
let fallos = 0;

for (const estilo of estilos) {
  const hoja = join(CARPETA, `${estilo}.css`);
  if (!existsSync(hoja)) {
    console.error(`✗ No existe ${hoja}`);
    fallos += 1;
    continue;
  }
  const bloques = [...base, ...leerArchivo(hoja)];
  const raiz = `[data-estilo='${estilo}']`;

  for (const modo of MODOS) {
    // La clase del modo oscuro es `dark`, que es la que pone el ThemeContext y la
    // única que existe en el <html> de la aplicación.
    const activos = modo === 'claro' ? [':root', raiz] : [':root', raiz, `${raiz}.dark`];
    const tokens = resolverTokens(bloques, activos);
    const malos = [];

    for (const par of PARES_DE_CONTRASTE) {
      const frente = leerHsl(tokens.get(par.frente) ?? '');
      const fondo = leerHsl(tokens.get(par.fondo) ?? '');
      if (!frente || !fondo) {
        malos.push(`FALTA  ${par.frente} o ${par.fondo}`);
        continue;
      }
      const razon = contrasteLegible(frente, fondo);
      if (razon < par.minimo) {
        malos.push(
          `${par.frente} sobre ${par.fondo}: ${razon}:1 (pide ${par.minimo}) — ${par.porque}`,
        );
      }
    }

    const graficos = [1, 2, 3, 4, 5, 6].map((n) => leerHsl(tokens.get(`grafico-${n}`) ?? ''));
    for (let i = 0; i < graficos.length; i += 1) {
      for (let j = i + 1; j < graficos.length; j += 1) {
        const a = graficos[i];
        const b = graficos[j];
        if (!a || !b) continue;
        const distancia = distanciaPerceptual(a, b);
        if (distancia < DISTANCIA_MINIMA_ENTRE_GRAFICOS) {
          malos.push(
            `grafico-${i + 1} vs grafico-${j + 1}: ${distancia.toFixed(3)} de distancia ` +
              `(pide ${DISTANCIA_MINIMA_ENTRE_GRAFICOS}) — dos series que se confunden`,
          );
        }
      }
    }

    if (malos.length === 0) {
      console.log(`✓ ${estilo} / ${modo}`);
      continue;
    }
    fallos += malos.length;
    console.error(`✗ ${estilo} / ${modo} — ${malos.length} problema(s):`);
    for (const malo of malos) console.error(`    ${malo}`);
  }
}

if (fallos > 0) {
  console.error(
    `\n${fallos} problema(s). Un estilo que no pasa contraste NO se publica, por bonito que sea: ` +
      'la accesibilidad es la restricción de entrada del diseño, no una revisión del final.',
  );
  process.exit(1);
}
console.log(`\n✓ ${estilos.length} estilo(s) × ${MODOS.length} modos, todos en AA.`);
