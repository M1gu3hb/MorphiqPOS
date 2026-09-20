import { expect, test, type APIResponse } from '@playwright/test';

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
  exigirDemostracion,
  exigirCobroAceptado,
  exigirGiro,
  exigirVentaCobrada,
  exigirVocabulario,
  exigirVocabularioDelGiro,
  menuLateral,
  soltarLaCaja,
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
 * 3 · Las TRECE pantallas del modelo existen y responden. El arquetipo A3 está en pie.
 * 4 · Su tablero es el SUYO: los ocho indicadores de su §4.4.2, con la ocupación de
 *     mañana como estrella, y dentro de reportes. Y su INICIO no es un tablero: la
 *     raíz de una estética lleva a la agenda, que es la pantalla que se abre cuarenta
 *     veces al día. Antes `/` le servía el tablero heredado, que es el del
 *     restaurante, con dos tarjetas que su propia carpeta prohíbe.
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

/** Pesos como los pinta la pantalla: `$1,800.00`. */
function enPesosDelSalon(centavos: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
    centavos / 100,
  );
}

/**
 * 'YYYY-MM-DD' del día LOCAL, que es el del negocio cuando el servidor es éste.
 *
 * Con `toISOString` la fecha se toma en UTC, y a las 19:00 de México eso ya es el día
 * siguiente: se pedirían los huecos de mañana para agendar hoy.
 */
function fechaLocalDePrueba(cuando: Date): string {
  const dos = (n: number): string => String(n).padStart(2, '0');
  return `${String(cuando.getFullYear())}-${dos(cuando.getMonth() + 1)}-${dos(cuando.getDate())}`;
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
  ['agenda-del-dia', /citas|ocupado/],
  ['agendar', /¿Quién\?|Agendar/],
  ['caja-y-corte', /Fondo con el que abres|Caja y corte/],
  ['catalogo-de-servicios', /La duración, por tramos|Nuevo servicio/],
  ['cita-en-curso', /FÓRMULA DE PARTIDA|en curso/],
  ['clientas', /Les toca volver|Buscar/],
  ['cobrar', /lista para cobrar|Elige/],
  ['ficha-del-profesional', /Aquí se abre la ficha de una profesional|Mi día/],
  ['historial-de-la-clienta', /Aquí se abre el expediente|Última visita/],
  ['liquidacion', /Elige a quién se le va a pagar|Liquidación/],
  ['mi-dia', /¿Quién eres\?|Mi día/],
  ['productos', /cabina|Productos/i],
  // El TABLERO del modelo, que vive aquí dentro y no en la raíz (§4.4.1). Su marca
  // es el rótulo del indicador estrella: si la pantalla sirviera cualquier otro
  // tablero, no diría «Ocupación de mañana» en ningún sitio.
  ['reportes', /Ocupación de mañana|Cómo va el salón/],
];

