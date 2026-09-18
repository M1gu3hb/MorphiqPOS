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
  exigirDemostracion,
  exigirCobroAceptado,
  exigirGiro,
  exigirVentaCobrada,
  exigirVocabulario,
  exigirVocabularioDelGiro,
  menuLateral,
  plantillaRechazada,
  ventasDeAntes,
  vigilarFallos,
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
 * 1 · El negocio habla como una estética. Es la condición 6 de `F2.3-REGLAS §8` para
 *     este modelo, y es lo que heredan los ONCE modelos de «servicios con cita».
 * 2 · El servidor RECHAZA la plantilla `salon` con `ENTRADA_INVALIDA`, en vez de
 *     aceptarla y dejar a un negocio con una plantilla que ningún gate entiende.
 * 3 · Las doce pantallas del modelo existen y responden. El arquetipo A3 está en pie.
 * 4 · Su dashboard es el de mostrador —sin sala, con «Ir a Caja»—. El propio de este
 *     modelo, con ocho indicadores y la ocupación de mañana como estrella, vive dentro
 *     de reportes y todavía no está construido.
 *
 * ── DÓNDE SE AFIRMA EL VOCABULARIO ────────────────────────────────────────
 * Aquí decía —y era verdad hasta el 17-09-2026— que en el menú de una estética sólo
 * se podía leer UN sustantivo del giro, «Productos», porque la plantilla era `tienda`
 * y las otras dos entradas con `entidad` eran de sala. Con su plantilla propia se leen
 * CUATRO: «Clientas», «Servicios», «Estilistas» y «Productos», y tres de los cuatro
 * distinguen un salón de una tiendita a la primera mirada.
 *
 * Aun así el paso 3 sigue preguntándole al SERVIDOR por las seis entidades, y sigue
 * haciendo falta por dos razones: «estación» —la unidad de servicio— no la nombra
 * ninguna entrada de menú, y `preparacion` está APAGADA en este giro, que es una
 * afirmación que sólo se puede hacer contra el diccionario. Lo que no se hace es
 * afirmar contra un lector que no existe, ni saltar la prueba con un `fixme`: una
 * prueba saltada se lee igual que una que pasó, y dejaría la condición 6 marcada como
 * cumplida sin que nadie haya abierto un navegador.
 */

/** Las doce pantallas del modelo, tal como existen en `app/(modelos)/estetica-salon/`. */
/** Pesos como los pinta la pantalla: `$1,800.00`. */
function enPesosDelSalon(centavos: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
    centavos / 100,
  );
}

/** El fondo con el que la prueba abre la caja del salón, en centavos. */
const FONDO_CENTAVOS = 50_000;

/** Lo que la prueba necesita del catálogo, del equipo y de la comisión. */
interface ServicioDelPuente {
  readonly id?: string;
  readonly nombre?: string | null;
  readonly precio_venta?: number | null;
}

interface ProfesionalDelPuente {
  readonly id?: string;
  readonly nombre?: string | null;
}

interface MovimientoConAlmacen {
  readonly almacen_id?: string;
}

/**
 * La comisión, como la sirve el puente.
 *
 * Se ata al SERVICIO DE LA CITA —`cita_servicio_id`— y no a la venta: en un
 * salón, lo que se comisiona es el servicio que alguien hizo, y una cuenta puede
 * llevar varios de personas distintas. Por eso la comprobación busca por ahí.
 */
