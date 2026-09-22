import { expect, test } from '@playwright/test';

/**
 * LOS OCHO ESTILOS, EN UN NAVEGADOR DE VERDAD.
 *
 * ── Qué prueba esto que la auditoría de tokens no puede ───────────────────
 * `verify:estilos` calcula el contraste de cada par del contrato leyendo el CSS. Eso
 * es exacto y es barato, y hay tres cosas que NO puede ver porque no hay navegador:
 *
 *   1 · que los tokens de ese estilo **lleguen** al elemento. Un selector mal escrito,
 *       un `@import` que falta o una clase que gana por especificidad dejan la paleta
 *       perfecta y sin aplicar — que es exactamente el fallo que abrió esta etapa: la
 *       hoja del sistema existía, tenía contrato y auditoría, y no la importaba nadie;
 *   2 · que se pueda **tocar**. Una casilla de 16 px en una tabla densa no se acierta
 *       con el pulgar por muy bien calculado que esté su contraste;
 *   3 · que el **foco se vea**. La caja se opera con teclado diez horas al día.
 *
 * ── La regla de tamaño, que es la de WCAG 2.5.8 con el número del sistema ──
 * No es «todo mide 44». Es TAMAÑO **O** DISTANCIA: un control pasa si su lado corto
 * llega a `--area-tactil-minima` —el token que la densidad fija: 56 con guantes, 48
 * cómoda, 44 normal, 24 compacta, que es de ratón—, o si está lo bastante separado
 * como para que un objetivo de ese tamaño centrado en él no toque el de ningún otro.
 *
 * Se mide contra el token y no contra un número escrito aquí a propósito: así la
 * prueba no puede opinar distinto que el sistema. Si mañana alguien baja
 * `--area-tactil-minima`, lo baja a la vista de todos en `base.css` y no escondido en
 * una constante de una prueba.
 *
 * Y la alternativa —un `::after` invisible más grande que el control— se descartó con
 * una razón: en una lista con `gap-px` el recuadro de una fila se monta sobre la de
 * arriba y se come sus clics. El botón muerto que se quería evitar, causado por el
 * remedio.
 *
 * ── Por qué contra `/sistema` y no contra las 69 pantallas ────────────────
 * 69 × 8 son 552 recorridos, que en CI son horas. `/sistema` es la página viva del
 * lenguaje: tiene una de cada pieza —superficies, los seis botones, la tabla densa,
 * el dinero, las cinco gráficas, los avisos, el diálogo destructivo—, así que un
 * estilo que rompa una la rompe aquí. Lo que esto NO cubre son las composiciones
 * propias de cada pantalla, y queda dicho en vez de supuesto.
 */

const ESTILOS = [
  'morphiq',
  'cristal',
  'relieve',
  'taller',
  'bloque',
  'terminal',
  'papel',
  'noche',
] as const;

/**
 * Qué cuenta como control que hay que poder tocar.
 *
 * Acotado a `main`: la barra de arriba de esta página —el selector de estilo y las
 * cuatro perillas— es el andamio de la propia página de documentación, no una
 * pantalla de trabajo. Y los enlaces dentro de un párrafo son texto, no objetivos.
 */
const SELECCION_DE_CONTROLES = [
  'main button:not([disabled])',
  'main select',
  'main input:not([type="hidden"])',
  'main textarea',
  'main [role="button"]',
  'main [role="switch"]',
  'main [role="checkbox"]',
].join(', ');

interface ControlApretado {
  readonly rotulo: string;
  readonly ancho: number;
  readonly alto: number;
  readonly vecino: number;
}

interface ControlTapado {
  readonly rotulo: string;
  readonly lotapa: string;
}

