import { imagenDelSvg } from './comprobar-lectura';
import { acomodarEnHojas, altoEnMm, pxDeMm, svgEnMm } from './medidas';

/**
 * LA EXPORTACIÓN PARA IMPRIMIR (DP-9.8): PNG y SVG de una mesa a su tamaño en milímetros, y un
 * PDF tamaño carta con todas las mesas. Quien llama ya comprobó que cada QR se lee: aquí sólo se
 * dibuja a la medida.
 *
 * El PDF lleva cada pieza como imagen a 300 ppp (nítida al imprimir) con `jspdf`, que ya usaba
 * el corte de caja; se carga sólo al exportar.
 */

export interface PiezaParaImprimir {
  readonly svg: string;
  readonly numero: number;
  readonly anchoMm: number;
  /** Sin marco, la pieza lleva debajo «Mesa N» para saber de cuál es al recortarla. */
  readonly conPie: boolean;
}

/** El SVG dibujado en un lienzo de `anchoPx`, conservando su proporción. */
async function lienzoDelSvg(svg: string, anchoPx: number): Promise<HTMLCanvasElement> {
  const imagen = await imagenDelSvg(svg);
  const lienzo = document.createElement('canvas');
  lienzo.width = anchoPx;
  lienzo.height = Math.round((anchoPx * imagen.naturalHeight) / imagen.naturalWidth);
  const ctx = lienzo.getContext('2d');
  if (ctx === null) throw new Error('Este navegador no pudo dibujar el QR. Prueba con SVG.');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  return lienzo;
}

export async function pngDeLaPieza(svg: string, anchoMm: number): Promise<Blob> {
  const lienzo = await lienzoDelSvg(svg, pxDeMm(anchoMm));
  return new Promise((resolver, rechazar) => {
    lienzo.toBlob((blob) => {
      if (blob === null) rechazar(new Error('No se pudo armar la imagen.'));
      else resolver(blob);
    }, 'image/png');
  });
}

export function svgParaImprimir(svg: string, anchoMm: number): Blob {
  return new Blob([svgEnMm(svg, anchoMm)], { type: 'image/svg+xml;charset=utf-8' });
}

/** Lo que cabe debajo de una pieza sin marco para saber de qué mesa es al recortarla. */
const PIE_MM = 5;

/**
 * Todas las mesas en hojas carta. Cada pieza sale a SU tamaño; la cuadrícula toma la celda de la
 * más grande y centra las demás en la suya.
 */
export async function pdfDeLasPiezas(piezas: readonly PiezaParaImprimir[]): Promise<Blob> {
  if (piezas.length === 0) throw new Error('No hay mesas que imprimir.');
  const medidas = piezas.map((p) => ({
    ancho: p.anchoMm,
    alto: altoEnMm(p.svg, p.anchoMm) + (p.conPie ? PIE_MM : 0),
  }));
  const celda = {
    ancho: Math.max(...medidas.map((m) => m.ancho)),
    alto: Math.max(...medidas.map((m) => m.alto)),
  };
  const lugares = acomodarEnHojas(piezas.length, celda.ancho, celda.alto);
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  let hoja = 0;
  for (const [i, pieza] of piezas.entries()) {
    const lugar = lugares[i];
    const medida = medidas[i];
    if (lugar === undefined || medida === undefined) continue;
    if (lugar.hoja > hoja) {
      pdf.addPage();
      hoja = lugar.hoja;
    }
    const x = lugar.x + (celda.ancho - medida.ancho) / 2;
    const y = lugar.y + (celda.alto - medida.alto) / 2;
    const alto = altoEnMm(pieza.svg, pieza.anchoMm);
    const lienzo = await lienzoDelSvg(pieza.svg, pxDeMm(pieza.anchoMm));
    pdf.addImage(lienzo, 'PNG', x, y, pieza.anchoMm, alto);
    if (pieza.conPie) {
      pdf.setFontSize(9);
      pdf.text(`Mesa ${String(pieza.numero)}`, x + pieza.anchoMm / 2, y + alto + 3.5, {
        align: 'center',
      });
    }
  }
  return pdf.output('blob');
}

/** Baja un archivo con el nombre dado. */
export function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // El navegador ya tomó el archivo; soltarlo en el siguiente turno no lo corta.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
