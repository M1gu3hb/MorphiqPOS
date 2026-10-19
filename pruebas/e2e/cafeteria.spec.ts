import { expect, test } from '@playwright/test';

import { exigirElPdfDelCorte } from './ayudantes/corte.ts';

import {
  abrirLaCajaSiHaceFalta,
  abrirPantalla,
  type MarcaDePantalla,
  accionesDelTablero,
  cambiarDePlantilla,
  consultarPuente,
  entrar,
  exigirDemostracion,
  exigirCobroAceptado,
  exigirGiro,
  exigirInventarioMovido,
  exigirVentaCobrada,
  exigirVocabulario,
  exigirVocabularioDelGiro,
  menuLateral,
  soltarLaCaja,
  ventasDeAntes,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * Modelo 2 de 5 · CAFETERÍA DE MOSTRADOR · giro `cafeteria`, plantilla `cafeteria`.
 *
 * ── QUÉ DEMUESTRA ──────────────────────────────────────────────────────────
 * Que el GIRO y la PLANTILLA son dos ejes distintos, y que se ven distintos en la
 * pantalla. Esta prueba cambia la plantilla DOS veces sobre el mismo negocio:
 *
 *   · con `cafeteria`, el menú tiene SU barra —`/cafeteria/barra`, la fila que
 *     espera— y no tiene mesero: esa plantilla no incluye el módulo `mesero`,
 *     porque en un mostrador quien cobra es quien prepara y quien entrega;
 *   · con `restaurante`, las mismas dos entradas aparecen y dicen «Baristas» y
 *     «Barras» — no «Meseros» y «Cocinas», aunque la plantilla sea la del
 *     restaurante.
 *
 * ── POR QUÉ ESO IMPORTA, y por qué esta prueba es la más informativa de las cinco ──
 * Porque es el caso real de **Café Jacaranda**, y está escrito en `A3 §4.3` y en
 * `F2.3-REGLAS §4.4`: se queda en la plantilla `restaurante` aunque su giro sea
 * cafetería, porque tiene contratado el paquete completo con mesero y cocina y
 * bajarlo a `cafeteria` le quitaría módulos que paga. Si el vocabulario saliera de la
 * plantilla —como decía D-04 antes de corregirse— Jacaranda leería «Meseros» y
 * «Cocinas» en una barra donde no hay ni una cosa ni la otra. Que lea «Baristas» y
 * «Barras» es la demostración de que `tipos.ts` tenía razón: *la plantilla dice qué
 * MÓDULOS tiene el negocio; el giro dice CÓMO HABLA*.
 *
 * ── LO QUE ESTA PRUEBA NO PUEDE MIRAR, y hay que decirlo ───────────────────
 * `unidad_servicio` es «pedido» —el objeto que este giro construyó porque el cliente
 * ya pagó y espera de pie (F-328)— y ninguna ENTRADA DE MENÚ lo nombra: las que
 * llevan a sus pantallas se llaman «Cobrar», «Recogida» y «Turno», que son acciones y
 * no la entidad. Dentro de las pantallas sí se lee, desde E2.4: `Barra.tsx` dice
 * «Sin pedidos en espera» con el sustantivo del diccionario, y eso es lo que se afirma
 * en el paso 3 con `exigirVocabularioDelGiro`.
 *
 * ── EL ORDEN, que no es libre ──────────────────────────────────────────────
 * Las trece pantallas del modelo se abren MIENTRAS la plantilla es `cafeteria`. Desde
 * E2 hay una guarda en `app/(modelos)/cafeteria/layout.tsx` que redirige a la pantalla
 * de inicio del negocio cuando la plantilla es otra, así que abrirlas después de poner
 * `restaurante` daría trece redirecciones y el rastro diría «no encontré el
 * encabezado» — mandando a buscar el defecto donde no está.
 */

/** Las trece pantallas del modelo, tal como existen en `app/(modelos)/cafeteria/`. */
/**
 * El fondo con el que la prueba abre su turno, en centavos.
 */
const FONDO_CENTAVOS = 50_000;

/** Lo que la pantalla de cobro de la barra lee del catálogo. */
interface BebidaDelPuente {
  readonly id?: string;
  readonly nombre?: string | null;
  readonly precio_venta?: number | null;
}

/** Una opción de bebida del puente (`Modificador`): su delta llega en centavos. */
interface OpcionDelPuente {
  readonly nombre?: string;
  readonly grupo?: string | null;
  readonly delta_precio_centavos?: number | null;
}

/** Pesos como los pinta la pantalla: `$42.90`. */
function enPesos(centavos: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
    centavos / 100,
  );
}

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
  ['acceso-por-pin', /¿Quién está operando\?/],
  // «En la fila» y no «BARRA»: la mayúscula del título es CSS, el texto es «Barra». Con
  // la barra vacía —como estaba la demo hasta C.14, que no emitía comandas— salía
  // lo primero; con pedidos, lo segundo.
  ['barra', /La fila está vacía|En la fila/],
  ['cierre-de-turno-y-arqueo', /No hay ningún turno abierto|Cierre de turno/],
  ['clientes-y-sellos', /Se identifica por teléfono/],
  ['cobrar', /Turno cerrado|Cobrar/],
  ['cobro-y-propina', /esperando cobro|propina/i],
  ['inventario', /Contar leche|Buscar insumo/],
  ['menu-publico-y-pedido-anticipado', /Pide antes de llegar|Ya está apartado/],
  // Los GRUPOS, que son lo que esta pantalla es. La marca decía
  // `/ALERGIA|NOTA PARA LA BARRA/` y esos dos textos no están en esta pantalla
  // —«ALERGIA» lo pinta `cafeteria/Barra.tsx`—, así que la marca no podía cumplirse
  // nunca. Y debajo había un defecto de verdad: la demostración no sembraba NINGÚN
  // grupo de opciones, así que la pantalla abría con su estado vacío y el camino
  // completo —la vista `opciones_de_bebida` de la 175, la entidad `Modificador` del
  // puente y esta pantalla— no se había visto funcionar con datos ni una vez.
  ['opciones-de-la-bebida', /Tamaño|Temperatura|Extras/],
  ['productos', /Hoy no hay|Productos/],
  ['recetas', /Recetas/],
  ['recogida', { etiqueta: 'Pantalla de recogida' }],
  ['turno', /Turno/],
];

