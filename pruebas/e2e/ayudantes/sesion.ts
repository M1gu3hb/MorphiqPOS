import { expect } from '@playwright/test';
import type { Locator, Page, PlaywrightWorkerArgs, TestInfo } from '@playwright/test';

/**
 * El ayudante que comparten las cinco pruebas de plantilla (F3-REGLAS §8, condición 6).
 *
 * ── Por qué UNO y no cinco ─────────────────────────────────────────────────
 * Entrar con PIN son ocho pasos: pedir la plantilla de empleados, tocar un nombre,
 * teclear cuatro dígitos, esperar el salto a la pantalla de inicio del rol. Escrito
 * cinco veces, la primera que alguien corrija —un `aria-label` nuevo en el teclado,
 * otro orden de las tarjetas— deja las otras cuatro atrás, y lo que queda es una
 * suite donde tres modelos pasan y dos fallan por una razón que no tiene nada que
 * ver con la plantilla. Es la misma regla que `PLANTILLAS = PAQUETES` en
 * `packages/contracts/src/comandos/plantillas.ts`: dos listas de lo mismo es cómo
 * una se queda atrás.
 *
 * ── DÓNDE se mira el vocabulario, y por qué ahí y no en las 61 pantallas ───
 * F-017 se inyecta en dos envoltorios —`app/(interno)/layout.tsx` y
 * `app/(modelos)/layout.tsx`— pero hoy sólo TRES componentes lo consumen:
 * `heredado/components/common/Sidebar.jsx` (vía `etiquetaDeNavegacion`),
 * `src/abarrotes/Producto.tsx` y `src/restaurante/PortalDelComensal.tsx`. De esos
 * tres, la ficha de producto se monta con `productoId=""` —su página pasa la cadena
 * vacía— así que su `vocabulario.conArticulo('producto')` no llega nunca a pintarse,
 * y el portal del comensal necesita un token de mesa. **El único sitio donde el
 * sustantivo del giro se ve hoy con sólo entrar es el menú lateral de Miguel.**
 * Ahí se mira, y ahí se mira en el marco `(interno)`, que es el que lo monta.
 *
 * Esto no es una comodidad de la prueba: es el hallazgo. Si mañana una de las 61
 * pantallas empieza a consumir el vocabulario, esta prueba se amplía con ella; lo
 * que no se hace es afirmar contra un lector que no existe.
 *
 * Y hay una consecuencia que no se puede tapar: de las tres entradas del menú con
 * `entidad` —`responsable` (/mesero), `preparacion` (/cocina) y `producto`
 * (/productos)—, las dos primeras son del bloque de SALA, que la plantilla
 * `tienda` no incluye. En una tienda, una ferretería, una farmacia o una estética
 * el menú sólo puede enseñar UN sustantivo del giro: «Productos». Todo lo demás
 * que el giro nombra —la unidad de servicio, la orden, su línea, la clienta— no
 * se ve hoy en ninguna pantalla del menú. Para eso está
 * `exigirVocabularioDelGiro`, que le pregunta al SERVIDOR; el menú se sigue
 * mirando porque es lo que el dueño lee.
 *
 * ── Nada de esperas por tiempo ─────────────────────────────────────────────
 * No hay un solo `waitForTimeout` aquí. `13-PRUEBAS §2` lo prohíbe —«prohibido
 * `sleep` para "esperar a que termine"»— y el propio `playwright.config.ts` lo repite
 * en el comentario de sus límites: los 30 s del `timeout` son el techo, no el
 * mecanismo. Todo lo que espera aquí espera por una CONDICIÓN: un `expect` que
 * reintenta, un `waitForURL`, un estado de respuesta.
 *
 * ── Selectores por rol y texto accesible ───────────────────────────────────
 * Ni una clase de CSS. El menú lateral de Miguel es un muro de utilidades
 * (`flex items-center gap-3 px-3 py-2.5 rounded-lg …`) y una prueba atada a eso se
 * rompe el día que alguien cambie el `gap`, sin que cambie una sola conducta. Lo
 * que estas pruebas afirman es lo que el dueño LEE, así que se busca por lo que el
 * dueño lee.
 *
 * ── CÓMO SE CORRE CUANDO EL BLOQUEO SE LEVANTE ─────────────────────────────
 * Las tres cosas que faltan están en `docs/fase-2/A3-COMO-APLICAR.md §4`. Cuando
 * estén:
 *
 *   1 · Las 70 migraciones aplicadas (A3 §2 da las tres vías, de mejor a peor).
 *   2 · Una demo POR GIRO. El giro NO se puede cambiar en caliente —ningún comando
 *       toca `organizaciones.giro`, sólo `nombre` y `paquete`— así que los cinco
 *       vocabularios necesitan cinco organizaciones, y el despliegue apunta a una
 *       cada vez con `ORGANIZACION`:
 *
 *         pnpm db:alta-negocio --slug demo-acople-ferreteria \
 *           --nombre "Demo del acople · ferretería" --giro ferreteria --paquete tienda
 *         pnpm db:bootstrap --org demo-acople-ferreteria --persona "Demo" --pin 1234
 *
 *   3 · El preview abierto a la automatización (VERCEL-ENTORNO §2, opción 1).
 *
 * Y entonces, una corrida por modelo:
 *
 *   MORPHIQPOS_URL_DESPLIEGUE=https://morphiqpos-git-fase-2-mh-astral-systems.vercel.app \
 *   MORPHIQPOS_BYPASS_VERCEL=<el-secreto> \
 *   MORPHIQPOS_ORG_DEMO=demo-acople-ferreteria \
 *   MORPHIQPOS_DEMO_PIN=1234 \
 *   pnpm test:e2e --grep ferretería
 *
 * Sin `--grep`, las cinco corren y cuatro fallan nombrando el giro que les falta.
 * Eso es correcto y es la información que hace falta: un despliegue sirve a UN
 * negocio (R16, `negocioDelDespliegue`), y probar cinco vocabularios en el navegador
 * cuesta cinco demos. Contra el servidor local basta con quitar
 * `MORPHIQPOS_URL_DESPLIEGUE` y poner `ORGANIZACION` en el `.env`.
 */

