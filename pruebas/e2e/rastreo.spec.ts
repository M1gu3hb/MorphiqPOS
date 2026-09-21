import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import {
  abrirCajaPorLaRuta,
  entrar,
  exigirDemostracion,
  menuLateral,
  soltarLaCaja,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * EL RASTREADOR · la prueba que NO sabe qué busca.
 *
 * ── Por qué existe, y por qué llega tarde ─────────────────────────────────
 * Las otras cinco suites saben lo que buscan: abren las pantallas de su modelo,
 * comprueban un rótulo y cobran una venta. Son buenas y no alcanzan, porque una
 * prueba que sabe lo que busca sólo encuentra lo que alguien ya vio. Cuatro vueltas
 * seguidas terminaron «cerradas» y la auditoría siguiente encontró cosas obvias:
 * pantallas que no colgaban de ningún menú, botones muertos, rutas armadas con
 * plantilla que el verificador no sabía leer. Siempre un defecto por detrás.
 *
 * Y faltaba lo evidente: **nadie hacía clic en cada botón**. Miguel abre el sistema
 * diez minutos y encuentra lo que treinta puertas no vieron, porque él no comprueba
 * un rótulo: él TOCA las cosas.
 *
 * Esto toca las cosas. Por cada pantalla del menú:
 *
 *   1 · la abre POR EL MENÚ —tocando su entrada, no tecleando la URL—;
 *   2 · enumera TODO lo interactivo de su `main`: `button`, `a[href]`,
 *       `[role="button"]` y los `input` de envío;
 *   3 · toca cada uno, volviendo al estado inicial entre toque y toque;
 *   4 · y exige que CADA toque haga al menos una de tres cosas: **salga una
 *       petición**, **cambie la URL** o **cambie el DOM**. Si no hace ninguna, es un
 *       botón muerto y la prueba lo nombra: pantalla, texto y selector.
 *
 * Mientras tanto vigila TODA la sesión y falla con cualquier 4xx o 5xx, cualquier
 * `{ok:false}` y cualquier error de consola.
 *
 * ── Lo que NO toca, y por qué ─────────────────────────────────────────────
 * · Lo DESHABILITADO. No se puede tocar, y lo que se mide aquí es el efecto de un
 *   toque. Un `disabled` que además no tiene `onClick` —los dos de `Entradas`— se
 *   caza leyendo el código, no tocándolo, y por eso ésos van en el bloque 4.
 * · Lo que SALE de la aplicación: un `href` a otro origen, un `wa.me`, un `mailto:`.
 *   Su efecto es irse, y eso no se mide desde dentro. Se cuentan y se imprimen.
 * · SALIR. Cerrar la sesión a mitad del rastreo dejaría el resto de la pantalla sin
 *   comprobar y todas las siguientes también.
 *
 * ── Y lo que de verdad no debe hacer nada se DECLARA ──────────────────────
 * En `docs/fase-2/CLICS-SIN-EFECTO.md`, con su motivo, una línea por caso. La prueba
 * la lee. Si la lista crece sin razón, se nota — que es justo lo que no pasaba
 * cuando el criterio era «abrió en 200».
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = dirname(dirname(AQUI));
const DECLARADOS = join(RAIZ, 'docs', 'fase-2', 'CLICS-SIN-EFECTO.md');

/**
 * Cuánto se le da a un toque para hacer algo antes de declararlo muerto.
 *
 * Medio segundo contra un despliegue real es de sobra para lo que se mide: una
 * petición SALE al tocar —no hace falta que vuelva—, la URL cambia en el mismo
 * tick, y un diálogo se pinta en el siguiente cuadro. Lo que tarda es la red, y
 * la red no es lo que se está midiendo.
 */
const RESPIRO_MS = 500;

/** El techo del rastreo entero. Son cientos de toques, cada uno con su reposo. */
const TECHO_MS = 60 * 60 * 1000;

/**
 * LOS TECHOS DE CADA ACTO · el defecto que se comíó la primera corrida entera.
 *
 * Playwright NO pone techo a una acción por omisión: `actionTimeout` y
 * `navigationTimeout` valen 0, que significa «sin límite». Con el techo del rastreo
 * en una hora, UN solo clic que espera por un elemento que no aparece se queda
 * esperando **una hora**, y como el resumen sale al final, la corrida no imprime
 * ni una línea en todo ese tiempo. Pasó: 35 minutos con 2,2 segundos de CPU
 * gastados y cero salida, esperando por la entrada de un menú.
 *
 * Un rastreador que puede quedarse colgado en silencio no sirve para nada: lo que
 * encuentra no llega nunca. Cada acto lleva su techo, y agotarlo es un HALLAZGO
 * —«esto no se pudo tocar»— no un cuelgue.
 */
const TECHO_DE_ACCION_MS = 15_000;
const TECHO_DE_NAVEGACION_MS = 30_000;

/** Y el techo de un `evaluate`, que tampoco lo tiene y también puede colgarse. */
const TECHO_DE_EVALUACION_MS = 20_000;

/**
 * Le pone techo a cualquier promesa, porque `page.evaluate` no acepta uno.
 *
 * Si se agota, LANZA con lo que se estaba haciendo. Un fallo con nombre se arregla;
 * un cuelgue sin salida, no.
 */
async function conTecho<T>(promesa: Promise<T>, ms: number, queEs: string): Promise<T> {
  let avisar: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promesa,
      new Promise<never>((_, rechazar) => {
        avisar = setTimeout(() => {
          rechazar(new Error(`se agotaron ${String(ms)} ms en ${queEs}`));
        }, ms);
      }),
    ]);
  } finally {
    if (avisar !== undefined) clearTimeout(avisar);
  }
}

