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
import { dirname, join, relative, sep } from 'node:path';
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
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];

/** Utilidades que aceptan color. */
const PREFIJOS = [
  'bg',
  'text',
  'border',
  'ring',
  'fill',
  'stroke',
  'from',
  'via',
  'to',
  'shadow',
  'outline',
  'decoration',
  'accent',
  'caret',
  'divide',
  'placeholder',
];

/**
 * El rango de los PICTOGRAMAS de verdad, construido y no escrito.
 *
 * `1F000`–`1FAFF` son las fichas de mahjong, los emoticonos, los simbolos de
 * transporte y los objetos: todo lo que un sistema operativo dibuja a su manera.
 */
const PICTOGRAMAS = `${String.fromCodePoint(0x1f000)}-${String.fromCodePoint(0x1faff)}`;

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
    nombre: 'duracion de animacion literal',
    deRitmo: true,
    patron: /\bduration-(?:\d+|\[[^\]]*\])/g,
    porque:
      'Las duraciones son TRES y salen de la perilla de movimiento: ' +
      'duration-(--duracion-rapida|normal|lenta). Con una literal, el estilo ' +
      'TERMINAL —que las pone a cero a proposito— sigue animando',
  },
  {
    nombre: 'curva de animacion inventada',
    deRitmo: true,
    // Se permiten las dos del sistema y las palabras de CSS que el navegador ya
    // trae; lo que no se permite es una bezier escrita a mano en un componente.
    patron: /\bease-\[cubic-bezier\([^\]]*\]/g,
    porque:
      'Las curvas son DOS y viven en los tokens: --curva-entrada y --curva-salida. ' +
      'Siete curvas no se sienten ricas, se sienten inconsistentes',
  },
  {
    nombre: 'espacio literal grande',
    deRitmo: true,
    // Los pequenos (0 a 2) son ajustes opticos de un icono o un borde y no
    // dependen de la densidad. A partir de 3 es RITMO, y el ritmo es del sistema.
    patron:
      /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(?:3|4|5|6|8|10|12|14|16|20|24)\b/g,
    porque:
      'Puentea la perilla de densidad: con gap-4 fijo, cambiar a compacta no junta ' +
      'nada. Usa gap-(--espacio-4) y sus hermanos',
  },
  {
    nombre: 'tamano de texto arbitrario',
    deRitmo: true,
    patron: /\btext-\[[0-9.]+(?:px|rem|em)\]/g,
    porque:
      'La escala tipografica son ocho pasos y salen del contrato: text-xs … text-3xl y ' +
      'text-display. Un tamano suelto es el principio de tener veinte',
  },
  {
    nombre: 'tamano de texto fuera de la escala',
    deRitmo: true,
    // Por encima de `text-3xl` ya no hay contrato: son los tamanos por omision de
    // Tailwind, que no se declararon en ninguna parte y no responden a nada. El
    // unico caso legitimo de «mas grande que 3xl» es un total que se lee en voz alta
    // desde el otro lado del mostrador, y ese tiene su paso: `text-display`.
    patron: /\btext-(?:4xl|5xl|6xl|7xl|8xl|9xl)\b/g,
    porque:
      'Fuera de los ocho pasos del contrato. Para un total que se dice en alto usa ' +
      'text-display, que es fluido; para lo demas, text-3xl es el techo',
  },
  {
    nombre: 'emoji usado como icono',
    /**
     * UN EMOJI NO ES UN ICONO, y en un POS eso se paga.
     *
     * Lo dibuja el SISTEMA OPERATIVO: el mismo caracter es una cosa en el Windows
     * de la tiendita, otra en el Android del tecnico y otra en el iPad del mesero.
     * No hereda `currentColor`, asi que no se puede poner en el color de peligro.
     * No escala con la tipografia. Y en una pantalla que avisa de una ALERGIA, eso
     * no es una discusion estetica.
     *
     * Se buscan los pictogramas de verdad —los bloques 1F000-1FAFF— y el SELECTOR
     * DE VARIACION U+FE0F, que es lo que convierte un glifo de texto en un emoji de
     * color: `⚠` es tipografia y `⚠️` es una imagen, y la unica diferencia entre los
     * dos es ese caracter invisible.
     *
     * NO se persiguen los glifos tipograficos monocromos —✓ ✗ ✕ ⚠ ▸ ▾ ▊— porque no
     * son emoji: heredan el color, escalan con el texto, y varios estan puestos a
     * proposito para que el color no sea el unico portador de significado.
     */
    // El patron se CONSTRUYE en vez de escribirse como literal, y por una razon
    // concreta: uno de los caracteres que busca —el selector de variacion U+FE0F—
    // es INVISIBLE. Escrito dentro de una expresion regular literal, cualquiera lo
    // borra al reformatear el archivo sin ver que borro nada, y la regla se queda
    // muda justo para el caso que mas importa: el `⚠️` de las alergias.
    patron: new RegExp(
      `[${PICTOGRAMAS}]|${String.fromCodePoint(0xfe0f)}|${String.fromCodePoint(0x2705)}|${String.fromCodePoint(0x274c)}`,
      'gu',
    ),
    porque:
      'Los emoji los dibuja el sistema operativo: cambian de forma en cada equipo, ' +
      'no heredan el color y no escalan. Usa un icono de lucide-react',
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

/**
 * Carpetas exentas, con su razon. La lista es corta a proposito.
 *
 * `apps/web/src/mh` es el frontend PORTADO del POS de restaurante de Miguel.
 * Su codigo usa literales de Tailwind a proposito y su `index.css` trae una
 * capa entera —el «PARCHE DARK» de `mh-oscuro.css`— que existe justamente para
 * convertir esos literales en modo oscuro: `bg-white/70`, `bg-amber-50`,
 * `text-blue-700`, `border-amber-200`. Es su decision de diseno, esta resuelta,
 * y la instruccion del port es explicita: no se cambia el CSS ni las clases.
 *
 * Aplicarle esta puerta significaria reescribir su diseno para pasar una regla
 * escrita para OTRO sistema de tokens. La regla sigue en pie para todo lo
 * demas: `packages/ui/src` y el resto de `apps/web`.
 */
const CARPETAS_EXENTAS = [
  {
    ruta: join(RAIZ, 'apps', 'web', 'src', 'mh'),
    porque: 'Frontend portado del restaurante: sus literales los cubre su propio parche dark',
  },
];

function estaExenta(ruta) {
  return CARPETAS_EXENTAS.some((carpeta) => ruta.startsWith(carpeta.ruta));
}

/**
 * QUITA LOS COMENTARIOS, y de la forma que NO rompe una URL.
 *
 * Un comentario que menciona `cn('p-2', 'p-4')` para explicar por que existe
 * `twMerge` no es un literal en un componente: es documentacion. Sin esto, la regla
 * del espacio acusaba a `utilidades/cn.ts` por su propia explicacion.
 *
 * Y se quita por LINEAS COMPLETAS y por bloques `/* *\/`, nunca cortando a mitad de
 * linea en el primer `//`: esa version del truco ya se probo en esta fase y se comio
 * el `https://` de una constante, escondiendo una mutacion que debia fallar. Una
 * linea que EMPIEZA por `//` o por `*` es un comentario; un `//` a mitad de linea
 * puede ser una URL.
 */
function sinComentarios(texto) {
  const sinBloques = texto.replaceAll(/\/\*[\s\S]*?\*\//g, '');
  return sinBloques
    .split('\n')
    .filter((linea) => {
      const limpia = linea.trim();
      return !limpia.startsWith('//') && !limpia.startsWith('*');
    })
    .join('\n');
}

const EXTENSIONES = new Set(['.tsx', '.ts', '.jsx', '.js']);

function recorrer(dir, encontrados) {
  if (!existsSync(dir)) return;

  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === 'node_modules' || entrada.name === '.next') continue;

    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (!estaExenta(ruta)) recorrer(ruta, encontrados);
      continue;
    }

    if (EXENTOS.has(entrada.name)) continue;

    const punto = entrada.name.lastIndexOf('.');
    if (punto === -1 || !EXTENSIONES.has(entrada.name.slice(punto))) continue;
    // Las pruebas y el contrato SI nombran colores: es su trabajo.
    if (entrada.name.includes('.test.') || ruta.includes(join('tokens', 'contrato'))) continue;

    const contenido = sinComentarios(readFileSync(ruta, 'utf8'));
    for (const regla of REGLAS) {
      const coincidencias = contenido.match(regla.patron);
      if (!coincidencias) continue;
      encontrados.push({
        archivo: relative(RAIZ, ruta),
        regla: regla.nombre,
        // Las reglas de RITMO llevan su marca hasta el hallazgo: fuera de
        // `packages/ui` cuentan contra el techo en vez de poner la puerta en rojo.
        deRitmo: regla.deRitmo === true,
        // CUANTOS, no «si hay»: la deuda se mide en literales y no en archivos. Con
        // una cuenta por archivo, anadir un `gap-12` a una pantalla que ya tenia uno
        // no subia el numero, y el trinquete no trincaba nada.
        cuantos: coincidencias.length,
        porque: regla.porque,
        ejemplos: [...new Set(coincidencias)].slice(0, 4),
      });
    }
  }
}

