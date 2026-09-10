/**
 * Genera la referencia de comandos: nombre, rol, ruta HTTP y campos de entrada.
 * Se lee del CODIGO, no de una lista escrita a mano que se desincroniza.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = 'packages/app/src';
const RUTAS = 'apps/web/app/api';

function archivos(dir, filtro) {
  const salida = [];
  const pila = [dir];
  while (pila.length) {
    const actual = pila.pop();
    for (const e of readdirSync(actual)) {
      const ruta = join(actual, e);
      if (statSync(ruta).isDirectory()) pila.push(ruta);
      else if (filtro(e)) salida.push(ruta);
    }
  }
  return salida;
}

// 1. Rutas HTTP: qué comando expone cada una.
const porComando = new Map();
for (const ruta of archivos(RUTAS, (e) => e === 'route.ts')) {
  const t = readFileSync(ruta, 'utf8');
  const url = '/' + ruta.replace(/\\/g, '/').replace('apps/web/app/', '').replace('/route.ts', '');
  const m = t.match(/import\s*\{\s*([A-Za-z0-9_,\s]+)\s*\}\s*from\s*'@morphiqpos\/app\/[^']+'/);
  if (!m) continue;
  for (const nombre of m[1].split(',').map((s) => s.trim())) {
    if (nombre) porComando.set(nombre, url);
  }
}

/**
 * Los roles de un comando, resolviendo las constantes.
 *
 * `roles: [...]` es directo. `roles: SOLO_DUENO` y `roles: [...ROLES_DE_CAJA]`
 * exigen buscar la constante en el mismo archivo. Sin esto la tabla decía
 * «publico» donde pone «dueno», y un documento que miente sobre quién puede
 * borrar el negocio es peor que no tener documento.
 */
function leerRoles(desde, archivoCompleto) {
  const literal = /roles: \[([^\]]*)\]/.exec(desde)?.[1];
  const constante = /roles: ([A-Z_][A-Z0-9_]*)/.exec(desde)?.[1];

  const resolver = (texto) => {
    const nombres = [...texto.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    if (nombres.length > 0) return nombres.join(', ');
    const spread = /\.\.\.([A-Za-z_][A-Za-z0-9_]*)/.exec(texto)?.[1];
    if (spread === undefined) return null;
    const def = new RegExp(`const ${spread}\\s*=\\s*\\[([^\\]]*)\\]`).exec(archivoCompleto)?.[1];
    if (def === undefined) return `(${spread})`;
    return [...def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).join(', ');
  };

  if (literal !== undefined) return resolver(literal) ?? '(sin resolver)';
  if (constante !== undefined) {
    const def = new RegExp(`const ${constante}\\s*=\\s*\\[([^\\]]*)\\]`).exec(archivoCompleto)?.[1];
    if (def !== undefined) return [...def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).join(', ');
    return `(${constante})`;
  }
  return 'PUBLICO (sin sesion)';
}

// 2. Comandos: nombre de dominio, roles y esquema de entrada.
const comandos = [];
for (const f of archivos(RAIZ, (e) => e.endsWith('.ts') && !e.includes('.test.'))) {
  const t = readFileSync(f, 'utf8');
  const re = /export const (\w+) = definirComando(?:Publico)?</g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const desde = t.slice(m.index);
    const nombre = /nombre: '([^']+)'/.exec(desde)?.[1] ?? '?';
    const roles = leerRoles(desde, t);
    const entrada = /entrada: (\w+)/.exec(desde)?.[1] ?? '?';
    comandos.push({
      variable: m[1],
      nombre,
      roles,
      entrada,
      archivo: f.replace(/\\/g, '/'),
      url: porComando.get(m[1]) ?? '(sin ruta HTTP)',
    });
  }
}

// 3. Los esquemas de entrada, tal cual.
const esquemas = new Map();
for (const f of archivos(RAIZ, (e) => e.endsWith('.ts') && !e.includes('.test.'))) {
  const t = readFileSync(f, 'utf8');
  const re = /(?:export )?const (entrada\w+) = z\.object\(\{/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    let prof = 0;
    let fin = m.index;
    for (let i = m.index + m[0].length - 1; i < t.length; i++) {
      if (t[i] === '{') prof++;
      else if (t[i] === '}') {
        prof--;
        if (prof === 0) {
          fin = i;
          break;
        }
      }
    }
    const cuerpo = t.slice(m.index, fin + 1).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    esquemas.set(m[1], cuerpo.split('\n').filter((l) => l.trim()).join('\n'));
  }
}

let salida = '# F1-08 · Los comandos del sistema y cómo se llaman\n\n';
salida += 'Generado del CODIGO, no escrito a mano. Cada fila dice el comando, quien puede\n';
salida += 'ejecutarlo POR SESION, y la ruta HTTP que lo expone.\n\n';
salida += '| Comando | Roles | Ruta HTTP | Entrada |\n|---|---|---|---|\n';
for (const c of comandos.sort((a, b) => a.nombre.localeCompare(b.nombre))) {
  salida += `| \`${c.nombre}\` | ${c.roles || 'publico'} | \`${c.url}\` | \`${c.entrada}\` |\n`;
}

salida += '\n## Los esquemas de entrada, literales\n\n';
salida += 'NINGUNO acepta un importe, un total, un precio ni un rol: `definirComando` lo\n';
salida += 'rechaza al cargar el modulo. Lo que no este aqui, no se manda.\n\n';
for (const [nombre, cuerpo] of [...esquemas.entries()].sort()) {
  if (!comandos.some((c) => c.entrada === nombre)) continue;
  salida += `### \`${nombre}\`\n\n\`\`\`ts\n${cuerpo}\n\`\`\`\n\n`;
}

process.stdout.write(salida);
