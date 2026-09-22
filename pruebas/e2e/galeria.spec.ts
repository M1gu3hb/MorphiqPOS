import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { entrar, vigilarFallos } from './ayudantes/sesion';

/**
 * LA GALERÍA · la pantalla que más importa de cada modelo, en los ocho estilos.
 *
 * ── Para qué existe, y por qué no es una prueba ──────────────────────────
 * Esto no afirma nada: RETRATA. Es lo que se mira cuando hay que decidir si un estilo
 * sirve para un giro, y lo que va en el informe de la etapa — «pon la pantalla al lado
 * de la misma pantalla del modelo más cercano» es el último examen del diseño, y no se
 * puede hacer sin las dos imágenes.
 *
 * Por eso no está en la cadena de `pnpm verify` ni en el rastreo de CI: cuarenta
 * capturas con cinco sesiones son minutos, y no hay nada que se ponga rojo. Se corre a
 * mano, con la demostración del modelo sembrada:
 *
 *   MORPHIQPOS_ORG_DEMO=demo-acople-ferreteria MORPHIQPOS_DEMO_PERSONA=Demo \
 *   MORPHIQPOS_DEMO_PIN=1234 MORPHIQPOS_URL_DESPLIEGUE=http://localhost:3200 \
 *   pnpm test:e2e pruebas/e2e/galeria.spec.ts --project=escritorio
 *
 * ── Qué se retrata, y por qué esas cuatro ────────────────────────────────
 * LA DE COBRO de cada modelo, porque es la que Miguel señaló: se usa de 40 a 400 veces
 * al día, siempre con una persona esperando enfrente, y es donde el total, el dinero y
 * el objetivo táctil se juegan de verdad. LA DE INICIO, porque es la primera que se ve
 * y la que el cliente juzga en cuatro segundos. UNA LISTA DENSA —el catálogo o las
 * existencias—, porque una demostración recién sembrada tiene sus veintitantas filas y
 * es el único retrato con CONTENIDO de verdad: el resto sale, con razón, en su estado
 * vacío. Y `/sistema`, la página del lenguaje, que enseña de una vez el total grande,
 * los seis botones, la tabla, el dinero y las cinco gráficas.
 *
 * Que la mayoría salga VACÍA no es un defecto del retrato: es lo que ve un negocio el
 * primer día, y es precisamente lo que la etapa 4 fue a arreglar. Se dice, no se
 * esconde llenando la base a mano para la foto.
 *
 * ── Cómo se cambia el estilo, y qué NO prueba eso ────────────────────────
 * Escribiendo los cinco atributos en el `<html>`, que es exactamente lo que hace
 * `useApariencia`. Aquí se hace a mano porque el selector vive en Configuración y
 * entrar a cambiarlo entre captura y captura serían ocho viajes por pantalla.
 *
 * Eso significa que esta galería NO prueba el camino del selector — lo prueba
 * `estilos.spec.ts`, que cambia el estilo POR el selector de `/sistema` y comprueba
 * que los tokens llegan. Aquí sólo se retrata el resultado. Dicho, no supuesto.
 */

const ESTILOS = [
  'morphiq',
  'cristal',
  'relieve',
  'taller',
  'bloque',
  'terminal',
  'papel',
  'noche',
] as const;

/** Las perillas que declara cada estilo. Es la misma tabla de `tokens/estilos.ts`. */
const PERILLAS: Readonly<
  Record<string, { densidad: string; redondeo: string; elevacion: string; movimiento: string }>
> = {
  morphiq: { densidad: 'normal', redondeo: 'media', elevacion: 'sombra', movimiento: 'normal' },
  cristal: { densidad: 'normal', redondeo: 'amplia', elevacion: 'sombra', movimiento: 'expresiva' },
  relieve: {
    densidad: 'normal',
    redondeo: 'amplia',
    elevacion: 'doble-bisel',
    movimiento: 'sutil',
  },
  taller: {
    densidad: 'guantes',
    redondeo: 'media',
    elevacion: 'doble-bisel',
    movimiento: 'normal',
  },
  bloque: { densidad: 'guantes', redondeo: 'nula', elevacion: 'linea-dura', movimiento: 'sutil' },
  terminal: { densidad: 'compacta', redondeo: 'nula', elevacion: 'plana', movimiento: 'nula' },
  papel: { densidad: 'normal', redondeo: 'sutil', elevacion: 'plana', movimiento: 'sutil' },
  noche: { densidad: 'comoda', redondeo: 'media', elevacion: 'sombra', movimiento: 'sutil' },
};

/**
 * La pantalla de COBRO de cada modelo y la de INICIO, por su ruta.
 *
 * Las rutas no se adivinan: son las que el menú de cada modelo sirve, y las mismas que
 * recorre el rastreador.
 */
const RETRATOS: Readonly<
  Record<string, readonly { readonly ruta: string; readonly de: string }[]>
