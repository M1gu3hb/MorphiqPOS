/**
 * LO QUE EL REGISTRO DE CORTES DICE DE CADA CORTE (día completo del restaurante, 2.4).
 *
 * `00-FICHA` §3, 00:15: el dueño lee el corte en el teléfono, de noche y cansado, y «si necesita
 * zoom para encontrar el faltante, está mal hecho». El histórico de Registros enseñaba, por
 * cada corte, lo que se contó, quién cerró y un folio —el número a secas, `1`— mientras el PDF
 * que el mismo dueño tiene en la mano dice `CC-1`; y de la DIFERENCIA, que es lo único que
 * busca con la vista, ni una palabra: el puente la sirve (`diferencia_al_cerrar`) y la tabla no
 * la pintaba. Aquí se decide cómo se dice, igual que en el histórico de la tienda.
 *
 * Son funciones puras: lo que la pantalla pinta con ellas se prueba sin navegador.
 */

export type SentidoDeLaDiferencia = 'cuadra' | 'sobra' | 'falta';

/** La palabra de cada sentido. El color nunca viaja solo: la palabra siempre está. */
export const PALABRA_DE_LA_DIFERENCIA: Readonly<Record<SentidoDeLaDiferencia, string>> = {
  cuadra: 'Cuadra',
  sobra: 'Sobra',
  falta: 'Falta',
};

export function sentidoDeLaDiferencia(centavos: number): SentidoDeLaDiferencia {
  if (centavos === 0) return 'cuadra';
  return centavos > 0 ? 'sobra' : 'falta';
}

/**
 * Los importes del puente llegan en PESOS y la pantalla trabaja en centavos enteros. Se cuentan
 * dígitos y no se multiplica: `58.995 * 100` pierde medio centavo.
 */
export function aCentavos(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const importe = Number(valor);
  if (!Number.isFinite(importe)) return null;
  const [entero = '0', decimal = '00'] = Math.abs(importe).toFixed(2).split('.');
  return (importe < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

export interface DiferenciaDelCorte {
  readonly sentido: SentidoDeLaDiferencia;
  /** Sin signo: el signo ya lo dice la palabra. */
  readonly centavos: number;
}

/**
 * La diferencia que el corte guardó al cerrar. `null`: ese corte no la guardó —los cierres
 * anteriores a que se escribiera—, y la pantalla lo dice en vez de inventar un «cuadra».
 */
export function diferenciaDelCorte(valor: unknown): DiferenciaDelCorte | null {
  const centavos = aCentavos(valor);
  if (centavos === null) return null;
  return { sentido: sentidoDeLaDiferencia(centavos), centavos: Math.abs(centavos) };
}

/**
 * El folio como se LEE: la serie y el consecutivo, `CC-1` —así lo dice el PDF del corte— o
 * `LIQ-000001` —así lo dice el aviso de una liquidación—. Con `cifras` el consecutivo se
 * rellena de ceros. Sin consecutivo no hay folio que leer; sin serie, el número como viene.
 */
export function folioConSerie(serie: unknown, folio: unknown, cifras = 0): string | null {
  if (typeof folio !== 'string' && typeof folio !== 'number') return null;
  const consecutivo = String(folio).trim();
  if (consecutivo === '') return null;
  const relleno = consecutivo.padStart(cifras, '0');
  if (typeof serie !== 'string' || serie.trim() === '') return relleno;
  return `${serie.trim()}-${relleno}`;
}
