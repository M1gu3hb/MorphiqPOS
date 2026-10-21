import type { Locator, Page } from '@playwright/test';

/**
 * EL CONTRASTE REAL DE UNA ETIQUETA, medido sobre lo que el navegador pinta.
 *
 * ── Por qué no se calcula desde el CSS ────────────────────────────────────────────────
 * Las mesas se pintan sobre un DEGRADADO (`linear-gradient(135deg, fill, shade(fill, -8))`)
 * con un reflejo (`linear-gradient(to bottom, rgba(255,255,255,.35), transparent)`) que el orden
 * de sus capas deja DEBAJO del degradado opaco —no se ve, pero está en el CSS—, y en el teléfono
 * la etiqueta va en una pastilla de `rgba(255,255,255,.55)` sobre ese mismo degradado.
 * `textosIlegibles` (`estilos-del-rastreo.ts`) NO acusa donde hay imagen de fondo,
 * a propósito —«un falso positivo enseña a ignorar la puerta»—, y por eso estas etiquetas
 * quedaban fuera de toda puerta de contraste.
 *
 * Aquí no se adivina el fondo: se le PREGUNTA al navegador. Se retrata el renglón del texto
 * con el texto invisible (`color: transparent`), de modo que cada píxel de la imagen es el
 * fondo REAL debajo de una letra —degradado, reflejo, pastilla y sombra incluidos—, y se
 * calcula la razón de contraste de WCAG 1.4.3 contra el color real del texto en CADA píxel.
 * Se devuelve la PEOR: el color del degradado más desfavorable bajo el texto.
 *
 * Una etiqueta de 9 px no es «texto grande» (WCAG: 24 px, o 18.66 px en negrita): exige 4.5:1.
 */

export interface Medida {
  /** Lo que dice la etiqueta, tal cual la lee una persona. */
  readonly texto: string;
  /** ¿Se ve? Caja con tamaño, sin `visibility:hidden`, sin opacidad cero. */
  readonly visible: boolean;
  /** Qué hay ENCIMA del texto (otro elemento) o `null` si nada lo tapa. */
  readonly cubiertaPor: string | null;
  /** ¿La recorta un `overflow` de algún ancestro? */
  readonly recortada: boolean;
  /**
   * La peor razón de contraste bajo el texto, y la mejor. `NaN` cuando no hay nada que medir:
   * no se ve, queda fuera de la pantalla o LA TAPA otro elemento (`cubiertaPor`) —la captura
   * sería la del que tapa, y un número que mide otra cosa es peor que ninguno—.
   */
  readonly razon: number;
  readonly razonMejor: number;
  /** Colores en hexadecimal: el del texto, el fondo con la peor razón y los dos extremos. */
  readonly textoHex: string;
  readonly peorFondoHex: string;
  readonly fondoMasClaroHex: string;
  readonly fondoMasOscuroHex: string;
  readonly tamanoPx: number;
  readonly peso: number;
  /** 3 si el texto es grande, 4.5 si no (WCAG 1.4.3). */
  readonly minimo: number;
  /** Cada renglón del texto, en px de la ventana: un texto largo se parte en varios. */
  readonly renglones: readonly Caja[];
}

