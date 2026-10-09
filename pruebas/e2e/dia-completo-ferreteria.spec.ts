import { expect, type Locator, type Page, test } from '@playwright/test';

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
import { Equipo, personaDe } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  consultarPuente,
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
 * EL DÍA COMPLETO DE LA FERRETERÍA (D.1 de la 2.4) · `ferreteria/00-FICHA-Y-EJES §3`.
 *
 * Un martes de Ferretería La Broca, operado por QUIEN lo opera —Karla en el mostrador y en
 * la caja, Elena cuando hace falta autorizar, devolver, pagar un gasto o cerrar, Rubén en la
 * bodega, y el dueño que da de alta al contratista y lee el corte—, llegando a cada pantalla
 * POR EL MENÚ de su rol. Cada cosa que mueve dinero o mercancía se anota en el `Libro`, y al
 * final el dinero tiene que cuadrar AL CENTAVO contra el servidor (`conciliarElDia`), o la
 * prueba dice exactamente dónde no.
 *
 * El día empieza con un reseteo de la demo: todo lo que el servidor tenga después es de este
 * día, y una venta o una caja que la prueba no hizo es un hallazgo, no ruido.
 *
 * ── El modo B (`02-DINERO-Y-CAJA §8.1`) ───────────────────────────────────────
 * El mostrador NO cobra: arma la NOTA y la manda a caja con su folio (`N-…`); la caja la
 * busca por ese folio y la cobra. Son dos pantallas —«Mostrador» y «Caja»— y cada venta de
 * este día pasa por las dos. La demo tiene UNA mostradorista (su rol es `cajero`,
 * `equipo-demo.ts`), así que Karla arma y cobra en la misma PC; lo que se prueba es que la
 * venta cruza el documento intermedio, no que haya dos sillas.
 *
 * ── Dispositivos ──────────────────────────────────────────────────────────────
 * La PC del mostrador es UNA terminal, la del cajón. Elena no trae la suya: entra con su
 * PIN en esa misma PC (`paginaEnLaTerminalDe`), porque la devolución en efectivo y el gasto
 * salen del cajón de la terminal que lo tiene. Rubén trabaja en la PC de la bodega y el
 * dueño, en su teléfono.
 *
 * ── Lo que este día encontró, y ya está (bloque D de la 2.4) ─────────────────
 * Se escribió como DEBÍA funcionar y se puso rojo en seis sitios: el descuento del pasillo
 * (`DescuentoDeVenta` en el mostrador, aplicado a la nota con `descontarLaOrden`), la nota
 * que se cancela (`nota_mostrador.cancelar`), la cotización que se convierte en venta
 * (`cotizacion.convertir_en_nota`), la entrada y el conteo del almacén (sus roles), y la
 * remisión que es venta del día y saca el material (181). El cierre, además, ya no deja
 * pasar una nota mandada y sin cobrar (`02-DINERO-Y-CAJA §8.5.1`).
 */

const SLUG = 'demo-acople-ferreteria';

/** $2,500 con billetes chicos: el albañil de las 7:40 paga con uno de $500 (ficha §3, 07:30). */
const FONDO = { monedas: 50_000, chicos: 150_000, grandes: 50_000 } as const;
const FONDO_CENTAVOS = FONDO.monedas + FONDO.chicos + FONDO.grandes;

/** Los materiales de la semilla (`demostracion/datos.ts`), con su nombre exacto. */
const MATERIAL = {
  martillo: 'Martillo uña pulida 16 oz',
  cinta: 'Cinta métrica 5 m',
  taladro: 'Taladro percutor Truper 1/2 pulgada',
  brocas: 'Juego de brocas para concreto 5 piezas',
  esmeriladora: 'Esmeriladora angular 4 1/2 pulgadas',
  aislar: 'Cinta de aislar 18 m',
  pintura: 'Pintura vinílica blanca 19 L',
  pinza: 'Pinza de electricista 8 pulgadas',
  rotomartillo: 'Rotomartillo SDS 800 W',
  brocha: 'Brocha profesional 3 pulgadas',
  thinner: 'Thinner estándar 1 L',
  llave: 'Llave ajustable 10 pulgadas',
  desarmador: 'Desarmador de cruz 6 pulgadas',
  cable: 'Cable THW calibre 12 por metro',
  tornillo: 'Tornillo galvanizado 1/4 × 2 pulgadas',
} as const;

/** El corte de la 13:30, y lo que la segueta se lleva: la merma típica de la semilla. */
const MEDIDA_DEL_CORTE = 6;
const MERMA_DEL_CABLE = 0.2;

/** La tornillería se cuenta pesándola: una muestra de 20 piezas pesa 200 g (10 g cada una). */
const MUESTRA = { gramos: 200, piezas: 20 } as const;
const GRAMOS_POR_PIEZA = MUESTRA.gramos / MUESTRA.piezas;
const FALTAN_AL_CONTAR = 5;

/** Lo que cada pantalla enseña al abrir (`ferreteria.spec.ts`, PANTALLAS). */
const MARCA = {
  mostrador: /Buscar material|La nota/,
  caja: /Notas pendientes|La caja está al día/,
  fondo: /Fondo con el que abres|Lo que debería haber/,
  cortes: /Cortes anteriores|Cuenta el cajón|No hay turno abierto/,
  cuentas: /Todavía no le das crédito|Lo que me deben/,
  entradas: /Recepción y pedido/,
  existencias: /Qué hay, qué está dormido/,
} as const;

/** Quien autoriza lo que pasa del tope de Karla: la encargada, con su PIN. */
const ENCARGADA = personaDe(SLUG, 'gerente');

const pesos = (centavos: number): string => (centavos / 100).toFixed(2);

