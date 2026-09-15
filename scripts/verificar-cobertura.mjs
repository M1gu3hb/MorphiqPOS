#!/usr/bin/env node
/**
 * LA PUERTA DE COBERTURA DE LA FASE 2.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────
 * La sesión anterior no se quedó corta de tiempo ni de permiso: corrió hasta
 * el final y escribió «las cinco etapas están cerradas, no queda nada
 * pendiente» con el 40 % del trabajo hecho. Le falló el CRITERIO DE TERMINADO,
 * porque el criterio era su propia opinión.
 *
 * El error concreto tiene nombre: contó FILAS DE TABLA en vez de FUNCIONES.
 * `F-610…F-617` es una fila y son OCHO funciones. Esta puerta expande los
 * rangos, así que ese error lo comete —o no lo comete— un parser, no una
 * persona cansada a las tres de la mañana.
 *
 * ── Qué mide ─────────────────────────────────────────────────────────────
 * Tres cosas, y las tres salen de la documentación, no de una lista a mano:
 *
 *   FUNCIONES  `01-FUNCIONES.md` §5 de cada modelo, con los rangos expandidos.
 *              Una función cuenta como CONSTRUIDA cuando existe un archivo de
 *              implementación con su ID en la cabecera Y existe una prueba.
 *   RUTAS      la sección «RUTAS DE API» de cada `05-DATOS-Y-BACKEND.md`.
 *              Cuenta como construida si el `route.ts` existe en disco.
 *   MIGRACIONES la sección «MIGRACIONES» de cada `05-DATOS-Y-BACKEND.md`.
 *              Cuenta como escrita si el `.sql` existe con ESE nombre. Cuando
 *              una etapa consolida dos migraciones declaradas en un archivo, lo
 *              que se corrige es el documento — que es el contrato que van a
 *              leer los 73 modelos que faltan.
 *   PANTALLAS  cada `### ` dentro del §4.3 de cada `04-INTERFAZ.md`.
 *              Cuenta como construida si existe un archivo con la etiqueta
 *              `PANTALLA · <modelo> · <slug>` en su cabecera **Y ese archivo
 *              es alcanzable desde una raíz de Next.js**. Un componente que
 *              nadie importa no es una pantalla: es un archivo.
 *
 * ── Cómo se sabe que esta puerta sirve ───────────────────────────────────
 * Al escribirla tenía que salir en ROJO y decir números parecidos a
 * 45/113 · 44/106 · 0/61. Si hubiera salido en verde, o con números bonitos,
 * la puerta estaría mal y habría que reescribirla. Una puerta que no puede
 * fallar no es una puerta — eso ya se aprendió en la Fase 1 con
 * `verify:escrituras`, que informaba ocho escrituras sin analizar y salía en
 * verde igual.
 *
 * ── Las excepciones ──────────────────────────────────────────────────────
 * Lo que de verdad no se puede construir —CFDI esperando la decisión P-02,
 * el hardware que Miguel no ha elegido— NO relaja la puerta: se declara una
 * por una en `docs/fase-2/EXCEPCIONES-COBERTURA.md`, con su ID y su razón.
 * Así la excepción queda escrita y contada, no escondida.
 *
 * Se ejecuta con: pnpm verify:cobertura
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));

/** Los cinco modelos de la Fase 2, en el orden de las etapas. */
const MODELOS = [
  { clave: 'restaurante', carpeta: '01-alimentos/restaurante' },
  { clave: 'cafeteria', carpeta: '01-alimentos/cafeteria' },
  { clave: 'abarrotes', carpeta: '02-retail/abarrotes' },
  { clave: 'ferreteria', carpeta: '02-retail/ferreteria' },
  { clave: 'estetica-salon', carpeta: '03-servicios-cita/estetica-salon' },
];

const DOCS = join(RAIZ, 'docs', 'fase-2', 'modelos');

