import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { MAPA } from '@morphiqpos/app/puente';
import { describe, expect, it } from 'vitest';

/**
 * UNA PANTALLA NO PUEDE LEER UN CAMPO QUE EL PUENTE NO SIRVE.
 *
 * ── El defecto que este contrato impide ────────────────────────────────────
 * El puente OMITE la clave que no declara —y también la que el rol no puede ver—,
 * así que la pantalla no recibe `null`: recibe `undefined`. Y `undefined !== null`,
 * de modo que toda guarda escrita como `=== null` pasa de largo y la aritmética de
 * abajo produce `NaN`. Pasó en cuatro pantallas a la vez, en producción de la demo:
 *
 *   · `cafeteria/Productos` y `MenuPublicoYPedidoAnticipado` leían
 *     `precio_venta_centavos`; la entidad sirve `precio_venta` (y en PESOS). El
 *     catálogo entero de una cafetería enseñaba **`$NaN`** en cada renglón.
 *   · `abarrotes/Existencias` leía `piezas_por_caja`: «21 pieza (NaN cj + NaN)».
 *   · `cafeteria/Inventario` leía `consumo_diario`: «NaN días» en cada insumo.
 *
 * Las cuatro abrían en 200 y la suite las daba por probadas.
 *
 * ── Qué mira, y por qué así ────────────────────────────────────────────────
 * Cada `consultarPuente<Tipo>('Entidad')` de `apps/web/src`, con el `Tipo` leído en
 * SU MISMO ARCHIVO. De cada campo del tipo:
 *
 *   · Si es OBLIGATORIO, el mapa tiene que declararlo —en `campos`, `derivados`,
 *     `calculados` o `hijos`—. Un campo obligatorio que el puente no manda es una
 *     promesa que el tipo hace y la red no cumple.
 *   · Si es OPCIONAL (`campo?:`), puede no estar: el `?` es la declaración de que
 *     la pantalla ya sabe que puede faltar, y TypeScript la obliga a defenderse.
 *
 * El tipo que no se encuentra en el archivo NO se ignora en silencio: se cuenta, y
 * el contrato exige que la cuenta no crezca. Un contrato que se salta lo que no
 * entiende afirma en su nombre algo que no mira.
 *
 * ── Y POR DÓNDE FILTRA, ORDENA Y PIDE EL RANGO ─────────────────────────────
 * La otra mitad del mismo defecto, y ésta duele más: el campo por el que una
 * pantalla FILTRA no se recorta, se RECHAZA. `consultar` busca la clave del filtro,
 * del rango y del orden en `mapa.campos` —no en `derivados`, ni en `calculados`, ni
 * en `hijos`— y si no está lanza `PUENTE_CAMPO_INVALIDO`, que sale por la red como
 * un 400 y por la pantalla como una lista VACÍA.
 *
 * Una lista vacía es indistinguible de «ese día no pasó nada», y por eso este
 * defecto sobrevive a cualquier revisión a ojo. Los tres que había:
 *
 *   · `abarrotes/Registros` filtraba las tres fuentes del día por `{ fecha }`, que
 *     no es campo de ninguna de las tres: la línea de tiempo del día —lo único que
 *     esa pantalla existe para contar— salía vacía SIEMPRE.
 *   · `abarrotes/Cortes` ordenaba por `'fecha_cierre:desc'`, la sintaxis de la
 *     plataforma anterior: el histórico de cortes, vacío.
 *   · La agenda del salón filtraba `Cita` por `fecha` y enseñaba «Hoy no hay citas
 *     todavía» con las citas agendadas.
 *
 * Se leen los literales: el objeto de opciones y el del filtro se resuelven también
 * cuando son una `const` del mismo archivo, que es como estaban escritos los dos
 * primeros. Del `rango` se comprueba CADA cadena literal que aparezca en la
 * expresión —`delDia('created_date')` lleva la suya dentro— y lo que no tenga
 * ninguna se cuenta como no leído en vez de darse por bueno.
 */

const RAIZ = process.cwd().endsWith('web')
  ? join(process.cwd(), 'src')
  : join(process.cwd(), 'apps', 'web', 'src');

/**
 * Los tipos que viven en otro archivo y este contrato no resuelve.
 *
 * Cada uno con su razón. La lista sólo puede encogerse: mover el tipo al archivo
 * que lo consulta, o declarar sus campos opcionales, es lo que la saca de aquí.
 */
