import {
  devices,
  expect,
  type Browser,
  type Locator,
  type Page,
  type Request,
  type Response,
  type Route,
  type TestInfo,
} from '@playwright/test';

import { cabecerasDeEscrituraDePrueba, consultarPuente } from './sesion.ts';

/**
 * LA SALA DEL RESTAURANTE POR SUS PANTALLAS HEREDADAS, para las pruebas que no son «el día».
 *
 * Son las pantallas que se presentan —«Mesas y pedidos» de la mesera, «Cocina» y «Caja»— y los
 * pasos que se repiten mesa tras mesa: abrirla, comandar, sacar la comanda, entregar, pedir la
 * cuenta y cobrarla. `dia-completo-restaurante.spec.ts` los trae escritos dentro; aquí viven
 * como ayudantes para que `restaurante-portal-qr.spec.ts` y `restaurante-concurrencia.spec.ts`
 * se lean como una escena y no como una pila de selectores.
 *
 * ── Dos reglas que este archivo se impone ─────────────────────────────────────
 *   1 · Lo que vale es lo que el SERVIDOR guardó. Cada ayudante de lectura (`comandasDeLaCuenta`,
 *       `cuentaEnElServidor`, `pagosDeLaCuenta`…) lee por el puente con la sesión de quien se la
 *       pase —la dueña, que ve costos y caja—; la pantalla que dice «enviado» o «cobrado» no es
 *       prueba de nada.
 *   2 · Nada de esperas por tiempo. Todo espera una CONDICIÓN: un `expect`, un `poll` sobre lo
 *       guardado o la respuesta de una petición. Donde un toque puede perderse (la cocina repinta
 *       cada dos segundos y una lectura que venía en camino pisa el cambio optimista), el ayudante
 *       NO cuenta botones: pregunta al servidor si el cambio llegó y, si no, vuelve a tocar.
 */

/** Pesos con dos decimales, como se teclean: `56400` → `564.00`. */
export const pesos = (centavos: number): string => (centavos / 100).toFixed(2);

