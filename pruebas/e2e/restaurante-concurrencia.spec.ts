import { expect, type Browser, type Page, test, type TestInfo } from '@playwright/test';

import {
  existenciaDe,
  exigirQueCuadre,
  Libro,
  movimientosDeInventarioPrevios,
  sesionDeLaCaja,
} from './ayudantes/conciliacion.ts';
import {
  abrirElCobro,
  abrirLaCaja,
  abrirLaMesa,
  alMapa,
  armarElPedido,
  botonDeLaMesa,
  CARTA,
  cerrarElTicket,
  cocinaDejaLista,
  comandar,
  comandasDeLaCuenta,
  contarPeticiones,
  cuentaEnElServidor,
  dialogoDeLaMesa,
  entregar,
  esperadoDelCajon,
  exigirEstadoDeLaMesa,
  foliosCobrados,
  importeDe,
  laMesa,
  leerElCobro,
  lineasDeLaCuenta,
  movimientosDeCajaDeLaCuenta,
  pagosDeLaCuenta,
  pedirLaCuenta,
  soltarJuntas,
  unidadesEsperadas,
  unidadesPorPlatillo,
  yaAbierto,
  type PlatilloPedido,
} from './ayudantes/mesas-heredadas.ts';
import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  cerrarCajaYCuadrar,
  consultarPuente,
  exigirDemostracion,
  soltarLaCaja,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * EL RESTAURANTE CUANDO LAS COSAS SE REPITEN, SE DUPLICAN O SE PIERDEN EN LA RED.
 *
 * Una mesera con prisa toca dos veces «Enviar a Cocina»; la cajera, con la red del mostrador
 * lenta, toca dos veces «Cobrar»; se va el internet justo cuando el servidor ya cobró y la
 * respuesta no vuelve; la dueña le echa la mano a la mesera desde otra tableta y las dos
 * mandan platos a la MISMA cuenta en el mismo instante. En ninguno de esos casos puede haber una
 * comanda de más, un platillo cobrado dos veces ni un peso que no esté en el cajón.
 *
 * ── Qué se afirma, y dónde ────────────────────────────────────────────────────
 * Lo que la pantalla dice no vale: después de cada paso de dinero o de estado se lee al
 * SERVIDOR por el puente con la sesión de la dueña, que ve costos y caja —las comandas con sus
 * líneas, la cuenta y su total, lo que entró por cada método, los movimientos del cajón que
 * cita la cuenta, el esperado del cajón, el folio, el stock de lo que se vendió—. «Un solo
 * cobro» quiere decir un solo folio, un solo juego de pagos, UN movimiento de venta y UNO de
 * propina, y el cajón con exactamente lo que entró una vez.
 *
 * ── Cómo se provoca cada cosa ─────────────────────────────────────────────────
 *   · DOBLE CLIC: el gesto real del navegador (`dblclick`) y, además, dos toques que caen en
 *     el mismo instante —los dos `click` en la misma tarea, antes de que React repinte el botón
 *     como «ocupado»—, que es lo que pasa con un dedo nervioso en una tableta lenta y la única
 *     forma de saber qué hace el SERVIDOR cuando le llegan dos peticiones iguales.
 *   · RED LENTA: `page.route` deja que la petición llegue y que el servidor cobre, y retiene la
 *     RESPUESTA un segundo y medio.
 *   · RESPUESTA PERDIDA: `route.fetch()` deja pasar la petición hasta el servidor y después
 *     `route.abort('connectionreset')`: el servidor cobró y el navegador nunca se entera.
 *   · DOS TABLETAS: `soltarJuntas` retiene la petición de cada una hasta que las dos estén en
 *     camino y las suelta a la vez: lo que se prueba es la carrera, no el turno.
 *
 * Cada prueba usa SUS mesas, y el día sigue entre una y otra (una sola caja abierta, un solo
 * reseteo): la última cierra la caja y exige que todo el dinero del día cuadre al centavo.
 */

const SLUG = 'demo-acople-restaurante';
const FONDO_CENTAVOS = 150_000;

/** Lo que gasta del almacén UNA arrachera cobrada, en gramos (la receta de la siembra). */
const ARRACHERA_GRAMOS = 280;

// ═══════════════════════════════════════════════════════════════════════════
// EL DÍA, que sigue de una prueba a la siguiente
// ═══════════════════════════════════════════════════════════════════════════

const libro = new Libro();
let reseteado = false;
let sesionDeRosa = '';

interface Dia {
  readonly equipo: Equipo;
  readonly duena: Page;
  readonly rosa: Page;
  readonly lupita: Page;
  readonly tono: Page;
  /** Falla si CUALQUIERA de las cuatro pantallas recibió un 4xx, un 5xx o un `{ok:false}`. */
  readonly exigirSinFallos: () => void;
}

/** El techo de cada acción: sin él un clic sobre algo que no aparece espera la prueba entera. */
function conTecho(page: Page): Page {
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(30_000);
  return page;
}

/**
 * Cada quien en su puesto, con la caja de Rosa abierta. El reseteo y la apertura de la caja
 * pasan UNA vez por corrida: después de un reseteo el servidor revoca la sesión de todos menos
 * la de quien lo pide, y volver a entrar cuatro veces por prueba gasta el límite de entradas
 * (20 por origen cada cinco minutos) con un 429 que parece fragilidad y es aritmética.
 */