/** Las tres plantillas que existen hoy en `organizaciones.paquete` (D-01). */
export type Plantilla = 'tienda' | 'cafeteria' | 'restaurante';

/**
 * Los cuatro negocios que cobran de verdad (F3-REGLAS §4.5).
 *
 * Se comparan por NOMBRE porque es lo único que `/api/auth/empleados` devuelve sin
 * sesión —`datos.negocio` es `organizaciones.nombre`— y esta comprobación tiene que
 * poder hacerse ANTES de entrar. Si la suite se encontrara operando sobre uno de
 * éstos, lo que queda después no es una prueba: son ventas de prueba y mesas
 * abiertas en la caja de alguien que cobra esa noche.
 */
const NEGOCIOS_VIVOS = [
  'Restaurante MH',
  'Café Jacaranda',
  'Cafetería Jacaranda',
  'Abarrotes Don Chuy',
  'Ferretería La Broca',
] as const;

/**
 * La plantilla con la que se da de alta cada giro (`paquetePermitidoParaGiro`).
 *
 * Son los SEIS giros de `GIROS` en `packages/contracts/src/comandos/ambito.ts`:
 * `estetica` entró con la migración 164. Y entra aquí con `tienda`, que no es un
 * apaño provisional: `PAQUETES` tiene tres plantillas, la de un salón es la de
 * mostrador con caja e inventario, y la de sala está reservada a los giros de
 * alimentos por el `check` de la 058.
 *
 * La clave sigue siendo `string` y no un tipo cerrado, ahora por otra razón:
 * `pruebas/` no tiene `@morphiqpos/contracts` como dependencia, así que desde aquí
 * `Giro` no resuelve. El `?? 'tienda'` de abajo es lo que hace que pedir un giro
 * inventado produzca un mensaje útil en vez de `undefined` dentro del comando.
 */
const PLANTILLA_DE_ALTA: Readonly<Record<string, Plantilla>> = {
  restaurante: 'restaurante',
  cafeteria: 'cafeteria',
  tienda: 'tienda',
  ferreteria: 'tienda',
  farmacia: 'tienda',
  estetica: 'tienda',
};

const SLUG_DEMO = process.env['MORPHIQPOS_ORG_DEMO'] ?? '';
const PIN_DEMO = process.env['MORPHIQPOS_DEMO_PIN'] ?? '';
const PERSONA_DEMO = process.env['MORPHIQPOS_DEMO_PERSONA'] ?? '';

/** La plantilla de comando de A3 §4.1, con el giro que pide cada modelo. */
function comandoDeAlta(giro: string): string {
  const slug = `demo-acople-${giro}`;
  const plantilla = PLANTILLA_DE_ALTA[giro] ?? 'tienda';
  return [
    `  pnpm db:alta-negocio --slug ${slug} --nombre "Demo del acople · ${giro}" \\`,
    `    --giro ${giro} --paquete ${plantilla}`,
    `  pnpm db:bootstrap --org ${slug} --persona "Demo" --pin 1234`,
    `  y en el entorno del despliegue: ORGANIZACION=${slug}`,
  ].join('\n');
}

interface EmpleadoDeAcceso {
  readonly id: string;
  readonly nombre: string;
}

interface RespuestaDeEmpleados {
  readonly ok?: boolean;
  readonly datos?: {
    readonly negocio?: string;
    readonly usuarios?: readonly EmpleadoDeAcceso[];
  };
}

