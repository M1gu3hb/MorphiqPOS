import { expect, test, type Page } from '@playwright/test';

import { ESTILOS } from '../../packages/ui/src/tokens/estilos.ts';
import { abrirCajaPorLaRuta, consultarPuente, entrar, vigilarFallos } from './ayudantes/sesion';

/**
 * LA GALERÍA · una PUERTA que compara, no una carpeta con fotos.
 *
 * ── Qué era, y por qué no bastaba ────────────────────────────────────────
 * Retrataba y no comparaba: sin un `expect` de diferencia no podía fallar, no estaba ni
 * en `pnpm verify` ni en CI, y eran cuatro pantallas de sesenta y nueve. Y la de
 * «cobro» de la tienda era el MURO de «La caja está cerrada» —el rastreador la deja
 * cerrada—: ocho retratos del mismo muro, firmados como el diseño de la pantalla.
 *
 * ── Qué es ahora ─────────────────────────────────────────────────────────
 * Cada retrato se compara con el de la vuelta anterior (`toHaveScreenshot`): si una
 * pantalla cambia y nadie lo declaró, la puerta se pone roja y deja la imagen de la
 * diferencia. DECLARAR un cambio es regenerar los retratos —el trabajo de CI a mano
 * con `actualizar_galeria`, o `--update-snapshots`— y que el cambio de las imágenes
 * viaje en el mismo commit que el cambio de la pantalla: el diff de PNG es la
 * declaración, y se revisa como se revisa el código.
 *
 * Los retratos que cuentan son los de CI (Linux): las fuentes se dibujan distinto en
 * cada sistema operativo, así que los de Windows no se comparan con nada.
 *
 * ── Qué se retrata ───────────────────────────────────────────────────────
 * Cinco pantallas por modelo, con DATOS: el cobro con algo en el carrito, el inicio,
 * una lista densa, y dos propias de su giro; más `/sistema` una vez. En los ocho
 * estilos. Antes de retratar se abre la caja —el muro no es la pantalla— y se fija lo
 * que cambia de corrida en corrida: las horas, las fechas y los relojes que corren.
 *
 * ── Cómo se cambia el estilo ─────────────────────────────────────────────
 * Escribiendo los cinco atributos en el `<html>`, que es lo que hace `useApariencia`.
 * No prueba el camino del selector —eso es `estilos.spec.ts`—: retrata el resultado.
 */

interface Retrato {
  readonly ruta: string;
  readonly de: string;
  /** Lo que se hace antes de retratar para que la pantalla tenga algo que enseñar. */
  readonly preparar?: (page: Page) => Promise<void>;
}

interface ConNombre {
  readonly nombre?: string | null;
  readonly precio_venta?: number | null;
}

/** Un producto con nombre y precio, del catálogo de la demo. */
async function unProducto(page: Page, entidad: string): Promise<string> {
  const filas = await consultarPuente<ConNombre>(page, entidad, { limite: 40 });
  const elegido = filas.find((f) => (f.nombre ?? '') !== '' && (f.precio_venta ?? 1) > 0);
  if (elegido?.nombre === undefined || elegido.nombre === null) {
    throw new Error(`La demo no tiene ningún ${entidad} con nombre: no hay qué retratar.`);
  }
  return elegido.nombre;
}

