import {
  expect,
  type Browser,
  type Page,
  type Response,
  test,
  type TestInfo,
} from '@playwright/test';

import {
  exigirQueCuadre,
  existenciaDe,
  Libro,
  movimientosDeInventarioPrevios,
  sesionDeLaCaja,
} from './ayudantes/conciliacion.ts';
import { enPesos } from './ayudantes/corte.ts';
import { Equipo, personaDe } from './ayudantes/roles.ts';
import {
  abrirPantalla,
  cabecerasDeEscrituraDePrueba,
  cerrarCajaYCuadrar,
  consultarPuente,
  exigirCobroAceptado,
  exigirDemostracion,
  soltarLaCaja,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * LAS OPERACIONES DE MESA DEL RESTAURANTE, POR LAS «VISTAS ADICIONALES» (`/restaurante/*`).
 *
 * La jornada publicada (`dia-completo-restaurante.spec.ts`) recorre el camino que se presenta
 * —las pantallas heredadas: «Mesas y pedidos», «Cocina» y «Caja»— y por él sólo se cobra una
 * mesa entera, con su propina. Lo que un restaurante hace además cuando la mesa se complica
 * vive en las pantallas nuevas y ninguna prueba publicada lo ejercitaba:
 *
 *   1 · DIVIDIR la cuenta en dos partes y cobrar cada una (efectivo con cambio y tarjeta),
 *       la misma división con un descuento de centavos impares (1b) y el descuento de UNA
 *       parte ya dividida (1c);
 *   2 · un DESCUENTO que pasa del tope de quien cobra, con el PIN de un supervisor, y su cobro;
 *   3 · ANULAR una línea con motivo antes de cobrar;
 *   4 · CANCELAR la cuenta de una mesa con motivo;
 *   5 · CAMBIAR de mesa con la cuenta y la comanda viva, y cobrar en la nueva;
 *   6 · UNIR dos mesas y cobrar el grupo una vez (6), separar otro grupo (6b) y cancelar la
 *       cuenta de un grupo (6c);
 *   7 · al cierre, el cajón cuadra y el día entero concilia al centavo con el servidor.
 *
 * ── Quién hace qué: sólo dirección abre estas pantallas ─────────────────────────
 * Desde el cierre del 21-10 (`rutaPermitidaParaElPuesto`, `AppLayout`) una vista de
 * `/restaurante/*` es de quien la tiene en SU menú —dirección: la dueña y la gerente—, salvo el
 * PIN y el portal del comensal. Rosa, Lupita y Toño que la teclean vuelven a su pantalla, así que
 * esta suite ya no puede ponerlos ahí (el archivo con el que nació sí, y su primer paso moría
 * con la caja heredada en lugar de la nueva). La opera dirección, cada quien desde SU terminal:
 *
 *   · la dueña («Demo») resetea el día, LEE el servidor, atiende la sala —abre la mesa,
 *     comanda, entrega, pide la cuenta, cambia y une mesas—, lleva el tablero de cocina en una
 *     segunda pestaña, y es quien teclea su PIN cuando hace falta un supervisor;
 *   · Beatriz (gerente, tope $2,000 o 30 %) tiene LA caja: la abre con su fondo, cobra, divide,
 *     descuenta, cancela y anula.
 *
 * Los puestos de abajo siguen en la prueba donde son lo único que cuenta: lo que el SERVIDOR les
 * niega (Lupita no anula ni cancela: 403) y el descuento de la cajera con el PIN de la gerente,
 * que sólo se puede dar por el comando porque Rosa ya no llega a la pantalla del cobro.
 *
 * ── Qué se afirma, y dónde se lee ─────────────────────────────────────────────
 * Lo que dice la pantalla no vale por sí solo: una pantalla que dice «cobrado» se ve igual con
 * el comando fallado en silencio. Después de cada paso de dinero o de estado se LEE EL SERVIDOR
 * —por el puente de lectura (`consultarPuente`) y por las rutas de lectura de la API— con la
 * sesión de la dueña, que lo ve todo: la cuenta y su total, las líneas que siguen vivas, las
 * comandas de cocina, la mesa, la bitácora de la cuenta (`MovimientoCuenta`), el grupo de mesas
 * (`UnionMesa`), el ledger del almacén por venta y el corte. Y al final el libro de lo que se
 * cobró se concilia al centavo contra el servidor (`exigirQueCuadre`), como en los cinco días.
 *
 * ── Cómo se corre ────────────────────────────────────────────────────────────
 * Igual que la jornada: contra una demo del restaurante sembrada y un servidor propio,
 *
 *   MORPHIQPOS_ORG_DEMO=demo-acople-restaurante MORPHIQPOS_DEMO_PERSONA=Demo MORPHIQPOS_DEMO_PIN=1234 \
 *   pnpm test:e2e pruebas/e2e/restaurante-operaciones.spec.ts --project=escritorio --workers=1 --retries=0
 *
 * El día es UNO para todo el archivo, como en `restaurante-concurrencia.spec.ts`: la primera
 * prueba resetea la demo y abre la caja de Beatriz; cada una usa SUS mesas; la última (7) cierra
 * la caja y concilia. Corre después de las otras suites del restaurante, en el mismo servidor: no
 * depende de lo que dejaron, porque empieza reseteando. Una prueba suelta (`--grep`) también
 * corre: resetea, abre la caja y se queda con la caja abierta, y `7` la cierra.
 *
 * ── El orden, y por qué DEBE ser la última del restaurante en su trabajo ─────────
 * Una demo en la que se dividió una cuenta ya no se puede resetear (D-6, abajo): `resetear_demo`
 * contesta 500 y `scripts/sembrar-demos.mjs` también falla, hasta que alguien limpia la base a
 * mano o la recrea. Por eso (1) las dos pruebas de dividir van después de las demás, para que un
 * fallo anterior no se vuelva una cascada de «ERROR_INTERNO» al reiniciar Playwright su proceso y
 * volver a resetear; (2) en CI esta suite va DESPUÉS de las otras del restaurante y ninguna que
 * resetee puede ir tras ella; y (3) para repetirla en la misma base no basta sembrar: hay que
 * recrearla (`base-desechable.mjs bajar` y `subir`). Con D-6 arreglado, nada de esto aplica.
 *
 * ── Los hallazgos: pruebas en `test.fixme` ───────────────────────────────────
 * Un defecto de la aplicación NO se arregla aquí ni se afirma «tal como está»: se deja una prueba
 * `test.fixme` que exige lo CORRECTO, con un comentario que dice qué falla y dónde. El día que se
 * arregle, se quita el `fixme` y tiene que pasar sin tocar nada más.
 *
 *   D-2 · ninguna pantalla separa un grupo de mesas (`restaurante.separar_mesas` no cuelga de nada);
 *   D-3 · lo que cocina dejó listo para la mesa unida no se entrega desde la principal;
 *   D-4 · la pantalla de la mesa unida dice «está libre» y ofrece «Abrir la mesa»;
 *   D-5 · la autorización firmada del supervisor sirve para otra cuenta (no va atada a la cuenta);
 *   D-6 · una demo con una cuenta dividida no se puede resetear (500 al confirmar el reseteo);
 *   D-7 · cancelar la cuenta de un grupo deja viva en cocina la comanda de la mesa unida.
 *
 * (D-1, «cobrar el grupo de mesas unidas sólo recoge la principal», se arregló en el cierre del
 * 21-10 y ya no es un hallazgo: la prueba 6 exige el comportamiento correcto.)
 *
 * ── Lo que NO está aquí, y está dicho ────────────────────────────────────────
 * «Quién autorizó» el descuento no se puede leer del corte del restaurante: su hoja no trae
 * `autorizaciones_descuento` (sólo la de tienda y ferretería, `caja/corte/documento.ts`), y esa
 * tabla no está en el puente. Se afirma con lo que el comando contesta y guarda —`autorizadoPor`:
 * el supervisor, y no quien cobra— y «quién pidió» con quien cobró y con el corte por usuario.
 *
 * Tampoco está el IVA fuera del precio (cambiar la configuración del negocio a mitad del día
 * movería el total de todas las demás pruebas), ni que la mesera NO vea «Anular» en la pantalla
 * (ya no llega a ella: eso lo prueba `ajustes-de-la-cuenta-por-rol.test.ts`; aquí, lo que el
 * servidor le niega). Se corre en la PC (`--project=escritorio`), como las otras suites del
 * restaurante que cuelgan de la jornada.
 */

const SLUG = 'demo-acople-restaurante';

/** $1,500 por montones: el fondo con el que Beatriz abre su caja. */
const FONDO = { monedas: 30_000, chicos: 70_000, grandes: 50_000 } as const;
const FONDO_CENTAVOS = FONDO.monedas + FONDO.chicos + FONDO.grandes;

/**
 * LA CARTA, en centavos, escrita aquí y no leída del catálogo: una prueba que compara el
 * cobro contra la misma tabla de la que el cobro sale no prueba nada.
 */
const CARTA = {
  arrachera: { nombre: 'Arrachera al carbón', centavos: 32_900 },
  sopa: { nombre: 'Sopa de tortilla', centavos: 11_500 },
  cerveza: { nombre: 'Cerveza clara 355 ml', centavos: 5_500 },
} as const;

/** Lo que cada platillo gasta del almacén (receta de la semilla), a mano por la misma razón. */
const RECETA: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'Arrachera al carbón': {
    Arrachera: 280,
    'Arroz rojo': 150,
    'Frijol bayo cocido': 150,
    'Tortilla de maíz': 4,
  },
  'Sopa de tortilla': { 'Crema ácida': 40, Jitomate: 150, 'Tortilla de maíz': 3 },
  // La cerveza no tiene receta: el producto ES el insumo.
  'Cerveza clara 355 ml': { 'Cerveza clara 355 ml': 1 },
};
const INSUMOS = [...new Set(Object.values(RECETA).flatMap((receta) => Object.keys(receta)))];

interface Platillo {
  readonly nombre: string;
  readonly veces: number;
}

const PRECIO: Readonly<Record<string, number>> = Object.fromEntries(
  Object.values(CARTA).map((p) => [p.nombre, p.centavos]),
);

/** Lo que valen unos platillos, en centavos. */
function importeDe(platillos: readonly Platillo[]): number {
  return platillos.reduce((suma, p) => suma + p.veces * (PRECIO[p.nombre] ?? Number.NaN), 0);
}

/** Lo que las recetas sacan del almacén por esos platillos, por insumo. */
function consumoDe(platillos: readonly Platillo[]): Readonly<Record<string, number>> {
  const total: Record<string, number> = {};
  for (const { nombre, veces } of platillos) {
    for (const [insumo, cantidad] of Object.entries(RECETA[nombre] ?? {})) {
      total[insumo] = (total[insumo] ?? 0) + veces * cantidad;
    }
  }
  return total;
}

/** El 10 % de la mesa, con el redondeo del dominio (la mitad hacia arriba). */
const diezPorCiento = (centavos: number): number => Math.round(centavos * 0.1);

/** Pesos como los lleva un campo: `329.00`. */
const pesos = (centavos: number): string => (centavos / 100).toFixed(2);

const enCentavos = (valorEnPesos: number | null | undefined): number =>
  Math.round((valorEnPesos ?? 0) * 100);

/* ═══════════════════════════════════════════════════════════════════════════════
 * LO QUE EL SERVIDOR DICE
 * ═══════════════════════════════════════════════════════════════════════════════ */

interface FilaDeVenta {
  readonly id?: string;
  readonly estado?: string | null;
  readonly folio?: string | null;
  readonly total?: number | null;
  readonly descuentos?: number | null;
  readonly mesa_id?: string | null;
  readonly cliente_nombre?: string | null;
  readonly motivo_cancelacion?: string | null;
  readonly cancelada_en?: string | null;
  readonly usuario_cajero_nombre?: string | null;
  readonly corte_caja_id?: string | null;
  readonly monto_efectivo?: number | null;
  readonly monto_tarjeta?: number | null;
  readonly monto_transferencia?: number | null;
  readonly propina_efectivo?: number | null;
  readonly propina_tarjeta?: number | null;
  readonly propina_transferencia?: number | null;
  readonly cambio?: number | null;
}

/** Una cuenta tal como la tiene el servidor, TODO en centavos. */
interface Cuenta {
  readonly id: string;
  readonly estado: string;
  readonly folio: string | null;
  readonly totalCentavos: number;
  readonly descuentoCentavos: number;
  readonly mesaId: string | null;
  readonly etiqueta: string | null;
  readonly motivoDeCancelacion: string | null;
  readonly canceladaEn: string | null;
  readonly cobrador: string | null;
  readonly sesionCajaId: string | null;
  /** Lo que entró por cada método, propina incluida y sin el cambio. */
  readonly pagos: Readonly<Record<'efectivo' | 'tarjeta' | 'transferencia', number>>;
  readonly propinas: Readonly<Record<'efectivo' | 'tarjeta' | 'transferencia', number>>;
  readonly cambioCentavos: number;
}

async function leerCuenta(page: Page, ordenId: string): Promise<Cuenta> {
  const [fila] = await consultarPuente<FilaDeVenta>(page, 'Venta', {
    filtro: { id: ordenId },
    limite: 1,
  });
  expect(fila, `El servidor no tiene la cuenta ${ordenId}.`).toBeDefined();
  return {
    id: ordenId,
    estado: fila?.estado ?? '',
    folio: fila?.folio ?? null,
    totalCentavos: enCentavos(fila?.total),
    descuentoCentavos: enCentavos(fila?.descuentos),
    mesaId: fila?.mesa_id ?? null,
    etiqueta: fila?.cliente_nombre ?? null,
    motivoDeCancelacion: fila?.motivo_cancelacion ?? null,
    canceladaEn: fila?.cancelada_en ?? null,
    cobrador: fila?.usuario_cajero_nombre ?? null,
    sesionCajaId: fila?.corte_caja_id ?? null,
    pagos: {
      efectivo: enCentavos(fila?.monto_efectivo),
      tarjeta: enCentavos(fila?.monto_tarjeta),
      transferencia: enCentavos(fila?.monto_transferencia),
    },
    propinas: {
      efectivo: enCentavos(fila?.propina_efectivo),
      tarjeta: enCentavos(fila?.propina_tarjeta),
      transferencia: enCentavos(fila?.propina_transferencia),
    },
    cambioCentavos: enCentavos(fila?.cambio),
  };
}

/** Una línea de la cuenta, en centavos. */
interface Linea {
  readonly id: string;
  readonly nombre: string;
  readonly cantidad: number;
  readonly descuentoCentavos: number;
  readonly totalCentavos: number;
}

