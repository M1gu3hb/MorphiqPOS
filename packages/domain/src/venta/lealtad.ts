import { ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-930, F-934 y F-936 · Los sellos, el canje y lo que se debe por ellos.
 *
 * ── Por qué en una cafetería esto ES el negocio ───────────────────────────
 * «La tarjeta de cartón se pierde, se falsifica y no se mide. En una cafetería
 * de barrio la recurrencia **es** el negocio, y hoy no hay un solo dato sobre
 * ella.» No es un programa de puntos: es la diferencia entre un cliente que
 * viene tres veces por semana y uno que vino una vez.
 *
 * ── La regla que la tarjeta de cartón nunca tuvo ──────────────────────────
 * Un sello por BEBIDA, no por ticket. Quien pide tres cafés para su oficina se
 * lleva tres sellos, y la tarjeta de cartón sólo podía darle uno porque sólo
 * había una tarjeta. Es la mitad del valor de digitalizarla.
 *
 * ── Y la que sí tenía, y hay que conservar ────────────────────────────────
 * **La bolsa de grano no da sellos.** No es un olvido: es una decisión de
 * margen. Un producto que ya se vende con descuento no puede además comprar
 * premios, y `sellos_otorga` en cero es cómo se dice eso sin un `if` por
 * producto en el código.
 */

export interface LineaParaSellos {
  readonly productoId: string;
  /** Unidades vendidas. Tres cafés son tres sellos, no uno. */
  readonly cantidad: number;
  /** Cuántos sellos da UNA unidad de este producto. Cero en el grano. */
  readonly sellosOtorga: number;
  /** El canje no genera sellos: el sexto café no compra el doceavo. */
  readonly esCanje: boolean;
}

/**
 * Cuántos sellos deja esta venta.
 *
 * ── Por qué el canje no da sellos ─────────────────────────────────────────
 * Porque si los diera, cada premio acercaría el siguiente y el programa se
 * pagaría a sí mismo hasta el infinito. Con cinco sellos por premio, un canje
 * que otorgara sello reduciría el costo real de cada premio en un 20 % y nadie
 * lo vería hasta el cierre del año.
 */
export function sellosDeLaVenta(lineas: readonly LineaParaSellos[]): number {
  let total = 0;
  for (const linea of lineas) {
    if (linea.esCanje) continue;
    if (!Number.isInteger(linea.cantidad) || linea.cantidad < 0) {
      throw new ErrorDominio(
        'CANTIDAD_INVALIDA',
        'Los sellos se cuentan por unidad entera: media bebida no da medio sello.',
      );
    }
    if (!Number.isInteger(linea.sellosOtorga) || linea.sellosOtorga < 0) {
      throw new ErrorDominio(
        'CATALOGO_INVALIDO',
        'Un producto no puede otorgar sellos fraccionarios ni negativos.',
      );
    }
    total += linea.cantidad * linea.sellosOtorga;
  }
  return total;
}

export interface SolicitudDeCanje {
  readonly saldo: number;
  readonly sellosPorPremio: number;
}

export type VeredictoCanje =
  | { readonly puede: true; readonly sellosQueCuesta: number; readonly saldoDespues: number }
  | { readonly puede: false; readonly faltan: number };

/**
 * ¿Alcanza para un premio?
 *
 * ── Por qué el saldo NUNCA puede quedar negativo ──────────────────────────
 * Porque un saldo negativo es un premio regalado que nadie va a poder explicar,
 * y porque el saldo de lealtad es lo único que el cliente lleva contado en la
 * cabeza. Un canje que lo deje en −2 se descubre cuando la clienta dice «pero
 * si yo tenía cuatro».
 */
export function evaluarCanje(solicitud: SolicitudDeCanje): VeredictoCanje {
  const { saldo, sellosPorPremio } = solicitud;
  if (!Number.isInteger(sellosPorPremio) || sellosPorPremio <= 0) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'Hace falta decir cuántos sellos cuesta un premio antes de canjear nada.',
    );
  }
  if (saldo < sellosPorPremio) return { puede: false, faltan: sellosPorPremio - saldo };
  return {
    puede: true,
    sellosQueCuesta: sellosPorPremio,
    saldoDespues: saldo - sellosPorPremio,
  };
}

export interface PasivoDeLealtad {
  readonly sellosVivos: number;
  readonly sellosPorPremio: number;
  readonly costoPremioCentavos: bigint;
}

/**
 * F-936 · Lo que el negocio debe en premios, al COSTO.
 *
 * ── Por qué al costo y no al precio ───────────────────────────────────────
 * Porque un premio no es una venta perdida: es un café que se regala, y lo que
 * sale del negocio es lo que ese café cuesta hacer. Valuarlo al precio inflaría
 * el pasivo entre dos y cuatro veces, y un pasivo inflado se deja de mirar.
 *
 * ── Y por qué se truncan los sellos sueltos ───────────────────────────────
 * Tres sellos con cinco por premio no son 0.6 premios: son cero premios y un
 * cliente a mitad de camino. La deuda EXIGIBLE hoy es la de los premios
 * completos; contar la fracción daría un número que nadie puede reclamar.
 */
export function pasivoDeLealtad(datos: PasivoDeLealtad): bigint {
  const { sellosVivos, sellosPorPremio, costoPremioCentavos } = datos;
  if (!Number.isInteger(sellosPorPremio) || sellosPorPremio <= 0) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'Sin sellos por premio no se puede valuar el pasivo.',
    );
  }
  if (sellosVivos < 0 || costoPremioCentavos < 0n) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'Ni los sellos vivos ni el costo del premio pueden ser negativos.',
    );
  }
  const premiosExigibles = Math.floor(sellosVivos / sellosPorPremio);
  return BigInt(premiosExigibles) * costoPremioCentavos;
}
