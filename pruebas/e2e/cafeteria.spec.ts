import { expect, test } from '@playwright/test';

import {
  abrirPantalla,
  accionesDelTablero,
  cambiarDePlantilla,
  entrar,
  exigirDemostracion,
  exigirGiro,
  exigirVocabulario,
  exigirVocabularioDelGiro,
  menuLateral,
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
    // Ninguna pantalla puede abrir en 200 y reventar por dentro.
    const exigirSinFallos = vigilarFallos(page);

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
    const acciones = accionesDelTablero(page);
    await expect(acciones.getByRole('button', { name: 'Ir a Caja' })).toBeVisible();
    await expect(acciones.getByRole('button', { name: 'Nueva venta' })).toHaveCount(0);

    // ── 2 · LAS TRECE PANTALLAS DEL MODELO RESPONDEN ──────────────────────
    // Van AQUÍ y no al final: la guarda de `app/(modelos)/cafeteria/` exige la
    // plantilla `cafeteria`, y el paso 3 la cambia a `restaurante`.
    for (const pantalla of PANTALLAS) {
      await abrirPantalla(page, `/cafeteria/${pantalla}`);
    }

    // La de inicio del barista, reconocible sin un solo dato en la base: la fila
    // vacía es un estado con nombre en este modelo y se pinta igual.
    await abrirPantalla(page, '/cafeteria/barra');
    await expect(page.getByRole('heading', { name: 'Barra', exact: true })).toBeVisible();

    // ── 3 · CON LA PLANTILLA DE JACARANDA · sala, pero hablando de café ───
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
