import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * EL CONTRATO QUE CAZA LOS `check (col in (…))` QUE EL CÓDIGO YA NO RESPETA.
 *
 * ── El defecto que ya ocurrió, dos veces, en la misma fase ─────────────────
 * La Fase 2 escribe migraciones y **no las aplica**, y la base falsa de las
 * pruebas **no modela `check`**. Esa combinación tiene un punto ciego exacto: un
 * comando escribe `referencia_tipo: 'pasivo'`, el `check` de la 003 sólo admite
 * `('orden','gasto','manual')`, y **1 837 pruebas pasan en verde** sobre un
 * código que revienta con 23514 contra el primer Postgres real.
 *
 * Pasó con dos columnas a la vez y se descubrió de casualidad, al escribir una
 * función que no tenía nada que ver:
 *
 *   1 · `movimientos_caja.referencia_tipo` — F-254, F-255 y F-256 escriben
 *       `'pasivo'`; el `check` de la 003 no lo admitía.
 *   2 · `movimientos_stock.tipo` — el consumo interno escribe
 *       `'salida_consumo_interno'` y la devolución `'devolucion_proveedor'`;
 *       tampoco estaban.
 *
 * La 097 los arregló. Este contrato existe para que el TERCERO no dependa de
 * que alguien lo tropiece: lee los `check` de las migraciones, lee los literales
 * que el código escribe, y los compara.
 *
 * ── Por qué vale más que las dos migraciones que arregló ───────────────────
 * Porque el defecto no es de esas dos columnas: es de la forma de trabajar. Cada
 * modelo nuevo añade valores a columnas que ya tenían `check`, y mientras las
 * migraciones no se apliquen NINGUNA otra puerta puede verlo — ni el typecheck,
 * que ve `string`; ni las pruebas, que corren contra una base sin `check`; ni el
 * lint, que no sabe SQL.
 *
 * ── Lo que NO ve, dicho antes de que parezca que sí ────────────────────────
 * Sólo compara LITERALES. `tipo: entrada.tipo` se le escapa, y eso incluye todo
 * lo que llega validado por un `z.enum(...)` — que es la mayoría de lo que un
 * comando escribe. Vigila lo que el código decide POR SÍ MISMO, que es
 * exactamente donde estuvieron los dos defectos. Es un cerco, no una
 * demostración.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIGRACIONES = join(AQUI, '../migraciones/sql');
const RAICES_DE_CODIGO = [AQUI, join(AQUI, '../../../app/src')];

function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
}

