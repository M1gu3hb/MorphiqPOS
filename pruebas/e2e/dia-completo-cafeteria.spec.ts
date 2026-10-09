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
import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  exigirCobroAceptado,
  exigirDemostracion,
  exigirVentaCobrada,
  irPorElMenu,
  soltarLaCaja,
  ventasDeAntes,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * EL DÍA COMPLETO DE LA CAFETERÍA (D.1 de la 2.4) · `cafeteria/00-FICHA-Y-EJES §3`.
 *
 * Café Jacaranda con DOS cajas abiertas a la vez —la de Diana en la barra y la de Fernanda,
 * la segunda del fin de semana (F-235, D-30)—, el barista Emilio despachando la barra y
 * Sergio en el almacén, cada uno llegando a su pantalla POR EL MENÚ de su rol. La cajera cobra
 * en efectivo exacto en la ráfaga, y con tarjeta, transferencia, mixto o propina por «Cobro y
 * propina»; los descuentos, dentro del tope y con el PIN de la gerente. Al final el dinero de
 * las dos cajas tiene que cuadrar al centavo contra el servidor (`conciliarElDia`).
 */

const SLUG = 'demo-acople-cafeteria';

const FONDO_DIANA = { monedas: 20_000, chicos: 50_000, grandes: 30_000 } as const;
const FONDO_FERNANDA = { monedas: 10_000, chicos: 20_000, grandes: 20_000 } as const;
const suma = (f: Readonly<Record<string, number>>): number =>
  Object.values(f).reduce((a, b) => a + b, 0);

const PRODUCTO = {
  croissant: 'Croissant de mantequilla',
  concha: 'Concha de vainilla',
  galleta: 'Galleta de avena',
  bagel: 'Bagel con queso crema',
  panini: 'Panini caprese',
  latte: 'Latte 12 oz',
} as const;

const REPOSO = /para empezar\./;
const pesos = (centavos: number): string => (centavos / 100).toFixed(2);

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

async function aSuCasa(page: Page, casa: RegExp): Promise<void> {
  await page.goto('/');
  await page.waitForURL(casa);
}

/** Abre el turno de ESTA terminal con su fondo por montones. */
async function abrirTurno(page: Page, fondo: Readonly<Record<string, number>>): Promise<void> {
  await irPorElMenu(page, 'Turno', /Abrir turno|Abierto desde/);
  for (const [monton, centavos] of Object.entries(fondo)) {
    await page.locator(`#fondo-${monton}`).fill(pesos(centavos));
  }
  await page.getByRole('button', { name: 'Abrir turno' }).click();
  // «Cerrar turno» es un ENLACE: lleva al cierre a ciegas, no cierra aquí.
  await expect(page.getByText(/^Abierto desde/)).toBeVisible({ timeout: 30_000 });
}

/** Toca el producto en la rejilla; si abre sus opciones, las acepta como vienen. */
async function tocar(page: Page, nombre: string, veces = 1): Promise<void> {
  for (let i = 0; i < veces; i += 1) {
    await page.getByRole('button', { name: nombre }).first().click();
    const opciones = page.getByRole('dialog').getByRole('button', { name: /^AGREGAR/ });
    if (await opciones.isVisible().catch(() => false)) await opciones.click();
  }
}

/** El total que dice el botón de cobrar. */
async function totalDelBoton(page: Page): Promise<number> {
  const texto = await page.getByRole('button', { name: /^(COBRAR|Cobrando)/ }).innerText();
  const cifra = /\$\s*([\d,]+)\s*\.?\s*(\d{2})/.exec(texto.replace(/\s+/g, ''));
  expect(cifra, `El botón de cobrar no dice un total: «${texto}».`).not.toBeNull();
  return Number(cifra![1]!.replace(/,/g, '')) * 100 + Number(cifra![2]);
}

interface CobroHecho {
  readonly ventaId: string;
  readonly folio: string;
  readonly totalCentavos: number;
}

