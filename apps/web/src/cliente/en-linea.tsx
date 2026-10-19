'use client';

import { Aviso } from '@morphiqpos/ui/sistema';
import { useEffect, useState, type ReactElement } from 'react';

/**
 * ¿HAY INTERNET? (C.13 de la 2.4, F-988).
 *
 * No hay modo sin conexión (A-27): quien no quiera depender de internet instala el sistema
 * completo en su propio servidor. Lo que sí hace falta es que la pantalla lo DIGA en vez de
 * dejar que el cajero cobre y el cobro se pierda en la red. Arranca en `true` y se corrige al
 * montar: `navigator` no existe en el servidor, y leerlo al pintar daría una hidratación
 * distinta.
 */
export function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(true);
  useEffect(() => {
    const anotar = () => {
      setEnLinea(navigator.onLine);
    };
    anotar();
    window.addEventListener('online', anotar);
    window.addEventListener('offline', anotar);
    return () => {
      window.removeEventListener('online', anotar);
      window.removeEventListener('offline', anotar);
    };
  }, []);
  return enLinea;
}

/** El aviso de las pantallas de cobro cuando se cae la red. Mismo texto en los cinco giros. */
export function AvisoSinConexion({
  className,
}: {
  readonly className?: string | undefined;
}): ReactElement {
  return (
    <Aviso tono="atencion" titulo="Sin internet. No se puede cobrar." className={className}>
      Aquí no hay modo sin conexión: el folio, la existencia y la caja los decide el servidor. En
      cuanto vuelva la red, cobra como siempre.
    </Aviso>
  );
}

/**
 * El aviso de la AGENDA cuando se cae la red (C.10 de la 2.4): la agenda queda como se leyó,
 * y lo que la cambia —llegó, no llegó, agendar— espera a que vuelva. Sin cola local: la
 * decisión A-27 (F-988 en EXCEPCIONES) pone toda la lógica en el servidor.
 */
export function AvisoDeAgendaSinConexion({
  className,
}: {
  readonly className?: string | undefined;
}): ReactElement {
  return (
    <Aviso
      tono="atencion"
      titulo="Sin internet. La agenda es la de hace un momento."
      className={className}
    >
      No se puede marcar llegó ni no llegó, ni agendar, hasta que vuelva la red: aquí no hay modo
      sin conexión, lo guarda el servidor.
    </Aviso>
  );
}