const RETRATOS: Readonly<Record<string, readonly Retrato[]>> = {
  tienda: [
    {
      ruta: '/abarrotes/cobrar',
      de: 'cobro',
      preparar: async (page) => {
        const buscador = page.getByLabel('Código o nombre · F2');
        await buscador.fill(await unProducto(page, 'ProductoTerminado'));
        await buscador.press('Enter');
      },
    },
    { ruta: '/', de: 'inicio' },
    { ruta: '/abarrotes/existencias', de: 'lista' },
    { ruta: '/abarrotes/fiado', de: 'fiado' },
    { ruta: '/abarrotes/cortes', de: 'cortes' },
    { ruta: '/sistema', de: 'sistema' },
  ],
  cafeteria: [
    {
      ruta: '/cafeteria/cobrar',
      de: 'cobro',
      preparar: async (page) => {
        await page
          .getByRole('button', { name: await unProducto(page, 'ProductoTerminado') })
          .first()
          .click();
        await page.getByRole('button', { name: 'Aquí' }).click();
      },
    },
    { ruta: '/', de: 'inicio' },
    { ruta: '/cafeteria/inventario', de: 'lista' },
    { ruta: '/cafeteria/barra', de: 'barra' },
    { ruta: '/cafeteria/productos', de: 'productos' },
  ],
  restaurante: [
    { ruta: '/restaurante/mapa-de-mesas', de: 'mesas' },
    { ruta: '/', de: 'inicio' },
    { ruta: '/restaurante/inventario', de: 'lista' },
    { ruta: '/restaurante/cocina', de: 'cocina' },
    { ruta: '/restaurante/productos', de: 'productos' },
  ],
  ferreteria: [
    {
      ruta: '/ferreteria/mostrador',
      de: 'cobro',
      preparar: async (page) => {
        const material = await unProducto(page, 'MaterialMostrador');
        await page.locator('#buscador').fill(material.split(' ')[0] ?? material);
      },
    },
    { ruta: '/', de: 'inicio' },
    { ruta: '/ferreteria/existencias', de: 'lista' },
    { ruta: '/ferreteria/cuentas', de: 'cuentas' },
    { ruta: '/ferreteria/material', de: 'material' },
  ],
  estetica: [
    { ruta: '/estetica-salon/agenda-del-dia', de: 'agenda' },
    { ruta: '/', de: 'inicio' },
    { ruta: '/estetica-salon/catalogo-de-servicios', de: 'lista' },
    { ruta: '/estetica-salon/clientas', de: 'clientas' },
    { ruta: '/estetica-salon/productos', de: 'productos' },
  ],
};

const MODELO = (process.env['MORPHIQPOS_ORG_DEMO'] ?? '').replace('demo-acople-', '');

/**
 * EL RELOJ DE LA PÁGINA, A MEDIODÍA DEL DÍA DEL NEGOCIO.
 *
 * Instalado con la hora real, la galería retrataba la agenda de la estética a la hora en
 * que corría CI: los retratos de referencia salieron a las 23:30 de México y la vuelta
 * siguiente corrió a las 00:02 —otro día—, y la agenda «cambió» sin que nadie tocara una
 * línea. A mediodía del día del negocio la línea de «ahora», lo que ya pasó y lo que falta
 * caen siempre en el mismo sitio. La fecha es la de hoy en México —la de los datos que la
 * demo acaba de sembrar—, y México no cambia de horario desde 2022: el desfase es fijo.
 */
function mediodiaDelNegocio(): Date {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(
    new Date(),
  );
  return new Date(`${hoy}T12:00:00-06:00`);
}

/**
 * LO QUE CAMBIA DE CORRIDA EN CORRIDA, fijado antes del retrato.
 *
 * Una hora, una fecha o un «hace 3 min» cambian cada vez que se corre sin que la
 * pantalla haya cambiado, y una puerta que se pone roja por el reloj enseña a ignorar
 * el rojo. Se reescriben en el texto de la página —no se tapan con un rectángulo:
 * el hueco del texto sigue ahí, con su tipografía y su ancho aproximado—.
 */
async function fijarLoQueCambia(page: Page): Promise<void> {
  await page.evaluate(() => {
    const cambios: readonly (readonly [RegExp, string])[] = [
      [/\b\d{1,2}:\d{2}(:\d{2})?(\s?(a\.?\s?m\.?|p\.?\s?m\.?))?/gi, '00:00'],
      [/\b\d{4}-\d{2}-\d{2}\b/g, '2026-01-01'],
      [/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '01/01/2026'],
      [/\b\d{1,2} de [a-záéíóú]+( de \d{4})?/gi, '1 de enero'],
      [/\b(lunes|martes|miércoles|jueves|viernes|sábado|domingo)\b/gi, 'día'],
      [/\bhace \d+\s?(s|seg|min|minutos?|h|horas?|d|días?)\b/gi, 'hace 0 min'],
    ];
    const caminante = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let nodo = caminante.nextNode(); nodo !== null; nodo = caminante.nextNode()) {
      const antes = nodo.textContent ?? '';
      let despues = antes;
      for (const [patron, fijo] of cambios) despues = despues.replace(patron, fijo);
      if (despues !== antes) nodo.textContent = despues;
    }
  });
}

