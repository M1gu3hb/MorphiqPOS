import { expect, test } from '@playwright/test';

import {
  abrirLaCajaSiHaceFalta,
  abrirPantalla,
  accionesDelTablero,
  cambiarDePlantilla,
  consultarPuente,
  entrar,
  exigirDemostracion,
  exigirGiro,
  exigirCobroAceptado,
  exigirInventarioMovido,
  exigirVentaCobrada,
  exigirVocabulario,
  menuLateral,
  totalEnPantalla,
  ventasDeAntes,
  vigilarFallos,
} from './ayudantes/sesion.ts';

/**
 * El fondo con el que la prueba abre su caja.
 *
 * En centavos porque todo el dinero del sistema está en centavos, y redondo para
 * que el arqueo del final se pueda leer de un vistazo: fondo + venta = esperado.
 */
const FONDO_CENTAVOS = 50_000;

/** Pesos como los pinta la pantalla: `$500.00`. */
function enPesos(centavos: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
    centavos / 100,
  );
}

/** Lo que la pantalla de cobro lee del catálogo, y lo que esta prueba necesita. */
interface ProductoDelPuente {
  readonly id?: string;
  readonly nombre?: string | null;
  readonly precio_venta?: number | null;
}

/**
 * Modelo 3 de 5 · ABARROTES / TIENDA DE CONVENIENCIA · giro `tienda`, plantilla `tienda`.
 *
 * ── QUÉ DEMUESTRA ──────────────────────────────────────────────────────────
 * Que la plantilla `tienda` es una tienda de verdad y no el `esencial` de antes con
 * otro nombre: trae el bloque de OPERACIÓN entero —inventario, compras, recetas— y no
 * trae nada de sala. Y que su vocabulario es el de una tiendita: «Productos», no
 * «Materiales» ni «Platillos».
 *
 * ── POR QUÉ ESO IMPORTA ────────────────────────────────────────────────────
 * Por D-01, con todas sus letras: *una tienda sin inventario no es una tienda, es una
 * calculadora*. El `esencial` viejo vendía sin controlar stock, y el renombre a
 * `tienda` sólo es honesto si viene con inventario, compras y costo. Esa frase es una
 * decisión de producto que se cumple o no se cumple en una sola pantalla —el menú— y
 * hasta hoy nadie la había mirado en un navegador.
 *
 * Y porque este modelo es la raíz del arquetipo A1: dieciocho modelos de retail
 * heredan de él. Lo que quede flojo aquí se reescribe dieciocho veces.
 *
 * ── LO QUE NO SE PUEDE MIRAR TODAVÍA, y por qué se dice en vez de callarlo ─
 * El rasgo más propio del diccionario de `tienda` es lo que APAGA: no declara
 * `unidad_servicio` ni `preparacion`, porque una tienda no tiene mesa ni cocina, y la
 * regla 3 del sistema de diseño dice que lo que un giro no usa no se traduce, se
 * apaga. Eso no se puede ver en el menú: las dos entradas que nombrarían esas
 * entidades —`/mesero` y `/cocina`— pertenecen al bloque de sala, que esta plantilla
 * no incluye, así que desaparecen por MÓDULO antes de que el vocabulario tenga algo
 * que decir. El apagado se prueba en `packages/domain/src/vocabulario/`, no aquí.
 */

/** Las once pantallas del modelo, tal como existen en `app/(modelos)/abarrotes/`. */
const PANTALLAS = [
  'alta-rapida-de-producto',
  'caja',
  'cobrar',
  'conteo',
  'cortes',
  'entradas',
  'existencias',
  'fiado',
  'producto',
  'registros',
  'servicios',
] as const;