function sinComentariosTs(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

interface ListaCerrada {
  readonly tabla: string;
  readonly columna: string;
  readonly restriccion: string;
  readonly valores: ReadonlySet<string>;
}

/** Un `check (...)` con su tabla y su nombre, tal como lo declara una migración. */
interface RestriccionLeida {
  readonly tabla: string;
  readonly nombre: string;
  readonly cuerpo: string;
}

/**
 * El cuerpo de un `check(` empezando en `desde`, contando paréntesis.
 *
 * Cortar en el primer `)` es el error que costó cuatro intentos en el otro
 * contrato de este proyecto: un `case … in (…) …` trae los suyos y el recorte se
 * queda a medias, con una lista que parece cerrada y es un trozo de otra cosa.
 */
function cuerpoDelCheck(sql: string, desde: number): { cuerpo: string; fin: number } | null {
  const abre = sql.indexOf('(', desde);
  if (abre === -1) return null;
  let profundidad = 0;
  for (let i = abre; i < sql.length; i += 1) {
    const c = sql[i];
    if (c === '(') profundidad += 1;
    else if (c === ')') {
      profundidad -= 1;
      if (profundidad === 0) return { cuerpo: sql.slice(abre + 1, i), fin: i };
    }
  }
  return null;
}

/** Los tipos de columna que usa el esquema. Sirven para reconocer una definición. */
const TIPOS =
  'text|uuid|bigint|integer|int|boolean|numeric|timestamptz|timestamp|jsonb|json|date|smallint|tstzrange|bytea';

/**
 * El nombre de la restricción: el declarado, o el que Postgres pone solo.
 *
 * ── Por qué no vale mirar la línea anterior ────────────────────────────────
 * Porque la 003 parte sus definiciones en dos renglones:
 *
 *     tipo            text        not null
 *                                 check (tipo in ('apertura', …))
 *
 * y la línea de antes del `check` está VACÍA. La primera versión de esto
 * devolvía `null` ahí y se saltaba en silencio las dos columnas que provocaron
 * el defecto que este contrato viene a cazar. Se busca hacia atrás la última
 * DEFINICIÓN DE COLUMNA, que es lo que Postgres usa para nombrar el check.
 */
function nombreDelCheck(antes: string, tabla: string): string | null {
  const conNombre = /constraint\s+"?(\w+)"?\s*$/i.exec(antes.trimEnd());
  if (conNombre !== null) return conNombre[1] ?? null;

  // Las barras van DOBLES y la expresion se arma con concatenacion, NO con una
  // plantilla: dentro de un backtick, `\s` a secas se convierte en una `s`
  // suelta antes de llegar a `RegExp`. Ya pasó en este mismo archivo, y el
  // contrato leyó CERO restricciones sin quejarse de nada.
  const patron = new RegExp('(?:^|,)\\s*"?(\\w+)"?\\s+(?:' + TIPOS + ')\\b', 'gim');
  const definiciones = [...antes.matchAll(patron)];
  const ultima = definiciones[definiciones.length - 1];
  if (ultima === undefined) return null;
  return `${tabla}_${ultima[1] ?? ''}_check`;
}

/** Todos los `check` de un archivo de migración, con su tabla y su nombre. */
function restriccionesDe(sql: string): RestriccionLeida[] {
  const leidas: RestriccionLeida[] = [];

  const porCreate = /create\s+table\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?\s*\(/gi;
  for (const m of sql.matchAll(porCreate)) {
    const tabla = m[1];
    if (tabla === undefined) continue;
    const cuerpoTabla = cuerpoDelCheck(sql, m.index + m[0].length - 1);
    if (cuerpoTabla === null) continue;
    leidas.push(...checksDentroDe(cuerpoTabla.cuerpo, tabla));
  }

  const porAlter = /alter\s+table\s+(?:only\s+)?"?(\w+)"?([\s\S]*)$/gi;
  for (const m of sql.matchAll(porAlter)) {
    const tabla = m[1];
    if (tabla === undefined) continue;
    leidas.push(...checksDentroDe(m[2] ?? '', tabla));
  }

  return leidas;
}

function checksDentroDe(texto: string, tabla: string): RestriccionLeida[] {
  const leidas: RestriccionLeida[] = [];
  const marca = /\bcheck\s*\(/gi;
  let m;
  while ((m = marca.exec(texto)) !== null) {
    const recorte = cuerpoDelCheck(texto, m.index + m[0].length - 1);
    if (recorte === null) continue;
    const nombre = nombreDelCheck(texto.slice(0, m.index), tabla);
    if (nombre !== null) leidas.push({ tabla, nombre, cuerpo: recorte.cuerpo });
    marca.lastIndex = recorte.fin;
  }
  return leidas;
}

/**
 * `col in ('a', 'b')` → los valores. `null` si el `check` es CUALQUIER otra cosa.
 *
 * La exigencia de que el cuerpo ENTERO tenga esa forma no es tiquismiquis: el
 * `movimiento_signo_coherente` de la 003 es un `case when tipo in (…) then …`,
 * y leerle el primer `in` daría cuatro valores de los diez que la columna
 * admite. El contrato señalaría entonces como defecto un código correcto, que
 * es la versión más cara de un contrato que miente.
 */
function listaCerradaDe(cuerpo: string): { columna: string; valores: Set<string> } | null {
  const m = /^\s*"?(\w+)"?\s+in\s*\(([\s\S]*)\)\s*$/i.exec(cuerpo.trim());
  if (m === null) return null;
  const columna = m[1];
  if (columna === undefined) return null;
  const lista = m[2] ?? '';
  // Sólo literales separados por comas. Un `select` dentro descalifica.
  if (!/^[\s'",\wÀ-ɏ_-]*$/.test(lista)) return null;
  const valores = new Set<string>();
  for (const v of lista.matchAll(/'([^']*)'/g)) valores.add(v[1] ?? '');
  return valores.size === 0 ? null : { columna, valores };
}

/**
 * Las listas cerradas VIGENTES, leyendo las migraciones en orden de número.
 *
 * El orden importa: la 097 tira el `check` de la 003 y pone otro más ancho con
 * el mismo nombre. Leerlas sin orden dejaría vigente la lista vieja, y este
 * contrato señalaría como defecto justo lo que la 097 vino a arreglar.
 */
/**
 * Restricciones que SÍ pueden estrechar, con su razón.
 *
 * Son las dos veces que `organizaciones.paquete` cambió de significado, no de
 * contenido: en la 054 dejó de guardar el giro —lo dice su propio comentario— y
 * en la 058 los tres nombres comerciales pasaron a ser nombres de modelo de
 * negocio (D-01). Retirar los valores viejos es el objetivo de esas dos
 * migraciones, no un descuido.
 */
const PUEDEN_ESTRECHAR: Readonly<Record<string, string>> = {
  'organizaciones.organizaciones_paquete_check':
    'La 054 le quitó los valores de GIRO —hasta entonces esta columna guardaba el giro— y la ' +
    '058 retiró los tres nombres comerciales al renombrarlos a modelos de negocio (D-01). ' +
    'Las dos estrechan a propósito: es lo que vienen a hacer.',
};

/** Todo lo que cada restricción ha admitido alguna vez, para cazar recortes. */
const HISTORIA = new Map<string, Set<string>>();

function listasVigentes(): ListaCerrada[] {
  const vigentes = new Map<string, ListaCerrada>();

  for (const archivo of readdirSync(MIGRACIONES)
    .filter((e) => e.endsWith('.sql'))
    .sort()) {
    // Los bloques `do $$ … $$;` llevan SQL dentro de una cadena: leerlos como
    // DDL daría restricciones que no existen. Se quitan antes de nada.
    const sql = sinComentarios(readFileSync(join(MIGRACIONES, archivo), 'utf8')).replace(
      /do\s*\$\$[\s\S]*?\$\$\s*;/gi,
      '',
    );

    // SENTENCIA A SENTENCIA, y en orden. La 097 tira el `check` de la 003 y
    // añade otro más ancho CON EL MISMO NOMBRE, las dos cosas en el mismo
    // archivo. Procesar todos los `add` y después todos los `drop` borraría
    // justo lo que la 097 vino a poner — y el contrato señalaría como defecto
    // el código que esa migración arregló.
    for (const sentencia of sql.split(';')) {
      const drop =
        /alter\s+table\s+(?:only\s+)?"?(\w+)"?\s+drop\s+constraint\s+(?:if\s+exists\s+)?"?(\w+)"?/i.exec(
          sentencia,
        );
      if (drop !== null) {
        vigentes.delete(`${drop[1] ?? ''}.${drop[2] ?? ''}`);
        continue;
      }

      for (const restriccion of restriccionesDe(sentencia)) {
        const lista = listaCerradaDe(restriccion.cuerpo);
        if (lista === null) continue;
        const clave = `${restriccion.tabla}.${restriccion.nombre}`;

        // Todo lo que esta restricción ha admitido ALGUNA VEZ. Un `check` no se
        // puede «ampliar»: hay que tirarlo y volverlo a escribir entero, así que
        // cada modelo escribe la lista que él conoce y puede llevarse por
        // delante lo que añadió otro. La comparación va al final, contra la
        // lista vigente: un recorte que una migración posterior repara no es un
        // defecto, y señalarlo mandaría a arreglar algo que ya está arreglado.
        HISTORIA.set(clave, new Set([...(HISTORIA.get(clave) ?? []), ...lista.valores]));

        vigentes.set(clave, {
          tabla: restriccion.tabla,
          columna: lista.columna,
          restriccion: restriccion.nombre,
          valores: lista.valores,
        });
      }
    }
  }

  return [...vigentes.values()];
}

/** Los objetos de escritura que pertenecen a UNA tabla. Mismo cerco que el otro contrato. */
function objetosDeEscrituraDe(codigo: string, tabla: string): string[] {
  const aperturas = [`updateTable('${tabla}')`, `insertInto('${tabla}')`];
  const cualquierApertura = /\.(?:updateTable|insertInto)\('(\w+)'\)/g;

  const bloques: string[] = [];
  for (const apertura of aperturas) {
    let desde = 0;
    for (;;) {
      const inicio = codigo.indexOf(apertura, desde);
      if (inicio === -1) break;
      cualquierApertura.lastIndex = inicio + apertura.length;
      const siguiente = cualquierApertura.exec(codigo);
      const fin = siguiente === null ? codigo.length : siguiente.index;
      bloques.push(...recortar(codigo.slice(inicio, fin), '.set({'));
      bloques.push(...recortar(codigo.slice(inicio, fin), '.values({'));
      desde = inicio + apertura.length;
    }
  }
  return bloques;
}

function recortar(codigo: string, marca: string): string[] {
  const bloques: string[] = [];
  let desde = 0;
  for (;;) {
    const inicio = codigo.indexOf(marca, desde);
    if (inicio === -1) break;
    let profundidad = 0;
    let fin = inicio + marca.length - 1;
    for (let i = inicio + marca.length - 1; i < codigo.length; i += 1) {
      const c = codigo[i];
      if (c === '{') profundidad += 1;
      else if (c === '}') {
        profundidad -= 1;
        if (profundidad === 0) {
          fin = i;
          break;
        }
      }
    }
    bloques.push(codigo.slice(inicio, fin + 1));
    desde = fin + 1;
  }
  return bloques;
}

function archivosTs(raiz: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(raiz)) {
    const ruta = join(raiz, entrada);
    if (statSync(ruta).isDirectory()) {
      if (entrada === 'pruebas' || entrada === 'node_modules') continue;
      salida.push(...archivosTs(ruta));
    } else if (entrada.endsWith('.ts') && !entrada.includes('.test.')) {
      salida.push(ruta);
    }
  }
  return salida;
}

interface Escritura {
  readonly archivo: string;
  readonly tabla: string;
  readonly columna: string;
  readonly valor: string;
}

/** Los literales que el código escribe en una columna con lista cerrada. */
function escriturasLiterales(listas: readonly ListaCerrada[]): Escritura[] {
  const encontradas: Escritura[] = [];
  const porTabla = new Map<string, ListaCerrada[]>();
  for (const lista of listas) {
    const previas = porTabla.get(lista.tabla) ?? [];
    previas.push(lista);
    porTabla.set(lista.tabla, previas);
  }

  for (const raiz of RAICES_DE_CODIGO) {
    for (const archivo of archivosTs(raiz)) {
      const codigo = sinComentariosTs(readFileSync(archivo, 'utf8'));
      for (const [tabla, suyas] of porTabla) {
        if (!codigo.includes(`('${tabla}')`)) continue;
        for (const objeto of objetosDeEscrituraDe(codigo, tabla)) {
          for (const lista of suyas) {
            // `columna: 'literal'`, con la columna al principio de su renglón
            // para no confundirla con una propiedad de un objeto anidado.
            const patron = new RegExp(`\\b${lista.columna}\\s*:\\s*'([^']*)'`, 'g');
            for (const m of objeto.matchAll(patron)) {
              encontradas.push({
                archivo: archivo.slice(archivo.indexOf('packages')),
                tabla,
                columna: lista.columna,
                valor: m[1] ?? '',
              });
            }
          }
        }
      }
    }
  }
  return encontradas;
}

const LISTAS = listasVigentes();
const ESCRITURAS = escriturasLiterales(LISTAS);

describe('todo literal que el código escribe cabe en el `check` de su columna', () => {
  it('las migraciones declaran listas cerradas que este contrato puede leer', () => {
    // Sin esto, el contrato pasaría vacío el día que el patrón deje de encajar y
    // afirmaría en su nombre algo que ya no mira. Es la misma salvaguarda que
    // lleva `estados-con-columna`, y por la misma razón.
    expect(LISTAS.length).toBeGreaterThanOrEqual(20);

    const claves = LISTAS.map((l) => `${l.tabla}.${l.columna}`);
    // Las DOS que reventaron. Si desaparecen del esquema, que sea una decisión.
    expect(claves).toContain('movimientos_caja.referencia_tipo');
    expect(claves).toContain('movimientos_stock.tipo');
  });

  it('la 097 dejó vigente la lista ANCHA, no la de la 003', () => {
    // Si el orden de lectura se rompiera, quedaría vigente la lista vieja y este
    // contrato señalaría como defecto justo lo que la 097 vino a arreglar.
    const caja = LISTAS.find(
      (l) => l.tabla === 'movimientos_caja' && l.columna === 'referencia_tipo',
    );
    expect([...(caja?.valores ?? [])].sort()).toContain('pasivo');

    const stock = LISTAS.find((l) => l.tabla === 'movimientos_stock' && l.columna === 'tipo');
    expect([...(stock?.valores ?? [])]).toContain('salida_consumo_interno');
    expect([...(stock?.valores ?? [])]).toContain('devolucion_proveedor');
  });

  it('encuentra escrituras literales que comparar: si no, no está vigilando nada', () => {
    expect(ESCRITURAS.length).toBeGreaterThanOrEqual(10);
  });

  it('la lista vigente no perdió por el camino nada que alguna migración admitiera', () => {
    // EL DEFECTO DE MÉTODO, no el de una columna. Así se rompió la merma de
    // barra de la cafetería: la 085 añadió `merma_barra`, la 097 de abarrotes
    // reescribió la lista entera sin él, y `registrarMermaDeBarra` —construida y
    // probada— quedó reventando con 23514 contra cualquier base real. Ninguna
    // prueba lo veía, porque la base falsa no lleva `check`.
    const perdidos = [...HISTORIA.entries()]
      .filter(([clave]) => !(clave in PUEDEN_ESTRECHAR))
      .flatMap(([clave, alguna]) => {
        const vigente = LISTAS.find((l) => `${l.tabla}.${l.restriccion}` === clave);
        if (vigente === undefined) return [];
        const fuera = [...alguna].filter((v) => !vigente.valores.has(v));
        return fuera.length === 0
          ? []
          : [`${clave} admitía ${fuera.join(', ')} y la lista vigente ya no`];
      });

    expect(perdidos).toEqual([]);
  });

  it('ningún literal cae fuera de su lista', () => {
    const fuera = ESCRITURAS.filter((e) => {
      const lista = LISTAS.find((l) => l.tabla === e.tabla && l.columna === e.columna);
      return lista !== undefined && !lista.valores.has(e.valor);
    }).map(
      (e) =>
        `${e.archivo} escribe ${e.tabla}.${e.columna} = '${e.valor}', que el check no admite. ` +
        `Admitidos: ${[...(LISTAS.find((l) => l.tabla === e.tabla && l.columna === e.columna)?.valores ?? [])].join(', ')}`,
    );

    // Contra Postgres esto es un 23514 en la primera venta. Contra la base falsa
    // de las pruebas, es verde — y por eso hace falta este contrato.
    expect([...new Set(fuera)]).toEqual([]);
  });
});
