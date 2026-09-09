import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

/**
 * DIA-01 · El día del cajero, en el navegador (F1.1-C-19).
 *
 * Enrolar → entrar con PIN → abrir caja → vender → cobrar → ticket → corte.
 * Es el guion que Miguel ejecuta delante de un cliente.
 *
 * ── Por qué esto no duplica a `humo-venta.mjs` ─────────────────────────────
 * El humo recorre la API por HTTP: prueba el servidor. Esto recorre la
 * PANTALLA: que el botón exista, que el foco viva en el buscador, que el total
 * que se ve sea el que se cobra. Ya encontró un fallo que el humo no podía ver
 * —el buscador le robaba el foco al diálogo de caja y el fondo se escribía en
 * la búsqueda—, que es exactamente para lo que sirve.
 *
 * ── Contra una base REAL, y partiendo de un estado conocido ────────────────
 * No hay dobles: las ventas quedan en Postgres. Y cada prueba empieza con el
 * turno CERRADO, porque una sesión de caja que quedó abierta en otra corrida
 * hace fallar a la siguiente por una razón que no tiene nada que ver con lo
 * que se está probando.
 *
 * ── Una sola terminal para las tres pruebas ────────────────────────────────
 * El enrolamiento ocurre UNA vez y las tres pruebas comparten el contexto. No
 * es una optimización: enrolar en cada prueba agotaba el límite de tasa por IP
 * que puso C-13, y la suite se bloqueaba a sí misma con «demasiados intentos
 * desde esta red». Además una caja real se enrola una vez en su vida, así que
 * esto se parece más a lo que pasa de verdad.
 */

const PIN = '4821';
const ORG = 'demo-ferreteria-la-broca';

/**
 * Cabeceras que exige la frontera de escritura (C-13) más la de idempotencia.
 *
 * `idempotency-key` no es opcional en un comando que escribe: sin ella el
 * envoltorio devuelve 400. Lo descubrió esta prueba intentando cerrar el turno
 * de preparación, y está bien que sea así — es la garantía de que un doble clic
 * no cobra dos veces.
 */
function cabeceras(): Record<string, string> {
  return {
    'x-morphiqpos-request': '1',
    'content-type': 'application/json',
    'idempotency-key': crypto.randomUUID(),
  };
}

