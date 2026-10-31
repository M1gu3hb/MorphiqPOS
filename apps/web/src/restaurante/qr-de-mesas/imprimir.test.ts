import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DISENO_POR_OMISION } from './diseno';

const revisar = vi.hoisted(() =>
  vi.fn<(svg: string, esperado: string) => Promise<{ legible: boolean; fallidas: string[] }>>(),
);
const bajar = vi.hoisted(() => vi.fn<(archivo: Blob, nombre: string) => void>());
const pdf = vi.hoisted(() => vi.fn(() => Promise.resolve(new Blob(['%PDF']))));
const png = vi.hoisted(() => vi.fn(() => Promise.resolve(new Blob(['png']))));

vi.mock('./comprobar-lectura', () => ({ comprobarLectura: revisar }));
vi.mock('./exportar', () => ({
  descargar: bajar,
  pdfDeLasPiezas: pdf,
  pngDeLaPieza: png,
  svgParaImprimir: (svg: string) => new Blob([svg]),
}));

const { QrQueNoSeLee, descargarPdfDeLasMesas, descargarQrDeLaMesa } = await import('./imprimir');

const mesa = (numero: number) => ({
  numero,
  contenido: `https://pos.ejemplo.mx/qr/token-de-la-mesa-${String(numero)}-xxxxxxxxxxxx`,
  diseno: DISENO_POR_OMISION,
});

describe('sólo se imprime lo que se lee', () => {
  beforeEach(() => {
    revisar.mockReset();
    bajar.mockReset();
    pdf.mockClear();
  });

  it('cada QR se revisa contra la dirección de SU mesa', async () => {
    revisar.mockResolvedValue({ legible: true, fallidas: [] });
    await descargarPdfDeLasMesas([mesa(1), mesa(2)], null);
    expect(revisar.mock.calls.map(([, esperado]) => esperado)).toEqual([
      mesa(1).contenido,
      mesa(2).contenido,
    ]);
    expect(bajar).toHaveBeenCalledOnce();
    expect(bajar.mock.calls[0]?.[1]).toBe('QR-de-las-mesas.pdf');
  });

  it('si una mesa no se lee, no sale el PDF de ninguna y se dice cuál y en qué prueba', async () => {
    revisar
      .mockResolvedValueOnce({ legible: true, fallidas: [] })
      .mockResolvedValueOnce({ legible: false, fallidas: ['pequeño', 'girado 3°'] });
    const intento = descargarPdfDeLasMesas([mesa(1), mesa(7)], null);
    await expect(intento).rejects.toBeInstanceOf(QrQueNoSeLee);
    await expect(intento).rejects.toThrow(/mesa 7 \(pequeño, girado 3°\)/);
    expect(pdf).not.toHaveBeenCalled();
    expect(bajar).not.toHaveBeenCalled();
  });

  it('el PNG o SVG de una mesa que no se lee tampoco sale', async () => {
    revisar.mockResolvedValue({ legible: false, fallidas: ['tal cual'] });
    await expect(descargarQrDeLaMesa(mesa(3), null, 'png')).rejects.toThrow(/mesa 3/);
    await expect(descargarQrDeLaMesa(mesa(3), null, 'svg')).rejects.toThrow(/mesa 3/);
    expect(bajar).not.toHaveBeenCalled();
  });

  it('el que se lee sale con el nombre de su mesa', async () => {
    revisar.mockResolvedValue({ legible: true, fallidas: [] });
    await descargarQrDeLaMesa(mesa(4), null, 'svg');
    expect(bajar.mock.calls[0]?.[1]).toBe('QR-Mesa-4.svg');
  });
});
