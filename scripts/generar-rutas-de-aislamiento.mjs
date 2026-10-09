#!/usr/bin/env node
/**
 * LAS RUTAS DEL AISLAMIENTO, generadas del registro de comandos (D.4 de la 2.4).
 *
 *   node --conditions=react-server scripts/generar-rutas-de-aislamiento.mjs             # lo escribe
 *   node --conditions=react-server scripts/generar-rutas-de-aislamiento.mjs --verificar # ¿al día?
 *
 * `pruebas/e2e/aislamiento.spec.ts` entra a una demo y le pide, por cada ruta, recursos de
 * OTRA demo por su id. La respuesta tiene que ser indistinguible de la de un id que no
 * existe. Para eso necesita, de cada comando, un cuerpo que pase zod —si no, las dos
 * respuestas serían el mismo 400 y la prueba no diría nada— y saber a qué tabla apunta cada
 * campo de id, para llenarlo con un id real de la otra demo.
 *
 * Las dos cosas salen del código: el cuerpo, del esquema de `entrada` de cada comando
 * (`z.toJSONSchema`, lo requerido y todo campo de id); la tabla, del nombre del campo contra
 * las tablas del puente (`ordenId` → `ordenes`, `sesionCajaId` → `sesiones_caja`). Lo que
 * no se resuelve se queda con `?`: la prueba lo llena con un id al azar y lo cuenta.
 *
 * En el cuerpo, `⟨tabla⟩` es «un id de esa tabla de la otra demo», `⟨?⟩` uno al azar,
 * `⟨hoy⟩` y `⟨ahora⟩` la fecha de la corrida (generado con la fecha, el archivo cambiaría
 * cada día y `--verificar` no serviría).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import * as prettier from 'prettier';

import { archivoDelModulo, rutasDeComando } from './lib/rutas-de-comando.mjs';

const SALIDA = join('pruebas', 'e2e', 'aislamiento.json');

const z = await import(
  pathToFileURL(join('packages', 'app', 'node_modules', 'zod', 'index.js')).href
);
const { MAPA } = await import(archivoDelModulo('@morphiqpos/app/puente'));

/** Las tablas que el puente sabe leer, con la entidad por la que se leen. */
const ENTIDAD_DE_TABLA = new Map();
for (const [nombre, entidad] of Object.entries(MAPA).sort(([a], [b]) => a.localeCompare(b))) {
  if (!ENTIDAD_DE_TABLA.has(entidad.tabla)) ENTIDAD_DE_TABLA.set(entidad.tabla, nombre);
}

/**
 * Los nombres de campo que no dicen su tabla. Pocos, y cada uno porque el comando lo llama
 * por su papel y no por su tabla.
 */
const ALIAS = {
  linea: 'orden_lineas',
  pedido: 'ordenes',
  venta: 'ordenes',
  cuenta: 'ordenes',
  destino: 'ordenes',
  origen: 'ordenes',
  empleado: 'empleos',
  persona: 'empleos',
  profesional: 'profesionales',
  estilista: 'empleos',
  mesero: 'empleos',
  solicita: 'empleos',
  autoriza: 'empleos',
  quien: 'empleos',
  autorizado: 'autorizados_cuenta',
  toma: 'tomas_inventario',
  nota: 'notas_de_caja',
  lista: 'listas_de_trabajo',
  regla: 'reglas_comision',
  presentacion: 'producto_presentaciones',
  pieza: 'piezas_de_material',
  espera: 'lista_espera',
  union: 'uniones_mesa',
  solicitud: 'solicitudes_qr',
  equivalente: 'equivalencias',
  esquema: 'esquemas_propina',
  pago: 'pagos_credito',
  plantilla: 'plantillas_compra',
  material: 'materiales_mostrador',
  corte: 'sesiones_caja',
};

/**
 * Tablas que el puente no sirve pero cuyos ids la prueba sí consigue de la otra demo: las
 * personas, de la lista de la entrada (`/api/auth/empleados`), que es pública.
 */
const FUERA_DEL_PUENTE = new Set(['empleos']);

function existe(tabla) {
  return ENTIDAD_DE_TABLA.has(tabla) || FUERA_DEL_PUENTE.has(tabla);
}

function palabras(nombre) {
  return nombre
    .replace(/Ids?$/, '')
    .split(/(?=[A-Z])/)
    .map((p) => p.toLowerCase())
    .filter((p) => p !== '');
}

function plural(palabra) {
  return /[aeiou]$/.test(palabra) ? `${palabra}s` : `${palabra}es`;
}

function candidatas(trozo) {
  const [primera, ...demas] = trozo;
  return [
    [plural(primera), ...demas].join('_'),
    [...trozo.slice(0, -1), plural(trozo.at(-1))].join('_'),
    trozo.map(plural).join('_'),
    trozo.join('_'),
  ];
}

/**
 * `sesionCajaId` → `sesiones_caja`; `solicitaEmpleoId` → `empleos`; `mesaPrincipalId` →
 * `mesas`. Se prueban los trozos del nombre de más largo a más corto, por la cola y por la
 * cabeza. `null` si no hay.
 */
export function tablaDe(nombre) {
  const todas = palabras(nombre);
  const trozos = [];
  for (let largo = todas.length; largo > 0; largo -= 1) {
    trozos.push(todas.slice(todas.length - largo), todas.slice(0, largo));
  }
  for (const trozo of trozos) {
    const hallada = candidatas(trozo).find(existe);
    if (hallada !== undefined) return hallada;
    const alias = ALIAS[trozo.join('_')];
    if (alias !== undefined && existe(alias)) return alias;
  }
  return null;
}

