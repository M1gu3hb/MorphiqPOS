import { expect, test } from '@playwright/test';

import {
  abrirCajaPorLaRuta,
  abrirPantalla,
  type MarcaDePantalla,
  accionesDelTablero,
  cabecerasDeEscrituraDePrueba,
  cambiarDePlantilla,
  cerrarCajaYCuadrar,
  consultarPuente,
  entrar,
  exigirCobroAceptado,
  exigirDemostracion,
  exigirGiro,
  exigirInventarioMovido,
  exigirVentaCobrada,
  exigirVocabulario,
  menuLateral,
  soltarLaCaja,
  ventasDeAntes,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/** El fondo con el que la prueba abre la caja del restaurante, en centavos. */
const FONDO_CENTAVOS = 50_000;

/** Lo que la prueba necesita de una mesa y de un platillo. */
interface MesaDelPuente {
  readonly id?: string;
  readonly numero?: number;
  readonly estado?: string;
}

interface PlatilloDelPuente {
  readonly id?: string;
  readonly nombre?: string | null;
  readonly precio_venta?: number | null;
}

/**
 * Modelo 1 de 5 · RESTAURANTE DE MESA · giro `restaurante`, plantilla `restaurante`.
 *
 * ── QUÉ DEMUESTRA ──────────────────────────────────────────────────────────
 * Que un restaurante lee «Platillos», «Meseros» y «Cocinas» donde una ferretería lee
 * «Materiales» y una tiendita lee «Productos», y que además TIENE las pantallas de
 * sala —mesero y cocina— que ninguna otra plantilla tiene.
 *
 * ── POR QUÉ ESO IMPORTA, y no es una prueba de textos ──────────────────────
 * Porque `restaurante` es la ÚNICA de las CINCO plantillas que incluye el bloque de
 * sala entero: `MODULOS_POR_PLANTILLA` le da `mesas`, `mesero`, `cocina` y `barra`, y
 * a las otras cuatro no —la cafetería tiene `barra` y nada más, porque en un mostrador
 * quien cobra es quien prepara—. Si esa diferencia no se ve en el menú, entonces la
 * plantilla no decide nada y todas son la misma con distinto nombre —que es exactamente
 * lo que eran antes de D-01, cuando se llamaban `esencial`, `operativo` y
 * `restaurante_pro` y sólo describían un precio, y lo que seguían siendo dos de las
 * tres hasta la 166, cuando `tienda` y `cafeteria` traían los mismos 28 módulos—.
 *
 * Y porque este modelo es la raíz del arquetipo A2: doce modelos de alimentos heredan
 * de él. Un vocabulario mal enganchado aquí no se equivoca una vez, se equivoca doce.
 *
 * ── QUÉ NO PRUEBA, para que nadie lo lea de más ────────────────────────────
 * No prueba que se pueda abrir una mesa ni cobrar una cuenta: eso necesita mesas,
 * productos y caja abierta en la demo, y `F2.3-REGLAS §4.5` prohíbe sembrar eso en un
 * negocio vivo. Lo que prueba es lo que pide la condición 6 de `F2.3-REGLAS §8`: que
 * la plantilla se vea como suya al entrar.
 */

/** Las trece pantallas del modelo, tal como existen en `app/(modelos)/restaurante/`. */
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
  ['caja', /Caja/],
  ['cierre-diario-y-arqueo', /No hay ninguna caja abierta|Cierre diario/],
  ['cobro', /esperando cobro|Cobro/],
  // Con `i`: la cocina rotula «🕐 Nuevos (1)» y «🔥 En preparación (0)», no en
  // mayúsculas. La marca en versales no encajaba nunca y el fallo mandaba a mirar
  // una pantalla que funcionaba.
  // Aquí, con la cocina recién sembrada, lo suyo es su VACÍO: las tres columnas
  // —«🕐 Nuevos», «🔥 En preparación», «✅ Listos»— sólo se pintan cuando hay
  // comandas. Más abajo, ya con una enviada desde el salón, se exige la columna.
  ['cocina', /Sin comandas pendientes|Nuevos|En preparación/i],
  ['inventario', /alacena|Inventario/i],
  ['mapa-de-mesas', /Mesas|Libre|Ocupada/],
  // «Cuenta actual», no «Pedido actual»: la marca afirma TAMBIÉN el vocabulario
  // del giro —«pedido» es de la cafetería— y se cae el día que alguien lo cambie.
  ['mesa-activa', /Cuenta actual|Mesa/],
  ['portal-del-comensal', /QR de la mesa|carta/i],
  ['precuenta', /Aquí se imprime la precuenta|PRE-CUENTA/],
  // «Platillos», que es como un restaurante llama a su catálogo.
  ['productos', /Platillos|margen sano/],
  ['recetas', /Recetas/],
  ['registros', /Exportar|Sin cortes en este periodo/],
];

