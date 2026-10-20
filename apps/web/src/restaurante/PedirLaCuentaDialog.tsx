'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@morphiqpos/ui/primitivas/dialog';
import { Aviso, Dinero, Superficie } from '@morphiqpos/ui/sistema';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

import {
  almacenDeLaPestana,
  guardarPrecuenta,
  precuentaDeLaRespuesta,
} from './precuenta-de-la-mesa.ts';
import {
  entradaDePedirLaCuenta,
  importeSugerido,
  OPCIONES_DE_PROPINA,
  type OpcionDePropina,
} from './propina-de-la-mesa.ts';

/**
 * PEDIR LA CUENTA, PREGUNTANDO LA PROPINA (día completo del restaurante, 2.4).
 *
 * `02-DINERO-Y-CAJA` §4.3: la propina se decide en tres momentos y el primero es éste —el
 * mesero, en la mesa, preguntándole al comensal—. La pantalla pedía la cuenta sin preguntar
 * nada (`decidir_en_caja`), y «déjale el diez por ciento» llegaba a caja sin su propina.
 *
 * Tocar una tesela PIDE la cuenta: es hora pico y no se pone una confirmación donde ya hubo
 * una decisión. «Sin propina» pesa lo mismo que los porcentajes —es voluntaria— y «la decide
 * la caja» es la salida de quien no preguntó: la caja la decide con su muro.
 *
 * Lo que el servidor contesta —la precuenta, calculada con el mismo código del cobro— se
 * guarda para la hoja que sigue: el mesero no lee el dinero de la venta, y sin esto la hoja
 * que lleva a la mesa salía sin total.
 */

export interface PedirLaCuentaDialogProps {
  readonly ordenId: string;
  /** Lo consumido hasta ahora, en centavos, para decirle a la mesa cuánto sería. */
  readonly totalCentavos: number | null;
  readonly alCerrar: () => void;
}

export function PedirLaCuentaDialog({
  ordenId,
  totalCentavos,
  alCerrar,
}: PedirLaCuentaDialogProps) {
  const voc = useVocabulario();
  const router = useRouter();
  const [pidiendo, setPidiendo] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  async function pedir(opcion: OpcionDePropina): Promise<void> {
    setPidiendo(opcion.clave);
    setFallo(null);
    try {
      const precuenta = await invocarComando<unknown>(
        '/api/restaurante/solicitar-cuenta',
        entradaDePedirLaCuenta(ordenId, opcion),
      );
      const guardada = precuentaDeLaRespuesta(precuenta, opcion);
      if (guardada !== null) guardarPrecuenta(guardada, almacenDeLaPestana());
      router.push(`/restaurante/precuenta?cuenta=${encodeURIComponent(ordenId)}`);
    } catch (error: unknown) {
      setFallo(
        error instanceof ErrorApi ? error.message : `No se pudo pedir ${voc.enFrase('orden')}.`,
      );
      setPidiendo(null);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && pidiendo === null) alCerrar();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pedir {voc.enFrase('orden')}</DialogTitle>
          <DialogDescription>
            La propina es voluntaria: pregúntale a {voc.enFrase('cliente')} cuánto quiere dejar. Si
            no sabe, la decide la caja al cobrar.
          </DialogDescription>
        </DialogHeader>
        <div
          role="group"
          aria-label="Propina"
          className="grid grid-cols-2 gap-(--espacio-2) sm:grid-cols-3"
        >
          {OPCIONES_DE_PROPINA.map((opcion) => {
            const importe = importeSugerido(totalCentavos, opcion);
            return (
              <Superficie
                key={opcion.clave}
                como="button"
                type="button"
                interactiva
                relleno={3}
                radio="md"
                disabled={pidiendo !== null}
                onClick={() => {
                  void pedir(opcion);
                }}
                className="flex min-h-20 w-full flex-col items-center justify-center gap-(--espacio-1) text-center"
              >
                <span className="text-sm font-semibold">
                  {pidiendo === opcion.clave ? 'Pidiendo…' : opcion.etiqueta}
                </span>
                {/* Con propina se dice cuánto sería: nadie tiene que calcular en la mesa. */}
                {importe === null || opcion.tipo === 'sin_propina' ? null : (
                  <Dinero centavos={importe} tamano="xs" className="text-texto-sutil" />
                )}
              </Superficie>
            );
          })}
        </div>
        {fallo === null ? null : (
          <Aviso tono="peligro" titulo={fallo}>
            No se pidió nada: {voc.enFrase('orden')} sigue abierta.
          </Aviso>
        )}
      </DialogContent>
    </Dialog>
  );
}