/** Como los escribe la pantalla: `$1,246.00`. */
export const enPantalla = (centavos: number): string =>
  `$${(centavos / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

/** Centavos enteros de lo que el puente sirve en pesos. */
export const enCentavos = (valor: number | string | null | undefined): number =>
  Math.round(Number(valor ?? 0) * 100);

/** Un nombre como texto literal dentro de una expresión regular. */
export const escapar = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ═══════════════════════════════════════════════════════════════════════════
// LA CARTA DE LA DEMO, escrita aquí y no leída del catálogo: una prueba que compara el cobro
// contra la misma tabla de la que el cobro sale no prueba nada.
// ═══════════════════════════════════════════════════════════════════════════

export const CARTA = {
  guacamole: { nombre: 'Guacamole con totopos', centavos: 12_500, area: 'cocina' },
  arrachera: { nombre: 'Arrachera al carbón', centavos: 32_900, area: 'cocina' },
  sopa: { nombre: 'Sopa de tortilla', centavos: 11_500, area: 'cocina' },
  pastor: { nombre: 'Orden de tacos al pastor', centavos: 11_900, area: 'cocina' },
  cerveza: { nombre: 'Cerveza clara 355 ml', centavos: 5_500, area: 'barra' },
  limonada: { nombre: 'Limonada natural 500 ml', centavos: 4_500, area: 'barra' },
  mineral: { nombre: 'Agua mineral 355 ml', centavos: 3_500, area: 'barra' },
} as const;

export interface PlatilloPedido {
  readonly nombre: string;
  readonly veces: number;
}

/** Lo que cuestan varios platillos juntos, en centavos. */
export function importeDe(pedido: readonly PlatilloPedido[]): number {
  const porNombre = new Map<string, number>(
    Object.values(CARTA).map((c) => [c.nombre, c.centavos]),
  );
  return pedido.reduce((suma, { nombre, veces }) => {
    const precio = porNombre.get(nombre);
    if (precio === undefined) throw new Error(`«${nombre}» no está en la carta de la prueba.`);
    return suma + precio * veces;
  }, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// LA MESERA
// ═══════════════════════════════════════════════════════════════════════════

/** El número de la mesa, en el mapa (escritorio y tableta) y en la lista del teléfono. */
export function laMesa(page: Page, numero: number): Locator {
  return page
    .locator('span.font-heading')
    .filter({ hasText: new RegExp(`^${String(numero)}$`) })
    .first();
}

/** La mesa que la mesera tiene abierta (el diálogo de la mesa). */
export function dialogoDeLaMesa(page: Page, numero: number): Locator {
  // Su nombre es el encabezado: «Mesa 1 Esperando orden 4».
  return page.getByRole('dialog', { name: new RegExp(`^Mesa ${String(numero)} `) });
}

/**
 * Espera a que el diálogo termine de abrir. Entra con una animación de escala, y un toque que
 * llega antes de que termine se pierde: la traza lo dejó dicho, «Abrir mesa» tocado y ninguna
 * petición enviada. Una mesera toca cuando lo ve.
 *
 * Se espera a las animaciones que terminan: las que se repiten sin fin (un pulso) no acaban
 * nunca, y una que React cancela al volver a pintar rechaza su `finished`; tras cada tanda se
 * vuelve a mirar por si empezó otra.
 */
export async function yaAbierto(dialogo: Locator): Promise<void> {
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

interface MesaDelPuente {
  readonly id?: string;
  readonly numero?: number;
  readonly estado?: string;
  readonly venta_activa_id?: string | null;
  readonly qr_token?: string | null;
  readonly qr_activo?: boolean;
  readonly mesero_asignado_nombre?: string | null;
}

/** La mesa `numero` como la tiene el servidor. */
export async function mesaEnElServidor(
  lector: Page,
  numero: number,
): Promise<{
  readonly mesaId: string;
  readonly estado: string;
  readonly ordenId: string | null;
  readonly qrToken: string | null;
  readonly qrActivo: boolean;
  readonly mesero: string | null;
}> {
  const [mesa] = await consultarPuente<MesaDelPuente>(lector, 'Mesa', {
    filtro: { numero },
    limite: 1,
  });
  expect(mesa, `El servidor no tiene la mesa ${String(numero)}.`).toBeDefined();
  return {
    mesaId: mesa?.id ?? '',
    estado: mesa?.estado ?? '',
    ordenId: mesa?.venta_activa_id ?? null,
    qrToken: mesa?.qr_token ?? null,
    qrActivo: mesa?.qr_activo === true,
    mesero: mesa?.mesero_asignado_nombre ?? null,
  };
}

/** El estado de la mesa en el servidor, esperando a que llegue al que se pide. */
export async function exigirEstadoDeLaMesa(
  lector: Page,
  numero: number,
  estado: string,
  mensaje: string,
): Promise<void> {
  await expect
    .poll(async () => (await mesaEnElServidor(lector, numero)).estado, { message: mensaje })
    .toBe(estado);
}

/**
 * ABRE LA MESA `numero` desde el mapa, como la mesera: toca la mesa libre, dice para cuántas
 * personas y la abre. Devuelve la mesa y la cuenta que el SERVIDOR tiene ya viva para ella.
 */
export async function abrirLaMesa(
  page: Page,
  lector: Page,
  numero: number,
  personas: number,
): Promise<{ readonly mesaId: string; readonly ordenId: string }> {
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

  // Lo que el servidor guardó: la mesa ya no está libre y apunta a una cuenta viva.
  let ordenId = '';
  let mesaId = '';
  await expect
    .poll(
      async () => {
        const mesa = await mesaEnElServidor(lector, numero);
        mesaId = mesa.mesaId;
        ordenId = mesa.ordenId ?? '';
        return mesa.estado !== 'libre' && ordenId !== '';
      },
      { message: `La mesa ${String(numero)} se abrió en pantalla y el servidor no le ve cuenta.` },
    )
    .toBe(true);
  return { mesaId, ordenId };
}

/**
 * Toca cada platillo las veces que se piden, en el diálogo de la mesa. Los platillos son
 * botones cuyo nombre empieza por el del platillo y sigue con su precio: «Arrachera al carbón
 * $329.00 cocina».
 */
export async function armarElPedido(
  page: Page,
  numero: number,
  platillos: readonly PlatilloPedido[],
): Promise<void> {
  const mesa = dialogoDeLaMesa(page, numero);
  for (const { nombre, veces } of platillos) {
    const tesela = mesa.getByRole('button', { name: new RegExp(`^${escapar(nombre)} \\$`) });
    for (let i = 0; i < veces; i += 1) await tesela.click();
  }
}

/**
 * El botón de una de las dos acciones de la orden: al pie del diálogo en la tableta y la PC; en
 * el teléfono, en el carrito flotante de abajo, que hay que abrir. El carrito se anuncia con su
 * globo delante —«4 4 productos $564.00 · Ver pedido Confirmar»— o, vacío, «Mesa abierta
 * Solicitar cuenta Abrir»: por eso la acción se busca exacta, para no tocar el carrito otra vez.
 */
export async function botonDeLaMesa(
  page: Page,
  numero: number,
  accion: 'Enviar a Cocina' | 'Solicitar cuenta',
): Promise<Locator> {
  const enElDialogo = dialogoDeLaMesa(page, numero)
    .getByRole('button', { name: accion, exact: true })
    .filter({ visible: true });
  const carrito = page
    .getByRole('button', { name: /\d+ productos? .*Ver pedido|^Mesa abierta\b/ })
    .filter({ visible: true });
  await expect(enElDialogo.or(carrito).first()).toBeVisible();
  if ((await enElDialogo.count()) > 0) return enElDialogo;
  await carrito.last().click();
  return page.getByRole('button', { name: accion, exact: true }).filter({ visible: true }).last();
}

/** Cuenta las peticiones de la mesera a una ruta y cuántas respondieron. */
export interface ContadorDePeticiones {
  readonly enviadas: () => number;
  readonly respondidas: () => number;
  /** Los cuerpos y las claves de idempotencia de cada petición, en el orden en que salieron. */
  readonly claves: () => readonly string[];
  readonly dejarDeContar: () => void;
}

export function contarPeticiones(page: Page, ruta: string): ContadorDePeticiones {
  let enviadas = 0;
  let respondidas = 0;
  const claves: string[] = [];
  const alEnviar = (peticion: Request): void => {
    if (new URL(peticion.url()).pathname !== ruta || peticion.method() !== 'POST') return;
    enviadas += 1;
    claves.push(peticion.headers()['idempotency-key'] ?? '');
  };
  const alResponder = (respuesta: Response): void => {
    if (new URL(respuesta.url()).pathname !== ruta || respuesta.request().method() !== 'POST')
      return;
    respondidas += 1;
  };
  page.on('request', alEnviar);
  page.on('response', alResponder);
  return {
    enviadas: () => enviadas,
    respondidas: () => respondidas,
    claves: () => claves,
    dejarDeContar: () => {
      page.off('request', alEnviar);
      page.off('response', alResponder);
    },
  };
}

/**
 * QUE LAS PETICIONES A `ruta` DE VARIAS PESTAÑAS SALGAN JUNTAS.
 *
 * Dos tabletas que tocan «Enviar» «al mismo tiempo» no llegan al servidor en el mismo instante:
 * una se adelanta unos milisegundos y, con una transacción corta, la otra ya la encontró
 * terminada. Aquí cada petición espera, ya armada, a que TODAS las demás estén en camino, y
 * entonces salen juntas: lo que se prueba es la carrera, no la suerte del reparto de turnos.
 *
 * Si una pestaña no manda su petición —la pantalla no la dejó—, la espera se rinde con un
 * mensaje que dice cuántas llegaron, en vez de colgar la prueba entera.
 */
export async function soltarJuntas(
  paginas: readonly Page[],
  ruta: string,
): Promise<{ readonly quitar: () => Promise<void> }> {
  let llegadas = 0;
  let soltar: () => void = () => undefined;
  const todas = new Promise<void>((resolver) => {
    soltar = resolver;
  });
  const manejador = async (peticion: Route): Promise<void> => {
    llegadas += 1;
    if (llegadas === paginas.length) soltar();
    let rendirse: ReturnType<typeof setTimeout> | undefined;
    const sinLasDemas = new Promise<never>((_, rechazar) => {
      rendirse = setTimeout(() => {
        rechazar(
          new Error(
            `Sólo ${String(llegadas)} de ${String(paginas.length)} pestañas mandaron su petición a ` +
              `${ruta}: la barrera no se puede soltar.`,
          ),
        );
      }, 20_000);
    });
    try {
      await Promise.race([todas, sinLasDemas]);
    } finally {
      clearTimeout(rendirse);
    }
    await peticion.continue();
  };
  const patron = `**${ruta}`;
  for (const pagina of paginas) await pagina.route(patron, manejador);
  return {
    quitar: async () => {
      for (const pagina of paginas) await pagina.unroute(patron, manejador);
    },
  };
}

/** COMANDA y ENVÍA A COCINA, y espera la respuesta del servidor. */
export async function comandar(
  page: Page,
  numero: number,
  platillos: readonly PlatilloPedido[],
): Promise<void> {
  await armarElPedido(page, numero, platillos);
  const boton = await botonDeLaMesa(page, numero, 'Enviar a Cocina');
  const enviada = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/restaurante/enviar-pedido' &&
      r.request().method() === 'POST',
  );
  await boton.click();
  const respuesta = await enviada;
  expect(
    respuesta.status(),
    `El servidor rechazó el envío a cocina: ${(await respuesta.text()).slice(0, 300)}`,
  ).toBe(200);
  await expect(page.getByText('¡Pedido enviado a cocina!').first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Cierra el diálogo de la mesa y vuelve al mapa. */
export async function alMapa(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** La mesera recoge y entrega lo listo de la mesa; la mesa queda «Ocupada». */
export async function entregar(page: Page, numero: number): Promise<void> {
  await laMesa(page, numero).click();
  const mesa = dialogoDeLaMesa(page, numero);
  await yaAbierto(mesa);
  const marcar = mesa.getByRole('button', { name: 'Marcar entregado' });
  await expect(marcar.first()).toBeVisible({ timeout: 30_000 });
  while ((await marcar.count()) > 0) {
    const entregada = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/restaurante/entregar-pedidos' && r.ok(),
    );
    await marcar.first().click();
    await entregada;
  }
  await expect(mesa.getByText('Ocupada', { exact: true })).toBeVisible({ timeout: 30_000 });
}

/** La mesera pide la cuenta con la propina que acordó la mesa; devuelve el código de caja. */
export async function pedirLaCuenta(
  page: Page,
  numero: number,
  propina: '10%' | '15%' | 'Sin propina',
  totalCentavos: number,
): Promise<string> {
  const boton = await botonDeLaMesa(page, numero, 'Solicitar cuenta');
  await boton.click();
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
    new RegExp(`TOTAL\\s*${escapar(enPantalla(totalCentavos))}`),
  );
  const codigo = /M\d{2}-\d{4}/.exec(await precuenta.innerText())?.[0] ?? '';
  expect(codigo, 'La precuenta no trae el código para caja.').not.toBe('');
  await precuenta.getByRole('button', { name: 'Cerrar' }).click();
  await expect(precuenta).toBeHidden();
  return codigo;
}

/**
 * Una mesa cobrada pasa a «limpieza» y la mesera la deja «limpia» tocándola: el navegador
 * pregunta «¿Marcar mesa como limpia y disponible?». Si la mesa ya volvió al servicio —la caja
 * la libera sola al cobrar— no hay nada que tocar. Devuelve si hizo falta tocarla.
 */
export async function mesaLimpia(page: Page, lector: Page, numero: number): Promise<boolean> {
  const antes = await mesaEnElServidor(lector, numero);
  if (antes.estado === 'libre') return false;
  expect(antes.estado, `La mesa ${String(numero)} cobrada no está en limpieza ni libre.`).toBe(
    'limpieza',
  );
  page.once('dialog', (aviso) => {
    void aviso.accept();
  });
  await laMesa(page, numero).click();
  await exigirEstadoDeLaMesa(
    lector,
    numero,
    'libre',
    `La mesera dejó limpia la mesa ${String(numero)} y el servidor no la libera.`,
  );
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// LO QUE EL SERVIDOR GUARDÓ
// ═══════════════════════════════════════════════════════════════════════════

export interface ComandaDelServidor {
  readonly id: string;
  readonly estado: string;
  readonly area: string;
  /** De dónde vino: la mesera, o el comensal por su QR. */
  readonly origen: string;
  readonly items: readonly { readonly nombre: string; readonly cantidad: number }[];
}

/** Las comandas de la cuenta —cocina y barra son dos— con las líneas que lleva cada una. */
export async function comandasDeLaCuenta(
  lector: Page,
  ordenId: string,
): Promise<readonly ComandaDelServidor[]> {
  const filas = await consultarPuente<{
    id?: string;
    estado?: string;
    area?: string;
    origen_pedido?: string | null;
    items?: readonly {
      producto_nombre?: string | null;
      cantidad?: number | string | null;
    }[];
  }>(lector, 'PedidoPreparacion', { filtro: { venta_id: ordenId }, limite: 50 });
  return filas.map((c) => ({
    id: c.id ?? '',
    estado: c.estado ?? '',
    area: c.area ?? '',
    origen: c.origen_pedido ?? '',
    items: (c.items ?? []).map((i) => ({
      nombre: i.producto_nombre ?? '',
      cantidad: Number(i.cantidad ?? 0),
    })),
  }));
}

/** Las unidades por platillo en TODAS las comandas de la cuenta, ordenadas por nombre. */
export function unidadesPorPlatillo(
  comandas: readonly ComandaDelServidor[],
): readonly (readonly [string, number])[] {
  const hay = new Map<string, number>();
  for (const comanda of comandas) {
    for (const item of comanda.items)
      hay.set(item.nombre, (hay.get(item.nombre) ?? 0) + item.cantidad);
  }
  return [...hay.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Lo esperado, en el mismo formato y orden que `unidadesPorPlatillo`. */
export function unidadesEsperadas(
  pedido: readonly PlatilloPedido[],
): readonly (readonly [string, number])[] {
  const suma = new Map<string, number>();
  for (const { nombre, veces } of pedido) suma.set(nombre, (suma.get(nombre) ?? 0) + veces);
  return [...suma.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * LAS LÍNEAS DE LA CUENTA como las tiene el servidor —nombre, unidades e importe—, ordenadas.
 * Son lo que se cobra: una línea de más es un platillo que se cobra y no salió, y una de menos,
 * uno que salió y no se cobra.
 */
export async function lineasDeLaCuenta(
  lector: Page,
  ordenId: string,
): Promise<
  readonly { readonly nombre: string; readonly cantidad: number; readonly centavos: number }[]
> {
  const filas = await consultarPuente<{
    producto_nombre?: string | null;
    cantidad?: number | string | null;
    total?: number | null;
  }>(lector, 'DetalleVenta', { filtro: { venta_id: ordenId }, limite: 100 });
  return filas
    .map((f) => ({
      nombre: f.producto_nombre ?? '',
      cantidad: Number(f.cantidad ?? 0),
      centavos: enCentavos(f.total),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre) || a.cantidad - b.cantidad);
}

/** La cuenta en el servidor, en centavos. `totalCentavos` es la venta SIN propina. */
export async function cuentaEnElServidor(
  lector: Page,
  ordenId: string,
): Promise<{
  readonly estado: string;
  readonly folio: string;
  readonly totalCentavos: number;
  readonly propinaTipo: string | null;
  readonly propinaOrigen: string | null;
  readonly propinaPorcentaje: number | null;
  readonly sesionCajaId: string | null;
}> {
  const [cuenta] = await consultarPuente<{
    estado?: string | null;
    folio?: string | null;
    total?: number | null;
    propina_tipo?: string | null;
    propina_origen?: string | null;
    propina_porcentaje?: number | null;
    corte_caja_id?: string | null;
  }>(lector, 'Venta', { filtro: { id: ordenId }, limite: 1 });
  expect(cuenta, `El servidor no tiene la cuenta ${ordenId}.`).toBeDefined();
  return {
    estado: cuenta?.estado ?? '',
    folio: cuenta?.folio ?? '',
    totalCentavos: enCentavos(cuenta?.total),
    propinaTipo: cuenta?.propina_tipo ?? null,
    propinaOrigen: cuenta?.propina_origen ?? null,
    propinaPorcentaje: cuenta?.propina_porcentaje ?? null,
    sesionCajaId: cuenta?.corte_caja_id ?? null,
  };
}

/** Lo que entró por cada método a una cuenta cobrada, con su propina, sumando TODOS sus pagos. */
export interface PagosDeLaCuenta {
  readonly efectivo: number;
  readonly tarjeta: number;
  readonly transferencia: number;
  readonly propinaEfectivo: number;
  readonly propinaTarjeta: number;
  readonly propinaTransferencia: number;
  readonly cobradoConPropina: number;
  readonly cambio: number;
}

export async function pagosDeLaCuenta(lector: Page, ordenId: string): Promise<PagosDeLaCuenta> {
  const [cuenta] = await consultarPuente<{
    monto_efectivo?: number | null;
    monto_tarjeta?: number | null;
    monto_transferencia?: number | null;
    propina_efectivo?: number | null;
    propina_tarjeta?: number | null;
    propina_transferencia?: number | null;
    total_cobrado_con_propina?: number | null;
    cambio?: number | null;
  }>(lector, 'Venta', { filtro: { id: ordenId }, limite: 1 });
  return {
    efectivo: enCentavos(cuenta?.monto_efectivo),
    tarjeta: enCentavos(cuenta?.monto_tarjeta),
    transferencia: enCentavos(cuenta?.monto_transferencia),
    propinaEfectivo: enCentavos(cuenta?.propina_efectivo),
    propinaTarjeta: enCentavos(cuenta?.propina_tarjeta),
    propinaTransferencia: enCentavos(cuenta?.propina_transferencia),
    cobradoConPropina: enCentavos(cuenta?.total_cobrado_con_propina),
    cambio: enCentavos(cuenta?.cambio),
  };
}

/** Los movimientos del cajón que cita esta cuenta, con su signo, en centavos. */
export async function movimientosDeCajaDeLaCuenta(
  lector: Page,
  ordenId: string,
): Promise<readonly { readonly tipo: string; readonly centavos: number }[]> {
  const filas = await consultarPuente<{
    tipo?: string | null;
    monto_centavos?: number | string | null;
    referencia_id?: string | null;
  }>(lector, 'MovimientoCaja', { limite: 2000 });
  return filas
    .filter((m) => m.referencia_id === ordenId)
    .map((m) => ({ tipo: m.tipo ?? '', centavos: Number(m.monto_centavos ?? 0) }));
}

/** Los folios de las ventas cobradas, para que ni un cobro duplicado ni uno perdido pasen. */
export async function foliosCobrados(lector: Page): Promise<readonly string[]> {
  const filas = await consultarPuente<{ folio?: string | null; estado?: string | null }>(
    lector,
    'Venta',
    { limite: 1000 },
  );
  return filas
    .filter((f) => ['pagada', 'parcialmente_reembolsada', 'reembolsada'].includes(f.estado ?? ''))
    .map((f) => f.folio ?? '')
    .sort();
}

// ═══════════════════════════════════════════════════════════════════════════
// LA COCINA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Toño saca TODO lo de esa cuenta —cada comanda, de la cocina y de la barra— hasta que el
 * SERVIDOR las tiene todas «listas».
 *
 * No cuenta botones: una lectura que venía en camino pisaba el cambio optimista y un «Listo»
 * recién tocado reaparecía un instante (el segundo toque caía otra vez sobre la comanda de la
 * cocina y la de la barra se quedaba en el fuego). La pantalla ya no lo hace (DP-D19,
 * `cocina-toques-en-camino.spec.ts`), pero esto sigue preguntándole al SERVIDOR: cada vuelta ve
 * qué falta, toca UN botón y espera a que avance; si no avanza, vuelve a tocar. Mover una comanda
 * a un estado en el que ya está es inocuo.
 */
export async function cocinaDejaLista(
  cocina: Page,
  lector: Page,
  ordenId: string,
  comandasEsperadas: number,
): Promise<readonly ComandaDelServidor[]> {
  await expect
    .poll(async () => (await comandasDeLaCuenta(lector, ordenId)).length, {
      message: `Al servidor no llegaron las ${String(comandasEsperadas)} comandas de la cuenta.`,
      timeout: 30_000,
    })
    .toBe(comandasEsperadas);

  // Lo que a cocina le falta es lo que está «nuevo» o «en preparación»: lo «listo» y lo ya
  // «entregado» —la mesera recogió una tanda anterior— no le falta.
  const faltan = async (): Promise<readonly ComandaDelServidor[]> =>
    (await comandasDeLaCuenta(lector, ordenId)).filter(
      (c) => c.estado === 'nuevo' || c.estado === 'en_preparacion',
    );

  const rango = (c: ComandaDelServidor): number => (c.estado === 'nuevo' ? 0 : 1);

  for (let vuelta = 0; vuelta < comandasEsperadas * 8; vuelta += 1) {
    const pendientes = await faltan();
    if (pendientes.length === 0) break;
    const progresoAntes = pendientes.reduce((suma, c) => suma + rango(c), 0);
    const hayNuevas = pendientes.some((c) => c.estado === 'nuevo');
    const boton = cocina
      .getByRole('button', { name: hayNuevas ? 'Preparar' : 'Listo', exact: true })
      .first();
    await expect(
      boton,
      `La cocina no enseña el botón «${hayNuevas ? 'Preparar' : 'Listo'}» y al servidor le faltan ${String(pendientes.length)} comanda(s).`,
    ).toBeVisible({ timeout: 30_000 });
    await boton.click();
    try {
      await expect
        .poll(
          async () => (await faltan()).reduce((suma, c) => suma + rango(c), 0) !== progresoAntes,
          { timeout: 6_000 },
        )
        .toBe(true);
    } catch {
      // El toque cayó en una tarjeta que ya estaba en ese estado: se vuelve a mirar y a tocar.
    }
  }
  const finales = await comandasDeLaCuenta(lector, ordenId);
  expect(
    finales.filter((c) => c.estado === 'nuevo' || c.estado === 'en_preparacion'),
    'La cocina no dejó listas todas las comandas de la cuenta.',
  ).toEqual([]);
  return finales;
}

// ═══════════════════════════════════════════════════════════════════════════
// LA CAJA
// ═══════════════════════════════════════════════════════════════════════════

/** Rosa abre la caja de su terminal con el fondo que dice, por el diálogo de «Abrir caja». */
export async function abrirLaCaja(rosa: Page, fondoCentavos: number): Promise<void> {
  await rosa.getByRole('button', { name: 'Abrir caja' }).first().click();
  const apertura = rosa.getByRole('dialog').filter({ hasText: 'Efectivo inicial contado' });
  await apertura.getByPlaceholder('0.00').fill(pesos(fondoCentavos));
  await apertura.getByRole('button', { name: 'Abrir caja' }).click();
  await expect(rosa.getByText('Caja abierta. Ya puedes cobrar.').first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Lo que el servidor dice que debería haber en el cajón de esta terminal, ahora. */
export async function esperadoDelCajon(page: Page): Promise<number> {
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

/** Rosa abre en «Pendientes» la cuenta de la mesa y espera su diálogo de cobro. */
export async function abrirElCobro(rosa: Page, numero: number): Promise<Locator> {
  await rosa.getByRole('tab', { name: /^Pendientes/ }).click();
  await rosa.getByRole('button', { name: new RegExp(`^Mesa ${String(numero)} Cuenta`) }).click();
  const dialogo = rosa.getByRole('dialog').filter({ hasText: `Cobrar — Mesa ${String(numero)}` });
  await yaAbierto(dialogo);
  return dialogo;
}

/** Lo que `/api/venta/cobrar` contestó, ya leído. */
export interface RespuestaDeCobro {
  readonly estado: number;
  readonly ok: boolean;
  readonly codigo: string | null;
  readonly mensaje: string | null;
  readonly datos: {
    readonly ordenId: string;
    readonly folio: string;
    readonly totalCentavos: string;
    readonly propinaCentavos: string;
    readonly cambioCentavos: string;
  } | null;
}

/** Lee la respuesta de un cobro, sea buena o mala. */
export async function leerElCobro(respuesta: Response): Promise<RespuestaDeCobro> {
  const cuerpo = (await respuesta.json()) as {
    readonly ok?: boolean;
    readonly error?: { readonly codigo?: string; readonly mensaje?: string };
    readonly datos?: RespuestaDeCobro['datos'];
  };
  return {
    estado: respuesta.status(),
    ok: cuerpo.ok === true,
    codigo: cuerpo.error?.codigo ?? null,
    mensaje: cuerpo.error?.mensaje ?? null,
    datos: cuerpo.datos ?? null,
  };
}

/** Cierra el ticket que sale tras el cobro, cuando ya terminó de abrir. */
export async function cerrarElTicket(rosa: Page): Promise<void> {
  const ticket = rosa.getByRole('dialog').filter({ hasText: 'TICKET DE PAGO' });
  await yaAbierto(ticket);
  await ticket.getByRole('button', { name: 'Cerrar' }).click();
  await expect(ticket).toBeHidden();
}

// ═══════════════════════════════════════════════════════════════════════════
// EL COMENSAL
// ═══════════════════════════════════════════════════════════════════════════

/** Otro aparato sin sesión —el teléfono del comensal— y cómo cerrarlo. */
export interface TelefonoDelComensal {
  readonly page: Page;
  readonly cerrar: () => Promise<void>;
}

/**
 * EL COMENSAL ESCANEA EL QR DE SU MESA con su teléfono: otro aparato, sin sesión, sin PIN y sin
 * terminal —lo único que tiene es el código de la mesa—.
 *
 * ── A qué dirección va, y por qué hay tres caminos ────────────────────────────
 * El QR lleva la dirección del propio despliegue, y de ella sale el negocio:
 *
 *   1 · UN negocio por despliegue —el de CI, uno por modelo—: el QR se abre en el origen de
 *       siempre y no hace falta nada.
 *   2 · VARIOS —las cinco demos de la base desechable—: el portal no sabe de cuál es el código
 *       si el host no lo dice y contesta 422. El QR se abre entonces en `<slug>.<host>`
 *       (`resolverDespliegue`). Las ESCRITURAS del portal sólo las acepta un origen que esté en
 *       `APP_URL` o en `APP_URL_ALTERNAS` (R-17), sin comodines: si el servidor tiene dado de
 *       alta ese origen, es todo.
 *   3 · VARIOS y SIN `APP_URL_ALTERNAS` —las cinco demos tal como las levanta
 *       `base-desechable.mjs entorno`—: `<slug>.localhost` recibe un 403 en cada escritura. El
 *       teléfono entonces abre el QR en el origen del despliegue, que `APP_URL` sí nombra, y lo
 *       único que cambia es el `Host` de sus peticiones al portal, que dice de qué negocio es la
 *       mesa: es lo que haría el DNS de `<slug>.dominio`. Se reenvían desde la prueba con el
 *       `Host` cambiado (`route.fetch`); el origen, la sesión (ninguna) y todo lo demás son los
 *       de un teléfono de verdad.
 *
 * La puerta de las escrituras se prueba AQUÍ, sin escribir nada, y si no abre se dice qué falta
 * en vez de dejar al comensal con «Petición de escritura rechazada» sin explicación.
 */
export async function abrirElQrDeLaMesa(
  browser: Browser,
  info: TestInfo,
  slug: string,
  token: string,
): Promise<TelefonoDelComensal> {
  const uso = info.project.use;
  if (uso.baseURL === undefined) {
    throw new Error('El proyecto no trae `baseURL`: el comensal no sabe a qué dirección entrar.');
  }
  const base = new URL(uso.baseURL);
  const contextoEn = (baseURL: string) =>
    browser.newContext({
      ...devices['Pixel 7'],
      baseURL,
      ...(uso.extraHTTPHeaders === undefined ? {} : { extraHTTPHeaders: uso.extraHTTPHeaders }),
      locale: uso.locale ?? 'es-MX',
      ...(uso.timezoneId === undefined ? {} : { timezoneId: uso.timezoneId }),
    });
  /** La puerta de las escrituras: una petición vacía sólo puede acabar en 400 (le falta todo) si el origen se acepta, o en 403 si no. */
  const puertaDeEscritura = (page: Page): Promise<number> =>
    page.evaluate(async (ruta) => {
      const respuesta = await fetch(ruta, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-morphiqpos-request': '1' },
        body: '{}',
      });
      return respuesta.status;
    }, `/api/publico/qr/${token}/solicitud`);

  // 1 · ¿El despliegue sabe de qué negocio es el código sin que el host lo diga?
  let origen = uso.baseURL;
  let contexto = await contextoEn(origen);
  const lectura = await contexto.request.get(`/api/publico/qr/${token}`);
  const hostDelNegocio = lectura.status() === 422 ? `${slug}.${base.host}` : null;

  if (hostDelNegocio !== null) {
    // 2 · Varios negocios: el QR se abre en el host del suyo.
    await contexto.close();
    origen = `${base.protocol}//${hostDelNegocio}`;
    contexto = await contextoEn(origen);
  }
  let page = await contexto.newPage();
  await page.goto(`/qr/${token}`);
  let estado = await puertaDeEscritura(page);

  if (estado === 403 && hostDelNegocio !== null) {
    // 3 · Ese origen no está en `APP_URL_ALTERNAS`: el teléfono vuelve al origen del despliegue y
    // sólo el `Host` de sus peticiones al portal dice el negocio.
    await contexto.close();
    contexto = await contextoEn(uso.baseURL);
    await contexto.route('**/api/publico/qr/**', async (ruta) => {
      const respuesta = await ruta.fetch({
        headers: { ...(await ruta.request().allHeaders()), host: hostDelNegocio },
      });
      await ruta.fulfill({ response: respuesta });
    });
    page = await contexto.newPage();
    await page.goto(`/qr/${token}`);
    estado = await puertaDeEscritura(page);
  }
  if (estado === 403) {
    await contexto.close();
    throw new Error(
      [
        `El portal rechaza las escrituras del comensal desde ${origen} (403).`,
        'La frontera de escritura (R-17) acepta sólo el `Origin` de `APP_URL` y de',
        '`APP_URL_ALTERNAS`, sin comodines. Con UN negocio por despliegue —como CI— el QR se abre',
        `en el origen de siempre y no hace falta nada; con varios, hay que añadir ${origen} a`,
        '`APP_URL_ALTERNAS` del servidor.',
      ].join(' '),
    );
  }
  return {
    page,
    cerrar: async () => {
      await contexto.close();
    },
  };
}

