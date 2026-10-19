import { aplicarDescuento, cobrarOrden } from '@morphiqpos/app/venta';
import { z } from 'zod';

import {
  LineaDeMostrador,
  armarCarrito,
  fronteraDelMostrador,
  datosSiSalio,
  pasosDe,
  respuestaJson,
} from '~/servidor/carrito-de-mostrador';
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
 * descontado. Lo que puede quedar es un BORRADOR con algunos renglones, y el siguiente
 * cobro de esa caja lo VACÍA antes de meter los suyos (`armarCarrito`, C.10 de la 2.4):
 * antes los metía encima y el total ya nunca cuadraba. Un borrador huérfano no es dinero
 * perdido ni un hueco en la numeración; un cobro a medias sí lo sería.
 *
 * ── La idempotencia ────────────────────────────────────────────────────────
 * La pantalla manda UNA clave para toda la venta. Aquí se derivan las de cada
 * paso —`<clave>:orden`, `<clave>:vaciar`, `<clave>:l0`, `<clave>:cobro`— porque cada comando tiene
 * su propio registro de claves. El efecto es el que se quiere: un doble Enter
 * reusa el mismo borrador, no duplica los renglones y no cobra dos veces.
 */

export const runtime = 'nodejs';

/**
 * Un renglón de un pago MIXTO (D.1 de la 2.4): el cobro de la tienda sólo aceptaba un
 * método, y su `02-DINERO-Y-CAJA §5` define el mixto —«le abono $100 y llevo estas
 * cosas», efectivo con tarjeta—. `venta.cobrar` ya reparte varios pagos (P1-11); faltaba
 * dejarlos pasar. El recibido, sólo en efectivo: es de donde sale el cambio.
 */
const PagoDeMostrador = z.object({
  metodo: z.enum(['efectivo', 'tarjeta', 'transferencia', 'fiado']),
  montoCentavos: z.number().int().positive(),
  recibidoCentavos: z.number().int().nonnegative().optional(),
});

/**
 * El descuento de la venta (F-205, D-28): importe, motivo y, si pasa del tope de quien
 * cobra, la autorización firmada del supervisor. Se aplica al borrador ANTES de cobrar,
 * con `venta.aplicar_descuento`, y el total esperado ya viene descontado.
 */
const DescuentoDeMostrador = z.object({
  centavos: z.number().int().positive(),
  motivo: z.string().trim().min(4).max(200),
  autorizacion: z.string().min(20).max(2_000).optional(),
});

const Entrada = z.object({
  /**
   * `fiado` (F11) entrega a cuenta de `clienteId` (F4). La ruta aceptaba sólo tres métodos
   * mientras la pantalla mandaba cuatro: F11 contestaba «La venta llegó incompleta» y la
   * tienda no podía fiar desde su cobro (C.10 de la 2.4).
   */
  metodo: z.enum(['efectivo', 'tarjeta', 'transferencia', 'fiado']),
  clienteId: z.uuid().optional(),
  totalEsperadoCentavos: z.number().int().nonnegative(),
  recibidoCentavos: z.number().int().nonnegative(),
  lineas: z.array(LineaDeMostrador).min(1).max(120),
  /**
   * El canal y el nombre con el que se grita el pedido: los manda el mostrador de la
   * cafetería (C.10 de la 2.4), que cobra por aquí desde que sus bebidas llevan opciones.
   * La tienda no los manda y `venta.cobrar` los trata como siempre.
   */
  canal: z.enum(['aqui', 'llevar']).optional(),
  nombrePedido: z.string().trim().min(1).max(60).optional(),
  /** Si llega, manda sobre `metodo`: la venta se paga con estos renglones. */
  pagos: z.array(PagoDeMostrador).min(2).max(4).optional(),
  descuento: DescuentoDeMostrador.optional(),
});

const cobrar = manejadorDeComando(cobrarOrden);
const descontar = manejadorDeComando(aplicarDescuento);

/** Los pagos que se mandan a `venta.cobrar`: el mixto tal cual, o el método único por el total. */
function pagosDe(datos: z.infer<typeof Entrada>) {
  if (datos.pagos !== undefined) {
    return datos.pagos.map((p) => ({
      metodo: p.metodo,
      montoCentavos: p.montoCentavos,
      ...(p.metodo === 'efectivo' && p.recibidoCentavos !== undefined
        ? { recibidoCentavos: p.recibidoCentavos }
        : {}),
    }));
  }
  return [
    {
      metodo: datos.metodo,
      montoCentavos: datos.totalEsperadoCentavos,
      ...(datos.metodo === 'efectivo' ? { recibidoCentavos: datos.recibidoCentavos } : {}),
    },
  ];
}

export async function POST(peticion: Request): Promise<Response> {
  const frontera = fronteraDelMostrador(peticion);
  if (frontera !== null) return frontera;
  const cuerpo: unknown = await peticion.json().catch(() => null);
  const validada = Entrada.safeParse(cuerpo);
  if (!validada.success) {
    return respuestaJson(400, {
      ok: false,
      error: {
        codigo: 'ENTRADA_INVALIDA',
        mensaje: 'La venta llegó incompleta. No se cobró nada.',
      },
    });
  }

  const paso = pasosDe(peticion);
  const carrito = await armarCarrito(paso, validada.data.lineas);
  if (!carrito.ok) return carrito.respuesta;
  const { ordenId } = carrito;

  const { descuento } = validada.data;
  if (descuento !== undefined) {
    const respuestaDescuento = await descontar(
      paso(
        {
          ordenId,
          descuentoCentavos: descuento.centavos,
          motivo: descuento.motivo,
          ...(descuento.autorizacion === undefined ? {} : { autorizacion: descuento.autorizacion }),
        },
        'descuento',
      ),
    );
    if ((await datosSiSalio(respuestaDescuento)) === null) return respuestaDescuento;
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
        ...(validada.data.clienteId === undefined ? {} : { clienteId: validada.data.clienteId }),
        ...(validada.data.canal === undefined ? {} : { canal: validada.data.canal }),
        ...(validada.data.nombrePedido === undefined
          ? {}
          : { nombrePedido: validada.data.nombrePedido }),
        pagos: pagosDe(validada.data),
      },
      'cobro',
    ),
  );
  if ((await datosSiSalio(respuestaCobro)) === null) return respuestaCobro;

  // `ventaId` es el identificador de la ORDEN, que es lo que la pantalla usa para
  // abrir el ticket. No se inventa un identificador nuevo para el mostrador.
  return respuestaJson(200, { ok: true, datos: { ventaId: ordenId } });
}