test.describe('abarrotes · su vocabulario, sus pantallas y su dashboard', () => {
  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info);
  });

  test('la plantilla tienda trae operación, habla de productos y COBRA una venta', async ({
    page,
  }) => {
    await entrar(page);
    await exigirGiro(page, 'tienda', 'abarrotes');
    // Ninguna pantalla puede abrir en 200 y reventar por dentro.
    const exigirSinFallos = vigilarFallos(page);
    await cambiarDePlantilla(page, 'tienda');

    // ── 1 · SU VOCABULARIO ────────────────────────────────────────────────
    await abrirPantalla(page, '/');
    const menu = await menuLateral(page);

    await exigirVocabulario(menu, {
      // `producto` → «producto/productos». Es lo que vende Don Chuy y es lo que la
      // entrada tiene que decir.
      propios: [['producto', 'Productos']],
      ajenos: [
        // «Materiales» es la que importa de esta lista, y no es un ajeno cualquiera:
        // Abarrotes Don Chuy y Ferretería La Broca comparten ESTA MISMA plantilla y
        // no comparten vocabulario. Si aquí saliera «Materiales», el diccionario se
        // estaría resolviendo por plantilla —que es lo que decía D-04 y resultó
        // falso— y no por giro.
        'Materiales',
        'Mostradoristas',
        'Platillos',
        'Meseros',
        'Cocinas',
        'Baristas',
        'Barras',
        'Responsables',
      ],
    });

    // ── 2 · SUS PANTALLAS · la operación SÍ, la sala NO ───────────────────
    // La mitad positiva es la que sostiene D-01. Si estas tres entradas faltaran, la
    // plantilla `tienda` sería el `esencial` de siempre con nombre nuevo.
    // «Existencias» y no «Inventario»: la plantilla `tienda` trae su PROPIA pantalla
    // de inventario —`/abarrotes/existencias`, con el conteo por peso y el dinero
    // dormido— y el menú ofrece una entrada por módulo, así que la heredada
    // `/inventario` cede el sitio a la del modelo. La pantalla vieja sigue
    // respondiendo; lo que cambia es a cuál lleva el menú.
    for (const [etiqueta, ruta] of [
      ['Existencias', '/abarrotes/existencias'],
      ['Compras', '/compras'],
      ['Recetas', '/recetas'],
    ] as const) {
      await expect(
        menu.getByRole('link', { name: etiqueta, exact: true }),
        `Falta «${etiqueta}» en el menú de la plantilla \`tienda\`. D-01: «una tienda sin ` +
          'inventario no es una tienda, es una calculadora». `MODULOS_POR_PLANTILLA.tienda` ' +
          'es base + OPERACIÓN entera, a propósito.',
      ).toHaveAttribute('href', ruta);
    }

    // Y la mitad negativa: nada de sala. Aquí se nombran las entradas con la etiqueta
    // que tendrían EN ESTE GIRO —«Cajeros» para `responsable`, y «Cocina» de reserva
    // porque `preparacion` está apagada y `etiquetaDeNavegacion` cae a la etiqueta de
    // siempre antes que dejar un hueco en blanco—.
    for (const deSala of ['Cajeros', 'Cocina']) {
      await expect(
        menu.getByRole('link', { name: deSala, exact: true }),
        `El menú enseña «${deSala}» con la plantilla \`tienda\`, que no incluye el bloque ` +
          'de sala. La decisión pasa por dos sitios, y falla en el primero de los dos que ' +
          'se haya roto: `leerConfiguracion` en packages/app/src/puente/configuracion.ts ' +
          'sirve `paquete_modo` ya normalizado con `plantillaDeOrganizacion`, y ' +
          '`normalizarPlantilla` en heredado/lib/packageConfig.js traduce los tres nombres ' +
          'viejos y cae en `tienda` ante cualquier otro. Si aparece la sala, uno de los dos ' +
          'volvió a caer en la plantilla MÁS PERMISIVA, que abre módulos que este negocio ' +
          'no contrató.',
      ).toHaveCount(0);
    }

    // ── 3 · SU DASHBOARD · el de mostrador ───────────────────────────────
    await expect(page.getByRole('heading', { level: 1, name: 'Buen día' })).toBeVisible();
    const acciones = accionesDelTablero(page);
    await expect(acciones.getByRole('button', { name: 'Ir a Caja' })).toBeVisible();
    await expect(acciones.getByRole('button', { name: 'Nueva venta' })).toHaveCount(0);

    // ── 4 · LAS ONCE PANTALLAS DEL MODELO RESPONDEN ───────────────────────
    for (const pantalla of PANTALLAS) {
      await abrirPantalla(page, `/abarrotes/${pantalla}`);
    }

    // ── 5 · SE COBRA UNA VENTA, Y EL DINERO CUADRA ────────────────────────
    //
    // Hasta aquí esto demostraba que las pantallas ABREN. Eso no es una tienda
    // funcionando: una tienda funcionando es que entre dinero y que cuadre. Y la
    // pantalla de cobro tenía TRES estados aceptados —caja cerrada, catálogo
    // vacío, o la venta armándose—, así que pasaba con la caja cerrada. Un muro
    // no es una venta.
    // La caja de ESTA terminal, primero. La que la semilla dejó abierta es de
    // otra —una sesión de caja pertenece a una terminal, y la terminal nace
    // cuando este navegador entra por primera vez— así que aquí se hace lo que
    // hace un cajero al empezar el turno.
    await abrirLaCajaSiHaceFalta(page, '/abarrotes/caja', (FONDO_CENTAVOS / 100).toFixed(2));

    await abrirPantalla(page, '/abarrotes/cobrar');

    // El producto sale del CATÁLOGO, no de un nombre escrito aquí: la pantalla
    // lee `ProductoTerminado` y esto lee lo mismo, así que si mañana la semilla
    // cambia los nombres, la prueba sigue valiendo. Se pide uno con existencia
    // porque de paso se comprueba que la existencia BAJA.
    const catalogo = await consultarPuente<ProductoDelPuente>(page, 'ProductoTerminado', {
      limite: 50,
    });
    const elegido = catalogo.find((p) => (p.nombre ?? '') !== '' && (p.precio_venta ?? 0) > 0);
    expect(
      elegido,
      'La demo de tienda no tiene ningún producto con nombre y precio, así que no hay nada ' +
        'que cobrar. Siémbrala otra vez: `pnpm db:seed --org demo-acople-tienda`.',
    ).toBeDefined();
    const producto = elegido!;
    const nombre = producto.nombre ?? '';

    const idsDeAntes = await ventasDeAntes(page);

    // Se escribe el nombre y Enter lo agrega. `fill` y no `type` a propósito: el
    // teclado de esta pantalla mide el RITMO para distinguir al lector de código
    // de barras de una mano, y `type` teclea tan seguido que la ráfaga se
    // tomaría por un escaneo del texto escrito —que no es ningún código— y
    // saldría «no está en el catálogo».
    const busqueda = page.getByLabel('Código o nombre · F2');
    await busqueda.fill(nombre);
    await expect(page.getByText(`Enter agrega: ${nombre}`)).toBeVisible();
    await busqueda.press('Enter');

    // La línea está en la venta, con su cantidad.
    const enCurso = page.getByRole('region', { name: /en curso$/ });
    await expect(enCurso.getByText(nombre, { exact: false }).first()).toBeVisible();

    // EL TOTAL QUE DICE LA PANTALLA. Es el número que se dice en voz alta, y es
    // contra éste contra el que se compara lo que quedó en la base.
    const totalCentavos = await totalEnPantalla(page);
    // El puente sirve el dinero en PESOS —`conversion: 'dinero'` divide por cien—
    // y la pantalla lo pinta en pesos pero aquí se lee en centavos. Comparar sin
    // convertir daba «esperaba 42.9 y encontré 4290», que es el mismo dinero.
    const precioCentavos = Math.round((producto.precio_venta ?? 0) * 100);
    expect(
      totalCentavos,
      `El total de la pantalla no es el precio del producto. Precio: ${String(precioCentavos)} ` +
        `centavos; total: ${String(totalCentavos)}. Una pieza de un producto cuesta lo que cuesta.`,
    ).toBe(precioCentavos);

    // COBRAR → efectivo → «Exacto» → CONFIRMAR. Es el recorrido del mostrador,
    // por los mismos botones que toca un cajero.
    await page.getByRole('button', { name: 'COBRAR' }).click();
    await page.getByRole('button', { name: 'Exacto' }).click();
    await expect(page.getByLabel('Recibí')).toHaveValue(
      (totalCentavos / 100).toFixed(2),
      // Si «Exacto» no pone el total, el cambio sale negativo y CONFIRMAR está
      // desactivado: el fallo diría «no se pudo pulsar el botón».
    );
    await page.getByRole('button', { name: 'CONFIRMAR' }).click();

    // La pantalla vuelve a su reposo —«Escanea el primer producto»— o dice por
    // qué no. Lo segundo se lee y se cuenta; no se espera 45 s a que la base
    // desmienta lo que la pantalla ya explicó.
    await exigirCobroAceptado(page, /Escanea el primer/);

    // ── Y AQUÍ SE COMPRUEBA QUE EL DINERO CUADRÓ ──────────────────────────
    // Contra el SERVIDOR, no contra la pantalla: la pantalla se queda en blanco
    // al cobrar bien y también se quedaría en blanco si el comando fallara y
    // alguien se hubiera comido el error.
    const venta = await exigirVentaCobrada(page, totalCentavos, idsDeAntes);

    // ── 6 · EL CORTE · que el dinero cuadre de verdad ─────────────────────
    //
    // Aquí es donde «el dinero cuadró» deja de ser una frase: el esperado del
    // cajón tiene que ser EL FONDO MÁS LA VENTA, al centavo, y lo dice la propia
    // pantalla de corte sin que la prueba se lo sugiera.
    //
    // Y además **deja la caja cerrada**, que es lo que hace repetible la corrida:
    // la base permite una sesión abierta por sucursal, y cada navegador nuevo
    // trae su propia terminal, así que una caja que se queda abierta bloquea la
    // siguiente corrida entera —abrir revienta contra el índice y cobrar contesta
    // «Abre la caja antes de cobrar»—.
    await abrirPantalla(page, '/abarrotes/cortes');

    const esperadoCentavos = FONDO_CENTAVOS + totalCentavos;
    // El desglose se cuenta en «centavos sueltos» a propósito: contar por
    // denominaciones exige que $542.90 se pueda armar con billetes, y lo que se
    // prueba aquí es la aritmética del arqueo, no la de dar cambio.
    await page.locator('#sueltos').fill((esperadoCentavos / 100).toFixed(2));
    await expect(page.getByText(`Contado ${enPesos(esperadoCentavos)}`)).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar el turno' }).click();

    await expect(
      page.getByRole('heading', { name: 'Turno cerrado' }),
      'El turno no se cerró. La caja se queda abierta y la siguiente corrida no podrá abrir la ' +
        'suya: la base permite UNA sesión abierta por sucursal.',
    ).toBeVisible({ timeout: 30_000 });

    // El esperado lo calcula el servidor sumando los movimientos de caja. Si no
    // es el fondo más la venta, o la venta no entró al cajón o el fondo no se
    // guardó: las dos cosas son dinero que no cuadra a fin de turno.
    await expect(
      page.getByText(
        `Esperado ${enPesos(esperadoCentavos)} · contado ${enPesos(esperadoCentavos)}`,
      ),
      `El arqueo no cuadra. Se abrió con ${enPesos(FONDO_CENTAVOS)}, se cobró ` +
        `${enPesos(totalCentavos)} en efectivo, así que el esperado tiene que ser ` +
        `${enPesos(esperadoCentavos)}.`,
    ).toBeVisible();
    await expect(page.getByText('Cuadra exacto')).toBeVisible();

    // Y EL INVENTARIO BAJÓ, por ESTA venta. Es D-01 con dinero: «una tienda sin
    // inventario no es una tienda, es una calculadora».
    const movimientos = await exigirInventarioMovido(page, venta.id ?? '', nombre);
    expect(
      movimientos.map((m) => m.ingrediente_nombre ?? ''),
      `El movimiento de inventario de la venta ${venta.folio ?? 'sin folio'} no es del producto ` +
        `que se cobró. Se vendió «${nombre}».`,
    ).toContain(nombre);

    exigirSinFallos();
  });
});
