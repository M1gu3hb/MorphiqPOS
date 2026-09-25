'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Aviso,
  Cifra,
  Dinero,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Coffee, MessageCircle, Stamp } from 'lucide-react';
import { useEffect, useState } from 'react';

import { invocarComando } from '~/cliente/api';

import { enlaceDeWhatsApp, mensajeDeRegreso } from './programa-de-sellos.ts';

/**
 * EL PROGRAMA, EN SUS TRES CIFRAS (`04-INTERFAZ` de cafetería · Clientes y sellos, C.10 de la
 * 2.4): «1 el pasivo · 2 los que están por canjear · 3 los inactivos».
 *
 * El pasivo va arriba y en una sola cifra porque es lo único del módulo que dispara una
 * decisión de la dueña: si la promoción se sostiene o se estira a nueve sellos. «A un sello»
 * dice a quién decirle «te falta uno» cuando pase. Y «no vienen hace 21 días» dice a quién
 * mandarle un mensaje: el sistema lo REDACTA y la dueña lo manda desde su WhatsApp, como el
 * fiado de la tienda — un mensaje automático a la vecina rompe lo que sostiene el negocio.
 */

interface ClienteDelPrograma {
  readonly clienteId: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly sellos: number;
  readonly diasSinVenir: number | null;
}

interface Programa {
  readonly sellosPorPremio: number;
  readonly sellosVivos: number;
  readonly clientesConSaldo: number;
  readonly pasivoCentavos: string;
  readonly aUnSello: readonly ClienteDelPrograma[];
  readonly inactivos: readonly ClienteDelPrograma[];
}

export function ProgramaDeSellos() {
  const [programa, setPrograma] = useState<Programa | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    invocarComando<Programa>('/api/lealtad/programa', {})
      .then((leido) => {
        if (vigente) setPrograma(leido);
      })
      .catch((error: unknown) => {
        if (vigente)
          setFallo(error instanceof Error ? error.message : 'No se pudo leer el programa.');
      });
    return () => {
      vigente = false;
    };
  }, []);

  if (fallo !== null) {
    return (
      <Aviso tono="atencion" titulo="No se pudo leer el programa de sellos.">
        {fallo} La búsqueda por teléfono sigue funcionando.
      </Aviso>
    );
  }
  if (programa === null) return <EsqueletoDeLista filas={3} />;

  const columnasAUnSello: readonly ColumnaDeTabla<ClienteDelPrograma>[] = [
    {
      clave: 'nombre',
      titulo: 'Cliente',
      celda: (c) => <span className="font-medium">{c.nombre}</span>,
    },
    {
      clave: 'sellos',
      titulo: 'Sellos',
      numerica: true,
      celda: (c) => <Cifra valor={c.sellos} tamano="sm" />,
    },
  ];

  const columnasInactivos: readonly ColumnaDeTabla<ClienteDelPrograma>[] = [
    {
      clave: 'nombre',
      titulo: 'Cliente',
      celda: (c) => <span className="font-medium">{c.nombre}</span>,
    },
    {
      clave: 'dias',
      titulo: 'Sin venir',
      numerica: true,
      celda: (c) => <Cifra valor={c.diasSinVenir} unidad="días" tamano="sm" />,
    },
    {
      clave: 'mensaje',
      titulo: 'Mensaje',
      celda: (c) => {
        const enlace = enlaceDeWhatsApp(c.telefono, mensajeDeRegreso(c, programa.sellosPorPremio));
        return enlace === null ? (
          <span className="text-xs text-texto-sutil">sin teléfono</span>
        ) : (
          <Button asChild size="sm" variant="outline">
            <a href={enlace} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden="true" />
              Mandar mensaje<span className="sr-only"> a {c.nombre}</span>
            </a>
          </Button>
        );
      },
    },
  ];

  return (
    <section aria-labelledby="programa-titulo" className="flex flex-col gap-(--espacio-3)">
      <h2 id="programa-titulo" className="sr-only">
        El programa de sellos
      </h2>
      <Superficie
        nivel={2}
        relleno={4}
        className="flex flex-wrap items-baseline gap-x-(--espacio-4) gap-y-(--espacio-1)"
      >
        <p className="text-sm text-texto-sutil">Lo que debe el programa</p>
        <p className="flex flex-wrap items-baseline gap-x-(--espacio-2) text-xl font-bold">
          <Cifra valor={programa.sellosVivos} unidad="sellos pendientes" />
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-baseline gap-(--espacio-1)">
            <Dinero centavos={Number(programa.pasivoCentavos)} /> si se canjean todos
          </span>
        </p>
        <p className="w-full text-xs text-texto-sutil">
          {programa.clientesConSaldo} clientes con saldo · el premio a los{' '}
          {programa.sellosPorPremio} sellos, al costo del último canje.
        </p>
      </Superficie>

      <div className="grid gap-(--espacio-3) lg:grid-cols-2">
        <Superficie relleno={3} className="flex flex-col gap-(--espacio-2)">
          <h3 className="flex items-center gap-(--espacio-2) text-base font-semibold">
            <Stamp aria-hidden="true" className="size-4 text-texto-sutil" />A un sello del premio (
            {programa.aUnSello.length})
          </h3>
          <Tabla
            etiqueta="A un sello del premio"
            columnas={columnasAUnSello}
            filas={programa.aUnSello}
            claveDe={(c) => c.clienteId}
            alto="max-h-64"
            vacio={<Vacio icono={<Stamp />} titulo="Nadie está a un sello." />}
          />
        </Superficie>
        <Superficie relleno={3} className="flex flex-col gap-(--espacio-2)">
          <h3 className="flex items-center gap-(--espacio-2) text-base font-semibold">
            <Coffee aria-hidden="true" className="size-4 text-texto-sutil" />
            No vienen hace 21 días ({programa.inactivos.length})
          </h3>
          <Tabla
            etiqueta="No vienen hace 21 días"
            columnas={columnasInactivos}
            filas={programa.inactivos}
            claveDe={(c) => c.clienteId}
            alto="max-h-64"
            vacio={<Vacio icono={<Coffee />} titulo="Todos siguen viniendo." />}
          />
        </Superficie>
      </div>
    </section>
  );
}
