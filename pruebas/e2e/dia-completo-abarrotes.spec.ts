import { expect, type Page, test } from '@playwright/test';

import { conciliarElDia } from '../../packages/testing/src/conciliacion.ts';

import {
  exigirQueCuadre,
  existenciaDe,
  leerElServidor,
  Libro,
  movimientosDeInventarioPrevios,
  sesionDeLaCaja,
  type LecturasDelGiro,
} from './ayudantes/conciliacion.ts';
import { exigirElPdfDelCorte } from './ayudantes/corte.ts';
import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  exigirCobroAceptado,
  exigirDemostracion,
  exigirVentaCobrada,
  irPorElMenu,
  soltarLaCaja,
  totalEnPantalla,
  ventasDeAntes,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * EL DÍA COMPLETO DE LA TIENDA (D.1 de la 2.4) · `abarrotes/00-FICHA-Y-EJES §3`.
 *
 * Un martes de Abarrotes Don Chuy, operado por QUIEN lo opera —Poncho en el almacén, Jesica
 * en el mostrador, Laura cuando hace falta autorizar, devolver o cerrar, y el dueño que lee
 * el corte—, llegando a cada pantalla POR EL MENÚ de su rol. Cada cosa que mueve dinero o
 * mercancía se anota en el `Libro`, y al final el dinero tiene que cuadrar AL CENTAVO contra
 * el servidor (`conciliarElDia`), o la prueba dice exactamente dónde no.
 *
 * El día empieza con un reseteo de la demo: todo lo que el servidor tenga después es de este
 * día, y una venta o una caja que la prueba no hizo es un hallazgo, no ruido.
 *
 * ── Dispositivos ──────────────────────────────────────────────────────────────
 * La PC del mostrador es UNA terminal. Laura no trae la suya: entra con su PIN en esa misma
 * PC (`paginaEnLaTerminalDe`), porque la devolución en efectivo sale del cajón de la
 * terminal que lo tiene. Poncho trabaja en la PC de atrás y el dueño, en su teléfono.
 */

const SLUG = 'demo-acople-tienda';

/** $800 en monedas y billetes chicos (ficha §3, 07:00). */
const FONDO = { monedas: 30_000, chicos: 50_000 } as const;
const FONDO_CENTAVOS = FONDO.monedas + FONDO.chicos;

const PRODUCTO = {
  leche: 'Leche entera 1 L',
  refresco: 'Refresco de cola 600 ml',
  aceite: 'Aceite de maíz 1 L',
  arroz: 'Arroz súper extra 1 kg',
  huevo: 'Huevo blanco 18 piezas',
  queso: 'Queso panela 400 g',
  detergente: 'Detergente en polvo 1 kg',
  yogur: 'Yogur natural 1 kg',
  frijol: 'Frijol pinto 1 kg',
  sal: 'Sal de mesa 1 kg',
  cerveza: 'Cerveza clara 355 ml',
} as const;

const REPOSO = /Escanea el primer/;

const pesos = (centavos: number): string => (centavos / 100).toFixed(2);

/** Los pasivos del día por la ruta que la conciliación necesitaba y no había. */
const LECTURAS: LecturasDelGiro = {
  pasivos: async (page) => {
    const respuesta = await page.request.post('/api/pasivos/del-dia', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: {},
    });
    expect(respuesta.status(), `pasivos.del_dia: ${await respuesta.text()}`).toBe(200);
    const cuerpo = (await respuesta.json()) as {
      readonly datos: {
        readonly movimientos: readonly { concepto: string; montoCentavos: string }[];
      };
    };
    return cuerpo.datos.movimientos.map((m) => ({
      concepto: m.concepto,
      centavos: BigInt(m.montoCentavos),
    }));
  },
};

/** Lo que el servidor dice que debería haber en el cajón de esta terminal, ahora. */
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