/**
 * La PRECONDICIÓN. Si no se cumple, la suite se pone en ROJO diciendo qué falta.
 *
 * ── Por qué no es un `test.skip` ni un `test.fixme` ────────────────────────
 * Porque una prueba saltada se lee igual que una que pasó. `13-PRUEBAS §2` lo dice
 * de las de integración y vale idéntico aquí: «una suite verde sin ellas da una
 * seguridad que no existe». Hoy no hay base, no hay demo y el preview está detrás
 * del SSO de Vercel; si estas cinco se saltaran, `F3-REGLAS §8` condición 6
 * quedaría marcada como cumplida sin que nadie haya abierto un navegador. Falla, y
 * el mensaje del fallo es el único sitio donde alguien va a leer qué le falta.
 *
 * ── Por qué en `beforeAll` y no dentro de la prueba ────────────────────────
 * Porque lo que comprueba no es del modelo, es del entorno: es la misma respuesta
 * para las cinco. Dentro de la prueba, el fallo saldría después de un `goto` y de
 * un login, y el rastro diría «no encontré el botón 7» en vez de «no hay
 * organización de demostración».
 *
 * `info.project.use` es de dónde salen la URL y las cabeceras: el
 * `playwright.config.ts` ya decide si se corre contra el preview o contra el
 * servidor local, y volver a leer `MORPHIQPOS_URL_DESPLIEGUE` aquí crearía la
 * segunda lista que se queda atrás.
 */
export async function exigirDemostracion(
  playwright: PlaywrightWorkerArgs['playwright'],
  info: TestInfo,
): Promise<void> {
  if (SLUG_DEMO === '') {
    throw new Error(
      [
        'Falta MORPHIQPOS_ORG_DEMO.',
        '',
        'F3-REGLAS §4.5: «Toda prueba de extremo a extremo, todo recorrido de Playwright',
        'y toda comprobación manual se hace sobre una organización de DEMOSTRACIÓN,',
        'creada para eso». Restaurante MH, Café Jacaranda, Abarrotes Don Chuy y',
        'Ferretería La Broca son clientes que cobran.',
        '',
        'Declara contra qué demo corre esta suite antes de correrla:',
        '  MORPHIQPOS_ORG_DEMO=demo-acople MORPHIQPOS_DEMO_PIN=1234 pnpm test:e2e',
      ].join('\n'),
    );
  }

  if (!/^\d{4}$/.test(PIN_DEMO)) {
    throw new Error(
      [
        `MORPHIQPOS_DEMO_PIN tiene que ser de CUATRO dígitos (llegó «${PIN_DEMO}»).`,
        '',
        'No es un capricho de la prueba: `heredado/pages/POSLogin.jsx` manda el PIN en',
        'cuanto `pin.length === 4` y no deja teclear un quinto dígito, aunque',
        '`/api/auth/entrar` acepte de cuatro a ocho. Un PIN de seis en la demo no se',
        'puede teclear en esa pantalla, y la prueba se quedaría esperando un salto que',
        'nadie va a dar.',
        '',
        `  pnpm db:bootstrap --org ${SLUG_DEMO} --persona "Demo" --pin 1234`,
      ].join('\n'),
    );
  }

  const opciones = info.project.use;
  const contexto = await playwright.request.newContext({
    ...(opciones.baseURL === undefined ? {} : { baseURL: opciones.baseURL }),
    ...(opciones.extraHTTPHeaders === undefined
      ? {}
      : { extraHTTPHeaders: opciones.extraHTTPHeaders }),
  });

  try {
    // `/api/auth/empleados` es una de las dos rutas del sistema sin ámbito previo, y
    // por eso sirve de precondición: contesta ANTES de que exista sesión, y para
    // contestar tiene que haber resuelto `negocioDelDespliegue`. Si la base no está
    // migrada, si `ORGANIZACION` no apunta a nada o si el muro de Vercel está en
    // medio, se sabe aquí y no a mitad del login.
    const respuesta = await contexto.get('/api/auth/empleados');

    if (respuesta.status() !== 200) {
      throw new Error(
        [
          `El despliegue no pudo resolver el negocio: /api/auth/empleados → ${respuesta.status()}.`,
          `URL: ${respuesta.url()}`,
          '',
          'A3-COMO-APLICAR §4 · «Estas tres cosas están escritas y no se pueden ejercitar',
          'hasta que las migraciones estén aplicadas». Las tres, en orden:',
          '',
          '1 · Las 70 migraciones NO están aplicadas. `morphiqpos_app` no puede hacer DDL a',
          '    propósito (A3 §1) y no hay CLI de Supabase en esta máquina. Las tres vías para',
          '    desbloquearlo están en A3 §2, de mejor a peor.',
          '',
          '2 · La organización de demostración no existe. A3 §4.1, textual:',
          '    «pnpm db:alta-negocio --slug demo-acople --nombre "Demo del acople"',
          '     --giro tienda --paquete tienda. Hoy falla: el `check` de',
          '     `organizaciones.paquete` no admite `tienda` todavía. Y tiene que ser una',
          '     demo: los cuatro negocios vivos no se prueban.»',
          '',
          '3 · Si la respuesta es un 401 o un 302 a `vercel.com/sso-api`, esto no es la',
          '    aplicación: es la Protección de Despliegue de Vercel (VERCEL-ENTORNO §2).',
          '    Genera el Protection Bypass for Automation y pásalo:',
          '      MORPHIQPOS_BYPASS_VERCEL=<el-secreto> pnpm test:e2e',
        ].join('\n'),
      );
    }

    const cuerpo = (await respuesta.json()) as RespuestaDeEmpleados;
    const negocio = cuerpo.datos?.negocio ?? '';
    const usuarios = cuerpo.datos?.usuarios ?? [];

    if ((NEGOCIOS_VIVOS as readonly string[]).includes(negocio)) {
      throw new Error(
        [
          `ALTO. El despliegue está sirviendo a «${negocio}», que es un NEGOCIO VIVO.`,
          '',
          'F3-REGLAS §4.5: «Si al terminar quedan ventas de prueba, cortes de prueba o mesas',
          'abiertas en cualquiera de los cuatro negocios vivos, el acople está mal hecho',
          'aunque todo lo demás esté bien.»',
          '',
          'Esta suite entra con PIN y CAMBIA la plantilla del negocio. Sobre un cliente que',
          'cobra, eso le quita o le da módulos que paga. No se sigue.',
          '',
          `Apunta ORGANIZACION a la demo (MORPHIQPOS_ORG_DEMO dice «${SLUG_DEMO}»):`,
          comandoDeAlta('tienda'),
        ].join('\n'),
      );
    }

    if (negocio === '') {
      throw new Error(
        [
          '/api/auth/empleados contestó 200 pero sin nombre de negocio.',
          'Eso sólo pasa si la respuesta cambió de forma: `datos.negocio` es',
          '`organizaciones.nombre` y lo pone `negocioDelDespliegue`. Revisa',
          'apps/web/app/api/auth/empleados/route.ts antes de tocar esta prueba.',
        ].join('\n'),
      );
    }

    if (usuarios.length === 0) {
      throw new Error(
        [
          `La demo «${negocio}» existe y no tiene a nadie dado de alta, así que no hay`,
          'forma de entrar. `alta-negocio` crea la organización y su primera sucursal;',
          'el dueño con PIN lo crea `bootstrap`, que es otro paso:',
          '',
          `  pnpm db:bootstrap --org ${SLUG_DEMO} --persona "Demo" --pin ${PIN_DEMO}`,
        ].join('\n'),
      );
    }
  } finally {
    await contexto.dispose();
  }
}

