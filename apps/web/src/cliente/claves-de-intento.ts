/**
 * LA MISMA CLAVE PARA EL MISMO INTENTO (auditoría de la 2.4).
 *
 * `invocarComando` generaba una `Idempotency-Key` NUEVA en cada llamada, y su cabecera
 * decía que «se conserva entre reintentos». No se conservaba: si el servidor registraba
 * un abono de $300 y la respuesta se perdía, la pantalla decía «no se pudo», la cajera
 * volvía a tocar y el segundo intento —con otra clave— lo registraba otra vez: la deuda
 * bajaba dos veces y el cajón esperaba $600. Lo mismo un cobro del mostrador, un
 * movimiento de caja o un pago de crédito.
 *
 * Aquí la clave se ata a la FIRMA de la petición —ruta y cuerpo—: mientras ese mismo
 * pedido no tenga una respuesta definitiva, todo reintento lleva la misma clave y el
 * servidor devuelve el resultado guardado en vez de repetirlo. Con la respuesta
 * definitiva la clave se suelta: la siguiente operación igual —otro abono de $300
 * mañana— es OTRO intento y lleva otra.
 *
 * ── Qué es definitivo ─────────────────────────────────────────────────────
 * Un 2xx (se hizo) y un 4xx que no sea 409 ni 429 (no se hizo, y repetirlo igual no lo
 * va a hacer). NO lo es: un fallo de red —no se sabe si llegó—, un 5xx, un 409 —la
 * misma clave sigue en curso en el servidor— ni un 429 —no se procesó—. Ahí la clave se
 * queda para el reintento. Y caduca sola a los diez minutos: un intento que nadie
 * reintentó en ese tiempo ya no es el mismo intento.
 */

const VIDA_DE_UN_INTENTO_MS = 10 * 60_000;

interface Pendiente {
  readonly clave: string;
  readonly desde: number;
}

export interface RegistroDeIntentos {
  /** La clave de esta firma: la que ya tiene si sigue pendiente, o una nueva. */
  claveDe(firma: string, ahora: number): string;
  /** Lo que el servidor contestó a esa firma; suelta la clave si es definitivo. */
  respondio(firma: string, estado: number): void;
}

export function esRespuestaDefinitiva(estado: number): boolean {
  if (estado >= 200 && estado < 300) return true;
  return estado >= 400 && estado < 500 && estado !== 409 && estado !== 429;
}

export function crearRegistroDeIntentos(
  generar: () => string,
  vidaMs: number = VIDA_DE_UN_INTENTO_MS,
): RegistroDeIntentos {
  const pendientes = new Map<string, Pendiente>();

  return {
    claveDe(firma, ahora) {
      for (const [otra, pendiente] of pendientes) {
        if (ahora - pendiente.desde > vidaMs) pendientes.delete(otra);
      }
      const ya = pendientes.get(firma);
      if (ya !== undefined) return ya.clave;
      const clave = generar();
      pendientes.set(firma, { clave, desde: ahora });
      return clave;
    },
    respondio(firma, estado) {
      if (esRespuestaDefinitiva(estado)) pendientes.delete(firma);
    },
  };
}
