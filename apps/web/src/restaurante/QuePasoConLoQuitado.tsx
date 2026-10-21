'use client';

import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import { useEffect, useRef, useState } from 'react';

import { invocarComando } from '~/cliente/api';

import {
  MOTIVO_DEL_CONTEO,
  motivosDeMermaParaBajar,
  type MotivoDeMerma,
} from './ajuste-de-inventario.ts';

/**
 * ¿QUÉ PASÓ CON LO QUE SE QUITA DE LA ALACENA? (día completo del restaurante, 2.4).
 *
 * Quitar existencia puede ser dos cosas que el dueño necesita ver separadas: que el conteo
 * encontró de menos (se cuenta, se corrige) o que algo SE PERDIÓ —se cayó, caducó, se
 * quemó—, que es merma y cuesta dinero. Esta pieza deja elegir cuál es, con los motivos de la
 * tabla del negocio (`motivos_merma`): nadie teclea «caducó» y «caducado» como si fueran
 * cosas distintas.
 *
 * Los motivos se leen UNA vez, y sólo cuando alguien empieza a quitar: una alta no los
 * necesita, y no todos los roles que leen la alacena pueden pedirlos.
 */

export interface LecturaDeMotivos {
  readonly motivos: readonly MotivoDeMerma[];
  readonly fallo: boolean;
}

const SIN_LEER: LecturaDeMotivos = { motivos: [], fallo: false };

/** Los motivos de merma del negocio, leídos la primera vez que hacen falta. */
export function useMotivosDeMerma(hacenFalta: boolean): LecturaDeMotivos {
  const [lectura, setLectura] = useState<LecturaDeMotivos>(SIN_LEER);
  // Una sola lectura por pantalla, aunque quien quita cambie de renglón o cancele: lo que
  // cambia al desmontar es si hay a quién contestarle, no si se vuelve a pedir.
  const pedidos = useRef(false);
  const montada = useRef(true);
  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
    };
  }, []);
  useEffect(() => {
    if (!hacenFalta || pedidos.current) return;
    pedidos.current = true;
    invocarComando<{ readonly motivos: readonly MotivoDeMerma[] }>('/api/inventario/motivos', {})
      .then((respuesta) => {
        if (montada.current) setLectura({ motivos: respuesta.motivos, fallo: false });
      })
      .catch(() => {
        // Sin la lista no se pierde el ajuste: queda el conteo, que no necesita motivo de
        // merma, y la pieza lo dice en vez de esconder la opción.
        if (montada.current) setLectura({ motivos: [], fallo: true });
      });
  }, [hacenFalta]);
  return lectura;
}

export function QuePasoConLoQuitado({
  id,
  nombre,
  elegido,
  lectura,
  onElegir,
}: {
  readonly id: string;
  readonly nombre: string;
  /** La clave elegida; `ajuste_conteo` si es un conteo. */
  readonly elegido: string;
  readonly lectura: LecturaDeMotivos;
  readonly onElegir: (clave: string) => void;
}) {
  const merma = motivosDeMermaParaBajar(lectura.motivos);
  return (
    <span className="flex flex-col gap-(--espacio-1)">
      <Label htmlFor={id} className="text-xs">
        Qué pasó con lo que se quita
      </Label>
      <Select value={elegido} onValueChange={onElegir}>
        <SelectTrigger id={id} aria-label={`Qué pasó con lo que se quita de ${nombre}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={MOTIVO_DEL_CONTEO}>Corrección de conteo</SelectItem>
          {merma.map((motivo) => (
            <SelectItem key={motivo.clave} value={motivo.clave}>
              Merma · {motivo.etiqueta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {lectura.fallo ? (
        <span className="text-xs text-texto-sutil">
          No se pudieron leer los motivos de merma: por ahora sólo se corrige el conteo.
        </span>
      ) : null}
    </span>
  );
}
