import { expect, type Page, test } from '@playwright/test';

import {
  existenciaDe,
  exigirQueCuadre,
  Libro,
  movimientosDeInventarioPrevios,
  sesionDeLaCaja,
} from './ayudantes/conciliacion.ts';
import {
  abrirElCobro,
  abrirElQrDeLaMesa,
  abrirLaCaja,
  abrirLaMesa,
  alMapa,
  avisosDeLaMesa,
  CARTA,
  cerrarElTicket,
  cocinaDejaLista,
  comandar,
  comandasDeLaCuenta,
  configuracionDelNegocio,
  cuentaEnElServidor,
  entregar,
  esperadoDelCajon,
  exigirEstadoDeLaMesa,
  importeDe,
  laMesa,
  leerElCobro,
  mesaEnElServidor,
  mesaLimpia,
  pagosDeLaCuenta,
  prepararElPortalDelComensal,
  type PlatilloPedido,
  type TelefonoDelComensal,
  unidadesEsperadas,
  unidadesPorPlatillo,
} from './ayudantes/mesas-heredadas.ts';
import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  cerrarCajaYCuadrar,
  exigirDemostracion,
  soltarLaCaja,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * EL PORTAL DEL COMENSAL, DE PUNTA A PUNTA (restaurante, 20-10-2026).
 *
 * La dueña deja listo el portal desde SUS pantallas; la mesera abre la mesa y comanda; un
 * comensal ANÓNIMO —otro aparato, sin sesión, sin PIN, con sólo el código de su mesa— lee el
 * menú, pide ayuda y pide su cuenta; la mesera se entera en su pantalla; se cobra, la mesa
 * vuelve al servicio y SE SIENTA OTRO GRUPO en la misma mesa con el mismo código: no hereda los
 * avisos del primero, ni en la pantalla de la mesera ni en el servidor, y SU aviso sí llega.
 *
 * ── Lo que cada paso afirma, además de lo que se ve ───────────────────────────
 * La pantalla que dice «¡Cuenta solicitada!» no prueba nada: se lee al SERVIDOR por el puente
 * con la sesión de la dueña. La solicitud (`SolicitudQR`) con su tipo, su estado, su cuenta, su
 * mesero destino y la propina que sugirió el comensal; la cuenta (`Venta`) en
 * `cuenta_solicitada` con la propina y quién la decidió; la mesa; y, al cobrar, lo que entró por
 * cada método. Y que el comensal es de verdad anónimo: sin cookie de sesión y con el 401 de la
 * aplicación a cualquier ruta interna.
 *
 * ── Por qué hay dos grupos ────────────────────────────────────────────────────
 * Los avisos son del grupo sentado, no de la mesa. `solicitudes_qr_una_pendiente` permite UNA
 * pendiente por mesa y tipo, y `portal.pedir_cuenta` ACTUALIZA la que ya existe en vez de
 * insertar otra: si nadie cerrara el aviso del grupo que se fue, el siguiente pediría su cuenta
 * y la mesera no oiría nada (el aviso viejo ya lo tenía «visto» su tableta), o leería en su
 * teléfono «Tu mesero ya vio la solicitud» sin haber pedido nada. Lo cierra
 * `cerrarAvisosDeLaMesa`, en la misma transacción que libera la mesa.
 *
 * ── Dónde corre ───────────────────────────────────────────────────────────────
 * Con UN negocio por despliegue —como CI— el comensal abre el QR en el origen de siempre. En el
 * despliegue de las cinco demos (`scripts/base-desechable.mjs`) el QR se abre en
 * `<slug>.localhost` y ese origen tiene que estar en `APP_URL_ALTERNAS`; si no lo está, el paso
 * del comensal falla DICIENDO qué falta (`abrirElQrDeLaMesa`).
 */

const SLUG = 'demo-acople-restaurante';
const FONDO_CENTAVOS = 150_000;
const MESA = 6;
const ZONA = 'Interior';
const MESERO = 'Lupita';
const NEGOCIO = 'Demo del acople · restaurante';

