import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type ConsoleMessage, type Locator, type Page } from '@playwright/test';

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
 * CUÁNTO PUEDE QUEDAR SIN TOCAR antes de que la corrida no signifique nada.
 *
 * Una pieza «sin alcance» es una que se enumeró y, al recargar para volver al estado
 * inicial, ya no estaba: depende de una fila seleccionada, de un diálogo abierto o de
 * un paso anterior. No es un defecto de la aplicación —es el límite de rastrear sin
 * saber qué se busca—, pero sí es el límite de lo que esta prueba puede afirmar.
 *
 * El 15 % no es un número bonito: es el margen en que el rastreo sigue diciendo algo
 * sobre la pantalla entera. Por encima, «cero botones muertos» significa «cero de los
 * que pude tocar», que es otra frase.
 */
const TECHO_SIN_ALCANCE = 0.15;

/** Y no salta con pocas: una pantalla pequeña no puede tirar la corrida. */
const MINIMO_PARA_EL_TECHO = 12;

/** Cuánto se le da a una pantalla para acabar de pintarse, y cada cuánto se mira. */
const TECHO_DE_PINTADO_MS = 15_000;
const MUESTRA_DE_PINTADO_MS = 400;

/**
 * Lo mínimo que se espera al menú, además de que se repita.
 *
 * El marco heredado pinta la barra de la TIENDITA mientras la configuración del
 * negocio viaja, y ese menú equivocado es perfectamente estable mientras dura.
 * Tres segundos es de sobra para una consulta que en producción tarda medio.
 */
