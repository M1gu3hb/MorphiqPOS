#!/usr/bin/env node
/**
 * MEDIR LA FLUIDEZ (PAR-1, de DP-11.0 de POS Don Poncho): cuadros por segundo con la CPU más
 * lenta (4× por omisión), en tableta y teléfono, al desplazarse y al abrir una mesa, en Mesero,
 * Caja y Tablero. Es una línea base: se corre antes y después de un cambio de diseño, contra la
 * misma base de demo.
 *
 *   node scripts/medir-fluidez.mjs --url http://localhost:3300 \
 *        [--salida fluidez.json] [--cpu 4] [--aparatos tablet,telefono]
 *
 * Contra la demo del restaurante que levanta `scripts/demo-local.mjs` (o la de las pruebas):
 * entra con los PIN públicos de las demos (`equipo-demo.ts`), nunca con los de producción. Se
 * niega con un servidor que no sea de esta máquina.
 *
 * ── Cómo mide ────────────────────────────────────────────────────────────────
 * · La CPU se frena con `Emulation.setCPUThrottlingRate` de Chrome, como el panel de
 *   Rendimiento. La pantalla se emula con los mismos aparatos que las suites de navegador.
 * · Un cuadro es el tiempo entre dos `requestAnimationFrame` del hilo principal: si el hilo se
 *   atora, el cuadro se alarga. De ahí salen los cuadros por segundo, el percentil 95 y los
 *   «tirones» (cuadros de más de 50 ms, la cota de una tarea larga).
 * · Desplazarse: la rueda sobre el contenedor que de verdad se desplaza, 24 pasos abajo y 24
 *   arriba. Abrir una mesa: del toque a que el diálogo de la mesa se ve.
 * · Antes de medir deja la mesa 1 abierta con tres platillos enviados a cocina (como la
 *   mesera), para que la Caja tenga una cuenta y el mapa una mesa ocupada. Sólo en la demo.
 */
/* global window, document, requestAnimationFrame, HTMLElement, getComputedStyle, innerWidth, innerHeight -- lo que corre dentro de la página (page.evaluate) */
import { writeFileSync } from 'node:fs';

import { chromium, devices } from '@playwright/test';

import { DUENO_DE_DEMO, equipoDeDemo } from '../packages/contracts/src/negocios/equipo-demo.ts';

const argumento = (nombre, porOmision) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porOmision : (process.argv[i + 1] ?? porOmision);
};
const URL_BASE = argumento('url', 'http://localhost:3400').replace(/\/$/, '');
const SALIDA = argumento('salida', '');
const CPU = Number(argumento('cpu', '4'));
const APARATOS = argumento('aparatos', 'tablet,telefono').split(',');

if (!['localhost', '127.0.0.1'].includes(new URL(URL_BASE).hostname)) {
  console.error('Uso: medir-fluidez.mjs --url http://localhost:<puerto>');
  process.exit(2);
}
const EQUIPO = equipoDeDemo('restaurante');
const DUENO = DUENO_DE_DEMO.nombre;
const MESERO = EQUIPO.find((e) => e.rol === 'mesero')?.nombre ?? 'Lupita';
const CAJERO = EQUIPO.find((e) => e.rol === 'cajero')?.nombre ?? 'Rosa';
const PIN = {
  [DUENO]: DUENO_DE_DEMO.pin,
  ...Object.fromEntries(EQUIPO.map((e) => [e.nombre, e.pin])),
};
const EMULACION = { tablet: devices['Galaxy Tab S4 landscape'], telefono: devices['Pixel 7'] };

async function entrar(page, nombre) {
  // Con una sesión abierta, la pantalla de acceso salta al inicio del rol: se sale antes.
  await page.context().clearCookies();
  await page.goto(`${URL_BASE}/login-pos`);
  await page
    .getByRole('button')
    .filter({ has: page.getByText(nombre, { exact: true }) })
    .click();
  for (const digito of PIN[nombre]) {
    await page.getByRole('button', { name: digito, exact: true }).click();
  }
  await page.waitForURL((url) => !url.pathname.endsWith('/login-pos'));
}