/**
 * El tronco compartido. No sale de ningún `01-FUNCIONES.md` §5 y por eso se
 * declara aquí, a mano y a propósito.
 *
 * Es lo que heredan los setenta y tres modelos que faltan: si queda a medias,
 * se paga setenta y tres veces. Sin esta lista la puerta daría verde sobre un
 * tronco incompleto, que es exactamente el punto ciego que tuvo la sesión
 * anterior — sus cinco tablas de modelo se veían bien y el cimiento no estaba.
 *
 * Se cuenta APARTE de los cinco modelos para que la cifra de titulares
 * —113 funciones— siga siendo comparable con la auditoría que encargó esto.
 */
const TRONCO = [
  'F-015', // plantilla de negocio
  'F-016', // perillas por módulo
  'F-017', // diccionario de vocabulario
  'F-103', // kardex
  'F-105', // traspaso entre almacenes
  'F-108', // valuación de inventario
  'F-109', // merma con motivo, como estrategia
  'F-260', // la propina como pasivo
];

/**
 * Cuántas líneas de un archivo cuentan como «cabecera».
 *
 * La etiqueta va arriba, en el docblock, no perdida en la línea 400. Si se
 * permitiera en cualquier sitio, un ID mencionado de pasada en un comentario
 * —«esto lo usa F-321»— marcaría la función como construida sin estarlo.
 */
const LINEAS_DE_CABECERA = 60;

// ───────────────────────────────────────────────────────────────────────────
// Lectura de la documentación
// ───────────────────────────────────────────────────────────────────────────

function leer(ruta) {
  return readFileSync(ruta, 'utf8');
}

/**
 * Recorta la sección de un markdown que empieza en el primer encabezado que
 * cumple `coincide` y termina en el siguiente encabezado del MISMO nivel.
 *
 * Se recorta por NIVEL y no por distancia: los `###` de dentro tienen que
 * quedar dentro, y el `## 6` de después tiene que quedar fuera.
 */
function seccion(texto, nivel, coincide) {
  const lineas = texto.split(/\r?\n/);
  const marca = '#'.repeat(nivel) + ' ';
  let inicio = -1;
  for (let i = 0; i < lineas.length; i += 1) {
    if (!lineas[i].startsWith(marca)) continue;
    const titulo = lineas[i].slice(marca.length);
    if (inicio === -1 && coincide(titulo)) {
      inicio = i;
      continue;
    }
    if (inicio !== -1) return lineas.slice(inicio + 1, i).join('\n');
  }
  return inicio === -1 ? '' : lineas.slice(inicio + 1).join('\n');
}

/** 610 → `F-610`. */
function idDe(numero) {
  return `F-${String(numero).padStart(3, '0')}`;
}

/**
 * Expande los IDs de una celda de la columna «ID» del §5.
 *
 * ÉSTE ES EL CORAZÓN DE LA PUERTA. Las celdas vienen en seis formas distintas
 * y todas aparecen de verdad en los cinco modelos:
 *
 *   `**F-321**`                        una
 *   `**F-111 · F-112**`                dos sueltas
 *   `**F-930/F-934/F-936**`            tres sueltas con otro separador
 *   `**F-610…F-617**`                  OCHO — un rango
 *   `**F-610…F-617 · F-638 · F-639**`  diez — rango más dos sueltas
 *   `**F-011** variante`               una, con texto detrás
 *
 * Un rango es todo par de IDs separado por `…`, `...`, `–` o `-`.
 */
function expandirIds(celda) {
  const encontrados = [];
  const patron = /F-(\d{3})(\s*(?:…|\.\.\.|–|—|-)\s*)F-(\d{3})|F-(\d{3})/g;
  let m;
  while ((m = patron.exec(celda)) !== null) {
    if (m[1] !== undefined) {
      const desde = Number.parseInt(m[1], 10);
      const hasta = Number.parseInt(m[3], 10);
      if (hasta < desde) throw new Error(`Rango invertido en «${celda}»`);
      if (hasta - desde > 60) throw new Error(`Rango absurdo en «${celda}»`);
      for (let n = desde; n <= hasta; n += 1) encontrados.push(idDe(n));
    } else {
      encontrados.push(idDe(Number.parseInt(m[4], 10)));
    }
  }
  return encontrados;
}

