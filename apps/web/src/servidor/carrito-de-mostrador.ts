import 'server-only';

import { agregarBebida } from '@morphiqpos/app/cafeteria';
import { agregarLinea, crearOrden, vaciarOrden } from '@morphiqpos/app/venta';
import { z } from 'zod';

import { manejadorDeComando } from './ruta.ts';

/**
 * EL CARRITO DEL MOSTRADOR, ARMADO EN EL SERVIDOR EN UN SOLO VIAJE.
 *
 * En el mostrador de una tienda la venta vive en la PANTALLA hasta que se cobra o se
 * aparta: cada escaneo no viaja. Al cobrar (o al apartar, F6) se arma la orden aquí con los
 * TRES comandos que ya existen —crear el borrador, vaciarlo, meter cada renglón— y cada
 * paso sigue pasando por su `zod`, su gate de rol, su auditoría y su clave de idempotencia.
 *
 * ── Por qué se VACÍA (C.10 de la 2.4) ──────────────────────────────────────
 * Una terminal tiene UN borrador y `venta.crear_orden` lo reutiliza. Si un cobro anterior
 * no se completó —el total cambió, el crédito del fiado dijo que no— sus líneas seguían ahí
 * y las de ahora entraban ENCIMA: el total nunca volvía a cuadrar con la pantalla y la caja
 * no podía cobrar más. El vaciado lleva SU clave: un reintento de esta misma venta no lo
 * repite, así que no borra lo que esta venta ya metió.
 */

export const LineaDeMostrador = z.object({
  productoId: z.uuid(),
  /** Texto, igual que `venta.agregar_linea` la espera. */
  cantidad: z.union([z.string().min(1).max(20), z.number()]),
  /** F-147 · La caja escaneada: su precio y su factor los pone el servidor. */
  presentacionId: z.uuid().optional(),
  /**
   * F-027 · La bebida CON SUS OPCIONES (C.10 de la 2.4): la leche, el tamaño, los
   * extras. Con opciones —o con alergias o nota— el renglón entra por
   * `cafeteria.agregar_bebida`, que pone el precio con los deltas y sella lo elegido; el
   * cobro luego sustituye la leche en el consumo. Sin esto el mostrador de la cafetería
   * no podía cobrar un latte de avena.
   */
  opciones: z.array(z.uuid()).max(20).optional(),
  alergias: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
  nota: z.string().trim().max(200).optional(),
});

export type LineaDeMostrador = z.infer<typeof LineaDeMostrador>;

const crear = manejadorDeComando(crearOrden);
const vaciar = manejadorDeComando(vaciarOrden);
const meter = manejadorDeComando(agregarLinea);
const meterBebida = manejadorDeComando(agregarBebida);

/** Si el renglón es una bebida con algo elegido: va por `cafeteria.agregar_bebida`. */
function esBebidaConOpciones(linea: LineaDeMostrador): boolean {
  return (
    (linea.opciones?.length ?? 0) > 0 ||
    (linea.alergias?.length ?? 0) > 0 ||
    (linea.nota ?? '') !== ''
  );
}

export function respuestaJson(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * Una petición hermana para cada paso: las MISMAS cabeceras —la cookie de sesión y la del
 * dispositivo, que es de donde sale el ámbito—, otro cuerpo y otra clave de idempotencia.
 * La URL se conserva porque `peticionDeEscrituraValida` compara el origen con `APP_URL`.
 */
export function pasosDe(peticion: Request): (datos: unknown, sufijo: string) => Request {
  const clave = peticion.headers.get('idempotency-key') ?? crypto.randomUUID();
  return (datos, sufijo) => {
    const texto = JSON.stringify(datos);
    const cabeceras = new Headers(peticion.headers);
    cabeceras.set('content-type', 'application/json');
    cabeceras.set('idempotency-key', `${clave}:${sufijo}`);
    // `content-length` tiene que ser el del cuerpo NUEVO, y tiene que estar:
    // `cuerpoDentroDelLimite` falla cerrado si no se declara. En BYTES: «Aceite de maíz»
    // ocupa más bytes que letras.
    cabeceras.set('content-length', String(new TextEncoder().encode(texto).length));
    return new Request(peticion.url, { method: 'POST', headers: cabeceras, body: texto });
  };
}

/** Los datos de una respuesta `{ ok: true, datos }`, o nulos si el paso falló. */
export async function datosSiSalio<T>(respuesta: Response): Promise<T | null> {
  const leido = (await respuesta
    .clone()
    .json()
    .catch(() => null)) as { ok?: boolean; datos?: T } | null;
  return leido?.ok === true && leido.datos !== undefined ? leido.datos : null;
}

export type CarritoArmado =
  | { readonly ok: true; readonly ordenId: string }
  | { readonly ok: false; readonly respuesta: Response };

/**
 * Crea (o reutiliza) el borrador de la terminal, lo vacía y le mete los renglones. Un paso
 * que falla se devuelve TAL CUAL —su código, su mensaje y su estado—: envolverlo en un error
 * propio escondería «CAJA_CERRADA» o «TOTAL_DESACTUALIZADO», que son lo que el cajero lee.
 */
export async function armarCarrito(
  paso: (datos: unknown, sufijo: string) => Request,
  lineas: readonly LineaDeMostrador[],
): Promise<CarritoArmado> {
  const respuestaOrden = await crear(paso({}, 'orden'));
  const orden = await datosSiSalio<{ ordenId?: string }>(respuestaOrden);
  if (typeof orden?.ordenId !== 'string') return { ok: false, respuesta: respuestaOrden };
  const ordenId = orden.ordenId;

  const respuestaVaciar = await vaciar(paso({ ordenId }, 'vaciar'));
  if ((await datosSiSalio(respuestaVaciar)) === null) {
    return { ok: false, respuesta: respuestaVaciar };
  }

  for (const [indice, linea] of lineas.entries()) {
    if (esBebidaConOpciones(linea)) {
      // `agregar_bebida` no recibe la orden: usa el borrador de ESTA terminal, que es el
      // mismo que `crear_orden` acaba de devolver. Si alguna vez no lo fuera, la bebida
      // habría caído en otra cuenta: se para aquí en vez de cobrar una orden sin ella.
      const respuestaBebida = await meterBebida(
        paso(
          {
            productoId: linea.productoId,
            cantidad: typeof linea.cantidad === 'number' ? String(linea.cantidad) : linea.cantidad,
            opciones: linea.opciones ?? [],
            alergias: linea.alergias ?? [],
            nota: linea.nota ?? '',
          },
          `l${String(indice)}`,
        ),
      );
      const bebida = await datosSiSalio<{ ordenId?: string }>(respuestaBebida);
      if (bebida === null) return { ok: false, respuesta: respuestaBebida };
      if (bebida.ordenId !== ordenId) {
        return {
          ok: false,
          respuesta: respuestaJson(409, {
            ok: false,
            error: {
              codigo: 'CONFLICTO',
              mensaje: 'La bebida entró en otra cuenta de esta terminal. No se cobró nada.',
            },
          }),
        };
      }
      continue;
    }
    const respuestaLinea = await meter(
      paso(
        {
          ordenId,
          productoId: linea.productoId,
          cantidad: typeof linea.cantidad === 'number' ? String(linea.cantidad) : linea.cantidad,
          ...(linea.presentacionId === undefined ? {} : { presentacionId: linea.presentacionId }),
        },
        `l${String(indice)}`,
      ),
    );
    if ((await datosSiSalio(respuestaLinea)) === null) {
      return { ok: false, respuesta: respuestaLinea };
    }
  }

  return { ok: true, ordenId };
}