interface ComisionDelPuente {
  readonly cita_servicio_id?: string;
  readonly profesional_id?: string;
  readonly monto_centavos?: number;
  readonly tasa_bp?: number;
}

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
    // Ninguna pantalla puede abrir en 200 y reventar por dentro.
    const exigirSinFallos = vigilarFallos(page);

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

    // SU plantilla. Aquí decía que la de un salón era la de MOSTRADOR y que no era
    // una provisional a la espera de una `salon`. Lo era: con `tienda`, el menú de una
    // estética no tenía agenda, ni cita, ni expediente, ni comisión — las cuatro cosas
    // que son el negocio— y las doce pantallas del modelo no colgaban de ningún sitio.
    // La 166 le dio su plantilla propia. Lo que sigue en pie es la otra mitad: la de
    // SALA no, porque una estética no tiene mesero ni cocina, y el `check` de la 058
    // reserva `restaurante` para los giros de alimentos.
    await cambiarDePlantilla(page, 'estetica');

    // ── 2 · EL MENÚ · lo que el dueño lee ─────────────────────────────────
    await abrirPantalla(page, '/');
    const menu = await menuLateral(page);

    await exigirVocabulario(menu, {
      // `producto` → «producto/productos» en la tabla del modelo: el del anaquel se
      // llama producto también en un salón. Con la plantilla `tienda` es el ÚNICO
      // sustantivo del giro que este menú puede enseñar, y coincide con el del
      // diccionario base — así que esta línea afirma que la entrada existe y está
      // traducida, no que el menú distinga a un salón de una tiendita.
      propios: [
        // `cliente` → «clienta/clientas», con el femenino por omisión que este modelo
        // puso sobre la mesa. Es la entrada de su expediente.
        ['cliente', 'Clientas'],
        // `linea_orden` → «servicio/servicios». Lo que se vende es un SERVICIO; ni
        // platillo, ni bebida, ni material.
        ['linea_orden', 'Servicios'],
        // `responsable` → «estilista/estilistas». Con la plantilla `tienda` esta
        // entrada no existía, y era la prueba de que la plantilla estaba mal elegida:
        // una estética sin ficha de profesional no puede pagar comisión.
        ['responsable', 'Estilistas'],
        // Y el del anaquel, que en un salón se llama producto también.
        ['producto', 'Productos'],
      ],
      // Lo que sí sería un defecto: que un salón hable como un restaurante, como una
      // cafetería o como una ferretería. Es lo que pasa cuando el diccionario se
      // aplica encima en vez de resolverse por giro.
      ajenos: ['Platillos', 'Meseros', 'Cocinas', 'Materiales', 'Baristas', 'Barras'],
    });

    // «Estilistas» SÍ está, y es su ficha de profesional —`/estetica-salon/ficha-del-
    // profesional`—, no la entrada `/mesero` del punto de venta heredado. La diferencia
    // importa: una lleva a la pantalla de comisión de este modelo y la otra a la
    // comanda de un restaurante. Se afirma por el `href`, que es lo único que las
    // distingue sin atarse a una clase de CSS.
    await expect(menu.getByRole('link', { name: 'Estilistas', exact: true })).toHaveAttribute(
      'href',
      '/estetica-salon/ficha-del-profesional',
    );

    // Y lo que NO puede aparecer: el bloque de sala. `MODULOS_POR_PLANTILLA.estetica` no
    // incluye `mesero` ni `cocina` ni `mesas`, porque en un salón quien atiende es quien
    // cobra y no hay comanda que mandar a ninguna parte. «Cocina» —sin la `s`— es la
    // etiqueta de siempre: `preparacion` está APAGADA para este giro, así que
    // `etiquetaDeNavegacion` cae al `label` del menú antes que dejar un hueco. Si se
    // lee, la entrada está ahí y lo que falta es el filtro por plantilla.
    for (const deSala of ['Cocina', 'Barras', 'Mesas']) {
      await expect(
        menu.getByRole('link', { name: deSala, exact: true }),
        `El menú enseña «${deSala}» con la plantilla \`estetica\`. Un salón no tiene ` +
          'mesero, ni cocina, ni mesas; si aparece, `getCurrentPackage` está normalizando ' +
          'el nombre nuevo de la plantilla al heredado `restaurante_pro`.',
      ).toHaveCount(0);
    }

    // ── 3 · SU VOCABULARIO · la condición 6 de F2.3-REGLAS §8 ───────────────
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

    // ── UNA CITA, SU SERVICIO CERRADO, Y COBRADA CON SU COMISIÓN ──────────
    //
    // El recorrido del encargo: agendar · iniciar la cita · cobrar con comisión.
    // EL COBRO se hace por la pantalla —es donde entra el dinero— y los pasos de
    // agenda van por SUS PROPIAS RUTAS, por razones que se dicen en vez de
    // esconderse:
    //
    //  · el asistente de `agendar` empieza por la clienta, y darla de alta
    //    publica en `/api/cliente/crear`, **una ruta que no existe**. La demo
    //    tiene CERO clientas, así que por la pantalla no se pasa del primer paso.
    //    `agenda.agendar_cita` acepta cita SIN clienta —alguien que llega sin
    //    cita previa, que es media agenda de un salón— y eso es lo que se usa;
    //  · `iniciar` y `cerrar-servicio` tienen ruta y comando, y **ninguna
    //    pantalla los llama**: no hay forma de empezar ni de cerrar un servicio
    //    desde la interfaz. Sin cerrar, la cita nunca llega a `terminada`, que es
    //    lo único que la pantalla de cobro lista.
    //
    // Los dos están en el reporte con nombre y apellido.
    await abrirCajaPorLaRuta(page, FONDO_CENTAVOS);

    const servicios = await consultarPuente<ServicioDelPuente>(page, 'ProductoTerminado', {
      filtro: { tipo_venta: 'servicio' },
      limite: 40,
    });
    const servicio = servicios.find((x) => (x.nombre ?? '') !== '' && (x.precio_venta ?? 0) > 0);
    expect(
      servicio,
      'La demo de estética no tiene servicios con precio: sin servicio no hay cita que cobrar.',
    ).toBeDefined();
    const precioCentavos = Math.round((servicio?.precio_venta ?? 0) * 100);

    const profesionales = await consultarPuente<ProfesionalDelPuente>(page, 'Profesional', {
      limite: 10,
    });
    const profesional = profesionales.find((p) => (p.id ?? '') !== '');
    expect(profesional, 'La demo de estética no tiene profesionales dados de alta.').toBeDefined();

    const idsDeAntes = await ventasDeAntes(page);

    // 1 · AGENDAR.
    const cita = await page.request.post('/api/agenda/cita', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: {
        origen: 'mostrador',
        inicio: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        servicios: [{ servicioId: servicio?.id, profesionalId: profesional?.id }],
      },
    });
    expect(cita.status(), `No se pudo agendar la cita: ${(await cita.text()).slice(0, 400)}`).toBe(
      200,
    );
    const agendada = (await cita.json()) as {
      datos?: { citaId?: string; servicios?: readonly { citaServicioId?: string }[] };
    };
    const citaId = agendada.datos?.citaId;
    const citaServicioId = agendada.datos?.servicios?.[0]?.citaServicioId;
    expect(citaId, 'Agendar no devolvió la cita.').toBeTruthy();
    expect(citaServicioId, 'Agendar no devolvió el servicio de la cita.').toBeTruthy();

    /**
     * La agenda del día NO enseña la cita todavía, y por eso aquí no se exige.
     *
     * La rejilla pinta bloques con `inicio`, `fin` y `profesional`, y el puente no
     * tiene ninguna entidad con esa forma: `Cita` trae `agendada_para`,
     * `cliente_id` y `folio`, el servicio vive en `CitaServicio`, y
     * `HuecoDisponible` —la otra mitad de la pantalla— no existe. Esta sesión
     * arregló lo que se podía sin inventar la entidad: que las citas se pidan por
     * RANGO en vez de por un campo `fecha` que no existe, que una fuente caída no
     * vacíe la pantalla entera, y que las filas sin forma no tumben la página.
     * Está en el reporte.
     *
     * Lo que sí se comprueba es que la pantalla ABRE y dice lo que le falta en vez
     * de morirse: es la pantalla de inicio de la recepcionista.
     */
    await abrirPantalla(page, '/estetica-salon/agenda-del-dia');
    await expect(
      page.getByRole('heading', { level: 1 }).first(),
      'La agenda del día no abre. Es la pantalla de inicio de la recepcionista: si se cae, el ' +
        'salón empieza el día a ciegas.',
    ).toBeVisible({ timeout: 20_000 });

    // 2 · INICIAR la cita y 3 · CERRAR su servicio, que es cuando se puede
    //     cobrar: cerrarlo es donde se decide qué se consumió.
    const iniciada = await page.request.post('/api/agenda/iniciar', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: { citaId },
    });
    expect(
      iniciada.status(),
      `No se pudo iniciar la cita: ${(await iniciada.text()).slice(0, 300)}`,
    ).toBe(200);

    /**
     * El almacén sale de un MOVIMIENTO de inventario, y no de una entidad
     * `Almacen`: **el puente no tiene ninguna**. La siembra deja el inventario
     * inicial, así que el primer movimiento del ledger trae el almacén en el que
     * está la mercancía, que es exactamente el que hay que descontar.
     */
    const movimientos = await consultarPuente<MovimientoConAlmacen>(page, 'MovimientoInventario', {
      limite: 5,
    });
    const almacenId = movimientos.find((m) => (m.almacen_id ?? '') !== '')?.almacen_id;
    expect(
      almacenId,
      'No hay ningún movimiento de inventario del que sacar el almacén, y cerrar un servicio ' +
        'exige de dónde salió lo que se consumió. El puente no expone `Almacen`: está en el ' +
        'reporte.',
    ).toBeTruthy();

    const cerrado = await page.request.post('/api/agenda/cerrar-servicio', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: { citaServicioId, almacenId, consumos: [] },
    });
    expect(
      cerrado.status(),
      `No se pudo cerrar el servicio: ${(await cerrado.text()).slice(0, 400)}`,
    ).toBe(200);

    // 4 · COBRAR, POR LA PANTALLA.
    await abrirPantalla(page, '/estetica-salon/cobrar');
    // La tarjeta de la cita se nombra por la clienta, el folio y el IMPORTE: es
    // lo que el cajero lee. El nombre del servicio vive dentro, al elegirla.
    const laCita = page.getByRole('button', { name: enPesosDelSalon(precioCentavos) });
    await expect(
      laCita.first(),
      'La pantalla de cobro no lista la cita con su servicio cerrado. Lee `Cita` con estado ' +
        '`terminada`: si no está, cerrar el servicio no dejó la cita terminada.',
    ).toBeVisible({ timeout: 20_000 });
    await laCita.first().click();

    await page.getByRole('button', { name: 'Efectivo', exact: true }).click();
    await page.getByRole('button', { name: /^COBRAR/ }).click();

    // El acuse de esta pantalla dice lo cobrado y su folio.
    await exigirCobroAceptado(page, /^Cobrado /);

    // La venta, con su total y su folio, en el servidor. El identificador no se
    // usa después —la comisión se busca por el SERVICIO de la cita, que es a lo
    // que se comisiona— pero la comprobación es la misma que en los otros cuatro
    // recorridos: sin esto, «cobrado» es una palabra en una pantalla.
    await exigirVentaCobrada(page, precioCentavos, idsDeAntes);

    // Y LA COMISIÓN, que es lo propio de un salón: quien atendió tiene que haber
    // causado la suya con esta venta dentro. Sin eso el corte del día cuadra y la
    // nómina no.
    const comisiones = await consultarPuente<ComisionDelPuente>(page, 'ComisionCausada', {
      limite: 20,
    });
    const laComision = comisiones.find((c) => c.cita_servicio_id === citaServicioId);
    expect(
      laComision,
      `Se cobró un servicio de ${String(precioCentavos)} centavos y no se causó ninguna comisión ` +
        'para quien lo hizo. En un salón la comisión nace del cobro, no de un trámite de fin de ' +
        'mes: si no nace aquí, nadie sabe cuánto se le debe a quién.',
    ).toBeDefined();

    // Y es del profesional que lo hizo, por un importe que sale de la tasa de su
    // regla sobre lo cobrado. No se clava el 40 %: se comprueba la aritmética
    // contra la tasa que el propio servidor devolvió.
    expect(laComision?.profesional_id).toBe(profesional?.id);
    /**
     * La tasa llega en PORCENTAJE, no en puntos base.
     *
     * La columna es `tasa_bp` —4 000 puntos base, el 40 %— y el puente la sirve
     * con `conversion: 'puntos_base'`, que la divide entre cien para el frontend
     * heredado: llega `40`. Dividir otra vez entre 10 000 daba 720 centavos de
     * comisión sobre 1 800 pesos, que son 7.20: un error de cien veces que en una
     * nómina se nota el día de pago y no antes.
     */
    const esperadaCentavos = Math.round((precioCentavos * (laComision?.tasa_bp ?? 0)) / 100);
    expect(
      Math.round((laComision?.monto_centavos ?? 0) * 100),
      `La comisión no cuadra con su propia tasa: ${String(laComision?.tasa_bp ?? 0)} % sobre ` +
        `${String(precioCentavos)} centavos son ${String(esperadaCentavos)}.`,
    ).toBe(esperadaCentavos);

    await cerrarCajaYCuadrar(page, FONDO_CENTAVOS + precioCentavos);

    exigirSinFallos();
  });
});
