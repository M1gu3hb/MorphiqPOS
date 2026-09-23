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
import { Aviso, Superficie } from '@morphiqpos/ui/sistema';
import { ChefHat, Gift, NotebookPen, Undo2, type LucideIcon } from 'lucide-react';
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
 * ── Cómo se ve: la tableta del mesero, con una mano ──────────────────────
 * Se abre desde la mesa activa, cuyo dispositivo principal es la tableta
 * (`04-INTERFAZ` · Mesa activa). Los cuatro motivos son TESELAS de dos por
 * dos, no cuatro renglones de radio: se eligen con el pulgar, sin apuntar, y la
 * elegida lleva el anillo del primario además del punto del radio. El botón
 * de quitar se estira hasta el borde inferior derecho, que es lo único que el
 * pulgar derecho alcanza sin recolocar la mano. En teléfono todo va en una
 * columna y el diálogo se desplaza por dentro: el botón nunca queda fuera.
 *
 * ── Lo que este diálogo NO hace ──────────────────────────────────────────
 * No devuelve dinero. Anular una línea de una cuenta abierta no es una
 * devolución: eso es F-222, con su propio flujo de caja. Confundirlos es cómo
 * una cuenta ya cobrada se «corrige» sin que el cajón lo sepa.
 *
 * Tampoco lee nada: recibe el platillo por props. Por eso no tiene ni vacío
 * ni esqueleto —no hay lista que pueda llegar vacía ni lectura que esperar—;
 * su único estado fuera del caso feliz es que el comando falle.
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

interface Motivo {
  readonly clave: ClaveMotivo;
  readonly etiqueta: string;
  /** Para reconocerlo de un vistazo; la etiqueta es la que manda. */
  readonly icono: LucideIcon;
}

function motivosDe(voc: Vocabulario): readonly Motivo[] {
  return [
    {
      clave: 'error_cocina',
      etiqueta: `Se equivocó ${voc.enFrase('preparacion')}`,
      icono: ChefHat,
    },
    { clave: 'error_mesero', etiqueta: 'Me equivoqué al tomar la orden', icono: NotebookPen },
    { clave: 'cortesia', etiqueta: 'Cortesía de la casa', icono: Gift },
    {
      clave: 'cliente_cambio',
      etiqueta: `${voc.conArticulo('cliente')} cambió de opinión`,
      icono: Undo2,
    },
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
      setError(
        fallo instanceof Error ? fallo.message : `No se pudo quitar ${voc.enFrase('linea_orden')}.`,
      );
    } finally {
      setEnviando(false);
    }
  }

  const estePlatillo = voc.conDeterminante('este', 'linea_orden');

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (!v) onCerrar();
      }}
    >
      {/* Más ancho que el diálogo por omisión en tableta: dos teselas por renglón
          con la etiqueta completa, sin partirla. En teléfono se desplaza por
          dentro para que el botón de quitar nunca quede debajo del borde. */}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Quitar {nombreDelPlatillo}</DialogTitle>
          <DialogDescription>
            Hace falta decir por qué. Queda en el registro con tu nombre.
          </DialogDescription>
        </DialogHeader>

        {yaSePreparo && (
          /* El aviso va ARRIBA de los motivos, no debajo: quien anula tiene que
             leerlo antes de elegir, no después de haber decidido. Es un muro de
             negocio, no un fallo: atención, no peligro. */
          <Aviso
            tono="atencion"
            titulo={`${estePlatillo} ya salió de ${voc.enFrase('preparacion')}`}
          >
            Los ingredientes ya se gastaron y no vuelven al almacén. {voc.conArticulo('orden')}{' '}
            baja, el inventario no.
          </Aviso>
        )}

        <fieldset>
          <Label asChild>
            <legend className="mb-(--espacio-2) font-semibold">Motivo</legend>
          </Label>
          <div className="grid gap-(--espacio-2) sm:grid-cols-2">
            {motivosDe(voc).map(({ clave, etiqueta, icono: Icono }) => {
              const elegido = motivo === clave;
              return (
                <Superficie
                  key={clave}
                  como="label"
                  nivel={0}
                  radio="md"
                  relleno={3}
                  interactiva
                  activa={elegido}
                  className="flex min-h-[calc(var(--altura-control)*1.6)] items-center gap-(--espacio-3) text-sm font-medium"
                >
                  {/* El radio se queda a la vista: el anillo no puede ser lo único
                      que diga cuál está elegido. */}
                  <input
                    type="radio"
                    name="motivo-anulacion"
                    value={clave}
                    checked={elegido}
                    onChange={() => {
                      setMotivo(clave);
                    }}
                    className="size-5 shrink-0 accent-primario"
                  />
                  <Icono aria-hidden="true" className="size-5 shrink-0 text-texto-sutil" />
                  <span>{etiqueta}</span>
                </Superficie>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-(--espacio-1)">
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

        {/* Qué pasó y, sobre todo, qué NO pasó: el platillo sigue cobrándose. */}
        {error !== null && (
          <Aviso tono="peligro" titulo={error}>
            {estePlatillo} sigue en {voc.enFrase('orden')}: no se quitó nada.
          </Aviso>
        )}

        {/* En tableta, Cancelar a su ancho y Quitar estirado hasta la esquina
            inferior derecha, donde cae el pulgar. En teléfono, uno sobre otro con
            Quitar arriba, como los apila el pie del diálogo. */}
        <DialogFooter className="sm:grid sm:grid-cols-[auto_minmax(0,1fr)]">
          <Button type="button" variant="outline" size="lg" onClick={onCerrar}>
            Cancelar
          </Button>
          {/* `destructive` y no `default`: quitar algo de una cuenta abierta se
              parece más a borrar que a guardar, y el color tiene que decirlo. */}
          <Button
            type="button"
            variant="destructive"
            size="lg"
            cargando={enviando}
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
