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
import { createRoot } from 'react-dom/client';

import { liberarConDecision, type DecisionDelGrupo, type EjecutarLiberar } from './liberar-mesa';

/**
 * «¿SEPARAR MESAS O DEJARLAS UNIDAS?» (DP-9.6).
 *
 * Al limpiar la principal de mesas unidas el servidor pide decidir (`MESA_UNIDA_SIN_DECISION`).
 * Lo pregunta cualquier pantalla que libera una mesa —la mesa activa, la de meseros, la caja—
 * con el mismo diálogo y sin que cada una lo tenga que montar.
 */

function PreguntaDelGrupo({
  alDecidir,
}: {
  readonly alDecidir: (decision: DecisionDelGrupo | null) => void;
}) {
  return (
    <AlertDialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) alDecidir(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Separar mesas o dejarlas unidas?</AlertDialogTitle>
          <AlertDialogDescription>
            Separadas, cada mesa vuelve a su lugar y a su número. Unidas, el siguiente cliente las
            encuentra juntas, con el mismo número.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button
            variant="outline"
            onClick={() => {
              alDecidir('mantener');
            }}
          >
            Dejarlas unidas
          </Button>
          <Button
            onClick={() => {
              alDecidir('separar');
            }}
          >
            Separar mesas
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Pregunta y resuelve con la decisión, o `null` si se canceló. */
export function preguntarPorElGrupo(): Promise<DecisionDelGrupo | null> {
  return new Promise((resolver) => {
    const nodo = document.createElement('div');
    document.body.appendChild(nodo);
    const raiz = createRoot(nodo);
    raiz.render(
      <PreguntaDelGrupo
        alDecidir={(decision) => {
          raiz.unmount();
          nodo.remove();
          resolver(decision);
        }}
      />,
    );
  });
}

/**
 * Libera la mesa; si es la principal de mesas unidas, pregunta qué hacer con el grupo y vuelve
 * a intentarlo con la respuesta. `false`: se canceló y la mesa sigue como estaba.
 */
export function liberarMesaConPregunta(
  mesaId: string,
  ejecutar: EjecutarLiberar,
  encabezaGrupo = false,
): Promise<boolean> {
  return liberarConDecision(mesaId, ejecutar, preguntarPorElGrupo, encabezaGrupo);
}