/**
 * LA BITÁCORA DEL RASTREO, que se escribe MIENTRAS pasa.
 *
 * El resumen de una corrida de media hora que sale al final no sirve para saber
 * si avanza o está colgada. Esto deja una línea por pantalla y por hallazgo en
 * `test-results/…/rastreo.log`, en cuanto ocurre. `console.log` no es opción —el
 * lint lo prohíbe, y con razón— pero un archivo sí.
 */
function bitacora(destino: string, linea: string): void {
  try {
    appendFileSync(destino, `${linea}\n`, 'utf8');
  } catch {
    // Una bitácora que no se puede escribir no puede tumbar el rastreo.
  }
}

/**
 * Lo que se declara como «toca y no pasa nada, a propósito».
 *
 * Formato de una línea, y la prueba sólo entiende ésta:
 *
 *   CLIC-SIN-EFECTO /ruta «Texto del botón» — el motivo, en una frase
 *
 * El motivo no es decoración: es lo que hace que la lista no crezca sola.
 */
function leerDeclarados(): ReadonlyMap<string, string> {
  const declarados = new Map<string, string>();
  if (!existsSync(DECLARADOS)) return declarados;
  const texto = readFileSync(DECLARADOS, 'utf8');
  for (const linea of texto.split(/\r?\n/)) {
    const encaja = /^\s*CLIC-SIN-EFECTO\s+(\S+)\s+«([^»]*)»\s*[—-]\s*(.+?)\s*$/.exec(linea);
    if (encaja === null) continue;
    declarados.set(`${encaja[1] ?? ''} «${encaja[2] ?? ''}»`, encaja[3] ?? '');
  }
  return declarados;
}

/** Los errores de consola que son ruido del navegador y no de la aplicación. */
const RUIDO_DE_CONSOLA = [
  // Chromium lo escribe cuando una imagen del catálogo no está en el almacén de la
  // demostración. No es la aplicación fallando: es un dato que la demo no tiene.
  /Failed to load resource: the server responded with a status of 404 .*\.(png|jpg|jpeg|webp|svg|ico)/i,
  // La extensión de React, que no está instalada en el navegador de la prueba.
  /Download the React DevTools/i,
];

interface Clicable {
  /** `main > div:nth-child(2) > button:nth-child(3)`, para volver a encontrarlo. */
  readonly camino: string;
  readonly etiqueta: string;
  readonly etiquetaHtml: string;
  readonly href: string | null;
  readonly deshabilitado: boolean;
  readonly visible: boolean;
}

