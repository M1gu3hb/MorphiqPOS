import { expect, test } from '@playwright/test';
import type { Locator, Page, PlaywrightWorkerArgs, Response, TestInfo } from '@playwright/test';

/**
 * El ayudante que comparten las cinco pruebas de plantilla (F2.3-REGLAS §8, condición 6).
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
 * **Esto era verdad hasta el 17-09-2026 y ya no lo es.** Aquí decía, y era cierto
 * entonces, que el menú tenía TRES entradas con `entidad` —`/mesero`, `/cocina` y
 * `/productos`— y que las dos primeras eran de SALA, así que en una tienda, una
 * ferretería o una estética sólo se podía leer «Productos» y nada más.
 *
 * Lo que cambió: el menú ya no es una lista fija de doce entradas, sino el de SU
 * plantilla (`packages/contracts/src/comandos/navegacion.ts`), y cada modelo trae
 * las suyas. Una estética lee «Clientas», «Servicios», «Estilistas» y «Productos»
 * en el menú; una ferretería lee «Materiales». Y desde E2.4 el vocabulario llega
 * también DENTRO de las pantallas: 48 de las 61 lo consumen, en sus encabezados,
 * sus estados vacíos y sus mensajes de error.
 *
 * `exigirVocabularioDelGiro` sigue en pie y sigue haciendo falta: le pregunta al
 * SERVIDOR por las entidades que ninguna ENTRADA DE MENÚ nombra —la unidad de
 * servicio de una cafetería es «pedido» y no hay entrada que se llame así— y ahí
 * es donde se afirma que el diccionario del giro es el que manda.
 *
 * ── Nada de esperas por tiempo ─────────────────────────────────────────────
 * No hay un solo `waitForTimeout` aquí. `13-PRUEBAS §2` lo prohíbe —«prohibido
 * `sleep` para "esperar a que termine"»— y el propio `playwright.config.ts` lo repite
 * en el comentario de sus límites: los 120 s del `timeout` son el techo, no el
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
 * ── CÓMO SE CORRE ──────────────────────────────────────────────────────────
 * Las cinco demos ya existen —una por giro, creadas el 17-09-2026— y las
 * migraciones están aplicadas. Un despliegue sirve a UN negocio (R16,
 * `negocioDelDespliegue`) y el giro NO se cambia en caliente: ningún comando toca
 * `organizaciones.giro`, sólo `nombre` y `paquete`. Así que cinco vocabularios
 * cuestan cinco arranques, cada uno con su `ORGANIZACION`.
 *
 * Contra el servidor local, una corrida por modelo:
 *
 *   ORGANIZACION=demo-acople-ferreteria APP_URL=http://localhost:3200 \
 *   pnpm --filter @morphiqpos/web exec next start -p 3200
 *
 * SIN bajar `MORPHIQPOS_DB_POOL_MAX`. Aquí decía `=3`, y era para el pooler en
 * modo SESIÓN (5432), donde el techo son 15 clientes. Con el de TRANSACCIÓN
 * (6543) ese techo no aplica y un pool de 3 o 4 es PEOR: con dos proyectos de
 * Playwright pidiendo datos a la vez, las consultas hacen cola y llegan cuando el
 * pooler ya recicló su conexión. Medido: con `=4`, once 500 en una corrida; con
 * el 10 por omisión, cero.
 *
 *   MORPHIQPOS_ORG_DEMO=demo-acople-ferreteria MORPHIQPOS_DEMO_PERSONA=Demo \
 *   MORPHIQPOS_DEMO_PIN=1234 pnpm test:e2e pruebas/e2e/ferreteria.spec.ts
 *
 * `MORPHIQPOS_DEMO_PERSONA` ya no es opcional cuando la demo tiene VARIAS
 * personas, y desde E4 las cinco tienen de tres a seis, cada una con el PIN de su
 * rol. «La primera de la lista» era una lotería: si salía el almacenista, el PIN
 * de la corrida no era el suyo y el fallo aparecía como «no salió de /login-pos».
 * Los PIN de cada rol están en `docs/fase-2/ACCESOS-DEMO.md §2`.
 *
 * `APP_URL` tiene que ser la del PROPIO servidor: `peticionDeEscrituraValida`
 * compara el `Origin` del navegador contra ella, y con otra puesta el login
 * devuelve 403 SIN_PERMISO — y el rastro dice «timeout esperando la navegación»,
 * que manda a buscar el defecto donde no está.
 *
 * Contra el preview de Vercel, lo mismo sin levantar servidor, más la credencial
 * que abre la Protección de Despliegue (VERCEL-ENTORNO §2):
 *
 *   MORPHIQPOS_URL_DESPLIEGUE=https://morphiqpos-git-fase-2-mh-astral-systems.vercel.app \
 *   MORPHIQPOS_ESTADO_VERCEL=<ruta al estado con la cookie, FUERA del repositorio> \
 *   MORPHIQPOS_ORG_DEMO=demo-acople-estetica MORPHIQPOS_DEMO_PERSONA=Demo \
 *   MORPHIQPOS_DEMO_PIN=1234 \
 *   pnpm test:e2e pruebas/e2e/estetica-salon.spec.ts
 *
 * Y el `ORGANIZACION` del despliegue tiene que apuntar a ESA demo, que es lo que
 * la precondición de abajo comprueba antes de tocar nada.
 */

/**
 * Las CINCO plantillas de `organizaciones.paquete` (D-01, abiertas por la 166).
 *
 * Eran tres, y dos de ellas traian los mismos 28 modulos. `ferreteria` y
 * `estetica` dejaron de resolverse como `tienda` el 17-09-2026: una ferreteria
 * corta material, fia y factura, y un salon agenda citas y paga comision. Lo que
 * se daba de alta con `tienda` abria un negocio sin la mitad de sus pantallas.
 */
export type Plantilla = 'tienda' | 'cafeteria' | 'restaurante' | 'ferreteria' | 'estetica';

/**
 * Los cuatro negocios que cobran de verdad (F2.3-REGLAS §4.5), por SLUG.
 *
 * ── Por qué no por nombre ──────────────────────────────────────────────────
 * Porque el nombre NO identifica a un negocio. Hasta el 17-09-2026 esta lista se
 * comparaba contra `datos.negocio` —`organizaciones.nombre`— y traía **«Café
 * Jacaranda» Y «Cafetería Jacaranda», las dos**, porque quien la escribió no
 * sabía cuál era la de verdad. Una lista que incluye las dos formas de un nombre
 * por si acaso no es una guarda: es una suposición con apariencia de guarda. Y el
 * nombre se puede cambiar desde la configuración, así que el día que Miguel le
 * ponga acento a algo, la guarda deja de proteger y nadie se entera.
 *
 * El slug es el identificador: es lo que `ORGANIZACION` resuelve
 * (`repoNegocio.porSlug`), es único en la tabla y no lo cambia ninguna pantalla.
 *
 * ── Y por qué el prefijo `demo-` no sirve de nada ──────────────────────────
 * **Tres de los cuatro negocios vivos tienen un slug que empieza por `demo-`.**
 * Cualquier heurística de prefijo daría por buena la caja de Don Chuy. Por eso la
 * lista es explícita, y por eso la comprobación de verdad es la de abajo: que el
 * negocio servido sea EXACTAMENTE el que la suite declaró.
 */
const SLUGS_VIVOS = [
  'mh-restaurante',
  'demo-cafe-jacaranda',
  'demo-abarrotes-don-chuy',
  'demo-ferreteria-la-broca',
] as const;

/**
 * La plantilla con la que se da de alta cada giro (`paquetePermitidoParaGiro`).
 *
 * Son los SEIS giros de `GIROS` en `packages/contracts/src/comandos/ambito.ts`.
 *
 * `ferreteria` y `estetica` daban de alta con `tienda`, y aquí decía que no era un
 * apaño provisional. **Lo era.** `PAQUETES` tiene ahora CINCO plantillas (166) y
 * cada uno de esos dos giros tiene la suya: una ferretería corta material, fía y
 * factura, y un salón agenda, lleva expediente y paga comisión. Con `tienda` se
 * daba de alta un negocio al que le faltaba la mitad de sus pantallas, y la guarda
 * de `app/(modelos)/` —que sí comprueba la plantilla— lo habría echado de ellas.
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
  ferreteria: 'ferreteria',
  // `farmacia` es el único giro sin plantilla propia todavía: su modelo no está
  // construido. Da de alta con `tienda`, que es la más restrictiva, y eso es lo
  // correcto mientras no exista la suya.
  farmacia: 'tienda',
  estetica: 'estetica',
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
  /** El negocio de ESTA persona, cuando el despliegue sirve a varios. */
  readonly negocio?: string;
  readonly negocioSlug?: string;
}

