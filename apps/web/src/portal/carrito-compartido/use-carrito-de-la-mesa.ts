'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  agregarAlCarrito,
  enviarElCarrito,
  leerElCarrito,
  quitarDelCarrito,
} from './api-del-carrito';
import {
  dispositivoDelTelefono,
  envioDeOtroTelefono,
  type EstadoDelCarrito,
  type ItemDelCarrito,
  type ResultadoDelEnvio,
} from './carrito-de-la-mesa';

/** Cada cuánto mira el teléfono el carrito de su mesa. */
const SONDEO_MS = 2_500;

export interface CarritoDeLaMesa {
  /** `null` mientras carga, o si el negocio no acepta pedidos desde el teléfono. */
  readonly estado: EstadoDelCarrito | null;
  agregar(item: ItemDelCarrito): Promise<void>;
  quitar(lineaId: string): Promise<void>;
  enviar(datos: {
    readonly confirmado: boolean;
    readonly notaGeneral: string;
  }): Promise<ResultadoDelEnvio>;
}

/**
 * EL CARRITO DE LA MESA en un teléfono (DP-9.5): lo mira cada 2.5 s (y con eso late), y cuando
 * otro teléfono lo manda, avisa «Pedido enviado».
 */
export function useCarritoDeLaMesa(token: string, activo: boolean): CarritoDeLaMesa {
  const [dispositivo] = useState(() =>
    typeof window === 'undefined' ? '' : dispositivoDelTelefono(),
  );
  const clienteDeConsultas = useQueryClient();
  const clave = ['carrito_de_la_mesa', token];
  const consulta = useQuery({
    queryKey: clave,
    queryFn: () => leerElCarrito(token, dispositivo),
    enabled: activo && dispositivo !== '' && token !== '',
    refetchInterval: SONDEO_MS,
    staleTime: SONDEO_MS / 2,
  });
  const rondaVista = useRef<number | null>(null);
  const estado = consulta.data ?? null;

  useEffect(() => {
    if (estado === null) return;
    if (envioDeOtroTelefono(rondaVista.current, estado)) {
      toast.success('Pedido enviado: la cocina ya lo tiene. Pueden seguir pidiendo.');
    }
    rondaVista.current = estado.ronda;
  }, [estado]);

  const poner = (nuevo: EstadoDelCarrito) => {
    clienteDeConsultas.setQueryData(clave, nuevo);
  };

  return {
    estado,
    async agregar(item) {
      poner(await agregarAlCarrito(token, dispositivo, item));
    },
    async quitar(lineaId) {
      poner(await quitarDelCarrito(token, dispositivo, lineaId));
    },
    async enviar(datos) {
      const resultado = await enviarElCarrito(token, dispositivo, datos);
      rondaVista.current = resultado.ronda;
      await clienteDeConsultas.invalidateQueries({ queryKey: clave });
      return resultado;
    },
  };
}
