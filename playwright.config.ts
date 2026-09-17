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
 * El muro de Vercel, que es el tercer bloqueo de `A3-COMO-APLICAR §4`.
 *
 * `VERCEL-ENTORNO §2` lo deja escrito: todo el preview —la raíz, `/estilos`, las rutas
 * de API— devuelve 401 o un 302 a `vercel.com/sso-api`, y **eso no es la aplicación:
 * es la Protección de Despliegue**. Un 401 del muro y un 401 de la aplicación se ven
 * igual desde fuera, y confundirlos sería declarar verificado algo que no se miró.
 *
 * La vía recomendada de las dos que hay es el Protection Bypass for Automation: un
 * secreto que viaja en `x-vercel-protection-bypass` y que no abre el preview al mundo,
 * sólo a quien lo tenga. Va aquí, en `use`, y no en cada prueba: así lo llevan tanto
 * las navegaciones como las peticiones que las pruebas hacen con `page.request`, que
 * heredan las cabeceras del contexto. Puesto prueba por prueba, la primera que se
 * olvidara fallaría contra el muro y el rastro diría «no encontré el botón».
 *
 * `x-vercel-set-bypass-cookie` pide además la cookie, para que las navegaciones que
 * arranca el propio navegador —un `router.push` del cliente— pasen igual.
 *
 * Sin el secreto no se manda nada: contra el servidor local sobraría, y una cabecera
 * con la cadena vacía es peor que ninguna porque Vercel la toma por un intento fallido.
 */
const BYPASS = process.env['MORPHIQPOS_BYPASS_VERCEL'];
const CABECERAS_DEL_MURO =
  BYPASS === undefined || BYPASS === ''
    ? {}
    : {
        extraHTTPHeaders: {
          'x-vercel-protection-bypass': BYPASS,
          'x-vercel-set-bypass-cookie': 'true',
        },
      };

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
  //
  // El techo subio de 30 s a 120 s al correr las cinco del acople por primera
  // vez, y no por lentitud: cada una ENTRA con PIN, cambia la plantilla y abre
  // las once, doce o trece pantallas de su modelo, una por una. Las dos que
  // pasaban lo hacian en 26 s, a cuatro segundos del limite, y las otras tres
  // morian por el techo con la ultima asercion a medias — y el rastro decia
  // «no encontre el boton», que manda a arreglar lo que no estaba roto. Un
  // techo mal puesto no hace la suite mas rigurosa: hace que mienta.
  //
  // El MECANISMO no cambia: expect sigue en 10 s y sigue esperando por
  // condiciones. Lo que cambia es cuanto se le permite tardar al recorrido
  // entero.
  timeout: 120_000,
  expect: { timeout: 10_000 },

  reporter: process.env['CI'] === undefined ? [['list']] : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    ...CABECERAS_DEL_MURO,
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
