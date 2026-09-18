import { expect, test } from '@playwright/test';

import {
  abrirCajaPorLaRuta,
  abrirPantalla,
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
const PANTALLAS = [
  'acceso-por-pin',
  'caja',
  'cierre-diario-y-arqueo',
  'cobro',
  'cocina',
  'inventario',
  'mapa-de-mesas',
  'mesa-activa',
  'portal-del-comensal',
  'precuenta',
  'productos',
  'recetas',
  'registros',
] as const;

test.describe('restaurante · su vocabulario, sus pantallas y su dashboard', () => {
  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info);
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
    await abrirPantalla(page, '/');
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
    for (const pantalla of PANTALLAS) {
      await abrirPantalla(page, `/restaurante/${pantalla}`);
    }

    // Y la de inicio del mesero se reconoce por lo que dice. Dos estados, porque una
    // demo recién creada no tiene mesas y el vacío de `MapaDeMesas` es tan de este
    // giro como la rejilla: «Todavía no hay mesas configuradas».
    await abrirPantalla(page, '/restaurante/mapa-de-mesas');
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

    const mesas = await consultarPuente<MesaDelPuente>(page, 'Mesa', { limite: 30 });
    const libre = mesas.find((m) => (m.id ?? '') !== '');
    expect(
      libre,
      'La demo de restaurante no tiene mesas. `alta-negocio` crea la sala con sus mesas: sin ' +
        'mesa no hay cuenta que abrir.',
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
    await abrirPantalla(page, '/restaurante/cocina');
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
    await abrirPantalla(page, '/restaurante/cobro');
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

    await cerrarCajaYCuadrar(page, FONDO_CENTAVOS + precioCentavos);

    exigirSinFallos();
  });
});
