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
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';
import { useState } from 'react';

import { invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';
import type { Vocabulario } from '@morphiqpos/domain/vocabulario';

/**
 * F-324 · Anular una línea, con su motivo.
 *
 * ── Por qué el motivo NO es opcional ─────────────────────────────────────
 * Una línea que desaparece sin motivo es indistinguible de un robo. Los cuatro
 * motivos del giro no son burocracia: son lo que separa «la cocina se equivocó»
 * —que se mide y se corrige— de «el mesero lo canceló» —que se investiga— y de
 * «fue cortesía» —que sale del margen y tiene que verse en el corte—.
 *
 * ── Y por qué se enseña si el consumo SE PIERDE ──────────────────────────
 * Si el plato ya salió de cocina, el insumo ya se gastó: anular la línea no
 * devuelve el arrachera al refrigerador. La pantalla lo dice ANTES, con esas
 * palabras, porque quien anula tiene que saber que está decidiendo sobre
 * dinero que ya se fue y no sobre un renglón de una lista.
 *
 * ── Lo que este diálogo NO hace ──────────────────────────────────────────
 * No devuelve dinero. Anular una línea de una cuenta abierta no es una
 * devolución: eso es F-222, con su propio flujo de caja. Confundirlos es cómo
 * una cuenta ya cobrada se «corrige» sin que el cajón lo sepa.
 */

/**
 * Los cuatro del giro, con las palabras que usa quien anula.
 *
 * Es una FUNCIÓN y no una constante porque tres de los cuatro nombran una
 * entidad del diccionario —la preparación, el responsable, el cliente— y una
 * constante de módulo no puede llamar a un hook. Las claves NO se traducen:
 * viajan a la base.
 */
type ClaveMotivo = 'error_cocina' | 'error_mesero' | 'cortesia' | 'cliente_cambio';

function motivosDe(voc: Vocabulario): readonly { clave: ClaveMotivo; etiqueta: string }[] {
  return [
    { clave: 'error_cocina', etiqueta: `Se equivocó ${voc.enFrase('preparacion')}` },
    { clave: 'error_mesero', etiqueta: 'Me equivoqué al tomar la orden' },
    { clave: 'cortesia', etiqueta: 'Cortesía de la casa' },
    { clave: 'cliente_cambio', etiqueta: `${voc.conArticulo('cliente')} cambió de opinión` },
  ];
}

export interface AnularLineaDialogProps {
  readonly abierto: boolean;
  readonly ordenId: string;
  readonly lineaId: string;
  readonly nombreDelPlatillo: string;
  /** `true` cuando el platillo ya salió de cocina: el insumo ya se gastó. */
  readonly yaSePreparo: boolean;
  readonly onCerrar: () => void;
  readonly onAnulada: () => void;
}

export function AnularLineaDialog({
  abierto,
  ordenId,
  lineaId,
  nombreDelPlatillo,
  yaSePreparo,
  onCerrar,
  onAnulada,
}: AnularLineaDialogProps) {
  const voc = useVocabulario();
  const [motivo, setMotivo] = useState<ClaveMotivo | null>(null);
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function anular(): Promise<void> {
    if (motivo === null) return;
    setEnviando(true);
    setError(null);
    try {
      await invocarComando('/api/restaurante/anular-linea', {
        ordenId,
        lineaId,
        motivo,
        ...(nota.trim() === '' ? {} : { nota: nota.trim() }),
      });
      onAnulada();
      onCerrar();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo anular la línea.');
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quitar {nombreDelPlatillo}</DialogTitle>
          <DialogDescription>
            Hace falta decir por qué. Queda en el registro con tu nombre.
          </DialogDescription>
        </DialogHeader>

        {yaSePreparo && (
          /* El aviso va ARRIBA de los motivos, no debajo: quien anula tiene que
             leerlo antes de elegir, no después de haber decidido. */
          <p
            role="status"
            className="rounded-md border border-border bg-muted p-(--espacio-3) text-sm text-muted-foreground"
          >
            Este platillo ya salió de cocina: el insumo ya se gastó y no vuelve al almacén. La
            cuenta baja, el inventario no.
          </p>
        )}

        <fieldset className="space-y-2">
          <Label asChild>
            <legend className="font-semibold">Motivo</legend>
          </Label>
          {motivosDe(voc).map((opcion) => (
            <label
              key={opcion.clave}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-2 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <input
                type="radio"
                name="motivo-anulacion"
                value={opcion.clave}
                checked={motivo === opcion.clave}
                onChange={() => {
                  setMotivo(opcion.clave);
                }}
              />
              {opcion.etiqueta}
            </label>
          ))}
        </fieldset>

        <div className="space-y-1">
          <Label htmlFor="nota-anulacion">Nota (opcional)</Label>
          <Textarea
            id="nota-anulacion"
            value={nota}
            maxLength={200}
            onChange={(e) => {
              setNota(e.target.value);
            }}
            placeholder="Lo que haga falta para entenderlo dentro de un mes"
          />
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
          {/* `destructive` y no `default`: quitar algo de una cuenta abierta se
              parece más a borrar que a guardar, y el color tiene que decirlo. */}
          <Button
            type="button"
            variant="destructive"
            disabled={motivo === null || enviando}
            onClick={() => {
              void anular();
            }}
          >
            {enviando ? 'Quitando…' : 'Quitar de la cuenta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