/** Corre `db:bootstrap` y devuelve el código de enrolamiento en claro. */
function codigoDeEnrolamiento(): string {
  const salida = execFileSync(
    process.execPath,
    [
      '--conditions=react-server',
      'packages/app/bin/bootstrap.mjs',
      '--org',
      ORG,
      '--persona',
      'Elena',
      '--pin',
      PIN,
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );
  const codigo = /Código de enrolamiento:\s+(\d{6})/.exec(salida)?.[1];
  if (codigo === undefined) throw new Error(`El arranque no dio código:\n${salida}`);
  return codigo;
}

/** Enrola el dispositivo y entra. Deja la pantalla en `/venta`. */
async function entrar(pagina: Page): Promise<void> {
  await pagina.goto('/enrolar');
  await pagina.getByLabel('Código de enrolamiento').fill(codigoDeEnrolamiento());
  await pagina.getByRole('button', { name: 'Dar de alta' }).click();

  await expect(pagina).toHaveURL(/\/entrar/);
  await pagina.getByLabel('¿Quién eres?').selectOption({ index: 1 });
  await pagina.getByLabel('Tu PIN').fill(PIN);
  await pagina.getByRole('button', { name: 'Entrar', exact: true }).click();

  await expect(pagina).toHaveURL(/\/venta/);
}

/**
 * Deja el turno cerrado, por API.
 *
 * Se hace por API y no por pantalla a propósito: es preparación, no lo que se
 * está probando, y hacerlo por la interfaz metería en cada prueba los fallos
 * de la pantalla de corte.
 */
async function cerrarTurnoSiHay(pagina: Page): Promise<void> {
  const estado = await pagina.request.post('/api/caja/estado', { headers: cabeceras(), data: {} });
  const cuerpo = (await estado.json()) as {
    ok?: boolean;
    datos?: { abierta?: boolean };
    error?: { mensaje?: string };
  };

  // Si la preparación falla, se dice EN LA PREPARACIÓN. Tragarse el error aquí
  // hace que la prueba muera después con «esa terminal ya tiene una caja
  // abierta», que apunta al sitio equivocado y cuesta media hora.
  if (cuerpo.ok !== true) {
    throw new Error(
      `No se pudo leer el estado de la caja (HTTP ${String(estado.status())}): ` +
        (cuerpo.error?.mensaje ?? JSON.stringify(cuerpo).slice(0, 200)),
    );
  }
  if (cuerpo.datos?.abierta !== true) return;

  const cierre = await pagina.request.post('/api/caja/cerrar', {
    headers: cabeceras(),
    data: { efectivoContadoCentavos: 0, notas: 'Cierre de preparación de la prueba E2E' },
  });
  if (!cierre.ok()) {
    throw new Error(`No se pudo cerrar el turno previo: HTTP ${String(cierre.status())}`);
  }
  await pagina.reload();
}

/** Abre la caja desde la PANTALLA, que es lo que hace el cajero. */
async function abrirCajaEnPantalla(pagina: Page): Promise<void> {
  await pagina.getByRole('button', { name: /Caja cerrada/ }).click();

  const fondo = pagina.getByLabel('Fondo inicial');
  await fondo.fill('500');
  // Que lo tecleado se quede DONDE se tecleó. Esta línea es la regresión: el
  // buscador recuperaba el foco al perderlo y el fondo acababa en la búsqueda.
  await expect(fondo).toHaveValue('500');

  await pagina.getByRole('button', { name: 'Abrir caja' }).click();
  await expect(pagina.getByText('Caja abierta')).toBeVisible();
}

/** Agrega el primer resultado de la búsqueda usando SÓLO el teclado. */
async function agregarConTeclado(pagina: Page): Promise<void> {
  const buscador = pagina.getByLabel('Buscar producto');
  await expect(buscador).toBeFocused();

  // Se espera a que la lista exista antes de pulsar Enter: el buscador aguarda
  // 180 ms antes de consultar, para no lanzar una petición por tecla. Es una
  // condición y no un `waitForTimeout` — esperar por reloj es exactamente como
  // se fabrican las pruebas frágiles.
  await expect(pagina.locator('#resultados-venta li').first()).toBeVisible();
  await buscador.press('Enter');

  // Y se espera a que la línea LLEGUE al carrito: agregar es un viaje al
  // servidor, y pulsar «Cobrar» antes de que vuelva lo encuentra deshabilitado.
  await expect(pagina.getByRole('button', { name: /^Cobrar/ })).toBeEnabled();
}

test.describe('DIA-01 · el día del cajero', () => {
  test.describe.configure({ mode: 'serial' });

  let contexto: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    contexto = await browser.newContext();
    page = await contexto.newPage();
    await entrar(page);
  });

  test.afterAll(async () => {
    await contexto.close();
  });

  test.beforeEach(async () => {
    await page.goto('/venta');
    await cerrarTurnoSiHay(page);
  });

  test('entra y el foco vive en el buscador', async () => {
    await expect(page.getByRole('heading', { name: 'Venta', exact: true })).toBeVisible();
    // Un escáner es un teclado que escribe muy rápido y termina con Enter. Si
    // el foco no está aquí desde el primer instante, se pierde la lectura.
    await expect(page.getByLabel('Buscar producto')).toBeFocused();
  });

  test('abre caja, cobra en efectivo y sale el ticket con folio', async () => {
    await abrirCajaEnPantalla(page);
    await agregarConTeclado(page);

    await page.getByRole('button', { name: /^Cobrar/ }).click();

    const dialogo = page.getByRole('dialog', { name: 'Total a cobrar' });
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: 'Cobrar', exact: true }).click();

    // El folio sólo puede darlo la base: es la prueba de que el cobro llegó al
    // servidor y se confirmó, no de que la pantalla se puso bonita.
    const ticket = page.getByRole('dialog', { name: /Cobrado/ });
    await expect(ticket).toBeVisible();
    await expect(ticket).toContainText(/Cobrado · A-\d+/);
  });

  test('el corte se cuenta a ciegas y acusa el faltante', async () => {
    await abrirCajaEnPantalla(page);

    await page.goto('/corte');
    await expect(page.getByRole('heading', { name: 'Corte de caja' })).toBeVisible();

    // El esperado NO puede estar en pantalla antes de teclear lo contado. Si
    // algún día aparece, el corte deja de encontrar faltantes: nadie cuenta.
    await expect(page.getByText('Efectivo esperado')).toBeHidden();

    await page.getByLabel('¿Cuánto efectivo hay en el cajón?').fill('0');
    await page.getByRole('button', { name: 'Cerrar caja' }).click();

    // Con 500 de fondo y cero contado, faltan 500. Nunca «cuadra».
    await expect(page.getByRole('heading', { name: 'Falta dinero' })).toBeVisible();
    await expect(page.getByText('Efectivo esperado')).toBeVisible();
  });
});
