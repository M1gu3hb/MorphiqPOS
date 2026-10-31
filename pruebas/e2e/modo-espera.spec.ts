import { expect, test, type Page } from '@playwright/test';

import { DUENO_DE_DEMO } from '../../packages/contracts/src/negocios/equipo-de-prueba.ts';
import { CARTA } from './ayudantes/mesas-heredadas.ts';
import { Equipo, personaDe } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  consultarPuente,
  entrar,
  exigirDemostracion,
} from './ayudantes/sesion.ts';

/**
 * DP-11.2 · EL MODO ESPERA: tras N minutos sin tocar, la pantalla se oscurece con la hora y Morfi
 * dormido; al tocarla, Morfi despierta y la pantalla vuelve tal cual estaba.
 *
 * El reloj de la página lo maneja Playwright (`page.clock`): tres minutos sin tocar pasan en un
 * instante y sin esperar de verdad. Sí en Caja, Tablero, Cocina y administración; nunca en el
 * mesero. En Cocina, con comandas pendientes no se duerme, y una comanda nueva la despierta.
 * Corre en serie (`--workers=1`): cambia la configuración del negocio de prueba y la deja como
 * estaba.
 */

const SLUG = 'demo-acople-restaurante';
const MESA = 7;
const espera = (page: Page) => page.getByRole('dialog', { name: /Modo espera/ });
const pinDe = (page: Page) => page.getByRole('dialog', { name: /Escribe tu PIN/ });

/**
 * Lo que decidió la última revisión del modo espera (`data-espera-decision` del documento). Se
 * escribe en el momento de la revisión, así que un «no se durmió» es determinista: no depende de
 * cuándo pinta React.
 */
async function decidio(page: Page, decision: string): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-espera-decision', decision);
}

/** ¿Quedó el foco en algo de la pantalla de abajo? (El cuerpo es «el navegador»: no cuenta.) */
function focoFueraDeLaCapa(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const activo = document.activeElement;
    return activo !== null && activo !== document.body && activo.closest('dialog') === null;
  });
}

async function escribir(pagina: Page, ruta: string, datos: Record<string, unknown>) {
  const respuesta = await pagina.request.post(ruta, {
    headers: cabecerasDeEscrituraDePrueba(),
    data: datos,
  });
  const texto = await respuesta.text();
  expect(respuesta.status(), `${ruta}: ${texto.slice(0, 300)}`).toBe(200);
  return JSON.parse(texto) as { readonly datos?: Record<string, unknown> };
}

async function experiencia(duena: Page, valores: Record<string, boolean>): Promise<void> {
  await escribir(duena, '/api/datos/escribir', {
    entidad: 'ConfiguracionNegocio',
    operacion: 'update',
    datos: { experiencia: { mascota: true, ...valores } },
  });
}

/** La cuenta abierta de la mesa de la prueba, si la hay. */
async function cuentaDeLaMesa(duena: Page): Promise<{ mesaId: string; ordenId: string | null }> {
  const [mesa] = await consultarPuente<{ id: string; venta_activa_id?: string | null }>(
    duena,
    'Mesa',
    { filtro: { numero: MESA }, limite: 1 },
  );
  expect(mesa, `El negocio de prueba no tiene la mesa ${String(MESA)}.`).toBeDefined();
  return { mesaId: mesa?.id ?? '', ordenId: mesa?.venta_activa_id ?? null };
}

/**
 * Cancela la cuenta de la mesa de la prueba, si quedó una: su comanda sigue pendiente y, con
 * pendientes, la cocina no se duerme (que es justo la regla). Así la siguiente vuelta, en otro
 * aparato, empieza con la cocina vacía.
 */
async function cancelarLaCuentaDeLaMesa(duena: Page): Promise<void> {
  const { ordenId } = await cuentaDeLaMesa(duena);
  if (ordenId === null) return;
  await escribir(duena, '/api/restaurante/cancelar-orden', {
    ordenId,
    motivo: 'prueba del modo espera',
  });
}

/**
 * Una comanda nueva en la cocina: abre la mesa y le manda un platillo, por la API de siempre.
 * Devuelve la cuenta, para pedirla o cancelarla.
 */
