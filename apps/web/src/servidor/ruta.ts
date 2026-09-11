import { validarEntorno } from '@morphiqpos/contracts';
import { rutaDeComando, type DefinicionServible, type PeticionHttp } from '@morphiqpos/app/http';
import type { ZodType } from 'zod';

import { peticionDeEscrituraValida } from './seguridad-http';

/**
 * El adaptador de Next para el patrón de ruta (F1.1-X-01).
 *
 * Tres líneas por endpoint. Lo único que hace es convertir `Request`/`Response`
 * de la Web API en el par neutro que entiende `packages/app`, para que la lógica
 * del puente sea probable sin levantar un servidor.
 *
 * Importa de `@morphiqpos/app`, nunca de `@morphiqpos/data`: es la primera
 * prohibición de `04-ARQUITECTURA §2` y la verifica el lint. Por eso el tipo que
 * recibe es `DefinicionServible`, que ya trae la transacción ligada.
 *
 * Uso:
 *
 * ```ts
 * // apps/web/app/api/venta/cobrar/route.ts
 * import { manejadorDeComando } from '~/servidor/ruta';
 * import { cobrarOrden } from '@morphiqpos/app/venta';
 *
 * export const POST = manejadorDeComando(cobrarOrden);
 * ```
 */

/**
 * `nodejs` y no `edge`: el envoltorio abre transacciones con `pg`, que necesita
 * sockets TCP. En el runtime edge no existen, y eso falla al desplegar, no al
 * compilar.
 */
export const runtime = 'nodejs';

export function manejadorDeComando<E extends ZodType, S>(
  definicion: DefinicionServible<E, S>,
): (peticion: Request) => Promise<Response> {
  return async function POST(peticion: Request): Promise<Response> {
    // Validación de origen en TODAS las rutas de comando (F1.1-C-13). Antes
    // sólo la tenían las de gestión, así que un formulario de otro sitio podía
    // llegar a `venta.cobrar` con la cookie del cajero adjunta — que es
    // exactamente el CSRF que `SameSite=Lax` no cubre por sí solo.
    if (!peticionDeEscrituraValida(peticion)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { codigo: 'SIN_PERMISO', mensaje: 'Petición de escritura rechazada.' },
        }),
        {
          status: 403,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          },
        },
      );
    }

    // El entorno se lee por petición y no al importar el módulo: importar una
    // ruta durante el build no debe exigir que los secretos existan.
    const entorno = validarEntorno(process.env);
    const manejar = rutaDeComando(definicion, { secreto: entorno.SESSION_SECRET });

    const salida = await manejar(adaptar(peticion));
    return new Response(JSON.stringify(salida.cuerpo), {
      status: salida.estado,
      headers: salida.cabeceras,
    });
  };
}

function adaptar(peticion: Request): PeticionHttp {
  return {
    method: peticion.method,
    json: () => peticion.json(),
    headers: { get: (nombre: string) => peticion.headers.get(nombre) },
  };
}
