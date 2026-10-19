import { expect, type Locator, type Page, test } from '@playwright/test';

import { comisionDeLaRegla, conciliarElDia } from '../../packages/testing/src/conciliacion.ts';

import {
  exigirQueCuadre,
  existenciaDe,
  leerElServidor,
  Libro,
  movimientosDeInventarioPrevios,
  sesionDeLaCaja,
  type LecturasDelGiro,
} from './ayudantes/conciliacion.ts';
import { enPesos, exigirElPdfDelCorte } from './ayudantes/corte.ts';
import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  centavosDeTexto,
  consultarPuente,
  entradaDeMenu,
  exigirCobroAceptado,
  exigirDemostracion,
  exigirVentaCobrada,
  irPorElMenu,
  menuLateral,
  soltarLaCaja,
  ventasDeAntes,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * EL DÍA COMPLETO DEL SALÓN (D.1 de la 2.4) · `estetica-salon/00-FICHA-Y-EJES §3`.
 *
 * Un miércoles de la estética de la demo, operado por QUIEN lo opera: Paty abre la caja,
 * lee la agenda, autoriza, devuelve, compra y cierra; Nayeli agenda y cobra en la tablet de
 * recepción; Karla y Dany atienden SUS citas desde su teléfono —las inician, capturan la
 * fórmula y cierran el servicio—; Sandra cuenta el anaquel; y el dueño liquida a las dos
 * estilistas y lee el día. Cada quien llega a su pantalla por SU menú, o por su inicio cuando
 * la pantalla es el inicio (la agenda es la casa de todos en este giro).
 *
 * Cada cosa que mueve dinero, comisión, propina o mercancía se anota en el `Libro`, y al
 * final el día tiene que cuadrar AL CENTAVO contra el servidor (`conciliarElDia`): ventas,
 * pagos por método, propina fuera de la venta, cajón, comisión de cada estilista según SU
 * regla, lo que el salón le debe de propina y el inventario.
 *
 * ── Lo que este día enseña y la tienda no ──────────────────────────────────
 *   · la COMISIÓN nace del cobro, sobre lo cobrado SIN IVA y después del descuento
 *     (`02-DINERO-Y-CAJA §7.2`, preguntas 1 y 2), y una devolución escribe su
 *     contrapartida negativa (§7.3);
 *   · la PROPINA es de la estilista desde el segundo uno (§4.4): a la mano no entra al
 *     cajón ni se le debe; al cajón y en la terminal es un pasivo que se le paga en la
 *     liquidación, en su renglón y nunca sumada a la comisión;
 *   · la LIQUIDACIÓN es la salida de caja más grande del día (§8.3), y sale del cajón de
 *     recepción, así que se hace con la caja abierta y antes del cierre.
 *
 * ── Por qué el próximo miércoles ──────────────────────────────────────────
 * La misma decisión que `estetica-salon.spec.ts`: el salón descansa los lunes y de noche
 * los huecos de hoy ya pasaron. Las citas se agendan el próximo MIÉRCOLES —trabajan las
 * dos, y en una demo recién reseteada el día está entero— y la agenda se lleva a ese día con
 * su propio botón «Día siguiente». La caja, los cobros y las comisiones son de HOY: iniciar
 * la cita sella `inicio_real` con la hora de verdad, que es la walk-in que llega antes.
 *
 * ── Dispositivos ──────────────────────────────────────────────────────────────
 * La TABLET de recepción es UNA terminal (`04-INTERFAZ`, eje E): Nayeli la estrena y Paty y
 * el dueño entran en ella con su PIN (`paginaEnLaTerminalDe`), porque el cajón es el de esa
 * terminal —abrir, autorizar, devolver, liquidar y cerrar caen en él—. Las estilistas usan
 * su teléfono, Sandra la PC de atrás y el dueño lee el día en el suyo. El proyecto de las
 * PR para este giro es `tablet`: `pnpm test:e2e pruebas/e2e/dia-completo-estetica.spec.ts
 * --project=tablet`.
 *
 * ── Escrita como DEBE funcionar ──────────────────────────────────────────────
 * Se escribió antes que las piezas que le faltaban al salón —la devolución, el gasto, el
 * retiro y el corte de turno en «Caja y corte»; la liquidación que se ve antes de pagarse y
 * paga la propina; la agenda en el menú de recepción y de las estilistas— y con ellas se
 * construyeron. Lo que sólo AFIRMA una pantalla y no mueve el día va con `expect.soft`: se
 * anota y el día sigue, para que una corrida enseñe todo lo que falle y no sólo lo primero.
 */

const SLUG = 'demo-acople-estetica';

/** La zona del NEGOCIO, no la del proceso que corre la prueba (CI corre en UTC). */
const ZONA = 'America/Mexico_City';
const MS_DIA = 86_400_000;

/** $800 en billetes de $100 y $200 (ficha §3, 09:40). El salón no desglosa el fondo (§8.2). */
const FONDO_CENTAVOS = 80_000;

/**
 * LA REGLA DE LAS DOS ESTILISTAS, escrita a mano desde la siembra (`salon.ts`,
 * «Estilistas · 40 % de servicio»): 40 % de lo COBRADO, SIN IVA, material a cargo del
 * salón. No se lee del servidor: una prueba que compara contra la regla que el propio
 * servidor le sirve no prueba la regla.
 */
const REGLA_DE_SERVICIO_BP = 4_000;

/** El IVA general, incluido en el precio al público (`02-DINERO-Y-CAJA §2.1`). */
const IVA_BP = 1_600;

/** Los servicios del día, con el precio de lista de la siembra (`datos.ts`, ESTETICA). */
const SERVICIO = {
  tinteDeRaiz: { nombre: 'Tinte de raíz', listaCentavos: 65_000 },
  corteDeDama: { nombre: 'Corte de dama', listaCentavos: 25_000 },
  tinteCompleto: { nombre: 'Tinte completo', listaCentavos: 95_000 },
  lavadoYPeinado: { nombre: 'Lavado y peinado', listaCentavos: 20_000 },
  peinadoDeEvento: { nombre: 'Peinado de evento', listaCentavos: 45_000 },
  manicure: { nombre: 'Manicure tradicional', listaCentavos: 18_000 },
} as const;

type Servicio = (typeof SERVICIO)[keyof typeof SERVICIO];

const PRODUCTO = {
  /** El oxidante que se acabó a las 13:30 (ficha §3): producto de CABINA que detiene citas. */
  oxigenada: 'Agua oxigenada 20 volúmenes 1 L',
  shampoo: 'Shampoo sin sulfatos 300 ml',
} as const;

const PROVEEDOR = 'Distribuidora de Belleza Hidalgo';

type Estilista = 'Karla' | 'Dany';

/** Cómo se llama cada estilista en la ficha (`Profesional.nombre_completo`). */
const NOMBRE_COMPLETO: Readonly<Record<Estilista, string>> = {
  Karla: 'Karla Domínguez',
  Dany: 'Dany Robles',
};

const pesos = (centavos: number): string => (centavos / 100).toFixed(2);

const literal = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** El IVA que va DENTRO de un precio al público, al centavo más cercano (§2.1). */
const ivaIncluidoEn = (centavos: number): number =>
  Math.round((centavos * IVA_BP) / (10_000 + IVA_BP));

/** La base de la comisión: lo cobrado de esa línea, sin IVA (§7.2, preguntas 1 y 2). */
const baseDeComision = (cobradoCentavos: number): number =>
  cobradoCentavos - ivaIncluidoEn(cobradoCentavos);

const fechaDelNegocio = (ms: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(ms));

/** La hora como la pinta el bloque de la agenda: «09:40», en la zona del negocio. */
const horaDelBloque = (iso: string): string =>
  new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));

