import { appendFileSync, readFileSync } from 'node:fs';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { CLAVES_ESTILO, ESTILOS } from '../../packages/ui/src/tokens/estilos.ts';

import {
  leerLasSenales,
  medirEtiqueta,
  seSaleDeLaTesela,
  type Medida,
} from './ayudantes/contraste-de-etiquetas.ts';
import {
  CICLO_DE_LA_MESA,
  devolverLasMesas,
  ponerLasMesas,
  type EstadoDeMesa,
  type MesaPuesta,
} from './ayudantes/mesas-en-estados.ts';
import { Equipo } from './ayudantes/roles.ts';
import {
  cabecerasDeEscrituraDePrueba,
  consultarPuente,
  exigirDemostracion,
} from './ayudantes/sesion.ts';

/**
 * LOS ESTADOS DE LA MESA SE DISTINGUEN POR TEXTO Y POR ALGO MÁS QUE EL COLOR, Y SE LEEN.
 *
 * Una mesa pasa por ocho estados que el servidor escribe —libre, esperando orden, pedido enviado,
 * en preparación, esperando entrega, ocupada, cuenta solicitada y limpieza— y la mesera los lee
 * de lejos, de pie y con prisa. El color solo no los distingue (una de cada doce personas no
 * separa rojo de verde) ni basta con que haya una etiqueta: la etiqueta tiene que LEERSE.
 *
 * Esta prueba lleva el servicio a cada estado —por los mismos comandos que usan las pantallas— y,
 * en cada uno de los ocho estilos y en cada modo (claro y oscuro), afirma para cada etiqueta de
 * estado:
 *
 *   1 · TEXTO: la etiqueta está, dice lo que dice el código (`MESA_STATUS_CONFIG`), se ve, no la
 *       tapa ni la recorta nada y cabe en su tesela.
 *   2 · SEÑAL SIN COLOR: dos estados distintos no comparten texto: quitando el color, siguen
 *       distinguiéndose por lo que dicen. La PALABRA es la señal que no es color; el código lo
 *       declara así (`MapaDeMesas.tsx:424`, «el color NUNCA es el único portador de
 *       significado»). Además se registra qué otra cosa tiene cada tesela —borde discontinuo,
 *       icono, patrón—, y hoy sólo `limpieza` en el mapa de la dueña tiene una (borde `dashed`):
 *       el resto se distingue por la palabra y por nada más. Si se quiere una segunda señal
 *       además de la palabra, eso es una decisión de diseño, no un defecto que esta prueba
 *       pueda dar por hecho.
 *   3 · CONTRASTE: la razón de WCAG 1.4.3 —4.5:1; 3:1 si el texto es grande o negrita de 14 pt—
 *       contra el fondo REAL bajo el texto. Las mesas se pintan sobre un degradado, y el
 *       rastreador no acusa donde hay imagen de fondo: aquí se retrata el renglón con el texto
 *       invisible y se mide contra el PEOR píxel (`contraste-de-etiquetas.ts`).
 *
 * ── Cómo se sabe que la medida es buena ──────────────────────────────────────────────────────
 * Antes de las mesas corre «la ayuda de medida, vista acertar y fallar»: páginas inventadas, sin
 * servidor, con razones que se conocen de antemano (2.36:1, 21:1, el peor píxel de un degradado,
 * la pastilla translúcida del teléfono, una etiqueta tapada, el umbral de texto grande y una página
 * más ancha que la pantalla). Esa última encontró un defecto de la propia ayuda: recortaba la
 * captura en las coordenadas de la capa del CSS y no en las del visor, y en el teléfono, con
 * `taller` y `bloque` (la página 27 y 33 px más ancha que la pantalla), medía otro rincón.
 *
 * ── Dónde se mide ────────────────────────────────────────────────────────────────────────────
 *   · `/mesero`, la pantalla de la mesera: el mapa de mesas en escritorio y tableta
 *     (`MesaShape`) y la rejilla del teléfono (`MesaGridMobile`), su leyenda de colores y la
 *     cabecera de la mesa abierta.
 *   · `/restaurante/mapa-de-mesas`, el mapa de la dueña (tokens del sistema de diseño): sus
 *     teselas y su leyenda con conteos.
 *   · `/configuracion?tab=mesas`, la distribución de mesas de la dueña (escritorio y tableta: en
 *     el teléfono es una lista que no dice el estado).
 *
 * `pagada` y `cancelada` están en `MESA_STATUS_CONFIG` y ningún comando las deja en `mesas.estado`
 * (el puente declara `estado` como no escribible, `packages/app/src/puente/mapa.ts:3001`, y ningún
 * `updateTable('mesas')` las escribe), así que ninguna pantalla puede enseñarlas: no se fabrican.
 *
 * ── Si no cumple, FALLA, y dice quién ─────────────────────────────────────────────────────────
 * Sin `skip` ni `fixme`: cada incumplimiento sale con el estilo, el modo, la pantalla, el estado,
 * la razón medida, los colores y el archivo que pinta esa etiqueta. Con
 * `MORPHIQPOS_VOLCAR_MEDIDAS=<archivo>` cada medida (también las que cumplen) se agrega a ese
 * archivo como una línea de JSON, para armar la tabla estado × estilo × aparato.
 *
 * Una etiqueta TAPADA por otro elemento (la leyenda del mapa de la dueña queda bajo el botón
 * flotante del teléfono) no se mide: se acusa que la tapan, y su contraste queda en blanco en vez
 * de ser el de lo que la tapa.
 */