/** Los IDs esperados de un modelo: su §5 · LO QUE FALTA, con rangos abiertos. */
function funcionesEsperadas(modelo) {
  const texto = leer(join(DOCS, modelo.carpeta, '01-FUNCIONES.md'));
  const cuerpo = seccion(texto, 2, (t) => /^5\s*·/.test(t));
  if (cuerpo.trim() === '')
    throw new Error(`${modelo.clave}: no encontré el §5 de 01-FUNCIONES.md`);
  const ids = new Set();
  for (const linea of cuerpo.split(/\r?\n/)) {
    if (!linea.trimStart().startsWith('|')) continue;
    if (/^\s*\|[\s|:-]*\|?\s*$/.test(linea)) continue; // la línea de guiones
    const celdas = linea.split('|');
    if (celdas.length < 3) continue;
    const primera = celdas[1];
    if (!/F-\d{3}/.test(primera)) continue; // el encabezado «| ID | Función |»
    for (const id of expandirIds(primera)) ids.add(id);
  }
  return ids;
}

/**
 * Las rutas esperadas de un modelo.
 *
 * Vienen en dos formatos, porque cuatro modelos escribieron la ruta de disco y
 * `estetica-salon` escribió el verbo HTTP y la URL:
 *
 *   apps/web/app/api/restaurante/dividir-cuenta/route.ts
 *   PATCH /api/citas/:id/cancelar
 *
 * El segundo se traduce al primero: `:id` → `[id]`, y la consulta se tira.
 * Dos verbos sobre la MISMA url son un solo archivo `route.ts`, así que el
 * conjunto se deduplica — por eso la cuenta de la auditoría (106) y la de esta
 * puerta (105) difieren en uno: `GET` y `PUT /api/clientes/:id/expediente`.
 */