const laMesa = (page, n) =>
  page
    .locator('span.font-heading')
    .filter({ hasText: new RegExp(`^${String(n)}$`) })
    .first();
const dialogoDeLaMesa = (page, n) =>
  page.getByRole('dialog', { name: new RegExp(`^Mesa ${String(n)} `) });

/** La mesa 1 ocupada con tres platillos en cocina, si aún no lo está. */
async function prepararLaMesa(page) {
  await page.goto(`${URL_BASE}/mesero`);
  await laMesa(page, 1).waitFor();
  await laMesa(page, 1).click();
  const apertura = page.getByRole('dialog', { name: 'Abrir mesa 1' });
  const yaOcupada = dialogoDeLaMesa(page, 1);
  await apertura.or(yaOcupada).first().waitFor();
  if (!(await apertura.isVisible())) {
    await page.keyboard.press('Escape');
    return 'la mesa 1 ya estaba ocupada';
  }
  await apertura.getByRole('spinbutton').first().fill('4');
  await apertura.getByRole('button', { name: 'Abrir mesa' }).click();
  await yaOcupada.waitFor();
  const teselas = yaOcupada.getByRole('button', { name: / \$\d/ });
  for (let i = 0; i < 3; i += 1) await teselas.nth(i).click();
  const enviar = yaOcupada.getByRole('button', { name: 'Enviar a Cocina', exact: true });
  await enviar.click();
  await page.getByText('¡Pedido enviado a cocina!').first().waitFor({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  return 'mesa 1 abierta con 3 platillos en cocina';
}

/** Mide los cuadros del hilo principal mientras corre `accion`. */
async function cuadrosDurante(page, accion) {
  await page.evaluate(() => {
    const w = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (window));
    w.__cuadros = [];
    w.__midiendo = true;
    let previo = performance.now();
    const paso = (t) => {
      /** @type {number[]} */ (w.__cuadros).push(t - previo);
      previo = t;
      if (w.__midiendo) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });
  const inicio = Date.now();
  const extra = await accion();
  const ms = Date.now() - inicio;
  const cuadros = await page.evaluate(() => {
    const w = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (window));
    w.__midiendo = false;
    return /** @type {number[]} */ (w.__cuadros).slice(1);
  });
  return { ms, ...resumen(cuadros), ...extra };
}

function resumen(cuadros) {
  if (cuadros.length === 0) return { fps: null, p95: null, tirones: 0, peor: null };
  const total = cuadros.reduce((a, b) => a + b, 0);
  const orden = [...cuadros].sort((a, b) => a - b);
  return {
    fps: Math.round((cuadros.length / total) * 1000 * 10) / 10,
    p95: Math.round(orden[Math.floor(orden.length * 0.95)] ?? 0),
    tirones: cuadros.filter((c) => c > 50).length,
    peor: Math.round(orden[orden.length - 1] ?? 0),
  };
}

/** Rueda sobre el contenedor que de verdad se desplaza; si nada se desplaza, lo dice. */
async function desplazarse(page) {
  const caja = await page.evaluate(() => {
    const candidatos = [document.scrollingElement, ...document.querySelectorAll('*')].filter(
      (el) => {
        if (!(el instanceof HTMLElement)) return false;
        const estilo = getComputedStyle(el);
        const desplazable =
          el === document.scrollingElement || /(auto|scroll)/.test(estilo.overflowY);
        return desplazable && el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 150;
      },
    );
    const mayor = candidatos.sort((a, b) => b.clientHeight - a.clientHeight)[0];
    if (!(mayor instanceof HTMLElement)) return null;
    const r = mayor === document.scrollingElement ? null : mayor.getBoundingClientRect();
    return {
      x: r ? r.left + r.width / 2 : innerWidth / 2,
      y: r ? r.top + r.height / 2 : innerHeight / 2,
      recorrido: mayor.scrollHeight - mayor.clientHeight,
    };
  });
  if (caja === null) return null;
  await page.mouse.move(caja.x, caja.y);
  return cuadrosDurante(page, async () => {
    for (const sentido of [1, -1]) {
      for (let i = 0; i < 24; i += 1) {
        await page.mouse.wheel(0, 140 * sentido);
        await page.waitForTimeout(40);
      }
    }
    return { recorrido: caja.recorrido };
  });
}

async function medirPantalla(page, cdp, { quien, ruta, listo }) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await entrar(page, quien);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const inicio = Date.now();
  await page.goto(`${URL_BASE}${ruta}`);
  await listo(page).waitFor({ timeout: 60_000 });
  const carga = Date.now() - inicio;
  await page.waitForLoadState('networkidle').catch(() => undefined);
  return { carga, desplazamiento: await desplazarse(page) };
}