/**
 * EL TRINQUETE DEL RITMO, que llego a CERO y por eso se queda.
 *
 * ── Que mide ──────────────────────────────────────────────────────────────
 * Las cuatro reglas de ritmo —espacio, tipografia, duracion y curva— son tan
 * correctas como las de color: un `gap-4` fijo PUENTEA la perilla de densidad, asi que
 * cambiar a `compacta` no junta nada, y una `duration-200` literal sigue animando en
 * el estilo TERMINAL, que pone las duraciones a cero a proposito.
 *
 * ── Por que era un techo y no un cero ─────────────────────────────────────
 * Las 69 pantallas se escribieron con literales, que es lo normal cuando los tokens no
 * emiten CSS — y hasta la etapa 1 no emitian. Exigir cero el primer dia habria dejado
 * la puerta roja durante toda la etapa, y una puerta que lleva semanas en rojo deja de
 * leerse: se salta. Asi que se conto contra un techo que solo podia bajar.
 *
 * ── El registro, que es la unica forma de que un trinquete no mienta ──────
 * 919 · al nacer la regla, sobre las 69 pantallas tal como estaban.
 * 860 · con una regla MAS —los tamanos de texto fuera de los ocho pasos del contrato,
 *       que anadieron 25 hallazgos— y aun asi 59 menos: los cinco cobros, la cocina,
 *       la barra y los quince archivos de los emoji.
 * 828 · diecisiete estados vacios convertidos a la biblioteca.
 *   0 · `tokenizar-pantallas.mjs`: 831 literales en 64 pantallas, de una vez. La
 *       conversion no mueve un pixel en densidad `normal` —`--espacio-4` vale
 *       exactamente lo que valia `p-4`— y es lo que hace que `guantes` y `compacta`
 *       signifiquen algo en las 69, no solo en la libreria.
 *
 * El techo se queda en CERO y el mecanismo tambien: lo que era una deuda es ahora el
 * suelo, y un literal nuevo pone la puerta roja el dia que se escribe.
 */