/**
 * TODO lo que se puede tocar dentro del `main` de la pantalla, con su camino.
 *
 * Dentro del `main` y no en toda la página: la barra lateral es el MENÚ, y el menú
 * se prueba abriendo cada pantalla por él. Tocar sus enlaces desde cada pantalla
 * multiplicaría por veinte el rastreo sin probar nada nuevo.
 */
async function enumerar(page: Page): Promise<readonly Clicable[]> {
  return page.evaluate(() => {
    function caminoDe(elemento: Element): string {
      const pasos: string[] = [];
      let actual: Element | null = elemento;
      while (actual !== null && actual !== document.body) {
        const padre: Element | null = actual.parentElement;
        if (padre === null) break;
        const indice = [...padre.children].indexOf(actual) + 1;
        pasos.unshift(`${actual.tagName.toLowerCase()}:nth-child(${String(indice)})`);
        actual = padre;
      }
      return `body > ${pasos.join(' > ')}`;
    }

    const raiz = document.querySelector('main') ?? document.body;
    const seleccion =
      'button, a[href], [role="button"], input[type="submit"], input[type="button"]';
    return [...raiz.querySelectorAll(seleccion)].map((elemento) => {
      const html = elemento as HTMLElement & { disabled?: boolean; value?: string };
      const texto = (elemento.getAttribute('aria-label') ?? html.innerText ?? html.value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        camino: caminoDe(elemento),
        etiqueta: texto.slice(0, 80),
        etiquetaHtml: elemento.tagName.toLowerCase(),
        href: elemento.getAttribute('href'),
        deshabilitado: html.disabled === true || elemento.getAttribute('aria-disabled') === 'true',
        visible: html.offsetParent !== null || elemento.getClientRects().length > 0,
      };
    });
  });
}

/**
 * La huella de la pantalla: lo que un toque tendría que cambiar.
 *
 * Lleva el texto ENTERO —con sus números— porque subir una cantidad de 1 a 2 es un
 * efecto perfectamente legítimo y quitar los dígitos lo escondería. Lo que evita el
 * falso positivo de un reloj es la doble muestra de abajo, no recortar la huella.
 */
async function huella(page: Page): Promise<string> {
  return page.evaluate(() => {
    const texto = (document.body.innerText ?? '').replace(/\s+/g, ' ').trim();
    const dialogos = document.querySelectorAll('[role="dialog"], dialog[open], [role="alert"]');
    return [
      document.querySelectorAll('*').length,
      dialogos.length,
      texto.length,
      texto.slice(0, 6000),
    ].join('|');
  });
}

/** ¿El `href` sale de la aplicación? Entonces su efecto no se mide desde dentro. */
function saleDeLaAplicacion(href: string | null): boolean {
  if (href === null || href === '') return true;
  return !href.startsWith('/') || href.startsWith('//');
}

/** Salir cerraría la sesión y con ella el rastreo entero. */
function esSalir(etiqueta: string): boolean {
  return /^(salir|cerrar sesión|cerrar sesion)$/i.test(etiqueta.trim());
}

interface Hallazgo {
  readonly ruta: string;
  readonly etiqueta: string;
  readonly camino: string;
  readonly motivo: string;
}

