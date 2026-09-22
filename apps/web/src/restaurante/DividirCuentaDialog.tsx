'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@morphiqpos/ui/primitivas/dialog';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { useMemo, useState } from 'react';

import { invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * F-321 · Dividir la cuenta.
 *
 * ── Por qué este componente es NUEVO y no una edición ────────────────────
 * D-09: mientras Codex trabaje en `apps/web/heredado/` no se modifica un
 * archivo que ya existía ahí. Esto vive al lado, en `apps/web/src/`, donde el
 * sistema de diseño sí vigila los literales; el enganche es **una línea** y está
 * anotada en el `FILE-MAP.md` del modelo.
 *
 * ── La regla que la pantalla tiene que hacer obvia ───────────────────────
 * Lo que se reparte son UNIDADES, no importes. El comensal dice «yo pago mis
 * dos cervezas», no «yo pago $195». Si la pantalla pidiera importes, el mesero
 * tendría que hacer la cuenta de memoria y el servidor tendría que confiar en
 * ella — y ahí es donde una división deja de cuadrar contra la cuenta madre.
 *
 * El servidor calcula los totales de cada parte. Esta pantalla no suma dinero
 * en ningún sitio: sólo cuenta unidades y enseña cuántas faltan por repartir.
 *
 * ── Y por qué el botón se queda apagado hasta que cuadra ─────────────────
 * Es fricción deliberada, la misma que el desglose del pago mixto. Una división
 * con unidades sin repartir es una cuenta madre con sobrante que nadie va a
 * cobrar, y se descubre al cierre.
 */

export interface LineaParaDividir {
  readonly id: string;
  readonly nombre: string;
  /** Unidades enteras. Una línea de 2.5 kg no se divide por unidades. */
  readonly cantidad: number;
}

export interface DividirCuentaDialogProps {
  readonly abierto: boolean;
  readonly ordenId: string;
  readonly lineas: readonly LineaParaDividir[];
  readonly onCerrar: () => void;
  readonly onDividida: (partes: number) => void;
}

interface Parte {
  /** `lineaId` → cuántas unidades se lleva esta parte. */
  readonly tomas: Readonly<Record<string, number>>;
}

const MAXIMO_PARTES = 8;

export function DividirCuentaDialog({
  abierto,
  ordenId,
  lineas,
  onCerrar,
  onDividida,
}: DividirCuentaDialogProps) {
  const voc = useVocabulario();
  const [partes, setPartes] = useState<readonly Parte[]>([{ tomas: {} }, { tomas: {} }]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendientes = useMemo(() => contarPendientes(lineas, partes), [lineas, partes]);
  const faltanPorRepartir = useMemo(
    () => Object.values(pendientes).reduce((a, n) => a + n, 0),
    [pendientes],
  );

  function mover(indiceParte: number, lineaId: string, delta: number): void {
    setPartes((previas) =>
      previas.map((parte, i) => {
        if (i !== indiceParte) return parte;
        const actual = parte.tomas[lineaId] ?? 0;
        const siguiente = actual + delta;
        // No se puede tomar de menos que cero ni más de lo que queda sin
        // repartir: la pantalla no deja construir una división que el servidor
        // va a rechazar.
        if (siguiente < 0) return parte;
        if (delta > 0 && (pendientes[lineaId] ?? 0) <= 0) return parte;
        return { tomas: { ...parte.tomas, [lineaId]: siguiente } };
      }),
    );
  }

  async function dividir(): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      await invocarComando('/api/restaurante/dividir-cuenta', {
        ordenId,
        // Sólo unidades. El importe de cada parte lo calcula el servidor, y el
        // nombre del campo es el que el comando declara: `particiones`, con
        // `cantidad` por línea.
        particiones: partes.map((parte) => ({
          tomas: Object.entries(parte.tomas)
            .filter(([, cantidad]) => cantidad > 0)
            .map(([lineaId, cantidad]) => ({ lineaId, cantidad })),
        })),
      });
      onDividida(partes.length);
      onCerrar();
    } catch (fallo) {
      setError(
        fallo instanceof Error ? fallo.message : `No se pudo dividir ${voc.enFrase('orden')}.`,
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (!v) onCerrar();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Dividir {voc.enFrase('orden')}</DialogTitle>
          <DialogDescription>
            Reparte {voc.enFrase('linea_orden', true)} entre {voc.enFrase('orden', true)}. Los
            totales los calcula el sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-(--espacio-4) md:grid-cols-2">
          {partes.map((parte, indice) => (
            <section
              key={indice}
              className="rounded-lg border border-border bg-card p-(--espacio-3) text-card-foreground"
            >
              <Label className="mb-2 block font-semibold">Cuenta {indice + 1}</Label>
              <ul className="space-y-1">
                {lineas.map((linea) => (
                  <li key={linea.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{linea.nombre}</span>
                    <span className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="outline"
                        aria-label={`Quitar ${linea.nombre} de la cuenta ${String(indice + 1)}`}
                        onClick={() => {
                          mover(indice, linea.id, -1);
                        }}
                      >
                        −
                      </Button>
                      <Input
                        readOnly
                        className="w-10 text-center"
                        value={parte.tomas[linea.id] ?? 0}
                        aria-label={`Unidades de ${linea.nombre} en la cuenta ${String(indice + 1)}`}
                      />
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="outline"
                        aria-label={`Añadir ${linea.nombre} a la cuenta ${String(indice + 1)}`}
                        onClick={() => {
                          mover(indice, linea.id, 1);
                        }}
                      >
                        +
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-between gap-(--espacio-3) text-sm">
          <Button
            type="button"
            variant="ghost"
            disabled={partes.length >= MAXIMO_PARTES}
            onClick={() => {
              setPartes((p) => [...p, { tomas: {} }]);
            }}
          >
            Añadir {voc.enFraseCon('otro', 'orden')}
          </Button>
          {/* El contador de lo que falta: es lo que explica por qué el botón
              de dividir está apagado. Un botón inerte sin motivo es la forma
              más rápida de que alguien cierre el diálogo y cobre mal. */}
          <span
            className={
              faltanPorRepartir === 0 ? 'text-muted-foreground' : 'font-medium text-destructive'
            }
          >
            {faltanPorRepartir === 0
              ? 'Todo repartido'
              : `Faltan ${String(faltanPorRepartir)} por repartir`}
          </span>
        </div>

        {error !== null && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={faltanPorRepartir !== 0 || enviando}
            onClick={() => {
              void dividir();
            }}
          >
            {enviando ? 'Dividiendo…' : 'Dividir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Cuántas unidades de cada línea siguen sin asignarse a ninguna parte. */
export function contarPendientes(
  lineas: readonly LineaParaDividir[],
  partes: readonly Parte[],
): Readonly<Record<string, number>> {
  const pendientes: Record<string, number> = {};
  for (const linea of lineas) {
    const repartidas = partes.reduce((a, parte) => a + (parte.tomas[linea.id] ?? 0), 0);
    pendientes[linea.id] = linea.cantidad - repartidas;
  }
  return pendientes;
}
