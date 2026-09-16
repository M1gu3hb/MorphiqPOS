import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de extremo a extremo (F1.0-T10).
 *
 * `13-PRUEBAS §2` las acota a proposito: **solo el guion de demostracion**. Son
 * las mas lentas y las mas fragiles de mantener, asi que se reservan para los
 * flujos que Miguel va a ejecutar delante de un prospecto. Todo lo demas se
 * prueba mas abajo en la piramide.
 *
 * En F1.0 el unico flujo que existe es la pagina del sistema de diseno, que si
 * forma parte de la demostracion: es donde Miguel cambia el aspecto completo
 * delante del dueno.
 */
/**
 * Contra QUÉ corren las pruebas.
 *
 * ── Por qué esto era un problema ────────────────────────────────────
 * El `baseURL` estaba clavado en `http://localhost:3200`, así que la suite NO
 * podía correr contra el preview de Vercel —que es donde el acople se verifica—
 * ni contra ningún otro despliegue. Una suite de extremo a extremo que sólo sabe
 * hablar con su propia máquina no prueba el extremo que importa.
 *
 * `MORPHIQPOS_URL_DESPLIEGUE` gana si está: es la URL del preview. Si no está, se
 * levanta el servidor local, que es el comportamiento de siempre.
 */
const DESPLIEGUE = process.env['MORPHIQPOS_URL_DESPLIEGUE'];
const LOCAL = 'http://localhost:3200';
const BASE = DESPLIEGUE ?? LOCAL;

/**
 * El camino que se espera antes de arrancar.
 *
 * Estaba en `/estilos`, la página del sistema de diseño, y eso hacía que la
 * suite esperara a que respondiera una página que NINGUNA de las pruebas del
 * acople visita. Se espera a la raíz, que es lo que toda pantalla necesita.
 */
const CAMINO_DE_ARRANQUE = '/';

export default defineConfig({
  testDir: './pruebas/e2e',
  outputDir: './pruebas/e2e/.resultados',

  // Sin reintentos en local: un reintento esconde una prueba inestable, y una
  // prueba inestable acaba ignorandose. En CI se permite uno, para distinguir
  // fragilidad real de un contenedor con mal dia.
  retries: process.env['CI'] === undefined ? 0 : 1,
  forbidOnly: process.env['CI'] !== undefined,

  // Nada de esperas por tiempo (13-PRUEBAS §2). Playwright espera por
  // condiciones; estos limites son el techo, no el mecanismo.
  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: process.env['CI'] === undefined ? [['list']] : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  },

  projects: [
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // La tablet del mesero y el telefono del comensal son dispositivos reales
      // del guion, no un extra: las escenas 2, 3 y 5 pasan ahi.
      //
      // Se emula sobre Chromium, no sobre WebKit: en F1.0 no hay pantalla de
      // mesero todavia y descargar WebKit son ~300 MB por una emulacion de
      // viewport. El iPad de verdad (WebKit) entra en F1.4, con la pantalla de
      // mesero, que es cuando la diferencia de motor puede importar.
      name: 'tablet',
      use: { ...devices['Galaxy Tab S4 landscape'] },
    },
  ],

  // Sin servidor propio cuando se corre contra un despliegue: levantar uno
  // local mientras se prueba el preview gasta cuatro minutos de build para
  // servir algo que nadie visita.
  ...(DESPLIEGUE !== undefined
    ? {}
    : {
        webServer: {
          /**
           * Se CONSTRUYE antes de arrancar.
           *
           * `next start` sirve lo que haya en `.next`, así que sin el build la suite
           * corría contra la versión anterior del código. Costó una hora de perseguir
           * un fallo que ya estaba arreglado: la prueba fallaba de verdad, sobre un
           * bundle viejo. Con `reuseExistingServer` en local hay que acordarse de
           * matar el 3200 si se quiere forzar una reconstrucción.
           */
          command:
            'pnpm turbo run build --filter=@morphiqpos/web && pnpm --filter @morphiqpos/web exec next start -p 3200',
          url: `${LOCAL}${CAMINO_DE_ARRANQUE}`,
          reuseExistingServer: process.env['CI'] === undefined,
          timeout: 300_000,
        },
      }),
});
