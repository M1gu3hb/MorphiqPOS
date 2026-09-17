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

  test('la plantilla tienda trae operación, no trae sala y habla de productos', async ({
    page,
  }) => {
    await entrar(page);
    await exigirGiro(page, 'tienda', 'abarrotes');
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
    for (const [etiqueta, ruta] of [
      ['Inventario', '/inventario'],
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

    // La de inicio es COBRAR, y tiene tres estados que son los tres de una tiendita
    // recién dada de alta: la caja cerrada —que es un muro a propósito, porque una
    // venta sin caja no pertenece a ningún corte—, el catálogo vacío, o la venta
    // armándose con el total arriba. Los tres son esta pantalla; ninguno es un fallo.
    await abrirPantalla(page, '/abarrotes/cobrar');
    await expect(
      page
        .getByText('La caja está cerrada')
        .or(page.getByText('Todavía no hay nada que escanear.'))
        .or(page.getByRole('region', { name: 'Total de la venta' }))
        .first(),
    ).toBeVisible();
  });
});
