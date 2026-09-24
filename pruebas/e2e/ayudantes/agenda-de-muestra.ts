import { expect, type Page } from '@playwright/test';

import { cabecerasDeEscrituraDePrueba, consultarPuente } from './sesion';

/**
 * UNA AGENDA CON CITAS, para retratarla.
 *
 * La demo del salón se siembra sin citas —las borra, a propósito, para que cada prueba
 * empiece de cero—, y la galería retrataba la agenda del día VACÍA: la pantalla que es el
 * salón, sin una sola cita. Esto agenda tres por las mismas rutas que usa la recepción
 * (`/api/clientes`, `/api/agenda/huecos`, `/api/agenda/cita`) en el PRÓXIMO MIÉRCOLES del
 * negocio, y deja la pantalla en ese día con su propio botón «Día siguiente».
 *
 * El miércoles y no hoy: hoy puede ser lunes —el salón de la demo no abre— y la línea de
 * «ahora» sólo sale en el día de hoy. Un miércoles, recién sembrado, tiene siempre los
 * mismos huecos, así que las tres citas caen siempre en el mismo sitio.
 */

const ZONA = 'America/Mexico_City';
const MS_DIA = 86_400_000;
const MIERCOLES = 3;

const fechaDelNegocio = (ms: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(ms));

interface Hueco {
  readonly profesionalId?: string;
  readonly inicio?: string;
  readonly minutos?: number;
}

interface ServicioDelPuente {
  readonly id?: string;
  readonly nombre?: string | null;
  readonly precio_venta?: number | null;
}

async function exigirOk(
  respuesta: Awaited<ReturnType<Page['request']['post']>>,
  que: string,
): Promise<unknown> {
  expect(respuesta.status(), `${que}: ${(await respuesta.text()).slice(0, 300)}`).toBe(200);
  return ((await respuesta.json()) as { datos?: unknown }).datos;
}

export async function agendarUnMiercolesDeMuestra(page: Page): Promise<void> {
  const ahora = await page.evaluate(() => Date.now());
  const hoy = fechaDelNegocio(ahora);
  const diaDeLaSemana = new Date(`${hoy}T12:00:00Z`).getUTCDay();
  const diasDesdeHoy = (MIERCOLES - diaDeLaSemana + 7) % 7 || 7;
  const dia = fechaDelNegocio(ahora + diasDesdeHoy * MS_DIA);
  const diaSiguiente = fechaDelNegocio(ahora + (diasDesdeHoy + 1) * MS_DIA);

  const clienta = (await exigirOk(
    await page.request.post('/api/clientes', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: { nombre: 'Clienta de la galería', telefono: '5550002222' },
    }),
    'No se pudo dar de alta a la clienta de la galería',
  )) as { clienteId?: string };

  // Un SERVICIO, no el primer producto con precio: el champú de mostrador también tiene
  // precio y una cita con él la rechaza el servidor.
  const servicios = await consultarPuente<ServicioDelPuente>(page, 'ProductoTerminado', {
    filtro: { tipo_venta: 'servicio' },
    limite: 40,
  });
  const servicio = servicios.find((s) => (s.nombre ?? '') !== '' && (s.precio_venta ?? 0) > 0);
  expect(servicio?.id, 'La demo del salón no tiene un servicio con precio.').toBeTruthy();

  const { huecos = [] } = (await exigirOk(
    await page.request.post('/api/agenda/huecos', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: { desde: dia, hasta: diaSiguiente, minutos: 30 },
    }),
    `/api/agenda/huecos del ${dia}`,
  )) as { huecos?: readonly Hueco[] };

  // Los más grandes primero: el servicio dura lo que dura y en media hora no cabe.
  const candidatos = [...huecos]
    .filter((h) => (h.inicio ?? '') !== '' && (h.profesionalId ?? '') !== '')
    .sort(
      (a, b) =>
        (b.minutos ?? 0) - (a.minutos ?? 0) || (a.inicio ?? '').localeCompare(b.inicio ?? ''),
    );
  let agendadas = 0;
  const rechazos: string[] = [];
  for (const hueco of candidatos) {
    if (agendadas === 3) break;
    const intento = await page.request.post('/api/agenda/cita', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: {
        clienteId: clienta.clienteId,
        origen: 'mostrador',
        inicio: hueco.inicio,
        servicios: [{ servicioId: servicio?.id, profesionalId: hueco.profesionalId }],
      },
    });
    if (intento.status() === 200) agendadas += 1;
    else rechazos.push(`${hueco.inicio ?? ''}: ${String(intento.status())} ${(await intento.text()).slice(0, 160)}`);
  }
  expect(
    agendadas,
    `No se pudo agendar ninguna cita el ${dia} para retratar la agenda (${String(candidatos.length)} ` +
      `huecos):
${rechazos.slice(0, 4).join('
')}`,
  ).toBeGreaterThan(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  const siguiente = page.getByRole('button', { name: 'Día siguiente' });
  for (let paso = 0; paso < diasDesdeHoy; paso += 1) {
    await siguiente.click();
  }
  await page.waitForLoadState('networkidle').catch(() => undefined);
}