> = {
  tienda: [
    { ruta: '/abarrotes/cobrar', de: 'cobro' },
    { ruta: '/', de: 'inicio' },
    { ruta: '/abarrotes/existencias', de: 'lista' },
    { ruta: '/sistema', de: 'sistema' },
  ],
  cafeteria: [
    { ruta: '/cafeteria/cobro-y-propina', de: 'cobro' },
    { ruta: '/', de: 'inicio' },
    { ruta: '/cafeteria/inventario', de: 'lista' },
    { ruta: '/sistema', de: 'sistema' },
  ],
  restaurante: [
    { ruta: '/restaurante/cobro', de: 'cobro' },
    { ruta: '/', de: 'inicio' },
    { ruta: '/restaurante/inventario', de: 'lista' },
    { ruta: '/sistema', de: 'sistema' },
  ],
  ferreteria: [
    { ruta: '/ferreteria/mostrador', de: 'cobro' },
    { ruta: '/', de: 'inicio' },
    { ruta: '/ferreteria/existencias', de: 'lista' },
    { ruta: '/sistema', de: 'sistema' },
  ],
  estetica: [
    { ruta: '/estetica-salon/cobrar', de: 'cobro' },
    { ruta: '/', de: 'inicio' },
    { ruta: '/estetica-salon/catalogo-de-servicios', de: 'lista' },
    { ruta: '/sistema', de: 'sistema' },
  ],
};

const MODELO = (process.env['MORPHIQPOS_ORG_DEMO'] ?? '').replace('demo-acople-', '');
const CARPETA = join('docs', 'reports', 'galeria', MODELO);

test.describe('la galería de los ocho estilos', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  test(`${MODELO || 'sin modelo'}: sus dos pantallas, en los ocho estilos`, async ({ page }) => {
    expect(
      RETRATOS[MODELO],
      'Falta `MORPHIQPOS_ORG_DEMO`, o su modelo no está en la tabla de retratos.',
    ).toBeDefined();

    vigilarFallos(page);
    mkdirSync(CARPETA, { recursive: true });
    await entrar(page);

    for (const retrato of RETRATOS[MODELO] ?? []) {
      const respuesta = await page.goto(retrato.ruta, { waitUntil: 'domcontentloaded' });
      /**
       * Se espera a que haya CONTENIDO, no a un tiempo: una captura de un esqueleto
       * retrata el estado de carga y no el diseño.
       *
       * Y se mide por el TEXTO y no por un selector de estructura. `main` no existe en
       * todas —las de `heredado/` montan su propio armazón— y `body > div` casa con el
       * envoltorio del enrutador, que no es visible: esperar a ese primer `div` agotó
       * los cinco minutos de la prueba sin que faltara nada en la pantalla.
       */
      await page
        .waitForFunction(() => document.body.innerText.trim().length > 40, undefined, {
          timeout: 30_000,
        })
        .catch(() => undefined);
      await page.waitForLoadState('networkidle').catch(() => undefined);

      /**
       * QUE LO RETRATADO SEA LA PANTALLA, y no la página de error del navegador.
       *
       * Sin esto la galería dio VERDE sobre ocho capturas de «This page couldn't load»:
       * el servidor se estaba reiniciando entre modelos, la navegación fallo, y la
       * espera de contenido la pasó igual porque esa página también tiene texto.
       *
       * Una galería que no puede fallar no es una galería: es una carpeta con
       * imágenes. Y el retrato de un fallo puesto en un informe es peor que no tener
       * informe, porque se firma como si fuera el producto.
       */
      expect(
        respuesta?.status() ?? 0,
        `«${retrato.ruta}» no respondió: se estaba retratando una página de error.`,
      ).toBeLessThan(400);
      const texto = await page.evaluate(() => document.body.innerText);
      expect(
        texto,
        `«${retrato.ruta}» enseña la página de error del navegador, no la pantalla.`,
      ).not.toMatch(/page couldn|no se pudo cargar la página|ERR_CONNECTION/i);

      for (const estilo of ESTILOS) {
        await page.evaluate(
          ({ clave, perillas }) => {
            const raiz = document.documentElement;
            raiz.setAttribute('data-estilo', clave);
            raiz.setAttribute('data-densidad', perillas.densidad);
            raiz.setAttribute('data-redondeo', perillas.redondeo);
            raiz.setAttribute('data-elevacion', perillas.elevacion);
            raiz.setAttribute('data-movimiento', perillas.movimiento);
          },
          { clave: estilo, perillas: PERILLAS[estilo] ?? PERILLAS['morphiq'] },
        );
        // Lo justo para que acaben las transiciones de color: una captura a mitad de
        // una transición sale con el color de en medio, que no es de ningún estilo.
        await page.waitForTimeout(350);
        await page.screenshot({
          path: join(CARPETA, `${retrato.de}-${estilo}.png`),
          fullPage: false,
        });
      }
    }
  });
});
