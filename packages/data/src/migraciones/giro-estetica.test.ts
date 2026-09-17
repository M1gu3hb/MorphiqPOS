import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { GIROS } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

/**
 * 164 · El `check` de `organizaciones.giro` y `GIROS` no pueden divergir.
 *
 * ── Qué se rompe si divergen ───────────────────────────────────────────────
 * En los dos sentidos, y de las dos formas es invisible desde el código:
 *
 *   · Si el código conoce un giro que la base no admite, `db:alta-negocio` y la
 *     pantalla que lo ofrezca revientan con un 23514 de Postgres, que no es un
 *     mensaje que nadie pueda interpretar.
 *   · Si la base admite uno que el código no conoce, `esGiro()` lo rechaza,
 *     `plantillaDeOrganizacion` lo degrada a `tienda` y el negocio opera con el
 *     vocabulario base sin que nada avise.
 *
 * ── Por qué mira la ÚLTIMA migración y no ésta ─────────────────────────────
 * Un `check` de lista cerrada se reescribe entero cada vez: la 054 lo creó con
 * cinco y la 164 lo dejó con seis. Atar el contrato a la 164 lo volvería FALSO el
 * día que una 165 añada el séptimo giro —la 164 estará aplicada y no se puede
 * editar, el ejecutor valida por hash— y la reacción sería borrar el contrato.
 * Atado a la última que lo escribe, un giro nuevo obliga a escribir su migración,
 * que es exactamente lo que hace falta.
 *
 * ── Lo que NO puede ver ────────────────────────────────────────────────────
 * Que el SQL se aplique, y que Postgres interprete el `in (…)` como se lee aquí.
 * Es un cerco, no una demostración: la aplicación va en la tanda del acople y su
 * propia poscondición —la del punto 3 de la 164— es la que comprueba el
 * resultado contra el catálogo de la base.
 */

const SQL_DIR = fileURLToPath(new URL('./sql/', import.meta.url));

/** El archivo, sin las líneas de comentario: sólo lo que Postgres va a ejecutar. */
function ejecutable(archivo: string): string {
  return readFileSync(new URL(`./sql/${archivo}`, import.meta.url), 'utf8').replace(
    /^\s*--.*$/gm,
    '',
  );
}

/**
 * Los giros que declara el `check` de un archivo.
 *
 * Se recorta el bloque `add constraint … check (giro in (…))` y se leen SUS
 * literales, no los del archivo: la 164 escribe la misma lista dos veces —en el
 * `check` y en su poscondición— y afirmar sobre el archivo entero contaría las
 * dos, con lo que quitar un giro del `check` seguiría pasando.
 */
