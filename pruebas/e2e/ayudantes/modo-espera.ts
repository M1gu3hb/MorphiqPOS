import { expect, type Page } from '@playwright/test';

import { CARTA } from './mesas-heredadas.ts';
import { cabecerasDeEscrituraDePrueba, consultarPuente } from './sesion.ts';

/**
 * Lo que comparten las pruebas del modo espera (DP-11.2): `modo-espera.spec.ts` (dormir y
 * despertar) y `modo-espera-pin.spec.ts` (el PIN al despertar y su candado).
 */
export const SLUG = 'demo-acople-restaurante';
export const MESA = 7;
export const espera = (page: Page) => page.getByRole('dialog', { name: /Modo espera/ });
export const pinDe = (page: Page) => page.getByRole('dialog', { name: /Escribe tu PIN/ });

/**
 * Lo que decidió la última revisión del modo espera (`data-espera-decision` del documento). Se
 * escribe en el momento de la revisión, así que un «no se durmió» es determinista: no depende de
 * cuándo pinta React.
 */
export async function decidio(page: Page, decision: string): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-espera-decision', decision);
}

/** ¿Quedó el foco en algo de la pantalla de abajo? (El cuerpo es «el navegador»: no cuenta.) */
export function focoFueraDeLaCapa(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const activo = document.activeElement;
    return activo !== null && activo !== document.body && activo.closest('dialog') === null;
  });
}

export async function escribir(pagina: Page, ruta: string, datos: Record<string, unknown>) {
  const respuesta = await pagina.request.post(ruta, {
    headers: cabecerasDeEscrituraDePrueba(),
    data: datos,
  });
  const texto = await respuesta.text();
  expect(respuesta.status(), `${ruta}: ${texto.slice(0, 300)}`).toBe(200);
  return JSON.parse(texto) as { readonly datos?: Record<string, unknown> };
}

export async function experiencia(duena: Page, valores: Record<string, boolean>): Promise<void> {
  await escribir(duena, '/api/datos/escribir', {
    entidad: 'ConfiguracionNegocio',
    operacion: 'update',
    datos: { experiencia: { mascota: true, ...valores } },
  });
}

/** La cuenta abierta de la mesa de la prueba, si la hay. */
export async function cuentaDeLaMesa(
  duena: Page,
): Promise<{ mesaId: string; ordenId: string | null }> {
  const [mesa] = await consultarPuente<{ id: string; venta_activa_id?: string | null }>(
    duena,
    'Mesa',
    { filtro: { numero: MESA }, limite: 1 },
  );
  expect(mesa, `El negocio de prueba no tiene la mesa ${String(MESA)}.`).toBeDefined();
  return { mesaId: mesa?.id ?? '', ordenId: mesa?.venta_activa_id ?? null };
}

/**
 * Cancela la cuenta de la mesa de la prueba, si quedó una: su comanda sigue pendiente y, con
 * pendientes, la cocina no se duerme (que es justo la regla). Así la siguiente vuelta, en otro
 * aparato, empieza con la cocina vacía.
 */
export async function cancelarLaCuentaDeLaMesa(duena: Page): Promise<void> {
  const { ordenId } = await cuentaDeLaMesa(duena);
  if (ordenId === null) return;
  await escribir(duena, '/api/restaurante/cancelar-orden', {
    ordenId,
    motivo: 'prueba del modo espera',
  });
}

/**
 * Una comanda nueva en la cocina: abre la mesa y le manda un platillo, por la API de siempre.
 * Devuelve la cuenta, para pedirla o cancelarla.
 */
export async function comandaNueva(duena: Page): Promise<string> {
  const { mesaId } = await cuentaDeLaMesa(duena);
  const apertura = await escribir(duena, '/api/restaurante/abrir-mesa', {
    mesaId,
    personas: 2,
  });
  const productos = await consultarPuente<{ id: string; nombre: string }>(
    duena,
    'ProductoTerminado',
    { limite: 80 },
  );
  const platillo = productos.find((p) => p.nombre === CARTA.guacamole.nombre);
  const ordenId = String(apertura.datos?.['ordenId']);
  await escribir(duena, '/api/restaurante/enviar-pedido', {
    ordenId,
    lineas: [{ productoId: platillo?.id, cantidad: '1' }],
  });
  return ordenId;
}

/**
 * Abre la pantalla con el reloj de Playwright y espera a que esté pintada. Adelantar el reloj
 * antes de que el modo espera se monte no prueba nada: empezaría a contar DESPUÉS del salto, y
 * un «no se durmió» pasaría por eso y no por la regla.
 */
export async function abrirConReloj(pagina: Page, ruta: string): Promise<void> {
  await pagina.clock.install();
  await pagina.goto(ruta);
  await expect(pagina.getByRole('heading', { level: 1 }).first()).toBeVisible();
}

/**
 * Deja la demo como recién sembrada: sin comandas pendientes de otras suites. En CI corren antes
 * en el mismo trabajo y dejan la cocina con pendientes, y con pendientes la cocina no se duerme
 * (que es justo la regla). Lo mismo que hacen las demás suites del restaurante al empezar.
 */
export async function resetearLaDemo(duena: Page): Promise<void> {
  const reseteo = await duena.request.post('/api/catalogo/demostracion/resetear', {
    headers: cabecerasDeEscrituraDePrueba(),
    data: { confirmacion: 'RESETEAR' },
  });
  expect(reseteo.status(), `resetear la demo: ${await reseteo.text()}`).toBe(200);
}
