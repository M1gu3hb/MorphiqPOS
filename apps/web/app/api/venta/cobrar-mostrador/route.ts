import { agregarLinea, cobrarOrden, crearOrden } from '@morphiqpos/app/venta';
import { z } from 'zod';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * COBRAR EN EL MOSTRADOR, EN UN SOLO VIAJE.
 *
 * ── Por qué esta ruta existe, y por qué no existía ─────────────────────────
 * `apps/web/src/abarrotes/Cobrar.tsx` —la pantalla de INICIO de una tienda, la que
 * cobra todas sus ventas— publica en `/api/venta/cobrar-mostrador` desde que se
 * escribió. **La ruta no estaba.** Cada intento de cobro recibía un 404 con la
 * página de error de Next dentro, que no es `{ ok, datos }`, así que el cliente lo
 * traducía a «El servidor respondió algo inesperado» y la venta se quedaba en la
 * pantalla. Una tienda entera sin poder cobrar.
 *
 * Nadie lo había visto porque **ninguna prueba cobraba**. La suite de navegador
 * abría las once pantallas del modelo y aceptaba tres estados en ésta —caja
 * cerrada, catálogo vacío, o la venta armándose—, y los tres pasan con el cobro
 * roto. Lo encontró la primera prueba que pulsó CONFIRMAR (E4).
 *
 * ── Por qué se COMPONE en vez de escribir un comando nuevo ─────────────────
 * Porque el cobro ya existe y es lo más delicado del sistema: `venta.cobrar`
 * escribe totales, estado, folio, pagos con su propina, movimientos de caja, el
 * ledger de stock y la auditoría, todo en UNA transacción, y tiene sus pruebas.
 * Duplicar esos doscientos cincuenta renglones para el mostrador sería tener dos
 * cobros que se van separando, y el que se queda atrás es el que pierde dinero.
 *
 * Así que aquí se llaman los TRES comandos que ya hay —crear el borrador, meter
 * cada renglón, cobrar— desde el servidor, en el mismo proceso. Para la pantalla
 * es UN viaje, que es lo que pedía su comentario: encadenar N+2 idas por la red en
 * plena ráfaga es lo que se quería evitar, y se evita. Y cada paso sigue pasando
 * por su `zod`, su gate de rol, su plantilla permitida, su registro de auditoría y
 * su clave de idempotencia.
 *
 * ── Qué pasa si falla a mitad ──────────────────────────────────────────────
 * El DINERO sigue siendo atómico, que es lo que importa: el cobro es el último
 * paso y es una transacción entera; si falla, no hay pago, ni folio, ni stock
 * descontado. Lo que puede quedar es un BORRADOR con algunos renglones — el mismo
 * estado en el que está cualquier venta a medio armar, que la pantalla de registros
 * lista y `venta.suspender` retoma. Un borrador huérfano no es dinero perdido ni un
 * hueco en la numeración; un cobro a medias sí lo sería.
 *
 * ── La idempotencia ────────────────────────────────────────────────────────
 * La pantalla manda UNA clave para toda la venta. Aquí se derivan las de cada
 * paso —`<clave>:orden`, `<clave>:l0`, `<clave>:cobro`— porque cada comando tiene
 * su propio registro de claves. El efecto es el que se quiere: un doble Enter
 * reusa el mismo borrador, no duplica los renglones y no cobra dos veces.
 */

export const runtime = 'nodejs';

const Linea = z.object({
  productoId: z.uuid(),
  /** La pantalla la manda como texto, igual que `venta.agregar_linea` la espera. */
  cantidad: z.union([z.string().min(1).max(20), z.number()]),
});

const Entrada = z.object({
  metodo: z.enum(['efectivo', 'tarjeta', 'transferencia']),
  totalEsperadoCentavos: z.number().int().nonnegative(),
  recibidoCentavos: z.number().int().nonnegative(),
  lineas: z.array(Linea).min(1).max(120),
});

const crear = manejadorDeComando(crearOrden);
const meter = manejadorDeComando(agregarLinea);
const cobrar = manejadorDeComando(cobrarOrden);