function girosDelCheck(sql: string): string[] {
  // La ÚLTIMA, no la primera. Un archivo que suelta y reescribe el `check` dos
  // veces —la forma exacta de una corrección de última hora— deja mandando a la
  // segunda, y leer la primera haría que el contrato aprobara una lista que la
  // base nunca va a tener. Comprobado mutando: con un segundo `add constraint`
  // de dos giros al final del archivo, este contrato pasaba en verde.
  const bloques = [
    ...sql.matchAll(
      /add constraint organizaciones_giro_check\s*check \(\s*giro in \(([\s\S]*?)\)/g,
    ),
  ];
  const ultimo = bloques.at(-1);
  if (ultimo?.[1] === undefined) return [];
  return [...ultimo[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? '').sort();
}

/**
 * El bloque `do $ … $;` que contiene un ancla, recortado.
 *
 * Existe por el fallo que la refutación encontró: la 164 tiene DOS
 * poscondiciones y `raise exception` aparece cinco veces. Afirmar sobre el
 * archivo entero deja vaciar una de las dos sin que nada se entere, porque la
 * otra satisface la búsqueda. Se afirma DENTRO del bloque que toca.
 */
function bloqueDo(sql: string, ancla: string): string {
  for (const m of sql.matchAll(/do \$\$[\s\S]*?\$\$;/g)) {
    if (m[0].includes(ancla)) return m[0];
  }
  return '';
}

/** Las migraciones que escriben el `check`, de la más vieja a la más nueva. */
function migracionesQueEscribenElCheck(): readonly string[] {
  return readdirSync(SQL_DIR)
    .filter((archivo) => archivo.endsWith('.sql'))
    .filter((archivo) => ejecutable(archivo).includes('add constraint organizaciones_giro_check'))
    .sort();
}

const LA_164 = ejecutable('164_giro_estetica.sql');

describe('164 · el giro `estetica` entra en la columna', () => {
  it('el `check` se pudo recortar: si no, las comparaciones de abajo serían vacías', () => {
    expect(girosDelCheck(LA_164).length).toBeGreaterThan(0);
  });

  it('la lista se reescribe ENTERA: los cinco de la 054 siguen dentro', () => {
    // Un `check` de lista cerrada no se extiende, se vuelve a escribir. Dejar
    // fuera uno de los cinco convierte esta migración en la que rompe a los
    // cuatro negocios vivos al validar la tabla.
    expect(girosDelCheck(LA_164)).toEqual(
      ['tienda', 'ferreteria', 'farmacia', 'cafeteria', 'restaurante', 'estetica'].sort(),
    );
  });

  it('suelta el `check` viejo ANTES de escribir el nuevo', () => {
    // Es orden, no estilo: dos constraints con el mismo nombre no pueden coexistir,
    // así que el `add` sin el `drop` delante falla con un 42710 y no aplica nada.
    const suelta = LA_164.indexOf('drop constraint organizaciones_giro_check');
    const escribe = LA_164.indexOf('add constraint organizaciones_giro_check');

    expect(suelta).toBeGreaterThan(-1);
    expect(escribe).toBeGreaterThan(suelta);
  });

  it('escribe el `check` UNA vez: dos reescrituras y manda la de abajo', () => {
    // No es un capricho de estilo. Con dos `add constraint` en el mismo archivo,
    // la lista efectiva es la segunda y la primera es decoración. Si algún día
    // hace falta reescribirlo dos veces, esta prueba falla y obliga a decir por
    // qué — que es mejor que aprobar en silencio la lista equivocada.
    const cuantas = [...LA_164.matchAll(/add constraint organizaciones_giro_check/g)].length;

    expect(
      cuantas,
      'La 164 escribe el check de giro más de una vez. La que vale es la ÚLTIMA, ' +
        'y el resto son decoración que se lee como si contara.',
    ).toBe(1);
  });

  it('trae POSCONDICIÓN, y comprueba los mismos giros que escribió', () => {
    // Una migración que no comprueba lo que hizo es una que nadie sabe si
    // funcionó. La de la 164 lee el catálogo —`pg_get_constraintdef`— y falla con
    // `raise exception`, así que la tanda entera se deshace en vez de dejar la
    // columna a medias.
    const escribe = LA_164.indexOf('add constraint organizaciones_giro_check');
    const comprueba = LA_164.indexOf('pg_get_constraintdef');

    expect(comprueba).toBeGreaterThan(escribe);

    // Y la lista que verifica es la MISMA que escribió. Si alguien añade un giro
    // al `check` y no al arreglo de la poscondición, la migración pasaría a
    // aplicar algo que ya no comprueba — que es como se queda una poscondición
    // decorativa.
    const arreglo = /foreach g in array\s*array\[([\s\S]*?)\]/.exec(LA_164);
    const verificados = [...(arreglo?.[1] ?? '').matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1] ?? '')
      .sort();

    expect(verificados).toEqual(girosDelCheck(LA_164));
  });

  it('la poscondición del `check` COMPRUEBA de verdad, no sólo lee', () => {
    // Éste es el contrato que faltaba, y el hueco por el que se coló un estado
    // real del archivo: el bloque conservaba el `select pg_get_constraintdef` y
    // el `foreach` con los seis giros, y el cuerpo del bucle era `null;`. La
    // migración aplicaba SIN comprobar nada y las pruebas seguían verdes, porque
    // los `raise exception` de la poscondición de las mermas —otra distinta—
    // satisfacían la búsqueda suelta sobre el archivo entero.
    const bloque = bloqueDo(LA_164, 'pg_get_constraintdef');

    expect(bloque, 'no encontré el bloque `do $` de la poscondición del check').not.toBe('');
    expect(bloque).toContain('position(quote_literal(g) in definicion)');
    expect(bloque, 'el bucle de la poscondición no compara nada').not.toMatch(
      /loop\s*null;\s*end loop/,
    );
    expect(bloque, 'la poscondición del check no falla: avisa y sigue').toContain(
      'raise exception',
    );

    // «y SÓLO los seis». El giro colado de MÁS no lo caza el `foreach`, que sólo
    // mira que estén los que espera: lo caza el conteo, y el conteo se compara
    // contra la lista LEÍDA del check, no contra un número tecleado aquí.
    expect(bloque).toContain('regexp_matches');
    expect(/cuantos <> (\d+)/.exec(bloque)?.[1]).toBe(String(girosDelCheck(LA_164).length));
  });
});

describe('164 · el `check` de la base y `GIROS` son la misma lista', () => {
  it('hay al menos una migración que escribe el `check`', () => {
    expect(migracionesQueEscribenElCheck().length).toBeGreaterThan(0);
  });

  it('la ÚLTIMA que lo escribe declara EXACTAMENTE los giros de `GIROS`', () => {
    const escritoras = migracionesQueEscribenElCheck();
    const ultima = escritoras.at(-1) ?? '';

    expect(
      girosDelCheck(ejecutable(ultima)),
      `${ultima} y GIROS (packages/contracts/src/comandos/ambito.ts) dicen cosas distintas. ` +
        'Un giro que el código conoce y la base no rechaza el alta con un 23514; uno que la ' +
        'base admite y el código no, opera con el vocabulario base sin que nada avise. Se ' +
        'añade en los dos sitios, y en la base con una migración nueva: las aplicadas no se ' +
        'editan, el ejecutor valida por hash.',
    ).toEqual([...GIROS].sort());
  });
});

describe('164 · las mermas propias del giro (F-109)', () => {
  it('siembra los motivos del giro y se puede volver a aplicar', () => {
    // `motivos_merma` es catálogo compartido con clave primaria de texto: sin el
    // `on conflict`, reaplicar la tanda revienta con un 23505 y la migración deja
    // de ser idempotente.
    const semilla = /insert into motivos_merma[\s\S]*?on conflict[^;]*;/.exec(LA_164)?.[0] ?? '';

    expect(semilla).not.toBe('');
    expect(semilla).toContain('on conflict (clave) do nothing');
    // El giro es el de este modelo. Sembrarlos con `null` los daría a los seis.
    expect(semilla).toContain("'estetica'");
    expect(semilla).not.toContain('null');
  });

  it('y comprueba que quedaron, con los del tronco que el modelo reutiliza', () => {
    // El modelo documenta cuatro motivos: dos son propios y dos son del tronco
    // (`caducado` y `ajuste_conteo`, que se queda neutro a propósito). La
    // poscondición mira los cuatro, porque el daño no es que falte la semilla:
    // es que alguien renombre uno del tronco y el salón se quede con la mitad.
    const bloque = bloqueDo(LA_164, 'into propios');

    expect(bloque, 'no encontré el bloque `do $` de la poscondición de las mermas').not.toBe('');
    expect(bloque).toContain("giro = 'estetica'");
    expect(bloque).toContain("clave in ('caducado', 'ajuste_conteo')");
    // Dentro de ESTE bloque, no en el del check: las dos poscondiciones tienen
    // que fallar por separado, y buscar `raise exception` en todo el archivo deja
    // vaciar una de las dos.
    expect(bloque).toContain('raise exception');
  });
});
