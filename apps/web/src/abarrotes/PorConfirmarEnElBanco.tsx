'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Aviso,
  Dinero,
  EsqueletoDeLista,
  Superficie,
  TablaAdaptable,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Landmark } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

/**
 * LO QUE SE ABONÓ Y TODAVÍA NO SE VE EN EL BANCO (auditoría de la 2.4).
 *
 * Un abono de fiado por transferencia o con cheque entra «por confirmar»: no baja la deuda
 * hasta que alguien mira el banco. La ferretería lo confirma desde su caja; la tienda no
 * tenía dónde, así que su abono por transferencia se quedaba pendiente para siempre y el
 * cliente seguía debiendo lo que ya pagó. Aquí se ve qué espera, de quién, desde cuándo, y
 * se confirma con un toque. Confirmar lo hace quien administra: el servidor lo exige.
 */

interface Pendiente {
  readonly pagoId: string;
  readonly clienteId: string;
  readonly montoCentavos: string;
  readonly referencia: string | null;
  readonly horasEsperando: number;
}

function mensajeDe(fallo: unknown, porDefecto: string): string {
  return fallo instanceof ErrorApi ? fallo.error.mensaje : porDefecto;
}

export function PorConfirmarEnElBanco({
  nombreDe,
  alConfirmar,
}: {
  /** El nombre del cliente por su id, de la cartera que ya está en pantalla. */
  readonly nombreDe: (clienteId: string) => string;
  readonly alConfirmar: () => void;
}) {
  const [pendientes, setPendientes] = useState<readonly Pendiente[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  useEffect(() => {
    const control = new AbortController();
    invocarComando<{ readonly pendientes: readonly Pendiente[] }>(
      '/api/credito/transferencias-pendientes',
      { horas: 720 },
      { signal: control.signal },
    )
      .then((salida) => {
        if (!control.signal.aborted) setPendientes(salida.pendientes);
      })
      .catch((error: unknown) => {
        if (!control.signal.aborted) {
          setFallo(mensajeDe(error, 'No se pudo leer lo que está por confirmar.'));
        }
      });
    return () => {
      control.abort();
    };
  }, []);

  function confirmar(pendiente: Pendiente): void {
    setConfirmando(pendiente.pagoId);
    setFallo(null);
    invocarComando('/api/credito/confirmar-transferencia', {
      pagoId: pendiente.pagoId,
      referenciaBancaria: null,
    })
      .then(() => {
        setPendientes((previos) => (previos ?? []).filter((p) => p.pagoId !== pendiente.pagoId));
        alConfirmar();
      })
      .catch((error: unknown) => {
        setFallo(mensajeDe(error, 'No se pudo confirmar.'));
      })
      .finally(() => {
        setConfirmando(null);
      });
  }

  const columnas: readonly ColumnaDeTabla<Pendiente>[] = [
    {
      clave: 'cliente',
      titulo: 'Cliente',
      orden: (p) => nombreDe(p.clienteId),
      celda: (p) => nombreDe(p.clienteId),
    },
    {
      clave: 'monto',
      titulo: 'Abonó',
      numerica: true,
      orden: (p) => Number(p.montoCentavos),
      celda: (p) => <Dinero centavos={Number(p.montoCentavos)} tamano="sm" />,
    },
    {
      clave: 'espera',
      titulo: 'Esperando',
      numerica: true,
      orden: (p) => p.horasEsperando,
      celda: (p) =>
        p.horasEsperando < 24
          ? `${String(p.horasEsperando)} h`
          : `${String(Math.floor(p.horasEsperando / 24))} d`,
    },
    {
      clave: 'accion',
      titulo: 'Banco',
      celda: (p) => (
        <Button
          type="button"
          size="sm"
          variant="outline"
          cargando={confirmando === p.pagoId}
          disabled={confirmando !== null}
          aria-label={`Ya se ve en el banco el abono de ${nombreDe(p.clienteId)}`}
          onClick={() => {
            confirmar(p);
          }}
        >
          Ya está en el banco
        </Button>
      ),
    },
  ];

  if (pendientes !== null && pendientes.length === 0 && fallo === null) return null;

  return (
    <Superficie
      como="section"
      aria-labelledby="por-confirmar"
      relleno={4}
      radio="md"
      className="flex flex-col gap-(--espacio-3)"
    >
      <h2 id="por-confirmar" className="font-semibold">
        Abonos por confirmar en el banco
      </h2>
      {fallo === null ? null : (
        <Aviso tono="peligro" titulo={fallo}>
          La deuda no baja hasta que el abono se confirma.
        </Aviso>
      )}
      {pendientes === null ? (
        fallo === null ? (
          <EsqueletoDeLista filas={2} />
        ) : null
      ) : (
        <TablaAdaptable
          etiqueta="Abonos por confirmar"
          principal="cliente"
          desde="md"
          columnas={columnas}
          filas={pendientes}
          claveDe={(p) => p.pagoId}
          vacio={
            <Vacio
              icono={<Landmark />}
              titulo="Nada por confirmar."
              explicacion="Los abonos por transferencia o con cheque aparecen aquí hasta que se ven en el banco."
            />
          }
        />
      )}
    </Superficie>
  );
}
