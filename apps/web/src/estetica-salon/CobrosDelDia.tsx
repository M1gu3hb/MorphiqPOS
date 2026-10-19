'use client';

import {
  Aviso,
  Dinero,
  EsqueletoDeLista,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { ReceiptText } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import type { HojaDelServidor } from '~/corte/hoja';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * LOS COBROS DEL DÍA, uno por uno (§4.3.8; C.10 de la 2.4).
 *
 * La caja del salón enseñaba el resumen del día y el arqueo, y «el detalle de cada cobro
 * vive en el histórico de citas» — donde no estaba: no había dónde ver qué se cobró, a
 * quién y con qué. Es la hoja del corte (`caja.hoja_del_corte`), la misma del PDF: si el
 * cajón no cuadra, se busca aquí el cobro que falta antes de cerrar, no después.
 */

type CobroDelDia = HojaDelServidor['ventas'][number];

function hora(iso: string | null): string {
  if (iso === null) return '—';
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export function CobrosDelDia({
  sesionCajaId,
  lectura,
}: {
  readonly sesionCajaId: string;
  /** Sube cuando algo cambió la caja: se vuelve a leer. */
  readonly lectura: number;
}) {
  const voc = useVocabulario();
  const [cobros, setCobros] = useState<readonly CobroDelDia[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    const control = new AbortController();
    invocarComando<HojaDelServidor>(
      '/api/caja/hoja-del-corte',
      { sesionCajaId },
      { signal: control.signal },
    )
      .then((hoja) => {
        if (!control.signal.aborted) setCobros(hoja.ventas);
      })
      .catch((error: unknown) => {
        if (control.signal.aborted) return;
        setFallo(error instanceof ErrorApi ? error.message : 'No se pudieron leer los cobros.');
      });
    return () => {
      control.abort();
    };
  }, [sesionCajaId, lectura]);

  const columnas: readonly ColumnaDeTabla<CobroDelDia>[] = [
    {
      clave: 'hora',
      titulo: 'Hora',
      orden: (c) => c.cobradaEn ?? '',
      celda: (c) => <span className="font-numeros tabular-nums">{hora(c.cobradaEn)}</span>,
    },
    {
      clave: 'quien',
      titulo: voc.titulo('cliente'),
      celda: (c) => (
        <span className="flex flex-col">
          <span className="font-medium">{c.cliente ?? c.nombrePedido ?? 'Sin nombre'}</span>
          <span className="text-xs text-texto-sutil">{c.productos ?? ''}</span>
        </span>
      ),
    },
    { clave: 'pago', titulo: 'Pago', desde: 'sm', celda: (c) => c.pago ?? '—' },
    { clave: 'atendio', titulo: 'Atendió', desde: 'md', celda: (c) => c.atendio ?? '—' },
    {
      clave: 'total',
      titulo: 'Total',
      numerica: true,
      orden: (c) => Number(c.totalCentavos),
      celda: (c) => <Dinero centavos={Number(c.totalCentavos)} tamano="sm" />,
    },
  ];

  return (
    <section aria-labelledby="cobros-del-dia-titulo" className="flex flex-col gap-(--espacio-3)">
      <h2 id="cobros-del-dia-titulo" className="font-semibold">
        Los cobros, uno por uno
      </h2>
      {fallo !== null ? (
        <Aviso tono="atencion" titulo="No se pudieron leer los cobros del día.">
          {fallo} El resumen y el arqueo de al lado no dependen de esta lista.
        </Aviso>
      ) : cobros === null ? (
        <EsqueletoDeLista filas={4} />
      ) : (
        <Tabla
          etiqueta="Cobros del día"
          columnas={columnas}
          filas={cobros}
          claveDe={(c) => `${c.folio ?? ''}-${c.cobradaEn ?? ''}-${c.totalCentavos}`}
          alto="max-h-96"
          vacio={
            <Vacio
              icono={<ReceiptText />}
              titulo="Todavía no hay cobros hoy."
              explicacion="Cada cita que se cobra aparece aquí con su hora, quién la pagó y cómo."
            />
          }
        />
      )}
    </section>
  );
}