async function todasLasLineas(page: Page, ordenId: string): Promise<readonly Linea[]> {
  const filas = await consultarPuente<{
    id?: string;
    producto_nombre?: string | null;
    cantidad?: number | string | null;
    descuento?: number | null;
    total?: number | null;
  }>(page, 'DetalleVenta', { filtro: { venta_id: ordenId }, limite: 120 });
  return filas
    .map((f) => ({
      id: f.id ?? '',
      nombre: f.producto_nombre ?? '',
      cantidad: Number(f.cantidad ?? 0),
      descuentoCentavos: enCentavos(f.descuento),
      totalCentavos: enCentavos(f.total),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre) || a.cantidad - b.cantidad);
}

/** Lo que `venta.estado` cotiza de la cuenta: sólo las líneas que SIGUEN cobrándose. */
async function cotizacionDe(
  page: Page,
  ordenId: string,
): Promise<{
  readonly lineas: readonly { readonly id: string; readonly nombre: string }[];
  readonly totalCentavos: number;
  readonly descuentoCentavos: number;
}> {
  const respuesta = await page.request.post('/api/venta/estado', {
    headers: cabecerasDeEscrituraDePrueba(),
    data: { ordenId },
  });
  expect(respuesta.status(), `venta.estado: ${await respuesta.text()}`).toBe(200);
  const cuerpo = (await respuesta.json()) as {
    readonly datos?: {
      readonly cotizacion?: {
        readonly lineas?: readonly { readonly id: string; readonly productoNombre: string }[];
        readonly totalCentavos?: string;
        readonly descuentoCentavos?: string;
      } | null;
    };
  };
  const cotizacion = cuerpo.datos?.cotizacion;
  expect(cotizacion, `venta.estado no cotizó la cuenta ${ordenId}.`).toBeTruthy();
  return {
    lineas: (cotizacion?.lineas ?? []).map((l) => ({ id: l.id, nombre: l.productoNombre })),
    totalCentavos: Number(cotizacion?.totalCentavos ?? Number.NaN),
    descuentoCentavos: Number(cotizacion?.descuentoCentavos ?? Number.NaN),
  };
}

/** Las líneas que siguen en la cuenta (sin las anuladas), con sus importes. */
async function lineasVivas(page: Page, ordenId: string): Promise<readonly Linea[]> {
  const [todas, cotizacion] = await Promise.all([
    todasLasLineas(page, ordenId),
    cotizacionDe(page, ordenId),
  ]);
  const vivas = new Set(cotizacion.lineas.map((l) => l.id));
  return todas.filter((l) => vivas.has(l.id));
}

/** Nombre, unidades e importe de cada línea, para comparar con lo que se esperaba. */
const comoSe = (lineas: readonly Linea[]): readonly (readonly [string, number, number])[] =>
  lineas.map((l) => [l.nombre, l.cantidad, l.totalCentavos] as const);

interface Comanda {
  readonly id: string;
  readonly estado: string;
  readonly mesaNumero: number | null;
  readonly items: readonly {
    readonly nombre: string;
    readonly cantidad: number;
    readonly estado: string;
  }[];
}

/** Una comanda tal como la entrega el puente (`PedidoPreparacion`). */
interface FilaDeComanda {
  readonly id?: string;
  readonly estado?: string;
  readonly mesa_numero?: number | null;
  readonly created_date?: string;
  readonly items?: readonly {
    readonly producto_nombre?: string | null;
    readonly cantidad?: number | string | null;
    readonly estado?: string | null;
  }[];
}

/** Las comandas de la más vieja a la más nueva: así el orden no depende del servidor. */
function comoComandas(filas: readonly FilaDeComanda[]): readonly Comanda[] {
  return [...filas]
    .sort((a, b) => (a.created_date ?? '').localeCompare(b.created_date ?? ''))
    .map((f) => ({
      id: f.id ?? '',
      estado: f.estado ?? '',
      mesaNumero: f.mesa_numero ?? null,
      items: (f.items ?? []).map((i) => ({
        nombre: i.producto_nombre ?? '',
        cantidad: Number(i.cantidad ?? 0),
        estado: i.estado ?? '',
      })),
    }));
}

/** Las comandas de UNA CUENTA: las que se mandaron a cocina mientras esa cuenta era la viva. */
async function comandasDe(page: Page, ordenId: string): Promise<readonly Comanda[]> {
  return comoComandas(
    await consultarPuente<FilaDeComanda>(page, 'PedidoPreparacion', {
      filtro: { venta_id: ordenId },
      limite: 30,
    }),
  );
}

const estadosDe = (comandas: readonly Comanda[]): readonly string[] =>
  comandas.map((c) => c.estado);

/** Las comandas de una MESA, de la cuenta que sea: lo que cocina sirve en ella. */
async function comandasDeLaMesa(page: Page, mesaId: string): Promise<readonly Comanda[]> {
  return comoComandas(
    await consultarPuente<FilaDeComanda>(page, 'PedidoPreparacion', {
      filtro: { mesa_id: mesaId },
      limite: 30,
    }),
  );
}

interface MesaLeida {
  readonly id: string;
  readonly numero: number;
  readonly estado: string;
  readonly ordenId: string | null;
  readonly personas: number;
}

async function leerMesa(page: Page, numero: number): Promise<MesaLeida> {
  const [fila] = await consultarPuente<{
    id?: string;
    estado?: string;
    venta_activa_id?: string | null;
    personas_actuales?: number | null;
  }>(page, 'Mesa', { filtro: { numero }, limite: 1 });
  expect(fila, `El servidor no tiene la mesa ${String(numero)}.`).toBeDefined();
  return {
    id: fila?.id ?? '',
    numero,
    estado: fila?.estado ?? '',
    ordenId: fila?.venta_activa_id ?? null,
    personas: fila?.personas_actuales ?? 0,
  };
}

/** La bitácora de la cuenta (`MovimientoCuenta`): qué se le hizo y por qué. */
async function movimientosDeLaCuenta(
  page: Page,
  ordenId: string,
): Promise<
  readonly {
    readonly tipo: string;
    readonly motivo: string | null;
    readonly quien: string | null;
  }[]
> {
  const filas = await consultarPuente<{
    tipo?: string;
    motivo?: string | null;
    usuario_nombre?: string | null;
  }>(page, 'MovimientoCuenta', { filtro: { venta_origen_id: ordenId }, limite: 50 });
  return filas.map((f) => ({
    tipo: f.tipo ?? '',
    motivo: f.motivo ?? null,
    quien: f.usuario_nombre ?? null,
  }));
}

/** Lo que el ledger del almacén le atribuye a UNA venta: insumo → unidades que salieron. */
async function consumoDeLaVenta(
  page: Page,
  ordenId: string,
): Promise<Readonly<Record<string, number>>> {
  const filas = await consultarPuente<{
    referencia_id?: string | null;
    ingrediente_nombre?: string | null;
    tipo_movimiento?: string | null;
    cantidad?: number | string | null;
  }>(page, 'MovimientoInventario', { limite: 2000 });
  const salio: Record<string, number> = {};
  for (const fila of filas) {
    if (fila.referencia_id !== ordenId) continue;
    const insumo = fila.ingrediente_nombre ?? '';
    // Un movimiento de venta es una SALIDA: la cantidad viene con signo negativo.
    salio[insumo] = (salio[insumo] ?? 0) - Number(fila.cantidad ?? 0);
  }
  return salio;
}

/** La existencia de cada insumo vigilado, ahora. */
async function existencias(page: Page): Promise<Readonly<Record<string, number>>> {
  const salida: Record<string, number> = {};
  for (const insumo of INSUMOS) salida[insumo] = await existenciaDe(page, insumo);
  return salida;
}

/** Las existencias que bajaron entre dos fotos, por insumo (sólo las que se movieron). */
function loQueBajo(
  antes: Readonly<Record<string, number>>,
  despues: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  const bajo: Record<string, number> = {};
  for (const insumo of INSUMOS) {
    const delta = (antes[insumo] ?? 0) - (despues[insumo] ?? 0);
    if (Math.abs(delta) > 1e-9) bajo[insumo] = delta;
  }
  return bajo;
}

/** El efectivo que el servidor espera en el cajón de la terminal de esta pestaña, en centavos. */
async function esperadoDelCajon(page: Page): Promise<number> {
  const respuesta = await page.request.post('/api/caja/estado', {
    headers: cabecerasDeEscrituraDePrueba(),
    data: { efectivoContadoCentavos: 0 },
  });
  expect(respuesta.status(), 'No se pudo leer el estado de la caja de esta terminal.').toBe(200);
  const cuerpo = (await respuesta.json()) as {
    readonly datos?: { readonly efectivoEsperadoCentavos?: string };
  };
  const esperado = Number(cuerpo.datos?.efectivoEsperadoCentavos ?? Number.NaN);
  expect(Number.isFinite(esperado), 'La caja no dijo cuánto efectivo espera.').toBe(true);
  return esperado;
}

/** Lo que devuelve una escritura por la API, ya abierto. */
interface Contestacion<T> {
  readonly estado: number;
  readonly ok: boolean;
  readonly datos: T | undefined;
  readonly codigo: string | undefined;
  readonly mensaje: string | undefined;
}

/** Llama a un comando como lo llama la pantalla (mismas cabeceras), con la sesión de esa pestaña. */
async function comando<T>(page: Page, ruta: string, cuerpo: unknown): Promise<Contestacion<T>> {
  const respuesta = await page.request.post(ruta, {
    headers: cabecerasDeEscrituraDePrueba(),
    data: cuerpo,
  });
  const texto = await respuesta.text();
  let abierto: {
    ok?: boolean;
    datos?: T;
    error?: { codigo?: string; mensaje?: string };
  } = {};
  try {
    abierto = JSON.parse(texto) as typeof abierto;
  } catch {
    // Un cuerpo que no es JSON es un fallo del servidor: el estado y el texto lo dicen abajo.
  }
  return {
    estado: respuesta.status(),
    ok: abierto.ok === true,
    datos: abierto.datos,
    codigo: abierto.error?.codigo,
    mensaje: abierto.error?.mensaje ?? (abierto.ok === true ? undefined : texto.slice(0, 300)),
  };
}

/**
 * LA CUENTA QUEDÓ COBRADA EN EL SERVIDOR, con el dinero y el desglose que se cobró.
 *
 * Se espera por la CONDICIÓN (la cuenta pagada), con techo amplio: el cobro es la transacción más
 * larga del sistema —estado, folio, pagos, caja y ledger de inventario—. Y después se exige, al
 * centavo, la venta, lo que entró por cada método, la propina por método tal como se cobró y la
 * caja que la cobró.
 */
async function exigirCuentaCobrada(
  page: Page,
  ordenId: string,
  esperado: {
    readonly ventaCentavos: number;
    readonly pagos: Partial<Record<'efectivo' | 'tarjeta' | 'transferencia', number>>;
    readonly propina: Partial<Record<'efectivo' | 'tarjeta' | 'transferencia', number>>;
    readonly cambioCentavos?: number;
    readonly sesionCajaId: string;
  },
): Promise<Cuenta> {
  let cuenta: Cuenta | undefined;
  await expect
    .poll(
      async () => {
        cuenta = await leerCuenta(page, ordenId);
        return cuenta.estado;
      },
      {
        message:
          'La pantalla dijo «cobrado» y la cuenta no está pagada en el servidor: se quedaría en ' +
          'blanco igual si el comando hubiera fallado en silencio, así que lo que vale es esto.',
        timeout: 45_000,
      },
    )
    .toBe('pagada');
  const cobrada = cuenta!;
  expect(cobrada.folio ?? '', 'La cuenta está pagada y no tiene folio.').not.toBe('');
  expect(
    cobrada.totalCentavos,
    'La venta no es la que dijo la pantalla. Un peso de diferencia es un peso que falta en el corte.',
  ).toBe(esperado.ventaCentavos);
  for (const metodo of ['efectivo', 'tarjeta', 'transferencia'] as const) {
    expect(cobrada.pagos[metodo], `Lo que entró por ${metodo} no es lo que se cobró.`).toBe(
      esperado.pagos[metodo] ?? 0,
    );
    expect(
      cobrada.propinas[metodo],
      `La propina por ${metodo} no es la que se cobró: el desglose es exacto, no proporcional.`,
    ).toBe(esperado.propina[metodo] ?? 0);
  }
  if (esperado.cambioCentavos !== undefined) {
    expect(cobrada.cambioCentavos, 'El cambio guardado no es el que se devolvió.').toBe(
      esperado.cambioCentavos,
    );
  }
  expect(cobrada.sesionCajaId, 'La cuenta se cobró en otra caja.').toBe(esperado.sesionCajaId);
  return cobrada;
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * LO QUE SE HACE EN LAS PANTALLAS
 * ═══════════════════════════════════════════════════════════════════════════════ */

const MAPA = { etiqueta: 'Leyenda de estados' } as const;

/** Un nombre de platillo como texto literal dentro de una expresión regular. */
const escapar = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function alMapa(page: Page): Promise<void> {
  await abrirPantalla(page, '/restaurante/mapa-de-mesas', MAPA);
}

/** Llega a la mesa `numero` por el mapa, que es por donde llega el mesero. */
async function aLaMesa(page: Page, numero: number): Promise<void> {
  await alMapa(page);
  await page.getByRole('button', { name: new RegExp(`^${String(numero)}\\s`) }).click();
  await page.waitForURL(/\/restaurante\/mesa-activa\?mesa=/);
  await expect(
    page.getByRole('heading', { name: `Mesa ${String(numero)}`, exact: true }),
  ).toBeVisible();
}

/**
 * ABRE LA MESA `numero` DESDE EL MAPA, como lo hace el mesero: toca la mesa libre, dice para
 * cuántas personas y la abre. Devuelve la mesa y la cuenta que se abrió, que se LEE del servidor.
 */
async function abrirLaMesa(
  page: Page,
  numero: number,
  personas: number,
): Promise<{ readonly mesaId: string; readonly ordenId: string }> {
  await alMapa(page);
  await page.getByRole('button', { name: new RegExp(`^${String(numero)}\\s+Libre`) }).click();
  await page.waitForURL(/\/restaurante\/mesa-activa\?mesa=/);
  const mesaId = new URL(page.url()).searchParams.get('mesa') ?? '';
  expect(mesaId, `La mesa ${String(numero)} no llevó su identificador en la dirección.`).not.toBe(
    '',
  );

  await expect(page.getByText(`Mesa ${String(numero)} está libre`)).toBeVisible();
  const delta = personas - 2;
  const boton = page.getByRole('button', {
    name: delta >= 0 ? 'Una persona más' : 'Una persona menos',
  });
  for (let i = 0; i < Math.abs(delta); i += 1) await boton.click();
  await page.getByRole('button', { name: 'Abrir la mesa' }).click();
  await expect(page.getByText(`${String(personas)} personas`).first()).toBeVisible({
    timeout: 30_000,
  });

  let ordenId = '';
  await expect
    .poll(
      async () => {
        ordenId = (await leerMesa(page, numero)).ordenId ?? '';
        return ordenId;
      },
      { message: `La mesa ${String(numero)} se abrió y el servidor no le ve cuenta viva.` },
    )
    .not.toBe('');
  return { mesaId, ordenId };
}

/** Toca cada platillo las veces que se piden. En tableta el pedido vive en una hoja: se abre. */
async function armarElPedido(page: Page, platillos: readonly Platillo[]): Promise<void> {
  for (const { nombre, veces } of platillos) {
    // El importe se NOMBRA para el lector de pantalla —«329 pesos con 00 centavos»—, así que el
    // nombre accesible de la tesela es el platillo y, detrás, un número.
    const tesela = page.getByRole('button', { name: new RegExp(`^${escapar(nombre)}\\s+\\d`) });
    for (let i = 0; i < veces; i += 1) await tesela.click();
  }
  const flotante = page.getByRole('button', { name: /^Abrir el pedido/ });
  if (await flotante.isVisible()) await flotante.click();
}

/** ENVÍA A COCINA y espera la RESPUESTA del servidor: una comanda perdida es un plato que no sale. */
async function enviarElPedido(page: Page): Promise<void> {
  const [respuesta] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === '/api/restaurante/enviar-pedido' &&
        r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'ENVIAR A COCINA' }).click(),
  ]);
  expect(
    respuesta.status(),
    `El servidor rechazó el envío a cocina: ${(await respuesta.text()).slice(0, 300)}`,
  ).toBe(200);
}

/**
 * LAS COMANDAS EXISTEN en el servidor con las líneas que se pidieron, ni una más ni una menos
 * (cocina y barra son dos comandas de la misma cuenta).
 */
async function exigirComandasDe(
  page: Page,
  ordenId: string,
  pedido: readonly Platillo[],
): Promise<readonly Comanda[]> {
  const esperado = new Map(pedido.map((p) => [p.nombre, p.veces]));
  let comandas: readonly Comanda[] = [];
  await expect
    .poll(
      async () => {
        comandas = await comandasDe(page, ordenId);
        const hay = new Map<string, number>();
        for (const comanda of comandas) {
          for (const item of comanda.items) {
            hay.set(item.nombre, (hay.get(item.nombre) ?? 0) + item.cantidad);
          }
        }
        return [...hay.entries()].sort(([a], [b]) => a.localeCompare(b));
      },
      {
        message:
          'La comanda no llegó al servidor con las líneas que pidió el mesero: una comanda perdida ' +
          'es un platillo que nunca sale.',
      },
    )
    .toEqual([...esperado.entries()].sort(([a], [b]) => a.localeCompare(b)));
  return comandas;
}

/** Las tarjetas de la mesa en el tablero de cocina (cocina y barra son dos comandas). */
function tarjetasDeLaMesa(cocina: Page, rotulo: string) {
  return cocina
    .getByRole('listitem')
    .filter({ has: cocina.getByRole('heading', { name: rotulo, exact: true }) });
}

/**
 * Abre la columna del tablero de cocina que se va a mirar. En la PC y en la tableta las tres
 * están a la vista y no hay nada que hacer; en el teléfono (hasta 767 px, como el propio
 * tablero) van en pestañas y sólo se pinta la que está abierta.
 */
async function enLaColumna(cocina: Page, columna: 'Nuevos' | 'En prep.' | 'Listos'): Promise<void> {
  if ((cocina.viewportSize()?.width ?? Number.POSITIVE_INFINITY) > 767) return;
  const pestana = cocina.getByRole('tab', { name: new RegExp(`^${escapar(columna)}`) });
  await pestana.click();
  await expect(pestana).toHaveAttribute('aria-selected', 'true');
}

/** Cocina lleva cada comanda de la mesa de «Nuevos» a «Listos»: la inicia y la marca lista. */
async function cocinaDejaListaLaMesa(
  cocina: Page,
  numero: number,
  comandas: number,
): Promise<void> {
  const mesa = `Mesa ${String(numero)}`;
  const iniciar = cocina.getByRole('button', { name: `Iniciar — ${mesa}`, exact: true });
  const marcar = cocina.getByRole('button', { name: `Marcar listo — ${mesa}`, exact: true });
  await enLaColumna(cocina, 'Nuevos');
  await expect(iniciar).toHaveCount(comandas, { timeout: 30_000 });
  for (let i = 0; i < comandas; i += 1) {
    await iniciar.first().click();
    // La tarjeta sale de «Nuevos» cuando el servidor movió la comanda: el siguiente toque es a otra.
    await expect(iniciar).toHaveCount(comandas - i - 1, { timeout: 30_000 });
  }
  await enLaColumna(cocina, 'En prep.');
  await expect(marcar).toHaveCount(comandas, { timeout: 30_000 });
  for (let i = 0; i < comandas; i += 1) {
    await marcar.first().click();
    await expect(marcar).toHaveCount(comandas - i - 1, { timeout: 30_000 });
  }
  await enLaColumna(cocina, 'Listos');
  await expect(
    cocina.getByRole('button', { name: `Quitar de la lista — ${mesa}`, exact: true }),
  ).toHaveCount(comandas);
}

/** Cocina quita de su lista lo que ya salió: lo mueve de «Listos» a entregado, desde su tablero. */
async function cocinaQuitaDeLaLista(cocina: Page, numero: number, comandas: number): Promise<void> {
  const quitar = cocina.getByRole('button', {
    name: `Quitar de la lista — Mesa ${String(numero)}`,
    exact: true,
  });
  await enLaColumna(cocina, 'Listos');
  await expect(quitar).toHaveCount(comandas, { timeout: 30_000 });
  for (let i = 0; i < comandas; i += 1) await quitar.first().click();
  await expect(quitar).toHaveCount(0);
}

/**
 * La sala ve en la mesa lo que cocina dejó listo —con las palabras de la ventana— y lo entrega.
 * `yNoDice` son los platillos que NO pueden estar ahí (los que se anularon).
 */
async function entregarEnLaMesa(
  sala: Page,
  numero: number,
  platillo: string,
  yNoDice: readonly string[] = [],
): Promise<void> {
  await aLaMesa(sala, numero);
  const listos = sala.getByRole('region', { name: /Listos para recoger/ });
  await expect(listos).toBeVisible({ timeout: 30_000 });
  await expect(listos).toContainText(platillo);
  for (const ausente of yNoDice) await expect(listos).not.toContainText(ausente);
  await listos.getByRole('button', { name: 'Marcar entregado' }).click();
  await expect(listos).toBeHidden();
}

/** «Mesa limpia»: la mesa cobrada vuelve al servicio. */
async function limpiarLaMesa(sala: Page, numero: number): Promise<void> {
  await aLaMesa(sala, numero);
  await expect(sala.getByRole('region', { name: 'Mesa por limpiar' })).toBeVisible();
  await sala.getByRole('button', { name: 'Mesa limpia' }).click();
  await expect(sala.getByText(`Mesa ${String(numero)} está libre`)).toBeVisible();
}

/** Abre la mesa activa de una mesa YA abierta por su dirección, como quien llega con el enlace. */
async function irALaMesa(page: Page, mesaId: string, numero: number): Promise<void> {
  await page.goto(`/restaurante/mesa-activa?mesa=${encodeURIComponent(mesaId)}`);
  await expect(
    page.getByRole('heading', { name: `Mesa ${String(numero)}`, exact: true }),
  ).toBeVisible();
}