/** EL DÍA DE LAS CITAS: el próximo miércoles del negocio, nunca hoy. */
function elMiercoles(ahoraMs: number): {
  readonly fecha: string;
  readonly siguiente: string;
  readonly diasDesdeHoy: number;
} {
  const hoy = fechaDelNegocio(ahoraMs);
  const MIERCOLES = 3;
  const diaDeLaSemana = new Date(`${hoy}T12:00:00Z`).getUTCDay();
  const diasDesdeHoy = (MIERCOLES - diaDeLaSemana + 7) % 7 || 7;
  return {
    fecha: fechaDelNegocio(ahoraMs + diasDesdeHoy * MS_DIA),
    siguiente: fechaDelNegocio(ahoraMs + (diasDesdeHoy + 1) * MS_DIA),
    diasDesdeHoy,
  };
}

/** Una cita del miércoles, con lo que hace falta para encontrarla y cobrarla. */
interface CitaDelDia {
  readonly referencia: string;
  readonly clienta: string;
  readonly clienteId: string;
  readonly citaId: string;
  readonly folio: string;
  /** El inicio que puso el servidor: la rejilla pinta ÉSE. */
  readonly inicio: string;
  readonly estilista: Estilista;
  readonly servicios: readonly Servicio[];
}

interface CobroHecho {
  readonly ventaId: string;
  readonly folio: string;
  readonly ventaCentavos: number;
}

interface HuecoDelServidor {
  readonly profesionalId?: string;
  readonly inicio?: string;
  readonly minutos?: number;
}

interface ComisionDelPuente {
  readonly profesional_id?: string;
  /** EN PESOS: el puente convierte `monto_centavos` con `dinero`. */
  readonly monto_centavos?: number | null;
}

interface ProfesionalDelPuente {
  readonly id?: string;
  readonly nombre_corto?: string | null;
}

async function datosDe<T>(
  respuesta: Awaited<ReturnType<Page['request']['post']>>,
  que: string,
): Promise<T> {
  expect(respuesta.status(), `${que}: ${(await respuesta.text()).slice(0, 300)}`).toBe(200);
  return ((await respuesta.json()) as { readonly datos: T }).datos;
}

/** Lo que el servidor dice que debería haber en el cajón de esta terminal, ahora. */
async function esperadoDelCajon(page: Page): Promise<number> {
  const datos = await datosDe<{ readonly efectivoEsperadoCentavos?: string }>(
    await page.request.post('/api/caja/estado', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: { efectivoContadoCentavos: 0 },
    }),
    'caja.estado',
  );
  return Number(datos.efectivoEsperadoCentavos ?? Number.NaN);
}

/**
 * EL INICIO DE ESTA PERSONA. En una estética `/` pinta la AGENDA del día para todos los
 * roles (`(interno)/page.tsx`): es la pantalla que se abre ochenta veces al día.
 */
async function aSuInicio(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Día siguiente' })).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * LAS CITAS QUE YA TRAÍA EL MIÉRCOLES: las que se agendaron por teléfono días antes. Van
 * por la misma ruta que el asistente —`/api/clientes` y `/api/agenda/cita`— con la sesión
 * de recepción, en el hueco que el SERVIDOR dice que existe para esa estilista.
 */
async function agendarPorTelefono(
  recepcion: Page,
  cita: {
    readonly referencia: string;
    readonly clienta: string;
    readonly telefono: string;
    readonly estilista: Estilista;
    readonly servicios: readonly Servicio[];
  },
  ids: {
    readonly servicio: ReadonlyMap<string, string>;
    readonly estilista: ReadonlyMap<Estilista, string>;
  },
  dia: { readonly fecha: string; readonly siguiente: string },
): Promise<CitaDelDia> {
  const { clienteId } = await datosDe<{ readonly clienteId: string }>(
    await recepcion.request.post('/api/clientes', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: { nombre: cita.clienta, telefono: cita.telefono },
    }),
    `alta de ${cita.clienta}`,
  );
  const profesionalId = ids.estilista.get(cita.estilista) ?? '';
  const { huecos = [] } = await datosDe<{ readonly huecos?: readonly HuecoDelServidor[] }>(
    await recepcion.request.post('/api/agenda/huecos', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: { desde: dia.fecha, hasta: dia.siguiente, minutos: 30 },
    }),
    `agenda.huecos del ${dia.fecha}`,
  );
  // Los más grandes primero: el servicio dura lo que dura y en media hora no cabe.
  const suyos = huecos
    .filter((h) => h.profesionalId === profesionalId && (h.inicio ?? '') !== '')
    .toSorted(
      (a, b) =>
        (b.minutos ?? 0) - (a.minutos ?? 0) || (a.inicio ?? '').localeCompare(b.inicio ?? ''),
    );
  const rechazos: string[] = [];
  for (const hueco of suyos) {
    const intento = await recepcion.request.post('/api/agenda/cita', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: {
        clienteId,
        origen: 'telefono',
        inicio: hueco.inicio,
        servicios: cita.servicios.map((s) => ({
          servicioId: ids.servicio.get(s.nombre),
          profesionalId,
        })),
      },
    });
    if (intento.status() !== 200) {
      rechazos.push(`${hueco.inicio ?? ''}: ${(await intento.text()).slice(0, 160)}`);
      continue;
    }
    const agendada = (await intento.json()) as {
      readonly datos: {
        readonly citaId: string;
        readonly folio: string;
        readonly servicios: readonly { readonly inicio: string }[];
      };
    };
    return {
      referencia: cita.referencia,
      clienta: cita.clienta,
      clienteId,
      citaId: agendada.datos.citaId,
      folio: agendada.datos.folio,
      inicio: agendada.datos.servicios[0]?.inicio ?? '',
      estilista: cita.estilista,
      servicios: cita.servicios,
    };
  }
  throw new Error(
    `No cupo «${cita.referencia}» con ${cita.estilista} el ${dia.fecha}: ` +
      `${String(suyos.length)} huecos y ningún sí. ${rechazos.slice(0, 3).join(' | ')}`,
  );
}

/**
 * LA ESTILISTA ATIENDE SU CITA: desde su inicio —la agenda— lleva el día al miércoles,
 * toca su bloque (eso INICIA la cita y entra a ella), hace lo de la cabina y cierra cada
 * servicio. Cerrar no cobra: deja la cita `terminada`, que es lo único que la caja lista.
 */
async function atenderLaCita(
  estilista: Page,
  cita: CitaDelDia,
  diasDesdeHoy: number,
  enLaCabina?: (page: Page) => Promise<void>,
): Promise<void> {
  await aSuInicio(estilista);
  const siguiente = estilista.getByRole('button', { name: 'Día siguiente' });
  for (let paso = 0; paso < diasDesdeHoy; paso += 1) await siguiente.click();
  const bloque = estilista
    .getByRole('button', {
      name: new RegExp(`${horaDelBloque(cita.inicio)}.*${literal(cita.clienta)}`, 's'),
    })
    .first();
  await expect(
    bloque,
    `La agenda de ${cita.estilista} no pinta «${cita.referencia}» a las ${horaDelBloque(cita.inicio)}.`,
  ).toBeVisible({ timeout: 30_000 });
  await bloque.click();
  await expect(estilista).toHaveURL(new RegExp(`cita-en-curso\\?cita=${cita.citaId}`), {
    timeout: 30_000,
  });
  if (enLaCabina !== undefined) await enLaCabina(estilista);
  const cerrar = estilista.getByRole('button', { name: 'Cerrar servicio' });
  // Un toque por servicio: la pantalla cierra el primero que siga abierto.
  for (const servicio of cita.servicios) {
    await expect(cerrar, `«${servicio.nombre}» no se puede cerrar.`).toBeEnabled({
      timeout: 20_000,
    });
    await cerrar.click();
  }
  await expect(cerrar, 'Quedó un servicio de la cita sin cerrar.').toBeDisabled({
    timeout: 20_000,
  });
}

