import { expect, type Page, test } from '@playwright/test';

import { conciliarElDia } from '../../packages/testing/src/conciliacion.ts';

import {
  exigirQueCuadre,
  existenciaDe,
  leerElServidor,
  Libro,
  movimientosDeInventarioPrevios,
  sesionDeLaCaja,
} from './ayudantes/conciliacion.ts';
import { Equipo, opcionesDelProyecto, personaDe } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  exigirDemostracion,
  soltarLaCaja,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * EL DÍA COMPLETO DEL RESTAURANTE, POR EL RECORRIDO QUE SE PRESENTA (20-10-2026).
 *
 * Las pantallas son las que Miguel enseña: las heredadas, que desde el rescate del 19-10 son
 * el recorrido principal del restaurante —la dueña al tablero, la mesera a «Mesas y pedidos»,
 * la cocina a «Cocina» y la cajera a «Caja»—. Cada uno llega a la suya al entrar y trabaja en
 * su aparato, con su terminal: Rosa abre la caja con $1,500, Lupita abre mesas y comanda, Toño
 * prepara lo de la cocina Y lo de la barra, Lupita entrega y pide la cuenta con la propina que
 * acordó la mesa, y Rosa cobra en efectivo con cambio, con tarjeta, mixto, la cuenta con
 * tarjeta y la propina SÓLO en billete (la 184), y por transferencia. Al final, el corte
 * de turno, el cierre del día a ciegas con un faltante, la dueña que lo lee desde su teléfono,
 * y el dinero y el almacén que tienen que cuadrar al centavo contra el servidor
 * (`conciliarElDia`), con un centavo de más que NO cuadra.
 *
 * Lo encontró este recorrido y se arregló antes de escribirlo como prueba (bitácora 20-10):
 * la mesera no podía pedir la cuenta (el corte, 403 para su rol), las bebidas no las veía
 * nadie (la cocina sólo pedía el área `cocina`) y la caja enseñaba la caja de otra terminal.
 * `vigilarFallos` hace que cualquiera de esos 4xx vuelva a tumbar el día.
 */

const SLUG = 'demo-acople-restaurante';
const FONDO_CENTAVOS = 150_000;
/** La venta del día, sin propinas: las mesas 1 a 5. */
const VENDIDO_DEL_DIA = 56_400 + 28_300 + 39_900 + 10_000 + 15_400;

const PLATILLO = {
  guacamole: 'Guacamole con totopos',
  arrachera: 'Arrachera al carbón',
  pastor: 'Orden de tacos al pastor',
  cerveza: 'Cerveza clara 355 ml',
  limonada: 'Limonada natural 500 ml',
  mineral: 'Agua mineral 355 ml',
} as const;

/** Lo que las recetas sacan del almacén por platillo cobrado (la siembra de la demo). */
const RECETA = {
  arrachera: { insumo: 'Arrachera', gramos: 280 },
  guacamole: { insumo: 'Aguacate', gramos: 180 },
  pastor: { insumo: 'Carne al pastor', gramos: 180 },
} as const;

