'use client';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@morphiqpos/ui/primitivas/alert-dialog';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Aviso } from '@morphiqpos/ui/sistema';
import { useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

/**
 * «¿SEPARAR LAS MESAS?» (D-2, DP-9.6): cada mesa vuelve a su lugar, a su zona y a su número; la
 * cuenta, si hay, se queda en la principal —lo pedido no se reparte—. Lo usan la mesa activa de
 * la principal y el mapa, donde se separa una unión que quedó libre.
 */
export function SepararMesasDialog({
  unionId,
  alCerrar,
  alHecho,
}: {
  readonly unionId: string;
  readonly alCerrar: () => void;
  readonly alHecho: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const separar = async () => {
    setEnviando(true);
    setFallo(null);
    try {
      await invocarComando('/api/restaurante/separar-mesas', { unionId });
      alHecho();
    } catch (error: unknown) {
      setFallo(error instanceof ErrorApi ? error.message : 'No se pudieron separar las mesas.');
      setEnviando(false);
    }
  };
  return (
    <AlertDialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) alCerrar();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Separar las mesas?</AlertDialogTitle>
          <AlertDialogDescription>
            Cada mesa vuelve a su lugar y a su número. Si hay cuenta, se queda en la principal: lo
            pedido no se reparte.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <Button disabled={enviando} onClick={() => void separar()}>
            {enviando ? 'Separando…' : 'Separar mesas'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