/**
 * Abre `/` y espera a caer en SU casa: la cajera en el cobro, el almacén en sus productos
 * (`IrAlInicioDelRol`). `/` les pintaba el tablero del dueño, que su puesto no puede leer.
 */
async function aSuCasa(page: Page, casa: RegExp): Promise<void> {
  await page.goto('/');
  await page.waitForURL(casa);
}

/** Busca por nombre y Enter lo agrega. `fill`, no `type`: `type` parece un escáner. */
async function agregar(page: Page, nombre: string, veces = 1): Promise<void> {
  const busqueda = page.getByLabel('Código o nombre · F2');
  for (let i = 0; i < veces; i += 1) {
    await busqueda.fill(nombre);
    await expect(page.getByText(`Enter agrega: ${nombre}`)).toBeVisible();
    await busqueda.press('Enter');
  }
  await expect(
    page
      .getByRole('region', { name: /en curso$/ })
      .getByText(nombre, { exact: false })
      .first(),
  ).toBeVisible();
}

interface CobroHecho {
  readonly ventaId: string;
  readonly folio: string;
  readonly totalCentavos: number;
}

/** Confirma, espera el reposo y exige la venta en el servidor por el total de la pantalla. */
async function confirmarYExigir(
  page: Page,
  totalCentavos: number,
  antes: ReadonlySet<string>,
): Promise<CobroHecho> {
  await page.getByRole('button', { name: 'CONFIRMAR' }).click();
  await exigirCobroAceptado(page, REPOSO);
  const venta = await exigirVentaCobrada(page, totalCentavos, antes);
  return { ventaId: venta.id ?? '', folio: venta.folio ?? '', totalCentavos };
}

