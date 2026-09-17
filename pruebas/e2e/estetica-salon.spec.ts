import { expect, test } from '@playwright/test';

import {
  abrirPantalla,
  cambiarDePlantilla,
  entrar,
  exigirDemostracion,
  exigirGiro,
  exigirVocabulario,
  menuLateral,
  plantillaRechazada,
} from './ayudantes/sesion.ts';

/**
 * Modelo 5 de 5 · ESTÉTICA / SALÓN DE BELLEZA · giro `estetica`, plantilla `salon`.
 *
 * ── ESTA PRUEBA ESTÁ EN ROJO A PROPÓSITO, Y NO POR LA BASE ─────────────────
 * Las otras cuatro se destraban aplicando las 70 migraciones y creando su demo. Ésta
 * no. A esta le falta CÓDIGO, y falta en dos sitios concretos:
 *
 *   · `estetica` no es un giro. No está en `GIROS`
 *     (`packages/contracts/src/comandos/ambito.ts`) ni en `DICCIONARIOS`
 *     (`packages/domain/src/vocabulario/diccionarios.ts`), que lo dice con estas
 *     palabras: *«`estetica` NO está aquí todavía: su giro se añade con el arquetipo
 *     A3, en la etapa que lo construye. Declararlo antes sería prometer un
 *     vocabulario para un negocio que el sistema aún no sabe operar»*.
 *   · `salon` no es una plantilla. El `FILE-MAP.md` del modelo la declara como
 *     destino —«**Plantilla destino:** `salon` (nueva)»— y `PAQUETES` tiene tres
 *     valores, no cuatro.
 *
 * ── QUÉ DEMUESTRA, entonces ────────────────────────────────────────────────
 * Tres cosas, y las tres son verificaciones reales que hoy PASAN:
 *   1 · Las doce pantallas del modelo existen y responden. El arquetipo A3 —del que
 *       cero de las treinta y cinco funciones F-4xx estaban construidas— está en pie.
 *   2 · El sistema RECHAZA la plantilla `salon`, en vez de aceptarla y dejar a un
 *       negocio con una plantilla que ningún gate entiende. Fallar cerrado aquí es lo
 *       correcto, y afirmarlo es lo que hará que esta prueba avise el día que exista.
 *   3 · Sin giro propio, el vocabulario cae al diccionario BASE y dice «Productos».
 *       Tampoco es un defecto: `crearVocabulario` lo hace a propósito, porque «sólo un
 *       giro desconocido cae al diccionario base: ahí no apagar es lo correcto».
 *
 * Y una que NO pasa, que es la última línea de la prueba: la condición 6 de
 * `F3-REGLAS §8` pide que cada plantilla muestre **su propio vocabulario**, y el de
 * este modelo está documentado hasta el género —«estación», «cita», «estilista»,
 * «clienta», «fórmula»; nunca «mesa», nunca «receta», nunca «no-show»— y no existe en
 * ningún diccionario. Once modelos de servicios con cita heredan de esta carpeta. Esta
 * prueba se queda roja hasta que el arquetipo A3 lo escriba, y ese rojo es el estado
 * real del quinto modelo, no un defecto de la prueba.
 *
 * ── POR QUÉ EL ORDEN ESTÁ AL REVÉS QUE EN LAS OTRAS CUATRO ─────────────────
 * En las otras, el giro se exige al principio: si la demo es del giro equivocado, no
 * hay nada que decir y el fallo temprano ahorra un rastro engañoso. Aquí el giro no
 * puede existir, así que exigirlo primero taparía las tres comprobaciones que sí se
 * pueden hacer. Se hacen, y el rojo se deja para el final, donde dice lo que falta.
 */

/** Las doce pantallas del modelo, tal como existen en `app/(modelos)/estetica-salon/`. */
const PANTALLAS = [
  'agenda-del-dia',
  'agendar',
  'caja-y-corte',
  'catalogo-de-servicios',
  'cita-en-curso',
  'clientas',
  'cobrar',
  'ficha-del-profesional',
  'historial-de-la-clienta',
  'liquidacion',
  'mi-dia',
  'productos',
] as const;

