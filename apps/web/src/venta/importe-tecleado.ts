/**
 * EL IMPORTE QUE SE TECLEA EN LA CAJA, y el retiro que sale de él.
 *
 * Vivía dentro de la caja de la tienda (`abarrotes/Caja.tsx`) y ahí sólo lo usaba ella. El
 * salón necesita el mismo retiro en su «Caja y corte» (D.1 de la 2.4), y dos copias de la
 * misma cuenta de dinero son dos cuentas que un día dicen cosas distintas: aquí está una.
 *
 * Centavos como TEXTO: el dinero no pasa por punto flotante en el navegador. La coma es
 * siempre el decimal —«12,50», doce pesos con cincuenta—, un importe admite hasta siete
 * cifras de pesos, uno vacío es cero y uno mal escrito es `null`.
 */

/** Forma de un importe tecleado. Sin `Number` ni `parseFloat` de por medio. */
const IMPORTE_CON_FORMA = /^\d{1,7}(?:[.,]\d{1,2})?$/;

export function aCentavos(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '') return 0;
  if (!IMPORTE_CON_FORMA.test(limpio)) return null;
  const [enteros = '0', decimales = ''] = limpio.split('.');
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
}

/** Lo que viaja a `caja.movimiento` por un retiro. */
export interface RetiroAEnviar {
  readonly tipo: 'retiro';
  /** Negativo: sale del cajón. */
  readonly montoCentavos: number;
  readonly motivo: string;
}

/**
 * El retiro listo para mandarse, o por qué no se manda.
 *
 * Un retiro sin motivo es la única salida de dinero que puede esconder un faltante: no se
 * guarda sin explicación (el servidor pide tres letras, y aquí se dice antes).
 */
export function retiroParaEnviar(
  importe: string,
  motivo: string,
): { readonly cuerpo: RetiroAEnviar } | { readonly tropiezo: string } {
  const centavos = aCentavos(importe);
  if (centavos === null || centavos === 0) return { tropiezo: 'Pon cuánto se retira.' };
  if (motivo.trim().length < 3) return { tropiezo: 'Escribe a dónde va ese dinero.' };
  return { cuerpo: { tipo: 'retiro', montoCentavos: -centavos, motivo: motivo.trim() } };
}
