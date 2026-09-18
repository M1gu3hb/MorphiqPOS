import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import { obtenerDb, repoNegocio } from '@morphiqpos/data';

/**
 * A qué negocio sirve este despliegue (T2 del port del restaurante).
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * Su pantalla de acceso enseña la lista de empleados con su nombre y su foto
 * ANTES de que exista sesión. Para poder hacerlo, el servidor tiene que saber
 * de qué organización son. Antes lo decía la terminal enrolada con un código de
 * seis dígitos —un paso que Miguel nunca pidió y que dejaba una caja nueva sin
 * poder vender hasta que alguien fuera a gestión a generar el número—. Ahora lo
 * dice la configuración del despliegue.
 *
 * Lo que NO cambia: la organización sigue sin llegar nunca en un parámetro del
 * cliente (R16). Cambia quién se la dice al servidor, no que se la diga él.
 *
 * ── La resolución, en este orden ───────────────────────────────────────────
 * 1 · EL HOST de la petición, si su primera etiqueta es el slug de una
 *     organización activa: `mh-restaurante.morphiqpos.app` sirve a Restaurante
 *     MH. Es lo más específico que hay y gana sobre todo lo demás.
 * 2 · `ORGANIZACION` (slug), para un despliegue de un solo negocio cuyo dominio
 *     no lleva el slug.
 * 3 · Si no hay ninguna de las dos y hay UNA sola organización activa: ésa.
 * 4 · Si hay varias y nadie lo dijo: **falla**, nombrando lo que falta. Elegir
 *     «la primera» significaría enseñar la plantilla de un negocio en la
 *     pantalla de acceso de otro.
 *
 * ── Por qué el host va PRIMERO, y no la variable ───────────────────────────
 * Porque `ORGANIZACION` es una variable del BUILD: se aplica al construir, es la
 * misma para todas las peticiones, y con ella **un despliegue sólo puede servir
 * a un negocio**. Miguel tiene cuatro. Con el host, el mismo despliegue sirve a
 * los cuatro y a las cinco demostraciones, y cada uno entra por su dirección.
 *
 * Lo que NO cambia: la organización sigue sin llegar nunca en un parámetro del
 * cliente (R16). Un host no es un parámetro — lo fija el DNS y lo comprueba el
 * servidor contra la tabla, así que una etiqueta inventada no encuentra nada y
 * cae al paso 2. Y en cuanto hay SESIÓN, la organización sale de ella y esto no
 * se vuelve a consultar: estos tres caminos son sólo para lo que ocurre ANTES de
 * que exista sesión —la pantalla de acceso— y para el portal del comensal, que
 * no la tiene nunca.
 */

export interface NegocioDelDespliegue {
  readonly organizacionId: string;
  readonly nombre: string;
  readonly slug: string;
}

/**
 * La primera etiqueta de un host, si puede ser un slug.
 *
 * `mh-restaurante.morphiqpos.app` → `mh-restaurante`. Un host con una sola
 * etiqueta —`localhost`— o con puerto se limpia; lo que no encaja en la forma de
 * un slug devuelve `null` y no llega a consultarse.
 */
export function slugDelHost(host: string | null | undefined): string | null {
  if (host === null || host === undefined) return null;
  const limpio = host.trim().toLocaleLowerCase('en-US').split(':')[0] ?? '';
  const etiquetas = limpio.split('.');
  // Un host sin punto no lleva slug: es `localhost` o una IP sin dominio.
  if (etiquetas.length < 2) return null;
  const primera = etiquetas[0] ?? '';
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(primera)) return null;
  // Una etiqueta de sólo dígitos es el primer octeto de una IP —`192.168.1.10`
  // da `192`—, no el nombre de un negocio. Ninguna organización se llama así, y
  // la consulta no encontraría nada; se descarta antes para no hacerla.
  if (/^\d+$/.test(primera)) return null;
  // Etiquetas genéricas que NUNCA son un negocio. No es seguridad —un slug se
  // comprueba contra la tabla— es no hacer una consulta por cada visita a `www`.
  if (['www', 'app', 'api', 'admin', 'staging', 'preview', 'localhost'].includes(primera)) {
    return null;
  }
  return primera;
}

/**
 * Los slugs escritos en `ORGANIZACION`, que puede llevar VARIOS.
 *
 * `demo-acople-tienda` → uno. `demo-acople-tienda,demo-acople-cafeteria` → dos.
 * Se quitan los espacios y los vacíos que deja una coma de más, y se conserva EL
 * ORDEN ESCRITO: el primero es el que encabeza la pantalla de acceso.
 */
export function slugsConfigurados(valor: string | undefined): readonly string[] {
  if (valor === undefined) return [];
  const vistos = new Set<string>();
  const slugs: string[] = [];
  for (const trozo of valor.split(',')) {
    const slug = trozo.trim().toLocaleLowerCase('en-US');
    if (slug === '' || vistos.has(slug)) continue;
    vistos.add(slug);
    slugs.push(slug);
  }
  return slugs;
}

