import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * EL CONTRATO DE LA FAMILIA, no el del fallo de ayer.
 *
 * Dos veces ya, una migración añadió un `check` de la forma «si el estado es
 * éste, esta columna no puede ser nula», el código que escribe ese estado no
 * escribió la columna, y NINGUNA de las 805 pruebas lo vio, porque los dobles
 * en memoria no modelan `check`:
 *
 *   1 · `ordenes.orden_cerrada_con_fecha` — `marcarPagada` ponía
 *       `estado: 'pagada'` sin `cerrada_en`. TODO cobro del sistema abortaba
 *       con 23514.
 *   2 · `sesiones_caja.caja_cerrada_con_folio` — `cerrarSesion` ponía
 *       `estado: 'cerrada'` sin `folio`. NINGUNA caja se podía cerrar.
 *
 * Las dos aparecieron al ejecutar la aplicación contra Postgres, no en la
 * suite. `cierre.contrato.test.ts` cerró la primera a mano. Esto cierra las que
 * vengan: LEE LOS `check` DE LAS MIGRACIONES y deriva la regla de ahí, así que
 * el día que alguien añada el tercero, el contrato ya lo vigila sin tocarlo.
 *
 * Lee las DOS formas en que el esquema declara un `check`: el `alter table …
 * add constraint` de las migraciones tardías y el `constraint … check (…)`
 * escrito dentro del `create table` original. Su primera versión sólo miraba la
 * primera y por eso no veía tres reglas —«una orden cancelada necesita motivo y
 * fecha» entre ellas—, que son de la misma familia que ya rompió el sistema dos
 * veces.
 *
 * ── Lo que este contrato NO puede ver, y hay que decirlo ───────────────────
 * Sólo mira `check` con la forma «estado ⇒ columna». Un `check` sobre importes,
 * un `not null` de columna o una llave foránea no entran aquí. Y sólo mira
 * escrituras con `.set({ … })` literal: una construida dinámicamente se le
 * escapa. Es un cerco, no una demostración.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIGRACIONES = join(AQUI, '../migraciones/sql');
/** Donde vive todo lo que escribe: los repositorios y los comandos. */
const RAICES_DE_CODIGO = [AQUI, join(AQUI, '../../../app/src')];

interface ReglaDeEstado {
  readonly tabla: string;
  readonly restriccion: string;
  readonly estados: readonly string[];
  readonly columna: string;
}

function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
}

function sinComentariosTs(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Extrae las reglas «estado ⇒ columna» de las migraciones.
 *
 * Reconoce las dos formas que el esquema usa hoy:
 *   estado not in ('a','b') or col is not null
 *   estado <> 'a'           or col is not null
 */
function reglasDeLasMigraciones(): ReglaDeEstado[] {
  const reglas: ReglaDeEstado[] = [];
  for (const archivo of readdirSync(MIGRACIONES).filter((e) => e.endsWith('.sql'))) {
    const sql = sinComentarios(readFileSync(join(MIGRACIONES, archivo), 'utf8'));

    // 1 · `alter table X add constraint Y check ( … );`
    const porAlter =
      /alter\s+table\s+(?:only\s+)?"?(\w+)"?\s+add\s+constraint\s+"?(\w+)"?\s+check\s*\(([\s\S]*?)\);/gi;
    for (const m of sql.matchAll(porAlter)) {
      reglas.push(...leerRegla(m[1], m[2], m[3]));
    }

    // 2 · `constraint Y check ( … )` DENTRO de un `create table X ( … );`
    //
    //     La primera versión de este contrato sólo miraba `alter table`, y así
    //     se le escapaban tres reglas del esquema original —entre ellas «una
    //     orden cancelada necesita motivo y fecha»—, que son exactamente la
    //     familia que ya rompió el sistema dos veces. Un contrato que mira la
    //     mitad de su dominio afirma en su nombre algo que no comprobó.
    const porCreate = /create\s+table\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?\s*\(([\s\S]*?)\n\);/gi;
    for (const tabla of sql.matchAll(porCreate)) {
      const cuerpo = tabla[2] ?? '';
      // `\)\s*(?:,|$)` con la bandera `m`: el cuerpo de un `check` trae sus
      // propios paréntesis —`or (a is not null and b is not null)`— así que el
      // cierre bueno es el que va seguido de coma o de fin de LÍNEA, no el
      // primero que aparece. Sin la `m`, una restricción que fuera la última de
      // su tabla (sin coma detrás) no se leería.
      const enLinea = /constraint\s+"?(\w+)"?\s+check\s*\(([\s\S]*?)\)\s*(?:,|$)/gim;
      for (const c of cuerpo.matchAll(enLinea)) {
        reglas.push(...leerRegla(tabla[1], c[1], c[2]));
      }
    }
  }
  return reglas;
}

/**
 * Una restricción `check` → cero o más reglas «estado ⇒ columna».
 *
 * Cero cuando no habla de estados. VARIAS cuando exige más de una columna:
 * `caja_cerrada_completa` pide `cerrada_en` Y `efectivo_contado_centavos`, y
 * mirar sólo la primera dejaba la segunda sin vigilar — que es cómo un contrato
 * se convierte en media puerta.
 */
function leerRegla(
  tabla: string | undefined,
  restriccion: string | undefined,
  cuerpo: string | undefined,
): ReglaDeEstado[] {
  if (tabla === undefined || restriccion === undefined || cuerpo === undefined) return [];

  const columnas = [...cuerpo.matchAll(/"?(\w+)"?\s+is\s+not\s+null/gi)].map((m) => m[1] ?? '');
  if (columnas.length === 0) return [];

  const enLista = /estado\s+not\s+in\s*\(([^)]*)\)/i.exec(cuerpo)?.[1];
  const distinto = /estado\s*(?:<>|!=)\s*'(\w+)'/i.exec(cuerpo)?.[1];

  const estados =
    enLista !== undefined
      ? [...enLista.matchAll(/'(\w+)'/g)].map((m) => m[1] ?? '')
      : distinto !== undefined
        ? [distinto]
        : [];
  if (estados.length === 0) return [];

  return columnas.map((columna) => ({ tabla, restriccion, estados, columna }));
}