function rutasEsperadas(modelo) {
  const texto = leer(join(DOCS, modelo.carpeta, '05-DATOS-Y-BACKEND.md'));
  const cuerpo = seccion(texto, 2, (t) => /RUTAS DE API/i.test(t));
  if (cuerpo.trim() === '') throw new Error(`${modelo.clave}: no encontré «RUTAS DE API»`);
  const rutas = new Set();
  for (const m of cuerpo.matchAll(/apps\/web\/app\/api\/[^\s`|]+\/route\.ts/g)) rutas.add(m[0]);
  for (const m of cuerpo.matchAll(/^(?:GET|POST|PUT|PATCH|DELETE)\s+(\/api\/\S+)/gm)) {
    const limpia = m[1].split('?')[0].replace(/\/+$/, '');
    const partes = limpia
      .split('/')
      .map((seg) => (seg.startsWith(':') ? `[${seg.slice(1)}]` : seg));
    rutas.add(`apps/web/app${partes.join('/')}/route.ts`);
  }
  return rutas;
}

/**
 * Las migraciones declaradas de un modelo.
 *
 * Vienen dentro de un árbol en un bloque de código:
 *
 *     ├── 090_presentaciones.sql
 *     │     producto_presentaciones + índices + los tres check
 *
 * y por eso se leen por nombre de archivo y no por línea: la glosa de debajo
 * también menciona números.
 */
function migracionesEsperadas(modelo) {
  const texto = leer(join(DOCS, modelo.carpeta, '05-DATOS-Y-BACKEND.md'));
  const cuerpo = seccion(texto, 2, (t) => /MIGRACIONES/i.test(t));
  if (cuerpo.trim() === '') throw new Error(`${modelo.clave}: no encontré «MIGRACIONES»`);
  const archivos = new Set();
  for (const m of cuerpo.matchAll(/\b(\d{3}_[a-z0-9_]+\.sql)/g)) archivos.add(m[1]);
  return archivos;
}

/**
 * Convierte el encabezado de una pantalla en un identificador estable.
 *
 * Los cinco modelos titulan distinto, a propósito, y el slug tiene que
 * sobrevivir a los cinco:
 *
 *   `PANTALLA · Mapa de mesas *(la pantalla insignia del modelo)*` → mapa-de-mesas
 *   `PANTALLA 3 · SERVICIOS · recargas y pago · F-255`             → servicios
 *   `4.3.1 · AGENDA DEL DÍA · **la pantalla de inicio**`           → agenda-del-dia
 *
 * Se queda con el PRIMER segmento útil tras quitar el prefijo, porque lo que
 * sigue al segundo `·` siempre es glosa, no nombre.
 */
function slugDePantalla(titulo) {
  let t = titulo.trim();
  t = t.replace(/^PANTALLA\s*\d*\s*·?\s*/i, '');
  t = t.replace(/^\d+(?:\.\d+)*\s*·?\s*/, '');
  t = t.split('·')[0];
  t = t.replace(/\*+/g, '');
  t = t.replace(/\([^)]*\)/g, '');
  t = t.replace(/[★☆]/g, '');
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  t = t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return t;
}

/** Las pantallas esperadas: cada `###` del §4.3, menos las heredadas sin cambios. */
function pantallasEsperadas(modelo) {
  const texto = leer(join(DOCS, modelo.carpeta, '04-INTERFAZ.md'));
  const cuerpo = seccion(texto, 2, (t) => /^4\.3\s*·/.test(t));
  if (cuerpo.trim() === '')
    throw new Error(`${modelo.clave}: no encontré el §4.3 de 04-INTERFAZ.md`);
  const pantallas = new Set();
  for (const linea of cuerpo.split(/\r?\n/)) {
    if (!linea.startsWith('### ')) continue;
    const titulo = linea.slice(4);
    if (/^PANTALLAS QUE SE HEREDAN/i.test(titulo.trim())) continue;
    const slug = slugDePantalla(titulo);
    if (slug !== '') pantallas.add(slug);
  }
  return pantallas;
}

// ───────────────────────────────────────────────────────────────────────────
// Lectura del código
// ───────────────────────────────────────────────────────────────────────────

const EXTENSIONES = ['.ts', '.tsx'];

function recorrer(carpeta, salida) {
  if (!existsSync(carpeta)) return salida;
  for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules' || entrada.name === '.next') continue;
      recorrer(ruta, salida);
    } else if (EXTENSIONES.some((e) => entrada.name.endsWith(e))) {
      salida.push(ruta);
    }
  }
  return salida;
}

/** Las carpetas de código que esta puerta mira. `heredado/` no: no es nuestro. */
function archivosDeCodigo() {
  const carpetas = [
    join(RAIZ, 'packages'),
    join(RAIZ, 'apps', 'web', 'app'),
    join(RAIZ, 'apps', 'web', 'src'),
  ];
  const todos = [];
  for (const c of carpetas) recorrer(c, todos);
  return todos.filter(
    (r) =>
      !r.includes(`${sep}dist${sep}`) && !r.includes(`${sep}src${sep}migraciones${sep}sql${sep}`),
  );
}

function esPrueba(ruta) {
  return /\.test\.tsx?$/.test(ruta) || /\.contrato\.test\.tsx?$/.test(ruta);
}

function cabecera(contenido) {
  return contenido.split(/\r?\n/).slice(0, LINEAS_DE_CABECERA).join('\n');
}

// ───────────────────────────────────────────────────────────────────────────
// El grafo de importaciones: qué archivo alcanza Next.js de verdad
// ───────────────────────────────────────────────────────────────────────────

const ALIAS = [
  ['@/lib/packageConfig', join(RAIZ, 'apps', 'web', 'src', 'cliente', 'package-config.ts')],
  ['~/', join(RAIZ, 'apps', 'web', 'src') + sep],
  ['@/', join(RAIZ, 'apps', 'web', 'heredado') + sep],
];

const CANDIDATAS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
];

function resolverArchivo(base) {
  for (const sufijo of CANDIDATAS) {
    const intento = base + sufijo;
    if (existsSync(intento) && statSync(intento).isFile()) return intento;
  }
  return null;
}

/**
 * Resuelve un especificador de importación a un archivo del repositorio.
 *
 * Sólo resuelve lo de dentro: relativo, los dos alias de `apps/web` y los
 * `@morphiqpos/*` del monorepo. Un paquete de `node_modules` devuelve `null`
 * a propósito — no forma parte del grafo que esta puerta vigila.
 */
function resolverImport(desde, especificador) {
  if (especificador.startsWith('.')) {
    return resolverArchivo(resolve(dirname(desde), especificador));
  }
  for (const [prefijo, destino] of ALIAS) {
    if (especificador === prefijo) return resolverArchivo(destino);
    if (prefijo.endsWith(sep) || prefijo.endsWith('/')) {
      if (especificador.startsWith(prefijo)) {
        return resolverArchivo(join(destino, especificador.slice(prefijo.length)));
      }
    }
  }
  const paquete = /^@morphiqpos\/([a-z-]+)(?:\/(.*))?$/.exec(especificador);
  if (paquete !== null) {
    const raizPaquete = join(RAIZ, 'packages', paquete[1], 'src');
    const resto = paquete[2] === undefined || paquete[2] === '' ? 'index' : paquete[2];
    return resolverArchivo(join(raizPaquete, resto));
  }
  return null;
}

function importacionesDe(contenido) {
  const especificadores = [];
  const patrones = [
    /\bimport\s+(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const p of patrones) {
    for (const m of contenido.matchAll(p)) especificadores.push(m[1]);
  }
  return especificadores;
}

/**
 * Los archivos que Next.js monta por convención: son las raíces del grafo.
 *
 * Una `page.tsx` no la importa nadie y aun así se sirve. Tratarla como
 * huérfana haría que la puerta pidiera algo imposible.
 */
function raicesDeNext() {
  const raices = [];
  const app = join(RAIZ, 'apps', 'web', 'app');
  for (const ruta of recorrer(app, [])) {
    const nombre = ruta.split(sep).pop();
    if (/^(page|layout|route|template|error|loading|not-found|default)\.tsx?$/.test(nombre)) {
      raices.push(ruta);
    }
  }
  const middleware = join(RAIZ, 'apps', 'web', 'middleware.ts');
  if (existsSync(middleware)) raices.push(middleware);
  return raices;
}

/** Cierre transitivo: todo lo que Next.js llega a cargar arrancando por sus raíces. */
function alcanzablesDesdeNext(contenidoDe) {
  const vistos = new Set();
  const pila = raicesDeNext();
  while (pila.length > 0) {
    const actual = pila.pop();
    if (vistos.has(actual)) continue;
    vistos.add(actual);
    const contenido = contenidoDe.get(actual) ?? (existsSync(actual) ? leer(actual) : '');
    for (const especificador of importacionesDe(contenido)) {
      const destino = resolverImport(actual, especificador);
      if (destino !== null && !vistos.has(destino)) pila.push(destino);
    }
  }
  return vistos;
}

// ───────────────────────────────────────────────────────────────────────────
// Las excepciones declaradas
// ───────────────────────────────────────────────────────────────────────────

/**
 * Lee `EXCEPCIONES-COBERTURA.md`. Una fila por excepción, con su razón.
 *
 * La razón no la valida nadie, pero tiene que estar escrita: una excepción sin
 * motivo es la puerta relajándose en silencio, que es justo lo que no queremos.
 */
function excepciones() {
  const ruta = join(RAIZ, 'docs', 'fase-2', 'EXCEPCIONES-COBERTURA.md');
  const fuera = {
    funciones: new Map(),
    rutas: new Map(),
    pantallas: new Map(),
    migraciones: new Map(),
  };
  if (!existsSync(ruta)) return fuera;
  // Sólo cuentan las filas de las TRES tablas de excepciones. La tabla de
  // formato del encabezado explica las claves con ejemplos —`F-NNN`,
  // `PANTALLA <modelo>/<slug>`— y si se leyera entera se colaría como
  // excepción una pantalla llamada literalmente «<modelo>/<slug>». Pasó en el
  // primer arranque de esta puerta: declaró 3 rutas y 1 pantalla exentas
  // cuando en el archivo había 2 y 0.
  let dentro = false;
  for (const linea of leer(ruta).split(/\r?\n/)) {
    if (linea.startsWith('## ')) {
      dentro = /^##\s+(FUNCIONES|RUTAS|PANTALLAS|MIGRACIONES)\s*$/.test(linea);
      continue;
    }
    if (!dentro) continue;
    if (!linea.trimStart().startsWith('|')) continue;
    const celdas = linea.split('|').map((c) => c.trim());
    if (celdas.length < 4) continue;
    const clave = celdas[1].replace(/\*|`/g, '').trim();
    const razon = celdas[celdas.length - 2];
    if (razon === '' || /^-+$/.test(razon)) continue;
    const funcion = /^(F-\d{3})$/.exec(clave);
    if (funcion !== null) {
      fuera.funciones.set(funcion[1], razon);
      continue;
    }
    const ruta2 = /^RUTA\s+(\S+)$/.exec(clave);
    if (ruta2 !== null) {
      fuera.rutas.set(ruta2[1], razon);
      continue;
    }
    const pantalla = /^PANTALLA\s+(\S+)$/.exec(clave);
    if (pantalla !== null) {
      fuera.pantallas.set(pantalla[1], razon);
      continue;
    }
    const migracion = /^MIGRACION\s+(\S+)$/.exec(clave);
    if (migracion !== null) fuera.migraciones.set(migracion[1], razon);
  }
  return fuera;
}

// ───────────────────────────────────────────────────────────────────────────
// El informe
// ───────────────────────────────────────────────────────────────────────────

function porcentaje(hechas, total) {
  if (total === 0) return '100%';
  return `${String(Math.round((hechas / total) * 100)).padStart(3, ' ')}%`;
}

function celda(hechas, total) {
  return `${String(hechas).padStart(3, ' ')}/${String(total).padEnd(3, ' ')} ${porcentaje(hechas, total)}`;
}

function main() {
  const fuera = excepciones();

  const archivos = archivosDeCodigo();
  const contenidoDe = new Map();
  for (const ruta of archivos) contenidoDe.set(ruta, leer(ruta));

  // Etiquetas de función, sólo en cabecera y sólo en archivos que no son prueba.
  const implementa = new Map(); // F-XXX → [rutas]
  const pruebaDe = new Map(); // F-XXX → [rutas]
  const pruebasPorBase = new Set();
  for (const ruta of archivos) {
    if (esPrueba(ruta)) pruebasPorBase.add(ruta.replace(/\.(contrato\.)?test\.tsx?$/, ''));
  }
  for (const ruta of archivos) {
    const cab = cabecera(contenidoDe.get(ruta));
    const ids = new Set();
    for (const m of cab.matchAll(/F-(\d{3})/g)) ids.add(idDe(Number.parseInt(m[1], 10)));
    if (ids.size === 0) continue;
    const destino = esPrueba(ruta) ? pruebaDe : implementa;
    for (const id of ids) {
      if (!destino.has(id)) destino.set(id, []);
      destino.get(id).push(ruta);
    }
  }

  // Etiquetas de pantalla: `PANTALLA · <modelo> · <slug>`.
  const pantallaEn = new Map(); // `modelo/slug` → ruta
  for (const ruta of archivos) {
    const cab = cabecera(contenidoDe.get(ruta));
    for (const m of cab.matchAll(/PANTALLA\s*·\s*([a-z-]+)\s*·\s*([a-z0-9-]+)/g)) {
      pantallaEn.set(`${m[1]}/${m[2]}`, ruta);
    }
  }

  const alcanzables = alcanzablesDesdeNext(contenidoDe);

  /** ¿Está construida esta función? Implementación etiquetada **y** prueba. */
  function construida(id) {
    const impls = implementa.get(id) ?? [];
    if (impls.length === 0) return { ok: false, motivo: 'sin implementación' };
    const tienePrueba =
      (pruebaDe.get(id) ?? []).length > 0 ||
      impls.some((r) => pruebasPorBase.has(r.replace(/\.tsx?$/, '')));
    return tienePrueba ? { ok: true } : { ok: false, motivo: 'sin prueba' };
  }

  const filas = [];
  const faltantes = { funciones: [], rutas: [], pantallas: [], tronco: [], migraciones: [] };
  const totales = { fe: 0, fh: 0, re: 0, rh: 0, pe: 0, ph: 0, me: 0, mh: 0 };
  const SQL = join(RAIZ, 'packages', 'data', 'src', 'migraciones', 'sql');

  let troncoHechas = 0;
  for (const id of TRONCO) {
    if (fuera.funciones.has(id)) {
      troncoHechas += 1;
      continue;
    }
    const estado = construida(id);
    if (estado.ok) troncoHechas += 1;
    else faltantes.tronco.push(`${'tronco'.padEnd(15)} ${id}  ${estado.motivo}`);
  }

  for (const modelo of MODELOS) {
    const esperadasF = funcionesEsperadas(modelo);
    const esperadasR = rutasEsperadas(modelo);
    const esperadasP = pantallasEsperadas(modelo);

    let fh = 0;
    for (const id of esperadasF) {
      if (fuera.funciones.has(id)) {
        fh += 1;
        continue;
      }
      const estado = construida(id);
      if (estado.ok) fh += 1;
      else faltantes.funciones.push(`${modelo.clave.padEnd(15)} ${id}  ${estado.motivo}`);
    }

    let rh = 0;
    for (const r of esperadasR) {
      if (fuera.rutas.has(r) || existsSync(join(RAIZ, r))) rh += 1;
      else faltantes.rutas.push(`${modelo.clave.padEnd(15)} ${r}`);
    }

    let ph = 0;
    for (const slug of esperadasP) {
      const clave = `${modelo.clave}/${slug}`;
      if (fuera.pantallas.has(clave)) {
        ph += 1;
        continue;
      }
      const ruta = pantallaEn.get(clave);
      if (ruta === undefined) {
        faltantes.pantallas.push(`${modelo.clave.padEnd(15)} ${slug}  sin componente etiquetado`);
      } else if (!alcanzables.has(ruta)) {
        faltantes.pantallas.push(
          `${modelo.clave.padEnd(15)} ${slug}  huérfana: nadie la importa (${relative(RAIZ, ruta).split(sep).join('/')})`,
        );
      } else ph += 1;
    }

    const esperadasM = migracionesEsperadas(modelo);
    let mh = 0;
    for (const archivo of esperadasM) {
      if (fuera.migraciones.has(archivo) || existsSync(join(SQL, archivo))) mh += 1;
      else faltantes.migraciones.push(`${modelo.clave.padEnd(15)} ${archivo}`);
    }

    filas.push({
      clave: modelo.clave,
      fe: esperadasF.size,
      fh,
      re: esperadasR.size,
      rh,
      pe: esperadasP.size,
      ph,
      me: esperadasM.size,
      mh,
    });
    totales.fe += esperadasF.size;
    totales.fh += fh;
    totales.re += esperadasR.size;
    totales.rh += rh;
    totales.pe += esperadasP.size;
    totales.ph += ph;
    totales.me += esperadasM.size;
    totales.mh += mh;
  }

  // Componentes etiquetados que nadie importa. Es la comprobación que caza a
  // los tres huérfanos de la sesión anterior aunque no fueran pantallas.
  const huerfanos = [];
  for (const ruta of archivos) {
    if (!ruta.startsWith(join(RAIZ, 'apps', 'web'))) continue;
    if (esPrueba(ruta)) continue;
    if (!/\.tsx$/.test(ruta)) continue;
    if (alcanzables.has(ruta)) continue;
    huerfanos.push(relative(RAIZ, ruta).split(sep).join('/'));
  }

  console.log('');
  console.log(
    'COBERTURA DE LA FASE 2 · lo declarado en la documentación contra lo que hay en disco',
  );
  console.log('');
  console.log('MODELO           FUNCIONES        RUTAS            PANTALLAS        MIGRACIONES');
  console.log(
    '───────────────  ───────────────  ───────────────  ───────────────  ───────────────',
  );
  for (const f of filas) {
    console.log(
      `${f.clave.padEnd(15)}  ${celda(f.fh, f.fe)}  ${celda(f.rh, f.re)}  ${celda(f.ph, f.pe)}  ${celda(f.mh, f.me)}`,
    );
  }
  console.log(
    '───────────────  ───────────────  ───────────────  ───────────────  ───────────────',
  );
  console.log(
    `${'TOTAL'.padEnd(15)}  ${celda(totales.fh, totales.fe)}  ${celda(totales.rh, totales.re)}  ${celda(totales.ph, totales.pe)}  ${celda(totales.mh, totales.me)}`,
  );
  console.log('');
  console.log(
    `TRONCO COMPARTIDO · lo que heredan los 73 modelos que faltan:  ${celda(troncoHechas, TRONCO.length)}`,
  );
  console.log('');

  const cuentaExcepciones = fuera.funciones.size + fuera.rutas.size + fuera.pantallas.size;
  if (cuentaExcepciones > 0) {
    console.log(
      `Excepciones declaradas en docs/fase-2/EXCEPCIONES-COBERTURA.md: ${cuentaExcepciones} ` +
        `(${fuera.funciones.size} funciones · ${fuera.rutas.size} rutas · ` +
        `${fuera.pantallas.size} pantallas · ${fuera.migraciones.size} migraciones)`,
    );
    console.log('');
  }

  let fallos = 0;

  if (faltantes.tronco.length > 0) {
    fallos += faltantes.tronco.length;
    console.log(`TRONCO SIN CERRAR · ${faltantes.tronco.length}`);
    for (const f of faltantes.tronco.sort()) console.log(`  ${f}`);
    console.log('');
  }
  if (faltantes.funciones.length > 0) {
    fallos += faltantes.funciones.length;
    console.log(`FUNCIONES SIN CONSTRUIR · ${faltantes.funciones.length}`);
    for (const f of faltantes.funciones.sort()) console.log(`  ${f}`);
    console.log('');
  }
  if (faltantes.rutas.length > 0) {
    fallos += faltantes.rutas.length;
    console.log(`RUTAS QUE NO EXISTEN · ${faltantes.rutas.length}`);
    for (const f of faltantes.rutas.sort()) console.log(`  ${f}`);
    console.log('');
  }
  if (faltantes.pantallas.length > 0) {
    fallos += faltantes.pantallas.length;
    console.log(`PANTALLAS SIN CONSTRUIR O HUÉRFANAS · ${faltantes.pantallas.length}`);
    for (const f of faltantes.pantallas.sort()) console.log(`  ${f}`);
    console.log('');
  }
  if (faltantes.migraciones.length > 0) {
    fallos += faltantes.migraciones.length;
    console.log(`MIGRACIONES SIN ESCRIBIR · ${faltantes.migraciones.length}`);
    for (const f of faltantes.migraciones.sort()) console.log(`  ${f}`);
    console.log('');
  }
  if (huerfanos.length > 0) {
    fallos += huerfanos.length;
    console.log(`COMPONENTES HUÉRFANOS · ${huerfanos.length} · existen y nadie los importa`);
    for (const f of huerfanos.sort()) console.log(`  ${f}`);
    console.log('');
  }

  if (fallos === 0) {
    console.log('✓ Cobertura completa: funciones, rutas y pantallas, o declaradas como excepción.');
    process.exit(0);
  }
  console.log(`✗ Faltan ${fallos} piezas. La Fase 2 NO está lista para acoplar.`);
  process.exit(1);
}

main();