async function empezarElDia(browser: Browser, info: TestInfo): Promise<Dia> {
  const equipo = new Equipo(browser, SLUG);
  const duena = conTecho(await equipo.pagina(info, 'dueno'));

  if (!reseteado) {
    const respuesta = await duena.request.post('/api/catalogo/demostracion/resetear', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: { confirmacion: 'RESETEAR' },
    });
    expect(respuesta.status(), `resetear_demo: ${await respuesta.text()}`).toBe(200);
    libro.empezarInventario(await movimientosDeInventarioPrevios(duena));
    libro.existenciaAntes('Arrachera', await existenciaDe(duena, 'Arrachera'));
    reseteado = true;
  }

  const rosa = conTecho(await equipo.pagina(info, 'cajero'));
  const lupita = conTecho(await equipo.pagina(info, 'mesero'));
  const tono = conTecho(await equipo.pagina(info, 'cocina'));
  const exigirSinFallos = [duena, rosa, lupita, tono].map((p) => vigilarFallos(p));

  await rosa.goto('/');
  await rosa.waitForURL(/\/caja$/);
  await lupita.goto('/');
  await lupita.waitForURL(/\/mesero$/);
  await tono.goto('/');
  await tono.waitForURL(/\/cocina$/);

  if ((await sesionDeLaCaja(rosa)) === null) {
    await abrirLaCaja(rosa, FONDO_CENTAVOS);
  }
  const sesion = (await sesionDeLaCaja(rosa)) ?? '';
  expect(sesion, 'La caja de la terminal de Rosa no quedó abierta.').not.toBe('');
  if (sesionDeRosa !== sesion) {
    libro.abrirCaja('caja de Rosa', sesion, FONDO_CENTAVOS);
    sesionDeRosa = sesion;
  }

  return {
    equipo,
    duena,
    rosa,
    lupita,
    tono,
    exigirSinFallos: () => {
      for (const exigir of exigirSinFallos) exigir();
    },
  };
}

/**
 * Lo que la cocina enseña: UNA tarjeta por cada comanda nueva que el servidor tiene. Si la
 * pantalla pintara una comanda dos veces —o el servidor guardara dos—, estos dos números
 * dejarían de coincidir.
 */
async function comandasNuevasEnElServidor(lector: Page): Promise<number> {
  const filas = await consultarPuente<{ estado?: string }>(lector, 'PedidoPreparacion', {
    limite: 500,
  });
  return filas.filter((f) => f.estado === 'nuevo').length;
}

async function exigirLaCocinaSinDuplicados(dia: Dia): Promise<void> {
  await expect
    .poll(
      async () => {
        const enPantalla = await dia.tono
          .getByRole('button', { name: 'Preparar', exact: true })
          .count();
        const enElServidor = await comandasNuevasEnElServidor(dia.duena);
        return enPantalla === enElServidor
          ? 'iguales'
          : `la cocina enseña ${String(enPantalla)} y el servidor tiene ${String(enElServidor)}`;
      },
      {
        message:
          'La cocina no enseña lo que el servidor tiene en «Nuevos»: una comanda de más (o de menos) en pantalla.',
      },
    )
    .toBe('iguales');
}

/** Las unidades por platillo de TODA la cuenta, y que cada platillo salió exactamente lo que se pidió. */
async function exigirLaCuentaTalCualSePidio(
  dia: Dia,
  ordenId: string,
  pedido: readonly PlatilloPedido[],
  comandasEsperadas: number,
): Promise<void> {
  await expect
    .poll(async () => unidadesPorPlatillo(await comandasDeLaCuenta(dia.duena, ordenId)), {
      message:
        'Lo que cocina y barra recibieron no es lo que se pidió, platillo por platillo: ' +
        'un platillo de más sale dos veces; uno de menos, nunca.',
    })
    .toEqual(unidadesEsperadas(pedido));
  const comandas = await comandasDeLaCuenta(dia.duena, ordenId);
  expect(
    comandas.length,
    `Se esperaban ${String(comandasEsperadas)} comanda(s) y el servidor guardó ${String(comandas.length)}.`,
  ).toBe(comandasEsperadas);

  // Lo que se cobra: las líneas de la cuenta, platillo por platillo, y su total.
  const lineas = await lineasDeLaCuenta(dia.duena, ordenId);
  const porPlatillo = new Map<string, number>();
  for (const { nombre, cantidad } of lineas) {
    porPlatillo.set(nombre, (porPlatillo.get(nombre) ?? 0) + cantidad);
  }
  expect(
    [...porPlatillo.entries()].sort(([a], [b]) => a.localeCompare(b)),
    'Las líneas de la cuenta no son los platillos que se pidieron: se cobraría de más o de menos.',
  ).toEqual(unidadesEsperadas(pedido));
  expect(
    lineas.reduce((suma, linea) => suma + linea.centavos, 0),
    'Las líneas de la cuenta no suman lo que cuestan los platillos.',
  ).toBe(importeDe(pedido));
  const cuenta = await cuentaEnElServidor(dia.duena, ordenId);
  expect(cuenta.totalCentavos, 'El total de la cuenta no es la suma exacta de sus platillos.').toBe(
    importeDe(pedido),
  );
}

/**
 * LO QUE UN COBRO ÚNICO DEJA EN EL SERVIDOR, y nada más. Cada línea se lee de otro lado: la
 * cuenta, lo que entró por método, los movimientos del cajón que la citan y el esperado del
 * cajón. Cualquiera de ellos que valga el doble delata un cobro duplicado.
 */
