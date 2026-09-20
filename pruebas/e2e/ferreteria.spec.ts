import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  abrirCajaPorLaRuta,
  abrirPantalla,
  type MarcaDePantalla,
  accionesDelTablero,
  cambiarDePlantilla,
  cerrarCajaYCuadrar,
  consultarPuente,
  entrar,
  exigirDemostracion,
  exigirGiro,
  exigirVentaCobrada,
  exigirVocabulario,
  menuLateral,
  soltarLaCaja,
  totalEnPantalla,
  ventasDeAntes,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/** El fondo con el que esta prueba abre la caja del mostrador. */
const FONDO_CENTAVOS = 150_000;

/**
 * Lo que se corta, y lo que la segueta se lleva.
 *
 * Dos metros y no seis: el corte tiene que caber en lo que le quede al rollo por
 * muchas corridas que se hayan hecho sobre la misma demo. La merma es la que la
 * semilla declara como desperdicio típico del cable, y es el número que esta
 * sección existe para vigilar: el sistema NO se puede creer que siga teniendo lo
 * que se quedó en el suelo.
 */
const MEDIDA_DEL_CORTE = 2;
const MERMA_DEL_CABLE = 0.2;

/**
 * Una cantidad como la escribe el dominio: cuatro decimales sin ceros de cola.
 *
 * A mano y no importada de `@morphiqpos/domain` —que desde `pruebas/` no resuelve—
 * y además a propósito: afirmar contra la misma función que produce el valor no
 * afirma nada (`contratos-por-mutacion`).
 */