/** Lo que consume el primer grupo: $329 + 2 × $55 = $439.00. */
const PEDIDO_UNO: readonly PlatilloPedido[] = [
  { nombre: CARTA.arrachera.nombre, veces: 1 },
  { nombre: CARTA.cerveza.nombre, veces: 2 },
];
/** Y lo que el primer grupo pide por su cuenta desde el teléfono: otra cerveza. */
const PEDIDO_DEL_COMENSAL: readonly PlatilloPedido[] = [{ nombre: CARTA.cerveza.nombre, veces: 1 }];
/** Todo lo que consume el primer grupo al pedir la cuenta: $329 + 3 × $55 = $494.00. */
const CONSUMO_UNO: readonly PlatilloPedido[] = [...PEDIDO_UNO, ...PEDIDO_DEL_COMENSAL];
/** Lo que consume el segundo: $110.00. Nada de lo del primero. */
const PEDIDO_DOS: readonly PlatilloPedido[] = [{ nombre: CARTA.cerveza.nombre, veces: 2 }];

const pesosEnPantalla = (centavos: number): string => `$${(centavos / 100).toFixed(2)}`;

/** El toast que la tableta de la mesera enseña cuando llega un aviso del portal. */
function avisoEnLaTableta(lupita: Page, texto: string) {
  return lupita.locator('[data-sonner-toast]').filter({ hasText: texto });
}

/** Un aviso que NO estaba en la tableta cuando se marcaron los del grupo anterior. */
function avisoNuevoEnLaTableta(lupita: Page, texto: string) {
  return lupita
    .locator('[data-sonner-toast]:not([data-del-grupo-anterior])')
    .filter({ hasText: texto });
}

/** «SOLICITUDES ACTIVAS (n)»: las tarjetas que la mesera tiene bajo su mapa. */
function solicitudesActivas(lupita: Page, cuantas: number) {
  return lupita.getByText(`SOLICITUDES ACTIVAS (${String(cuantas)})`);
}