test.describe('la galería · cada pantalla contra la vuelta anterior', () => {
  // Sin reintentos: el primer intento ya abrió la caja, y un segundo sólo podía fallar al
  // abrirla otra vez —«esta sucursal ya tiene una caja abierta»— y esconder la diferencia.
  test.describe.configure({ mode: 'serial', timeout: 600_000, retries: 0 });

  test(`${MODELO || 'sin modelo'}: sus pantallas, en los ocho estilos`, async ({ page }) => {
    const retratos = RETRATOS[MODELO];
    expect(retratos, 'Falta `MORPHIQPOS_ORG_DEMO`, o su modelo no está en la tabla.').toBeDefined();

    // El reloj de la página, instalado ANTES de cargar nada: corre normal, y se para
    // justo antes de cada retrato para que ningún cronómetro cambie entre dos tomas.
    await page.clock.install({ time: mediodiaDelNegocio() });
    vigilarFallos(page);
    await entrar(page);
    // La caja, abierta: con ella cerrada tres modelos enseñan un MURO, y el muro no
    // es la pantalla. La deja cerrada el rastreador que corre antes.
    await abrirCajaPorLaRuta(page, 150_000);

    for (const retrato of retratos ?? []) {
      const respuesta = await page.goto(retrato.ruta, { waitUntil: 'domcontentloaded' });
      await page
        .waitForFunction(() => document.body.innerText.trim().length > 40, undefined, {
          timeout: 30_000,
        })
        .catch(() => undefined);
      await page.waitForLoadState('networkidle').catch(() => undefined);

      /**
       * QUE LO RETRATADO SEA LA PANTALLA, y no la página de error del navegador ni un
       * esqueleto: la galería ya dio verde una vez sobre ocho capturas de «This page
       * couldn't load».
       */
      expect(respuesta?.status() ?? 0, `«${retrato.ruta}» no respondió.`).toBeLessThan(400);
      const texto = await page.evaluate(() => document.body.innerText);
      expect(texto, `«${retrato.ruta}» enseña una página de error.`).not.toMatch(
        /page couldn|no se pudo cargar la página|ERR_CONNECTION/i,
      );
      expect(texto, `«${retrato.ruta}» enseña el muro de la caja cerrada.`).not.toMatch(
        /La caja está cerrada/,
      );

      await retrato.preparar?.(page);
      await page.waitForLoadState('networkidle').catch(() => undefined);

      for (const [estilo, definicion] of Object.entries(ESTILOS)) {
        await page.clock.resume();
        await page.evaluate(
          ({ clave, perillas }) => {
            const raiz = document.documentElement;
            raiz.setAttribute('data-estilo', clave);
            raiz.setAttribute('data-densidad', perillas.densidad);
            raiz.setAttribute('data-redondeo', perillas.redondeo);
            raiz.setAttribute('data-elevacion', perillas.elevacion);
            raiz.setAttribute('data-movimiento', perillas.movimiento);
          },
          { clave: estilo, perillas: definicion.perillas },
        );
        await fijarLoQueCambia(page);
        // El «ahora» de la PÁGINA, no el de la prueba: el reloj de la página va a mediodía
        // del negocio y pausarlo en la hora real sería pedirle que viaje al pasado.
        await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
        await expect(
          page,
          `«${retrato.ruta}» en ${estilo} cambió y nadie lo declaró.`,
        ).toHaveScreenshot(`${MODELO}-${retrato.de}-${estilo}.png`, {
          animations: 'disabled',
          caret: 'hide',
          fullPage: false,
          // Mismo navegador, mismas fuentes, misma máquina: la diferencia legítima es
          // cero. Medido entre dos vueltas del mismo código: 45 píxeles como mucho. Iba en
          // «0.2 % de la imagen» —unos 1 800 píxeles— y la mutación de prueba (cabeceras
          // de tabla sin mayúsculas) pasó en verde en el inventario del restaurante.
          maxDiffPixels: 150,
        });
      }
      await page.clock.resume();
    }
  });
});
