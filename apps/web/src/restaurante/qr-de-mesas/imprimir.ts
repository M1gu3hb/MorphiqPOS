import type { ImagenLogo } from '@morphiqpos/domain/qr';

import { comprobarLectura } from './comprobar-lectura';
import type { DisenoDeQr } from './diseno';
import {
  descargar,
  pdfDeLasPiezas,
  pngDeLaPieza,
  svgParaImprimir,
  type PiezaParaImprimir,
} from './exportar';
import { svgDeLaPieza } from './pieza';

/**
 * IMPRIMIR SÓLO LO QUE SE LEE (DP-9.8). Cada QR se revisa antes de salir —PNG, SVG o el PDF de
 * todas las mesas—; si uno no se lee, no sale ninguno y se dice cuál falló y en qué prueba.
 */

export interface MesaParaImprimir {
  readonly numero: number;
  /** La dirección de la mesa con su token: lo que dice el QR, siempre la misma. */
  readonly contenido: string;
  readonly diseno: DisenoDeQr;
}

export interface NoSeLee {
  readonly numero: number;
  readonly fallidas: readonly string[];
}

export class QrQueNoSeLee extends Error {
  constructor(readonly noSeLeen: readonly NoSeLee[]) {
    super(
      `No se lee el QR de ${noSeLeen.map((m) => `la mesa ${String(m.numero)} (${m.fallidas.join(', ')})`).join('; ')}: cambia su diseño antes de imprimir.`,
    );
    this.name = 'QrQueNoSeLee';
  }
}

async function revisadas(
  mesas: readonly MesaParaImprimir[],
  logo: ImagenLogo | null,
  alAvanzar: (hechas: number, total: number) => void,
): Promise<PiezaParaImprimir[]> {
  const piezas: PiezaParaImprimir[] = [];
  const noSeLeen: NoSeLee[] = [];
  for (const [i, mesa] of mesas.entries()) {
    alAvanzar(i, mesas.length);
    const svg = svgDeLaPieza({ ...mesa, logo });
    const { legible, fallidas } = await comprobarLectura(svg, mesa.contenido);
    if (!legible) noSeLeen.push({ numero: mesa.numero, fallidas });
    piezas.push({
      svg,
      numero: mesa.numero,
      anchoMm: mesa.diseno.tamanoMm,
      conPie: mesa.diseno.marco === null,
    });
  }
  alAvanzar(mesas.length, mesas.length);
  if (noSeLeen.length > 0) throw new QrQueNoSeLee(noSeLeen);
  return piezas;
}

export async function descargarPdfDeLasMesas(
  mesas: readonly MesaParaImprimir[],
  logo: ImagenLogo | null,
  alAvanzar: (hechas: number, total: number) => void = () => undefined,
  nombre = 'QR-de-las-mesas.pdf',
): Promise<void> {
  const piezas = await revisadas(mesas, logo, alAvanzar);
  descargar(await pdfDeLasPiezas(piezas), nombre);
}

export async function descargarQrDeLaMesa(
  mesa: MesaParaImprimir,
  logo: ImagenLogo | null,
  formato: 'png' | 'svg',
): Promise<void> {
  const [pieza] = await revisadas([mesa], logo, () => undefined);
  if (pieza === undefined) return;
  const nombre = `QR-Mesa-${String(mesa.numero)}.${formato}`;
  const archivo =
    formato === 'png'
      ? await pngDeLaPieza(pieza.svg, pieza.anchoMm)
      : svgParaImprimir(pieza.svg, pieza.anchoMm);
  descargar(archivo, nombre);
}