const SLUG = 'demo-acople-restaurante';
const MODOS = ['claro', 'oscuro'] as const;
type Modo = (typeof MODOS)[number];

/**
 * Dónde se pinta cada etiqueta y de dónde salen sus colores, a a8b138a. Va en el mensaje para que
 * el fallo diga a dónde ir. Las líneas se mueven con el código: si una cambia, el mensaje sigue
 * diciendo el archivo, y `rg 'MESA_STATUS_CONFIG'` encuentra el resto.
 */
const DONDE = {
  mapa:
    'apps/web/heredado/components/mesas/MesaShape.jsx:126-131 · colores en ' +
    'heredado/lib/constants.js:56-82 (claro) y heredado/lib/darkPalettes.js:207-243 (oscuro)',
  rejilla:
    'apps/web/heredado/components/mesero/MesaGridMobile.jsx:133-143 (chip) · colores en ' +
    'heredado/lib/constants.js:56-82 y heredado/lib/darkPalettes.js:207-243',
  leyenda: 'apps/web/heredado/pages/Mesero.jsx:1078-1093',
  cabecera:
    'apps/web/heredado/pages/Mesero.jsx:1131-1139 (usa SIEMPRE la paleta clara) · colores en ' +
    'heredado/lib/constants.js:56-82',
  mapaDuena:
    'apps/web/src/restaurante/MapaDeMesas.tsx:425 · clases por estado en MapaDeMesas.tsx:67-94',
  leyendaDuena: 'apps/web/src/restaurante/MapaDeMesas.tsx:462-484',
} as const;

interface Apariencia {
  readonly estilo: string;
  readonly densidad: string;
  readonly redondeo: string;
  readonly elevacion: string;
  readonly movimiento: string;
}

/** Una medida, en una línea, para armar la tabla del informe. */
interface Fila {
  readonly proyecto: string;
  readonly estilo: string;
  readonly modo: Modo;
  readonly pantalla: string;
  readonly estado: EstadoDeMesa;
  readonly etiqueta: string;
  readonly dice: string;
  /** `null` si no hay nada que medir: no hay etiqueta, no se ve o la tapa otro elemento. */
  readonly razon: number | null;
  readonly cubiertaPor: string | null;
  readonly minimo: number | null;
  readonly texto: string | null;
  readonly fondoPeor: string | null;
  readonly fondoMasClaro: string | null;
  readonly fondoMasOscuro: string | null;
  readonly tamanoPx: number | null;
  readonly peso: number | null;
  readonly cumple: boolean;
  readonly donde: string;
}

/** Todo lo que una revisión necesita saber de dónde está y a dónde apuntar el hallazgo. */
interface Revision {
  readonly proyecto: string;
  readonly estilo: string;
  readonly modo: Modo;
  readonly hallazgos: string[];
  readonly filas: Fila[];
}

const VOLCADO = process.env['MORPHIQPOS_VOLCAR_MEDIDAS'] ?? '';

/** Las etiquetas del código, para que la prueba no tenga su propia lista que se quede atrás. */
function etiquetasDelCodigo(): Readonly<Record<string, string>> {
  const fuente = readFileSync('apps/web/heredado/lib/constants.js', 'utf8');
  const bloque = /export const MESA_STATUS_CONFIG = \{([\s\S]*?)\n\};/.exec(fuente)?.[1] ?? '';
  return Object.fromEntries(
    [...bloque.matchAll(/(\w+):\s*\{\s*label:\s*'([^']+)'/g)].map((m) => [m[1] ?? '', m[2] ?? '']),
  );
}

/** Los estados de mesa que la base admite, de `ESTADOS_MESA`. */
function estadosDelServidor(): string[] {
  const fuente = readFileSync('packages/app/src/restaurante/transiciones.ts', 'utf8');
  const lista = /export const ESTADOS_MESA = \[([^\]]+)\] as const;/.exec(fuente)?.[1] ?? '';
  return [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? '');
}

const redondeada = (n: number): number => Math.round(n * 100) / 100;

/**
 * Anota una etiqueta medida y, si no cumple, el hallazgo con todo lo que hace falta para
 * arreglarla: qué estado, en qué pantalla, qué razón, qué colores y dónde se pinta.
 */