test.describe('el portal del comensal', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('un comensal anónimo pide su cuenta desde el QR de la mesa; el grupo siguiente no hereda los avisos del anterior', async ({
    browser,
  }, info) => {
    test.setTimeout(10 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const libro = new Libro();
    const fallos: (() => void)[] = [];
    const telefonos: TelefonoDelComensal[] = [];
    let rosaConCaja: Page | null = null;

    try {
      // ── LA DUEÑA EMPIEZA EL DÍA EN LIMPIO Y DEJA LISTO EL PORTAL ────────────
      const duena = await equipo.pagina(info, 'dueno');
      fallos.push(vigilarFallos(duena));
      await test.step('reseteo de la demo: el portal nace apagado y sin códigos', async () => {
        const respuesta = await duena.request.post('/api/catalogo/demostracion/resetear', {
          headers: cabecerasDeEscrituraDePrueba(),
          data: { confirmacion: 'RESETEAR' },
        });
        expect(respuesta.status(), `resetear_demo: ${await respuesta.text()}`).toBe(200);
        const mesa = await mesaEnElServidor(duena, MESA);
        expect(mesa.qrToken, 'La mesa recién reseteada ya traía un código QR.').toBeNull();
        expect((await configuracionDelNegocio(duena))['portal_qr_activo']).not.toBe(true);
      });
      libro.empezarInventario(await movimientosDeInventarioPrevios(duena));
      for (const insumo of ['Arrachera', CARTA.cerveza.nombre]) {
        libro.existenciaAntes(insumo, await existenciaDe(duena, insumo));
      }

      let token = '';
      await test.step('la dueña asigna la mesa 6 a Lupita, enciende el portal y genera los códigos', async () => {
        token = await prepararElPortalDelComensal(duena, {
          mesa: MESA,
          zona: ZONA,
          mesero: MESERO,
          pedidosDelComensal: true,
        });
        expect(token, 'La mesa 6 no tiene QR después de generarlos.').not.toBe('');
        // Lo que dirección lee por el puente: el código, activo, y la mesera de la mesa.
        expect(await mesaEnElServidor(duena, MESA)).toMatchObject({
          qrToken: token,
          qrActivo: true,
          mesero: MESERO,
          estado: 'libre',
        });
        expect(await configuracionDelNegocio(duena)).toMatchObject({
          asignacion_mesas_activa: true,
          portal_qr_activo: true,
          portal_qr_cuenta_modo: 'cliente_solicita',
        });
      });

      await test.step('un código inventado no abre ninguna mesa', async () => {
        const falso = await browser.newContext({
          ...(info.project.use.baseURL === undefined ? {} : { baseURL: info.project.use.baseURL }),
          locale: 'es-MX',
        });
        try {
          const lectura = await falso.request.get('/api/publico/qr/un-codigo-que-nadie-imprimio');
          expect(
            lectura.status(),
            'Un código inventado no puede abrir una mesa.',
          ).toBeGreaterThanOrEqual(400);
          expect(lectura.status()).toBeLessThan(500);
        } finally {
          await falso.close();
        }
      });

      // ── CADA QUIEN EN SU PUESTO ──────────────────────────────────────────────
      // Se entra DESPUÉS de dejar listo el portal: la tableta de la mesera lee la configuración
      // al cargar, y sólo vigila los avisos si ya sabe que el portal está encendido.
      const rosa = await equipo.pagina(info, 'cajero');
      rosaConCaja = rosa;
      fallos.push(vigilarFallos(rosa));
      const lupita = await equipo.pagina(info, 'mesero');
      fallos.push(vigilarFallos(lupita));
      const tono = await equipo.pagina(info, 'cocina');
      fallos.push(vigilarFallos(tono));
      await rosa.goto('/');
      await rosa.waitForURL(/\/caja$/);
      await lupita.goto('/');
      await lupita.waitForURL(/\/mesero$/);
      await tono.goto('/');
      await tono.waitForURL(/\/cocina$/);

      let sesion = '';
      await test.step('Rosa abre la caja con $1,500', async () => {
        await abrirLaCaja(rosa, FONDO_CENTAVOS);
        sesion = (await sesionDeLaCaja(rosa)) ?? '';
        expect(sesion, 'La caja de la terminal de Rosa no quedó abierta.').not.toBe('');
        libro.abrirCaja('caja de Rosa', sesion, FONDO_CENTAVOS);
      });

      // ── PRIMER GRUPO ─────────────────────────────────────────────────────────
      let ordenUno = '';
      await test.step('Lupita abre la mesa 6 para tres, comanda y la cocina entrega', async () => {
        ordenUno = (await abrirLaMesa(lupita, duena, MESA, 3)).ordenId;
        await comandar(lupita, MESA, PEDIDO_UNO);
        await alMapa(lupita);
        await cocinaDejaLista(tono, duena, ordenUno, 2);
        await entregar(lupita, MESA);
        await alMapa(lupita);
        expect(unidadesPorPlatillo(await comandasDeLaCuenta(duena, ordenUno))).toEqual(
          unidadesEsperadas(PEDIDO_UNO),
        );
        // El portal ya la ve abierta, con su cuenta.
        expect((await mesaEnElServidor(duena, MESA)).ordenId).toBe(ordenUno);
      });

      let telefonoUno: Page | null = null;
      await test.step('el comensal escanea el QR: sin sesión, ve el negocio, su mesa y el menú con precios', async () => {
        const comensal = await abrirElQrDeLaMesa(browser, info, SLUG, token);
        telefonos.push(comensal);
        const telefono = comensal.page;
        telefonoUno = telefono;

        // Anónimo de verdad: ninguna cookie de sesión, y la aplicación interna le dice que no.
        const cookies = await telefono.context().cookies();
        expect(
          cookies.filter((c) => c.name.startsWith('morphiqpos_sesion')),
          'El teléfono del comensal trae una sesión interna.',
        ).toEqual([]);
        // (`fetch` desde la propia página: `*.localhost` sólo lo resuelve el navegador.)
        const interna = await telefono.evaluate(
          async () => (await fetch('/api/catalogo/sesion')).status,
        );
        expect(interna, 'Un comensal sin sesión leyó una ruta interna.').toBe(401);
        // Desde aquí el teléfono se vigila: el 401 de arriba fue a propósito.
        fallos.push(vigilarFallos(telefono));

        await expect(telefono.getByText(NEGOCIO)).toBeVisible();
        await expect(
          telefono.getByText(new RegExp(`^Mesa ${String(MESA)}\\b`)).first(),
        ).toBeVisible();
        // Cada platillo con SU precio, en su tarjeta.
        for (const platillo of [CARTA.arrachera, CARTA.sopa, CARTA.cerveza]) {
          // La tarjeta es un `<div>` si el comensal sólo lee y un `<button>` si también puede pedir.
          const tarjeta = telefono
            .locator('.rounded-2xl')
            .filter({ has: telefono.getByText(platillo.nombre, { exact: true }) })
            .last();
          await expect(tarjeta, `El menú no enseña «${platillo.nombre}».`).toContainText(
            pesosEnPantalla(platillo.centavos),
          );
        }
        // Lo mismo que enseña, lo sirve el servidor: ni un precio que la pantalla invente.
        const cuerpo = (await telefono.evaluate(async (ruta) => {
          const respuesta = await fetch(ruta);
          return {
            estado: respuesta.status,
            ...((await respuesta.json()) as Record<string, unknown>),
          };
        }, `/api/publico/qr/${token}`)) as {
          readonly estado: number;
          readonly datos?: {
            readonly negocio?: { readonly puede_ordenar?: boolean };
            readonly productos?: readonly { nombre?: string; precio_venta?: number }[];
          };
        };
        expect(cuerpo.estado).toBe(200);
        expect(
          cuerpo.datos?.negocio?.puede_ordenar,
          'El portal no deja pedir a quien lo escanea aunque la dueña lo permitió.',
        ).toBe(true);
        const precios = new Map(
          (cuerpo.datos?.productos ?? []).map((p) => [
            p.nombre,
            Math.round((p.precio_venta ?? 0) * 100),
          ]),
        );
        for (const platillo of [CARTA.arrachera, CARTA.sopa, CARTA.cerveza]) {
          expect(
            precios.get(platillo.nombre),
            `El portal sirve otro precio para «${platillo.nombre}».`,
          ).toBe(platillo.centavos);
        }
        // El menú se lee con el pulgar: la página no se desplaza de lado.
        expect(
          await telefono.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
          'El portal se desplaza de lado en el teléfono.',
        ).toBeLessThanOrEqual(0);
        await expect(telefono.getByRole('button', { name: 'Atención' })).toBeEnabled();
      });

      await test.step('el comensal pide otra cerveza desde su teléfono: llega a la barra, a su cuenta y a la cocina', async () => {
        const telefono = telefonoUno!;
        // Con los pedidos del comensal encendidos, cada tarjeta del menú es un botón.
        const tarjeta = telefono
          .locator('button.rounded-2xl')
          .filter({ has: telefono.getByText(CARTA.cerveza.nombre, { exact: true }) });
        await expect(
          tarjeta,
          'Las tarjetas del menú no se pueden tocar: el portal no deja pedir (`puede_ordenar`).',
        ).toHaveCount(1);
        await tarjeta.click();
        await telefono.getByRole('button', { name: /^Agregar/ }).click();
        await telefono.getByRole('button', { name: /Ver mi pedido/ }).click();
        const enviado = telefono.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === `/api/publico/qr/${token}/pedido` &&
            r.request().method() === 'POST',
        );
        await telefono.getByRole('button', { name: 'Enviar a cocina' }).click();
        expect((await enviado).status(), 'El servidor rechazó el pedido del comensal.').toBe(200);
        await expect(telefono.getByText('¡Pedido enviado a cocina!')).toBeVisible();

        // En el servidor: la cerveza es de la cuenta, con su comanda de barra, y vale lo que suma todo.
        await expect
          .poll(async () => unidadesPorPlatillo(await comandasDeLaCuenta(duena, ordenUno)), {
            message: 'El pedido del comensal no llegó a la cuenta de su mesa.',
          })
          .toEqual(unidadesEsperadas(CONSUMO_UNO));
        const comandas = await comandasDeLaCuenta(duena, ordenUno);
        expect(comandas, 'Falta (o sobra) la comanda del comensal.').toHaveLength(3);
        expect(
          comandas.filter((c) => c.origen === 'portal_qr').map((c) => c.area),
          'La comanda del comensal no quedó marcada como del portal, o no fue a la barra.',
        ).toEqual(['barra']);
        expect((await cuentaEnElServidor(duena, ordenUno)).totalCentavos).toBe(
          importeDe(CONSUMO_UNO),
        );

        // La cocina la saca y Lupita la entrega: el comensal la recibe como cualquier otra.
        await cocinaDejaLista(tono, duena, ordenUno, 3);
        await entregar(lupita, MESA);
        await alMapa(lupita);
      });

      await test.step('el comensal pide ayuda: queda guardada para Lupita y su tableta se lo dice', async () => {
        const telefono = telefonoUno!;
        await telefono.getByRole('button', { name: 'Atención' }).click();
        await telefono.getByRole('button', { name: 'Necesito ayuda' }).click();
        await expect(telefono.getByText('Solicitud enviada')).toBeVisible();

        await expect
          .poll(async () => (await avisosDeLaMesa(duena, MESA)).map((a) => a.tipo), {
            message: 'La petición de ayuda no quedó guardada en el servidor.',
          })
          .toEqual(['ayuda']);
        const [ayuda] = await avisosDeLaMesa(duena, MESA);
        expect(ayuda).toMatchObject({
          tipo: 'ayuda',
          estado: 'pendiente',
          ordenId: ordenUno,
          ruteo: 'asignado',
          destino: MESERO,
        });
        // La mesera lo lee en SU tableta, sin que nadie se lo diga.
        await expect(
          avisoEnLaTableta(lupita, `Mesa ${String(MESA)} requiere ayuda`),
          'La tableta de Lupita no avisó que la mesa 6 pidió ayuda.',
        ).toBeVisible({ timeout: 20_000 });
        await expect(solicitudesActivas(lupita, 1)).toBeVisible();
      });

      await test.step('el comensal pide su cuenta con 15 %: la solicitud, la cuenta y la mesa quedan en el servidor', async () => {
        const telefono = telefonoUno!;
        await telefono.getByRole('button', { name: 'Atención' }).click();
        await telefono.getByRole('button', { name: 'Pedir cuenta' }).click();
        // La precuenta que ve: lo que consumió y lo que suma, del servidor.
        const hoja = telefono
          .locator('div.fixed.inset-0')
          .filter({ hasText: `Pedir cuenta — Mesa ${String(MESA)}` });
        await expect(hoja).toBeVisible();
        await expect(hoja).toContainText(CARTA.arrachera.nombre);
        await expect(hoja).toContainText(CARTA.cerveza.nombre);
        await expect(hoja).toContainText(pesosEnPantalla(importeDe(CONSUMO_UNO)));
        // Sin elegir cómo dejar la propina, el botón no deja confirmar.
        await expect(hoja.getByRole('button', { name: 'Elige una opción' })).toBeDisabled();
        await hoja.getByRole('button', { name: /^15%/ }).click();
        await hoja.getByRole('button', { name: 'Confirmar' }).click();
        await expect(telefono.getByText('¡Cuenta solicitada!')).toBeVisible();

        // En el servidor: la cuenta pedida, con la propina que eligió el comensal.
        await expect
          .poll(async () => (await cuentaEnElServidor(duena, ordenUno)).estado, {
            message: 'La cuenta que pidió el comensal no quedó pedida en el servidor.',
          })
          .toBe('cuenta_solicitada');
        expect(await cuentaEnElServidor(duena, ordenUno)).toMatchObject({
          totalCentavos: importeDe(CONSUMO_UNO),
          propinaTipo: 'porcentaje',
          propinaOrigen: 'portal_qr',
          propinaPorcentaje: 15,
        });
        expect((await mesaEnElServidor(duena, MESA)).estado).toBe('cuenta_solicitada');
        const avisos = await avisosDeLaMesa(duena, MESA);
        expect(avisos.map((a) => [a.tipo, a.estado]).sort()).toEqual([
          ['ayuda', 'pendiente'],
          ['cuenta', 'pendiente'],
        ]);
        expect(avisos.find((a) => a.tipo === 'cuenta')).toMatchObject({
          ordenId: ordenUno,
          ruteo: 'asignado',
          destino: MESERO,
          subtotalCentavos: importeDe(CONSUMO_UNO),
          propinaCentavos: Math.round(importeDe(CONSUMO_UNO) * 0.15),
        });
        // Si recarga o vuelve a escanear, su cuenta pedida sigue ahí: lo sabe el servidor.
        await telefono.reload();
        await expect(telefono.getByText('Tu cuenta fue solicitada')).toBeVisible();
        await expect(telefono.getByText('Selección enviada a caja.')).toBeVisible();

        // Y Lupita, en su tableta: el aviso nuevo y las dos tarjetas activas.
        await expect(
          avisoEnLaTableta(lupita, `Mesa ${String(MESA)} solicita cuenta`),
          'La tableta de Lupita no avisó que la mesa 6 pidió su cuenta.',
        ).toBeVisible({ timeout: 20_000 });
        await expect(solicitudesActivas(lupita, 2)).toBeVisible();
      });

      // ── SE COBRA Y LA MESA VUELVE AL SERVICIO ────────────────────────────────
      const ventaUno = importeDe(CONSUMO_UNO);
      const propinaUno = Math.round(ventaUno * 0.15);
      await test.step('Rosa cobra la mesa 6 en efectivo con la propina del comensal', async () => {
        const dialogo = await abrirElCobro(rosa, MESA);
        // Lo que dijo el comensal llega a la caja: la propina ya viene en el total.
        await expect(dialogo).toContainText('Cuenta solicitada desde QR');
        await dialogo.getByRole('button', { name: 'Efectivo', exact: true }).click();
        await dialogo.getByPlaceholder('0.00').fill('600.00');
        const respuesta = rosa.waitForResponse(
          (r) => new URL(r.url()).pathname === '/api/venta/cobrar',
        );
        await dialogo.getByRole('button', { name: /^Cobrar \$/ }).click();
        const cobro = await leerElCobro(await respuesta);
        expect(cobro.ok, `El cobro de la mesa 6: ${cobro.mensaje ?? ''}`).toBe(true);
        await cerrarElTicket(rosa);

        expect(await cuentaEnElServidor(duena, ordenUno)).toMatchObject({
          estado: 'pagada',
          totalCentavos: ventaUno,
          sesionCajaId: sesion,
        });
        expect(await pagosDeLaCuenta(duena, ordenUno)).toMatchObject({
          efectivo: ventaUno + propinaUno,
          propinaEfectivo: propinaUno,
          cobradoConPropina: ventaUno + propinaUno,
          cambio: 60_000 - ventaUno - propinaUno,
        });
        libro.cobro({
          referencia: 'mesa 6 · primer grupo, QR con 15 % en efectivo',
          ventaId: ordenUno,
          sesionCajaId: sesion,
          ventaCentavos: ventaUno,
          pagos: { efectivo: ventaUno + propinaUno },
          propina: { efectivo: propinaUno },
        });
      });

      await test.step('«mesa limpia»: la mesa vuelve al servicio y los avisos del primer grupo se cierran con ella', async () => {
        // La caja la libera sola al cobrar; si no, la mesera la deja limpia tocándola.
        await mesaLimpia(lupita, duena, MESA);
        await exigirEstadoDeLaMesa(duena, MESA, 'libre', 'La mesa cobrada no volvió al servicio.');
        const avisos = await avisosDeLaMesa(duena, MESA);
        expect(
          avisos.map((a) => [a.tipo, a.estado]).sort(),
          'Los avisos del grupo que se fue siguen vivos con la mesa ya recogida.',
        ).toEqual([
          ['ayuda', 'resuelta'],
          ['cuenta', 'resuelta'],
        ]);
        // La tableta de Lupita ya no los tiene en sus tarjetas.
        await expect(lupita.getByText(/^SOLICITUDES ACTIVAS \(\d+\)$/)).toBeHidden({
          timeout: 20_000,
        });
        // Y el teléfono del primer grupo, si vuelve a mirar, ya no dice que su cuenta está pedida.
        await telefonoUno!.reload();
        await expect(telefonoUno!.getByText('Tu cuenta fue solicitada')).toHaveCount(0);
      });

      // ── SEGUNDO GRUPO, EN LA MISMA MESA, CON EL MISMO CÓDIGO ─────────────────
      const avisosDelPrimero = new Set((await avisosDeLaMesa(duena, MESA)).map((a) => a.id));
      let ordenDos = '';
      await test.step('se sienta otro grupo: Lupita abre la mesa 6 para dos, comanda y la cocina entrega', async () => {
        // La caja liberó la mesa al cobrar y el mapa de la tableta lo ve en su siguiente
        // refresco (5 s): se recarga para no tocar la mesa con el estado de antes del cobro.
        await lupita.reload();
        ordenDos = (await abrirLaMesa(lupita, duena, MESA, 2)).ordenId;
        expect(ordenDos, 'El segundo grupo se sentó sobre la cuenta del primero.').not.toBe(
          ordenUno,
        );
        await comandar(lupita, MESA, PEDIDO_DOS);
        await alMapa(lupita);
        await cocinaDejaLista(tono, duena, ordenDos, 1);
        await entregar(lupita, MESA);
        await alMapa(lupita);
        expect(unidadesPorPlatillo(await comandasDeLaCuenta(duena, ordenDos))).toEqual(
          unidadesEsperadas(PEDIDO_DOS),
        );
      });

      const ventaDos = importeDe(PEDIDO_DOS);
      const propinaDos = Math.round(ventaDos * 0.1);
      await test.step('el segundo grupo escanea el MISMO QR: no hereda nada del primero, y pide su cuenta con 10 %', async () => {
        const comensal = await abrirElQrDeLaMesa(browser, info, SLUG, token);
        telefonos.push(comensal);
        const telefono = comensal.page;
        fallos.push(vigilarFallos(telefono));

        // Nada del grupo anterior en su pantalla: ni «cuenta solicitada» ni «tu mesero ya vio».
        await expect(telefono.getByText(NEGOCIO)).toBeVisible();
        await expect(telefono.getByText('Tu cuenta fue solicitada')).toHaveCount(0);
        await expect(telefono.getByText('Tu mesero ya vio la solicitud')).toHaveCount(0);
        // Ni un aviso vivo en el servidor: los del primer grupo están resueltos.
        expect((await avisosDeLaMesa(duena, MESA)).filter((a) => a.estado !== 'resuelta')).toEqual(
          [],
        );

        // Lo que la tableta de Lupita ya enseñaba queda MARCADO: el aviso del segundo grupo tiene que
        // ser otro, no el del primero que sigue a la vista (un aviso dura diez segundos, y se queda
        // más si el puntero descansa sobre él).
        await lupita.evaluate(() => {
          document.querySelectorAll('[data-sonner-toast]').forEach((aviso) => {
            aviso.setAttribute('data-del-grupo-anterior', '1');
          });
        });

        await telefono.getByRole('button', { name: 'Atención' }).click();
        await telefono.getByRole('button', { name: 'Pedir cuenta' }).click();
        const hoja = telefono
          .locator('div.fixed.inset-0')
          .filter({ hasText: `Pedir cuenta — Mesa ${String(MESA)}` });
        await expect(hoja).toBeVisible();
        // Su cuenta, no la del grupo anterior.
        await expect(hoja).toContainText(pesosEnPantalla(ventaDos));
        await expect(hoja).not.toContainText(CARTA.arrachera.nombre);
        await hoja.getByRole('button', { name: /^10%/ }).click();
        await hoja.getByRole('button', { name: 'Confirmar' }).click();
        await expect(telefono.getByText('¡Cuenta solicitada!')).toBeVisible();

        // El aviso es NUEVO —no el del grupo anterior, puesto al día—.
        await expect
          .poll(
            async () =>
              (await avisosDeLaMesa(duena, MESA)).filter((a) => a.estado === 'pendiente').length,
            {
              message: 'El segundo grupo no dejó su propio aviso.',
            },
          )
          .toBe(1);
        const avisos = await avisosDeLaMesa(duena, MESA);
        const nuevo = avisos.find((a) => a.estado === 'pendiente');
        expect(nuevo).toMatchObject({
          tipo: 'cuenta',
          ordenId: ordenDos,
          destino: MESERO,
          subtotalCentavos: ventaDos,
          propinaCentavos: propinaDos,
        });
        expect(
          avisosDelPrimero.has(nuevo?.id ?? ''),
          'El aviso del segundo grupo es el del primero, puesto al día en vez de uno nuevo.',
        ).toBe(false);
        expect(avisos.filter((a) => a.estado === 'resuelta')).toHaveLength(2);
        expect(await cuentaEnElServidor(duena, ordenDos)).toMatchObject({
          estado: 'cuenta_solicitada',
          totalCentavos: ventaDos,
          propinaTipo: 'porcentaje',
          propinaOrigen: 'portal_qr',
          propinaPorcentaje: 10,
        });

        // Y a Lupita SÍ le llega: un aviso NUEVO en su tableta —no el del primer grupo, que puede
        // seguir en pantalla— y UNA sola tarjeta activa.
        await expect(
          avisoNuevoEnLaTableta(lupita, `Mesa ${String(MESA)} solicita cuenta`),
          'La tableta de Lupita no avisó que el segundo grupo pidió su cuenta.',
        ).toBeVisible({ timeout: 20_000 });
        await expect(solicitudesActivas(lupita, 1)).toBeVisible();
      });

      await test.step('Rosa cobra al segundo grupo con tarjeta; la mesa vuelve al servicio y no queda ningún aviso vivo', async () => {
        const dialogo = await abrirElCobro(rosa, MESA);
        await expect(dialogo).toContainText(pesosEnPantalla(ventaDos + propinaDos));
        await dialogo.getByRole('button', { name: 'Tarjeta', exact: true }).click();
        const respuesta = rosa.waitForResponse(
          (r) => new URL(r.url()).pathname === '/api/venta/cobrar',
        );
        await dialogo.getByRole('button', { name: /^Cobrar \$/ }).click();
        const cobro = await leerElCobro(await respuesta);
        expect(cobro.ok, `El cobro del segundo grupo: ${cobro.mensaje ?? ''}`).toBe(true);
        await cerrarElTicket(rosa);

        expect(await cuentaEnElServidor(duena, ordenDos)).toMatchObject({
          estado: 'pagada',
          totalCentavos: ventaDos,
        });
        expect(await pagosDeLaCuenta(duena, ordenDos)).toMatchObject({
          tarjeta: ventaDos + propinaDos,
          propinaTarjeta: propinaDos,
          efectivo: 0,
          cobradoConPropina: ventaDos + propinaDos,
        });
        libro.cobro({
          referencia: 'mesa 6 · segundo grupo, QR con 10 % con tarjeta',
          ventaId: ordenDos,
          sesionCajaId: sesion,
          ventaCentavos: ventaDos,
          pagos: { tarjeta: ventaDos + propinaDos },
          propina: { tarjeta: propinaDos },
        });

        await mesaLimpia(lupita, duena, MESA);
        await exigirEstadoDeLaMesa(duena, MESA, 'libre', 'La mesa cobrada no volvió al servicio.');
        const avisos = await avisosDeLaMesa(duena, MESA);
        expect(
          avisos.map((a) => a.estado),
          'Quedó un aviso vivo en la mesa recogida.',
        ).toEqual(['resuelta', 'resuelta', 'resuelta']);
        await expect(lupita.getByText(/^SOLICITUDES ACTIVAS \(\d+\)$/)).toBeHidden({
          timeout: 20_000,
        });
      });

      // ── EL DINERO DEL DÍA CUADRA ─────────────────────────────────────────────
      await test.step('el efectivo del cajón es el fondo más lo que entró UNA vez, y el día cuadra al centavo', async () => {
        const esperado = FONDO_CENTAVOS + ventaUno + propinaUno;
        expect(await esperadoDelCajon(rosa)).toBe(esperado);
        await cerrarCajaYCuadrar(rosa, esperado);
        libro.contar(sesion, esperado);
        for (const insumo of ['Arrachera', CARTA.cerveza.nombre]) {
          expect(libro.productosVigilados).toContain(insumo);
        }
        await exigirQueCuadre(duena, libro);
      });

      for (const exigirSinFallos of fallos) exigirSinFallos();
    } finally {
      if (rosaConCaja !== null) {
        info.annotations.push({ type: 'caja', description: await soltarLaCaja(rosaConCaja) });
      }
      for (const telefono of telefonos) await telefono.cerrar();
      await equipo.cerrar();
    }
  });

  // Fue un DEFECTO hasta el cierre del 21-10: con la asignación de mesas encendida, una mesera
  // cuyas mesas están TODAS en una zona que no es «Interior» —la barra, la terraza— abría «Mesas y
  // pedidos» y leía «No hay mesas en Interior.» sin ninguna pestaña para cambiar de zona (las
  // pestañas sólo se pintan con dos zonas o más). Ahora la zona vigente sale de las zonas que la
  // mesera sí tiene (`pages/Mesero.jsx`).
  test('con la asignación de mesas encendida, una mesera con sus mesas sólo en «Barra» llega a ellas', async ({
    browser,
  }, info) => {
    test.setTimeout(3 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    try {
      const duena = await equipo.pagina(info, 'dueno');
      const respuesta = await duena.request.post('/api/catalogo/demostracion/resetear', {
        headers: cabecerasDeEscrituraDePrueba(),
        data: { confirmacion: 'RESETEAR' },
      });
      expect(respuesta.status()).toBe(200);
      await prepararElPortalDelComensal(duena, { mesa: 10, zona: 'Barra', mesero: MESERO });
      const lupita = await equipo.pagina(info, 'mesero');
      await lupita.goto('/');
      await lupita.waitForURL(/\/mesero$/);
      await expect(
        laMesa(lupita, 10),
        'Lupita sólo tiene la mesa 10, en «Barra»: «Mesas y pedidos» le enseña «No hay mesas en Interior.»',
      ).toBeVisible();
    } finally {
      await equipo.cerrar();
    }
  });
});