export interface Caja {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

interface Lectura {
  readonly texto: string;
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
  readonly rgba: readonly [number, number, number, number];
  readonly tamanoPx: number;
  readonly peso: number;
  readonly visible: boolean;
  readonly cubiertaPor: string | null;
  readonly recortada: boolean;
  readonly renglones: readonly Caja[];
  /**
   * Dónde está la ventana que se ve (el «visor visual») respecto de la que mide el CSS.
   *
   * En un teléfono, una página más ancha que la pantalla NO se encoge: el visor de 412 px se
   * pasea por una capa de 445. `getBoundingClientRect()` mide en la capa; la captura, en el
   * visor. Con el visor desplazado (33, 66), recortar con las medidas de la capa captura OTRA
   * parte de la página: la medida de contraste salía de un píxel que no era el del texto.
   */
  readonly visor: { readonly x: number; readonly y: number; readonly escala: number };
}

/** Corre en el navegador: dónde está el texto, de qué color es y si algo lo tapa. */
function leerEtiqueta(raiz: Element, esperada: string): Lectura {
  const lienzo = document.createElement('canvas');
  lienzo.width = 1;
  lienzo.height = 1;
  const pincel = lienzo.getContext('2d', { willReadFrequently: true });
  const CENTINELA = 'rgba(1, 2, 3, 0.5)';
  /** Cualquier color de CSS (`oklab()`, `color-mix()`…) a sRGB, pintándolo en un píxel. */
  const leer = (color: string): [number, number, number, number] => {
    if (pincel === null) return [0, 0, 0, 1];
    pincel.fillStyle = CENTINELA;
    pincel.fillStyle = color;
    if (pincel.fillStyle === CENTINELA) return [0, 0, 0, 1];
    pincel.clearRect(0, 0, 1, 1);
    pincel.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = pincel.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };

  // El nodo de TEXTO que lleva la etiqueta: en la leyenda del mapa nuevo el texto va suelto
  // dentro del `<li>`, junto a su muestra y su conteo, y medir el `<li>` entero mediría el número.
  const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  let primero: Text | null = null;
  let coincidente: Text | null = null;
  for (let n = recorrido.nextNode(); n !== null; n = recorrido.nextNode()) {
    if ((n.nodeValue ?? '').trim() === '') continue;
    primero ??= n as Text;
    if ((n.nodeValue ?? '').includes(esperada)) {
      coincidente = n as Text;
      break;
    }
  }
  const nodo = coincidente ?? primero;
  const dueno = nodo?.parentElement ?? (raiz as HTMLElement);
  const rango = document.createRange();
  rango.selectNodeContents(nodo ?? raiz);
  const cajas = [...rango.getClientRects()].filter((c) => c.width > 0 && c.height > 0);
  const izquierda = Math.min(...cajas.map((c) => c.left));
  const arriba = Math.min(...cajas.map((c) => c.top));
  const derecha = Math.max(...cajas.map((c) => c.right));
  const abajo = Math.max(...cajas.map((c) => c.bottom));

  const estilo = getComputedStyle(dueno);
  let opacidad = 1;
  for (let n: Element | null = dueno; n !== null; n = n.parentElement) {
    opacidad *= Number(getComputedStyle(n).opacity);
  }
  const [r, g, b, a] = leer(estilo.color);

  const visible =
    cajas.length > 0 &&
    estilo.visibility === 'visible' &&
    estilo.display !== 'none' &&
    opacidad > 0 &&
    derecha - izquierda > 0 &&
    abajo - arriba > 0;

  // ¿Qué hay encima del texto? Si no es la propia etiqueta, la tapan (o la recorta un `overflow`,
  // que devuelve el contenedor). Se pregunta en el CENTRO y, para la que sólo está tapada a medias
  // —el botón flotante del teléfono muerde una esquina de la leyenda—, en las cuatro esquinas de
  // cada renglón (a 2 px del borde); en las esquinas un ancestro no cuenta como tapa: es el
  // redondeo de la caja del renglón.
  const describir = (el: Element): string => {
    const clase = typeof el.className === 'string' ? el.className.split(' ')[0] : '';
    return `${el.tagName.toLowerCase()}${clase === '' ? '' : `.${String(clase)}`}`;
  };
  let cubiertaPor: string | null = null;
  if (visible) {
    const centro = document.elementFromPoint((izquierda + derecha) / 2, (arriba + abajo) / 2);
    if (centro !== null && centro !== dueno && !dueno.contains(centro)) {
      cubiertaPor = describir(centro);
    }
    for (const c of cajas) {
      if (cubiertaPor !== null) break;
      const m = Math.min(2, c.width / 4, c.height / 4);
      for (const [px, py] of [
        [c.left + m, c.top + m],
        [c.right - m, c.top + m],
        [c.left + m, c.bottom - m],
        [c.right - m, c.bottom - m],
      ] as const) {
        const arribaDe = document.elementFromPoint(px, py);
        if (
          arribaDe !== null &&
          arribaDe !== dueno &&
          !dueno.contains(arribaDe) &&
          !arribaDe.contains(dueno)
        ) {
          cubiertaPor = describir(arribaDe);
          break;
        }
      }
    }
  }

  // ¿Se sale de la caja de algún ancestro que recorta?
  let recortada = false;
  for (let n: Element | null = dueno.parentElement; n !== null; n = n.parentElement) {
    const e = getComputedStyle(n);
    if (e.overflowX === 'visible' && e.overflowY === 'visible') continue;
    const c = n.getBoundingClientRect();
    if (
      izquierda < c.left - 1 ||
      derecha > c.right + 1 ||
      arriba < c.top - 1 ||
      abajo > c.bottom + 1
    ) {
      recortada = true;
      break;
    }
  }

  return {
    // Lo que DICE la etiqueta: su nodo de texto, no todo lo que haya dentro de su elemento (en la
    // leyenda del mapa nuevo el renglón lleva además el conteo).
    texto: (nodo?.nodeValue ?? (raiz as HTMLElement).innerText).replace(/\s+/g, ' ').trim(),
    x: izquierda,
    y: arriba,
    ancho: derecha - izquierda,
    alto: abajo - arriba,
    rgba: [r, g, b, a * opacidad],
    tamanoPx: Number.parseFloat(estilo.fontSize),
    peso: Number(estilo.fontWeight),
    visible,
    cubiertaPor,
    recortada,
    renglones: cajas.map((c) => ({ x: c.left, y: c.top, ancho: c.width, alto: c.height })),
    visor: {
      x: window.visualViewport?.offsetLeft ?? 0,
      y: window.visualViewport?.offsetTop ?? 0,
      escala: window.visualViewport?.scale ?? 1,
    },
  };
}

interface Muestreo {
  readonly peor: number;
  readonly mejor: number;
  readonly peorFondo: readonly [number, number, number];
  readonly masClaro: readonly [number, number, number];
  readonly masOscuro: readonly [number, number, number];
}

/** Corre en el navegador: la razón de contraste en cada píxel de la imagen, contra el texto. */
async function muestrearFondo(entrada: {
  readonly b64: string;
  readonly rgba: readonly [number, number, number, number];
}): Promise<Muestreo> {
  const imagen = new Image();
  imagen.src = `data:image/png;base64,${entrada.b64}`;
  await imagen.decode();
  const lienzo = document.createElement('canvas');
  lienzo.width = imagen.naturalWidth;
  lienzo.height = imagen.naturalHeight;
  const pincel = lienzo.getContext('2d', { willReadFrequently: true });
  if (pincel === null) throw new Error('El navegador no dio un lienzo 2D.');
  pincel.drawImage(imagen, 0, 0);
  const { data } = pincel.getImageData(0, 0, lienzo.width, lienzo.height);

  const canal = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luz = (r: number, g: number, b: number): number =>
    0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);

