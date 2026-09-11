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
 * ── La resolución, y por qué falla en vez de adivinar ──────────────────────
 * 1 · `ORGANIZACION` (slug) si está puesta. Explícito gana.
 * 2 · Si no, y hay UNA sola organización activa: esa. Es el caso de un negocio
 *     con su propio dominio, que es el caso de Miguel.
 * 3 · Si hay varias y nadie lo dijo: **falla**, nombrando la variable que falta.
 *     Elegir «la primera» aquí significaría enseñar la plantilla de un negocio
 *     en la pantalla de acceso de otro.
 */

export interface NegocioDelDespliegue {
  readonly organizacionId: string;
  readonly nombre: string;
  readonly slug: string;
}

export async function negocioDelDespliegue(
  slugConfigurado: string | undefined,
): Promise<NegocioDelDespliegue> {
  const db = obtenerDb();

  if (slugConfigurado !== undefined) {
    const negocio = await repoNegocio.porSlug(db, slugConfigurado);
    if (negocio === null) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        `ORGANIZACION apunta a «${slugConfigurado}» y no hay ninguna organización activa con ese slug.`,
      );
    }
    return negocio;
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
        'slug del negocio al que sirve este despliegue.',
    );
  }

  // El tipo no sabe que `length === 1` garantiza el elemento; el `??` está para
  // que no haga falta un `!` y para que un cambio futuro en `activas` no se
  // convierta en un fallo en tiempo de ejecución.
  const unica = activas[0];
  if (unica === undefined) {
    throw new ErrorDominio('CONFIGURACION_INVALIDA', 'No hay ninguna organización activa.');
  }
  return unica;
}