/**
 * Entra con PIN y deja la sesión abierta en el navegador.
 *
 * ── Por qué hay que tocar un nombre y no basta el PIN ──────────────────────
 * Porque el PIN ya no se compara en el navegador. Era el agujero P0-01 del sistema
 * original —`usuarios.find(u => u.pin === pinToUse)` con los PIN de toda la
 * plantilla descargados— y al arreglarlo el servidor necesita saber DE QUIÉN es el
 * PIN: probarlo contra cada empleado sería el barrido que el límite por IP existe
 * para frenar. Cuando la demo tiene una sola persona, `POSLogin` la selecciona sola
 * y este toque es redundante; se hace igual porque una demo con dos empleados no
 * debería cambiar la prueba.
 *
 * ── Por qué el nombre se lee de la API y no se escribe aquí ────────────────
 * Porque el nombre lo eligió quien corrió `db:bootstrap`. Clavarlo en la prueba
 * obligaría a que todas las demos se llamen igual, y el día que no, el fallo diría
 * «no encontré el botón» en vez de «esa persona no está dada de alta».
 * `MORPHIQPOS_DEMO_PERSONA` existe para desempatar cuando hay varias.
 *
 * ── El límite de tasa, que es la razón de que esto se llame UNA vez ────────
 * `LIMITES.entrar` son 20 intentos por IP cada 300 s. Cinco modelos por dos
 * proyectos son diez entradas; entrar en cada aserción las multiplicaría y la suite
 * empezaría a fallar con 429 al azar, que es el peor fallo posible: parece
 * fragilidad y es aritmética.
 */