  const [tr, tg, tb, ta] = entrada.rgba;
  let peor = Number.POSITIVE_INFINITY;
  let mejor = 0;
  let peorFondo: [number, number, number] = [0, 0, 0];
  let masClaro: [number, number, number] = [0, 0, 0];
  let masOscuro: [number, number, number] = [255, 255, 255];
  let luzClaro = -1;
  let luzOscuro = 2;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const fr = data[i] ?? 0;
    const fg = data[i + 1] ?? 0;
    const fb = data[i + 2] ?? 0;
    const lf = luz(fr, fg, fb);
    // El texto, con su propia transparencia, compuesto sobre ESTE píxel.
    const lt = luz(tr * ta + fr * (1 - ta), tg * ta + fg * (1 - ta), tb * ta + fb * (1 - ta));
    const razon = (Math.max(lf, lt) + 0.05) / (Math.min(lf, lt) + 0.05);
    if (razon < peor) {
      peor = razon;
      peorFondo = [fr, fg, fb];
    }
    if (razon > mejor) mejor = razon;
    if (lf > luzClaro) {
      luzClaro = lf;
      masClaro = [fr, fg, fb];
    }
    if (lf < luzOscuro) {
      luzOscuro = lf;
      masOscuro = [fr, fg, fb];
    }
  }
  return { peor, mejor, peorFondo, masClaro, masOscuro };
}