/** Un aviso del comensal al personal, como lo sirve el puente. */
export interface AvisoDelComensal {
  readonly id: string;
  readonly tipo: string;
  readonly estado: string;
  readonly ordenId: string | null;
  readonly ruteo: string | null;
  /** El mesero al que se le avisó, cuando la mesa tiene uno asignado. */
  readonly destino: string | null;
  /** La propina que escribió o eligió el comensal al pedir la cuenta, en centavos. */
  readonly propinaCentavos: number | null;
  readonly subtotalCentavos: number | null;
}

/** Los avisos de la mesa `numero`, del más reciente al más viejo. */
export async function avisosDeLaMesa(
  lector: Page,
  numero: number,
): Promise<readonly AvisoDelComensal[]> {
  const { mesaId } = await mesaEnElServidor(lector, numero);
  const filas = await consultarPuente<{
    id?: string;
    tipo?: string;
    estado?: string;
    venta_id?: string | null;
    ruteo_modo?: string | null;
    mesero_destino_nombre?: string | null;
    propina_monto_sugerida?: number | null;
    subtotal_consumo?: number | null;
  }>(lector, 'SolicitudQR', { filtro: { mesa_id: mesaId }, limite: 50 });
  return filas.map((f) => ({
    id: f.id ?? '',
    tipo: f.tipo ?? '',
    estado: f.estado ?? '',
    ordenId: f.venta_id ?? null,
    ruteo: f.ruteo_modo ?? null,
    destino: f.mesero_destino_nombre ?? null,
    propinaCentavos:
      f.propina_monto_sugerida === undefined || f.propina_monto_sugerida === null
        ? null
        : enCentavos(f.propina_monto_sugerida),
    subtotalCentavos:
      f.subtotal_consumo === undefined || f.subtotal_consumo === null
        ? null
        : enCentavos(f.subtotal_consumo),
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// LA DUEÑA DEJA LISTO EL PORTAL
// ═══════════════════════════════════════════════════════════════════════════

/** La configuración del negocio como la tiene el servidor (una sola fila). */
export async function configuracionDelNegocio(
  lector: Page,
): Promise<Readonly<Record<string, unknown>>> {
  return (
    (
      await consultarPuente<Readonly<Record<string, unknown>>>(lector, 'ConfiguracionNegocio', {
        limite: 1,
      })
    )[0] ?? {}
  );
}

/**
 * EL PORTAL DEL COMENSAL, PREPARADO POR LA DUEÑA desde SUS pantallas.
 *
 * Nace apagado y sin QR. Para que un comensal pueda escanear su mesa, la dueña enciende la
 * asignación de mesas, pone un mesero a la mesa, enciende el portal con «Cliente solicita» y
 * genera los códigos. Son pantallas heredadas —el mapa de mesas es de mosaicos que se arrastran,
 * sin rol ni nombre accesible—, así que algunos localizadores van por el texto de su fila; lo que
 * se comprueba SIEMPRE es lo que quedó guardado en el servidor, no el aviso de «guardado».
 *
 * Devuelve el código QR de la mesa, que la dirección lee por el puente (`Mesa.qr_token`).
 */
export async function prepararElPortalDelComensal(
  duena: Page,
  que: {
    readonly mesa: number;
    readonly zona: string;
    readonly mesero: string;
    /** Además de pedir atención y la cuenta, que el comensal pueda mandar pedidos a cocina. */
    readonly pedidosDelComensal?: boolean;
  },
): Promise<string> {
  // 1 · Configuración → Operación: «Activar asignación de mesas a meseros».
  await duena.goto('/configuracion');
  await duena.getByRole('tab', { name: 'Operación' }).click();
  const asignacion = duena
    .getByText('Activar asignación de mesas a meseros')
    .locator('xpath=ancestor::div[contains(@class,"flex items-start")][1]')
    .getByRole('switch');
  await expect(asignacion).toBeVisible();
  if ((await asignacion.getAttribute('aria-checked')) !== 'true') await asignacion.click();
  await expect(asignacion).toHaveAttribute('aria-checked', 'true');
  if (que.pedidosDelComensal === true) {
    // «Permitir que el comensal envíe pedidos desde el QR»: sólo se puede encender con la
    // asignación de mesas ya encendida.
    const pedidos = duena
      .getByText('Permitir que el comensal envíe pedidos desde el QR')
      .locator('xpath=ancestor::div[contains(@class,"flex items-start")][1]')
      .getByRole('switch');
    await expect(pedidos).toBeEnabled();
    if ((await pedidos.getAttribute('aria-checked')) !== 'true') await pedidos.click();
    await expect(pedidos).toHaveAttribute('aria-checked', 'true');
  }
  await duena.getByRole('button', { name: 'Guardar configuración' }).first().click();
  await expect
    .poll(async () => (await configuracionDelNegocio(duena))['asignacion_mesas_activa'], {
      message: 'La asignación de mesas no quedó guardada en el servidor.',
    })
    .toBe(true);
  if (que.pedidosDelComensal === true) {
    await expect
      .poll(
        async () => (await configuracionDelNegocio(duena))['portal_qr_permitir_pedidos_cliente'],
        { message: 'El permiso de pedidos del comensal no quedó guardado en el servidor.' },
      )
      .toBe(true);
  }

  // 2 · Configuración → Mesas: el mesero de la mesa. Los mosaicos no tienen rol: se tocan por su
  // número, dentro del mapa.
  await duena.getByRole('tab', { name: 'Mesas' }).click();
  await duena.getByRole('button', { name: new RegExp(`^${escapar(que.zona)}`) }).click();
  await duena
    .locator('div.select-none')
    .getByText(String(que.mesa), { exact: true })
    .first()
    .click();
  const dialogo = duena.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('combobox').filter({ hasText: 'Sin asignar' }).click();
  await duena.getByRole('option', { name: que.mesero, exact: true }).click();
  await dialogo.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(dialogo).toBeHidden();
  await expect
    .poll(async () => (await mesaEnElServidor(duena, que.mesa)).mesero, {
      message: `La mesa ${String(que.mesa)} no quedó con su mesero asignado en el servidor.`,
    })
    .toBe(que.mesero);

  // 3 · Portal QR → Configuración: encenderlo y dejar que sea el comensal quien pide la cuenta.
  await duena.goto('/portal-qr');
  await duena.getByRole('tab', { name: 'Configuración' }).click();
  const fila = (rotulo: string) =>
    duena
      .getByText(rotulo, { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"justify-between")][1]');
  const portal = fila('Activar Portal QR').getByRole('switch');
  await expect(portal).toBeVisible();
  if ((await portal.getAttribute('aria-checked')) !== 'true') await portal.click();
  await expect(portal).toHaveAttribute('aria-checked', 'true');
  await fila('¿Quién dispara la pantalla de propina del QR?').getByRole('combobox').click();
  await duena.getByRole('option', { name: 'Cliente solicita' }).click();
  await duena.getByRole('button', { name: 'Guardar configuración' }).click();
  await expect
    .poll(
      async () => {
        const guardada = await configuracionDelNegocio(duena);
        return [guardada['portal_qr_activo'], guardada['portal_qr_cuenta_modo']];
      },
      { message: 'El portal QR no quedó encendido con «Cliente solicita» en el servidor.' },
    )
    .toEqual([true, 'cliente_solicita']);

  // 4 · Portal QR → Mesas QR: los códigos que se imprimen. El botón pregunta con el diálogo del
  // navegador.
  await duena.getByRole('tab', { name: 'Mesas QR' }).click();
  duena.once('dialog', (aviso) => {
    void aviso.accept();
  });
  await duena.getByRole('button', { name: 'Generar tokens faltantes' }).click();
  let token: string | null = null;
  await expect
    .poll(
      async () => {
        token = (await mesaEnElServidor(duena, que.mesa)).qrToken;
        return token;
      },
      { message: `La mesa ${String(que.mesa)} no tiene su código QR.` },
    )
    .not.toBeNull();
  return token ?? '';
}
