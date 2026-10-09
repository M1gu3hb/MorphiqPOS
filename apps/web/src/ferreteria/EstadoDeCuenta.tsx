'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Aviso,
  Dinero,
  EsqueletoDeLista,
  Tabla,
  Vacio,
  dineroEnTexto,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { FileText, Send } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

import { estadoEnTexto, vencimiento, whatsappDe } from './cuenta-del-cliente.ts';

/**
 * EL ESTADO DE CUENTA, que es el documento que se manda (F-612; C.10 de la 2.4).
 *
 * `credito.estado_cuenta` existía con su ruta y ninguna pantalla lo pedía: la cabecera
 * de Cuentas lo daba por «fuera». Aquí se lee en la ficha del cliente —cada documento
 * con su saldo y sus días— y se manda por WhatsApp ESCRITO Y SIN MANDAR, como el pedido
 * al proveedor: el sistema redacta, la persona manda.
 */

interface Renglon {
  readonly documentoId: string;
  readonly folio: string;
  readonly emitidoEn: string;
  readonly venceEn: string;
  readonly saldoCentavos: string;
  readonly diasVencidos: number;
}

interface Estado {
  readonly renglones: readonly Renglon[];
  readonly totalCentavos: string;
  readonly vencidoCentavos: string;
  readonly limiteCentavos: string;
  readonly disponibleCentavos: string;
  readonly bloqueado: boolean;
}

const FECHA = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

export function EstadoDeCuenta({
  clienteId,
  nombre,
  telefono,
}: {
  readonly clienteId: string;
  readonly nombre: string;
  readonly telefono: string | null;
}) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    const control = new AbortController();
    invocarComando<Estado>('/api/credito/estado-cuenta', { clienteId }, { signal: control.signal })
      .then((leido) => {
        if (!control.signal.aborted) setEstado(leido);
      })
      .catch((error: unknown) => {
        if (control.signal.aborted) return;
        setFallo(
          error instanceof ErrorApi ? error.error.mensaje : 'No se pudo leer el estado de cuenta.',
        );
      });
    return () => {
      control.abort();
    };
  }, [clienteId]);

  const columnas: readonly ColumnaDeTabla<Renglon>[] = [
    {
      clave: 'folio',
      titulo: 'Folio',
      celda: (r) => <span className="font-numeros">{r.folio}</span>,
    },
    {
      clave: 'vence',
      titulo: 'Vence',
      celda: (r) => (
        <span className={r.diasVencidos > 0 ? 'font-semibold text-peligro' : 'text-texto-sutil'}>
          {FECHA.format(new Date(r.venceEn))} · {vencimiento(r.diasVencidos)}
        </span>
      ),
    },
    {
      clave: 'saldo',
      titulo: 'Saldo',
      numerica: true,
      celda: (r) => <Dinero centavos={Number(r.saldoCentavos)} tamano="sm" />,
    },
  ];

  if (fallo !== null) {
    return (
      <Aviso tono="peligro" titulo="No se pudo leer el estado de cuenta.">
        {fallo}
      </Aviso>
    );
  }
  if (estado === null) return <EsqueletoDeLista filas={3} />;

  const aWhatsapp = whatsappDe(telefono);

  return (
    <section aria-labelledby={`estado-${clienteId}`} className="flex flex-col gap-(--espacio-2)">
      <h3
        id={`estado-${clienteId}`}
        className="flex items-center gap-(--espacio-2) text-sm font-semibold"
      >
        <FileText aria-hidden="true" className="size-4 shrink-0" />
        Estado de cuenta
      </h3>
      <p className="text-sm">
        Debe <Dinero centavos={Number(estado.totalCentavos)} tamano="sm" /> · vencido{' '}
        <Dinero centavos={Number(estado.vencidoCentavos)} tamano="sm" /> · disponible{' '}
        <Dinero centavos={Number(estado.disponibleCentavos)} tamano="sm" />
        {estado.bloqueado ? ' · bloqueado por mora' : ''}
      </p>
      <Tabla
        etiqueta={`Estado de cuenta de ${nombre}`}
        columnas={columnas}
        filas={estado.renglones}
        claveDe={(r) => r.documentoId}
        alto="max-h-[30vh]"
        vacio={
          <Vacio
            titulo="No debe nada."
            explicacion="Sin documentos abiertos: no hay estado que mandar."
          />
        }
      />
      {estado.renglones.length > 0 && (
        <Button asChild variant="outline" size="sm">
          <a
            href={`https://wa.me/${aWhatsapp}?text=${encodeURIComponent(estadoEnTexto(nombre, estado, (c) => dineroEnTexto(c)))}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Send aria-hidden="true" />
            {aWhatsapp === '' ? 'Mandar por WhatsApp (elige a quién)' : 'Mandar por WhatsApp'}
          </a>
        </Button>
      )}
    </section>
  );
}