/** Un nombre del catálogo, usable dentro de una expresión regular. */
function comoTexto(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Una cantidad como la escribe el dominio: cuatro decimales sin ceros de cola. */
function comoCantidad(valor: number): string {
  return valor.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

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

/** Abre `/` y espera a caer en SU casa: la primera entrada de su menú (`inicioDeLaSesion`). */
async function aSuCasa(page: Page, casa: RegExp): Promise<void> {
  await page.goto('/');
  await page.waitForURL(casa);
}

/** Lo que el índice del mostrador sirve de cada material. */
interface MaterialDelPuente {
  readonly nombre?: string;
  readonly precioCentavos?: number;
  readonly existencia?: number;
}

type Precios = ReadonlyMap<string, number>;

/** Un renglón de la nota: el material y cuántas veces se toca su resultado. */
type Partida = readonly [nombre: string, veces: number];

async function indiceDelMostrador(page: Page): Promise<readonly MaterialDelPuente[]> {
  return consultarPuente<MaterialDelPuente>(page, 'MaterialMostrador', { limite: 200 });
}

/** El precio de cada material, del MISMO índice que lee el mostrador (`materiales_mostrador`). */
async function preciosDelMostrador(page: Page): Promise<Precios> {
  const materiales = await indiceDelMostrador(page);
  return new Map(
    materiales
      .filter((m) => (m.nombre ?? '') !== '')
      .map((m) => [m.nombre ?? '', m.precioCentavos ?? Number.NaN]),
  );
}

/** La existencia de un material como la lee el mostradorista: en unidades de venta. */
async function existenciaEnElMostrador(page: Page, nombre: string): Promise<number> {
  const material = (await indiceDelMostrador(page)).find((m) => m.nombre === nombre);
  expect(material, `El índice del mostrador no tiene «${nombre}».`).toBeDefined();
  return material?.existencia ?? Number.NaN;
}

/** Lo que la nota tiene que costar: precio de lista por cantidad, al centavo. */
function totalDe(precios: Precios, partidas: readonly Partida[]): number {
  return partidas.reduce((suma, [nombre, veces]) => {
    const precio = precios.get(nombre);
    expect(precio, `El índice del mostrador no tiene «${nombre}».`).toBeDefined();
    return suma + Math.round((precio ?? Number.NaN) * veces);
  }, 0);
}

/** La venta se arma en la PC con tabla y en el pasillo con tarjetas (`TablaAdaptable`, xl). */
const enPc = (page: Page): boolean => (page.viewportSize()?.width ?? 0) >= 1280;

/** El resultado de una búsqueda: fila de la tabla en la PC, tarjeta en la tableta. */
function resultadoDe(page: Page, nombre: string): Locator {
  const nombreExacto = new RegExp(comoTexto(nombre));
  return enPc(page)
    ? page.getByRole('table', { name: 'Resultados' }).getByRole('row', { name: nombreExacto })
    : page.getByRole('listitem').getByRole('button', { name: nombreExacto });
}

/** Busca por su nombre y toca el resultado: cada toque es una pieza más. */
async function agregar(page: Page, nombre: string, veces = 1): Promise<void> {
  await page.locator('#buscador').fill(nombre);
  const resultado = resultadoDe(page, nombre).first();
  await expect(
    resultado,
    `El mostrador no encontró «${nombre}» buscándolo por nombre.`,
  ).toBeVisible();
  for (let i = 0; i < veces; i += 1) await resultado.click();
}

/**
 * «La nota», desplegada. En la PC es un `aside` fijo; por debajo de 1280 px se pliega en una
 * barra (`aria-controls="la-venta"`) que la abre encima de los resultados.
 */
async function laNota(page: Page): Promise<Locator> {
  const nota = page.getByRole('complementary', { name: 'La nota' });
  if (!enPc(page) && !(await nota.isVisible())) {
    await page.locator('button[aria-controls="la-venta"]').click();
  }
  await expect(nota).toBeVisible();
  return nota;
}

/** Arma la nota partida por partida y comprueba que cada una llegó. */
async function armarNota(page: Page, partidas: readonly Partida[]): Promise<Locator> {
  for (const [nombre, veces] of partidas) await agregar(page, nombre, veces);
  const nota = await laNota(page);
  for (const [nombre] of partidas) {
    await expect(
      nota.getByText(nombre, { exact: false }).first(),
      `«${nombre}» no llegó a la nota.`,
    ).toBeVisible();
  }
  return nota;
}

/**
 * En la tableta la nota abierta tapa el pie de la pantalla y su barra queda debajo: no hay
 * con qué plegarla. Recargar la pliega; la nota vive en la pestaña y ya va vacía.
 */
async function plegarLaNota(page: Page): Promise<void> {
  if (!enPc(page)) await page.reload();
}

/** El folio `N-…` que enseña el aviso de «está en la caja», o '' si no hay aviso. */
async function folioDelAviso(aviso: Locator): Promise<string> {
  if ((await aviso.count()) === 0) return '';
  return /N-\d+/.exec((await aviso.first().textContent()) ?? '')?.[0] ?? '';
}

/**
 * MANDAR A CAJA · el folio `N-…` es lo único que el cliente se lleva del pasillo.
 *
 * Se espera un folio DISTINTO del que ya estaba a la vista: tocar «Mostrador» estando en el
 * mostrador no lo vuelve a montar, y el aviso de la nota anterior seguiría ahí.
 */
async function mandarACaja(page: Page, nota: Locator): Promise<string> {
  const aviso = page.getByRole('status').filter({ hasText: /está en la caja/ });
  const previo = await folioDelAviso(aviso);
  await nota.getByRole('button', { name: /^Mandar a caja/ }).click();
  let folio = '';
  await expect
    .poll(
      async () => {
        folio = await folioDelAviso(aviso);
        return folio !== '' && folio !== previo;
      },
      {
        message:
          'La nota no llegó a la caja con su folio: `ferreteria.crear_nota_mostrador` la ' +
          'rechazó o la pantalla publicó en otra ruta.',
        timeout: 30_000,
      },
    )
    .toBe(true);
  await plegarLaNota(page);
  return folio;
}

/** La caja busca la nota por su folio y la abre en su panel. */
async function elegirEnCaja(page: Page, folio: string): Promise<void> {
  const exacto = new RegExp(`${comoTexto(folio)}(?![0-9])`);
  const enLaCola = page
    .getByRole('region', { name: 'Notas pendientes' })
    .getByRole('button', { name: exacto })
    .first();
  await expect(enLaCola, `La nota ${folio} no está en las pendientes de la caja.`).toBeVisible({
    timeout: 30_000,
  });
  await enLaCola.click();
  await expect(
    page.getByRole('heading', { level: 2, name: new RegExp(`^Nota ${comoTexto(folio)}$`) }),
  ).toBeVisible();
}

type FormaDeCobro =
  | { readonly metodo: 'efectivo'; readonly recibido?: number }
  | { readonly metodo: 'tarjeta' }
  | { readonly metodo: 'transferencia' }
  | {
      readonly metodo: 'mixto';
      readonly efectivo: number;
      readonly resto: 'tarjeta' | 'transferencia';
    };

interface CobroHecho {
  readonly ventaId: string;
  /** El folio del TICKET: el que la devolución busca. */
  readonly folio: string;
  /** El folio de la NOTA: el que el cliente canta en la caja. */
  readonly nota: string;
  readonly totalCentavos: number;
  readonly pagos: Readonly<Record<string, number>>;
}

/** Toca el método en el panel de la nota y devuelve lo que entró por cada uno. */
async function tocarElMetodo(
  page: Page,
  total: number,
  forma: FormaDeCobro,
): Promise<Readonly<Record<string, number>>> {
  if (forma.metodo === 'tarjeta') {
    await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
    return { tarjeta: total };
  }
  if (forma.metodo === 'transferencia') {
    await page.getByRole('button', { name: 'Transferencia', exact: true }).click();
    return { transferencia: total };
  }
  if (forma.metodo === 'mixto') {
    await page.getByRole('button', { name: 'Pago mixto' }).click();
    await page.locator('#caja-mixto-efectivo').fill(pesos(forma.efectivo));
    await page.locator(`#caja-mixto-${forma.resto}`).fill(pesos(total - forma.efectivo));
    await expect(page.getByText('Cuadra con el total de la nota.')).toBeVisible();
    await page.getByRole('button', { name: 'Cobrar mixto' }).click();
    return { efectivo: forma.efectivo, [forma.resto]: total - forma.efectivo };
  }
  await page.getByRole('button', { name: 'Efectivo', exact: true }).click();
  if (forma.recibido === undefined) {
    await page.getByRole('button', { name: 'Exacto' }).click();
  } else {
    await page.locator('#caja-recibido').fill(pesos(forma.recibido));
    await expect(page.getByText('Cambio', { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Cobrar en efectivo' }).click();
  // Lo que se queda en el cajón es la venta: el cambio salió con el cliente.
  return { efectivo: total };
}

/**
 * LA CAJA COBRA LA NOTA, y se exige contra el servidor: una venta NUEVA, con folio, por el
 * total que la caja dijo en voz alta —y ése tiene que ser el precio de lista de lo armado—.
 */
async function cobrarEnCaja(
  page: Page,
  nota: string,
  forma: FormaDeCobro,
  antes: ReadonlySet<string>,
  totalEsperado: number,
): Promise<CobroHecho> {
  await irPorElMenu(page, 'Caja', MARCA.caja);
  await elegirEnCaja(page, nota);
  const total = await totalEnPantalla(page);
  expect(total, `La caja cobra la nota ${nota} por otro total que lo armado.`).toBe(totalEsperado);
  const pagos = await tocarElMetodo(page, total, forma);
  await exigirCobroAceptado(page, new RegExp(`${comoTexto(nota)} cobrada`));
  if (forma.metodo === 'efectivo' && forma.recibido !== undefined && forma.recibido > total) {
    await expect(
      page.getByRole('status').filter({ hasText: /cobrada/ }),
      'El acuse del cobro no dice el cambio que se le dio al cliente.',
    ).toContainText(/Cambio:/);
  }
  const venta = await exigirVentaCobrada(page, total, antes);
  // El folio del TICKET en el acuse: es el que se pide para devolver, y no el de la nota.
  const numero = /(\d+)$/.exec(venta.folio ?? '')?.[1] ?? 'sin-folio';
  await expect(
    page.getByRole('status').filter({ hasText: /cobrada/ }),
    'El acuse del cobro no dice el folio del ticket que la devolución va a pedir.',
  ).toContainText(new RegExp(`Ticket (?:[A-Z]+-)?${numero}:`));
  return { ventaId: venta.id ?? '', folio: venta.folio ?? '', nota, totalCentavos: total, pagos };
}

/** Las dos pantallas del modo B, de punta a punta: se arma, se manda y se cobra. */
async function venderPorLasDosPantallas(
  page: Page,
  precios: Precios,
  partidas: readonly Partida[],
  forma: FormaDeCobro,
): Promise<CobroHecho> {
  await irPorElMenu(page, 'Mostrador', MARCA.mostrador);
  // ANTES de armar: la nota crea su orden al mandarse, y la venta nueva tiene que ser ésa.
  const antes = await ventasDeAntes(page);
  const nota = await armarNota(page, partidas);
  const folio = await mandarACaja(page, nota);
  return cobrarEnCaja(page, folio, forma, antes, totalDe(precios, partidas));
}

function anotarCobro(libro: Libro, sesion: string, referencia: string, cobro: CobroHecho): void {
  libro.cobro({
    referencia,
    ventaId: cobro.ventaId,
    sesionCajaId: sesion,
    ventaCentavos: cobro.totalCentavos,
    pagos: cobro.pagos,
  });
}

/**
 * EL DESCUENTO EN LA NOTA, con la pieza compartida `DescuentoDeVenta` (F-205, `02 §3`: el
 * mostradorista negocia con tope; arriba, PIN del encargado).
 *
 * El botón «Descuento» de la nota abre el diálogo del mismo nombre, como en
 * `abarrotes/Cobrar.tsx`; lo de dentro son los ids de `venta/DescuentoDeVenta.tsx`.
 */
async function descontarEnLaNota(
  page: Page,
  nota: Locator,
  descuento: {
    readonly centavos: number;
    readonly motivo: string;
    readonly autoriza?: { readonly nombre: string; readonly pin: string };
  },
): Promise<void> {
  await nota.getByRole('button', { name: 'Descuento', exact: true }).click();
  const dialogo = page.getByRole('dialog', { name: 'Descuento' });
  await dialogo.locator('#descuento-importe').fill(pesos(descuento.centavos));
  await dialogo.locator('#descuento-motivo').fill(descuento.motivo);
  if (descuento.autoriza === undefined) {
    await expect(dialogo.getByText(/Pasa de tu tope/)).toHaveCount(0);
  } else {
    await expect(dialogo.getByText(/Pasa de tu tope/)).toBeVisible();
    await expect(dialogo.getByRole('button', { name: 'Aplicar el descuento' })).toBeDisabled();
    await dialogo
      .getByRole('group', { name: 'Quién autoriza' })
      .getByRole('button', { name: descuento.autoriza.nombre })
      .click();
    await dialogo.locator('#descuento-pin').fill(descuento.autoriza.pin);
    await dialogo.getByRole('button', { name: 'Autorizar' }).click();
    await expect(dialogo.getByText(`Autorizó ${descuento.autoriza.nombre}.`)).toBeVisible();
  }
  await dialogo.getByRole('button', { name: 'Aplicar el descuento' }).click();
  await expect(dialogo).toBeHidden();
}

test.describe('el día completo de la ferretería', () => {
  // Cada acción con su techo: sin él, un clic sobre algo que no aparece espera hasta el
  // límite de la prueba entera y el informe dice «se acabó el tiempo» en vez de «no estaba».
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('un martes de Ferretería La Broca, cuadrado al centavo', async ({ browser }, info) => {
    test.setTimeout(25 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const libro = new Libro();
    const fallos: (() => void)[] = [];
    let mostrador: Page | null = null;
    const sello = String(Date.now()).slice(-6);
    const INGENIERO = `Ing. Loera ${sello}`;

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

      // Lo que se vigila del inventario: lo que se vende y se devuelve, lo que entra, lo que
      // sale firmado y lo que se corta. Las entradas iniciales del reseteo no son de este libro.
      libro.empezarInventario(await movimientosDeInventarioPrevios(dueno));
      for (const nombre of [MATERIAL.martillo, MATERIAL.aislar, MATERIAL.pintura, MATERIAL.cable]) {
        libro.existenciaAntes(nombre, await existenciaDe(dueno, nombre));
      }
      const pinturaAntes = await existenciaDe(dueno, MATERIAL.pintura);

      await test.step('el dueño da de alta al ingeniero Loera, con su límite de crédito', async () => {
        // El límite lo fija sólo el dueño o el administrador (`credito.fijar_limite`), y el
        // reseteo borra los clientes: el contratista nace hoy.
        await dueno.goto('/');
        await irPorElMenu(dueno, 'Cuentas', MARCA.cuentas);
        await dueno.getByRole('button', { name: 'Cliente nuevo' }).click();
        await dueno.locator('#cliente-nuevo-nombre').fill(INGENIERO);
        await dueno.locator('#cliente-nuevo-telefono').fill(`771${sello}0`);
        await dueno.locator('#cliente-nuevo-limite').fill('20000.00');
        await dueno.getByRole('button', { name: 'Dar de alta' }).click();
        await expect(dueno.getByText(`${INGENIERO} quedó dado de alta`)).toBeVisible({
          timeout: 30_000,
        });
      });

      // ── 07:30 · ABRE LA CAJA CON SU FONDO Y SU DESGLOSE ─────────────────────
      mostrador = await equipo.pagina(info, 'cajero');
      const karla = mostrador;
      fallos.push(vigilarFallos(karla));
      const precios = await preciosDelMostrador(karla);
      let sesion = '';
      await test.step('Karla abre la caja con $2,500, con billetes chicos', async () => {
        await aSuCasa(karla, /\/ferreteria\/mostrador/);
        await irPorElMenu(karla, 'Fondo y movimientos', MARCA.fondo);
        await karla.locator('#fondo-monedas').fill(pesos(FONDO.monedas));
        await karla.locator('#fondo-chicos').fill(pesos(FONDO.chicos));
        await karla.locator('#fondo-grandes').fill(pesos(FONDO.grandes));
        await karla.getByRole('button', { name: 'Abrir caja' }).click();
        await expect(karla.getByText('Lo que debería haber')).toBeVisible({ timeout: 30_000 });
        await expect(karla.getByText(/\$NaN/)).toHaveCount(0);
        sesion = (await sesionDeLaCaja(karla)) ?? '';
        expect(sesion, 'La caja dice abierta y el servidor no tiene su sesión.').not.toBe('');
        libro.abrirCaja('caja del mostrador', sesion, FONDO_CENTAVOS);
        expect(await esperadoDelCajon(karla)).toBe(FONDO_CENTAVOS);
      });

      // ── 07:40–09:30 · PICO 1, LOS QUE VAN A LA OBRA ─────────────────────────
      const cobros: Record<string, CobroHecho> = {};
      await test.step('ventas de contado: efectivo con billete de $500, tarjeta y transferencia', async () => {
        cobros['efectivo'] = await venderPorLasDosPantallas(
          karla,
          precios,
          [
            [MATERIAL.martillo, 1],
            [MATERIAL.cinta, 1],
          ],
          { metodo: 'efectivo', recibido: 50_000 },
        );
        anotarCobro(libro, sesion, 'martillo y cinta, en efectivo con $500', cobros['efectivo']);

        cobros['tarjeta'] = await venderPorLasDosPantallas(
          karla,
          precios,
          [[MATERIAL.taladro, 1]],
          { metodo: 'tarjeta' },
        );
        anotarCobro(libro, sesion, 'taladro con tarjeta', cobros['tarjeta']);

        cobros['transferencia'] = await venderPorLasDosPantallas(
          karla,
          precios,
          [[MATERIAL.brocas, 1]],
          { metodo: 'transferencia' },
        );
        anotarCobro(libro, sesion, 'brocas por transferencia', cobros['transferencia']);
      });

      await test.step('pago MIXTO: $500 en efectivo y el resto con tarjeta', async () => {
        cobros['mixto'] = await venderPorLasDosPantallas(
          karla,
          precios,
          [
            [MATERIAL.esmeriladora, 1],
            [MATERIAL.aislar, 2],
          ],
          { metodo: 'mixto', efectivo: 50_000, resto: 'tarjeta' },
        );
        anotarCobro(libro, sesion, 'esmeriladora y cinta de aislar, mixto', cobros['mixto']);
      });

      // La remisión: venta del día que NO entra al cajón (`02 §1`, `§6.3`).
      let credito = { ventaId: '', totalCentavos: 0 };
      await test.step('el ingeniero se lleva pintura a su cuenta: remisión firmada, sin dinero', async () => {
        await irPorElMenu(karla, 'Mostrador', MARCA.mostrador);
        const antes = await ventasDeAntes(karla);
        await karla.getByRole('button', { name: 'A cuenta de…' }).click();
        await karla.locator('#buscar-cliente').fill(INGENIERO);
        await karla.getByRole('button', { name: `A cuenta de ${INGENIERO}` }).click();
        await karla.locator('#recoge-a-mano').fill('Martín Pérez');
        await karla.getByRole('button', { name: `A cuenta de ${INGENIERO}` }).click();
        await expect(
          karla.getByRole('region', { name: /y obra/ }).getByText(INGENIERO),
          'El mostrador no se quedó con el contratista elegido.',
        ).toBeVisible();
        const partidas: readonly Partida[] = [[MATERIAL.pintura, 2]];
        const nota = await armarNota(karla, partidas);
        await nota.getByRole('button', { name: /^Remisión a cuenta/ }).click();
        await expect(
          nota.getByText('Todavía nada.'),
          'La remisión no salió: `credito.registrar_remision` la rechazó (¿mora, límite?).',
        ).toBeVisible({ timeout: 30_000 });
        const total = totalDe(precios, partidas);
        // Es venta del día con método `credito` (`02 §1`, «Material entregado con remisión
        // firmada»): con folio de ticket, como cualquier venta. No suma un peso al cajón.
        const venta = await exigirVentaCobrada(karla, total, antes);
        credito = { ventaId: venta.id ?? '', totalCentavos: total };
        // Y el material salió: el almacén lo sabe (`02 §6.3`, «baja el stock»).
        await expect
          .poll(async () => existenciaDe(dueno, MATERIAL.pintura), {
            message: 'La remisión a crédito no bajó la existencia de la pintura que salió.',
            timeout: 20_000,
          })
          .toBe(pinturaAntes - 2);
        libro.cobro({
          referencia: 'pintura a cuenta del ingeniero (remisión)',
          ventaId: credito.ventaId,
          sesionCajaId: sesion,
          ventaCentavos: total,
          pagos: { credito: total },
        });
        if (enPc(karla)) await karla.getByRole('button', { name: 'Público', exact: true }).click();
        await plegarLaNota(karla);
      });

      // ── 09:30 · LLEGA EL CAMIÓN DEL PROVEEDOR ───────────────────────────────
      const ruben = await equipo.pagina(info, 'almacen');
      fallos.push(vigilarFallos(ruben));
      const folioDelProveedor = `FV-${sello}`;
      await test.step('Rubén recibe la nota del proveedor a crédito, desde su archivo', async () => {
        await aSuCasa(ruben, /\/ferreteria\//);
        await irPorElMenu(ruben, 'Entradas', MARCA.entradas);
        // A crédito: no toca la caja (`02 §8.3`, «Pago a proveedor de una factura a crédito»).
        await expect(
          ruben
            .getByRole('group', { name: 'Forma de pago' })
            .getByRole('button', { name: 'Crédito' }),
        ).toHaveAttribute('aria-pressed', 'true');
        await ruben.locator('#folio').fill(folioDelProveedor);
        await ruben.getByRole('button', { name: /Importar archivo/ }).click();
        await ruben.locator('#archivo-de-la-nota').setInputFiles({
          name: `${folioDelProveedor}.csv`,
          mimeType: 'text/csv',
          // Como lo guarda el Excel en español: punto y coma y coma decimal.
          buffer: Buffer.from(
            'Clave;Descripción;Cantidad;Costo unitario\n' +
              `MART-16;${MATERIAL.martillo};12;95,50\n`,
            'utf8',
          ),
        });
        // El almacén importa el archivo: es quien recibe la nota (`compras.importar_nota`).
        await expect(
          ruben.getByText(/casó por nombre/).first(),
          'El martillo del archivo no entró como partida casada por nombre.',
        ).toBeVisible({ timeout: 30_000 });
        await ruben.getByRole('button', { name: 'Guardar entrada' }).click();
        await expect(ruben.getByText('Todavía no hay ninguna nota en captura.')).toBeVisible({
          timeout: 30_000,
        });
        const [compra] = await consultarPuente<{ readonly total_compra?: number }>(
          ruben,
          'CompraInsumo',
          { filtro: { factura_folio: folioDelProveedor }, limite: 1 },
        );
        // 12 × $95.50, al centavo.
        expect(compra?.total_compra, 'La entrada no quedó como compra por su importe.').toBe(1146);
      });

      // ── 10:00–13:30 · EL VALLE DE ASESORÍA ──────────────────────────────────
      await test.step('descuento dentro del tope de Karla: se aplica sin PIN', async () => {
        await irPorElMenu(karla, 'Mostrador', MARCA.mostrador);
        const antes = await ventasDeAntes(karla);
        const partidas: readonly Partida[] = [[MATERIAL.pinza, 2]];
        const nota = await armarNota(karla, partidas);
        await descontarEnLaNota(karla, nota, {
          centavos: 2_000,
          motivo: 'el electricista se lleva dos',
        });
        const folio = await mandarACaja(karla, nota);
        cobros['descuento'] = await cobrarEnCaja(
          karla,
          folio,
          { metodo: 'efectivo' },
          antes,
          totalDe(precios, partidas) - 2_000,
        );
        anotarCobro(libro, sesion, 'dos pinzas con $20 de descuento', cobros['descuento']);
      });

      await test.step('descuento SOBRE el tope: lo autoriza Elena con su PIN, en la terminal de Karla', async () => {
        await irPorElMenu(karla, 'Mostrador', MARCA.mostrador);
        const antes = await ventasDeAntes(karla);
        const partidas: readonly Partida[] = [[MATERIAL.rotomartillo, 1]];
        const nota = await armarNota(karla, partidas);
        // El tope del cajero es $50 o el 10 % (`como-nueva.ts`): $150 pasa.
        await descontarEnLaNota(karla, nota, {
          centavos: 15_000,
          motivo: 'el contratista paga de contado',
          autoriza: { nombre: ENCARGADA.nombre, pin: ENCARGADA.pin },
        });
        const folio = await mandarACaja(karla, nota);
        cobros['autorizado'] = await cobrarEnCaja(
          karla,
          folio,
          { metodo: 'efectivo' },
          antes,
          totalDe(precios, partidas) - 15_000,
        );
        anotarCobro(libro, sesion, 'rotomartillo con descuento autorizado', cobros['autorizado']);
      });

      // ── 12:00 · LA COTIZACIÓN, Y EL DÍA QUE VUELVE A COMPRAR ────────────────
      await test.step('la cotización se manda, se gana y se convierte en venta', async () => {
        await irPorElMenu(karla, 'Mostrador', MARCA.mostrador);
        const antes = await ventasDeAntes(karla);
        const partidas: readonly Partida[] = [
          [MATERIAL.brocha, 2],
          [MATERIAL.thinner, 1],
        ];
        const nota = await armarNota(karla, partidas);
        await nota.getByRole('button', { name: /^Cotizar · F8/ }).click();
        await expect(karla, 'F8 no llevó la nota a la cotización.').toHaveURL(
          /\/ferreteria\/cotizacion$/,
          { timeout: 30_000 },
        );
        const cotizadas = karla.getByRole('table', { name: /de la cotización/ });
        for (const [nombre] of partidas) {
          await expect(cotizadas.getByText(nombre, { exact: false }).first()).toBeVisible({
            timeout: 30_000,
          });
        }
        await karla
          .getByRole('group', { name: 'Vigencia de la cotización' })
          .getByRole('button', { name: '15 días' })
          .click();
        await karla.getByRole('button', { name: 'Mandar por WhatsApp' }).click();
        await expect(karla.getByText(/^Cotización \S+ mandada\.$/)).toBeVisible({
          timeout: 30_000,
        });
        await karla.getByRole('button', { name: 'Marcar ganada' }).click();
        await expect(karla.getByText(/marcada como ganada\.$/)).toBeVisible({ timeout: 30_000 });
        // Convertir abre la nota con los precios cotizados y gana la cotización, y dice el
        // folio como el mostrador (`cotizacion.convertir_en_nota`).
        await karla.getByRole('button', { name: 'Convertir en venta o pedido' }).click();
        const enCaja = karla.getByRole('status').filter({ hasText: /está en la caja/ });
        await expect(
          enCaja,
          'Convertir la cotización ganada no abrió ninguna nota en la caja.',
        ).toBeVisible({ timeout: 30_000 });
        const folio = /N-\d+/.exec(await enCaja.innerText())?.[0] ?? '';
        expect(folio).not.toBe('');
        cobros['cotizacion'] = await cobrarEnCaja(
          karla,
          folio,
          { metodo: 'transferencia' },
          antes,
          totalDe(precios, partidas),
        );
        anotarCobro(
          libro,
          sesion,
          'cotización convertida, por transferencia',
          cobros['cotizacion'],
        );
      });

      // ── 13:30 · EL CORTE DE MATERIAL ────────────────────────────────────────
      await test.step('Karla corta 6 m de cable de un rollo abierto, y la caja cobra la nota del corte', async () => {
        await irPorElMenu(karla, 'Mostrador', MARCA.mostrador);
        const antes = await ventasDeAntes(karla);
        const cableAntes = await existenciaEnElMostrador(karla, MATERIAL.cable);
        await karla.locator('#buscador').fill(MATERIAL.cable);
        await expect(resultadoDe(karla, MATERIAL.cable).first()).toBeVisible();
        // F6 abre el corte de la pieza que se está viendo: es el camino del mostradorista.
        // «Corte de material» no está en su menú (permiso `ver_inventario`).
        await karla.keyboard.press('F6');
        await expect(karla, 'F6 no llevó al corte del cable buscado.').toHaveURL(
          /\/ferreteria\/corte-de-material\?material=[0-9a-f-]{36}/,
          { timeout: 30_000 },
        );
        await expect(
          karla.getByRole('heading', { level: 1, name: /^Cortar · Cable THW/ }),
        ).toBeVisible({
          timeout: 30_000,
        });

        // El rollo que alcanza: el sugerido se va vaciando corrida tras corrida.
        const necesita = MEDIDA_DEL_CORTE + MERMA_DEL_CABLE;
        const etiquetas = await karla
          .getByRole('region', { name: 'De dónde' })
          .locator('label')
          .all();
        const conLoQueQueda: { readonly etiqueta: Locator; readonly queda: number }[] = [];
        for (const etiqueta of etiquetas) {
          conLoQueQueda.push({
            etiqueta,
            queda: Number(/quedan ([\d.]+)/.exec(await etiqueta.innerText())?.[1] ?? '0'),
          });
        }
        const alcanza = conLoQueQueda.find((r) => r.queda > necesita);
        expect(
          alcanza,
          `Ningún rollo de la demo tiene los ${String(necesita)} m del corte.`,
        ).toBeDefined();
        await alcanza!.etiqueta.click();
        await karla.getByLabel(/Medida entregada/).fill(String(MEDIDA_DEL_CORTE));
        await karla.getByRole('button', { name: 'Cortar y agregar' }).click();
        const corte = karla.getByRole('status').filter({ hasText: /está en la caja/ });
        await expect(corte).toBeVisible({ timeout: 30_000 });
        await expect(corte).toContainText(`Quedan ${comoCantidad(alcanza!.queda - necesita)} m`);
        const folio = /N-\d+/.exec(await corte.innerText())?.[0] ?? '';
        expect(folio, 'El corte abrió su nota sin folio visible.').not.toBe('');

        // La medida entregada es venta; la merma, no (`02 §1`, «Material cortado»).
        cobros['corte'] = await cobrarEnCaja(
          karla,
          folio,
          { metodo: 'efectivo' },
          antes,
          totalDe(precios, [[MATERIAL.cable, MEDIDA_DEL_CORTE]]),
        );
        anotarCobro(libro, sesion, 'seis metros de cable cortado', cobros['corte']);
        // Y el almacén bajó la medida MÁS la merma, UNA vez: el cobro no vuelve a descontar.
        await expect
          .poll(async () => existenciaEnElMostrador(karla, MATERIAL.cable), {
            message: 'El cable no bajó medida más merma, o bajó dos veces (corte y cobro).',
            timeout: 20_000,
          })
          .toBeCloseTo(cableAntes - necesita, 2);
      });

      await test.step('la nota que nadie vino a pagar se cancela con su motivo', async () => {
        await irPorElMenu(karla, 'Mostrador', MARCA.mostrador);
        const nota = await armarNota(karla, [[MATERIAL.llave, 1]]);
        const folio = await mandarACaja(karla, nota);
        await irPorElMenu(karla, 'Caja', MARCA.caja);
        await elegirEnCaja(karla, folio);
        // El control de la caja, como el de la venta apartada de la tiendita
        // (`abarrotes/cobro/EnEspera.tsx`): «Cancelar la …», el motivo y la confirmación.
        await karla.getByRole('button', { name: `Cancelar la ${folio}` }).click();
        await karla.locator('#cancelar-motivo').fill('el cliente se fue sin pagar');
        await karla.getByRole('button', { name: `Cancelar la nota ${folio}` }).click();
        const exacto = new RegExp(`${comoTexto(folio)}(?![0-9])`);
        await expect(
          karla
            .getByRole('region', { name: 'Notas pendientes' })
            .getByRole('button', { name: exacto }),
          'La nota cancelada sigue esperando cobro.',
        ).toHaveCount(0, { timeout: 30_000 });
        await expect(
          karla.getByRole('region', { name: 'Cerradas, sin entregar' }).getByText(exacto),
          'Una nota cancelada no es material por entregar.',
        ).toHaveCount(0);
        await expect(
          karla.getByRole('status').filter({ hasText: `${folio} cancelada` }),
        ).toBeVisible();
      });

      // ── 14:00 · KARLA ENTREGA SU TURNO, CON FALTANTE ────────────────────────
      await test.step('corte de turno de Karla a ciegas: le faltan $10', async () => {
        const esperado = await esperadoDelCajon(karla);
        await irPorElMenu(karla, 'Cortes', MARCA.cortes);
        const turno = karla.locator('form[aria-labelledby="corte-de-turno-titulo"]');
        await turno.locator('#turno-contado').fill(pesos(esperado - 1_000));
        await turno.locator('#turno-notas').fill(`se lo entregué a ${ENCARGADA.nombre}`);
        await turno.getByRole('button', { name: 'Entregar el turno' }).click();
        await expect(turno.getByText(/entregado: faltante/)).toBeVisible({ timeout: 30_000 });
        // El corte de turno es una FOTO: no saca nada del cajón (la caja sigue abierta).
        expect(
          await esperadoDelCajon(karla),
          'El corte de turno movió el esperado del cajón.',
        ).toBe(esperado);
      });

      // ── 16:00–19:00 · ELENA EN LA MISMA CAJA ────────────────────────────────
      const elena = await equipo.paginaEnLaTerminalDe(info, { rol: 'cajero' }, 'gerente');
      fallos.push(vigilarFallos(elena));
      await test.step('el segundo turno vende en la misma caja', async () => {
        await elena.goto('/');
        cobros['segundo turno'] = await venderPorLasDosPantallas(
          elena,
          precios,
          [[MATERIAL.desarmador, 1]],
          { metodo: 'efectivo' },
        );
        anotarCobro(libro, sesion, 'desarmador del segundo turno', cobros['segundo turno']);
      });

      // ── 18:00 · LAS DEVOLUCIONES ────────────────────────────────────────────
      await test.step('Elena devuelve una venta completa y otra en parte, en efectivo', async () => {
        await irPorElMenu(elena, 'Fondo y movimientos', /Lo que debería haber/);
        const devolucion = elena.locator('[aria-labelledby="devolucion-titulo"]');

        await devolucion.locator('#devolucion-folio').fill(cobros['efectivo']!.folio);
        await devolucion.getByRole('button', { name: 'Buscar la venta' }).click();
        await devolucion.getByRole('button', { name: 'Devolver todo lo que queda' }).click();
        await devolucion.getByRole('button', { name: /^Efectivo · hasta/ }).click();
        await devolucion.locator('#devolucion-motivo').fill('el martillo no era el que pidió');
        await devolucion.getByRole('button', { name: 'Devolver', exact: true }).click();
        await expect(devolucion.getByText(/devuelta completa/)).toBeVisible({ timeout: 30_000 });
        libro.movimiento(
          sesion,
          'devolución total del martillo y la cinta',
          -cobros['efectivo']!.totalCentavos,
        );

        await devolucion.locator('#devolucion-folio').fill(cobros['mixto']!.folio);
        await devolucion.getByRole('button', { name: 'Buscar la venta' }).click();
        await devolucion.getByLabel(`Cuánto regresa de ${MATERIAL.aislar}`).first().fill('1');
        await devolucion.getByRole('button', { name: /^Efectivo · hasta/ }).click();
        await devolucion.locator('#devolucion-motivo').fill('le sobró un rollo');
        const sale = devolucion.locator('[aria-live="polite"]').filter({ hasText: 'Se devuelven' });
        const parcial = Math.round(
          Number(
            /\$([\d,]+\.\d{2})/.exec(await sale.innerText())?.[1]?.replace(/,/g, '') ?? 'NaN',
          ) * 100,
        );
        // Una cinta de aislar, a su precio: la venta no llevaba descuento.
        expect(parcial).toBe(totalDe(precios, [[MATERIAL.aislar, 1]]));
        await devolucion.getByRole('button', { name: 'Devolver', exact: true }).click();
        await expect(devolucion.getByText(/devuelta en parte/)).toBeVisible({ timeout: 30_000 });
        libro.movimiento(sesion, 'devolución de una cinta de aislar', -parcial);
      });

      await test.step('Elena paga la gasolina de la camioneta y saca $1,000 al banco', async () => {
        const gasto = elena.locator('[aria-labelledby="gasto-titulo"]');
        await gasto.locator('#gasto-monto').fill('120.00');
        await gasto.getByRole('button', { name: 'Transporte' }).click();
        await gasto.locator('#gasto-descripcion').fill('gasolina de la Estaquitas para entregas');
        await gasto.getByRole('button', { name: 'Registrar el gasto' }).click();
        await expect(
          gasto.getByText(/^Gasto registrado: salieron \$120\.00 del cajón\.$/),
        ).toBeVisible();
        libro.movimiento(sesion, 'gasto: gasolina', -12_000);

        await elena.locator('#retiro-importe').fill('1000');
        await elena.locator('#retiro-motivo').fill('al banco');
        await elena.getByRole('button', { name: 'Registrar el retiro' }).click();
        await expect(elena.locator('#retiro-importe')).toHaveValue('');
        libro.movimiento(sesion, 'retiro al banco', -100_000);
      });

      // ── 19:00 · EL INGENIERO PAGA SU REMISIÓN ───────────────────────────────
      await test.step('el ingeniero paga su remisión en efectivo: entra al cajón y no es venta', async () => {
        await irPorElMenu(elena, 'Cuentas', MARCA.cuentas);
        await elena.getByRole('button', { name: `Registrar pago de ${INGENIERO}` }).click();
        const ficha = elena.getByRole('dialog', { name: INGENIERO });
        await ficha
          .getByRole('group', { name: 'Método del pago' })
          .getByRole('button', { name: 'Efectivo' })
          .click();
        // La remisión más vieja viene marcada: es la de hoy, entera.
        await expect(
          ficha.getByRole('table', { name: 'Remisiones abiertas' }).getByRole('checkbox'),
        ).toBeChecked({ timeout: 30_000 });
        await ficha.getByRole('button', { name: 'Registrar pago', exact: true }).click();
        await expect(elena.getByText(`Pago de ${INGENIERO} registrado.`)).toBeVisible({
          timeout: 30_000,
        });
        // `02 §1` PRUEBA 1: «+ pagos de crédito recibidos en efectivo». Es cobranza: la venta
        // ya se reconoció al entregar, y aquí sólo entra el dinero y baja el saldo.
        libro.movimiento(sesion, 'pago de la remisión del ingeniero', credito.totalCentavos);
        libro.pasivo('abono_credito', credito.totalCentavos);
      });

      // ── 19:30 · EL CONTEO, CON DIFERENCIA Y SU AJUSTE ───────────────────────
      await test.step('Rubén cuenta la tornillería pesándola: faltan cinco, y se ajusta', async () => {
        const hay = await existenciaDe(dueno, MATERIAL.tornillo);
        if (!libro.productosVigilados.includes(MATERIAL.tornillo)) {
          libro.existenciaAntes(MATERIAL.tornillo, hay);
        }
        await aSuCasa(ruben, /\/ferreteria\//);
        await irPorElMenu(ruben, 'Existencias', MARCA.existencias);
        await ruben.getByRole('button', { name: 'Abrir conteo' }).click();
        await ruben.locator('#conteo-alcance').click();
        await ruben.getByRole('option', { name: 'Toda la ferretería' }).click();
        await ruben.getByRole('button', { name: 'Abrir y contar' }).click();
        await expect(
          ruben,
          'Abrir el conteo no llevó a la pantalla de conteo con su toma.',
        ).toHaveURL(/\/ferreteria\/conteo\?toma=[0-9a-f-]{36}/, { timeout: 30_000 });
        await ruben
          .getByRole('table', { name: /para contar/ })
          .getByRole('row', { name: /Tornillo galvanizado 1\/4/ })
          .click();
        await expect(ruben.locator('#conteo-elegida')).toHaveText(MATERIAL.tornillo);
        if (await ruben.getByRole('heading', { name: 'Primero se calibra' }).isVisible()) {
          await ruben.locator('#m-peso').fill(String(MUESTRA.gramos));
          await ruben.locator('#m-piezas').fill(String(MUESTRA.piezas));
          await ruben.getByRole('button', { name: 'Calibrar' }).click();
          await expect(ruben.getByText(/^Calibrado\./)).toBeVisible({ timeout: 30_000 });
        }
        await ruben.locator('#p-total').fill(String((hay - FALTAN_AL_CONTAR) * GRAMOS_POR_PIEZA));
        await ruben.locator('#p-tara').fill('0');
        await ruben.getByRole('button', { name: 'Contar', exact: true }).click();
        await expect(ruben.getByRole('heading', { name: 'Estimación por peso' })).toBeVisible({
          timeout: 30_000,
        });
        await ruben.getByRole('button', { name: 'Cerrar el conteo' }).click();
        await ruben.getByRole('button', { name: 'Sí, cerrar y ajustar' }).click();
        await expect(ruben.getByText('Conteo cerrado')).toBeVisible({ timeout: 30_000 });
        await expect(ruben.getByText(/1 ajustes: 1 faltantes y 0 sobrantes/)).toBeVisible();
      });

      // ── 20:00 · EL CIERRE A CIEGAS, CON SOBRANTE, Y SU PDF ──────────────────
      await test.step('Elena cierra la caja a ciegas: sobran $20', async () => {
        const esperado = await esperadoDelCajon(elena);
        const contado = esperado + 2_000;
        await elena.goto('/');
        await irPorElMenu(elena, 'Cortes', /Cuenta el cajón/);
        await elena.locator('#sueltos').fill(pesos(contado));
        await elena.locator('#dejado-en-el-cajon').fill(pesos(FONDO_CENTAVOS));
        const pdf = exigirElPdfDelCorte(elena, {
          titulo: 'CORTE DE CAJA',
          textos: [
            'Arqueo de efectivo',
            'De dónde salió el efectivo esperado',
            'Resumen de ventas',
            'Venta por mostradorista',
            'Material cortado hoy',
          ],
        });
        await elena.getByRole('button', { name: 'Cerrar el turno' }).click();
        await expect(elena.getByRole('heading', { name: 'Turno cerrado' })).toBeVisible({
          timeout: 30_000,
        });
        await expect(elena.getByText(/sobra/i).first()).toBeVisible();
        await pdf;
        libro.contar(sesion, contado);
      });

      // ── 20:15 · EL DUEÑO LEE EL CORTE, Y EL DINERO CUADRA ───────────────────
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
