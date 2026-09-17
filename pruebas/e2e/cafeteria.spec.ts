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
 * Modelo 2 de 5 · CAFETERÍA DE MOSTRADOR · giro `cafeteria`, plantilla `cafeteria`.
 *
 * ── QUÉ DEMUESTRA ──────────────────────────────────────────────────────────
 * Que el GIRO y la PLANTILLA son dos ejes distintos, y que se ven distintos en la
 * pantalla. Esta prueba cambia la plantilla DOS veces sobre el mismo negocio:
 *
 *   · con `cafeteria`, el menú NO tiene sala: ni barista ni barra, porque esa
 *     plantilla no incluye los módulos `mesero` ni `cocina`;
 *   · con `restaurante`, las mismas dos entradas aparecen y dicen «Baristas» y
 *     «Barras» — no «Meseros» y «Cocinas», aunque la plantilla sea la del
 *     restaurante.
 *
 * ── POR QUÉ ESO IMPORTA, y por qué esta prueba es la más informativa de las cinco ──
 * Porque es el caso real de **Café Jacaranda**, y está escrito en `A3 §4.3` y en
 * `F3-REGLAS §4.4`: se queda en la plantilla `restaurante` aunque su giro sea
 * cafetería, porque tiene contratado el paquete completo con mesero y cocina y
 * bajarlo a `cafeteria` le quitaría módulos que paga. Si el vocabulario saliera de la
 * plantilla —como decía D-04 antes de corregirse— Jacaranda leería «Meseros» y
 * «Cocinas» en una barra donde no hay ni una cosa ni la otra. Que lea «Baristas» y
 * «Barras» es la demostración de que `tipos.ts` tenía razón: *la plantilla dice qué
 * MÓDULOS tiene el negocio; el giro dice CÓMO HABLA*.
 *
 * ── LO QUE ESTA PRUEBA NO PUEDE MIRAR, y hay que decirlo ───────────────────
 * Los dos sustantivos más propios de este modelo no llegan a ninguna pantalla hoy:
 * `unidad_servicio` es «pedido» —el objeto que este giro construyó porque el cliente
 * ya pagó y espera de pie (F-328)— y `linea_orden` es «bebida». Ninguna de las dos
 * entidades tiene entrada en `NAV_ITEMS`, y `NAV_ITEMS` es el único lector de F-017
 * que se ve al entrar. La pantalla de barra dice «Barra» porque está escrito así en
 * el componente, no porque el diccionario lo traduzca. Eso es una deuda real de
 * F-017, no un hueco de esta prueba.
 */

/** Las trece pantallas del modelo, tal como existen en `app/(modelos)/cafeteria/`. */
const PANTALLAS = [
  'acceso-por-pin',
  'barra',
  'cierre-de-turno-y-arqueo',
  'clientes-y-sellos',
  'cobrar',
  'cobro-y-propina',
  'inventario',
  'menu-publico-y-pedido-anticipado',
  'opciones-de-la-bebida',
  'productos',
  'recetas',
  'recogida',
  'turno',
] as const;

/** Lo que el menú de una cafetería NUNCA puede decir, venga la plantilla que venga. */
const DE_OTROS_MODELOS = ['Platillos', 'Meseros', 'Cocinas', 'Materiales', 'Mostradoristas'];

test.describe('cafetería · su vocabulario, sus pantallas y su dashboard', () => {
  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info);
  });

  test('la cafetería habla de baristas y barra, y su plantilla no trae sala', async ({ page }) => {
    await entrar(page);
    await exigirGiro(page, 'cafeteria', 'cafeteria');

    // ── 1 · CON SU PROPIA PLANTILLA · mostrador, sin sala ─────────────────
    await cambiarDePlantilla(page, 'cafeteria');
    await abrirPantalla(page, '/');
    const mostrador = await menuLateral(page);

    await exigirVocabulario(mostrador, {
      // `producto` → «producto/productos». El diccionario de `cafeteria` lo traduce a
      // sí mismo a propósito: lo que vende una cafetería de mostrador SÍ se llama
      // producto, y forzar una palabra distinta sólo por tener una sería el vicio
      // contrario al que F-017 viene a cerrar.
      propios: [['producto', 'Productos']],
      ajenos: [...DE_OTROS_MODELOS, 'Cajeros', 'Responsables'],
    });

    // Las dos entradas de sala NO están, y no por el vocabulario: por el módulo.
    // `MODULOS_POR_PLANTILLA.cafeteria` es base + operación y nada más — ni `mesero`
    // ni `cocina` ni `mesas`—, porque en un mostrador quien cobra es quien prepara y
    // quien entrega. Si aparecieran, el cambio de plantilla no llegó al navegador.
    for (const deSala of ['Baristas', 'Barras']) {
      await expect(
        mostrador.getByRole('link', { name: deSala, exact: true }),
        `El menú enseña «${deSala}» con la plantilla \`cafeteria\`, que no incluye los ` +
          'módulos de sala. El filtro es `isRouteAllowed(item.path, paquete_modo)` en ' +
          'heredado/components/common/Sidebar.jsx; `paquete_modo` sale de ' +
          '`getCurrentPackage`, que normaliza con `normalizarPlantilla` —las tres ' +
          'plantillas de D-01 más los tres nombres viejos como alias— y cae en `tienda` ' +
          'ante lo que no reconoce. Que aparezca la sala significa que el cambio de ' +
          'plantilla no llegó al navegador, o que alguien devolvió el valor por omisión a ' +
          'la plantilla más permisiva.',
      ).toHaveCount(0);
    }

    // Su dashboard es de mostrador: la acción es abrir la caja, no una venta por mesa.
    await expect(page.getByRole('heading', { level: 1, name: 'Buen día' })).toBeVisible();
    const acciones = accionesDelTablero(page);
    await expect(acciones.getByRole('button', { name: 'Ir a Caja' })).toBeVisible();
    await expect(acciones.getByRole('button', { name: 'Nueva venta' })).toHaveCount(0);

    // ── 2 · CON LA PLANTILLA DE JACARANDA · sala, pero hablando de café ───
    await cambiarDePlantilla(page, 'restaurante');
    await abrirPantalla(page, '/');
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

    // ── 3 · LAS TRECE PANTALLAS DEL MODELO RESPONDEN ──────────────────────
    // Ojo con lo que esto significa y lo que no: las rutas de `app/(modelos)/` NO
    // están filtradas por plantilla —su envoltorio es a propósito «tan poco» que sólo
    // pone fondo y vocabulario— así que responden igual con las tres. Lo que la
    // plantilla gobierna es el menú de Miguel, que es lo que se afirmó arriba. Al
    // acoplar se decide si estas pantallas entran en su `AppLayout`, y eso es una
    // línea en el `FILE-MAP.md` de cada modelo.
    for (const pantalla of PANTALLAS) {
      await abrirPantalla(page, `/cafeteria/${pantalla}`);
    }

    // La de inicio del barista, reconocible sin un solo dato en la base: la fila
    // vacía es un estado con nombre en este modelo y se pinta igual.
    await abrirPantalla(page, '/cafeteria/barra');
    await expect(page.getByRole('heading', { name: 'Barra', exact: true })).toBeVisible();
  });
});