test.describe('estética · su vocabulario, sus pantallas y su dashboard', () => {
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
    // que son el negocio— y las pantallas del modelo no colgaban de ningún sitio.
    // La 166 le dio su plantilla propia. Lo que sigue en pie es la otra mitad: la de
    // SALA no, porque una estética no tiene mesero ni cocina, y el `check` de la 058
    // reserva `restaurante` para los giros de alimentos.
    await cambiarDePlantilla(page, 'estetica');

    // ── 2 · EL MENÚ · lo que el dueño lee ─────────────────────────────────
    //
    // Se abre `/` y lo que aparece es LA AGENDA, no un tablero. Es la decisión de su
    // §4.4.1 —«la pantalla de inicio se abre cuarenta a ochenta veces al día, para
    // la misma pregunta: ¿quién sigue?»— y hasta hoy `/` le servía el tablero
    // HEREDADO, que es el del restaurante. Se sirve aquí en vez de redirigir porque
    // `app/(modelos)/` no monta la barra lateral: el menú cuelga de esta ruta.
    await abrirPantalla(page, '/', /Día siguiente|citas|ocupado/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Buen día' }),
      'La raíz de una estética sigue sirviendo un tablero. Su inicio es la AGENDA: ' +
        '`(interno)/page.tsx` redirige a `INICIO_POR_PLANTILLA.estetica` y el tablero del ' +
        'modelo vive en /estetica-salon/reportes.',
    ).toHaveCount(0);
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

    /**
     * 4 · SU TABLERO · ocho indicadores, y DENTRO de reportes
     *
     * Aquí decía que el dashboard de una estética era el de MOSTRADOR y que el propio
     * del modelo «vive dentro de reportes y todavía no está construido». Ya está: son
     * los ocho de su §4.4.2, y el primero es la OCUPACIÓN DE MAÑANA porque es el único
     * número del tablero sobre el que todavía se puede actuar.
     *
     * Se afirman sus rótulos Y LA AUSENCIA de tres del restaurante: sin la segunda
     * mitad, servir el tablero heredado aquí pasaría la prueba.
     */
    await abrirPantalla(page, '/estetica-salon/reportes', /Ocupación de mañana/);
    for (const rotulo of [
      'Ocupación de mañana',
      'Se están yendo',
      'No llegaron, últimos 30 días',
      'Ocupación de la semana',
      'Lo cobrado hoy',
      'Lo que le quedó al salón',
      'Propina por entregar',
    ]) {
      await expect(
        page.getByRole('heading', { level: 2, name: rotulo, exact: true }),
        `El tablero del salón no enseña «${rotulo}». Son los ocho indicadores de su ` +
          '§4.4.2, y el primero es la ocupación de MAÑANA a propósito: es el único sobre ' +
          'el que todavía se puede actuar.',
      ).toBeVisible();
    }
    // El de la recomendación lleva el sustantivo del giro —«Producto por profesional»—
    // así que se busca por su parte fija: afirmar la palabra aquí duplicaría la prueba
    // del vocabulario, que es el paso 3.
    await expect(
      page.getByRole('heading', { level: 2, name: /por profesional$/ }),
      'El tablero no enseña la recomendación de producto por profesional, que es el ' +
        'margen que no depende del horario.',
    ).toBeVisible();

    for (const prohibido of ['Ticket promedio', 'Costo de ventas', 'Utilidad bruta']) {
      await expect(
        page.getByText(prohibido, { exact: true }),
        `El tablero enseña «${prohibido}», que es del RESTAURANTE: reportes volvió a ` +
          'servir el tablero heredado a una estética.',
      ).toHaveCount(0);
    }
    // Y el que su propia carpeta prohíbe con nombre y apellido: el ranking del equipo
    // por lo que vende cada quien. «Suena útil y es tóxico»: con carteras y esquemas
    // distintos compara peras con manzanas. Lo que va es la OCUPACIÓN, y por eso el
    // tablero no sirve ni un peso por persona.
    await expect(
      page.getByRole('heading', { level: 2, name: /Ranking|Quién vendió|Venta por/ }),
      'El tablero del salón trae un ranking de venta por persona, que su §4.4.3 ' +
        'prohíbe. Lo que mide el uso del recurso es la ocupación.',
    ).toHaveCount(0);

    // Sus dos acciones son ENLACES: llevan a otra pantalla, no disparan nada.
    const acciones = accionesDelTablero(page, 'Cómo va el salón');
    await expect(acciones.getByRole('link', { name: 'Ir a la agenda' })).toBeVisible();
    await expect(acciones.getByRole('button', { name: 'Nueva venta' })).toHaveCount(0);

    // ── 5 · LAS TRECE PANTALLAS DEL MODELO RESPONDEN ──────────────────────
    for (const [pantalla, marca] of PANTALLAS) {
      await abrirPantalla(page, `/estetica-salon/${pantalla}`, marca);
    }

    // La de inicio es la AGENDA, y su carpeta dedica una sección a defender por qué no
    // es un dashboard: se abre de cuarenta a ochenta veces al día y el hueco de las 3
    // pm no se recupera mañana. Los botones de día se pintan en los tres estados
    // —cargando, vacío y con citas—, así que la pantalla se reconoce sin un solo dato.
    await abrirPantalla(page, '/estetica-salon/agenda-del-dia', /citas|ocupado/);
    await expect(page.getByRole('button', { name: 'Día siguiente' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Día anterior' })).toBeVisible();

    // ── UNA CITA, SU SERVICIO CERRADO, Y COBRADA CON SU COMISIÓN ──────────
    //
    // El recorrido del encargo: agendar · iniciar la cita · cerrar el servicio ·
    // cobrar con comisión. Los tres últimos pasos van AHORA POR LA PANTALLA, que
    // es lo que faltaba:
    //
    //  · la AGENDA DEL DÍA pinta la cita. Leía dos entidades del puente con forma
    //    de bloque —`Cita` no la tiene y `HuecoDisponible` no existía—, y ahora
    //    lee los dos comandos que sí sirven eso, `agenda.dia` y `agenda.huecos`;
    //  · TOCAR el bloque la INICIA y entra a la cita. La ruta y el comando
    //    existían y ninguna pantalla los llamaba con el identificador correcto: el
    //    bloque es un SERVICIO de la cita y `agenda.iniciar_cita` recibe la cita;
    //  · CERRAR EL SERVICIO se hace en la pantalla de la cita en curso. Publicaba
    //    `{citaId}` —que no es un campo del comando— y el comando exigía
    //    `almacenId`, que esa pantalla no tiene ni debe pedir: zod la rechazaba y
    //    **ninguna pantalla podía cerrar un servicio**. Sin cerrar, la cita no
    //    llega a `terminada`, que es lo único que la pantalla de cobro lista.
    //
    // AGENDAR sigue yendo por su ruta: el asistente son cuatro pasos y lo que esta
    // suite demuestra es el camino del dinero. Lo que sí se comprueba es su parte
    // que estaba rota —el ALTA DE LA CLIENTA, que publicaba en una ruta
    // inexistente— porque la demo tiene cero clientas y sin una no se pasa del
    // primer paso.
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

    /**
     * 0 · LA CLIENTA, por la MISMA ruta que usa el asistente de agendar.
     *
     * El asistente publicaba en `/api/cliente/crear` «por convención», y esa ruta
     * no existe: el alta devolvía la página de error de Next y el asistente se
     * quedaba en el primer paso con la demo en cero clientas. La de verdad es
     * `POST /api/clientes` (`cliente.alta`), que además devuelve la ficha que ya
     * hay si el teléfono está repetido — así esta prueba se puede correr dos veces
     * seguidas sin duplicar a nadie.
     */
    const alta = await page.request.post('/api/clientes', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: { nombre: 'Clienta de la demostración', telefono: '5550001111' },
    });
    expect(
      alta.status(),
      `No se pudo dar de alta a la clienta: ${(await alta.text()).slice(0, 300)}. Es el primer ` +
        'paso del asistente de agendar: sin él, un salón sin clientas no puede agendar nada.',
    ).toBe(200);
    const clienteId = ((await alta.json()) as { datos?: { clienteId?: string } }).datos?.clienteId;
    expect(clienteId, 'El alta no devolvió la clienta.').toBeTruthy();

    /**
     * 0.5 · LAS CITAS QUE DEJÓ UNA CORRIDA ANTERIOR SE CANCELAN.
     *
     * ── Por qué, y qué escondía no hacerlo ────────────────────────────────
     * La clienta es la MISMA en cada corrida —`cliente.alta` devuelve la ficha que ya
     * hay cuando el teléfono se repite, a propósito— así que la agenda del día
     * acumula una cita por cada pasada que murió a mitad. Y el paso siguiente busca
     * el bloque de la clienta con `.first()`: con dos citas suyas en el día, tocaba
     * la de la corrida ANTERIOR, cerraba el servicio de ésa, y la de esta corrida se
     * quedaba `en_curso` para siempre. El fallo salía tres pasos más abajo —«se cerró
     * el servicio y la cita no quedó terminada»— señalando un comando que estaba
     * bien.
     *
     * Cancelar es lo que el salón hace con una cita que nadie atendió, y deja de
     * pintarse en la rejilla (`estadoVisual` devuelve nulo), así que después de esto
     * la única cita de la clienta en el día es la de esta corrida.
     */
    const suyasDeAntes = await consultarPuente<{ readonly id?: string; readonly estado?: string }>(
      page,
      'Cita',
      { filtro: { cliente_id: clienteId }, limite: 40 },
    );
    for (const vieja of suyasDeAntes) {
      if (vieja.id === undefined) continue;
      if (!['agendada', 'confirmada', 'en_curso'].includes(vieja.estado ?? '')) continue;
      const cancelada = await page.request.post('/api/agenda/cancelar', {
        headers: cabecerasDeEscrituraDePrueba(),
        data: { citaId: vieja.id, motivo: 'Corrida de prueba anterior' },
      });
      expect(
        cancelada.status(),
        `No se pudo cancelar la cita ${vieja.id} que dejó una corrida anterior: ` +
          (await cancelada.text()).slice(0, 200),
      ).toBe(200);
    }

    /**
     * 1 · AGENDAR EN UN HUECO QUE EL SERVIDOR DICE QUE EXISTE.
     *
     * ── Los dos intentos anteriores, y por qué los dos eran frágiles ───────
     * El primero clavaba «ahora + 15 minutos» y hacía la corrida irrepetible: la
     * segunda pasada choca con la cita de la primera y el servidor contesta, con toda
     * la razón, «esa persona ya tiene a alguien a esa hora». Esa regla es la que
     * protege la agenda de un salón —dos clientas a la misma hora con la misma
     * estilista es el defecto más caro de este giro— y no se toca.
     *
     * El segundo probaba siete horas en pasos de una: aguantaba siete corridas y a la
     * octava volvía a fallar. El motivo es que la cita de cada corrida acaba COBRADA, y
     * una cita cobrada SIGUE OCUPANDO su hora: cancelar las de la clienta —que es lo de
     * arriba— no libera ninguna.
     *
     * Ahora se le PREGUNTA al servidor dónde hay hueco, que es literalmente lo que hace
     * una recepcionista y lo que hace la pantalla de agendar. Se piden los del día, se
     * descartan los que ya pasaron y se prueban en orden con la persona a la que ese
     * hueco pertenece. Aguanta tantas corridas como capacidad real tenga la demo, y
     * cuando de verdad se llena, el fallo lo dice con esas palabras y con el comando
     * que la vuelve a sembrar.
     */
    const dia = fechaLocalDePrueba(new Date());
    const diaSiguiente = fechaLocalDePrueba(new Date(Date.now() + 86_400_000));
    const respuestaHuecos = await page.request.post('/api/agenda/huecos', {
      headers: cabecerasDeEscrituraDePrueba(),
      data: { desde: dia, hasta: diaSiguiente, minutos: 30 },
    });
    expect(
      respuestaHuecos.status(),
      `/api/agenda/huecos respondio ${String(respuestaHuecos.status())}: ` +
        (await respuestaHuecos.text()).slice(0, 300),
    ).toBe(200);
    const cuerpoHuecos = (await respuestaHuecos.json()) as {
      datos?: {
        huecos?: readonly {
          profesionalId?: string;
          inicio?: string;
          nombreCorto?: string;
          minutos?: number;
        }[];
      };
    };
    /**
     * CUALQUIER hueco del día, incluidos los que ya pasaron.
     *
     * Aquí había un filtro de «desde diez minutos en adelante» y dejaba la prueba sin
     * un solo candidato a media tarde: la jornada de la persona que trabaja ese día se
     * acaba, y lo que queda libre está por la mañana. Pero lo que esta prueba demuestra
     * es EL CAMINO DEL DINERO —iniciar, cerrar el servicio, cobrar, comisionar— y ese
     * camino no mira la hora agendada: `iniciar_cita` sella `inicio_real` con la de
     * ahora. Una cita registrada después de que la clienta llegó es el walk-in de
     * cualquier salón, no un caso inventado para pasar la prueba.
     */
    const candidatos = (cuerpoHuecos.datos?.huecos ?? [])
      .filter((h) => (h.inicio ?? '') !== '' && (h.profesionalId ?? '') !== '')
      // EL MÁS GRANDE PRIMERO, y no el más temprano. Los huecos se piden de treinta
      // minutos porque es el mínimo vendible, pero el servicio de la prueba dura lo
      // que dura —cuatro tramos por el factor de esa persona— y en un hueco de media
      // hora no cabe: `agenda.cita` lo rechaza con razón. Probar por tamaño hace que
      // el primer intento sea el que más probabilidades tiene de caber, en vez de
      // gastar los doce intentos en los huecos chicos de la mañana.
      .sort((a, b) => (b.minutos ?? 0) - (a.minutos ?? 0));
    expect(
      candidatos.length,
      'La agenda de la demo no tiene un solo hueco libre en lo que queda del día, así que no ' +
        'hay dónde agendar. No es un defecto del código: las corridas anteriores la ' +
        'llenaron, y una cita COBRADA sigue ocupando su hora. Vuelve a sembrarla:\n' +
        '  node --conditions=react-server scripts/sembrar-demos.mjs --solo demo-acople-estetica',
    ).toBeGreaterThan(0);

    const rechazos: string[] = [];
    let cita: APIResponse | undefined;
    let profesionalDeLaCita = '';
    for (const hueco of candidatos.slice(0, 12)) {
      const intento = await page.request.post('/api/agenda/cita', {
        headers: cabecerasDeEscrituraDePrueba(),
        data: {
          clienteId,
          origen: 'mostrador',
          inicio: hueco.inicio,
          servicios: [{ servicioId: servicio?.id, profesionalId: hueco.profesionalId }],
        },
      });
      if (intento.status() === 200) {
        cita = intento;
        profesionalDeLaCita = hueco.profesionalId ?? '';
        break;
      }
      rechazos.push(
        `${hueco.inicio ?? ''} (${hueco.nombreCorto ?? ''}, ${String(hueco.minutos ?? 0)} min) ` +
          `respondio ${String(intento.status())} ${(await intento.text()).slice(0, 200)}`,
      );
    }
    expect(
      cita,
      'El servidor ofreció huecos y rechazó la cita en TODOS. Si todos son de menos minutos ' +
        'que el servicio, el día está lleno y hay que volver a sembrar la demo; si alguno era ' +
        'de sobra, `agenda.huecos` y `agenda.cita` no están de acuerdo, que es peor.\n' +
        rechazos.join('\n'),
    ).toBeDefined();
    const agendada = (await cita!.json()) as {
      datos?: {
        citaId?: string;
        /** El folio que el servidor le puso: es como la caja la identifica. */
        folio?: string;
        // La hora que el servidor le puso: la rejilla pinta ÉSA, no la que se pidió.
        servicios?: readonly { citaServicioId?: string; inicio?: string }[];
      };
    };
    const citaId = agendada.datos?.citaId;
    const citaServicioId = agendada.datos?.servicios?.[0]?.citaServicioId;
    const inicioDeLaCita = agendada.datos?.servicios?.[0]?.inicio ?? '';
    const folioDeLaCita = agendada.datos?.folio ?? '';
    expect(inicioDeLaCita, 'Agendar no devolvió la hora del servicio.').not.toBe('');
    expect(folioDeLaCita, 'Agendar no devolvió el folio de la cita.').not.toBe('');
    expect(citaId, 'Agendar no devolvió la cita.').toBeTruthy();
    expect(citaServicioId, 'Agendar no devolvió el servicio de la cita.').toBeTruthy();

    /**
     * 2 · LA AGENDA DEL DÍA PINTA LA CITA, y tocarla la INICIA.
     *
     * Es la pantalla de inicio de la recepcionista y hasta hoy enseñaba «Hoy no hay
     * citas todavía» con la cita agendada y en la base: pedía `Cita` y
     * `HuecoDisponible` esperando filas con forma de BLOQUE, y ninguna de las dos
     * la tiene. Ahora sale de `agenda.dia` —columnas por profesional, con sus
     * tramos activos— y de `agenda.huecos`, con los nombres del puente.
     *
     * El bloque se busca por el NOMBRE DE LA CLIENTA, que es lo que la
     * recepcionista lee: si aparece, el join de nombres funcionó y el día se
     * calculó en la zona del negocio —con el día en UTC, una cita de la tarde en
     * México caía en el día siguiente y la rejilla volvía a verse vacía—.
     */
    await abrirPantalla(page, '/estetica-salon/agenda-del-dia', /citas|ocupado/);
    /**
     * EL BLOQUE DE ESTA CITA, por su HORA y por su clienta.
     *
     * Era `.first()` de los bloques de la clienta, y eso tocaba el de otra corrida:
     * una cita que quedó `terminada` —servicio cerrado y sin cobrar— sigue pintada y
     * NO se puede cancelar, así que la limpieza de arriba no la quita. La pantalla
     * abría con el servicio ya cerrado, «Cerrar servicio» salía DESACTIVADO y el
     * fallo era un clic agotando tres minutos sobre un botón inerte.
     *
     * La hora sale de la respuesta de agendar y se formatea en la zona del navegador
     * —`timezoneId` del `playwright.config.ts`—, que es la misma en la que la rejilla
     * la pinta. Así el bloque es UNO y es el de esta corrida.
     */
    const horaDeLaCita = new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(inicioDeLaCita));
    const elBloque = page
      .getByRole('button', {
        name: new RegExp(`${horaDeLaCita}.*Clienta de la demostración`, 's'),
      })
      .first();
    await expect(
      elBloque,
      'La agenda del día no pinta la cita que se acaba de agendar. Sale de `agenda.dia` + los ' +
        'nombres del puente: si no está, o el día se armó en otra zona, o la columna no trajo ' +
        'sus citas.',
    ).toBeVisible({ timeout: 20_000 });

    await elBloque.click();
    await expect(
      page,
      'Tocar la cita no llevó a la cita en curso. Iniciar es lo que arranca los dos relojes, y ' +
        'entrar es lo que permite cerrar el servicio: sin eso el recorrido se queda sin puerta.',
    ).toHaveURL(/cita-en-curso/, { timeout: 20_000 });

    /**
     * 3 · CERRAR EL SERVICIO, EN SU PANTALLA.
     *
     * Cerrar no cobra: consume el material de cabina y deja la cita lista para la
     * caja. Es el paso que `Cobrar` exige —lista las citas `terminada`— y el que
     * ninguna pantalla podía dar.
     */
    const cerrar = page.getByRole('button', { name: 'Cerrar servicio' });
    await expect(
      cerrar,
      'La pantalla de la cita en curso no ofrece cerrar el servicio.',
    ).toBeVisible({ timeout: 20_000 });
    await cerrar.click();

    // Contra el SERVIDOR: la cita tiene que quedar `terminada`. La pantalla se
    // quedaría igual si el comando fallara en silencio.
    await expect
      .poll(
        async () => {
          const citas = await consultarPuente<{ readonly estado?: string }>(page, 'Cita', {
            filtro: { id: citaId },
            limite: 1,
          });
          return citas[0]?.estado ?? '';
        },
        {
          message:
            'Se cerró el servicio desde la pantalla y la cita no quedó `terminada`. Es el único ' +
            'estado que la pantalla de cobro lista: sin él, el salón no puede cobrar por su ' +
            'interfaz.',
          timeout: 30_000,
        },
      )
      .toBe('terminada');

    // 4 · COBRAR, POR LA PANTALLA.
    await abrirPantalla(page, '/estetica-salon/cobrar', /cobrar/i);
    /**
     * LA TARJETA DE ESTA CITA, POR SU FOLIO.
     *
     * Se buscaba por el IMPORTE, y el importe no identifica nada: una corrida
     * anterior que murió entre «cerrar» y «cobrar» deja su cita `terminada` —cerrada
     * y sin cobrar, y una cita terminada NO se puede cancelar— así que la pantalla de
     * cobro lista DOS tarjetas del mismo servicio y el mismo precio. `.first()`
     * cobraba la de antes: la venta existía, el acuse salía, y la comisión que se
     * buscaba después era de OTRO servicio de cita. El fallo aparecía al final,
     * diciendo «no se causó ninguna comisión», sobre un cobro que sí comisionó.
     *
     * El folio es lo que la caja canta y lo que el servidor puso al agendar. Con el
     * borde de dígito para que «C-1» no case con «C-12»: la caja de un día lleva las
     * dos.
     */
    const folioExacto = new RegExp(
      folioDeLaCita.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![0-9])',
    );
    const laCita = page.getByRole('button', { name: folioExacto });
    await expect(
      laCita.first(),
      `La pantalla de cobro no lista la cita ${folioDeLaCita} con su servicio cerrado. Lee ` +
        '`Cita` con estado `terminada`: si no está, cerrar el servicio no dejó la cita terminada.',
    ).toBeVisible({ timeout: 20_000 });

    // Y con SU importe: el cajero cobra lo que la tarjeta dice, y la tarjeta lo dice
    // porque el precio se congeló al agendar —si sube el tinte entre agendar y cobrar,
    // la clienta paga lo que se le dijo—.
    await expect(
      laCita.first(),
      `La tarjeta de la cita ${folioDeLaCita} no enseña su importe: tiene que decir ` +
        `${enPesosDelSalon(precioCentavos)}, que es el precio congelado del servicio.`,
    ).toContainText(enPesosDelSalon(precioCentavos));
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
    test.info().annotations.push({
      type: 'cobrado',
      description: `${(precioCentavos / 100).toFixed(2)} MXN · el servicio de la cita`,
    });

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
    expect(laComision?.profesional_id).toBe(profesionalDeLaCita);
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