async function comandaNueva(duena: Page): Promise<string> {
  const { mesaId } = await cuentaDeLaMesa(duena);
  const apertura = await escribir(duena, '/api/restaurante/abrir-mesa', {
    mesaId,
    personas: 2,
  });
  const productos = await consultarPuente<{ id: string; nombre: string }>(
    duena,
    'ProductoTerminado',
    { limite: 80 },
  );
  const platillo = productos.find((p) => p.nombre === CARTA.guacamole.nombre);
  const ordenId = String(apertura.datos?.['ordenId']);
  await escribir(duena, '/api/restaurante/enviar-pedido', {
    ordenId,
    lineas: [{ productoId: platillo?.id, cantidad: '1' }],
  });
  return ordenId;
}

/**
 * Abre la pantalla con el reloj de Playwright y espera a que esté pintada. Adelantar el reloj
 * antes de que el modo espera se monte no prueba nada: empezaría a contar DESPUÉS del salto, y
 * un «no se durmió» pasaría por eso y no por la regla.
 */
async function abrirConReloj(pagina: Page, ruta: string): Promise<void> {
  await pagina.clock.install();
  await pagina.goto(ruta);
  await expect(pagina.getByRole('heading', { level: 1 }).first()).toBeVisible();
}

test.describe('el modo espera', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  // Lo de omisión en cada prueba, por si otra suite (o una que falló) lo dejó distinto: Morfi
  // encendido y sin PIN al despertar.
  test.beforeEach(async ({ browser }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await experiencia(duena, { pin_al_despertar: false });
  });

  test('Caja: a los 3 minutos sin tocar, no antes; la hora y Morfi dormido', async ({
    browser,
  }, info) => {
    const caja = await new Equipo(browser, SLUG).pagina(info, 'cajero');
    await abrirConReloj(caja, '/caja');

    await caja.clock.fastForward('02:50');
    await decidio(caja, 'despierta');
    await expect(espera(caja)).toHaveCount(0);
    await caja.clock.fastForward('00:15');
    await expect(espera(caja)).toBeVisible();
    await expect(
      espera(caja)
        .getByText(/\d{1,2}:\d{2}/)
        .first(),
    ).toBeVisible();
    await expect(espera(caja).locator('[data-morfi]')).toHaveCount(1);
  });

  test('Caja: una cuenta pedida la despierta', async ({ browser }, info) => {
    const equipo = new Equipo(browser, SLUG);
    const duena = await equipo.pagina(info, 'dueno');
    const caja = await equipo.pagina(info, 'cajero');
    await cancelarLaCuentaDeLaMesa(duena);
    try {
      await abrirConReloj(caja, '/caja');
      await caja.clock.fastForward('03:10');
      await expect(espera(caja)).toBeVisible();

      const ordenId = await comandaNueva(duena);
      await escribir(duena, '/api/restaurante/solicitar-cuenta', { ordenId });
      // La caja lee cada 2 s: con el reloj detenido, se le dan unas vueltas.
      await caja.clock.runFor(6_000);
      await expect(espera(caja)).toHaveCount(0);
    } finally {
      await cancelarLaCuentaDeLaMesa(duena);
    }
  });

  test('Mesero: nunca, aunque pasen diez minutos', async ({ browser }, info) => {
    const mesero = await new Equipo(browser, SLUG).pagina(info, 'mesero');
    await abrirConReloj(mesero, '/mesero');
    await mesero.clock.fastForward('10:00');
    await decidio(mesero, 'fuera');
    await expect(espera(mesero)).toHaveCount(0);
  });

  test('al cambiar de pantalla, la espera de la anterior no se queda guardada', async ({
    browser,
  }, info) => {
    test.skip(info.project.name !== 'escritorio', 'el menú lateral sólo se ve en la PC');
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await abrirConReloj(duena, '/mesero');
    await duena.getByRole('link', { name: 'Inventario' }).click();
    await expect(duena.getByRole('heading', { level: 1, name: 'Inventario' })).toBeVisible();
    await duena.clock.fastForward('03:10');
    await expect(espera(duena)).toBeVisible();

    // Atrás (el gesto o el botón del navegador) al mesero, donde no hay espera, y adelante otra vez.
    await duena.evaluate(() => {
      history.back();
    });
    await decidio(duena, 'fuera');
    await duena.evaluate(() => {
      history.forward();
    });
    await expect(duena.getByRole('heading', { level: 1, name: 'Inventario' })).toBeVisible();
    await expect(espera(duena)).toHaveCount(0);
  });

  test('Cocina: una comanda nueva la despierta, y con pendientes no se vuelve a dormir', async ({
    browser,
  }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await cancelarLaCuentaDeLaMesa(duena);
    try {
      await abrirConReloj(duena, '/cocina');
      await duena.clock.fastForward('02:10');
      await expect(espera(duena)).toBeVisible();

      await comandaNueva(duena);
      // La cocina lee cada 2 s: con el reloj detenido, se le dan unas vueltas.
      await duena.clock.runFor(6_000);
      await expect(espera(duena)).toHaveCount(0);

      await duena.clock.fastForward('05:00');
      await decidio(duena, 'bloqueada');
      await expect(espera(duena)).toHaveCount(0);
    } finally {
      await cancelarLaCuentaDeLaMesa(duena);
    }
  });

  test('vuelve con lo tecleado; el despertar se puede saltar', async ({ browser }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await abrirConReloj(duena, '/inventario');
    const buscar = duena.getByPlaceholder('Buscar ingrediente...');
    await buscar.fill('tomate');

    await duena.clock.fastForward('03:10');
    await expect(espera(duena)).toBeVisible();
    await espera(duena).click();
    await expect(espera(duena)).toHaveAttribute('data-modo-espera', 'despertando');
    // El clip de despertar dura casi 3 s: si el segundo toque no lo saltara, la capa seguiría.
    await espera(duena).click();
    await expect(espera(duena)).toHaveCount(0, { timeout: 1_000 });
    await expect(buscar).toHaveValue('tomate');
  });

  test('con «reducir movimiento», Morfi duerme en su imagen fija; una tecla la despierta y no cae abajo', async ({
    browser,
  }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await duena.emulateMedia({ reducedMotion: 'reduce' });
    await abrirConReloj(duena, '/inventario');
    const buscar = duena.getByPlaceholder('Buscar ingrediente...');
    await buscar.fill('tomate');
    await duena.clock.fastForward('03:10');
    await expect(espera(duena).locator('img[data-morfi="fijo"]')).toBeVisible();
    // Al irse la capa el foco vuelve al buscador: la letra que la despertó no se le escribe.
    await duena.keyboard.press('x');
    await expect(espera(duena)).toHaveCount(0);
    await expect(buscar).toHaveValue('tomate');
  });

  test('con la caja dormida, el PIN que se enciende en otro aparato vale al despertar', async ({
    browser,
  }, info) => {
    const equipo = new Equipo(browser, SLUG);
    const duena = await equipo.pagina(info, 'dueno');
    const caja = await equipo.pagina(info, 'cajero');
    await abrirConReloj(caja, '/caja');
    await caja.clock.fastForward('03:10');
    await expect(espera(caja)).toBeVisible();

    await experiencia(duena, { pin_al_despertar: true });
    try {
      // Mientras duerme vuelve a leer la configuración cada minuto.
      const relectura = caja.waitForResponse(
        (r) =>
          r.url().endsWith('/api/datos/consultar') &&
          (r.request().postData() ?? '').includes('ConfiguracionNegocio'),
      );
      await caja.clock.runFor(61_000);
      await relectura;
      await espera(caja).click();
      await expect(espera(caja)).toHaveAttribute('data-modo-espera', 'despertando');
      await espera(caja).click();
      await expect(pinDe(caja)).toBeVisible();
    } finally {
      await experiencia(duena, { pin_al_despertar: false });
    }
  });

  test('Este aparato: apagado, no se duerme; los minutos son del aparato', async ({
    browser,
  }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await duena.goto('/configuracion?tab=aparato');
    await duena.getByRole('combobox', { name: /Minutos sin tocar/ }).selectOption('1');
    await abrirConReloj(duena, '/inventario');
    await duena.clock.fastForward('01:10');
    await expect(espera(duena)).toBeVisible();
    await espera(duena).click();
    await expect(espera(duena)).toHaveAttribute('data-modo-espera', 'despertando');
    await espera(duena).click();
    await expect(espera(duena)).toHaveCount(0);

    await duena.goto('/configuracion?tab=aparato');
    await duena.getByRole('switch', { name: /Modo espera en este aparato/ }).click();
    await duena.goto('/inventario');
    await expect(duena.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await duena.clock.fastForward('10:00');
    await decidio(duena, 'apagado');
    await expect(espera(duena)).toHaveCount(0);
    await duena.evaluate(() => {
      window.localStorage.removeItem('morphiqpos.modo-espera');
    });
  });

  test('un diálogo abierto debajo no la tapa, y despertarla no lo cierra', async ({
    browser,
  }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await abrirConReloj(duena, '/inventario');
    await duena.getByTitle('Cargar inventario que ya tenías antes de usar el POS').click();
    const debajo = duena.getByRole('dialog', { name: /Registrar inventario existente/ });
    await expect(debajo).toBeVisible();

    // Espías donde escuchan los atajos de la ventana (F12 cobra) y el diálogo de abajo, que se
    // cierra si ve el foco, un toque o Escape fuera de él: con la capa arriba no les llega nada.
    await duena.evaluate(() => {
      const ventana = window as unknown as { __afuera: Record<string, number> };
      ventana.__afuera = { keydown: 0, pointerdown: 0, focusin: 0 };
      window.addEventListener('keydown', () => {
        ventana.__afuera['keydown'] = (ventana.__afuera['keydown'] ?? 0) + 1;
      });
      for (const tipo of ['pointerdown', 'focusin'])
        document.addEventListener(tipo, () => {
          ventana.__afuera[tipo] = (ventana.__afuera[tipo] ?? 0) + 1;
        });
    });
    const afuera = () =>
      duena.evaluate(() => (window as unknown as { __afuera: Record<string, number> }).__afuera);

    await duena.clock.fastForward('03:10');
    await expect(espera(duena)).toBeVisible();
    // Escape despierta la espera y no llega al diálogo de abajo (que se cerraría con él).
    await duena.keyboard.press('Escape');
    await expect(espera(duena)).toHaveAttribute('data-modo-espera', 'despertando');
    expect(await afuera()).toEqual({ keydown: 0, pointerdown: 0, focusin: 0 });
    await espera(duena).click();
    await expect(espera(duena)).toHaveCount(0);
    // Al irse la capa, el foco vuelve al diálogo de abajo (ese `focusin` sí cuenta); el dedo no.
    expect((await afuera())['pointerdown']).toBe(0);
    await expect(debajo).toBeVisible();
  });

  test('un toque la despierta sin caer en el botón de abajo', async ({ browser }, info) => {
    test.skip(info.project.use.hasTouch !== true, 'sólo en los aparatos táctiles');
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await abrirConReloj(duena, '/inventario');
    const boton = duena.getByTitle('Cargar inventario que ya tenías antes de usar el POS');
    const caja = await boton.boundingBox();
    expect(caja, 'el botón de abajo tiene que verse').not.toBeNull();
    const x = (caja?.x ?? 0) + (caja?.width ?? 0) / 2;
    const y = (caja?.y ?? 0) + (caja?.height ?? 0) / 2;

    await duena.clock.fastForward('03:10');
    await expect(espera(duena)).toBeVisible();
    await duena.touchscreen.tap(x, y);
    await expect(espera(duena)).toHaveAttribute('data-modo-espera', 'despertando');
    await duena.touchscreen.tap(x, y);
    await expect(espera(duena)).toHaveCount(0);
    await expect(duena.getByRole('dialog', { name: /Registrar inventario existente/ })).toHaveCount(
      0,
    );
  });

  test('«Pedir PIN al despertar»: sin el PIN no vuelve, ni con el teclado ni recargando', async ({
    browser,
  }, info) => {
    const duena = await new Equipo(browser, SLUG).pagina(info, 'dueno');
    await experiencia(duena, { pin_al_despertar: true });
    try {
      await abrirConReloj(duena, '/inventario');
      await duena.getByPlaceholder('Buscar ingrediente...').fill('cebolla');
      await duena.clock.fastForward('03:10');
      await espera(duena).click();
      await expect(espera(duena)).toHaveAttribute('data-modo-espera', 'despertando');
      await espera(duena).click();

      const pin = pinDe(duena);
      await expect(pin).toBeVisible();
      // Ni Escape dos veces ni que el navegador cierre el diálogo (el gesto Atrás de Android)
      // quitan la pantalla del PIN.
      await duena.keyboard.press('Escape');
      await duena.keyboard.press('Escape');
      await expect(pin).toBeVisible();
      await pin.evaluate((dialogo) => {
        (dialogo as HTMLDialogElement).close();
      });
      await expect(pin).toBeVisible();
      await expect(pin).toHaveJSProperty('open', true);
      // El Tab no sale de la capa: nada de la pantalla de abajo se alcanza.
      for (let vuelta = 0; vuelta < 15; vuelta += 1) {
        await duena.keyboard.press('Tab');
        expect(await focoFueraDeLaCapa(duena), `Tab número ${String(vuelta + 1)}`).toBe(false);
      }
      // Un PIN equivocado, con el teclado físico: no vuelve y lo dice.
      await duena.keyboard.type('9999');
      await expect(pin.getByRole('alert')).toBeVisible();
      await expect(pin).toBeVisible();
      for (const digito of DUENO_DE_DEMO.pin) {
        await pin.getByRole('button', { name: digito, exact: true }).click();
      }
      await expect(pin).toHaveCount(0);
      await expect(duena.getByPlaceholder('Buscar ingrediente...')).toHaveValue('cebolla');

      // Otra vez dormida y con el PIN a la vista: recargar no quita el candado.
      await duena.clock.fastForward('03:10');
      await espera(duena).click();
      await expect(espera(duena)).toHaveAttribute('data-modo-espera', 'despertando');
      await espera(duena).click();
      await expect(pinDe(duena)).toBeVisible();
      await duena.reload();
      await expect(pinDe(duena)).toBeVisible();
      await duena.keyboard.type(DUENO_DE_DEMO.pin);
      await expect(pinDe(duena)).toHaveCount(0);
    } finally {
      await experiencia(duena, { pin_al_despertar: false });
    }
  });

  test('con el PIN, una cuenta pedida despierta al PIN y no a la caja', async ({
    browser,
  }, info) => {
    const equipo = new Equipo(browser, SLUG);
    const duena = await equipo.pagina(info, 'dueno');
    const caja = await equipo.pagina(info, 'cajero');
    await cancelarLaCuentaDeLaMesa(duena);
    await experiencia(duena, { pin_al_despertar: true });
    try {
      await abrirConReloj(caja, '/caja');
      await caja.clock.fastForward('03:10');
      await expect(espera(caja)).toBeVisible();

      const ordenId = await comandaNueva(duena);
      await escribir(duena, '/api/restaurante/solicitar-cuenta', { ordenId });
      // La caja lee cada 2 s: con el reloj detenido, se le dan unas vueltas.
      await caja.clock.runFor(6_000);
      await expect(pinDe(caja)).toBeVisible();
      await expect(espera(caja)).toHaveCount(0);

      // Si nadie teclea, la pantalla del PIN vuelve a dormirse a los 30 s.
      await caja.clock.fastForward('00:35');
      await expect(espera(caja)).toBeVisible();
      await espera(caja).click();
      await expect(espera(caja)).toHaveAttribute('data-modo-espera', 'despertando');
      await espera(caja).click();
      await expect(pinDe(caja)).toBeVisible();

      // «Cambiar de persona» cierra la sesión y lleva a la entrada.
      const empleo = await caja.evaluate(() => localStorage.getItem('morphiqpos.candado-del-pin'));
      expect(empleo, 'el candado se puso al dormirse con el PIN').not.toBeNull();
      await pinDe(caja).getByRole('button', { name: 'Cambiar de persona' }).click();
      await expect(caja).toHaveURL(/login-pos/);
      expect(
        await caja.evaluate(() => localStorage.getItem('morphiqpos.candado-del-pin')),
        'cerrar la sesión quita el candado',
      ).toBeNull();

      // Un candado viejo de la misma persona (su sesión venció con el PIN a la vista) se quita al
      // entrar con su PIN: no se le vuelve a pedir nada más entrar.
      await caja.evaluate((id) => {
        localStorage.setItem('morphiqpos.candado-del-pin', id ?? '');
      }, empleo);
      await entrar(caja, personaDe(SLUG, 'cajero'));
      await caja.goto('/caja');
      await expect(caja.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(pinDe(caja)).toHaveCount(0);
    } finally {
      await cancelarLaCuentaDeLaMesa(duena);
      await experiencia(duena, { pin_al_despertar: false });
    }
  });
});