test.describe('los ocho estilos, en el navegador', () => {
  for (const estilo of ESTILOS) {
    test(`${estilo}: sus tokens llegan, se puede tocar y el foco se ve`, async ({ page }) => {
      const enLaConsola: string[] = [];
      page.on('pageerror', (fallo) => enLaConsola.push(fallo.message));

      await page.goto('/sistema', { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'El sistema, en vivo' }).waitFor();

      // Se cambia por el SELECTOR de la página, no escribiendo el atributo a mano: así
      // se prueba de paso el camino por el que Miguel lo cambia delante de alguien.
      await page.getByLabel('Estilo').selectOption(estilo);
      await page.waitForFunction(
        (clave) => document.documentElement.getAttribute('data-estilo') === clave,
        estilo,
      );

      // ── 0 · LOS IMPORTES SE LEEN ENTEROS ───────────────────────────────
      // `<Dinero>` enseñó $42.00 por $42.90: partido en bloques, lo que se LEÍA eran
      // tres renglones. `innerText` es lo único que ve eso —el `textContent` estaba
      // bien—, y sólo un navegador lo calcula. Cada importe de `/sistema`, en cada
      // estilo: sin saltos, y con las mismas cifras que oye un lector de pantalla.
      const importes = await page.locator('[data-dinero]').evaluateAll((nodos) =>
        nodos.map((nodo) => ({
          leido: (nodo as HTMLElement).innerText,
          oido: nodo.getAttribute('aria-label') ?? '',
        })),
      );
      expect(
        importes.length,
        'En /sistema no hay ni un <Dinero>: la prueba no mide nada',
      ).toBeGreaterThan(0);
      for (const { leido, oido } of importes) {
        expect(leido, `En ${estilo} un importe se lee partido: «${leido}»`).toMatch(
          /^\(?\$?[\d,]+\.\d{2}\)?$/,
        );
        expect(leido.replace(/\D/g, ''), `En ${estilo} «${leido}» no es «${oido}»`).toBe(
          oido.replace(/\D/g, ''),
        );
      }

      // ── 1 · LOS TOKENS LLEGAN ──────────────────────────────────────────
      const tokens = await page.evaluate(() => {
        const raiz = getComputedStyle(document.documentElement);
        const leer = (nombre: string) => raiz.getPropertyValue(nombre).trim();
        return {
          fondo: leer('--fondo'),
          texto: leer('--texto'),
          primario: leer('--primario'),
          sombra1: leer('--sombra-1'),
          alturaControl: leer('--altura-control'),
          areaTactil: leer('--area-tactil-minima'),
          densidad: document.documentElement.getAttribute('data-densidad') ?? '',
          fondoPintado: getComputedStyle(document.body).backgroundColor,
        };
      });

      for (const [nombre, valor] of Object.entries(tokens)) {
        expect(
          valor,
          `En ${estilo}, «${nombre}» llegó vacío: la paleta puede estar perfecta y no ` +
            'aplicarse. Revisa el selector de su hoja y que `estilos/index.css` la importe.',
        ).not.toBe('');
      }
      expect(
        tokens.fondoPintado,
        `En ${estilo} el cuerpo no tiene color de fondo calculado.`,
      ).toMatch(/rgb/);

      // ── 2 · SE PUEDE TOCAR ─────────────────────────────────────────────
      /**
       * Dos preguntas distintas, una sola pasada por la página.
       *
       *   2a · ¿TAPA ALGO A ALGUIEN? «Un estilo que esconde un botón detrás de otro es
       *        un botón muerto.» Esto no lo ve una medida de distancias: dos controles
       *        pueden estar lejos por sus centros y uno cubrir al otro —una isla ancha,
       *        una sombra dura desplazada, un envoltorio invisible que se olvidó de
       *        renunciar a los clics—. Se le pregunta al navegador qué hay ENCIMA del
       *        centro de cada control, que es lo único que sabe la verdad. Es la técnica
       *        del rastreador de la 2.3, y por su misma razón: allí acusar sin verificar
       *        costó 66 falsos positivos.
       *
       *   2b · ¿SE ACIERTA? Tamaño O distancia, la regla de WCAG 2.5.8 con el número
       *        del sistema: `--area-tactil-minima`.
       *
       * ── LA CAPA, que es lo que evita medir un desplazamiento en vez de un defecto ──
       * El abanico inferior y la isla son `fixed`: cubren lo que en cada momento les
       * toque. Comparar un control del flujo contra ellos da un veredicto que depende
       * de DÓNDE ESTÁ EL SCROLL —y de cuánto ocupa el texto de cada estilo—, así que un
       * botón sale «apretado» en papel y suelto en morphiq por el interlineado. Eso no
       * es un defecto: es un desplazamiento.
       *
       * Así que se compara anclado con anclado y flujo con flujo. Dos barras fijas SÍ se
       * comparan entre ellas aunque sean dos barras distintas: las dos están siempre
       * donde están. Lo que queda FUERA, y queda dicho: que una pantalla reserve hueco
       * al final para su barra fija. Eso es de cada pantalla, no del estilo.
       *
       * Y `sticky` cuenta como FLUJO, no como anclado. Eso se aprendió aquí: metiéndolo
       * con los fijos, la cabecera pegajosa de la tabla salía «tapada por el abanico» en
       * cuatro estilos, porque en algún punto del scroll pasa por debajo de él. Una
       * pegajosa viaja con su contenido y sólo se fija DENTRO de su caja; una fija vive
       * en la ventana. Son dos cosas y medirlas como una daba cuatro acusaciones falsas.
       *
       * ── Y SE RECORRE LA PÁGINA ENTERA ─────────────────────────────────────────
       * `elementFromPoint` sólo contesta dentro de la ventana, y `/sistema` mide tres
       * pantallas de alto. Sin barrer el scroll, la pregunta sólo se le haría al primer
       * tercio — y el tercio que no se mira es donde vive el defecto que nadie ha visto.
       */
      const { tapados, apretados } = await page.evaluate((selector) => {
        // El token puede venir en rem o en px; se resuelve MIDIÉNDOLO en un elemento de
        // verdad, en vez de suponer que 1 rem son 16 px. Con el zoom del navegador o una
        // raíz con otro tamaño de letra, suponerlo daría un mínimo equivocado.
        const regla = document.createElement('div');
        regla.style.cssText =
          'position:absolute;visibility:hidden;height:var(--area-tactil-minima)';
        document.body.append(regla);
        const minimo = regla.getBoundingClientRect().height;
        regla.remove();

        const vaAnclado = (nodo: Element): boolean => {
          let actual: Element | null = nodo;
          while (actual !== null) {
            if (getComputedStyle(actual).position === 'fixed') return true;
            actual = actual.parentElement;
          }
          return false;
        };

        const nombrar = (nodo: Element): string => {
          const html = nodo as HTMLElement;
          const propio = (html.innerText ?? '').replace(/\s+/g, ' ').trim();
          if (propio !== '') return propio.slice(0, 30);
          const etiqueta = html.getAttribute('aria-label');
          if (etiqueta !== null && etiqueta !== '') return etiqueta.slice(0, 30);
          const clase = typeof html.className === 'string' ? html.className.split(' ')[0] : '';
          return `${html.tagName.toLowerCase()}${clase === undefined || clase === '' ? '' : `.${clase}`}`;
        };

        const centro = (caja: DOMRect) => ({
          x: caja.left + caja.width / 2,
          y: caja.top + caja.height / 2,
        });

        const controles = [...document.querySelectorAll(selector)];
        const anclado = new Map(controles.map((nodo) => [nodo, vaAnclado(nodo)]));

        const tapados: ControlTapado[] = [];
        const apretados: ControlApretado[] = [];
        const yaVisto = new Set<Element>();
        const scrollPrevio = window.scrollY;

        const alto = window.innerHeight;
        const total = Math.max(document.documentElement.scrollHeight, alto);
        // Se solapan los tramos a medio alto: un control que cae partido justo en el
        // corte no se mediría bien en ninguno de los dos tramos.
        for (let y0 = 0; y0 < total; y0 += alto / 2) {
          window.scrollTo(0, y0);

          const cajas = controles
            .map((nodo) => ({ nodo, caja: nodo.getBoundingClientRect() }))
            .filter(({ caja }) => caja.width > 0 && caja.height > 0);

          for (const { nodo, caja } of cajas) {
            if (yaVisto.has(nodo)) continue;
            const mio = centro(caja);
            // Sólo lo que está DENTRO de la ventana en este tramo, y con holgura de un
            // píxel en los bordes: en el borde exacto `elementFromPoint` da null y eso
            // no es «tapado», es «todavía no se ve».
            if (mio.x < 1 || mio.y < 1 || mio.x > window.innerWidth - 1) continue;
            if (mio.y > window.innerHeight - 1) continue;
            yaVisto.add(nodo);

            // 2a · ¿hay algo encima?
            const arriba = document.elementFromPoint(mio.x, mio.y);
            if (
              arriba !== null &&
              !nodo.contains(arriba) &&
              !arriba.contains(nodo) &&
              vaAnclado(arriba) === anclado.get(nodo)
            ) {
              tapados.push({ rotulo: nombrar(nodo), lotapa: nombrar(arriba) });
            }

            // 2b · ¿es pequeño Y está apretado?
            // Media tolerancia de píxel: una caja de 43.999 por redondeo no es un defecto.
            if (Math.min(caja.width, caja.height) + 0.5 >= minimo) continue;
            let vecino = Number.POSITIVE_INFINITY;
            for (const otro of cajas) {
              if (otro.nodo === nodo) continue;
              if (anclado.get(otro.nodo) !== anclado.get(nodo)) continue;
              const suyo = centro(otro.caja);
              vecino = Math.min(vecino, Math.hypot(suyo.x - mio.x, suyo.y - mio.y));
            }
            if (vecino + 0.5 >= minimo) continue;
            apretados.push({
              rotulo: nombrar(nodo),
              ancho: Math.round(caja.width),
              alto: Math.round(caja.height),
              vecino: Math.round(vecino),
            });
          }
        }

        window.scrollTo(0, scrollPrevio);
        return { tapados, apretados };
      }, SELECCION_DE_CONTROLES);

      expect(
        tapados.map((c) => `«${c.rotulo}» lo tapa «${c.lotapa}»`),
        `En ${estilo} hay controles cubiertos por otra cosa de su misma capa. Un botón que ` +
          'no recibe el toque es un botón muerto, y desde fuera se ve igual que uno que sí.',
      ).toEqual([]);

      expect(
        apretados.map((c) => `«${c.rotulo}» ${c.ancho}×${c.alto} px, vecino a ${c.vecino} px`),
        `En ${estilo} (densidad ${tokens.densidad}, mínimo ${tokens.areaTactil}) hay controles ` +
          'pequeños Y apretados a la vez. No es una regla estética: es lo que se acierta al ' +
          'tocar con prisa. Agranda el control, o sepáralo.',
      ).toEqual([]);

      // ── 3 · EL FOCO SE VE ──────────────────────────────────────────────
      const primerBoton = page.locator('main button:not([disabled])').first();
      await primerBoton.focus();
      const anillo = await primerBoton.evaluate((elemento) => {
        const calculado = getComputedStyle(elemento);
        return {
          sombra: calculado.boxShadow,
          contorno: `${calculado.outlineStyle} ${calculado.outlineWidth}`,
        };
      });
      expect(
        anillo.sombra !== 'none' || !anillo.contorno.startsWith('none'),
        `En ${estilo} un botón enfocado no enseña ni anillo ni contorno. Un foco invisible es ` +
          'no tener teclado, y la caja se opera con teclado diez horas al día.',
      ).toBe(true);

      expect(enLaConsola, `En ${estilo} la página lanzó errores de JavaScript.`).toEqual([]);
    });
  }
});