const TECHO_DE_RITMO = 0;

const hallazgos = [];
for (const carpeta of VIGILADAS) recorrer(carpeta, hallazgos);

const esDelSistema = (archivo) => archivo.split(sep).join('/').startsWith('packages/ui/src');
const enDeuda = hallazgos.filter((h) => h.deRitmo === true && !esDelSistema(h.archivo));
const deuda = enDeuda.reduce((suma, h) => suma + h.cuantos, 0);
const duros = hallazgos.filter((h) => h.deRitmo !== true || esDelSistema(h.archivo));

if (deuda > TECHO_DE_RITMO) {
  console.error(
    `\n✗ La deuda de ritmo SUBIO: ${String(deuda)} literal(es) y el techo es ` +
      `${String(TECHO_DE_RITMO)}.\n`,
  );
  for (const hallazgo of enDeuda.slice(0, 10)) {
    console.error(`  ${hallazgo.archivo}`);
    console.error(`    ${hallazgo.regla}: ${hallazgo.ejemplos.join(', ')}`);
  }
  console.error(
    '\nUn espacio, un tamano de texto o una duracion literal puentea su perilla. Usa los ' +
      'tokens, o baja el techo cuando conviertas una pantalla — nunca lo subas.',
  );
  process.exit(1);
}

if (duros.length > 0) {
  console.error('\n✗ Hay valores literales donde deberia haber tokens:\n');
  for (const hallazgo of duros) {
    console.error(`  ${hallazgo.archivo}`);
    console.error(`    ${hallazgo.regla}: ${hallazgo.ejemplos.join(', ')}`);
    console.error(`    ${hallazgo.porque}\n`);
  }
  console.error(`${duros.length} hallazgo(s).`);
  process.exit(1);
}

for (const carpeta of CARPETAS_EXENTAS) {
  console.log(`  · exenta: ${relative(RAIZ, carpeta.ruta)} — ${carpeta.porque}`);
}
console.log(
  `  · deuda de ritmo fuera de packages/ui: ${String(deuda)} de ${String(TECHO_DE_RITMO)} ` +
    `permitidos, en ${String(enDeuda.length)} archivo(s) — espacio, tipografia y duracion ` +
    'literales que la etapa 4 convierte',
);
console.log(
  '✓ Cero literales de color, altura, sombra, variante, espacio, texto o duracion en el sistema.',
);
