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

/**
 * «¿QUÉ NÚMERO QUEDA?» (DP-9.6): al unir se elige con cuál de sus números se queda el grupo
 * —la 2 o la 4, nunca «24»—. Las demás se ocultan mientras dure la unión.
 */
export function EligeElNumero({
  abierto,
  opciones,
  elegida,
  enviando,
  alElegir,
  alCerrar,
  alUnir,
}: {
  readonly abierto: boolean;
  readonly opciones: readonly { readonly id: string; readonly numero: number }[];
  readonly elegida: string | null;
  readonly enviando: boolean;
  readonly alElegir: (id: string) => void;
  readonly alCerrar: () => void;
  readonly alUnir: () => void;
}) {
  const ordenadas = [...opciones].sort((a, b) => a.numero - b.numero);
  return (
    <AlertDialog
      open={abierto}
      onOpenChange={(sigue) => {
        if (!sigue) alCerrar();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Qué número queda?</AlertDialogTitle>
          <AlertDialogDescription>
            Las demás se ocultan mientras estén unidas; su QR lleva a la que quede.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div
          role="radiogroup"
          aria-label="Número que queda"
          className="flex flex-wrap gap-(--espacio-2)"
        >
          {ordenadas.map(({ id, numero }) => (
            <Button
              key={id}
              role="radio"
              aria-checked={elegida === id}
              variant={elegida === id ? 'default' : 'outline'}
              onClick={() => {
                alElegir(id);
              }}
            >
              Mesa {numero}
            </Button>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <Button disabled={enviando} onClick={alUnir}>
            {enviando ? 'Uniendo…' : 'Unir'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
