import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { PERILLAS } from '../../packages/ui/src/tokens/contrato.ts';
import { CLAVES_ESTILO, ESTILOS, atributosDeEstilo } from '../../packages/ui/src/tokens/estilos.ts';

import { Equipo, opcionesDelProyecto, personaDe } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  consultarPuente,
  entrar,
  entradaDe,
  exigirDemostracion,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * EL ESTILO DEL NEGOCIO: se elige, se guarda y es del NEGOCIO, no del navegador.
 *
 * La dueña elige el estilo en Configuración › Apariencia (`SelectorDeApariencia`) y lo guarda
 * con `configuracion.fijar_apariencia`, que lo escribe en `configuracion.valores.apariencia` de
 * la ORGANIZACIÓN. Eso promete la pantalla —«Se guarda para el negocio entero, no sólo para esta
 * computadora»— y hasta hoy nada lo comprobaba: el rastreador sólo lo usa como preparación
 * (`ponerEstilo`, por la ruta y sin pantalla) y `estilos.spec.ts` mira los ocho estilos sobre
 * `/sistema` con el selector de la página de documentación, que guarda nada.
 *
 * Para CADA uno de los ocho estilos, que salen de `CLAVES_ESTILO` y no de una lista escrita aquí:
 *
 *   1 · La dueña lo ELIGE tocando su tesela y la pantalla lo aplica EN VIVO, sin recargar: los
 *       cinco atributos de `<html>` y los tokens de color que llegan con ellos.
 *   2 · Lo GUARDA con «Guardar para el negocio» (200, `ok`, y el aviso de la pantalla).
 *   3 · RECARGA: sigue siendo ese estilo, ya pintado por el servidor.
 *   4 · LO PERSISTIDO: el servidor lo devuelve por el puente (`ConfiguracionNegocio`), no sólo
 *       el DOM, sin haber pisado el resto de la configuración.
 *   5 · OTRO DISPOSITIVO: un contexto de navegador NUEVO —sin cookies ni almacenamiento del
 *       primero— entra con otra persona, la mesera, por la pantalla de acceso con su PIN, y ve
 *       el MISMO estilo: en la pantalla de acceso del negocio y ya dentro, con los mismos tokens.
 *
 * Al final la demo queda con el estilo con el que empezó.
 *
 * ── Lo que esto NO es ────────────────────────────────────────────────────────────────────────
 * No es una prueba de que cada estilo se vea bien —eso son `estilos.spec.ts`, la galería y el
 * rastreo— sino de que el estilo ELEGIDO es el que se guarda, se recarga y ven los demás.
 */

const SLUG = 'demo-acople-restaurante';

/**
 * La apariencia del negocio: el estilo y sus cuatro perillas. Lleva firma de índice para poder
 * pasarla a `toMatchObject`, que pide un `Record`.
 */
interface Apariencia {
  readonly [clave: string]: string;
  readonly estilo: string;
  readonly densidad: string;
  readonly redondeo: string;
  readonly elevacion: string;
  readonly movimiento: string;
}

/** Los cinco atributos de `<html>` y los tokens que llegan con ellos, tal como los lee el navegador. */
interface EstiloPintado {
  readonly estilo: string;
  readonly densidad: string;
  readonly redondeo: string;
  readonly elevacion: string;
  readonly movimiento: string;
  readonly tokens: Readonly<Record<string, string>>;
  readonly fondoPintado: string;
}

const NOMBRES_DE_TOKEN = [
  '--fondo',
  '--texto',
  '--primario',
  '--sombra-1',
  '--altura-control',
  '--area-tactil-minima',
] as const;

/**
 * Lo que el navegador tiene puesto ahora: los atributos de `<html>` y los tokens resueltos.
 * Es lo mismo que mira `estilos.spec.ts`: si el atributo llega y el token no, la paleta existe
 * y nadie la aplica, que es el fallo que abrió la etapa de los estilos.
 */