/**
 * TODOS los negocios a los que sirve este despliegue.
 *
 * ── Por qué en plural, y por qué esto es lo que pedía el encargo ───────────
 * «Un despliegue, las cinco demos: Miguel entra con el PIN de un negocio y ve
 * ese negocio; entra con el de otro y ve el otro, sin redesplegar.» Con un solo
 * slug eso es imposible, y el camino por HOST —que es el más específico y sigue
 * ganando— necesita cinco registros de DNS que hoy no existen: el dominio
 * todavía no resuelve (devuelve 402 y falta el registro A).
 *
 * Así que `ORGANIZACION` admite una LISTA. Con un solo slug —producción— esto
 * devuelve un elemento y el comportamiento es exactamente el de antes. Con
 * varios, la pantalla de acceso enseña a la gente de todos, y la organización
 * sale del EMPLEO de quien entra.
 *
 * ── Y sigue sin llegar del cliente ────────────────────────────────────────
 * R16 dice que la organización no viaja en un parámetro. No viaja: lo que el
 * cliente manda es un `empleoId`, y el servidor resuelve a qué negocio pertenece
 * ese empleo **filtrando por esta lista**. Un empleo de un negocio que este
 * despliegue no sirve no se encuentra, y sin el PIN correcto de ESE empleo no se
 * entra igualmente. El cliente elige una persona, no un negocio.
 */
export async function negociosDelDespliegue(
  slugConfigurado: string | undefined,
  host?: string | null,
): Promise<readonly NegocioDelDespliegue[]> {
  const db = obtenerDb();

  const delHost = slugDelHost(host);
  if (delHost !== null) {
    const negocio = await repoNegocio.porSlug(db, delHost);
    // Un host que no es de nadie NO falla: cae al paso 2. `morphiqpos.app` a
    // secas, o el host de un preview de Vercel, son eso. Y uno que SÍ lo es gana
    // sobre la lista: es lo más específico que hay.
    if (negocio !== null) return [negocio];
  }

  const slugs = slugsConfigurados(slugConfigurado);
  if (slugs.length > 0) {
    const negocios: NegocioDelDespliegue[] = [];
    const faltan: string[] = [];
    for (const slug of slugs) {
      const negocio = await repoNegocio.porSlug(db, slug);
      if (negocio === null) faltan.push(slug);
      else negocios.push(negocio);
    }
    // Se nombran TODOS los que faltan, no el primero: quien configura una lista
    // de cinco quiere saber de una vez cuáles dos están mal escritos.
    if (faltan.length > 0) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        `ORGANIZACION apunta a «${faltan.join('», «')}» y no hay ninguna organización activa con ` +
          (faltan.length === 1 ? 'ese slug.' : 'esos slugs.'),
      );
    }
    return negocios;
  }

  const activas = await repoNegocio.activas(db, 2);

  if (activas.length === 0) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'No hay ninguna organización activa. Da de alta el negocio con `pnpm db:bootstrap`.',
    );
  }

  if (activas.length > 1) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'Esta base tiene más de una organización activa. Define ORGANIZACION con el ' +
        'slug del negocio al que sirve este despliegue, o con la lista separada por comas ' +
        'de los negocios a los que sirve.',
    );
  }

  // El tipo no sabe que `length === 1` garantiza el elemento; el `??` está para
  // que no haga falta un `!` y para que un cambio futuro en `activas` no se
  // convierta en un fallo en tiempo de ejecución.
  const unica = activas[0];
  if (unica === undefined) {
    throw new ErrorDominio('CONFIGURACION_INVALIDA', 'No hay ninguna organización activa.');
  }
  return [unica];
}

/**
 * EL negocio, cuando quien pregunta sólo puede trabajar con uno.
 *
 * El portal del comensal y la recogida son así: el código QR trae un token que
 * pertenece a UNA organización y no hay persona a la que preguntar. Si el
 * despliegue sirve a varios y el host no desambigua, esto **falla diciéndolo**
 * en vez de coger el primero — servir el menú de otro negocio a quien escaneó
 * una mesa sería peor que no servir ninguno.
 */
export async function negocioDelDespliegue(
  slugConfigurado: string | undefined,
  host?: string | null,
): Promise<NegocioDelDespliegue> {
  const negocios = await negociosDelDespliegue(slugConfigurado, host);
  const primero = negocios[0];
  if (primero === undefined) {
    throw new ErrorDominio('CONFIGURACION_INVALIDA', 'No hay ninguna organización activa.');
  }
  if (negocios.length > 1) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      `Este despliegue sirve a ${String(negocios.length)} negocios (${negocios
        .map((n) => n.slug)
        .join(', ')}) y esta pantalla necesita saber a cuál. Entra por la dirección del ` +
        'negocio, o despliega con un solo slug en ORGANIZACION.',
    );
  }
  return primero;
}