export async function entrar(page: Page): Promise<string> {
  const respuesta = await page.request.get('/api/auth/empleados');
  const cuerpo = (await respuesta.json()) as RespuestaDeEmpleados;
  const usuarios = cuerpo.datos?.usuarios ?? [];

  // `toLocaleLowerCase('es-MX')` en los dos lados: comparar con el `toLowerCase()`
  // invariante haría que «MARÍA» y «maría» no casaran en algunas configuraciones, y el
  // fallo diría «esa persona no está dada de alta» sobre alguien que sí está.
  const buscado = PERSONA_DEMO.toLocaleLowerCase('es-MX');
  const elegido =
    PERSONA_DEMO === ''
      ? usuarios[0]
      : usuarios.find((u) => u.nombre.toLocaleLowerCase('es-MX') === buscado);

  if (elegido === undefined) {
    throw new Error(
      [
        PERSONA_DEMO === ''
          ? 'La demo no devolvió ningún empleado con el que entrar.'
          : `MORPHIQPOS_DEMO_PERSONA dice «${PERSONA_DEMO}» y la demo no tiene a nadie así.`,
        `Dados de alta: ${usuarios.map((u) => u.nombre).join(', ') || '(ninguno)'}`,
      ].join('\n'),
    );
  }

  await page.goto('/login-pos');

  // Su pantalla pinta una tarjeta por persona con el nombre y la etiqueta del rol
  // dentro. Se busca por nombre accesible, que es lo que se lee.
  await page.getByRole('button', { name: elegido.nombre }).click();
  await expect(page.getByText(`Iniciando como: ${elegido.nombre}`)).toBeVisible();

  // El teclado son botones con el dígito como nombre accesible. `exact` porque sin
  // él «1» también casaría con «10» si algún día hay uno.
  for (const digito of PIN_DEMO) {
    await page.getByRole('button', { name: digito, exact: true }).click();
  }

  // `POSLogin` manda el PIN solo al cuarto dígito y salta a `ROLE_HOME_ROUTES`. Un
  // dueño llega como administrador, y su casa es la raíz: el dashboard. Se espera
  // por la URL —una condición— y no por un tiempo.
  await page.waitForURL((url) => !url.pathname.startsWith('/login-pos'));

  return elegido.nombre;
}

interface RespuestaDeComando {
  readonly ok?: boolean;
  readonly error?: { readonly codigo?: string; readonly mensaje?: string };
}

/**
 * Cambia la plantilla del negocio, que es el paso «cambiar a esa plantilla».
 *
 * ── Por qué por la ruta y no por la pantalla ───────────────────────────────
 * La pantalla es Configuración → Modo Presentación, y está detrás de una contraseña
 * que el servidor compara con Argon2id (`desbloquearPresentacion`). En una demo
 * recién creada esa contraseña NO está configurada, así que el candado no se puede
 * abrir ni con la correcta: la pantalla enseña «hay que configurarla primero». Pedir
 * que la demo la tenga añadiría un cuarto bloqueo a los tres de A3 §4 para probar
 * algo que no es el sujeto de esta prueba.
 *
 * Lo que se usa es EXACTAMENTE la ruta que usa ese botón —`/api/configuracion/paquete`,
 * con las mismas cabeceras que pone `heredado/api/cliente.ts`— así que pasa por el
 * mismo comando, el mismo gate de rol (`roles: ['dueno']`) y la misma normalización
 * de `plantillaDe()`. No se está saltando la autorización: se está saltando el
 * diálogo.
 *
 * ── Por qué NO recarga aquí ────────────────────────────────────────────────
 * `paquete_modo` llega al navegador por el `useQuery(['config'])` de `ConfigContext`,
 * y el menú lateral se pinta con él. Recargar dentro de esta función esconde ese
 * detalle; cada prueba navega después a la pantalla que va a mirar, que es una
 * navegación completa y vuelve a pedir la configuración. Quien lea la prueba ve el
 * orden: cambio, entro, miro.
 */
export async function cambiarDePlantilla(page: Page, plantilla: Plantilla): Promise<void> {
  const respuesta = await page.request.post('/api/configuracion/paquete', {
    headers: cabecerasDeEscritura(),
    data: { paquete: plantilla },
  });

  const cuerpo = (await respuesta.json()) as RespuestaDeComando;

  expect(
    cuerpo.ok,
    [
      `No se pudo poner la plantilla «${plantilla}»: ${respuesta.status()} ` +
        `${cuerpo.error?.codigo ?? ''} ${cuerpo.error?.mensaje ?? ''}`.trim(),
      '',
      'Si el código es SIN_PERMISO, la persona con la que entra la prueba no es DUEÑO:',
      "`cambiarPaquete` declara `roles: ['dueno']` a propósito —el paquete decide qué",
      'funciones existen y qué se cobra, no es un campo más de la configuración—.',
      '`db:bootstrap` crea un dueño; un administrador creado después, no.',
      '',
      'Si es CONFIGURACION_INVALIDA, el giro de la demo no admite esa plantilla:',
      '`paquetePermitidoParaGiro` reserva `restaurante` para cafeterías y restaurantes.',
    ].join('\n'),
  ).toBe(true);
}