interface NegocioServido {
  readonly nombre?: string;
  readonly slug?: string;
}

interface RespuestaDeEmpleados {
  readonly ok?: boolean;
  readonly datos?: {
    readonly negocio?: string;
    /** `organizaciones.slug`: el identificador, no el nombre. Ver `SLUGS_VIVOS`. */
    readonly slug?: string;
    /**
     * TODOS los negocios a los que sirve el despliegue.
     *
     * Con uno —producción— trae ese uno y `slug` es el mismo. Con varios —las
     * cinco demostraciones en un solo despliegue, que es lo que E3 abre— trae los
     * cinco, y `slug` es el primero.
     */
    readonly negocios?: readonly NegocioServido[];
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
 * del SSO de Vercel; si estas cinco se saltaran, `F2.3-REGLAS §8` condición 6
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
        'F2.3-REGLAS §4.5: «Toda prueba de extremo a extremo, todo recorrido de Playwright',
        'y toda comprobación manual se hace sobre una organización de DEMOSTRACIÓN,',
        'creada para eso». Restaurante MH, Café Jacaranda, Abarrotes Don Chuy y',
        'Ferretería La Broca son clientes que cobran.',
        '',
        'Declara contra qué demo corre esta suite antes de correrla:',
        '  MORPHIQPOS_ORG_DEMO=demo-acople-tienda MORPHIQPOS_DEMO_PERSONA=Demo \\',
        '  MORPHIQPOS_DEMO_PIN=1234 pnpm test:e2e',
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
    // El estado guardado lleva la cookie que abre el muro de Vercel cuando se
    // corre contra el preview. Sin esto la precondición hablaría con el muro y
    // no con la aplicación, y el 401 que devolviera se leería como «la demo no
    // existe» — que manda a crear una organización que ya está.
    ...(typeof opciones.storageState === 'string' ? { storageState: opciones.storageState } : {}),
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
          'Cuatro cosas lo explican, en orden de probabilidad:',
          '',
          `1 · El despliegue no apunta a esta demo. \`ORGANIZACION\` tiene que valer`,
          `    «${SLUG_DEMO}» EN EL ENTORNO DEL SERVIDOR, no sólo aquí. Contra el preview`,
          '    se pone con `vercel env add ORGANIZACION preview` y hay que REDESPLEGAR:',
          '    las variables se aplican al construir, no en caliente.',
          '',
          '2 · La demo no existe todavía:',
          '',
          comandoDeAlta('tienda'),
          '',
          '3 · Un 401, o un 302 a `vercel.com/sso-api`, NO es la aplicación: es la',
          '    Protección de Despliegue de Vercel (VERCEL-ENTORNO §2). Pásale la',
          '    credencial: `MORPHIQPOS_BYPASS_VERCEL` con el secreto del bypass, o',
          '    `MORPHIQPOS_ESTADO_VERCEL` con la ruta a un estado que lleve la cookie de',
          '    un enlace compartido — que caduca en 23 horas y hay que renovar cada vez',
          '    que se redespliega.',
          '',
          '4 · Un 500 con EMAXCONNSESSION en los registros del despliegue es el pooler,',
          '    no la aplicación: en modo sesión admite 15 clientes y el pool abre hasta',
          '    10 por proceso. Baja `MORPHIQPOS_DB_POOL_MAX` o usa el pooler en modo',
          '    transacción (puerto 6543).',
        ].join('\n'),
      );
    }

    const cuerpo = (await respuesta.json()) as RespuestaDeEmpleados;
    const negocio = cuerpo.datos?.negocio ?? '';
    const servido = cuerpo.datos?.slug ?? '';
    const todos = cuerpo.datos?.usuarios ?? [];

    /**
     * LOS negocios que sirve el despliegue, que desde E3 pueden ser varios.
     *
     * `ORGANIZACION` admite una lista de slugs, así que un solo despliegue puede
     * servir a las cinco demostraciones y la organización sale del EMPLEO de
     * quien entra. La guarda tiene que seguir siendo igual de estricta con cinco
     * que con uno, y de hecho aquí se vuelve MÁS estricta: antes miraba sólo el
     * primero, y ahora mira **todos** buscando un negocio vivo.
     *
     * El `??` de reserva es para un despliegue anterior a este cambio, cuya
     * respuesta no trae `negocios`: entonces el único servido es `slug`.
     */
    const servidos = (cuerpo.datos?.negocios ?? [{ nombre: negocio, slug: servido }])
      .map((n) => ({ nombre: n.nombre ?? '', slug: n.slug ?? '' }))
      .filter((n) => n.slug !== '');

    // Las personas de ESTA demo. Con cinco negocios en un despliegue, la lista
    // trae a las veintitantas y entrar con «la primera» sería entrar en otro
    // negocio. Cada persona viene con el suyo.
    const usuarios = todos.filter(
      (u) => u.negocioSlug === undefined || u.negocioSlug === SLUG_DEMO,
    );

    if (servido === '') {
      throw new Error(
        [
          '/api/auth/empleados contestó 200 pero sin el SLUG del negocio.',
          '',
          'Eso sólo pasa si la respuesta cambió de forma: `datos.slug` es',
          '`organizaciones.slug` y lo pone `negocioDelDespliegue`. Sin él esta',
          'precondición no puede afirmar sobre QUÉ negocio va a operar la suite, y',
          'operar a ciegas sobre la caja de un cliente es exactamente lo que §4.5',
          'prohíbe. Revisa apps/web/app/api/auth/empleados/route.ts.',
        ].join('\n'),
      );
    }

    // ── LA comprobación ────────────────────────────────────────────────────
    // Identidad exacta, no un nombre y no una heurística de prefijo: el negocio
    // que el despliegue sirve tiene que ser EXACTAMENTE el que esta corrida
    // declaró. Así no hay forma de acabar operando sobre otro — ni sobre uno
    // vivo, ni sobre la demo de otro modelo, que también ensuciaría el reporte.
    // ── LO VIVO, que ya no es «no se sigue» sino «demuéstrame que no lo tocas» ──
    //
    // Esto fallaba en cuanto el despliegue servía a un negocio vivo, y protegía de
    // verdad mientras `ORGANIZACION` llevaba UN slug. Desde que producción sirve a
    // Restaurante MH **y** a las cinco demostraciones —que es lo que el encargo pedía:
    // un despliegue, y el negocio lo decide quién entra— negarse a correr dejaría el
    // rastreo sin producción contra la que correr, que es justo donde hay que mirar.
    //
    // Lo que protege la caja de un cliente no es que el despliegue no la sirva: es que
    // esta suite no pueda ENTRAR en ella. Y eso se puede EXIGIR, que es más fuerte que
    // negarse:
    //
    //   · la organización sale de la SESIÓN y nunca de un parámetro (R16), así que lo
    //     único que decide en qué negocio opera esta corrida es CON QUIÉN entra;
    //   · `entrar` filtra por `negocioSlug === SLUG_DEMO`, o sea que sólo puede elegir
    //     a alguien de la demo;
    //   · y para que ese filtro signifique algo, el despliegue tiene que decir de quién
    //     es cada persona. Si NO lo dice y sirve a varios, no hay forma de distinguirlas
    //     y entonces sí se para: elegir «la primera» podría ser el cajero de un cliente.
    const vivo = servidos.find((n) => (SLUGS_VIVOS as readonly string[]).includes(n.slug));
    if (vivo !== undefined) {
      const conNegocio = todos.filter((u) => u.negocioSlug !== undefined && u.negocioSlug !== '');
      const deLaDemo = todos.filter((u) => u.negocioSlug === SLUG_DEMO);
      if (conNegocio.length !== todos.length || deLaDemo.length === 0) {
        throw new Error(
          [
            `ALTO. El despliegue sirve a «${vivo.slug}» («${vivo.nombre}»), que es un NEGOCIO`,
            'VIVO, y no dice de qué negocio es cada persona de la pantalla de acceso.',
            '',
            `Sirve a ${String(servidos.length)}: ${servidos.map((n) => n.slug).join(', ')}.`,
            `De ${String(todos.length)} personas, ${String(conNegocio.length)} traen su negocio ` +
              `y ${String(deLaDemo.length)} son de «${SLUG_DEMO}».`,
            '',
            'Sin esa marca por persona no hay forma de entrar a la demo y sólo a la demo, y',
            'esta suite entra con PIN, CAMBIA la plantilla del negocio y COBRA una venta.',
            'Sobre un cliente que cobra, eso le quita módulos que paga y le mete dinero que',
            'no existe en su corte. F2.3-REGLAS §4.5. No se sigue.',
            '',
            'O quitas ese slug de `ORGANIZACION` en el entorno DEL SERVIDOR, o el despliegue',
            'vuelve a mandar `negocioSlug` en cada persona de `/api/auth/empleados`.',
          ].join('\n'),
        );
      }
      info.annotations.push({
        type: 'negocio-vivo-servido',
        description:
          `El despliegue sirve también a «${vivo.slug}». La corrida entra en «${SLUG_DEMO}» ` +
          `—${String(deLaDemo.length)} persona(s) suyas, y ninguna otra es elegible— y la ` +
          'organización sale de la sesión, nunca de un parámetro (R16).',
      });
    }

    if (!servidos.some((n) => n.slug === SLUG_DEMO)) {
      throw new Error(
        [
          `El despliegue sirve a «${servidos.map((n) => n.slug).join(', ')}» y esta corrida ` +
            `declaró «${SLUG_DEMO}», que no está entre ellos.`,
          '',
          'F2.3-REGLAS §4.5: «Si al terminar quedan ventas de prueba, cortes de prueba o mesas',
          'abiertas en cualquiera de los cuatro negocios vivos, el acople está mal hecho',
          'aunque todo lo demás esté bien.»',
          '',
          'Esta suite entra con PIN y CAMBIA la plantilla del negocio. Sobre un cliente que',
          'cobra, eso le quita o le da módulos que paga. No se sigue.',
          '',
          `\`ORGANIZACION\` en el entorno DEL SERVIDOR tiene que valer «${SLUG_DEMO}»; contra`,
          'el preview se pone con `vercel env add ORGANIZACION preview` y hay que REDESPLEGAR,',
          'porque las variables se aplican al construir.',
          '',
          comandoDeAlta('tienda'),
        ].join('\n'),
      );
    }

    if ((SLUGS_VIVOS as readonly string[]).includes(SLUG_DEMO)) {
      throw new Error(
        [
          `ALTO. MORPHIQPOS_ORG_DEMO dice «${SLUG_DEMO}», que es un NEGOCIO VIVO.`,
          '',
          'La comprobación de arriba sólo exige que el despliegue sirva a lo que esta',
          'corrida declaró; si lo declarado es la caja de un cliente, coincidir no ayuda.',
          'Los cuatro negocios que cobran son Restaurante MH, Café Jacaranda, Abarrotes',
          'Don Chuy y Ferretería La Broca, y sus slugs están en SLUGS_VIVOS.',
          '',
          'Las demos del acople se llaman `demo-acople-<giro>`.',
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
          `La demo «${SLUG_DEMO}» existe y no tiene a nadie dado de alta, así que no hay`,
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

  /**
   * Sólo la gente DE ESTA demo.
   *
   * Desde E3 un despliegue puede servir a los cinco negocios de demostración, y
   * entonces esta lista trae a las veintitantas personas de los cinco. Elegir
   * entre todas sería entrar en el negocio de otro: la pantalla de acceso enseña
   * el negocio en cada tarjeta justamente porque el nombre y el rol no bastan
   * —hay un dueño en cada uno—.
   *
   * El `undefined` es un despliegue anterior a este cambio, que no manda el
   * negocio por persona: entonces sirve a uno solo y todas son de ése.
   */
  const usuarios = (cuerpo.datos?.usuarios ?? []).filter(
    (u) => u.negocioSlug === undefined || u.negocioSlug === SLUG_DEMO,
  );

  // `toLocaleLowerCase('es-MX')` en los dos lados: comparar con el `toLowerCase()`
  // invariante haría que «MARÍA» y «maría» no casaran en algunas configuraciones, y el
  // fallo diría «esa persona no está dada de alta» sobre alguien que sí está.
  const buscado = PERSONA_DEMO.toLocaleLowerCase('es-MX');

  // Con VARIAS personas dadas de alta, «la primera» es una lotería.
  //
  // Esto era `usuarios[0]` y funcionaba mientras cada demo tenía UN empleado, el
  // dueño de `bootstrap`. Desde E4 cada una tiene de tres a seis, uno por rol y
  // con PIN distinto por rol, así que la primera de la lista puede ser el
  // almacenista — y el PIN de la corrida no es el suyo. El fallo salía cuatro
  // líneas más abajo, en `waitForURL`, diciendo «no salió de /login-pos»: el PIN
  // era correcto, para otra persona.
  if (PERSONA_DEMO === '' && usuarios.length > 1) {
    throw new Error(
      [
        `La demo tiene ${String(usuarios.length)} personas dadas de alta y esta corrida no dijo`,
        'con cuál entra. «La primera» no sirve: cada rol tiene su PIN, y entrar con el de',
        'otra persona falla como si el PIN estuviera mal.',
        '',
        `Dados de alta: ${usuarios.map((u) => u.nombre).join(', ')}`,
        '',
        '  MORPHIQPOS_DEMO_PERSONA=Demo MORPHIQPOS_DEMO_PIN=1234 pnpm test:e2e …',
        '',
        'Los PIN de cada rol están en docs/fase-2/ACCESOS-DEMO.md §2.',
      ].join('\n'),
    );
  }

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

  /**
   * LA TARJETA DE ESTA PERSONA, EN ESTE NEGOCIO.
   *
   * Esto era `getByRole('button', { name: elegido.nombre })` y con un solo
   * negocio servido funcionaba. Con los cinco en un despliegue resolvió a **25
   * elementos**: el nombre accesible de una tarjeta lleva dentro el nombre del
   * negocio —«D Demo Administrador Demo del acople · tienda»— así que buscar
   * «Demo» casa con las veinticinco, y buscar «Demo» + el negocio casa con las
   * cuatro de ese negocio, porque todas lo llevan.
   *
   * Lo que identifica la tarjeta es la conjunción de sus dos textos EXACTOS: el
   * nombre de la persona en su párrafo y el del negocio en el suyo. Así hay
   * exactamente una, y si mañana hay dos personas con el mismo nombre en el mismo
   * negocio, esto falla en vez de entrar con una al azar.
   */
  const conNombre = page
    .getByRole('button')
    .filter({ has: page.getByText(elegido.nombre, { exact: true }) });
  const tarjeta =
    elegido.negocio === undefined || elegido.negocio === ''
      ? conNombre
      : conNombre.filter({ has: page.getByText(elegido.negocio, { exact: true }) });

  await expect(
    tarjeta,
    `La pantalla de acceso no enseña UNA tarjeta de «${elegido.nombre}»` +
      (elegido.negocio === undefined ? '' : ` en «${elegido.negocio}»`) +
      '. Con varios negocios en un despliegue hay un dueño en cada uno, y la tarjeta se ' +
      'identifica por nombre Y negocio.',
  ).toHaveCount(1);
  await tarjeta.click();
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
/**
 * Las mismas cabeceras, para las pruebas que llaman a una ruta directamente.
 *
 * Se exporta con otro nombre en vez de exportar la de dentro: quien la use tiene
 * que estar diciendo «esto es una prueba llamando a la ruta que usa el botón», y
 * un nombre que lo diga es más difícil de usar sin pensarlo.
 */
export function cabecerasDeEscrituraDePrueba(): Record<string, string> {
  return cabecerasDeEscritura();
}

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
 * El bloque de acciones del ENCABEZADO del tablero, recortado.
 *
 * ── Por qué no se busca el botón en toda la página ─────────────────────────
 * Porque «Ir a Caja» aparece DOS veces y las dos son legítimas. Una es la acción
 * principal del encabezado, y ésa sí la decide la plantilla: `isCajaDirecta` de
 * `heredado/pages/Dashboard.jsx` la enseña donde no hay sala y la cambia por
 * «Nueva venta» donde la hay. La otra vive en el aviso «No hay caja abierta», y
 * sale en las tres plantillas por igual porque habla del estado de la caja, no
 * de lo que el negocio compró — y en una demo recién creada sale SIEMPRE.
 *
 * Afirmar sobre la página entera mezclaba las dos: en `restaurante` la prueba
 * exigía cero «Ir a Caja» y encontraba el del aviso, y en `estetica` el
 * `getByRole` reventaba con «strict mode violation». Las dos veces el mensaje
 * habría mandado a arreglar `getCurrentPackage`, que no tenía nada que ver.
 *
 * ── Y por qué el título es un parámetro ────────────────────────────────────
 * Porque los cinco tableros no saludan igual. Cuatro abren con «Buen día» —el del
 * heredado y los tres que se le parecen— y el del salón abre diciendo cómo va,
 * porque no es la pantalla de inicio de nadie: vive dentro de reportes y se abre
 * dos veces al día. Lo que no cambia es la RELACIÓN, que es lo que este ayudante
 * sabe: las acciones son el hermano siguiente del bloque del `h1`.
 *
 * ── Por qué así y no por clase ─────────────────────────────────────────────
 * `PageHeader` no pinta ningún landmark: es un `div` con el título en un hijo y
 * las acciones en el siguiente. No hay rol al que agarrarse y las clases están
 * prohibidas aquí —se rompen el día que alguien cambie un `gap`—, así que se
 * navega por la RELACIÓN, que es la que de verdad significa «las acciones de
 * este título»: el hermano siguiente del bloque que contiene el `h1`.
 */
export function accionesDelTablero(page: Page, titulo = 'Buen día'): Locator {
  return page
    .getByRole('heading', { level: 1, name: titulo })
    .locator('xpath=../following-sibling::div[1]');
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
 * Lo que una pantalla tiene que ENSEÑAR para contar como abierta.
 *
 * Una expresión para el texto visible, o el `aria-label` de su región cuando el
 * título de la pantalla no es texto: tres de las 61 lo tienen en la etiqueta y no en
 * un `h1`, y obligarlas a inventarse un título para que la prueba las vea sería
 * cambiar el producto para que quepa en la prueba.
 */
export type MarcaDePantalla = RegExp | { readonly etiqueta: string };

/** El muro genérico del cliente: si es lo que se ve, la pantalla no funcionó. */
const MURO_GENERICO = /El servidor respondió algo inesperado/i;

/**
 * Abre una pantalla, exige que RESPONDA y que ENSEÑE lo suyo.
 *
 * ── Por qué el 200 no bastaba ──────────────────────────────────────────────
 * El criterio de `F2.3-REGLAS §8.1` —ni 404 ni 500— dejaba pasar la mitad del
 * problema: una pantalla que abre en 200 y pinta su estado de error se ve igual que
 * una que funciona, y la suite la daba por probada. Eso es exactamente lo que
 * escondió que `MaterialMostrador`, `ConteoDeZona`, `PedidoProveedor` y
 * `LineaSugerida` no existían en el puente: cuatro pantallas «probadas» que abrían
 * vacías con una banda de error encima.
 *
 * Así que ahora se exige una MARCA: un texto que sólo se pinta cuando la pantalla
 * llegó a montar lo suyo. No es el dato —la demo puede tener una zona sin productos,
 * y eso es legítimo— es el título, la etiqueta de su región o la frase de su estado
 * vacío, que también es contenido de esa pantalla y de ninguna otra.
 *
 * Y se exige que el muro genérico NO esté: «El servidor respondió algo inesperado»
 * es lo que el cliente enseña cuando la respuesta no tiene la forma `{ok, datos}`, y
 * es lo que sale cuando una ruta no existe.
 */
export async function abrirPantalla(
  page: Page,
  ruta: string,
  marca: MarcaDePantalla,
): Promise<void> {
  const respuesta = await page.goto(ruta);

  expect(respuesta, `«${ruta}» no devolvió respuesta de navegación.`).not.toBeNull();
  expect(
    respuesta?.status(),
    `«${ruta}» respondió ${String(respuesta?.status())}. Un 404 dice que la pantalla no ` +
      'existe; un 500, que revienta. Ninguno de los dos cuenta como «probada en el ' +
      'navegador» (F2.3-REGLAS §8, condición 6).',
  ).toBe(200);

  // Por ATRIBUTO y no con `getByLabel`: ése busca la etiqueta de un control de
  // formulario, y estas tres marcas son el `aria-label` de una región —un `aside`,
  // un `main`— que es donde vive el título de una pantalla que no puede gastar sitio
  // en un encabezado grande.
  const suyo =
    marca instanceof RegExp
      ? page.getByText(marca).first()
      : page.locator(`[aria-label="${marca.etiqueta}"]`).first();
  const comoSeLlama = marca instanceof RegExp ? String(marca) : `aria-label «${marca.etiqueta}»`;
  await expect(
    suyo,
    `«${ruta}» abrió en 200 y NO enseñó lo suyo (${comoSeLlama}). Una pantalla que carga y ` +
      'pinta su estado de error se ve igual que una que funciona: por ahí pasaron cuatro ' +
      'entidades del puente que no existían.',
  ).toBeVisible();

  await expect(
    page.getByText(MURO_GENERICO),
    `«${ruta}» enseña el muro genérico del cliente. Eso significa que una de sus llamadas no ` +
      'devolvió `{ok, datos}`: casi siempre, una ruta que no existe.',
  ).toHaveCount(0);
}

/**
 * Las pantallas que abren en 200 y cuyos DATOS revientan.
 *
 * ── Por qué hace falta, además del 200 del HTML ────────────────────────────
 * El HTML en 200 no dice que la pantalla funcione. **Siete de las 61 abrían en
 * 200 y sus dos primeras consultas devolvían 500**: `page.tsx` las monta sin nada
 * seleccionado —`productoId=""`— y la cadena vacía llegaba a un `where id = ''`
 * sobre una columna uuid, que Postgres rechaza con `22P02`. La pantalla se veía
 * «abierta» y estaba enseñando su estado de error, y la suite la daba por probada.
 *
 * ── Por qué se pregunta al FINAL y no en cada pantalla ─────────────────────
 * Porque varias de estas pantallas consultan EN BUCLE —la cocina refresca cada
 * pocos segundos— así que la red nunca queda quieta y no hay momento en el que
 * «ya llegaron sus datos». Esperar `networkidle` por pantalla dejó el navegador
 * colgado hasta que Chromium enseñó «This page couldn't load»; Playwright lo
 * advierte de su propia API. Escuchar toda la prueba y preguntar al final no
 * espera nada y no se pierde ninguna.
 *
 * ── Por qué ahora también los 4xx y los `{ok:false}` ──────────────────────
 * Aquí decía que un 4xx se admite «porque una pantalla puede pedir algo que el rol no
 * ve, y eso es una decisión». Es cierto de un 403, y era la rendija por la que pasaban
 * las otras dos formas de estar roto sin reventar:
 *
 *   · un **404** de `/api/...` es una ruta que no existe, o sea un botón que no hace
 *     nada. Es el defecto que costó tres tardes de esta fase.
 *   · un **200 con `{ok:false}`** es el error de dominio bien contestado, y en una
 *     pantalla que sólo está ABRIENDO no debería haber ninguno: nadie pidió nada
 *     todavía. `PUENTE_ENTIDAD_DESCONOCIDA` llega así, y es lo que decía que cuatro
 *     entidades no existían mientras la suite daba las pantallas por probadas.
 *
 * Lo que sí se admite se declara en `FALLOS_QUE_SON_UNA_DECISION`, con su razón, y la
 * lista sólo puede encogerse.
 */

/**
 * Los fallos que son una decisión del producto y no una avería.
 *
 * La clave es `<código> <ruta>` tal como se imprime. Cada fila lleva por qué, y la
 * lista sólo puede encogerse: una fila nueva hay que explicarla.
 */
const FALLOS_QUE_SON_UNA_DECISION: Readonly<Record<string, string>> = {
  /**
   * EL ALMACÉN DE ARCHIVOS QUE ESTE DESPLIEGUE NO TIENE.
   *
   * `STORAGE_ENDPOINT` apunta a `http://localhost:9000` —el MinIO de desarrollo— y
   * en Vercel eso es `ECONNREFUSED`: ninguna operación de archivo puede funcionar.
   * NO es un defecto del código y no se puede arreglar en el código: falta una
   * credencial de bucket, que son cuatro variables de entorno y se crean en el
   * tablero de Supabase (Project Settings → Storage → S3 access keys).
   *
   * Lo que SÍ se arregló: el fallo dejo de ser un 500 «No fue posible completar la
   * operación» y es un **503 `ALMACEN_NO_DISPONIBLE`** con el endpoint y las cuatro
   * variables escritos en el mensaje. Por eso esta línea puede existir: el fallo
   * dice exactamente qué falta.
   *
   * Se borra el día que el bucket exista, y ese día esta prueba vuelve a exigirlo.
   */
  '503 /api/reportes/exportar':
    'Este despliegue no tiene bucket: STORAGE_ENDPOINT apunta a localhost. El exporte ' +
    'contesta 503 con las cuatro variables que hay que configurar. Se borra cuando el ' +
    'bucket exista.',
};

/**
 * QUÉ se estaba pidiendo, no sólo por dónde.
 *
 * El puente de lectura es UNA ruta para las 359 lecturas del frontend, así que
 * «400 /api/datos/consultar» es todo lo que se sabía de un fallo que puede venir
 * de cualquiera de las cuarenta que abre un modelo: el rastro no servía para nada
 * y había que salir a buscarla a mano. La entidad y la operación viajan en el
 * cuerpo de la petición, que Playwright entrega sin coste, y con eso el fallo dice
 * por sí mismo dónde mirar.
 */
function loQuePedia(respuesta: Response): string {
  const cuerpo = respuesta.request().postData();
  if (cuerpo === null) return '';
  try {
    const pedido = JSON.parse(cuerpo) as { entidad?: unknown; operacion?: unknown };
    if (typeof pedido.entidad !== 'string' || pedido.entidad === '') return '';
    const operacion = typeof pedido.operacion === 'string' ? pedido.operacion : 'list';
    return ` · ${pedido.entidad}.${operacion}`;
  } catch {
    // Un cuerpo que no es JSON no dice nada de la entidad: la ruta ya está en la etiqueta.
    return '';
  }
}

/**
 * QUÉ SE LE PERDONA AL SERVIDOR MIENTRAS SE LE MANDA BASURA A PROPÓSITO.
 *
 * El rastreador envía formularios con datos de sonda para comprobar que el camino del
 * `<form>` existe. El servidor hace lo correcto: los rechaza. Un 400
 * `ENTRADA_INVALIDA` ahí no es una respuesta rota —es la validación funcionando—, y
 * contarlo como fallo haría que la aplicación pareciera reventar justo cuando mejor se
 * comporta.
 *
 * Se perdona SOLO el 400 y el 422, SOLO mientras `sondeando()` diga que sí, y se
 * cuenta para que salga en el resumen. Un 404 sigue siendo una ruta que no existe, un
 * 5xx sigue siendo que revienta y un `{ok:false}` con 200 sigue siendo un dato que no
 * llegó.
 */
export interface OpcionesDeVigilancia {
  readonly sondeando?: () => boolean;
}

export function vigilarFallos(page: Page, opciones: OpcionesDeVigilancia = {}): () => void {
  const reventadas: string[] = [];
  const rechazosDeSonda: string[] = [];
  const cuerpos: Promise<void>[] = [];

  page.on('response', (respuesta) => {
    const ruta = new URL(respuesta.url()).pathname;
    const estado = respuesta.status();

    // Sólo la API: un 404 de un `.map` o de un icono no es un botón roto.
    const esApi = ruta.startsWith('/api/');
    if (esApi && (estado === 400 || estado === 422) && opciones.sondeando?.() === true) {
      rechazosDeSonda.push(`${String(estado)} ${ruta}`);
      return;
    }
    if (estado >= 500 || (esApi && estado >= 400)) {
      reventadas.push(`${String(estado)} ${ruta}${loQuePedia(respuesta)}`);
      return;
    }
    if (!esApi || estado !== 200) return;

    // El cuerpo SÓLO de la API en 200: un `{ok:false}` mientras una pantalla apenas
    // abre es un dato que no llegó, no una decisión de nadie.
    cuerpos.push(
      respuesta
        .json()
        .then((cuerpo: unknown) => {
          if (typeof cuerpo !== 'object' || cuerpo === null) return;
          const sobre = cuerpo as { ok?: unknown; error?: { codigo?: unknown } };
          if (sobre.ok !== false) return;
          const codigo =
            typeof sobre.error?.codigo === 'string' ? sobre.error.codigo : 'SIN_CODIGO';
          reventadas.push(`${codigo} ${ruta}${loQuePedia(respuesta)}`);
        })
        // Un cuerpo que no es JSON no dice nada: la navegación ya se comprobó.
        .catch(() => undefined),
    );
  });

  return function exigirSinFallos(): void {
    if (rechazosDeSonda.length > 0) {
      test.info().annotations.push({
        type: 'sondas-rechazadas',
        description: `${String(rechazosDeSonda.length)} formulario(s) de sonda rechazados por el servidor: ${[...new Set(rechazosDeSonda)].join(', ')}`,
      });
    }
    /**
     * Una declaración de `<código> <ruta>` cubre TAMBÉN sus sufijos de entidad.
     *
     * El fallo se imprime con lo que se estaba pidiendo —`503 /api/reportes/exportar ·
     * CorteCaja.list`— y eso es útil para leerlo, pero obligaría a declarar una línea
     * por entidad para un fallo que es de la RUTA: el despliegue no tiene bucket, y no
     * lo tiene más para `CorteCaja` que para `Venta`. Si la declaración no lleva
     * sufijo, cubre la ruta entera; si lo lleva, sólo ese caso.
     */
    const declarado = (fallo: string): boolean => {
      if (FALLOS_QUE_SON_UNA_DECISION[fallo] !== undefined) return true;
      return Object.keys(FALLOS_QUE_SON_UNA_DECISION).some(
        (clave) => !clave.includes(' · ') && fallo.startsWith(`${clave} · `),
      );
    };
    const distintas = [...new Set(reventadas)].filter((fallo) => !declarado(fallo));
    expect(
      distintas,
      `La aplicación devolvió ${String(reventadas.length)} respuesta(s) rotas mientras se ` +
        `abrían sus pantallas: ${distintas.join(', ')}.\n` +
        'Un 5xx es que revienta; un 4xx de `/api/` es una ruta que no existe o un permiso que ' +
        'la pantalla no tiene; un `{ok:false}` mientras sólo se abre es un dato que no llegó. ' +
        'Una pantalla que carga y enseña su estado de error NO está probada. El registro del ' +
        'servidor lo dice por su ruta: desde E5 el 500 lleva la causa, el SQLSTATE y la ' +
        'entidad del puente.',
    ).toEqual([]);
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * E4 · QUE LAS PRUEBAS COBREN UNA VENTA
 *
 * Hasta aquí la suite demostraba que las pantallas ABREN y que el menú dice lo
 * que debe. Eso no es el sistema funcionando: el sistema funcionando es que
 * entre dinero y que cuadre. Lo de abajo es lo que lo comprueba, y se comprueba
 * CONTRA EL SERVIDOR —no contra la pantalla que acaba de decir «cobrado»—,
 * porque una pantalla que miente es exactamente el defecto que se busca.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Centavos de un texto de pantalla: `$1,234.50` → `123450`.
 *
 * Se quita TODO lo que no sea dígito o punto, y no se usa `parseFloat` sobre el
 * texto crudo: `$1,234.50` daría 1 —se corta en la coma— y la prueba compararía
 * un peso contra mil doscientos treinta y cuatro diciendo que el dinero no
 * cuadra. El redondeo es el último paso, sobre el número ya en centavos, porque
 * `12.34 * 100` en punto flotante es `1233.9999999999998`.
 */
export function centavosDeTexto(texto: string): number {
  const limpio = texto.replace(/[^\d.]/g, '');
  if (limpio === '') return Number.NaN;
  return Math.round(Number(limpio) * 100);
}

/**
 * Lee del PUENTE, con la sesión que ya tiene el navegador.
 *
 * `page.request` comparte el tarro de cookies del contexto, así que esto va con
 * la misma sesión que la pantalla — y por tanto con el mismo ámbito de
 * organización y el mismo rol. Un `list` que devuelva algo que la pantalla no
 * puede ver sería un defecto de autorización, no una comodidad de la prueba.
 */
export async function consultarPuente<T>(
  page: Page,
  entidad: string,
  extra: Readonly<Record<string, unknown>> = {},
): Promise<readonly T[]> {
  const respuesta = await page.request.post('/api/datos/consultar', {
    headers: cabecerasDeEscritura(),
    data: { entidad, operacion: 'list', limite: 5, ...extra },
  });
  const estado = respuesta.status();
  if (estado !== 200) {
    throw new Error(
      `/api/datos/consultar (${entidad}) → ${String(estado)}: ${(await respuesta.text()).slice(0, 300)}`,
    );
  }
  // Tres formas posibles, y se aceptan las tres en vez de suponer una: la lista
  // tal cual, la lista envuelta en `datos`, y —con `operacion: 'get'`— UN objeto
  // en vez de una lista. Suponer la primera haría que la prueba dijera «no hay
  // ventas» con la venta cobrada, que es el peor fallo posible: manda a arreglar
  // el cobro, que funcionaba.
  const cuerpo: unknown = await respuesta.json();
  const dentro =
    typeof cuerpo === 'object' && cuerpo !== null && 'datos' in cuerpo
      ? (cuerpo as { datos?: unknown }).datos
      : cuerpo;
  if (Array.isArray(dentro)) return dentro as readonly T[];
  if (dentro === null || dentro === undefined) return [];
  return [dentro as T];
}

/**
 * EL TOTAL QUE DICE LA PANTALLA, en centavos.
 *
 * Las cinco pantallas de cobro ponen el total en una región con `aria-label`
 * «Total de …» —«de la venta», «de la orden», «de la cuenta», según el
 * vocabulario del giro—, así que se busca por el principio de la etiqueta y no
 * por el texto completo: clavar «Total de la venta» ataría esta función al
 * diccionario de la tienda y fallaría en el restaurante diciendo «no encontré el
 * total».
 *
 * Del texto de la región se toma la PRIMERA cantidad. Es el total; lo que viene
 * después es el desglose («IVA incluido …»), y tomar el último daría el IVA.
 */
export async function totalEnPantalla(page: Page): Promise<number> {
  const region = page.locator('[aria-label^="Total de"]').first();
  await expect(
    region,
    'No hay ninguna región «Total de …» en la pantalla de cobro. Es donde vive el número ' +
      'que se dice en voz alta, y sin él no hay nada que comparar contra la base.',
  ).toBeVisible();
  const texto = await region.innerText();
  const cantidad = /\$\s*[\d,]+(?:\.\d{1,2})?/.exec(texto);
  expect(
    cantidad,
    `La región del total no enseña ninguna cantidad. Su texto: «${texto.split('\n').join(' · ')}».`,
  ).not.toBeNull();
  return centavosDeTexto(cantidad![0]);
}

/** Lo que una venta cobrada tiene que tener en el servidor. */
export interface VentaDelServidor {
  readonly id?: string;
  readonly folio?: string;
  /**
   * EN PESOS, no en centavos.
   *
   * El puente convierte el dinero al servirlo —`conversion: 'dinero'` divide por
   * cien, porque el frontend heredado trabaja en pesos— así que una venta de
   * 4 290 centavos llega aquí como `42.9`. Compararlo con los centavos de la
   * pantalla daba «esperaba 4290 y encontré 42.9» sobre la MISMA venta, que es la
   * clase de fallo que manda a buscar un defecto de dinero donde hay uno de
   * unidades. `centavosDeVenta` lo normaliza.
   */
  readonly total?: number;
  readonly estado?: string;
  readonly created_date?: string;
}

/** Los centavos de una venta que el puente sirvió en pesos. */
function centavosDeVenta(venta: VentaDelServidor): number {
  return Math.round((venta.total ?? 0) * 100);
}

/**
 * Los folios que ya existían, para poder afirmar que la venta es NUEVA.
 *
 * Sin esto, «hay una venta con este total» lo cumpliría una venta de ayer por la
 * misma cantidad, y la prueba pasaría sin haber cobrado nada. Se guarda antes de
 * cobrar y se compara después.
 */
export async function ventasDeAntes(page: Page): Promise<ReadonlySet<string>> {
  const ventas = await consultarPuente<VentaDelServidor>(page, 'Venta', { limite: 20 });
  return new Set(ventas.map((v) => v.id ?? '').filter((id) => id !== ''));
}

/**
 * EL DINERO CUADRÓ: hay una venta NUEVA en el servidor por el total que dijo la
 * pantalla.
 *
 * ── Por qué se compara contra el servidor y no contra la pantalla ──────────
 * Porque la pantalla ya dijo su parte: puso un total, se pulsó COBRAR y se
 * quedó en blanco. Que se quede en blanco no significa que haya entrado dinero
 * —lo haría igual si el comando fallara y alguien se hubiera comido el error—.
 * Lo que se afirma aquí es lo que le importa a Miguel: que en la base hay una
 * venta más, por la cantidad exacta que se dijo en voz alta.
 *
 * Y el total se compara AL CENTAVO, sin tolerancia. Un peso de diferencia en una
 * venta es un peso que falta en el corte.
 */
export async function exigirVentaCobrada(
  page: Page,
  totalEsperadoCentavos: number,
  idsDeAntes: ReadonlySet<string>,
): Promise<VentaDelServidor> {
  let nuevas: readonly VentaDelServidor[] = [];
  /**
   * Se espera por la venta COBRADA, no por «una venta nueva».
   *
   * La diferencia importa y costó una vuelta: cobrar en el mostrador crea primero
   * un BORRADOR y lo cobra después, así que «hay una venta nueva» se cumple en
   * cuanto existe el borrador —total 0, sin folio— y la comprobación fallaba
   * diciendo «la venta nueva no tiene el total que dijo la pantalla: 0», con el
   * cobro todavía en vuelo. Lo que se espera es la venta con SU TOTAL.
   *
   * `expect.poll` espera por una CONDICIÓN, no por un tiempo. El techo es amplio
   * porque el cobro es la transacción más larga del sistema —totales, estado,
   * folio, pagos, movimientos de caja y el ledger de stock— y aquí corre contra
   * una base que está al otro lado de internet.
   */
  await expect
    .poll(
      async () => {
        const ultimas = await consultarPuente<VentaDelServidor>(page, 'Venta', { limite: 20 });
        nuevas = ultimas.filter((v) => (v.id ?? '') !== '' && !idsDeAntes.has(v.id ?? ''));
        return nuevas.some((v) => centavosDeVenta(v) === totalEsperadoCentavos);
      },
      {
        message:
          `No apareció en el servidor ninguna venta nueva por ${String(totalEsperadoCentavos)} ` +
          'centavos después de confirmar el cobro. La pantalla se queda en blanco al cobrar ' +
          'bien Y también se quedaría en blanco si el comando hubiera fallado en silencio, ' +
          'así que lo que vale es esto.',
        timeout: 45_000,
      },
    )
    .toBe(true);

  const conElTotal = nuevas.find((v) => centavosDeVenta(v) === totalEsperadoCentavos);

  expect(
    conElTotal,
    `La venta nueva NO tiene el total que dijo la pantalla. Esperado ${String(totalEsperadoCentavos)} ` +
      `centavos; en el servidor: ${nuevas.map((v) => String(centavosDeVenta(v))).join(', ')}. ` +
      'Un peso de diferencia en una venta es un peso que falta en el corte.',
  ).toBeDefined();

  // Y tiene FOLIO. Una venta cobrada sin folio no existe para el SAT, y el folio
  // se toma dentro de la misma transacción que el pago: si falta, lo que hay no
  // es una venta cobrada.
  expect(
    conElTotal?.folio ?? '',
    `La venta por ${String(totalEsperadoCentavos)} centavos no tiene folio. El folio se toma en ` +
      'la misma transacción que el pago, así que una venta cobrada sin folio es una venta que ' +
      'no se cobró del todo.',
  ).not.toBe('');

  return conElTotal!;
}

/**
 * EL COBRO SE ACEPTÓ EN LA PANTALLA, o se dice qué contestó.
 *
 * Las cinco pantallas de cobro hacen lo mismo al terminar: vacían la venta y
 * vuelven a su estado de reposo. Si el servidor rechaza, en cambio, aparece un
 * `role="alert"` con el motivo —«Abre la caja antes de cobrar», «El total
 * cambió»— y la venta se queda entera, a propósito.
 *
 * Esperar por el reposo y NO mirar la alerta hacía que el fallo saliera 45
 * segundos más tarde, en la comprobación contra el servidor, diciendo «no
 * apareció ninguna venta» — que manda a buscar en la base lo que la pantalla ya
 * había explicado en una línea.
 */
export async function exigirCobroAceptado(page: Page, señalDeReposo: RegExp): Promise<void> {
  const reposo = page.getByText(señalDeReposo).first();
  const queja = page.locator('[role="alert"]').filter({ hasText: /\S/ }).first();

  await expect(reposo.or(queja), 'La pantalla de cobro no contestó nada al confirmar.').toBeVisible(
    {
      timeout: 45_000,
    },
  );

  if ((await reposo.count()) > 0 && (await reposo.isVisible())) return;

  const motivo = (await queja.innerText()).trim();
  throw new Error(
    `El servidor RECHAZÓ el cobro y la pantalla lo dijo: «${motivo}». La venta sigue completa ` +
      'en la pantalla, que es lo correcto — pero no se cobró nada.',
  );
}

/** Un movimiento del ledger de inventario, como lo sirve el puente. */
export interface MovimientoDelServidor {
  readonly id?: string;
  readonly tipo_movimiento?: string;
  readonly cantidad?: number;
  readonly referencia_id?: string;
  readonly ingrediente_nombre?: string;
}

/**
 * EL INVENTARIO SE MOVIÓ POR ESTA VENTA.
 *
 * ── Por qué por `referencia_id` y no comparando existencias ────────────────
 * Comparar «la existencia de X antes y después» parece más directo y es peor: la
 * existencia de un producto vive en su INSUMO —`insumos.producto_id` apunta al
 * producto, no al revés— y el puente no expone ese enlace, así que habría que
 * emparejar por NOMBRE. Un emparejamiento por nombre pasa a verde el día que la
 * semilla cambie «Aceite de maíz 1 L» por «Aceite de maíz», sin que nada esté
 * roto, y falla el día que dos insumos se llamen parecido.
 *
 * `movimientos_stock.referencia_id` ES el identificador de la venta que lo
 * causó. Que exista un movimiento con la venta recién cobrada dentro es la
 * afirmación exacta: el cobro escribió el ledger, en la misma transacción.
 *
 * D-01 con dinero: «una tienda sin inventario no es una tienda, es una
 * calculadora». Esto es lo que lo comprueba.
 */
export async function exigirInventarioMovido(
  page: Page,
  ventaId: string,
  queSeVendio: string,
): Promise<readonly MovimientoDelServidor[]> {
  let delaVenta: readonly MovimientoDelServidor[] = [];
  await expect
    .poll(
      async () => {
        const movimientos = await consultarPuente<MovimientoDelServidor>(
          page,
          'MovimientoInventario',
          { limite: 30 },
        );
        delaVenta = movimientos.filter((m) => m.referencia_id === ventaId);
        return delaVenta.length;
      },
      {
        message:
          `Se cobró «${queSeVendio}» y el ledger de inventario no registró NADA con la venta ` +
          `${ventaId} dentro. El dinero entró y la existencia no bajó: eso es vender aire, y ` +
          'al contar el inventario a fin de mes sobra mercancía que ya no está.',
        timeout: 15_000,
      },
    )
    .toBeGreaterThan(0);

  // Y es una SALIDA. Un movimiento de entrada con la venta dentro sería peor que
  // ninguno: sumaría existencia al vender.
  for (const movimiento of delaVenta) {
    expect(
      movimiento.cantidad ?? 0,
      `El movimiento de «${movimiento.ingrediente_nombre ?? 'sin nombre'}» por la venta ` +
        `${ventaId} tiene cantidad ${String(movimiento.cantidad)}. Al vender, la existencia BAJA.`,
    ).toBeLessThan(0);
  }

  return delaVenta;
}

/**
 * ABRE LA CAJA DE ESTA TERMINAL, si no está ya abierta.
 *
 * ── Por qué hace falta, si las cinco demos tienen una caja abierta ─────────
 * Porque una sesión de caja pertenece a UNA TERMINAL, y la terminal nace cuando
 * un navegador nuevo entra por primera vez: la caja que la semilla dejó abierta
 * es de otra terminal, no de ésta. `venta.cobrar` exige la de la suya
 * —`sesionAbiertaDeTerminal`— y con razón: el arqueo del cajón que tienes
 * delante no se cuadra con los movimientos del de al lado.
 *
 * Así que la prueba hace lo que hace un cajero al empezar su turno: abre su caja
 * con su fondo. Y de paso queda probada la pantalla que lo hace, que es la que
 * sostiene el muro de «una venta sin caja no pertenece a ningún corte».
 *
 * Es idempotente: si ya está abierta, no toca nada. Así una segunda corrida
 * sobre el mismo navegador no abre dos.
 */
export interface PantallaDeCaja {
  /** Dónde se abre. */
  readonly ruta: string;
  /** El botón que la abre: «Abrir caja» en el mostrador, «Abrir turno» en la barra. */
  readonly boton: string;
  /** El campo del fondo, por `id`. Cada modelo lo llama a su manera. */
  readonly campoDelFondo: string;
  /** Algo que SÓLO se ve con la caja ya abierta, para no abrirla dos veces. */
  readonly señalAbierta: string;
}

export async function abrirLaCajaSiHaceFalta(
  page: Page,
  caja: PantallaDeCaja,
  fondoEnPesos = '500',
): Promise<void> {
  // La marca es el BOTÓN de abrir o la señal de que ya está abierta: una de las
  // dos tiene que estar, y las dos son contenido de la caja y de ninguna otra.
  //
  // Cada parte se escapa POR SEPARADO y se unen después. Escapando la cadena ya
  // unida, el `|` de la alternancia se escapaba también y el patrón buscaba el texto
  // literal «Abrir caja|Lo que debería haber», que no existe en ninguna pantalla.
  const literal = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await abrirPantalla(
    page,
    caja.ruta,
    new RegExp(`${literal(caja.boton)}|${literal(caja.señalAbierta)}`),
  );

  const botonAbrir = page.getByRole('button', { name: caja.boton });
  const yaAbierta = page.getByText(caja.señalAbierta).first();

  /**
   * Se ESPERA a que la pantalla decida, y después se mira.
   *
   * `abrirPantalla` espera el HTML; el estado de la caja llega después, en una
   * petición del cliente. Preguntar `count()` antes de eso devolvía 0 —el
   * formulario aún no existía—, esto se daba por «ya está abierta» y la venta
   * moría 120 segundos más tarde buscando un campo de búsqueda detrás del muro
   * de «La caja está cerrada». El rastro decía «locator.fill agotó el tiempo»,
   * que manda a mirar el campo, que estaba bien.
   */
  await expect(
    botonAbrir.or(yaAbierta).first(),
    'La pantalla de caja no enseñó ni el formulario de apertura ni el arqueo. Sin una de las ' +
      'dos cosas no se puede saber si la caja de esta terminal está abierta.',
  ).toBeVisible();

  if ((await yaAbierta.count()) > 0) return;

  // El fondo va por montones porque «$1,500» no dice si se puede dar cambio.
  // Basta uno: lo que se prueba es que la caja abre, no el arqueo.
  await page.locator(caja.campoDelFondo).fill(fondoEnPesos);

  /**
   * Se espera la RESPUESTA del servidor, y su mensaje entra en el fallo.
   *
   * Aquí sólo se afirmaba que el formulario se iba, y el día que no se fue el rastro
   * dijo «se pulsó Abrir caja y el formulario sigue ahí»: el síntoma, nunca la causa.
   * La causa era ésta, y costó una corrida entera encontrarla:
   * `sesiones_caja_una_abierta_por_sucursal` permite UNA sesión abierta por SUCURSAL
   * —no una por terminal—, así que una corrida anterior que murió DESPUÉS de abrir
   * deja su caja abierta en SU terminal, y ninguna terminal nueva puede abrir la
   * suya. Cerrar la ajena exige ser su terminal, así que desde aquí no se puede.
   *
   * El servidor lo dice con todas las letras —«Esta sucursal ya tiene una caja
   * abierta, en la terminal …»— y ese texto es lo único que lleva a la salida. Se
   * lee de la respuesta y se pone en el mensaje, con la salida escrita al lado.
   *
   * (Y para que no vuelva a ocurrir, `soltarLaCaja` cierra la de esta terminal al
   * acabar la prueba aunque la prueba haya fallado.)
   */
  const [respuesta] = await Promise.all([
    page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/caja/abrir' && r.request().method() === 'POST',
    ),
    botonAbrir.click(),
  ]);

  const texto = await respuesta.text();
  let contestacion: RespuestaDeComando = {};
  try {
    contestacion = JSON.parse(texto) as RespuestaDeComando;
  } catch {
    // Un cuerpo que no es JSON es un fallo del servidor, no del comando: el texto
    // crudo entra igual en el mensaje, que es lo que hace falta para leerlo.
  }

  expect(
    contestacion.ok,
    [
      `«${caja.boton}» no abrió la caja: ${String(respuesta.status())} ` +
        `${contestacion.error?.codigo ?? ''} ${contestacion.error?.mensaje ?? texto.slice(0, 300)}`.trim(),
      '',
      'Si el código es CAJA_YA_ABIERTA y el mensaje nombra OTRA terminal, es una corrida',
      'anterior que murió después de abrir su caja: la base permite UNA sesión abierta por',
      'SUCURSAL y cerrar la ajena exige ser su terminal. Se limpia volviendo a sembrar la',
      'demo, que borra sus sesiones de caja:',
      '',
      '  node --conditions=react-server scripts/sembrar-demos.mjs --solo <slug>',
    ].join('\n'),
  ).toBe(true);

  await expect(
    botonAbrir,
    'El servidor ACEPTÓ la apertura y el formulario de apertura sigue en pantalla. La caja de ' +
      'esta terminal está abierta y la pantalla no se enteró: eso es un defecto de la pantalla, ' +
      'no de la caja.',
  ).toHaveCount(0);
}

/**
 * DEJA LA CAJA CERRADA, haya pasado lo que haya pasado con la prueba.
 *
 * ── Por qué hace falta algo que corra DESPUÉS del fallo ────────────────────
 * Porque el último paso de cada modelo cierra la caja y cuadra el arqueo, y ese
 * paso no se ejecuta cuando la prueba muere antes. Y lo que queda no es un dato
 * sucio: es un CANDADO. `sesiones_caja_una_abierta_por_sucursal` permite una
 * sesión abierta por sucursal, cada navegador nuevo trae su propia terminal y
 * cerrar la de otra terminal no se puede, así que **una corrida fallida impide
 * todas las siguientes** hasta que alguien vuelva a sembrar la demo. Pasó: entre
 * las dos corridas del 20-09-2026 el fallo dejó de ser el que se estaba
 * arreglando y pasó a ser el candado de la anterior.
 *
 * ── Por qué no afirma nada, y por qué devuelve una frase ───────────────────
 * No es una aserción: es limpieza, y una limpieza que revienta tapa el fallo de
 * verdad —el que hay que leer— con un fallo del `afterEach`. Así que no lanza
 * nunca y devuelve lo que hizo, para que quien la llama lo anote en el informe.
 * Con eso queda visible que la caja se cerró en la limpieza, que es información
 * distinta de «la prueba la cerró».
 *
 * Cuenta EXACTAMENTE lo esperado —lo pregunta antes con `efectivoContadoCentavos:
 * 0`, que es lo único que hace que `caja.estado` lo devuelva— para no dejarle a la
 * demo un corte con faltante inventado.
 */
export async function soltarLaCaja(page: Page): Promise<string> {
  try {
    const estado = await page.request.post('/api/caja/estado', {
      headers: cabecerasDeEscritura(),
      data: { efectivoContadoCentavos: 0 },
    });
    if (estado.status() !== 200) {
      return `no se pudo leer el estado de la caja (${String(estado.status())}): nada que soltar`;
    }

    const cuerpo = (await estado.json()) as {
      readonly datos?: { readonly abierta?: boolean; readonly efectivoEsperadoCentavos?: string };
    };
    if (cuerpo.datos?.abierta !== true) return 'la caja de esta terminal ya estaba cerrada';

    const esperado = cuerpo.datos.efectivoEsperadoCentavos ?? '0';
    const cierre = await page.request.post('/api/caja/cerrar', {
      headers: cabecerasDeEscritura(),
      data: { efectivoContadoCentavos: Number(esperado) },
    });
    return cierre.status() === 200
      ? `caja cerrada en la limpieza, contando lo esperado (${esperado} centavos)`
      : `LA CAJA SIGUE ABIERTA: cerrarla contestó ${String(cierre.status())}. La siguiente ` +
          'corrida no podrá abrir la suya; siembra la demo otra vez.';
  } catch (error) {
    return `no se pudo soltar la caja: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Abre la caja de esta terminal POR LA RUTA, no por el diálogo.
 *
 * ── Por qué por la ruta, y por qué esto no es saltarse nada ────────────────
 * Es el mismo criterio que `cambiarDePlantilla`: se usa EXACTAMENTE la ruta que
 * usa el botón, con las mismas cabeceras, así que pasa por el mismo comando, el
 * mismo gate de rol, la misma plantilla permitida y la misma auditoría. Lo que
 * se salta es el DIÁLOGO, no la autorización.
 *
 * Y hace falta porque tres de los cinco modelos abren la caja en la pantalla
 * HEREDADA —un diálogo de la plataforma anterior— mientras el mostrador y la
 * barra tienen la suya propia. Esas dos SÍ se abren por la pantalla, porque ahí
 * el formulario es parte del modelo; en los otros tres, teclear un diálogo
 * heredado no prueba nada del acople y cuesta media suite.
 *
 * Devuelve `true` si la abrió, `false` si ya estaba abierta.
 */
export async function abrirCajaPorLaRuta(page: Page, fondoCentavos: number): Promise<boolean> {
  const estado = await page.request.post('/api/caja/estado', {
    headers: cabecerasDeEscritura(),
    data: {},
  });
  const cuerpo = (await estado.json()) as { datos?: { abierta?: boolean } };
  if (cuerpo.datos?.abierta === true) return false;

  const respuesta = await page.request.post('/api/caja/abrir', {
    headers: cabecerasDeEscritura(),
    data: { fondoInicialCentavos: fondoCentavos },
  });
  const texto = await respuesta.text();
  expect(
    respuesta.status(),
    'No se pudo abrir la caja de esta terminal: ' +
      texto.slice(0, 300) +
      '. Sin caja abierta, `venta.cobrar` contesta «Abre la caja antes de cobrar» y no hay ' +
      'venta que comprobar.',
  ).toBe(200);
  return true;
}

/**
 * CIERRA LA CAJA Y EXIGE QUE EL DINERO CUADRE, contra el servidor.
 *
 * El esperado lo calcula `caja.cerrar` sumando los movimientos del turno: la
 * apertura con su fondo y cada venta en efectivo. Comparar contra
 * `fondo + cobrado` es la aritmética completa del arqueo, y se hace al centavo:
 * un peso de diferencia al cerrar es un peso que alguien tiene que explicar.
 *
 * Y cerrar es lo que hace REPETIBLE la corrida: la base permite UNA sesión
 * abierta por sucursal, y cada navegador nuevo trae su propia terminal, así que
 * una caja que se queda abierta bloquea la corrida siguiente entera.
 */
export async function cerrarCajaYCuadrar(page: Page, esperadoCentavos: number): Promise<void> {
  const respuesta = await page.request.post('/api/caja/cerrar', {
    headers: cabecerasDeEscritura(),
    data: { efectivoContadoCentavos: esperadoCentavos },
  });
  const texto = await respuesta.text();
  expect(respuesta.status(), `No se pudo cerrar la caja: ${texto.slice(0, 300)}`).toBe(200);

  const cuerpo = JSON.parse(texto) as {
    datos?: { efectivoEsperadoCentavos?: string; diferenciaCentavos?: string };
  };
  expect(
    Number(cuerpo.datos?.efectivoEsperadoCentavos ?? -1),
    'El efectivo ESPERADO del corte no es el fondo más lo cobrado en efectivo. O la venta no ' +
      'entró al cajón, o el fondo no se registró como movimiento de apertura: las dos cosas son ' +
      'dinero que no cuadra a fin de turno.',
  ).toBe(esperadoCentavos);
  expect(
    Number(cuerpo.datos?.diferenciaCentavos ?? -1),
    'Se contó exactamente lo esperado y el corte dice que hay diferencia.',
  ).toBe(0);
}
