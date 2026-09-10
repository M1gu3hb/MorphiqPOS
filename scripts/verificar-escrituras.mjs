#!/usr/bin/env node
/**
 * LA PUERTA QUE CAZA LAS PANTALLAS QUE FALLAN AL PULSAR EL BOTÓN.
 *
 *   node scripts/verificar-escrituras.mjs
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * Cada `api.entidades.X.create/update` de `apps/web/heredado/` acaba en
 * `/api/datos/escribir`, y el puente RECHAZA —lanzando, no ignorando— dos
 * cosas distintas:
 *
 *   · la ENTIDAD entera, si su `escritura` es `'comando'` o `'lectura'`;
 *   · el CAMPO suelto, si no está en `campos`, si es `escribible: false`, o si
 *     es un DERIVADO que sale de un `left join` al leer.
 *
 * Yo busqué a mano las doce entidades transaccionales y los campos de `Mesa` e
 * `Ingrediente`, di por buena la lista y escribí «cero escrituras bloqueadas»
 * en el informe de entrega. Era falso: quedaban cinco, en cuatro archivos que
 * mi `grep` no miraba, y cada una deja una pantalla inservible —crear un
 * producto, guardar sus modificadores, crear una estación de preparación,
 * editar una categoría—. Un `grep` que se escribe una vez comprueba lo que su
 * autor se acordó de poner; esto comprueba TODO.
 *
 * ── Lo que NO puede ver, y hay que decirlo ─────────────────────────────────
 * Sólo lee objetos LITERALES en la llamada. Un `update(id, payload)` donde
 * `payload` es una variable no se puede resolver sin ejecutar el programa: esas
 * salen listadas aparte como NO ANALIZADAS, con su archivo y su línea, para que
 * nadie confunda «no lo sé» con «está bien». Es un cerco, no una demostración.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAPA = 'packages/app/src/puente/mapa.ts';
const CARPETA = 'apps/web/heredado';
const OPERACIONES = ['create', 'update', 'delete'];

// ────────────────────────────────────────────────── el mapa del puente, leído

/** Recorta un bloque `{ … }` contando llaves desde la primera. */
function bloque(texto, desde) {
  let profundidad = 0;
  for (let i = desde; i < texto.length; i += 1) {
    if (texto[i] === '{') profundidad += 1;
    else if (texto[i] === '}') {
      profundidad -= 1;
      if (profundidad === 0) return texto.slice(desde, i + 1);
    }
  }
  return texto.slice(desde);
}