/**
 * Pide una plantilla y devuelve el código con el que el servidor la RECHAZA.
 *
 * Existe por la estética, y por una sola razón: `salon` no es una plantilla. Está
 * escrita como destino en el `FILE-MAP.md` de `estetica-salon` y no está en
 * `PAQUETES`, así que el sistema no la puede poner. Afirmar ese rechazo es lo único
 * honesto que se puede afirmar hoy sobre la quinta plantilla, y es infinitamente más
 * útil que una prueba saltada: el día que A3 la añada, esta afirmación se cae y
 * obliga a mirar.
 */
export async function plantillaRechazada(page: Page, valor: string): Promise<string> {
  const respuesta = await page.request.post('/api/configuracion/paquete', {
    headers: cabecerasDeEscritura(),
    data: { paquete: valor },
  });
  const cuerpo = (await respuesta.json()) as RespuestaDeComando;

  expect(
    cuerpo.ok,
    `El servidor ACEPTÓ la plantilla «${valor}». Si ya existe en PAQUETES, esta prueba ` +
      'se quedó atrás: actualízala en vez de borrar la afirmación.',
  ).not.toBe(true);

  return cuerpo.error?.codigo ?? `HTTP ${respuesta.status()}`;
}

/**
 * Las cabeceras que exige toda escritura de este sistema.
 *
 * `x-morphiqpos-request: 1` más el origen propio es lo que impide que un formulario
 * de otro sitio monte la petición sin disparar el preflight de CORS
 * (`peticionDeEscrituraValida`). La clave de idempotencia la exige `comando()` en
 * toda escritura, con ocho caracteres mínimo: es lo que hace que un reintento de red
 * no cambie la plantilla dos veces.
 */
function cabecerasDeEscritura(): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-morphiqpos-request': '1',
    'idempotency-key': crypto.randomUUID(),
  };
}

interface RespuestaDeVocabulario {
  readonly ok?: boolean;
  readonly datos?: { readonly giro?: string };
}

/**
 * Exige que la demo sea del giro de ESTE modelo, y si no, dice cómo crear la que sí.
 *
 * ── Por qué el giro no se puede cambiar y por eso se exige ─────────────────
 * Porque el vocabulario sale del GIRO y no de la plantilla, y eso es una decisión
 * deliberada de F-017: Abarrotes Don Chuy y Ferretería La Broca comparten la
 * plantilla `tienda` y NO comparten vocabulario —Don Chuy vende «productos», La Broca
 * vende «material»—. `tipos.ts` lo dice entero. La consecuencia operativa es ésta:
 * ningún comando escribe `organizaciones.giro` —sólo `nombre` y `paquete`— así que
 * la prueba no puede convertir una demo de tienda en una de ferretería. Necesita la
 * demo del giro que va a mirar.
 *
 * Fallar aquí, nombrando el comando, es más útil que fallar tres aserciones más
 * abajo con «esperaba Materiales y encontré Productos»: eso se lee como un defecto
 * del vocabulario, y no lo es.
 */
export async function exigirGiro(page: Page, esperado: string, modelo: string): Promise<void> {
  const respuesta = await page.request.get('/api/configuracion/vocabulario');
  const cuerpo = (await respuesta.json()) as RespuestaDeVocabulario;
  const giro = cuerpo.datos?.giro ?? '';

  expect(
    giro,
    [
      `El modelo «${modelo}» necesita una demo de giro «${esperado}» y ésta es de «${giro || '(vacío)'}».`,
      '',
      'El giro dice CÓMO HABLA el negocio; la plantilla dice qué COMPRÓ. Son dos ejes',
      'distintos desde la migración 054, y sólo el segundo se cambia en caliente:',
      'ningún comando escribe `organizaciones.giro`. Así que cada vocabulario necesita',
      'su propia organización de demostración:',
      '',
      comandoDeAlta(esperado),
      '',
      'Los SEIS giros de `GIROS` se pueden dar de alta: la 164 abrió el `check` de',
      '`organizaciones.giro` y la única excepción que quedaba —`estetica`— dejó de serlo. Si',
      'el comando de arriba falla con un 23514 contra ese `check`, lo que falta no es el',
      'giro: es la tanda de migraciones aplicada en esa base.',
    ]
      .join('\n')
      .trimEnd(),
  ).toBe(esperado);
}

interface RespuestaDeRestablecer {
  readonly ok?: boolean;
  readonly error?: { readonly codigo?: string; readonly mensaje?: string };
  readonly datos?: { readonly habiaTermino?: boolean; readonly singular?: string };
}

