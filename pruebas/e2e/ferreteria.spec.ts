import { expect, test } from '@playwright/test';

import {
  abrirPantalla,
  accionesDelTablero,
  cambiarDePlantilla,
  entrar,
  exigirDemostracion,
  exigirGiro,
  exigirVocabulario,
  menuLateral,
} from './ayudantes/sesion.ts';

/**
 * Modelo 4 de 5 · FERRETERÍA Y TLAPALERÍA · giro `ferreteria`, plantilla `tienda`.
 *
 * ── QUÉ DEMUESTRA ──────────────────────────────────────────────────────────
 * Que dos negocios con la MISMA plantilla leen sustantivos DISTINTOS. Ésta y
 * `abarrotes.spec.ts` ponen exactamente la misma plantilla —`tienda`— y esperan lo
 * contrario en la misma entrada del menú: allí «Productos», aquí «Materiales».
 * Leídas juntas, las dos son una sola afirmación: el vocabulario sale del GIRO.
 *
 * ── POR QUÉ ESO IMPORTA, y por qué es la prueba que más se habría echado en falta ──
 * Porque es un defecto que el propio modelo levantó contra sí mismo, con estas
 * palabras: *«artículo donde debe decir material, producto donde debe decir pieza»*.
 * Y porque es el caso que tumbó una decisión: D-04 decía «un diccionario declarado en
 * la plantilla», y al construirlo resultó falso —Abarrotes Don Chuy y Ferretería La
 * Broca comparten la plantilla `tienda` y no comparten vocabulario—. El diccionario se
 * teclea por giro por ESTE negocio. Si esta prueba pasara diciendo «Productos», la
 * corrección de D-04 estaría escrita en tres archivos de dominio y no habría llegado a
 * la pantalla, que es el sitio donde el dueño la juzga.
 *
 * Beto lo dijo antes que nosotros sobre el sistema que ya había probado: *«me hacía
 * capturar el tornillo como si fuera un refresco»*. Esta prueba es la que comprueba
 * que no se lo volvemos a hacer.
 *
 * ── LO QUE NO SE PUEDE MIRAR TODAVÍA ───────────────────────────────────────
 * «Mostradorista» —el `responsable` de este giro— no llega al menú: su entrada es
 * `/mesero`, que pertenece al bloque de sala, y la plantilla `tienda` no lo incluye.
 * Igual que en `abarrotes`, el sustantivo existe en el diccionario y no tiene lector.
 * Y la plantilla `ferreteria` propia todavía no existe: el `FILE-MAP.md` del modelo
 * dice «`tienda` **provisional** por D-01, hasta que exista `ferreteria` propia», así
 * que lo que se prueba aquí es la plantilla provisional, que es la que hay.
 */

/** Las doce pantallas del modelo, tal como existen en `app/(modelos)/ferreteria/`. */
const PANTALLAS = [
  'caja',
  'conteo',
  'corte-de-material',
  'cotizacion',
  'cuentas',
  'entradas',
  'existencias',
  'facturacion',
  'ficha-de-pieza',
  'material',
  'mostrador',
  'trabajos-de-mostrador',
] as const;

