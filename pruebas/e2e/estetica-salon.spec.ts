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
  plantillaRechazada,
} from './ayudantes/sesion.ts';

/**
 * Modelo 5 de 5 · ESTÉTICA / SALÓN DE BELLEZA · giro `estetica`, plantilla `tienda`.
 *
 * ── POR QUÉ ESTA CABECERA YA NO DICE «A ÉSTA LE FALTA CÓDIGO» ──────────────
 * Decía que esta prueba estaba en rojo a propósito y que le faltaba código en DOS
 * sitios. Uno se cerró y el otro no era un hueco:
 *
 *   · `estetica` YA ES UN GIRO. La migración 164 lo añade al `check` de
 *     `organizaciones.giro` y `DICCIONARIOS` le da su vocabulario, tecleado desde la
 *     tabla de `04-INTERFAZ.md §4.1` hasta el género: «estación», «cita», «servicio»,
 *     «estilista», «clienta». El comentario que decía «`estetica` NO está aquí
 *     todavía» se reescribió; no se dejó mintiendo.
 *   · `salon` NO ES UNA PLANTILLA, y no lo va a ser. El `FILE-MAP.md` del modelo la
 *     declaraba como destino y la decisión al construirlo fue la contraria: `PAQUETES`
 *     se queda en tres y una estética usa `tienda`, que es la de mostrador con caja e
 *     inventario y sin sala. Eso no es una carencia que alguien tenga que venir a
 *     tapar: es la respuesta, y este archivo la afirma para que el día que alguien
 *     añada una cuarta plantilla tenga que pasar por aquí.
 *
 * ── QUÉ DEMUESTRA ─────────────────────────────────────────────────────────
 * 1 · El negocio habla como una estética. Es la condición 6 de `F3-REGLAS §8` para
 *     este modelo, y es lo que heredan los ONCE modelos de «servicios con cita».
 * 2 · El servidor RECHAZA la plantilla `salon` con `ENTRADA_INVALIDA`, en vez de
 *     aceptarla y dejar a un negocio con una plantilla que ningún gate entiende.
 * 3 · Las doce pantallas del modelo existen y responden. El arquetipo A3 está en pie.
 * 4 · Con la plantilla de mostrador, su dashboard es el de mostrador. El de este
 *     modelo —ocho indicadores con la ocupación de mañana como estrella— vive dentro
 *     de reportes y todavía no está construido.
 *
 * ── DÓNDE SE AFIRMA EL VOCABULARIO, y por qué no basta el menú ─────────────
 * Ésta es la parte incómoda y hay que decirla entera. De las tres entradas del menú
 * que llevan `entidad` en `heredado/lib/permissions.js` —`responsable` (/mesero),
 * `preparacion` (/cocina) y `producto` (/productos)— las dos primeras son del bloque
 * de SALA, que la plantilla `tienda` no incluye. Así que en el menú de una estética
 * sólo se puede leer UN sustantivo del giro, «Productos», y además coincide letra por
 * letra con el del diccionario base: mirarlo ahí no distingue un salón de una
 * tiendita. El vocabulario PROPIO de este modelo —estación, cita, servicio, estilista,
 * clienta— no se ve hoy en ninguna pantalla del menú.
 *
 * Por eso el paso 2 mira el menú —es lo que el dueño LEE, y lo que no puede decir
 * («Estilistas», «Cocinas») importa tanto como lo que dice— y el paso 3 le pregunta al
 * SERVIDOR por las cinco entidades que ninguna pantalla enseña todavía. Las dos
 * afirmaciones son del navegador y las dos son verdad. El día que una de las 61
 * pantallas consuma estas entidades, la segunda se muda allí: lo que no se hace es
 * afirmar contra un lector que no existe, ni saltar la prueba con un `fixme` —una
 * prueba saltada se lee igual que una que pasó, y dejaría la condición 6 marcada como
 * cumplida sin que nadie haya abierto un navegador.
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

  test('la estética habla como una estética, y `salon` sigue sin ser plantilla', async ({
    page,
  }) => {
    await entrar(page);

    // El giro se exige PRIMERO, igual que en las otras cuatro. Antes iba al final
    // porque no podía existir y exigirlo tapaba el resto; ahora existe, y si la demo
    // es del giro equivocado no hay nada que decir: el fallo temprano ahorra un
    // rastro engañoso —«esperaba La clienta y encontré El cliente»— que se leería
    // como un defecto del vocabulario sin serlo.
    await exigirGiro(page, 'estetica', 'estetica-salon');

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

    // La plantilla de un salón es la de MOSTRADOR, y no es una provisional a la espera
    // de una `salon`: trae caja, inventario y catálogo, y no trae sala. Una estética
    // con la de restaurante tendría mesas y comanda, y el `check` de la 058 lo impide
    // en la base además de aquí.
    await cambiarDePlantilla(page, 'tienda');

    // ── 2 · EL MENÚ · lo que el dueño lee ─────────────────────────────────
    await abrirPantalla(page, '/');
    const menu = await menuLateral(page);

    await exigirVocabulario(menu, {
      // `producto` → «producto/productos» en la tabla del modelo: el del anaquel se
      // llama producto también en un salón. Con la plantilla `tienda` es el ÚNICO
      // sustantivo del giro que este menú puede enseñar, y coincide con el del
      // diccionario base — así que esta línea afirma que la entrada existe y está
      // traducida, no que el menú distinga a un salón de una tiendita.
      propios: [['producto', 'Productos']],
      // Lo que sí sería un defecto: que un salón hable como un restaurante, como una
      // cafetería o como una ferretería. Es lo que pasa cuando el diccionario se
      // aplica encima en vez de resolverse por giro.
      ajenos: ['Platillos', 'Meseros', 'Cocinas', 'Materiales', 'Baristas', 'Barras'],
    });

    // Y las dos del bloque de sala no pueden aparecer NI CON SU NOMBRE DE ESTE GIRO.
    // «Estilistas» es la traducción correcta de `responsable` para una estética; su
    // entrada es `/mesero`, que `MODULOS_POR_PLANTILLA.tienda` no incluye. Si
    // apareciera, el negocio tendría módulos de sala que nadie contrató — y de paso
    // es la razón por la que el vocabulario de este modelo se afirma en el paso 3.
    // «Cocina» —sin la `s`— es la etiqueta de siempre: `preparacion` está apagada para
    // este giro, así que `etiquetaDeNavegacion` cae al `label` del menú. Si se lee, la
    // entrada está ahí y lo que falta es el filtro por plantilla.
    for (const deSala of ['Estilistas', 'Cocina']) {
      await expect(
        menu.getByRole('link', { name: deSala, exact: true }),
        `El menú enseña «${deSala}» con la plantilla \`tienda\`. Un salón no tiene mesero ` +
          'ni cocina; si aparece, `getCurrentPackage` está normalizando el nombre nuevo de ' +
          'la plantilla al heredado `restaurante_pro`.',
      ).toHaveCount(0);
    }

    // ── 3 · SU VOCABULARIO · la condición 6 de F3-REGLAS §8 ───────────────
    // Las palabras están tecleadas a mano desde `04-INTERFAZ.md §4.1` y NO se importan
    // de `diccionarios.ts`: una prueba que afirma contra la misma constante que produce
    // el valor no prueba nada. Si alguien renombra «estación» a «cabina» en el
    // diccionario, esta prueba se cae y hay que venir a decidirlo aquí.
    await exigirVocabularioDelGiro(page, [
      // Nunca «mesa». La unidad de servicio de un salón es la estación.
      ['unidad_servicio', 'estación'],
      // Nunca «cuenta» ni «ticket» en la agenda. El walk-in también es una cita.
      ['orden', 'cita'],
      // Lo que se vende es un servicio, no un producto ni un platillo.
      ['linea_orden', 'servicio'],
      ['responsable', 'estilista'],
      // El femenino por omisión, que es la decisión que este modelo puso sobre la mesa:
      // «el clienta llegó» delata el sistema en el primer segundo, y en este giro el
      // 90 % son mujeres.
      ['cliente', 'clienta'],
      // Y la que está APAGADA: un salón no tiene cocina ni barra, así que `preparacion`
      // no se traduce, se apaga (regla 3). La cadena vacía es la respuesta correcta; un
      // nombre neutro aquí haría que el menú pintara una entrada de preparación.
      ['preparacion', ''],
    ]);

    // ── 4 · SU DASHBOARD · el de mostrador ────────────────────────────────
    await expect(page.getByRole('heading', { level: 1, name: 'Buen día' })).toBeVisible();
    const acciones = accionesDelTablero(page);
    await expect(acciones.getByRole('button', { name: 'Ir a Caja' })).toBeVisible();
    await expect(acciones.getByRole('button', { name: 'Nueva venta' })).toHaveCount(0);

    // ── 5 · LAS DOCE PANTALLAS DEL MODELO RESPONDEN ───────────────────────
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
  });
});
