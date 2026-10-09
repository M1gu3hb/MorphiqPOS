import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';

/**
 * EL SEMÁFORO DEL ARQUEO del cierre del restaurante: la palabra, la forma y el tinte de
 * «cuadra», «se fue poco» y «se fue mucho». Vivía en `CierreDiario.tsx`, que pasaba de las
 * 800 líneas; sale aquí tal cual (día completo del restaurante, 2.4).
 */

/** Por debajo de esto el descuadre es «se me fue un peso»; por encima, no. */
const TOLERANCIA_CENTAVOS = 2000;

/** Los tres tonos del arqueo: cuadra, se fue poco, se fue mucho. */
export type TonoDelArqueo = 'exito' | 'atencion' | 'peligro';

export interface Semaforo {
  readonly texto: string;
  readonly tono: TonoDelArqueo;
}

/** Dice la PALABRA además del color: el color nunca viaja solo. */
export function semaforoDe(diferencia: number): Semaforo {
  if (diferencia === 0) return { texto: 'Cuadra exacto', tono: 'exito' };
  const falta = diferencia < 0;
  if (Math.abs(diferencia) <= TOLERANCIA_CENTAVOS) {
    return { texto: falta ? 'Falta poco' : 'Sobra poco', tono: 'atencion' };
  }
  const texto = falta ? 'FALTA dinero en el cajón' : 'SOBRA dinero en el cajón';
  return { texto, tono: 'peligro' };
}

/** El tinte de la caja de cada tono: el fondo y el borde, nunca solos. */
export const TINTE_DEL_TONO: Readonly<Record<TonoDelArqueo, string>> = {
  exito: 'border-exito/50 bg-exito/10',
  atencion: 'border-advertencia/60 bg-advertencia/15',
  peligro: 'border-peligro/50 bg-peligro/10',
};

/**
 * El icono de cada tono. Es la FORMA del estado —círculo, triángulo, octágono—,
 * así que el semáforo se lee también sin color.
 */
export function IconoDelTono({ tono }: { readonly tono: TonoDelArqueo }) {
  if (tono === 'exito') {
    return <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-exito" />;
  }
  if (tono === 'atencion') {
    return <TriangleAlert aria-hidden="true" className="size-5 shrink-0 text-advertencia" />;
  }
  return <OctagonAlert aria-hidden="true" className="size-5 shrink-0 text-peligro" />;
}
