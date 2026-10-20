'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Aviso, Superficie } from '@morphiqpos/ui/sistema';
import { ConciergeBell } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';

import {
  descripcionDeLosListos,
  nombresQueYaSalieron,
  platillosListos,
  type ComandaLeida,
  type PlatilloListo,
} from './listos-de-la-mesa.ts';

/**
 * «LISTOS PARA RECOGER» de la mesa activa (día completo del restaurante, 2.4).
 *
 * `04-INTERFAZ` lo pone arriba de todo —«es información que caduca»— y la pantalla lo recibía
 * por props que ninguna página pasaba, así que no se pintaba nunca y el mesero tenía que irse
 * a la pantalla heredada de «Meseros» para saber que su plato salió. Aquí la mesa LEE las
 * comandas de su cuenta cada pocos segundos —la cocina marca desde otra pantalla— y ofrece lo
 * único que se hace con un plato en la ventana: entregarlo.
 *
 * ── Entregar es un comando, no una marca en pantalla ─────────────────────────
 * `restaurante.entregar_pedidos` mueve las comandas LISTAS de la cuenta a `entregado` y sólo
 * esas: no toca lo que cocina aún prepara. La clave de idempotencia la pone `invocarComando`
 * (la misma ruta con el mismo cuerpo conserva la clave), así que un doble toque no entrega
 * dos veces.
 *
 * ── Un fallo de lectura no vacía lo que ya se ve ─────────────────────────────
 * Se conserva lo último que se leyó y se DICE que no se pudo releer: un plato en la ventana
 * que desaparece de la pantalla por un corte de red de un segundo es un plato frío.
 */

const CADA_CUANTO_SE_RELEE = 4_000;

export interface ListosDeLaCuenta {
  /** Lo que espera en la ventana, platillo por platillo. */
  readonly listos: readonly PlatilloListo[];
  /** Lo que ya salió de cocina —listo o entregado—: el insumo ya se gastó. */
  readonly yaSalieron: ReadonlySet<string>;
  readonly entregando: boolean;
  /** Por qué no se pudo entregar, o `null`. */
  readonly falloDeEntrega: string | null;
  /** Por qué no se pudo leer, o `null`. */
  readonly falloDeLectura: string | null;
  readonly entregar: () => void;
}

const NADA: ReadonlySet<string> = new Set();

/**
 * Las comandas de una cuenta, releídas mientras la pantalla está abierta. Sin cuenta (mesa
 * libre) no lee nada. `desactivado` es para las pruebas de la pantalla, que le pasan los
 * listos ya armados y no quieren red.
 */
export function useListosDeLaCuenta(
  ordenId: string | null,
  desactivado: boolean,
): ListosDeLaCuenta {
  const [comandas, setComandas] = useState<readonly ComandaLeida[]>([]);
  const [falloDeLectura, setFalloDeLectura] = useState<string | null>(null);
  const [falloDeEntrega, setFalloDeEntrega] = useState<string | null>(null);
  const [entregando, setEntregando] = useState(false);
  /** Una lectura a la vez: si la anterior sigue en vuelo, la que toca se salta. */
  const enVuelo = useRef(false);

  const leer = useCallback(
    async (senal: AbortSignal): Promise<void> => {
      if (ordenId === null || enVuelo.current) return;
      enVuelo.current = true;
      try {
        const filas = await consultarPuente<ComandaLeida>('PedidoPreparacion', {
          filtro: { venta_id: ordenId },
          limite: 20,
          signal: senal,
        });
        if (senal.aborted) return;
        setComandas(filas);
        setFalloDeLectura(null);
      } catch (fallo: unknown) {
        // Un aborto no es un error: es esta misma pantalla, que ya no está.
        if (senal.aborted) return;
        setFalloDeLectura(
          fallo instanceof Error ? fallo.message : 'No se pudo leer lo que cocina tiene listo.',
        );
      } finally {
        enVuelo.current = false;
      }
    },
    [ordenId],
  );

  useEffect(() => {
    if (desactivado || ordenId === null) return;
    const control = new AbortController();
    // La primera lectura va en el siguiente tick y no en el cuerpo del efecto: una lectura que
    // escribe estado a media sincronía encadena un render extra en cada montaje.
    const primera = setTimeout(() => {
      void leer(control.signal);
    });
    const reloj = setInterval(() => {
      void leer(control.signal);
    }, CADA_CUANTO_SE_RELEE);
    return () => {
      clearTimeout(primera);
      clearInterval(reloj);
      control.abort();
    };
  }, [desactivado, ordenId, leer]);

  const entregar = useCallback((): void => {
    if (ordenId === null) return;
    setEntregando(true);
    setFalloDeEntrega(null);
    invocarComando('/api/restaurante/entregar-pedidos', { ordenId })
      .then(async () => {
        // Se relee en seguida: lo entregado se va de la ventana sin esperar al reloj.
        await leer(new AbortController().signal);
      })
      .catch((fallo: unknown) => {
        setFalloDeEntrega(
          fallo instanceof ErrorApi ? fallo.message : 'No se pudo marcar como entregado.',
        );
      })
      .finally(() => {
        setEntregando(false);
      });
  }, [ordenId, leer]);

  const sinCuenta = ordenId === null || desactivado;
  return {
    listos: sinCuenta ? [] : platillosListos(comandas),
    yaSalieron: sinCuenta ? NADA : nombresQueYaSalieron(comandas),
    entregando,
    falloDeEntrega,
    falloDeLectura,
    entregar,
  };
}

export interface ListosParaRecogerProps {
  readonly listos: readonly PlatilloListo[];
  readonly entregando: boolean;
  readonly falloDeEntrega: string | null;
  readonly falloDeLectura: string | null;
  readonly alEntregar: () => void;
}

/** El bloque, o nada: sin platillos en la ventana ocupa el lugar del catálogo. */
export function ListosParaRecoger(props: ListosParaRecogerProps) {
  const { listos, entregando, falloDeEntrega, falloDeLectura, alEntregar } = props;
  if (listos.length === 0 && falloDeEntrega === null && falloDeLectura === null) return null;
  const unidades = listos.reduce((suma, platillo) => suma + platillo.cantidad, 0);
  return (
    <Superficie
      como="section"
      nivel={0}
      radio="md"
      relleno={3}
      aria-label="Listos para recoger"
      className="flex flex-col gap-(--espacio-2) border-acento bg-acento-suave text-acento-suave-texto"
    >
      {/* El texto va en `acento-suave-texto`, el par del tinte: `text-acento` sobre
          `bg-acento-suave` no llega a 4.5:1 en `noche` ni en `bloque`. */}
      {listos.length > 0 ? (
        <>
          <h2 className="flex items-center gap-(--espacio-2) text-xs font-bold uppercase">
            <ConciergeBell aria-hidden="true" className="size-4" />
            Listos para recoger ({unidades})
          </h2>
          <p className="text-sm font-medium">{descripcionDeLosListos(listos)}</p>
          <Button size="sm" className="self-start" cargando={entregando} onClick={alEntregar}>
            Marcar entregado
          </Button>
        </>
      ) : null}
      {falloDeEntrega === null ? null : (
        <Aviso tono="peligro" titulo={falloDeEntrega}>
          No se marcó nada como entregado: lo de la ventana sigue ahí.
        </Aviso>
      )}
      {falloDeLectura === null ? null : (
        <Aviso tono="atencion" titulo={falloDeLectura}>
          Se muestra lo último que se leyó de cocina.
        </Aviso>
      )}
    </Superficie>
  );
}
