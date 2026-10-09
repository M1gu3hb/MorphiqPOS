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
import { Aviso } from '@morphiqpos/ui/sistema';
import { BadgePercent, Ban } from 'lucide-react';
import { useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';
import { DescuentoDeVenta, type DescuentoElegido } from '~/venta/DescuentoDeVenta';

/**
 * LO QUE CAMBIA UNA CUENTA ANTES DE COBRARLA: el descuento y la cancelación (día completo
 * del restaurante, 2.4).
 *
 * ── El descuento ─────────────────────────────────────────────────────────
 * `02-DINERO-Y-CAJA` §3: tope por rol, PIN de supervisor por encima del tope y la línea
 * del descuento con nombre en el corte. El restaurante no tenía NINGUNO: el mostrador lo
 * aplica a su borrador (`venta.aplicar_descuento`) y la cuenta de una mesa llega a caja ya
 * pedida. Aquí se usa el MISMO formulario que la tienda y la cafetería —`DescuentoDeVenta`,
 * con su tope a la vista y el PIN del supervisor tecleado en esta terminal— y se aplica con
 * `restaurante.descontar_cuenta`, que reparte el descuento con la misma regla del dominio.
 *
 * ── La cancelación ───────────────────────────────────────────────────────
 * «La mesa que se fue sin pagar» (§10, descuadre 1): el cierre no deja cerrar con ella y
 * su diálogo dice «cóbrala o cancélala», pero la caja del modelo sólo sabía eliminar el
 * ticket SIN consumo. `restaurante.cancelar_orden` existía —con motivo obligatorio y la
 * mesa de vuelta al servicio— y ninguna pantalla lo llamaba para una cuenta con consumo.
 * El motivo no es opcional: una venta que desaparece sin motivo es indistinguible de un
 * robo, y el corte la enseña en su sección de Cancelaciones con quién la canceló.
 */

function mensajeDe(fallo: unknown, porOmision: string): string {
  return fallo instanceof ErrorApi ? fallo.message : porOmision;
}

export function DescuentoDeLaCuenta({
  ordenId,
  base,
  alAplicar,
}: {
  readonly ordenId: string;
  /** La venta sin propina, en centavos: la base del porcentaje y del tope. */
  readonly base: number;
  readonly alAplicar: () => void;
}) {
  const voc = useVocabulario();
  const [abierto, setAbierto] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  // Cada apertura, un formulario nuevo: la autorización de la vez anterior ya venció.
  const [apertura, setApertura] = useState(0);

  async function aplicar(elegido: DescuentoElegido): Promise<void> {
    setFallo(null);
    try {
      await invocarComando('/api/restaurante/descontar-cuenta', {
        ordenId,
        descuentoCentavos: elegido.centavos,
        motivo: elegido.motivo,
        ...(elegido.autorizacion === undefined ? {} : { autorizacion: elegido.autorizacion }),
      });
      setAbierto(false);
      alAplicar();
    } catch (error: unknown) {
      setFallo(mensajeDe(error, 'No se pudo aplicar el descuento.'));
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setFallo(null);
          setApertura((n) => n + 1);
          setAbierto(true);
        }}
      >
        <BadgePercent aria-hidden="true" />
        Descuento
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Descuento</DialogTitle>
            <DialogDescription>
              Hasta tu tope se aplica solo; arriba, lo autoriza un supervisor con su PIN.
            </DialogDescription>
          </DialogHeader>
          <DescuentoDeVenta
            key={apertura}
            base={base}
            onAplicar={(elegido) => {
              void aplicar(elegido);
            }}
          />
          {fallo === null ? null : (
            <Aviso tono="peligro" titulo={fallo}>
              No se descontó nada: {voc.enFrase('orden')} sigue igual.
            </Aviso>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CancelarLaCuenta({
  ordenId,
  alCancelar,
}: {
  readonly ordenId: string;
  readonly alCancelar: (cancelada: boolean) => void;
}) {
  const voc = useVocabulario();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const listo = motivo.trim().length >= 3 && !enviando;

  async function cancelar(): Promise<void> {
    setEnviando(true);
    setFallo(null);
    try {
      await invocarComando('/api/restaurante/cancelar-orden', { ordenId, motivo: motivo.trim() });
      setAbierto(false);
      alCancelar(true);
    } catch (error: unknown) {
      setFallo(mensajeDe(error, `No se pudo cancelar ${voc.enFrase('orden')}.`));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setAbierto(true);
        }}
      >
        <Ban aria-hidden="true" />
        Cancelar {voc.enFrase('orden')}
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancelar {voc.enFrase('orden')}</DialogTitle>
            <DialogDescription>
              No se cobra y sale de las ventas del día. Queda en el corte, con su motivo y tu
              nombre.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="cancelar-cuenta-motivo">Por qué</Label>
            <Textarea
              id="cancelar-cuenta-motivo"
              maxLength={300}
              value={motivo}
              placeholder="se fueron sin pagar · se capturó en la mesa equivocada"
              onChange={(evento) => {
                setMotivo(evento.target.value);
              }}
            />
          </div>
          {fallo === null ? null : (
            <Aviso tono="peligro" titulo={fallo}>
              No se canceló nada: {voc.enFrase('orden')} sigue por cobrar.
            </Aviso>
          )}
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={!listo}
              cargando={enviando}
              onClick={() => {
                void cancelar();
              }}
            >
              Cancelar {voc.enFrase('orden')} sin cobrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