/** Los descuentos que el corte le atribuye a quien se llama así: cuántas ventas y cuánto en centavos. */
function descuentosDe(
  hoja: Awaited<ReturnType<typeof hojaDelCorte>>,
  quien: RegExp,
): { readonly ventas: number; readonly montoCentavos: number } {
  const suyos = hoja.descuentosPorUsuario.filter((d) => quien.test(d.usuario ?? ''));
  return {
    ventas: suyos.reduce((suma, d) => suma + d.ventas, 0),
    montoCentavos: suyos.reduce((suma, d) => suma + Number(d.montoCentavos), 0),
  };
}

/** Lo que dice el corte de la caja: la hoja que el PDF imprime, en una lectura. */
async function hojaDelCorte(
  page: Page,
  sesionCajaId: string,
): Promise<{
  readonly cancelaciones: readonly {
    readonly tipo: string;
    readonly usuario: string | null;
    readonly motivo: string | null;
    readonly montoCentavos: string;
  }[];
  readonly descuentosPorUsuario: readonly {
    readonly usuario: string | null;
    readonly ventas: number;
    readonly montoCentavos: string;
  }[];
}> {
  const hoja = await comando<{
    cancelaciones: readonly {
      tipo: string;
      usuario: string | null;
      motivo: string | null;
      montoCentavos: string;
    }[];
    descuentosPorUsuario: readonly {
      usuario: string | null;
      ventas: number;
      montoCentavos: string;
    }[];
  }>(page, '/api/caja/hoja-del-corte', { sesionCajaId });
  expect(hoja.ok, `caja.hoja_del_corte: ${String(hoja.estado)} ${hoja.mensaje ?? ''}`).toBe(true);
  return {
    cancelaciones: hoja.datos?.cancelaciones ?? [],
    descuentosPorUsuario: hoja.datos?.descuentosPorUsuario ?? [],
  };
}

/**
 * La mesa pide su cuenta, con la propina que le dice al mesero (o «la decide la caja»). Quien la
 * pide ya está en la mesa activa; el diálogo la manda a la precuenta de ESA cuenta.
 */
async function pedirLaCuentaDeLaMesa(sala: Page, propina: RegExp): Promise<void> {
  await sala
    .getByRole('group', { name: /^Acciones de/ })
    .getByRole('button', { name: /^Pedir/ })
    .click();
  await sala.getByRole('group', { name: 'Propina' }).getByRole('button', { name: propina }).click();
  await sala.waitForURL(/\/restaurante\/precuenta\?cuenta=/);
  await expect(sala.getByRole('article', { name: /^Precuenta de la mesa/ })).toBeVisible();
}

/** Beatriz abre en su caja la cuenta que se llama `rotulo`: la lista se relee sola, así que se espera. */
async function abrirLaCuentaEnCaja(caja: Page, rotulo: RegExp): Promise<void> {
  await abrirPantalla(caja, '/restaurante/caja', /Pendientes/);
  await caja.getByRole('button', { name: rotulo }).first().click();
  await caja.waitForURL(/\/restaurante\/cobro\?cuenta=/);
  await expect(caja.getByText('Total a cobrar', { exact: true })).toBeVisible();
}

/** El número grande de «Total a cobrar», en centavos: con la propina elegida, venta más propina. */
async function totalDelCobro(page: Page): Promise<number> {
  const rotulo = page.getByText('Total a cobrar', { exact: true });
  await expect(rotulo, 'El cobro no enseña «Total a cobrar».').toBeVisible();
  const texto = await rotulo.locator('xpath=..').innerText();
  const cifra = /\$\s*[\d,]+(?:\.\d{1,2})?/.exec(texto);
  expect(cifra, `El cobro no dice un total: «${texto.replace(/\s+/g, ' ')}».`).not.toBeNull();
  return Math.round(Number(cifra![0].replace(/[^\d.]/g, '')) * 100);
}

/** El pedido completo hasta la cuenta pedida: abre la mesa, comanda y verifica la comanda. */
async function sentarYComandar(
  sala: Page,
  duena: Page,
  numero: number,
  personas: number,
  pedido: readonly Platillo[],
): Promise<{
  readonly mesaId: string;
  readonly ordenId: string;
  readonly comandas: readonly Comanda[];
}> {
  const { mesaId, ordenId } = await abrirLaMesa(sala, numero, personas);
  await armarElPedido(sala, pedido);
  await enviarElPedido(sala);
  const comandas = await exigirComandasDe(duena, ordenId, pedido);
  expect(comandas.length, 'Cocina y barra son dos comandas de la misma cuenta.').toBeGreaterThan(0);
  return { mesaId, ordenId, comandas };
}

/**
 * Que la cocina ya NO ve una mesa: lo que el tablero pinta es lo que leyó hace dos segundos, así
 * que se espera a dos lecturas COMPLETAS del servidor después de este punto —la segunda empezó
 * cuando la primera ya había terminado, o sea, después del cambio— y entonces se cuenta.
 */
