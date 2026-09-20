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
    // El entorno se lee por petición y no al importar el módulo: importar una
    // ruta durante el build no debe exigir que los secretos existan.
    const entorno = validarEntorno(process.env);

    // Validación de origen en TODAS las rutas de comando (F1.1-C-13). Antes
    // sólo la tenían las de gestión, así que un formulario de otro sitio podía
    // llegar a `venta.cobrar` con la cookie del cajero adjunta — que es
    // exactamente el CSRF que `SameSite=Lax` no cubre por sí solo.
    if (!peticionDeEscrituraValida(peticion, entorno.APP_URL)) {
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

    const manejar = rutaDeComando(definicion, { secreto: entorno.SESSION_SECRET });

    const salida = await manejar(adaptar(peticion));
    return new Response(JSON.stringify(salida.cuerpo), {
      status: salida.estado,
      headers: salida.cabeceras,
    });
  };
}

/**
 * El mismo adaptador, para las rutas que llevan el identificador EN LA RUTA.
 *
 * `05-DATOS-Y-BACKEND.md` pide el identificador EN EL CAMINO —`citas/:id/cancelar`—
 * y no una ruta fija con el id en el cuerpo, y tiene razón: la ruta es lo que se
 * lee en un registro de acceso, en una traza y en una alerta, y doscientas líneas
 * idénticas al día no dicen nada. Con el id dentro, cada línea señala a una cita.
 *
 * (Las rutas de este párrafo van sin barra inicial a propósito: el verificador de
 * acople busca literales `/api/…` en todo el frontend para cazar pantallas que
 * publican en rutas que no existen, y un ejemplo dentro de un comentario le
 * hacía declarar como pendiente una ruta que nadie llama.)
 *
 * Lo que NO cambia es quién valida: el identificador de la ruta se mete en el
 * cuerpo ANTES de entregarlo, y de ahí en adelante pasa por el mismo `zod` que
 * todo lo demás. Un `params` que se colara sin validar sería la única entrada
 * del sistema que nadie mira.
 *
 * Y si el cuerpo ya trae ese campo, MANDA la ruta. Dos fuentes para el mismo
 * dato es cómo se cancela la cita equivocada: lo que el operador ve en la barra
 * de direcciones es lo que tiene que pasar.
 */
export function manejadorDeComandoConParametro<E extends ZodType, S>(
  definicion: DefinicionServible<E, S>,
  campo: string,
  /**
   * EL NOMBRE DEL SEGMENTO DE LA RUTA, que no es el del campo del comando.
   *
   * ── El defecto que este parámetro arregla ─────────────────────────────────
   * Aquí se leía `parametros[campo]`, o sea el nombre del campo del COMANDO
   * —`citaId`, `clienteId`, `cotizacionId`—, y las carpetas se llaman `[id]`.
   * Así que el valor era siempre `undefined`, el comando recibía el campo vacío
   * y zod contestaba «Hay datos incompletos o mal escritos».
   *
   * **Las veintiuna rutas con parámetro del sistema estaban así**, todas menos
   * `compras/sugerencia/[proveedorId]`, que por casualidad nombra la carpeta
   * igual que el campo: iniciar una cita, cancelarla, reprogramarla, marcar que
   * no llegó, cerrar su servicio, guardar su foto, editar un cliente, abrir su
   * expediente, convertir una cotización, agendar desde la lista de espera,
   * abrir un producto de cabina, los comprobantes… todas. Medido el 19-09-2026
   * tocando una cita en la agenda del día.
   *
   * Por omisión `id`, que es como se llaman veinte de las veintiuna. Y se deja
   * el nombre del campo como respaldo para que la que ya coincidía siga sirviendo
   * sin tocarla.
   */
  segmento = 'id',
): (peticion: Request, contexto: { params: Promise<Record<string, string>> }) => Promise<Response> {
  const manejar = manejadorDeComando(definicion);
  return async function POST(
    peticion: Request,
    contexto: { params: Promise<Record<string, string>> },
  ): Promise<Response> {
    const parametros = await contexto.params;
    const valor = parametros[segmento] ?? parametros[campo];
    const cuerpo: unknown = await peticion.json().catch(() => ({}));
    const fusionado =
      typeof cuerpo === 'object' && cuerpo !== null
        ? { ...(cuerpo as Record<string, unknown>), [campo]: valor }
        : { [campo]: valor };

    // Se reconstruye la petición en vez de mutarla: `Request` es de un solo
    // uso —su cuerpo ya se consumió arriba— y reenviar la original haría que
    // el adaptador leyera un flujo vacío.
    const copia = new Request(peticion.url, {
      method: peticion.method,
      headers: peticion.headers,
      body: JSON.stringify(fusionado),
    });
    return manejar(copia);
  };
}

function adaptar(peticion: Request): PeticionHttp {
  return {
    method: peticion.method,
    json: () => peticion.json(),
    headers: { get: (nombre: string) => peticion.headers.get(nombre) },
  };
}