function registrar(
  r: Revision,
  pantalla: string,
  donde: string,
  e: (typeof CICLO_DE_LA_MESA)[number],
  mesa: number | null,
  medida: Medida | null,
  /** Lo que sobra de la etiqueta fuera de su tesela, si algo. */
  fuera: string | null = null,
): void {
  const quien =
    `${r.estilo} · ${r.modo} · ${pantalla} · «${e.etiqueta}»` +
    (mesa === null ? '' : ` (mesa ${String(mesa)})`);
  const mal: string[] = [];

  if (medida === null) {
    mal.push(`TEXTO · no hay etiqueta de estado en la tesela [${donde}]`);
  } else {
    if (!medida.visible) mal.push('TEXTO · la etiqueta no se ve');
    if (medida.cubiertaPor !== null) {
      mal.push(
        `TEXTO · la tapa <${medida.cubiertaPor}> (aun desplazada hasta el final de la pantalla; ` +
          'su contraste no se mide: la captura sería la del que la tapa)',
      );
    }
    if (medida.recortada) mal.push('TEXTO · un contenedor la recorta');
    if (fuera !== null) mal.push(`TEXTO · ${fuera}`);
    if (medida.texto !== e.etiqueta) {
      mal.push(`TEXTO · dice «${medida.texto}» y debería decir «${e.etiqueta}»`);
    }
    if (Number.isFinite(medida.razon) && !(medida.razon >= medida.minimo)) {
      mal.push(
        `CONTRASTE · ${redondeada(medida.razon).toFixed(2)}:1, mínimo ${String(medida.minimo)}:1 ` +
          `(texto ${medida.textoHex} sobre ${medida.peorFondoHex}; el fondo bajo el texto va de ` +
          `${medida.fondoMasOscuroHex} a ${medida.fondoMasClaroHex}; ${String(medida.tamanoPx)} px, ` +
          `peso ${String(medida.peso)})`,
      );
    }
  }

  const fila: Fila = {
    proyecto: r.proyecto,
    estilo: r.estilo,
    modo: r.modo,
    pantalla,
    estado: e.clave,
    etiqueta: e.etiqueta,
    dice: medida?.texto ?? '',
    razon: medida !== null && Number.isFinite(medida.razon) ? redondeada(medida.razon) : null,
    cubiertaPor: medida?.cubiertaPor ?? null,
    minimo: medida?.minimo ?? null,
    texto: medida?.textoHex ?? null,
    fondoPeor: medida?.peorFondoHex ?? null,
    fondoMasClaro: medida?.fondoMasClaroHex ?? null,
    fondoMasOscuro: medida?.fondoMasOscuroHex ?? null,
    tamanoPx: medida?.tamanoPx ?? null,
    peso: medida?.peso ?? null,
    cumple: mal.length === 0,
    donde,
  };
  r.filas.push(fila);
  if (VOLCADO !== '') appendFileSync(VOLCADO, `${JSON.stringify(fila)}\n`);
  for (const m of mal) r.hallazgos.push(`${quien}: ${m} [${donde}]`);
}

/**
 * La señal que no es color: que dos estados distintos no se lean igual. Quitado el color, lo único
 * que separa «Ocupada» de «En preparación» es lo que dicen; si dos teselas dijeran lo mismo, o no
 * dijeran nada, serían el mismo estado para quien no ve el color.
 */
function exigirQueSeDistingan(r: Revision, pantalla: string, dicho: Map<EstadoDeMesa, string>) {
  const porTexto = new Map<string, EstadoDeMesa[]>();
  for (const [clave, texto] of dicho) {
    const t = texto.trim();
    porTexto.set(t, [...(porTexto.get(t) ?? []), clave]);
  }
  for (const [texto, claves] of porTexto) {
    if (texto === '') {
      r.hallazgos.push(
        `${r.estilo} · ${r.modo} · ${pantalla}: SEÑAL · ${claves.join(', ')} no dicen nada: ` +
          'sin color son indistinguibles',
      );
    } else if (claves.length > 1) {
      r.hallazgos.push(
        `${r.estilo} · ${r.modo} · ${pantalla}: SEÑAL · ${claves.join(' y ')} dicen lo mismo, ` +
          `«${texto}»: sin color son indistinguibles`,
      );
    }
  }
}

/**
 * La señal que NO es color de una tesela —borde, iconos, patrón—, para el informe. Con
 * `MORPHIQPOS_VOLCAR_MEDIDAS` va al archivo; no afirma nada: lo que se afirma es que dos estados no
 * se lean igual (`exigirQueSeDistingan`), y estas señales sólo dicen qué más hay además de la palabra.
 */
async function anotarLasSenales(
  r: Revision,
  pantalla: string,
  estado: EstadoDeMesa,
  tesela: Locator,
): Promise<void> {
  if (VOLCADO === '' || (await tesela.count()) === 0) return;
  const s = await leerLasSenales(tesela);
  appendFileSync(
    VOLCADO,
    `${JSON.stringify({ senales: true, proyecto: r.proyecto, estilo: r.estilo, modo: r.modo, pantalla, estado, ...s })}\n`,
  );
}

/** Escritorio y tableta pintan el mapa; el teléfono, una rejilla (`useIsMobile`: menos de 768 px). */
function esAngosto(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 768;
}

const numeroDeMesa = (page: Page, numero: number): Locator =>
  page.locator('span.font-heading', { hasText: new RegExp(`^${String(numero)}$`) });