/**
 * Lo que el SERVIDOR resuelve para las entidades que el menú no puede enseñar.
 *
 * ── Por qué hace falta un segundo sitio donde mirar ────────────────────────
 * `exigirVocabulario` mira el menú lateral, que es lo que el dueño LEE, y ahí se
 * queda corto por una razón de estructura y no de esta prueba: sólo tres entradas
 * del menú llevan `entidad` y dos de ellas —`/mesero` y `/cocina`— son del bloque
 * de sala. Un negocio con la plantilla `tienda` —una estética lo es— tiene UNA
 * etiqueta traducible en todo el menú: «Productos». La unidad de servicio, la
 * orden, su línea y la clienta no aparecen en ninguna pantalla del menú, así que
 * afirmar ahí que el modelo muestra su vocabulario sería afirmar algo falso.
 *
 * ── Por qué por `vocabulario-restablecer` y no por el `GET` ────────────────
 * Porque el `GET /api/configuracion/vocabulario` devuelve el GIRO y las
 * excepciones del negocio, no los términos resueltos: el diccionario se rearma en
 * el navegador a propósito, para que corregir una palabra llegue con un
 * despliegue y no negocio por negocio. El único camino por el que el servidor
 * devuelve el sustantivo DEL GIRO es `restablecerTermino`, que contesta
 * `singular: vocabulario.singular(entidad)` leído de `DICCIONARIOS`.
 *
 * Y no borra nada: sobre una demo sin personalizaciones `habiaTermino` es `false`,
 * y se AFIRMA que lo es. Si algún día no lo fuera, esta prueba tiene que fallar en
 * vez de llevarse por delante la palabra que ese negocio eligió.
 *
 * Es del navegador igual que las demás: sale de `page.request`, con la cookie de
 * la sesión que abrió `entrar()` y las cabeceras de escritura que pone el propio
 * `heredado/api/cliente.ts`. Lo que no es, y hay que decirlo, es una PANTALLA: el
 * día que una de las 61 consuma estas entidades, la afirmación se mueve allí.
 */
export async function exigirVocabularioDelGiro(
  page: Page,
  terminos: readonly (readonly [entidad: string, singular: string])[],
): Promise<void> {
  for (const [entidad, singular] of terminos) {
    const respuesta = await page.request.post('/api/configuracion/vocabulario-restablecer', {
      headers: cabecerasDeEscritura(),
      data: { entidad },
    });
    const cuerpo = (await respuesta.json()) as RespuestaDeRestablecer;

    expect(
      cuerpo.ok,
      `No se pudo leer el término de \`${entidad}\`: ${respuesta.status()} ` +
        `${cuerpo.error?.codigo ?? ''} ${cuerpo.error?.mensaje ?? ''}`.trim() +
        '\n\nSi el código es SIN_PERMISO, la persona con la que entra la prueba no es dueño ' +
        "ni administrador: `restablecerTermino` declara `roles: ['administrador','dueno']`.",
    ).toBe(true);

    expect(
      cuerpo.datos?.habiaTermino,
      `La demo tenía una personalización de \`${entidad}\` y esta llamada ACABA DE BORRARLA. ` +
        'Esta prueba lee el término del GIRO y da por hecho que el negocio no cambió ninguno; ' +
        'si la demo los personaliza, hay que leerlos de otra forma y no seguir borrando.',
    ).toBe(false);

    expect(
      cuerpo.datos?.singular,
      `Para \`${entidad}\` este giro tiene que decir «${singular}»` +
        `${singular === '' ? ' (cadena vacía: la entidad está APAGADA, regla 3)' : ''}. ` +
        'Sale de `DICCIONARIOS` en packages/domain/src/vocabulario/diccionarios.ts, por el ' +
        'giro de la organización y no por su plantilla.',
    ).toBe(singular);
  }
}

/**
 * El menú lateral de Miguel, ya visible, listo para leerle las etiquetas.
 *
 * ── Por qué puede haber que abrirlo ────────────────────────────────────────
 * Su `Sidebar` monta DOS cosas: una barra fija `hidden lg:flex` y un cajón que sólo
 * existe cuando se toca «Abrir menú». En los dos proyectos que hay configurados
 * hoy —Desktop Chrome y Galaxy Tab S4 en horizontal, 1138 px— manda la barra fija y
 * no hay nada que abrir. Se comprueba igual porque el día que alguien añada un
 * proyecto de teléfono, la alternativa es que las cinco pruebas fallen buscando un
 * menú que está a un toque de distancia.
 *
 * ── Por qué `visible: true` ────────────────────────────────────────────────
 * Con el cajón abierto hay dos `<nav>` en el DOM: el del cajón y el de la barra fija,
 * que sigue ahí apagada con `display:none`. Sin el filtro, el modo estricto de
 * Playwright aborta con dos coincidencias, que es un fallo que no dice nada.
 */