async function exigirUnSoloCobroEnEfectivo(
  dia: Dia,
  ordenId: string,
  esperado: {
    readonly ventaCentavos: number;
    readonly propinaCentavos: number;
    readonly recibidoCentavos: number;
    readonly cajonAntes: number;
    readonly foliosAntes: readonly string[];
  },
): Promise<string> {
  const entro = esperado.ventaCentavos + esperado.propinaCentavos;
  const cuenta = await cuentaEnElServidor(dia.duena, ordenId);
  expect(cuenta.estado, 'La cuenta no quedó pagada en el servidor.').toBe('pagada');
  expect(cuenta.folio, 'La cuenta está pagada y no tiene folio.').not.toBe('');
  expect(cuenta.totalCentavos, 'La venta cobrada no es la que dijo la pantalla.').toBe(
    esperado.ventaCentavos,
  );
  expect(cuenta.sesionCajaId, 'La cuenta se cobró en otra caja.').toBe(sesionDeRosa);

  expect(
    await pagosDeLaCuenta(dia.duena, ordenId),
    'El dinero que entró por la cuenta no es UN cobro: hay pagos de más (o de menos).',
  ).toEqual({
    efectivo: entro,
    tarjeta: 0,
    transferencia: 0,
    propinaEfectivo: esperado.propinaCentavos,
    propinaTarjeta: 0,
    propinaTransferencia: 0,
    cobradoConPropina: entro,
    cambio: esperado.recibidoCentavos - entro,
  });

  const movimientos = [...(await movimientosDeCajaDeLaCuenta(dia.duena, ordenId))].sort((a, b) =>
    a.tipo.localeCompare(b.tipo),
  );
  expect(
    movimientos,
    'El cajón no tiene UN movimiento de venta y UNO de propina por esta cuenta.',
  ).toEqual(
    esperado.propinaCentavos > 0
      ? [
          { tipo: 'propina', centavos: esperado.propinaCentavos },
          { tipo: 'venta', centavos: esperado.ventaCentavos },
        ]
      : [{ tipo: 'venta', centavos: esperado.ventaCentavos }],
  );

  expect(
    await esperadoDelCajon(dia.rosa),
    'El cajón no tiene lo que entró UNA vez: un cobro duplicado deja dinero que no existe.',
  ).toBe(esperado.cajonAntes + entro);

  const folios = await foliosCobrados(dia.duena);
  expect(folios, 'Debe haber un folio nuevo, uno solo, y ninguno repetido.').toEqual(
    [...esperado.foliosAntes, cuenta.folio].sort(),
  );
  return cuenta.folio;
}

/** Lo de la mesa hasta que la cuenta está pedida: abrir, comandar, sacar, entregar, pedir. */
async function hastaLaCuenta(
  dia: Dia,
  mesa: number,
  personas: number,
  pedido: readonly PlatilloPedido[],
  comandas: number,
  propina: '10%' | '15%' | 'Sin propina',
  totalConPropina: number,
): Promise<string> {
  const { ordenId } = await abrirLaMesa(dia.lupita, dia.duena, mesa, personas);
  await comandar(dia.lupita, mesa, pedido);
  await alMapa(dia.lupita);
  await cocinaDejaLista(dia.tono, dia.duena, ordenId, comandas);
  await entregar(dia.lupita, mesa);
  await pedirLaCuenta(dia.lupita, mesa, propina, totalConPropina);
  await alMapa(dia.lupita);
  await expect
    .poll(async () => (await cuentaEnElServidor(dia.duena, ordenId)).estado, {
      message: `La cuenta de la mesa ${String(mesa)} no quedó pedida en el servidor.`,
    })
    .toBe('cuenta_solicitada');
  return ordenId;
}

/**
 * La dueña, en su tableta, toca la mesa que la mesera ya abrió y espera a que su diálogo termine
 * de abrir. La mapa se repinta cada cinco segundos: se espera a que la vea ocupada.
 */
async function laMesaDeLaDuena(duena: Page, numero: number): Promise<void> {
  await laMesa(duena, numero).click();
  await yaAbierto(dialogoDeLaMesa(duena, numero));
}

/**
 * Varias tabletas arman su pedido y tocan «Enviar a Cocina» EN EL MISMO INSTANTE: cada petición
 * espera —ya armada— a que todas las demás estén en camino (`soltarJuntas`), y entonces salen
 * juntas. Devuelve cuando todas las tabletas tuvieron su respuesta, y exige que todas sean 200.
 */
async function mandarJuntas(
  mesa: number,
  tabletas: readonly { readonly page: Page; readonly pedido: readonly PlatilloPedido[] }[],
): Promise<void> {
  for (const { page, pedido } of tabletas) await armarElPedido(page, mesa, pedido);
  const botones = await Promise.all(
    tabletas.map(({ page }) => botonDeLaMesa(page, mesa, 'Enviar a Cocina')),
  );
  const barrera = await soltarJuntas(
    tabletas.map(({ page }) => page),
    '/api/restaurante/enviar-pedido',
  );
  try {
    const respuestas = tabletas.map(({ page }) =>
      page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === '/api/restaurante/enviar-pedido' &&
          r.request().method() === 'POST',
      ),
    );
    await Promise.all(botones.map((boton) => boton.click()));
    for (const respuesta of await Promise.all(respuestas)) {
      expect(
        respuesta.status(),
        `El servidor rechazó el envío de una tableta: ${(await respuesta.text()).slice(0, 300)}`,
      ).toBe(200);
    }
  } finally {
    await barrera.quitar();
  }
}