const TEXTO = 'prueba de aislamiento';

function texto(esquema) {
  if (Array.isArray(esquema.enum)) return esquema.enum[0];
  if (esquema.format === 'date') return '⟨hoy⟩';
  if (esquema.format === 'date-time') return '⟨ahora⟩';
  if (esquema.format === 'email') return 'aislamiento@ejemplo.mx';
  const minimo = esquema.minLength ?? 0;
  const maximo = esquema.maxLength ?? TEXTO.length;
  return TEXTO.padEnd(minimo, 'x').slice(0, Math.max(minimo, Math.min(maximo, TEXTO.length)));
}

function numero(esquema) {
  if (esquema.minimum !== undefined) return esquema.minimum;
  if (esquema.exclusiveMinimum !== undefined) return esquema.exclusiveMinimum + 1;
  return esquema.maximum !== undefined && esquema.maximum < 1 ? esquema.maximum : 1;
}

/** Un valor que pase el esquema, con los ids marcados por su tabla. */
function muestra(esquema, nombre, ids, camino) {
  if (esquema === undefined || esquema === true) return null;
  const variante = esquema.anyOf ?? esquema.oneOf;
  if (Array.isArray(variante)) {
    const util = variante.find((v) => v.type !== 'null') ?? variante[0];
    return muestra(util, nombre, ids, camino);
  }
  if (Array.isArray(esquema.allOf)) return muestra(esquema.allOf[0], nombre, ids, camino);
  if (esquema.const !== undefined) return esquema.const;
  if (esquema.type === 'string' && esquema.format === 'uuid') {
    const tabla = tablaDe(nombre);
    ids.push({ camino, tabla });
    return `⟨${tabla ?? '?'}⟩`;
  }
  if (esquema.type === 'string') return texto(esquema);
  if (esquema.type === 'integer' || esquema.type === 'number') return numero(esquema);
  if (esquema.type === 'boolean') return false;
  if (esquema.type === 'null') return null;
  if (esquema.type === 'array') {
    const cuantos = esquema.minItems ?? 0;
    return Array.from({ length: cuantos }, (_, i) =>
      muestra(esquema.items, nombre, ids, `${camino}[${String(i)}]`),
    );
  }
  if (esquema.type === 'object') return objeto(esquema, ids, camino);
  return null;
}

/** Lo requerido, y además todo campo que sea un id: es lo que se viene a probar. */
function objeto(esquema, ids, camino) {
  const requeridos = new Set(esquema.required ?? []);
  const salida = {};
  for (const [nombre, propiedad] of Object.entries(esquema.properties ?? {})) {
    const esId = JSON.stringify(propiedad).includes('"format":"uuid"');
    if (!requeridos.has(nombre) && !esId) continue;
    const donde = camino === '' ? nombre : `${camino}.${nombre}`;
    salida[nombre] = muestra(propiedad, nombre, ids, donde);
  }
  return salida;
}

function esquemaDe(comando) {
  try {
    return z.toJSONSchema(comando.entrada, { unrepresentable: 'any', io: 'input' });
  } catch {
    return null;
  }
}

async function generar() {
  const { incluidas } = await rutasDeComando();
  const rutas = [];
  for (const { ruta, comando } of incluidas) {
    const esquema = esquemaDe(comando);
    if (esquema === null || esquema.type !== 'object') continue;
    const ids = [];
    const cuerpo = objeto(esquema, ids, '');
    if (ids.length === 0) continue;
    const requeridos = new Set(esquema.required ?? []);
    rutas.push({
      ruta,
      comando: comando.nombre,
      escribe: comando.escribe === true,
      roles: [...comando.roles].sort(),
      paquetes: [...comando.paquetes].sort(),
      // Un comando que escribe y cuyos ids son todos opcionales podría ESCRIBIR con el id
      // al azar: la prueba no lo manda, y lo cuenta.
      idRequerido: ids.some((i) => requeridos.has(i.camino.split(/[.[]/)[0])),
      cuerpo,
      ids,
    });
  }
  const entidades = [...ENTIDAD_DE_TABLA].map(([tabla, entidad]) => ({ entidad, tabla }));
  // `empleos` no es del puente: la prueba saca esos ids de la lista de la entrada.
  return { entidades, rutas };
}

const datos = await generar();
const salida = await prettier.format(JSON.stringify(datos), {
  ...((await prettier.resolveConfig(SALIDA)) ?? {}),
  filepath: SALIDA,
});

const sinTabla = datos.rutas.flatMap((r) => r.ids.filter((i) => i.tabla === null));
const resumen =
  `${String(datos.rutas.length)} rutas con id, ${String(datos.entidades.length)} tablas del ` +
  `puente, ${String(sinTabla.length)} campos de id sin tabla`;

if (process.argv.includes('--verificar')) {
  let actual = '';
  try {
    actual = readFileSync(SALIDA, 'utf8');
  } catch {
    // Sin archivo: no está al día.
  }
  if (actual !== salida) {
    console.error(
      `✗ ${SALIDA} no está al día con los comandos. Regénéralo:\n` +
        '  node --conditions=react-server scripts/generar-rutas-de-aislamiento.mjs',
    );
    process.exit(1);
  }
  console.log(`✓ Las rutas del aislamiento están al día: ${resumen}.`);
} else {
  writeFileSync(SALIDA, salida);
  console.log(`✓ ${SALIDA}: ${resumen}.`);
  if (process.argv.includes('--sin-tabla')) {
    for (const { camino } of sinTabla) console.log(`  ? ${camino}`);
  }
}
process.exit(0);