export async function menuLateral(page: Page): Promise<Locator> {
  const hamburguesa = page.getByRole('button', { name: 'Abrir menú' });
  const menu = page.getByRole('navigation').filter({ visible: true });

  // Se espera a que exista UNA de las dos: en cuanto el marco hidrató, la decisión
  // de si hay que abrir el cajón ya es estable. Es una condición, no un tiempo.
  await expect(hamburguesa.or(menu).first()).toBeAttached();
  if (await hamburguesa.isVisible()) await hamburguesa.click();

  await expect(menu).toBeVisible();
  return menu;
}

/** Cómo se llama esa entrada del menú EN ESTE negocio (F-017, `etiquetaDeNavegacion`). */
export function entradaDeMenu(menu: Locator, etiqueta: string): Locator {
  // `exact` no es opcional aquí: sin él «Caja» casaría con «Ir a Caja» y «Productos»
  // con «Productos y categorías». La prueba afirma sobre la etiqueta EXACTA que
  // devuelve `etiquetaDeNavegacion`, que es la que el dueño lee.
  return menu.getByRole('link', { name: etiqueta, exact: true });
}

/** Lo que el menú de este negocio tiene que decir, y lo que no puede decir. */
export interface Sustantivos {
  /** Las etiquetas que SÍ, con la entidad de la que salen, para que el fallo se lea. */
  readonly propios: readonly (readonly [entidad: string, etiqueta: string])[];
  /** Las de los otros cuatro modelos. Ninguna puede aparecer. */
  readonly ajenos: readonly string[];
}

/**
 * Las aserciones de vocabulario, que son el corazón de la condición 6.
 *
 * Las etiquetas se escriben a mano en cada prueba y NO se importan de
 * `diccionarios.ts`. Es deliberado, y es la regla de `contratos-por-mutacion`: una
 * prueba que afirma contra la misma constante que el código usa para producir el
 * valor no prueba nada —cambia el diccionario, cambian las dos, y la prueba sigue
 * verde—. Escritos aquí, si alguien renombra «material» a «artículo» en el
 * diccionario de ferretería, ESTA prueba se cae, que es exactamente lo que el modelo
 * de ferretería levantó como defecto propio: «artículo donde debe decir material».
 *
 * (Y aunque se quisiera, no se puede: `@morphiqpos/domain` no es dependencia de la
 * raíz del monorepo, así que desde `pruebas/` no resuelve.)
 *
 * Los AJENOS importan tanto como los propios. Una plantilla que dice «Materiales»
 * y además «Platillos» no está mostrando su vocabulario: está mostrando los dos, y
 * eso es lo que pasa cuando el diccionario se aplica encima en vez de resolverse.
 */
export async function exigirVocabulario(menu: Locator, sustantivos: Sustantivos): Promise<void> {
  for (const [entidad, etiqueta] of sustantivos.propios) {
    await expect(
      entradaDeMenu(menu, etiqueta),
      `El menú tenía que decir «${etiqueta}» para la entidad \`${entidad}\`. ` +
        'Sale de `etiquetaDeNavegacion(item, vocabulario)` en heredado/lib/permissions.js, ' +
        'que pone en plural el término del giro y le sube la inicial.',
    ).toBeVisible();
  }

  for (const ajena of sustantivos.ajenos) {
    await expect(
      entradaDeMenu(menu, ajena),
      `El menú dice «${ajena}», que es el vocabulario de OTRO modelo. Una plantilla que ` +
        'habla con los sustantivos de dos giros a la vez se siente prestada, que es el ' +
        'defecto que F-017 existe para cerrar.',
    ).toHaveCount(0);
  }
}

/**
 * Abre una pantalla y exige que RESPONDA.
 *
 * El criterio es el de `F3-REGLAS §8.1` para las 105 rutas, y se copia a propósito:
 * lo que no se admite es un **404** (no existe) ni un **500** (revienta). Aquí no
 * hay 401 posible —la sesión ya está abierta— así que el umbral es 200 seco.
 *
 * Se comprueba el estado de la NAVEGACIÓN y no sólo que aparezca algún texto, porque
 * una pantalla que revienta en el servidor y otra que se queda cargando se ven igual
 * desde una aserción de texto: las dos no encuentran nada.
 */
export async function abrirPantalla(page: Page, ruta: string): Promise<void> {
  const respuesta = await page.goto(ruta);

  expect(respuesta, `«${ruta}» no devolvió respuesta de navegación.`).not.toBeNull();
  expect(
    respuesta?.status(),
    `«${ruta}» respondió ${String(respuesta?.status())}. Un 404 dice que la pantalla no ` +
      'existe; un 500, que revienta. Ninguno de los dos cuenta como «probada en el ' +
      'navegador» (F3-REGLAS §8, condición 6).',
  ).toBe(200);
}