/** Sólo el fondo: el texto, y cualquier sombra de texto, desaparecen de la imagen. */
const SIN_TEXTO =
  '* { color: transparent !important; text-shadow: none !important; ' +
  '-webkit-text-fill-color: transparent !important; caret-color: transparent !important; }';

const hex = (c: readonly [number, number, number]): string =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/**
 * Mide una etiqueta. Devuelve `null` si el localizador no encuentra nada.
 *
 * `esperada` sólo sirve para elegir, dentro del elemento, el nodo de texto que la lleva.
 */
export async function medirEtiqueta(
  page: Page,
  etiqueta: Locator,
  esperada: string,
): Promise<Medida | null> {
  if ((await etiqueta.count()) === 0) return null;
  const elemento = etiqueta.first();
  // Al CENTRO de la ventana, no al borde: `scrollIntoViewIfNeeded` deja el elemento pegado al
  // borde y, en el teléfono, justo debajo de la barra fija de abajo, que lo tapa. Quien lee el
  // mapa desliza hasta verlo entero; la prueba también.
  await elemento.evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  });
  // Sin el puntero encima de nada: `hover:scale-105` mueve la tesela y la medida saldría torcida.
  await page.mouse.move(0, 0);
  const lectura = await elemento.evaluate(leerEtiqueta, esperada);

  // El recorte de la captura va en coordenadas del VISOR (lo que se ve), no de la capa donde mide
  // el CSS. Si la página es más ancha que la pantalla, un teléfono NO la encoge: el visor de
  // 412 × 839 se pasea por una capa de 445 × 905 y `scrollIntoView` lo desplaza (33, 66). Restar
  // ese desplazamiento es lo que hace que la captura sea la del texto; la compensación por
  // `innerWidth` que había antes capturaba otro rincón de la página (calibrado con un marcador
  // magenta puesto sobre la etiqueta: 96 % de acierto con el visor, 0 % con la compensación).
  if (Math.abs(lectura.visor.escala - 1) > 0.001) {
    throw new Error(
      `El visor está con zoom ×${String(lectura.visor.escala)}: la ayuda de contraste sólo está ` +
        'calibrada con la página a su tamaño y no mide en vez de medir mal.',
    );
  }
  const tamano = page.viewportSize();
  const x = Math.max(0, lectura.x - lectura.visor.x);
  const y = Math.max(0, lectura.y - lectura.visor.y);
  const derecha = Math.min(
    tamano?.width ?? Number.POSITIVE_INFINITY,
    lectura.x + lectura.ancho - lectura.visor.x,
  );
  const abajo = Math.min(
    tamano?.height ?? Number.POSITIVE_INFINITY,
    lectura.y + lectura.alto - lectura.visor.y,
  );
  const grande = lectura.tamanoPx >= 24 || (lectura.tamanoPx >= 18.66 && lectura.peso >= 700);
  const base = {
    texto: lectura.texto,
    visible: lectura.visible,
    cubiertaPor: lectura.cubiertaPor,
    recortada: lectura.recortada,
    tamanoPx: lectura.tamanoPx,
    peso: lectura.peso,
    minimo: grande ? 3 : 4.5,
    renglones: lectura.renglones,
  };
  // Sin razón cuando no se ve o cuando OTRO elemento la tapa: la captura sería la del que tapa, y
  // un número que mide otra cosa es peor que ninguno. Que la tapen ya es un hallazgo por sí mismo.
  const fueraDeLaPantalla = derecha - x < 1 || abajo - y < 1;
  if (!lectura.visible || fueraDeLaPantalla || lectura.cubiertaPor !== null) {
    return {
      ...base,
      visible: lectura.visible && !fueraDeLaPantalla,
      razon: Number.NaN,
      razonMejor: Number.NaN,
      textoHex: hex([lectura.rgba[0], lectura.rgba[1], lectura.rgba[2]]),
      peorFondoHex: '',
      fondoMasClaroHex: '',
      fondoMasOscuroHex: '',
    };
  }

  const png = await page.screenshot({
    clip: { x, y, width: derecha - x, height: abajo - y },
    animations: 'disabled',
    caret: 'hide',
    style: SIN_TEXTO,
  });
  const muestra = await page.evaluate(muestrearFondo, {
    b64: png.toString('base64'),
    rgba: lectura.rgba,
  });
  return {
    ...base,
    razon: muestra.peor,
    razonMejor: muestra.mejor,
    textoHex: hex([lectura.rgba[0], lectura.rgba[1], lectura.rgba[2]]),
    peorFondoHex: hex(muestra.peorFondo),
    fondoMasClaroHex: hex(muestra.masClaro),
    fondoMasOscuroHex: hex(muestra.masOscuro),
  };
}