/** Espera a que las animaciones que terminan hayan terminado: el diálogo entra escalando. */
async function yaAbierto(dialogo: Locator): Promise<void> {
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

/**
 * Que la página quepa en la pantalla. Si es más ancha, un teléfono la encoge para que entre (y la
 * columna derecha de mesas queda cortada) o hay que deslizarla de lado: en cualquiera de los dos
 * casos lo que se lee en el borde ya no es lo que se midió. Se dice como hallazgo propio.
 */
async function sinDesborde(r: Revision, page: Page, pantalla: string): Promise<void> {
  const ancho = page.viewportSize()?.width ?? 0;
  const demas = await page.evaluate(
    (a) => Math.max(window.innerWidth, document.documentElement.scrollWidth) - a,
    ancho,
  );
  if (demas > 1) {
    r.hallazgos.push(
      `${r.estilo} · ${r.modo} · ${pantalla}: DESBORDE · la página es ${String(Math.round(demas))} px más ` +
        'ancha que la pantalla: el teléfono la encoge o hay que deslizarla de lado',
    );
  }
}

/** El navegador debe estar pintando el estilo y el modo que se mide, no otro. */
async function exigirElEstiloYElModo(page: Page, estilo: string, modo: Modo): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          estilo: document.documentElement.dataset['estilo'] ?? '',
          modo: document.documentElement.dataset['modo'] ?? '',
        })),
      { message: `La pantalla no está pintada en ${estilo} / ${modo}.` },
    )
    .toEqual({ estilo, modo });
}

/**
 * El modo claro u oscuro es del DISPOSITIVO (`mh_theme` en `localStorage`), no del negocio: se
 * pone y se vuelve a cargar, porque `useIsDark()` lee el almacenamiento al montar y las mesas
 * eligen su paleta con él.
 */
async function ponerElModo(page: Page, modo: Modo): Promise<void> {
  await page.evaluate((m) => {
    if (m === 'oscuro') window.localStorage.setItem('mh_theme', 'dark');
    else window.localStorage.removeItem('mh_theme');
  }, modo);
}

async function aparienciaDelServidor(page: Page): Promise<Apariencia> {
  const [config] = await consultarPuente<Record<string, unknown>>(page, 'ConfiguracionNegocio');
  const g = (config?.['apariencia'] ?? {}) as Record<string, unknown>;
  return {
    estilo: String(g['estilo']),
    densidad: String(g['densidad']),
    redondeo: String(g['redondeo']),
    elevacion: String(g['elevacion']),
    movimiento: String(g['movimiento']),
  };
}

/** La apariencia que un estilo declara: él y sus cuatro perillas de fábrica. */
function deFabrica(estilo: string): Apariencia {
  const definicion = ESTILOS[estilo];
  if (definicion === undefined) throw new Error(`Estilo desconocido: ${estilo}`);
  return { estilo, ...definicion.perillas };
}

async function guardarApariencia(page: Page, apariencia: Apariencia): Promise<void> {
  const respuesta = await page.request.post('/api/configuracion/apariencia', {
    headers: cabecerasDeEscrituraDePrueba(),
    data: apariencia,
  });
  expect(
    respuesta.status(),
    `No se pudo guardar ${apariencia.estilo}: ${(await respuesta.text()).slice(0, 200)}`,
  ).toBe(200);
}