/**
 * EL MOVIMIENTO SE PUEDE APAGAR, y la preferencia del sistema gana SIEMPRE.
 *
 * ── Por qué esto necesita un navegador ────────────────────────────────────
 * `base.css` tiene el bloque correcto y `sistema.test.ts` comprueba que existe. Y con
 * las dos cosas verdes el movimiento puede seguir encendido, porque lo que decide no
 * es que el bloque esté: es la ESPECIFICIDAD.
 *
 *     @media (prefers-reduced-motion: reduce) { :root { --duracion-normal: 0ms } }
 *     [data-estilo='terminal'] { --duracion-normal: 200ms }
 *
 * Las dos reglas apuntan al mismo `<html>` y las dos valen 0,1,0 —una consulta de
 * medios NO suma especificidad—, así que gana la que va DESPUÉS. Hoy gana la buena
 * porque el bloque está al final de `base.css` y las hojas de estilo no tocan las
 * duraciones. El día que una lo haga —y «TERMINAL no tiene movimiento» es lo más
 * natural que se puede escribir en `terminal.css`— la preferencia del sistema deja de
 * cumplirse, en silencio, y las dos puertas de arriba siguen en verde.
 *
 * Eso no es una hipótesis: es el mismo tipo de fallo con el que abrió esta etapa. Una
 * hoja perfecta que nadie aplica.
 *
 * Y el movimiento reducido no es una comodidad: para quien tiene un trastorno
 * vestibular, una interfaz que se desliza produce náusea de verdad.
 */
