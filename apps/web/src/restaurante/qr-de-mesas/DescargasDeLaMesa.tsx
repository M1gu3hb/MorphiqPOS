'use client';

import type { ImagenLogo } from '@morphiqpos/domain/qr';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Aviso } from '@morphiqpos/ui/sistema';
import { Download, FileDown } from 'lucide-react';
import { useState } from 'react';

import { descargarPdfDeLasMesas, descargarQrDeLaMesa, type MesaParaImprimir } from './imprimir';

type Formato = 'png' | 'svg' | 'pdf';

/**
 * Las descargas de UNA mesa (DP-9.8): PNG y SVG a su tamaño en milímetros, y un PDF carta con
 * esa sola mesa para imprimirla a su medida. Antes de cada una se revisa que se lea.
 */
export function DescargasDeLaMesa({
  mesa,
  logo,
}: {
  readonly mesa: MesaParaImprimir;
  readonly logo: ImagenLogo | null;
}) {
  const [haciendo, setHaciendo] = useState<Formato | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  const bajar = async (formato: Formato) => {
    setHaciendo(formato);
    setFallo(null);
    try {
      if (formato === 'pdf') {
        await descargarPdfDeLasMesas([mesa], logo, undefined, `QR-Mesa-${String(mesa.numero)}.pdf`);
      } else {
        await descargarQrDeLaMesa(mesa, logo, formato);
      }
    } catch (error: unknown) {
      setFallo(error instanceof Error ? error.message : 'No se pudo descargar el QR.');
    } finally {
      setHaciendo(null);
    }
  };

  const boton = (formato: Formato, texto: string) => (
    <Button
      variant="outline"
      className="gap-2"
      disabled={haciendo !== null}
      onClick={() => void bajar(formato)}
    >
      {formato === 'pdf' ? (
        <FileDown className="size-4" aria-hidden />
      ) : (
        <Download className="size-4" aria-hidden />
      )}
      {haciendo === formato ? 'Revisando…' : texto}
    </Button>
  );

  return (
    <div className="col-span-2 flex flex-col gap-(--espacio-2)">
      <div className="grid grid-cols-3 gap-(--espacio-2)">
        {boton('png', 'PNG')}
        {boton('svg', 'SVG')}
        {boton('pdf', 'PDF')}
      </div>
      <p className="text-xs text-texto-sutil">
        A {String(mesa.diseno.tamanoMm)} mm de ancho. Cada descarga revisa antes que el QR se lea.
      </p>
      {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
    </div>
  );
}