const ESPERA_MINIMA_DEL_MENU_MS = 3_000;

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
  /**
   * Las lineas dentro de un bloque de codigo NO son declaraciones.
   *
   * El archivo ensena el formato con un ejemplo dentro de sus comillas triples, y
   * sin esto la prueba lo leia como una declaracion de verdad y despues exigia
   * borrarla por no corresponder a ningun boton: una puerta que encuentra su propio
   * ejemplo y se queja de el.
   */
  let dentroDeUnBloque = false;
  for (const linea of texto.split(/\r?\n/)) {
    if (/^\s*```/.test(linea)) {
      dentroDeUnBloque = !dentroDeUnBloque;
      continue;
    }
    if (dentroDeUnBloque) continue;
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
  /**
   * El 503 del almacén de archivos, que YA está declarado —con su motivo y su fecha
   * de caducidad— en `FALLOS_QUE_SON_UNA_DECISION` de `ayudantes/sesion.ts`.
   *
   * Se repite aquí porque el navegador lo escribe TAMBIÉN en la consola
   * —«Failed to load resource… 503»— y esa línea no pasa por el vigilante de red.
   * Dos vigilantes, una sola decisión: el día que el bucket exista se borran las dos.
   */
  /Failed to load resource: the server responded with a status of 503 /i,
  // La extensión de React, que no está instalada en el navegador de la prueba.
  /Download the React DevTools/i,
  /**
   * Y NADA MÁS. En particular, NO se declara como ruido el 401 que salía en
   * `/login-pos`: era la configuración del negocio pidiéndose sin sesión, y se
   * arregló montando ese proveedor sólo cuando hay cookie. Declararlo como ruido
   * habría escondido el defecto en vez de cerrarlo, que es exactamente lo que esta
   * vuelta vino a dejar de hacer.
   */
];

/**
 * QUÉ RECURSO FALLÓ, no sólo en qué pantalla.
 *
 * ── Por qué hacía falta ───────────────────────────────────────────────────
 * «`/cafeteria/inventario` · Failed to load resource… 400» es una acusación que no
 * se puede accionar: el navegador escribe esa línea sin decir QUÉ pidió, y esa
 * pantalla habla con una decena de rutas. Le pasó a la cafetería tres veces y las
 * tres hubo que salir a buscar a mano de dónde salía el 400.
 *
 * `location().url` de un mensaje de consola de recurso ES la URL del recurso, que es
 * exactamente lo que falta. Se recorta el origen —igual que la pantalla— y se calla
 * cuando no aporta: si es la propia página, o si viene vacío, la línea queda como
 * estaba. Es el mismo servicio que `loQuePedia` presta al vigilante de red.
 */
function recursoDe(mensaje: ConsoleMessage): string {
  const url = mensaje.location().url;
  if (url === '') return '';
  const relativa = url.replace(/^https?:\/\/[^/]+/, '');
  if (relativa === '' || url === mensaje.page()?.url()) return '';
  return ` ← ${relativa.slice(0, 120)}`;
}

/**
 * QUÉ CLASE DE PIEZA ES, porque no se tocan igual.
 *
 * ── El tercio del encargo que faltaba ──────────────────────────────────
 * El encargo de la vuelta 2.3 pedía «botón, enlace y FORMULARIO», y el selector sólo
 * miraba `button, a[href], [role=button], input[type=submit|button]`. Así que de las
 * tres cosas que una pantalla ofrece, una entera —teclear, elegir, marcar y enviar—
 * no la tocaba nadie. Y es donde vive un defecto que no se ve de ninguna otra forma:
 * un `<input value={x}>` sin `onChange` es un campo que **no acepta lo que se
 * teclea**, React lo avisa en consola y la pantalla se ve perfecta.
 *
 * Cada clase tiene su promesa, y es la promesa lo que se comprueba:
 *
 *   boton    → algo pasa: petición, URL, DOM, diálogo o pestaña
 *   campo    → lo que se teclea SE QUEDA
 *   eleccion → lo que se elige SE QUEDA
 *   marca    → la marca CAMBIA de estado
 *
 * Y el formulario, que no es una pieza sino un contenedor, se envía aparte.
 */
type ClaseDePieza = 'boton' | 'campo' | 'eleccion' | 'marca';

interface Clicable {
  /** `main > div:nth-child(2) > button:nth-child(3)`, para volver a encontrarlo. */
  readonly camino: string;
  /**
   * Su POSICIÓN en la lista de piezas de su ámbito.
   *
   * Dentro de una capa flotante el camino del DOM no sirve: la capa vive en un portal
   * al final del `body`, y en cuanto React vuelve a pintar —o en cuanto se abre un
   * selector encima— los `nth-child` de ese portal apuntan a otro nodo. La posición
   * dentro de la capa, en cambio, aguanta: es la misma lista de piezas de la misma
   * capa.
   */
  readonly indice: number;
  /**
   * Lo que la identifica sin mirar su `<label>`: etiqueta, rol, tipo, `name`,
   * marcador y —si es un botón— su texto. Ver el comentario donde se calcula.
   */
  readonly firma: string;
  readonly etiqueta: string;
  readonly etiquetaHtml: string;
  readonly clase: ClaseDePieza;
  /** El `type` de un `input`, vacío en lo demás. Decide qué sonda se teclea. */
  readonly tipo: string;
  /** Lo que el campo trae puesto antes de tocarlo. */
  readonly valor: string;
  readonly soloLectura: boolean;
  readonly href: string | null;
  readonly deshabilitado: boolean;
  readonly visible: boolean;
  /**
   * YA ES LA OPCION PUESTA, y volver a tocarla no cambia nada.
   *
   * Lo dice el propio elemento: `aria-pressed`, `aria-selected`, `aria-checked`,
   * `aria-current` o el `data-state` de un componente de pestanas. Un filtro que
   * ya esta seleccionado, la leche que el cafe YA lleva, la pestana abierta: tocar
   * eso no hace nada y ESTA BIEN que no haga nada. Apagarlo o deshabilitarlo seria
   * peor, porque hay que poder volver a el desde otro.
   *
   * Sin esta regla, la pantalla de opciones de la bebida sola aportaba veintiseis
   * «botones muertos» que no estan muertos: son la eleccion actual. Y al declararlos
   * uno por uno, la lista de excepciones se vuelve ruido donde deberia haber
   * defectos.
   */
  readonly yaActiva: boolean;
}

/**
 * TODO lo que se toca, en un selector.
 *
 * Vive fuera de la función porque hace falta en dos sitios: al enumerar dentro del
 * navegador, y al volver a encontrar una pieza DESDE la prueba —por su posición en
 * esta misma lista— cuando el camino del DOM ya no sirve.
 */
const SELECCION_DE_PIEZAS = [
  'button',
  'a[href]',
  '[role="button"]',
  'input[type="submit"]',
  'input[type="button"]',
  'input:not([type="submit"]):not([type="button"]):not([type="hidden"])',
  'textarea',
  'select',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="radio"]',
].join(', ');

/** Lo que cuenta como capa flotante: ahí es donde Radix monta lo que abre. */
const SELECTOR_DE_CAPA =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], dialog[open]';

/**
 * TODO lo que se puede tocar dentro del ámbito, con su camino.
 *
 * `pantalla` es el `main` y no la página entera: la barra lateral es el MENÚ, y el
 * menú se prueba abriendo cada pantalla por él. Tocar sus enlaces desde cada
 * pantalla multiplicaría por veinte el rastreo sin probar nada nuevo.
 *
 * `capa` es la última capa flotante VISIBLE, que es la de encima. Existe porque
 * Radix monta diálogos y menús en un portal al final del `body` —fuera del `main`— y
 * el rastreo se quedaba en PROFUNDIDAD 1: abría el diálogo, recargaba para volver al
 * estado inicial, y con la recarga el diálogo desaparecía. Todo lo que hay dentro de
 * un diálogo de cobro, de confirmación o de alta **no lo tocaba nadie**.
 */
async function enumerar(
  page: Page,
  ambito: 'pantalla' | 'capa' = 'pantalla',
): Promise<readonly Clicable[]> {
  return page.evaluate(
    ({ ambito, selectorDeCapa, seleccion }) => {
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

      function tieneTamano(elemento: Element): boolean {
        const caja = elemento.getBoundingClientRect();
        return caja.width > 0 && caja.height > 0;
      }

      const capas = [...document.querySelectorAll(selectorDeCapa)].filter(tieneTamano);
      const raiz =
        ambito === 'capa'
          ? (capas[capas.length - 1] ?? null)
          : (document.querySelector('main') ?? document.body);
      if (raiz === null) return [];

      const MARCAS = ['checkbox', 'radio'];

      return [...raiz.querySelectorAll(seleccion)].map((elemento, indice) => {
        const html = elemento as HTMLElement & {
          disabled?: boolean;
          value?: string;
          readOnly?: boolean;
          checked?: boolean;
          type?: string;
        };
        const etiquetaHtml = elemento.tagName.toLowerCase();
        const rol = elemento.getAttribute('role') ?? '';
        const tipo = (html.type ?? '').toLowerCase();

        /**
         * QUÉ ES ESTO, en el orden en que importa.
         *
         * El `role` gana sobre la etiqueta porque Radix construye una casilla con un
         * `<button role="checkbox">`: por etiqueta sería un botón, y la promesa de un
         * botón —que pase algo— no es la de una casilla —que cambie de marca—.
         */
        const clase: 'boton' | 'campo' | 'eleccion' | 'marca' =
          rol === 'checkbox' || rol === 'switch' || rol === 'radio'
            ? 'marca'
            : etiquetaHtml === 'select'
              ? 'eleccion'
              : etiquetaHtml === 'input' && MARCAS.includes(tipo)
                ? 'marca'
                : etiquetaHtml === 'textarea' ||
                    (etiquetaHtml === 'input' && tipo !== 'submit' && tipo !== 'button')
                  ? 'campo'
                  : 'boton';

        /**
         * EL NOMBRE DE UN CAMPO NO ESTÁ DENTRO DE ÉL.
         *
         * Un `<input>` no tiene texto; lo tiene su `<label>`. Sin esto todos los campos
         * se llamarían igual —cadena vacía— y el informe diría «"" no acepta lo que se
         * teclea» once veces sin decir en cuál de los once.
         */
        function nombreDe(): string {
          const aria = elemento.getAttribute('aria-label');
          if (aria !== null && aria.trim() !== '') return aria;
          const id = elemento.getAttribute('id');
          if (id !== null && id !== '') {
            const rotulo = document.querySelector(`label[for="${CSS.escape(id)}"]`);
            if (rotulo !== null) return (rotulo as HTMLElement).innerText ?? '';
          }
          const envuelve = elemento.closest('label');
          if (envuelve !== null) return (envuelve as HTMLElement).innerText ?? '';
          const marcador = elemento.getAttribute('placeholder');
          if (marcador !== null && marcador.trim() !== '') return marcador;
          const nombre = elemento.getAttribute('name');
          if (nombre !== null && nombre !== '') return nombre;
          return '';
        }

        const crudo =
          clase === 'boton'
            ? (elemento.getAttribute('aria-label') ?? html.innerText ?? html.value ?? '')
            : nombreDe();
        const texto = crudo.replace(/\s+/g, ' ').trim();

        /**
         * LA FIRMA: lo que identifica a una pieza SIN depender de su `<label>`.
         *
         * Hace falta para volver a encontrarla dentro de una capa flotante, donde el
         * camino del DOM no sirve. Y no puede usar el rótulo: el de un campo sale de su
         * `<label>` —que está fuera del elemento— y recalcularlo desde otro `evaluate`
         * daría otra cosa. Lo que sí está EN el elemento y no cambia al repintar es su
         * etiqueta, su rol, su tipo, su `name` y su marcador; y para un botón, su texto.
         */
        const firma = [
          etiquetaHtml,
          rol,
          tipo,
          elemento.getAttribute('name') ?? '',
          elemento.getAttribute('placeholder') ?? '',
          clase === 'boton' ? (html.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) : '',
        ].join('|');

        return {
          camino: caminoDe(elemento),
          indice,
          firma,
          etiqueta: texto.slice(0, 80),
          etiquetaHtml,
          clase,
          tipo,
          valor: html.value ?? '',
          soloLectura: html.readOnly === true || elemento.getAttribute('aria-readonly') === 'true',
          href: elemento.getAttribute('href'),
          deshabilitado:
            html.disabled === true || elemento.getAttribute('aria-disabled') === 'true',
          /**
           * VISIBLE es TENER TAMAÑO, no tener un padre posicionado.
           *
           * ── Los 68 hallazgos que este `||` inventó ───────────────────────
           * La pantalla de recetas del heredado es un acordeón que cierra sus filas con
           * `gridTemplateRows: '0fr'` y `overflow-hidden`: los botones de dentro siguen
           * teniendo `offsetParent` y un rectángulo —de ALTO CERO—, así que entraban al
           * inventario y después no se podían tocar. 68 «no se pudo tocar» en la tiendita
           * que no eran defectos: eran botones dentro de un cajón cerrado.
           *
           * Nadie puede tocar algo de tamaño cero. Si el acordeón se abre, sus botones
           * miden y entran; cerrado, no existen para esto —y eso se cuenta aparte—.
           */
          visible: (() => {
            const caja = elemento.getBoundingClientRect();
            if (caja.width <= 0 || caja.height <= 0) return false;
            /**
             * Y NO ESTAR RECORTADO A NADA por un ancestro que oculta lo que sobra.
             *
             * ── El caso real, y por qué el tamaño no basta ──────────────────
             * La pantalla de recetas del heredado cierra sus filas con
             * `gridTemplateRows: '0fr'` más `overflow-hidden`: el contenedor mide CERO y
             * el botón de dentro conserva su tamaño natural —recortado, invisible y
             * fuera de alcance—. Con sólo mirar el tamaño del botón entraban 66 en la
             * tiendita y 75 en la ferretería: cajones cerrados, no botones muertos.
             *
             * Se compara contra cada ancestro que RECORTA. Si el botón no cruza con
             * alguno de ellos, nadie puede verlo ni tocarlo. Y OJO: esto NO tapa el
             * caso de «algo lo cubre» —una barra lateral encima—, que no recorta nada y
             * sigue saliendo como hallazgo. Ese fue un defecto de verdad.
             */
            let padre = elemento.parentElement;
            while (padre !== null) {
              const estilo = window.getComputedStyle(padre);
              const recorta =
                estilo.overflow !== 'visible' ||
                estilo.overflowX !== 'visible' ||
                estilo.overflowY !== 'visible';
              if (recorta) {
                const suya = padre.getBoundingClientRect();
                const cruza =
                  caja.right > suya.left &&
                  caja.left < suya.right &&
                  caja.bottom > suya.top &&
                  caja.top < suya.bottom;
                if (!cruza) return false;
              }
              padre = padre.parentElement;
            }
            return true;
          })(),
          yaActiva:
            elemento.getAttribute('aria-pressed') === 'true' ||
            elemento.getAttribute('aria-selected') === 'true' ||
            elemento.getAttribute('aria-checked') === 'true' ||
            (elemento.getAttribute('aria-current') ?? 'false') !== 'false' ||
            ['active', 'checked', 'on'].includes(elemento.getAttribute('data-state') ?? '') ||
            // Una casilla o un radio YA marcados: volver a tocar un radio marcado no
            // cambia nada, y está bien que no cambie.
            (MARCAS.includes(tipo) && html.checked === true),
        };
      });
    },
    { ambito, selectorDeCapa: SELECTOR_DE_CAPA, seleccion: SELECCION_DE_PIEZAS },
  );
}

/**
 * LOS FORMULARIOS de la pantalla, que son la cuarta cosa que se puede hacer.
 *
 * Un formulario se ENVÍA, y enviarlo no es tocar ninguno de sus campos ni ninguno de
 * sus botones: hay pantallas cuyo `<form onSubmit=…>` se manda con Enter y no tiene
 * botón de envío. Sin esto, ese camino no lo recorría nadie.
 */
async function enumerarFormularios(
  page: Page,
): Promise<readonly { readonly camino: string; readonly etiqueta: string }[]> {
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
    return [...raiz.querySelectorAll('form')]
      .filter((formulario) => {
        const caja = formulario.getBoundingClientRect();
        return caja.width > 0 && caja.height > 0;
      })
      .map((formulario, indice) => ({
        camino: caminoDe(formulario),
        etiqueta:
          formulario.getAttribute('aria-label') ??
          formulario.getAttribute('name') ??
          `formulario ${String(indice + 1)}`,
      }));
  });
}

/**
 * LA SONDA que se teclea en un campo, por tipo.
 *
 * Tiene que ser VÁLIDA para el tipo: un «Prueba9» en un `input type="number"` lo deja
 * vacío —el navegador rechaza lo que no es número— y el campo parecería no aceptar
 * nada cuando funciona perfectamente. Un falso positivo cuesta lo mismo que un
 * defecto.
 *
 * `null` es «este campo no se sondea»: un selector de archivo necesita un archivo de
 * verdad y un selector de color abre un diálogo del sistema operativo, que no es de
 * la aplicación.
 */
function sondaPara(tipo: string): string | null {
  /**
   * LISTA DE LO QUE SE SONDEA, y no lista de lo que no.
   *
   * Empezó al revés —se sondeaba todo menos color, archivo e imagen— y la corrida
   * contra producción contestó `locator.fill: Malformed value` en un campo de
   * Configuración: hay tipos cuyo valor válido no es una cadena cualquiera, y un
   * selector de rango no acepta un número fuera de su `min`/`max`. Con una lista de
   * exclusiones, cada tipo nuevo del navegador entra por omisión y falla en la cara.
   *
   * Así que se declara lo que SÍ se sabe teclear. Lo que no está aquí no se sondea y
   * se CUENTA —sale en el resumen—, en vez de inventar un defecto.
   */
  switch (tipo) {
    case 'number':
      return '2';
    case 'date':
      return '2026-09-21';
    case 'time':
      return '12:30';
    case 'datetime-local':
      return '2026-09-21T12:30';
    case 'month':
      return '2026-09';
    case 'week':
      return '2026-W38';
    case 'email':
      return 'prueba@ejemplo.mx';
    case 'tel':
      return '5512345678';
    case 'url':
      return 'https://ejemplo.mx';
    // La cadena vacía es un `<textarea>`, que no tiene `type`.
    case 'text':
    case 'search':
    case 'password':
    case '':
      return 'Prueba9';
    default:
      return null;
  }
}

/**
 * EL PREFIJO DE URL DE CADA MODELO. No coincide con el slug en dos de los cinco.
 *
 * `tienda` sirve en `/abarrotes/` y `estetica` en `/estetica-salon/`, y eso no es un
 * descuido: los módulos se llamaron por el negocio y las plantillas por el paquete.
 * Lo usan dos cosas —esperar a que el menú sea el de este negocio, y llegar a las
 * cuatro pantallas que no cuelgan de ningún menú—, así que vive una sola vez.
 */
const PREFIJO_DEL_MODELO: Readonly<Record<string, string>> = {
  tienda: '/abarrotes/',
  cafeteria: '/cafeteria/',
  restaurante: '/restaurante/',
  ferreteria: '/ferreteria/',
  estetica: '/estetica-salon/',
};

/** El modelo de esta corrida, que la demostración dice en su propio slug. */
function modeloDeLaDemo(): string {
  return (process.env['MORPHIQPOS_ORG_DEMO'] ?? '').replace('demo-acople-', '');
}

/**
 * LAS CUATRO PANTALLAS QUE NO CUELGAN DE NINGÚN MENÚ.
 *
 * Están exentas del menú por razones buenas y escritas en
 * `docs/fase-2/EXCEPCIONES-COBERTURA.md`: las dos de acceso con PIN se ven ANTES de
 * que exista sesión —ofrecerle «entrar» a quien ya entró es absurdo— y el portal del
 * comensal y el menú público los abre el CLIENTE con el QR de su mesa, sin sesión de
 * negocio y sin barra lateral.
 *
 * Exentas del MENÚ no es exentas del RASTREO. Eran cuatro pantallas con sus botones
 * que no visitaba nadie, y para eso están aquí: se llega por su URL, que es como se
 * llega de verdad.
 */
const PANTALLAS_SIN_MENU: readonly string[] = [
  '/restaurante/acceso-por-pin',
  '/restaurante/portal-del-comensal',
  '/cafeteria/acceso-por-pin',
  '/cafeteria/menu-publico-y-pedido-anticipado',
];

/**
 * ESPERA A QUE EL MENÚ SEA EL DEL NEGOCIO, y no el de otro.
 *
 * ── El parpadeo que envenenaba la lista de pantallas ──────────────────
 * El marco heredado pinta la barra con `paquete_modo: 'tienda'` MIENTRAS la
 * configuración del negocio viaja —está escrito en su propio código: «la plantilla
 * más restrictiva no parpadea hacia arriba»—. Así que durante ese instante una
 * cafetería ofrece las pantallas de la tiendita.
 *
 * El rastreador enumeraba el menú en ese instante y se llevaba `/abarrotes/cobrar`,
 * `/abarrotes/fiado`, `/abarrotes/producto`… y después, al ir a tocarlas, ya no
 * estaban: cinco «la entrada del menú no abrió su pantalla» que no eran defectos del
 * producto sino del momento en que se miró.
 *
 * Se espera a que la lista de destinos se REPITA: dos muestras iguales seguidas y
 * el menú ya es el del negocio.
 */
async function esperarAQueElMenuSeAsiente(page: Page, menu: Locator): Promise<void> {
  const rutas = (): Promise<string> =>
    menu.getByRole('link').evaluateAll((enlaces) =>
      enlaces
        .map((enlace) => enlace.getAttribute('href') ?? '')
        .sort((a, b) => a.localeCompare(b))
        .join('|'),
    );

  /**
   * LA SEÑAL QUE NO ES UNA HEURÍSTICA: que el menú traiga LAS PANTALLAS DE SU MODELO.
   *
   * La demostración dice cuál es en su propio slug —`demo-acople-estetica`— y cada
   * modelo tiene su prefijo de rutas. Mientras la configuración viaja, el marco
   * heredado pinta el menú de la TIENDITA; en cuanto llega, aparecen las del modelo.
   * Así que esperar «hasta que haya al menos una ruta de mi prefijo» es exacto, y no
   * un tiempo inventado: tres segundos bastaron cuatro veces y a la quinta no.
   *
   * Para la tiendita el prefijo coincide con el del parpadeo, y ahí no hay nada que
   * distinguir —su menú correcto ES el que se pinta primero—, así que el tiempo
   * mínimo se queda como segundo cerrojo.
   */
  const miPrefijo = PREFIJO_DEL_MODELO[modeloDeLaDemo()];

  /**
   * Y NO BASTA CON QUE SE REPITA DOS VECES.
   *
   * El menú de la tiendita es ESTABLE mientras la configuración viaja: dos muestras
   * a 400 ms de distancia pueden caer las dos dentro del parpadeo y dar por asentado
   * el menú equivocado. Pasó en la corrida contra producción de la estética: se
   * llevó `/abarrotes/cobrar` y después no estaba.
   *
   * Así que se exige lo uno Y lo otro: que se repita, y que haya pasado el tiempo en
   * el que esa consulta ya tuvo que contestar.
   */
  const desde = Date.now();
  let anterior = '';
  const limite = desde + TECHO_DE_PINTADO_MS;
  while (Date.now() < limite) {
    const ahora = await conTecho(rutas(), TECHO_DE_EVALUACION_MS, 'leer el menú');
    const estable = ahora === anterior && ahora !== '';
    const conLoSuyo = miPrefijo === undefined || ahora.includes(miPrefijo);
    if (estable && conLoSuyo && Date.now() - desde >= ESPERA_MINIMA_DEL_MENU_MS) return;
    anterior = ahora;
    await page.waitForTimeout(MUESTRA_DE_PINTADO_MS);
  }
}

/**
 * ESPERA A QUE LA PANTALLA ACABE DE PINTARSE, y no a que el HTML llegue.
 *
 * ── El defecto que esto arregla, y era el que vacíaba el rastreo ────────
 * La primera corrida completa dijo «16 pantallas · 0 toques» y «0 pieza(s)
 * interactiva(s)» en pantallas que tienen doce botones a la vista. No era que no
 * hubiera botones: es que se contaban ANTES de que existieran. Estas pantallas son
 * componentes de cliente que piden sus datos en un `useEffect`; con
 * `domcontentloaded` el marco ya está y el contenido todavía no.
 *
 * Un rastreador que mide una pantalla vacía da verde sin haber tocado nada, que es
 * la peor clase de verde.
 *
 * ── Y por qué no `networkidle` ──────────────────────────────────
 * Porque varias de estas pantallas consultan EN BUCLE —la cocina refresca cada
 * pocos segundos— y la red nunca queda quieta: esperarla dejó el navegador colgado
 * hasta que Chromium enseñó «This page couldn't load», y Playwright lo advierte de
 * su propia API. Lo que se espera es que el NÚMERO de piezas interactivas se
 * ESTABILICE: dos muestras iguales seguidas y se da por pintada.
 */
async function esperarAQueSePinte(page: Page): Promise<number> {
  const contar = (): Promise<number> =>
    page.evaluate(() => {
      const raiz = document.querySelector('main') ?? document.body;
      return raiz.querySelectorAll(
        'button, a[href], [role="button"], input[type="submit"], input[type="button"]',
      ).length;
    });

  let anterior = -1;
  const limite = Date.now() + TECHO_DE_PINTADO_MS;
  while (Date.now() < limite) {
    const ahora = await conTecho(contar(), TECHO_DE_EVALUACION_MS, 'contar piezas');
    // Estable Y con algo dentro: una pantalla que todavía no trajo sus datos
    // también da dos ceros seguidos, y eso es lo que había que dejar de creer.
    if (ahora === anterior && ahora > 0) return ahora;
    anterior = ahora;
    await page.waitForTimeout(MUESTRA_DE_PINTADO_MS);
  }
  return anterior;
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
    /**
     * EL ESTADO DE LO INTERACTIVO, que el texto NO dice.
     *
     * ── El punto ciego que esto cierra ─────────────────────────────
     * Elegir «Del banco» en la caja de la tiendita cambia el ESTADO y el color del
     * botón, y nada más: ni una petición, ni la URL, ni una palabra del texto. La
     * huella miraba `innerText` y el número de nodos, así que ese toque parecía no
     * hacer nada y el rastreador acusó a cuatro botones que funcionan.
     *
     * Ahora entra `aria-pressed`, `aria-selected`, `aria-checked`, `data-state` y la
     * CLASE de cada pieza interactiva: un cambio de variante es un cambio visible,
     * y confundirlo con un botón muerto es exactamente lo que esta prueba no debe
     * hacer —un falso positivo cuesta lo mismo que un defecto—.
     */
    const estados = [
      ...document.querySelectorAll(
        'button, a[href], [role="button"], input[type="submit"], input[type="button"], [role="tab"]',
      ),
    ]
      .map((elemento) =>
        [
          elemento.getAttribute('aria-pressed') ?? '',
          elemento.getAttribute('aria-selected') ?? '',
          elemento.getAttribute('aria-checked') ?? '',
          elemento.getAttribute('aria-current') ?? '',
          elemento.getAttribute('data-state') ?? '',
          elemento.getAttribute('class') ?? '',
        ].join(','),
      )
      .join(';');
    /**
     * Y EL FOCO. Un botón que deja el cursor donde se va a escribir —«Nuevo
     * servicio»— hace algo aunque no cambie una palabra de la pantalla.
     */
    const enfocado = document.activeElement;
    const foco =
      enfocado === null
        ? ''
        : `${enfocado.tagName}:${enfocado.getAttribute('id') ?? ''}:${enfocado.getAttribute('name') ?? ''}`;
    return [
      document.querySelectorAll('*').length,
      dialogos.length,
      texto.length,
      texto.slice(0, 6000),
      estados.slice(0, 6000),
      foco,
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
  /**
   * SIN REINTENTOS, ni en CI.
   *
   * La configuración da uno en CI para distinguir fragilidad de un contenedor con mal
   * día, y para las cinco suites del acople —de medio minuto cada una— eso es barato.
   * Aquí no: un rastreo del restaurante son 13.8 minutos MEDIDOS, así que un reintento
   * duplica el trabajo más lento de la tubería. Y peor que el coste: lo que esto
   * encuentra son botones que no hacen NADA, y eso no falla una vez de cada tres. Si
   * sale rojo hay que mirarlo, no volver a tirar el dado.
   */
  test.describe.configure({ retries: 0 });

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
    /**
     * LA VENTANA DE SONDEO, y por qué hace falta.
     *
     * Enviar un formulario con datos de sonda es una escritura de verdad, y el servidor
     * hace lo correcto: la rechaza con 400 `ENTRADA_INVALIDA`. Eso NO es una respuesta
     * rota —es la validación funcionando— y sin esta ventana el rastreo acusaría a la
     * aplicación de reventar justo cuando mejor se comporta.
     *
     * Sólo tapa el 400 y el 422, y sólo mientras se envía un formulario de sonda: un
     * 404 sigue siendo una ruta que no existe, un 5xx sigue siendo que revienta, y un
     * `{ok:false}` con 200 sigue siendo un dato que no llegó.
     */
    let sondeando = false;
    const exigirSinFallos = vigilarFallos(page, { sondeando: () => sondeando });

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
      /**
       * Y EL RUIDO QUE HACE EL PROPIO SONDEO.
       *
       * Al enviar un formulario con datos de sonda, el servidor lo rechaza —400, que
       * es la validación funcionando— y el navegador escribe «Failed to load resource:
       * 400» en la consola por su cuenta. Eso ya está contemplado en el vigilante de
       * respuestas; aquí llegaba por otra puerta y hacía fallar la corrida de la
       * cafetería acusando a la aplicación de romperse justo cuando se comporta bien.
       */
      if (sondeando && /Failed to load resource.*\b(400|422)\b/i.test(texto)) return;
      enLaConsola.push(
        `${page.url().replace(/^https?:\/\/[^/]+/, '')} · ${texto.slice(0, 200)}${recursoDe(mensaje)}`,
      );
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

    /**
     * IMPRIMIR Y COPIAR SON EFECTOS, y ninguno de los dos se ve.
     *
     * `window.print()` abre el diálogo del sistema operativo —no un diálogo de la
     * página, así que no llega por `page.on('dialog')`— y `clipboard.writeText` escribe
     * en el portapapeles: los dos dejan la página EXACTAMENTE igual. Sin instrumentar
     * los dos, cada botón de imprimir y cada botón de copiar del sistema sale como un
     * botón muerto, que es lo que le pasó a «Imprimir» del ticket de la ferretería.
     *
     * Se envuelven ANTES de que cargue nada —`addInitScript` corre en cada documento
     * nuevo, antes del código de la página— y se cuentan en el `window`. La alternativa
     * era declararlos uno por uno como clics sin efecto, y eso es exactamente la lista
     * de excepciones que crece con la misma excepción repetida.
     */
    await page.addInitScript(() => {
      const ventana = window as unknown as { __rastreoInvisibles?: number };
      ventana.__rastreoInvisibles = 0;
      // NO se llama al original: abrir el diálogo de impresión del sistema deja el
      // navegador bloqueado esperando a una persona que no existe.
      window.print = () => {
        ventana.__rastreoInvisibles = (ventana.__rastreoInvisibles ?? 0) + 1;
      };
      const portapapeles = navigator.clipboard as
        { writeText?: (texto: string) => Promise<void> } | undefined;
      if (portapapeles?.writeText !== undefined) {
        const original = portapapeles.writeText.bind(portapapeles);
        portapapeles.writeText = async (texto: string) => {
          ventana.__rastreoInvisibles = (ventana.__rastreoInvisibles ?? 0) + 1;
          return original(texto).catch(() => undefined);
        };
      }
    });

    /** Cuántas veces se ha impreso o copiado desde que cargó esta página. */
    const invisibles = async (): Promise<number> =>
      page
        .evaluate(
          () => (window as unknown as { __rastreoInvisibles?: number }).__rastreoInvisibles ?? 0,
        )
        .catch(() => 0);

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

    /**
     * EL TABLERO, que es donde vive el MENÚ.
     *
     * El marco de `(modelos)` es a propósito casi nada —«cada modelo tiene su
     * propia jerarquía y su propia pantalla de inicio; un marco con opinión se la
     * quitaría a los cinco»— así que las pantallas de los cinco modelos NO traen
     * barra lateral. La barra es del marco `(interno)`, y el tablero es `/`.
     *
     * Y la casa de quien entra es una pantalla de modelo: el rastreo aterrizaba en
     * el mapa de mesas, buscaba el menú ahí, encontraba la navegación de ZONAS del
     * salón —que también es un `nav`— y se paraba diciendo que el menú no ofrecía
     * ninguna pantalla. No era verdad: estaba mirando el sitio equivocado.
     */
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // ── EL MENÚ · de aquí salen las pantallas, no de una lista mía ─────────
    const menu = await menuLateral(page);
    await esperarAQueElMenuSeAsiente(page, menu);
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

    // EL MENÚ ENTERO a la bitácora. Sin esto, un menú que ofrece dos cosas distintas
    // con el mismo nombre no se ve en ninguna parte.
    bitacora(diario, `menú · ${String(entradas.length)} entrada(s)`);
    for (const e of entradas) bitacora(diario, `   ${e.ruta} «${e.etiqueta}»`);

    /**
     * DOS ENTRADAS CON EL MISMO NOMBRE Y DISTINTO DESTINO.
     *
     * `navegacionDePlantilla` lo prohibe con estas palabras: «un menú con dos
     * entradas llamadas «Caja» que van a sitios distintos no es un menú completo:
     * es uno que obliga a adivinar». Si aparece, el menú que se PINTA no es el que
     * esa función devuelve, y quien lo usa tiene que adivinar cuál de las dos es la
     * suya. Se mide aquí porque aquí es donde se ve lo que de verdad se pinta.
     */
    const porEtiqueta = new Map<string, Set<string>>();
    for (const e of entradas) {
      const rutas = porEtiqueta.get(e.etiqueta) ?? new Set<string>();
      rutas.add(e.ruta);
      porEtiqueta.set(e.etiqueta, rutas);
    }
    const ambiguas = [...porEtiqueta.entries()]
      .filter(([, rutas]) => rutas.size > 1)
      .map(([etiqueta, rutas]) => `«${etiqueta}» → ${[...rutas].sort().join(' y ')}`);
    for (const linea of ambiguas) bitacora(diario, `AMBIGUA ${linea}`);

    const muertos: Hallazgo[] = [];
    const inalcanzables: Hallazgo[] = [];
    const externos: string[] = [];
    const declaradosUsados = new Set<string>();
    let tocados = 0;
    let yaActivas = 0;
    /** Piezas que SÍ se podían tocar. Es el denominador del umbral de alcance. */
    let elegibles = 0;
    let enCapas = 0;
    let camposSondeados = 0;
    /** Campos de un tipo que la sonda no sabe teclear. Se cuentan, no se callan. */
    let camposSinSonda = 0;
    let formulariosEnviados = 0;
    let pantallasBarridas = 0;
    /** Las de `PANTALLAS_SIN_MENU` que no se barrieron, con su motivo. */
    const sinMenuNoVisitadas: string[] = [];

    /**
     * TOCAR UNA PIEZA, según lo que esa pieza promete.
     *
     * Devuelve el motivo por el que está muerta, o `null` si cumplió. El estado inicial
     * lo restaura quien llama —recargando— y por eso aquí no se deshace nada: dentro de
     * una capa flotante no se puede recargar sin cerrarla.
     */
    async function tocar(pieza: Clicable, suyo: Locator): Promise<string | null> {
      // ── CAMPO · lo que se teclea SE QUEDA ──────────────────────────────
      if (pieza.clase === 'campo') {
        if (pieza.soloLectura) return null;
        const sonda = sondaPara(pieza.tipo);
        if (sonda === null) {
          camposSinSonda += 1;
          return null;
        }
        camposSondeados += 1;
        try {
          await suyo.fill(sonda, { timeout: 5_000 });
        } catch (fallo) {
          const razon = String(fallo).split('\n')[0] ?? '';
          /**
           * LA SONDA NO SE PUDO APLICAR, QUE NO ES LO MISMO QUE UN CAMPO MUERTO.
           *
           * «Element is not an <input>» y «Malformed value» son límites de la SONDA —ahí
           * no hay un campo, o el valor no vale para ese tipo de campo— y acusar por eso
           * es inventar un defecto. Un campo que de verdad no se puede escribir —tapado,
           * deshabilitado sin decirlo— falla de otra forma: por tiempo o por «not
           * visible», y eso sí cuenta.
           */
          if (/not an <input>|Malformed value|does not have a role/i.test(razon)) {
            return `SONDA:${razon}`;
          }
          return `no se pudo teclear en el campo (${razon})`;
        }
        const quedo = await suyo.inputValue({ timeout: 5_000 }).catch(() => '');
        /**
         * Un campo con máscara reescribe lo que se teclea, y eso no es estar muerto:
         * «5512345678» puede quedar «55 1234 5678» y un campo de dinero puede quedar
         * «2.00». Lo que delata al campo muerto es que **no cambió NADA**: sigue
         * exactamente como estaba antes de tocarlo.
         */
        if (quedo === sonda || quedo !== pieza.valor) return null;

        /**
         * ANTES DE ACUSAR, SE TECLEA DE VERDAD.
         *
         * `fill` pone el valor y lanza un evento `input`; hay componentes que escuchan
         * `keydown` o que sólo aceptan el cambio si viene de pulsaciones. Un campo
         * REALMENTE muerto —un `value` sin `onChange`— no acepta ni lo uno ni lo otro,
         * así que esta segunda vía sólo puede quitar falsos positivos, nunca añadir
         * defectos. Y cuesta una décima de segundo en los pocos campos que llegan aquí.
         */
        await suyo.click({ timeout: 3_000 }).catch(() => undefined);
        await suyo.pressSequentially(sonda, { delay: 15, timeout: 5_000 }).catch(() => undefined);
        const trasTeclear = await suyo.inputValue({ timeout: 5_000 }).catch(() => '');
        if (trasTeclear !== pieza.valor) return null;
        return `el campo no acepta lo que se teclea: sigue en «${pieza.valor}» tras escribir «${sonda}» con \`fill\` Y tecla por tecla (un \`value\` sin \`onChange\` se ve así)`;
      }

      // ── ELECCIÓN · lo que se elige SE QUEDA ────────────────────────────
      if (pieza.clase === 'eleccion') {
        const opciones = await suyo
          .locator('option')
          .evaluateAll((lista) =>
            lista
              .map((o) => ({
                valor: (o as HTMLOptionElement).value,
                deshabilitada: (o as HTMLOptionElement).disabled,
              }))
              .filter((o) => !o.deshabilitada),
          )
          .catch(() => []);
        const otra = opciones.find((o) => o.valor !== pieza.valor);
        // Un selector con una sola opción no puede cambiar, y no es un defecto suyo.
        if (otra === undefined) return null;
        try {
          await suyo.selectOption(otra.valor, { timeout: 5_000 });
        } catch (fallo) {
          return `no se pudo elegir en el selector (${String(fallo).split('\n')[0] ?? ''})`;
        }
        const quedo = await suyo.inputValue({ timeout: 5_000 }).catch(() => '');
        if (quedo === otra.valor) return null;
        return `el selector no guarda lo que se elige: sigue en «${pieza.valor}» tras elegir «${otra.valor}»`;
      }

      // ── MARCA · la marca CAMBIA ────────────────────────────────────────
      if (pieza.clase === 'marca') {
        const estadoDe = async (): Promise<string> =>
          suyo
            .evaluate((elemento) => {
              const html = elemento as HTMLElement & { checked?: boolean };
              return [
                html.checked === true ? '1' : '0',
                elemento.getAttribute('aria-checked') ?? '',
                elemento.getAttribute('data-state') ?? '',
              ].join('/');
            })
            .catch(() => '');
        const antes = await estadoDe();
        try {
          await suyo.click({ timeout: 5_000 });
        } catch (fallo) {
          return `no se pudo marcar (${String(fallo).split('\n')[0] ?? ''})`;
        }
        await page.waitForTimeout(RESPIRO_MS);
        if ((await estadoDe()) !== antes) return null;
        return `la marca no cambia de estado al tocarla (sigue en «${antes}»)`;
      }

      // ── BOTÓN · que pase algo ──────────────────────────────────────────
      const antes = await conTecho(huella(page), TECHO_DE_EVALUACION_MS, 'huella inicial');
      const urlAntes = page.url();
      const dialogosAntes = dialogosNativos;
      const pestanasAntes = pestanasAbiertas;
      const invisiblesAntes = await invisibles();
      let peticiones = 0;
      const contar = (): void => {
        peticiones += 1;
      };
      page.on('request', contar);

      // EL RATÓN PRIMERO. Hay tarjetas cuyos botones sólo aparecen —o sólo reciben
      // el clic— al pasar por encima: «Imprimir ficha», «Editar receta» y «Eliminar
      // receta» de la pantalla de recetas son de ésas, y sin esto salen como
      // «no se pudo tocar» cuando un usuario de escritorio las toca sin problema.
      await suyo.hover({ timeout: 3_000 }).catch(() => {
        /* si no se puede ni pasar por encima, el clic lo dirá */
      });
      try {
        await suyo.click({ timeout: 7_000 });
      } catch (fallo) {
        page.off('request', contar);
        return `no se pudo tocar (${String(fallo).split('\n')[0] ?? ''})`;
      }

      await page.waitForTimeout(RESPIRO_MS);
      page.off('request', contar);

      const hizoAlgo =
        peticiones > 0 ||
        page.url() !== urlAntes ||
        dialogosNativos > dialogosAntes ||
        pestanasAbiertas > pestanasAntes ||
        (await invisibles()) > invisiblesAntes;
      if (hizoAlgo) return null;
      if (
        (await conTecho(huella(page), TECHO_DE_EVALUACION_MS, 'huella tras el toque')) !== antes
      ) {
        return null;
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
        return null;
      }
      return 'ni petición, ni URL, ni DOM';
    }

    /** Cuántas capas flotantes hay abiertas ahora mismo. */
    async function capasAbiertas(): Promise<number> {
      return page.locator(SELECTOR_DE_CAPA).filter({ visible: true }).count();
    }

    /**
     * PROFUNDIDAD 2 · lo que hay DENTRO de la capa que se acaba de abrir.
     *
     * ── Por qué el rastreo se quedaba en profundidad 1 ─────────────────────
     * El ámbito era el `main`, y Radix monta diálogos, menús y listas en un portal al
     * final del `body`. Y como entre toque y toque se RECARGA para volver al estado
     * inicial, la recarga cerraba el diálogo antes de que nadie mirara dentro. Así que
     * todo lo que vive dentro de un diálogo —el cobro, el alta, la confirmación de
     * borrado, el selector de un combo— no lo tocaba nadie.
     *
     * ── Los dos defectos que tuvo esto ANTES de creerle nada ───────────────
     * La primera versión acusó a 66 piezas en la tiendita, 36 de ellas con «no se pudo
     * tocar». Era falso, y se midió por qué: dentro del diálogo de «Registrar gasto»,
     * `elementFromPoint` devolvía la pieza correcta y `pointer-events` valía `auto` en
     * todas. Es decir, un humano las toca sin problema.
     *
     *   1 · SE BUSCABAN POR EL CAMINO DEL DOM. La capa vive en un portal al final del
     *       `body`, así que en cuanto React repinta —o en cuanto se abre un selector
     *       encima— los `nth-child` de ese camino apuntan a OTRO nodo: al velo, por
     *       ejemplo, que sí está cubierto por el diálogo. De ahí los treinta y seis
     *       «no se pudo tocar». Ahora se busca por POSICIÓN dentro de la capa, y se
     *       comprueba que la etiqueta siga siendo la misma antes de tocarla.
     *   2 · UN TOQUE PUEDE ABRIR OTRA CAPA. El primer clic del diálogo era un
     *       desplegable; su lista se monta ENCIMA y tapa el diálogo entero, así que
     *       todo lo que venía después estaba de verdad cubierto. Ahora, si un toque
     *       abre una capa nueva, se cierra antes de seguir con la siguiente pieza.
     *
     * ── Lo que aquí NO se puede hacer, y se dice ───────────────────────────
     * Dentro de la capa no se vuelve al estado inicial entre toque y toque: recargar
     * la cerraría. Así que se recorre en el orden del DOM y se para en cuanto la capa
     * se cierra —que también es un efecto: un toque la cerró—. Es un barrido, no el
     * aislamiento de la pantalla, y por eso sus toques se cuentan aparte.
     */
    async function barrerCapa(ruta: string, desde: string): Promise<void> {
      const capasAlAbrir = await capasAbiertas();
      if (capasAlAbrir === 0) return;

      const capa = (): Locator => page.locator(SELECTOR_DE_CAPA).filter({ visible: true }).last();
      const dentro = await conTecho(
        enumerar(page, 'capa'),
        TECHO_DE_EVALUACION_MS,
        `enumerar la capa de ${ruta}`,
      );
      const tocables = dentro.filter((p) => !p.deshabilitado && p.visible && !p.yaActiva);
      if (tocables.length === 0) {
        await page.keyboard.press('Escape').catch(() => undefined);
        return;
      }
      bitacora(diario, `   ⤵ capa abierta por «${desde}» · ${String(tocables.length)} pieza(s)`);

      for (const pieza of tocables) {
        if (esSalir(pieza.etiqueta)) continue;
        if (pieza.etiquetaHtml === 'a' && saleDeLaAplicacion(pieza.href)) {
          externos.push(`${ruta} (capa) «${pieza.etiqueta}» → ${pieza.href ?? ''}`);
          continue;
        }
        // La capa pudo cerrarse con el toque anterior: eso es un efecto, no un fallo,
        // y lo que queda dentro se verá la próxima vez que se abra.
        if ((await capasAbiertas()) < capasAlAbrir) break;

        const suyo = capa().locator(SELECCION_DE_PIEZAS).nth(pieza.indice);
        if ((await suyo.count()) !== 1) {
          inalcanzables.push({
            ruta,
            etiqueta: `capa › ${pieza.etiqueta}`,
            camino: `pieza ${String(pieza.indice)} de la capa`,
            motivo: 'la capa ya no tiene esa pieza',
          });
          continue;
        }
        /**
         * Y QUE SIGA SIENDO LA MISMA PIEZA: el mismo rótulo Y LA MISMA COSA.
         *
         * La posición aguanta un repintado, pero no aguanta que la capa cambie de
         * contenido —un paso siguiente, una línea de compra que se añade—. Comprobar
         * sólo el rótulo no bastaba, y el rastreo lo demostró solo: en el diálogo de
         * «Registrar compra», tres campos llegaban a `locator.fill` y Playwright
         * contestaba «Element is not an <input>». Es decir, la posición había dejado de
         * apuntar a un campo y el rótulo vacío de un botón casa con el de un campo
         * vacío. Ahora se exige que la ETIQUETA HTML sea la misma, que es lo que de
         * verdad lo identifica.
         */
        const ahora = await suyo.evaluate((e) => {
          const html = e as HTMLElement & { innerText?: string; type?: string };
          const etiquetaHtml = e.tagName.toLowerCase();
          const rol = e.getAttribute('role') ?? '';
          // LA MISMA FIRMA que al enumerar, calculada igual. Si las dos expresiones se
          // separaran, esta comprobación diría que nada es lo que era.
          return [
            etiquetaHtml,
            rol,
            (html.type ?? '').toLowerCase(),
            e.getAttribute('name') ?? '',
            e.getAttribute('placeholder') ?? '',
            etiquetaHtml === 'button' || rol === 'button'
              ? (html.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
              : '',
          ].join('|');
        });
        const mismoSitio = ahora === pieza.firma;
        if (!mismoSitio) {
          inalcanzables.push({
            ruta,
            etiqueta: `capa › ${pieza.etiqueta}`,
            camino: `pieza ${String(pieza.indice)} de la capa`,
            motivo: `en su sitio hay otra pieza (${ahora.slice(0, 70)})`,
          });
          continue;
        }
        if (!(await suyo.isVisible()) || !(await suyo.isEnabled())) continue;

        elegibles += 1;
        const motivo = await tocar(pieza, suyo);
        tocados += 1;
        enCapas += 1;

        /**
         * LO QUE ESTE TOQUE ABRIÓ, cerrado antes de seguir.
         *
         * Un desplegable dentro de un diálogo monta su lista ENCIMA del diálogo y lo
         * tapa entero. Sin cerrarla, todas las piezas siguientes están de verdad
         * cubiertas y el rastreo las acusa a todas — 36 de una sola pasada.
         */
        let sobran = (await capasAbiertas()) - capasAlAbrir;
        while (sobran > 0) {
          await page.keyboard.press('Escape').catch(() => undefined);
          await page.waitForTimeout(200);
          const ahoraHay = (await capasAbiertas()) - capasAlAbrir;
          if (ahoraHay >= sobran) break;
          sobran = ahoraHay;
        }

        if (motivo === null) continue;
        if (motivo.startsWith('SONDA:')) {
          inalcanzables.push({
            ruta,
            etiqueta: `capa › ${pieza.etiqueta}`,
            camino: `pieza ${String(pieza.indice)} de la capa`,
            motivo: motivo.slice('SONDA:'.length),
          });
          continue;
        }

        const clave = `${ruta} «${pieza.etiqueta}»`;
        if (declarados.has(clave)) {
          declaradosUsados.add(clave);
          continue;
        }
        muertos.push({
          ruta,
          etiqueta: `capa de «${desde}» › ${pieza.etiqueta}`,
          camino: `pieza ${String(pieza.indice)} de la capa`,
          motivo,
        });
        bitacora(diario, `   ¡MUERTO EN LA CAPA! «${pieza.etiqueta}» · ${motivo}`);
      }

      // Se cierra con Escape y no con su botón de cerrar: el botón ya se tocó arriba
      // como cualquier otro, y si NO cerrara sería él el que está muerto.
      await page.keyboard.press('Escape').catch(() => undefined);
      await page.waitForTimeout(RESPIRO_MS);
    }

    /**
     * BARRER UNA PANTALLA ENTERA: sus piezas, sus capas y sus formularios.
     *
     * `abrir` es cómo se llega: por el menú en las que cuelgan de él, por la URL en las
     * cuatro que no cuelgan de ninguno (§0.5). Devuelve `false` si no se pudo abrir.
     */
    async function barrerPantalla(
      ruta: string,
      etiqueta: string,
      abrir: () => Promise<void>,
    ): Promise<void> {
      bitacora(diario, `→ ${ruta} «${etiqueta}»`);
      try {
        await abrir();
      } catch (fallo) {
        const razon = String(fallo).split('\n')[0] ?? '';
        muertos.push({
          ruta,
          etiqueta,
          camino: 'menú lateral',
          motivo: `la entrada del menú no abrió su pantalla (${razon})`,
        });
        bitacora(diario, `   ¡MUERTA! la entrada del menú no abrió: ${razon}`);
        return;
      }

      pantallasBarridas += 1;
      const pintadas = await esperarAQueSePinte(page);
      const inventario = await conTecho(enumerar(page), TECHO_DE_EVALUACION_MS, `enumerar ${ruta}`);
      const formularios = await conTecho(
        enumerarFormularios(page),
        TECHO_DE_EVALUACION_MS,
        `enumerar los formularios de ${ruta}`,
      );
      const porClase = inventario.reduce<Record<string, number>>((cuenta, pieza) => {
        cuenta[pieza.clase] = (cuenta[pieza.clase] ?? 0) + 1;
        return cuenta;
      }, {});
      bitacora(
        diario,
        `   ${String(inventario.length)} pieza(s) interactiva(s) ` +
          `(${Object.entries(porClase)
            .map(([clase, cuantas]) => `${String(cuantas)} ${clase}`)
            .join(' · ')}) · ${String(formularios.length)} formulario(s)` +
          (pintadas === 0 ? ' — la pantalla no pintó NADA que se pueda tocar' : ''),
      );

      for (const pieza of inventario) {
        if (pieza.deshabilitado || !pieza.visible) continue;
        if (pieza.yaActiva) {
          yaActivas += 1;
          continue;
        }
        if (esSalir(pieza.etiqueta)) continue;
        if (pieza.etiquetaHtml === 'a' && saleDeLaAplicacion(pieza.href)) {
          externos.push(`${ruta} «${pieza.etiqueta}» → ${pieza.href ?? ''}`);
          continue;
        }

        // ── SE VUELVE AL ESTADO INICIAL ───────────────────────────────────
        // Con `goto` y no con el menú: el menú ya demostró que lleva ahí, y hacerlo
        // por él en cada toque triplicaría el rastreo sin probar nada nuevo.
        // `commit` y no `load`: lo que hace falta es que la navegación EMPIECE; el
        // localizador de abajo espera por el elemento, que es esperar por una
        // condición en vez de por la carga entera de una página con veinte
        // consultas. Contra un despliegue real son segundos por toque.
        try {
          await page.goto(ruta, { waitUntil: 'commit' });
        } catch (fallo) {
          muertos.push({
            ruta,
            etiqueta: pieza.etiqueta,
            camino: pieza.camino,
            motivo: `la pantalla no volvió a abrir (${String(fallo).split('\n')[0] ?? ''})`,
          });
          bitacora(diario, `   ¡la pantalla no volvió a abrir! ${ruta}`);
          continue;
        }

        const suyo = page.locator(pieza.camino);
        // Se ESPERA a que vuelva a existir. Preguntar `count()` justo después del
        // `goto` devolvía 0 en casi todas —el contenido llega después— y el rastreo
        // apuntaba 36 piezas «que no reaparecen» sin haber tocado ninguna.
        await suyo
          .first()
          .waitFor({ state: 'attached', timeout: TECHO_DE_ACCION_MS })
          .catch(() => {
            /* si no vuelve, lo dice el conteo de abajo */
          });
        if ((await suyo.count()) !== 1) {
          // No reaparece: depende de un estado que este rastreo no reproduce —una fila
          // seleccionada, un diálogo abierto—. No es un defecto; es el límite de rastrear
          // sin saber qué se busca, y se cuenta para que se vea cuánto queda fuera.
          inalcanzables.push({
            ruta,
            etiqueta: pieza.etiqueta,
            camino: pieza.camino,
            motivo: 'no reaparece al recargar',
          });
          continue;
        }
        if (!(await suyo.isVisible()) || !(await suyo.isEnabled())) continue;

        elegibles += 1;
        const motivo = await tocar(pieza, suyo);
        tocados += 1;

        // ── Y LO QUE ABRIÓ, por dentro ─────────────────────────────────────
        if (pieza.clase === 'boton') await barrerCapa(ruta, pieza.etiqueta);

        if (motivo === null) continue;
        if (motivo.startsWith('SONDA:')) {
          inalcanzables.push({
            ruta,
            etiqueta: pieza.etiqueta,
            camino: pieza.camino,
            motivo: motivo.slice('SONDA:'.length),
          });
          continue;
        }

        const clave = `${ruta} «${pieza.etiqueta}»`;
        if (declarados.has(clave)) {
          declaradosUsados.add(clave);
          continue;
        }
        muertos.push({ ruta, etiqueta: pieza.etiqueta, camino: pieza.camino, motivo });
        bitacora(diario, `   ¡MUERTO! «${pieza.etiqueta}» ${pieza.camino} · ${motivo}`);
      }

      // ── LOS FORMULARIOS · enviar, que es la cuarta cosa ──────────────────
      for (const formulario of formularios) {
        try {
          await page.goto(ruta, { waitUntil: 'commit' });
        } catch {
          continue;
        }
        const suyo = page.locator(formulario.camino);
        await suyo
          .first()
          .waitFor({ state: 'attached', timeout: TECHO_DE_ACCION_MS })
          .catch(() => undefined);
        if ((await suyo.count()) !== 1) {
          inalcanzables.push({
            ruta,
            etiqueta: formulario.etiqueta,
            camino: formulario.camino,
            motivo: 'el formulario no reaparece al recargar',
          });
          continue;
        }

        const antes = await conTecho(huella(page), TECHO_DE_EVALUACION_MS, 'huella del formulario');
        const urlAntes = page.url();
        let peticiones = 0;
        const contar = (): void => {
          peticiones += 1;
        };
        page.on('request', contar);

        /**
         * SE ENVÍA CON `requestSubmit`, no pulsando un botón.
         *
         * Pulsar el botón de envío ya lo hace el barrido de arriba; lo que aquí se
         * prueba es el CAMINO DEL FORMULARIO: su validación nativa, su `onSubmit` y lo
         * que el servidor contesta. `requestSubmit` es lo que dispara el navegador al
         * pulsar Enter en un campo, así que es ese camino exactamente —y no `submit()`,
         * que se salta la validación y los manejadores de React—.
         */
        sondeando = true;
        try {
          await suyo.evaluate((elemento) => {
            (elemento as HTMLFormElement).requestSubmit();
          });
          await page.waitForTimeout(RESPIRO_MS * 2);
        } catch (fallo) {
          bitacora(
            diario,
            `   formulario «${formulario.etiqueta}» no se pudo enviar: ${String(fallo).split('\n')[0] ?? ''}`,
          );
        } finally {
          /**
           * LA VENTANA DE SONDA SE CIERRA TARDE, A PROPÓSITO.
           *
           * Se cerraba justo después del respiro, y eso es una CARRERA: el 400 del
           * servidor —que es la validación funcionando— llega cuando llega, y en un
           * contenedor de CI llega más tarde que en una laptop. Si aterriza un
           * milisegundo después, el navegador escribe «Failed to load resource: 400»
           * con la ventana ya cerrada y la corrida acusa a la aplicación de romperse
           * justo cuando mejor se comporta. Le pasó a la cafetería dos veces.
           *
           * Un segundo entero de cola: la sonda no vuelve a tocar nada en ese rato, así
           * que lo único que puede entrar por ahí es la respuesta que ella misma
           * provocó. Y sigue tapando SÓLO el 400 y el 422: un 404 es una ruta que no
           * existe y un 5xx es que revienta, con ventana o sin ella.
           */
          await page.waitForTimeout(RESPIRO_MS * 2);
          sondeando = false;
          page.off('request', contar);
        }
        formulariosEnviados += 1;

        const hizoAlgo =
          peticiones > 0 ||
          page.url() !== urlAntes ||
          (await conTecho(huella(page), TECHO_DE_EVALUACION_MS, 'huella tras enviar')) !== antes;
        if (hizoAlgo) continue;

        const clave = `${ruta} «${formulario.etiqueta}»`;
        if (declarados.has(clave)) {
          declaradosUsados.add(clave);
          continue;
        }
        /**
         * Un formulario vacío que no hace NADA al enviarse.
         *
         * Ni una petición, ni un cambio de URL, ni un mensaje de validación. Eso es un
         * `<form>` sin `onSubmit` y sin `action`: el Enter del cajero no hace nada y
         * nadie se lo dijo. Si de verdad no debe enviarse —porque todo pasa por su
         * botón—, se declara con su motivo como cualquier otro clic sin efecto.
         */
        muertos.push({
          ruta,
          etiqueta: formulario.etiqueta,
          camino: formulario.camino,
          motivo: 'el formulario no hace nada al enviarse: ni petición, ni URL, ni un aviso',
        });
        bitacora(diario, `   ¡FORMULARIO MUERTO! «${formulario.etiqueta}» ${formulario.camino}`);
      }
    }

    for (const entrada of entradas) {
      await barrerPantalla(entrada.ruta, entrada.etiqueta, async () => {
        // Al TABLERO primero: la pantalla anterior puede ser de un modelo, y esas no
        // traen barra lateral. Es una navegación por pantalla, no por botón.
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        const menuDeLaVuelta = await menuLateral(page);
        // Por su HREF y no por su nombre: con dos entradas llamadas igual, el nombre
        // abre la que está primero en el DOM —que no es la que se enumeró— y la
        // prueba acusa a la pantalla equivocada. Pasó con «Caja», «Recetas» y
        // «Registros» del restaurante: el clic se iba a `/abarrotes/caja`.
        // El VISIBLE: la barra puede traer el mismo destino dos veces —una en el
        // cajón de teléfono, oculta— y `.first()` a secas se queda esperando por la
        // que nadie puede tocar. Pasó con tres entradas de la ferretería.
        await menuDeLaVuelta
          .locator(`a[href="${entrada.ruta}"]`)
          .filter({ visible: true })
          .first()
          .click({ timeout: TECHO_DE_ACCION_MS });
        await page.waitForURL((url) => url.pathname === entrada.ruta, { timeout: 20_000 });
        await page.waitForLoadState('domcontentloaded');
      });
    }

    /**
     * LAS CUATRO QUE NO CUELGAN DE NINGÚN MENÚ, por su URL.
     *
     * Están exentas del MENÚ por razones buenas y escritas —`EXCEPCIONES-COBERTURA.md`:
     * las dos de acceso con PIN se ven ANTES de que exista sesión, y el portal del
     * comensal y el menú público los abre el CLIENTE con un QR—. Exentas del menú no es
     * exentas del rastreo: son pantallas con botones como cualquier otra, y el
     * rastreador no las visitaba NUNCA.
     *
     * Se filtran por el prefijo de este modelo: el portal del comensal es del
     * restaurante, y una ferretería no lo sirve.
     */
    const prefijoDelModelo = PREFIJO_DEL_MODELO[modeloDeLaDemo()] ?? '/ninguno/';
    for (const ruta of PANTALLAS_SIN_MENU.filter((r) => r.startsWith(prefijoDelModelo))) {
      await barrerPantalla(
        ruta,
        'sin menú, por URL',
        async () => {
          await page.goto(ruta, { waitUntil: 'domcontentloaded' });
          /**
           * Con sesión abierta, una pantalla de ENTRAR puede redirigir a la casa: es lo
           * correcto y no es un defecto. Se anota y se sigue, en vez de acusarla.
           */
          const donde = new URL(page.url()).pathname;
          if (donde !== ruta) throw new Error(`redirige a ${donde} con la sesión abierta`);
        },
        'anotar',
      );
    }

    // El resumen va en las ANOTACIONES de la corrida y no en la consola: así queda en
    // el informe de Playwright, se lee con el reportero JSON y no depende de que
    // alguien estuviera mirando la terminal.
    const fueraDeAlcance =
      elegibles + inalcanzables.length === 0
        ? 0
        : inalcanzables.length / (elegibles + inalcanzables.length);
    const resumen =
      `${String(pantallasBarridas)} pantalla(s) · ${String(tocados)} toque(s) ` +
      `(${String(enCapas)} dentro de capas · ${String(camposSondeados)} campo(s) sondeado(s) · ` +
      `${String(camposSinSonda)} de un tipo que la sonda no teclea · ` +
      `${String(formulariosEnviados)} formulario(s) enviado(s)) · ` +
      `${String(inalcanzables.length)} sin alcance (${(fueraDeAlcance * 100).toFixed(1)} %) · ` +
      `${String(externos.length)} enlace(s) fuera de la aplicación · ` +
      `${String(yaActivas)} ya seleccionada(s) · ` +
      `${String(declaradosUsados.size)} declarado(s) sin efecto`;
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
      for (const x of inalcanzables) {
        bitacora(diario, `SIN ALCANCE ${x.ruta} «${x.etiqueta}» · ${x.motivo}`);
      }
    }
    if (sinMenuNoVisitadas.length > 0) {
      test.info().annotations.push({
        type: 'rastreo-sin-menu',
        description: sinMenuNoVisitadas.join(' | '),
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

    /**
     * EL VIGILANTE DE RED VA PRIMERO, y el orden importa.
     *
     * Las dos puertas ven el mismo 4xx por caminos distintos: el vigilante de red lo
     * ve en la RESPUESTA y sabe la ruta, el estado y —por `loQuePedia`— la entidad y
     * la operación; el navegador lo escribe además en la consola y ahí sólo dice
     * «Failed to load resource… 400».
     *
     * Estaba al revés, y cuando los dos tenían algo que decir el que hablaba era el
     * que menos sabía: «`/cafeteria/inventario` · Failed to load resource… 400», sin
     * decir QUÉ se pidió, en una pantalla que habla con una decena de rutas. Hubo que
     * salir a buscarlo a mano tres veces.
     *
     * Con el vigilante de red delante, el primer fallo que se lee es el que trae la
     * ruta. La puerta de la consola no se relaja: sigue detrás, y es la ÚNICA que ve
     * un `TypeError` del cliente, que no deja rastro en ninguna respuesta.
     */
    exigirSinFallos();

    expect(
      [...new Set(enLaConsola)],
      'El navegador escribió errores mientras se tocaba la aplicación. Un error de consola no ' +
        'devuelve 500 ni `{ok:false}`: la pantalla se queda a medias y el servidor no se entera.',
    ).toEqual([]);

    /**
     * CUÁNTO QUEDÓ SIN TOCAR, y un techo.
     *
     * ── El cubo que se contaba y no exigía nada ─────────────────────────
     * `inalcanzables` se llenaba, se anotaba «si hay alguno» y **su tamaño no salía en
     * ninguna parte**: una corrida en la que la mitad de las piezas no se pudieron
     * volver a encontrar se leía igual de verde que una en la que se tocó todo. Eso es
     * un cupo silencioso, que es lo que esta fase vino a dejar de hacer: quien lee
     * «5 de 5 en verde» tiene derecho a saber sobre cuánto.
     *
     * El techo es una FRACCIÓN y no un número: una pantalla con tres piezas y una sin
     * alcance no dice nada, y cien sin alcance de seiscientas dicen que el rastreo ya no
     * rastrea. Y no salta con menos de `MINIMO_PARA_EL_TECHO`, para que una pantalla
     * pequeña no tire la corrida.
     */
    const porcentaje = `${(fueraDeAlcance * 100).toFixed(1)} %`;
    expect(
      inalcanzables.length >= MINIMO_PARA_EL_TECHO && fueraDeAlcance > TECHO_SIN_ALCANCE
        ? `${String(inalcanzables.length)} de ${String(elegibles + inalcanzables.length)} (${porcentaje})`
        : null,
      `Demasiadas piezas quedaron SIN TOCAR: ${porcentaje} de las que se enumeraron no se pudieron ` +
        `volver a encontrar al recargar, y el techo es ${String(TECHO_SIN_ALCANCE * 100)} %. Eso no ` +
        'es un defecto de la aplicación: es que el rastreo ya no rastrea, porque depende de un ' +
        'estado que no reproduce. Están en la bitácora con su ruta y su motivo, bajo «SIN ALCANCE».',
    ).toBeNull();

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