function leerMapa() {
  const fuente = readFileSync(MAPA, 'utf8');
  const entidades = new Map();

  for (const m of fuente.matchAll(/^ {2}([A-Z][A-Za-z]*): \{/gm)) {
    const nombre = m[1];
    const cuerpo = bloque(fuente, m.index + m[0].length - 1);

    const escritura = /escritura: '(\w+)'/.exec(cuerpo)?.[1] ?? 'directa';

    // `campos: { … }` y `derivados: { … }` son bloques hermanos.
    const campos = new Map();
    const iCampos = cuerpo.indexOf('campos: {');
    if (iCampos !== -1) {
      const dentro = bloque(cuerpo, iCampos + 'campos: '.length);
      for (const c of dentro.matchAll(/^ {6}([a-z_0-9]+): \{([^}]*)\}/gm)) {
        campos.set(c[1], !/escribible: false/.test(c[2] ?? ''));
      }
      // `nombre: 'columna'` sin objeto: escribible.
      for (const c of dentro.matchAll(/^ {6}([a-z_0-9]+): '[^']*',$/gm)) {
        if (!campos.has(c[1])) campos.set(c[1], true);
      }
    }

    const derivados = new Set();
    const iDeriv = cuerpo.indexOf('derivados: {');
    if (iDeriv !== -1) {
      const dentro = bloque(cuerpo, iDeriv + 'derivados: '.length);
      for (const d of dentro.matchAll(/^ {6}([a-z_0-9]+): \{/gm)) derivados.add(d[1]);
    }

    const calculados = new Set();
    const iCalc = cuerpo.indexOf('calculados: {');
    if (iCalc !== -1) {
      const dentro = bloque(cuerpo, iCalc + 'calculados: '.length);
      for (const d of dentro.matchAll(/^ {6}([a-z_0-9]+): \{/gm)) calculados.add(d[1]);
    }

    entidades.set(nombre, { escritura, campos, derivados, calculados });
  }
  return entidades;
}

/**
 * Las entidades que NO viven en `mapa.ts` y tienen su propio camino.
 *
 * `ConfiguracionNegocio` es un documento JSON, no una tabla con columnas, y
 * `comandos.ts:61` sólo admite `update`: crearla o borrarla lanza. `UsuarioPOS`
 * sale de cuatro tablas y `usuarios.ts` sólo tiene LECTURA —no hay ningún
 * camino de escritura para ella en todo el puente—.
 */
const FUERA_DEL_MAPA = {
  ConfiguracionNegocio: {
    permitidas: ['update'],
    motivo: 'es un documento JSON: sólo se actualiza, no se crea ni se borra',
    camposLibres: true,
  },
  UsuarioPOS: {
    permitidas: [],
    motivo: 'sale de cuatro tablas y el puente sólo la sabe LEER: no hay camino de escritura',
    camposLibres: true,
  },
};

/**
 * Los campos que el puente añade a TODA lectura y nunca acepta al escribir.
 *
 * `id` sí viaja, pero como argumento aparte —`update(id, datos)`—, no dentro
 * del objeto; si aparece en el cuerpo, el puente lo rechaza igual.
 */
const DE_SOLO_LECTURA = ['created_date', 'updated_date', 'created_at', 'updated_at', 'id'];

// ──────────────────────────────────────────── las llamadas de sus pantallas

function archivos(raiz) {
  const salida = [];
  const pila = [raiz];
  while (pila.length > 0) {
    const actual = pila.pop();
    for (const entrada of readdirSync(actual)) {
      if (entrada === 'node_modules') continue;
      const ruta = join(actual, entrada);
      if (statSync(ruta).isDirectory()) pila.push(ruta);
      else if (/\.(jsx?|tsx?)$/.test(entrada)) salida.push(ruta);
    }
  }
  return salida;
}

/**
 * Quita comentarios: una escritura citada en un comentario no falla nunca.
 *
 * `Caja.jsx:896` explica en prosa el `CorteCaja.create` que se retiró, y sin
 * esto la puerta lo contaba como código vivo — un falso positivo hace que una
 * puerta se deje de mirar igual de rápido que un falso negativo.
 */
function sinComentarios(texto) {
  const SALTO = String.fromCharCode(10);
  return texto
    // Se reemplaza por espacios, no se borra: así los números de línea que
    // luego se cuentan siguen siendo los del archivo de verdad.
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.split(SALTO).map((l) => ' '.repeat(l.length)).join(SALTO))
    .replace(/^(\s*)\/\/.*$/gm, (m, sangria) => sangria + ' '.repeat(m.length - sangria.length));
}

/** Recorta los argumentos de una llamada, contando paréntesis. */
function argumentos(texto, desde) {
  let profundidad = 0;
  for (let i = desde; i < texto.length; i += 1) {
    if (texto[i] === '(') profundidad += 1;
    else if (texto[i] === ')') {
      profundidad -= 1;
      if (profundidad === 0) return texto.slice(desde + 1, i);
    }
  }
  return '';
}

/**
 * Las claves de primer nivel de un objeto literal.
 *
 * Devuelve `null` cuando no hay literal que leer —una variable, un spread de
 * algo que no se ve aquí—, que es distinto de «no tiene campos».
 */
function clavesDelLiteral(texto) {
  const abre = texto.indexOf('{');
  if (abre === -1) return null;
  const cuerpo = bloque(texto, abre);
  // Un `...spread` de una variable esconde campos que no se pueden ver.
  const opaco = /\.\.\.[A-Za-z_$]/.test(cuerpo);

  const claves = [];
  let profundidad = 0;
  let inicioDeLinea = true;
  for (let i = 0; i < cuerpo.length; i += 1) {
    const c = cuerpo[i];
    if (c === '{' || c === '[' || c === '(') profundidad += 1;
    else if (c === '}' || c === ']' || c === ')') profundidad -= 1;
    else if (c === ',' && profundidad === 1) inicioDeLinea = true;
    if (profundidad !== 1) continue;
    if (!inicioDeLinea) continue;
    const resto = cuerpo.slice(i);
    const m = /^[\s{,]*(?:'([a-z_0-9]+)'|"([a-z_0-9]+)"|([a-z_$][A-Za-z_$0-9]*))\s*:/.exec(resto);
    if (m !== null) {
      claves.push(m[1] ?? m[2] ?? m[3]);
      inicioDeLinea = false;
    }
  }
  return { claves, opaco };
}

/** El literal de `const <nombre> = { … }` declarado antes de `hasta`. */
function resolverVariable(fuente, expresion, hasta) {
  if (!/^[A-Za-z_$][A-Za-z_$0-9]*$/.test(expresion)) return null;
  const patron = new RegExp(`(?:const|let|var)\\s+${expresion}\\s*=\\s*\\{`, 'g');
  let ultimo = null;
  for (const d of fuente.matchAll(patron)) {
    if (d.index < hasta) ultimo = d.index + d[0].length - 1;
  }
  return ultimo === null ? null : bloque(fuente, ultimo);
}

const ENTIDADES = leerMapa();
const rechazos = [];
const noAnalizadas = [];
let miradas = 0;

for (const ruta of archivos(CARPETA)) {
  const fuente = sinComentarios(readFileSync(ruta, 'utf8'));
  const patron = new RegExp(
    `api\\.entidades\\.([A-Z][A-Za-z]*)\\.(${OPERACIONES.join('|')})\\s*\\(`,
    'g',
  );
  for (const m of fuente.matchAll(patron)) {
    const [, entidad, operacion] = m;
    const linea = fuente.slice(0, m.index).split('\n').length;
    const mapa = ENTIDADES.get(entidad);
    miradas += 1;

    const especial = FUERA_DEL_MAPA[entidad];
    if (especial !== undefined) {
      if (!especial.permitidas.includes(operacion)) {
        rechazos.push({ ruta, linea, entidad, operacion, motivo: especial.motivo });
      }
      continue;
    }
    if (mapa === undefined) {
      rechazos.push({ ruta, linea, entidad, operacion, motivo: 'no existe en el mapa del puente' });
      continue;
    }
    if (mapa.escritura !== 'directa') {
      rechazos.push({
        ruta,
        linea,
        entidad,
        operacion,
        motivo: `la entidad es «${mapa.escritura}»: se escribe con su comando`,
      });
      continue;
    }
    if (operacion === 'delete') continue;

    const args = argumentos(fuente, m.index + m[0].length - 1);
    const crudo = operacion === 'update' ? args.slice(args.indexOf(',') + 1) : args;
    // Si el cuerpo es una variable, se busca su `const … = { … }` ANTES de la
    // llamada en el mismo archivo. Es lo que convierte «no lo sé» en una
    // respuesta para la mayoría: casi todas estas pantallas arman un `payload`
    // en la línea de arriba.
    const cuerpo = resolverVariable(fuente, crudo.trim(), m.index) ?? crudo;
    const leido = clavesDelLiteral(cuerpo);

    if (leido === null || leido.opaco) {
      noAnalizadas.push({ ruta, linea, entidad, operacion, cuerpo: cuerpo.trim().slice(0, 70) });
      if (leido === null) continue;
    }

    for (const clave of leido.claves) {
      const escribible = mapa.campos.get(clave);
      let motivo = null;
      if (mapa.derivados.has(clave)) motivo = 'es un DERIVADO: sale de un join al leer';
      else if (mapa.calculados.has(clave)) motivo = 'es CALCULADO por el servidor';
      else if (DE_SOLO_LECTURA.includes(clave)) motivo = 'lo pone la base, no el cliente';
      else if (escribible === undefined) motivo = 'no es un campo del puente';
      else if (escribible === false) motivo = 'está declarado «escribible: false»';
      if (motivo !== null) {
        rechazos.push({ ruta, linea, entidad, operacion, campo: clave, motivo });
      }
    }
  }
}

const salida = [];
salida.push(`Miradas ${miradas} escrituras de ${CARPETA} contra el mapa del puente.`);

if (noAnalizadas.length > 0) {
  salida.push(
    '',
    `NO ANALIZADAS (${noAnalizadas.length}): el cuerpo no es un objeto literal, así que`,
    'no se puede saber qué campos manda sin ejecutar el programa. No es un fallo;',
    'es el borde de esta puerta, y va dicho para que nadie lo confunda con «está bien».',
  );
  for (const n of noAnalizadas) {
    salida.push(`  ${n.ruta}:${n.linea} · ${n.entidad}.${n.operacion}(${n.cuerpo}…)`);
  }
}

if (rechazos.length === 0) {
  salida.push('', 'Ninguna escritura la rechaza el puente.');
  process.stdout.write(`${salida.join('\n')}\n`);
  process.exit(0);
}

salida.push(
  '',
  `EL PUENTE RECHAZA ${rechazos.length} ESCRITURAS. Cada una es una pantalla que`,
  'falla al pulsar el botón, o que falla en silencio si lleva un catch encima.',
  '',
);
for (const r of rechazos) {
  const campo = r.campo === undefined ? '' : ` · «${r.campo}»`;
  salida.push(`  ${r.ruta}:${r.linea}`);
  salida.push(`      ${r.entidad}.${r.operacion}${campo} — ${r.motivo}`);
}
process.stdout.write(`${salida.join('\n')}\n`);
process.exit(1);