const pesos = (centavos: number): string => (centavos / 100).toFixed(2);
/** Como lo escribe la pantalla: `$1,246.00`. */
const enPantalla = (centavos: number): string =>
  `$${(centavos / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

/** El número de la mesa, en el mapa (escritorio y tableta) y en la lista del teléfono. */
function laMesa(page: Page, numero: number) {
  return page
    .locator('span.font-heading')
    .filter({ hasText: new RegExp(`^${String(numero)}$`) })
    .first();
}

/** La mesa que la mesera tiene abierta (el diálogo de la mesa). */
function dialogoDeLaMesa(page: Page, numero: number) {
  // Su nombre es el encabezado: «Mesa 1 Esperando orden 4».
  return page.getByRole('dialog', { name: new RegExp(`^Mesa ${String(numero)} `) });
}

/**
 * Espera a que el diálogo termine de abrir. Entra con una animación de escala, y un toque que
 * llega antes de que termine —a los 165 ms, que sólo la prueba alcanza— se pierde: la traza
 * lo dejó dicho, «Abrir mesa» tocado y ninguna petición enviada. Una mesera toca cuando lo ve.
 *
 * Se espera a las animaciones que terminan: las que se repiten sin fin (un pulso) no acaban
 * nunca, y una que React cancela al volver a pintar rechaza su `finished` —en la PC tumbó la
 * entrega con un AbortError—; tras cada tanda se vuelve a mirar por si empezó otra.
 */
async function yaAbierto(dialogo: ReturnType<Page['getByRole']>): Promise<void> {
  await expect(dialogo).toBeVisible({ timeout: 30_000 });
  await dialogo.evaluate(async (el) => {
    const hasta = performance.now() + 10_000;
    while (performance.now() < hasta) {
      const enCurso = el
        .getAnimations({ subtree: true })
        .filter(
          (a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity,
        );
      if (enCurso.length === 0) return;
      await Promise.allSettled(enCurso.map((a) => a.finished));
    }
  });
}

async function abrirLaMesa(page: Page, numero: number, personas: number): Promise<void> {
  await laMesa(page, numero).click();
  const apertura = page.getByRole('dialog', { name: `Abrir mesa ${String(numero)}` });
  await yaAbierto(apertura);
  // «Número de personas» no está ligado a su campo: es el único numérico del diálogo.
  await apertura.getByRole('spinbutton').first().fill(String(personas));
  const abierta = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/restaurante/abrir-mesa' && r.ok(),
  );
  await apertura.getByRole('button', { name: 'Abrir mesa' }).click();
  await abierta;
  await yaAbierto(dialogoDeLaMesa(page, numero));
}

/**
 * Las dos acciones de la orden: al pie del diálogo en la tableta y la PC; en el teléfono, en el
 * carrito flotante de abajo, que se abre y ahí están. El carrito se anuncia con su globo
 * delante —«4 4 productos $564.00 · Ver pedido Confirmar»— o, vacío, «Mesa abierta Solicitar
 * cuenta Abrir»: por eso la acción se busca exacta, para no tocar el carrito otra vez.
 */
async function accionDeLaMesa(
  page: Page,
  numero: number,
  accion: 'Enviar a Cocina' | 'Solicitar cuenta',
): Promise<void> {
  const enElDialogo = dialogoDeLaMesa(page, numero)
    .getByRole('button', { name: accion, exact: true })
    .filter({ visible: true });
  const carrito = page
    .getByRole('button', { name: /\d+ productos? .*Ver pedido|^Mesa abierta\b/ })
    .filter({ visible: true });
  await expect(enElDialogo.or(carrito).first()).toBeVisible();
  if ((await enElDialogo.count()) > 0) {
    await enElDialogo.click();
    return;
  }
  await carrito.last().click();
  await page
    .getByRole('button', { name: accion, exact: true })
    .filter({ visible: true })
    .last()
    .click();
}

async function comandar(page: Page, numero: number, platillos: readonly string[]): Promise<void> {
  const mesa = dialogoDeLaMesa(page, numero);
  for (const platillo of platillos) {
    await mesa
      .getByRole('button', { name: new RegExp(`^${platillo.replace(/[()]/g, '\\$&')} \\$`) })
      .click();
  }
  await accionDeLaMesa(page, numero, 'Enviar a Cocina');
  await expect(page.getByText('¡Pedido enviado a cocina!').first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Cierra el diálogo de la mesa y vuelve al mapa. */
async function alMapa(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** Toño saca TODO lo de esa mesa: cada comanda, de la cocina y de la barra. */
async function prepararLaMesa(page: Page, numero: number, comandas: number): Promise<void> {
  const tarjetas = page
    .locator('div')
    .filter({ hasText: new RegExp(`^Mesa ${String(numero)}\\b`) });
  for (const [accion, columna] of [
    ['Preparar', 'Nuevos'],
    ['Listo', 'En preparación'],
  ] as const) {
    await expect(
      page.getByRole('button', { name: accion }),
      `La cocina no tiene las ${String(comandas)} comandas de la mesa ${String(numero)} en «${columna}».`,
    ).toHaveCount(comandas, { timeout: 30_000 });
    for (let i = 0; i < comandas; i += 1) {
      await page.getByRole('button', { name: accion }).first().click();
      await expect(page.getByRole('button', { name: accion })).toHaveCount(comandas - i - 1, {
        timeout: 30_000,
      });
    }
  }
  await expect(tarjetas.getByText('Esperando que el mesero recoja').first()).toBeVisible();
}

/** Lupita recoge y entrega lo listo de la mesa; la mesa queda «Ocupada». */
async function entregar(page: Page, numero: number): Promise<void> {
  await laMesa(page, numero).click();
  const mesa = dialogoDeLaMesa(page, numero);
  await yaAbierto(mesa);
  const marcar = mesa.getByRole('button', { name: 'Marcar entregado' });
  await expect(marcar.first()).toBeVisible({ timeout: 30_000 });
  while ((await marcar.count()) > 0) {
    // La espera se pide ANTES del clic: en el teléfono la respuesta llegaba antes de que la
    // prueba empezara a escucharla, y la esperaba para siempre con la entrega ya hecha.
    const entregada = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/restaurante/entregar-pedidos' && r.ok(),
    );
    await marcar.first().click();
    await entregada;
  }
  await expect(mesa.getByText('Ocupada', { exact: true })).toBeVisible({ timeout: 30_000 });
}

/** La mesera pide la cuenta con la propina que acordó la mesa; devuelve el código de caja. */
async function pedirLaCuenta(
  page: Page,
  numero: number,
  propina: '10%' | '15%' | 'Sin propina',
  totalCentavos: number,
): Promise<string> {
  await accionDeLaMesa(page, numero, 'Solicitar cuenta');
  const pregunta = page.getByRole('dialog').filter({ hasText: '¿Desean agregar propina?' });
  await yaAbierto(pregunta);
  if (propina === 'Sin propina') {
    await pregunta.getByRole('button', { name: 'Sin propina' }).click();
  } else {
    await pregunta.getByText(propina, { exact: true }).click();
    await pregunta.getByRole('button', { name: 'Aplicar' }).click();
  }
  const precuenta = page.getByRole('dialog').filter({ hasText: 'PRE-CUENTA' });
  await yaAbierto(precuenta);
  // El TOTAL de la hoja, no cualquier cifra: sin propina el subtotal dice lo mismo.
  await expect(precuenta).toContainText(
    new RegExp(`TOTAL\\s*${enPantalla(totalCentavos).replace(/[$.]/g, '\\$&')}`),
  );
  const codigo = /M\d{2}-\d{4}/.exec(await precuenta.innerText())?.[0] ?? '';
  expect(codigo, 'La precuenta no trae el código para caja.').not.toBe('');
  await precuenta.getByRole('button', { name: 'Cerrar' }).click();
  await expect(precuenta).toBeHidden();
  return codigo;
}

interface Cobrado {
  readonly ventaId: string;
  readonly folio: string;
  readonly ventaCentavos: number;
  readonly propinaCentavos: number;
  readonly cambioCentavos: number;
}

/** Rosa cobra la cuenta de la mesa desde Pendientes, con el método que dijo el comensal. */
async function cobrar(
  page: Page,
  numero: number,
  pago:
    | { readonly metodo: 'Efectivo'; readonly recibidoCentavos: number }
    | { readonly metodo: 'Tarjeta' }
    | { readonly metodo: 'Transferencia' }
    | {
        readonly metodo: 'Mixto';
        /** La VENTA por método, sin la propina; cero deja el campo vacío. */
        readonly efectivoCentavos: number;
        readonly tarjetaCentavos: number;
        /** Con qué se pagó la propina, exacta por método (el desglose de abajo). */
        readonly propinaEfectivoCentavos?: number;
        readonly propinaTarjetaCentavos?: number;
      },
): Promise<Cobrado> {
  await page.getByRole('tab', { name: /^Pendientes/ }).click();
  await page.getByRole('button', { name: new RegExp(`^Mesa ${String(numero)} Cuenta`) }).click();
  const dialogo = page.getByRole('dialog').filter({ hasText: `Cobrar — Mesa ${String(numero)}` });
  await yaAbierto(dialogo);
  await dialogo.getByRole('button', { name: pago.metodo, exact: true }).click();
  if (pago.metodo === 'Efectivo') {
    await dialogo.getByPlaceholder('0.00').fill(pesos(pago.recibidoCentavos));
  }
  if (pago.metodo === 'Mixto') {
    // «Efectivo», «Tarjeta» y «Transfer.» de la venta, y debajo —si hay propina— los mismos
    // tres de la propina: en ese orden y sin etiqueta ligada a su campo.
    const partes = dialogo.getByPlaceholder('0', { exact: true });
    if (pago.efectivoCentavos > 0) await partes.nth(0).fill(pesos(pago.efectivoCentavos));
    if (pago.tarjetaCentavos > 0) await partes.nth(1).fill(pesos(pago.tarjetaCentavos));
    if (pago.propinaEfectivoCentavos !== undefined) {
      await partes.nth(3).fill(pesos(pago.propinaEfectivoCentavos));
    }
    if (pago.propinaTarjetaCentavos !== undefined) {
      await partes.nth(4).fill(pesos(pago.propinaTarjetaCentavos));
    }
    // La línea que dice si la venta (sin propina) quedó cubierta, antes de cobrar.
    await expect(dialogo.getByText(/^✓ La venta \(\$[\d,.]+\) queda cubierta\.$/)).toBeVisible();
  }
  const respuesta = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/venta/cobrar' && r.request().method() === 'POST',
  );
  await dialogo.getByRole('button', { name: /^Cobrar \$/ }).click();
  const cuerpo = (await (await respuesta).json()) as {
    readonly ok: boolean;
    readonly error?: { readonly mensaje?: string };
    readonly datos?: {
      readonly ordenId: string;
      readonly folio: string;
      readonly totalCentavos: string;
      readonly propinaCentavos: string;
      readonly cambioCentavos: string;
    };
  };
  expect(cuerpo.ok, `El cobro de la mesa ${String(numero)}: ${cuerpo.error?.mensaje ?? ''}`).toBe(
    true,
  );
  const datos = cuerpo.datos!;
  // Se cierra cuando terminó de abrir: un toque durante la animación se perdió una vez en el
  // teléfono, y el cobro siguiente ya no encontraba las pestañas detrás del ticket.
  const ticket = page.getByRole('dialog').filter({ hasText: 'TICKET DE PAGO' });
  await yaAbierto(ticket);
  await ticket.getByRole('button', { name: 'Cerrar' }).click();
  await expect(ticket).toBeHidden();
  return {
    ventaId: datos.ordenId,
    folio: datos.folio,
    ventaCentavos: Number(datos.totalCentavos),
    propinaCentavos: Number(datos.propinaCentavos),
    cambioCentavos: Number(datos.cambioCentavos),
  };
}

/** En el teléfono los botones de la caja se acortan: «Turno» y «Cierre». */
const EN_EL_TELEFONO = { 'Corte de turno': 'Turno', 'Cierre diario': 'Cierre' } as const;

function botonDeLaCaja(page: Page, nombre: keyof typeof EN_EL_TELEFONO) {
  return page.getByRole('button', {
    name: new RegExp(`^(${nombre}|${EN_EL_TELEFONO[nombre]})$`),
  });
}

async function esperadoDelCajon(page: Page): Promise<number> {
  const respuesta = await page.request.post('/api/caja/estado', {
    headers: cabecerasDeEscrituraDePrueba(),
    data: { efectivoContadoCentavos: 0 },
  });
  expect(respuesta.status()).toBe(200);
  const cuerpo = (await respuesta.json()) as {
    readonly datos?: { readonly efectivoEsperadoCentavos?: string };
  };
  return Number(cuerpo.datos?.efectivoEsperadoCentavos ?? Number.NaN);
}

const ESTILOS = ['morphiq', 'cristal', 'relieve', 'taller', 'bloque', 'terminal', 'papel', 'noche'];

/**
 * El botón del menú del teléfono se tiene que VER, en los ocho estilos, claros y oscuros. Era
 * `text-primario-texto` —el texto sobre el primario— encima de la barra: contraste de 1.0 a
 * 1.4 en once de los dieciséis, entre ellos «noche», el de esta demo, y la mesera no veía cómo
 * abrir su menú. Un ícono que se toca pide 3:1 (WCAG 1.4.11). Devuelve los que no llegan.
 */
function menuIlegible(page: Page): Promise<string[]> {
  return page.evaluate((estilos) => {
    const pincel = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const luz = (color: string): number => {
      if (pincel === null) return Number.NaN;
      pincel.clearRect(0, 0, 1, 1);
      pincel.fillStyle = color;
      pincel.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0] = [...pincel.getImageData(0, 0, 1, 1).data].map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    // El estilo y el modo viven en `data-estilo` y `data-modo` de la raíz: la clase `dark` sólo
    // la traduce un observador a `data-modo` un instante después, y medir antes daba el claro.
    const raiz = document.documentElement;
    const { estilo, modo: modoAntes } = raiz.dataset;
    const boton = document.querySelector('button[aria-label="Abrir menú"]');
    const icono = boton?.querySelector('svg');
    if (!boton || !icono) return ['no está el botón del menú'];
    const malos: string[] = [];
    for (const e of estilos) {
      for (const modo of [false, true]) {
        raiz.dataset['estilo'] = e;
        raiz.dataset['modo'] = modo ? 'oscuro' : 'claro';
        const [a, b] = [
          luz(getComputedStyle(icono).color),
          luz(getComputedStyle(boton).backgroundColor),
        ];
        const contraste = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (!(contraste >= 3)) malos.push(`${e}${modo ? ' oscuro' : ''} ${contraste.toFixed(2)}`);
      }
    }
    for (const [atributo, valor] of [
      ['data-estilo', estilo],
      ['data-modo', modoAntes],
    ] as const) {
      if (valor === undefined) raiz.removeAttribute(atributo);
      else raiz.setAttribute(atributo, valor);
    }
    return malos;
  }, ESTILOS);
}

/** Las entradas del menú lateral de esta persona, por su nombre. En teléfono, tras la hamburguesa. */
async function elMenuDe(page: Page): Promise<readonly string[]> {
  const hamburguesa = page.getByRole('button', { name: 'Abrir menú' });
  const enTelefono = await hamburguesa.isVisible();
  if (enTelefono) {
    expect(await menuIlegible(page), 'El botón del menú no se ve en estos estilos').toEqual([]);
    await hamburguesa.click();
  }
  const menu = page.getByRole('navigation', { name: 'Menú principal' }).filter({ visible: true });
  await expect(menu).toBeVisible();
  const entradas = (await menu.getByRole('link').allInnerTexts())
    .map((t) => t.trim())
    .filter((t) => t !== '');
  if (enTelefono) {
    // El cajón del teléfono no se cierra con Escape: con su X, como lo cierra la mesera.
    await page.getByRole('button', { name: 'Cerrar menú' }).click();
    await expect(menu).toHaveCount(0);
  }
  return entradas;
}

test.describe('el día completo del restaurante', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('un día de servicio por el recorrido que se presenta, cuadrado al centavo', async ({
    browser,
  }, info) => {
    test.setTimeout(25 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const libro = new Libro();
    const fallos: (() => void)[] = [];
    const conCaja: Page[] = [];

    try {
      // ── LA DUEÑA EMPIEZA EL DÍA EN LIMPIO ───────────────────────────────────
      const duena = await equipo.pagina(info, 'dueno');
      fallos.push(vigilarFallos(duena));
      await test.step('reseteo de la demo', async () => {
        const respuesta = await duena.request.post('/api/catalogo/demostracion/resetear', {
          headers: cabecerasDeEscrituraDePrueba(),
          data: { confirmacion: 'RESETEAR' },
        });
        expect(respuesta.status(), `resetear_demo: ${await respuesta.text()}`).toBe(200);
      });
      libro.empezarInventario(await movimientosDeInventarioPrevios(duena));
      for (const { insumo } of Object.values(RECETA)) {
        libro.existenciaAntes(insumo, await existenciaDe(duena, insumo));
      }

      // ── CADA QUIEN EN SU PUESTO ──────────────────────────────────────────────
      const rosa = await equipo.pagina(info, 'cajero');
      fallos.push(vigilarFallos(rosa));
      conCaja.push(rosa);
      const lupita = await equipo.pagina(info, 'mesero');
      fallos.push(vigilarFallos(lupita));
      const tono = await equipo.pagina(info, 'cocina');
      fallos.push(vigilarFallos(tono));

      await test.step('cada puesto entra a SU pantalla y la mesera sólo ve lo suyo', async () => {
        await rosa.goto('/');
        await rosa.waitForURL(/\/caja$/);
        await lupita.goto('/');
        await lupita.waitForURL(/\/mesero$/);
        await tono.goto('/');
        await tono.waitForURL(/\/cocina$/);
        expect(await elMenuDe(lupita)).toEqual(['Mesas y pedidos']);
        expect(await elMenuDe(tono)).toEqual(['Cocina']);
        // La pantalla de otro puesto no se pinta: la mesera que teclea la caja vuelve a sus mesas.
        await lupita.goto('/caja');
        await lupita.waitForURL(/\/mesero$/);
        // Tampoco las que no están en el menú (cierre del 21-10): el mostrador y las vistas del
        // restaurante se abrían tecleándolas desde cualquier puesto.
        for (const [quien, ajena, suya] of [
          [lupita, '/pos', /\/mesero$/],
          [lupita, '/restaurante/cobro', /\/mesero$/],
          [tono, '/restaurante/recetas', /\/cocina$/],
          [tono, '/pos', /\/cocina$/],
          [rosa, '/restaurante/inventario', /\/caja$/],
          [rosa, '/configuracion', /\/caja$/],
        ] as const) {
          await quien.goto(ajena);
          await quien.waitForURL(suya);
        }
      });

      let sesion = '';
      await test.step('Rosa abre la caja con $1,500', async () => {
        await rosa.getByRole('button', { name: 'Abrir caja' }).first().click();
        const apertura = rosa.getByRole('dialog').filter({ hasText: 'Efectivo inicial contado' });
        await apertura.getByPlaceholder('0.00').fill(pesos(FONDO_CENTAVOS));
        await apertura.getByRole('button', { name: 'Abrir caja' }).click();
        await expect(rosa.getByText('Caja abierta. Ya puedes cobrar.').first()).toBeVisible({
          timeout: 30_000,
        });
        sesion = (await sesionDeLaCaja(rosa)) ?? '';
        expect(sesion, 'La caja de la terminal de Rosa no quedó abierta.').not.toBe('');
        libro.abrirCaja('caja de Rosa', sesion, FONDO_CENTAVOS);
      });

      // ── MESA 1 · COMIDA Y CERVEZAS, 10 % Y EFECTIVO CON CAMBIO ──────────────
      await test.step('Lupita abre la mesa 1 para cuatro y comanda comida y cervezas', async () => {
        await abrirLaMesa(lupita, 1, 4);
        await comandar(lupita, 1, [
          PLATILLO.guacamole,
          PLATILLO.arrachera,
          PLATILLO.cerveza,
          PLATILLO.cerveza,
        ]);
        await alMapa(lupita);
      });

      await test.step('Toño prepara la comanda de la cocina Y la de la barra', async () => {
        await prepararLaMesa(tono, 1, 2);
      });

      await test.step('Lupita entrega todo y la mesa queda ocupada', async () => {
        await entregar(lupita, 1);
      });

      // 125 + 329 + 2 × 55 = $564.00; el 10 %, $56.40.
      await test.step('Lupita pide la cuenta con 10 %: la precuenta dice $620.40', async () => {
        await pedirLaCuenta(lupita, 1, '10%', 62_040);
        await alMapa(lupita);
      });

      await test.step('Rosa cobra la mesa 1 en efectivo con $1,000 y da $379.60', async () => {
        const hecho = await cobrar(rosa, 1, { metodo: 'Efectivo', recibidoCentavos: 100_000 });
        expect(hecho).toMatchObject({ ventaCentavos: 56_400, propinaCentavos: 5_640 });
        expect(hecho.cambioCentavos).toBe(100_000 - 62_040);
        libro.cobro({
          referencia: 'mesa 1 · efectivo con cambio',
          ventaId: hecho.ventaId,
          sesionCajaId: sesion,
          ventaCentavos: 56_400,
          pagos: { efectivo: 62_040 },
          propina: { efectivo: 5_640 },
        });
      });

      // ── MESA 2 · TACOS Y LIMONADA, 15 % CON TARJETA ─────────────────────────
      await test.step('mesa 2: tacos y limonada, cocina, entrega y cuenta con 15 %', async () => {
        await abrirLaMesa(lupita, 2, 2);
        await comandar(lupita, 2, [PLATILLO.pastor, PLATILLO.pastor, PLATILLO.limonada]);
        await alMapa(lupita);
        await prepararLaMesa(tono, 2, 2);
        await entregar(lupita, 2);
        // 2 × 119 + 45 = $283.00; el 15 %, $42.45.
        await pedirLaCuenta(lupita, 2, '15%', 32_545);
        await alMapa(lupita);
      });

      await test.step('Rosa cobra la mesa 2 con tarjeta', async () => {
        const hecho = await cobrar(rosa, 2, { metodo: 'Tarjeta' });
        expect(hecho).toMatchObject({ ventaCentavos: 28_300, propinaCentavos: 4_245 });
        libro.cobro({
          referencia: 'mesa 2 · tarjeta',
          ventaId: hecho.ventaId,
          sesionCajaId: sesion,
          ventaCentavos: 28_300,
          pagos: { tarjeta: 32_545 },
          propina: { tarjeta: 4_245 },
        });
      });

      // ── MESA 3 · SIN PROPINA, MIXTO ─────────────────────────────────────────
      await test.step('mesa 3: arrachera y dos minerales, sin propina', async () => {
        await abrirLaMesa(lupita, 3, 3);
        await comandar(lupita, 3, [PLATILLO.arrachera, PLATILLO.mineral, PLATILLO.mineral]);
        await alMapa(lupita);
        await prepararLaMesa(tono, 3, 2);
        await entregar(lupita, 3);
        // 329 + 2 × 35 = $399.00.
        await pedirLaCuenta(lupita, 3, 'Sin propina', 39_900);
        await alMapa(lupita);
      });

      await test.step('Rosa cobra la mesa 3 mixto: $200 en efectivo y $199 con tarjeta', async () => {
        const hecho = await cobrar(rosa, 3, {
          metodo: 'Mixto',
          efectivoCentavos: 20_000,
          tarjetaCentavos: 19_900,
        });
        expect(hecho).toMatchObject({ ventaCentavos: 39_900, propinaCentavos: 0 });
        libro.cobro({
          referencia: 'mesa 3 · mixto',
          ventaId: hecho.ventaId,
          sesionCajaId: sesion,
          ventaCentavos: 39_900,
          pagos: { efectivo: 20_000, tarjeta: 19_900 },
        });
      });

      // ── MESA 4 · LA CUENTA CON TARJETA Y LA PROPINA SÓLO EN EFECTIVO ────────
      // Lo más normal en una mesa, y lo que no se podía cobrar: la pantalla nueva lo rechazaba
      // y la caja heredada se comía la propina (renglón de efectivo sin venta). Desde la 184.
      await test.step('mesa 4: cerveza y limonada, sólo barra, cuenta con 10 %', async () => {
        await abrirLaMesa(lupita, 4, 2);
        await comandar(lupita, 4, [PLATILLO.cerveza, PLATILLO.limonada]);
        await alMapa(lupita);
        await prepararLaMesa(tono, 4, 1);
        await entregar(lupita, 4);
        // 55 + 45 = $100.00; el 10 %, $10.00.
        await pedirLaCuenta(lupita, 4, '10%', 11_000);
        await alMapa(lupita);
      });

      await test.step('Rosa cobra la mesa 4: la cuenta con tarjeta y los $10 de propina en billete', async () => {
        const hecho = await cobrar(rosa, 4, {
          metodo: 'Mixto',
          efectivoCentavos: 0,
          tarjetaCentavos: 10_000,
          propinaEfectivoCentavos: 1_000,
        });
        expect(hecho).toMatchObject({
          ventaCentavos: 10_000,
          propinaCentavos: 1_000,
          cambioCentavos: 0,
        });
        libro.cobro({
          referencia: 'mesa 4 · tarjeta y propina en efectivo',
          ventaId: hecho.ventaId,
          sesionCajaId: sesion,
          ventaCentavos: 10_000,
          pagos: { tarjeta: 10_000, efectivo: 1_000 },
          propina: { efectivo: 1_000 },
        });
      });

      // ── MESA 5 · TRANSFERENCIA CON 15 % ─────────────────────────────────────
      await test.step('mesa 5: tacos y mineral, cocina y barra, cuenta con 15 %', async () => {
        await abrirLaMesa(lupita, 5, 2);
        await comandar(lupita, 5, [PLATILLO.pastor, PLATILLO.mineral]);
        await alMapa(lupita);
        await prepararLaMesa(tono, 5, 2);
        await entregar(lupita, 5);
        // 119 + 35 = $154.00; el 15 %, $23.10.
        await pedirLaCuenta(lupita, 5, '15%', 17_710);
        await alMapa(lupita);
      });

      await test.step('Rosa cobra la mesa 5 por transferencia', async () => {
        const hecho = await cobrar(rosa, 5, { metodo: 'Transferencia' });
        expect(hecho).toMatchObject({ ventaCentavos: 15_400, propinaCentavos: 2_310 });
        libro.cobro({
          referencia: 'mesa 5 · transferencia',
          ventaId: hecho.ventaId,
          sesionCajaId: sesion,
          ventaCentavos: 15_400,
          pagos: { transferencia: 17_710 },
          propina: { transferencia: 2_310 },
        });
      });

      // ── EL CORTE DE TURNO Y EL CIERRE DEL DÍA ───────────────────────────────
      await test.step('Rosa hace su corte de turno con lo que hay: no cierra la caja', async () => {
        const esperado = await esperadoDelCajon(rosa);
        // El billete de las mesas 1 y 3, y la propina en billete de la 4: la tarjeta y la
        // transferencia no entran al cajón.
        expect(esperado).toBe(FONDO_CENTAVOS + 62_040 + 20_000 + 1_000);
        await botonDeLaCaja(rosa, 'Corte de turno').click();
        const corte = rosa.getByRole('dialog').filter({ hasText: 'Corte de turno' });
        await expect(corte.getByText(enPantalla(VENDIDO_DEL_DIA)).first()).toBeVisible();
        // «Efectivo contado» y «Dinero dejado en caja», en ese orden y sin etiqueta ligada.
        await corte.getByPlaceholder('0.00').nth(0).fill(pesos(esperado));
        await corte.getByRole('button', { name: 'Registrar corte de turno' }).click();
        await expect(corte).toBeHidden({ timeout: 30_000 });
        expect(await sesionDeLaCaja(rosa)).toBe(sesion);
      });

      await test.step('Rosa cierra la caja a ciegas: le faltan $10, y baja el PDF del corte', async () => {
        const esperado = await esperadoDelCajon(rosa);
        const contado = esperado - 1_000;
        await botonDeLaCaja(rosa, 'Cierre diario').click();
        const cierre = rosa.getByRole('dialog').filter({ hasText: 'Cierre de caja diario' });
        await expect(cierre.getByText('PROPINAS DEL DÍA (PENDIENTES DE LIQUIDAR)')).toBeVisible();
        await cierre.getByPlaceholder('0.00').nth(0).fill(pesos(contado));
        await cierre.getByPlaceholder('0.00').nth(1).fill('0');
        // El diálogo promete el PDF del corte: tiene que bajar, también a la cajera (sin costos).
        const pdf = rosa.waitForEvent('download', { timeout: 60_000 });
        await cierre.getByRole('button', { name: 'Cerrar caja del día' }).click();
        await expect(cierre).toBeHidden({ timeout: 60_000 });
        expect((await pdf).suggestedFilename()).toMatch(/^Corte_.+\.pdf$/);
        expect(await sesionDeLaCaja(rosa), 'La caja sigue abierta después del cierre.').toBeNull();
        libro.contar(sesion, contado);
      });

      // ── LA DUEÑA LEE SU DÍA ─────────────────────────────────────────────────
      await test.step('la dueña lee el día en su teléfono: ventas y propinas', async () => {
        const enSuTelefono = await equipo.paginaEnSuTelefono(info, 'dueno');
        fallos.push(vigilarFallos(enSuTelefono));
        await enSuTelefono.goto('/');
        await expect(enSuTelefono.getByText('Buen día')).toBeVisible({ timeout: 30_000 });
        await expect(enSuTelefono.getByText(enPantalla(VENDIDO_DEL_DIA)).first()).toBeVisible({
          timeout: 30_000,
        });
        await expect(
          enSuTelefono.getByText(enPantalla(5_640 + 4_245 + 1_000 + 2_310)).first(),
        ).toBeVisible();
      });

      await test.step('el dinero del día cuadra al centavo, y un centavo de más NO', async () => {
        const conciliacion = await exigirQueCuadre(duena, libro);
        expect(conciliacion.resumen.cobradoCentavos).toBeGreaterThan(0n);
        const servidor = await leerElServidor(duena, {}, libro.movimientosPrevios);
        const delLibro = libro.libro();
        const [primero, ...resto] = delLibro.cobros;
        const torcido = {
          ...delLibro,
          cobros: [
            {
              ...primero!,
              pagos: { ...primero!.pagos, efectivo: (primero!.pagos['efectivo'] ?? 0n) + 1n },
            },
            ...resto,
          ],
        };
        expect(conciliarElDia(torcido, servidor).hallazgos.length).toBeGreaterThan(0);
      });

      await test.step('el almacén bajó lo que dicen las recetas de lo cobrado', async () => {
        const inventario = new Map(libro.libro().inventario.map((e) => [e.producto, e]));
        const bajo = (insumo: string) => {
          const e = inventario.get(insumo);
          return (e?.antes ?? 0) - (e?.despues ?? 0);
        };
        expect(bajo(RECETA.arrachera.insumo)).toBeCloseTo(2 * RECETA.arrachera.gramos, 3);
        expect(bajo(RECETA.guacamole.insumo)).toBeCloseTo(RECETA.guacamole.gramos, 3);
        // Dos órdenes en la mesa 2 y una en la 5.
        expect(bajo(RECETA.pastor.insumo)).toBeCloseTo(3 * RECETA.pastor.gramos, 3);
      });

      await test.step('persistencia: Rosa recarga y la dueña vuelve a entrar por el acceso central', async () => {
        await rosa.reload();
        await expect(rosa.getByText('No hay caja abierta').first()).toBeVisible({
          timeout: 30_000,
        });
        // Un navegador nuevo, sin sesión ni terminal: el enlace central, el modelo, su nombre y
        // su PIN, como entra Miguel (D-42). Su tablero trae el día que se acaba de cerrar.
        const otroNavegador = await browser.newContext(opcionesDelProyecto(info));
        const laDuena = personaDe(SLUG, 'dueno');
        try {
          const deNuevo = await otroNavegador.newPage();
          fallos.push(vigilarFallos(deNuevo));
          await deNuevo.goto('/login-pos');
          // Con varios contextos servidos se elige el modelo; con uno solo (CI) no hay que elegir.
          // La lista llega después de pintar la pantalla, y hasta que llega no se sabe cuál de los
          // dos casos es: cada demostración tiene su «Demo», y tocarla antes de elegir era entrar
          // a la primera de la lista, la tienda (lo hizo una vez en teléfono).
          const modelos = deNuevo.locator('#vista-de-acceso');
          const suTarjeta = deNuevo
            .getByRole('button')
            .filter({ has: deNuevo.getByText(laDuena.nombre, { exact: true }) });
          await expect(modelos.or(suTarjeta).first()).toBeVisible({ timeout: 30_000 });
          const variosModelos = (await modelos.count()) > 0;
          if (variosModelos) {
            await modelos.selectOption({ label: 'Restaurante MH' });
          }
          await suTarjeta.first().click();
          if (variosModelos) {
            await expect(deNuevo.getByText(/^Iniciando como:/)).toContainText('Restaurante MH');
          }
          for (const digito of laDuena.pin) {
            await deNuevo.getByRole('button', { name: digito, exact: true }).click();
          }
          await deNuevo.waitForURL((url) => url.pathname === '/');
          await expect(deNuevo.getByText('Buen día')).toBeVisible({ timeout: 30_000 });
          await expect(deNuevo.getByText(enPantalla(VENDIDO_DEL_DIA)).first()).toBeVisible({
            timeout: 30_000,
          });
        } finally {
          await otroNavegador.close();
        }
      });

      for (const exigirSinFallos of fallos) exigirSinFallos();
    } finally {
      for (const page of conCaja) {
        info.annotations.push({ type: 'caja', description: await soltarLaCaja(page) });
      }
      await equipo.cerrar();
    }
  });
});