/** Contra el SERVIDOR: la pantalla se quedaría igual si el cierre fallara en silencio. */
async function exigirCitaTerminada(lector: Page, cita: CitaDelDia): Promise<void> {
  await expect
    .poll(
      async () =>
        (
          await consultarPuente<{ readonly estado?: string }>(lector, 'Cita', {
            filtro: { id: cita.citaId },
            limite: 1,
          })
        )[0]?.estado ?? '',
      {
        message: `«${cita.referencia}» no quedó terminada: la caja no la puede cobrar.`,
        timeout: 30_000,
      },
    )
    .toBe('terminada');
}

/** El folio con borde de dígito: «C-1» no puede casar con «C-12». */
const folioExacto = (folio: string): RegExp => new RegExp(`${literal(folio)}(?![0-9])`);

/** Elige la cita por su folio en «Cobrar» y devuelve el panel del cobro. */
async function elegirLaCita(page: Page, cita: CitaDelDia): Promise<Locator> {
  const tarjeta = page.getByRole('button', { name: folioExacto(cita.folio) }).first();
  await expect(
    tarjeta,
    `«Cobrar» no lista «${cita.referencia}» (${cita.folio}) con su servicio cerrado.`,
  ).toBeVisible({ timeout: 30_000 });
  await tarjeta.click();
  const cobro = page.getByRole('complementary', { name: 'Cobro' });
  await expect(cobro).toBeVisible();
  return cobro;
}

/** «A COBRAR», en centavos: el número que se dice en voz alta, ya cotizado por el servidor. */
async function aCobrar(cobro: Locator): Promise<number> {
  let centavos = Number.NaN;
  await expect
    .poll(
      async () => {
        // `innerText` trae el rótulo en las mayúsculas del estilo: se compara sin distinguir.
        const hallado = /A cobrar\s*([−-]?\$\s*[\d,]+\.\d{2})/i.exec(await cobro.innerText());
        centavos = hallado === null ? Number.NaN : centavosDeTexto(hallado[1] ?? '');
        return Number.isNaN(centavos);
      },
      { message: 'La cuenta del servidor no llegó al panel de cobro.', timeout: 20_000 },
    )
    .toBe(false);
  return centavos;
}

/** La cifra del `dd` que va junto a un `dt` visible: el IVA, el pendiente de una estilista. */
async function cifraJuntoA(donde: Page | Locator, rotulo: string): Promise<number> {
  const valor = donde
    .locator('dt', { hasText: rotulo })
    .filter({ visible: true })
    .first()
    .locator('xpath=following-sibling::dd[1]');
  await expect(valor).toBeVisible();
  return centavosDeTexto(await valor.innerText());
}

/** El importe de un renglón de una tabla de dinero, con su signo. */
async function importeDelRenglon(tabla: Locator, renglon: RegExp): Promise<number> {
  const texto = await tabla.getByRole('row', { name: renglon }).first().innerText();
  const cantidades = [...texto.matchAll(/([−-])?\$\s*([\d,]+\.\d{2})/g)];
  const ultima = cantidades.at(-1);
  if (ultima === undefined) return Number.NaN;
  return (ultima[1] === undefined ? 1 : -1) * centavosDeTexto(ultima[2] ?? '');
}

/** Toca COBRAR y exige la venta en el servidor por lo que se vendió, sin la propina. */
async function cobrarYExigir(
  page: Page,
  cobro: Locator,
  ventaCentavos: number,
  antes: ReadonlySet<string>,
): Promise<CobroHecho> {
  await cobro.getByRole('button', { name: /^COBRAR/ }).click();
  await exigirCobroAceptado(page, /^Cobrado · folio/);
  const venta = await exigirVentaCobrada(page, ventaCentavos, antes);
  return { ventaId: venta.id ?? '', folio: venta.folio ?? '', ventaCentavos };
}