const TIPOS_QUE_VIVEN_FUERA: Readonly<Record<string, string>> = {
  // Vive en `cafeteria/opciones-de-bebida.ts` junto a las funciones puras que la
  // agrupan, porque ahí se prueban sin navegador.
  OpcionDeBebida: 'vive en cafeteria/opciones-de-bebida.ts, con sus funciones puras',
  // `Fila` es la fila CRUDA del puente —un índice abierto— y no promete ningún
  // campo: no hay nada que comprobar contra el mapa. Lo usa el historial de la
  // clienta, que arma su vista de cuatro entidades distintas.
  Fila: 'es la fila cruda del puente, sin campos declarados que comprobar',
  // Vive en `ferreteria/mostrador-datos.ts`, con las funciones que ordenan el
  // resultado de la búsqueda del mostrador.
  MaterialDeMostrador: 'vive en ferreteria/mostrador-datos.ts, con sus funciones puras',
};

interface Lectura {
  readonly archivo: string;
  readonly entidad: string;
  readonly tipo: string;
}

function archivosDePantalla(): readonly string[] {
  const encontrados: string[] = [];
  const recorrer = (carpeta: string): void => {
    for (const entrada of readdirSync(carpeta)) {
      const completa = join(carpeta, entrada);
      if (statSync(completa).isDirectory()) {
        recorrer(completa);
        continue;
      }
      if (/\.tsx?$/.test(entrada) && !entrada.includes('.test.')) encontrados.push(completa);
    }
  };
  recorrer(RAIZ);
  return encontrados;
}

/** Los campos de una interfaz declarada en ese mismo archivo. */
function camposDelTipo(
  fuente: string,
  tipo: string,
): readonly { nombre: string; opcional: boolean }[] | null {
  // `interface X {` y también `type X = Algo & { … }`: las dos formas aparecen, y
  // la segunda es la que usa la ficha de pieza para envolver los hijos del puente.
  const inicio =
    new RegExp(`(?:export )?interface ${tipo}\\b[^{]*\\{`).exec(fuente) ??
    new RegExp(`(?:export )?type ${tipo}\\b[^=]*=[^{]*\\{`).exec(fuente);
  if (inicio === null) return null;
  const desde = inicio.index + inicio[0].length;
  let profundidad = 1;
  let fin = desde;
  while (fin < fuente.length && profundidad > 0) {
    if (fuente[fin] === '{') profundidad += 1;
    if (fuente[fin] === '}') profundidad -= 1;
    fin += 1;
  }
  const cuerpo = fuente
    .slice(desde, fin - 1)
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
    .replaceAll(/^\s*\/\/.*$/gm, ' ');

  const campos: { nombre: string; opcional: boolean }[] = [];
  // Sólo el primer nivel: un objeto anidado no es un campo del puente.
  let anidado = 0;
  for (const linea of cuerpo.split('\n')) {
    const abre = (linea.match(/\{/g) ?? []).length;
    const cierra = (linea.match(/\}/g) ?? []).length;
    if (anidado === 0) {
      const campo = /^\s*(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)(\??):/.exec(linea);
      if (campo !== null) campos.push({ nombre: campo[1] ?? '', opcional: campo[2] === '?' });
    }
    anidado += abre - cierra;
  }
  return campos;
}

/** Todo lo que el mapa declara para una entidad, con cualquier forma. */
function loQueElPuenteSirve(entidad: string): ReadonlySet<string> {
  const mapa = MAPA[entidad];
  if (mapa === undefined) return new Set();
  return new Set([
    ...Object.keys(mapa.campos),
    ...Object.keys(mapa.derivados ?? {}),
    ...Object.keys(mapa.calculados ?? {}),
    ...Object.keys(mapa.hijos ?? {}),
  ]);
}