function estiloPintado(page: Page): Promise<EstiloPintado> {
  return page.evaluate((nombres) => {
    const raiz = document.documentElement;
    const calculado = getComputedStyle(raiz);
    return {
      estilo: raiz.dataset['estilo'] ?? '',
      densidad: raiz.dataset['densidad'] ?? '',
      redondeo: raiz.dataset['redondeo'] ?? '',
      elevacion: raiz.dataset['elevacion'] ?? '',
      movimiento: raiz.dataset['movimiento'] ?? '',
      tokens: Object.fromEntries(nombres.map((n) => [n, calculado.getPropertyValue(n).trim()])),
      fondoPintado: getComputedStyle(document.body).backgroundColor,
    };
  }, NOMBRES_DE_TOKEN);
}

/** La apariencia que un estilo declara: él y sus cuatro perillas de fábrica. */
function deFabrica(estilo: string): Apariencia {
  const definicion = ESTILOS[estilo];
  if (definicion === undefined) throw new Error(`Estilo desconocido: ${estilo}`);
  return { estilo, ...definicion.perillas };
}

/** Lo que el servidor DEVUELVE de la apariencia, leído del puente con la sesión de esa página. */
async function aparienciaDelServidor(page: Page): Promise<Apariencia> {
  const [config] = await consultarPuente<Record<string, unknown>>(page, 'ConfiguracionNegocio');
  const guardada = config?.['apariencia'];
  if (typeof guardada !== 'object' || guardada === null) {
    throw new Error('El puente no devolvió `apariencia` en la configuración del negocio.');
  }
  const g = guardada as Record<string, unknown>;
  return {
    estilo: String(g['estilo']),
    densidad: String(g['densidad']),
    redondeo: String(g['redondeo']),
    elevacion: String(g['elevacion']),
    movimiento: String(g['movimiento']),
  };
}

/** Lo demás de la configuración, que cambiar de estilo NO debe tocar. */
async function identidadDelNegocio(page: Page): Promise<Record<string, unknown>> {
  const [config] = await consultarPuente<Record<string, unknown>>(page, 'ConfiguracionNegocio');
  const claves = [
    'nombre_negocio',
    'logo_url',
    'color_primario',
    'color_secundario',
    'color_acento',
    'moneda',
    'iva_porcentaje',
    'paquete_modo',
  ];
  return Object.fromEntries(claves.map((c) => [c, config?.[c]]));
}

/** Guarda la apariencia por la ruta que usa el botón, y exige que el servidor la acepte. */
async function guardarPorLaRuta(page: Page, apariencia: Apariencia): Promise<void> {
  const respuesta = await page.request.post('/api/configuracion/apariencia', {
    headers: cabecerasDeEscrituraDePrueba(),
    data: apariencia,
  });
  expect(
    respuesta.status(),
    `No se pudo guardar ${apariencia.estilo}: ${(await respuesta.text()).slice(0, 200)}`,
  ).toBe(200);
}

/**
 * Espera a que la página termine de hidratar. Los atributos de `<html>` los pone el servidor,
 * y el proveedor de apariencia los vuelve a escribir DESPUÉS de hidratar: medirlos antes daría
 * el valor del servidor y daría por bueno lo que el cliente va a pisar un instante más tarde.
 */
async function hidratada(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(
    () =>
      new Promise<void>((listo) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            listo();
          });
        });
      }),
  );
}