/** Cambia a la zona del mapa (las pestañas Interior, Terraza y Barra) y espera su primera mesa. */
async function irALaZona(page: Page, zona: string, primera: number): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${zona}\\b`) }).click();
  await expect(numeroDeMesa(page, primera).first()).toBeVisible({ timeout: 15_000 });
}

/**
 * LA REGLA ANTES QUE LA MEDIDA: la ayuda de contraste, vista acertar y vista fallar.
 *
 * Todo lo que dice el resto de este archivo sale de `medirEtiqueta`, así que antes de fiarse de
 * ella se le dan páginas inventadas, sin servidor, de las que se sabe de antemano qué razón
 * tienen (la fórmula de WCAG 1.4.3 aplicada a hexadecimales conocidos). Es lo mismo que hace
 * `contraste.spec.ts` con la medida del rastreador, y por la misma razón: una puerta que sólo se
 * ha visto aprobar no se sabe si puede acusar.
 *
 * La última página reproduce el caso que ya engañó a esta ayuda: en un teléfono, una página más
 * ancha que la pantalla no se encoge —el visor de 412 px se pasea por una capa de 520—, y la
 * captura se recorta en coordenadas del visor y no de la capa. Con la compensación que había
 * antes esa página daba un número cualquiera; con el visor da 2.36:1, el de siempre.
 */
const luzDeHex = (hex: string): number => {
  const n = Number.parseInt(hex.slice(1), 16);
  const canal = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(n >> 16) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
};
const razonDeHex = (a: string, b: string): number => {
  const [la, lb] = [luzDeHex(a), luzDeHex(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const hexDe = (c: readonly [number, number, number]): string =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

const PAGINA_INVENTADA = (cuerpo: string): string =>
  '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">' +
  '<style>body{margin:0;background:#fff;font:600 9px/1.2 sans-serif}</style></head>' +
  `<body>${cuerpo}</body></html>`;

test.describe('la ayuda de medida de contraste, vista acertar y fallar', () => {
  test('blanco sobre naranja sólido da la razón de la fórmula (2.36:1) y no cumple', async ({
    page,
  }) => {
    await page.setContent(
      PAGINA_INVENTADA(
        '<div style="padding:20px"><span id="e" style="display:inline-block;padding:4px 8px;' +
          'color:#ffffff;background:#fb8c2a">En preparación</span></div>',
      ),
    );
    const medida = await medirEtiqueta(page, page.locator('#e'), 'En preparación');
    expect(medida, 'La ayuda no encontró la etiqueta inventada.').not.toBeNull();
    expect(medida?.razon).toBeCloseTo(razonDeHex('#ffffff', '#fb8c2a'), 1);
    expect(medida?.minimo, '9 px no es texto grande: exige 4.5:1.').toBe(4.5);
    expect(medida?.razon).toBeLessThan(medida?.minimo ?? 0);
    expect(medida?.cubiertaPor).toBeNull();
    expect(medida?.texto).toBe('En preparación');
  });

  test('negro sobre blanco da 21:1 y cumple', async ({ page }) => {
    await page.setContent(
      PAGINA_INVENTADA(
        '<div style="padding:20px"><span id="e" style="display:inline-block;padding:4px 8px;' +
          'color:#000000;background:#ffffff">Libre</span></div>',
      ),
    );
    const medida = await medirEtiqueta(page, page.locator('#e'), 'Libre');
    expect(medida?.razon).toBeCloseTo(21, 0);
    expect(medida?.razon).toBeGreaterThanOrEqual(medida?.minimo ?? 99);
  });

  test('sobre un degradado mide el PEOR píxel, no el promedio ni el primero', async ({ page }) => {
    await page.setContent(
      PAGINA_INVENTADA(
        '<div style="padding:20px"><span id="e" style="display:inline-block;width:200px;' +
          'padding:4px 0;text-align:center;color:#ffffff;' +
          'background:linear-gradient(90deg,#000000,#ffffff)">Cuenta solicitada</span></div>',
      ),
    );
    const medida = await medirEtiqueta(page, page.locator('#e'), 'Cuenta solicitada');
    expect(medida).not.toBeNull();
    // Con texto blanco, el peor píxel es el MÁS CLARO del degradado bajo las letras…
    expect(medida?.peorFondoHex).toBe(medida?.fondoMasClaroHex);
    // …y la razón es la de la fórmula contra ese píxel, no contra el extremo blanco del degradado.
    expect(medida?.razon).toBeCloseTo(razonDeHex('#ffffff', medida?.peorFondoHex ?? '#000000'), 1);
    expect(medida?.razon).toBeGreaterThan(1);
    // Y el MEJOR es contra el píxel más oscuro: mucho más que el peor.
    expect(medida?.razonMejor).toBeGreaterThan((medida?.razon ?? 0) + 1);
  });

  test('la pastilla translúcida del teléfono: blanco sobre blanco al 55 % es ilegible (1.81:1)', async ({
    page,
  }) => {
    await page.setContent(
      PAGINA_INVENTADA(
        '<div style="padding:20px;background:#3b82f6"><span id="e" style="display:inline-block;' +
          'padding:2px 8px;border-radius:9999px;color:#ffffff;' +
          'background:rgba(255,255,255,0.55)">Pedido enviado</span></div>',
      ),
    );
    const mezcla = hexDe(
      [0x3b, 0x82, 0xf6].map((c) => 0.55 * 255 + 0.45 * c) as [number, number, number],
    );
    const medida = await medirEtiqueta(page, page.locator('#e'), 'Pedido enviado');
    expect(medida?.razon).toBeCloseTo(razonDeHex('#ffffff', mezcla), 1);
    expect(medida?.razon).toBeLessThan(2);
  });

  test('si otro elemento la tapa, lo dice y no inventa una razón', async ({ page }) => {
    await page.setContent(
      PAGINA_INVENTADA(
        '<div style="padding:20px"><span id="e" style="display:inline-block;padding:4px 8px;' +
          'color:#000000;background:#ffffff">Ocupada</span></div>' +
          '<div id="tapa" style="position:fixed;inset:0;background:#000000"></div>',
      ),
    );
    const medida = await medirEtiqueta(page, page.locator('#e'), 'Ocupada');
    expect(medida?.cubiertaPor, 'Una capa fija encima no se detectó.').toMatch(/^div/);
    expect(Number.isNaN(medida?.razon), 'Midió la capa que tapa en vez de decir que no mide.').toBe(
      true,
    );
  });

  test('si otro elemento la tapa SÓLO a medias (una esquina), también lo dice', async ({
    page,
  }) => {
    await page.setContent(
      PAGINA_INVENTADA(
        '<div style="padding:20px"><span id="e" style="display:inline-block;padding:4px 8px;' +
          'color:#000000;background:#ffffff">Pedido enviado</span></div>' +
          // Un botón flotante que sólo muerde la esquina derecha del renglón: el centro queda libre.
          '<button id="flota" style="position:fixed;left:72px;top:18px;width:80px;height:12px;' +
          'padding:0;border:0;background:#1b69e8"></button>',
      ),
    );
    const medida = await medirEtiqueta(page, page.locator('#e'), 'Pedido enviado');
    expect(medida?.cubiertaPor, 'Una tapa parcial (sólo una esquina) no se detectó.').toMatch(
      /^button/,
    );
    expect(Number.isNaN(medida?.razon)).toBe(true);
  });

  test('texto grande exige 3:1 y el pequeño 4.5:1 (24 px, 14 pt en negrita, 13 px)', async ({
    page,
  }) => {
    await page.setContent(
      PAGINA_INVENTADA(
        '<div style="padding:20px;display:flex;flex-direction:column;gap:12px;align-items:flex-start">' +
          '<span id="a" style="font:400 24px sans-serif;color:#000">Grande</span>' +
          '<span id="b" style="font:700 18.66px sans-serif;color:#000">Negrita</span>' +
          '<span id="c" style="font:700 13px sans-serif;color:#000">Chica</span></div>',
      ),
    );
    expect((await medirEtiqueta(page, page.locator('#a'), 'Grande'))?.minimo).toBe(3);
    expect((await medirEtiqueta(page, page.locator('#b'), 'Negrita'))?.minimo).toBe(3);
    expect((await medirEtiqueta(page, page.locator('#c'), 'Chica'))?.minimo).toBe(4.5);
  });

  test('en una página más ancha que la pantalla (el visor se desplaza) sigue midiendo el texto', async ({
    page,
  }, info) => {
    await page.setContent(
      PAGINA_INVENTADA(
        '<div style="position:relative;width:520px;height:2000px">' +
          '<span id="e" style="position:absolute;left:360px;top:1500px;padding:4px 8px;' +
          'color:#ffffff;background:#fb8c2a">En preparación</span></div>',
      ),
    );
    const medida = await medirEtiqueta(page, page.locator('#e'), 'En preparación');
    const visor = await page.evaluate(() => ({
      capa: window.innerWidth,
      pantalla: window.visualViewport?.width ?? 0,
      desplazado: [window.visualViewport?.offsetLeft ?? 0, window.visualViewport?.offsetTop ?? 0],
    }));
    info.annotations.push({
      type: 'visor',
      description: `capa ${String(visor.capa)} px, pantalla ${String(visor.pantalla)} px, visor desplazado ${visor.desplazado.join(', ')}`,
    });
    expect(medida?.razon).toBeCloseTo(razonDeHex('#ffffff', '#fb8c2a'), 1);
  });
});

test.describe('los estados de la mesa se leen', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  let equipo: Equipo | null = null;
  let duena: Page;
  let mesera: Page;
  let puestas: readonly MesaPuesta[] = [];
  let original: Apariencia | null = null;

  test.beforeAll(async ({ browser, playwright }, info) => {
    test.setTimeout(3 * 60_000);
    await exigirDemostracion(playwright, info, SLUG);
    equipo = new Equipo(browser, SLUG);
    duena = await equipo.pagina(info, 'dueno');
    await duena.goto('/', { waitUntil: 'domcontentloaded' });
    original = await aparienciaDelServidor(duena);
    puestas = await ponerLasMesas(duena);
    mesera = await equipo.pagina(info, 'mesero');
    await mesera.goto('/mesero', { waitUntil: 'domcontentloaded' });
  });

  test.afterAll(async () => {
    if (equipo === null) return;
    try {
      if (original !== null) await guardarApariencia(duena, original);
      const pendientes = await devolverLasMesas(duena, puestas);
      if (pendientes.length > 0) {
        test.info().annotations.push({ type: 'mesas', description: pendientes.join('; ') });
      }
    } finally {
      await equipo.cerrar();
    }
  });

  test('las etiquetas de la prueba son las del código y están los diez estados', () => {
    const delCodigo = etiquetasDelCodigo();
    for (const { clave, etiqueta } of CICLO_DE_LA_MESA) {
      expect(delCodigo[clave], `MESA_STATUS_CONFIG.${clave} ya no dice «${etiqueta}».`).toBe(
        etiqueta,
      );
    }
    // Los diez de la base: los ocho que el servidor escribe y los dos que nadie alcanza.
    expect(
      estadosDelServidor().sort(),
      'La base admite un estado de mesa que esta prueba no conoce: agrégalo al ciclo o dilo aquí.',
    ).toEqual([...CICLO_DE_LA_MESA.map((e) => e.clave), 'pagada', 'cancelada'].sort());
  });

  test('el servidor dejó cada mesa en el estado que esta prueba mide', async () => {
    const mesas = await consultarPuente<Record<string, unknown>>(duena, 'Mesa', { limite: 60 });
    for (const p of puestas) {
      expect(
        mesas.find((m) => m['numero'] === p.numero)?.['estado'],
        `mesa ${String(p.numero)}`,
      ).toBe(p.estado);
    }
    expect(
      new Set(puestas.map((p) => p.estado)),
      'La demo no tiene una mesa en cada uno de los ocho estados.',
    ).toEqual(new Set(CICLO_DE_LA_MESA.map((e) => e.clave)));
  });

  for (const estilo of CLAVES_ESTILO) {
    test(`${estilo}: cada estado tiene su texto, una señal más que el color y contraste`, async () => {
      const info = test.info();
      test.setTimeout(8 * 60_000);
      const nombre = ESTILOS[estilo]?.nombre ?? estilo;
      const hallazgos: string[] = [];
      const filas: Fila[] = [];
      const proyecto = info.project.name;
      const angosto = esAngosto(mesera);

      // El estilo es del NEGOCIO: se guarda, y cada pantalla lo pinta desde el servidor.
      await guardarApariencia(duena, deFabrica(estilo));

      try {
        for (const modo of MODOS) {
          const rev: Revision = { proyecto, estilo, modo, hallazgos, filas };

          // ── LA MESERA · `/mesero` ──────────────────────────────────────────────────────
          await ponerElModo(mesera, modo);
          await mesera.goto('/mesero', { waitUntil: 'domcontentloaded' });
          await expect(mesera.getByRole('heading', { name: 'Mesero', level: 1 })).toBeVisible();
          await exigirElEstiloYElModo(mesera, estilo, modo);
          await sinDesborde(
            rev,
            mesera,
            angosto ? '/mesero · rejilla del teléfono' : '/mesero · mapa',
          );

          const teselaDe = (numero: number): Locator =>
            mesera
              .locator('div.cursor-pointer.select-none, button.rounded-2xl')
              .filter({ has: numeroDeMesa(mesera, numero) });
          const pantalla = angosto ? '/mesero · rejilla del teléfono' : '/mesero · mapa';
          const donde = angosto ? DONDE.rejilla : DONDE.mapa;
          const dichoMesero = new Map<EstadoDeMesa, string>();

          for (const zona of [...new Set(puestas.map((p) => p.zona))]) {
            const deLaZona = puestas.filter((p) => p.zona === zona);
            const primera = deLaZona[0];
            if (primera === undefined) continue;
            await irALaZona(mesera, zona, primera.numero);
            for (const mesa of deLaZona) {
              const e = CICLO_DE_LA_MESA.find((x) => x.clave === mesa.estado);
              if (e === undefined) continue;
              const tesela = teselaDe(mesa.numero);
              const etiqueta = angosto
                ? tesela.locator('span.rounded-full.border')
                : tesela.locator('span.leading-tight');
              const medida = await medirEtiqueta(mesera, etiqueta, e.etiqueta);
              const fuera = medida === null ? null : await seSaleDeLaTesela(tesela, medida);
              registrar(rev, pantalla, donde, e, mesa.numero, medida, fuera);
              if (medida !== null) dichoMesero.set(e.clave, medida.texto);
              await anotarLasSenales(rev, pantalla, e.clave, tesela);
            }
          }
          exigirQueSeDistingan(rev, pantalla, dichoMesero);

          // La leyenda de colores, al pie: cada estado con su muestra y su palabra.
          const leyenda = mesera.locator('div[class~="text-[10px]"] div.bg-card');
          for (const e of CICLO_DE_LA_MESA) {
            const etiqueta = leyenda.getByText(e.etiqueta, { exact: true });
            const medida = await medirEtiqueta(mesera, etiqueta, e.etiqueta);
            registrar(rev, '/mesero · leyenda', DONDE.leyenda, e, null, medida);
          }

          // La cabecera de la mesa abierta lleva el estado en una pastilla de su color. Va con
          // la paleta clara aun en modo oscuro (`MESA_STATUS_CONFIG`, sin su versión oscura), así
          // que en oscuro basta medirla con un estilo; en claro se mide en los ocho.
          if (modo === 'claro' || estilo === CLAVES_ESTILO[0]) {
            for (const mesa of puestas.filter(
              (p) => p.ordenId !== null && p.estado !== 'limpieza',
            )) {
              const e = CICLO_DE_LA_MESA.find((x) => x.clave === mesa.estado);
              if (e === undefined) continue;
              await irALaZona(mesera, mesa.zona, mesa.numero);
              await teselaDe(mesa.numero).click();
              const dialogo = mesera.getByRole('dialog', {
                name: new RegExp(`^Mesa ${String(mesa.numero)} `),
              });
              await yaAbierto(dialogo);
              const etiqueta = dialogo
                .locator('h2 span.rounded-full')
                .filter({ hasText: e.etiqueta });
              const medida = await medirEtiqueta(mesera, etiqueta, e.etiqueta);
              registrar(
                rev,
                '/mesero · cabecera de la mesa',
                DONDE.cabecera,
                e,
                mesa.numero,
                medida,
              );
              await mesera.keyboard.press('Escape');
              await expect(mesera.getByRole('dialog')).toHaveCount(0);
            }
          }

          // ── LA DUEÑA · el mapa de mesas del modelo ─────────────────────────────────────
          await ponerElModo(duena, modo);
          await duena.goto('/restaurante/mapa-de-mesas', { waitUntil: 'domcontentloaded' });
          await expect(duena.getByRole('heading', { name: 'Mesas', exact: true })).toBeVisible();
          await exigirElEstiloYElModo(duena, estilo, modo);
          await sinDesborde(rev, duena, '/restaurante/mapa-de-mesas');
          const piso = duena.locator('section[aria-label^="Mesas"]');
          await expect(piso.locator('li').first()).toBeVisible();
          const dichoDuena = new Map<EstadoDeMesa, string>();
          for (const mesa of puestas) {
            const e = CICLO_DE_LA_MESA.find((x) => x.clave === mesa.estado);
            if (e === undefined) continue;
            const tesela = piso.locator('li').filter({
              has: duena.locator('span.font-numeros', {
                hasText: new RegExp(`^${String(mesa.numero)}$`),
              }),
            });
            const medida = await medirEtiqueta(
              duena,
              tesela.locator('span.text-xs.font-medium'),
              e.etiqueta,
            );
            const fuera =
              medida === null ? null : await seSaleDeLaTesela(tesela.locator('button'), medida);
            registrar(
              rev,
              '/restaurante/mapa-de-mesas · mesas',
              DONDE.mapaDuena,
              e,
              mesa.numero,
              medida,
              fuera,
            );
            if (medida !== null) dichoDuena.set(e.clave, medida.texto);
            await anotarLasSenales(
              rev,
              '/restaurante/mapa-de-mesas · mesas',
              e.clave,
              tesela.locator('button'),
            );
          }
          exigirQueSeDistingan(rev, '/restaurante/mapa-de-mesas · mesas', dichoDuena);

          // Su leyenda: la palabra y el CONTEO de cada estado, que tiene que ser el real.
          const reales = await consultarPuente<Record<string, unknown>>(duena, 'Mesa', {
            limite: 60,
          });
          const leyendaDuena = duena.getByRole('list', { name: 'Leyenda de estados' });
          for (const e of CICLO_DE_LA_MESA) {
            const renglon = leyendaDuena.locator('li').filter({ hasText: e.etiqueta });
            const medida = await medirEtiqueta(duena, renglon, e.etiqueta);
            registrar(
              rev,
              '/restaurante/mapa-de-mesas · leyenda',
              DONDE.leyendaDuena,
              e,
              null,
              medida,
            );
            const esperadas = reales.filter((m) => m['estado'] === e.clave).length;
            const dice = Number.parseInt(
              (await renglon
                .locator('span.font-numeros')
                .first()
                .innerText()
                .catch(() => '')) || 'NaN',
              10,
            );
            if (dice !== esperadas) {
              hallazgos.push(
                `${estilo} · ${modo} · /restaurante/mapa-de-mesas · leyenda · «${e.etiqueta}»: ` +
                  `CONTEO · la leyenda cuenta ${String(dice)} y hay ${String(esperadas)} [${DONDE.leyendaDuena}]`,
              );
            }
          }

          // ── LA DUEÑA · la distribución de mesas (sólo donde hay mapa, no en el teléfono) ──
          if (!angosto) {
            await duena.goto('/configuracion?tab=mesas', { waitUntil: 'domcontentloaded' });
            await expect(duena.getByText('Mapa de mesas').first()).toBeVisible({ timeout: 30_000 });
            await exigirElEstiloYElModo(duena, estilo, modo);
            await sinDesborde(rev, duena, '/configuracion · mapa de mesas');
            const dichoEditor = new Map<EstadoDeMesa, string>();
            for (const zona of [...new Set(puestas.map((p) => p.zona))]) {
              const deLaZona = puestas.filter((p) => p.zona === zona);
              const primera = deLaZona[0];
              if (primera === undefined) continue;
              await irALaZona(duena, zona, primera.numero);
              for (const mesa of deLaZona) {
                const e = CICLO_DE_LA_MESA.find((x) => x.clave === mesa.estado);
                if (e === undefined) continue;
                const tesela = duena
                  .locator('div.cursor-pointer.select-none')
                  .filter({ has: numeroDeMesa(duena, mesa.numero) });
                const medida = await medirEtiqueta(
                  duena,
                  tesela.locator('span.leading-tight'),
                  e.etiqueta,
                );
                const fuera = medida === null ? null : await seSaleDeLaTesela(tesela, medida);
                registrar(
                  rev,
                  '/configuracion · mapa de mesas',
                  DONDE.mapa,
                  e,
                  mesa.numero,
                  medida,
                  fuera,
                );
                if (medida !== null) dichoEditor.set(e.clave, medida.texto);
                await anotarLasSenales(rev, '/configuracion · mapa de mesas', e.clave, tesela);
              }
            }
            exigirQueSeDistingan(rev, '/configuracion · mapa de mesas', dichoEditor);
          }
        }
      } finally {
        await ponerElModo(mesera, 'claro').catch(() => undefined);
        await ponerElModo(duena, 'claro').catch(() => undefined);
      }

      // Cuántos de cada clase, para leer de un vistazo qué pasa antes de bajar a las líneas.
      const porClase = ['CONTRASTE', 'TEXTO', 'SEÑAL', 'CONTEO', 'DESBORDE']
        .map(
          (clase) => [clase, hallazgos.filter((h) => h.includes(` ${clase} · `)).length] as const,
        )
        .filter(([, cuantas]) => cuantas > 0)
        .map(([clase, cuantas]) => `${String(cuantas)} ${clase}`)
        .join(', ');
      expect(
        hallazgos,
        `En ${nombre} (${proyecto}) hay ${String(hallazgos.length)} incumplimientos en las ` +
          `etiquetas de estado de mesa (${porClase}). Cada línea dice estilo · modo · pantalla · ` +
          'estado, qué falla, y el archivo que pinta esa etiqueta. El contraste es el de WCAG ' +
          '1.4.3 contra el peor píxel del degradado bajo el texto.',
      ).toEqual([]);
    });
  }
});
