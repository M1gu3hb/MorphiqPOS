import { expect, test } from '@playwright/test';

import {
  abrirPantalla,
  cambiarDePlantilla,
  entrar,
  exigirDemostracion,
  exigirGiro,
  exigirVocabulario,
  menuLateral,
} from './ayudantes/sesion.ts';

/**
 * Modelo 1 de 5 · RESTAURANTE DE MESA · giro `restaurante`, plantilla `restaurante`.
 *
 * ── QUÉ DEMUESTRA ──────────────────────────────────────────────────────────
 * Que un restaurante lee «Platillos», «Meseros» y «Cocinas» donde una ferretería lee
 * «Materiales» y una tiendita lee «Productos», y que además TIENE las pantallas de
 * sala —mesero y cocina— que ninguna otra plantilla tiene.
 *
 * ── POR QUÉ ESO IMPORTA, y no es una prueba de textos ──────────────────────
 * Porque `restaurante` es la ÚNICA de las tres plantillas que incluye el bloque de
 * sala: `MODULOS_POR_PLANTILLA` le da `mesas`, `mesero`, `cocina` y `barra`, y a las
 * otras dos no. Si esa diferencia no se ve en el menú, entonces la plantilla no
 * decide nada y las tres son la misma con distinto nombre —que es exactamente lo que
 * eran antes de D-01, cuando se llamaban `esencial`, `operativo` y `restaurante_pro`
 * y sólo describían un precio—.
 *
 * Y porque este modelo es la raíz del arquetipo A2: doce modelos de alimentos heredan
 * de él. Un vocabulario mal enganchado aquí no se equivoca una vez, se equivoca doce.
 *
 * ── QUÉ NO PRUEBA, para que nadie lo lea de más ────────────────────────────
 * No prueba que se pueda abrir una mesa ni cobrar una cuenta: eso necesita mesas,
 * productos y caja abierta en la demo, y `F3-REGLAS §4.5` prohíbe sembrar eso en un
 * negocio vivo. Lo que prueba es lo que pide la condición 6 de `F3-REGLAS §8`: que
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
    await expect(menu.getByRole('link', { name: 'Cocinas', exact: true })).toHaveAttribute(
      'href',
      '/cocina',
    );

    // ── 3 · SU DASHBOARD ─────────────────────────────────────────────────
    // `heredado/pages/Dashboard.jsx` decide sus acciones por paquete: «Nueva venta»
    // lleva a `/pos` y es exclusiva de la plantilla completa; «Ir a Caja» es de
    // mostrador y aparece en las otras dos. Que el dashboard enseñe la acción
    // equivocada es lo que delata que el cambio de plantilla no llegó.
    await expect(page.getByRole('heading', { level: 1, name: 'Buen día' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nueva venta' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Ir a Caja' }),
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
  });
});