test.describe('rastreo · se toca cada botón de cada pantalla', () => {
  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info);
  });

  test.afterEach(async ({ page }, info) => {
    info.annotations.push({ type: 'caja', description: await soltarLaCaja(page) });
  });

  test('cada toque hace algo, y nada revienta por el camino', async ({ page }) => {
    test.setTimeout(TECHO_MS);

    // Sin esto, una acción sin techo espera lo que dure la prueba entera (una hora).
    page.setDefaultTimeout(TECHO_DE_ACCION_MS);
    page.setDefaultNavigationTimeout(TECHO_DE_NAVEGACION_MS);

    const diario = test.info().outputPath('rastreo.log');
    bitacora(diario, `rastreo de ${process.env['MORPHIQPOS_ORG_DEMO'] ?? '(sin org)'}`);

    const declarados = leerDeclarados();
    const exigirSinFallos = vigilarFallos(page);

    /**
     * LOS ERRORES DE CONSOLA, que hasta hoy no miraba nadie.
     *
     * Un `TypeError: x is not a function` en el cliente no devuelve 500 ni `{ok:false}`:
     * la pantalla se queda a medias y el servidor no se entera. Es exactamente la
     * forma en que un botón «funciona» en la puerta y no hace nada en la mano.
     */
    const enLaConsola: string[] = [];
    page.on('console', (mensaje) => {
      if (mensaje.type() !== 'error') return;
      const texto = mensaje.text();
      if (RUIDO_DE_CONSOLA.some((patron) => patron.test(texto))) return;
      enLaConsola.push(`${page.url().replace(/^https?:\/\/[^/]+/, '')} · ${texto.slice(0, 200)}`);
    });
    page.on('pageerror', (fallo) => {
      enLaConsola.push(`${page.url().replace(/^https?:\/\/[^/]+/, '')} · ${fallo.message}`);
    });

    // Un `confirm()` nativo ES un efecto: se anota y se descarta, que es lo que hace
    // quien no quiere borrar nada. Sin este manejador, Playwright lo descarta solo y
    // el toque parecería no haber hecho nada.
    let dialogosNativos = 0;
    page.on('dialog', (dialogo) => {
      dialogosNativos += 1;
      void dialogo.dismiss();
    });

    // Abrir una pestaña TAMBIÉN es un efecto: es lo que hacen «Mandar por WhatsApp»
    // y los que llevan a un documento. Sin contarlo, un botón que abre WhatsApp se
    // vería exactamente igual que uno muerto.
    let pestanasAbiertas = 0;
    page.on('popup', (abierta) => {
      pestanasAbiertas += 1;
      void abierta.close();
    });

    await entrar(page);

    /**
     * LA CAJA, ABIERTA ANTES DE EMPEZAR.
     *
     * No es un adorno: con la caja cerrada, tres de los cinco modelos aterrizan en
     * un MURO —«La caja está cerrada. Una venta sin caja no pertenece a ningún
     * corte»— que no trae menú lateral, y el rastreo se moría ahí sin haber tocado
     * un solo botón. Y la deja cerrada el propio rastreo anterior: tocar todos los
     * botones incluye tocar «cerrar caja», y `soltarLaCaja` la cierra al terminar
     * para que la corrida siguiente pueda abrir la suya.
     *
     * Se abre por la MISMA ruta que usa el botón, con las mismas cabeceras: pasa por
     * el mismo comando y el mismo gate de rol. Lo que se salta es el diálogo.
     */
    const abrio = await abrirCajaPorLaRuta(page, 150_000);
    bitacora(diario, abrio ? 'caja abierta para el rastreo' : 'la caja ya estaba abierta');

    // ── EL MENÚ · de aquí salen las pantallas, no de una lista mía ─────────
    const menu = await menuLateral(page);
    const entradas = await menu.getByRole('link').evaluateAll((enlaces) =>
      enlaces
        .map((enlace) => ({
          ruta: enlace.getAttribute('href') ?? '',
          etiqueta: (enlace.textContent ?? '').replace(/\s+/g, ' ').trim(),
        }))
        .filter((entrada) => entrada.ruta.startsWith('/')),
    );
    expect(
      entradas.length,
      'El menú de esta demostración no ofrece ninguna pantalla. Sin menú no hay nada que ' +
        'rastrear, y es el defecto que la vuelta 2 encontró: las pantallas existían y no ' +
        'colgaban de ningún sitio.',
    ).toBeGreaterThan(5);

    const muertos: Hallazgo[] = [];
    const inalcanzables: Hallazgo[] = [];
    const externos: string[] = [];
    const declaradosUsados = new Set<string>();
    let tocados = 0;

    for (const entrada of entradas) {
      // ── 1 · SE ABRE POR EL MENÚ ─────────────────────────────────────────
      // Tocando su entrada, no tecleando la URL: un enlace de menú que no navega es
      // un botón muerto como cualquier otro, y así se caza.
      bitacora(diario, `→ ${entrada.ruta} «${entrada.etiqueta}»`);
      try {
        const menuDeLaVuelta = await menuLateral(page);
        await menuDeLaVuelta
          .getByRole('link', { name: entrada.etiqueta, exact: true })
          .first()
          .click({ timeout: TECHO_DE_ACCION_MS });
        await page.waitForURL((url) => url.pathname === entrada.ruta, { timeout: 20_000 });
        await page.waitForLoadState('domcontentloaded');
      } catch (fallo) {
        // Una entrada de menú que no lleva a su pantalla es un botón muerto de los
        // gordos: es la única forma de llegar ahí. Se anota y se sigue con la
        // siguiente, en vez de dejar el rastreo colgado esperando por ella.
        const razon = String(fallo).split('\n')[0] ?? '';
        muertos.push({
          ruta: entrada.ruta,
          etiqueta: entrada.etiqueta,
          camino: 'menú lateral',
          motivo: `la entrada del menú no abrió su pantalla (${razon})`,
        });
        bitacora(diario, `   ¡MUERTA! la entrada del menú no abrió: ${razon}`);
        continue;
      }

      const inventario = await conTecho(
        enumerar(page),
        TECHO_DE_EVALUACION_MS,
        `enumerar ${entrada.ruta}`,
      );
      bitacora(diario, `   ${String(inventario.length)} pieza(s) interactiva(s)`);

      for (const pieza of inventario) {
        if (pieza.deshabilitado || !pieza.visible) continue;
        if (esSalir(pieza.etiqueta)) continue;
        if (pieza.etiquetaHtml === 'a' && saleDeLaAplicacion(pieza.href)) {
          externos.push(`${entrada.ruta} «${pieza.etiqueta}» → ${pieza.href ?? ''}`);
          continue;
        }

        // ── 2 · SE VUELVE AL ESTADO INICIAL ───────────────────────────────
        // Con `goto` y no con el menú: el menú ya demostró que lleva ahí, y hacerlo
        // por él en cada toque triplicaría el rastreo sin probar nada nuevo.
        // `commit` y no `load`: lo que hace falta es que la navegación EMPIECE; el
        // localizador de abajo espera por el elemento, que es esperar por una
        // condición en vez de por la carga entera de una página con veinte
        // consultas. Contra un despliegue real son segundos por toque.
        try {
          await page.goto(entrada.ruta, { waitUntil: 'commit' });
        } catch (fallo) {
          muertos.push({
            ruta: entrada.ruta,
            etiqueta: pieza.etiqueta,
            camino: pieza.camino,
            motivo: `la pantalla no volvió a abrir (${String(fallo).split('\n')[0] ?? ''})`,
          });
          bitacora(diario, `   ¡la pantalla no volvió a abrir! ${entrada.ruta}`);
          continue;
        }

        const suyo = page.locator(pieza.camino);
        if ((await suyo.count()) !== 1) {
          // No reaparece: depende de un estado que este rastreo no reproduce —una fila
          // seleccionada, un diálogo abierto—. No es un defecto; es el límite de rastrear
          // sin saber qué se busca, y se cuenta para que se vea cuánto queda fuera.
          inalcanzables.push({
            ruta: entrada.ruta,
            etiqueta: pieza.etiqueta,
            camino: pieza.camino,
            motivo: 'no reaparece al recargar',
          });
          continue;
        }
        if (!(await suyo.isVisible()) || !(await suyo.isEnabled())) continue;

        const antes = await conTecho(huella(page), TECHO_DE_EVALUACION_MS, 'huella inicial');
        const urlAntes = page.url();
        const dialogosAntes = dialogosNativos;
        const pestanasAntes = pestanasAbiertas;
        let peticiones = 0;
        const contar = (): void => {
          peticiones += 1;
        };
        page.on('request', contar);

        try {
          await suyo.click({ timeout: 7_000 });
        } catch (fallo) {
          page.off('request', contar);
          muertos.push({
            ruta: entrada.ruta,
            etiqueta: pieza.etiqueta,
            camino: pieza.camino,
            motivo: `no se pudo tocar (${String(fallo).split('\n')[0] ?? ''})`,
          });
          continue;
        }

        await page.waitForTimeout(RESPIRO_MS);
        page.off('request', contar);
        tocados += 1;

        const hizoAlgoVisible =
          peticiones > 0 ||
          page.url() !== urlAntes ||
          dialogosNativos > dialogosAntes ||
          pestanasAbiertas > pestanasAntes;
        if (
          hizoAlgoVisible ||
          (await conTecho(huella(page), TECHO_DE_EVALUACION_MS, 'huella tras el toque')) !== antes
        ) {
          continue;
        }

        /**
         * NO PASÓ NADA. Antes de acusar, se comprueba que la pantalla estuviera quieta.
         *
         * Una pantalla que se mueve sola —la cocina refresca, el turno cuenta minutos—
         * no invalida lo de arriba, pero sí lo de abajo: si su huella cambia sin que
         * nadie la toque, «la huella no cambió» tampoco significa nada... y si cambia
         * sola, el caso de arriba ya la habría dado por buena. Así que la segunda
         * muestra sólo se paga cuando hay una acusación que hacer.
         */
        await page.waitForTimeout(RESPIRO_MS);
        if ((await conTecho(huella(page), TECHO_DE_EVALUACION_MS, 'segunda huella')) !== antes) {
          continue;
        }

        const clave = `${entrada.ruta} «${pieza.etiqueta}»`;
        if (declarados.has(clave)) {
          declaradosUsados.add(clave);
          continue;
        }
        muertos.push({
          ruta: entrada.ruta,
          etiqueta: pieza.etiqueta,
          camino: pieza.camino,
          motivo: 'ni petición, ni URL, ni DOM',
        });
        bitacora(diario, `   ¡MUERTO! «${pieza.etiqueta}» ${pieza.camino}`);
      }
    }

    // El resumen va en las ANOTACIONES de la corrida y no en la consola: así queda en
    // el informe de Playwright, se lee con el reportero JSON y no depende de que
    // alguien estuviera mirando la terminal.
    const resumen =
      `${String(entradas.length)} pantalla(s) · ${String(tocados)} toque(s) · ` +
      `${String(inalcanzables.length)} que no reaparecen · ${String(externos.length)} enlace(s) ` +
      `fuera de la aplicación · ${String(declaradosUsados.size)} declarado(s) sin efecto`;
    test.info().annotations.push({ type: 'rastreo', description: resumen });
    bitacora(diario, `— ${resumen}`);
    for (const m of muertos) bitacora(diario, `MUERTO ${m.ruta} «${m.etiqueta}» · ${m.motivo}`);
    for (const c of new Set(enLaConsola)) bitacora(diario, `CONSOLA ${c}`);
    if (externos.length > 0) {
      test.info().annotations.push({ type: 'rastreo-fuera', description: externos.join(' | ') });
    }
    if (inalcanzables.length > 0) {
      test.info().annotations.push({
        type: 'rastreo-sin-alcance',
        description: inalcanzables.map((x) => `${x.ruta} «${x.etiqueta}»`).join(' | '),
      });
    }

    // ── 3 · LO QUE SE EXIGE ─────────────────────────────────────────────────
    expect(
      muertos.map((m) => `${m.ruta} «${m.etiqueta}» · ${m.motivo} · ${m.camino}`),
      'Hay botones que no hacen NADA al tocarlos: ni sale una petición, ni cambia la URL, ni ' +
        'cambia el DOM. Cada uno es una promesa que la pantalla hace y no cumple. Si alguno ' +
        'no debe hacer nada a propósito, decláralo con su motivo en ' +
        'docs/fase-2/CLICS-SIN-EFECTO.md.',
    ).toEqual([]);

    expect(
      [...new Set(enLaConsola)],
      'El navegador escribió errores mientras se tocaba la aplicación. Un error de consola no ' +
        'devuelve 500 ni `{ok:false}`: la pantalla se queda a medias y el servidor no se entera.',
    ).toEqual([]);

    exigirSinFallos();

    // Una declaración que ya no hace falta es una excepción que sobrevive a su
    // motivo, y esta lista sólo puede encogerse.
    const sobrantes = [...declarados.keys()].filter((clave) => !declaradosUsados.has(clave));
    expect(
      sobrantes,
      'Estas declaraciones de CLICS-SIN-EFECTO.md ya no corresponden a ningún botón de esta ' +
        'demostración: o el botón cambió de texto, o ya hace algo. Bórralas.',
    ).toEqual([]);
  });
});
