#!/usr/bin/env node
/**
 * LA PUERTA DE LOS ENLACES INTERNOS · cada `href` lleva a una pantalla que existe.
 *
 *   node scripts/verificar-enlaces.mjs
 *
 * ── El defecto que la obliga a existir ────────────────────────────────────
 * La pantalla de Caja del restaurante tenía dos botones, «Corte de turno» y
 * «Cierre diario», y los dos apuntaban a `/restaurante/cierre-diario`. Esa ruta
 * **no existe**: la pantalla se llama `cierre-diario-y-arqueo`. Los dos daban
 * **404** en el navegador.
 *
 * Y no lo vio ninguna puerta, aunque hay una que se llama «rutas llamadas»:
 * aquélla comprueba las rutas de `/api/` —las que una pantalla PUBLICA— y un
 * enlace a otra PANTALLA no pasa por ahí. El hueco estaba escrito en el nombre.
 *
 * Lo encontró el rastreador, por el 404 en la consola. Esto lo caza sin navegador.
 *
 * ── Qué comprueba ────────────────────────────────────────────────────────
 * Cada `href="/…"` literal de `apps/web/src` y de `apps/web/app` tiene que
 * resolverse a un `page.tsx` bajo `apps/web/app`, con los grupos de rutas
 * —`(interno)`, `(modelos)`— transparentes y los segmentos dinámicos `[x]`
 * casando cualquier valor.
 *
 * ── Lo que NO comprueba, dicho en vez de supuesto ─────────────────────────
 * · Los `href` armados con plantilla cuyo valor no se puede leer: se cuentan y el
 *   total se imprime. La parte FIJA sí se comprueba cuando la plantilla empieza
 *   por un segmento literal —`/restaurante/mesa-activa?mesa=${id}` se comprueba
 *   como `/restaurante/mesa-activa`—.
 * · Lo que sale de la aplicación (`http…`, `mailto:`, `tel:`, `wa.me`) y los
 *   anclajes (`#`).
 * · `apps/web/heredado/`, que no se toca en esta fase y tiene su propia puerta.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const APP = join(RAIZ, 'apps', 'web', 'app');
const FUENTES = [join(RAIZ, 'apps', 'web', 'src'), APP];

/** Las rutas que sirve un archivo que no es `page.tsx` y que sí existen. */
const RUTAS_QUE_NO_SON_PANTALLA = new Set([
  // El manifiesto y los iconos los sirve `app/` con otros nombres de archivo.
  '/icono.svg',
  '/manifest.webmanifest',
  '/favicon.ico',
]);

/** Los archivos de pantalla y de componente que pueden llevar un `href`. */
function archivos(carpeta) {
  const salida = [];
  for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) salida.push(...archivos(ruta));
    else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
      salida.push(ruta);
    }
  }
  return salida;
}

/**
 * Todas las rutas que `apps/web/app` sirve, como lista de segmentos.
 *
 * Un grupo `(loquesea)` no es un segmento de URL: desaparece. Un `[x]` sí lo es,
 * y casa cualquier valor.
 */
function rutasDeLaAplicacion() {
  const rutas = [];
  const recorrer = (carpeta, segmentos) => {
    const entradas = readdirSync(carpeta, { withFileTypes: true });
    if (entradas.some((e) => e.isFile() && /^page\.tsx?$/.test(e.name))) {
      rutas.push(segmentos);
    }
    for (const entrada of entradas) {
      if (!entrada.isDirectory()) continue;
      const nombre = entrada.name;
      // `@modal`, `_privado` y los `api/` no son pantallas.
      if (nombre.startsWith('@') || nombre.startsWith('_') || nombre === 'api') continue;
      const siguiente = /^\(.*\)$/.test(nombre) ? segmentos : [...segmentos, nombre];
      recorrer(join(carpeta, nombre), siguiente);
    }
  };
  recorrer(APP, []);
  return rutas;
}

