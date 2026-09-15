'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { useState } from 'react';

import { invocarComando } from '~/cliente/api';

/**
 * F-328 y F-329 · La fila de barra, y el llamado por nombre.
 *
 * ── Por qué una cafetería no tiene mesas y sí tiene fila ─────────────────
 * El cliente paga, se hace a un lado y espera de pie. No hay mesa que mirar:
 * lo que hay es una fila de pedidos pagados que todavía no se entregan, y si el
 * barista no la ve, la bebida se queda en la barra hasta que alguien pregunta.
 *
 * ── El nombre, grande, y no el folio ─────────────────────────────────────
 * Se grita «¡Ana!», no «¡pedido 4821!». El nombre es lo primero de cada tarjeta
 * y lo más grande de la pantalla por eso: es el dato que se usa en voz alta, a
 * tres metros, con la máquina de espresso encendida.
 *
 * ── Y el reloj arranca al COBRAR ─────────────────────────────────────────
 * No al preparar. El cliente empieza a esperar cuando paga, y medir desde que
 * la comanda llega a barra diría que esperó menos de lo que esperó — que es
 * exactamente el número que no sirve para nada.
 *
 * ── Por qué este componente es NUEVO y no una edición ────────────────────
 * D-09: no se modifica un archivo que ya existía en `apps/web/heredado/`. Esto
 * vive al lado; el enganche es una línea y está anotado en el `FILE-MAP.md`.
 */

export interface PedidoEnFila {
  readonly id: string;
  /** La etiqueta que se grita. NO es el nombre del cliente de la ficha. */
  readonly nombrePedido: string;
  readonly folio: string;
  /** Desde que PAGÓ, no desde que la comanda llegó a barra. */
  readonly minutosEsperando: number;
  readonly llamado: boolean;
  readonly resumen: string;
}

export interface FilaDeBarraProps {
  readonly pedidos: readonly PedidoEnFila[];
  readonly onCambio: () => void;
}

/**
 * Cuándo una espera deja de ser normal.
 *
 * Cinco minutos es el umbral del giro: por encima, el cliente ya miró el reloj.
 * No es un color decorativo — es el orden en que el barista tiene que trabajar.
 */
const MINUTOS_DE_AVISO = 5;

export function FilaDeBarra({ pedidos, onCambio }: FilaDeBarraProps) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ejecutar(ruta: string, pedidoId: string, cuerpo: unknown): Promise<void> {
    setOcupado(pedidoId);
    setError(null);
    try {
      await invocarComando(ruta, cuerpo);
      onCambio();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo completar la acción.');
    } finally {
      setOcupado(null);
    }
  }

  if (pedidos.length === 0) {
    return (
      <p className="p-6 text-center text-muted-foreground">No hay nada esperando en la barra.</p>
    );
  }

  return (
    <div className="space-y-3">
      {error !== null && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pedidos.map((pedido) => {
          const tarde = pedido.minutosEsperando >= MINUTOS_DE_AVISO;
          return (
            <li
              key={pedido.id}
              className={[
                'rounded-lg border p-4',
                tarde ? 'border-destructive bg-destructive/10' : 'border-border bg-card',
              ].join(' ')}
            >
              {/* El nombre primero y más grande que todo lo demás: es lo que se
                  grita a tres metros con la máquina encendida. */}
              <p className="text-2xl font-bold text-card-foreground">{pedido.nombrePedido}</p>
              <p className="text-sm text-muted-foreground">{pedido.resumen}</p>

              <div className="mt-2 flex items-center justify-between gap-2">
                <Badge variant={tarde ? 'destructive' : 'secondary'}>
                  {pedido.minutosEsperando} min
                </Badge>
                <span className="text-xs text-muted-foreground">{pedido.folio}</span>
              </div>

              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant={pedido.llamado ? 'outline' : 'default'}
                  disabled={ocupado === pedido.id}
                  onClick={() =>
                    void ejecutar('/api/cafeteria/llamar', pedido.id, {
                      pedidoId: pedido.id,
                      medio: 'pantalla',
                    })
                  }
                >
                  {pedido.llamado ? 'Volver a llamar' : 'Llamar'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={ocupado === pedido.id}
                  onClick={() =>
                    void ejecutar('/api/cafeteria/entregar', pedido.id, { pedidoId: pedido.id })
                  }
                >
                  Entregado
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
