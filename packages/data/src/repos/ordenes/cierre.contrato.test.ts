import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * EL CONTRATO QUE HABRÍA CAZADO EL 23514.
 *
 * La migración 045 añadió a `ordenes`:
 *
 *     check (estado not in ('pagada','cancelada') or cerrada_en is not null)
 *
 * y `marcarPagada` ponía `estado: 'pagada'` SIN escribir `cerrada_en`. Contra
 * Postgres real, TODO cobro del sistema —de mesa y de mostrador— abortaba con
 * `23514 · orden_cerrada_con_fecha`. Comprobado ejecutándolo.
 *
 * No lo vio ninguna de las 453 pruebas del paquete porque el doble en memoria
 * no modela restricciones `check`. Es exactamente el hueco del que avisa
 * `contratos-por-mutacion`: **una suite en verde sobre un sistema que no
 * arranca**, y la pregunta que hay que hacerse es qué camino de ejecución no
 * recorre ninguna puerta.
 *
 * ── Cómo está escrito, y por qué así ──────────────────────────────────────
 * NO busca el identificador `cerrada_en` suelto sobre el archivo: eso pasaría
 * igual si apareciera en un comentario o en otra función. RECORTA el objeto
 * literal del `.set({ … })` que contiene el estado de cierre, y afirma sobre
 * ESE trozo. Si mañana alguien añade un segundo `.set` que cierre una orden en
 * otro archivo, también lo mira: el recorrido es por carpeta, no por lista.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
/** Las dos carpetas donde puede vivir una escritura que cierre una orden. */
const RAICES = [AQUI, join(AQUI, '../../../../app/src')];

const ESTADOS_QUE_CIERRAN = ["'pagada'", "'cancelada'"];

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

/** Quita los comentarios: un contrato no puede afirmar sobre su propia prosa. */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
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

describe('una orden que se cierra escribe su fecha de cierre', () => {
  const sospechosos: { archivo: string; bloque: string }[] = [];
  for (const raiz of RAICES) {
    for (const archivo of archivosTs(raiz)) {
      const codigo = sinComentarios(readFileSync(archivo, 'utf8'));
      // Sólo interesan las escrituras sobre `ordenes`: `comandas`, `mesas` y
      // `sesiones_caja` tienen sus propios estados y sus propias reglas.
      if (!codigo.includes("updateTable('ordenes')")) continue;
      for (const bloque of objetosDeSet(codigo)) {
        const cierra = ESTADOS_QUE_CIERRAN.some((e) => bloque.includes(`estado: ${e}`));
        if (cierra) sospechosos.push({ archivo, bloque });
      }
    }
  }

  it('hay al menos una escritura de cierre que vigilar', () => {
    // Sin esto, el contrato pasaría vacío el día que alguien renombre el
    // método o mueva el archivo, afirmando en su nombre algo que ya no mira.
    expect(sospechosos.length).toBeGreaterThanOrEqual(2);
  });

  it('cada una escribe `cerrada_en` en el MISMO objeto', () => {
    for (const { archivo, bloque } of sospechosos) {
      expect(
        bloque.includes('cerrada_en'),
        `${archivo}: cierra la orden sin escribir cerrada_en. El check ` +
          '`orden_cerrada_con_fecha` de la migración 045 lo rechaza con 23514 y ' +
          'ninguna prueba con doble en memoria lo vería.',
      ).toBe(true);
    }
  });

  it('la fecha viene del comando, no de `now()` de la base', () => {
    // Todo lo que escribe una transacción lleva la MISMA hora: el pago, el
    // movimiento de caja y el cierre. Con `now()` de Postgres cada sentencia
    // podría caer en un instante distinto, y un corte acotado al minuto
    // repartiría una misma venta entre dos.
    for (const { archivo, bloque } of sospechosos) {
      expect(bloque, `${archivo}: la fecha de cierre no puede salir de now()`).not.toMatch(
        /cerrada_en\s*:\s*sql`?now\(\)/,
      );
    }
  });
});