test.describe('el día completo de la tienda', () => {
  // Cada acción con su techo: sin él, un clic sobre algo que no aparece espera hasta el
  // límite de la prueba entera y el informe dice «se acabó el tiempo» en vez de «no estaba».
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('un martes de Abarrotes Don Chuy, cuadrado al centavo', async ({ browser }, info) => {
    test.setTimeout(20 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const libro = new Libro();
    const fallos: (() => void)[] = [];
    let mostrador: Page | null = null;

    try {
      // ── 06:30 · EL DUEÑO EMPIEZA EL DÍA EN LIMPIO ───────────────────────────
      const dueno = await equipo.pagina(info, 'dueno');
      fallos.push(vigilarFallos(dueno));
      await test.step('reseteo de la demo (el día empieza vacío)', async () => {
        const respuesta = await dueno.request.post('/api/catalogo/demostracion/resetear', {
          headers: cabecerasDeEscrituraDePrueba(),
          data: { confirmacion: 'RESETEAR' },
        });
        expect(respuesta.status(), `resetear_demo: ${await respuesta.text()}`).toBe(200);
      });

      // Lo que se vigila del inventario: lo que se vende, lo que entra y lo que se cuenta. El
      // ledger del día empieza aquí: las entradas iniciales del reseteo no son de este libro.
      libro.empezarInventario(await movimientosDeInventarioPrevios(dueno));
      for (const nombre of [PRODUCTO.leche, PRODUCTO.detergente, PRODUCTO.cerveza]) {
        libro.existenciaAntes(nombre, await existenciaDe(dueno, nombre));
      }

      // ── 06:40 · LLEGA EL PROVEEDOR: ENTRADA CON CANJE ───────────────────────
      const almacen = await equipo.pagina(info, 'almacen');
      fallos.push(vigilarFallos(almacen));
      // Lo que trae el repartidor lo dice la nota, no el sugerido: después de un reseteo no
      // hay catorce días de venta y el sugerido sale vacío (D-32).
      const recibido = PRODUCTO.leche;
      await test.step('Poncho recibe la nota del proveedor, con canje de lo caducado', async () => {
        await aSuCasa(almacen, /\/abarrotes\/producto/);
        await irPorElMenu(almacen, 'Entradas', /Recibir nota|proveedor/i);
        await almacen
          .getByRole('button', { name: /Abastos del Centro/ })
          .first()
          .click();
        const nota = almacen.locator('[aria-labelledby="nota-titulo"]');
        await nota.locator('#agregar-del-catalogo').click();
        await almacen.getByRole('option', { name: recibido, exact: true }).click();
        await nota.getByLabel(`Cantidad de ${recibido}`).fill('12');
        await nota.getByLabel(`Costo total de ${recibido}`).fill('240.00');
        await nota.getByRole('button', { name: 'Agregar canje' }).click();
        await nota.locator('[id^="canje-articulo-"]').first().click();
        await almacen.getByRole('option', { name: recibido, exact: true }).click();
        await nota.locator('[id^="canje-cantidad-"]').first().fill('2');
        await nota.getByRole('button', { name: 'Guardar entrada' }).click();
        await expect(nota.getByText(/^Entrada guardada\..*El canje ya se descontó\./)).toBeVisible({
          timeout: 30_000,
        });
      });

      // ── 07:00 · ABRE LA CAJA CON SU FONDO Y SU DESGLOSE ─────────────────────
      mostrador = await equipo.pagina(info, 'cajero');
      const jesica = mostrador;
      fallos.push(vigilarFallos(jesica));
      let sesion = '';
      await test.step('Jesica abre la caja con $800 en monedas y billetes chicos', async () => {
        await aSuCasa(jesica, /\/abarrotes\/cobrar/);
        await irPorElMenu(jesica, 'Caja', /Fondo con el que abres|Lo que debería haber/);
        await jesica.locator('#fondo-monedas').fill(pesos(FONDO.monedas));
        await jesica.locator('#fondo-chicos').fill(pesos(FONDO.chicos));
        await jesica.getByRole('button', { name: 'Abrir caja' }).click();
        await expect(jesica.getByText('Lo que debería haber')).toBeVisible({ timeout: 30_000 });
        await expect(jesica.getByText(/\$NaN/)).toHaveCount(0);
        sesion = (await sesionDeLaCaja(jesica)) ?? '';
        expect(sesion, 'La caja dice abierta y el servidor no tiene su sesión.').not.toBe('');
        libro.abrirCaja('caja del mostrador', sesion, FONDO_CENTAVOS);
        expect(await esperadoDelCajon(jesica)).toBe(FONDO_CENTAVOS);
      });

      // ── 07:10–09:30 · EL PRIMER PICO: EFECTIVO, TARJETA, TRANSFERENCIA ───────
      const cobros: Record<string, CobroHecho> = {};
      await test.step('ventas en efectivo, con tarjeta y por transferencia', async () => {
        await irPorElMenu(jesica, 'Cobrar', /La caja está cerrada|nada que escanear|COBRAR/);

        let antes = await ventasDeAntes(jesica);
        await agregar(jesica, PRODUCTO.leche);
        await agregar(jesica, PRODUCTO.refresco);
        let total = await totalEnPantalla(jesica);
        await jesica.getByRole('button', { name: /^COBRAR/ }).click();
        await jesica.getByRole('button', { name: 'Exacto' }).click();
        cobros['efectivo'] = await confirmarYExigir(jesica, total, antes);
        libro.cobro({
          referencia: 'leche y refresco en efectivo',
          ventaId: cobros['efectivo'].ventaId,
          sesionCajaId: sesion,
          ventaCentavos: total,
          pagos: { efectivo: total },
        });

        antes = await ventasDeAntes(jesica);
        await agregar(jesica, PRODUCTO.aceite);
        total = await totalEnPantalla(jesica);
        await jesica.getByRole('button', { name: /^Tarjeta/ }).click();
        cobros['tarjeta'] = await confirmarYExigir(jesica, total, antes);
        libro.cobro({
          referencia: 'aceite con tarjeta',
          ventaId: cobros['tarjeta'].ventaId,
          sesionCajaId: sesion,
          ventaCentavos: total,
          pagos: { tarjeta: total },
        });

        antes = await ventasDeAntes(jesica);
        await agregar(jesica, PRODUCTO.arroz);
        total = await totalEnPantalla(jesica);
        await jesica.getByRole('button', { name: /^Transferencia/ }).click();
        cobros['transferencia'] = await confirmarYExigir(jesica, total, antes);
        libro.cobro({
          referencia: 'arroz por transferencia',
          ventaId: cobros['transferencia'].ventaId,
          sesionCajaId: sesion,
          ventaCentavos: total,
          pagos: { transferencia: total },
        });
      });

      await test.step('pago MIXTO: $100 en efectivo y el resto con tarjeta', async () => {
        const antes = await ventasDeAntes(jesica);
        await agregar(jesica, PRODUCTO.huevo);
        await agregar(jesica, PRODUCTO.queso);
        const total = await totalEnPantalla(jesica);
        await jesica.getByRole('button', { name: 'Mixto', exact: true }).click();
        await jesica.locator('#cobrar-mixto-efectivo').fill('100.00');
        await jesica
          .getByRole('group', { name: 'El resto con' })
          .getByRole('button', { name: 'Tarjeta' })
          .click();
        cobros['mixto'] = await confirmarYExigir(jesica, total, antes);
        libro.cobro({
          referencia: 'huevo y queso, mixto',
          ventaId: cobros['mixto'].ventaId,
          sesionCajaId: sesion,
          ventaCentavos: total,
          pagos: { efectivo: 10_000, tarjeta: total - 10_000 },
        });
      });

      await test.step('descuento dentro del tope de la cajera: se aplica sin PIN', async () => {
        const antes = await ventasDeAntes(jesica);
        await agregar(jesica, PRODUCTO.detergente, 2);
        const sinDescuento = await totalEnPantalla(jesica);
        await jesica.getByRole('button', { name: /^COBRAR/ }).click();
        await jesica.getByRole('button', { name: 'Descuento', exact: true }).click();
        const dialogo = jesica.getByRole('dialog', { name: 'Descuento' });
        await dialogo.locator('#descuento-importe').fill('5.00');
        await dialogo.locator('#descuento-motivo').fill('cliente frecuente');
        await expect(dialogo.getByText(/Pasa de tu tope/)).toHaveCount(0);
        await dialogo.getByRole('button', { name: 'Aplicar el descuento' }).click();
        await expect(dialogo).toBeHidden();
        const total = sinDescuento - 500;
        expect(await totalEnPantalla(jesica)).toBe(total);
        await jesica.getByRole('button', { name: 'Exacto' }).click();
        cobros['descuento'] = await confirmarYExigir(jesica, total, antes);
        libro.cobro({
          referencia: 'detergente con descuento de $5',
          ventaId: cobros['descuento'].ventaId,
          sesionCajaId: sesion,
          ventaCentavos: total,
          pagos: { efectivo: total },
        });
      });

      await test.step('descuento SOBRE el tope: lo autoriza Laura con su PIN, en la terminal de Jesica', async () => {
        const antes = await ventasDeAntes(jesica);
        await agregar(jesica, PRODUCTO.yogur, 2);
        const sinDescuento = await totalEnPantalla(jesica);
        await jesica.getByRole('button', { name: /^COBRAR/ }).click();
        await jesica.getByRole('button', { name: 'Descuento', exact: true }).click();
        const dialogo = jesica.getByRole('dialog', { name: 'Descuento' });
        await dialogo.locator('#descuento-importe').fill('20.00');
        await dialogo.locator('#descuento-motivo').fill('yogur por caducar');
        await expect(dialogo.getByText(/Pasa de tu tope/)).toBeVisible();
        await expect(dialogo.getByRole('button', { name: 'Aplicar el descuento' })).toBeDisabled();
        await dialogo
          .getByRole('group', { name: 'Quién autoriza' })
          .getByRole('button', { name: 'Laura' })
          .click();
        await dialogo.locator('#descuento-pin').fill('2345');
        await dialogo.getByRole('button', { name: 'Autorizar' }).click();
        await expect(dialogo.getByText('Autorizó Laura.')).toBeVisible();
        await dialogo.getByRole('button', { name: 'Aplicar el descuento' }).click();
        await expect(dialogo).toBeHidden();
        const total = sinDescuento - 2_000;
        expect(await totalEnPantalla(jesica)).toBe(total);
        await jesica.getByRole('button', { name: 'Exacto' }).click();
        cobros['autorizado'] = await confirmarYExigir(jesica, total, antes);
        libro.cobro({
          referencia: 'yogur con descuento autorizado',
          ventaId: cobros['autorizado'].ventaId,
          sesionCajaId: sesion,
          ventaCentavos: total,
          pagos: { efectivo: total },
        });
      });

      // ── 10:00 · DOÑA MECHE PAGA LA LUZ (F-255): NO ES VENTA ─────────────────
      await test.step('pago de servicio: CFE, $1,240 que no son de la tienda', async () => {
        await irPorElMenu(jesica, 'Servicios', /comisionista|comisión/i);
        const servicio = jesica.locator('[aria-labelledby="titulo-servicio"]');
        await servicio.getByRole('button', { name: /^CFE/ }).click();
        await servicio.locator('#referencia').fill('012345678901234567890123');
        await servicio.locator('#importe').fill('1240.00');
        await servicio.getByRole('button', { name: /^COBRAR/ }).click();
        await expect(jesica.getByText(/Pago de CFE/)).toBeVisible({ timeout: 30_000 });
        libro.movimiento(sesion, 'recibo de luz de CFE', 124_000);
        // La comisión de CFE ($8) es de la tienda: al proveedor se le deben $1,232.
        libro.pasivo('servicio_terceros', 123_200);
      });

      // ── 16:00 · FIADO, Y LA SEÑORA QUE VIENE A ABONAR ───────────────────────
      const cliente = `Doña Meche ${String(Date.now()).slice(-5)}`;
      await test.step('fiado a nombre de alguien, y su abono en efectivo', async () => {
        await irPorElMenu(jesica, 'Cobrar', /La caja está cerrada|nada que escanear|COBRAR/);
        const antes = await ventasDeAntes(jesica);
        await agregar(jesica, PRODUCTO.frijol);
        const total = await totalEnPantalla(jesica);
        await jesica.keyboard.press('F11');
        const aQuien = jesica.getByRole('dialog', { name: 'A quién' });
        await aQuien.getByRole('button', { name: 'Cliente nuevo' }).click();
        await aQuien.getByLabel('Nombre').fill(cliente);
        await aQuien.getByRole('button', { name: 'Dar de alta y elegir' }).click();
        await expect(aQuien).toBeHidden();
        cobros['fiado'] = await confirmarYExigir(jesica, total, antes);
        libro.cobro({
          referencia: 'frijol fiado',
          ventaId: cobros['fiado'].ventaId,
          sesionCajaId: sesion,
          ventaCentavos: total,
          pagos: { fiado: total },
        });

        await jesica.keyboard.press('F7');
        const abono = jesica.getByRole('dialog', { name: 'Abono de fiado' });
        await abono.getByLabel('Nombre o teléfono').fill(cliente);
        await abono.getByRole('row', { name: `Elegir a ${cliente}` }).click();
        await abono.getByLabel('Cuánto abona').fill('20.00');
        await abono.getByRole('button', { name: 'Registrar abono' }).click();
        await expect(abono).toBeHidden();
        await expect(jesica.getByText(`${cliente} abonó`)).toBeVisible();
        libro.movimiento(sesion, `abono de ${cliente}`, 2_000);
        libro.pasivo('abono_credito', 2_000);
      });

      // ── 18:00 · LA CERVEZA CON CASCO ────────────────────────────────────────
      await test.step('el casco: entra el depósito y vuelve cuando traen el envase', async () => {
        await jesica.getByRole('button', { name: 'Casco', exact: true }).click();
        let casco = jesica.getByRole('dialog', { name: 'Casco' });
        await casco.locator('#casco-cantidad').fill('2');
        await casco.getByRole('button', { name: 'Cobrar el depósito' }).click();
        await expect(casco).toBeHidden();
        await expect(jesica.getByText(/Entraron \$20\.00 por 2 cascos/)).toBeVisible();
        libro.movimiento(sesion, 'depósito de dos cascos', 2_000);
        libro.pasivo('envase_retornable', 2_000);

        await jesica.getByRole('button', { name: 'Casco', exact: true }).click();
        casco = jesica.getByRole('dialog', { name: 'Casco' });
        await casco.getByRole('button', { name: 'Trae el casco' }).click();
        await casco.locator('#casco-cantidad').fill('1');
        await casco.getByRole('button', { name: 'Devolver el depósito' }).click();
        await expect(casco).toBeHidden();
        await expect(jesica.getByText(/Se devolvieron \$10\.00 por un casco/)).toBeVisible();
        libro.movimiento(sesion, 'devolución de un casco', -1_000);
        libro.pasivo('envase_retornable', -1_000);
      });

      await test.step('la venta apartada que nadie vino a recoger se cancela con su motivo', async () => {
        await agregar(jesica, PRODUCTO.sal);
        await jesica.keyboard.press('F6');
        const espera = jesica.getByRole('dialog', { name: 'Apartar o retomar' });
        await espera.getByLabel('Para reconocerla (opcional)').fill('señora del rebozo');
        await espera.getByRole('button', { name: 'Apartar esta venta' }).click();
        const apartada = jesica.getByText(/^Apartada: es la \d+\.$/);
        await expect(apartada).toBeVisible();
        const codigo = /(\d+)/.exec(await apartada.innerText())?.[1] ?? '';
        await jesica.keyboard.press('F6');
        const lista = jesica.getByRole('dialog', { name: 'Apartar o retomar' });
        await lista.getByRole('button', { name: `Cancelar la ${codigo}` }).click();
        await lista.locator('#cancelar-motivo').fill('no volvió por ella');
        await lista.getByRole('button', { name: `Cancelar la venta ${codigo}` }).click();
        await expect(lista.getByRole('button', { name: `Retomar la ${codigo}` })).toHaveCount(0);
        await jesica.keyboard.press('Escape');
      });

      // ── LAURA EN EL MOSTRADOR: DEVOLUCIONES, GASTO Y RETIRO ─────────────────
      const laura = await equipo.paginaEnLaTerminalDe(info, { rol: 'cajero' }, 'gerente');
      fallos.push(vigilarFallos(laura));
      await test.step('Laura devuelve una venta completa y otra en parte, en efectivo', async () => {
        await laura.goto('/');
        await irPorElMenu(laura, 'Caja', /Lo que debería haber/);
        const devolucion = laura.locator('[aria-labelledby="devolucion-titulo"]');

        await devolucion.locator('#devolucion-folio').fill(cobros['efectivo']!.folio);
        await devolucion.getByRole('button', { name: 'Buscar la venta' }).click();
        await devolucion.getByRole('button', { name: 'Devolver todo lo que queda' }).click();
        await devolucion.getByRole('button', { name: /^Efectivo · hasta/ }).click();
        await devolucion.locator('#devolucion-motivo').fill('la leche venía abierta');
        await devolucion.getByRole('button', { name: 'Devolver', exact: true }).click();
        await expect(devolucion.getByText(/devuelta completa/)).toBeVisible({ timeout: 30_000 });
        libro.movimiento(
          sesion,
          'devolución total de la leche y el refresco',
          -cobros['efectivo']!.totalCentavos,
        );

        await devolucion.locator('#devolucion-folio').fill(cobros['descuento']!.folio);
        await devolucion.getByRole('button', { name: 'Buscar la venta' }).click();
        await devolucion.getByLabel(`Cuánto regresa de ${PRODUCTO.detergente}`).first().fill('1');
        await devolucion.getByRole('button', { name: /^Efectivo · hasta/ }).click();
        await devolucion.locator('#devolucion-motivo').fill('se llevó uno de más');
        const sale = devolucion.locator('[aria-live="polite"]').filter({ hasText: 'Se devuelven' });
        const parcial = Math.round(
          Number(
            /\$([\d,]+\.\d{2})/.exec(await sale.innerText())?.[1]?.replace(/,/g, '') ?? 'NaN',
          ) * 100,
        );
        // La mitad de lo cobrado por dos detergentes con $5 de descuento: $43.00.
        expect(parcial).toBe(cobros['descuento']!.totalCentavos / 2);
        await devolucion.getByRole('button', { name: 'Devolver', exact: true }).click();
        await expect(devolucion.getByText(/devuelta en parte/)).toBeVisible({ timeout: 30_000 });
        libro.movimiento(sesion, 'devolución de un detergente', -parcial);
      });

      await test.step('Laura paga el garrafón y saca $500 al banco', async () => {
        const gasto = laura.locator('[aria-labelledby="gasto-titulo"]');
        await gasto.locator('#gasto-monto').fill('85.00');
        await gasto.getByRole('button', { name: 'Limpieza' }).click();
        await gasto.locator('#gasto-descripcion').fill('garrafón de agua para el trapeador');
        await gasto.getByRole('button', { name: 'Registrar el gasto' }).click();
        await expect(
          gasto.getByText(/^Gasto registrado: salieron \$85\.00 del cajón\.$/),
        ).toBeVisible();
        libro.movimiento(sesion, 'gasto: garrafón', -8_500);

        await laura.locator('#retiro-importe').fill('500');
        await laura.locator('#retiro-motivo').fill('al banco');
        await laura.getByRole('button', { name: 'Registrar el retiro' }).click();
        await expect(laura.locator('#retiro-importe')).toHaveValue('');
        libro.movimiento(sesion, 'retiro al banco', -50_000);
      });

      // ── 21:00 · JESICA ENTREGA SU TURNO, CON FALTANTE ───────────────────────
      await test.step('corte de turno de Jesica a ciegas: le faltan $10', async () => {
        const esperado = await esperadoDelCajon(jesica);
        await aSuCasa(jesica, /\/abarrotes\/cobrar/);
        await irPorElMenu(
          jesica,
          'Cortes',
          /Cortes anteriores|Cuenta el cajón|No hay turno abierto/,
        );
        const turno = jesica.locator('form[aria-labelledby="corte-de-turno-titulo"]');
        await turno.locator('#turno-contado').fill(pesos(esperado - 1_000));
        await turno.locator('#turno-notas').fill('se lo entregué a Laura');
        await turno.getByRole('button', { name: 'Entregar el turno' }).click();
        await expect(turno.getByText(/entregado: faltante/)).toBeVisible({ timeout: 30_000 });
        // El corte de turno es una FOTO: no saca nada del cajón (la caja sigue abierta).
        expect(
          await esperadoDelCajon(jesica),
          'El corte de turno movió el esperado del cajón.',
        ).toBe(esperado);
      });

      // ── LAURA SIGUE: UNA VENTA MÁS EN LA MISMA CAJA ─────────────────────────
      await test.step('el segundo turno vende en la misma caja', async () => {
        await laura.goto('/');
        await irPorElMenu(laura, 'Cobrar', /nada que escanear|COBRAR/);
        const antes = await ventasDeAntes(laura);
        await agregar(laura, PRODUCTO.cerveza);
        const total = await totalEnPantalla(laura);
        await laura.getByRole('button', { name: /^COBRAR/ }).click();
        await laura.getByRole('button', { name: 'Exacto' }).click();
        cobros['segundo turno'] = await confirmarYExigir(laura, total, antes);
        libro.cobro({
          referencia: 'cerveza del segundo turno',
          ventaId: cobros['segundo turno'].ventaId,
          sesionCajaId: sesion,
          ventaCentavos: total,
          pagos: { efectivo: total },
        });
      });

      // ── EL CONTEO DE LA ZONA: UNA DIFERENCIA Y SU AJUSTE ────────────────────
      await test.step('Poncho cuenta la zona del día, encuentra uno de menos y ajusta', async () => {
        await aSuCasa(almacen, /\/abarrotes\/producto/);
        await irPorElMenu(almacen, 'Conteo', /zona/i);
        const enCurso = almacen.locator('#conteo-en-curso');
        await expect(enCurso).toBeVisible({ timeout: 30_000 });
        // `textContent` y no `innerText`: éste devuelve el texto con las mayúsculas del estilo.
        const nombre = ((await enCurso.textContent()) ?? '').trim();
        if (!libro.productosVigilados.includes(nombre)) {
          libro.existenciaAntes(nombre, await existenciaDe(dueno, nombre));
        }
        const hay = await existenciaDe(dueno, nombre);
        await almacen.locator('#cajas').fill('0');
        await almacen.locator('#piezas').fill(String(Math.max(hay - 1, 0)));
        await almacen.getByRole('button', { name: 'SIGUIENTE' }).click();
        await almacen.getByRole('button', { name: 'Terminar zona' }).click();
        await almacen.getByRole('button', { name: 'Ajustar todo y cerrar la zona' }).click();
        await expect(almacen.getByText('Zona cerrada.')).toBeVisible({ timeout: 30_000 });
      });

      // ── 22:30 · EL CIERRE A CIEGAS, CON SOBRANTE, Y SU PDF ──────────────────
      await test.step('Laura cierra la caja a ciegas: sobran $20', async () => {
        const esperado = await esperadoDelCajon(laura);
        const contado = esperado + 2_000;
        await laura.goto('/');
        await irPorElMenu(laura, 'Cortes', /Cuenta el cajón/);
        await laura.locator('#sueltos').fill(pesos(contado));
        await laura.locator('#dejado-en-el-cajon').fill(pesos(FONDO_CENTAVOS));
        const pdf = exigirElPdfDelCorte(laura, {
          titulo: 'CORTE DE CAJA',
          textos: [
            'Arqueo de efectivo',
            'De dónde salió el efectivo esperado',
            'Resumen de ventas',
          ],
        });
        await laura.getByRole('button', { name: 'Cerrar el turno' }).click();
        await expect(laura.getByRole('heading', { name: 'Turno cerrado' })).toBeVisible({
          timeout: 30_000,
        });
        await expect(laura.getByText(/sobra/i).first()).toBeVisible();
        await pdf;
        libro.contar(sesion, contado);
      });

      // ── 22:45 · EL DUEÑO LEE EL CORTE, Y EL DINERO CUADRA ───────────────────
      await test.step('el dueño lee el corte en su teléfono', async () => {
        await dueno.goto('/');
        await irPorElMenu(dueno, 'Cortes', /Cortes anteriores|No hay turno abierto/);
        await expect(dueno.getByText(/Cortes anteriores/)).toBeVisible();
      });

      await test.step('el dinero del día cuadra al centavo, y un centavo de más NO cuadra', async () => {
        const conciliacion = await exigirQueCuadre(dueno, libro, LECTURAS);
        expect(conciliacion.resumen.cobradoCentavos).toBeGreaterThan(0n);

        // La conciliación no da verde por defecto: el mismo día con UN centavo de más en
        // el efectivo de una venta tiene que dar un hallazgo.
        const servidor = await leerElServidor(dueno, LECTURAS, libro.movimientosPrevios);
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

      for (const exigirSinFallos of fallos) exigirSinFallos();
    } finally {
      if (mostrador !== null) {
        info.annotations.push({ type: 'caja', description: await soltarLaCaja(mostrador) });
      }
      await equipo.cerrar();
    }
  });
});