test.describe('el movimiento se puede apagar', () => {
  test.describe('con la preferencia del sistema en «reducir»', () => {
    test.use({ reducedMotion: 'reduce' });

    for (const estilo of ESTILOS) {
      test(`${estilo}: las tres duraciones quedan en cero`, async ({ page }) => {
        await page.goto('/sistema', { waitUntil: 'domcontentloaded' });
        await page.getByRole('heading', { name: 'El sistema, en vivo' }).waitFor();
        await page.getByLabel('Estilo').selectOption(estilo);
        await page.waitForFunction(
          (clave) => document.documentElement.getAttribute('data-estilo') === clave,
          estilo,
        );

        // Se sube la perilla al máximo A PROPÓSITO: si la preferencia del sistema sólo
        // ganara con la perilla baja, no estaría ganando.
        await page.getByLabel('movimiento').selectOption('expresiva');
        await page.waitForFunction(
          () => document.documentElement.getAttribute('data-movimiento') === 'expresiva',
        );

        const duraciones = await page.evaluate(() => {
          const raiz = getComputedStyle(document.documentElement);
          return (['rapida', 'normal', 'lenta'] as const).map((cual) => ({
            cual,
            valor: raiz.getPropertyValue(`--duracion-${cual}`).trim(),
          }));
        });

        const encendidas = duraciones.filter(({ valor }) => Number.parseFloat(valor) !== 0);
        expect(
          encendidas.map((d) => `--duracion-${d.cual} = ${d.valor}`),
          `En ${estilo}, con «reducir movimiento» puesto en el sistema y la perilla en ` +
            '«expresiva», quedan duraciones encendidas. La preferencia del sistema no es ' +
            'negociable ni por estilo ni por configuración del cliente: gana siempre. ' +
            'Comprueba que ninguna hoja de estilo redefina --duracion-* después de base.css.',
        ).toEqual([]);
      });
    }
  });

  /**
   * Y LA PERILLA TAMBIÉN TIENE QUE FUNCIONAR, sin la preferencia del sistema.
   *
   * Un token que siempre vale cero pasaría la prueba de arriba y sería una perilla
   * muerta. Aquí se comprueba que las cuatro posiciones se distinguen: `nula` en cero
   * y `expresiva` por encima de `normal`, que es lo que la hace expresiva.
   */
  test('las cuatro posiciones de la perilla dan cuatro movimientos distintos', async ({ page }) => {
    await page.goto('/sistema', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'El sistema, en vivo' }).waitFor();

    const medidas: Record<string, number> = {};
    for (const posicion of ['nula', 'sutil', 'normal', 'expresiva'] as const) {
      await page.getByLabel('movimiento').selectOption(posicion);
      await page.waitForFunction(
        (cual) => document.documentElement.getAttribute('data-movimiento') === cual,
        posicion,
      );
      medidas[posicion] = await page.evaluate(() =>
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--duracion-normal'),
        ),
      );
    }

    // Crecientes, no sólo distintas: una perilla cuyo «expresiva» anima menos que su
    // «sutil» tiene los nombres al revés, y eso no lo ve una comprobación de igualdad.
    expect(medidas['nula'], '«nula» tiene que ser cero: es para quien teclea.').toBe(0);
    expect(Number(medidas['sutil'])).toBeGreaterThan(0);
    expect(Number(medidas['normal'])).toBeGreaterThan(Number(medidas['sutil']));
    expect(Number(medidas['expresiva'])).toBeGreaterThan(Number(medidas['normal']));
  });
});
