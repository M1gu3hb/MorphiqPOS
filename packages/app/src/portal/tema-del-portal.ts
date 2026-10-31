import { z } from 'zod';

import { ESTILOS_DISPONIBLES } from '../configuracion/apariencia.ts';

/**
 * EL ASPECTO DEL PORTAL DEL COMENSAL (DP-9.7), por tokens: ni un color ni una fuente sueltos.
 *
 *   · `estilo`: uno de los nueve estilos del sistema, sólo para el portal; `null`, el del negocio.
 *   · `tipografia`: la del sistema, la redonda o la clásica (con patines), de las que ya carga
 *     la aplicación.
 *   · `fondo`: liso, o con la marca del negocio de agua al fondo.
 *
 * El orden de las páginas es el `orden` de cada página del menú, que ya existe.
 */

export const CLAVE_DEL_TEMA = 'portal_qr_tema';
export const TIPOGRAFIAS = ['sistema', 'redonda', 'clasica'] as const;
export const FONDOS = ['liso', 'marca'] as const;

export const TEMA_DEL_PORTAL = z
  .object({
    estilo: z.enum(ESTILOS_DISPONIBLES).nullable(),
    tipografia: z.enum(TIPOGRAFIAS),
    fondo: z.enum(FONDOS),
  })
  .strict();

export type TemaDelPortal = z.infer<typeof TEMA_DEL_PORTAL>;

/** El de siempre: el estilo del negocio, su tipografía y la marca de agua al fondo. */
export const TEMA_POR_OMISION: TemaDelPortal = {
  estilo: null,
  tipografia: 'sistema',
  fondo: 'marca',
};

/** El tema guardado, leído sin confiar: lo que no tiene forma vuelve al de siempre. */
export function temaGuardado(valor: unknown): TemaDelPortal {
  const leido = TEMA_DEL_PORTAL.safeParse(valor);
  return leido.success ? leido.data : TEMA_POR_OMISION;
}