function archivosTs(raiz: string): string[] {
  const salida: string[] = [];
  const pila = [raiz];
  while (pila.length > 0) {
    const actual = pila.pop();
    if (actual === undefined) continue;
    for (const entrada of readdirSync(actual)) {
      if (entrada === 'node_modules' || entrada === 'migraciones') continue;
      const ruta = join(actual, entrada);
      if (statSync(ruta).isDirectory()) {
        pila.push(ruta);
        continue;
      }
      if (!entrada.endsWith('.ts') || entrada.includes('.test.')) continue;
      salida.push(ruta);
    }
  }
  return salida;
}

/**
 * Recorta cada objeto literal de un `.set({ … })`, contando llaves.
 *
 * Cortar en la primera `}` es el error que ya costó cuatro intentos en este
 * proyecto: un objeto anidado la contiene y el recorte se queda a medias.
 */
function objetosDeSet(codigo: string): string[] {
  const bloques: string[] = [];
  const marca = '.set({';
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

const REGLAS = reglasDeLasMigraciones();

describe('todo estado que la base exige acompañado escribe su columna', () => {
  it('las migraciones declaran las reglas que este contrato vigila', () => {
    // Sin esto, el contrato pasaría vacío el día que el patrón deje de encajar
    // —un `check` escrito en otro orden, una migración movida de carpeta— y
    // afirmaría en su nombre algo que ya no mira.
    expect(REGLAS.length).toBeGreaterThanOrEqual(7);

    const nombres = REGLAS.map((r) => r.restriccion);
    // Las dos que ya rompieron el sistema en producción. Si desaparecen del
    // esquema, que sea una decisión y no un descuido. Vienen de `alter table`.
    expect(nombres).toContain('orden_cerrada_con_fecha');
    expect(nombres).toContain('caja_cerrada_con_folio');
    // Y las tres que viven DENTRO del `create table` original. Nombrarlas aquí
    // es lo que ata la segunda forma de lectura: si el patrón de `create table`
    // dejara de encajar, el contrato seguiría en verde con las dos de arriba y
    // volvería a vigilar la mitad de lo que dice vigilar.
    expect(nombres).toContain('caja_cerrada_completa');
    expect(nombres).toContain('orden_pagada_con_folio');
    expect(nombres).toContain('orden_cancelada_con_motivo');

    // Una restricción puede exigir DOS columnas —`caja_cerrada_completa` pide
    // `cerrada_en` y `efectivo_contado_centavos`— y quedarse con la primera
    // dejaba la otra sin vigilar.
    const columnasDeCajaCompleta = REGLAS.filter(
      (r) => r.restriccion === 'caja_cerrada_completa',
    ).map((r) => r.columna);
    expect(columnasDeCajaCompleta).toEqual(
      expect.arrayContaining(['cerrada_en', 'efectivo_contado_centavos']),
    );
  });

  for (const regla of REGLAS) {
    describe(`${regla.tabla} · ${regla.restriccion}`, () => {
      const sospechosos: { archivo: string; bloque: string }[] = [];
      for (const raiz of RAICES_DE_CODIGO) {
        for (const archivo of archivosTs(raiz)) {
          const codigo = sinComentariosTs(readFileSync(archivo, 'utf8'));
          if (!codigo.includes(`updateTable('${regla.tabla}')`)) continue;
          for (const bloque of objetosDeSet(codigo)) {
            const escribeEseEstado = regla.estados.some((e) => bloque.includes(`estado: '${e}'`));
            if (escribeEseEstado) sospechosos.push({ archivo, bloque });
          }
        }
      }

      it(`hay alguna escritura que ponga ${regla.estados.join(' o ')}`, () => {
        expect(
          sospechosos.length,
          `Nadie escribe ${regla.estados.join('/')} en ${regla.tabla}. O sobra la ` +
            'restricción, o el contrato dejó de encontrar el código que vigila.',
        ).toBeGreaterThan(0);
      });

      it(`cada una escribe «${regla.columna}» en el MISMO objeto`, () => {
        for (const { archivo, bloque } of sospechosos) {
          expect(
            bloque.includes(regla.columna),
            `${archivo}: pone el estado sin escribir «${regla.columna}». El check ` +
              `\`${regla.restriccion}\` lo rechaza con 23514 contra Postgres, y ` +
              'ninguna prueba con doble en memoria lo vería.',
          ).toBe(true);
        }
      });
    });
  }
});