/** El selector de la pantalla, por su región. */
function selectorDe(page: Page) {
  const region = page.getByRole('region', { name: 'Estilo visual' });
  return {
    region,
    tesela: (clave: string) =>
      region.getByRole('button', {
        name: new RegExp(
          `^${(ESTILOS[clave]?.nombre ?? clave).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        ),
      }),
    guardar: region.getByRole('button', { name: 'Guardar para el negocio' }),
    // El nombre accesible de cada `<select>` es el del `<label>` que lo envuelve, que incluye
    // el texto de sus opciones: se busca por el comienzo, no exacto.
    perilla: (nombre: 'Densidad' | 'Redondeo' | 'Elevación' | 'Movimiento') =>
      region.getByLabel(nombre),
  };
}

/** Abre Configuración › Apariencia por su dirección, como la abre el acceso del tablero. */
async function abrirLaApariencia(page: Page): Promise<void> {
  await page.goto('/configuracion?tab=apariencia', { waitUntil: 'domcontentloaded' });
  // «Estilo visual» sólo existe cuando la configuración ya cargó: antes la pantalla dice «Cargando».
  await expect(page.getByRole('heading', { name: 'Estilo visual' })).toBeVisible({
    timeout: 30_000,
  });
}

/** Cuántos de los seis tokens llegaron vacíos, para el mensaje. */
function tokensVacios(pintado: EstiloPintado): string[] {
  return Object.entries(pintado.tokens)
    .filter(([, valor]) => valor === '')
    .map(([nombre]) => nombre);
}

/** Lo que identifica la paleta de un estilo: si dos estilos la comparten, uno no se aplicó. */
function huellaDe(pintado: EstiloPintado): string {
  return NOMBRES_DE_TOKEN.map((n) => pintado.tokens[n] ?? '').join('|');
}

/** Lo que dice el código, de una lista de estilos escrita en TypeScript. */
function estilosDelServidor(): string[] {
  const fuente = readFileSync('packages/app/src/configuracion/apariencia.ts', 'utf8');
  const lista = /export const ESTILOS_DISPONIBLES = \[([^\]]+)\] as const;/.exec(fuente)?.[1] ?? '';
  return [...lista.matchAll(/'([a-z]+)'/g)].map((m) => m[1] ?? '');
}

test.describe('el estilo del negocio', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  /** Con lo que empezó la demo, para dejarla como estaba aunque una prueba falle a medias. */
  let original: Apariencia | null = null;

  test.beforeAll(async ({ browser, playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
    const equipo = new Equipo(browser, SLUG);
    try {
      const duena = await equipo.pagina(info, 'dueno');
      await duena.goto('/', { waitUntil: 'domcontentloaded' });
      original = await aparienciaDelServidor(duena);
    } finally {
      await equipo.cerrar();
    }
  });

  test.afterAll(async ({ browser }, info) => {
    if (original === null) return;
    const equipo = new Equipo(browser, SLUG);
    try {
      const duena = await equipo.pagina(info, 'dueno');
      await duena.goto('/', { waitUntil: 'domcontentloaded' });
      await guardarPorLaRuta(duena, original);
      expect(
        await aparienciaDelServidor(duena),
        'La demo NO quedó con el estilo con el que empezó la prueba.',
      ).toEqual(original);
    } finally {
      await equipo.cerrar();
    }
  });

  test('los estilos de la pantalla son los que el servidor acepta, y son ocho', () => {
    // La pantalla ofrece `CLAVES_ESTILO` y el comando valida contra `ESTILOS_DISPONIBLES`: dos
    // listas escritas a mano en dos paquetes. Si una crece sola, el estilo nuevo se elige y el
    // servidor lo rechaza con «Hay datos incompletos o mal escritos», o al revés.
    expect([...CLAVES_ESTILO].sort()).toEqual(estilosDelServidor().sort());
    expect(
      CLAVES_ESTILO,
      'Cambió la cantidad de estilos: esta prueba y el encargo hablan de OCHO.',
    ).toHaveLength(8);
  });

  for (const estilo of CLAVES_ESTILO) {
    test(`${estilo}: se elige, se guarda, sobrevive a recargar y lo ve otro dispositivo`, async ({
      browser,
    }, info) => {
      test.setTimeout(3 * 60_000);
      const equipo = new Equipo(browser, SLUG);
      const esperado = deFabrica(estilo);
      const nombre = ESTILOS[estilo]?.nombre ?? estilo;
      const fallos: (() => void)[] = [];

      try {
        const duena = await equipo.pagina(info, 'dueno');
        fallos.push(vigilarFallos(duena));
        await abrirLaApariencia(duena);
        const { region, tesela, guardar } = selectorDe(duena);
        const identidadAntes = await identidadDelNegocio(duena);

        // ── 1 · LO ELIGE, y la pantalla lo aplica en vivo ─────────────────────────────────
        // Si el negocio ya tenía este estilo, primero se toca otro: elegir el que ya está
        // puesto no cambia nada y no probaría que la pantalla aplica lo que se elige.
        if ((await tesela(estilo).getAttribute('aria-pressed')) === 'true') {
          const otro = CLAVES_ESTILO.find((c) => c !== estilo) ?? estilo;
          await tesela(otro).click();
          await expect(tesela(otro)).toHaveAttribute('aria-pressed', 'true');
        }
        const antes = await estiloPintado(duena);
        await tesela(estilo).click();

        await expect(
          tesela(estilo),
          `Se tocó la tesela de «${nombre}» y la pantalla no la marca como elegida.`,
        ).toHaveAttribute('aria-pressed', 'true');
        for (const otra of CLAVES_ESTILO.filter((c) => c !== estilo)) {
          await expect(tesela(otra)).toHaveAttribute('aria-pressed', 'false');
        }
        await expect(
          region.getByText(ESTILOS[estilo]?.para ?? '', { exact: true }),
          `La pantalla no dice para qué sirve «${nombre}» tras elegirlo.`,
        ).toBeVisible();

        // `cambiarEstilo` escribe los cinco atributos en `<html>` sin recargar.
        await expect
          .poll(() => estiloPintado(duena), {
            message: `Se eligió «${nombre}» y los atributos de <html> no son los de ese estilo.`,
          })
          .toMatchObject(esperado);
        const alElegir = await estiloPintado(duena);
        expect(
          tokensVacios(alElegir),
          `En ${estilo} hay tokens que llegaron vacíos: la paleta existe y no se aplica.`,
        ).toEqual([]);
        expect(alElegir.fondoPintado, `En ${estilo} el cuerpo no tiene fondo calculado.`).toMatch(
          /rgb/,
        );
        if (antes.estilo !== estilo) {
          expect(
            huellaDe(alElegir),
            `Se pasó de «${antes.estilo}» a «${estilo}» y los tokens de color, sombra y tamaño ` +
              'son exactamente los mismos: el atributo cambió y la paleta no.',
          ).not.toBe(huellaDe(antes));
        }
        // Y lo que dicta el código: los cinco atributos son los de `atributosDeEstilo`.
        expect(
          {
            'data-estilo': alElegir.estilo,
            'data-densidad': alElegir.densidad,
            'data-redondeo': alElegir.redondeo,
            'data-elevacion': alElegir.elevacion,
            'data-movimiento': alElegir.movimiento,
          },
          'Los atributos de <html> no son los que fija `atributosDeEstilo`.',
        ).toEqual(atributosDeEstilo(estilo));

        // ── 2 · LO GUARDA ─────────────────────────────────────────────────────────────────
        const [respuesta] = await Promise.all([
          duena.waitForResponse(
            (r) =>
              new URL(r.url()).pathname === '/api/configuracion/apariencia' &&
              r.request().method() === 'POST',
          ),
          guardar.click(),
        ]);
        const cuerpo = (await respuesta.json()) as {
          readonly ok?: boolean;
          readonly error?: { readonly mensaje?: string };
          readonly datos?: Apariencia;
        };
        expect(
          respuesta.status(),
          `«Guardar para el negocio» contestó ${String(respuesta.status())}: ${cuerpo.error?.mensaje ?? ''}`,
        ).toBe(200);
        expect(cuerpo.ok, 'El servidor no aceptó guardar el estilo.').toBe(true);
        expect(cuerpo.datos, 'El servidor guardó otra cosa que lo elegido.').toEqual(esperado);
        await expect(
          region.getByText('Guardado. Todo el negocio lo verá así.'),
          'El servidor aceptó y la pantalla no lo dijo.',
        ).toBeVisible();

        // ── 3 · RECARGA: sigue siendo ese estilo ──────────────────────────────────────────
        await duena.reload({ waitUntil: 'domcontentloaded' });
        await expect(duena.getByRole('heading', { name: 'Estilo visual' })).toBeVisible({
          timeout: 30_000,
        });
        await hidratada(duena);
        const trasRecargar = await estiloPintado(duena);
        expect(trasRecargar, `Tras recargar, el negocio ya no está en «${nombre}».`).toMatchObject(
          esperado,
        );
        expect(
          huellaDe(trasRecargar),
          'Tras recargar, los tokens no son los que había al elegir el estilo.',
        ).toBe(huellaDe(alElegir));
        await expect(
          selectorDe(duena).tesela(estilo),
          'Tras recargar, la pantalla de Apariencia no marca el estilo guardado.',
        ).toHaveAttribute('aria-pressed', 'true');

        // ── 4 · LO PERSISTIDO: el servidor lo devuelve, y no pisó lo demás ────────────────
        expect(
          await aparienciaDelServidor(duena),
          `El servidor no devuelve «${nombre}» como la apariencia del negocio.`,
        ).toEqual(esperado);
        expect(
          await identidadDelNegocio(duena),
          'Cambiar de estilo pisó el nombre, el logo, los colores o el paquete del negocio.',
        ).toEqual(identidadAntes);

        // ── 5 · OTRO DISPOSITIVO: un navegador NUEVO, con otra persona ────────────────────
        const otroAparato = await browser.newContext(opcionesDelProyecto(info));
        try {
          expect(
            await otroAparato.cookies(),
            'El segundo dispositivo no es nuevo: ya trae cookies.',
          ).toEqual([]);
          const mesera = await otroAparato.newPage();
          fallos.push(vigilarFallos(mesera));

          // Sin sesión ni PIN: la pantalla de acceso de ESTE negocio ya viene con su estilo.
          await mesera.goto(entradaDe(SLUG), { waitUntil: 'domcontentloaded' });
          await hidratada(mesera);
          expect(
            await mesera.evaluate(() => ({
              almacenados: window.localStorage.length + window.sessionStorage.length,
              estilo: document.documentElement.dataset['estilo'] ?? '',
            })),
            'La pantalla de acceso del otro dispositivo no trae el estilo del negocio, o ya ' +
              'traía almacenamiento del primero.',
          ).toMatchObject({ estilo });

          // Entra con SU PIN, por la pantalla de acceso, como entra la mesera en su tableta.
          await entrar(mesera, personaDe(SLUG, 'mesero'));
          await expect(mesera).toHaveURL(/\/mesero$/);
          await expect(mesera.getByRole('heading', { name: 'Mesero', level: 1 })).toBeVisible({
            timeout: 30_000,
          });
          await hidratada(mesera);

          const laMesera = await estiloPintado(mesera);
          expect(
            laMesera,
            `La mesera, en otro dispositivo, no ve «${nombre}»: el estilo no es del negocio.`,
          ).toMatchObject(esperado);
          expect(
            huellaDe(laMesera),
            'La mesera ve el atributo del estilo y no sus tokens: otra paleta que la de la dueña.',
          ).toBe(huellaDe(trasRecargar));
          expect(
            await aparienciaDelServidor(mesera),
            'El servidor le devuelve a la mesera otra apariencia que la que guardó la dueña.',
          ).toEqual(esperado);
        } finally {
          await otroAparato.close();
        }

        for (const exigirSinFallos of fallos) exigirSinFallos();
      } finally {
        await equipo.cerrar();
      }
    });
  }

  /**
   * LAS CUATRO PERILLAS TAMBIÉN SON DEL NEGOCIO.
   *
   * «Guardar para el negocio» manda el estilo Y las cuatro perillas (`densidad`, `redondeo`,
   * `elevacion`, `movimiento`), y el servidor las guarda y las pinta en el `<html>` de la
   * primera respuesta. Pero `ProveedorDeApariencia` arranca su estado SÓLO con el nombre del
   * estilo y vuelve a escribir los cinco atributos al hidratar —con las perillas de FÁBRICA de
   * ese estilo—, así que una perilla movida y guardada se ve un instante y se pierde: la dueña
   * recarga y la densidad vuelve a la de siempre, y las demás personas nunca la ven.
   */
  test('una perilla movida también se guarda, sobrevive a recargar y la ve otro dispositivo', async ({
    browser,
  }, info) => {
    test.setTimeout(3 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const estilo = CLAVES_ESTILO[0] ?? 'morphiq';
    const fabrica = deFabrica(estilo);
    // Cada perilla, a un valor DISTINTO del de fábrica del estilo.
    const otroValor = (lista: readonly string[], actual: string): string =>
      lista.find((v) => v !== actual) ?? actual;
    const movida: Apariencia = {
      estilo,
      densidad: otroValor(PERILLAS.densidad, fabrica.densidad),
      redondeo: otroValor(PERILLAS.redondeo, fabrica.redondeo),
      elevacion: otroValor(PERILLAS.elevacion, fabrica.elevacion),
      movimiento: otroValor(PERILLAS.movimiento, fabrica.movimiento),
    };

    try {
      const duena = await equipo.pagina(info, 'dueno');
      await abrirLaApariencia(duena);
      const { tesela, guardar, perilla } = selectorDe(duena);

      if ((await tesela(estilo).getAttribute('aria-pressed')) === 'true') {
        await tesela(CLAVES_ESTILO[1] ?? estilo).click();
      }
      await tesela(estilo).click();
      await perilla('Densidad').selectOption(movida.densidad);
      await perilla('Redondeo').selectOption(movida.redondeo);
      await perilla('Elevación').selectOption(movida.elevacion);
      await perilla('Movimiento').selectOption(movida.movimiento);
      await expect
        .poll(() => estiloPintado(duena), { message: 'Las perillas no se aplicaron en vivo.' })
        .toMatchObject(movida);

      await Promise.all([
        duena.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === '/api/configuracion/apariencia' &&
            r.request().method() === 'POST' &&
            r.ok(),
        ),
        guardar.click(),
      ]);
      expect(
        await aparienciaDelServidor(duena),
        'El servidor no guardó las perillas que se movieron.',
      ).toEqual(movida);

      await duena.reload({ waitUntil: 'domcontentloaded' });
      await expect(duena.getByRole('heading', { name: 'Estilo visual' })).toBeVisible({
        timeout: 30_000,
      });
      await hidratada(duena);
      // `soft`: si falla la recarga, la corrida sigue hasta el otro dispositivo y el fallo dice
      // las dos cosas (la dueña pierde sus perillas Y nadie más las ve), no sólo la primera.
      expect
        .soft(
          await estiloPintado(duena),
          'Tras recargar, las perillas guardadas se perdieron: el servidor las pinta en <html> ' +
            '(apps/web/app/layout.tsx:158-162) pero sólo le pasa el NOMBRE del estilo al ' +
            'proveedor (layout.tsx:171 → Proveedores.tsx:54 → Apariencia.tsx:48 → ' +
            'packages/ui/src/hooks/useApariencia.ts:37, `aparienciaDe(estiloInicial)`), y el efecto ' +
            'de useApariencia.ts:43-49 reescribe los cinco atributos al hidratar con las perillas ' +
            'de FÁBRICA del estilo.',
        )
        .toMatchObject(movida);

      const otroAparato = await browser.newContext(opcionesDelProyecto(info));
      try {
        const mesera = await otroAparato.newPage();
        await entrar(mesera, personaDe(SLUG, 'mesero'));
        await expect(mesera.getByRole('heading', { name: 'Mesero', level: 1 })).toBeVisible({
          timeout: 30_000,
        });
        await hidratada(mesera);
        expect
          .soft(
            await estiloPintado(mesera),
            'La mesera, en otro dispositivo, no ve las perillas que guardó la dueña: el servidor ' +
              'se las pinta en <html> y el mismo proveedor las pisa al hidratar.',
          )
          .toMatchObject(movida);
      } finally {
        await otroAparato.close();
      }
    } finally {
      await equipo.cerrar();
    }
  });

  /**
   * QUIEN NO RESPONDE POR LA MARCA NO LA CAMBIA.
   *
   * `fijar_apariencia` es sólo del DUEÑO: si la cambiara un cajero, el siguiente turno
   * encontraría otro sistema. La mesera lo intenta por la ruta y el servidor se lo niega sin
   * tocar nada.
   */
  test('la mesera no puede cambiar el estilo del negocio', async ({ browser }, info) => {
    const equipo = new Equipo(browser, SLUG);
    try {
      const duena = await equipo.pagina(info, 'dueno');
      await duena.goto('/', { waitUntil: 'domcontentloaded' });
      const antes = await aparienciaDelServidor(duena);
      const otro = CLAVES_ESTILO.find((c) => c !== antes.estilo) ?? 'morphiq';

      const mesera = await equipo.pagina(info, 'mesero');
      await mesera.goto('/mesero', { waitUntil: 'domcontentloaded' });
      const intento = await mesera.request.post('/api/configuracion/apariencia', {
        headers: cabecerasDeEscrituraDePrueba(),
        data: deFabrica(otro),
      });
      expect(
        intento.status(),
        `La mesera cambió el estilo del negocio a «${otro}»: ${(await intento.text()).slice(0, 200)}`,
      ).toBe(403);
      expect(
        await aparienciaDelServidor(duena),
        'El estilo del negocio cambió aunque quien lo pidió no es el dueño.',
      ).toEqual(antes);
    } finally {
      await equipo.cerrar();
    }
  });
});