function json(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function POST(peticion: Request): Promise<Response> {
  const cuerpo: unknown = await peticion.json().catch(() => null);
  const validada = Entrada.safeParse(cuerpo);
  if (!validada.success) {
    return json(400, {
      ok: false,
      error: {
        codigo: 'ENTRADA_INVALIDA',
        mensaje: 'La venta llegó incompleta. No se cobró nada.',
      },
    });
  }

  const clave = peticion.headers.get('idempotency-key') ?? crypto.randomUUID();

  /**
   * Una petición hermana para cada paso.
   *
   * Lleva las MISMAS cabeceras que llegaron —la cookie de sesión y la del
   * dispositivo entre ellas, que es de donde sale el ámbito— y cambia dos cosas:
   * el cuerpo y la clave de idempotencia. La URL se conserva porque
   * `peticionDeEscrituraValida` compara el origen con `APP_URL`.
   */
  function paso(datos: unknown, sufijo: string): Request {
    const texto = JSON.stringify(datos);
    const cabeceras = new Headers(peticion.headers);
    cabeceras.set('content-type', 'application/json');
    cabeceras.set('idempotency-key', `${clave}:${sufijo}`);
    // `content-length` tiene que ser el del cuerpo NUEVO, y tiene que estar:
    // `cuerpoDentroDelLimite` falla cerrado si no se declara —correctamente, un
    // cuerpo sin longitud declarada no se puede acotar antes de leerlo— así que
    // borrarla hacía que cada paso respondiera «El cuerpo supera 256 KiB» con un
    // cuerpo de doscientos bytes. Se mide en BYTES y no en caracteres: «Aceite de
    // maíz» ocupa más bytes que letras.
    cabeceras.set('content-length', String(new TextEncoder().encode(texto).length));
    return new Request(peticion.url, { method: 'POST', headers: cabeceras, body: texto });
  }

  // Un paso que falla se devuelve TAL CUAL: su código, su mensaje y su estado.
  // Envolverlo en un error propio de esta ruta escondería «CAJA_CERRADA» o
  // «TOTAL_DESACTUALIZADO» detrás de un 500 genérico, y esos dos mensajes son
  // exactamente los que el cajero necesita leer.
  const respuestaOrden = await crear(paso({}, 'orden'));
  const datosOrden = (await respuestaOrden
    .clone()
    .json()
    .catch(() => null)) as {
    ok?: boolean;
    datos?: { ordenId?: string };
  } | null;
  if (datosOrden?.ok !== true || typeof datosOrden.datos?.ordenId !== 'string') {
    return respuestaOrden;
  }
  const ordenId = datosOrden.datos.ordenId;

  for (const [indice, linea] of validada.data.lineas.entries()) {
    const respuestaLinea = await meter(
      paso(
        {
          ordenId,
          productoId: linea.productoId,
          cantidad: typeof linea.cantidad === 'number' ? String(linea.cantidad) : linea.cantidad,
        },
        `l${String(indice)}`,
      ),
    );
    const datosLinea = (await respuestaLinea
      .clone()
      .json()
      .catch(() => null)) as {
      ok?: boolean;
    } | null;
    if (datosLinea?.ok !== true) return respuestaLinea;
  }

  // El total viaja para que el servidor RECHACE si no coincide con el suyo:
  // cobrar un número distinto del que ya se dijo en voz alta es peor que fallar.
  // `recibidoCentavos` sólo tiene sentido en efectivo; en tarjeta el cambio no
  // existe y mandarlo haría que `repartirPagos` calculara uno.
  const respuestaCobro = await cobrar(
    paso(
      {
        ordenId,
        totalEsperadoCentavos: validada.data.totalEsperadoCentavos,
        pagos: [
          {
            metodo: validada.data.metodo,
            montoCentavos: validada.data.totalEsperadoCentavos,
            ...(validada.data.metodo === 'efectivo'
              ? { recibidoCentavos: validada.data.recibidoCentavos }
              : {}),
          },
        ],
      },
      'cobro',
    ),
  );
  const datosCobro = (await respuestaCobro
    .clone()
    .json()
    .catch(() => null)) as {
    ok?: boolean;
  } | null;
  if (datosCobro?.ok !== true) return respuestaCobro;

  // `ventaId` es el identificador de la ORDEN, que es lo que la pantalla usa para
  // abrir el ticket. No se inventa un identificador nuevo para el mostrador.
  return json(200, { ok: true, datos: { ventaId: ordenId } });
}
