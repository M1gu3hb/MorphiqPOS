'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@morphiqpos/ui/primitivas/alert-dialog';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@morphiqpos/ui/primitivas/sheet';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';
import { Aviso, Dinero } from '@morphiqpos/ui/sistema';
import { Send, ShoppingCart, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import { ErrorApi } from '~/cliente/api';

import {
  avisoDelEnvio,
  personasConectadas,
  subtotalAproximadoCentavos,
  type LineaDelCarrito,
} from './carrito-de-la-mesa';
import type { CarritoDeLaMesa as Carrito } from './use-carrito-de-la-mesa';

/**
 * EL PEDIDO DE LA MESA en el teléfono (DP-9.5): lo de todos, con «Quitar» sólo en lo propio, y
 * un solo «Enviar a cocina». En una mesa de dos o más, antes de enviar pregunta «¿Ya pidieron
 * todos?» con el pedido completo.
 */

function Renglon({
  linea,
  quitando,
  alQuitar,
}: {
  readonly linea: LineaDelCarrito;
  readonly quitando: boolean;
  readonly alQuitar?: (id: string) => void;
}) {
  return (
    <li className="flex items-start gap-(--espacio-3) border-b border-borde py-(--espacio-2)">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          {linea.cantidad} × {linea.nombre}
        </span>
        {linea.notas === '' ? null : (
          <span className="block text-xs text-texto-sutil">«{linea.notas}»</span>
        )}
        {linea.esMia ? null : (
          <span className="block text-xs text-texto-sutil">De otro teléfono</span>
        )}
        {linea.disponible === false ? (
          <span className="block text-xs font-semibold text-peligro">
            Ya no está disponible: no se enviará
          </span>
        ) : null}
      </span>
      {linea.esMia && alQuitar !== undefined ? (
        <Button
          size="sm"
          variant="ghost"
          className="gap-1 text-peligro"
          disabled={quitando}
          onClick={() => {
            alQuitar(linea.id);
          }}
        >
          <Trash2 className="size-4" aria-hidden /> Quitar
        </Button>
      ) : null}
    </li>
  );
}

function reglaDe(error: unknown): string | null {
  const regla = error instanceof ErrorApi ? error.error.datos?.['regla'] : undefined;
  return typeof regla === 'string' ? regla : null;
}

export function CarritoDeLaMesa({ carrito }: { readonly carrito: Carrito }) {
  const idNota = useId();
  const [abierto, setAbierto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [fallo, setFallo] = useState<string | null>(null);
  const estado = carrito.estado;
  if (estado === null || estado.lineas.length === 0) return null;
  const subtotal = subtotalAproximadoCentavos(estado.lineas);

  const mandar = async (confirmado: boolean) => {
    setEnviando(true);
    setFallo(null);
    try {
      const aviso = avisoDelEnvio(await carrito.enviar({ confirmado, notaGeneral: nota }));
      if (aviso.tono === 'exito') toast.success(aviso.texto);
      else toast.warning(aviso.texto);
      setNota('');
      setConfirmando(false);
      setAbierto(false);
    } catch (error: unknown) {
      if (reglaDe(error) === 'QR_CARRITO_SIN_CONFIRMAR') {
        setConfirmando(true);
      } else {
        setConfirmando(false);
        setFallo(error instanceof Error ? error.message : 'No pudimos enviar el pedido.');
      }
    } finally {
      setEnviando(false);
    }
  };

  const quitar = async (id: string) => {
    setQuitando(id);
    setFallo(null);
    try {
      await carrito.quitar(id);
    } catch (error: unknown) {
      setFallo(error instanceof Error ? error.message : 'No pudimos quitarlo.');
    } finally {
      setQuitando(null);
    }
  };

  return (
    <>
      <Button
        className="fixed inset-x-(--espacio-4) bottom-(--espacio-4) z-30 mx-auto max-w-md gap-(--espacio-3)"
        onClick={() => {
          setAbierto(true);
        }}
      >
        <ShoppingCart className="size-5" aria-hidden />
        <span className="flex-1 text-left">Pedido de la mesa ({String(estado.lineas.length)})</span>
        <Dinero centavos={subtotal} />
      </Button>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>El pedido de la mesa</SheetTitle>
            <SheetDescription>
              {personasConectadas(estado.conectados)} · cada quien quita lo suyo
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-(--espacio-3) px-(--espacio-4)">
            {estado.esperarATodos ? (
              <Aviso
                tono="atencion"
                titulo="Esperen a que todos agreguen su pedido antes de enviarlo."
              />
            ) : null}
            <ul>
              {estado.lineas.map((linea) => (
                <Renglon
                  key={linea.id}
                  linea={linea}
                  quitando={quitando === linea.id}
                  alQuitar={(id) => void quitar(id)}
                />
              ))}
            </ul>
            <span className="flex flex-col gap-(--espacio-1)">
              <Label htmlFor={idNota} className="text-xs">
                Nota para cocina (opcional)
              </Label>
              <Textarea
                id={idNota}
                rows={2}
                maxLength={300}
                value={nota}
                placeholder="Ej. todo junto, sin picante…"
                onChange={(e) => {
                  setNota(e.target.value);
                }}
              />
            </span>
            <p className="flex items-center justify-between text-sm font-semibold">
              Subtotal aproximado <Dinero centavos={subtotal} />
            </p>
            <p className="text-xs text-texto-sutil">El cobro final se confirma en caja.</p>
            {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
          </div>
          <SheetFooter>
            <Button
              variant="outline"
              disabled={enviando}
              onClick={() => {
                setAbierto(false);
              }}
            >
              Seguir viendo el menú
            </Button>
            <Button
              className="gap-(--espacio-2)"
              disabled={enviando}
              onClick={() => {
                if (estado.esperarATodos) setConfirmando(true);
                else void mandar(false);
              }}
            >
              <Send className="size-4" aria-hidden /> {enviando ? 'Enviando…' : 'Enviar a cocina'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Ya pidieron todos?</AlertDialogTitle>
            <AlertDialogDescription>
              Se manda a cocina el pedido completo de la mesa, una sola vez:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-[40dvh] overflow-y-auto">
            {estado.lineas.map((linea) => (
              <Renglon key={linea.id} linea={linea} quitando={false} />
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={enviando}
              onClick={(e) => {
                e.preventDefault();
                void mandar(true);
              }}
            >
              {enviando ? 'Enviando…' : 'Enviar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
