import { expect, type Page } from '@playwright/test';

import { ESTILOS } from '../../../packages/ui/src/tokens/estilos.ts';
import { cabecerasDeEscrituraDePrueba } from './sesion.ts';

/**
 * EL RASTREADOR EN LOS OCHO ESTILOS · lo que un estilo puede romper y ninguna otra
 * puerta ve.
 *
 * `estilos.spec.ts` prueba los ocho sobre UNA página, `/sistema`. Un estilo que
 * esconde un botón detrás de otro en una pantalla de verdad —una sombra dura
 * desplazada, un radio que se come una esquina, una isla más alta—, o que deja
 * ilegible una tabla densa, es un botón muerto o un dato que no se lee, y sólo lo ve
 * alguien que recorra TODAS las pantallas en ESE estilo. Eso es el rastreador.
 *
 * `MORPHIQPOS_ESTILOS` decide en cuáles corre:
 *   · vacío     → en el del negocio, como hasta ahora (una prueba);
 *   · `todos`   → los ocho, una prueba por estilo;
 *   · `a,b,c`   → ésos, y un nombre que no exista rompe la corrida en vez de ignorarse.
 */

export type EstiloDelRastreo = string | null;

export function estilosDelRastreo(): readonly EstiloDelRastreo[] {
  const pedido = (process.env['MORPHIQPOS_ESTILOS'] ?? '').trim();
  if (pedido === '') return [null];
  if (pedido === 'todos') return Object.keys(ESTILOS);
  const lista = pedido
    .split(',')
    .map((estilo) => estilo.trim())
    .filter((estilo) => estilo !== '');
  const desconocidos = lista.filter((estilo) => !(estilo in ESTILOS));
  if (desconocidos.length > 0) {
    throw new Error(
      `MORPHIQPOS_ESTILOS pide ${desconocidos.join(', ')}, que no son estilos del sistema: ` +
        `${Object.keys(ESTILOS).join(', ')}.`,
    );
  }
  return lista;
}

interface Apariencia {
  readonly estilo: string;
  readonly densidad: string;
  readonly redondeo: string;
  readonly elevacion: string;
  readonly movimiento: string;
}

async function guardar(page: Page, apariencia: Apariencia): Promise<void> {
  const respuesta = await page.request.post('/api/configuracion/apariencia', {
    headers: cabecerasDeEscrituraDePrueba(),
    data: apariencia,
  });
  expect(
    respuesta.ok(),
    `No se pudo guardar el estilo ${apariencia.estilo}: ${String(respuesta.status())} ` +
      (await respuesta.text()).slice(0, 200),
  ).toBe(true);
}

/**
 * Pone el estilo POR LA MISMA RUTA que el selector de Modo Presentación —el comando
 * `configuracion.fijar_apariencia`, con sus cuatro perillas de fábrica— y comprueba en
 * el `<html>` que llegó. Devuelve cómo dejarlo como estaba: en CI la base se tira, pero
 * en una base compartida el siguiente que entre no tiene por qué heredarlo.
 */
export async function ponerEstilo(
  page: Page,
  estilo: EstiloDelRastreo,
): Promise<() => Promise<void>> {
  if (estilo === null) return () => Promise.resolve();
  const definicion = ESTILOS[estilo];
  if (definicion === undefined) throw new Error(`Estilo desconocido: ${estilo}`);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const antes = await page.evaluate(() => {
    const raiz = document.documentElement.dataset;
    return {
      estilo: raiz['estilo'] ?? 'morphiq',
      densidad: raiz['densidad'] ?? 'normal',
      redondeo: raiz['redondeo'] ?? 'media',
      elevacion: raiz['elevacion'] ?? 'sombra',
      movimiento: raiz['movimiento'] ?? 'normal',
    };
  });

  await guardar(page, { estilo, ...definicion.perillas });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const puesto = await page.evaluate(() => document.documentElement.dataset['estilo'] ?? '');
  expect(puesto, `Se guardó ${estilo} y el <html> dice «${puesto}»`).toBe(estilo);

  return () => guardar(page, antes);
}

/**
 * LO QUE NO SE LEE EN UNA TABLA DENSA, medido en el navegador.
 *
 * Cada texto dentro de una tabla, y cada importe, contra el fondo que de verdad tiene
 * debajo: se suben los ancestros componiendo sus fondos semitransparentes hasta dar
 * con uno opaco, y la opacidad del propio texto —los centavos de `Dinero` van al 80 %—
 * se mezcla con ese fondo. WCAG 1.4.3: 4.5:1, o 3:1 para texto grande. Lo deshabilitado
 * no cuenta, que es lo que dice la norma.
 *
 * Donde hay una imagen de fondo no se puede calcular y no se acusa: un falso positivo
 * enseña a ignorar la puerta.
 */