async function abrirMesa(page, numero, dialogo) {
  return cuadrosDurante(page, async () => {
    await laMesa(page, numero).click();
    await dialogo.waitFor();
    return {};
  });
}

const resultados = { cpu: CPU, url: URL_BASE, fecha: new Date().toISOString(), aparatos: {} };
const navegador = await chromium.launch();
try {
  for (const aparato of APARATOS) {
    const contexto = await navegador.newContext({ ...EMULACION[aparato] });
    const page = await contexto.newPage();
    const cdp = await contexto.newCDPSession(page);
    const fila = {};
    await entrar(page, MESERO);
    fila.preparacion = await prepararLaMesa(page);

    fila.mesero = await medirPantalla(page, cdp, {
      quien: MESERO,
      ruta: '/mesero',
      listo: (p) => laMesa(p, 1),
    });
    fila.mesero.abrirMesaLibre = await abrirMesa(
      page,
      3,
      page.getByRole('dialog', { name: 'Abrir mesa 3' }),
    );
    await page.keyboard.press('Escape');
    fila.mesero.abrirMesaOcupada = await abrirMesa(page, 1, dialogoDeLaMesa(page, 1));
    await page.keyboard.press('Escape');

    fila.caja = await medirPantalla(page, cdp, {
      quien: CAJERO,
      ruta: '/caja',
      listo: (p) => p.getByRole('heading', { level: 1 }).first(),
    });
    fila.tablero = await medirPantalla(page, cdp, {
      quien: DUENO,
      ruta: '/',
      listo: (p) => p.getByRole('heading', { level: 1 }).first(),
    });
    resultados.aparatos[aparato] = fila;
    await contexto.close();
  }
} finally {
  await navegador.close();
}

const texto = (m) =>
  m === null || m === undefined
    ? 'no se desplaza (cabe en la pantalla)'
    : `${String(m.fps)} fps · p95 ${String(m.p95)} ms · ${String(m.tirones)} tirones`;
for (const [aparato, f] of Object.entries(resultados.aparatos)) {
  console.log(`\n${aparato} (CPU ${String(CPU)}× más lenta) · ${f.preparacion}`);
  for (const pantalla of ['mesero', 'caja', 'tablero']) {
    const p = f[pantalla];
    console.log(
      `  ${pantalla.padEnd(8)} carga ${String(p.carga)} ms · desplazar ${texto(p.desplazamiento)}`,
    );
  }
  console.log(
    `  abrir mesa libre    ${String(f.mesero.abrirMesaLibre.ms)} ms · ${texto(f.mesero.abrirMesaLibre)}`,
  );
  console.log(
    `  abrir mesa ocupada  ${String(f.mesero.abrirMesaOcupada.ms)} ms · ${texto(f.mesero.abrirMesaOcupada)}`,
  );
}
if (SALIDA !== '') writeFileSync(SALIDA, `${JSON.stringify(resultados, null, 2)}\n`);