test.describe('el restaurante cuando todo se repite, se duplica o se pierde', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  // ── 1 · DOBLE CLIC EN «ENVIAR A COCINA» ────────────────────────────────────
  test('doble clic en «Enviar a Cocina»: una sola comanda, y cocina recibe cada platillo una vez', async ({
    browser,
  }, info) => {
    test.setTimeout(5 * 60_000);
    const dia = await empezarElDia(browser, info);
    try {
      // Sólo platillos de COCINA: la barra sería una segunda comanda legítima y «una sola
      // comanda» dejaría de poder afirmarse.
      const pedido: readonly PlatilloPedido[] = [
        { nombre: CARTA.arrachera.nombre, veces: 2 },
        { nombre: CARTA.guacamole.nombre, veces: 1 },
      ];

      await test.step('mesa 1 · el doble clic de verdad (`dblclick`)', async () => {
        const { ordenId } = await abrirLaMesa(dia.lupita, dia.duena, 1, 2);
        await armarElPedido(dia.lupita, 1, pedido);
        const envios = contarPeticiones(dia.lupita, '/api/restaurante/enviar-pedido');
        const boton = await botonDeLaMesa(dia.lupita, 1, 'Enviar a Cocina');
        await boton.dblclick();
        await expect(dia.lupita.getByText('¡Pedido enviado a cocina!').first()).toBeVisible({
          timeout: 30_000,
        });
        // Toda petición que salió ya fue contestada: lo que haya que guardar, ya se guardó.
        await expect.poll(() => envios.respondidas()).toBe(envios.enviadas());
        info.annotations.push({
          type: 'doble clic',
          description: `mesa 1: el navegador mandó ${String(envios.enviadas())} petición(es) a enviar-pedido`,
        });
        envios.dejarDeContar();

        await exigirLaCuentaTalCualSePidio(dia, ordenId, pedido, 1);
        await exigirLaCocinaSinDuplicados(dia);
        await alMapa(dia.lupita);
        await cocinaDejaLista(dia.tono, dia.duena, ordenId, 1);
      });

      await test.step('mesa 2 · dos toques en el mismo instante: llegan DOS peticiones y el servidor guarda UNA', async () => {
        const otro: readonly PlatilloPedido[] = [
          { nombre: CARTA.sopa.nombre, veces: 1 },
          { nombre: CARTA.guacamole.nombre, veces: 1 },
        ];
        const { ordenId } = await abrirLaMesa(dia.lupita, dia.duena, 2, 2);
        await armarElPedido(dia.lupita, 2, otro);
        const envios = contarPeticiones(dia.lupita, '/api/restaurante/enviar-pedido');
        const boton = await botonDeLaMesa(dia.lupita, 2, 'Enviar a Cocina');
        // Los dos `click` en la misma tarea: React no ha repintado el botón como «ocupado»
        // cuando cae el segundo, así que los dos manejadores corren con el carrito lleno.
        await boton.evaluate((el) => {
          (el as HTMLElement).click();
          (el as HTMLElement).click();
        });
        await expect(dia.lupita.getByText('¡Pedido enviado a cocina!').first()).toBeVisible({
          timeout: 30_000,
        });
        await expect.poll(() => envios.respondidas()).toBe(envios.enviadas());
        info.annotations.push({
          type: 'doble toque',
          description: `mesa 2: el navegador mandó ${String(envios.enviadas())} petición(es) a enviar-pedido`,
        });
        // Dos toques del MISMO envío son el mismo hecho: la misma clave de idempotencia.
        expect(
          new Set(envios.claves()).size,
          'Los toques de un mismo envío salieron con claves de idempotencia DISTINTAS: el servidor no puede saber que es lo mismo.',
        ).toBe(1);
        envios.dejarDeContar();

        await exigirLaCuentaTalCualSePidio(dia, ordenId, otro, 1);
        await exigirLaCocinaSinDuplicados(dia);
        await alMapa(dia.lupita);
        await cocinaDejaLista(dia.tono, dia.duena, ordenId, 1);
      });

      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // ── 2 · DOBLE CLIC EN «COBRAR», CON LA RED LENTA ───────────────────────────
  test('doble clic en «Cobrar» con la red lenta: un solo cobro', async ({ browser }, info) => {
    test.setTimeout(6 * 60_000);
    const dia = await empezarElDia(browser, info);
    try {
      /**
       * Una mesa, de la cuenta pedida al cobro, con la red del mostrador lenta y un toque
       * doble sobre «Cobrar». `gesto` es QUÉ doble toque: el de verdad o los dos en el mismo
       * instante.
       */
      const cobrarConLaRedLenta = async (
        mesa: number,
        gesto: 'dblclick' | 'dos toques a la vez',
      ): Promise<void> => {
        // 329 + 55 = $384.00; el 10 %, $38.40.
        const pedido: readonly PlatilloPedido[] = [
          { nombre: CARTA.arrachera.nombre, veces: 1 },
          { nombre: CARTA.cerveza.nombre, veces: 1 },
        ];
        const venta = importeDe(pedido);
        const propina = Math.round(venta * 0.1);
        const ordenId = await hastaLaCuenta(dia, mesa, 2, pedido, 2, '10%', venta + propina);

        const cajonAntes = await esperadoDelCajon(dia.rosa);
        const foliosAntes = await foliosCobrados(dia.duena);
        const arracheraAntes = await existenciaDe(dia.duena, 'Arrachera');

        const dialogo = await abrirElCobro(dia.rosa, mesa);
        await dialogo.getByRole('button', { name: 'Efectivo', exact: true }).click();
        await dialogo.getByPlaceholder('0.00').fill('500.00');

        const cobros = contarPeticiones(dia.rosa, '/api/venta/cobrar');
        const delServidor: { readonly estado: number; readonly folio: string }[] = [];
        // La red del mostrador va lenta: el servidor SÍ cobra, pero su respuesta tarda un segundo
        // y medio en llegar, y la cajera —que ve que no pasa nada— toca otra vez.
        await dia.rosa.route('**/api/venta/cobrar', async (ruta) => {
          const real = await ruta.fetch();
          const cuerpo = (await real.json()) as { datos?: { folio?: string } };
          delServidor.push({ estado: real.status(), folio: cuerpo.datos?.folio ?? '(sin folio)' });
          await new Promise<void>((listo) => setTimeout(listo, 1_500));
          await ruta.fulfill({ response: real });
        });
        try {
          const cobrar = dialogo.getByRole('button', { name: /^Cobrar \$/ });
          if (gesto === 'dblclick') {
            await cobrar.dblclick();
          } else {
            // Los dos `click` en la misma tarea: React no ha repintado el botón como «ocupado»
            // cuando cae el segundo, así que los dos manejadores corren con el cobro armado.
            await cobrar.evaluate((el) => {
              (el as HTMLElement).click();
              (el as HTMLElement).click();
            });
          }
          await cerrarElTicket(dia.rosa);
          await expect.poll(() => cobros.respondidas()).toBe(cobros.enviadas());
        } finally {
          await dia.rosa.unroute('**/api/venta/cobrar');
          cobros.dejarDeContar();
        }
        info.annotations.push({
          type: `cobrar · ${gesto}`,
          description:
            `mesa ${String(mesa)}: el navegador mandó ${String(cobros.enviadas())} petición(es) a cobrar; ` +
            `el servidor contestó ${delServidor.map((r) => `${String(r.estado)} folio ${r.folio}`).join(' y ')}`,
        });
        // Dos toques del mismo cobro son el mismo hecho: la misma clave, y la misma respuesta.
        expect(
          new Set(cobros.claves()).size,
          'Los toques salieron con claves de idempotencia distintas.',
        ).toBe(1);
        expect(
          new Set(delServidor.map((r) => `${String(r.estado)} ${r.folio}`)).size,
          `El servidor contestó cosas distintas a la misma orden de cobro: ${JSON.stringify(delServidor)}`,
        ).toBe(1);

        const folio = await exigirUnSoloCobroEnEfectivo(dia, ordenId, {
          ventaCentavos: venta,
          propinaCentavos: propina,
          recibidoCentavos: 50_000,
          cajonAntes,
          foliosAntes,
        });
        // El almacén bajó UNA vez lo que gasta una arrachera.
        expect(
          arracheraAntes - (await existenciaDe(dia.duena, 'Arrachera')),
          'El cobro descontó del almacén más (o menos) de lo que gasta UNA arrachera.',
        ).toBeCloseTo(ARRACHERA_GRAMOS, 3);
        await exigirEstadoDeLaMesa(
          dia.duena,
          mesa,
          'libre',
          'La mesa cobrada no volvió al servicio.',
        );
        libro.cobro({
          referencia: `mesa ${String(mesa)} · ${gesto} en cobrar (folio ${folio})`,
          ventaId: ordenId,
          sesionCajaId: sesionDeRosa,
          ventaCentavos: venta,
          pagos: { efectivo: venta + propina },
          propina: { efectivo: propina },
        });
      };

      await test.step('mesa 3 · la cajera toca «Cobrar» dos veces (`dblclick`) con la red lenta', async () => {
        await cobrarConLaRedLenta(3, 'dblclick');
      });
      await test.step('mesa 4 · dos toques en el mismo instante: llegan DOS peticiones y el servidor cobra UNA vez', async () => {
        await cobrarConLaRedLenta(4, 'dos toques a la vez');
      });
      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // ── 3 · RESPUESTA PERDIDA EN EL COBRO ──────────────────────────────────────
  test('respuesta perdida: el servidor cobró y el navegador no se enteró; volver a cobrar no cobra dos veces', async ({
    browser,
  }, info) => {
    test.setTimeout(6 * 60_000);
    const dia = await empezarElDia(browser, info);
    try {
      const pedido: readonly PlatilloPedido[] = [
        { nombre: CARTA.arrachera.nombre, veces: 1 },
        { nombre: CARTA.cerveza.nombre, veces: 1 },
      ];
      const venta = importeDe(pedido);
      const propina = Math.round(venta * 0.1);
      const mesa = 5;
      const ordenId = await hastaLaCuenta(dia, mesa, 2, pedido, 2, '10%', venta + propina);

      const cajonAntes = await esperadoDelCajon(dia.rosa);
      const foliosAntes = await foliosCobrados(dia.duena);
      const arracheraAntes = await existenciaDe(dia.duena, 'Arrachera');
      const esperado = {
        ventaCentavos: venta,
        propinaCentavos: propina,
        recibidoCentavos: 50_000,
        cajonAntes,
        foliosAntes,
      };

      const dialogo = await abrirElCobro(dia.rosa, mesa);
      await dialogo.getByRole('button', { name: 'Efectivo', exact: true }).click();
      await dialogo.getByPlaceholder('0.00').fill('500.00');
      const cobrar = dialogo.getByRole('button', { name: /^Cobrar \$/ });

      const cobros = contarPeticiones(dia.rosa, '/api/venta/cobrar');
      let llegaronAlServidor = 0;
      let cuerpoDelCobro = '';
      await test.step('se va el internet justo después de cobrar: el servidor cobra y la respuesta no vuelve', async () => {
        await dia.rosa.route(
          '**/api/venta/cobrar',
          async (ruta) => {
            cuerpoDelCobro = ruta.request().postData() ?? '';
            await ruta.fetch();
            llegaronAlServidor += 1;
            await ruta.abort('connectionreset');
          },
          { times: 1 },
        );
        await cobrar.click();
        // La pantalla se da cuenta de que algo falló: el aviso de error, y el diálogo sigue ahí
        // con «Cobrar» otra vez a la mano. No sabe lo que hizo el servidor.
        const aviso = dia.rosa.locator('[data-sonner-toast][data-type="error"]').first();
        await expect(aviso, 'La pantalla no avisó que el cobro falló.').toBeVisible();
        info.annotations.push({
          type: 'lo que dice la pantalla al perderse la respuesta',
          description: (await aviso.innerText()).replace(/\s+/g, ' '),
        });
        expect(llegaronAlServidor, 'La petición no llegó al servidor.').toBe(1);
        await expect(cobrar, 'El diálogo de cobro no dejó volver a tocar «Cobrar».').toBeEnabled();
      });

      await test.step('el servidor YA cobró, una vez, aunque la pantalla no lo sepa', async () => {
        await expect
          .poll(async () => (await cuentaEnElServidor(dia.duena, ordenId)).estado, {
            message: 'El servidor recibió el cobro y la cuenta no está pagada.',
          })
          .toBe('pagada');
        await exigirUnSoloCobroEnEfectivo(dia, ordenId, esperado);
        // `venta.cobrar` ya pasó la mesa a limpieza; sólo falta lo que hace la pantalla DESPUÉS
        // de cobrar —liberarla y enseñar el ticket—, que no ocurrió.
        await exigirEstadoDeLaMesa(
          dia.duena,
          mesa,
          'limpieza',
          'La mesa cobrada no pasó a limpieza.',
        );
      });

      let folio = '';
      await test.step('la cajera vuelve a tocar «Cobrar»: la misma clave, el mismo folio, ningún cobro nuevo', async () => {
        const reintento = dia.rosa.waitForResponse(
          (r) => new URL(r.url()).pathname === '/api/venta/cobrar',
        );
        await cobrar.click();
        const respuesta = await leerElCobro(await reintento);
        expect(respuesta.ok, `El reintento no se aceptó: ${respuesta.mensaje ?? ''}`).toBe(true);
        await cerrarElTicket(dia.rosa);
        expect(cobros.enviadas(), 'Tenían que ser dos peticiones: la perdida y el reintento.').toBe(
          2,
        );
        expect(
          new Set(cobros.claves()).size,
          'El reintento salió con OTRA clave de idempotencia: para el servidor sería otro cobro.',
        ).toBe(1);
        cobros.dejarDeContar();

        folio = await exigirUnSoloCobroEnEfectivo(dia, ordenId, esperado);
        expect(
          respuesta.datos?.folio,
          'El reintento devolvió un folio que no es el de la cuenta.',
        ).toBe(folio);
        expect(
          arracheraAntes - (await existenciaDe(dia.duena, 'Arrachera')),
          'El almacén bajó más (o menos) de lo que gasta UNA arrachera.',
        ).toBeCloseTo(ARRACHERA_GRAMOS, 3);
        // Ahora sí la pantalla hizo lo suyo: la mesa vuelve al servicio.
        await exigirEstadoDeLaMesa(
          dia.duena,
          mesa,
          'libre',
          'La mesa cobrada no volvió al servicio.',
        );
      });

      await test.step('lo mismo contra el servidor: la misma clave devuelve el mismo cobro; otra clave, «ya se cobró»', async () => {
        const clave = cobros.claves()[0] ?? '';
        const mismaClave = await dia.rosa.request.post('/api/venta/cobrar', {
          headers: { ...cabecerasDeEscrituraDePrueba(), 'idempotency-key': clave },
          data: JSON.parse(cuerpoDelCobro) as Record<string, unknown>,
        });
        const repetido = (await mismaClave.json()) as { ok?: boolean; datos?: { folio?: string } };
        expect(
          mismaClave.status(),
          'Repetir la MISMA clave no devolvió el cobro de la primera vez.',
        ).toBe(200);
        expect(repetido.datos?.folio).toBe(folio);

        const otraClave = await dia.rosa.request.post('/api/venta/cobrar', {
          headers: cabecerasDeEscrituraDePrueba(),
          data: JSON.parse(cuerpoDelCobro) as Record<string, unknown>,
        });
        const rechazo = (await otraClave.json()) as {
          ok?: boolean;
          error?: { codigo?: string; mensaje?: string };
        };
        expect(
          [otraClave.status() >= 400, rechazo.ok === true, rechazo.error?.mensaje],
          'Una orden de cobro NUEVA sobre una cuenta ya pagada tiene que rechazarse diciendo que ya se cobró.',
        ).toEqual([true, false, expect.stringMatching(/ya se cobr/)]);

        // Y nada cambió: sigue siendo UN cobro.
        await exigirUnSoloCobroEnEfectivo(dia, ordenId, esperado);
      });

      libro.cobro({
        referencia: `mesa ${String(mesa)} · respuesta perdida y reintento (folio ${folio})`,
        ventaId: ordenId,
        sesionCajaId: sesionDeRosa,
        ventaCentavos: venta,
        pagos: { efectivo: venta + propina },
        propina: { efectivo: propina },
      });
      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // ── 3 bis · LO QUE LA PANTALLA LE DICE A LA CAJERA CUANDO SE PIERDE LA RESPUESTA ──
  // Fue un DEFECTO hasta el cierre del 21-10: la caja heredada enseñaba el mensaje del navegador
  // —«Failed to fetch»— y nada de lo único que importa en ese momento: que pudo haberse cobrado y
  // que volver a tocar «Cobrar» es seguro. Ahora `pedir` (`apps/web/heredado/api/cliente.ts`)
  // convierte el fallo de red en un `ErrorPuente` que lo dice, con el texto de las pantallas
  // nuevas. El cobro NO se duplica —eso lo afirma la prueba de arriba—.
  test('respuesta perdida: la pantalla dice que el cobro pudo haberse hecho y que volver a tocar «Cobrar» es seguro', async ({
    browser,
  }, info) => {
    test.setTimeout(5 * 60_000);
    const dia = await empezarElDia(browser, info);
    try {
      const pedido: readonly PlatilloPedido[] = [{ nombre: CARTA.cerveza.nombre, veces: 1 }];
      const venta = importeDe(pedido);
      const ordenId = await hastaLaCuenta(dia, 3, 2, pedido, 1, 'Sin propina', venta);
      const esperado = {
        ventaCentavos: venta,
        propinaCentavos: 0,
        recibidoCentavos: 10_000,
        cajonAntes: await esperadoDelCajon(dia.rosa),
        foliosAntes: await foliosCobrados(dia.duena),
      };
      const dialogo = await abrirElCobro(dia.rosa, 3);
      await dialogo.getByRole('button', { name: 'Efectivo', exact: true }).click();
      await dialogo.getByPlaceholder('0.00').fill('100.00');
      await dia.rosa.route(
        '**/api/venta/cobrar',
        async (ruta) => {
          await ruta.fetch();
          await ruta.abort('connectionreset');
        },
        { times: 1 },
      );
      const cobrar = dialogo.getByRole('button', { name: /^Cobrar \$/ });
      await cobrar.click();
      const aviso = dia.rosa.locator('[data-sonner-toast][data-type="error"]').first();
      await expect(aviso).toBeVisible();
      await expect(
        aviso,
        'El aviso es el del navegador («Failed to fetch»): no dice que pudo haberse cobrado.',
      ).toContainText(/puede que s[ií] se haya hecho/);

      // Y lo que el aviso promete es verdad: volver a tocar «Cobrar» no cobra otra vez.
      const reintento = dia.rosa.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/venta/cobrar',
      );
      await cobrar.click();
      const respuesta = await leerElCobro(await reintento);
      expect(respuesta.ok, `El reintento no se aceptó: ${respuesta.mensaje ?? ''}`).toBe(true);
      await cerrarElTicket(dia.rosa);
      const folio = await exigirUnSoloCobroEnEfectivo(dia, ordenId, esperado);
      libro.cobro({
        referencia: `mesa 3 · respuesta perdida, el aviso y el reintento (folio ${folio})`,
        ventaId: ordenId,
        sesionCajaId: sesionDeRosa,
        ventaCentavos: venta,
        pagos: { efectivo: venta },
        propina: {},
      });
      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // ── 4 · DOS TABLETAS A LA MISMA CUENTA, A LA VEZ ───────────────────────────
  test('dos tabletas mandan platos a la MISMA cuenta a la vez: todas las líneas, el total exacto y cada platillo una vez en cocina', async ({
    browser,
  }, info) => {
    test.setTimeout(8 * 60_000);
    const dia = await empezarElDia(browser, info);
    try {
      const mesa = 6;
      // La mesa de cuatro que pide en tandas: Lupita y la dueña —que le echa la mano desde otra
      // tableta— mandan platos a la MISMA cuenta en el mismo instante, dos veces.
      const rondas = [
        {
          lupita: [
            { nombre: CARTA.arrachera.nombre, veces: 2 },
            { nombre: CARTA.cerveza.nombre, veces: 3 },
          ],
          duena: [
            { nombre: CARTA.sopa.nombre, veces: 1 },
            { nombre: CARTA.cerveza.nombre, veces: 2 },
            { nombre: CARTA.guacamole.nombre, veces: 1 },
          ],
        },
        {
          lupita: [
            { nombre: CARTA.pastor.nombre, veces: 1 },
            { nombre: CARTA.limonada.nombre, veces: 1 },
          ],
          duena: [
            { nombre: CARTA.arrachera.nombre, veces: 1 },
            { nombre: CARTA.mineral.nombre, veces: 2 },
          ],
        },
      ] as const;
      const todo: readonly PlatilloPedido[] = rondas.flatMap((r) => [...r.lupita, ...r.duena]);
      const venta = importeDe(todo);
      const propina = Math.round(venta * 0.1);
      // Cada tableta manda UNA comanda por área —cocina y barra—, y son dos tabletas y dos rondas.
      const comandasEsperadas = 8;

      const { ordenId } = await abrirLaMesa(dia.lupita, dia.duena, mesa, 4);
      // La dueña llega a la mesa ya abierta, por su mapa: la ve ocupada y toca su cuenta.
      await dia.duena.goto('/mesero');
      await laMesaDeLaDuena(dia.duena, mesa);

      for (const [i, ronda] of rondas.entries()) {
        await test.step(`ronda ${String(i + 1)} · las dos tabletas tocan «Enviar a Cocina» en el mismo instante`, async () => {
          await mandarJuntas(mesa, [
            { page: dia.lupita, pedido: ronda.lupita },
            { page: dia.duena, pedido: ronda.duena },
          ]);
        });
      }

      await test.step('el servidor tiene TODAS las líneas, la cuenta vale lo que suman y cocina recibe cada platillo una vez', async () => {
        await exigirLaCuentaTalCualSePidio(dia, ordenId, todo, comandasEsperadas);
        // Cada tableta mandó lo suyo: una comanda de cocina y una de barra por envío.
        const comandas = await comandasDeLaCuenta(dia.duena, ordenId);
        expect(
          comandas.filter((c) => c.area === 'cocina').length,
          'Falta (o sobra) una comanda de cocina de las dos tabletas.',
        ).toBe(4);
        expect(
          comandas.filter((c) => c.area === 'barra').length,
          'Falta (o sobra) una comanda de barra de las dos tabletas.',
        ).toBe(4);
        // Y la pantalla de cocina enseña ocho tarjetas nuevas, ni más ni menos.
        await exigirLaCocinaSinDuplicados(dia);
        await expect(dia.tono.getByRole('button', { name: 'Preparar', exact: true })).toHaveCount(
          comandasEsperadas,
        );
      });

      await test.step('Toño saca las ocho comandas, Lupita entrega y la mesa pide su cuenta con 10 %', async () => {
        await alMapa(dia.lupita);
        await alMapa(dia.duena);
        await cocinaDejaLista(dia.tono, dia.duena, ordenId, comandasEsperadas);
        await entregar(dia.lupita, mesa);
        await pedirLaCuenta(dia.lupita, mesa, '10%', venta + propina);
        await alMapa(dia.lupita);
        expect(
          (await cuentaEnElServidor(dia.duena, ordenId)).totalCentavos,
          'La cuenta que pidió la mesera no vale lo que suman los platos de las dos tabletas.',
        ).toBe(venta);
      });

      await test.step('Rosa cobra la cuenta: lo que entra al cajón es la suma exacta, una vez', async () => {
        const cajonAntes = await esperadoDelCajon(dia.rosa);
        const foliosAntes = await foliosCobrados(dia.duena);
        const dialogo = await abrirElCobro(dia.rosa, mesa);
        await dialogo.getByRole('button', { name: 'Efectivo', exact: true }).click();
        await dialogo.getByPlaceholder('0.00').fill('2000.00');
        const respuesta = dia.rosa.waitForResponse(
          (r) => new URL(r.url()).pathname === '/api/venta/cobrar',
        );
        await dialogo.getByRole('button', { name: /^Cobrar \$/ }).click();
        const cobro = await leerElCobro(await respuesta);
        expect(cobro.ok, `El cobro de la mesa ${String(mesa)}: ${cobro.mensaje ?? ''}`).toBe(true);
        await cerrarElTicket(dia.rosa);
        const folio = await exigirUnSoloCobroEnEfectivo(dia, ordenId, {
          ventaCentavos: venta,
          propinaCentavos: propina,
          recibidoCentavos: 200_000,
          cajonAntes,
          foliosAntes,
        });
        await exigirEstadoDeLaMesa(
          dia.duena,
          mesa,
          'libre',
          'La mesa cobrada no volvió al servicio.',
        );
        libro.cobro({
          referencia: `mesa ${String(mesa)} · dos tabletas a la vez (folio ${folio})`,
          ventaId: ordenId,
          sesionCajaId: sesionDeRosa,
          ventaCentavos: venta,
          pagos: { efectivo: venta + propina },
          propina: { efectivo: propina },
        });
      });
      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // ── 5 · AL FINAL DEL DÍA, EL DINERO CUADRA ─────────────────────────────────
  test('al cierre, el dinero del día cuadra al centavo: cada cobro entró UNA sola vez al cajón', async ({
    browser,
  }, info) => {
    test.setTimeout(4 * 60_000);
    const dia = await empezarElDia(browser, info);
    try {
      // Lo que tiene que haber en el cajón: el fondo y el EFECTIVO de cada cobro anotado —cada
      // uno, una sola vez—. La tarjeta y la transferencia no entran al cajón.
      const efectivo = libro
        .libro()
        .cobros.reduce((suma, cobro) => suma + Number(cobro.pagos['efectivo'] ?? 0n), 0);
      const esperado = FONDO_CENTAVOS + efectivo;
      expect(
        await esperadoDelCajon(dia.rosa),
        'El cajón no tiene el fondo más el efectivo de cada cobro, una vez.',
      ).toBe(esperado);
      // DP-10.2 · las mesas 1 y 2 de la primera prueba siguen comiendo, y la de Rosa es la ÚLTIMA
      // caja abierta: no cierra con cuentas vivas. Como al final de un día de verdad, esas cuentas
      // se cancelan con su motivo —cancelar no toca la caja ni el almacén— y entonces cierra.
      await test.step('con mesas sentadas la última caja no cierra; canceladas, sí', async () => {
        const cerrar = await dia.rosa.request.post('/api/caja/cerrar', {
          headers: cabecerasDeEscrituraDePrueba(),
          data: { efectivoContadoCentavos: esperado },
        });
        expect(cerrar.status(), 'La última caja cerró con cuentas vivas.').toBe(422);
        expect(await cerrar.text()).toMatch(/Quedan cuentas sin cobrar en las mesas 1 y 2/);
        const sentadas = (
          await consultarPuente<{ venta_activa_id?: string | null }>(dia.duena, 'Mesa', {
            limite: 50,
          })
        ).flatMap((m) => (m.venta_activa_id ? [m.venta_activa_id] : []));
        for (const ordenId of sentadas) {
          const cancelada = await dia.duena.request.post('/api/restaurante/cancelar-orden', {
            headers: cabecerasDeEscrituraDePrueba(),
            data: { ordenId, motivo: 'fin del día de prueba: la mesa no se cobró' },
          });
          expect(cancelada.status(), await cancelada.text()).toBe(200);
        }
      });
      await cerrarCajaYCuadrar(dia.rosa, esperado);
      libro.contar(sesionDeRosa, esperado);
      // Lo que se vendió, contra el servidor: cada venta, cada método, cada propina, el cajón y el
      // almacén. Un cobro de más —o de menos— es un hallazgo que dice cuál.
      const conciliacion = await exigirQueCuadre(dia.duena, libro);
      expect(conciliacion.resumen.cobradoCentavos).toBeGreaterThan(0n);
      dia.exigirSinFallos();
    } finally {
      info.annotations.push({ type: 'caja', description: await soltarLaCaja(dia.rosa) });
      await dia.equipo.cerrar();
    }
  });
});