/**
 * Corre en el navegador: ¿algún renglón del texto invade el BORDE de la tesela o se sale de ella?
 * Se mide contra el borde interior: un texto que pisa el trazo de la mesa ya no está sobre el
 * relleno que se creía.
 */
function salidaDeLaTesela(
  tesela: Element,
  renglones: readonly { x: number; y: number; ancho: number; alto: number }[],
): string | null {
  const c = tesela.getBoundingClientRect();
  const estilo = getComputedStyle(tesela);
  const redonda = estilo.borderTopLeftRadius.includes('%');
  const borde = Number.parseFloat(estilo.borderTopWidth) || 0;
  const cx = c.left + c.width / 2;
  const cy = c.top + c.height / 2;
  // Tres cuartos de píxel de tolerancia: el antialiasing del trazo.
  const tolerancia = 0.75;
  let peor = 0;
  for (const r of renglones) {
    for (const [px, py] of [
      [r.x, r.y],
      [r.x + r.ancho, r.y],
      [r.x, r.y + r.alto],
      [r.x + r.ancho, r.y + r.alto],
    ] as const) {
      let fuera: number;
      if (redonda) {
        // Cuánto pasa de la elipse INTERIOR de la mesa (la caja menos su borde), en px.
        const rx = c.width / 2;
        const ry = c.height / 2;
        const d = Math.hypot((px - cx) / rx, (py - cy) / ry);
        fuera = (d - 1) * Math.min(rx, ry) + borde;
      } else {
        fuera = Math.max(
          c.left + borde - px,
          px - (c.right - borde),
          c.top + borde - py,
          py - (c.bottom - borde),
        );
      }
      peor = Math.max(peor, fuera);
    }
  }
  return peor > tolerancia
    ? `el texto invade ${peor.toFixed(1)} px del borde de ${redonda ? 'la mesa redonda' : 'la tesela'} o se sale de ella`
    : null;
}

/**
 * ¿La etiqueta cabe en su tesela? Devuelve lo que sobra, o `null`. Un texto que se sale de su mesa
 * queda sobre el borde, la sombra o el piso del salón, y ahí ya no es el contraste que se creía.
 */
export async function seSaleDeLaTesela(tesela: Locator, medida: Medida): Promise<string | null> {
  if (!medida.visible) return null;
  return tesela.first().evaluate(salidaDeLaTesela, medida.renglones);
}

/** Lo que una tesela tiene además de su color: borde, iconos, patrón. */
export interface Senales {
  /** `solid`, `dashed`…, y su grosor en px. */
  readonly bordeEstilo: string;
  readonly bordeAncho: number;
  /** Íconos (`svg`) o imágenes dentro de la tesela. */
  readonly iconos: number;
  /** ¿Una imagen de fondo que no es un degradado? */
  readonly patron: boolean;
}

/** Corre en el navegador. */
function leerSenales(tesela: Element): Senales {
  const estilo = getComputedStyle(tesela);
  const fondo = estilo.backgroundImage;
  return {
    bordeEstilo: estilo.borderTopStyle,
    bordeAncho: Number.parseFloat(estilo.borderTopWidth),
    iconos: tesela.querySelectorAll('svg, img').length,
    patron: /url\(|repeating-/.test(fondo),
  };
}

export async function leerLasSenales(tesela: Locator): Promise<Senales> {
  return tesela.first().evaluate(leerSenales);
}
