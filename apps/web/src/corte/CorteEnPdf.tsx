'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Aviso, Esqueleto, Superficie } from '@morphiqpos/ui/sistema';
import { Download, FileText } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ErrorApi, invocarComando } from '~/cliente/api';

import { documentoDelCorte } from './giros.ts';
import { HojaDelCorte } from './HojaDelCorte.tsx';
import type { DocumentoDelCorte, HojaDelServidor } from './hoja.ts';

/**
 * EL PDF DEL CORTE, al cerrar (F-234, C.6 de la 2.4).
 *
 * Lee `caja.hoja_del_corte`, arma el documento de ESTE giro y lo pinta fuera de pantalla
 * para que `generatePDFBlobFromNode` —el de Miguel, `heredado/lib/pdfDownload.js`— lo
 * capture. Se descarga solo si el negocio no apagó `descargar_pdf_corte_auto`: el dueño lo
 * manda al contador desde el coche, y un documento que hay que ir a buscar no se lee. El
 * botón queda siempre, para volverlo a bajar o para reintentar si el navegador lo bloqueó.
 *
 * Un fallo al leer NO produce archivo: un PDF con totales en cero guardado en el disco del
 * negocio como si fuera el corte es peor que ninguno (la misma regla del de Miguel).
 */

type Estado =
  | { readonly paso: 'leyendo' }
  | {
      readonly paso: 'listo';
      readonly documento: DocumentoDelCorte;
      readonly descargarSolo: boolean;
    }
  | { readonly paso: 'fallo'; readonly mensaje: string };

const FUERA_DE_PANTALLA = {
  position: 'fixed',
  left: '-10000px',
  top: 0,
  width: '210mm',
  zIndex: -1,
} as const;

async function descargar(nodo: HTMLElement, nombre: string): Promise<void> {
  // Import dinámico: html2canvas y jsPDF pesan, y sólo hacen falta al descargar.
  const { downloadNodeAsPDF } = (await import('@/lib/pdfDownload')) as {
    downloadNodeAsPDF: (nodo: HTMLElement, nombre: string) => Promise<Blob>;
  };
  await downloadNodeAsPDF(nodo, nombre);
}

export interface CorteEnPdfProps {
  readonly sesionCajaId: string;
  /**
   * `false` apaga la descarga sola aunque el negocio la tenga encendida: la pantalla del
   * restaurante tiene su propio interruptor al cerrar. Por omisión, manda la perilla.
   */
  readonly descargarAlCerrar?: boolean;
}

export function CorteEnPdf({ sesionCajaId, descargarAlCerrar = true }: CorteEnPdfProps) {
  const [estado, setEstado] = useState<Estado>({ paso: 'leyendo' });
  const [descargando, setDescargando] = useState(false);
  const [descargado, setDescargado] = useState(false);
  const [falloAlDescargar, setFalloAlDescargar] = useState<string | null>(null);
  const [generadoEn] = useState(() => new Date());
  const nodo = useRef<HTMLDivElement>(null);
  const yaSeBajoSolo = useRef(false);

  useEffect(() => {
    const control = new AbortController();
    invocarComando<HojaDelServidor>(
      '/api/caja/hoja-del-corte',
      { sesionCajaId },
      { signal: control.signal },
    )
      .then((hoja) => {
        if (control.signal.aborted) return;
        setEstado({
          paso: 'listo',
          documento: documentoDelCorte(hoja),
          descargarSolo: hoja.negocio.descargarAlCerrar,
        });
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return;
        setEstado({
          paso: 'fallo',
          mensaje: fallo instanceof ErrorApi ? fallo.message : 'No se pudo leer el corte.',
        });
      });
    return () => {
      control.abort();
    };
  }, [sesionCajaId]);

  async function bajar(documento: DocumentoDelCorte): Promise<void> {
    if (nodo.current === null) return;
    setDescargando(true);
    setFalloAlDescargar(null);
    try {
      await descargar(nodo.current, documento.nombreDeArchivo);
      setDescargado(true);
    } catch {
      setFalloAlDescargar('El navegador no dejó generar el PDF. Vuelve a intentarlo con el botón.');
    } finally {
      setDescargando(false);
    }
  }

  const bajarSolo = useEffectEvent((documento: DocumentoDelCorte) => {
    void bajar(documento);
  });

  // La descarga sola, UNA vez, cuando la hoja ya está pintada fuera de pantalla.
  useEffect(() => {
    if (estado.paso !== 'listo' || !estado.descargarSolo || !descargarAlCerrar) return;
    if (yaSeBajoSolo.current) return;
    yaSeBajoSolo.current = true;
    const documento = estado.documento;
    const espera = setTimeout(() => {
      bajarSolo(documento);
    }, 300);
    return () => {
      clearTimeout(espera);
    };
  }, [estado, descargarAlCerrar]);

  if (estado.paso === 'fallo') {
    return (
      <Aviso tono="peligro" titulo="No se pudo armar el PDF del corte">
        {estado.mensaje} La caja sí se cerró; el corte queda en el historial.
      </Aviso>
    );
  }

  return (
    <Superficie
      como="section"
      aria-label="PDF del corte"
      relleno={3}
      className="flex flex-col gap-(--espacio-2) sm:flex-row sm:items-center sm:justify-between"
    >
      {estado.paso === 'leyendo' ? (
        // La forma de la línea que viene, no una rueda: al llegar la hoja nada salta.
        <div
          role="status"
          aria-label="Armando el PDF del corte"
          className="flex items-center gap-(--espacio-2)"
        >
          <FileText aria-hidden="true" className="text-texto-sutil" />
          <Esqueleto className="h-4 w-56" />
        </div>
      ) : (
        <p className="flex items-center gap-(--espacio-2) text-sm">
          <FileText aria-hidden="true" className="text-texto-sutil" />
          {descargado
            ? `PDF del corte ${estado.documento.folio} descargado.`
            : `PDF del corte ${estado.documento.folio} listo.`}
        </p>
      )}
      <Button
        variant="outline"
        disabled={estado.paso !== 'listo' || descargando}
        cargando={descargando}
        onClick={() => {
          if (estado.paso === 'listo') void bajar(estado.documento);
        }}
      >
        <Download aria-hidden="true" />
        Descargar el PDF del corte
      </Button>
      {falloAlDescargar === null ? null : (
        <Aviso tono="peligro" titulo="No se descargó el PDF">
          {falloAlDescargar}
        </Aviso>
      )}
      {estado.paso === 'listo'
        ? createPortal(
            <div style={FUERA_DE_PANTALLA} aria-hidden="true">
              <HojaDelCorte ref={nodo} documento={estado.documento} generadoEn={generadoEn} />
            </div>,
            document.body,
          )
        : null}
    </Superficie>
  );
}
