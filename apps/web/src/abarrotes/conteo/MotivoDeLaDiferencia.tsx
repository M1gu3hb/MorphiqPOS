'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import { History } from 'lucide-react';
import { useEffect, useState } from 'react';

import { invocarComando } from '~/cliente/api';

/**
 * EL MOTIVO DE CADA DIFERENCIA, y su kardex (C.10 de la 2.4).
 *
 * Todas las diferencias de la zona se cerraban con el motivo de omisión: la leche caducada,
 * el frasco roto y lo que de verdad falta quedaban juntos como «diferencia de conteo», y el
 * reporte de merma no podía separar lo que se echó a perder de lo que se fue por la puerta.
 * Ahora cada renglón que no cuadró elige el suyo —de los motivos del tronco y del giro— y el
 * de omisión se queda para lo que nadie sabe explicar. Nunca «robo» por omisión: acusar sin
 * prueba rompe una tienda.
 *
 * «Ver kardex» abre la ficha del producto en su historia: de dónde salió el esperado.
 */

export interface MotivoDeMerma {
  readonly clave: string;
  readonly etiqueta: string;
}

/** Los motivos del negocio, leídos una vez para toda la tabla. */
export function useMotivosDeMerma(activo: boolean): readonly MotivoDeMerma[] {
  const [motivos, setMotivos] = useState<readonly MotivoDeMerma[]>([]);
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    invocarComando<{ motivos: readonly MotivoDeMerma[] }>('/api/inventario/motivos', {})
      .then((respuesta) => {
        if (vigente) setMotivos(respuesta.motivos);
      })
      // Sin la lista se cierra con el de omisión, como antes: no se pierde el conteo.
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [activo]);
  return motivos;
}

export function MotivoDeLaDiferencia({
  nombre,
  productoId,
  opciones,
  elegido,
  onElegir,
}: {
  readonly nombre: string;
  readonly productoId: string | null | undefined;
  readonly opciones: readonly MotivoDeMerma[];
  readonly elegido: string;
  readonly onElegir: (clave: string) => void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-(--espacio-2)">
      {opciones.length === 0 ? null : (
        <Select value={elegido} onValueChange={onElegir}>
          <SelectTrigger className="min-w-44" aria-label={`Motivo de la diferencia de ${nombre}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opciones.map((motivo) => (
              <SelectItem key={motivo.clave} value={motivo.clave}>
                {motivo.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {productoId === null || productoId === undefined ? null : (
        <a
          className="inline-flex items-center gap-(--espacio-1) text-sm text-texto-sutil underline-offset-2 hover:underline"
          href={`/abarrotes/producto?producto=${encodeURIComponent(productoId)}#kardex`}
        >
          <History aria-hidden="true" className="size-4" />
          Ver kardex<span className="sr-only"> de {nombre}</span>
        </a>
      )}
    </span>
  );
}