export function textosIlegibles(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type Rgba = readonly [number, number, number, number];
    /**
     * Cualquier color de CSS a sRGB, pintándolo en un píxel. Tailwind 4 escribe
     * `bg-peligro/15` como `color-mix(in oklab, …)` y el navegador lo devuelve como
     * `oklab(…)`: leer sólo `rgb()` trataba esos fondos teñidos como transparentes.
     */
    const lienzo = document.createElement('canvas');
    lienzo.width = 1;
    lienzo.height = 1;
    const pincel = lienzo.getContext('2d', { willReadFrequently: true });
    const CENTINELA = 'rgba(1, 2, 3, 0.5)';
    const leer = (color: string): Rgba | null => {
      if (pincel === null) return null;
      pincel.fillStyle = CENTINELA;
      pincel.fillStyle = color;
      if (pincel.fillStyle === CENTINELA) return null;
      pincel.clearRect(0, 0, 1, 1);
      pincel.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 0] = pincel.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const sobre = (arriba: Rgba, abajo: Rgba): Rgba => {
      const a = arriba[3];
      return [
        arriba[0] * a + abajo[0] * (1 - a),
        arriba[1] * a + abajo[1] * (1 - a),
        arriba[2] * a + abajo[2] * (1 - a),
        1,
      ];
    };
    const canal = (v: number): number => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luz = (c: Rgba): number =>
      0.2126 * canal(c[0]) + 0.7152 * canal(c[1]) + 0.0722 * canal(c[2]);

    const fondoDe = (elemento: Element): Rgba | null => {
      const capas: Rgba[] = [];
      for (let n: Element | null = elemento; n !== null; n = n.parentElement) {
        const estilo = getComputedStyle(n);
        if (estilo.backgroundImage !== 'none') return null;
        const color = leer(estilo.backgroundColor);
        if (color !== null && color[3] > 0) {
          capas.push(color);
          if (color[3] >= 1) break;
        }
      }
      return capas.reduceRight<Rgba>((abajo, capa) => sobre(capa, abajo), [255, 255, 255, 1]);
    };

    const hallazgos: string[] = [];
    const vistos = new Set<string>();
    const candidatos = document.querySelectorAll('table *, [data-dinero], [data-dinero] *');
    for (const elemento of candidatos) {
      const propio = [...elemento.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (propio === '') continue;
      const caja = elemento.getBoundingClientRect();
      if (caja.width === 0 || caja.height === 0) continue;
      if (elemento.closest('[disabled], [aria-disabled="true"]') !== null) continue;
      const estilo = getComputedStyle(elemento);
      if (estilo.visibility === 'hidden') continue;
      let opacidad = 1;
      for (let n: Element | null = elemento; n !== null; n = n.parentElement) {
        opacidad *= Number(getComputedStyle(n).opacity);
      }
      const fondo = fondoDe(elemento);
      const texto = leer(estilo.color);
      if (fondo === null || texto === null) continue;
      const visto = sobre([texto[0], texto[1], texto[2], texto[3] * opacidad], fondo);
      const [clara, oscura] = [luz(visto), luz(fondo)].sort((a, b) => b - a);
      const razon = ((clara ?? 0) + 0.05) / ((oscura ?? 0) + 0.05);
      const tamano = Number.parseFloat(estilo.fontSize);
      const grande = tamano >= 24 || (tamano >= 18.66 && Number(estilo.fontWeight) >= 700);
      const minimo = grande ? 3 : 4.5;
      if (razon >= minimo) continue;
      const clave = `${propio.slice(0, 24)}|${razon.toFixed(2)}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      // DÓNDE: «"0" 3.41:1» no dice en qué columna está, y en una tabla de nueve columnas
      // numéricas eso es la mitad del trabajo. Se nombra la cabecera de su columna.
      const celda = elemento.closest('td, th');
      const fila = celda?.parentElement ?? null;
      const cabecera =
        celda === null || fila === null
          ? null
          : (celda
              .closest('table')
              ?.querySelector('thead tr')
              ?.children[[...fila.children].indexOf(celda)]?.textContent?.trim() ?? null);
      const donde = cabecera === null || cabecera === '' ? '' : ` en «${cabecera.slice(0, 24)}»`;
      hallazgos.push(
        `«${propio.slice(0, 24)}»${donde} ${razon.toFixed(2)}:1, mínimo ${String(minimo)}:1`,
      );
    }
    return hallazgos.slice(0, 12);
  });
}
