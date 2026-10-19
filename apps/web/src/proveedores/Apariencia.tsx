'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { useApariencia } from '@morphiqpos/ui/hooks';

/**
 * LA APARIENCIA VIVA: el estilo y sus cuatro perillas, en el árbol de React.
 *
 * ── Por qué esto no existía, y qué faltaba ────────────────────────────────
 * `useApariencia` está escrito desde la Fase 1 y **no lo llamaba nadie**. Sabe poner
 * `data-estilo`, `data-densidad`, `data-redondeo`, `data-elevacion` y
 * `data-movimiento` en el `<html>`, que es exactamente donde el CSS del sistema los
 * espera — y sin un consumidor era un hook muerto, igual que la hoja de estilos que
 * nadie importaba.
 *
 * El valor inicial lo pone el SERVIDOR en `app/layout.tsx`, no este proveedor. Es
 * deliberado: si la primera pintura no llevara los atributos, la página saldría sin
 * un solo token de color —los nombres en inglés derivan de ellos— y habría un
 * destello en blanco y negro en cada carga. Este proveedor toma ese mismo valor y lo
 * vuelve estado, para que se pueda CAMBIAR sin recargar.
 *
 * ── Lo que esto habilita, y que es la mitad de la etapa 5 ─────────────────
 * Cambiar de estilo en vivo delante de un prospecto: `cambiarEstilo('bloque')` y la
 * aplicación entera cambia de aspecto sin una recarga y sin desmontar una pantalla,
 * porque lo único que cambia son cinco atributos del `<html>`. Las cuatro perillas se
 * mueven por separado con `ajustar('densidad', 'compacta')`.
 */

/**
 * Lo que el hook devuelve, sin repetirlo.
 *
 * Escribir la forma a mano aquí ya se rompió una vez —la firma de `ajustar` es
 * genérica sobre las perillas— y una copia que se desincroniza del original es un
 * tipo que miente. Se deriva.
 */
export type AparienciaEnVivo = ReturnType<typeof useApariencia>;

const Contexto = createContext<AparienciaEnVivo | null>(null);

export function ProveedorDeApariencia({
  estiloInicial,
  children,
}: {
  readonly estiloInicial: string;
  readonly children: ReactNode;
}) {
  const vivo = useApariencia(estiloInicial);
  return <Contexto.Provider value={vivo}>{children}</Contexto.Provider>;
}

/**
 * La apariencia actual y cómo cambiarla.
 *
 * Lanza si se usa fuera del proveedor en vez de devolver un valor por omisión: una
 * pantalla que cree que puede cambiar el estilo y no puede es peor que un error al
 * montarla, porque el fallo aparece cuando alguien ya está enseñando el sistema.
 */
export function useAparienciaEnVivo(): AparienciaEnVivo {
  const valor = useContext(Contexto);
  if (valor === null) {
    throw new Error(
      'useAparienciaEnVivo() fuera de <ProveedorDeApariencia>. Se monta en Proveedores.tsx, ' +
        'que envuelve la aplicación entera.',
    );
  }
  return valor;
}
