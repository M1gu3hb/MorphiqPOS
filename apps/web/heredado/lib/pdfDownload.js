'use client';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Genera un Blob PDF a partir de un nodo HTML, paginándolo correctamente
 * en formato A4 vertical. Funciona offline y NO usa window.print().
 */
export async function generatePDFBlobFromNode(node, { scale = 2 } = {}) {
  if (!node) throw new Error('Nodo no encontrado para generar PDF');

  const canvas = await html2canvas(node, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: node.scrollWidth,
  });

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = pdf.internal.pageSize.getWidth(); // 210
  const pageHeight = pdf.internal.pageSize.getHeight(); // 297
  const margin = 8;
  const usableW = pageWidth - margin * 2;
  const usableH = pageHeight - margin * 2;

  const imgW = usableW;
  const imgH = (canvas.height * imgW) / canvas.width;

  if (imgH <= usableH) {
    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      margin,
      margin,
      imgW,
      imgH,
      undefined,
      'FAST',
    );
  } else {
    // Paginar: por cada página tomamos una "rebanada" del canvas
    const pxPerMm = canvas.width / imgW;
    const pageHeightPx = usableH * pxPerMm;
    let y = 0;
    while (y < canvas.height) {
      const sliceHeight = Math.min(pageHeightPx, canvas.height - y);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const ctx = pageCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      const sliceImgH = sliceHeight / pxPerMm;
      if (y > 0) pdf.addPage();
      pdf.addImage(
        pageCanvas.toDataURL('image/png'),
        'PNG',
        margin,
        margin,
        imgW,
        sliceImgH,
        undefined,
        'FAST',
      );
      y += sliceHeight;
    }
  }

  return pdf.output('blob');
}

/** Descarga un Blob como archivo */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

/** Sanitiza string para nombre de archivo */
export function safeFileName(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/**
 * Pipeline simple: genera y descarga el PDF de un nodo.
 */
export async function downloadNodeAsPDF(node, filename) {
  const blob = await generatePDFBlobFromNode(node);
  downloadBlob(blob, filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
  return blob;
}