test.describe('el día completo de la cafetería', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('un sábado de Café Jacaranda, con dos cajas, cuadrado al centavo', async ({
    browser,
  }, info) => {
    test.setTimeout(25 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const libro = new Libro();
    const fallos: (() => void)[] = [];
    const conCaja: Page[] = [];

    try {
      // ── 05:50 · LA DUEÑA EMPIEZA EL DÍA EN LIMPIO ───────────────────────────
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
      for (const nombre of ['Leche entera', PRODUCTO.croissant]) {
        libro.existenciaAntes(nombre, await existenciaDe(duena, nombre));
      }

      // ── 07:00 · ABREN LAS DOS CAJAS ─────────────────────────────────────────
      const diana = await equipo.pagina(info, 'cajero');
      fallos.push(vigilarFallos(diana));
      conCaja.push(diana);
      let sesionDiana = '';
      await test.step('Diana abre su turno con fondo por montones', async () => {
        await aSuCasa(diana, /\/cafeteria\/cobrar/);
        await abrirTurno(diana, FONDO_DIANA);
        sesionDiana = (await sesionDeLaCaja(diana)) ?? '';
        expect(sesionDiana).not.toBe('');
        libro.abrirCaja('caja de Diana', sesionDiana, suma(FONDO_DIANA));
      });

      const fernanda = await equipo.pagina(info, 'gerente');
      fallos.push(vigilarFallos(fernanda));
      conCaja.push(fernanda);
      let sesionFernanda = '';
      await test.step('Fernanda abre la SEGUNDA caja, en su terminal (cupo dos)', async () => {
        await fernanda.goto('/');
        await abrirTurno(fernanda, FONDO_FERNANDA);
        sesionFernanda = (await sesionDeLaCaja(fernanda)) ?? '';
        expect(sesionFernanda).not.toBe('');
        expect(sesionFernanda).not.toBe(sesionDiana);
        libro.abrirCaja('caja de Fernanda', sesionFernanda, suma(FONDO_FERNANDA));
      });

      // ── 07:00–09:00 · LA RÁFAGA ─────────────────────────────────────────────
      const cobros: Record<string, CobroHecho> = {};
      const cobrarEnEfectivo = async (
        page: Page,
        referencia: string,
        sesion: string,
        productos: readonly string[],
        nombrePedido?: string,
      ): Promise<CobroHecho> => {
        const antes = await ventasDeAntes(page);
        for (const p of productos) await tocar(page, p);
        if (nombrePedido !== undefined) await page.locator('#cobrar-nombre').fill(nombrePedido);
        await page.getByRole('button', { name: 'Aquí', exact: true }).click();
        const total = await totalDelBoton(page);
        await page.getByRole('button', { name: /^COBRAR/ }).click();
        await exigirCobroAceptado(page, REPOSO);
        const venta = await exigirVentaCobrada(page, total, antes);
        const hecho = { ventaId: venta.id ?? '', folio: venta.folio ?? '', totalCentavos: total };
        libro.cobro({
          referencia,
          ventaId: hecho.ventaId,
          sesionCajaId: sesion,
          ventaCentavos: total,
          pagos: { efectivo: total },
        });
        return hecho;
      };

      await test.step('Diana cobra en efectivo exacto, un latte que va a la barra', async () => {
        await irPorElMenu(diana, 'Cobrar', /Cobrar|Turno cerrado/);
        cobros['latte'] = await cobrarEnEfectivo(
          diana,
          'latte en efectivo',
          sesionDiana,
          [PRODUCTO.latte],
          'Ana',
        );
        cobros['croissant'] = await cobrarEnEfectivo(diana, 'croissant en efectivo', sesionDiana, [
          PRODUCTO.croissant,
          PRODUCTO.croissant,
        ]);
      });

      /** Cobra en «Cobro y propina»: método, partes del mixto y propina del respaldo. */
      const cobrarConMetodo = async (
        referencia: string,
        productos: readonly string[],
        metodo: 'tarjeta' | 'transferencia' | 'mixto',
        propina: number,
        efectivoDelMixto = 0,
      ): Promise<void> => {
        await irPorElMenu(diana, 'Cobrar', /Cobrar|Turno cerrado/);
        const antes = await ventasDeAntes(diana);
        for (const p of productos) await tocar(diana, p);
        await diana.getByRole('button', { name: 'Para llevar', exact: true }).click();
        const venta = await totalDelBoton(diana);
        await diana.getByRole('button', { name: 'Tarjeta, mixto o propina' }).click();
        await diana.waitForURL(/\/cafeteria\/cobro-y-propina\?pedido=/);
        await diana
          .getByRole('group', { name: 'Método de pago' })
          .getByRole('button', { name: new RegExp(metodo, 'i') })
          .click();
        const respaldo = diana.getByRole('region', { name: /propina/i }).first();
        if (propina === 0) {
          await respaldo.getByRole('button', { name: 'Sin propina' }).click();
        } else {
          await respaldo.getByRole('button', { name: 'Otro' }).click();
          await diana.locator('#cobro-propina-otra').fill(pesos(propina));
          await respaldo
            .getByRole('button', { name: /^(Listo|Usar|Aceptar|Dejar)/ })
            .first()
            .click();
        }
        if (metodo === 'mixto') {
          await diana.locator('#cobro-mixto-efectivo').fill(pesos(efectivoDelMixto));
          await diana
            .locator('#cobro-mixto-tarjeta')
            .fill(pesos(venta + propina - efectivoDelMixto));
        }
        await diana.getByRole('button', { name: /^COBRAR/ }).click();
        await expect(diana.getByText(/Se cobraron/)).toBeVisible({ timeout: 30_000 });
        const hecha = await exigirVentaCobrada(diana, venta, antes);
        cobros[referencia] = {
          ventaId: hecha.id ?? '',
          folio: hecha.folio ?? '',
          totalCentavos: venta,
        };
        const pagos: Record<string, number> =
          metodo === 'mixto'
            ? { efectivo: efectivoDelMixto, tarjeta: venta + propina - efectivoDelMixto }
            : { [metodo]: venta + propina };
        libro.cobro({
          referencia,
          ventaId: cobros[referencia].ventaId,
          sesionCajaId: sesionDiana,
          ventaCentavos: venta,
          pagos,
          ...(propina === 0
            ? {}
            : { propina: { [metodo === 'mixto' ? 'efectivo' : metodo]: propina } }),
        });
      };

      await test.step('con tarjeta y $10 de propina, por transferencia, y mixto', async () => {
        await cobrarConMetodo('bagel con tarjeta y propina', [PRODUCTO.bagel], 'tarjeta', 1_000);
        await cobrarConMetodo('galleta por transferencia', [PRODUCTO.galleta], 'transferencia', 0);
        await cobrarConMetodo('panini mixto', [PRODUCTO.panini], 'mixto', 0, 5_000);
      });

      await test.step('descuento dentro del tope y otro con el PIN de Fernanda', async () => {
        await irPorElMenu(diana, 'Cobrar', /Cobrar|Turno cerrado/);
        for (const [referencia, importe, autoriza] of [
          ['conchas con descuento de $3', 300, false],
          ['conchas con descuento autorizado', 2_000, true],
        ] as const) {
          const antes = await ventasDeAntes(diana);
          await tocar(diana, PRODUCTO.concha, 3);
          await diana.getByRole('button', { name: 'Aquí', exact: true }).click();
          const sinDescuento = await totalDelBoton(diana);
          await diana.getByRole('button', { name: 'Descuento', exact: true }).click();
          const dialogo = diana.getByRole('dialog', { name: 'Descuento' });
          await dialogo.locator('#descuento-importe').fill(pesos(importe));
          await dialogo.locator('#descuento-motivo').fill('cliente frecuente');
          if (autoriza) {
            await expect(dialogo.getByText(/Pasa de tu tope/)).toBeVisible();
            await dialogo
              .getByRole('group', { name: 'Quién autoriza' })
              .getByRole('button', { name: 'Fernanda' })
              .click();
            await dialogo.locator('#descuento-pin').fill('2345');
            await dialogo.getByRole('button', { name: 'Autorizar' }).click();
            await expect(dialogo.getByText('Autorizó Fernanda.')).toBeVisible();
          }
          await dialogo.getByRole('button', { name: 'Aplicar el descuento' }).click();
          await expect(dialogo).toBeHidden();
          const total = sinDescuento - importe;
          expect(await totalDelBoton(diana)).toBe(total);
          await diana.getByRole('button', { name: /^COBRAR/ }).click();
          await exigirCobroAceptado(diana, REPOSO);
          const venta = await exigirVentaCobrada(diana, total, antes);
          cobros[referencia] = {
            ventaId: venta.id ?? '',
            folio: venta.folio ?? '',
            totalCentavos: total,
          };
          libro.cobro({
            referencia,
            ventaId: cobros[referencia].ventaId,
            sesionCajaId: sesionDiana,
            ventaCentavos: total,
            pagos: { efectivo: total },
          });
        }
      });

      // ── LA BARRA DESPACHA ───────────────────────────────────────────────────
      const emilio = await equipo.pagina(info, 'cocina');
      fallos.push(vigilarFallos(emilio));
      await test.step('Emilio prepara y entrega el latte de Ana en la barra', async () => {
        await aSuCasa(emilio, /\/cafeteria\/barra/);
        await emilio.getByRole('button', { name: 'Marcar listo y llamar a Ana' }).first().click();
        await emilio
          .getByRole('button', { name: 'Marcar entregado el pedido de Ana' })
          .first()
          .click();
        await expect(
          emilio.getByRole('button', { name: 'Marcar entregado el pedido de Ana' }),
        ).toHaveCount(0);
      });

      // ── LA SEGUNDA CAJA VENDE ───────────────────────────────────────────────
      await test.step('Fernanda cobra en la segunda caja', async () => {
        await irPorElMenu(fernanda, 'Cobrar', /Cobrar|Turno cerrado/);
        cobros['segunda caja'] = await cobrarEnEfectivo(
          fernanda,
          'galletas de la segunda caja',
          sesionFernanda,
          [PRODUCTO.galleta, PRODUCTO.galleta],
        );
      });

      // ── FERNANDA EN LA TERMINAL DE DIANA: DEVOLUCIÓN, GASTO Y RETIRO ───────
      const fernandaEnBarra = await equipo.paginaEnLaTerminalDe(info, { rol: 'cajero' }, 'gerente');
      fallos.push(vigilarFallos(fernandaEnBarra));
      await test.step('Fernanda devuelve una venta completa y otra en parte, del cajón de Diana', async () => {
        await fernandaEnBarra.goto('/');
        await irPorElMenu(fernandaEnBarra, 'Turno', /Abierto desde/);
        await fernandaEnBarra.getByRole('tab', { name: 'Devoluciones' }).click();
        const devolucion = fernandaEnBarra.locator('[aria-labelledby="devolucion-titulo"]');

        await devolucion.locator('#devolucion-folio').fill(cobros['croissant']!.folio);
        await devolucion.getByRole('button', { name: 'Buscar la venta' }).click();
        await devolucion.getByRole('button', { name: /^Efectivo · hasta/ }).click();
        await devolucion.getByLabel(`Cuánto regresa de ${PRODUCTO.croissant}`).first().fill('1');
        await devolucion.locator('#devolucion-motivo').fill('se quemó por abajo');
        const sale = devolucion.locator('[aria-live="polite"]').filter({ hasText: 'Se devuelven' });
        const parcial = Math.round(
          Number(
            /\$([\d,]+\.\d{2})/.exec(await sale.innerText())?.[1]?.replace(/,/g, '') ?? 'NaN',
          ) * 100,
        );
        await devolucion.getByRole('button', { name: 'Devolver', exact: true }).click();
        await expect(devolucion.getByText(/devuelta en parte/)).toBeVisible({ timeout: 30_000 });
        libro.movimiento(sesionDiana, 'devolución de un croissant', -parcial);

        await devolucion
          .locator('#devolucion-folio')
          .fill(cobros['conchas con descuento de $3']!.folio);
        await devolucion.getByRole('button', { name: 'Buscar la venta' }).click();
        await devolucion.getByRole('button', { name: 'Devolver todo lo que queda' }).click();
        await devolucion.getByRole('button', { name: /^Efectivo · hasta/ }).click();
        await devolucion.locator('#devolucion-motivo').fill('pidió otra cosa');
        await devolucion.getByRole('button', { name: 'Devolver', exact: true }).click();
        await expect(devolucion.getByText(/devuelta completa/)).toBeVisible({ timeout: 30_000 });
        libro.movimiento(
          sesionDiana,
          'devolución completa de las conchas',
          -cobros['conchas con descuento de $3']!.totalCentavos,
        );
      });

      await test.step('Fernanda registra un gasto y un retiro en el turno de Diana', async () => {
        await fernandaEnBarra.getByRole('tab', { name: 'Gastos' }).click();
        await fernandaEnBarra.locator('#movimiento-monto').fill('120.00');
        await fernandaEnBarra.locator('#movimiento-motivo').fill('hielo para el frappé');
        await fernandaEnBarra.getByRole('button', { name: 'Registrar gasto' }).click();
        await expect(fernandaEnBarra.getByText('hielo para el frappé').first()).toBeVisible();
        libro.movimiento(sesionDiana, 'gasto: hielo', -12_000);

        await fernandaEnBarra.getByRole('tab', { name: 'Movimientos' }).click();
        await fernandaEnBarra.getByRole('button', { name: 'Retiro', exact: true }).click();
        await fernandaEnBarra.locator('#movimiento-monto').fill('300.00');
        await fernandaEnBarra.locator('#movimiento-motivo').fill('a la caja fuerte');
        await fernandaEnBarra.getByRole('button', { name: 'Registrar retiro' }).click();
        await expect(fernandaEnBarra.getByText('a la caja fuerte').first()).toBeVisible();
        libro.movimiento(sesionDiana, 'retiro a la caja fuerte', -30_000);
      });

      // ── EL ALMACÉN CUENTA LA LECHE ──────────────────────────────────────────
      const sergio = await equipo.pagina(info, 'almacen');
      fallos.push(vigilarFallos(sergio));
      await test.step('Sergio cuenta la leche, ve la diferencia y ajusta a lo contado', async () => {
        await sergio.goto('/');
        await irPorElMenu(sergio, 'Inventario', /Inventario|Contar leche/);
        await sergio.getByRole('button', { name: /Contar leche/ }).click();
        const conteo = sergio.getByRole('dialog', { name: 'Conteo de leche' });
        const campos = conteo.locator('input[id^="conteo-"]');
        const cuantos = await campos.count();
        for (let i = 0; i < cuantos; i += 1) await campos.nth(i).fill(String(i + 1));
        await conteo.getByRole('button', { name: 'Confirmar conteo' }).click();
        await expect(conteo.getByText('Falta en total')).toBeVisible({ timeout: 30_000 });
        await conteo.getByRole('button', { name: 'Ajustar a lo contado' }).click();
        await expect(conteo.getByText('Inventario ajustado a lo contado.')).toBeVisible({
          timeout: 30_000,
        });
        await conteo.getByRole('button', { name: 'Cerrar', exact: true }).click();
      });

      // ── ANTES DEL CIERRE · LA BARRA QUEDA LIMPIA ───────────────────────────
      // El cierre no deja entregar el turno con cafés pagados sin entregar: Emilio despacha
      // todo lo que quedó en la fila —listo y entregado, uno por uno— como al final del turno.
      await test.step('Emilio despacha todo lo que quedó en la barra', async () => {
        await aSuCasa(emilio, /\/cafeteria\/barra/);
        const listos = emilio.getByRole('button', { name: /^Marcar listo y llamar a / });
        const entregas = emilio.getByRole('button', { name: /^Marcar entregado el pedido de / });
        for (let vuelta = 0; vuelta < 40; vuelta += 1) {
          const porLlamar = await listos.count();
          const porEntregar = await entregas.count();
          if (porLlamar === 0 && porEntregar === 0) break;
          if (porEntregar > 0) {
            await entregas.first().click();
            await expect(entregas).toHaveCount(porEntregar - 1, { timeout: 15_000 });
          } else {
            await listos.first().click();
            await expect(entregas).toHaveCount(1, { timeout: 15_000 });
          }
        }
        await expect(listos).toHaveCount(0);
        await expect(entregas).toHaveCount(0);
      });

      // ── 14:30 · DIANA ENTREGA SU TURNO CON FALTANTE ─────────────────────────
      await test.step('Diana cierra su turno a ciegas: faltan $10', async () => {
        const esperado = await esperadoDelCajon(diana);
        await diana.goto('/');
        await irPorElMenu(diana, 'Cierre de turno', /CERRAR TURNO|Cajón/);
        await diana.locator('#cierre-efectivo').fill(pesos(esperado - 1_000));
        await diana.locator('#cierre-bote').fill('0');
        await diana.locator('#cierre-dejado').fill('0');
        await diana.getByRole('button', { name: 'CERRAR TURNO' }).click();
        // El semáforo del arqueo dice la palabra; $10 cae en la tolerancia: «falta poco».
        await expect(diana.getByText('falta poco', { exact: true })).toBeVisible({
          timeout: 30_000,
        });
        // Y el corte es el de SU caja, no el de la otra caja abierta (el defecto de las dos cajas).
        await expect(diana.getByRole('main').getByText(/^Diana · corte /)).toBeVisible();
        libro.contar(sesionDiana, esperado - 1_000);
      });

      // ── 20:30 · FERNANDA CIERRA LA SEGUNDA CAJA CON SOBRANTE ────────────────
      await test.step('Fernanda cierra su caja a ciegas: sobran $20', async () => {
        const esperado = await esperadoDelCajon(fernanda);
        await irPorElMenu(fernanda, 'Cierre de turno', /CERRAR TURNO|Cajón/);
        await fernanda.locator('#cierre-efectivo').fill(pesos(esperado + 2_000));
        await fernanda.locator('#cierre-bote').fill('0');
        await fernanda.locator('#cierre-dejado').fill('0');
        await fernanda.getByRole('button', { name: 'CERRAR TURNO' }).click();
        await expect(fernanda.getByText('sobra poco', { exact: true })).toBeVisible({
          timeout: 30_000,
        });
        await expect(fernanda.getByRole('main').getByText(/^Fernanda · corte /)).toBeVisible();
        libro.contar(sesionFernanda, esperado + 2_000);
      });

      // ── 21:00 · LA DUEÑA LEE, Y EL DINERO CUADRA ────────────────────────────
      await test.step('el dinero de las dos cajas cuadra al centavo, y un centavo de más NO', async () => {
        const conciliacion = await exigirQueCuadre(duena, libro, LECTURAS);
        expect(conciliacion.resumen.cobradoCentavos).toBeGreaterThan(0n);
        const servidor = await leerElServidor(duena, LECTURAS, libro.movimientosPrevios);
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
      for (const page of conCaja) {
        info.annotations.push({ type: 'caja', description: await soltarLaCaja(page) });
      }
      await equipo.cerrar();
    }
  });
});