test.describe('restaurante · su vocabulario, sus pantallas y su dashboard', () => {
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

  test('la plantilla restaurante habla de mesas y platillos, y tiene sala', async ({ page }) => {
    await entrar(page);
    await exigirGiro(page, 'restaurante', 'restaurante');
    // Ninguna pantalla puede abrir en 200 y reventar por dentro.
    const exigirSinFallos = vigilarFallos(page);
    await cambiarDePlantilla(page, 'restaurante');

    // ── 1 · SU VOCABULARIO ────────────────────────────────────────────────
    // Se mira en el marco `(interno)`, que es el único sitio donde el sustantivo
    // del giro llega hoy a una pantalla (ver la cabecera del ayudante).
    await abrirPantalla(page, '/', /Buen día|Mesas/);
    const menu = await menuLateral(page);

    await exigirVocabulario(menu, {
      propios: [
        // `producto` → «platillo/platillos». El diccionario de `restaurante` traduce
        // `producto` y `linea_orden` al mismo término a propósito: lo que se vende y
        // lo que se apunta en la cuenta son la misma cosa en este giro.
        ['producto', 'Platillos'],
        // `responsable` → «mesero/meseros». Es la entrada `/mesero`, que sólo existe
        // porque esta plantilla incluye el módulo.
        ['responsable', 'Meseros'],
        // `preparacion` → «cocina/cocinas». En una cafetería la misma entrada dice
        // «Barras», y en una tienda no existe: está APAGADA en su diccionario.
        ['preparacion', 'Cocinas'],
      ],
      ajenos: [
        'Materiales',
        'Mostradoristas',
        'Productos',
        'Baristas',
        'Barras',
        'Cajeros',
        'Responsables',
      ],
    });

    // ── 2 · SUS PANTALLAS · el bloque de sala, que es lo que la separa ────
    // Las dos entradas de arriba ya son la prueba: si el módulo no estuviera, la
    // entrada no se pintaría y `etiquetaDeNavegacion` no tendría a qué ponerle
    // nombre. Aquí se afirma lo que NO puede faltarle a esta plantilla y sí les
    // falta a las otras dos, con la ruta a la vista.
    await expect(
      menu.getByRole('link', { name: 'Meseros', exact: true }),
      'La plantilla `restaurante` es la única con el bloque de sala de ' +
        '`MODULOS_POR_PLANTILLA`. Sin la entrada de mesero, esta plantilla no se ' +
        'distingue de `cafeteria`.',
    ).toHaveAttribute('href', '/mesero');
    // «Cocinas» lleva a la pantalla DEL MODELO y no a la heredada `/cocina`. Las
    // dos existen y las dos gobierna el módulo `cocina`; el menú ofrece una
    // entrada por módulo y gana la del modelo. La heredada sigue respondiendo en
    // su ruta, y es la que el menú ofrece en una plantilla que no trae la nueva.
    await expect(menu.getByRole('link', { name: 'Cocinas', exact: true })).toHaveAttribute(
      'href',
      '/restaurante/cocina',
    );

    // ── 3 · SU DASHBOARD ─────────────────────────────────────────────────
    // `heredado/pages/Dashboard.jsx` decide sus acciones por paquete: «Nueva venta»
    // lleva a `/pos` y es exclusiva de la plantilla completa; «Ir a Caja» es de
    // mostrador y aparece en las otras dos. Que el dashboard enseñe la acción
    // equivocada es lo que delata que el cambio de plantilla no llegó.
    await expect(page.getByRole('heading', { level: 1, name: 'Buen día' })).toBeVisible();
    const acciones = accionesDelTablero(page);
    await expect(acciones.getByRole('button', { name: 'Nueva venta' })).toBeVisible();
    await expect(
      acciones.getByRole('button', { name: 'Ir a Caja' }),
      'El dashboard enseña la acción de mostrador en la plantilla de restaurante. ' +
        '`isCajaDirecta` la reserva para `esencial` y `operativo`; si aparece aquí, ' +
        '`getCurrentPackage` no está reconociendo el nombre nuevo de la plantilla.',
    ).toHaveCount(0);

    // ── 4 · LAS TRECE PANTALLAS DEL MODELO RESPONDEN ──────────────────────
    for (const [pantalla, marca] of PANTALLAS) {
      await abrirPantalla(page, `/restaurante/${pantalla}`, marca);
    }

    // Y la de inicio del mesero se reconoce por lo que dice. Dos estados, porque una
    // demo recién creada no tiene mesas y el vacío de `MapaDeMesas` es tan de este
    // giro como la rejilla: «Todavía no hay mesas configuradas».
    await abrirPantalla(page, '/restaurante/mapa-de-mesas', /Mesas|Libre|Ocupada/);
    await expect(
      page
        .getByRole('heading', { name: 'Mesas', exact: true })
        .or(page.getByText('Todavía no hay mesas configuradas.'))
        .first(),
    ).toBeVisible();

    // ── 5 · UNA MESA, UN PEDIDO A COCINA, Y LA CUENTA COBRADA ─────────────
    //
    // El recorrido del encargo: abrir mesa · mandar a cocina · pedir la cuenta ·
    // cobrar. El COBRO se hace por la pantalla —es donde entra el dinero— y los
    // tres pasos de sala van por SUS PROPIAS RUTAS, las mismas que usan esas
    // pantallas, por dos razones que conviene decir en vez de esconder:
    //
    //  · `mapa-de-mesas` se monta SIN `onAbrirMesa`: el componente acepta el
    //    callback y la página no se lo pasa, así que tocar una mesa libre no
    //    abre nada. Es un cabo suelto del acople, no de esta prueba.
    //  · `precuenta` imprime con `/api/restaurante/imprimir-precuenta`, **una
    //    ruta que no existe**; el cambio de estado que sí importa —«el cliente
    //    pide pagar»— lo hace `solicitar-cuenta`, que sí existe.
    //
    // Los dos están en el reporte con nombre y apellido.
    await abrirCajaPorLaRuta(page, FONDO_CENTAVOS);

    /**
     * UNA MESA LIBRE, y que lo esté de verdad.
     *
     * La variable se llamaba `libre` y cogía la PRIMERA mesa: `m.id !== ''`. Con la
     * mesa 1 ocupada por una corrida anterior, abrirla contestaba «la mesa 1 ya está
     * abierta» y el recorrido no arrancaba. El estado lo sirve el puente; usarlo es
     * lo que hace la corrida repetible sin volver a sembrar.
     */
    const mesas = await consultarPuente<MesaDelPuente>(page, 'Mesa', { limite: 30 });
    const libre = mesas.find((m) => (m.id ?? '') !== '' && m.estado === 'libre');
    expect(
      libre,
      `La demo de restaurante no tiene ninguna mesa libre (${String(mesas.length)} mesas, estados: ` +
        `${[...new Set(mesas.map((m) => m.estado ?? '?'))].join(', ')}). Sin mesa libre no hay ` +
        'cuenta que abrir: vuelve a sembrarla con `scripts/sembrar-demos.mjs --solo ' +
        'demo-acople-restaurante`.',
    ).toBeDefined();

    const platillos = await consultarPuente<PlatilloDelPuente>(page, 'ProductoTerminado', {
      limite: 60,
    });
    const platillo = platillos.find((p) => (p.nombre ?? '') !== '' && (p.precio_venta ?? 0) > 0);
    expect(platillo, 'La demo de restaurante no tiene platillos con precio.').toBeDefined();
    const precioCentavos = Math.round((platillo?.precio_venta ?? 0) * 100);

    const idsDeAntes = await ventasDeAntes(page);

    // 5.1 · ABRIR LA MESA. Dos personas, que es la mesa más común.
    const apertura = await page.request.post('/api/restaurante/abrir-mesa', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: { mesaId: libre?.id, personas: 2 },
    });
    expect(
      apertura.status(),
      `No se pudo abrir la mesa: ${(await apertura.text()).slice(0, 300)}`,
    ).toBe(200);
    const ordenId = ((await apertura.json()) as { datos?: { ordenId?: string } }).datos?.ordenId;
    expect(ordenId, 'Abrir la mesa no devolvió la cuenta que abrió.').toBeTruthy();

    // 5.2 · MANDAR A COCINA. Es el paso que convierte una mesa en trabajo.
    const pedido = await page.request.post('/api/restaurante/enviar-pedido', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: { ordenId, lineas: [{ productoId: platillo?.id, cantidad: '1' }] },
    });
    expect(
      pedido.status(),
      `No se pudo mandar el pedido a cocina: ${(await pedido.text()).slice(0, 300)}`,
    ).toBe(200);

    // Y la cocina LO VE. Se comprueba en su pantalla, que es donde importa.
    // Y aquí NO vale el vacío: se acaba de enviar el pedido, así que la columna de
    // nuevos tiene que existir. Es la misma pantalla con una exigencia más alta.
    await abrirPantalla(page, '/restaurante/cocina', /Nuevos|En preparación/i);
    await expect(
      page.getByText(platillo?.nombre ?? '').first(),
      `La cocina no ve «${platillo?.nombre ?? ''}» después de mandarle el pedido. Una comanda que ` +
        'no llega a la cocina es comida que nunca sale.',
    ).toBeVisible({ timeout: 20_000 });

    // 5.3 · LA CUENTA, POR FAVOR. Sin propina: es voluntaria y se elige después.
    const cuenta = await page.request.post('/api/restaurante/solicitar-cuenta', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: { ordenId },
    });
    expect(
      cuenta.status(),
      `No se pudo pedir la cuenta: ${(await cuenta.text()).slice(0, 300)}`,
    ).toBe(200);

    // 5.4 · Y EL COBRO, POR LA PANTALLA DEL CAJERO.
    await abrirPantalla(page, '/restaurante/cobro', /Cobro|esperando cobro/);
    await expect(
      page.getByRole('region', { name: 'Cobro' }),
      'La pantalla de cobro no encontró ninguna cuenta esperando pago, con una cuenta recién ' +
        'cerrada. `solicitar_cuenta` la deja en `cuenta_solicitada` y esta pantalla busca ésa.',
    ).toBeVisible({ timeout: 20_000 });

    // La propina se confirma antes de cobrar, y «Sin» pesa lo mismo que los
    // porcentajes porque es voluntaria.
    const sinPropina = page.getByRole('button', { name: /^Sin/ });
    if ((await sinPropina.count()) > 0) await sinPropina.first().click();

    await page.getByRole('button', { name: 'efectivo', exact: false }).first().click();
    await page.getByRole('button', { name: /^COBRAR/ }).click();

    // El reposo de esta pantalla es el acuse: «Cobrado · cambio … · la mesa pasa
    // sola a limpieza».
    await exigirCobroAceptado(page, /Cobrado · cambio/);

    const venta = await exigirVentaCobrada(page, precioCentavos, idsDeAntes);
    await exigirInventarioMovido(page, venta.id ?? '', platillo?.nombre ?? '');

    /**
     * Y LA MESA PASÓ A LIMPIEZA, que es lo que el acuse acaba de prometer.
     *
     * No pasaba: `venta.cobrar` no tocaba `mesas`, así que la mesa se quedaba en
     * `cuenta_solicitada` con su cuenta ya pagada. El mapa enseñaba «la cuenta está
     * pedida» sobre una cuenta pagada y `abrir_mesa` contestaba «ya está abierta»
     * para siempre: **la mesa no volvía al servicio**. Se vio corriendo esto dos
     * veces sobre la misma demo.
     */
    await expect
      .poll(
        async () => {
          const ahora = await consultarPuente<MesaDelPuente>(page, 'Mesa', {
            filtro: { id: libre?.id },
            limite: 1,
          });
          return ahora[0]?.estado ?? '';
        },
        {
          message:
            'Se cobró la cuenta y la mesa no pasó a limpieza. El acuse de la pantalla lo promete ' +
            'con esas palabras, y si no ocurre la mesa queda fuera de servicio hasta que alguien ' +
            'se acuerde de pulsar «mesa limpia».',
          timeout: 20_000,
        },
      )
      .toBe('limpieza');

    /**
     * Y EL GARROTERO LA DEVUELVE AL SERVICIO.
     *
     * De limpieza a libre lo da quien limpia —`restaurante.liberar_mesa`, el botón
     * «mesa limpia»— y es el último paso del ciclo de una mesa: sin él, la mesa se
     * queda recogida y nadie la puede sentar. Es además lo que hace repetible esta
     * corrida, igual que cerrar la caja.
     */
    const limpia = await page.request.post('/api/restaurante/liberar-mesa', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: { mesaId: libre?.id },
    });
    expect(
      limpia.status(),
      `No se pudo devolver la mesa al servicio: ${(await limpia.text()).slice(0, 300)}. Desde una ` +
        'cuenta ya pagada `liberar_mesa` no tiene nada que cancelar, así que un fallo aquí deja ' +
        'la mesa fuera de servicio.',
    ).toBe(200);

    const devuelta = await consultarPuente<MesaDelPuente>(page, 'Mesa', {
      filtro: { id: libre?.id },
      limite: 1,
    });
    expect(
      devuelta[0]?.estado,
      'La mesa se marcó limpia y no volvió a `libre`: el ciclo de la mesa no se cierra.',
    ).toBe('libre');

    await cerrarCajaYCuadrar(page, FONDO_CENTAVOS + precioCentavos);

    exigirSinFallos();
  });
});