/** Lo que el menú de una cafetería NUNCA puede decir, venga la plantilla que venga. */
const DE_OTROS_MODELOS = ['Platillos', 'Meseros', 'Cocinas', 'Materiales', 'Mostradoristas'];

test.describe('cafetería · su vocabulario, sus pantallas y su dashboard', () => {
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

  test('la cafetería habla de baristas y barra, y su plantilla no trae sala', async ({
    page,
    browser,
  }) => {
    await entrar(page);
    await exigirGiro(page, 'cafeteria', 'cafeteria');
    // Ninguna pantalla puede abrir en 200 y reventar por dentro.
    const exigirSinFallos = vigilarFallos(page);

    // ── 1 · CON SU PROPIA PLANTILLA · mostrador, sin sala ─────────────────
    await cambiarDePlantilla(page, 'cafeteria');
    await abrirPantalla(page, '/', /Buen día|Turno/);
    const mostrador = await menuLateral(page);

    await exigirVocabulario(mostrador, {
      // `producto` → «producto/productos». El diccionario de `cafeteria` lo traduce a
      // sí mismo a propósito: lo que vende una cafetería de mostrador SÍ se llama
      // producto, y forzar una palabra distinta sólo por tener una sería el vicio
      // contrario al que F-017 viene a cerrar.
      propios: [['producto', 'Productos']],
      ajenos: [...DE_OTROS_MODELOS, 'Cajeros', 'Responsables'],
    });

    // «Barras» SÍ está, y es la de ESTE modelo: `/cafeteria/barra`, la fila que espera
    // con su cronómetro. La plantilla `cafeteria` incluye el módulo `barra` a propósito
    // —un mostrador de café tiene barra— y hasta E2 no lo incluía, que es por lo que
    // esta prueba exigía su ausencia.
    await expect(mostrador.getByRole('link', { name: 'Barras', exact: true })).toHaveAttribute(
      'href',
      '/cafeteria/barra',
    );

    // «Baristas» no, y no por el vocabulario: por el módulo. `MODULOS_POR_PLANTILLA.
    // cafeteria` no incluye `mesero` ni `mesas`, porque en un mostrador quien cobra es
    // quien prepara y quien entrega. Si apareciera, el cambio de plantilla no llegó al
    // navegador.
    for (const deSala of ['Baristas', 'Mesas']) {
      await expect(
        mostrador.getByRole('link', { name: deSala, exact: true }),
        `El menú enseña «${deSala}» con la plantilla \`cafeteria\`, que no incluye los ` +
          'módulos de sala. El filtro es `isRouteAllowed(item.path, paquete_modo)` en ' +
          'heredado/components/common/Sidebar.jsx; `paquete_modo` sale de ' +
          '`getCurrentPackage`, que normaliza con `normalizarPlantilla` —las CINCO ' +
          'plantillas de D-01 más los tres nombres viejos como alias— y cae en `tienda` ' +
          'ante lo que no reconoce. Que aparezca la sala significa que el cambio de ' +
          'plantilla no llegó al navegador, o que alguien devolvió el valor por omisión a ' +
          'la plantilla más permisiva.',
      ).toHaveCount(0);
    }

    // Su dashboard es de mostrador: la acción es abrir la caja, no una venta por mesa.
    await expect(page.getByRole('heading', { level: 1, name: 'Buen día' })).toBeVisible();
    /**
     * SU TABLERO · el de la cafetería, que se diseña para dos momentos del día
     *
     * `/` servía el tablero HEREDADO —el del restaurante—. La carpeta de este modelo
     * pide otro (F-056, §4.4) y lo justifica con una hora: «a las ocho de la mañana
     * NADIE mira el dashboard». Se mira a las 10:30, cuando baja la ráfaga, y a las
     * 20:40 al cerrar. Por eso lo primero es la RÁFAGA y no la venta del día.
     *
     * Se afirman sus rótulos y la ausencia de tres del restaurante: sin la segunda
     * mitad, volver a servir el heredado aquí pasaría la prueba.
     */
    for (const rotulo of [
      'Lo cobrado en la ráfaga',
      'Del cobro a la entrega',
      'Lo que se acaba primero',
      'Efectivo en el cajón',
      'Cambio disponible',
      'Tarjeta del turno',
      'Utilidad del turno',
      'Mezcla del día',
      'Frescura del grano abierto',
      'Merma de barra del turno',
      'Sellos',
    ]) {
      await expect(
        page.getByRole('heading', { level: 2, name: rotulo, exact: true }),
        `El tablero de la cafetería no enseña «${rotulo}». Son los catorce indicadores de ` +
          'su §4.4, y el primero es la ráfaga a propósito.',
      ).toBeVisible();
    }
    for (const prohibido of ['Ticket promedio', 'Costo de ventas', 'Utilidad bruta']) {
      await expect(
        page.getByText(prohibido, { exact: true }),
        `El tablero enseña «${prohibido}», que es del RESTAURANTE: la raíz volvió a servir el ` +
          'tablero heredado a una cafetería.',
      ).toHaveCount(0);
    }

    const acciones = accionesDelTablero(page);
    // Sus dos acciones, que son enlaces: llevan a otra pantalla, no disparan nada.
    await expect(acciones.getByRole('link', { name: 'Ir a cobrar' })).toBeVisible();
    await expect(acciones.getByRole('link', { name: 'Nueva venta' })).toHaveCount(0);

    // ── 2 · LAS TRECE PANTALLAS DEL MODELO RESPONDEN ──────────────────────
    // Van AQUÍ y no al final: la guarda de `app/(modelos)/cafeteria/` exige la
    // plantilla `cafeteria`, y el paso 3 la cambia a `restaurante`.
    for (const [pantalla, marca] of PANTALLAS) {
      await abrirPantalla(page, `/cafeteria/${pantalla}`, marca);
    }

    // La de inicio del barista, reconocible sin un solo dato en la base: la fila
    // vacía es un estado con nombre en este modelo y se pinta igual.
    // En minúsculas como la pinta: el encabezado dice «Barra». Con `/BARRA/` la
    // marca no podía cumplirse nunca —la tabla de arriba ya la tenía bien— y el
    // fallo mandaba a mirar una pantalla que estaba perfecta.
    await abrirPantalla(page, '/cafeteria/barra', /La fila está vacía|Barra/);
    await expect(page.getByRole('heading', { name: 'Barra', exact: true })).toBeVisible();

    /**
     * 2.1 · LO QUE C.10 DE LA 2.4 CONSTRUYÓ EN LAS PANTALLAS DE LA CAFETERÍA.
     *
     * La receta dice qué grupo CAMBIA cada línea y cuánto cuesta cada variante; el
     * catálogo dice qué opciones abre cada bebida y su IVA; clientes y sellos enseña el
     * pasivo del programa. Las tres eran «alcance recortado».
     */
    await abrirPantalla(page, '/cafeteria/recetas', /Recetas/);
    await page
      .getByRole('row', { name: /Latte 12 oz/ })
      .first()
      .click();
    await expect(
      page.getByRole('combobox', { name: 'Qué opción cambia Leche entera' }),
      'La leche entera del latte no dice que la cambia el grupo «Leche»: la semilla la ' +
        'declara (`declararLineaSustituible`) y el puente la sirve como ' +
        '`sustituible_por_grupo_id`. Sin eso el latte de avena descuenta leche entera.',
    ).toHaveText(/Leche/);
    await expect(
      page.getByText('Leche entera → Bebida de avena').first(),
      'La tabla de variantes no enseña lo que la avena cambia en la receta.',
    ).toBeVisible();

    await abrirPantalla(page, '/cafeteria/clientes-y-sellos', /Se identifica por teléfono/);
    await expect(page.getByText('Lo que debe el programa')).toBeVisible();

    await abrirPantalla(page, '/cafeteria/productos', /Hoy no hay|Productos/);
    await expect(page.getByRole('columnheader', { name: 'Opciones' })).toBeVisible();

    // ── 2.5 · SE COBRA EN LA BARRA, Y EL TURNO CUADRA ─────────────────────
    //
    // Abrir el turno con su fondo, cobrar una bebida y cerrar el turno contando
    // el cajón. El cierre es parte de la prueba y no un adorno: la base permite
    // UNA sesión de caja abierta por sucursal y cada navegador trae su propia
    // terminal, así que un turno que se queda abierto bloquea la corrida
    // siguiente.
    await abrirLaCajaSiHaceFalta(
      page,
      {
        ruta: '/cafeteria/turno',
        boton: 'Abrir turno',
        campoDelFondo: '#fondo-monedas',
        señalAbierta: 'Cerrar turno',
      },
      (FONDO_CENTAVOS / 100).toFixed(2),
    );

    await abrirPantalla(page, '/cafeteria/cobrar', /Cobrar|Turno cerrado/);

    // La bebida sale del catálogo, como en el mostrador: la pantalla pinta un
    // botón por producto con su nombre y su precio.
    const catalogo = await consultarPuente<BebidaDelPuente>(page, 'ProductoTerminado', {
      limite: 50,
    });
    const elegida = catalogo.find((p) => (p.nombre ?? '') !== '' && (p.precio_venta ?? 0) > 0);
    expect(
      elegida,
      'La demo de cafetería no tiene ninguna bebida con nombre y precio: no hay nada que cobrar.',
    ).toBeDefined();
    const bebida = elegida!;
    const precioCentavos = Math.round((bebida.precio_venta ?? 0) * 100);

    const idsDeAntes = await ventasDeAntes(page);

    // Por NOMBRE y sin expresion regular: el nombre accesible del boton es
    // «<bebida> <precio>», y la busqueda por nombre de Playwright ya es por
    // subcadena. Con una expresion regular habria que escapar los parentesis
    // de «Te chai (grande)», y un parentesis sin escapar no casa con nada
    // mientras el fallo dice «no encontre el boton» sobre un boton que esta.
    await page
      .getByRole('button', { name: bebida.nombre ?? '' })
      .first()
      .click();
    // Una bebida con opciones las abre encima del cobro (C.10 de la 2.4). Con las de
    // omisión —12 oz, entera, normal— el precio es el de la carta.
    const suyas = await consultarPuente<OpcionDelPuente>(page, 'Modificador', {
      filtro: { producto_id: bebida.id ?? '' },
      limite: 5,
    });
    if (suyas.length > 0) {
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^AGREGAR/ })
        .click();
    }

    // «Aquí» o «Para llevar»: sin canal el botón de cobrar está bloqueado, y con
    // razón —`estrategia_cumplimiento` decide si el pedido entra a la fila de la
    // barra— así que la prueba lo dice como lo diría el barista.
    await page.getByRole('button', { name: 'Aquí' }).click();

    // El total lo lleva el propio botón de cobrar, que es donde lo ve el barista.
    const botonCobrar = page.getByRole('button', { name: /^COBRAR/ });
    await expect(botonCobrar).toContainText(enPesos(precioCentavos));

    await botonCobrar.click();

    // Reposo de esta pantalla: la barra inferior vuelve a pedir que se toque algo.
    await exigirCobroAceptado(page, /para empezar\./);

    const venta = await exigirVentaCobrada(page, precioCentavos, idsDeAntes);
    test.info().annotations.push({
      type: 'cobrado',
      description: `${(precioCentavos / 100).toFixed(2)} MXN · la bebida de la barra`,
    });

    // Y la comanda de la barra: en una cafetería el cobro es lo que manda la
    // bebida a preparar, y eso es un movimiento de inventario por la receta.
    await exigirInventarioMovido(page, venta.id ?? '', bebida.nombre ?? '');

    /**
     * 2a · EL LATTE DE AVENA DESCUENTA AVENA (C.10 de la 2.4, F-027).
     *
     * La opción existía y nadie la aplicaba: el mostrador no podía cobrarla —las opciones
     * eran otra pantalla que metía la bebida en un borrador que el cobro no leía— y aunque
     * se hubiera cobrado, el consumo descontaba la receta de catálogo, con leche entera.
     * Aquí se elige la avena en el cobro, se cobra con su delta, y el ledger de ESA venta
     * tiene que llevar avena y NO leche entera.
     */
    const [latte] = await consultarPuente<BebidaDelPuente>(page, 'ProductoTerminado', {
      filtro: { nombre: 'Latte 12 oz' },
      limite: 1,
    });
    const delLatte = await consultarPuente<OpcionDelPuente>(page, 'Modificador', {
      filtro: { producto_id: latte?.id ?? '' },
      limite: 20,
    });
    const deltaAvena = delLatte.find((o) => o.nombre === 'Avena')?.delta_precio_centavos ?? 0;
    const latteDeAvena = Math.round((latte?.precio_venta ?? 0) * 100) + deltaAvena;
    const idsAntesDelLatte = await ventasDeAntes(page);

    await page.getByRole('button', { name: 'Latte 12 oz' }).first().click();
    const opcionesDelLatte = page.getByRole('dialog');
    await opcionesDelLatte.getByRole('button', { name: /^Avena/ }).click();
    await opcionesDelLatte.getByRole('button', { name: /^AGREGAR/ }).click();
    await page.locator('#cobrar-nombre').fill('Avena E2E');
    await page.getByRole('button', { name: 'Aquí' }).click();
    await expect(
      botonCobrar,
      'El cobro no suma la avena: la línea tiene que llevar el delta de la opción.',
    ).toContainText(enPesos(latteDeAvena));
    await botonCobrar.click();
    await exigirCobroAceptado(page, /para empezar\./);
    const ventaDelLatte = await exigirVentaCobrada(page, latteDeAvena, idsAntesDelLatte);
    const consumo = await exigirInventarioMovido(
      page,
      ventaDelLatte.id ?? '',
      'Latte 12 oz con avena',
    );
    const insumosDelLatte = consumo.map((m) => m.ingrediente_nombre ?? '');
    expect(
      insumosDelLatte,
      `El latte de avena descontó ${insumosDelLatte.join(', ')}: tiene que llevar la avena.`,
    ).toContain('Bebida de avena');
    expect(
      insumosDelLatte,
      'El latte de avena descontó LECHE ENTERA: el consumo no aplicó la opción elegida.',
    ).not.toContain('Leche entera');

    /**
     * 2a · LA BARRA LA PREPARA Y LA ENTREGA (C.14 de la 2.4).
     *
     * Hasta C.14 la demo no emitía comandas —sus recetas no iban a ninguna área y no
     * había estación—, así que la barra estaba siempre vacía y el cierre nunca
     * encontraba «cobrado sin entregar». Ahora la bebida llega a la barra, y se
     * despacha por su tarjeta: listo y llamar, y entregar.
     */
    await abrirPantalla(page, '/cafeteria/barra', /En la fila|La fila está vacía/);
    await page.getByRole('button', { name: 'Marcar listo y llamar a Sin nombre' }).first().click();
    await page
      .getByRole('button', { name: 'Marcar entregado el pedido de Sin nombre' })
      .first()
      .click();
    await expect(
      page.getByRole('button', { name: 'Marcar entregado el pedido de Sin nombre' }),
      'La bebida cobrada en el mostrador no se pudo entregar desde la barra.',
    ).toHaveCount(0, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Marcar listo y llamar a Avena E2E' }).first().click();
    await page
      .getByRole('button', { name: 'Marcar entregado el pedido de Avena E2E' })
      .first()
      .click();
    await expect(
      page.getByRole('button', { name: 'Marcar entregado el pedido de Avena E2E' }),
    ).toHaveCount(0, { timeout: 30_000 });

    /**
     * 2b · UN APARTADO DEL MENÚ PÚBLICO, DE PUNTA A PUNTA (C.14 de la 2.4).
     *
     * «Se reserva sin pago y se cobra al recoger.» La clienta, SIN sesión, aparta desde
     * `/n/<slug>/pedir`; el personal lo prepara —la comanda llega a la barra ANTES del
     * pago—, lo cobra al recoger y lo entrega. Antes el menú público no leía nada sin
     * sesión y sólo redactaba el pedido para copiarlo.
     */
    const slug = process.env['MORPHIQPOS_ORG_DEMO'] ?? 'demo-acople-cafeteria';
    const origen = new URL(page.url()).origin;
    const menu = (await (
      await page.request.get(`${origen}/api/publico/negocio/${slug}/menu`)
    ).json()) as {
      readonly datos?: {
        readonly productos?: readonly {
          readonly nombre: string;
          readonly precioCentavos: string;
          readonly disponible: boolean;
        }[];
      };
    };
    const apartable = menu.datos?.productos?.find(
      (p) => p.disponible && Number(p.precioCentavos) > 0,
    );
    expect(
      apartable,
      'El menú público de la cafetería no trae ningún producto disponible: sin sesión no se ' +
        'puede apartar nada. Sale de `/api/publico/negocio/<slug>/menu`.',
    ).toBeDefined();
    const apartadoCentavos = Number(apartable!.precioCentavos);

    const sinSesion = await browser.newContext();
    const clienta = await sinSesion.newPage();
    await clienta.goto(`${origen}/n/${slug}/pedir`);
    await clienta.getByRole('button', { name: apartable!.nombre }).first().click();
    await clienta
      .getByRole('button', { name: /^\d{2}:\d{2}$/ })
      .first()
      .click();
    await clienta.getByLabel('Tu nombre').fill('Apartado E2E');
    await clienta.getByRole('button', { name: 'Apartar' }).click();
    await expect(
      clienta.getByRole('heading', { name: 'Apartado' }),
      'La clienta tocó «Apartar» sin sesión y no quedó apartado.',
    ).toBeVisible({ timeout: 30_000 });
    // Con el vocabulario de la cafetería aunque no haya sesión: sin él decía «se paga
    // al recogerlo en .», la barra sin nombre.
    await expect(clienta.getByText(/Se paga al recogerlo en la barra\./)).toBeVisible();
    await sinSesion.close();

    // Del lado de quien cobra: el apartado está en su lista, con su nombre.
    await abrirPantalla(page, '/cafeteria/cobrar', /Cobrar|Turno cerrado/);
    const apartados = page.getByRole('region', { name: 'Apartados de hoy' });
    const suRenglon = apartados.getByRole('row', { name: /Apartado E2E/ }).last();
    await expect(
      suRenglon,
      'El apartado de la clienta no aparece en «Apartados» del mostrador.',
    ).toBeVisible({ timeout: 30_000 });

    // PREPARAR: la comanda llega a la barra antes del pago.
    await suRenglon.getByRole('button', { name: 'Preparar' }).click();
    const cobrarApartado = suRenglon.getByRole('link', { name: 'Cobrar' });
    await expect(cobrarApartado).toBeVisible({ timeout: 30_000 });
    const ordenDelApartado = new URL(
      (await cobrarApartado.getAttribute('href')) ?? '',
      origen,
    ).searchParams.get('pedido');
    const comandas = await consultarPuente<{ readonly venta_id?: string }>(
      page,
      'PedidoPreparacion',
      { filtro: { venta_id: ordenDelApartado }, limite: 5 },
    );
    expect(
      comandas.length,
      'Se tocó «Preparar» y la barra no recibió la comanda del apartado: sin ella, el ' +
        'apartado se prepararía hasta cobrarlo y no adelantaría nada.',
    ).toBeGreaterThan(0);

    // COBRAR AL RECOGER, en el cobro de ESA orden. La orden ya existía —nació al
    // apartar—, así que no es una venta NUEVA: se comprueba ESA, que quede pagada con su
    // total.
    await cobrarApartado.click();
    await page.getByRole('button', { name: 'Sin propina' }).first().click();
    await page.getByRole('button', { name: /^COBRAR/ }).click();
    await expect
      .poll(
        async () => {
          const [venta] = await consultarPuente<{
            readonly estado?: string;
            readonly total?: number;
          }>(page, 'Venta', { filtro: { id: ordenDelApartado }, limite: 1 });
          return `${venta?.estado ?? ''} ${String(Math.round((venta?.total ?? 0) * 100))}`;
        },
        {
          message: 'Se cobró el apartado al recogerlo y su orden no quedó pagada con su total.',
          timeout: 30_000,
        },
      )
      .toBe(`pagada ${String(apartadoCentavos)}`);

    // Y ENTREGAR, que ya se puede: está cobrado.
    await abrirPantalla(page, '/cafeteria/cobrar', /Cobrar|Turno cerrado/);
    const cobrado = page
      .getByRole('region', { name: 'Apartados de hoy' })
      .getByRole('row', { name: /Apartado E2E/ })
      .last();
    await cobrado.getByRole('button', { name: 'Entregar' }).click();
    await expect(
      page.getByRole('region', { name: 'Apartados de hoy' }).getByRole('row', {
        name: /Apartado E2E/,
      }),
      'Se entregó el apartado y sigue en la lista de pendientes.',
    ).toHaveCount(0, { timeout: 30_000 });

    // El cierre, con su arqueo. El esperado lo calcula el servidor sumando los
    // movimientos del turno: la apertura con su fondo, la venta en efectivo y el
    // apartado, cobrado al recogerlo.
    await abrirPantalla(
      page,
      '/cafeteria/cierre-de-turno-y-arqueo',
      /Cierre de turno|No hay ningún turno/,
    );
    const esperadoCentavos = FONDO_CENTAVOS + precioCentavos + latteDeAvena + apartadoCentavos;
    await page.locator('#cierre-efectivo').fill((esperadoCentavos / 100).toFixed(2));
    // El bote de propina va a cero: esta venta no dejó propina, y el cierre exige
    // contar los dos antes de enseñar nada.
    await page.locator('#cierre-bote').fill('0');
    // Lo que se queda en el cajón para el turno siguiente, como CAMPO (C.6 de la 2.4).
    await page.locator('#cierre-dejado').fill((FONDO_CENTAVOS / 100).toFixed(2));
    await page.getByRole('button', { name: 'CERRAR TURNO' }).click();

    await expect(
      page.getByText(`Cajón · esperado ${enPesos(esperadoCentavos)}`),
      `El arqueo del turno no cuadra. Se abrió con ${enPesos(FONDO_CENTAVOS)} y se cobró ` +
        `${enPesos(precioCentavos)} en efectivo.`,
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('cuadró exacto').first()).toBeVisible();

    // LA COMISIÓN DE LA TERMINAL (C.10 de la 2.4): si el negocio no la ha dicho, el cierre
    // la pregunta aquí mismo, y desde entonces el corte la estima.
    const tasa = page.getByLabel('Cuánto cobra tu terminal (%)');
    if (await tasa.isVisible()) {
      await tasa.fill('3.6');
      await page.getByRole('button', { name: 'Guardar la tasa' }).click();
      await expect(tasa).toHaveCount(0, { timeout: 30_000 });
    }
    await expect(page.getByText('Comisión estimada').first()).toBeVisible();

    // Y EL PDF DEL TURNO (F-234). La descarga sola espera el reparto del bote —bajado
    // antes, saldría sin él—; aquí no hubo propina que repartir, así que se pide con el
    // botón, como lo haría quien cierra.
    await exigirElPdfDelCorte(page, {
      titulo: 'CORTE DE TURNO',
      pulsando: true,
      textos: [
        'Apertura, fondo y cambio',
        `Dinero dejado en caja ${enPesos(FONDO_CENTAVOS)}`,
        `Efectivo esperado ${enPesos(esperadoCentavos)}`,
        'Ventas por canal',
        'Bebidas vendidas',
      ],
    });

    // Y SE REIMPRIME DESDE EL HISTORIAL (C.10 de la 2.4): el turno que se acaba de cerrar
    // abre su corte en `Turno`, con el mismo PDF, sin bajarse solo.
    await abrirPantalla(page, '/cafeteria/turno', /Turno/);
    await page.getByRole('tab', { name: 'Historial' }).click();
    await page
      .getByRole('row')
      .filter({ has: page.getByRole('cell') })
      .filter({ hasNotText: 'en curso' })
      .first()
      .click();
    await exigirElPdfDelCorte(page, {
      titulo: 'CORTE DE TURNO',
      pulsando: true,
      textos: [`Efectivo esperado ${enPesos(esperadoCentavos)}`],
    });

    // ── 3 · CON LA PLANTILLA DE JACARANDA · sala, pero hablando de café ───
    await cambiarDePlantilla(page, 'restaurante');
    await abrirPantalla(page, '/', /Buen día|Turno/);
    const conSala = await menuLateral(page);

    await exigirVocabulario(conSala, {
      propios: [
        ['producto', 'Productos'],
        // Aquí está la demostración: la entrada `/mesero` de la plantilla del
        // restaurante, nombrada por el diccionario de la cafetería.
        ['responsable', 'Baristas'],
        // Y `preparacion` → «barra». En un restaurante esta misma entrada dice
        // «Cocinas»; aquí la cocina está a un metro y es la misma persona.
        ['preparacion', 'Barras'],
      ],
      ajenos: DE_OTROS_MODELOS,
    });

    // ── 4 · SU DICCIONARIO, el que las pantallas leen desde E2.4 ──────────
    // Las palabras están tecleadas a mano y NO se importan de `diccionarios.ts`: una
    // prueba que afirma contra la misma constante que produce el valor no prueba nada.
    // Si alguien renombra «bebida» a «producto» en el diccionario de cafetería, esta
    // prueba se cae y hay que venir a decidirlo aquí.
    await exigirVocabularioDelGiro(page, [
      // El objeto que este giro construyó: el cliente ya pagó y espera de pie (F-328).
      // Nunca «mesa» — en un mostrador no hay ninguna.
      ['unidad_servicio', 'pedido'],
      ['orden', 'cuenta'],
      // Lo que se apunta es una BEBIDA, que es lo que se pide en una cafetería.
      ['linea_orden', 'bebida'],
      ['responsable', 'barista'],
      ['cliente', 'cliente'],
      // Y la que la separa de una tiendita: aquí SÍ se prepara, y se prepara en la
      // barra. En una tienda esta entidad está apagada.
      ['preparacion', 'barra'],
    ]);

    // ── 5 · Y SE DEJA COMO ESTABA ─────────────────────────────────────────
    // La demo de este modelo es `cafeteria`, y dejarla en `restaurante` haría que la
    // siguiente corrida empezara desde otra plantilla — y que las trece pantallas del
    // paso 2 acabaran redirigidas. Una prueba que cambia la configuración del negocio
    // la devuelve.
    await cambiarDePlantilla(page, 'cafeteria');

    exigirSinFallos();
  });
});