function lecturas(): readonly Lectura[] {
  const encontradas: Lectura[] = [];
  for (const archivo of archivosDePantalla()) {
    const fuente = readFileSync(archivo, 'utf8');
    for (const m of fuente.matchAll(/consultarPuente<([A-Za-z0-9_]+)>\(\s*'([A-Za-z0-9_]+)'/g)) {
      encontradas.push({
        archivo: archivo.slice(RAIZ.length + 1).replaceAll('\\', '/'),
        tipo: m[1] ?? '',
        entidad: m[2] ?? '',
      });
    }
  }
  return encontradas;
}

/**
 * EL ARCHIVO SIN COMENTARIOS, que es sobre lo que hay que afirmar.
 *
 * Con los comentarios dentro, este contrato MINTIÓ, y se vio como se ve todo:
 * reintroduciendo a mano los cuatro defectos que acababa de encontrar. Dos salieron
 * y DOS NO, y los dos que no tenían un comentario nuevo justo encima explicando el
 * arreglo. El comentario lleva comas, `piezasDe` parte por comas, y la pieza donde
 * vivía `filtro:` empezaba con prosa: el `^\s*filtro:` no encajaba y la llamada se
 * daba por mirada sin haberla mirado.
 *
 * Es el error de recorte de `contratos-por-mutacion`, otra vez: afirmar sobre el
 * archivo entero en vez de sobre el código. Se quita la prosa primero, cuidando de
 * no tocar un `//` que viva dentro de una cadena.
 */
function sinComentarios(fuente: string): string {
  let salida = '';
  let i = 0;
  // La comilla que abrió la cadena en la que estamos, o vacío si estamos en código.
  let comilla = '';
  while (i < fuente.length) {
    const actual = fuente[i] ?? '';
    const siguiente = fuente[i + 1] ?? '';
    if (comilla !== '') {
      // Un escape se copia entero: `'\\''` no cierra la cadena.
      if (actual === '\\') {
        salida += actual + siguiente;
        i += 2;
        continue;
      }
      if (actual === comilla) comilla = '';
      salida += actual;
      i += 1;
      continue;
    }
    if (actual === "'" || actual === '"' || actual === '`') {
      comilla = actual;
      salida += actual;
      i += 1;
      continue;
    }
    if (actual === '/' && siguiente === '/') {
      // Hasta el salto de línea, que NO se consume: parte la pieza igual que antes.
      while (i < fuente.length && fuente[i] !== '\n') i += 1;
      continue;
    }
    if (actual === '/' && siguiente === '*') {
      i += 2;
      while (i < fuente.length && !(fuente[i] === '*' && fuente[i + 1] === '/')) {
        // Los saltos se conservan para que un fallo siga señalando su línea.
        if (fuente[i] === '\n') salida += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    salida += actual;
    i += 1;
  }
  return salida;
}

/** El texto de un objeto literal que empieza en la llave de `desde`. */
function bloqueDesde(fuente: string, desde: number): string {
  let profundidad = 0;
  let i = desde;
  while (i < fuente.length) {
    if (fuente[i] === '{') profundidad += 1;
    else if (fuente[i] === '}') {
      profundidad -= 1;
      if (profundidad === 0) return fuente.slice(desde, i + 1);
    }
    i += 1;
  }
  return fuente.slice(desde);
}

/**
 * TODOS los objetos literales de una expresión, no sólo el primero.
 *
 * Porque las opciones y el filtro se escriben a menudo como un ternario —«si no me
 * pasaron el id, sin filtro»— y las DOS ramas hay que mirarlas: la que filtra es la
 * que puede nombrar una columna que no existe.
 */
function objetosLiterales(texto: string): readonly string[] {
  const objetos: string[] = [];
  for (let i = 0; i < texto.length; i += 1) {
    if (texto[i] !== '{') continue;
    const bloque = bloqueDesde(texto, i);
    objetos.push(bloque);
    i += bloque.length - 1;
  }
  return objetos;
}

/** La expresión de una `const` del mismo archivo, hasta su `;` de primer nivel. */
function expresionDeConst(fuente: string, nombre: string): string | null {
  if (nombre === '') return null;
  const declaracion = new RegExp(`const ${nombre}\\s*(?::[^=]*)?=`).exec(fuente);
  if (declaracion === null) return null;
  const desde = declaracion.index + declaracion[0].length;
  let profundidad = 0;
  let i = desde;
  while (i < fuente.length) {
    const caracter = fuente[i] ?? '';
    if ('{[('.includes(caracter)) profundidad += 1;
    if ('}])'.includes(caracter)) profundidad -= 1;
    if (caracter === ';' && profundidad === 0) break;
    i += 1;
  }
  return fuente.slice(desde, i);
}

/** Las piezas del primer nivel de un objeto literal, sin partir lo anidado. */
function piezasDe(objeto: string): readonly string[] {
  const dentro = objeto.slice(1, -1);
  const piezas: string[] = [];
  let profundidad = 0;
  let pieza = '';
  for (const caracter of dentro) {
    if ('{[('.includes(caracter)) profundidad += 1;
    if ('}])'.includes(caracter)) profundidad -= 1;
    if (caracter === ',' && profundidad === 0) {
      piezas.push(pieza);
      pieza = '';
      continue;
    }
    pieza += caracter;
  }
  piezas.push(pieza);
  return piezas.filter((p) => p.trim() !== '');
}

/** Las claves del primer nivel, incluida la forma corta `{ filtro }`. */
function clavesDe(objeto: string): readonly string[] {
  return piezasDe(objeto).map((pieza) => {
    const clave = /^\s*(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?::|$)/.exec(pieza);
    return clave?.[1] ?? `?${pieza.trim().slice(0, 40)}`;
  });
}

/** El valor crudo de una propiedad del primer nivel: `filtro`, `orden`, `rango`. */
function valorDe(objeto: string, propiedad: string): string | null {
  for (const pieza of piezasDe(objeto)) {
    const corte = new RegExp(`^\\s*${propiedad}\\s*(:|$)`).exec(pieza);
    if (corte === null) continue;
    // La forma corta —`{ filtro, limite: 200 }`— vale como `filtro: filtro`.
    return corte[1] === ':' ? pieza.slice(corte[0].length).trim() : propiedad;
  }
  return null;
}

/**
 * Los objetos que una expresión puede ser: ella misma, o la `const` que nombra.
 *
 * Un identificador suelto se resuelve en el archivo; cualquier otra cosa —un
 * ternario, una llamada— se lee por sus literales. Lo que no tenga ninguno se
 * devuelve vacío, y quien llama lo cuenta como no leído.
 */
function objetosPosibles(fuente: string, expresion: string): readonly string[] {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(expresion)) {
    const declarada = expresionDeConst(fuente, expresion);
    return declarada === null ? [] : objetosLiterales(declarada);
  }
  return objetosLiterales(expresion);
}

interface UsoDeCampo {
  readonly archivo: string;
  readonly entidad: string;
  /** `filtro`, `orden` o `rango`: los tres caminos que exigen una COLUMNA. */
  readonly uso: string;
  readonly campo: string;
}

function porDondeBuscan(): { usos: readonly UsoDeCampo[]; sinLeer: readonly string[] } {
  const usos: UsoDeCampo[] = [];
  const sinLeer: string[] = [];

  for (const archivo of archivosDePantalla()) {
    const fuente = sinComentarios(readFileSync(archivo, 'utf8'));
    const corto = archivo.slice(RAIZ.length + 1).replaceAll('\\', '/');

    for (const llamada of fuente.matchAll(
      /consultarPuente<[A-Za-z0-9_]+>\(\s*'([A-Za-z0-9_]+)'\s*,\s*/g,
    )) {
      const entidad = llamada[1] ?? '';
      const tras = llamada.index + llamada[0].length;

      // Las opciones: escritas ahí mismo, o en una `const` del archivo, o las dos
      // ramas de un ternario.
      const opciones = [
        ...objetosPosibles(
          fuente,
          fuente[tras] === '{'
            ? bloqueDesde(fuente, tras)
            : (/^[A-Za-z_][A-Za-z0-9_]*/.exec(fuente.slice(tras))?.[0] ?? ''),
        ),
      ];
      if (opciones.length === 0) {
        sinLeer.push(`${corto}: las opciones de ${entidad}`);
        continue;
      }

      // Un `...(cond ? {} : {filtro: …})` esconde un filtro dentro de una pieza de
      // propagación: sus objetos entran como más candidatos, o el contrato daría por
      // buena una llamada que no ha mirado.
      for (const objeto of opciones) {
        for (const pieza of piezasDe(objeto)) {
          if (pieza.trim().startsWith('...')) opciones.push(...objetosLiterales(pieza));
        }
      }

      for (const objeto of opciones) {
        const filtro = valorDe(objeto, 'filtro');
        if (filtro !== null) {
          const posibles = objetosPosibles(fuente, filtro);
          if (posibles.length === 0) sinLeer.push(`${corto}: el filtro de ${entidad} (${filtro})`);
          for (const suyo of posibles) {
            for (const clave of clavesDe(suyo)) {
              if (clave.startsWith('?')) {
                sinLeer.push(`${corto}: una clave del filtro de ${entidad} ${clave}`);
              } else usos.push({ archivo: corto, entidad, uso: 'filtro', campo: clave });
            }
          }
        }

        const orden = valorDe(objeto, 'orden');
        if (orden !== null) {
          const literal = /^'([^']+)'$/.exec(orden);
          if (literal === null) sinLeer.push(`${corto}: el orden de ${entidad} (${orden})`);
          else {
            usos.push({
              archivo: corto,
              entidad,
              uso: 'orden',
              // El prefijo `-` es «descendente», no parte del nombre.
              campo: (literal[1] ?? '').replace(/^-/, ''),
            });
          }
        }

        const rango = valorDe(objeto, 'rango');
        if (rango !== null) {
          const literales = [...rango.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
          if (literales.length === 0) sinLeer.push(`${corto}: el rango de ${entidad} (${rango})`);
          for (const campo of literales) {
            usos.push({ archivo: corto, entidad, uso: 'rango', campo });
          }
        }
      }
    }
  }

  return { usos, sinLeer };
}

describe('las lecturas del puente', () => {
  const todas = lecturas();

  it('hay lecturas que mirar', () => {
    // Si el patrón deja de encajar, el contrato pasaría vacío.
    expect(todas.length).toBeGreaterThan(60);
  });

  it('TODA ENTIDAD QUE UNA PANTALLA LEE EXISTE en el mapa del puente', () => {
    const inexistentes = [...new Set(todas.filter((l) => MAPA[l.entidad] === undefined))].map(
      (l) => `${l.archivo} → «${l.entidad}»`,
    );
    expect(
      inexistentes,
      'Una pantalla consulta una entidad que el puente no tiene. El puente contesta ' +
        '`PUENTE_ENTIDAD_DESCONOCIDA`, la pantalla pinta su banda de error y se queda vacía — y ' +
        'abre en 200, así que la suite la da por probada. Pasó con seis entidades a la vez.',
    ).toEqual([]);
  });

  it('TODO CAMPO OBLIGATORIO que una pantalla lee lo SIRVE el puente', () => {
    const faltantes: string[] = [];
    let sinResolver = 0;

    for (const lectura of lecturas()) {
      if (TIPOS_QUE_VIVEN_FUERA[lectura.tipo] !== undefined) continue;
      const fuente = readFileSync(join(RAIZ, lectura.archivo), 'utf8');
      const campos = camposDelTipo(fuente, lectura.tipo);
      if (campos === null) {
        sinResolver += 1;
        continue;
      }
      const sirve = loQueElPuenteSirve(lectura.entidad);
      for (const campo of campos) {
        if (campo.opcional || sirve.has(campo.nombre)) continue;
        faltantes.push(`${lectura.archivo}: ${lectura.entidad}.${campo.nombre}`);
      }
    }

    // Los tipos que no se resuelven se CUENTAN: un contrato que se salta lo que no
    // entiende afirma en su nombre algo que no mira.
    expect(
      sinResolver,
      'Hay lecturas cuyo tipo no está declarado en su propio archivo y este contrato no lo puede ' +
        'leer. Muévelo al archivo que lo consulta, o decláralo en TIPOS_QUE_VIVEN_FUERA con su ' +
        'razón.',
    ).toBe(0);

    expect(
      faltantes,
      'Una pantalla lee un campo OBLIGATORIO que el puente no sirve. No llega `null`: la clave se ' +
        'omite, así que llega `undefined`, y toda guarda escrita como `=== null` pasa de largo. ' +
        'El síntoma es un `NaN` en pantalla o un «—» donde hay dato. O el mapa lo declara, o el ' +
        'campo se marca opcional y la pantalla se defiende con `?? null`.',
    ).toEqual([]);
  });

  it('TODO CAMPO por el que una pantalla FILTRA, ORDENA o pide RANGO es una columna del mapa', () => {
    const { usos, sinLeer } = porDondeBuscan();

    expect(usos.length, 'Si el patrón deja de encajar, esto pasaría vacío.').toBeGreaterThan(15);

    expect(
      sinLeer,
      'Hay una llamada al puente cuyo filtro, orden o rango no se puede leer estáticamente, así ' +
        'que este contrato no puede afirmar nada de ella. Escribe el objeto en la propia llamada ' +
        'o en una `const` del mismo archivo, o pasa el campo como cadena literal.',
    ).toEqual([]);

    const invalidos = usos
      // La entidad que no existe ya la denuncia el contrato de arriba: un mismo
      // defecto no debe salir dos veces con dos explicaciones distintas.
      .filter((u) => {
        const mapa = MAPA[u.entidad];
        return mapa !== undefined && mapa.campos[u.campo] === undefined;
      })
      .map((u) => `${u.archivo}: ${u.uso} de ${u.entidad} por «${u.campo}»`);

    expect(
      invalidos,
      'Una pantalla filtra, ordena o pide un rango por un campo que el mapa no tiene en ' +
        '`campos`. No se recorta: se RECHAZA con `PUENTE_CAMPO_INVALIDO`, que llega como 400 y ' +
        'se ve como una lista VACÍA —indistinguible de «ese día no pasó nada»—. Y ojo: los ' +
        '`derivados`, los `calculados` y los `hijos` NO sirven para filtrar ni ordenar; sólo ' +
        '`campos`. El orden descendente se escribe «-campo», nunca «campo:desc».',
    ).toEqual([]);
  });
});