test.describe('ferretería · su vocabulario, sus pantallas y su dashboard', () => {
  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info);
  });

  test('la ferretería dice Materiales donde la tiendita dice Productos', async ({ page }) => {
    await entrar(page);
    await exigirGiro(page, 'ferreteria', 'ferreteria');
    // SU plantilla, que hasta el 17-09-2026 era la de la tiendita. Y el punto de la
    // prueba sigue siendo el mismo: el vocabulario NO sale de la plantilla, sale del
    // giro. `ferreteria` tiene ahora plantilla propia porque corta material, fía y
    // factura —tres cosas que una tiendita no hace—, y aunque compartieran plantilla
    // seguiría diciendo «Materiales».
    await cambiarDePlantilla(page, 'ferreteria');

    // ── 1 · SU VOCABULARIO ────────────────────────────────────────────────
    await abrirPantalla(page, '/');
    const menu = await menuLateral(page);

    await exigirVocabulario(menu, {
      // `producto` → «material/materiales». La entrada es la misma `/productos` que en
      // los otros cuatro modelos; lo único que cambia es cómo se llama.
      propios: [['producto', 'Materiales']],
      ajenos: [
        // «Productos» aquí no es un ajeno menor: es el defecto exacto que la carpeta
        // de este modelo levantó contra sí misma.
        'Productos',
        'Platillos',
        'Meseros',
        'Cocinas',
        'Baristas',
        'Barras',
        'Cajeros',
        'Responsables',
      ],
    });

    // Y que sea la entrada de catálogo, no otra cosa que se llame parecido: el `href`
    // lo confirma sin atarse a una clase de CSS.
    await expect(menu.getByRole('link', { name: 'Materiales', exact: true })).toHaveAttribute(
      'href',
      '/ferreteria/material',
    );

    // ── 2 · SUS PANTALLAS · la misma operación que su padre A1, sin sala ───
    // «Existencias» es la pantalla de inventario de ESTE modelo —con la gaveta y el
    // material dormido— y el menú ofrece una entrada por módulo, así que la heredada
    // `/inventario` le cede el sitio.
    for (const [etiqueta, ruta] of [
      ['Existencias', '/ferreteria/existencias'],
      ['Compras', '/compras'],
    ] as const) {
      await expect(
        menu.getByRole('link', { name: etiqueta, exact: true }),
        `Falta «${etiqueta}»: una ferretería sin inventario no puede contestar la pregunta ` +
          'que su corte tiene que contestar —«¿cuánto salió sin cobrarse hoy?»—.',
      ).toHaveAttribute('href', ruta);
    }

    for (const deSala of ['Mostradoristas', 'Cocina']) {
      await expect(
        menu.getByRole('link', { name: deSala, exact: true }),
        `El menú enseña «${deSala}» con la plantilla \`ferreteria\`. Una ferretería no ` +
          'tiene mesero ni cocina, y `MODULOS_POR_PLANTILLA.ferreteria` no incluye el bloque ' +
          'de sala; si aparece, `getCurrentPackage` está normalizando el nombre nuevo de la ' +
          'plantilla a `restaurante_pro`.',
      ).toHaveCount(0);
    }

    // ── 3 · SU DASHBOARD · mostrador, como su padre ──────────────────────
    await expect(page.getByRole('heading', { level: 1, name: 'Buen día' })).toBeVisible();
    const acciones = accionesDelTablero(page);
    await expect(acciones.getByRole('button', { name: 'Ir a Caja' })).toBeVisible();
    await expect(acciones.getByRole('button', { name: 'Nueva venta' })).toHaveCount(0);

    // ── 4 · LAS DOCE PANTALLAS DEL MODELO RESPONDEN ───────────────────────
    for (const pantalla of PANTALLAS) {
      await abrirPantalla(page, `/ferreteria/${pantalla}`);
    }

    // La de inicio NO es el total con el teclado: es el buscador con la venta
    // armándose al lado, porque aquí el cliente trae un tornillo en la mano y dice
    // «uno como éste». Su encabezado es para lector de pantalla —la pantalla la manda
    // la búsqueda, no un título— así que se comprueba que ESTÉ, no que se vea.
    await abrirPantalla(page, '/ferreteria/mostrador');
    await expect(page.getByRole('heading', { name: 'Mostrador', exact: true })).toBeAttached();
    // `complementary`, no `region`: la venta que se arma vive en un `aside`, y ése es
    // su rol implícito. Escrito como `region` la prueba no encontraba NADA, y el rastro
    // mandaba a mirar una pantalla que estaba bien.
    // Pero no siempre desplegada: `Mostrador.tsx` la deja `hidden xl:block` y por
    // debajo de 1280 px la pliega en una barra que la abre. Los dos proyectos de esta
    // suite caen a los dos lados de esa raya —Desktop Chrome arriba, la Galaxy Tab S4
    // en horizontal a 1138 px abajo—, así que exigir «desplegada» en los dos ponía en
    // rojo la tablet por un diseño que es correcto: en el pasillo, el mostradorista
    // necesita la pantalla entera para buscar.
    //
    // Y ojo con un detalle que costó una vuelta: con `display: none` el `aside` sale
    // del árbol de accesibilidad y deja de tener ROL, así que ni siquiera
    // `toBeAttached` lo encuentra por `getByRole`. Debajo de `xl` no se busca el
    // panel: se busca la barra, y se comprueba que ABRE, que es lo que de verdad
    // hace falta para cobrar desde una tablet.
    const laVenta = page.getByRole('complementary', { name: 'La venta' });
    const ancho = page.viewportSize()?.width ?? 0;

    if (ancho >= 1280) {
      await expect(laVenta).toBeVisible();
    } else {
      const barra = page.getByRole('button', { name: /partidas/ });
      await expect(barra).toBeVisible();
      await barra.click();
      await expect(laVenta).toBeVisible();
    }
  });
});