test.describe('el día completo del salón', () => {
  // Cada acción con su techo: sin él, un clic sobre algo que no aparece espera hasta el
  // límite de la prueba entera y el informe dice «se acabó el tiempo» en vez de «no estaba».
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  test('un miércoles de la estética, con su comisión y su propina, cuadrado al centavo', async ({
    browser,
  }, info) => {
    test.setTimeout(25 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    const libro = new Libro();
    const fallos: (() => void)[] = [];
    let recepcion: Page | null = null;

    /**
     * Lo causado, por estilista, con la base que manda su regla. El `Libro` lo concilia al
     * final; esto mismo dice cuánto tiene que enseñar «Mi día» y cuánto se liquida.
     */
    const causadas: { readonly estilista: Estilista; readonly baseCentavos: number }[] = [];
    const causar = (estilista: Estilista, cobradoCentavos: number, signo: 1 | -1 = 1): void => {
      const baseCentavos = signo * baseDeComision(cobradoCentavos);
      causadas.push({ estilista, baseCentavos });
      libro.comision(estilista, baseCentavos, REGLA_DE_SERVICIO_BP);
    };
    const comisionDe = (estilista: Estilista): number =>
      Number(
        causadas
          .filter((c) => c.estilista === estilista)
          .reduce(
            (suma, c) => suma + comisionDeLaRegla(BigInt(c.baseCentavos), REGLA_DE_SERVICIO_BP),
            0n,
          ),
      );
    /** Lo que el salón le debe de propina a cada una: al cajón y en la terminal (§4.2). */
    const propinaDebida: Record<Estilista, number> = { Karla: 0, Dany: 0 };

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

      libro.empezarInventario(await movimientosDeInventarioPrevios(dueno));
      for (const nombre of [PRODUCTO.oxigenada, PRODUCTO.shampoo]) {
        libro.existenciaAntes(nombre, await existenciaDe(dueno, nombre));
      }

      const dia = elMiercoles(Date.now());
      const sello = String(Date.now()).slice(-5);
      const telefono = (n: number): string => `55${sello}${String(n).padStart(3, '0')}`;

      // El catálogo y el equipo por su nombre: los ids cambian con cada reseteo.
      const servicios = await consultarPuente<{ id?: string; nombre?: string | null }>(
        dueno,
        'ProductoTerminado',
        { filtro: { tipo_venta: 'servicio' }, limite: 60 },
      );
      const profesionales = await consultarPuente<ProfesionalDelPuente>(dueno, 'Profesional', {
        limite: 20,
      });
      const ids = {
        servicio: new Map(servicios.map((s) => [s.nombre ?? '', s.id ?? ''])),
        estilista: new Map<Estilista, string>(
          (['Karla', 'Dany'] as const).map((e) => [
            e,
            profesionales.find((p) => p.nombre_corto === e)?.id ?? '',
          ]),
        ),
      };
      for (const servicio of Object.values(SERVICIO)) {
        expect(
          ids.servicio.get(servicio.nombre),
          `La demo no tiene «${servicio.nombre}».`,
        ).toBeTruthy();
      }

      // ── LA TABLET DE RECEPCIÓN: Nayeli la estrena ──────────────────────────
      recepcion = await equipo.pagina(info, 'cajero');
      const nayeli = recepcion;
      fallos.push(vigilarFallos(nayeli));

      // ── LA AGENDA QUE YA TRAÍA EL MIÉRCOLES (agendada por teléfono días antes) ─
      const citas: Record<'B' | 'C' | 'D' | 'E' | 'F' | 'G', CitaDelDia> = {} as Record<
        'B' | 'C' | 'D' | 'E' | 'F' | 'G',
        CitaDelDia
      >;
      await test.step('la agenda del miércoles ya trae seis citas', async () => {
        await aSuInicio(nayeli);
        const porAgendar = [
          ['B', 'corte de Lucía', `Lucía Peña ${sello}`, 'Dany', [SERVICIO.corteDeDama]],
          [
            'C',
            'tinte completo de Rocío',
            `Rocío Salas ${sello}`,
            'Karla',
            [SERVICIO.tinteCompleto],
          ],
          ['D', 'lavado de Fernanda', `Fernanda Ruiz ${sello}`, 'Dany', [SERVICIO.lavadoYPeinado]],
          ['E', 'peinado de Ximena', `Ximena Lara ${sello}`, 'Karla', [SERVICIO.peinadoDeEvento]],
          [
            'F',
            'corte y lavado de Gabriela',
            `Gabriela Mora ${sello}`,
            'Dany',
            [SERVICIO.corteDeDama, SERVICIO.lavadoYPeinado],
          ],
          ['G', 'manicure de Andrea', `Andrea Vela ${sello}`, 'Karla', [SERVICIO.manicure]],
        ] as const;
        for (const [
          indice,
          [clave, referencia, clienta, estilista, suyos],
        ] of porAgendar.entries()) {
          citas[clave] = await agendarPorTelefono(
            nayeli,
            { referencia, clienta, telefono: telefono(indice + 1), estilista, servicios: suyos },
            ids,
            dia,
          );
        }
      });

      // ── 09:40 · PATY ABRE LA CAJA CON SU FONDO ──────────────────────────────
      const paty = await equipo.paginaEnLaTerminalDe(info, { rol: 'cajero' }, 'gerente');
      fallos.push(vigilarFallos(paty));
      const sesion =
        await test.step('Paty abre el día en la tablet de recepción con $800', async () => {
          await aSuInicio(paty);
          await irPorElMenu(paty, 'Caja y corte', /Fondo con el que abres/);
          await paty.locator('#fondo').fill(pesos(FONDO_CENTAVOS));
          await paty.getByRole('button', { name: 'Abrir el día' }).click();
          await expect(paty.getByText('El día está abierto.')).toBeVisible({ timeout: 30_000 });
          // «El día» lee del estado de la caja campos que el servidor no devuelve: si pinta
          // `$NaN`, la recepcionista lee basura en la pantalla con la que cuadra el día.
          await expect
            .soft(paty.getByText(/\$NaN/), 'La tabla «El día» de Caja y corte pinta $NaN.')
            .toHaveCount(0);
          const abierta = (await sesionDeLaCaja(paty)) ?? '';
          expect(abierta, 'La caja dice abierta y el servidor no tiene su sesión.').not.toBe('');
          libro.abrirCaja('el cajón de recepción', abierta, FONDO_CENTAVOS);
          expect(await esperadoDelCajon(paty)).toBe(FONDO_CENTAVOS);
          return abierta;
        });

      // ── 09:45 · LA AGENDA DEL DÍA, CON LOS HUECOS A LA VISTA ────────────────
      await test.step('Paty lee la agenda del miércoles por su menú', async () => {
        await irPorElMenu(paty, 'Agenda', /citas|ocupado/);
        const siguiente = paty.getByRole('button', { name: 'Día siguiente' });
        for (let paso = 0; paso < dia.diasDesdeHoy; paso += 1) await siguiente.click();
        await expect(paty.locator('[aria-label="Resumen del día"]').first()).toBeVisible({
          timeout: 30_000,
        });
        for (const cita of Object.values(citas)) {
          await expect(
            paty.getByRole('button', { name: new RegExp(literal(cita.clienta)) }).first(),
            `La agenda de recepción no pinta «${cita.referencia}».`,
          ).toBeVisible({ timeout: 30_000 });
        }
      });

      // ── 09:55 · NAYELI AGENDA POR WHATSAPP, EN EL PRIMER HUECO DE KARLA ─────
      const mariana = `Mariana Ortiz ${sello}`;
      const A =
        await test.step('Nayeli agenda a una clienta nueva con Karla, por su pantalla', async (): Promise<CitaDelDia> => {
          // La recepcionista ES quien mira la agenda todo el día (eje E): su menú tiene que
          // llevarla ahí, no sólo su inicio.
          await expect
            .soft(
              entradaDeMenu(await menuLateral(nayeli), 'Agenda'),
              'La recepción no tiene «Agenda» en su menú: la entrada pide `ver_dashboard`.',
            )
            .toBeVisible();
          await irPorElMenu(nayeli, 'Agendar', /¿Quién\?/);
          await nayeli.locator('#nueva-nombre').fill(mariana);
          await nayeli.locator('#nueva-telefono').fill(telefono(0));
          await nayeli
            .locator('section[aria-labelledby="paso-que"]')
            .getByRole('button', { name: new RegExp(`^${literal(SERVICIO.tinteDeRaiz.nombre)}`) })
            .click();
          await nayeli
            .locator('section[aria-labelledby="paso-con-quien"]')
            .getByRole('button', { name: /^Karla/ })
            .click();
          await nayeli.locator('#otra-fecha').fill(dia.fecha);
          const cuando = nayeli.locator('section[aria-labelledby="paso-cuando"]');
          await expect(cuando.locator('[aria-pressed]').first()).toBeVisible({ timeout: 30_000 });
          await cuando.locator('[aria-pressed]').first().click();
          await nayeli.getByRole('button', { name: 'Confirmar la cita' }).click();
          await expect(nayeli).toHaveURL(/agenda-del-dia/, { timeout: 30_000 });

          const [clienta] = await consultarPuente<{ id?: string }>(dueno, 'Cliente', {
            filtro: { nombre: mariana },
            limite: 1,
          });
          const [cita] = await consultarPuente<{
            id?: string;
            folio?: string | null;
            agendada_para?: string | null;
          }>(dueno, 'Cita', { filtro: { cliente_id: clienta?.id ?? '' }, limite: 1 });
          expect(
            cita?.id,
            'Confirmar la cita no dejó ninguna cita de la clienta nueva.',
          ).toBeTruthy();
          expect(
            fechaDelNegocio(Date.parse(cita?.agendada_para ?? '')),
            'La cita quedó en otro día que el miércoles que se eligió.',
          ).toBe(dia.fecha);
          return {
            referencia: 'retoque de raíz de Mariana',
            clienta: mariana,
            clienteId: clienta?.id ?? '',
            citaId: cita?.id ?? '',
            folio: cita?.folio ?? '',
            inicio: cita?.agendada_para ?? '',
            estilista: 'Karla',
            servicios: [SERVICIO.tinteDeRaiz],
          };
        });

      const karla = await equipo.pagina(info, 'mesero', 'Karla');
      fallos.push(vigilarFallos(karla));
      const dany = await equipo.pagina(info, 'mesero', 'Dany');
      fallos.push(vigilarFallos(dany));
      const cobros: Record<string, CobroHecho> = {};
      const cobrado = (clave: string): CobroHecho => {
        const hecho = cobros[clave];
        if (hecho === undefined) throw new Error(`El día no cobró la cita ${clave}.`);
        return hecho;
      };

      // ── 10:00 · KARLA: LA FÓRMULA DE COLOR, Y CIERRA EL SERVICIO ────────────
      await test.step('Karla inicia la cita de Mariana, captura su fórmula y la cierra', async () => {
        await atenderLaCita(karla, A, dia.diasDesdeHoy, async (cabina) => {
          // La ficha de la cita dice de QUIÉN es: la agenda tiene que llevar a la clienta.
          await expect
            .soft(
              cabina.getByRole('heading', { level: 1, name: mariana }),
              'La cita en curso no sabe de qué clienta es: la agenda no le pasa `clienta`.',
            )
            .toBeVisible();
          await cabina.getByRole('button', { name: 'Ajustar' }).click();
          await cabina.getByRole('button', { name: 'Añadir 10 a 6.0' }).click();
          await cabina.locator('#mezclado').fill('100');
          await cabina.locator('#usado').fill('95');
          await cabina.locator('#minutos').fill('35');
          await cabina.getByRole('button', { name: 'Guardar fórmula' }).click();
          await expect(cabina.getByText('Fórmula guardada en su historial.')).toBeVisible({
            timeout: 30_000,
          });
        });
        await exigirCitaTerminada(dueno, A);
        // Su expediente: 70 g de 6.0 y el oxidante, 5 g al bote, 35 min de procesado, atada
        // al servicio que se le hizo (se capturó ANTES de cerrarlo).
        const [formula] = await consultarPuente<{
          formula?: {
            mezclado?: number;
            usado?: number;
            componentes?: readonly { nombre?: string; cantidad?: number }[];
          } | null;
          minutos?: number | null;
          cita_servicio_id?: string | null;
        }>(dueno, 'FormulaAplicada', { filtro: { cliente_id: A.clienteId }, limite: 1 });
        expect(formula, 'La fórmula no quedó en el expediente de la clienta.').toBeDefined();
        expect(formula?.cita_servicio_id, 'La fórmula no quedó atada a su servicio.').toBeTruthy();
        expect(formula?.formula?.componentes).toContainEqual(
          expect.objectContaining({ nombre: '6.0', cantidad: 70 }),
        );
        expect(formula?.formula?.mezclado).toBe(100);
        expect(formula?.formula?.usado).toBe(95);
        expect(formula?.minutos).toBe(35);
      });

      // ── 12:05 · COBRA: TARJETA Y $100 DE PROPINA EN LA MANO DE KARLA ────────
      await test.step('tarjeta, y la propina a la mano: ni entra al cajón ni es venta', async () => {
        await irPorElMenu(nayeli, 'Cobrar', /para cobrar/);
        const antes = await ventasDeAntes(nayeli);
        const cobro = await elegirLaCita(nayeli, A);
        expect(await aCobrar(cobro)).toBe(SERVICIO.tinteDeRaiz.listaCentavos);
        expect(await cifraJuntoA(nayeli, 'IVA incluido')).toBe(
          ivaIncluidoEn(SERVICIO.tinteDeRaiz.listaCentavos),
        );
        await cobro.getByRole('button', { name: 'Tarjeta', exact: true }).click();
        await cobro.getByLabel('Otra propina, en pesos').fill('100.00');
        await cobro.getByRole('button', { name: 'A la mano' }).click();
        // COBRAR dice lo que pasa por el salón: la propina a la mano no.
        await expect(cobro.getByRole('button', { name: /^COBRAR/ })).toContainText('$650.00');
        cobros['A'] = await cobrarYExigir(nayeli, cobro, SERVICIO.tinteDeRaiz.listaCentavos, antes);
        await expect(
          nayeli.getByText(/Propina de \$100\.00 anotada a nombre de Karla Domínguez\./),
        ).toBeVisible();
        libro.cobro({
          referencia: A.referencia,
          ventaId: cobrado('A').ventaId,
          sesionCajaId: sesion,
          ventaCentavos: SERVICIO.tinteDeRaiz.listaCentavos,
          pagos: { tarjeta: SERVICIO.tinteDeRaiz.listaCentavos },
        });
        causar('Karla', SERVICIO.tinteDeRaiz.listaCentavos);
      });

      // ── 12:20 · DANY: EL CORTE, EN EFECTIVO, Y $30 QUE SE QUEDAN EN EL CAJÓN ─
      await test.step('efectivo, y la propina al cajón: entra al arqueo y se le debe a Dany', async () => {
        const B = citas.B;
        await atenderLaCita(dany, B, dia.diasDesdeHoy);
        await exigirCitaTerminada(dueno, B);
        await irPorElMenu(nayeli, 'Cobrar', /para cobrar/);
        const antes = await ventasDeAntes(nayeli);
        const cobro = await elegirLaCita(nayeli, B);
        expect(await aCobrar(cobro)).toBe(SERVICIO.corteDeDama.listaCentavos);
        await cobro.getByRole('button', { name: 'Efectivo', exact: true }).click();
        await cobro.getByLabel('Otra propina, en pesos').fill('30.00');
        await cobro.getByRole('button', { name: 'Al cajón' }).click();
        await expect(cobro.getByRole('button', { name: /^COBRAR/ })).toContainText('$280.00');
        cobros['B'] = await cobrarYExigir(nayeli, cobro, SERVICIO.corteDeDama.listaCentavos, antes);
        libro.cobro({
          referencia: B.referencia,
          ventaId: cobrado('B').ventaId,
          sesionCajaId: sesion,
          ventaCentavos: SERVICIO.corteDeDama.listaCentavos,
          pagos: { efectivo: SERVICIO.corteDeDama.listaCentavos + 3_000 },
          propina: { efectivo: 3_000 },
        });
        causar('Dany', SERVICIO.corteDeDama.listaCentavos);
        propinaDebida.Dany += 3_000;
      });

      await test.step('el tinte completo de Karla, en efectivo', async () => {
        const C = citas.C;
        await atenderLaCita(karla, C, dia.diasDesdeHoy);
        await exigirCitaTerminada(dueno, C);
        await irPorElMenu(nayeli, 'Cobrar', /para cobrar/);
        const antes = await ventasDeAntes(nayeli);
        const cobro = await elegirLaCita(nayeli, C);
        expect(await aCobrar(cobro)).toBe(SERVICIO.tinteCompleto.listaCentavos);
        await cobro.getByRole('button', { name: 'Efectivo', exact: true }).click();
        cobros['C'] = await cobrarYExigir(
          nayeli,
          cobro,
          SERVICIO.tinteCompleto.listaCentavos,
          antes,
        );
        libro.cobro({
          referencia: C.referencia,
          ventaId: cobrado('C').ventaId,
          sesionCajaId: sesion,
          ventaCentavos: SERVICIO.tinteCompleto.listaCentavos,
          pagos: { efectivo: SERVICIO.tinteCompleto.listaCentavos },
        });
        causar('Karla', SERVICIO.tinteCompleto.listaCentavos);
      });

      await test.step('el lavado de Dany, por transferencia a la cuenta del salón', async () => {
        const D = citas.D;
        await atenderLaCita(dany, D, dia.diasDesdeHoy);
        await exigirCitaTerminada(dueno, D);
        await irPorElMenu(nayeli, 'Cobrar', /para cobrar/);
        const antes = await ventasDeAntes(nayeli);
        const cobro = await elegirLaCita(nayeli, D);
        expect(await aCobrar(cobro)).toBe(SERVICIO.lavadoYPeinado.listaCentavos);
        await cobro.getByRole('button', { name: 'Transferencia', exact: true }).click();
        // El descuadre número uno del giro (§10.1): a qué cuenta cayó se dice, no se supone.
        await expect(cobro.getByRole('radio', { name: 'Cuenta del salón' })).toBeChecked();
        cobros['D'] = await cobrarYExigir(
          nayeli,
          cobro,
          SERVICIO.lavadoYPeinado.listaCentavos,
          antes,
        );
        libro.cobro({
          referencia: D.referencia,
          ventaId: cobrado('D').ventaId,
          sesionCajaId: sesion,
          ventaCentavos: SERVICIO.lavadoYPeinado.listaCentavos,
          pagos: { transferencia: SERVICIO.lavadoYPeinado.listaCentavos },
        });
        causar('Dany', SERVICIO.lavadoYPeinado.listaCentavos);
      });

      await test.step('pago MIXTO del peinado de Karla, con 12 % de propina en la terminal', async () => {
        const E = citas.E;
        await atenderLaCita(karla, E, dia.diasDesdeHoy);
        await exigirCitaTerminada(dueno, E);
        await irPorElMenu(nayeli, 'Cobrar', /para cobrar/);
        const antes = await ventasDeAntes(nayeli);
        const cobro = await elegirLaCita(nayeli, E);
        expect(await aCobrar(cobro)).toBe(SERVICIO.peinadoDeEvento.listaCentavos);
        await cobro.getByRole('button', { name: 'Mixto', exact: true }).click();
        await cobro.locator('#mixto-efectivo').fill('200.00');
        await cobro.locator('#mixto-tarjeta').fill('250.00');
        await expect(cobro.getByText('Cuadra con lo que queda por cobrar.')).toBeVisible();
        await cobro.getByRole('button', { name: '12%', exact: true }).click();
        // Con tarjeta en el pago, la propina va por la terminal: la debe el salón (F-260).
        await expect(cobro.getByRole('button', { name: 'En la terminal' })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        const propina = Math.round((SERVICIO.peinadoDeEvento.listaCentavos * 12) / 100);
        await expect(cobro.getByRole('button', { name: /^COBRAR/ })).toContainText(
          enPesos(SERVICIO.peinadoDeEvento.listaCentavos + propina),
        );
        cobros['E'] = await cobrarYExigir(
          nayeli,
          cobro,
          SERVICIO.peinadoDeEvento.listaCentavos,
          antes,
        );
        libro.cobro({
          referencia: E.referencia,
          ventaId: cobrado('E').ventaId,
          sesionCajaId: sesion,
          ventaCentavos: SERVICIO.peinadoDeEvento.listaCentavos,
          pagos: { efectivo: 20_000, tarjeta: 25_000 + propina },
          propina: { tarjeta: propina },
        });
        causar('Karla', SERVICIO.peinadoDeEvento.listaCentavos);
        propinaDebida.Karla += propina;
      });

      // ── 15:00 · KARLA MIRA SU DÍA EN EL TELÉFONO ───────────────────────────
      await test.step('Karla lee en «Mi día» su comisión y su propina, en dos renglones', async () => {
        await irPorElMenu(karla, 'Mi día', /Hoy llevas/);
        expect
          .soft(
            await cifraJuntoA(karla, 'Comisión'),
            '«Mi día» no enseña la comisión que su regla le da a Karla hoy.',
          )
          .toBe(comisionDe('Karla'));
        // La propina del día es suya y la tiene que poder leer: «sin dato todavía» con tres
        // propinas cobradas es la pantalla diciendo que no lee el ledger de propinas.
        await expect
          .soft(
            karla.locator('dt', { hasText: 'Propina' }).locator('xpath=following-sibling::dd[1]'),
            '«Mi día» no lee la propina de la estilista: siempre dice «sin dato todavía».',
          )
          .not.toHaveText('sin dato todavía');
      });

      // ── 13:30 · EL VALLE: SE ACABÓ EL OXIDANTE Y PATY LO PIDE AL DISTRIBUIDOR ─
      await test.step('Paty compra el oxidante al distribuidor y entra al inventario', async () => {
        await irPorElMenu(paty, 'Compras', /Compras y gastos/);
        await paty.getByRole('button', { name: /^Registrar compra/ }).click();
        const nota = paty.getByRole('dialog', { name: 'Registrar compra' });
        // Se paga por transferencia: no sale del cajón (§8.3, compra al distribuidor).
        await nota.getByRole('combobox').filter({ hasText: 'Efectivo' }).click();
        await paty.getByRole('option', { name: 'Transferencia', exact: true }).click();
        await nota.getByRole('combobox').filter({ hasText: 'Selecciona proveedor' }).click();
        await paty.getByRole('option', { name: PROVEEDOR, exact: true }).click();
        await nota.getByPlaceholder('Buscar ingrediente...').fill(PRODUCTO.oxigenada);
        await nota
          .getByRole('button', { name: new RegExp(`^${literal(PRODUCTO.oxigenada)}`) })
          .click();
        await nota.getByPlaceholder('0', { exact: true }).fill('6');
        // La unidad de compra es la pieza: la botella de litro, como llega en la nota.
        await nota.getByRole('combobox').nth(2).click();
        await paty.getByRole('option', { name: 'pieza', exact: true }).click();
        await nota.getByPlaceholder('$0', { exact: true }).fill('324');
        await nota.getByRole('button', { name: 'Guardar compra' }).click();
        await expect(paty.getByText(/Compra registrada/).first()).toBeVisible({ timeout: 30_000 });
      });

      await test.step('Paty paga los insumos de limpieza con dinero del cajón', async () => {
        await irPorElMenu(paty, 'Caja y corte', /El día está abierto/);
        const gasto = paty.locator('[aria-labelledby="gasto-titulo"]');
        await gasto.locator('#gasto-monto').fill('85.00');
        await gasto.getByRole('button', { name: 'Limpieza' }).click();
        await gasto.locator('#gasto-descripcion').fill('toallas desechables y desinfectante');
        await gasto.getByRole('button', { name: 'Registrar el gasto' }).click();
        await expect(
          gasto.getByText(/^Gasto registrado: salieron \$85\.00 del cajón\.$/),
        ).toBeVisible();
        libro.movimiento(sesion, 'gasto: limpieza', -8_500);
      });

      // ── 16:00 · EL PICO: DOS DESCUENTOS, UNO DENTRO DEL TOPE Y OTRO AUTORIZADO ─
      await test.step('descuento del 10 % dentro del tope de Nayeli, y la comisión lo dice', async () => {
        const F = citas.F;
        await atenderLaCita(dany, F, dia.diasDesdeHoy);
        await exigirCitaTerminada(dueno, F);
        await irPorElMenu(nayeli, 'Cobrar', /para cobrar/);
        const antes = await ventasDeAntes(nayeli);
        const cobro = await elegirLaCita(nayeli, F);
        const lista = SERVICIO.corteDeDama.listaCentavos + SERVICIO.lavadoYPeinado.listaCentavos;
        expect(await aCobrar(cobro)).toBe(lista);
        await cobro.getByRole('button', { name: 'Descuento', exact: true }).click();
        await cobro.locator('#descuento-porcentaje').fill('10');
        await expect(cobro.getByText(/El ticket baja de/)).toBeVisible({ timeout: 20_000 });
        // La frase del §3: la profesional sabe ANTES cuánto le baja la comisión.
        await expect(cobro.getByText(/La comisión de Dany Robles baja de/)).toBeVisible();
        await expect(cobro.getByText(/Pasa de tu tope/)).toHaveCount(0);
        await cobro.getByRole('button', { name: 'Aplicar', exact: true }).click();
        // $45 sobre $450: el 10 % exacto, sin redondeo de por medio.
        const total = lista - 4_500;
        await expect.poll(async () => aCobrar(cobro)).toBe(total);
        await cobro.getByRole('button', { name: 'Efectivo', exact: true }).click();
        cobros['F'] = await cobrarYExigir(nayeli, cobro, total, antes);
        libro.cobro({
          referencia: F.referencia,
          ventaId: cobrado('F').ventaId,
          sesionCajaId: sesion,
          ventaCentavos: total,
          pagos: { efectivo: total },
        });
        // El descuento se reparte entre las líneas en proporción: $25 al corte y $20 al
        // lavado. La comisión es por línea, sobre lo cobrado de cada una.
        causar('Dany', SERVICIO.corteDeDama.listaCentavos - 2_500);
        causar('Dany', SERVICIO.lavadoYPeinado.listaCentavos - 2_000);
      });

      await test.step('descuento del 20 %, sobre el tope: Paty entra con su PIN y lo cobra', async () => {
        const G = citas.G;
        await atenderLaCita(karla, G, dia.diasDesdeHoy);
        await exigirCitaTerminada(dueno, G);

        // Nayeli lo intenta: la pantalla lo dice ANTES y APLICAR se apaga (F-205).
        await irPorElMenu(nayeli, 'Cobrar', /para cobrar/);
        const deNayeli = await elegirLaCita(nayeli, G);
        await deNayeli.getByRole('button', { name: 'Descuento', exact: true }).click();
        await deNayeli.locator('#descuento-porcentaje').fill('20');
        await expect(deNayeli.getByText(/Pasa de tu tope/)).toBeVisible({ timeout: 20_000 });
        await expect(deNayeli.getByRole('button', { name: 'Aplicar', exact: true })).toBeDisabled();
        await deNayeli.getByRole('button', { name: 'Cancelar', exact: true }).click();

        // Quien autoriza ENTRA con su PIN en esta misma terminal y cobra desde su sesión
        // (`cobro.ts`: no hay campo «autorizado por»; la bitácora lleva su nombre).
        await irPorElMenu(paty, 'Cobrar', /para cobrar/);
        const antes = await ventasDeAntes(paty);
        const cobro = await elegirLaCita(paty, G);
        await cobro.getByRole('button', { name: 'Descuento', exact: true }).click();
        await cobro.locator('#descuento-porcentaje').fill('20');
        await expect(cobro.getByText(/El ticket baja de/)).toBeVisible({ timeout: 20_000 });
        await expect(cobro.getByText(/Pasa de tu tope/)).toHaveCount(0);
        await cobro.getByRole('button', { name: 'Aplicar', exact: true }).click();
        const total = SERVICIO.manicure.listaCentavos - 3_600;
        await expect.poll(async () => aCobrar(cobro)).toBe(total);
        await cobro.getByRole('button', { name: 'Efectivo', exact: true }).click();
        cobros['G'] = await cobrarYExigir(paty, cobro, total, antes);
        libro.cobro({
          referencia: G.referencia,
          ventaId: cobrado('G').ventaId,
          sesionCajaId: sesion,
          ventaCentavos: total,
          pagos: { efectivo: total },
        });
        causar('Karla', total);
      });

      // ── 17:00 · PATY DEVUELVE: UNA COMPLETA Y UNA EN PARTE, EN EFECTIVO ─────
      await test.step('Paty devuelve la manicure completa y el lavado de Gabriela', async () => {
        await irPorElMenu(paty, 'Caja y corte', /El día está abierto/);
        const devolucion = paty.locator('[aria-labelledby="devolucion-titulo"]');

        await devolucion.locator('#devolucion-folio').fill(cobrado('G').folio);
        await devolucion.getByRole('button', { name: 'Buscar la venta' }).click();
        await devolucion.getByRole('button', { name: 'Devolver todo lo que queda' }).click();
        await devolucion.getByRole('button', { name: /^Efectivo · hasta/ }).click();
        // Un servicio no regresa al anaquel.
        await devolucion.locator('#devolucion-regresa').uncheck();
        await devolucion.locator('#devolucion-motivo').fill('el esmalte se levantó al otro día');
        await devolucion.getByRole('button', { name: 'Devolver', exact: true }).click();
        await expect(devolucion.getByText(/devuelta completa/)).toBeVisible({ timeout: 30_000 });
        libro.movimiento(sesion, 'devolución de la manicure', -cobrado('G').ventaCentavos);
        // Lo devuelto no se comisiona: contrapartida NEGATIVA, nunca un UPDATE (§7.3).
        causar('Karla', cobrado('G').ventaCentavos, -1);

        await devolucion.locator('#devolucion-folio').fill(cobrado('F').folio);
        await devolucion.getByRole('button', { name: 'Buscar la venta' }).click();
        await devolucion
          .getByLabel(`Cuánto regresa de ${SERVICIO.lavadoYPeinado.nombre}`)
          .first()
          .fill('1');
        await devolucion.getByRole('button', { name: /^Efectivo · hasta/ }).click();
        await devolucion.locator('#devolucion-regresa').uncheck();
        await devolucion.locator('#devolucion-motivo').fill('no se le lavó, sólo se cortó');
        const sale = devolucion.locator('[aria-live="polite"]').filter({ hasText: 'Se devuelven' });
        const parcial = centavosDeTexto(
          /\$[\d,]+\.\d{2}/.exec(await sale.innerText())?.[0] ?? 'NaN',
        );
        // Lo cobrado por esa línea, con su parte del descuento: $200 − $20.
        expect(parcial).toBe(SERVICIO.lavadoYPeinado.listaCentavos - 2_000);
        await devolucion.getByRole('button', { name: 'Devolver', exact: true }).click();
        await expect(devolucion.getByText(/devuelta en parte/)).toBeVisible({ timeout: 30_000 });
        libro.movimiento(sesion, 'devolución del lavado', -parcial);
        causar('Dany', parcial, -1);
      });

      await test.step('Paty saca $500 al banco', async () => {
        await paty.locator('#retiro-importe').fill('500');
        await paty.locator('#retiro-motivo').fill('al banco');
        await paty.getByRole('button', { name: 'Registrar el retiro' }).click();
        await expect(paty.locator('#retiro-importe')).toHaveValue('');
        libro.movimiento(sesion, 'retiro al banco', -50_000);
      });

      // ── 18:30 · SANDRA CUENTA EL ANAQUEL: FALTA UN SHAMPOO ─────────────────
      const sandra = await equipo.pagina(info, 'almacen');
      fallos.push(vigilarFallos(sandra));
      await test.step('Sandra cuenta el shampoo, encuentra uno de menos y ajusta', async () => {
        await sandra.goto('/');
        await irPorElMenu(sandra, 'Inventario', /Ingredientes e insumos/);
        await sandra.getByPlaceholder('Buscar ingrediente...').fill(PRODUCTO.shampoo);
        await sandra.getByRole('button', { name: 'Ajustar', exact: true }).first().click();
        const ajuste = sandra.getByRole('dialog', { name: 'Ajustar stock' });
        // Corrección de conteo, definiendo el stock final: es lo que se contó.
        const hay = await existenciaDe(dueno, PRODUCTO.shampoo);
        await ajuste.getByPlaceholder('0', { exact: true }).fill(String(Math.max(hay - 1, 0)));
        await ajuste
          .getByPlaceholder(/Ej: conteo físico inicial/)
          .fill('conteo del anaquel: falta uno');
        await ajuste.getByRole('button', { name: 'Guardar ajuste' }).click();
        await expect(sandra.getByText(/Stock actualizado/).first()).toBeVisible({
          timeout: 30_000,
        });
        expect(await existenciaDe(dueno, PRODUCTO.shampoo)).toBe(Math.max(hay - 1, 0));
      });

      // ── 19:00 · NAYELI ENTREGA SU TURNO, CON FALTANTE ───────────────────────
      await test.step('corte de turno de Nayeli a ciegas: le faltan $10', async () => {
        const esperado = await esperadoDelCajon(nayeli);
        await irPorElMenu(nayeli, 'Caja y corte', /El día está abierto/);
        const turno = nayeli.locator('form[aria-labelledby="corte-de-turno-titulo"]');
        await turno.locator('#turno-contado').fill(pesos(esperado - 1_000));
        await turno.locator('#turno-notas').fill('se lo entregué a Paty');
        await turno.getByRole('button', { name: 'Entregar el turno' }).click();
        await expect(turno.getByText(/entregado: faltante/)).toBeVisible({ timeout: 30_000 });
        // El corte de turno es una FOTO: no saca nada del cajón (la caja sigue abierta).
        expect(
          await esperadoDelCajon(nayeli),
          'El corte de turno movió el esperado del cajón.',
        ).toBe(esperado);
      });

      // ── 20:15 · EL DUEÑO LIQUIDA A LAS DOS, DEL CAJÓN DE RECEPCIÓN ──────────
      const duenoEnRecepcion = await equipo.paginaEnLaTerminalDe(info, { rol: 'cajero' }, 'dueno');
      fallos.push(vigilarFallos(duenoEnRecepcion));
      await test.step('liquidación: comisión y propina, dos renglones y una salida de caja', async () => {
        await aSuInicio(duenoEnRecepcion);
        await irPorElMenu(duenoEnRecepcion, 'Liquidación', /Elige a quién se le va a pagar/);
        const ahora = Date.now();
        await duenoEnRecepcion.locator('#desde').fill(fechaDelNegocio(ahora));
        // `hasta` es exclusivo y en UTC: dos días cubren lo causado de noche en México.
        await duenoEnRecepcion.locator('#hasta').fill(fechaDelNegocio(ahora + 2 * MS_DIA));
        for (const estilista of ['Karla', 'Dany'] as const) {
          const nombre = NOMBRE_COMPLETO[estilista];
          await duenoEnRecepcion
            .getByRole('row', { name: `Abrir la liquidación de ${nombre}` })
            .click();
          const panel = duenoEnRecepcion.getByRole('region', { name: `Liquidación de ${nombre}` });
          const calcular = panel.getByRole('button', { name: 'Calcular la liquidación' });
          await expect(calcular).toBeVisible({ timeout: 30_000 });
          const comision = comisionDe(estilista);
          const propina = propinaDebida[estilista];
          expect
            .soft(
              await cifraJuntoA(panel, 'Pendiente'),
              `El pendiente de ${estilista} no es lo que su regla le da.`,
            )
            .toBe(comision);
          // PASO 1 · VER: el comprobante ANTES de pagar. «Una vez pagado ya no se discute:
          // se reclama.» Calcular no saca nada del cajón.
          const antesDeVer = await esperadoDelCajon(duenoEnRecepcion);
          await calcular.click();
          const comprobante = panel.getByRole('table', { name: `Comprobante de ${nombre}` });
          await expect(comprobante).toBeVisible({ timeout: 30_000 });
          // Dos renglones, nunca un solo total (§4.4): lo que el salón le paga por trabajar
          // y lo que le dieron sus clientas, que el salón sólo le guardó.
          expect
            .soft(await importeDelRenglon(comprobante, /^Comisión/), `comisión de ${estilista}`)
            .toBe(comision);
          expect
            .soft(
              await importeDelRenglon(comprobante, /^Propina/),
              `La liquidación de ${estilista} no le paga la propina que el salón le debe.`,
            )
            .toBe(propina);
          expect
            .soft(await importeDelRenglon(comprobante, /Se le paga/), `total de ${estilista}`)
            .toBe(comision + propina);
          expect(
            await esperadoDelCajon(duenoEnRecepcion),
            'Ver el comprobante sacó dinero del cajón: el primer paso no paga.',
          ).toBe(antesDeVer);

          // PASO 2 · PAGAR lo que se vio: sale del cajón de recepción, en una sola salida.
          await panel.getByRole('button', { name: 'Pagar la liquidación' }).click();
          await expect(panel.getByText('Liquidación pagada.')).toBeVisible({ timeout: 30_000 });
          expect(
            antesDeVer - (await esperadoDelCajon(duenoEnRecepcion)),
            `La liquidación de ${estilista} no sacó del cajón lo que dijo su comprobante.`,
          ).toBe(comision + propina);
          libro.movimiento(
            sesion,
            `liquidación de ${estilista}: comisión y propina`,
            -(comision + propina),
          );
          // Pagada, el salón ya no le debe propina (F-260: el pasivo se cancela al entregar).
          libro.pasivo(`propina por entregar a ${estilista}`, 0);
        }
      });

      // ── 20:30 · PATY CIERRA EL DÍA A CIEGAS, CON SOBRANTE, Y SU PDF ─────────
      await test.step('Paty cierra el día: sobran $20, y el PDF del corte', async () => {
        const esperado = await esperadoDelCajon(paty);
        const contado = esperado + 2_000;
        await irPorElMenu(paty, 'Caja y corte', /El día está abierto/);
        await paty.locator('#contado').fill(pesos(contado));
        await paty.locator('#dejado').fill(pesos(FONDO_CENTAVOS));
        const pdf = exigirElPdfDelCorte(paty, {
          titulo: 'CORTE DEL DÍA',
          textos: [
            'Arqueo de efectivo',
            'De dónde salió el efectivo esperado',
            `Efectivo esperado ${enPesos(esperado)}`,
            `Diferencia de efectivo ${enPesos(2_000)}`,
            `Dinero dejado en caja ${enPesos(FONDO_CENTAVOS)}`,
            'Liquidación por profesional',
          ],
        });
        await paty.getByRole('button', { name: 'Cerrar el día' }).click();
        await expect(paty.getByRole('heading', { name: 'Día cerrado' })).toBeVisible({
          timeout: 30_000,
        });
        await expect(paty.locator('#corte-lectura')).toContainText(/Sobran/i);
        await pdf;
        libro.contar(sesion, contado);
      });

      // ── 21:10 · EL DUEÑO LEE EL DÍA EN SU TELÉFONO, Y EL DINERO CUADRA ──────
      await test.step('el dueño lee el día en sus reportes', async () => {
        await aSuInicio(dueno);
        await irPorElMenu(dueno, 'Reportes', /Ocupación de mañana/);
        for (const rotulo of [
          'Lo cobrado hoy',
          'Lo que le quedó al salón',
          'Propina por entregar',
        ]) {
          await expect(
            dueno.getByRole('heading', { level: 2, name: rotulo, exact: true }),
          ).toBeVisible();
        }
      });

      const lecturas: LecturasDelGiro = {
        // Lo causado, por estilista y con su nombre corto: la misma llave que el libro.
        comisiones: async (page) => {
          const [causadasDelServidor, delEquipo] = await Promise.all([
            consultarPuente<ComisionDelPuente>(page, 'ComisionCausada', { limite: 500 }),
            consultarPuente<ProfesionalDelPuente>(page, 'Profesional', { limite: 20 }),
          ]);
          const nombre = new Map(delEquipo.map((p) => [p.id ?? '', p.nombre_corto ?? '']));
          return causadasDelServidor.map((c) => ({
            profesional:
              nombre.get(c.profesional_id ?? '') ?? `sin ficha ${c.profesional_id ?? ''}`,
            centavos: BigInt(Math.round((c.monto_centavos ?? 0) * 100)),
          }));
        },
        // Lo que el salón le debe a cada una de propina, como lo dice SU corte.
        pasivos: async (page) => {
          const hoja = await datosDe<{
            readonly extras?: {
              readonly profesionales?: readonly {
                readonly profesional?: string;
                readonly propinaPendienteCentavos?: string;
              }[];
            };
          }>(
            await page.request.post('/api/caja/hoja-del-corte', {
              headers: cabecerasDeEscrituraDePrueba(),
              data: { sesionCajaId: sesion },
            }),
            'caja.hoja_del_corte',
          );
          return (hoja.extras?.profesionales ?? []).map((p) => ({
            concepto: `propina por entregar a ${p.profesional ?? ''}`,
            centavos: BigInt(p.propinaPendienteCentavos ?? '0'),
          }));
        },
      };

      await test.step('el dinero del día cuadra al centavo, y un centavo de más NO cuadra', async () => {
        const conciliacion = await exigirQueCuadre(dueno, libro, lecturas);
        expect(conciliacion.resumen.cobradoCentavos).toBeGreaterThan(0n);

        // La conciliación no da verde por defecto: el mismo día con UN centavo de más en
        // el efectivo de una venta tiene que dar un hallazgo.
        const servidor = await leerElServidor(dueno, lecturas, libro.movimientosPrevios);
        const delLibro = libro.libro();
        const enEfectivo = delLibro.cobros.findIndex((c) => (c.pagos['efectivo'] ?? 0n) > 0n);
        const torcido = {
          ...delLibro,
          cobros: delLibro.cobros.map((c, i) =>
            i === enEfectivo
              ? { ...c, pagos: { ...c.pagos, efectivo: (c.pagos['efectivo'] ?? 0n) + 1n } }
              : c,
          ),
        };
        expect(conciliarElDia(torcido, servidor).hallazgos.length).toBeGreaterThan(0);
      });

      for (const exigirSinFallos of fallos) exigirSinFallos();
    } finally {
      if (recepcion !== null) {
        info.annotations.push({ type: 'caja', description: await soltarLaCaja(recepcion) });
      }
      await equipo.cerrar();
    }
  });
});