function comoCantidad(valor: number): string {
  return valor.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

/** Lo que el índice del mostrador sirve de cada material. */
interface MaterialDelPuente {
  readonly id?: string;
  readonly nombre?: string;
  readonly precioCentavos?: number;
  readonly existencia?: number;
}

/** Un nombre del catálogo, usable dentro de una expresión regular. */
function comoTexto(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * LA VENTA QUE SE ESTÁ ARMANDO, desplegada en los dos tamaños.
 *
 * `Mostrador.tsx` la deja `hidden xl:block` y por debajo de 1280 px la pliega en
 * una barra que la abre. Los dos proyectos de esta suite caen a los dos lados de
 * esa raya —Desktop Chrome arriba, la Galaxy Tab S4 en horizontal a 1138 px
 * abajo—, y en el pasillo eso es correcto: el mostradorista necesita la pantalla
 * entera para buscar.
 *
 * Y ojo con un detalle que costó una vuelta: con `display: none` el `aside` sale
 * del árbol de accesibilidad y deja de tener ROL, así que ni `toBeAttached` lo
 * encuentra por `getByRole`. Debajo de `xl` se busca la barra y se comprueba que
 * ABRE, que es lo que de verdad hace falta para vender desde una tablet.
 */
/**
 * La existencia del cable, leída del ÍNDICE DEL MOSTRADOR.
 *
 * Del mismo sitio del que la lee el mostradorista —la vista `materiales_mostrador`,
 * que proyecta el ledger en vivo— y no de una consulta propia: si mañana el índice
 * miente, esta prueba tiene que mentir igual y fallar por eso.
 */
async function existenciaDelCable(page: Page): Promise<number> {
  const materiales = await consultarPuente<MaterialDelPuente>(page, 'MaterialMostrador', {
    limite: 60,
  });
  const cable = materiales.find((m) => (m.nombre ?? '').startsWith('Cable THW'));
  expect(
    cable,
    'La demo de ferretería no tiene el cable THW, que es su único material continuo. Siémbrala ' +
      'otra vez: `node --conditions=react-server scripts/sembrar-demos.mjs --solo ' +
      'demo-acople-ferreteria`.',
  ).toBeDefined();
  return cable?.existencia ?? 0;
}

async function abrirLaVenta(page: Page): Promise<Locator> {
  // «La nota», que es como una ferretería llama a lo que arma en el pasillo. El
  // `aria-label` sale del diccionario del giro desde que la pantalla dejó de
  // teclear «La venta», que es la palabra de la tiendita.
  const laVenta = page.getByRole('complementary', { name: 'La nota' });
  if ((page.viewportSize()?.width ?? 0) >= 1280) {
    await expect(laVenta).toBeVisible();
    return laVenta;
  }
  const barra = page.getByRole('button', { name: /partidas/ });
  await expect(barra).toBeVisible();
  await barra.click();
  await expect(laVenta).toBeVisible();
  return laVenta;
}

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
/**
 * Las pantallas del modelo, con LO QUE CADA UNA TIENE QUE ENSEÑAR.
 *
 * ── Por qué una marca por pantalla y no sólo el 200 ───────────────────────
 * Porque una pantalla que abre en 200 y pinta su estado de error se ve igual que
 * una que funciona. Con el 200 solo, la suite dio por probadas cuatro pantallas
 * cuya entidad del puente NO EXISTÍA —la ficha de pieza, las existencias de
 * material, la cartera por obra y las opciones de la bebida— y nueve que se
 * quedaban en su esqueleto para siempre porque `page.tsx` las montaba con un id
 * vacío. Ninguna se podía distinguir de las que sí trabajan.
 *
 * La marca no es el DATO: la demo puede tener una zona sin productos y eso es
 * legítimo. Es el título, la etiqueta de su región, o la frase de su estado vacío
 * —que también es contenido de esa pantalla y de ninguna otra—.
 */
const PANTALLAS: readonly (readonly [string, MarcaDePantalla])[] = [
  // Con la demostración recién sembrada, lo suyo es su VACÍO: «La caja está al
  // día», que es lo único que esta pantalla pinta cuando no hay ninguna nota
  // cerrada —ni encabezado—. El rótulo «Notas pendientes» y el `h1` aparecen sólo
  // con notas, y más abajo, ya con una enviada desde el mostrador, se exige ése.
  ['caja', /La caja está al día|Notas pendientes/],
  ['conteo', /Aquí se cuenta una zona|Conteo/],
  // «DE DÓNDE» no está en esta pantalla ni en ninguna otra: era una alternativa
  // muerta, y una alternativa muerta en una marca es una afirmación que no afirma.
  // Lo que la pantalla pinta es «Cortar <material>» en su `h1`.
  ['corte-de-material', /Cortar/],
  ['cotizacion', /Vigencia obligatoria|Cotización/],
  // EN MINÚSCULAS, y con su vacío. El rótulo se escribe «Lo que me deben» y se
  // ve en versales porque lleva `uppercase` de CSS: `text-transform` NO cambia el
  // texto del DOM, así que `/LO QUE ME DEBEN/` no podía encajar nunca. Y con la
  // demostración recién sembrada no hay crédito a nadie: lo suyo es su vacío.
  ['cuentas', /Todavía no le das crédito|Lo que me deben/],
  ['entradas', /Recepción y pedido/],
  ['existencias', /Qué hay, qué está dormido/],
  ['facturacion', /Todavía no se timbra/],
  ['ficha-de-pieza', /Aquí se amplía una pieza|Equivalentes/],
  ['material', /Aquí se abre un material que se corta|Rollo/],
  // «La venta», no «LA VENTA»: el `h2` lleva `uppercase` de CSS y el DOM guarda
  // el texto tal cual. El `h1` de esta pantalla es `sr-only`, así que lo que se
  // lee es el rótulo del buscador.
  // «La nota», que es lo que una ferretería arma en el pasillo. Decía «La venta»,
  // que es de la tiendita, y la pantalla ya no lo dice.
  ['mostrador', /Buscar material|La nota/],
  ['trabajos-de-mostrador', /Apartados|Listas de trabajo|garantía/i],
];

test.describe('ferretería · su vocabulario, sus pantallas y su dashboard', () => {
  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info);
  });

  /**
   * LA CAJA NO SE QUEDA ABIERTA, ni cuando la prueba falla.
   *
   * El último paso de esta prueba cierra la caja y cuadra el arqueo, y no se
   * ejecuta si la prueba muere antes. Lo que quedaba no era un dato sucio: era un
   * candado. La base permite UNA sesión de caja abierta por SUCURSAL, cada
   * navegador nuevo trae su propia terminal y cerrar la de otra terminal no se
   * puede, así que una corrida fallida bloqueaba TODAS las siguientes hasta volver
   * a sembrar la demo.
   *
   * Se anota en vez de afirmar: una limpieza que revienta taparía el fallo que hay
   * que leer.
   */
  test.afterEach(async ({ page }, info) => {
    info.annotations.push({ type: 'caja', description: await soltarLaCaja(page) });
  });

  test('la ferretería dice Materiales donde la tiendita dice Productos', async ({ page }) => {
    await entrar(page);
    await exigirGiro(page, 'ferreteria', 'ferreteria');
    // Ninguna pantalla puede abrir en 200 y reventar por dentro.
    const exigirSinFallos = vigilarFallos(page);
    // SU plantilla, que hasta el 17-09-2026 era la de la tiendita. Y el punto de la
    // prueba sigue siendo el mismo: el vocabulario NO sale de la plantilla, sale del
    // giro. `ferreteria` tiene ahora plantilla propia porque corta material, fía y
    // factura —tres cosas que una tiendita no hace—, y aunque compartieran plantilla
    // seguiría diciendo «Materiales».
    await cambiarDePlantilla(page, 'ferreteria');

    // ── 1 · SU VOCABULARIO ────────────────────────────────────────────────
    await abrirPantalla(page, '/', /Buen día|Lo que me deben/);
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

    /**
     * 3 · SU TABLERO · el de la ferretería, que no es el del restaurante
     *
     * `/` servía el tablero HEREDADO —el de Restaurante MH, nueve indicadores de una
     * cena—. La carpeta de este modelo pide otros ocho (F-056, §4.4) y en otro orden:
     * **lo primero es la cartera**, «la pérdida que no admite vuelta atrás», y no la
     * venta del día.
     *
     * Se afirman sus rótulos Y LA AUSENCIA de tres del restaurante: sin la segunda
     * mitad, volver a servir el heredado aquí pasaría la prueba.
     */
    await expect(page.getByRole('heading', { level: 1, name: 'Buen día' })).toBeVisible();
    for (const rotulo of [
      'Lo que me deben',
      'Dinero dormido',
      'Salió hoy y no se cobró',
      'Qué pedir',
      'Mostrador',
      'Lo que debo esta semana',
      'Pendientes que se enfrían',
    ]) {
      await expect(
        page.getByRole('heading', { level: 2, name: rotulo, exact: true }),
        `El tablero de la ferretería no enseña «${rotulo}». Son los ocho indicadores de ` +
          'su §4.4, y el primero es la cartera a propósito.',
      ).toBeVisible();
    }
    // El de la venta lleva el sustantivo del giro —«Notas de hoy»— así que se busca
    // por su parte fija: afirmar la palabra aquí duplicaría la prueba del vocabulario.
    await expect(
      page.getByRole('heading', { level: 2, name: /de hoy$/ }),
      'El tablero no enseña la venta del día con el sustantivo de su giro.',
    ).toBeVisible();

    for (const prohibido of ['Ticket promedio', 'Costo de ventas', 'Utilidad bruta']) {
      await expect(
        page.getByText(prohibido, { exact: true }),
        `El tablero enseña «${prohibido}», que es del RESTAURANTE: la raíz volvió a servir el ` +
          'tablero heredado a una ferretería.',
      ).toHaveCount(0);
    }

    // Y sus dos acciones, que son enlaces: llevan a otra pantalla, no disparan nada.
    const acciones = accionesDelTablero(page);
    await expect(acciones.getByRole('link', { name: 'Ir al mostrador' })).toBeVisible();
    await expect(acciones.getByRole('link', { name: 'Nueva venta' })).toHaveCount(0);

    // ── 4 · LAS DOCE PANTALLAS DEL MODELO RESPONDEN ───────────────────────
    for (const [pantalla, marca] of PANTALLAS) {
      await abrirPantalla(page, `/ferreteria/${pantalla}`, marca);
    }

    // La de inicio NO es el total con el teclado: es el buscador con la venta
    // armándose al lado, porque aquí el cliente trae un tornillo en la mano y dice
    // «uno como éste». Su encabezado es para lector de pantalla —la pantalla la manda
    // la búsqueda, no un título— así que se comprueba que ESTÉ, no que se vea.
    await abrirPantalla(page, '/ferreteria/mostrador', /Buscar material|La nota/);
    await expect(page.getByRole('heading', { name: 'Mostrador', exact: true })).toBeAttached();
    // `complementary`, no `region`: la venta que se arma vive en un `aside`, y ése es
    // su rol implícito. Escrito como `region` la prueba no encontraba NADA, y el rastro
    // mandaba a mirar una pantalla que estaba bien.
    await abrirLaVenta(page);

    // ── 5 · SE ARMA LA NOTA EN EL PASILLO Y SE COBRA EN LA CAJA ───────────
    //
    // Hasta el 19-09-2026 esta suite NO cobraba, y aquí había un comentario de
    // treinta líneas explicando por qué: el índice del mostrador no existía en el
    // puente, «Mandar a caja» publicaba en la ruta de otra función y el estado que
    // la caja listaba no lo escribía ningún comando. Las tres cosas están hechas
    // —migraciones 168/169/170, `MaterialMostrador`, `NotaDeCaja`,
    // `ferreteria.crear_nota_mostrador`— y lo que iba ahí es esto: el recorrido
    // de dos pantallas que es una ferretería, cobrado y cuadrado.
    //
    // Los ids de antes se guardan ANTES de armar la nota: la nota crea su orden
    // con su total desde el primer renglón, así que «hay una venta nueva» se
    // cumpliría con la nota sin cobrar. Lo que se exige después es esa venta CON
    // FOLIO, y el folio se toma en la misma transacción que el pago.
    const idsDeAntes = await ventasDeAntes(page);

    // La caja de ESTA terminal, por la ruta: este modelo no tiene pantalla de
    // apertura propia —su `/ferreteria/caja` cobra, y la apertura con
    // denominaciones vive en la heredada— y teclear un diálogo de la plataforma
    // anterior no prueba nada del acople. Se usa la MISMA ruta que usa el botón,
    // con las mismas cabeceras: se salta el diálogo, no la autorización.
    await abrirCajaPorLaRuta(page, FONDO_CENTAVOS);

    // El material sale del ÍNDICE, no de un nombre escrito aquí: la pantalla lee
    // `MaterialMostrador` y esto lee lo mismo, así que si mañana la semilla cambia
    // los nombres la prueba sigue valiendo.
    const materiales = await consultarPuente<MaterialDelPuente>(page, 'MaterialMostrador', {
      limite: 60,
    });
    // Con existencia, porque el cobro la BAJA: en una ferreteria el producto es su
    // propio insumo y `venta.cobrar` descuenta el ledger antes de tomar el folio.
    const conPrecio = materiales.find(
      (m) => (m.nombre ?? '') !== '' && (m.precioCentavos ?? 0) > 0 && (m.existencia ?? 0) > 1,
    );
    expect(
      conPrecio,
      'La demo de ferretería no tiene ningún material con nombre y precio en el índice del ' +
        'mostrador, así que no hay nada que vender. Siémbrala otra vez: ' +
        '`pnpm db:seed --org demo-acople-ferreteria`.',
    ).toBeDefined();
    const material = conPrecio!;
    const nombre = material.nombre ?? '';

    await abrirPantalla(page, '/ferreteria/mostrador', /Buscar material|La nota/);
    const laVenta = await abrirLaVenta(page);

    // Se busca como busca el mostradorista: una palabra. El filtro es progresivo
    // —cada palabra estrecha— y mira nombre, medida, acabado, marca y línea.
    const primeraPalabra = nombre.split(' ')[0] ?? nombre;
    await page.locator('#buscador').fill(primeraPalabra);

    // El resultado es un `button` con el material entero en su nombre accesible:
    // medida, precio, existencia y ubicación. Se toca, como en el pasillo.
    const fila = page.getByRole('button', { name: new RegExp(comoTexto(nombre)) }).first();
    await expect(
      fila,
      `El índice del mostrador no encontró «${nombre}» buscando «${primeraPalabra}», y el ` +
        'puente sí lo sirve. Sin resultados no hay partidas, y sin partidas «Mandar a caja» ' +
        'no se enciende: una ferretería no puede vender nada por su pantalla.',
    ).toBeVisible();
    await fila.click();

    // La partida está en la venta que se arma, con su nombre.
    await expect(laVenta.getByText(nombre, { exact: false }).first()).toBeVisible();

    // MANDAR A CAJA · el mostradorista suelta la nota y le canta el folio al
    // cliente, que es lo único que se lleva del pasillo.
    await laVenta.getByRole('button', { name: /Mandar a caja/ }).click();
    const aviso = page.getByRole('status');
    await expect(
      aviso,
      'La nota no llegó a la caja. `ferreteria.crear_nota_mostrador` crea la orden, sus ' +
        'partidas y la fila de `notas_mostrador` con su folio; si esto no aparece, la pantalla ' +
        'publicó en otra ruta o el comando la rechazó.',
    ).toContainText(/está en la caja/, { timeout: 30_000 });
    const folioNota = /N-\d+/.exec(await aviso.innerText())?.[0] ?? '';
    expect(
      folioNota,
      'La nota se mandó sin folio visible. El folio es el número que el cliente dice en la ' +
        'caja: sin enseñarlo, la nota llega y nadie sabe pedirla.',
    ).not.toBe('');

    // ── LA CAJA · la otra persona, la otra pantalla ───────────────────────
    // Y aquí NO vale el vacío: el mostrador acaba de cerrar una nota, así que la
    // lista de pendientes tiene que estar. Misma pantalla, exigencia más alta.
    await abrirPantalla(page, '/ferreteria/caja', /Notas pendientes/);

    // La nota está en la lista de pendientes, por su folio. Ésta es la fila que
    // hasta hoy no podía existir: la pantalla filtraba por `pendiente_cobro`, un
    // estado que no está en el `check` de `ordenes.estado`.
    // El folio, sin que «N-1» case con «N-10»: la caja de un día tiene las dos.
    const folioExacto = new RegExp(comoTexto(folioNota) + '(?![0-9])');
    const enLaLista = page.getByRole('button', { name: folioExacto }).first();
    await expect(
      enLaLista,
      `La nota ${folioNota} no aparece en las pendientes de la caja. La vista ` +
        '`notas_de_caja` la sirve como `por_cobrar` mientras la orden siga cobrable y la nota ' +
        'sin entregar.',
    ).toBeVisible({ timeout: 30_000 });
    await enLaLista.click();

    // EL TOTAL QUE DICE LA CAJA. Es el número que se dice en voz alta, y es
    // contra éste contra el que se compara lo que quedó en la base.
    const totalCentavos = await totalEnPantalla(page);
    expect(
      totalCentavos,
      `El total de la caja no es el precio del material. Precio: ` +
        `${String(material.precioCentavos ?? 0)} centavos; total: ${String(totalCentavos)}. Una ` +
        'pieza de un material cuesta lo que cuesta.',
    ).toBe(material.precioCentavos ?? 0);

    // COBRAR EN EFECTIVO · un método por nota, que es como sella esta pantalla.
    await page.getByRole('button', { name: 'Efectivo', exact: true }).click();

    // La nota deja las pendientes y pasa a «Cerradas, sin entregar»: cerrada para
    // la caja, con el material todavía en el patio. Esa lista es lo que evita
    // entregar dos veces lo mismo, y por eso no se puede plegar.
    const anden = page.getByRole('region', { name: 'Cerradas, sin entregar' });
    await expect(
      anden.getByText(folioExacto),
      `Se cobró la nota ${folioNota} y no apareció en «Cerradas, sin entregar». O el cobro no ` +
        'entró, o la vista no vio el pago: las dos cosas acaban en material entregado dos veces.',
    ).toBeVisible({ timeout: 45_000 });

    // ── Y AQUÍ SE COMPRUEBA QUE EL DINERO CUADRÓ ──────────────────────────
    // Contra el SERVIDOR, no contra la pantalla: la lista se mueve igual si el
    // comando falla y alguien se come el error.
    await exigirVentaCobrada(page, totalCentavos, idsDeAntes);
    test.info().annotations.push({
      type: 'cobrado',
      description: `${(totalCentavos / 100).toFixed(2)} MXN · la nota del mostrador`,
    });

    // ── 6 · EL CORTE DE MATERIAL · lo que distingue a una ferretería ───────
    //
    // Se cortan 6 m de un rollo de 12 y salen 6.2 porque la segueta se lleva lo
    // suyo. Es el descuadre 3 del giro: pasa ocho veces al día en cable, manguera
    // y cadena, y a fin de mes son decenas de metros que el sistema cree que
    // están. Aquí se comprueba que **no** se los cree.
    const cableAntes = await existenciaDelCable(page);

    await abrirPantalla(page, '/ferreteria/corte-de-material', /Cortar/);
    await expect(
      page.getByRole('heading', { name: /^Cortar · / }),
      'La pantalla de corte no encontró material continuo. `materiales_continuos` (171) sirve los ' +
        'productos con `es_continuo`, y la semilla marca el cable: si esto falla, o la vista no ' +
        'está o la demo se sembró antes de que existiera.',
    ).toBeVisible();

    // La PIEZA sugerida es la más chica que alcanza: el trabajo de una ferretería
    // es acabarse los rollos abiertos, no abrir otro.
    // Por su RADIO, no por el texto suelto: el folio aparece también en «Queda en
    // R-102», y lo que importa aquí es que la pieza esté ofrecida y elegida.
    await expect(
      page.getByRole('radio', { name: /Rollo abierto R-102/ }),
      'La pantalla de corte no ofrece el rollo R-102 de la demo. `piezas_de_material` (171) sirve ' +
        'las piezas vivas de ESE material, filtradas por `producto_id`.',
    ).toBeChecked();

    /**
     * EL PUNTO DE PARTIDA SE LEE, no se supone. Y SI EL SUGERIDO NO ALCANZA, SE AGARRA
     * OTRO ROLLO.
     *
     * Esto cortaba 6 m dando por hecho que el rollo tenía los 12 de la semilla, y eso
     * hacía la corrida IRREPETIBLE: cada pasada se lleva la medida más la merma, así
     * que la segunda encontraba 5.8 m y la tercera no alcanzaba —el botón de cortar se
     * queda DESACTIVADO cuando el descuento excede lo que queda—. El fallo salía como
     * un `click` que agotaba tres minutos sobre un botón `disabled`.
     *
     * Leer lo que queda arregló la aritmética y no la repetibilidad: el rollo sugerido
     * es el MÁS CHICO QUE ALCANZA —el trabajo de una ferretería es acabarse los
     * abiertos— así que las corridas lo van vaciando y a la sexta le quedaba 1 m. Lo
     * que hace entonces quien está en el mostrador no es cerrar la tienda: agarra otro
     * rollo. Eso es lo que hace esta prueba, leyendo de cada opción cuánto le queda —el
     * nombre accesible de cada radio lo dice— y eligiendo la primera que dé para el
     * corte. Cuando NINGUNA da, el material se acabó de verdad y el fallo lo dice con
     * el comando que vuelve a sembrarlo.
     *
     * Lo que esta sección prueba es la ARITMÉTICA de la merma —que la existencia baje
     * la medida MÁS el desperdicio— y eso se puede probar con cualquier punto de
     * partida.
     */
    const necesita = MEDIDA_DEL_CORTE + MERMA_DEL_CABLE;
    const deDonde = page.getByRole('region', { name: 'De dónde' });
    // Por la ETIQUETA de cada opción y no por el radio: la etiqueta es la que lleva el
    // «quedan 3.8 m», y tocarla es lo que hace un dedo en el mostrador —marca su radio—.
    const etiquetas = await deDonde.locator('label').all();
    const conLoQueQueda: {
      readonly etiqueta: (typeof etiquetas)[number];
      readonly queda: number;
    }[] = [];
    for (const etiqueta of etiquetas) {
      conLoQueQueda.push({
        etiqueta,
        queda: Number(/quedan ([\d.]+)/.exec(await etiqueta.innerText())?.[1] ?? '0'),
      });
    }
    const alcanza = conLoQueQueda.find((r) => r.queda > necesita);
    expect(
      alcanza,
      `Ningún rollo de la demo tiene los ${String(necesita)} m que este corte necesita —lo que ` +
        `queda: ${conLoQueQueda.map((r) => String(r.queda)).join(', ')}—. El material se acabó de ` +
        'verdad. Vuelve a sembrar la demo: `node --conditions=react-server ' +
        'scripts/sembrar-demos.mjs --solo demo-acople-ferreteria`.',
    ).toBeDefined();
    await alcanza!.etiqueta.click();
    const restante = alcanza!.queda;

    await page.getByLabel(/Medida entregada/).fill(String(MEDIDA_DEL_CORTE));
    await page.getByRole('button', { name: 'Cortar y agregar' }).click();

    const corte = page.getByRole('status');
    await expect(
      corte,
      'El corte no contestó. `/api/ferreteria/cortar` abre la nota, le cuelga la partida y corta ' +
        'en una sola transacción: si esto no aparece, o la ruta no existe o el comando la rechazó.',
    ).toContainText(/está en la caja/, { timeout: 30_000 });
    // Lo que queda del rollo, que es lo que el mostradorista tiene que rotular:
    // lo que había, menos la medida, menos la merma.
    await expect(corte).toContainText(
      `Quedan ${comoCantidad(restante - MEDIDA_DEL_CORTE - MERMA_DEL_CABLE)} m`,
    );

    // Y LA EXISTENCIA BAJÓ LA MEDIDA MÁS LA MERMA, no sólo la medida: el desperdicio
    // de la segueta es material que salió del almacén.
    // Esta resta se hace con SQL crudo y la base falsa no la mira, así que es aquí
    // —contra la base de verdad— donde se puede afirmar que la escala es la buena.
    // Con la unidad base sin convertir bajaría 62 000 m y el cable quedaría en
    // menos sesenta mil.
    await expect
      .poll(async () => existenciaDelCable(page), {
        message:
          'La existencia del cable no bajó por el corte y su merma. O el corte no descontó, o lo ' +
          'hizo en otra escala: `medida_restante_base` son diezmilésimas y `existencias.cantidad` ' +
          'unidades de venta.',
        timeout: 20_000,
      })
      .toBeCloseTo(cableAntes - (MEDIDA_DEL_CORTE + MERMA_DEL_CABLE), 2);

    // ── 7 · EL CORTE DE CAJA · el fondo más la venta, al centavo ───────────
    //
    // Y cerrar es lo que hace REPETIBLE la corrida: la base permite UNA sesión
    // abierta por sucursal, y cada navegador nuevo trae su propia terminal, así
    // que una caja que se queda abierta bloquea la corrida siguiente entera.
    await cerrarCajaYCuadrar(page, FONDO_CENTAVOS + totalCentavos);

    exigirSinFallos();
  });
});
