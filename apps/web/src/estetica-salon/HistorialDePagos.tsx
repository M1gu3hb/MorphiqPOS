'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Aviso,
  Dinero,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { ReceiptText } from 'lucide-react';
import { useEffect, useState } from 'react';

import { consultarPuente } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';

/**
 * PIEZA · estetica-salon · lo que la clienta ha pagado
 *
 * La columna derecha del cobro en PC (`04-INTERFAZ §4.3.4`): sus últimos pagos, con
 * fecha, folio, método y total. Sirve a la hora de cobrar —«la vez pasada pagó con
 * transferencia a la cuenta de Karla», «ya lleva tres tintes este trimestre»— y por
 * eso vive al lado del total y no en otra pantalla.
 *
 * Lee `Venta` del puente filtrada por la clienta: la misma fila que el corte, con el
 * total SIN propina (la propina no es del salón).
 */

/** Cuántos pagos: los que caben a la derecha del cobro sin desplazar. */
const PAGOS_A_LA_VISTA = 5;

export interface PagoDeLaClienta {
  readonly id: string;
  readonly folio: string | null;
  /** EN PESOS: el puente convierte `total_centavos` con `dinero`. Se lee con `centavosDe`. */
  readonly total: number | null;
  readonly metodo_pago: string | null;
  readonly fecha_cierre: string | null;
  readonly estado: string | null;
}

export interface HistorialDePagosProps {
  readonly clienteId: string;
  /** Cuando llega, no consulta: es lo que usan las pruebas. */
  readonly pagosIniciales?: readonly PagoDeLaClienta[];
}

const FECHA = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

const COLUMNAS: readonly ColumnaDeTabla<PagoDeLaClienta>[] = [
  {
    clave: 'fecha',
    titulo: 'Fecha',
    celda: (pago) => (pago.fecha_cierre === null ? '—' : FECHA.format(new Date(pago.fecha_cierre))),
  },
  { clave: 'metodo', titulo: 'Método', celda: (pago) => pago.metodo_pago ?? '—' },
  {
    clave: 'total',
    titulo: 'Total',
    numerica: true,
    celda: (pago) => (
      <Dinero centavos={centavosDe('Venta', 'total', pago.total) ?? 0} tamano="sm" />
    ),
  },
];

export function HistorialDePagos({ clienteId, pagosIniciales }: HistorialDePagosProps) {
  const [pagos, setPagos] = useState<readonly PagoDeLaClienta[] | null>(pagosIniciales ?? null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (pagosIniciales !== undefined) return;
    const control = new AbortController();
    consultarPuente<PagoDeLaClienta>('Venta', {
      filtro: { cliente_id: clienteId, estado: 'pagada' },
      orden: '-fecha_cierre',
      limite: PAGOS_A_LA_VISTA,
      signal: control.signal,
    })
      .then((filas) => {
        if (!control.signal.aborted) setPagos(filas);
      })
      .catch((error: unknown) => {
        if (control.signal.aborted) return;
        setFallo(error instanceof Error ? error.message : 'No se pudo leer lo que ha pagado.');
      });
    return () => {
      control.abort();
    };
  }, [clienteId, pagosIniciales, recarga]);

  return (
    <Superficie relleno={4} como="section" aria-label="Pagos anteriores de la clienta">
      <h2 className="mb-(--espacio-3) text-sm font-semibold">Lo que ha pagado</h2>
      {fallo !== null ? (
        // Adorno comparado con el cobro: si falla, se dice aquí y se cobra igual.
        <Aviso
          tono="atencion"
          titulo="No se pudo leer lo que ha pagado"
          accion={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFallo(null);
                setPagos(null);
                setRecarga((previa) => previa + 1);
              }}
            >
              Volver a intentar
            </Button>
          }
        >
          El cobro de hoy no depende de esto.
        </Aviso>
      ) : pagos === null ? (
        <EsqueletoDeLista filas={3} />
      ) : pagos.length === 0 ? (
        <Vacio
          icono={<ReceiptText />}
          titulo="Es su primer pago aquí."
          explicacion="Cuando pague, aquí aparecerán sus últimos cobros con fecha y método."
          className="py-0"
        />
      ) : (
        <Tabla
          etiqueta="Pagos anteriores"
          columnas={COLUMNAS}
          filas={pagos}
          claveDe={(pago) => pago.id}
        />
      )}
    </Superficie>
  );
}