test.describe('estética · su vocabulario, sus pantallas y su dashboard', () => {
  test.beforeAll(async ({ playwright }, info) => {
    await exigirDemostracion(playwright, info);
  });

  test('la estética no tiene todavía giro ni plantilla propios', async ({ page }) => {
    await entrar(page);

    // ── 1 · LA PLANTILLA `salon` NO EXISTE, y el servidor lo dice ─────────
    const codigo = await plantillaRechazada(page, 'salon');
    expect(
      codigo,
      'El servidor rechazó `salon`, que es lo correcto, pero con otro código. Se espera ' +
        'ENTRADA_INVALIDA: `entradaCambiarPaquete` es un `z.enum` con los tres nombres ' +
        'nuevos y los tres heredados, y `salon` no es ninguno. Un código distinto —SIN_PERMISO, ' +
        'CONFIGURACION_INVALIDA— significaría que falló otro gate antes y que este rechazo ' +
        'no está probando lo que dice.',
    ).toBe('ENTRADA_INVALIDA');

    // Mientras no exista, la provisional es la MÁS RESTRICTIVA. No es una elección de
    // esta prueba: es la que `plantillaDe()` aplica a cualquier valor que no reconoce,
    // «nunca a la más permisiva; un dato roto no puede abrir módulos que nadie
    // contrató». Un salón con la plantilla de restaurante tendría mesas y comanda.
    await cambiarDePlantilla(page, 'tienda');

    // ── 2 · LAS DOCE PANTALLAS DEL MODELO RESPONDEN ───────────────────────
    for (const pantalla of PANTALLAS) {
      await abrirPantalla(page, `/estetica-salon/${pantalla}`);
    }

    // La de inicio es la AGENDA, y su carpeta dedica una sección a defender por qué no
    // es un dashboard: se abre de cuarenta a ochenta veces al día y el hueco de las 3
    // pm no se recupera mañana. Los botones de día se pintan en los tres estados
    // —cargando, vacío y con citas—, así que la pantalla se reconoce sin un solo dato.
    await abrirPantalla(page, '/estetica-salon/agenda-del-dia');
    await expect(page.getByRole('button', { name: 'Día siguiente' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Día anterior' })).toBeVisible();

    // ── 3 · SU DASHBOARD ─────────────────────────────────────────────────
    // Con la plantilla provisional, el dashboard que ve es el de mostrador. El de este
    // modelo —ocho indicadores con la ocupación de mañana como estrella— vive dentro de
    // reportes y todavía no está construido: el bloque F-4xx estaba entero a cero.
    await abrirPantalla(page, '/');
    await expect(page.getByRole('heading', { level: 1, name: 'Buen día' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ir a Caja' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nueva venta' })).toHaveCount(0);

    // ── 4 · EL VOCABULARIO NEUTRO, que es lo que hay ──────────────────────
    const menu = await menuLateral(page);
    await exigirVocabulario(menu, {
      // «Productos» viene del DICCIONARIO_BASE, no del giro. Se afirma para dejar
      // constancia de dónde está el sistema, no para aprobarlo.
      propios: [['producto', 'Productos']],
      // Lo que sí es un defecto si aparece: que un salón hable como un restaurante o
      // como una ferretería. El diccionario base es neutro a propósito —«no es el de
      // restaurante: es el que no compromete a ningún giro»— justo para que un giro sin
      // traducir no suene a restaurante.
      ajenos: ['Platillos', 'Meseros', 'Cocinas', 'Materiales', 'Baristas', 'Barras'],
    });

    // ── 5 · Y AQUÍ SE PONE ROJA, que es la respuesta correcta ─────────────
    // La condición 6 pide el vocabulario PROPIO del modelo. Esta línea lo exige y falla
    // nombrando los dos archivos donde falta. No se sustituye por un `test.fixme`: una
    // prueba saltada se lee igual que una que pasó, y eso dejaría la condición 6
    // marcada como cumplida para un modelo que no tiene ni giro.
    await exigirGiro(page, 'estetica', 'estetica-salon');
  });
});