async function exigirQueLaCocinaNoVeLaMesa(cocina: Page, mesa: string): Promise<void> {
  const esLecturaDeComandas = (r: Response): boolean =>
    new URL(r.url()).pathname === '/api/datos/consultar' &&
    r.request().method() === 'POST' &&
    (r.request().postData() ?? '').includes('PedidoPreparacion');
  await cocina.waitForResponse(esLecturaDeComandas);
  await cocina.waitForResponse(esLecturaDeComandas);
  await expect(
    tarjetasDeLaMesa(cocina, mesa),
    `La cocina sigue enseñando tarjetas de «${mesa}» que ya no tiene que preparar.`,
  ).toHaveCount(0);
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * EL DÍA
 * ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * El día es UNO para todo el archivo y sigue de una prueba a la siguiente: se resetea una vez,
 * Beatriz abre su caja una vez y el libro anota cada cobro. Si una prueba cae y Playwright
 * reinicia su proceso, esto vuelve a empezar de cero —otro reseteo, otro libro— y la siguiente
 * corre limpia: ninguna depende del estado que dejó otra, salvo la última, que concilia lo que
 * las demás anotaron.
 */
const libro = new Libro();
let reseteado = false;
let sesionDeBeatriz = '';

interface Dia {
  readonly equipo: Equipo;
  /** La dueña: lee el servidor, atiende la sala y es quien teclea su PIN de supervisor. */
  readonly duena: Page;
  /** Su segunda pestaña: el tablero de cocina, que se relee solo cada dos segundos. */
  readonly cocina: Page;
  /** La gerente: su terminal tiene LA caja. */
  readonly beatriz: Page;
  /** Falla si CUALQUIERA de las tres pantallas recibió un 4xx, un 5xx o un `{ok:false}`. */
  readonly exigirSinFallos: () => void;
}

/** El techo de cada acción: sin él un clic sobre algo que no aparece espera la prueba entera. */
function conTecho(page: Page): Page {
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(30_000);
  return page;
}

/** Abre la caja de esta terminal por la pantalla nueva, con el fondo por montones. */
async function abrirLaCajaPorLaPantalla(caja: Page): Promise<void> {
  await abrirPantalla(caja, '/restaurante/caja', /Caja cerrada|Pendientes/);
  await caja.locator('#caja-fondo-monedas').fill(pesos(FONDO.monedas));
  await caja.locator('#caja-fondo-chicos').fill(pesos(FONDO.chicos));
  await caja.locator('#caja-fondo-grandes').fill(pesos(FONDO.grandes));
  await caja.getByRole('button', { name: 'Abrir caja' }).click();
  await expect(caja.getByRole('tab', { name: /Pendientes/ })).toBeVisible({ timeout: 30_000 });
}

/**
 * Cada quien en su puesto, con la caja de Beatriz abierta. El reseteo y la apertura de la caja
 * pasan UNA vez por corrida: después de un reseteo el servidor revoca la sesión de todos menos la
 * de quien lo pide, y volver a entrar por prueba gasta el límite de entradas (20 por origen cada
 * cinco minutos) con un 429 que parece fragilidad y es aritmética.
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
    for (const insumo of INSUMOS) libro.existenciaAntes(insumo, await existenciaDe(duena, insumo));
    reseteado = true;
  }

  const beatriz = conTecho(await equipo.pagina(info, 'gerente'));
  const cocina = conTecho(await duena.context().newPage());
  const sinFallos = [duena, cocina, beatriz].map((pagina) => vigilarFallos(pagina));

  if ((await sesionDeLaCaja(beatriz)) === null) await abrirLaCajaPorLaPantalla(beatriz);
  const sesion = (await sesionDeLaCaja(beatriz)) ?? '';
  expect(sesion, 'La caja dice abierta y el servidor no tiene su sesión.').not.toBe('');
  if (sesionDeBeatriz !== sesion) {
    libro.abrirCaja('caja de Beatriz', sesion, FONDO_CENTAVOS);
    sesionDeBeatriz = sesion;
  }

  // La cocina deja abierto su tablero todo el día: se relee solo cada dos segundos.
  await abrirPantalla(cocina, '/restaurante/cocina', /Sin comandas pendientes|Nuevos/);
  return {
    equipo,
    duena,
    cocina,
    beatriz,
    exigirSinFallos: () => {
      for (const exigir of sinFallos) exigir();
    },
  };
}

test.describe('las operaciones de mesa del restaurante, por las vistas adicionales', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info, SLUG);
  });

  // ── 2 · DESCUENTO CON LA AUTORIZACIÓN DE UN SUPERVISOR, Y SU COBRO ───────────
  test('2 · descuento sobre el tope de Beatriz, con el PIN de un supervisor, y su cobro', async ({
    browser,
  }, info) => {
    test.setTimeout(10 * 60_000);
    const dia = await empezarElDia(browser, info);
    const { duena, cocina, beatriz } = dia;
    try {
      const supervisor = personaDe(SLUG, 'dueno');
      const pedido = [
        { nombre: CARTA.arrachera.nombre, veces: 2 },
        { nombre: CARTA.cerveza.nombre, veces: 2 },
      ] as const;
      const bruta = importeDe(pedido);
      // El 40 %: pasa del 30 % de Beatriz (su tope en pesos, $2,000, no se toca) y cabe en el
      // de la dueña, que es la única que puede autorizarla.
      const descuento = Math.round(bruta * 0.4);
      const venta = bruta - descuento;
      const propina = diezPorCiento(venta);
      const antes = await existencias(duena);

      const { ordenId } = await sentarYComandar(duena, duena, 4, 4, pedido);
      await cocinaDejaListaLaMesa(cocina, 4, (await comandasDe(duena, ordenId)).length);
      await entregarEnLaMesa(duena, 4, CARTA.arrachera.nombre);
      await pedirLaCuentaDeLaMesa(duena, /^10 %/);
      expect(await leerCuenta(duena, ordenId)).toMatchObject({
        estado: 'cuenta_solicitada',
        totalCentavos: bruta,
        descuentoCentavos: 0,
      });

      await abrirLaCuentaEnCaja(beatriz, /^(Cobrar )?Mesa 4\b/);
      expect(await totalDelCobro(beatriz)).toBe(bruta + diezPorCiento(bruta));

      await test.step('el servidor, y no sólo la pantalla, exige al supervisor: sin su autorización no se descuenta', async () => {
        const sinPin = await comando(beatriz, '/api/restaurante/descontar-cuenta', {
          ordenId,
          descuentoCentavos: descuento,
          motivo: 'mesa de la casa',
        });
        expect(sinPin.ok, 'El servidor dejó descontar sobre el tope sin la autorización.').toBe(
          false,
        );
        // Es una regla de negocio, no un permiso del rol: 422 y el mensaje dice qué falta.
        expect(sinPin.estado).toBe(422);
        expect(sinPin.mensaje ?? '').toMatch(/supervisor/);
        expect(await leerCuenta(duena, ordenId)).toMatchObject({
          totalCentavos: bruta,
          descuentoCentavos: 0,
        });
      });

      let supervisorEmpleo = '';
      await test.step('Beatriz descuenta el 40 % y la pantalla pide a quien autoriza, con su PIN', async () => {
        const [tope] = await Promise.all([
          beatriz.waitForResponse(
            (r) => new URL(r.url()).pathname === '/api/venta/tope-de-descuento',
          ),
          beatriz.getByRole('button', { name: 'Descuento', exact: true }).click(),
        ]);
        const quienes = (await tope.json()) as {
          readonly datos: {
            readonly topeCentavos: string;
            readonly topeBp: number;
            readonly quienesAutorizan: readonly {
              readonly empleoId: string;
              readonly nombre: string;
            }[];
          };
        };
        // El tope de la gerente es el de la siembra: $2,000 o el 30 %.
        expect(Number(quienes.datos.topeCentavos)).toBe(200_000);
        expect(quienes.datos.topeBp).toBe(3_000);
        // Nadie se autoriza a sí mismo: Beatriz no está entre quienes pueden autorizarla.
        expect(quienes.datos.quienesAutorizan.map((q) => q.nombre)).not.toContain('Beatriz');
        supervisorEmpleo =
          quienes.datos.quienesAutorizan.find((q) => q.nombre === supervisor.nombre)?.empleoId ??
          '';
        expect(
          supervisorEmpleo,
          `«${supervisor.nombre}» no está entre quienes pueden autorizar.`,
        ).not.toBe('');

        const dialogo = beatriz.getByRole('dialog', { name: 'Descuento' });
        await dialogo.getByRole('button', { name: 'En porcentaje' }).click();
        await dialogo.locator('#descuento-porcentaje').fill('40');
        await dialogo.locator('#descuento-motivo').fill('mesa de la casa');
        // Pasa del tope de quien cobra: la pantalla lo dice y pide a quien autoriza.
        await expect(dialogo.getByText(/Pasa de tu tope/)).toBeVisible();
        await expect(dialogo.getByRole('button', { name: 'Aplicar el descuento' })).toBeDisabled();
        await dialogo
          .getByRole('group', { name: 'Quién autoriza' })
          .getByRole('button', { name: supervisor.nombre })
          .click();
        await dialogo.locator('#descuento-pin').fill(supervisor.pin);
        // La autorización firmada que contesta el servidor viaja con el descuento.
        const [firmada] = await Promise.all([
          beatriz.waitForResponse(
            (r) =>
              new URL(r.url()).pathname === '/api/identidad/supervisor' &&
              r.request().method() === 'POST',
          ),
          dialogo.getByRole('button', { name: 'Autorizar' }).click(),
        ]);
        const autorizacion =
          ((await firmada.json()) as { readonly datos?: { readonly autorizacion?: string } }).datos
            ?.autorizacion ?? '';
        expect(autorizacion, 'El servidor no firmó la autorización.').not.toBe('');
        await expect(dialogo.getByText(`Autorizó ${supervisor.nombre}.`)).toBeVisible();
        const [aplicado] = await Promise.all([
          beatriz.waitForResponse(
            (r) =>
              new URL(r.url()).pathname === '/api/restaurante/descontar-cuenta' &&
              r.request().method() === 'POST',
          ),
          dialogo.getByRole('button', { name: 'Aplicar el descuento' }).click(),
        ]);
        expect(aplicado.status(), await aplicado.text()).toBe(200);
        const resultado = (await aplicado.json()) as {
          readonly datos: {
            readonly descuentoCentavos: string;
            readonly totalCentavos: string;
            readonly autorizadoPor: string | null;
          };
        };
        // Lo que el servidor guardó: quién autorizó es el supervisor, y no quien cobra.
        expect(resultado.datos.autorizadoPor).toBe(supervisorEmpleo);
        expect(Number(resultado.datos.descuentoCentavos)).toBe(descuento);
        expect(Number(resultado.datos.totalCentavos)).toBe(venta);
        await expect(dialogo).toBeHidden();
      });

      await test.step('el servidor guardó el descuento: la venta baja y se reparte entre las líneas', async () => {
        await expect
          .poll(() => leerCuenta(duena, ordenId))
          .toMatchObject({ totalCentavos: venta, descuentoCentavos: descuento });
        const lineas = await lineasVivas(duena, ordenId);
        const suma = (campo: 'totalCentavos' | 'descuentoCentavos'): number =>
          lineas.reduce((total, l) => total + l[campo], 0);
        expect(suma('totalCentavos'), 'Las líneas no suman la venta con descuento.').toBe(venta);
        expect(
          suma('descuentoCentavos'),
          'El descuento no se repartió entero entre las líneas.',
        ).toBe(descuento);
        expect(suma('totalCentavos') + suma('descuentoCentavos')).toBe(bruta);
        // El 10 % de la mesa se aplica sobre lo que de verdad se vende, no sobre lo de antes.
        await expect.poll(() => totalDelCobro(beatriz)).toBe(venta + propina);
      });

      // Lo que el corte decía de los descuentos de Beatriz ANTES de este cobro: el día ya trae otros.
      const descuentosDeBeatrizAntes = descuentosDe(
        await hojaDelCorte(beatriz, sesionDeBeatriz),
        /^Beatriz/,
      );

      await test.step('Beatriz cobra con tarjeta: lo cobrado es la suma de las líneas menos el descuento', async () => {
        await beatriz.getByRole('button', { name: 'Tarjeta', exact: true }).click();
        await beatriz.getByRole('button', { name: /^COBRAR/ }).click();
        await exigirCobroAceptado(beatriz, /pasa sola a limpieza/);
        const cobrada = await exigirCuentaCobrada(beatriz, ordenId, {
          ventaCentavos: venta,
          pagos: { tarjeta: venta + propina },
          propina: { tarjeta: propina },
          sesionCajaId: sesionDeBeatriz,
        });
        libro.cobro({
          referencia: 'mesa 4 con 40 % de descuento autorizado',
          ventaId: ordenId,
          sesionCajaId: sesionDeBeatriz,
          ventaCentavos: venta,
          pagos: { tarjeta: venta + propina },
          propina: { tarjeta: propina },
        });
        // Σ líneas − descuento = lo que entró sin su propina.
        expect(cobrada.pagos.tarjeta - cobrada.propinas.tarjeta).toBe(bruta - descuento);
        // Quién pidió el descuento es quien cobró, y la autorización es de OTRA persona.
        expect(cobrada.cobrador ?? '').toMatch(/^Beatriz/);
        expect(supervisorEmpleo).not.toBe('');
      });

      await test.step('el corte lo dice con nombre: el descuento de la mesa 4, agrupado por quien lo aplicó', async () => {
        const despues = descuentosDe(await hojaDelCorte(beatriz, sesionDeBeatriz), /^Beatriz/);
        // Lo que cambió en el corte es ESTA venta, con su descuento, a nombre de quien cobró.
        expect({
          ventas: despues.ventas - descuentosDeBeatrizAntes.ventas,
          montoCentavos: despues.montoCentavos - descuentosDeBeatrizAntes.montoCentavos,
        }).toEqual({ ventas: 1, montoCentavos: descuento });
      });

      await test.step('el almacén bajó lo que cobra la receta, una vez', async () => {
        expect(await consumoDeLaVenta(duena, ordenId)).toEqual(consumoDe(pedido));
        expect(loQueBajo(antes, await existencias(duena))).toEqual(consumoDe(pedido));
      });
      await limpiarLaMesa(duena, 4);
      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // ── 2b · EL DESCUENTO DE LA CAJERA, CON EL PIN DE LA GERENTE ─────────────────
  // Rosa ya no llega a la pantalla del cobro (es de dirección), así que lo que la cajera con su
  // tope de $50 o 10 % y la gerente con su PIN le hacen a una cuenta se prueba donde el servidor
  // lo decide: por el comando, con la sesión de Rosa, y se lee lo que guardó.
  test('2b · la cajera pide más de su tope y la gerente lo autoriza con SU PIN: el servidor guarda quién autorizó', async ({
    browser,
  }, info) => {
    test.setTimeout(6 * 60_000);
    const dia = await empezarElDia(browser, info);
    const { duena } = dia;
    try {
      const gerente = personaDe(SLUG, 'gerente');
      const rosa = await dia.equipo.pagina(info, 'cajero');
      const pedido = [{ nombre: CARTA.cerveza.nombre, veces: 2 }] as const;
      const bruta = importeDe(pedido);
      // El 20 %: pasa del 10 % de Rosa y cabe en el 30 % de la gerente.
      const descuento = Math.round(bruta * 0.2);

      const { ordenId } = await sentarYComandar(duena, duena, 3, 2, pedido);
      await pedirLaCuentaDeLaMesa(duena, /^La decide la caja/);

      await test.step('la premisa: Rosa teclea la pantalla del cobro y vuelve a su caja, así que el descuento de la cajera se prueba por el comando', async () => {
        await rosa.goto('/restaurante/cobro');
        await rosa.waitForURL(/\/caja$/);
      });

      await test.step('sin autorización, el servidor se lo niega a la cajera y la cuenta no cambia', async () => {
        const sinPin = await comando(rosa, '/api/restaurante/descontar-cuenta', {
          ordenId,
          descuentoCentavos: descuento,
          motivo: 'mesa de la casa',
        });
        expect(sinPin.ok, 'La cajera descontó sobre su tope sin autorización.').toBe(false);
        expect(sinPin.estado).toBe(422);
        expect(sinPin.mensaje ?? '').toMatch(/supervisor/);
        expect(await leerCuenta(duena, ordenId)).toMatchObject({
          totalCentavos: bruta,
          descuentoCentavos: 0,
        });
      });

      let gerenteEmpleo = '';
      await test.step('la gerente teclea su PIN en la terminal de Rosa: un PIN equivocado no autoriza y el bueno sí', async () => {
        const tope = await comando<{
          readonly topeCentavos: string;
          readonly topeBp: number;
          readonly quienesAutorizan: readonly {
            readonly empleoId: string;
            readonly nombre: string;
          }[];
        }>(rosa, '/api/venta/tope-de-descuento', {});
        expect(tope.ok, `venta.tope_de_descuento: ${tope.mensaje ?? ''}`).toBe(true);
        // El tope de la cajera es el de la siembra: $50 o el 10 %.
        expect(Number(tope.datos?.topeCentavos)).toBe(5_000);
        expect(tope.datos?.topeBp).toBe(1_000);
        gerenteEmpleo =
          tope.datos?.quienesAutorizan.find((q) => q.nombre === gerente.nombre)?.empleoId ?? '';
        expect(gerenteEmpleo, `«${gerente.nombre}» no puede autorizar.`).not.toBe('');

        const equivocado = await comando(rosa, '/api/identidad/supervisor', {
          empleoId: gerenteEmpleo,
          pin: '0000',
        });
        expect(equivocado.ok, 'Un PIN equivocado firmó una autorización.').toBe(false);
        expect(equivocado.estado).toBeGreaterThanOrEqual(400);
        expect(equivocado.estado).toBeLessThan(500);
      });

      await test.step('con la autorización de la gerente el descuento se aplica y el servidor guarda quién la dio', async () => {
        const firmada = await comando<{ readonly autorizacion: string }>(
          rosa,
          '/api/identidad/supervisor',
          { empleoId: gerenteEmpleo, pin: gerente.pin },
        );
        expect(firmada.ok, `identidad.supervisor: ${firmada.mensaje ?? ''}`).toBe(true);
        const aplicado = await comando<{
          readonly descuentoCentavos: string;
          readonly totalCentavos: string;
          readonly autorizadoPor: string | null;
        }>(rosa, '/api/restaurante/descontar-cuenta', {
          ordenId,
          descuentoCentavos: descuento,
          motivo: 'mesa de la casa',
          autorizacion: firmada.datos?.autorizacion,
        });
        expect(aplicado.ok, `restaurante.descontar_cuenta: ${aplicado.mensaje ?? ''}`).toBe(true);
        expect(aplicado.datos?.autorizadoPor, 'Quién autorizó no es la gerente.').toBe(
          gerenteEmpleo,
        );
        expect(Number(aplicado.datos?.descuentoCentavos)).toBe(descuento);
        expect(Number(aplicado.datos?.totalCentavos)).toBe(bruta - descuento);
        await expect
          .poll(() => leerCuenta(duena, ordenId))
          .toMatchObject({ totalCentavos: bruta - descuento, descuentoCentavos: descuento });
      });

      await test.step('la cuenta de prueba se cancela: no es una venta y la mesa vuelve a libre', async () => {
        const cancelada = await comando(rosa, '/api/restaurante/cancelar-orden', {
          ordenId,
          motivo: 'prueba del PIN de la gerente',
        });
        expect(cancelada.ok, `cancelar la cuenta de prueba: ${cancelada.mensaje ?? ''}`).toBe(true);
        expect(await leerMesa(duena, 3)).toMatchObject({ estado: 'libre', ordenId: null });
        expect((await leerCuenta(duena, ordenId)).estado).toBe('cancelada');
      });
      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // ── 3 · ANULAR UNA LÍNEA CON MOTIVO, ANTES DE COBRAR ─────────────────────────
  test('3 · anular una línea con motivo antes de cobrar: cocina deja de verla, no se cobra y el almacén no la descuenta', async ({
    browser,
  }, info) => {
    test.setTimeout(10 * 60_000);
    const dia = await empezarElDia(browser, info);
    const { duena, cocina, beatriz } = dia;
    try {
      const pedido = [
        { nombre: CARTA.arrachera.nombre, veces: 2 },
        { nombre: CARTA.sopa.nombre, veces: 1 },
        { nombre: CARTA.cerveza.nombre, veces: 2 },
      ] as const;
      const quedan = [
        { nombre: CARTA.arrachera.nombre, veces: 2 },
        { nombre: CARTA.cerveza.nombre, veces: 2 },
      ] as const;
      const venta = importeDe(quedan);
      const propina = diezPorCiento(venta);
      const antes = await existencias(duena);

      const { mesaId, ordenId } = await sentarYComandar(duena, duena, 5, 4, pedido);
      expect(await leerCuenta(duena, ordenId)).toMatchObject({
        totalCentavos: importeDe(pedido),
      });

      await test.step('la mesera NO puede anular: el servidor se lo niega y la cuenta no cambia', async () => {
        const lupita = await dia.equipo.pagina(info, 'mesero');
        const sopa = (await todasLasLineas(duena, ordenId)).find(
          (l) => l.nombre === CARTA.sopa.nombre,
        );
        expect(sopa, 'La cuenta no tiene la sopa que se comandó.').toBeDefined();
        const negado = await comando(lupita, '/api/restaurante/anular-linea', {
          ordenId,
          lineaId: sopa?.id,
          motivo: 'error_mesero',
        });
        expect(negado.estado).toBe(403);
        expect(negado.codigo).toBe('SIN_PERMISO');
        expect(await leerCuenta(duena, ordenId)).toMatchObject({
          totalCentavos: importeDe(pedido),
        });
      });

      await test.step('Beatriz anula la sopa con su motivo, antes de que cocina la haga', async () => {
        await irALaMesa(beatriz, mesaId, 5);
        // En la tableta la cuenta vive en una hoja que sube desde abajo; en la PC, en el panel.
        const hoja = beatriz.getByRole('button', { name: /^Abrir el pedido/ });
        const anular = beatriz.getByRole('button', { name: `Anular ${CARTA.sopa.nombre}` });
        await expect(hoja.or(anular).first()).toBeVisible({ timeout: 30_000 });
        if (await hoja.isVisible()) await hoja.click();
        await anular.click();
        const dialogo = beatriz.getByRole('dialog', { name: `Quitar ${CARTA.sopa.nombre}` });
        // La sopa no ha salido de cocina: no hay insumo gastado que advertir.
        await expect(dialogo.getByText(/ya salió de/)).toHaveCount(0);
        // Sin motivo no se quita: una línea que desaparece sin motivo parece un robo.
        await expect(dialogo.getByRole('button', { name: 'Quitar de la cuenta' })).toBeDisabled();
        await dialogo.getByLabel('Me equivoqué al tomar la orden').check();
        await dialogo.getByRole('button', { name: 'Quitar de la cuenta' }).click();
        await expect(dialogo).toBeHidden();
      });

      await test.step('el servidor guardó la anulación: la cuenta baja y queda dicho quién y por qué', async () => {
        await expect.poll(async () => (await leerCuenta(duena, ordenId)).totalCentavos).toBe(venta);
        expect(comoSe(await lineasVivas(duena, ordenId))).toEqual([
          [CARTA.arrachera.nombre, 2, 2 * CARTA.arrachera.centavos],
          [CARTA.cerveza.nombre, 2, 2 * CARTA.cerveza.centavos],
        ]);
        // Anular no borra: la línea sigue en la base, marcada, y no se cobra.
        expect((await todasLasLineas(duena, ordenId)).map((l) => l.nombre)).toContain(
          CARTA.sopa.nombre,
        );
        expect(await movimientosDeLaCuenta(duena, ordenId)).toContainEqual({
          tipo: 'anulacion_linea',
          motivo: 'error_mesero',
          quien: expect.stringMatching(/^Beatriz/) as unknown,
        });
        const items = (await comandasDe(duena, ordenId)).flatMap((c) => c.items);
        expect(items.find((i) => i.nombre === CARTA.sopa.nombre)?.estado).toBe('cancelado');
        expect(
          items.filter((i) => i.nombre !== CARTA.sopa.nombre && i.estado === 'cancelado'),
          'Anular la sopa canceló otros platillos de cocina.',
        ).toEqual([]);
      });

      await test.step('cocina deja de ver la sopa: la tarjeta de la mesa 5 sólo enseña lo que sigue', async () => {
        await enLaColumna(cocina, 'Nuevos');
        const tarjetas = tarjetasDeLaMesa(cocina, 'Mesa 5');
        await expect(tarjetas).toHaveCount(2, { timeout: 30_000 });
        // El item de la sopa está cancelado, no borrado: la tarjeta no lo enseña, o el cocinero
        // haría un plato que nadie va a pagar.
        await expect(tarjetas.filter({ hasText: CARTA.sopa.nombre })).toHaveCount(0);
        await expect(tarjetas.filter({ hasText: CARTA.arrachera.nombre })).toHaveCount(1);
        await cocinaDejaListaLaMesa(cocina, 5, 2);
        await entregarEnLaMesa(duena, 5, CARTA.arrachera.nombre, [CARTA.sopa.nombre]);
      });

      await test.step('la precuenta sale sin la sopa y con el total de lo que sigue', async () => {
        await pedirLaCuentaDeLaMesa(duena, /^10 %/);
        const hoja = duena.getByRole('article', { name: /^Precuenta de la mesa 5/ });
        await expect(hoja).toContainText(enPesos(venta));
        await expect(hoja).toContainText(enPesos(venta + propina));
        await expect(hoja).toContainText(CARTA.arrachera.nombre);
        await expect(hoja).not.toContainText(CARTA.sopa.nombre);
      });

      await test.step('Beatriz cobra la mesa 5: la sopa anulada no se cobra', async () => {
        await abrirLaCuentaEnCaja(beatriz, /^(Cobrar )?Mesa 5\b/);
        // El desglose se pinta dos veces —plegado en tableta y a la vista en PC—: basta con que
        // las líneas ya estén en la página, que es lo que dice que se leyeron.
        await expect(beatriz.getByText(CARTA.arrachera.nombre).first()).toBeAttached();
        await expect(beatriz.getByText(CARTA.sopa.nombre)).toHaveCount(0);
        expect(await totalDelCobro(beatriz)).toBe(venta + propina);
        await beatriz.getByRole('button', { name: /^COBRAR/ }).click();
        await exigirCobroAceptado(beatriz, /pasa sola a limpieza/);
        await exigirCuentaCobrada(beatriz, ordenId, {
          ventaCentavos: venta,
          pagos: { efectivo: venta + propina },
          propina: { efectivo: propina },
          cambioCentavos: 0,
          sesionCajaId: sesionDeBeatriz,
        });
        libro.cobro({
          referencia: 'mesa 5 con la sopa anulada',
          ventaId: ordenId,
          sesionCajaId: sesionDeBeatriz,
          ventaCentavos: venta,
          pagos: { efectivo: venta + propina },
          propina: { efectivo: propina },
        });
      });

      await test.step('el inventario por receta NO descuenta lo anulado: sólo bajó lo cobrado', async () => {
        const delaVenta = await consumoDeLaVenta(duena, ordenId);
        expect(delaVenta).toEqual(consumoDe(quedan));
        // Lo que sólo gasta la sopa no se movió ni un gramo.
        for (const insumo of ['Crema ácida', 'Jitomate']) {
          expect(delaVenta[insumo], `«${insumo}» bajó por una sopa que se anuló.`).toBeUndefined();
        }
        expect(loQueBajo(antes, await existencias(duena))).toEqual(consumoDe(quedan));
      });
      await limpiarLaMesa(duena, 5);
      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // ── 4 · CANCELAR LA CUENTA DE UNA MESA, CON MOTIVO ───────────────────────────
  test('4 · cancelar la cuenta de una mesa con motivo: no se cobra, cocina deja de verla y la mesa vuelve a libre', async ({
    browser,
  }, info) => {
    test.setTimeout(8 * 60_000);
    const dia = await empezarElDia(browser, info);
    const { duena, cocina, beatriz } = dia;
    try {
      const pedido = [
        { nombre: CARTA.arrachera.nombre, veces: 1 },
        { nombre: CARTA.cerveza.nombre, veces: 1 },
      ] as const;
      const motivo = 'se capturó en la mesa equivocada';
      const antes = await existencias(duena);
      const cajonAntes = await esperadoDelCajon(beatriz);

      const { mesaId, ordenId } = await sentarYComandar(duena, duena, 6, 2, pedido);
      // Cocina la ve: dos tarjetas, la de la plancha y la de la barra.
      await enLaColumna(cocina, 'Nuevos');
      await expect(tarjetasDeLaMesa(cocina, 'Mesa 6')).toHaveCount(2, { timeout: 30_000 });
      await irALaMesa(duena, mesaId, 6);
      await pedirLaCuentaDeLaMesa(duena, /^La decide la caja/);

      await test.step('la mesera NO puede cancelar la cuenta: el servidor se lo niega y la cuenta sigue viva', async () => {
        const lupita = await dia.equipo.pagina(info, 'mesero');
        const negado = await comando(lupita, '/api/restaurante/cancelar-orden', {
          ordenId,
          motivo: 'no debería poder',
        });
        expect(negado.estado).toBe(403);
        expect(negado.codigo).toBe('SIN_PERMISO');
        expect((await leerCuenta(duena, ordenId)).estado).toBe('cuenta_solicitada');
      });

      await abrirLaCuentaEnCaja(beatriz, /^(Cobrar )?Mesa 6\b/);
      await beatriz.getByRole('button', { name: 'Cancelar la cuenta', exact: true }).click();
      const dialogo = beatriz.getByRole('dialog', { name: 'Cancelar la cuenta' });
      // Sin motivo no se cancela: una venta que desaparece sin motivo parece un robo.
      await expect(
        dialogo.getByRole('button', { name: 'Cancelar la cuenta sin cobrar' }),
      ).toBeDisabled();
      await dialogo.locator('#cancelar-cuenta-motivo').fill(motivo);
      await dialogo.getByRole('button', { name: 'Cancelar la cuenta sin cobrar' }).click();
      await expect(beatriz.getByText(/Ninguna cuenta está esperando cobro/)).toBeVisible();

      await test.step('el servidor la tiene cancelada, con su motivo, sin folio y sin un solo pago', async () => {
        await expect
          .poll(() => leerCuenta(duena, ordenId))
          .toMatchObject({ estado: 'cancelada', motivoDeCancelacion: motivo });
        const cuenta = await leerCuenta(duena, ordenId);
        expect(cuenta.canceladaEn, 'La cancelación no dejó su hora.').not.toBeNull();
        expect(cuenta.folio, 'Una cuenta cancelada no consume folio.').toBeNull();
        expect(cuenta.pagos).toEqual({ efectivo: 0, tarjeta: 0, transferencia: 0 });
        expect(cuenta.propinas).toEqual({ efectivo: 0, tarjeta: 0, transferencia: 0 });
        expect(cuenta.cobrador, 'Una cuenta cancelada no la cobró nadie.').toBeNull();
        // Queda en el corte con quién la canceló y por qué.
        const hoja = await hojaDelCorte(beatriz, sesionDeBeatriz);
        expect(hoja.cancelaciones).toContainEqual(
          expect.objectContaining({
            tipo: 'orden',
            usuario: expect.stringMatching(/^Beatriz/),
            motivo,
            montoCentavos: String(importeDe(pedido)),
          }),
        );
      });

      await test.step('cocina deja de verla: las comandas y sus platillos quedan cancelados', async () => {
        await expect
          .poll(async () => (await comandasDe(duena, ordenId)).map((c) => c.estado))
          .toEqual(['cancelado', 'cancelado']);
        const items = (await comandasDe(duena, ordenId)).flatMap((c) => c.items);
        expect(items.map((i) => i.estado)).toEqual(items.map(() => 'cancelado'));
        // Y el cocinero ya no la ve: un pedido cancelado no se prepara.
        await exigirQueLaCocinaNoVeLaMesa(cocina, 'Mesa 6');
      });

      await test.step('la mesa vuelve a libre y NO se movió ni el cajón ni el almacén', async () => {
        expect(await leerMesa(duena, 6)).toMatchObject({
          id: mesaId,
          estado: 'libre',
          ordenId: null,
        });
        expect(await esperadoDelCajon(beatriz), 'Cancelar movió el cajón.').toBe(cajonAntes);
        expect(await consumoDeLaVenta(duena, ordenId)).toEqual({});
        expect(loQueBajo(antes, await existencias(duena))).toEqual({});
      });

      await test.step('una cuenta cancelada ya no se puede cobrar: el servidor lo rechaza y no entra un peso', async () => {
        const intento = await comando(beatriz, '/api/venta/cobrar', {
          ordenId,
          pagos: [{ metodo: 'efectivo', montoCentavos: importeDe(pedido) }],
          totalEsperadoCentavos: importeDe(pedido),
        });
        expect(intento.ok, 'El servidor cobró una cuenta cancelada.').toBe(false);
        const despues = await leerCuenta(duena, ordenId);
        expect(despues.estado).toBe('cancelada');
        expect(despues.pagos).toEqual({ efectivo: 0, tarjeta: 0, transferencia: 0 });
        expect(await esperadoDelCajon(beatriz)).toBe(cajonAntes);
      });
      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // ── 5 · CAMBIAR DE MESA CON LA COMANDA VIVA, Y COBRAR EN LA NUEVA ────────────
  test('5 · cambiar de mesa (11 a 12) con la comanda viva y cobrar en la nueva: la vieja queda libre', async ({
    browser,
  }, info) => {
    test.setTimeout(8 * 60_000);
    const dia = await empezarElDia(browser, info);
    const { duena, cocina, beatriz } = dia;
    try {
      const pedido = [
        { nombre: CARTA.arrachera.nombre, veces: 1 },
        { nombre: CARTA.cerveza.nombre, veces: 1 },
      ] as const;
      const venta = importeDe(pedido);
      const propina = diezPorCiento(venta);
      const antes = await existencias(duena);

      const origen = await sentarYComandar(duena, duena, 11, 2, pedido);
      const { ordenId } = origen;
      const comandasAlComandar = await comandasDe(duena, ordenId);
      await enLaColumna(cocina, 'Nuevos');
      await expect(tarjetasDeLaMesa(cocina, 'Mesa 11')).toHaveCount(comandasAlComandar.length, {
        timeout: 30_000,
      });

      await test.step('la sala se pasa a la mesa 12 antes de que salga el plato', async () => {
        await duena
          .getByRole('group', { name: /^Acciones de/ })
          .getByRole('button', { name: /^Cambiar de/ })
          .click();
        const elegir = duena.getByRole('dialog', { name: 'Cambiar de mesa' });
        await expect(elegir).toBeVisible();
        await elegir.getByRole('button', { name: /^Mesa 12\b/ }).click();
        // La pantalla abre la mesa nueva: la cuenta ya está ahí.
        await expect(elegir).toBeHidden();
        await expect(duena.getByRole('heading', { name: 'Mesa 12', exact: true })).toBeVisible();
      });

      await test.step('el servidor mudó la cuenta y la comanda viva; la mesa vieja quedó libre', async () => {
        const vieja = await leerMesa(duena, 11);
        const nueva = await leerMesa(duena, 12);
        expect(vieja, 'La mesa vieja no volvió al servicio.').toMatchObject({
          estado: 'libre',
          ordenId: null,
        });
        expect(nueva.ordenId, 'La cuenta no llegó a la mesa 12.').toBe(ordenId);
        expect(nueva.estado).not.toBe('libre');
        expect(nueva.personas, 'La mesa nueva no recibió a las dos personas.').toBe(2);
        expect((await leerCuenta(duena, ordenId)).mesaId).toBe(nueva.id);
        const comandas = await comandasDe(duena, ordenId);
        expect(comandas).toHaveLength(comandasAlComandar.length);
        expect(
          comandas.map((c) => c.mesaNumero),
          'La comanda viva sigue diciendo la mesa vieja: el plato saldría a un lugar vacío.',
        ).toEqual(comandas.map(() => 12));
        expect(await movimientosDeLaCuenta(duena, ordenId)).toContainEqual(
          expect.objectContaining({ tipo: 'cambio_mesa' }),
        );
      });

      await test.step('cocina entrega en la mesa NUEVA: sus tarjetas ya dicen «Mesa 12»', async () => {
        await enLaColumna(cocina, 'Nuevos');
        await expect(tarjetasDeLaMesa(cocina, 'Mesa 11')).toHaveCount(0, { timeout: 30_000 });
        await expect(tarjetasDeLaMesa(cocina, 'Mesa 12')).toHaveCount(comandasAlComandar.length);
        await cocinaDejaListaLaMesa(cocina, 12, comandasAlComandar.length);
        await entregarEnLaMesa(duena, 12, CARTA.arrachera.nombre);
        await pedirLaCuentaDeLaMesa(duena, /^10 %/);
      });

      await test.step('Beatriz cobra en la mesa 12; la 11 sigue libre y la 12 pasa a limpieza', async () => {
        await abrirLaCuentaEnCaja(beatriz, /^(Cobrar )?Mesa 12\b/);
        expect(await totalDelCobro(beatriz)).toBe(venta + propina);
        await beatriz.getByRole('button', { name: /^COBRAR/ }).click();
        await exigirCobroAceptado(beatriz, /pasa sola a limpieza/);
        await exigirCuentaCobrada(beatriz, ordenId, {
          ventaCentavos: venta,
          pagos: { efectivo: venta + propina },
          propina: { efectivo: propina },
          sesionCajaId: sesionDeBeatriz,
        });
        libro.cobro({
          referencia: 'mesa 11, cobrada en la 12 tras cambiar de mesa',
          ventaId: ordenId,
          sesionCajaId: sesionDeBeatriz,
          ventaCentavos: venta,
          pagos: { efectivo: venta + propina },
          propina: { efectivo: propina },
        });
        expect((await leerMesa(duena, 12)).estado).toBe('limpieza');
        expect((await leerMesa(duena, 11)).estado).toBe('libre');
        expect(await consumoDeLaVenta(duena, ordenId)).toEqual(consumoDe(pedido));
        expect(loQueBajo(antes, await existencias(duena))).toEqual(consumoDe(pedido));
      });
      await limpiarLaMesa(duena, 12);
      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  /**
   * La sala une `numeroDeLaQueSeUne` a la mesa que tiene abierta, por «Unir mesas», y devuelve el
   * identificador del grupo, que se LEE del servidor.
   */
  async function unirPorLaPantalla(
    sala: Page,
    principal: { readonly mesaId: string },
    numeroPrincipal: number,
    numeroDeLaQueSeUne: number,
  ): Promise<string> {
    await irALaMesa(sala, principal.mesaId, numeroPrincipal);
    await sala
      .getByRole('group', { name: /^Acciones de/ })
      .getByRole('button', { name: /^Unir/ })
      .click();
    const dialogo = sala.getByRole('dialog', { name: 'Unir mesas' });
    await expect(dialogo).toBeVisible();
    await dialogo
      .getByRole('button', { name: new RegExp(`^Mesa ${String(numeroDeLaQueSeUne)}\\b`) })
      .click();
    await dialogo.getByRole('button', { name: /^Unir 1 mesa/ }).click();
    await expect(dialogo).toBeHidden();
    const [union] = await consultarPuente<{ id?: string; cerrada_en?: string | null }>(
      sala,
      'UnionMesa',
      { filtro: { mesa_principal_id: principal.mesaId }, limite: 5 },
    );
    expect(union?.id, 'La unión no quedó en el servidor.').toBeTruthy();
    return union?.id ?? '';
  }

  // ── 6 · UNIR DOS MESAS Y COBRAR EL GRUPO UNA VEZ ─────────────────────────────
  // Antes del cierre del 21-10 sólo la mesa PRINCIPAL pasaba a limpieza al cobrar el grupo: la
  // unida se quedaba «Pedido enviado» con la cuenta pagada, el grupo abierto, y «Mesa limpia» de
  // las dos la rechazaba por ser de un grupo que nadie cerraba.
  test('6 · unir dos mesas y cobrar el grupo una vez: todas las mesas del grupo pasan a limpieza y «Mesa limpia» libera cada una', async ({
    browser,
  }, info) => {
    test.setTimeout(10 * 60_000);
    const dia = await empezarElDia(browser, info);
    const { duena, cocina, beatriz } = dia;
    try {
      const pedido1 = [{ nombre: CARTA.arrachera.nombre, veces: 2 }] as const;
      const pedido2 = [
        { nombre: CARTA.sopa.nombre, veces: 1 },
        { nombre: CARTA.cerveza.nombre, veces: 2 },
      ] as const;
      const grupo = [...pedido1, ...pedido2];
      const venta = importeDe(grupo);
      const propina = diezPorCiento(venta);
      const antes = await existencias(duena);

      const principal = await sentarYComandar(duena, duena, 1, 4, pedido1);
      const miembro = await sentarYComandar(duena, duena, 2, 2, pedido2);
      const comandasDeLaPrincipal = (await comandasDe(duena, principal.ordenId)).length;
      const comandasDelMiembro = (await comandasDe(duena, miembro.ordenId)).length;

      let unionId = '';
      await test.step('la sala une la mesa 2 a la 1: el consumo pasa a la cuenta de la principal', async () => {
        unionId = await unirPorLaPantalla(duena, principal, 1, 2);
        // La pantalla relee lo enviado: la cuenta de la 1 ya lleva lo de la 2. En tableta la
        // cuenta vive en una hoja que sube desde abajo: se abre.
        const hoja = duena.getByRole('button', { name: /^Abrir el pedido/ });
        if (await hoja.isVisible()) await hoja.click();
        await expect(duena.getByRole('row', { name: /Sopa de tortilla/ })).toBeVisible();

        const absorbida = await leerCuenta(duena, miembro.ordenId);
        expect(absorbida, 'La cuenta de la mesa 2 sigue cobrándose por su lado.').toMatchObject({
          estado: 'absorbida',
          totalCentavos: 0,
        });
        expect(await leerCuenta(duena, principal.ordenId)).toMatchObject({
          totalCentavos: venta,
        });
        expect(comoSe(await lineasVivas(duena, principal.ordenId))).toEqual([
          [CARTA.arrachera.nombre, 2, 2 * CARTA.arrachera.centavos],
          [CARTA.cerveza.nombre, 2, 2 * CARTA.cerveza.centavos],
          [CARTA.sopa.nombre, 1, CARTA.sopa.centavos],
        ]);
        expect(await leerMesa(duena, 2), 'La mesa unida conserva su propia cuenta.').toMatchObject({
          ordenId: null,
        });
        expect(
          (await leerMesa(duena, 1)).personas,
          'La principal no recibió a toda la gente.',
        ).toBe(6);
        expect(await movimientosDeLaCuenta(duena, principal.ordenId)).toContainEqual(
          expect.objectContaining({ tipo: 'union' }),
        );
      });

      await test.step('cocina sigue sirviendo cada tarjeta en su mesa, y la sala entrega desde la principal', async () => {
        await enLaColumna(cocina, 'Nuevos');
        await expect(tarjetasDeLaMesa(cocina, 'Mesa 1')).toHaveCount(comandasDeLaPrincipal, {
          timeout: 30_000,
        });
        await expect(tarjetasDeLaMesa(cocina, 'Mesa 2')).toHaveCount(comandasDelMiembro, {
          timeout: 30_000,
        });
        await cocinaDejaListaLaMesa(cocina, 1, comandasDeLaPrincipal);
        await cocinaDejaListaLaMesa(cocina, 2, comandasDelMiembro);
        await entregarEnLaMesa(duena, 1, CARTA.arrachera.nombre);
        expect(estadosDe(await comandasDeLaMesa(duena, principal.mesaId))).toEqual(
          Array<string>(comandasDeLaPrincipal).fill('entregado'),
        );
        // «Marcar entregado» de la principal sólo mueve las comandas de SU cuenta: lo de la mesa
        // unida lo quita de su lista la cocina (hallazgo D-3, prueba `fixme` de abajo).
        await cocinaQuitaDeLaLista(cocina, 2, comandasDelMiembro);
        await expect
          .poll(async () => estadosDe(await comandasDeLaMesa(duena, miembro.mesaId)))
          .toEqual(Array<string>(comandasDelMiembro).fill('entregado'));
      });

      await test.step('la sala pide la cuenta del grupo: una sola, con todo', async () => {
        await aLaMesa(duena, 1);
        await pedirLaCuentaDeLaMesa(duena, /^10 %/);
        const hoja = duena.getByRole('article', { name: /^Precuenta de la mesa 1/ });
        await expect(hoja).toContainText(enPesos(venta));
        await expect(hoja).toContainText(enPesos(venta + propina));
        await expect(hoja).toContainText(CARTA.sopa.nombre);
      });

      await test.step('Beatriz cobra el grupo UNA vez, por transferencia', async () => {
        await abrirPantalla(beatriz, '/restaurante/caja', /Pendientes/);
        const filaDeLaPrincipal = beatriz
          .getByRole('button', { name: /^(Cobrar )?Mesa 1\b/ })
          .first();
        await expect(filaDeLaPrincipal).toBeVisible({ timeout: 30_000 });
        await expect(
          beatriz.getByRole('button', { name: /^(Cobrar )?Mesa 2\b/ }),
          'La mesa unida aparece en la caja como una cuenta aparte.',
        ).toHaveCount(0);
        await filaDeLaPrincipal.click();
        await beatriz.waitForURL(/\/restaurante\/cobro\?cuenta=/);
        expect(await totalDelCobro(beatriz)).toBe(venta + propina);
        await beatriz.getByRole('button', { name: 'Transferencia', exact: true }).click();
        await beatriz.getByRole('button', { name: /^COBRAR/ }).click();
        await exigirCobroAceptado(beatriz, /pasa sola a limpieza/);
        await exigirCuentaCobrada(beatriz, principal.ordenId, {
          ventaCentavos: venta,
          pagos: { transferencia: venta + propina },
          propina: { transferencia: propina },
          sesionCajaId: sesionDeBeatriz,
        });
        libro.cobro({
          referencia: 'mesas 1 y 2 unidas, cobradas una vez',
          ventaId: principal.ordenId,
          sesionCajaId: sesionDeBeatriz,
          ventaCentavos: venta,
          pagos: { transferencia: venta + propina },
          propina: { transferencia: propina },
        });
        // Una sola cuenta cobrada: la de la mesa 2 sigue absorbida, sin un solo pago.
        expect(await leerCuenta(duena, miembro.ordenId)).toMatchObject({
          estado: 'absorbida',
          pagos: { efectivo: 0, tarjeta: 0, transferencia: 0 },
        });
        expect(await consumoDeLaVenta(duena, principal.ordenId)).toEqual(consumoDe(grupo));
        expect(await consumoDeLaVenta(duena, miembro.ordenId)).toEqual({});
        expect(loQueBajo(antes, await existencias(duena))).toEqual(consumoDe(grupo));
      });

      await test.step('TODAS las mesas del grupo pasan a limpieza y el grupo queda cerrado', async () => {
        expect((await leerMesa(duena, 1)).estado, 'La principal no pasó a limpieza.').toBe(
          'limpieza',
        );
        expect(
          (await leerMesa(duena, 2)).estado,
          'La mesa unida se quedó ocupada con la cuenta del grupo ya pagada.',
        ).toBe('limpieza');
        const [union] = await consultarPuente<{ cerrada_en?: string | null }>(duena, 'UnionMesa', {
          filtro: { id: unionId },
          limite: 1,
        });
        expect(union?.cerrada_en ?? null, 'Cobrar el grupo no cerró la unión.').not.toBeNull();
      });

      await test.step('«Mesa limpia» libera cada mesa del grupo, la principal y la unida', async () => {
        await limpiarLaMesa(duena, 1);
        await limpiarLaMesa(duena, 2);
        expect(await leerMesa(duena, 1)).toMatchObject({ estado: 'libre', ordenId: null });
        expect(await leerMesa(duena, 2)).toMatchObject({ estado: 'libre', ordenId: null });
      });
      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // ── 6b · UNIR DOS MESAS Y SEPARARLAS: LA CUENTA SE QUEDA EN LA PRINCIPAL ─────
  test('6b · unir dos mesas y separarlas: la 8 vuelve al servicio, la cuenta se queda en la 7 y se cobra sola', async ({
    browser,
  }, info) => {
    test.setTimeout(8 * 60_000);
    const dia = await empezarElDia(browser, info);
    const { duena, cocina, beatriz } = dia;
    try {
      const pedido7 = [{ nombre: CARTA.cerveza.nombre, veces: 2 }] as const;
      const pedido8 = [{ nombre: CARTA.arrachera.nombre, veces: 1 }] as const;
      const juntas = [...pedido7, ...pedido8];
      const ventaJuntas = importeDe(juntas);
      const m7 = await sentarYComandar(duena, duena, 7, 2, pedido7);
      const m8 = await sentarYComandar(duena, duena, 8, 2, pedido8);

      let grupoSeparado = '';
      await test.step('la sala une la mesa 8 a la 7 y las separa: la 8 vuelve al servicio, la cuenta se queda en la 7', async () => {
        grupoSeparado = await unirPorLaPantalla(duena, m7, 7, 8);
        expect(await leerCuenta(duena, m7.ordenId)).toMatchObject({ totalCentavos: ventaJuntas });
        expect((await leerMesa(duena, 8)).ordenId).toBeNull();

        // No hay botón para separar en ninguna pantalla (hallazgo D-2, prueba `fixme` de abajo):
        // se llama a la misma ruta que usaría.
        const separada = await comando<{
          readonly mesasLiberadas: number;
          readonly ordenPrincipalId: string;
        }>(duena, '/api/restaurante/separar-mesas', { unionId: grupoSeparado });
        expect(separada.ok, `restaurante.separar_mesas: ${separada.mensaje ?? ''}`).toBe(true);
        expect(separada.datos).toMatchObject({
          mesasLiberadas: 1,
          ordenPrincipalId: m7.ordenId,
        });

        expect(await leerMesa(duena, 8), 'La mesa separada no volvió al servicio.').toMatchObject({
          estado: 'libre',
          ordenId: null,
        });
        expect(await leerMesa(duena, 7)).toMatchObject({ ordenId: m7.ordenId });
        // Separar NO reparte el consumo: todo sigue en la cuenta de la principal.
        expect(await leerCuenta(duena, m7.ordenId)).toMatchObject({ totalCentavos: ventaJuntas });
        expect(await leerCuenta(duena, m8.ordenId)).toMatchObject({ estado: 'absorbida' });
        const [union] = await consultarPuente<{ cerrada_en?: string | null }>(duena, 'UnionMesa', {
          filtro: { id: grupoSeparado },
          limite: 1,
        });
        expect(union?.cerrada_en ?? null, 'Separar no cerró el grupo.').not.toBeNull();
        expect(await movimientosDeLaCuenta(duena, m7.ordenId)).toContainEqual(
          expect.objectContaining({ tipo: 'separacion' }),
        );
        // Separar otra vez es un error claro y no deshace nada.
        const otraVez = await comando(duena, '/api/restaurante/separar-mesas', {
          unionId: grupoSeparado,
        });
        expect(otraVez.ok, 'Se separó dos veces el mismo grupo.').toBe(false);
      });

      await test.step('la cuenta de la mesa 7 sigue completa y se cobra sola', async () => {
        // Cocina sirve por MESA: las comandas de cada una, de la cuenta de que cuelguen.
        await cocinaDejaListaLaMesa(cocina, 7, (await comandasDeLaMesa(duena, m7.mesaId)).length);
        await cocinaDejaListaLaMesa(cocina, 8, (await comandasDeLaMesa(duena, m8.mesaId)).length);
        await entregarEnLaMesa(duena, 7, CARTA.cerveza.nombre);
        await pedirLaCuentaDeLaMesa(duena, /^La decide la caja/);
        await abrirLaCuentaEnCaja(beatriz, /^(Cobrar )?Mesa 7\b/);
        // La propina la decide la caja: «Sin propina» pesa lo mismo que los porcentajes.
        const muro = beatriz.getByRole('group', { name: 'Propina' });
        await muro.getByRole('button', { name: /^Sin propina/ }).click();
        await expect(muro).toBeHidden();
        expect(await totalDelCobro(beatriz)).toBe(ventaJuntas);
        await beatriz.getByRole('button', { name: /^COBRAR/ }).click();
        await exigirCobroAceptado(beatriz, /pasa sola a limpieza/);
        await exigirCuentaCobrada(beatriz, m7.ordenId, {
          ventaCentavos: ventaJuntas,
          pagos: { efectivo: ventaJuntas },
          propina: {},
          cambioCentavos: 0,
          sesionCajaId: sesionDeBeatriz,
        });
        libro.cobro({
          referencia: 'mesa 7 con lo de la 8, tras separarlas',
          ventaId: m7.ordenId,
          sesionCajaId: sesionDeBeatriz,
          ventaCentavos: ventaJuntas,
          pagos: { efectivo: ventaJuntas },
        });
        expect((await leerMesa(duena, 7)).estado).toBe('limpieza');
        expect((await leerMesa(duena, 8)).estado).toBe('libre');
      });
      await limpiarLaMesa(duena, 7);
      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // ── 6c · CANCELAR LA CUENTA DE UN GRUPO DE MESAS UNIDAS ──────────────────────
  // La otra mitad del arreglo del grupo: al cobrar, cada mesa a limpieza; al CANCELAR, cada mesa a
  // libre y el grupo cerrado, sin que se mueva un peso del cajón ni un gramo del almacén. Usa las
  // mesas 1 y 2, que la prueba 6 ya dejó libres: lo que la cocina tenía en la comanda de la mesa
  // unida se queda vivo (D-7, abajo) y no tiene que estorbarle a ninguna otra prueba.
  test('6c · cancelar la cuenta de un grupo de mesas unidas: todas las mesas vuelven a libre, el grupo se cierra y no entra ni sale un peso', async ({
    browser,
  }, info) => {
    test.setTimeout(8 * 60_000);
    const dia = await empezarElDia(browser, info);
    const { duena, beatriz } = dia;
    try {
      const pedido1 = [{ nombre: CARTA.cerveza.nombre, veces: 2 }] as const;
      const pedido2 = [{ nombre: CARTA.arrachera.nombre, veces: 1 }] as const;
      const motivo = 'el grupo se fue sin pagar';
      const antes = await existencias(duena);
      const cajonAntes = await esperadoDelCajon(beatriz);

      const principal = await sentarYComandar(duena, duena, 1, 2, pedido1);
      const unida = await sentarYComandar(duena, duena, 2, 2, pedido2);
      const unionId = await unirPorLaPantalla(duena, principal, 1, 2);
      await pedirLaCuentaDeLaMesa(duena, /^La decide la caja/);

      await abrirLaCuentaEnCaja(beatriz, /^(Cobrar )?Mesa 1\b/);
      await beatriz.getByRole('button', { name: 'Cancelar la cuenta', exact: true }).click();
      const dialogo = beatriz.getByRole('dialog', { name: 'Cancelar la cuenta' });
      await dialogo.locator('#cancelar-cuenta-motivo').fill(motivo);
      await dialogo.getByRole('button', { name: 'Cancelar la cuenta sin cobrar' }).click();
      await expect(beatriz.getByText(/Ninguna cuenta está esperando cobro/)).toBeVisible();

      await test.step('el servidor la tiene cancelada, sin folio ni un solo pago, y el grupo cerrado', async () => {
        await expect
          .poll(() => leerCuenta(duena, principal.ordenId))
          .toMatchObject({ estado: 'cancelada', motivoDeCancelacion: motivo });
        const cuenta = await leerCuenta(duena, principal.ordenId);
        expect(cuenta.folio, 'Una cuenta cancelada no consume folio.').toBeNull();
        expect(cuenta.pagos).toEqual({ efectivo: 0, tarjeta: 0, transferencia: 0 });
        const [union] = await consultarPuente<{ cerrada_en?: string | null }>(duena, 'UnionMesa', {
          filtro: { id: unionId },
          limite: 1,
        });
        expect(union?.cerrada_en ?? null, 'Cancelar el grupo no cerró la unión.').not.toBeNull();
      });

      await test.step('TODAS las mesas del grupo vuelven a libre, la principal y la unida', async () => {
        expect(await leerMesa(duena, 1)).toMatchObject({ estado: 'libre', ordenId: null });
        expect(
          await leerMesa(duena, 2),
          'La mesa unida se quedó ocupada con la cuenta del grupo cancelada.',
        ).toMatchObject({ estado: 'libre', ordenId: null });
      });

      await test.step('no se movió ni el cajón ni el almacén', async () => {
        expect(await esperadoDelCajon(beatriz), 'Cancelar movió el cajón.').toBe(cajonAntes);
        expect(await consumoDeLaVenta(duena, principal.ordenId)).toEqual({});
        expect(await consumoDeLaVenta(duena, unida.ordenId)).toEqual({});
        expect(loQueBajo(antes, await existencias(duena))).toEqual({});
      });
      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // ── 1 · DIVIDIR LA CUENTA EN DOS PARTES Y COBRAR CADA UNA ────────────────────
  //
  // Las dos pruebas de dividir van DESPUÉS de las demás, y no por capricho: una demo con una
  // cuenta dividida ya no se puede resetear (`configuracion.resetear_demo` contesta 500 al borrar
  // la madre junto con sus hijas, `division_cuadra` ve «la madre suma <NULL>»: hallazgo D-6 del
  // informe). Si una prueba cae, Playwright reinicia su proceso y la siguiente vuelve a resetear
  // el día; con las divisiones al final, ninguna de las que caen antes encuentra una demo que ya
  // no se deja resetear, y un fallo no se convierte en una cascada de «ERROR_INTERNO».
  test('1 · dividir la cuenta de la mesa 9 en dos partes y cobrar cada una: efectivo con cambio y tarjeta', async ({
    browser,
  }, info) => {
    test.setTimeout(10 * 60_000);
    const dia = await empezarElDia(browser, info);
    const { duena, cocina, beatriz } = dia;
    try {
      const pedido = [
        { nombre: CARTA.arrachera.nombre, veces: 3 },
        { nombre: CARTA.sopa.nombre, veces: 2 },
        { nombre: CARTA.cerveza.nombre, veces: 4 },
      ] as const;
      const ventaDeLaMadre = importeDe(pedido);
      // Lo que se lleva cada cuenta, escrito a mano: dos arracheras, una sopa y dos cervezas la
      // primera; una arrachera, una sopa y dos cervezas la segunda. Las unidades se reparten,
      // y la línea de tres arracheras se parte entre las dos cuentas.
      const parte1 = [
        { nombre: CARTA.arrachera.nombre, veces: 2 },
        { nombre: CARTA.sopa.nombre, veces: 1 },
        { nombre: CARTA.cerveza.nombre, veces: 2 },
      ];
      const parte2 = [
        { nombre: CARTA.arrachera.nombre, veces: 1 },
        { nombre: CARTA.sopa.nombre, veces: 1 },
        { nombre: CARTA.cerveza.nombre, veces: 2 },
      ];
      expect(
        importeDe(parte1) + importeDe(parte2),
        'Las dos cuentas tienen que sumar la mesa.',
      ).toBe(ventaDeLaMadre);
      const antes = await existencias(duena);

      const { mesaId, ordenId: madre } = await sentarYComandar(duena, duena, 9, 6, pedido);
      const comandasAlComandar = await comandasDe(duena, madre);
      await cocinaDejaListaLaMesa(cocina, 9, comandasAlComandar.length);
      await expect
        .poll(async () => estadosDe(await comandasDe(duena, madre)))
        .toEqual(comandasAlComandar.map(() => 'listo'));
      await entregarEnLaMesa(duena, 9, CARTA.arrachera.nombre);
      await expect
        .poll(async () => estadosDe(await comandasDe(duena, madre)))
        .toEqual(comandasAlComandar.map(() => 'entregado'));
      await pedirLaCuentaDeLaMesa(duena, /^10 %/);

      await test.step('la cuenta pedida vale la mesa entera, con la mesa en «cuenta solicitada»', async () => {
        const cuenta = await leerCuenta(duena, madre);
        expect(cuenta).toMatchObject({
          estado: 'cuenta_solicitada',
          totalCentavos: ventaDeLaMadre,
        });
        expect((await leerMesa(duena, 9)).estado).toBe('cuenta_solicitada');
      });

      // ── Beatriz divide desde el cobro, repartiendo unidades ──
      const partes: {
        readonly ordenId: string;
        readonly codigoCaja: string;
        readonly total: number;
      }[] = [];
      await test.step('Beatriz divide la cuenta en dos desde el cobro, repartiendo unidades', async () => {
        await abrirLaCuentaEnCaja(beatriz, /^(Cobrar )?Mesa 9\b/);
        await beatriz.getByRole('button', { name: 'Dividir cuenta', exact: true }).click();
        const dialogo = beatriz.getByRole('dialog', { name: 'Dividir la cuenta' });
        const sumar = async (platillo: string, cuenta: number, veces: number): Promise<void> => {
          for (let i = 0; i < veces; i += 1) {
            await dialogo
              .getByRole('button', {
                name: `Añadir ${platillo} a la cuenta ${String(cuenta)}`,
                exact: true,
              })
              .click();
          }
        };
        // Con unidades sin repartir no se divide, y la pantalla dice cuántas faltan.
        await expect(dialogo.getByRole('button', { name: /^Dividir en 2 cuentas/ })).toBeDisabled();
        await expect(dialogo.getByText('Faltan 9 por repartir')).toBeVisible();
        for (const [indice, parte] of [parte1, parte2].entries()) {
          for (const { nombre, veces } of parte) await sumar(nombre, indice + 1, veces);
        }
        await expect(dialogo.getByText('Todo repartido')).toBeVisible();
        const [respuesta] = await Promise.all([
          beatriz.waitForResponse(
            (r) =>
              new URL(r.url()).pathname === '/api/restaurante/dividir-cuenta' &&
              r.request().method() === 'POST',
          ),
          dialogo.getByRole('button', { name: /^Dividir en 2 cuentas/ }).click(),
        ]);
        expect(respuesta.status(), await respuesta.text()).toBe(200);
        const cuerpo = (await respuesta.json()) as {
          readonly datos: {
            readonly totalCentavos: string;
            readonly hijas: readonly {
              readonly ordenId: string;
              readonly codigoCaja: string;
              readonly totalCentavos: string;
            }[];
          };
        };
        expect(Number(cuerpo.datos.totalCentavos), 'El servidor no dividió la cuenta entera.').toBe(
          ventaDeLaMadre,
        );
        partes.push(
          ...cuerpo.datos.hijas.map((h) => ({
            ordenId: h.ordenId,
            codigoCaja: h.codigoCaja,
            total: Number(h.totalCentavos),
          })),
        );
        expect(partes.map((p) => p.total)).toEqual([importeDe(parte1), importeDe(parte2)]);

        // La caja las encuentra: cada parte es una cuenta pedida con su nombre.
        await beatriz.waitForURL(/\/restaurante\/caja/);
        for (const n of [1, 2]) {
          await expect(
            beatriz
              .getByRole('button', {
                name: new RegExp(`^(Cobrar )?Mesa 9 · cuenta ${String(n)} de 2\\b`),
              })
              .first(),
          ).toBeVisible({ timeout: 30_000 });
        }
      });

      await test.step('cada parte tiene SUS líneas en el servidor y la madre ya no se cobra', async () => {
        const comoEspera = (platillos: readonly Platillo[]) =>
          platillos
            .map((p) => [p.nombre, p.veces, p.veces * (PRECIO[p.nombre] ?? 0)] as const)
            .sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
        const [primera, segunda] = partes;
        expect(comoSe(await lineasVivas(duena, primera!.ordenId))).toEqual(comoEspera(parte1));
        expect(comoSe(await lineasVivas(duena, segunda!.ordenId))).toEqual(comoEspera(parte2));
        expect(
          await todasLasLineas(duena, madre),
          'La madre conserva líneas que ya cobran las partes.',
        ).toEqual([]);
        const dividida = await leerCuenta(duena, madre);
        expect(dividida.estado).toBe('dividida');
        expect(dividida.motivoDeCancelacion).toBeNull();
        // La madre vale lo que suman sus partes: ni un centavo de más ni de menos.
        expect(dividida.totalCentavos, 'La madre ya no vale lo que suman sus partes.').toBe(
          ventaDeLaMadre,
        );
        for (const [i, parte] of partes.entries()) {
          const hija = await leerCuenta(duena, parte.ordenId);
          expect(hija).toMatchObject({
            estado: 'cuenta_solicitada',
            totalCentavos: parte.total,
            etiqueta: `Mesa 9 · cuenta ${String(i + 1)} de 2`,
          });
        }
        expect((await leerMesa(duena, 9)).estado).toBe('cuenta_solicitada');
        // Las comandas son las de siempre, ya entregadas: la división no manda nada a cocina.
        expect(estadosDe(await comandasDe(duena, madre))).toEqual(
          comandasAlComandar.map(() => 'entregado'),
        );
        await exigirQueLaCocinaNoVeLaMesa(cocina, 'Mesa 9');
      });

      // ── Cobrar cada parte: la primera en efectivo con cambio, la segunda con tarjeta ──
      const cobrado: Cuenta[] = [];
      for (const [indice, parte] of [parte1, parte2].entries()) {
        await test.step(`Beatriz cobra la cuenta ${String(indice + 1)} de 2 ${indice === 0 ? 'en efectivo, con cambio' : 'con tarjeta'}`, async () => {
          const hija = partes[indice]!;
          const venta = importeDe(parte);
          const propina = diezPorCiento(venta);
          const total = venta + propina;
          await abrirLaCuentaEnCaja(
            beatriz,
            new RegExp(`^(Cobrar )?Mesa 9 · cuenta ${String(indice + 1)} de 2\\b`),
          );
          // El 10 % que la mesa acordó viene con cada parte, sobre SU consumo.
          expect(await totalDelCobro(beatriz)).toBe(total);
          let cambio = 0;
          if (indice === 0) {
            await beatriz.locator('#cobro-recibido').fill('1000.00');
            cambio = 100_000 - total;
            await expect(
              beatriz.getByText('Cambio', { exact: true }).locator('xpath=following-sibling::*[1]'),
            ).toContainText(enPesos(cambio));
          } else {
            await beatriz.getByRole('button', { name: 'Tarjeta', exact: true }).click();
          }
          await beatriz.getByRole('button', { name: /^COBRAR/ }).click();
          await exigirCobroAceptado(beatriz, /Se cobraron/);
          const metodo = indice === 0 ? 'efectivo' : 'tarjeta';
          cobrado.push(
            await exigirCuentaCobrada(beatriz, hija.ordenId, {
              ventaCentavos: venta,
              pagos: { [metodo]: total },
              propina: { [metodo]: propina },
              ...(indice === 0 ? { cambioCentavos: cambio } : {}),
              sesionCajaId: sesionDeBeatriz,
            }),
          );
          libro.cobro({
            referencia: `mesa 9, cuenta ${String(indice + 1)} de 2`,
            ventaId: hija.ordenId,
            sesionCajaId: sesionDeBeatriz,
            ventaCentavos: venta,
            pagos: { [metodo]: total },
            propina: { [metodo]: propina },
          });

          // Cobrar una parte NO vuelve a mandar la comida a la plancha.
          expect(
            await comandasDe(duena, hija.ordenId),
            'Cobrar la parte mandó comida a cocina.',
          ).toEqual([]);
          expect(await comandasDe(duena, madre)).toHaveLength(comandasAlComandar.length);
          // Ni a la mesa, de la cuenta que cuelgue: las mismas comandas de antes de dividir.
          expect(
            await comandasDeLaMesa(duena, mesaId),
            'Cobrar la parte dejó más comandas en la mesa que las que se mandaron al comandar.',
          ).toHaveLength(comandasAlComandar.length);
          await exigirQueLaCocinaNoVeLaMesa(cocina, 'Mesa 9');
          // Y la mesa se recoge SÓLO con la última parte.
          expect((await leerMesa(duena, 9)).estado).toBe(
            indice === 1 ? 'limpieza' : 'cuenta_solicitada',
          );
        });
      }

      await test.step('las dos partes suman la cuenta madre al centavo, y el almacén bajó una sola vez', async () => {
        const ventas = cobrado.reduce((suma, c) => suma + c.totalCentavos, 0);
        expect(ventas, 'Las partes cobradas no suman la cuenta madre.').toBe(ventaDeLaMadre);
        const propinas = cobrado.reduce(
          (suma, c) => suma + c.propinas.efectivo + c.propinas.tarjeta + c.propinas.transferencia,
          0,
        );
        const pagado = cobrado.reduce(
          (suma, c) => suma + c.pagos.efectivo + c.pagos.tarjeta + c.pagos.transferencia,
          0,
        );
        // Σ pagos = la madre + la propina de cada parte, sin un centavo de más ni de menos.
        expect(pagado - propinas, 'Σ pagos sin propinas no es el total de la madre.').toBe(
          ventaDeLaMadre,
        );
        expect(propinas).toBe(diezPorCiento(importeDe(parte1)) + diezPorCiento(importeDe(parte2)));
        // El ledger atribuye a cada parte lo suyo, y entre las dos lo que gastan las recetas.
        const gastado: Record<string, number> = {};
        for (const parteCobrada of partes) {
          const deLaParte = await consumoDeLaVenta(duena, parteCobrada.ordenId);
          for (const [insumo, cantidad] of Object.entries(deLaParte)) {
            gastado[insumo] = (gastado[insumo] ?? 0) + cantidad;
          }
        }
        expect(gastado).toEqual(consumoDe(pedido));
        expect(
          await consumoDeLaVenta(duena, madre),
          'La madre dividida no se cobra ni gasta.',
        ).toEqual({});
        expect(loQueBajo(antes, await existencias(duena))).toEqual(consumoDe(pedido));
      });

      await test.step('«Mesa limpia»: la mesa 9 se libera y la madre NO queda cancelada', async () => {
        await limpiarLaMesa(duena, 9);
        const mesa = await leerMesa(duena, 9);
        expect(mesa).toMatchObject({ id: mesaId, estado: 'libre', ordenId: null });
        expect(await leerCuenta(duena, madre)).toMatchObject({
          estado: 'dividida',
          motivoDeCancelacion: null,
        });
      });
      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // ── 1b · LA MISMA DIVISIÓN, CON UN DESCUENTO DE CENTAVOS IMPARES ─────────────
  // Lo que más se parte mal es el centavo: un descuento de $33.33 repartido entre dos líneas y
  // después una línea de tres arracheras partida entre dos cuentas. Antes del cierre del 21-10
  // el total, el subtotal y el descuento de cada trozo se repartían por separado y la parte
  // enseñaba un total y se cobraba otro: ninguna se podía cobrar. Sin recalcular la aritmética
  // del servidor, se exige que cuadre consigo misma: las líneas suman a su cuenta, las partes
  // suman a la madre, el descuento se reparte entero y cada parte se cobra por lo que dice su
  // pantalla.
  test('1b · dividir una cuenta con descuento de centavos impares (mesa 10): las partes suman la madre y cada una se cobra por lo que enseña', async ({
    browser,
  }, info) => {
    test.setTimeout(10 * 60_000);
    const dia = await empezarElDia(browser, info);
    const { duena, cocina, beatriz } = dia;
    try {
      const pedido10 = [
        { nombre: CARTA.arrachera.nombre, veces: 3 },
        { nombre: CARTA.cerveza.nombre, veces: 1 },
      ] as const;
      const bruta = importeDe(pedido10);
      // Dentro del tope de Beatriz ($2,000 y 30 %): no pide supervisor, y el importe no es redondo.
      const descuento = 3_333;
      const venta10 = bruta - descuento;
      const antes10 = await existencias(duena);

      const m10 = await sentarYComandar(duena, duena, 10, 3, pedido10);
      const comandas10 = (await comandasDe(duena, m10.ordenId)).length;
      await cocinaDejaListaLaMesa(cocina, 10, comandas10);
      await entregarEnLaMesa(duena, 10, CARTA.arrachera.nombre);
      await pedirLaCuentaDeLaMesa(duena, /^10 %/);

      await abrirLaCuentaEnCaja(beatriz, /^(Cobrar )?Mesa 10\b/);
      await beatriz.getByRole('button', { name: 'Descuento', exact: true }).click();
      const dialogoDescuento = beatriz.getByRole('dialog', { name: 'Descuento' });
      await dialogoDescuento.locator('#descuento-importe').fill(pesos(descuento));
      await dialogoDescuento.locator('#descuento-motivo').fill('cliente frecuente');
      await expect(dialogoDescuento.getByText(/Pasa de tu tope/)).toHaveCount(0);
      await dialogoDescuento.getByRole('button', { name: 'Aplicar el descuento' }).click();
      await expect(dialogoDescuento).toBeHidden();

      const lineasConDescuento = await (async () => {
        await expect
          .poll(() => leerCuenta(duena, m10.ordenId))
          .toMatchObject({ totalCentavos: venta10, descuentoCentavos: descuento });
        return lineasVivas(duena, m10.ordenId);
      })();
      expect(
        lineasConDescuento.reduce((suma, l) => suma + l.totalCentavos, 0),
        'Las líneas no suman la venta con descuento.',
      ).toBe(venta10);
      expect(
        lineasConDescuento.reduce((suma, l) => suma + l.descuentoCentavos, 0),
        'El descuento no se repartió entero entre las líneas.',
      ).toBe(descuento);

      // Divide: dos arracheras en la primera cuenta; una arrachera y la cerveza en la segunda.
      await beatriz.getByRole('button', { name: 'Dividir cuenta', exact: true }).click();
      const dialogo = beatriz.getByRole('dialog', { name: 'Dividir la cuenta' });
      const sumar = async (platillo: string, cuenta: number, veces: number): Promise<void> => {
        for (let i = 0; i < veces; i += 1) {
          await dialogo
            .getByRole('button', {
              name: `Añadir ${platillo} a la cuenta ${String(cuenta)}`,
              exact: true,
            })
            .click();
        }
      };
      await sumar(CARTA.arrachera.nombre, 1, 2);
      await sumar(CARTA.arrachera.nombre, 2, 1);
      await sumar(CARTA.cerveza.nombre, 2, 1);
      await expect(dialogo.getByText('Todo repartido')).toBeVisible();
      const [respuesta] = await Promise.all([
        beatriz.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === '/api/restaurante/dividir-cuenta' &&
            r.request().method() === 'POST',
        ),
        dialogo.getByRole('button', { name: /^Dividir en 2 cuentas/ }).click(),
      ]);
      expect(respuesta.status(), await respuesta.text()).toBe(200);
      const hijas = (
        (await respuesta.json()) as {
          readonly datos: {
            readonly hijas: readonly {
              readonly ordenId: string;
              readonly totalCentavos: string;
            }[];
          };
        }
      ).datos.hijas.map((h) => ({ ordenId: h.ordenId, total: Number(h.totalCentavos) }));

      await test.step('las partes suman la madre con descuento y cada una cuadra con sus líneas', async () => {
        expect(
          hijas.reduce((suma, h) => suma + h.total, 0),
          'Las partes no suman la cuenta madre con su descuento.',
        ).toBe(venta10);
        expect(
          (await leerCuenta(duena, m10.ordenId)).totalCentavos,
          'La madre ya no vale lo que suman sus partes.',
        ).toBe(venta10);
        let descuentoRepartido = 0;
        for (const hija of hijas) {
          const enElServidor = await leerCuenta(duena, hija.ordenId);
          const lineas = await lineasVivas(duena, hija.ordenId);
          expect(enElServidor.totalCentavos, 'La parte guardó otro total que el que dijo.').toBe(
            hija.total,
          );
          expect(
            lineas.reduce((suma, l) => suma + l.totalCentavos, 0),
            'Las líneas de la parte no suman lo que la parte vale.',
          ).toBe(hija.total);
          descuentoRepartido += lineas.reduce((suma, l) => suma + l.descuentoCentavos, 0);
        }
        expect(
          descuentoRepartido,
          'Al dividir se perdió o se duplicó un centavo del descuento.',
        ).toBe(descuento);
        expect(await todasLasLineas(duena, m10.ordenId)).toEqual([]);
        await exigirQueLaCocinaNoVeLaMesa(cocina, 'Mesa 10');
      });

      await test.step('Beatriz cobra cada parte por lo que dice su pantalla: la primera en efectivo, la segunda con tarjeta', async () => {
        const cobradas: Cuenta[] = [];
        for (const [indice, hija] of hijas.entries()) {
          const propina = diezPorCiento(hija.total);
          const metodo = indice === 0 ? 'efectivo' : 'tarjeta';
          await abrirLaCuentaEnCaja(
            beatriz,
            new RegExp(`^(Cobrar )?Mesa 10 · cuenta ${String(indice + 1)} de 2\\b`),
          );
          expect(await totalDelCobro(beatriz)).toBe(hija.total + propina);
          if (indice === 1) {
            await beatriz.getByRole('button', { name: 'Tarjeta', exact: true }).click();
          }
          await beatriz.getByRole('button', { name: /^COBRAR/ }).click();
          await exigirCobroAceptado(beatriz, /Se cobraron/);
          cobradas.push(
            await exigirCuentaCobrada(beatriz, hija.ordenId, {
              ventaCentavos: hija.total,
              pagos: { [metodo]: hija.total + propina },
              propina: { [metodo]: propina },
              cambioCentavos: 0,
              sesionCajaId: sesionDeBeatriz,
            }),
          );
          libro.cobro({
            referencia: `mesa 10 con descuento, cuenta ${String(indice + 1)} de 2`,
            ventaId: hija.ordenId,
            sesionCajaId: sesionDeBeatriz,
            ventaCentavos: hija.total,
            pagos: { [metodo]: hija.total + propina },
            propina: { [metodo]: propina },
          });
          expect(await comandasDe(duena, hija.ordenId)).toEqual([]);
          expect((await leerMesa(duena, 10)).estado).toBe(
            indice === 1 ? 'limpieza' : 'cuenta_solicitada',
          );
        }
        const pagado = cobradas.reduce(
          (suma, c) => suma + c.pagos.efectivo + c.pagos.tarjeta + c.pagos.transferencia,
          0,
        );
        const propinas = hijas.reduce((suma, h) => suma + diezPorCiento(h.total), 0);
        expect(pagado, 'Lo cobrado en las partes no es la madre más sus propinas.').toBe(
          venta10 + propinas,
        );
        expect(loQueBajo(antes10, await existencias(duena))).toEqual(consumoDe(pedido10));
      });
      await limpiarLaMesa(duena, 10);
      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // ── 1c · DESCONTAR UNA PARTE YA DIVIDIDA ─────────────────────────────────────
  // Antes del cierre del 21-10 descontar una parte de una cuenta dividida reventaba al confirmar
  // con «La división no cuadra»: la madre tiene que valer lo que suman sus partes y el descuento
  // sólo tocaba la hija. Ahora el comando ajusta la madre en la misma transacción. Se exige que
  // el descuento se guarde en SU parte, que la madre siga valiendo lo que suman las dos y que cada
  // parte se cobre por lo que dice su pantalla.
  test('1c · descontar UNA parte ya dividida (mesa 5): nada revienta, la madre vale lo que suman sus partes y cada parte se cobra por lo que enseña', async ({
    browser,
  }, info) => {
    test.setTimeout(10 * 60_000);
    const dia = await empezarElDia(browser, info);
    const { duena, cocina, beatriz } = dia;
    try {
      const pedido = [
        { nombre: CARTA.arrachera.nombre, veces: 2 },
        { nombre: CARTA.cerveza.nombre, veces: 2 },
      ] as const;
      const parte = [
        { nombre: CARTA.arrachera.nombre, veces: 1 },
        { nombre: CARTA.cerveza.nombre, veces: 1 },
      ] as const;
      // Dentro del tope de Beatriz ($2,000 y 30 %): no pide supervisor.
      const descuento = 5_000;
      const ventaSinDescuento = importeDe(parte);
      const ventas = [ventaSinDescuento - descuento, ventaSinDescuento];
      const ventaDeLaMadre = ventas[0]! + ventas[1]!;
      const antes = await existencias(duena);

      const { ordenId: madre } = await sentarYComandar(duena, duena, 5, 4, pedido);
      await cocinaDejaListaLaMesa(cocina, 5, (await comandasDe(duena, madre)).length);
      await entregarEnLaMesa(duena, 5, CARTA.arrachera.nombre);
      await pedirLaCuentaDeLaMesa(duena, /^10 %/);

      // ── Primero se divide, con la cuenta entera y sin descuento ──
      const partes: { readonly ordenId: string; readonly total: number }[] = [];
      await test.step('Beatriz divide la cuenta en dos partes iguales', async () => {
        await abrirLaCuentaEnCaja(beatriz, /^(Cobrar )?Mesa 5\b/);
        await beatriz.getByRole('button', { name: 'Dividir cuenta', exact: true }).click();
        const dialogo = beatriz.getByRole('dialog', { name: 'Dividir la cuenta' });
        for (const cuenta of [1, 2]) {
          for (const { nombre } of parte) {
            await dialogo
              .getByRole('button', {
                name: `Añadir ${nombre} a la cuenta ${String(cuenta)}`,
                exact: true,
              })
              .click();
          }
        }
        await expect(dialogo.getByText('Todo repartido')).toBeVisible();
        const [respuesta] = await Promise.all([
          beatriz.waitForResponse(
            (r) =>
              new URL(r.url()).pathname === '/api/restaurante/dividir-cuenta' &&
              r.request().method() === 'POST',
          ),
          dialogo.getByRole('button', { name: /^Dividir en 2 cuentas/ }).click(),
        ]);
        expect(respuesta.status(), await respuesta.text()).toBe(200);
        const cuerpo = (await respuesta.json()) as {
          readonly datos: {
            readonly hijas: readonly { readonly ordenId: string; readonly totalCentavos: string }[];
          };
        };
        partes.push(
          ...cuerpo.datos.hijas.map((h) => ({
            ordenId: h.ordenId,
            total: Number(h.totalCentavos),
          })),
        );
        expect(partes.map((p) => p.total)).toEqual([ventaSinDescuento, ventaSinDescuento]);
      });

      // ── Y después se descuenta la primera parte, ya dividida ──
      await test.step('Beatriz le descuenta $50 a la cuenta 1 de 2: el servidor lo acepta y ajusta la madre', async () => {
        await abrirLaCuentaEnCaja(beatriz, /^(Cobrar )?Mesa 5 · cuenta 1 de 2\b/);
        await beatriz.getByRole('button', { name: 'Descuento', exact: true }).click();
        const dialogo = beatriz.getByRole('dialog', { name: 'Descuento' });
        await dialogo.locator('#descuento-importe').fill(pesos(descuento));
        await dialogo.locator('#descuento-motivo').fill('cortesía a una de las dos');
        await expect(dialogo.getByText(/Pasa de tu tope/)).toHaveCount(0);
        const [aplicado] = await Promise.all([
          beatriz.waitForResponse(
            (r) =>
              new URL(r.url()).pathname === '/api/restaurante/descontar-cuenta' &&
              r.request().method() === 'POST',
          ),
          dialogo.getByRole('button', { name: 'Aplicar el descuento' }).click(),
        ]);
        expect(
          aplicado.status(),
          `Descontar una parte de una cuenta dividida: ${await aplicado.text()}`,
        ).toBe(200);
        await expect(dialogo).toBeHidden();
      });

      await test.step('lo guardado cuadra: el descuento en SU parte, la madre con lo que suman las dos y las líneas con el total', async () => {
        const [primera, segunda] = partes;
        await expect
          .poll(() => leerCuenta(duena, primera!.ordenId))
          .toMatchObject({ totalCentavos: ventas[0], descuentoCentavos: descuento });
        expect(await leerCuenta(duena, segunda!.ordenId)).toMatchObject({
          totalCentavos: ventas[1],
          descuentoCentavos: 0,
        });
        expect(
          (await leerCuenta(duena, madre)).totalCentavos,
          'La madre no vale lo que suman sus partes tras el descuento.',
        ).toBe(ventaDeLaMadre);
        const lineas = await lineasVivas(duena, primera!.ordenId);
        expect(
          lineas.reduce((suma, l) => suma + l.totalCentavos, 0),
          'Las líneas de la parte no suman lo que la parte vale.',
        ).toBe(ventas[0]);
        expect(
          lineas.reduce((suma, l) => suma + l.descuentoCentavos, 0),
          'El descuento no quedó entero en las líneas de su parte.',
        ).toBe(descuento);
      });

      await test.step('Beatriz cobra cada parte por lo que dice su pantalla: la primera en efectivo, la segunda con tarjeta', async () => {
        const cobradas: Cuenta[] = [];
        for (const [indice, hija] of partes.entries()) {
          const venta = ventas[indice]!;
          const propina = diezPorCiento(venta);
          const metodo = indice === 0 ? 'efectivo' : 'tarjeta';
          await abrirLaCuentaEnCaja(
            beatriz,
            new RegExp(`^(Cobrar )?Mesa 5 · cuenta ${String(indice + 1)} de 2\\b`),
          );
          // El 10 % de la mesa se aplica sobre lo que de verdad se vende: la parte con descuento
          // deja menos propina que la otra.
          await expect.poll(() => totalDelCobro(beatriz)).toBe(venta + propina);
          if (indice === 1) {
            await beatriz.getByRole('button', { name: 'Tarjeta', exact: true }).click();
          }
          await beatriz.getByRole('button', { name: /^COBRAR/ }).click();
          await exigirCobroAceptado(beatriz, /Se cobraron/);
          cobradas.push(
            await exigirCuentaCobrada(beatriz, hija.ordenId, {
              ventaCentavos: venta,
              pagos: { [metodo]: venta + propina },
              propina: { [metodo]: propina },
              cambioCentavos: 0,
              sesionCajaId: sesionDeBeatriz,
            }),
          );
          libro.cobro({
            referencia: `mesa 5, cuenta ${String(indice + 1)} de 2 (una con descuento)`,
            ventaId: hija.ordenId,
            sesionCajaId: sesionDeBeatriz,
            ventaCentavos: venta,
            pagos: { [metodo]: venta + propina },
            propina: { [metodo]: propina },
          });
          expect(await comandasDe(duena, hija.ordenId)).toEqual([]);
          expect((await leerMesa(duena, 5)).estado).toBe(
            indice === 1 ? 'limpieza' : 'cuenta_solicitada',
          );
        }
        const pagado = cobradas.reduce(
          (suma, c) => suma + c.pagos.efectivo + c.pagos.tarjeta + c.pagos.transferencia,
          0,
        );
        const propinas = ventas.reduce((suma, v) => suma + diezPorCiento(v), 0);
        expect(pagado, 'Lo cobrado en las partes no es la madre más sus propinas.').toBe(
          ventaDeLaMadre + propinas,
        );
        expect(loQueBajo(antes, await existencias(duena))).toEqual(consumoDe(pedido));
        await exigirQueLaCocinaNoVeLaMesa(cocina, 'Mesa 5');
      });
      await limpiarLaMesa(duena, 5);
      dia.exigirSinFallos();
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // ══ HALLAZGOS: lo que la aplicación hace hoy y no debe ═══════════════════════
  //
  // Cada una de estas pruebas exige el comportamiento CORRECTO. Las que siguen en `test.fixme` no
  // se corren y dicen arriba qué falla (D-2, D-3 y D-5, pendientes del reporte 021); D-4, D-6 y
  // D-7 se arreglaron en el cierre del 21-10 y corren. El día que el defecto se arregle se quita el `fixme` y la
  // prueba tiene que pasar sin tocar nada más. Cada una limpia lo que arma (separa el grupo y
  // cancela sus cuentas), así que con el `fixme` quitado deja el día como lo encontró.

  /** Dos mesas con consumo, UNIDAS por la pantalla: el punto de partida de D-2, D-3 y D-4. */
  async function armarUnGrupo(
    dia: Dia,
    numeroPrincipal: number,
    numeroUnida: number,
  ): Promise<{
    readonly principal: Awaited<ReturnType<typeof sentarYComandar>>;
    readonly unida: Awaited<ReturnType<typeof sentarYComandar>>;
    readonly unionId: string;
  }> {
    const principal = await sentarYComandar(dia.duena, dia.duena, numeroPrincipal, 2, [
      { nombre: CARTA.cerveza.nombre, veces: 2 },
    ]);
    const unida = await sentarYComandar(dia.duena, dia.duena, numeroUnida, 2, [
      { nombre: CARTA.arrachera.nombre, veces: 1 },
    ]);
    const unionId = await unirPorLaPantalla(dia.duena, principal, numeroPrincipal, numeroUnida);
    return { principal, unida, unionId };
  }

  /** Lo deshace todo sin cobrar nada: separa el grupo y cancela la cuenta que quedó en la principal. */
  async function deshacerElGrupo(
    dia: Dia,
    grupo: Awaited<ReturnType<typeof armarUnGrupo>>,
  ): Promise<void> {
    await comando(dia.beatriz, '/api/restaurante/separar-mesas', { unionId: grupo.unionId });
    const cancelada = await comando(dia.beatriz, '/api/restaurante/cancelar-orden', {
      ordenId: grupo.principal.ordenId,
      motivo: 'prueba de un hallazgo: no es una venta',
    });
    expect(cancelada.ok, `cancelar la cuenta de prueba: ${cancelada.mensaje ?? ''}`).toBe(true);
  }

  // D-4 · LA MESA UNIDA SE LEE COMO LIBRE. Arreglado en el cierre del 21-10: la pantalla dice que
  //   está unida a otra y no ofrece abrirla. Lo que fallaba: la mesa unida no tiene cuenta propia (`venta_activa_id` nulo, su consumo pasó a la
  //   principal) y `MesaActiva` decide «libre» sólo por eso (`mesaLibre`, MesaActiva.tsx:229):
  //   pinta «Mesa 8 está libre» y ofrece «Abrir la mesa», cuando el servidor la tiene «ocupada»
  //   por el grupo y rechazaría la apertura.
  //   Se exige: que la pantalla de la mesa unida no diga «libre» ni ofrezca abrirla.
  test('D-4 · la pantalla de la mesa unida no dice «está libre» ni ofrece abrirla', async ({
    browser,
  }, info) => {
    test.setTimeout(6 * 60_000);
    const dia = await empezarElDia(browser, info);
    const grupo = await armarUnGrupo(dia, 7, 8);
    try {
      await irALaMesa(dia.duena, grupo.unida.mesaId, 8);
      expect((await leerMesa(dia.duena, 8)).estado, 'La mesa unida debe seguir ocupada.').not.toBe(
        'libre',
      );
      await expect(
        dia.duena.getByText('Mesa 8 está libre'),
        'La pantalla dice que la mesa unida está libre, y el servidor la tiene ocupada por el grupo.',
      ).toHaveCount(0);
      await expect(
        dia.duena.getByRole('button', { name: 'Abrir la mesa' }),
        'La pantalla ofrece abrir una mesa que es de un grupo.',
      ).toHaveCount(0);
    } finally {
      await deshacerElGrupo(dia, grupo);
      await dia.equipo.cerrar();
    }
  });

  // D-2 · NINGUNA PANTALLA SEPARA UN GRUPO.
  //   Qué falla: `restaurante.separar_mesas` existe, con su ruta (`/api/restaurante/separar-mesas`)
  //   y sus pruebas, y ninguna pantalla la llama: `AccionesDeLaMesa.tsx` ofrece «Pedir la cuenta»,
  //   «Cambiar de mesa» y «Unir mesas», y no «Separar». Un grupo que se juntó por error no se
  //   puede deshacer desde el sistema.
  //   Se exige: un botón «Separar» en la mesa activa de la principal de un grupo.
  test.fixme('D-2 · la mesa activa de la principal de un grupo ofrece «Separar»', async ({
    browser,
  }, info) => {
    test.setTimeout(6 * 60_000);
    const dia = await empezarElDia(browser, info);
    const grupo = await armarUnGrupo(dia, 7, 8);
    try {
      await irALaMesa(dia.duena, grupo.principal.mesaId, 7);
      await expect(dia.duena.getByRole('group', { name: /^Acciones de/ })).toBeVisible();
      await expect(
        dia.duena.getByRole('button', { name: /Separar/ }),
        'La mesa activa de la principal no ofrece separar el grupo.',
      ).toBeVisible();
    } finally {
      await deshacerElGrupo(dia, grupo);
      await dia.equipo.cerrar();
    }
  });

  // D-3 · LO QUE COCINA DEJÓ LISTO PARA LA MESA UNIDA NO SE ENTREGA DESDE EL GRUPO.
  //   Qué falla: «Listos para recoger» y «Marcar entregado» de la principal sólo leen y mueven las
  //   comandas de SU cuenta (`useListosDeLaCuenta(mesa.venta_activa_id)`, MesaActiva.tsx:165); las de
  //   la mesa unida cuelgan de la cuenta absorbida, así que se quedan en «listo» hasta que cocina
  //   las quita de su lista.
  //   Se exige: que tras «Marcar entregado» en la principal las comandas de la unida pasen a
  //   «entregado».
  test.fixme('D-3 · «Marcar entregado» en la principal entrega también lo que cocina dejó listo para la mesa unida', async ({
    browser,
  }, info) => {
    test.setTimeout(6 * 60_000);
    const dia = await empezarElDia(browser, info);
    const grupo = await armarUnGrupo(dia, 7, 8);
    try {
      const deLaPrincipal = (await comandasDeLaMesa(dia.duena, grupo.principal.mesaId)).length;
      const deLaUnida = (await comandasDeLaMesa(dia.duena, grupo.unida.mesaId)).length;
      await cocinaDejaListaLaMesa(dia.cocina, 7, deLaPrincipal);
      await cocinaDejaListaLaMesa(dia.cocina, 8, deLaUnida);
      await entregarEnLaMesa(dia.duena, 7, CARTA.cerveza.nombre);
      await expect
        .poll(async () => estadosDe(await comandasDeLaMesa(dia.duena, grupo.unida.mesaId)), {
          message:
            'Lo de la mesa unida sigue «listo» tras entregar desde el grupo: se enfriaría en la ventana.',
        })
        .toEqual(Array<string>(deLaUnida).fill('entregado'));
    } finally {
      // Si el defecto sigue, lo de la unida se queda en la ventana: cocina lo quita para no dejarlo.
      await deshacerElGrupo(dia, grupo);
      await dia.equipo.cerrar();
    }
  });

  // D-5 · LA AUTORIZACIÓN DEL SUPERVISOR NO VA ATADA A LA CUENTA.
  //   Qué falla: `identidad/supervisor.ts` firma una autorización de dos minutos atada sólo al
  //   negocio y a quien la pidió (`CargaDeAutorizacion`: org, supervisor, rol, solicita, exp), no a
  //   la cuenta ni al importe, y el descuento no la consume: la misma cajera la presenta en OTRA
  //   cuenta y el servidor descuenta «autorizado» sin que el supervisor haya visto esa cuenta.
  //   Se exige: que el servidor rechace una autorización ya usada, o presentada en otra cuenta.
  test.fixme('D-5 · una autorización de supervisor sirve para UNA cuenta: presentada en otra, se rechaza', async ({
    browser,
  }, info) => {
    test.setTimeout(6 * 60_000);
    const dia = await empezarElDia(browser, info);
    try {
      const gerente = personaDe(SLUG, 'gerente');
      const rosa = await dia.equipo.pagina(info, 'cajero');
      const pedido = [{ nombre: CARTA.cerveza.nombre, veces: 2 }] as const;
      const descuento = Math.round(importeDe(pedido) * 0.2);
      const a = await sentarYComandar(dia.duena, dia.duena, 3, 2, pedido);
      const b = await sentarYComandar(dia.duena, dia.duena, 6, 2, pedido);
      try {
        const tope = await comando<{
          readonly quienesAutorizan: readonly {
            readonly empleoId: string;
            readonly nombre: string;
          }[];
        }>(rosa, '/api/venta/tope-de-descuento', {});
        const gerenteEmpleo =
          tope.datos?.quienesAutorizan.find((q) => q.nombre === gerente.nombre)?.empleoId ?? '';
        const firmada = await comando<{ readonly autorizacion: string }>(
          rosa,
          '/api/identidad/supervisor',
          { empleoId: gerenteEmpleo, pin: gerente.pin },
        );
        expect(firmada.ok, `identidad.supervisor: ${firmada.mensaje ?? ''}`).toBe(true);
        const enLaPrimera = await comando(rosa, '/api/restaurante/descontar-cuenta', {
          ordenId: a.ordenId,
          descuentoCentavos: descuento,
          motivo: 'la cuenta que el supervisor vio',
          autorizacion: firmada.datos?.autorizacion,
        });
        expect(enLaPrimera.ok, `descontar la cuenta autorizada: ${enLaPrimera.mensaje ?? ''}`).toBe(
          true,
        );
        const enOtra = await comando(rosa, '/api/restaurante/descontar-cuenta', {
          ordenId: b.ordenId,
          descuentoCentavos: descuento,
          motivo: 'otra cuenta con la misma autorización',
          autorizacion: firmada.datos?.autorizacion,
        });
        expect(
          enOtra.ok,
          'El servidor descontó otra cuenta con una autorización que ya se usó en la primera.',
        ).toBe(false);
      } finally {
        for (const cuenta of [a, b]) {
          await comando(rosa, '/api/restaurante/cancelar-orden', {
            ordenId: cuenta.ordenId,
            motivo: 'prueba de la autorización reutilizada',
          });
        }
      }
    } finally {
      await dia.equipo.cerrar();
    }
  });

  // D-7 · CANCELAR LA CUENTA DE UN GRUPO DEJA VIVA EN COCINA LA COMANDA DE LA MESA UNIDA. Arreglado
  //   en el cierre del 21-10 (`cancelarComandasVivas` cancela también las de las cuentas absorbidas;
  //   prueba contra Postgres en `cambio-y-union-de-mesas-con-cobro`). Lo que fallaba: `restaurante.cancelar_orden` cancela las comandas de la cuenta que se cancela
  //   (`cancelacion.ts:100`, `cancelarComandasVivas(..., orden.id)`) y suelta el grupo
  //   (`cerrarElGrupoDeLaMesa`, mesas libres), pero las comandas de la mesa unida cuelgan de la
  //   cuenta ABSORBIDA y nadie las toca: se quedan «nuevo» en el tablero de cocina, que prepara un
  //   plato que nadie va a pagar para una mesa que ya está libre y que puede estar sentando a otra
  //   gente.
  //   Se exige: que tras cancelar la cuenta del grupo todas sus comandas queden «cancelado» y la
  //   cocina deje de ver las dos mesas.
  test('D-7 · cancelar la cuenta de un grupo cancela también la comanda de la mesa unida', async ({
    browser,
  }, info) => {
    test.setTimeout(6 * 60_000);
    const dia = await empezarElDia(browser, info);
    // Las mesas 7 y 8 ya tuvieron comandas hoy (6b y D-4): sólo cuentan las de ESTE grupo. La 6b
    // deja «listo» lo de la 8 porque entregar desde la principal no lo alcanza (D-3, pendiente).
    const previas = new Set<string>();
    for (const numero of [7, 8]) {
      const mesa = await leerMesa(dia.duena, numero);
      for (const c of await comandasDeLaMesa(dia.duena, mesa.id)) previas.add(c.id);
    }
    const grupo = await armarUnGrupo(dia, 7, 8);
    try {
      const cancelada = await comando(dia.beatriz, '/api/restaurante/cancelar-orden', {
        ordenId: grupo.principal.ordenId,
        motivo: 'prueba de un hallazgo: el grupo se fue sin pagar',
      });
      expect(cancelada.ok, `cancelar la cuenta del grupo: ${cancelada.mensaje ?? ''}`).toBe(true);
      const delGrupo = async (): Promise<readonly string[]> =>
        [
          ...(await comandasDeLaMesa(dia.duena, grupo.principal.mesaId)),
          ...(await comandasDeLaMesa(dia.duena, grupo.unida.mesaId)),
        ]
          .filter((c) => !previas.has(c.id))
          .map((c) => c.estado);
      const cuantas = (await delGrupo()).length;
      expect(cuantas, 'El grupo no tenía comandas que cancelar.').toBeGreaterThan(0);
      await expect
        .poll(delGrupo, {
          message:
            'Quedó una comanda viva de un grupo cancelado: cocina haría un plato que nadie va a pagar.',
        })
        .toEqual(Array<string>(cuantas).fill('cancelado'));
      // La 8 no se mira en el tablero: puede seguir enseñando lo que la 6b dejó «listo» (D-3). Lo
      // de ESTE grupo ya se afirmó arriba, contra el servidor.
      await exigirQueLaCocinaNoVeLaMesa(dia.cocina, 'Mesa 7');
    } finally {
      // Con el defecto presente la prueba falla y la comanda de la unida se queda viva en el
      // tablero: es justo lo que se está señalando, y la mesa 8 ya no sirve a otra prueba.
      await dia.equipo.cerrar();
    }
  });

  // ── 7 · AL CIERRE, EL DINERO DEL DÍA CUADRA ──────────────────────────────────
  test('7 · al cierre, Beatriz cuenta lo esperado y el dinero del día cuadra al centavo contra el servidor', async ({
    browser,
  }, info) => {
    test.setTimeout(5 * 60_000);
    const dia = await empezarElDia(browser, info);
    try {
      // Lo que tiene que haber en el cajón: el fondo y el EFECTIVO de cada cobro anotado —cada
      // uno, una sola vez—. La tarjeta y la transferencia no entran al cajón, y las cuentas
      // canceladas ni entran.
      const efectivo = libro
        .libro()
        .cobros.reduce((suma, cobro) => suma + Number(cobro.pagos['efectivo'] ?? 0n), 0);
      const esperado = FONDO_CENTAVOS + efectivo;
      expect(
        await esperadoDelCajon(dia.beatriz),
        'El cajón no tiene el fondo más el efectivo de cada cobro, una vez.',
      ).toBe(esperado);
      await cerrarCajaYCuadrar(dia.beatriz, esperado);
      libro.contar(sesionDeBeatriz, esperado);
      // Lo que se vendió, contra el servidor: cada venta, cada método, cada propina, el cajón y el
      // almacén. Un cobro de más —o de menos— es un hallazgo que dice cuál.
      const conciliacion = await exigirQueCuadre(dia.duena, libro);
      if (libro.libro().cobros.length > 0) {
        expect(conciliacion.resumen.cobradoCentavos).toBeGreaterThan(0n);
      }
      dia.exigirSinFallos();
    } finally {
      info.annotations.push({ type: 'caja', description: await soltarLaCaja(dia.beatriz) });
      await dia.equipo.cerrar();
    }
  });

  // D-6 · UNA DEMO CON UNA CUENTA DIVIDIDA NO SE PODÍA RESETEAR. Arreglado en el cierre del 21-10
  //   con la migración 185 (prueba contra Postgres en `dueno-general.integracion`). Lo que fallaba: `configuracion.resetear_demo` borra las cuentas de la demo en una transacción y el
  //   disparador diferido `division_cuadra` (migración 070, `division_suma_igual_a_la_madre`) se
  //   evalúa al confirmar sobre cada hija borrada: la madre ya no existe, `total_madre` es NULL,
  //   `NULL is distinct from 0` es verdadero y el commit revienta con 23514 «La división no cuadra:
  //   la madre suma <NULL> y las hijas 0». El comando contesta 500 ERROR_INTERNO y
  //   `scripts/sembrar-demos.mjs` también falla: una demo en la que alguien dividió una cuenta no
  //   se puede volver a dejar limpia sin tocar la base a mano.
  //   Se exige: que el reseteo conteste 200 aunque haya cuentas divididas, y que no quede ninguna.
  test('D-6 · el reseteo de la demo se deja hacer aunque haya una cuenta dividida', async ({
    browser,
  }, info) => {
    test.setTimeout(3 * 60_000);
    const equipo = new Equipo(browser, SLUG);
    try {
      const duena = conTecho(await equipo.pagina(info, 'dueno'));
      const respuesta = await duena.request.post('/api/catalogo/demostracion/resetear', {
        headers: cabecerasDeEscrituraDePrueba(),
        data: { confirmacion: 'RESETEAR' },
      });
      expect(
        respuesta.status(),
        `resetear_demo con una cuenta dividida en la demo: ${await respuesta.text()}`,
      ).toBe(200);
      expect(
        await consultarPuente(duena, 'Venta', { filtro: { estado: 'dividida' }, limite: 5 }),
        'El reseteo no se llevó la cuenta dividida.',
      ).toEqual([]);
    } finally {
      await equipo.cerrar();
    }
  });
});