/** ¿Esta ruta pedida casa con alguna que la aplicación sirve? */
function existe(pedidos, servidas) {
  return servidas.some((servida) => {
    if (servida.length !== pedidos.length) {
      // `[...ruta]` come el resto del camino.
      const ultimo = servida[servida.length - 1] ?? '';
      if (!/^\[\.\.\..+\]$/.test(ultimo) || pedidos.length < servida.length) return false;
      return servida.slice(0, -1).every((s, i) => /^\[.+\]$/.test(s) || s === pedidos[i]);
    }
    return servida.every((s, i) => /^\[.+\]$/.test(s) || s === pedidos[i]);
  });
}

/** El camino de un `href`, sin query ni anclaje. */
function caminoDe(href) {
  const sinAnclaje = href.split('#')[0] ?? '';
  const sinQuery = sinAnclaje.split('?')[0] ?? '';
  return sinQuery.replace(/\/+$/, '');
}

const servidas = rutasDeLaAplicacion();
const fallos = [];
let comprobados = 0;
let noComprobables = 0;
let fuera = 0;

for (const carpeta of FUENTES) {
  for (const archivo of archivos(carpeta)) {
    const texto = readFileSync(archivo, 'utf8');

    // `href="/algo"` y `href={'/algo'}`, más las plantillas `href={`/algo/${x}`}`.
    const encontrados = [...texto.matchAll(/href=(?:"([^"]*)"|\{'([^']*)'\}|\{`([^`]*)`\})/g)].map(
      (m) => m[1] ?? m[2] ?? m[3] ?? '',
    );

    for (const href of encontrados) {
      if (href === '' || href.startsWith('#')) continue;
      if (!href.startsWith('/')) {
        fuera += 1;
        continue;
      }
      const camino = caminoDe(href);
      if (camino === '') continue;
      if (RUTAS_QUE_NO_SON_PANTALLA.has(camino)) continue;
      // Un archivo del almacén público o un `/api/`: no son pantallas y los cubren
      // otras puertas.
      if (camino.startsWith('/api/')) continue;

      const partes = camino.slice(1).split('/');
      // Una interpolación en el PRIMER segmento no deja nada que comprobar.
      if (partes[0]?.includes('${') === true) {
        noComprobables += 1;
        continue;
      }
      // Lo que viene desde la primera interpolación no se puede leer: se comprueba
      // el prefijo fijo, que es lo que sí se sabe.
      const corte = partes.findIndex((p) => p.includes('${'));
      const fijas = corte === -1 ? partes : partes.slice(0, corte);
      if (corte !== -1) noComprobables += 1;
      if (fijas.length === 0) continue;

      comprobados += 1;
      // Con un prefijo, basta que exista ALGUNA ruta que empiece igual.
      const encaja =
        corte === -1
          ? existe(fijas, servidas)
          : servidas.some((s) => fijas.every((f, i) => /^\[.+\]$/.test(s[i] ?? '') || s[i] === f));
      if (!encaja) {
        fallos.push(
          `${relative(RAIZ, archivo).replace(/\\/g, '/')} · href="${href}" no lleva a ninguna pantalla`,
        );
      }
    }
  }
}

const resumen =
  `${String(servidas.length)} pantalla(s) servidas · ${String(comprobados)} enlace(s) comprobados · ` +
  `${String(noComprobables)} con interpolación · ${String(fuera)} fuera de la aplicación`;

if (fallos.length > 0) {
  console.error(
    `ENLACES: ${String(fallos.length)} enlace(s) internos a una pantalla que NO existe\n`,
  );
  for (const fallo of [...new Set(fallos)].sort()) console.error(`  · ${fallo}`);
  console.error(
    '\nUn enlace a una pantalla que no existe da 404 en la cara de quien lo toca, y la puerta de\n' +
      '«rutas llamadas» no lo ve: ésa comprueba las de `/api/`. Corrige el `href`, o crea la\n' +
      'pantalla.',
  );
  console.error(`\nenlaces · ${resumen}`);
  process.exit(1);
}

console.log(`OK · enlaces · ${resumen}`);
if (!existsSync(APP)) process.exit(1);
